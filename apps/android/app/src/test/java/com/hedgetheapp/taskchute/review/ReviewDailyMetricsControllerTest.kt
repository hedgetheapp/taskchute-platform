package com.hedgetheapp.taskchute.review

import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayResult
import com.hedgetheapp.taskchute.today.TodaySection
import com.hedgetheapp.taskchute.today.TodayTask
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

class ReviewDailyMetricsControllerTest {
    @Test
    fun initialDateComesFromCanonicalCurrentDayAndShowsItsProjection() {
        val requests = CopyOnWriteArrayList<String?>()
        val controller = controller({ logicalDate ->
            requests += logicalDate
            TodayResult.Success(day("2026-10-13", isCurrent = true, entries = listOf(
                task("done", LifecycleState.COMPLETED, 120),
                task("planned", LifecycleState.PLANNED, null),
            )))
        })

        controller.loadDaily()

        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.CONTENT })
        assertEquals(listOf(null), requests)
        assertEquals("2026-10-13", controller.state.currentLogicalDate)
        assertEquals("2026-10-13", controller.state.selectedLogicalDate)
        assertEquals(120L, controller.state.metrics?.completedActualDurationSeconds)
        controller.close()
    }

    @Test
    fun unestablishedHistoricalDayIsFetchedAfterCurrentAndShowsNoZero() {
        val requests = CopyOnWriteArrayList<String?>()
        val controller = controller({ logicalDate ->
            requests += logicalDate
            if (logicalDate == null) {
                TodayResult.Success(day("2026-10-13", isCurrent = true, entries = emptyList()))
            } else {
                TodayResult.Success(day(logicalDate, isCurrent = false, entries = emptyList(), established = false))
            }
        })

        controller.loadDaily("2026-10-12")

        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.UNESTABLISHED })
        assertEquals(listOf(null, "2026-10-12"), requests)
        assertNull(controller.state.metrics)
        controller.close()
    }

    @Test
    fun historicalEstablishedDayUsesItsOwnCanonicalMetrics() {
        val requests = CopyOnWriteArrayList<String?>()
        val controller = controller({ logicalDate ->
            requests += logicalDate
            if (logicalDate == null) {
                TodayResult.Success(day("2026-10-13", isCurrent = true, entries = emptyList()))
            } else {
                TodayResult.Success(day("2026-10-12", isCurrent = false, entries = listOf(
                    task("past-completed", LifecycleState.COMPLETED, 90),
                    task("past-planned", LifecycleState.PLANNED, null),
                )))
            }
        })

        controller.loadDaily("2026-10-12")

        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.CONTENT })
        assertEquals(listOf(null, "2026-10-12"), requests)
        assertEquals(1, controller.state.metrics?.completedCount)
        assertEquals(1, controller.state.metrics?.unexecutedCount)
        assertEquals(90L, controller.state.metrics?.completedActualDurationSeconds)
        controller.close()
    }

    @Test
    fun futureDateIsNeverSentToByLogicalDateEndpoint() {
        val requests = CopyOnWriteArrayList<String?>()
        val controller = controller({ logicalDate ->
            requests += logicalDate
            TodayResult.Success(day("2026-10-13", isCurrent = true, entries = emptyList()))
        })

        controller.loadDaily("2026-10-14")

        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.FUTURE_UNAVAILABLE })
        assertEquals(listOf(null), requests)
        assertNull(controller.state.metrics)
        controller.close()
    }

    @Test
    fun connectionFailureHasNoMetricsAndRetryMakesOneNewAttempt() {
        val requests = CopyOnWriteArrayList<String?>()
        val attempts = AtomicInteger()
        val controller = controller({ logicalDate ->
            requests += logicalDate
            if (attempts.getAndIncrement() == 0) TodayResult.Failure("offline")
            else TodayResult.Success(day("2026-10-13", isCurrent = true, entries = emptyList()))
        })

        controller.loadDaily()
        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.ERROR })
        assertNull(controller.state.metrics)
        controller.loadDaily()

        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.EMPTY })
        assertEquals(listOf(null, null), requests)
        controller.close()
    }

    @Test
    fun changingDateClearsPreviousListsImmediatelyAndFailureDoesNotRestoreThem() {
        val controller = controller({ logicalDate ->
            when (logicalDate) {
                null -> TodayResult.Success(day("2026-10-13", isCurrent = true, entries = listOf(
                    task("current-title", LifecycleState.COMPLETED, 120),
                )))
                else -> TodayResult.Failure("offline")
            }
        })

        controller.loadDaily()
        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.CONTENT })
        assertEquals(listOf("current-title"), controller.state.metrics?.completedEntries?.map { it.title })

        controller.loadDaily("2026-10-12")
        assertEquals(ReviewDailyMetricsStatus.LOADING, controller.state.status)
        assertNull(controller.state.metrics)
        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.ERROR })
        assertNull(controller.state.metrics)
        controller.close()
    }

    @Test
    fun unauthorizedCurrentDayRequestsAuthRestoreWithoutPublishingNumbers() {
        val unauthorizedCount = AtomicInteger()
        val controller = controller(
            loadDay = { TodayResult.Unauthorized },
            onUnauthorized = { unauthorizedCount.incrementAndGet() },
        )

        controller.loadDaily()

        assertTrue(awaitState(controller) { it.status == ReviewDailyMetricsStatus.AUTH_REQUIRED })
        assertEquals(1, unauthorizedCount.get())
        assertNull(controller.state.metrics)
        controller.close()
    }

    @Test
    fun slowPreviousSelectionCannotReplaceNewSelectedDay() {
        val firstCurrentStarted = CountDownLatch(1)
        val releaseFirstCurrent = CountDownLatch(1)
        val requestDates = CopyOnWriteArrayList<String?>()
        val currentReads = AtomicInteger()
        val controller = controller({ logicalDate ->
            requestDates += logicalDate
            if (logicalDate == null && currentReads.getAndIncrement() == 0) {
                firstCurrentStarted.countDown()
                releaseFirstCurrent.await(2, TimeUnit.SECONDS)
                TodayResult.Success(day("2026-10-13", isCurrent = true, entries = listOf(task("stale", LifecycleState.COMPLETED, 99))))
            } else if (logicalDate == null) {
                TodayResult.Success(day("2026-10-13", isCurrent = true, entries = emptyList()))
            } else {
                TodayResult.Success(day("2026-10-12", isCurrent = false, entries = listOf(task("selected", LifecycleState.COMPLETED, 600))))
            }
        })

        controller.loadDaily()
        assertTrue(firstCurrentStarted.await(2, TimeUnit.SECONDS))
        controller.loadDaily("2026-10-12")
        assertEquals(ReviewDailyMetricsStatus.LOADING, controller.state.status)
        assertNull(controller.state.metrics)
        releaseFirstCurrent.countDown()

        assertTrue(awaitState(controller) {
            it.status == ReviewDailyMetricsStatus.CONTENT && it.selectedLogicalDate == "2026-10-12"
        })
        assertEquals(listOf(null, null, "2026-10-12"), requestDates)
        assertEquals(600L, controller.state.metrics?.completedActualDurationSeconds)
        controller.close()
    }

    @Test
    fun signOutResetDropsStateAndIgnoresAnInFlightResponse() {
        val requestStarted = CountDownLatch(1)
        val releaseRequest = CountDownLatch(1)
        val controller = controller({
            requestStarted.countDown()
            releaseRequest.await(2, TimeUnit.SECONDS)
            TodayResult.Success(day("2026-10-13", isCurrent = true, entries = listOf(task("old-owner", LifecycleState.COMPLETED, 3_600))))
        })

        controller.loadDaily()
        assertTrue(requestStarted.await(2, TimeUnit.SECONDS))
        controller.resetForSessionChange()
        assertEquals(ReviewDailyMetricsStatus.IDLE, controller.state.status)
        releaseRequest.countDown()
        Thread.sleep(100)

        assertEquals(ReviewDailyMetricsStatus.IDLE, controller.state.status)
        assertNull(controller.state.metrics)
        controller.close()
    }

    private fun controller(
        loadDay: (String?) -> TodayResult,
        onUnauthorized: () -> Unit = {},
    ) = ReviewDailyMetricsController(
        loadDay = loadDay,
        onUnauthorized = onUnauthorized,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    private fun awaitState(controller: ReviewDailyMetricsController, predicate: (ReviewDailyMetricsUiState) -> Boolean): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3)
        while (System.nanoTime() < deadline) {
            if (predicate(controller.state)) return true
            Thread.sleep(5)
        }
        return predicate(controller.state)
    }

    private fun day(
        logicalDate: String,
        isCurrent: Boolean,
        entries: List<TodayTask>,
        established: Boolean = true,
    ) = TodayDay(
        logicalDate = logicalDate,
        isCurrent = isCurrent,
        planningEnabled = isCurrent,
        placementRevision = 0,
        sections = listOf(TodaySection("section", "Section", 0, 1_440, entries)),
        unsectionedEntries = emptyList(),
        activeExecution = null,
        taskChuteDayId = if (established) "day-$logicalDate" else null,
    )

    private fun task(id: String, state: LifecycleState, duration: Int?) = TodayTask(
        id = id,
        title = id,
        lifecycleState = state,
        project = null,
        mode = null,
        estimateSeconds = 4_000,
        plannedStartMinute = null,
        executionId = null,
        activeStartedAt = null,
        completedDurationSeconds = duration,
    )
}

