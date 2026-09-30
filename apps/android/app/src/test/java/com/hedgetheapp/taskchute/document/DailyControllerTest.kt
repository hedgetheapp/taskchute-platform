package com.hedgetheapp.taskchute.document

import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayResult
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DailyControllerTest {
    @Test
    fun initialDayAndSummaryReadsStartInParallel() {
        val repository = FakeRepository()
        val dayStarted = CountDownLatch(1)
        val listStarted = CountDownLatch(1)
        val release = CountDownLatch(1)
        val controller = controller(
            repository = repository,
            loadDay = {
                dayStarted.countDown()
                release.await(2, TimeUnit.SECONDS)
                TodayResult.Success(day("2026-09-29", "day-a"))
            },
            listDaily = {
                listStarted.countDown()
                release.await(2, TimeUnit.SECONDS)
                DailyListResult.Success(listOf(summary("2026-09-29", "day-a", "doc-a")))
            },
        )

        controller.loadCurrent()

        assertTrue(dayStarted.await(2, TimeUnit.SECONDS))
        assertTrue(listStarted.await(2, TimeUnit.SECONDS))
        release.countDown()
        assertTrue(await { controller.state.document?.documentId == "doc-a" })
        controller.close()
    }

    @Test
    fun cachedSecondNavigationSkipsFullSummaryList() {
        val repository = FakeRepository().apply {
            listResult = DailyListResult.Success(
                listOf(
                    summary("2026-09-29", "day-a", "doc-a"),
                    summary("2026-09-30", "day-b", "doc-b"),
                ),
            )
        }
        val controller = controller(
            repository = repository,
            loadDay = { logicalDate ->
                TodayResult.Success(
                    if (logicalDate == "2026-09-30") day("2026-09-30", "day-b") else day("2026-09-29", "day-a"),
                )
            },
        )

        controller.loadCurrent()
        assertTrue(await { controller.state.selectedDate == "2026-09-29" })
        controller.selectDate("2026-09-30")

        assertTrue(await { controller.state.selectedDate == "2026-09-30" && controller.state.document?.documentId == "doc-b" })
        assertEquals(1, repository.listCalls.get())
        controller.close()
    }

    @Test
    fun ensureSuccessUpdatesCacheForLaterNavigation() {
        val repository = FakeRepository().apply {
            listResult = DailyListResult.Success(
                listOf(
                    summary("2026-09-29", "day-a", null),
                    summary("2026-09-30", "day-b", "doc-b"),
                ),
            )
            ensureResult = DailyResult.Success(document("doc-a", "day-a", "2026-09-29", "created"))
        }
        val controller = controller(
            repository = repository,
            loadDay = { logicalDate ->
                TodayResult.Success(
                    if (logicalDate == "2026-09-30") day("2026-09-30", "day-b") else day("2026-09-29", "day-a"),
                )
            },
        )

        controller.loadCurrent()
        assertTrue(await { controller.state.document?.documentId == "doc-a" })
        controller.selectDate("2026-09-30")
        assertTrue(await { controller.state.selectedDate == "2026-09-30" })
        controller.selectDate("2026-09-29")

        assertTrue(await { controller.state.selectedDate == "2026-09-29" && controller.state.document?.documentId == "doc-a" })
        assertEquals(1, repository.ensureCalls.get())
        assertEquals(1, repository.listCalls.get())
        controller.close()
    }

    @Test
    fun staleGenerationCannotPublishAfterNewerDate() {
        val firstStarted = CountDownLatch(1)
        val releaseFirst = CountDownLatch(1)
        val repository = FakeRepository()
        val controller = controller(
            repository = repository,
            loadDay = { logicalDate ->
                if (logicalDate == null) {
                    firstStarted.countDown()
                    releaseFirst.await(2, TimeUnit.SECONDS)
                    TodayResult.Success(day("2026-09-29", "day-a"))
                } else {
                    TodayResult.Success(day(logicalDate, "day-b"))
                }
            },
            listDaily = { DailyListResult.Success(listOf(summary("2026-09-30", "day-b", "doc-b"))) },
        )

        controller.loadCurrent()
        assertTrue(firstStarted.await(2, TimeUnit.SECONDS))
        controller.selectDate("2026-09-30")
        assertTrue(await { controller.state.selectedDate == "2026-09-30" && controller.state.document?.documentId == "doc-b" })
        releaseFirst.countDown()

        assertTrue(await { controller.state.selectedDate == "2026-09-30" })
        assertEquals("doc-b", controller.state.document?.documentId)
        controller.close()
    }

    @Test
    fun staleCachedMissingRelationRefreshesExactlyOnce() {
        val repository = FakeRepository().apply {
            listResults = ArrayDeque(
                listOf(
                    DailyListResult.Success(listOf(summary("2026-09-29", "day-a", "doc-old"))),
                    DailyListResult.Success(listOf(summary("2026-09-29", "day-a", "doc-new"))),
                ),
            )
            fetchResults = ArrayDeque(listOf(DailyResult.Missing, DailyResult.Success(document("doc-new", "day-a", "2026-09-29", "fresh"))))
        }
        val controller = controller(repository = repository)

        controller.loadCurrent()

        assertTrue(await { controller.state.document?.documentId == "doc-new" })
        assertEquals(2, repository.listCalls.get())
        assertEquals(listOf("doc-old", "doc-new"), repository.fetchIds)
        assertEquals(0, repository.ensureCalls.get())
        controller.close()
    }

    @Test
    fun cleanLoadedDailyRefreshesFromTargetedDocumentInvalidationWithoutEnsure() {
        val repository = FakeRepository().apply {
            listResult = DailyListResult.Success(listOf(summary("2026-09-29", "day-a", "doc-a")))
            fetchResults = ArrayDeque(
                listOf(
                    DailyResult.Success(document("doc-a", "day-a", "2026-09-29", "old")),
                    DailyResult.Success(document("doc-a", "day-a", "2026-09-29", "remote")),
                ),
            )
        }
        val controller = controller(repository)

        controller.loadCurrent()
        assertTrue(await { controller.state.markdownBody == "old" })
        controller.onRealtimeDocumentsInvalidation(setOf("doc-a"))

        assertTrue(await { controller.state.markdownBody == "remote" })
        assertEquals(listOf("doc-a", "doc-a"), repository.fetchIds)
        assertEquals(0, repository.ensureCalls.get())
        controller.close()
    }

    @Test
    fun dirtyDailyPreservesDraftUntilExistingSaveBoundary() {
        val repository = FakeRepository().apply {
            listResult = DailyListResult.Success(listOf(summary("2026-09-29", "day-a", "doc-a")))
            updateResult = DailyResult.Success(document("doc-a", "day-a", "2026-09-29", "local"))
            fetchResults = ArrayDeque(
                listOf(
                    DailyResult.Success(document("doc-a", "day-a", "2026-09-29", "old")),
                    DailyResult.Success(document("doc-a", "day-a", "2026-09-29", "remote")),
                ),
            )
        }
        val controller = controller(repository)

        controller.loadCurrent()
        assertTrue(await { controller.state.markdownBody == "old" })
        controller.updateBody("local")
        controller.onRealtimeDocumentsInvalidation(setOf("doc-a"))

        Thread.sleep(100)
        assertEquals("local", controller.state.markdownBody)
        assertEquals(listOf("doc-a"), repository.fetchIds)

        controller.save()
        assertTrue(await { controller.state.markdownBody == "remote" })
        controller.close()
    }

    @Test
    fun realtimeInvalidationDoesNotEnsureWhenDailyDocumentIsNotLoaded() {
        val repository = FakeRepository()
        val controller = controller(repository)

        controller.onRealtimeDocumentsInvalidation(null)

        assertEquals(0, repository.ensureCalls.get())
        assertEquals(emptyList<String>(), repository.fetchIds)
        controller.close()
    }

    @Test
    fun parallelUnauthorizedResultsTriggerOneControllerAuthHandoff() {
        val repository = FakeRepository().apply {
            listResult = DailyListResult.Unauthorized
        }
        var authCalls = 0
        val controller = controller(
            repository = repository,
            onUnauthorized = { authCalls++ },
            loadDay = { TodayResult.Unauthorized },
        )

        controller.loadCurrent()

        assertTrue(await { !controller.state.loading && authCalls == 1 })
        assertEquals(1, authCalls)
        controller.close()
    }

    @Test
    fun canonicalListFailureDoesNotEnsureWithIncompleteKnowledge() {
        val repository = FakeRepository().apply {
            listResult = DailyListResult.Failure("list failed")
        }
        val controller = controller(repository = repository)

        controller.loadCurrent()

        assertTrue(await { controller.state.errorMessage == "list failed" })
        assertEquals(0, repository.ensureCalls.get())
        controller.close()
    }

    private fun controller(
        repository: FakeRepository,
        loadDay: (String?) -> TodayResult = { logicalDate -> TodayResult.Success(day(logicalDate ?: "2026-09-29", if (logicalDate == "2026-09-30") "day-b" else "day-a")) },
        listDaily: (() -> DailyListResult)? = null,
        onUnauthorized: () -> Unit = {},
    ): DailyController {
        if (listDaily != null) repository.listProvider = listDaily
        return DailyController(
            repository = repository,
            loadDay = loadDay,
            onUnauthorized = onUnauthorized,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
    }

    private fun await(predicate: () -> Boolean): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3)
        while (System.nanoTime() < deadline) {
            if (predicate()) return true
            Thread.yield()
        }
        return predicate()
    }

    private class FakeRepository : DailyDocumentRepository {
        var listResult: DailyListResult = DailyListResult.Success(emptyList())
        var listResults: ArrayDeque<DailyListResult>? = null
        var listProvider: (() -> DailyListResult)? = null
        var ensureResult: DailyResult = DailyResult.Failure("unexpected ensure")
        var updateResult: DailyResult = DailyResult.Failure("unused")
        var fetchResults: ArrayDeque<DailyResult>? = null
        val listCalls = AtomicInteger()
        val ensureCalls = AtomicInteger()
        val fetchIds = mutableListOf<String>()

        override fun listDaily(): DailyListResult {
            listCalls.incrementAndGet()
            return listProvider?.invoke() ?: listResults?.removeFirstOrNull() ?: listResult
        }

        override fun fetchDaily(documentId: String): DailyResult {
            synchronized(fetchIds) { fetchIds += documentId }
            return fetchResults?.removeFirstOrNull() ?: DailyResult.Success(document(documentId, "day-a", "2026-09-29", "body"))
        }

        override fun ensureDaily(request: DailyEnsureRequest): DailyResult {
            ensureCalls.incrementAndGet()
            return ensureResult
        }

        override fun updateDaily(request: DailyUpdateRequest): DailyResult = updateResult
    }

    private companion object {
        fun summary(date: String, dayId: String, documentId: String?) = AndroidDailyDocumentSummary(dayId, date, documentId)

        fun document(documentId: String, dayId: String, date: String, body: String) = AndroidDailyDocument(documentId, dayId, date, body, 0)

        fun day(date: String, dayId: String) = TodayDay(
            logicalDate = date,
            isCurrent = date == "2026-09-29",
            planningEnabled = true,
            placementRevision = 0,
            sections = emptyList(),
            unsectionedEntries = emptyList(),
            activeExecution = null,
            taskChuteDayId = dayId,
        )
    }
}
