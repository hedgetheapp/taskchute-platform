package com.hedgetheapp.taskchute.wear

import java.time.Duration
import java.time.Instant
import java.util.Locale

internal enum class WearLifecycle { PLANNED, RUNNING, COMPLETED }

internal data class WearTask(
    val id: String,
    val title: String,
    val lifecycle: WearLifecycle,
    val estimateSeconds: Int?,
    val routineDerived: Boolean,
    val executionId: String?,
    val activeStartedAt: String?,
    val firstStartedAt: String?,
    val completedDurationSeconds: Int?,
)

internal data class WearSection(
    val id: String,
    val title: String,
    val startMinute: Int?,
    val endMinute: Int?,
    val tasks: List<WearTask>,
)

internal data class WearExecution(
    val id: String,
    val entryId: String,
    val startedAt: String,
    val estimateSeconds: Int?,
)

internal data class WearDay(
    val logicalDate: String,
    val placementRevision: Int,
    val sections: List<WearSection>,
    val unsectionedTasks: List<WearTask>,
    val activeExecution: WearExecution?,
    val startInstant: String?,
    val establishmentTimezone: String?,
) {
    val allTasks: List<WearTask> get() = sections.flatMap { it.tasks } + unsectionedTasks
    val runningTask: WearTask? get() = activeExecution?.let { active -> allTasks.firstOrNull { it.id == active.entryId } }
    val nextPlannedTask: WearTask? get() = allTasks.firstOrNull { it.lifecycle == WearLifecycle.PLANNED }
}

internal sealed interface WearScreenState {
    data object Restoring : WearScreenState
    data object SignedOut : WearScreenState
    data object Loading : WearScreenState
    data class WaitingForPhone(val requestId: String) : WearScreenState
    data class Today(val day: WearDay) : WearScreenState
    data class Running(val day: WearDay) : WearScreenState
    data class Completed(val day: WearDay, val completedTask: WearTask) : WearScreenState
    data class Error(val message: String, val day: WearDay? = null) : WearScreenState
}

internal data class WearProjection(val startMinute: Int?, val endMinute: Int?)

internal data class WearProgress(
    val elapsedSeconds: Long?,
    val remainingSeconds: Long?,
    val overrunSeconds: Long?,
    val fraction: Float?,
)

internal fun wearProgress(startedAt: String?, estimateSeconds: Int?, now: Instant): WearProgress {
    val start = startedAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
        ?: return WearProgress(null, null, null, null)
    val elapsed = Duration.between(start, now).seconds.coerceAtLeast(0L)
    val estimate = estimateSeconds?.toLong()?.takeIf { it > 0L }
        ?: return WearProgress(elapsed, null, null, null)
    return WearProgress(
        elapsed,
        (estimate - elapsed).coerceAtLeast(0L),
        (elapsed - estimate).coerceAtLeast(0L),
        (elapsed.toDouble() / estimate).coerceIn(0.0, 1.0).toFloat(),
    )
}

internal fun formatWearDuration(seconds: Long?): String {
    if (seconds == null) return "--:--:--"
    val total = seconds.coerceAtLeast(0L)
    return String.format(Locale.ROOT, "%02d:%02d:%02d", total / 3600L, (total / 60L) % 60L, total % 60L)
}

internal fun wearForecast(day: WearDay, task: WearTask, now: Instant): WearProjection {
    val zone = day.establishmentTimezone?.let { runCatching { java.time.ZoneId.of(it) }.getOrNull() }
        ?: return WearProjection(null, null)
    if (task.lifecycle == WearLifecycle.RUNNING) {
        val start = task.activeStartedAt ?: task.firstStartedAt ?: return WearProjection(null, null)
        val instant = runCatching { Instant.parse(start) }.getOrNull() ?: return WearProjection(null, null)
        val end = task.estimateSeconds?.let { instant.plusSeconds(it.toLong()) }
        return WearProjection(wearLogicalMinute(instant, day, zone), end?.let { wearLogicalMinute(it, day, zone) })
    }
    var cursor = now
    day.activeExecution?.let { active ->
        val activeStart = runCatching { Instant.parse(active.startedAt) }.getOrNull()
        val estimate = active.estimateSeconds?.toLong()
        if (activeStart != null && estimate != null) {
            val elapsed = (now.epochSecond - activeStart.epochSecond).coerceAtLeast(0L)
            cursor = cursor.plusSeconds((estimate - elapsed).coerceAtLeast(0L))
        }
    }
    val planned = day.allTasks.filter { it.lifecycle == WearLifecycle.PLANNED }
    for (candidate in planned) {
        if (candidate.id == task.id) {
            val end = candidate.estimateSeconds?.let { cursor.plusSeconds(it.toLong()) }
            return WearProjection(wearLogicalMinute(cursor, day, zone), end?.let { wearLogicalMinute(it, day, zone) })
        }
        candidate.estimateSeconds?.let { cursor = cursor.plusSeconds(it.toLong()) }
    }
    return WearProjection(null, null)
}

private fun wearLogicalMinute(instant: Instant, day: WearDay, zone: java.time.ZoneId): Int {
    val local = instant.atZone(zone)
    val logicalDate = java.time.LocalDate.parse(day.logicalDate)
    return local.hour * 60 + local.minute + ((local.toLocalDate().toEpochDay() - logicalDate.toEpochDay()) * 1440L).toInt()
}

internal fun formatWearMinute(minute: Int?): String = minute?.let {
    String.format(Locale.ROOT, "%02d:%02d", Math.floorMod(it / 60, 24), Math.floorMod(it, 60))
} ?: "--:--"
