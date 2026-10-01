package com.hedgetheapp.taskchute.reminders

import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayTask
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

internal data class ReminderTrigger(val kind: Kind, val instant: Instant, val executionId: String? = null) {
    enum class Kind { START, OVERRUN }
}

internal fun shouldScheduleTrigger(trigger: ReminderTrigger, now: Instant): Boolean =
    trigger.kind != ReminderTrigger.Kind.START || trigger.instant.isAfter(now)

internal fun reminderTriggers(day: TodayDay, task: TodayTask): List<ReminderTrigger> {
    val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: return emptyList()
    return buildList {
        if (task.lifecycleState == LifecycleState.PLANNED) {
            val offset = task.startReminderOffsetMinutes
            val start = task.plannedStartMinute?.let { logicalMinuteInstant(day.logicalDate, zone, it) }
            if (offset != null && start != null) {
                add(ReminderTrigger(ReminderTrigger.Kind.START, start.minusSeconds(offset * 60L)))
            }
        }
        if (task.lifecycleState == LifecycleState.RUNNING && task.notifyOnEstimateOverrun
            && task.estimateSeconds != null && task.estimateSeconds > 0
            && task.executionId != null && task.activeStartedAt != null) {
            val startedAt = runCatching { Instant.parse(task.activeStartedAt) }.getOrNull()
            if (startedAt != null) {
                add(ReminderTrigger(ReminderTrigger.Kind.OVERRUN,
                    startedAt.plusSeconds(task.estimateSeconds.toLong()), task.executionId))
            }
        }
    }
}

internal fun logicalMinuteInstant(logicalDate: String, zone: ZoneId, minute: Int): Instant {
    require(minute in 0..2879)
    val date = LocalDate.parse(logicalDate).plusDays((minute / 1440).toLong())
    val minuteOfDay = minute % 1440
    return ZonedDateTime.of(date, LocalTime.of(minuteOfDay / 60, minuteOfDay % 60), zone).toInstant()
}
