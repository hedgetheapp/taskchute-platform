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
    fun loadFailureCarriesOnlyTheSafeDiagnosticToTodayPresentationState() {
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Failure("retry", diagnostic = "HTTP 503 / infrastructure_ambiguous")
        }
        val controller = controller(repository)

        controller.loadCurrent()

        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.ERROR })
        assertEquals("retry", controller.state.errorMessage)
        assertEquals("HTTP 503 / infrastructure_ambiguous", controller.state.diagnosticMessage)
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
    fun unauthorizedRecoveryThenTodaySuccessExitsLoading() {
        val repository = FakeRepository().apply {
            loadResults = listOf(TodayResult.Unauthorized, TodayResult.Success(dayWith(LifecycleState.PLANNED)))
        }
        var unauthorized = 0
        val controller = TodayController(repository, { unauthorized++ }, CoroutineScope(SupervisorJob() + Dispatchers.Unconfined))

        controller.loadCurrent()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.AUTH_REQUIRED })

        // Auth restoration returns SignedIn and TodayScreen mounts again.
        controller.loadCurrent()

        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })
        assertEquals(1, unauthorized)
        assertEquals(2, repository.loadCallCount())
        controller.close()
    }

    @Test
    fun repeatedUnauthorizedAfterRecoveryShowsRetryInsteadOfLooping() {
        val repository = FakeRepository().apply {
            loadResults = listOf(
                TodayResult.Unauthorized,
                TodayResult.Unauthorized,
                TodayResult.Success(dayWith(LifecycleState.PLANNED)),
            )
        }
        var unauthorized = 0
        val controller = TodayController(repository, { unauthorized++ }, CoroutineScope(SupervisorJob() + Dispatchers.Unconfined))

        controller.loadCurrent()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.AUTH_REQUIRED })
        controller.loadCurrent()

        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.ERROR })
        assertEquals(1, unauthorized)
        assertEquals(2, repository.loadCallCount())

        // The existing user retry starts a new bounded attempt and can recover normally.
        controller.refresh()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })
        assertEquals(3, repository.loadCallCount())
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
        assertEquals(task.id, controller.state.presentedDay?.runningTask?.id)
        assertEquals(TodayLoadStatus.CONTENT, controller.state.status)

        repository.releaseStart.countDown()
        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.pendingEntryIds.isEmpty() && it.status == TodayLoadStatus.CONTENT })
        assertEquals(0, controller.state.pendingEntryIds.size)
        assertEquals(TodayLoadStatus.CONTENT, controller.state.status)
        controller.close()
    }

    @Test
    fun successfulMutationKeepsOptimisticPresentationUntilSilentReconcile() {
        val task = task(LifecycleState.PLANNED)
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED))
            loadResultAfterFirst = TodayResult.Success(dayWith(LifecycleState.RUNNING))
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        repository.holdLoad = true
        controller.start(task)

        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertEquals(null, controller.state.day?.runningTask)
        assertEquals(task.id, controller.state.presentedDay?.runningTask?.id)

        repository.releaseLoad.countDown()
        assertTrue(awaitState(controller) { it.optimisticDay == null && it.day?.runningTask?.id == task.id })
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
    fun crossDayCompleteUsesStableEntryAndExecutionIdentityAndKeepsCurrentRows() {
        val initial = crossDayDay()
        val plannedIds = initial.allEntries.map { it.id }
        val repository = FakeRepository().apply {
            loadResults = listOf(
                TodayResult.Success(initial),
                TodayResult.Success(initial.copy(activeExecution = null, activeEntry = null)),
            )
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day?.runningTask?.id == "prior-entry" })
        assertEquals(plannedIds, controller.state.day?.allEntries?.map { it.id })

        repository.holdLoad = true
        controller.complete(controller.state.day!!.runningTask!!)

        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertEquals("prior-entry", repository.completedTask?.id)
        assertEquals("prior-execution", repository.completedTask?.executionId)
        assertEquals(plannedIds, controller.state.presentedDay?.allEntries?.map { it.id })
        assertEquals(null, controller.state.presentedDay?.runningTask)

        repository.releaseLoad.countDown()
        assertTrue(awaitState(controller) { it.optimisticDay == null && it.day?.runningTask == null })
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
    fun placementRevisionConfirmationIsDateScopedAndMonotonic() {
        val repository = FakeRepository().apply { loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED)) }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.confirmPlacementRevision("2026-09-14", 8)
        controller.confirmPlacementRevision("2026-09-14", 7)
        controller.confirmPlacementRevision("2026-09-15", 99)

        assertEquals(8, controller.state.day?.placementRevision)
        controller.close()
    }

    @Test
    fun staleReconcileCannotRollBackConfirmedRevisionOrOptimisticProjection() {
        val first = dayWith(LifecycleState.PLANNED).copy(
            placementRevision = 10,
            sections = listOf(
                TodaySection(
                    "section-1",
                    "Morning",
                    480,
                    720,
                    listOf(task(LifecycleState.PLANNED), task(LifecycleState.PLANNED).copy(id = "entry-2")),
                ),
            ),
        )
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(first)
            loadResultAfterFirst = TodayResult.Success(first.copy(placementRevision = 10))
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day?.placementRevision == 10 })

        controller.applyOptimisticDirectManipulation(
            DirectManipulationRequest.Move(
                operationId = "optimistic-move",
                entryId = "entry-1",
                taskChuteDayId = "day-1",
                sectionId = "section-1",
                expectedPlacementRevision = 10,
                placement = PlacementTarget("section-1", "entry-2", PlacementEdge.AFTER),
            ),
        )
        controller.confirmPlacementRevision("2026-09-14", 14)
        repository.holdLoad = true
        controller.reconcileSilently()
        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        repository.releaseLoad.countDown()

        assertTrue(awaitState(controller) { it.optimisticDay != null && it.day?.placementRevision == 14 })
        assertEquals(
            listOf("entry-2", "entry-1"),
            controller.state.presentedDay?.sections?.single()?.entries?.map { it.id },
        )
        assertEquals(null, controller.state.errorMessage)
        controller.close()
    }

    @Test
    fun stalePlannedProjectionBelowConfirmedActualTimeRevisionCannotReplaceOptimisticCompletion() {
        val planned = task(LifecycleState.PLANNED)
        val section = TodaySection("section-1", "Morning", 480, 720, listOf(planned))
        val initial = dayWith(LifecycleState.PLANNED).copy(placementRevision = 5, sections = listOf(section))
        val stale = initial.copy(placementRevision = 5)
        val fresh = initial.copy(
            placementRevision = 6,
            sections = listOf(section.copy(entries = listOf(
                planned.copy(
                    lifecycleState = LifecycleState.COMPLETED,
                    executionId = "execution-1",
                    firstStartedAt = "2026-09-14T13:00:00Z",
                    lastEndedAt = "2026-09-14T13:30:00Z",
                ),
            ))),
        )
        val staleStarted = CountDownLatch(1)
        val releaseStale = CountDownLatch(1)
        val freshStarted = CountDownLatch(1)
        val releaseFresh = CountDownLatch(1)
        val loads = AtomicInteger()
        val repository = object : TodayRepository {
            override fun loadDay(logicalDate: String?): TodayResult = when (loads.incrementAndGet()) {
                1 -> TodayResult.Success(initial)
                2 -> {
                    staleStarted.countDown()
                    releaseStale.await(2, TimeUnit.SECONDS)
                    TodayResult.Success(stale)
                }
                else -> {
                    freshStarted.countDown()
                    releaseFresh.await(2, TimeUnit.SECONDS)
                    TodayResult.Success(fresh)
                }
            }

            override fun startTask(task: TodayTask, placementRevision: Int) = TodayMutationResult.Success
            override fun completeTask(task: TodayTask) = TodayMutationResult.Success
        }
        val controller = TodayController(
            repository = repository,
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        controller.loadCurrent()
        assertTrue(awaitState(controller) { it.day?.placementRevision == 5 })

        val editor = TaskEditorState(
            TaskEditorMode.EDIT, initial, planned,
            TaskEditorDraft(title = planned.title, actualStartText = "1300", actualEndText = "1330"),
        )
        val input = NormalizedTaskInput(planned.title, null, null, "section-1", 540, 600,
            actualStartMinute = 780, actualEndMinute = 810)
        controller.applyOptimisticPlanning(editor, input)
        controller.confirmPlacementRevision("2026-09-14", 6)
        assertEquals(LifecycleState.COMPLETED, controller.state.presentedDay?.allEntries?.single()?.lifecycleState)
        assertEquals(6, controller.state.presentedDay?.placementRevision)

        controller.reconcileSilently()
        assertTrue(staleStarted.await(2, TimeUnit.SECONDS))
        releaseStale.countDown()
        assertTrue(freshStarted.await(2, TimeUnit.SECONDS))

        assertEquals(6, controller.state.day?.placementRevision)
        assertEquals(LifecycleState.PLANNED, controller.state.day?.allEntries?.single()?.lifecycleState)
        assertEquals(LifecycleState.COMPLETED, controller.state.presentedDay?.allEntries?.single()?.lifecycleState)
        assertEquals(6, controller.state.presentedDay?.placementRevision)

        releaseFresh.countDown()
        assertTrue(awaitState(controller) { it.optimisticDay == null && it.day?.placementRevision == 6 })
        assertEquals(LifecycleState.COMPLETED, controller.state.presentedDay?.allEntries?.single()?.lifecycleState)
        controller.close()
    }

    @Test
    fun newerReconcileAdvancesTheConfirmedRevisionFloorNormally() {
        val first = dayWith(LifecycleState.PLANNED).copy(placementRevision = 10)
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(first)
            loadResultAfterFirst = TodayResult.Success(first.copy(placementRevision = 15))
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day?.placementRevision == 10 })

        controller.confirmPlacementRevision("2026-09-14", 14)
        controller.reconcileSilently()

        assertTrue(awaitState(controller) { it.day?.placementRevision == 15 })
        assertEquals(null, controller.state.errorMessage)
        controller.close()
    }

    @Test
    fun staleReconcileProtectionAppliesToAnEstablishedFutureDay() {
        val first = dayWith(LifecycleState.PLANNED).copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
            placementRevision = 10,
        )
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(first)
            loadResultAfterFirst = TodayResult.Success(first.copy(placementRevision = 10))
        }
        val controller = controller(repository)
        controller.loadLogicalDate("2026-09-15")
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day?.logicalDate == "2026-09-15" })

        controller.confirmPlacementRevision("2026-09-15", 14)
        repository.holdLoad = true
        controller.reconcileSilently()
        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        repository.releaseLoad.countDown()

        assertTrue(awaitState(controller) { it.day?.placementRevision == 14 })
        assertEquals(null, controller.state.errorMessage)
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
        var completedTask: TodayTask? = null
        var loadResultAfterFirst: TodayResult? = null
        var loadResults: List<TodayResult>? = null
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
            return loadResults?.getOrNull(call - 1)
                ?: if (call == 1) loadResult else loadResultAfterFirst ?: loadResult
        }

        override fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult {
            startCalls.incrementAndGet()
            startStarted.countDown()
            if (holdStart) releaseStart.await(2, TimeUnit.SECONDS)
            return startResult
        }

        override fun completeTask(task: TodayTask): TodayMutationResult {
            completedTask = task
            return completeResult
        }
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

        fun crossDayDay() = TodayDay(
            logicalDate = "2026-10-05",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 1,
            sections = listOf(TodaySection("morning", "Morning", 240, 720, listOf(task(LifecycleState.PLANNED).copy(id = "day-b-entry")))),
            unsectionedEntries = emptyList(),
            activeExecution = TodayExecution("prior-execution", "prior-entry", "2026-10-04T12:00:00Z", 1_800),
            activeEntry = TodayActiveEntry("prior-entry", "sleep-task", "睡眠", LifecycleState.RUNNING, 1_800),
        )

        fun emptyDay() = TodayDay("2026-09-14", true, true, 0, emptyList(), emptyList(), null)
    }
}
