package com.hedgetheapp.taskchute.reminders

import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayTask
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class ReminderScheduleCalculatorTest {
    @Test
    fun startReminderUsesPlannedLogicalMinuteAndConfiguredOffset() {
        val day = day()
        val task = task(LifecycleState.PLANNED, plannedStartMinute = 9 * 60, startOffset = 10)
        val trigger = reminderTriggers(day, task).single()
        assertEquals(ReminderTrigger.Kind.START, trigger.kind)
        assertEquals(Instant.parse("2026-10-01T08:50:00Z"), trigger.instant)
    }

    @Test
    fun everyApprovedStartOffsetUsesTheSameCanonicalPlannedStart() {
        val plannedStart = Instant.parse("2026-10-01T09:00:00Z")
        val expectedOffsets = listOf(0, 5, 10, 15, 30, 60)
        expectedOffsets.forEach { offset ->
            val trigger = reminderTriggers(day(), task(LifecycleState.PLANNED,
                plannedStartMinute = 9 * 60, startOffset = offset)).single()
            assertEquals(plannedStart.minusSeconds(offset * 60L), trigger.instant)
        }
    }

    @Test
    fun extendedLogicalMinuteUsesNextDateInEstablishmentTimezone() {
        assertEquals(Instant.parse("2026-10-01T16:00:00Z"),
            logicalMinuteInstant("2026-10-01", ZoneId.of("Asia/Tokyo"), 25 * 60))
    }

    @Test
    fun runningOverrunUsesActiveExecutionStartAndCurrentEstimate() {
        val task = task(LifecycleState.RUNNING, estimateSeconds = 1800, overrun = true,
            executionId = "execution-1", activeStart = "2026-10-01T08:00:00Z")
        val trigger = reminderTriggers(day(), task).single()
        assertEquals(ReminderTrigger.Kind.OVERRUN, trigger.kind)
        assertEquals("execution-1", trigger.executionId)
        assertEquals(Instant.parse("2026-10-01T08:30:00Z"), trigger.instant)
    }

    @Test
    fun disabledAndCompletedRemindersProduceNoTriggers() {
        assertTrue(reminderTriggers(day(), task(LifecycleState.PLANNED, plannedStartMinute = 540)).isEmpty())
        assertTrue(reminderTriggers(day(), task(LifecycleState.COMPLETED, plannedStartMinute = 540,
            startOffset = 5, overrun = true, estimateSeconds = 600)).isEmpty())
    }

    @Test
    fun startReminderDoesNotScheduleWhenItsTargetIsAlreadyPast() {
        val start = reminderTriggers(day(), task(LifecycleState.PLANNED,
            plannedStartMinute = 9 * 60, startOffset = 10)).single()
        assertTrue(!shouldScheduleTrigger(start, Instant.parse("2026-10-01T08:50:00Z")))
        assertTrue(!shouldScheduleTrigger(start, Instant.parse("2026-10-01T09:00:00Z")))
        assertTrue(shouldScheduleTrigger(start, Instant.parse("2026-10-01T08:49:59Z")))
    }

    @Test
    fun runningEntryDoesNotKeepItsStartReminderAndCompletedEntryHasNoOverrunTrigger() {
        val running = task(LifecycleState.RUNNING, plannedStartMinute = 540, startOffset = 5,
            estimateSeconds = 600, overrun = true, executionId = "execution-running",
            activeStart = "2026-10-01T08:00:00Z")
        val trigger = reminderTriggers(day(), running).single()
        assertEquals(ReminderTrigger.Kind.OVERRUN, trigger.kind)
        assertEquals(Instant.parse("2026-10-01T08:10:00Z"), trigger.instant)
        assertTrue(reminderTriggers(day(), running.copy(lifecycleState = LifecycleState.COMPLETED)).isEmpty())
    }

    private fun day() = TodayDay("2026-10-01", true, true, 0, emptyList(), emptyList(), null,
        taskChuteDayId = "day-1", establishmentTimezone = "UTC")

    private fun task(
        lifecycle: LifecycleState,
        plannedStartMinute: Int? = null,
        startOffset: Int? = null,
        estimateSeconds: Int? = null,
        overrun: Boolean = false,
        executionId: String? = null,
        activeStart: String? = null,
    ) = TodayTask("entry-1", "Reminder task", lifecycle, null, null, estimateSeconds, plannedStartMinute,
        executionId, activeStart, startReminderOffsetMinutes = startOffset, notifyOnEstimateOverrun = overrun)
}
