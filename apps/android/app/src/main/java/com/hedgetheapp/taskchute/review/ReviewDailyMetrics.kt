package com.hedgetheapp.taskchute.review

import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayTask

internal data class ReviewDailyMetrics(
    val completedCount: Int,
    val unexecutedCount: Int,
    val completedActualDurationSeconds: Long,
    val hasEntries: Boolean,
    val completedEntries: List<ReviewDailyEntry>,
    val unexecutedEntries: List<ReviewDailyEntry>,
)

internal data class ReviewDailyEntry(
    val id: String,
    val title: String,
    val completedDurationSeconds: Long? = null,
)

internal sealed interface ReviewDailyProjection {
    data class Available(val metrics: ReviewDailyMetrics) : ReviewDailyProjection
    data object Unestablished : ReviewDailyProjection
    data object Invalid : ReviewDailyProjection
}

/** Projects persisted Entry rows only. The cross-Day active_entry is deliberately excluded. */
internal fun projectReviewDailyMetrics(day: TodayDay): ReviewDailyProjection {
    val projectedEntries = day.sections.flatMap { it.entries } + day.unsectionedEntries
    if (day.taskChuteDayId.isNullOrBlank()) {
        return if (projectedEntries.isEmpty()) ReviewDailyProjection.Unestablished else ReviewDailyProjection.Invalid
    }

    val entriesById = linkedMapOf<String, TodayTask>()
    for (entry in projectedEntries) {
        if (entry.id.isBlank()) return ReviewDailyProjection.Invalid
        val previous = entriesById.putIfAbsent(entry.id, entry)
        if (previous != null && previous != entry) return ReviewDailyProjection.Invalid
    }

    val completedEntries = mutableListOf<ReviewDailyEntry>()
    val unexecutedEntries = mutableListOf<ReviewDailyEntry>()
    var completedDurationSeconds = 0L
    for (entry in entriesById.values) {
        when (entry.lifecycleState) {
            LifecycleState.COMPLETED -> {
                val duration = entry.completedDurationSeconds ?: return ReviewDailyProjection.Invalid
                if (duration < 0) return ReviewDailyProjection.Invalid
                completedDurationSeconds = try {
                    Math.addExact(completedDurationSeconds, duration.toLong())
                } catch (_: ArithmeticException) {
                    return ReviewDailyProjection.Invalid
                }
                completedEntries += ReviewDailyEntry(
                    id = entry.id,
                    title = entry.title,
                    completedDurationSeconds = duration.toLong(),
                )
            }
            LifecycleState.PLANNED -> {
                unexecutedEntries += ReviewDailyEntry(id = entry.id, title = entry.title)
            }
            LifecycleState.RUNNING -> Unit
        }
    }

    return ReviewDailyProjection.Available(
        ReviewDailyMetrics(
            completedCount = completedEntries.size,
            unexecutedCount = unexecutedEntries.size,
            completedActualDurationSeconds = completedDurationSeconds,
            hasEntries = entriesById.isNotEmpty(),
            completedEntries = completedEntries.toList(),
            unexecutedEntries = unexecutedEntries.toList(),
        ),
    )
}

internal fun formatReviewDuration(seconds: Long): String {
    require(seconds >= 0)
    if (seconds == 0L) return "0秒"
    val hours = seconds / 3_600
    val minutes = (seconds % 3_600) / 60
    val remainingSeconds = seconds % 60
    return buildList {
        if (hours > 0) add("${hours}時間")
        if (minutes > 0 || hours > 0) add("${minutes}分")
        if (remainingSeconds > 0 || (hours == 0L && minutes == 0L)) add("${remainingSeconds}秒")
    }.joinToString(" ")
}

