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

internal data class WearComplicationTextFallback(
    val text: String,
    val contentDescription: String,
    val title: String,
)

internal sealed interface WearComplicationCacheChange {
    data object Keep : WearComplicationCacheChange
    data object Clear : WearComplicationCacheChange
    data class Save(val snapshot: WearRunningProjectionSnapshot) : WearComplicationCacheChange
}

internal data class WearComplicationResolution(
    val presentation: WearComplicationPresentation,
    val cacheChange: WearComplicationCacheChange,
)

internal fun resolveWearComplication(
    auth: WearAuthResult,
    load: WearLoadResult?,
    now: Instant,
    lastKnownGood: WearRunningProjectionSnapshot?,
): WearComplicationResolution {
    fun transientFallback(): WearComplicationResolution = WearComplicationResolution(
        presentation = lastKnownGood?.let { it.toPresentation(now) } ?: WearComplicationPresentation.Unavailable,
        cacheChange = WearComplicationCacheChange.Keep,
    )

    return when (auth) {
        WearAuthResult.SignedOut -> WearComplicationResolution(
            WearComplicationPresentation.SignedOut,
            WearComplicationCacheChange.Clear,
        )
        WearAuthResult.TransientFailure -> transientFallback()
        WearAuthResult.ProtocolFailure -> WearComplicationResolution(
            WearComplicationPresentation.Unavailable,
            WearComplicationCacheChange.Keep,
        )
        WearAuthResult.SignedIn -> when (load) {
            WearLoadResult.Unauthorized -> WearComplicationResolution(
                WearComplicationPresentation.SignedOut,
                WearComplicationCacheChange.Clear,
            )
            is WearLoadResult.Failure -> if (load.ambiguous) transientFallback() else WearComplicationResolution(
                WearComplicationPresentation.Unavailable,
                WearComplicationCacheChange.Keep,
            )
            null -> WearComplicationResolution(WearComplicationPresentation.Unavailable, WearComplicationCacheChange.Keep)
            is WearLoadResult.Success -> when (val canonical = wearComplicationPresentation(auth, load, now)) {
                is WearComplicationPresentation.Running -> WearComplicationResolution(
                    canonical,
                    WearComplicationCacheChange.Save(canonical.toSnapshot()),
                )
                WearComplicationPresentation.Idle -> WearComplicationResolution(
                    canonical,
                    WearComplicationCacheChange.Clear,
                )
                else -> WearComplicationResolution(canonical, WearComplicationCacheChange.Keep)
            }
        }
    }
}

internal fun WearComplicationResolution.persistCache(store: WearRunningProjectionStore) {
    when (val change = cacheChange) {
        WearComplicationCacheChange.Keep -> Unit
        WearComplicationCacheChange.Clear -> store.clear()
        is WearComplicationCacheChange.Save -> if (!store.save(change.snapshot)) store.clear()
    }
}

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
                    wearRunningPresentation(task.title, startedAt, task.estimateSeconds, now)
                }
            }
        }
    }
}

private fun WearComplicationPresentation.Running.toSnapshot() = WearRunningProjectionSnapshot(
    taskTitle = taskTitle,
    startedAt = startedAt,
    estimateSeconds = estimateSeconds,
)

private fun WearRunningProjectionSnapshot.toPresentation(now: Instant): WearComplicationPresentation.Running =
    wearRunningPresentation(taskTitle, startedAt, estimateSeconds, now)

private fun wearRunningPresentation(
    title: String,
    startedAt: Instant,
    estimateSeconds: Int?,
    now: Instant,
): WearComplicationPresentation.Running {
    val elapsed = Duration.between(startedAt, now).seconds.coerceAtLeast(0L)
    val estimate = estimateSeconds?.takeIf { it > 0 }
    val elapsedMinutes = elapsed / 60L
    val estimateMinutes = estimate?.let(::wearEstimateMinutes)
    val compact = if (estimate == null) "${elapsedMinutes}m" else wearProgressText(startedAt, estimate, now)
    val safeTitle = title
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
    return WearComplicationPresentation.Running(
        taskTitle = safeTitle,
        startedAt = startedAt,
        elapsedSeconds = elapsed,
        estimateSeconds = estimate,
        compactText = compact,
        contentDescription = description,
        overrun = overrun,
    )
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

internal fun wearComplicationTextFallback(
    type: WearComplicationRequestedType,
    presentation: WearComplicationPresentation,
): WearComplicationTextFallback? {
    if (type != WearComplicationRequestedType.SHORT_TEXT && type != WearComplicationRequestedType.LONG_TEXT) {
        return null
    }
    val longText = type == WearComplicationRequestedType.LONG_TEXT
    return when (presentation) {
        is WearComplicationPresentation.Running -> null
        WearComplicationPresentation.Idle -> WearComplicationTextFallback(
            text = if (longText) "TaskChute 待機" else "待機",
            contentDescription = "TaskChute、待機中",
            title = "TaskChute",
        )
        WearComplicationPresentation.SignedOut -> WearComplicationTextFallback(
            text = "ログイン",
            contentDescription = "TaskChuteにログインしてください",
            title = "TaskChute",
        )
        WearComplicationPresentation.Unavailable -> WearComplicationTextFallback(
            text = "未取得",
            contentDescription = "TaskChuteの状態を確認できません",
            title = "TaskChute",
        )
    }
}

internal fun wearComplicationTapTargetClassName(): String = WearMainActivity::class.java.name

internal fun wearEstimateMinutes(estimateSeconds: Int): Long = ceil(estimateSeconds / 60.0).toLong()

internal fun wearProgressText(startedAt: Instant, estimateSeconds: Int, now: Instant): String =
    "${Duration.between(startedAt, now).seconds.coerceAtLeast(0L) / 60L}/${wearEstimateMinutes(estimateSeconds)}"

private const val MAX_TITLE_LENGTH = 48
