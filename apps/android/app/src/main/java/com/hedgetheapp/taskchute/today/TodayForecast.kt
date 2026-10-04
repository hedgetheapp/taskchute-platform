package com.hedgetheapp.taskchute.today

import com.hedgetheapp.taskchute.reminders.logicalMinuteInstant
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

internal data class EntryStartForecast(
    val startMinute: Int?,
    val endMinute: Int?,
    val fixedStart: Boolean = false,
    val conflictSeconds: Long = 0,
)

internal data class SectionForecastWarning(
    val overlapSeconds: Long,
    val overflowSeconds: Long,
) {
    val hasOverlap: Boolean get() = overlapSeconds > 0
    val hasOverflow: Boolean get() = overflowSeconds > 0
}

internal data class TodayStartForecast(
    val entries: Map<String, EntryStartForecast>,
    val sections: Map<String, SectionForecastWarning>,
)

/** D-032 flexible forecast plus D-145/D-161 fixed anchors and derived Section warnings. */
internal fun calculateTodayStartForecast(day: TodayDay, now: Instant = Instant.now()): TodayStartForecast {
    val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() }
        ?: return TodayStartForecast(emptyMap(), emptyMap())
    val logicalDate = runCatching { LocalDate.parse(day.logicalDate) }.getOrNull()
        ?: return TodayStartForecast(emptyMap(), emptyMap())
    val entryForecasts = mutableMapOf<String, EntryStartForecast>()
    val overlapBySection = mutableMapOf<String, Long>()
    val sectionWarnings = mutableMapOf<String, SectionForecastWarning>()

    for (task in day.allEntries) {
        when (task.lifecycleState) {
            LifecycleState.COMPLETED -> {
                val start = task.firstStartedAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
                val end = task.lastEndedAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
                entryForecasts[task.id] = EntryStartForecast(
                    start?.let { logicalMinute(it, logicalDate, zone) },
                    end?.let { logicalMinute(it, logicalDate, zone) },
                )
            }
            LifecycleState.RUNNING -> {
                val actualStart = task.activeStartedAt ?: task.firstStartedAt
                val start = actualStart?.let { runCatching { Instant.parse(it) }.getOrNull() }
                val end = start?.let { value ->
                    task.estimateSeconds?.takeIf { it >= 0 }?.let { estimate -> value.plusSeconds(estimate.toLong()) }
                }
                entryForecasts[task.id] = EntryStartForecast(
                    start?.let { logicalMinute(it, logicalDate, zone) },
                    end?.let { logicalMinute(it, logicalDate, zone) },
                )
            }
            LifecycleState.PLANNED -> Unit
        }
    }

    if (!day.planningEnabled) return TodayStartForecast(entryForecasts, emptyMap())

    var cursor = if (day.isCurrent) now else day.startInstant?.let {
        runCatching { Instant.parse(it) }.getOrNull()
    } ?: return TodayStartForecast(entryForecasts, emptyMap())

    var activeForecastEnd: Instant? = null
    if (day.isCurrent) {
        day.activeExecution?.let { active ->
            val estimateSeconds = active.estimateSeconds?.takeIf { it >= 0 } ?: return@let
            val startedAt = runCatching { Instant.parse(active.startedAt) }.getOrNull() ?: return@let
            val estimatedEnd = startedAt.plusSeconds(estimateSeconds.toLong())
            // The canonical endpoint is independent of ticker precision. Keep the existing
            // queue behavior once that endpoint has passed: subsequent planned work starts now.
            activeForecastEnd = estimatedEnd
            cursor = if (estimatedEnd.isAfter(now)) estimatedEnd else now
        }
    }

    // Match Web/D-032 eligibility: only planned rows in configured timed Sections forecast.
    for (section in day.sections) {
        val sectionStart = section.startMinute?.takeIf { it in 0..2879 } ?: continue
        val sectionEnd = section.endMinute?.takeIf { it in (sectionStart + 1)..2880 } ?: continue
        val sectionEndCandidates = mutableListOf<Instant>()
        if (activeForecastEnd != null && day.activeExecution?.entryId?.let { id -> section.entries.any { it.id == id } } == true) {
            sectionEndCandidates += activeForecastEnd
        }

        for (task in section.entries) {
            if (task.lifecycleState != LifecycleState.PLANNED) continue
            val plannedMinute = task.plannedStartMinute?.takeIf { it in 0..2879 }
            val fixedAnchor = plannedMinute?.takeIf { task.startReminderOffsetMinutes != null }?.let { minute ->
                runCatching { logicalMinuteInstant(day.logicalDate, zone, minute) }.getOrNull()
            }
            val fixed = fixedAnchor != null
            val conflictSeconds = fixedAnchor?.let { durationSecondsCeiling(Duration.between(it, cursor)) } ?: 0L
            val startInstant = fixedAnchor ?: cursor
            val estimate = task.estimateSeconds?.takeIf { it >= 0 }
            val endInstant = estimate?.let { startInstant.plusSeconds(it.toLong()) }

            entryForecasts[task.id] = EntryStartForecast(
                startMinute = if (fixed) requireNotNull(plannedMinute) else logicalMinute(startInstant, logicalDate, zone),
                endMinute = endInstant?.let { logicalMinute(it, logicalDate, zone) },
                fixedStart = fixed,
                conflictSeconds = conflictSeconds,
            )
            if (conflictSeconds > 0) {
                overlapBySection[section.id] = maxOf(overlapBySection[section.id] ?: 0, conflictSeconds)
            }
            if (endInstant != null) sectionEndCandidates += endInstant
            cursor = endInstant ?: startInstant
        }
        // Section end warnings are based on the greatest projected end in the Section,
        // not a sum of durations or historical actual rows.
        val maxEnd = sectionEndCandidates.maxOrNull()
        val overflow = maxEnd?.let { projectedEnd ->
            (logicalMinute(projectedEnd, logicalDate, zone) - sectionEnd).coerceAtLeast(0).toLong() * 60L
        } ?: 0L
        val overlap = overlapBySection[section.id] ?: 0L
        if (overlap > 0 || overflow > 0) {
            sectionWarnings[section.id] = SectionForecastWarning(overlap, overflow)
        }
    }
    return TodayStartForecast(entryForecasts, sectionWarnings)
}

internal fun forecastForTask(day: TodayDay, task: TodayTask, now: Instant = Instant.now()): Pair<Int?, Int?> =
    calculateTodayStartForecast(day, now).entries[task.id]?.let { it.startMinute to it.endMinute } ?: (null to null)

internal fun conflictMinutesCeiling(conflictSeconds: Long): Long =
    if (conflictSeconds <= 0) 0 else (conflictSeconds + 59) / 60

private fun durationSecondsCeiling(duration: Duration): Long {
    val millis = duration.toMillis().coerceAtLeast(0)
    return if (millis == 0L) 0 else (millis + 999) / 1_000
}

private fun logicalMinute(instant: Instant, logicalDate: LocalDate, zone: ZoneId): Int {
    val local = instant.atZone(zone)
    val dayOffset = local.toLocalDate().toEpochDay() - logicalDate.toEpochDay()
    return local.hour * 60 + local.minute + (dayOffset * 1440L).toInt()
}
