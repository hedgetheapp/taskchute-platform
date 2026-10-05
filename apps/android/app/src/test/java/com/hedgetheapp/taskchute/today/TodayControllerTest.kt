package com.hedgetheapp.taskchute.today

import java.util.concurrent.CountDownLatch
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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
            loadResult = TodayResult.Success(dayAt("2026-09-16", "Task"))
            loadResultAfterFirst = TodayResult.Failure("network")
        }
        val controller = controller(repository)

        controller.loadLogicalDate("2026-09-16")
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })

        controller.refresh()
        assertTrue(repository.reloadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) {
            it.status == TodayLoadStatus.CONTENT && it.errorMessage?.contains("保存済み") == true
        })
        assertEquals(listOf("2026-09-16", "2026-09-16"), repository.requestedDates)

        repository.loadResultAfterFirst = TodayResult.Success(dayWith(LifecycleState.PLANNED))
        repository.holdLoad = true
        controller.refresh()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.REFRESHING })
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
    fun immediateStartOptimismMustChainFromPresentedCompletedDay() {
        val initial = handoffDay()
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(initial)
            holdComplete = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.complete(initial.allEntries.single { it.id == "entry-a" })
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "entry-b" })

        val presented = controller.state.presentedDay!!
        val runningIds = presented.allEntries.filter { it.lifecycleState == LifecycleState.RUNNING }.map { it.id }
        val activeEntryId = presented.activeExecution?.entryId
        val aState = presented.allEntries.single { it.id == "entry-a" }.lifecycleState
        repository.releaseComplete.countDown()
        controller.close()

        assertEquals(LifecycleState.COMPLETED, aState)
        assertEquals("Expected only B to be Running, actual rows=$runningIds", listOf("entry-b"), runningIds)
        assertEquals("Expected B to own the effective active execution", "entry-b", activeEntryId)
    }

    @Test
    fun startRequestMustWaitUntilCompletePredecessorResolves() {
        val initial = handoffDay()
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(initial)
            loadResultAfterFirst = TodayResult.Success(handoffDay(aState = LifecycleState.COMPLETED, bState = LifecycleState.RUNNING))
            holdComplete = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.complete(initial.allEntries.single { it.id == "entry-a" })
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "entry-b" })
        controller.start(initial.allEntries.single { it.id == "entry-b" })
        val startDispatchedBeforeCompleteResolved = repository.startStarted.await(250, TimeUnit.MILLISECONDS)
        val callsBeforeCompleteResolved = repository.startCalls.get()

        repository.releaseComplete.countDown()
        assertTrue(repository.startStarted.await(2, TimeUnit.SECONDS))
        repository.releaseStart.countDown()
        assertTrue(awaitState(controller) { it.pendingEntryIds.isEmpty() && it.day?.runningTask?.id == "entry-b" })
        controller.close()

        assertFalse("Start B must not be dispatched while Complete A is held", startDispatchedBeforeCompleteResolved)
        assertEquals("Start B must remain unsent while Complete A is in flight", 0, callsBeforeCompleteResolved)
        assertEquals(1, repository.startCalls.get())
        assertEquals("entry-b", repository.startedEntryIds.single())
    }

    @Test
    fun failedCompleteWithCanonicalRunningA_CancelsDependentStart() {
        val initial = handoffDay()
        val repository = FakeRepository().apply {
            loadResults = listOf(
                TodayResult.Success(initial),
                TodayResult.Success(handoffDay(aState = LifecycleState.RUNNING, bState = LifecycleState.PLANNED)),
            )
            completeResult = TodayMutationResult.Failure("complete failed")
            holdComplete = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.complete(initial.allEntries.single { it.id == "entry-a" })
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "entry-b" })
        repository.releaseComplete.countDown()

        assertTrue(awaitState(controller) { it.errorMessage == "complete failed" && it.pendingEntryIds.isEmpty() })
        val result = controller.state.presentedDay
        val starts = repository.startCalls.get()
        val error = controller.state.errorMessage
        controller.close()

        assertEquals("A canonical active Execution must cancel queued B", 0, starts)
        assertEquals(LifecycleState.RUNNING, result?.allEntries?.single { it.id == "entry-a" }?.lifecycleState)
        assertEquals(LifecycleState.PLANNED, result?.allEntries?.single { it.id == "entry-b" }?.lifecycleState)
        assertEquals("complete failed", error)
    }

    @Test
    fun failedCompleteMayContinueOnlyAfterCanonicalCompletedAIsLoaded() {
        val initial = handoffDay()
        val canonicalCompleted = handoffDay(aState = LifecycleState.COMPLETED, bState = LifecycleState.PLANNED)
        val repository = FakeRepository().apply {
            loadResults = listOf(
                TodayResult.Success(initial),
                TodayResult.Success(canonicalCompleted),
                TodayResult.Success(handoffDay(aState = LifecycleState.COMPLETED, bState = LifecycleState.RUNNING)),
            )
            completeResult = TodayMutationResult.Failure("transport uncertain")
            holdComplete = true
            holdSecondLoad = true
            holdStart = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.complete(initial.allEntries.single { it.id == "entry-a" })
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "entry-b" })
        repository.releaseComplete.countDown()

        assertTrue(repository.secondLoadStarted.await(2, TimeUnit.SECONDS))
        val startsBeforeCanonicalProof = repository.startCalls.get()
        repository.releaseSecondLoad.countDown()
        assertTrue(repository.startStarted.await(2, TimeUnit.SECONDS))
        repository.releaseStart.countDown()
        assertTrue(awaitState(controller) { it.pendingEntryIds.isEmpty() && it.day?.runningTask?.id == "entry-b" })
        val events = repository.events.toList()
        controller.close()

        assertEquals("Queued Start must not be sent before canonical revalidation", 0, startsBeforeCanonicalProof)
        assertTrue(events.indexOf("load-end:2") < events.indexOf("start:entry-b"))
        assertEquals(1, events.count { it == "start:entry-b" })
    }

    @Test
    fun failedCompleteCancelsQueuedStartWhenCanonicalBIsNoLongerPlanned() {
        val initial = handoffDay()
        val canonicalIneligible = handoffDay(
            aState = LifecycleState.COMPLETED,
            bState = LifecycleState.COMPLETED,
        )
        val repository = FakeRepository().apply {
            loadResults = listOf(TodayResult.Success(initial), TodayResult.Success(canonicalIneligible))
            completeResult = TodayMutationResult.Failure("complete uncertain")
            holdComplete = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.complete(initial.allEntries.single { it.id == "entry-a" })
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "entry-b" })
        repository.releaseComplete.countDown()

        assertTrue(awaitState(controller) { it.errorMessage == "complete uncertain" && it.pendingEntryIds.isEmpty() })
        assertEquals(0, repository.startCalls.get())
        assertEquals(LifecycleState.COMPLETED, controller.state.presentedDay?.allEntries?.single { it.id == "entry-b" }?.lifecycleState)
        controller.close()
    }

    @Test
    fun crossDayActiveEntryCanCompleteAndQueueCurrentDayStart() {
        val initial = crossDayDay()
        val currentRowIds = initial.allEntries.map { it.id }
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(initial)
            loadResultAfterFirst = TodayResult.Success(initial.copy(
                activeExecution = TodayExecution("execution-b", "day-b-entry", "2026-10-05T12:00:00Z", 600),
                activeEntry = null,
                sections = initial.sections.map { section -> section.copy(entries = section.entries.map { it.copy(lifecycleState = LifecycleState.RUNNING, executionId = "execution-b") }) },
            ))
            holdComplete = true
            holdStart = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day?.runningTask?.id == "prior-entry" })

        val priorActive = controller.state.day!!.runningTask!!
        controller.complete(priorActive)
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "day-b-entry" })

        val presented = controller.state.presentedDay!!
        assertEquals("prior-entry", repository.completedTask?.id)
        assertEquals("prior-execution", repository.completedTask?.executionId)
        assertEquals(currentRowIds, presented.allEntries.map { it.id })
        assertEquals(listOf("day-b-entry"), presented.allEntries.filter { it.lifecycleState == LifecycleState.RUNNING }.map { it.id })
        assertEquals("day-b-entry", presented.activeExecution?.entryId)
        assertEquals(0, repository.startCalls.get())

        repository.releaseComplete.countDown()
        assertTrue(repository.startStarted.await(2, TimeUnit.SECONDS))
        assertEquals(1, repository.startCalls.get())
        repository.releaseStart.countDown()
        assertTrue(awaitState(controller) { it.pendingEntryIds.isEmpty() })
        controller.close()
    }

    @Test
    fun realtimeInvalidationDuringCompleteStartHandoffProducesOneFinalReload() {
        val initial = handoffDay()
        val repository = FakeRepository().apply {
            loadResults = listOf(
                TodayResult.Success(initial),
                TodayResult.Success(handoffDay(aState = LifecycleState.COMPLETED, bState = LifecycleState.RUNNING)),
            )
            holdComplete = true
            holdStart = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.complete(initial.allEntries.single { it.id == "entry-a" })
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "entry-b" })
        controller.onRealtimeDayInvalidation("2026-09-14")
        controller.onRealtimeForeground()
        assertEquals(1, repository.loadCallCount())

        repository.releaseComplete.countDown()
        assertTrue(repository.startStarted.await(2, TimeUnit.SECONDS))
        assertEquals(1, repository.startCalls.get())
        assertEquals(1, repository.loadCallCount())
        repository.releaseStart.countDown()
        assertTrue(
            "state=${controller.state}; calls=${repository.loadCallCount()}; events=${repository.events}",
            awaitState(controller) { it.pendingEntryIds.isEmpty() && it.day?.runningTask?.id == "entry-b" },
        )

        assertEquals(2, repository.loadCallCount())
        assertEquals(1, repository.events.count { it == "load-start:2" })
        controller.close()
    }

    @Test
    fun navigationCancelsQueuedStartBeforeItCanTargetAnotherDay() {
        val initial = handoffDay()
        val otherDay = dayWith(LifecycleState.PLANNED).copy(logicalDate = "2026-09-15", isCurrent = false)
        val repository = FakeRepository().apply {
            loadResults = listOf(TodayResult.Success(initial), TodayResult.Success(otherDay), TodayResult.Success(otherDay))
            holdComplete = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.complete(initial.allEntries.single { it.id == "entry-a" })
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "entry-b" })
        controller.nextDay()
        assertTrue(awaitState(controller) { it.day?.logicalDate == "2026-09-15" })

        repository.releaseComplete.countDown()
        assertTrue(awaitState(controller) { it.pendingEntryIds.isEmpty() })
        assertEquals(0, repository.startCalls.get())
        assertEquals("2026-09-15", controller.state.day?.logicalDate)
        controller.close()
    }

    @Test
    fun unauthorizedCompleteCancelsDependentStartAndHandsOffOnce() {
        val initial = handoffDay()
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(initial)
            completeResult = TodayMutationResult.Unauthorized
            holdComplete = true
        }
        var authHandoffs = 0
        val controller = TodayController(
            repository = repository,
            onUnauthorized = { authHandoffs++ },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day != null })

        controller.complete(initial.allEntries.single { it.id == "entry-a" })
        assertTrue(repository.completeStarted.await(2, TimeUnit.SECONDS))
        controller.start(initial.allEntries.single { it.id == "entry-b" })
        repository.releaseComplete.countDown()

        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.AUTH_REQUIRED })
        val starts = repository.startCalls.get()
        val pending = controller.state.pendingEntryIds
        controller.close()

        assertEquals(0, starts)
        assertTrue(pending.isEmpty())
        assertEquals(1, authHandoffs)
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
    fun startResultPlacementRevisionRaisesFloorBeforeStaleReloadCanReplaceIt() {
        val initial = dayWith(LifecycleState.PLANNED).copy(placementRevision = 5)
        val staleReload = dayWith(LifecycleState.PLANNED).copy(placementRevision = 5)
        val canonicalRunning = dayWith(LifecycleState.RUNNING).copy(placementRevision = 8)
        val repository = FakeRepository().apply {
            loadResults = listOf(
                TodayResult.Success(initial),
                TodayResult.Success(staleReload),
                TodayResult.Success(canonicalRunning),
            )
            startResult = TodayMutationResult.SuccessWithRevision(8)
            holdStart = true
            holdSecondLoad = true
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(repository.loadStarted.await(2, TimeUnit.SECONDS))
        assertTrue(awaitState(controller) { it.day?.placementRevision == 5 })

        controller.start(initial.allEntries.single())
        assertTrue(repository.startStarted.await(2, TimeUnit.SECONDS))
        repository.releaseStart.countDown()
        assertTrue(repository.secondLoadStarted.await(2, TimeUnit.SECONDS))
        assertEquals(8, controller.state.day?.placementRevision)
        assertEquals(8, controller.state.presentedDay?.placementRevision)
        assertEquals(listOf(5), repository.startPlacementRevisions.toList())

        repository.releaseSecondLoad.countDown()
        assertTrue(awaitState(controller) {
            it.optimisticDay == null && it.day?.placementRevision == 8 && it.day.runningTask?.id == "entry-1"
        })
        assertEquals(3, repository.loadCallCount())
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
        assertTrue(
            "reload missing: state=${controller.state}; calls=${repository.loadCallCount()}; events=${repository.events}",
            repository.reloadStarted.await(2, TimeUnit.SECONDS),
        )
        assertTrue(
            "state=${controller.state}; calls=${repository.loadCallCount()}; events=${repository.events}",
            awaitState(controller) { it.pendingEntryIds.isEmpty() && it.day?.runningTask != null },
        )
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

    @Test
    fun cachedAdjacentDayRendersImmediatelyAndCanonicalRevalidationReplacesIt() {
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED))
            setDateResults("2026-09-15", TodayResult.Success(dayAt("2026-09-15", "Target")))
            setDateResults(
                "2026-09-14",
                TodayResult.Success(dayAt("2026-09-14", "Revalidated")),
            )
            holdDateCall("2026-09-14", 1)
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })

        controller.loadLogicalDate("2026-09-15")
        assertTrue(awaitState(controller) { it.day?.logicalDate == "2026-09-15" && it.status == TodayLoadStatus.CONTENT })

        controller.loadLogicalDate("2026-09-14")
        assertTrue(repository.awaitDateCallStarted("2026-09-14", 1))
        assertEquals("2026-09-14", controller.state.presentedDay?.logicalDate)
        assertEquals(TodayLoadStatus.REFRESHING, controller.state.status)
        assertEquals("Task", controller.state.presentedDay?.allEntries?.single()?.title)

        repository.releaseDateCall("2026-09-14", 1)
        assertTrue(awaitState(controller) {
            it.status == TodayLoadStatus.CONTENT && it.presentedDay?.allEntries?.singleOrNull()?.title == "Revalidated"
        })
        controller.close()
    }

    @Test
    fun failedWarmRefreshPreservesTheUsableCachedDayAndShowsRetryError() {
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED))
            setDateResults("2026-09-15", TodayResult.Success(dayAt("2026-09-15", "Target")))
            setDateResults("2026-09-14", TodayResult.Failure("offline"))
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })
        controller.loadLogicalDate("2026-09-15")
        assertTrue(awaitState(controller) { it.day?.logicalDate == "2026-09-15" && it.status == TodayLoadStatus.CONTENT })

        controller.loadLogicalDate("2026-09-14")

        assertTrue(awaitState(controller) {
            it.status == TodayLoadStatus.CONTENT && it.errorMessage?.contains("保存済み") == true
        })
        assertEquals("2026-09-14", controller.state.presentedDay?.logicalDate)
        assertEquals("Task", controller.state.presentedDay?.allEntries?.single()?.title)
        controller.close()
    }

    @Test
    fun olderPrefetchResponseCannotReplaceANewerSelectedDay() {
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED))
            setDateResults("2026-09-15", TodayResult.Success(dayAt("2026-09-15", "Older target")))
            setDateResults("2026-09-16", TodayResult.Success(dayAt("2026-09-16", "New target")))
            holdDateCall("2026-09-15", 1)
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })

        controller.prefetchLogicalDate("2026-09-15")
        assertTrue(repository.awaitDateCallStarted("2026-09-15", 1))
        controller.loadLogicalDate("2026-09-15")
        controller.loadLogicalDate("2026-09-16")
        assertTrue(awaitState(controller) { it.day?.logicalDate == "2026-09-16" && it.status == TodayLoadStatus.CONTENT })

        repository.releaseDateCall("2026-09-15", 1)
        assertTrue(repository.awaitDateCallFinished("2026-09-15", 1))
        assertTrue(awaitState(controller) { it.day?.logicalDate == "2026-09-16" })
        assertEquals("2026-09-16", controller.state.day?.logicalDate)
        controller.close()
    }

    @Test
    fun sessionResetClearsTodayStateAndIgnoresAnOldPrincipalRead() {
        val repository = FakeRepository().apply {
            loadResult = TodayResult.Success(dayWith(LifecycleState.PLANNED))
            setDateResults("2026-09-15", TodayResult.Success(dayAt("2026-09-15", "Old principal")))
            holdDateCall("2026-09-15", 1)
        }
        val controller = controller(repository)
        controller.loadCurrent()
        assertTrue(awaitState(controller) { it.status == TodayLoadStatus.CONTENT })
        controller.prefetchLogicalDate("2026-09-15")
        assertTrue(repository.awaitDateCallStarted("2026-09-15", 1))
        controller.loadLogicalDate("2026-09-15")

        controller.resetForSessionChange()
        repository.releaseDateCall("2026-09-15", 1)
        assertTrue(repository.awaitDateCallFinished("2026-09-15", 1))
        assertNull(controller.state.day)
        assertNull(controller.state.selectedLogicalDate)
        assertEquals(TodayLoadStatus.LOADING, controller.state.status)

        controller.loadLogicalDate("2026-09-15")
        assertTrue(awaitState(controller) { it.day?.logicalDate == "2026-09-15" && it.status == TodayLoadStatus.CONTENT })
        assertEquals(2, repository.dateCallCount("2026-09-15"))
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
        var holdComplete = false
        var holdSecondLoad = false
        val loadStarted = CountDownLatch(1)
        val reloadStarted = CountDownLatch(1)
        val releaseLoad = CountDownLatch(1)
        val secondLoadStarted = CountDownLatch(1)
        val releaseSecondLoad = CountDownLatch(1)
        val startStarted = CountDownLatch(1)
        val releaseStart = CountDownLatch(1)
        val completeStarted = CountDownLatch(1)
        val releaseComplete = CountDownLatch(1)
        val startCalls = AtomicInteger()
        val completeCalls = AtomicInteger()
        val startedEntryIds = CopyOnWriteArrayList<String>()
        val startPlacementRevisions = CopyOnWriteArrayList<Int>()
        val events = CopyOnWriteArrayList<String>()
        val requestedDates = mutableListOf<String?>()
        private val dateResults = mutableMapOf<String, MutableList<TodayResult>>()
        private val dateCalls = mutableMapOf<String, Int>()
        private val heldDateCalls = mutableSetOf<Pair<String, Int>>()
        private val dateCallStarted = mutableMapOf<Pair<String, Int>, CountDownLatch>()
        private val dateCallReleased = mutableMapOf<Pair<String, Int>, CountDownLatch>()
        private val dateCallFinished = mutableMapOf<Pair<String, Int>, CountDownLatch>()
        private val loadCalls = AtomicInteger()

        fun loadCallCount(): Int = loadCalls.get()

        fun setDateResults(date: String, vararg results: TodayResult) = synchronized(requestedDates) {
            dateResults[date] = results.toMutableList()
        }

        fun holdDateCall(date: String, call: Int) = synchronized(requestedDates) {
            val key = date to call
            heldDateCalls += key
            dateCallStarted[key] = CountDownLatch(1)
            dateCallReleased[key] = CountDownLatch(1)
            dateCallFinished[key] = CountDownLatch(1)
        }

        fun awaitDateCallStarted(date: String, call: Int): Boolean =
            dateLatch(dateCallStarted, date, call).await(2, TimeUnit.SECONDS)

        fun awaitDateCallFinished(date: String, call: Int): Boolean =
            dateLatch(dateCallFinished, date, call).await(2, TimeUnit.SECONDS)

        fun releaseDateCall(date: String, call: Int) = dateLatch(dateCallReleased, date, call).countDown()

        fun dateCallCount(date: String): Int = synchronized(requestedDates) { dateCalls[date] ?: 0 }

        private fun dateLatch(
            latches: MutableMap<Pair<String, Int>, CountDownLatch>,
            date: String,
            call: Int,
        ): CountDownLatch = synchronized(requestedDates) { latches.getValue(date to call) }

        override fun loadDay(logicalDate: String?): TodayResult {
            val dateCall = synchronized(requestedDates) {
                requestedDates += logicalDate
                logicalDate?.let { date -> (dateCalls.getOrDefault(date, 0) + 1).also { dateCalls[date] = it } }
            }
            val call = loadCalls.incrementAndGet()
            if (call == 1) loadStarted.countDown() else reloadStarted.countDown()
            events += "load-start:$call"
            if (logicalDate != null && dateCall != null) {
                val key = logicalDate to dateCall
                val release = synchronized(requestedDates) {
                    if (key in heldDateCalls) dateCallReleased.getValue(key) else null
                }
                if (release != null) {
                    dateLatch(dateCallStarted, logicalDate, dateCall).countDown()
                    release.await(2, TimeUnit.SECONDS)
                }
            }
            if (call == 2 && holdSecondLoad) {
                secondLoadStarted.countDown()
                releaseSecondLoad.await(2, TimeUnit.SECONDS)
            }
            if (holdLoad) releaseLoad.await(2, TimeUnit.SECONDS)
            val result = synchronized(requestedDates) {
                logicalDate?.let { date ->
                    dateResults[date]?.let { results -> results.getOrNull((dateCall ?: 1) - 1) ?: results.lastOrNull() }
                }
            } ?: loadResults?.getOrNull(call - 1)
                ?: if (call == 1) loadResult else loadResultAfterFirst ?: loadResult
            events += "load-end:$call"
            if (logicalDate != null && dateCall != null) {
                synchronized(requestedDates) { dateCallFinished[logicalDate to dateCall]?.countDown() }
            }
            return result
        }

        override fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult {
            startCalls.incrementAndGet()
            startedEntryIds += task.id
            startPlacementRevisions += placementRevision
            events += "start:${task.id}"
            startStarted.countDown()
            if (holdStart) releaseStart.await(2, TimeUnit.SECONDS)
            return startResult
        }

        override fun completeTask(task: TodayTask): TodayMutationResult {
            completedTask = task
            completeCalls.incrementAndGet()
            events += "complete-start:${task.id}"
            completeStarted.countDown()
            if (holdComplete) releaseComplete.await(2, TimeUnit.SECONDS)
            events += "complete-end:${task.id}"
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

        fun dayAt(date: String, title: String) = dayWith(LifecycleState.PLANNED).copy(
            logicalDate = date,
            isCurrent = date == "2026-09-14",
            sections = dayWith(LifecycleState.PLANNED).sections.map { section ->
                section.copy(entries = section.entries.map { it.copy(title = title) })
            },
        )

        fun handoffDay(
            aState: LifecycleState = LifecycleState.RUNNING,
            bState: LifecycleState = LifecycleState.PLANNED,
        ) = TodayDay(
            logicalDate = "2026-09-14",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 5,
            sections = listOf(TodaySection(
                "section-1", "Morning", 480, 720,
                listOf(
                    task(aState).copy(id = "entry-a", title = "Task A", taskId = "task-a", executionId = if (aState == LifecycleState.RUNNING) "execution-a" else null),
                    task(bState).copy(id = "entry-b", title = "Task B", taskId = "task-b", executionId = if (bState == LifecycleState.RUNNING) "execution-b" else null),
                ),
            )),
            unsectionedEntries = emptyList(),
            activeExecution = if (aState == LifecycleState.RUNNING) TodayExecution("execution-a", "entry-a", "2026-09-14T01:00:00Z", 600)
                else if (bState == LifecycleState.RUNNING) TodayExecution("execution-b", "entry-b", "2026-09-14T02:00:00Z", 600) else null,
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
