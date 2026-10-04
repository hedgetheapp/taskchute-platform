package com.hedgetheapp.taskchute.wear

import kotlinx.coroutines.Dispatchers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WearTodayControllerRealtimeTest {
    @Test
    fun foregroundValidatesWatchSessionConnectsAndLoadsCanonicalDay() {
        val repository = FakeWearRepository()
        val realtime = FakeRealtimeClient()
        val controller = controller(repository, realtime)

        controller.onForeground()

        assertEquals(1, repository.restoreCount)
        assertEquals(1, realtime.startCount)
        assertEquals(1, repository.loadCount)
        assertEquals(WearScreenState.Today(day("2026-10-01")), controller.state)
    }

    @Test
    fun authenticatedSessionTriggersBestEffortRegistrationConvergence() {
        val repository = FakeWearRepository()
        var registrationRequests = 0
        val controller = controller(repository, FakeRealtimeClient(), onAuthenticated = { registrationRequests += 1 })

        controller.onForeground()

        assertEquals(1, registrationRequests)
        assertEquals(1, repository.restoreCount)
    }

    @Test
    fun backgroundStopsRealtimeIgnoresInvalidationsAndResumeReloadsCanonicalDay() {
        val repository = FakeWearRepository()
        val realtime = FakeRealtimeClient()
        val controller = controller(repository, realtime)
        controller.onForeground()
        controller.onBackground()

        controller.onDayInvalidation(null)
        assertEquals(1, repository.loadCount)
        assertEquals(1, realtime.stopCount)

        controller.onForeground()

        assertEquals(2, repository.loadCount)
        assertEquals(2, realtime.startCount)
        assertEquals(WearScreenState.Today(day("2026-10-01")), controller.state)
    }

    @Test
    fun dayInvalidationReloadsOnlyCurrentDateAndBurstDuringFetchQueuesOneFollowUp() {
        val repository = FakeWearRepository()
        val realtime = FakeRealtimeClient()
        lateinit var controller: WearTodayController
        repository.onLoad = {
            if (repository.loadCount == 1) repeat(12) { controller.onDayInvalidation("2026-10-01") }
            WearLoadResult.Success(day("2026-10-01"))
        }
        controller = controller(repository, realtime)
        controller.onForeground()
        assertEquals(2, repository.loadCount)

        controller.onDayInvalidation("2026-09-30")
        assertEquals(2, repository.loadCount)
        controller.onDayInvalidation("2026-10-01")
        assertEquals(3, repository.loadCount)
    }

    @Test
    fun responseFromPreviousForegroundCannotOverwriteResumeRefresh() {
        val repository = FakeWearRepository()
        val realtime = FakeRealtimeClient()
        var complicationRefreshes = 0
        lateinit var controller: WearTodayController
        repository.onLoad = {
            if (repository.loadCount == 1) {
                controller.onBackground()
                controller.onForeground()
                WearLoadResult.Success(day("2026-09-30"))
            } else {
                WearLoadResult.Success(day("2026-10-01"))
            }
        }
        controller = controller(
            repository,
            realtime,
            onCanonicalRefreshAccepted = { _ -> complicationRefreshes += 1 },
        )

        controller.onForeground()

        assertEquals(2, repository.loadCount)
        assertEquals(WearScreenState.Today(day("2026-10-01")), controller.state)
        assertEquals(2, realtime.startCount)
        assertTrue(realtime.stopCount >= 1)
        assertEquals("only the accepted resume result requests complication refresh", 1, complicationRefreshes)
    }

    @Test
    fun realtimeUnauthorizedSignsOutAndClearsOnlyTheWatchSession() {
        val repository = FakeWearRepository()
        val realtime = FakeRealtimeClient()
        val events = mutableListOf<String>()
        repository.onClearSession = { events += "session-cleared" }
        val controller = controller(
            repository,
            realtime,
            onSessionInvalidated = { events += "projection-cleared" },
            onComplicationRefreshRequested = { events += "complication-refresh" },
        )
        controller.onForeground()

        controller.onRealtimeUnauthorized()

        assertEquals(WearScreenState.SignedOut, controller.state)
        assertEquals(1, repository.clearSessionCount)
        assertEquals(listOf("projection-cleared", "session-cleared", "complication-refresh"), events)
        assertTrue(realtime.stopCount >= 1)
    }

    @Test
    fun canonicalStartAndCompleteEachRequestComplicationRefreshOnce() {
        val repository = FakeWearRepository()
        val task = plannedTask()
        var refreshCount = 0
        repository.onLoad = {
            if (repository.loadCount == 1) {
                WearLoadResult.Success(day("2026-10-01").copy(unsectionedTasks = listOf(task)))
            } else {
                WearLoadResult.Success(runningDay(task))
            }
        }
        val controller = controller(
            repository,
            FakeRealtimeClient(),
            onCanonicalLifecycleReconciled = { _ -> refreshCount += 1 },
        )
        controller.onForeground()
        controller.start(task)

        assertEquals(1, refreshCount)

        repository.onLoad = { WearLoadResult.Success(completedDay(task.copy(lifecycle = WearLifecycle.COMPLETED))) }
        controller.complete()

        assertEquals(2, refreshCount)
    }

    @Test
    fun unconfirmedOrRejectedLifecycleMutationDoesNotRequestComplicationRefresh() {
        val repository = FakeWearRepository().apply { startResult = WearMutationResult.Rejected }
        val task = plannedTask()
        repository.onLoad = { WearLoadResult.Success(day("2026-10-01").copy(unsectionedTasks = listOf(task))) }
        var refreshCount = 0
        val controller = controller(
            repository,
            FakeRealtimeClient(),
            onCanonicalLifecycleReconciled = { _ -> refreshCount += 1 },
        )
        controller.onForeground()
        controller.start(task)
        assertEquals(0, refreshCount)

        val unauthorizedRepository = FakeWearRepository().apply {
            startResult = WearMutationResult.Unauthorized
            onLoad = { WearLoadResult.Success(day("2026-10-01").copy(unsectionedTasks = listOf(task))) }
        }
        val unauthorizedController = controller(
            unauthorizedRepository,
            FakeRealtimeClient(),
            onCanonicalLifecycleReconciled = { _ -> refreshCount += 1 },
        )
        unauthorizedController.onForeground()
        unauthorizedController.start(task)
        assertEquals(0, refreshCount)
    }

    @Test
    fun acceptedCanonicalRefreshRequestsComplicationRefreshOncePerAcceptedDay() {
        val repository = FakeWearRepository()
        var refreshes = 0
        val controller = controller(
            repository,
            FakeRealtimeClient(),
            onCanonicalRefreshAccepted = { _ -> refreshes += 1 },
        )

        controller.onForeground()
        assertEquals(1, repository.loadCount)
        assertEquals(1, refreshes)

        controller.onDayInvalidation("2026-10-01")

        assertEquals(2, repository.loadCount)
        assertEquals(2, refreshes)
    }

    @Test
    fun failedOrUnauthorizedCanonicalRefreshDoesNotRequestComplicationRefresh() {
        val failedRepository = FakeWearRepository().apply {
            onLoad = { WearLoadResult.Failure(ambiguous = false) }
        }
        var refreshes = 0
        val failedController = controller(
            failedRepository,
            FakeRealtimeClient(),
            onCanonicalRefreshAccepted = { _ -> refreshes += 1 },
        )

        failedController.onForeground()

        assertEquals(0, refreshes)
        assertTrue(failedController.state is WearScreenState.Error)

        val unauthorizedRepository = FakeWearRepository().apply {
            onLoad = { WearLoadResult.Unauthorized }
        }
        val unauthorizedController = controller(
            unauthorizedRepository,
            FakeRealtimeClient(),
            onCanonicalRefreshAccepted = { _ -> refreshes += 1 },
        )

        unauthorizedController.onForeground()

        assertEquals(0, refreshes)
        assertEquals(WearScreenState.SignedOut, unauthorizedController.state)
    }

    private fun controller(
        repository: FakeWearRepository,
        realtime: FakeRealtimeClient,
        onAuthenticated: () -> Unit = {},
        onCanonicalLifecycleReconciled: (WearDay) -> Unit = {},
        onCanonicalRefreshAccepted: (WearDay) -> Unit = {},
        onSessionInvalidated: () -> Unit = {},
        onComplicationRefreshRequested: () -> Unit = {},
    ) =
        WearTodayController(
            repository = repository,
            realtime = realtime,
            mainDispatcher = Dispatchers.Unconfined,
            ioDispatcher = Dispatchers.Unconfined,
            onCanonicalLifecycleReconciled = onCanonicalLifecycleReconciled,
            onAuthenticated = onAuthenticated,
            onCanonicalRefreshAccepted = onCanonicalRefreshAccepted,
            onSessionInvalidated = onSessionInvalidated,
            onComplicationRefreshRequested = onComplicationRefreshRequested,
        )

    private fun plannedTask() = WearTask(
        id = "task-1", title = "Task", lifecycle = WearLifecycle.PLANNED, estimateSeconds = 900,
        routineDerived = false, executionId = null, activeStartedAt = null, firstStartedAt = null,
        completedDurationSeconds = null,
    )

    private fun runningDay(task: WearTask) = day("2026-10-01").copy(
        unsectionedTasks = listOf(task.copy(lifecycle = WearLifecycle.RUNNING, executionId = "execution-1")),
        activeExecution = WearExecution("execution-1", task.id, "2026-10-01T10:00:00Z", task.estimateSeconds),
    )

    private fun completedDay(task: WearTask) = day("2026-10-01").copy(
        unsectionedTasks = listOf(task.copy(lifecycle = WearLifecycle.COMPLETED)),
    )

    private fun day(logicalDate: String) = WearDay(
        logicalDate = logicalDate,
        placementRevision = 3,
        sections = emptyList(),
        unsectionedTasks = emptyList(),
        activeExecution = null,
        startInstant = null,
        establishmentTimezone = "UTC",
    )

    private inner class FakeWearRepository : WearRepository {
        var restoreCount = 0
        var loadCount = 0
        var clearSessionCount = 0
        var startResult: WearMutationResult = WearMutationResult.Success
        var completeResult: WearMutationResult = WearMutationResult.Success
        var onLoad: () -> WearLoadResult = { WearLoadResult.Success(day("2026-10-01")) }
        var onClearSession: () -> Unit = {}

        override fun restoreSession(): WearAuthResult {
            restoreCount += 1
            return WearAuthResult.SignedIn
        }

        override fun exchangePairingGrant(requestId: String, nonce: String, grant: String) = WearAuthResult.SignedIn

        override fun loadToday(): WearLoadResult {
            loadCount += 1
            return onLoad()
        }

        override fun start(day: WearDay, task: WearTask) = startResult
        override fun complete(task: WearTask) = completeResult
        override fun clearSession() {
            clearSessionCount += 1
            onClearSession()
        }
    }

    private class FakeRealtimeClient : WearRealtimeClient {
        var startCount = 0
        var stopCount = 0
        override fun start() {
            startCount += 1
        }
        override fun stop() {
            stopCount += 1
        }
    }
}
