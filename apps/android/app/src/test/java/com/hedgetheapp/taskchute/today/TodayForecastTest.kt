package com.hedgetheapp.taskchute.today

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test

class TodayForecastTest {
    @Test
    fun runningForecastUsesCanonicalActualStartAndFullEstimate() {
        val running = task("running", LifecycleState.RUNNING, estimateSeconds = 1_800, plannedStartMinute = 540).copy(
            activeStartedAt = "2026-09-14T19:05:00Z",
            firstStartedAt = "2026-09-14T19:05:00Z",
        )

        assertEquals(1_145 to 1_175, forecastForTask(day(listOf(running)), running, Instant.parse("2026-09-14T20:00:00Z")))
    }

    @Test
    fun runningForecastShowsStartWithoutEndWhenEstimateIsMissing() {
        val running = task("running", LifecycleState.RUNNING, estimateSeconds = null, plannedStartMinute = 540).copy(
            activeStartedAt = "2026-09-14T19:05:00Z",
            firstStartedAt = "2026-09-14T19:05:00Z",
        )

        assertEquals(1_145 to null, forecastForTask(day(listOf(running)), running))
    }

    @Test
    fun completedProjectionUsesActualStartAndEndInEstablishmentTimezone() {
        val completed = task("completed", LifecycleState.COMPLETED, estimateSeconds = 1_200, plannedStartMinute = 480).copy(
            firstStartedAt = "2026-09-14T04:58:00Z",
            lastEndedAt = "2026-09-14T05:34:00Z",
        )

        assertEquals(838 to 874, forecastForTask(day(listOf(completed)).copy(establishmentTimezone = "Asia/Tokyo"), completed, Instant.parse("2026-09-14T12:00:00Z")))
    }
    @Test
    fun currentRunningRemainingEstimateIsTheForecastCursor() {
        val running = task("running", LifecycleState.RUNNING, estimateSeconds = 1_800, plannedStartMinute = 540)
        val first = task("first", LifecycleState.PLANNED, estimateSeconds = 1_800, plannedStartMinute = 1_380)
        val second = task("second", LifecycleState.PLANNED, estimateSeconds = 600, plannedStartMinute = 1_440)
        val day = day(listOf(running, first, second)).copy(
            activeExecution = TodayExecution("execution", "running", "2026-09-14T10:00:00Z", 1_800),
        )

        assertEquals(630 to 660, forecastForTask(day, first, Instant.parse("2026-09-14T10:10:00Z")))
        assertEquals(660 to 670, forecastForTask(day, second, Instant.parse("2026-09-14T10:10:00Z")))
    }

    @Test
    fun futureForecastUsesDayStartAndIgnoresPlannedStartBarrier() {
        val first = task("first", LifecycleState.PLANNED, estimateSeconds = 1_800, plannedStartMinute = 1_380)
        val second = task("second", LifecycleState.PLANNED, estimateSeconds = 600, plannedStartMinute = 1_440)
        val day = day(listOf(first, second)).copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            startInstant = "2026-09-15T00:00:00Z",
            activeExecution = null,
        )

        assertEquals(0 to 30, forecastForTask(day, first, Instant.parse("2026-09-15T12:00:00Z")))
        assertEquals(30 to 40, forecastForTask(day, second, Instant.parse("2026-09-15T12:00:00Z")))
    }

    private fun day(entries: List<TodayTask>) = TodayDay(
        logicalDate = "2026-09-14",
        isCurrent = true,
        planningEnabled = true,
        placementRevision = 1,
        sections = listOf(TodaySection("section", "Section", 0, 1440, entries)),
        unsectionedEntries = emptyList(),
        activeExecution = null,
        taskChuteDayId = "day",
        startInstant = "2026-09-14T00:00:00Z",
        establishmentTimezone = "UTC",
        establishmentBoundaryMinutes = 0,
    )

    private fun task(id: String, lifecycle: LifecycleState, estimateSeconds: Int?, plannedStartMinute: Int) = TodayTask(
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
