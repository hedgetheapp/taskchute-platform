package com.hedgetheapp.taskchute.wear

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WearComplicationPresentationTest {
    private val now = Instant.parse("2026-10-02T10:18:00Z")

    @Test
    fun runningWithEstimateReportsElapsedAndTarget() {
        val result = running(startedAt = "2026-10-02T10:00:00Z", estimate = 1_800)
        assertEquals(1_080L, result.elapsedSeconds)
        assertEquals(1_800, result.estimateSeconds)
        assertEquals("18/30", result.compactText)
        assertEquals(
            WearComplicationPayloadKind.GOAL_PROGRESS,
            wearComplicationPayloadKind(WearComplicationRequestedType.GOAL_PROGRESS, result),
        )
        assertFalse(result.overrun)
        assertTrue(result.contentDescription.contains("集中作業"))
    }

    @Test
    fun compactProgressAdvancesAtMinuteBoundariesWithoutRefetching() {
        val start = Instant.parse("2026-10-02T10:00:00Z")
        val estimate = 3_600
        assertEquals("0/60", wearProgressText(start, estimate, start.plusSeconds(59)))
        assertEquals("1/60", wearProgressText(start, estimate, start.plusSeconds(60)))
        assertEquals("59/60", wearProgressText(start, estimate, start.plusSeconds(3_599)))
        assertEquals("60/60", wearProgressText(start, estimate, start.plusSeconds(3_600)))
        assertEquals("61/60", wearProgressText(start, estimate, start.plusSeconds(3_660)))
        assertEquals("0/60", wearProgressText(start, estimate, start.minusSeconds(10)))
    }

    @Test
    fun exactEstimateIsNotReportedAsOverrun() {
        val result = running(startedAt = "2026-10-02T09:30:00Z", estimate = 2_880)
        assertEquals(2_880L, result.elapsedSeconds)
        assertEquals("48/48", result.compactText)
        assertFalse(result.overrun)
        assertFalse(result.contentDescription.contains("見積超過"))
    }

    @Test
    fun overrunKeepsElapsedBeyondGoalAndDescribesOverrun() {
        val result = running(startedAt = "2026-10-02T09:42:00Z", estimate = 1_800)
        assertEquals(2_160L, result.elapsedSeconds)
        assertEquals(1_800, result.estimateSeconds)
        assertTrue(result.elapsedSeconds > result.estimateSeconds!!)
        assertEquals("36/30", result.compactText)
        assertTrue(result.overrun)
        assertTrue(result.contentDescription.contains("見積超過"))
    }

    @Test
    fun missingEstimateHasElapsedOnlyAndNeverOffersGoalProgress() {
        val result = running(startedAt = "2026-10-02T10:00:00Z", estimate = null)
        assertEquals("18m", result.compactText)
        assertEquals(null, result.estimateSeconds)
        assertEquals(
            WearComplicationPayloadKind.NO_DATA,
            wearComplicationPayloadKind(WearComplicationRequestedType.GOAL_PROGRESS, result),
        )
        assertEquals("集中作業、経過 18分", result.contentDescription)
    }

    @Test
    fun signedInWithoutRunningTaskIsIdle() {
        assertEquals(
            WearComplicationPresentation.Idle,
            wearComplicationPresentation(WearAuthResult.SignedIn, WearLoadResult.Success(day()), now),
        )
    }

    @Test
    fun signedOutShowsLoginState() {
        assertEquals(
            WearComplicationPresentation.SignedOut,
            wearComplicationPresentation(WearAuthResult.SignedOut, now = now),
        )
    }

    @Test
    fun transientLoadFailureNeverFabricatesRunningState() {
        assertEquals(
            WearComplicationPresentation.Unavailable,
            wearComplicationPresentation(
                WearAuthResult.SignedIn,
                WearLoadResult.Failure(ambiguous = true),
                now,
            ),
        )
        assertEquals(
            WearComplicationPresentation.Unavailable,
            wearComplicationPresentation(WearAuthResult.TransientFailure, now = now),
        )
    }

    @Test
    fun unauthorizedAfterSessionRestoreShowsLoginState() {
        assertEquals(
            WearComplicationPresentation.SignedOut,
            wearComplicationPresentation(WearAuthResult.SignedIn, WearLoadResult.Unauthorized, now),
        )
    }

    @Test
    fun transientCanonicalFailureRetainsLastKnownGoodAndRecomputesElapsedProgress() {
        val cached = snapshot("古い表示")

        val resolution = resolveWearComplication(
            WearAuthResult.SignedIn,
            WearLoadResult.Failure(ambiguous = true),
            now,
            cached,
        )

        val running = resolution.presentation as WearComplicationPresentation.Running
        assertEquals("古い表示", running.taskTitle)
        assertEquals(1_080L, running.elapsedSeconds)
        assertEquals("18/30", running.compactText)
        assertEquals(WearComplicationCacheChange.Keep, resolution.cacheChange)
    }

    @Test
    fun transientSessionValidationFailureMayUseLastKnownGoodButSignedOutMayNot() {
        val cached = snapshot("作業")
        val transient = resolveWearComplication(WearAuthResult.TransientFailure, null, now, cached)
        assertTrue(transient.presentation is WearComplicationPresentation.Running)
        assertEquals(WearComplicationCacheChange.Keep, transient.cacheChange)

        val signedOut = resolveWearComplication(WearAuthResult.SignedOut, null, now, cached)
        assertEquals(WearComplicationPresentation.SignedOut, signedOut.presentation)
        assertEquals(WearComplicationCacheChange.Clear, signedOut.cacheChange)

        val unauthorized = resolveWearComplication(
            WearAuthResult.SignedIn,
            WearLoadResult.Unauthorized,
            now,
            cached,
        )
        assertEquals(WearComplicationPresentation.SignedOut, unauthorized.presentation)
        assertEquals(WearComplicationCacheChange.Clear, unauthorized.cacheChange)
    }

    @Test
    fun canonicalRunningReplacesCachedIdentityAndCanonicalIdleClearsIt() {
        val newTask = task(WearLifecycle.RUNNING, 2_400).copy(id = "task-2", title = "新しい作業")
        val dayWithNewRun = day().copy(
            unsectionedTasks = listOf(newTask),
            activeExecution = WearExecution("execution-2", "task-2", "2026-10-02T10:12:00Z", 2_400),
        )
        val running = resolveWearComplication(
            WearAuthResult.SignedIn,
            WearLoadResult.Success(dayWithNewRun),
            now,
            snapshot("古い作業"),
        )
        assertEquals("新しい作業", (running.presentation as WearComplicationPresentation.Running).taskTitle)
        assertEquals(
            WearRunningProjectionSnapshot("新しい作業", Instant.parse("2026-10-02T10:12:00Z"), 2_400),
            (running.cacheChange as WearComplicationCacheChange.Save).snapshot,
        )

        val idle = resolveWearComplication(
            WearAuthResult.SignedIn,
            WearLoadResult.Success(day()),
            now,
            snapshot("古い作業"),
        )
        assertEquals(WearComplicationPresentation.Idle, idle.presentation)
        assertEquals(WearComplicationCacheChange.Clear, idle.cacheChange)
    }

    @Test
    fun successfulInvalidationRefetchSurvivesRedundantTransientComplicationFetch() {
        val canonicalDay = day().copy(
            sections = listOf(WearSection("section", "午前", 0, 720, listOf(task(WearLifecycle.RUNNING, 1_800)))),
            activeExecution = WearExecution("execution-1", "task-1", "2026-10-02T10:00:00Z", 1_800),
        )
        val store = MemoryProjectionStore()
        resolveWearComplication(
            WearAuthResult.SignedIn,
            WearLoadResult.Success(canonicalDay),
            now,
            store.load(),
        ).persistCache(store)

        val subsequentProviderFailure = resolveWearComplication(
            WearAuthResult.SignedIn,
            WearLoadResult.Failure(ambiguous = true),
            now.plusSeconds(60),
            store.load(),
        )

        assertEquals("19/30", (subsequentProviderFailure.presentation as WearComplicationPresentation.Running).compactText)
        assertEquals(WearComplicationCacheChange.Keep, subsequentProviderFailure.cacheChange)
    }

    @Test
    fun deterministicFailureDoesNotRenderStaleFallbackAndMalformedSuccessDoesNotClearIt() {
        val cached = snapshot("作業")
        val rejected = resolveWearComplication(
            WearAuthResult.SignedIn,
            WearLoadResult.Failure(ambiguous = false),
            now,
            cached,
        )
        assertEquals(WearComplicationPresentation.Unavailable, rejected.presentation)
        assertEquals(WearComplicationCacheChange.Keep, rejected.cacheChange)

        val malformed = day().copy(activeExecution = WearExecution("execution", "missing", "invalid", null))
        val invalidSuccess = resolveWearComplication(
            WearAuthResult.SignedIn,
            WearLoadResult.Success(malformed),
            now,
            cached,
        )
        assertEquals(WearComplicationPresentation.Unavailable, invalidSuccess.presentation)
        assertEquals(WearComplicationCacheChange.Keep, invalidSuccess.cacheChange)
    }

    @Test
    fun encryptedStoreCodecRoundTripsAndRejectsCorruptOrInvalidSnapshots() {
        val snapshot = snapshot("安全な表示")
        val encoded = requireNotNull(WearRunningProjectionCodec.encode(snapshot))
        assertEquals(snapshot, WearRunningProjectionCodec.decode(encoded))
        assertNull(WearRunningProjectionCodec.decode(encoded + byteArrayOf(1)))
        assertNull(WearRunningProjectionCodec.encode(snapshot.copy(estimateSeconds = 0)))
    }

    @Test
    fun unsupportedAndWrongGoalRequestsFailSafely() {
        val idle = WearComplicationPresentation.Idle
        assertEquals(
            WearComplicationPayloadKind.NO_DATA,
            wearComplicationPayloadKind(WearComplicationRequestedType.UNSUPPORTED, idle),
        )
        assertEquals(
            WearComplicationPayloadKind.NO_DATA,
            wearComplicationPayloadKind(WearComplicationRequestedType.GOAL_PROGRESS, idle),
        )
        assertEquals(
            WearComplicationPayloadKind.TEXT,
            wearComplicationPayloadKind(WearComplicationRequestedType.SHORT_TEXT, idle),
        )
        for (presentation in listOf(
            WearComplicationPresentation.Idle,
            WearComplicationPresentation.SignedOut,
            WearComplicationPresentation.Unavailable,
        )) {
            assertEquals(WearComplicationPayloadKind.TEXT,
                wearComplicationPayloadKind(WearComplicationRequestedType.LONG_TEXT, presentation))
            assertEquals(WearComplicationPayloadKind.TEXT,
                wearComplicationPayloadKind(WearComplicationRequestedType.SHORT_TEXT, presentation))
            assertEquals(WearComplicationPayloadKind.NO_DATA,
                wearComplicationPayloadKind(WearComplicationRequestedType.GOAL_PROGRESS, presentation))
        }
        assertEquals("待機", wearComplicationTextFallback(WearComplicationRequestedType.SHORT_TEXT, idle)?.text)
        assertEquals("TaskChute 待機", wearComplicationTextFallback(WearComplicationRequestedType.LONG_TEXT, idle)?.text)
        assertEquals("ログイン", wearComplicationTextFallback(WearComplicationRequestedType.SHORT_TEXT, WearComplicationPresentation.SignedOut)?.text)
        assertEquals("ログイン", wearComplicationTextFallback(WearComplicationRequestedType.LONG_TEXT, WearComplicationPresentation.SignedOut)?.text)
        assertEquals("未取得", wearComplicationTextFallback(WearComplicationRequestedType.SHORT_TEXT, WearComplicationPresentation.Unavailable)?.text)
        assertEquals("未取得", wearComplicationTextFallback(WearComplicationRequestedType.LONG_TEXT, WearComplicationPresentation.Unavailable)?.text)
    }

    @Test
    fun tapTargetsExistingWearActivityAndPresentationContainsNoSessionMaterial() {
        val result = running(
            startedAt = "2026-10-02T10:00:00Z",
            estimate = 1_800,
        )
        assertEquals(WearMainActivity::class.java.name, wearComplicationTapTargetClassName())
        assertFalse(result.compactText.contains("private-cookie"))
        assertFalse(result.contentDescription.contains("private-cookie"))
        assertFalse(result.contentDescription.contains("session="))
    }

    @Test
    fun malformedCanonicalRunningIdentityIsUnavailable() {
        val malformedDay = day().copy(
            sections = listOf(WearSection("s", "S", 0, 1_440, listOf(task(WearLifecycle.RUNNING, 1_800)))),
            activeExecution = WearExecution("x", "task-1", "not-an-instant", 1_800),
        )
        assertEquals(
            WearComplicationPresentation.Unavailable,
            wearComplicationPresentation(WearAuthResult.SignedIn, WearLoadResult.Success(malformedDay), now),
        )
    }

    @Test
    fun activeExecutionMustResolveToMatchingRunningEntry() {
        val task = task(WearLifecycle.RUNNING, 1_800)
        val mismatchedDay = day().copy(
            unsectionedTasks = listOf(task),
            activeExecution = WearExecution("execution-1", "different-entry", "2026-10-02T10:00:00Z", 1_800),
        )

        assertEquals(
            WearComplicationPresentation.Unavailable,
            wearComplicationPresentation(WearAuthResult.SignedIn, WearLoadResult.Success(mismatchedDay), now),
        )
    }

    private fun running(startedAt: String, estimate: Int?, title: String = "集中作業"): WearComplicationPresentation.Running {
        val task = task(WearLifecycle.RUNNING, estimate).copy(title = title)
        val day = day().copy(
            sections = listOf(WearSection("s", "S", 0, 1_440, listOf(task))),
            activeExecution = WearExecution("execution-1", task.id, startedAt, estimate),
        )
        return wearComplicationPresentation(WearAuthResult.SignedIn, WearLoadResult.Success(day), now)
            as WearComplicationPresentation.Running
    }

    private fun snapshot(title: String) = WearRunningProjectionSnapshot(
        taskTitle = title,
        startedAt = Instant.parse("2026-10-02T10:00:00Z"),
        estimateSeconds = 1_800,
    )

    private class MemoryProjectionStore : WearRunningProjectionStore {
        private var value: WearRunningProjectionSnapshot? = null
        override fun load() = value
        override fun save(snapshot: WearRunningProjectionSnapshot): Boolean {
            value = snapshot
            return true
        }
        override fun clear() { value = null }
    }

    private fun day() = WearDay("2026-10-02", 1, emptyList(), emptyList(), null, null, "UTC")

    private fun task(lifecycle: WearLifecycle, estimate: Int?) = WearTask(
        id = "task-1",
        title = "集中作業",
        lifecycle = lifecycle,
        estimateSeconds = estimate,
        routineDerived = false,
        executionId = "execution-1",
        activeStartedAt = null,
        firstStartedAt = null,
        completedDurationSeconds = null,
    )
}
