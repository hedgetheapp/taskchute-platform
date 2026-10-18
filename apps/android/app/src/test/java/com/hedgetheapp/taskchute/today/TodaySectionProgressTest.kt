package com.hedgetheapp.taskchute.today

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TodaySectionProgressTest {
    private val now = Instant.parse("2026-10-18T12:00:00Z")

    @Test
    fun countsCompletedEntriesOverCurrentlyAssignedEntriesAndDeduplicatesRoutineIdentity() {
        val completed = task("done", LifecycleState.COMPLETED, estimateSeconds = null)
        val routine = task("routine-occurrence", LifecycleState.PLANNED, estimateSeconds = null).copy(routineDerived = true)
        val running = task("running", LifecycleState.RUNNING, estimateSeconds = 3_600)
        val section = section(completed, routine, running, routine.copy(title = "duplicate projection"))

        val progress = calculateTodaySectionProgress(
            section,
            TodayExecution("execution", running.id, now.minusSeconds(600).toString(), 3_600),
            now,
        )

        assertEquals(1, progress.completedCount)
        assertEquals(3, progress.totalCount)
        assertEquals(1f / 3f, progress.completedFraction, 0.0001f)
        assertEquals(3_000L, progress.remainingSeconds)
        assertTrue(progress.hasUnknownRemaining)
    }

    @Test
    fun emptyAndAllCompletedSectionsHaveEmptyOrCompleteCountWithoutRemainingWork() {
        val empty = calculateTodaySectionProgress(section(), null, now)
        assertEquals(0, empty.completedCount)
        assertEquals(0, empty.totalCount)
        assertEquals(0f, empty.completedFraction)

        val completed = calculateTodaySectionProgress(
            section(
                task("done-1", LifecycleState.COMPLETED, estimateSeconds = null),
                task("done-2", LifecycleState.COMPLETED, estimateSeconds = 900),
            ),
            null,
            now,
        )
        assertEquals(2, completed.completedCount)
        assertEquals(2, completed.totalCount)
        assertEquals(1f, completed.completedFraction)
        assertEquals(0L, completed.remainingSeconds)
        assertFalse(completed.hasUnknownRemaining)
    }

    @Test
    fun runningRemainsIncompleteWhileRemainingEstimateDecreasesAndClampsAtZero() {
        val running = task("running", LifecycleState.RUNNING, estimateSeconds = 1_800)
        val section = section(running)
        val execution = TodayExecution("execution", running.id, now.minusSeconds(195).toString(), 1_800)

        val beforeEstimate = calculateTodaySectionProgress(section, execution, now)
        assertEquals(0, beforeEstimate.completedCount)
        assertEquals(1, beforeEstimate.totalCount)
        assertEquals(0f, beforeEstimate.completedFraction)
        assertEquals(1_605L, beforeEstimate.remainingSeconds)

        val afterEstimate = calculateTodaySectionProgress(section, execution, now.plusSeconds(2_000))
        assertEquals(0, afterEstimate.completedCount)
        assertEquals(0L, afterEstimate.remainingSeconds)
        assertFalse(afterEstimate.hasUnknownRemaining)
    }

    @Test
    fun plannedAndRunningKnownEstimatesSumAndCompletedEstimateDoesNotContribute() {
        val planned = task("planned", LifecycleState.PLANNED, estimateSeconds = 1_800)
        val running = task("running", LifecycleState.RUNNING, estimateSeconds = 1_800)
        val completed = task("completed", LifecycleState.COMPLETED, estimateSeconds = null)
        val progress = calculateTodaySectionProgress(
            section(planned, running, completed),
            TodayExecution("execution", running.id, now.minusSeconds(195).toString(), 1_800),
            now,
        )

        assertEquals(3_405L, progress.remainingSeconds)
        assertFalse(progress.hasUnknownRemaining)
        assertEquals("57m", formatTodaySectionRemainingWorkload(progress.remainingSeconds, progress.hasUnknownRemaining))
    }

    @Test
    fun unknownEstimateKeepsKnownSubtotalAndMarksEvenZeroAsUnknown() {
        val known = task("known", LifecycleState.PLANNED, estimateSeconds = 2_400)
        val unknown = task("unknown", LifecycleState.PLANNED, estimateSeconds = null)
        val knownAndUnknown = calculateTodaySectionProgress(section(known, unknown), null, now)
        assertEquals(2_400L, knownAndUnknown.remainingSeconds)
        assertEquals("40m+", formatTodaySectionRemainingWorkload(knownAndUnknown.remainingSeconds, true))

        val onlyUnknown = calculateTodaySectionProgress(section(unknown), null, now)
        assertEquals(0L, onlyUnknown.remainingSeconds)
        assertEquals("0m+", formatTodaySectionRemainingWorkload(onlyUnknown.remainingSeconds, true))
    }

    @Test
    fun runningEstimateWithoutItsActiveExecutionIsUnknownRatherThanAFalseFullEstimate() {
        val running = task("running", LifecycleState.RUNNING, estimateSeconds = 3_600)
        val unrelated = TodayExecution("other-execution", "other-entry", now.minusSeconds(900).toString(), 300)

        val progress = calculateTodaySectionProgress(section(running), unrelated, now)

        assertEquals(0, progress.completedCount)
        assertEquals(0L, progress.remainingSeconds)
        assertTrue(progress.hasUnknownRemaining)
    }

    @Test
    fun moveAndDeleteAreReflectedFromTheCurrentSectionProjectionOnly() {
        val moved = task("moved", LifecycleState.PLANNED, estimateSeconds = 1_200).copy(routineDerived = true)
        val stays = task("stays", LifecycleState.COMPLETED, estimateSeconds = 900)
        val source = section(moved, stays)
        val target = section(moved)

        assertEquals(2, calculateTodaySectionProgress(source, null, now).totalCount)
        assertEquals(1, calculateTodaySectionProgress(target, null, now).totalCount)
        assertEquals(1, calculateTodaySectionProgress(source.copy(entries = listOf(stays)), null, now).totalCount)
        assertEquals(0, calculateTodaySectionProgress(target.copy(entries = emptyList()), null, now).totalCount)
    }

    @Test
    fun elapsedUsesExactInstantsAcrossTimezoneOffsetChanges() {
        val running = task("running", LifecycleState.RUNNING, estimateSeconds = 7_200)
        val execution = TodayExecution("execution", running.id, "2026-03-08T06:30:00Z", 7_200)
        val afterDaylightSavingTransition = Instant.parse("2026-03-08T07:30:00Z")

        val progress = calculateTodaySectionProgress(section(running), execution, afterDaylightSavingTransition)

        assertEquals(3_600L, progress.remainingSeconds)
        assertEquals("1h00m", formatTodaySectionRemainingWorkload(progress.remainingSeconds, false))
    }

    @Test
    fun durationFormattingNeverShowsNegativeOrDropsPositivePartialMinutesToZero() {
        assertEquals("40m", formatTodaySectionRemainingWorkload(2_400, false))
        assertEquals("1h20m", formatTodaySectionRemainingWorkload(4_800, false))
        assertEquals("1h00m", formatTodaySectionRemainingWorkload(3_600, false))
        assertEquals("1m", formatTodaySectionRemainingWorkload(1, false))
        assertEquals("0m", formatTodaySectionRemainingWorkload(0, false))
        assertEquals("0m", formatTodaySectionRemainingWorkload(-30, false))
    }

    private fun section(vararg entries: TodayTask) = TodaySection(
        id = "section",
        title = "Section",
        startMinute = 540,
        endMinute = 720,
        entries = entries.toList(),
    )

    private fun task(id: String, state: LifecycleState, estimateSeconds: Int?) = TodayTask(
        id = id,
        title = id,
        lifecycleState = state,
        project = null,
        mode = null,
        estimateSeconds = estimateSeconds,
        plannedStartMinute = null,
        executionId = null,
        activeStartedAt = null,
    )
}
