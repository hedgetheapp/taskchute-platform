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
        controller = controller(repository, realtime)

        controller.onForeground()

        assertEquals(2, repository.loadCount)
        assertEquals(WearScreenState.Today(day("2026-10-01")), controller.state)
        assertEquals(2, realtime.startCount)
        assertTrue(realtime.stopCount >= 1)
    }

    @Test
    fun realtimeUnauthorizedSignsOutAndClearsOnlyTheWatchSession() {
        val repository = FakeWearRepository()
        val realtime = FakeRealtimeClient()
        val controller = controller(repository, realtime)
        controller.onForeground()

        controller.onRealtimeUnauthorized()

        assertEquals(WearScreenState.SignedOut, controller.state)
        assertEquals(1, repository.clearSessionCount)
        assertTrue(realtime.stopCount >= 1)
    }

    private fun controller(repository: FakeWearRepository, realtime: FakeRealtimeClient) =
        WearTodayController(
            repository = repository,
            realtime = realtime,
            mainDispatcher = Dispatchers.Unconfined,
            ioDispatcher = Dispatchers.Unconfined,
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
        var onLoad: () -> WearLoadResult = { WearLoadResult.Success(day("2026-10-01")) }

        override fun restoreSession(): WearAuthResult {
            restoreCount += 1
            return WearAuthResult.SignedIn
        }

        override fun exchangePairingGrant(requestId: String, nonce: String, grant: String) = WearAuthResult.SignedIn

        override fun loadToday(): WearLoadResult {
            loadCount += 1
            return onLoad()
        }

        override fun start(day: WearDay, task: WearTask) = WearMutationResult.Success
        override fun complete(task: WearTask) = WearMutationResult.Success
        override fun clearSession() {
            clearSessionCount += 1
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
