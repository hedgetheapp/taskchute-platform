package com.hedgetheapp.taskchute.today

import java.time.Duration
import java.time.Instant

internal data class TodaySectionProgress(
    val completedCount: Int,
    val totalCount: Int,
    val remainingSeconds: Long,
    val hasUnknownRemaining: Boolean,
) {
    val completedFraction: Float
        get() = if (totalCount == 0) 1f else (completedCount.toDouble() / totalCount.toDouble()).toFloat()
}

/** Summarizes only the Entries currently projected into this configured Section. */
internal fun calculateTodaySectionProgress(
    section: TodaySection,
    activeExecution: TodayExecution?,
    now: Instant,
): TodaySectionProgress {
    val entries = section.entries.distinctBy(TodayTask::id)
    var remainingSeconds = 0L
    var hasUnknownRemaining = false

    entries.forEach { entry ->
        when (entry.lifecycleState) {
            LifecycleState.COMPLETED -> Unit
            LifecycleState.PLANNED -> {
                val estimate = entry.estimateSeconds?.toLong()?.takeIf { it > 0L }
                if (estimate == null) {
                    hasUnknownRemaining = true
                } else {
                    remainingSeconds = addSaturated(remainingSeconds, estimate)
                }
            }
            LifecycleState.RUNNING -> {
                val estimate = entry.estimateSeconds?.toLong()?.takeIf { it > 0L }
                val executionStart = activeExecution
                    ?.takeIf { it.entryId == entry.id }
                    ?.startedAt
                    ?.let { value -> runCatching { Instant.parse(value) }.getOrNull() }
                val elapsed = executionStart?.let { start ->
                    runCatching { Duration.between(start, now).seconds.coerceAtLeast(0L) }.getOrNull()
                }
                if (estimate == null || elapsed == null) {
                    hasUnknownRemaining = true
                } else {
                    remainingSeconds = addSaturated(remainingSeconds, (estimate - elapsed).coerceAtLeast(0L))
                }
            }
        }
    }

    return TodaySectionProgress(
        completedCount = entries.count { it.lifecycleState == LifecycleState.COMPLETED },
        totalCount = entries.size,
        remainingSeconds = remainingSeconds,
        hasUnknownRemaining = hasUnknownRemaining,
    )
}

/** Displays whole minutes, rounding a positive partial minute up so it is not shown as zero work. */
internal fun formatTodaySectionRemainingWorkload(seconds: Long, hasUnknownRemaining: Boolean): String {
    val nonnegativeSeconds = seconds.coerceAtLeast(0L)
    val totalMinutes = nonnegativeSeconds / 60L + if (nonnegativeSeconds % 60L == 0L) 0L else 1L
    val hours = totalMinutes / 60L
    val minutes = totalMinutes % 60L
    val value = if (hours == 0L) {
        "${totalMinutes}m"
    } else {
        "${hours}h${minutes.toString().padStart(2, '0')}m"
    }
    return value + if (hasUnknownRemaining) "+" else ""
}

private fun addSaturated(first: Long, second: Long): Long =
    if (Long.MAX_VALUE - first < second) Long.MAX_VALUE else first + second
