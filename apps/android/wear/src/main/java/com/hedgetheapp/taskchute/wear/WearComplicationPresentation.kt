package com.hedgetheapp.taskchute.wear

import java.time.Duration
import java.time.Instant
import kotlin.math.ceil

internal sealed interface WearComplicationPresentation {
    data class Running(
        val taskTitle: String,
        val startedAt: Instant,
        val elapsedSeconds: Long,
        val estimateSeconds: Int?,
        val compactText: String,
        val contentDescription: String,
        val overrun: Boolean,
    ) : WearComplicationPresentation

    data object Idle : WearComplicationPresentation
    data object SignedOut : WearComplicationPresentation
    data object Unavailable : WearComplicationPresentation
}

internal enum class WearComplicationRequestedType { GOAL_PROGRESS, SHORT_TEXT, LONG_TEXT, UNSUPPORTED }
internal enum class WearComplicationPayloadKind { GOAL_PROGRESS, TEXT, NO_DATA }

internal fun wearComplicationPresentation(
    auth: WearAuthResult,
    load: WearLoadResult? = null,
    now: Instant,
): WearComplicationPresentation = when (auth) {
    WearAuthResult.SignedOut -> WearComplicationPresentation.SignedOut
    WearAuthResult.TransientFailure, WearAuthResult.ProtocolFailure -> WearComplicationPresentation.Unavailable
    WearAuthResult.SignedIn -> when (load) {
        WearLoadResult.Unauthorized -> WearComplicationPresentation.SignedOut
        is WearLoadResult.Failure, null -> WearComplicationPresentation.Unavailable
        is WearLoadResult.Success -> {
            val day = load.day
            val execution = day.activeExecution
            if (execution == null) {
                WearComplicationPresentation.Idle
            } else {
                val task = day.allTasks.firstOrNull { it.id == execution.entryId }
                val startedAt = runCatching { Instant.parse(execution.startedAt) }.getOrNull()
                if (task == null || task.lifecycle != WearLifecycle.RUNNING || startedAt == null) {
                    WearComplicationPresentation.Unavailable
                } else {
                    val elapsed = Duration.between(startedAt, now).seconds.coerceAtLeast(0L)
                    val estimate = task.estimateSeconds?.takeIf { it > 0 }
                    val elapsedMinutes = elapsed / 60L
                    val estimateMinutes = estimate?.let(::wearEstimateMinutes)
                    val compact = if (estimate == null) "${elapsedMinutes}m" else wearProgressText(startedAt, estimate, now)
                    val safeTitle = task.title
                        .replace(Regex("[\\p{Cc}\\p{Cf}]+"), " ")
                        .replace(Regex("\\s+"), " ")
                        .trim()
                        .take(MAX_TITLE_LENGTH)
                        .ifBlank { "Task" }
                    val overrun = estimate != null && elapsed > estimate.toLong()
                    val description = buildString {
                        append(safeTitle)
                        append("、経過 ")
                        append(elapsedMinutes)
                        append("分")
                        if (estimateMinutes != null) {
                            append(" / 見積 ")
                            append(estimateMinutes)
                            append("分")
                        }
                        if (overrun) append("、見積超過")
                    }
                    WearComplicationPresentation.Running(
                        taskTitle = safeTitle,
                        startedAt = startedAt,
                        elapsedSeconds = elapsed,
                        estimateSeconds = estimate,
                        compactText = compact,
                        contentDescription = description,
                        overrun = overrun,
                    )
                }
            }
        }
    }
}

internal fun wearComplicationPayloadKind(
    type: WearComplicationRequestedType,
    presentation: WearComplicationPresentation,
): WearComplicationPayloadKind = when (type) {
    WearComplicationRequestedType.UNSUPPORTED -> WearComplicationPayloadKind.NO_DATA
    WearComplicationRequestedType.SHORT_TEXT,
    WearComplicationRequestedType.LONG_TEXT -> WearComplicationPayloadKind.TEXT
    WearComplicationRequestedType.GOAL_PROGRESS ->
        if (presentation is WearComplicationPresentation.Running && presentation.estimateSeconds != null) {
            WearComplicationPayloadKind.GOAL_PROGRESS
        } else {
            WearComplicationPayloadKind.NO_DATA
        }
}

internal fun wearComplicationTapTargetClassName(): String = WearMainActivity::class.java.name

internal fun wearEstimateMinutes(estimateSeconds: Int): Long = ceil(estimateSeconds / 60.0).toLong()

internal fun wearProgressText(startedAt: Instant, estimateSeconds: Int, now: Instant): String =
    "${Duration.between(startedAt, now).seconds.coerceAtLeast(0L) / 60L}/${wearEstimateMinutes(estimateSeconds)}"

private const val MAX_TITLE_LENGTH = 48
