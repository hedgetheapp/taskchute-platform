package com.hedgetheapp.taskchute.today

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/** Mirrors the Web Start Forecast cursor: planned starts are not barriers. */
internal fun forecastForTask(day: TodayDay, task: TodayTask, now: Instant = Instant.now()): Pair<Int?, Int?> {
    val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: return null to null
    var cursor = if (day.isCurrent) now else day.startInstant?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null to null
    day.activeExecution?.let { active ->
        val estimate = active.estimateSeconds ?: return@let
        val elapsed = (now.epochSecond - Instant.parse(active.startedAt).epochSecond).coerceAtLeast(0)
        cursor = cursor.plusSeconds((estimate - elapsed).coerceAtLeast(0))
    }
    val planned = day.sections.flatMap { it.entries } + day.unsectionedEntries
    val target = planned.firstOrNull { it.id == task.id && it.lifecycleState == LifecycleState.PLANNED } ?: return null to null
    for (candidate in planned) {
        if (candidate.lifecycleState != LifecycleState.PLANNED) continue
        if (candidate.id == target.id) {
            val start = cursor
            val end = candidate.estimateSeconds?.let { start.plusSeconds(it.toLong()) }
            return logicalMinute(start, day, zone) to end?.let { logicalMinute(it, day, zone) }
        }
        candidate.estimateSeconds?.let { cursor = cursor.plusSeconds(it.toLong()) }
    }
    return null to null
}

private fun logicalMinute(instant: Instant, day: TodayDay, zone: ZoneId): Int {
    val local = instant.atZone(zone)
    val logicalDate = LocalDate.parse(day.logicalDate)
    val dayOffset = local.toLocalDate().toEpochDay() - logicalDate.toEpochDay()
    return local.hour * 60 + local.minute + (dayOffset * 1440L).toInt()
}
