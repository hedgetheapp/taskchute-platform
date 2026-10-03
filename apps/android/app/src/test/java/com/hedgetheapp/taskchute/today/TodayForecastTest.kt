package com.hedgetheapp.taskchute.today

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayForecastTest {
    private val currentNow = Instant.parse("2026-09-14T09:00:00Z")

    @Test
    fun flexiblePlannedStartAccumulatesAndPlannedMinuteIsNotABarrier() {
        val first = task("first", LifecycleState.PLANNED, 600, 1_200)
        val second = task("second", LifecycleState.PLANNED, 1_200, 300)
        val result = calculateTodayStartForecast(day(listOf(first, second)), currentNow)
        assertEquals(540 to 550, result.entries[first.id]?.let { it.startMinute to it.endMinute })
        assertEquals(550 to 570, result.entries[second.id]?.let { it.startMinute to it.endMinute })
        assertFalse(result.entries[first.id]!!.fixedStart)
    }

    @Test
    fun fixedAnchorBeforeIncomingCursorShowsExactAnchorWithoutConflict() {
        val prior = task("prior", LifecycleState.PLANNED, 2_400, 0)
        val fixed = task("fixed", LifecycleState.PLANNED, 1_800, 1_200).copy(startReminderOffsetMinutes = 15)
        val result = calculateTodayStartForecast(day(listOf(prior, fixed)), currentNow)
        val forecast = result.entries[fixed.id]!!
        assertEquals(1_200, forecast.startMinute)
        assertEquals(1_230, forecast.endMinute)
        assertEquals(0L, forecast.conflictSeconds)
        assertTrue(forecast.fixedStart)
    }

    @Test
    fun lateFixedAnchorStaysPutAndResetsDownstreamCursor() {
        val prior = task("prior", LifecycleState.PLANNED, 40_320, 0)
        val fixed = task("fixed", LifecycleState.PLANNED, 1_800, 1_200).copy(startReminderOffsetMinutes = 0)
        val tail = task("tail", LifecycleState.PLANNED, 300, null)
        val result = calculateTodayStartForecast(day(listOf(prior, fixed, tail)), currentNow)
        assertEquals(1_200, result.entries[fixed.id]?.startMinute)
        assertEquals(1_230, result.entries[fixed.id]?.endMinute)
        assertEquals(720L, result.entries[fixed.id]?.conflictSeconds)
        assertEquals(1_230, result.entries[tail.id]?.startMinute)
        assertEquals(720L, result.sections["section"]?.overlapSeconds)
    }

    @Test
    fun reminderOffsetDoesNotMoveAnchorAndReminderOffRestoresFlexibleForecast() {
        val prior = task("prior", LifecycleState.PLANNED, 40_320, 0)
        val offsetZero = task("fixed", LifecycleState.PLANNED, 1_800, 1_200).copy(startReminderOffsetMinutes = 0)
        val offsetFifteen = offsetZero.copy(startReminderOffsetMinutes = 15)
        val zero = calculateTodayStartForecast(day(listOf(prior, offsetZero)), currentNow).entries[offsetZero.id]!!
        val fifteen = calculateTodayStartForecast(day(listOf(prior, offsetFifteen)), currentNow).entries[offsetFifteen.id]!!
        assertEquals(zero.startMinute, fifteen.startMinute)
        assertEquals(zero.endMinute, fifteen.endMinute)

        val flexible = calculateTodayStartForecast(day(listOf(prior, offsetZero.copy(startReminderOffsetMinutes = null))), currentNow)
            .entries[offsetZero.id]!!
        assertEquals(1_212, flexible.startMinute)
        assertFalse(flexible.fixedStart)
        assertEquals(0L, flexible.conflictSeconds)
    }

    @Test
    fun multipleFixedAnchorsAreProcessedInDisplayOrderAndMissingEstimateAddsNoHiddenTime() {
        val prior = task("prior", LifecycleState.PLANNED, 40_320, 0)
        val first = task("first-fixed", LifecycleState.PLANNED, 300, 1_200).copy(startReminderOffsetMinutes = 0)
        val second = task("second-fixed", LifecycleState.PLANNED, null, 1_195).copy(startReminderOffsetMinutes = 60)
        val tail = task("tail", LifecycleState.PLANNED, 60, null)
        val result = calculateTodayStartForecast(day(listOf(prior, first, second, tail)), currentNow)
        assertEquals(720L, result.entries[first.id]?.conflictSeconds)
        assertEquals(600L, result.entries[second.id]?.conflictSeconds)
        assertEquals(1_195, result.entries[second.id]?.startMinute)
        assertNull(result.entries[second.id]?.endMinute)
        assertEquals(1_195, result.entries[tail.id]?.startMinute)
        assertEquals(720L, result.sections["section"]?.overlapSeconds)
    }

    @Test
    fun extendedLogicalMinuteUsesEstablishmentTimezone() {
        val prior = task("prior", LifecycleState.PLANNED, 1_200, 1_380)
        val fixed = task("fixed", LifecycleState.PLANNED, 1_800, 1_440).copy(startReminderOffsetMinutes = 15)
        val tokyoDay = day(listOf(prior, fixed)).copy(
            establishmentTimezone = "Asia/Tokyo",
            logicalDate = "2026-09-14",
        )
        val forecast = calculateTodayStartForecast(tokyoDay, Instant.parse("2026-09-14T14:40:00Z")).entries[fixed.id]!!
        assertEquals(1_440, forecast.startMinute)
        assertEquals(1_470, forecast.endMinute)
        assertEquals(0L, forecast.conflictSeconds)
    }

    @Test
    fun malformedReminderMarkerWithoutPlannedStartFallsBackToFlexibleForecast() {
        val first = task("first", LifecycleState.PLANNED, 600, 1_200)
        val malformed = task("malformed", LifecycleState.PLANNED, 300, null).copy(startReminderOffsetMinutes = 15)
        val outOfRange = task("range", LifecycleState.PLANNED, 300, 2_880).copy(startReminderOffsetMinutes = 15)
        val result = calculateTodayStartForecast(day(listOf(first, malformed, outOfRange)), currentNow)
        assertEquals(550, result.entries[malformed.id]?.startMinute)
        assertFalse(result.entries[malformed.id]!!.fixedStart)
        assertEquals(555, result.entries[outOfRange.id]?.startMinute)
        assertFalse(result.entries[outOfRange.id]!!.fixedStart)
        assertTrue(result.sections["section"]?.hasOverlap != true)
    }

    @Test
    fun sectionWarningUsesMaximumOverlapAndComputesIndependentOverflow() {
        val prior = task("prior", LifecycleState.PLANNED, 40_320, 0)
        val fixed = task("fixed", LifecycleState.PLANNED, 1_800, 1_200).copy(startReminderOffsetMinutes = 0)
        val secondFixed = task("second", LifecycleState.PLANNED, 600, 1_225).copy(startReminderOffsetMinutes = 0)
        val day = day(listOf(prior, fixed, secondFixed)).copy(
            sections = listOf(TodaySection("section", "Section", 0, 1_215, listOf(prior, fixed, secondFixed))),
        )
        val warning = calculateTodayStartForecast(day, currentNow).sections["section"]!!
        assertEquals(720L, warning.overlapSeconds)
        assertEquals(1_200L, warning.overflowSeconds)
        assertTrue(warning.hasOverlap)
        assertTrue(warning.hasOverflow)
    }

    @Test
    fun noConflictOrOverflowAndMissingSectionEndDoNotCreateWarnings() {
        val first = task("first", LifecycleState.PLANNED, 600, 0)
        val day = day(listOf(first))
        assertEquals(emptyMap<String, SectionForecastWarning>(), calculateTodayStartForecast(day, currentNow).sections)
        val noEnd = day.copy(sections = listOf(TodaySection("section", "Section", 0, null, listOf(first))))
        assertEquals(emptyMap<String, SectionForecastWarning>(), calculateTodayStartForecast(noEnd, currentNow).sections)
    }

    @Test
    fun unsectionedPlannedEntriesDoNotReceiveForecastOrTimedSectionOverflow() {
        val task = task("plain", LifecycleState.PLANNED, 86_400, 480)
        val day = day(emptyList()).copy(unsectionedEntries = listOf(task))
        val result = calculateTodayStartForecast(day, currentNow)
        assertNull(result.entries[task.id])
        assertEquals(emptyMap<String, SectionForecastWarning>(), result.sections)
    }

    @Test
    fun runningAndCompletedKeepTheirExistingActualProjectionSemantics() {
        val running = task("running", LifecycleState.RUNNING, 1_800, 540).copy(
            activeStartedAt = "2026-09-14T19:05:00Z", firstStartedAt = "2026-09-14T19:05:00Z",
        )
        val completed = task("completed", LifecycleState.COMPLETED, 1_200, 480).copy(
            firstStartedAt = "2026-09-14T04:58:00Z", lastEndedAt = "2026-09-14T05:34:00Z",
        )
        val runningForecast = calculateTodayStartForecast(day(listOf(running)), currentNow).entries[running.id]!!
        val completedForecast = calculateTodayStartForecast(day(listOf(completed)).copy(establishmentTimezone = "Asia/Tokyo"), currentNow).entries[completed.id]!!
        assertEquals(1_145 to 1_175, runningForecast.startMinute to runningForecast.endMinute)
        assertEquals(838 to 874, completedForecast.startMinute to completedForecast.endMinute)
        assertFalse(runningForecast.fixedStart)
        assertFalse(completedForecast.fixedStart)
    }

    @Test
    fun currentActiveRunningRemainingEstimateBeginsThePlannedCursor() {
        val running = task("running", LifecycleState.RUNNING, 1_800, 540)
        val first = task("first", LifecycleState.PLANNED, 1_800, 1_380)
        val second = task("second", LifecycleState.PLANNED, 600, 1_440)
        val day = day(listOf(running, first, second)).copy(
            activeExecution = TodayExecution("execution", "running", "2026-09-14T10:00:00Z", 1_800),
        )
        val forecasts = calculateTodayStartForecast(day, Instant.parse("2026-09-14T10:10:00Z")).entries
        assertEquals(630 to 660, forecasts[first.id]?.let { it.startMinute to it.endMinute })
        assertEquals(660 to 670, forecasts[second.id]?.let { it.startMinute to it.endMinute })
    }

    @Test
    fun futureDayUsesCanonicalDayStartAndOrdinaryForecastIgnoresPlannedStart() {
        val first = task("first", LifecycleState.PLANNED, 1_800, 1_380)
        val second = task("second", LifecycleState.PLANNED, 600, 1_440)
        val day = day(listOf(first, second)).copy(
            logicalDate = "2026-09-15", isCurrent = false,
            startInstant = "2026-09-15T00:00:00Z", activeExecution = null,
        )
        val forecasts = calculateTodayStartForecast(day, Instant.parse("2026-09-15T12:00:00Z")).entries
        assertEquals(0 to 30, forecasts[first.id]?.let { it.startMinute to it.endMinute })
        assertEquals(30 to 40, forecasts[second.id]?.let { it.startMinute to it.endMinute })
    }

    @Test
    fun futureDayDoesNotApplyCurrentActiveExecutionRemainingTime() {
        val running = task("running", LifecycleState.RUNNING, 1_800, 540)
        val planned = task("planned", LifecycleState.PLANNED, 600, 600)
        val future = day(listOf(running, planned)).copy(
            logicalDate = "2026-09-15", isCurrent = false,
            startInstant = "2026-09-15T00:00:00Z",
            activeExecution = TodayExecution("execution", running.id, "2026-09-14T10:00:00Z", 1_800),
        )

        val forecast = calculateTodayStartForecast(future, Instant.parse("2026-09-15T12:00:00Z")).entries[planned.id]

        assertEquals(0 to 10, forecast?.let { it.startMinute to it.endMinute })
    }

    @Test
    fun conflictDisplayMinutesRoundPositiveSecondsUp() {
        assertEquals(0L, conflictMinutesCeiling(0))
        assertEquals(1L, conflictMinutesCeiling(1))
        assertEquals(1L, conflictMinutesCeiling(60))
        assertEquals(2L, conflictMinutesCeiling(61))
    }

    private fun day(entries: List<TodayTask>) = TodayDay(
        logicalDate = "2026-09-14",
        isCurrent = true,
        planningEnabled = true,
        placementRevision = 1,
        sections = listOf(TodaySection("section", "Section", 0, 1_440, entries)),
        unsectionedEntries = emptyList(),
        activeExecution = null,
        taskChuteDayId = "day",
        startInstant = "2026-09-14T00:00:00Z",
        establishmentTimezone = "UTC",
        establishmentBoundaryMinutes = 0,
    )

    private fun task(id: String, lifecycle: LifecycleState, estimateSeconds: Int?, plannedStartMinute: Int?) = TodayTask(
        id = id,
        title = id,
        lifecycleState = lifecycle,
        project = null,
        mode = null,
        estimateSeconds = estimateSeconds,
        plannedStartMinute = plannedStartMinute,
        executionId = null,
        activeStartedAt = null,
        taskId = "task-$id",
    )
}
