package com.hedgetheapp.taskchute.review

import com.hedgetheapp.taskchute.today.TodayHttpResponse
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReviewPeriodMetricsTest {
    @Test
    fun repositoryRequestsMonthlyAndYearlyAggregatesAndParsesLongSeconds() {
        val requests = CopyOnWriteArrayList<String>()
        val repository = ReviewPeriodMetricsHttpRepository(
            request = { method, path, body ->
                assertEquals("GET", method)
                assertNull(body)
                requests += path
                if (path.contains("period=yearly")) {
                    TodayHttpResponse(200, metricsJson("yearly", "2024-01-01", durationSeconds = 987_654))
                } else {
                    TodayHttpResponse(200, metricsJson("monthly", "2024-02-01", durationSeconds = 345_600))
                }
            },
        )

        val monthly = repository.load(ReviewPeriodGranularity.MONTHLY, "2024-02-01")
        val yearly = repository.load(ReviewPeriodGranularity.YEARLY, "2024-01-01")

        assertEquals(listOf(
            "/api/v1/review/date-metrics?period=monthly&anchor=2024-02-01",
            "/api/v1/review/date-metrics?period=yearly&anchor=2024-01-01",
        ), requests)
        assertTrue(monthly is ReviewPeriodMetricsResult.Success)
        assertEquals(345_600L, (monthly as ReviewPeriodMetricsResult.Success).metrics.completedActualDurationSeconds)
        assertEquals(29L, monthly.metrics.establishedDayCount)
        assertTrue(yearly is ReviewPeriodMetricsResult.Success)
        assertEquals(987_654L, (yearly as ReviewPeriodMetricsResult.Success).metrics.completedActualDurationSeconds)
    }

    @Test
    fun repositoryRejectsInvalidAnchorsMalformedPayloadsAndWrongPeriodResponses() {
        val requestCount = AtomicInteger()
        val repository = ReviewPeriodMetricsHttpRepository(
            request = { _, path, _ ->
                requestCount.incrementAndGet()
                val body = if (path.contains("period=yearly")) {
                    metricsJson("monthly", "2026-01-01")
                } else {
                    """{"period_granularity":"monthly","period_anchor":"2026-10-01"}"""
                }
                TodayHttpResponse(200, body)
            },
        )

        assertTrue(repository.load(ReviewPeriodGranularity.MONTHLY, "2026-10-02") is ReviewPeriodMetricsResult.Failure)
        assertEquals(0, requestCount.get())
        assertTrue(repository.load(ReviewPeriodGranularity.MONTHLY, "2026-10-01") is ReviewPeriodMetricsResult.Failure)
        assertTrue(repository.load(ReviewPeriodGranularity.YEARLY, "2026-01-01") is ReviewPeriodMetricsResult.Failure)
        assertEquals(2, requestCount.get())
    }

    @Test
    fun repositoryMapsUnauthorizedAndServerFailure() {
        val status = AtomicInteger(401)
        val repository = ReviewPeriodMetricsHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(status.get(), "{}") },
        )

        assertTrue(repository.load(ReviewPeriodGranularity.YEARLY, "2026-01-01") is ReviewPeriodMetricsResult.Unauthorized)
        status.set(503)
        assertTrue(repository.load(ReviewPeriodGranularity.YEARLY, "2026-01-01") is ReviewPeriodMetricsResult.Failure)
    }

    @Test
    fun establishedEmptyAndUnestablishedPeriodsStayDistinct() {
        val calls = AtomicInteger()
        val controller = controller { _, anchor ->
            calls.incrementAndGet()
            if (anchor == "2026-10-01") {
                ReviewPeriodMetricsResult.Success(metrics(anchor = anchor, establishedDays = 4))
            } else {
                ReviewPeriodMetricsResult.Success(metrics(anchor = anchor, establishedDays = 0))
            }
        }

        controller.load(ReviewPeriodGranularity.MONTHLY, "2026-10-01")
        assertTrue(awaitState(controller) { it.status == ReviewPeriodMetricsStatus.EMPTY })
        assertEquals(0L, controller.state.metrics?.completedCount)
        assertEquals(0L, controller.state.metrics?.unexecutedCount)

        controller.load(ReviewPeriodGranularity.MONTHLY, "2026-11-01")
        assertTrue(awaitState(controller) { it.status == ReviewPeriodMetricsStatus.UNESTABLISHED })
        assertNull(controller.state.metrics)
        assertEquals(2, calls.get())
        controller.close()
    }

    @Test
    fun retryFailureAndRequestSelectionFencesOlderPeriodResponse() {
        val firstStarted = CountDownLatch(1)
        val releaseFirst = CountDownLatch(1)
        val calls = AtomicInteger()
        val controller = controller { granularity, anchor ->
            when (calls.getAndIncrement()) {
                0 -> {
                    firstStarted.countDown()
                    releaseFirst.await(2, TimeUnit.SECONDS)
                    ReviewPeriodMetricsResult.Success(metrics(anchor = anchor, completed = 99))
                }
                1 -> ReviewPeriodMetricsResult.Success(metrics(granularity, anchor, completed = 2, duration = 90))
                else -> ReviewPeriodMetricsResult.Failure("offline")
            }
        }

        controller.load(ReviewPeriodGranularity.MONTHLY, "2026-10-01")
        assertTrue(firstStarted.await(2, TimeUnit.SECONDS))
        controller.load(ReviewPeriodGranularity.MONTHLY, "2026-11-01")
        assertNull(controller.state.metrics)
        releaseFirst.countDown()

        assertTrue(awaitState(controller) {
            it.status == ReviewPeriodMetricsStatus.CONTENT && it.anchor == "2026-11-01"
        })
        assertEquals(2L, controller.state.metrics?.completedCount)
        assertEquals(90L, controller.state.metrics?.completedActualDurationSeconds)

        controller.load(ReviewPeriodGranularity.YEARLY, "2026-01-01")
        assertTrue(awaitState(controller) { it.status == ReviewPeriodMetricsStatus.ERROR })
        assertNull(controller.state.metrics)
        controller.load(ReviewPeriodGranularity.YEARLY, "2026-01-01")
        assertTrue(awaitState(controller) { it.status == ReviewPeriodMetricsStatus.ERROR })
        assertEquals(4, calls.get())
        controller.close()
    }

    @Test
    fun unauthorizedAndSessionResetNeverKeepPreviousOwnerMetrics() {
        val requestStarted = CountDownLatch(1)
        val releaseRequest = CountDownLatch(1)
        val unauthorizedCount = AtomicInteger()
        val calls = AtomicInteger()
        val controller = ReviewPeriodMetricsController(
            loadMetrics = { granularity, anchor ->
                if (calls.getAndIncrement() == 0) {
                    requestStarted.countDown()
                    releaseRequest.await(2, TimeUnit.SECONDS)
                    ReviewPeriodMetricsResult.Success(metrics(granularity, anchor, completed = 8))
                } else ReviewPeriodMetricsResult.Unauthorized
            },
            onUnauthorized = { unauthorizedCount.incrementAndGet() },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
            ioDispatcher = Dispatchers.IO,
        )

        controller.load(ReviewPeriodGranularity.YEARLY, "2026-01-01")
        assertTrue(requestStarted.await(2, TimeUnit.SECONDS))
        controller.resetForSessionChange()
        releaseRequest.countDown()
        Thread.sleep(100)
        assertEquals(ReviewPeriodMetricsStatus.IDLE, controller.state.status)
        assertNull(controller.state.metrics)

        controller.load(ReviewPeriodGranularity.YEARLY, "2026-01-01")
        assertTrue(awaitState(controller) { it.status == ReviewPeriodMetricsStatus.AUTH_REQUIRED })
        assertEquals(1, unauthorizedCount.get())
        assertNull(controller.state.metrics)
        controller.close()
    }

    private fun controller(
        load: (ReviewPeriodGranularity, String) -> ReviewPeriodMetricsResult,
    ) = ReviewPeriodMetricsController(
        loadMetrics = load,
        onUnauthorized = {},
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
        ioDispatcher = Dispatchers.IO,
    )

    private fun metricsJson(
        granularity: String,
        anchor: String,
        durationSeconds: Long = 0,
    ) = """{"period_granularity":"$granularity","period_anchor":"$anchor","established_day_count":29,"completed_count":4,"unexecuted_count":0,"completed_actual_duration_seconds":$durationSeconds}"""

    private fun metrics(
        granularity: ReviewPeriodGranularity = ReviewPeriodGranularity.MONTHLY,
        anchor: String,
        establishedDays: Long = 1,
        completed: Long = 0,
        unexecuted: Long = 0,
        duration: Long = 0,
    ) = ReviewPeriodMetrics(
        granularity = granularity,
        anchor = anchor,
        establishedDayCount = establishedDays,
        completedCount = completed,
        unexecutedCount = unexecuted,
        completedActualDurationSeconds = duration,
    )

    private fun awaitState(
        controller: ReviewPeriodMetricsController,
        predicate: (ReviewPeriodMetricsUiState) -> Boolean,
    ): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3)
        while (System.nanoTime() < deadline) {
            if (predicate(controller.state)) return true
            Thread.sleep(5)
        }
        return predicate(controller.state)
    }
}

