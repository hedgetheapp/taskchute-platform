package com.hedgetheapp.taskchute.wear

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    private fun running(startedAt: String, estimate: Int?, title: String = "集中作業"): WearComplicationPresentation.Running {
        val task = task(WearLifecycle.RUNNING, estimate).copy(title = title)
        val day = day().copy(
            sections = listOf(WearSection("s", "S", 0, 1_440, listOf(task))),
            activeExecution = WearExecution("execution-1", task.id, startedAt, estimate),
        )
        return wearComplicationPresentation(WearAuthResult.SignedIn, WearLoadResult.Success(day), now)
            as WearComplicationPresentation.Running
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
