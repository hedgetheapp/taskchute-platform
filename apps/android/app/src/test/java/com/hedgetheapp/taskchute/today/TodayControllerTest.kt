package com.hedgetheapp.taskchute.today

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayControllerTest {
    @Test
    fun loadSuccessShowsContent() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED)) }
        val controller = controller(repository)

        controller.loadCurrent()

        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })
        assertEquals(TodayLoadStatus.CONTENT, controller.state.status)
        assertEquals("2026-09-14", controller.state.day?.logicalDate)
        controller.close()
    }

    @Test
    fun emptyDayUsesEmptyState() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Success(emptyDay()) }
        val controller = controller(repository)

        controller.loadCurrent()

        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.EMPTY })
        assertEquals(TodayLoadStatus.EMPTY, controller.state.status)
        controller.close()
    }

    @Test
    fun loadFailureIsRetryableWithoutSignedOutState() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Failure("network") }
        val controller = controller(repository)

        controller.loadCurrent()

        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.ERROR })
        assertEquals(TodayLoadStatus.ERROR, controller.state.status)
        controller.close()
    }

    @Test
    fun refreshFailureRetriesTheSameLogicalDateThroughStandardLoading() {
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED))
            loadResultAfterFirst = TodayResult.Failure("network")
        }
        val controller = controller(repository)

        controller.loadLogicalDate("2026-09-16")
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })

        controller.refresh()
        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.ERROR })
        assertEquals(listOf("2026-09-16", "2026-09-16"), repository.requestedDates)

        repository.loadResultAfterFirst = TodayResult.Success(dayWith(LifecycleState.PLANNED))
        repository.holdLoad = true
        controller.refresh()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.LOADING })
        assertEquals("2026-09-16", repository.requestedDates.last())

        repository.releaseLoad.countDown()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })
        controller.close()
    }

    @Test
    fun unauthorizedHandsOffToAuth() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Unauthorized }
        var unauthorized = 0
        val controller = TodayController(repository, { unauthorized++ }, CoroutineScope(SupervisorJob() + Dispatchers.Unconfined))

        controller.loadCurrent()

        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.AUTH_REQUIRED })
        assertEquals(TodayLoadStatus.AUTH_REQUIRED, controller.state.status)
        assertEquals(1, unauthorized)
        controller.close()
    }

    @Test
    fun startRefreshesCanonicalDayAndSuppressesDoubleSubmit() {
        val task = task(LifecycleState.PLANNED)
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED))
            loadResultAfterFirst = TodayResult.Success(dayWith(LifecycleState.RUNNING))
            holdStart = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.start(task)
        controller.start(task)
        assertTrue(repository.startStarted.await(2, TimeUnit.SECONDS))
        assertEquals(1, repository.startCalls.get())
        assertTrue(controller.state.pendingEntryIds.contains(task.id))

        repository.releaseStart.countDown()
        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.pendingEntryIds.isEmpty() && it.status == TodayLoadStatus.CONTENT })
        assertEquals(0, controller.state.pendingEntryIds.size)
        assertEquals(TodayLoadStatus.CONTENT, controller.state.status)
        controller.close()
    }

    @Test
    fun completeRefreshesDayAndRunningPanelSourceIsAvailable() {
        val running = task(LifecycleState.RUNNING)
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.RUNNING))
            loadResult = TodayResult.Success(dayWith(LifecycleState.RUNNING))
            loadResultAfterFirst = TodayResult.Success(dayWith(LifecycleState.COMPLETED))
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day?.runningTask?.id == running.id })
        assertEquals(running.id, controller.state.day?.runningTask?.id)

        controller.complete(running)

        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day?.runningTask == null })
        assertEquals(null, controller.state.day?.runningTask)
        controller.close()
    }

    @Test
    fun dateNavigationUsesAdjacentLogicalDate() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED)) }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.nextDay()

        assertTrue(awaitState(controller) { repository.requestedDates.contains("2026-09-15") })
        assertTrue(repository.requestedDates.contains("2026-09-15"))
        controller.close()
    }

    @Test
    fun datePickerSelectionLoadsExplicitLogicalDate() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED)) }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.loadLogicalDate("2026-09-17")

        assertTrue(awaitState(controller) { repository.requestedDates.contains("2026-09-17") })
        assertTrue(repository.requestedDates.contains("2026-09-17"))
        controller.close()
    }
    @Test
    fun realtimeDayInvalidationReloadsSelectedDay() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED)) }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.onRealtimeDayInvalidation("2026-09-14")

        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertEquals(2, repository.loadCallCount())
        controller.close()
    }

    @Test
    fun realtimeInvalidationDuringPendingMutationFlushesOneCanonicalReload() {
        val task = task(LifecycleState.PLANNED)
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED))
            loadResultAfterFirst = TodayResult.Success(dayWith(LifecycleState.RUNNING))
            holdStart = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.start(task)
        assertTrue(repository.startStarted.await(2, TimeUnit.SECONDS))
        controller.onRealtimeDayInvalidation(null)
        assertEquals(1, repository.loadCallCount())

        repository.releaseStart.countDown()
        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.pendingEntryIds.isEmpty() && it.day?.runningTask != null })
        assertEquals(2, repository.loadCallCount())
        controller.close()
    }

    @Test
    fun invalidationForAnotherDayDoesNotOverwriteSelectedDay() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED)) }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.onRealtimeDayInvalidation("2026-09-15")

        assertEquals(1, repository.loadCallCount())
        controller.close()
    }

    private fun controller(repository: FakeRepository): TodayController = TodayController(
        repository = repository,
        onUnauthorized = {},
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
    )

    private fun awaitState(controller: TodayController, predicate: (TodayUiState) -> Boolean): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
        while (System.nanoTime() < deadline) {
            if (predicate(controller.state)) return true
            Thread.yield()
        }
        return predicate(controller.state)
    }

    private class FakeRepository : TodayRepository {
        var loadResult: TodayResult = TodayResult.Success(emptyDay())
        var startResult: TodayMutationResult = TodayMutationResult.Success
        var completeResult: TodayMutationResult = TodayMutationResult.Success
        var loadResultAfterFirst: TodayResult? = null
        var holdLoad = false
        var holdStart = false
        val loadStarted = CountDownLatch(1)
        val reloadStarted = CountDownLatch(1)
        val releaseLoad = CountDownLatch(1)
        val startStarted = CountDownLatch(1)
        val releaseStart = CountDownLatch(1)
        val startCalls = AtomicInteger()
        val requestedDates = mutableListOf<String?>()
        private val loadCalls = AtomicInteger()

        fun loadCallCount(): Int = loadCalls.get()

        override fun loadDay(logicalDate: String?): TodayResult {
            synchronized(requestedDates) { requestedDates += logicalDate }
            val call = loadCalls.incrementAndGet()
            if (call == 1) loadStarted.countDown() else reloadStarted.countDown()
            if (holdLoad) releaseLoad.await(2, TimeUnit.SECONDS)
            return if (call == 1) loadResult else loadResultAfterFirst ?: loadResult
        }

        override fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult {
            startCalls.incrementAndGet()
            startStarted.countDown()
            if (holdStart) releaseStart.await(2, TimeUnit.SECONDS)
            return startResult
        }

        override fun completeTask(task: TodayTask): TodayMutationResult = completeResult
    }

    private companion object {
        fun task(state: LifecycleState) = TodayTask("entry-1", "Task", state, null, null, 600, 540, if (state == LifecycleState.RUNNING) "execution-1" else null, null)

        fun dayWith(state: LifecycleState) = TodayDay(
            logicalDate = "2026-09-14",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 5,
            sections = listOf(TodaySection("section-1", "Morning", 480, 720, listOf(task(state)))),
            unsectionedEntries = emptyList(),
            activeExecution = if (state == LifecycleState.RUNNING) TodayExecution("execution-1", "entry-1", "2026-09-14T01:00:00Z", 600) else null,
        )

        fun emptyDay() = TodayDay("2026-09-14", true, true, 0, emptyList(), emptyList(), null)
    }
}
