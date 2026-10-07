package com.hedgetheapp.taskchute.widget

import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayTask
import com.hedgetheapp.taskchute.today.TodayMutationResult
import com.hedgetheapp.taskchute.today.TodayRepository
import com.hedgetheapp.taskchute.today.TodayResult
import com.hedgetheapp.taskchute.today.calculateRunningProgress
import com.hedgetheapp.taskchute.today.formatRunningDuration
import java.time.Instant
import java.util.Locale
import kotlin.math.roundToInt

internal sealed interface AndroidHomeWidgetProjection {
    data class Running(
        val task: TodayTask,
        val nextPlanned: TodayTask?,
        val startedAt: String,
        val elapsedSeconds: Long?,
        val remainingSeconds: Long?,
        val overrunSeconds: Long?,
        val estimateSeconds: Int?,
        val progressPermille: Int?,
    ) : AndroidHomeWidgetProjection

    data class Idle(val nextPlanned: TodayTask?) : AndroidHomeWidgetProjection

    data object InvalidActiveState : AndroidHomeWidgetProjection
}

internal data class AndroidHomeWidgetRunningPresentation(
    val elapsedSeconds: Long?,
    val elapsedText: String,
    val remainingSeconds: Long?,
    val remainingText: String?,
    val overrunSeconds: Long?,
    val overrunText: String?,
    val progressPermille: Int?,
)

internal fun androidHomeWidgetRunningPresentation(
    startedAt: String?,
    estimateSeconds: Int?,
    now: Instant,
): AndroidHomeWidgetRunningPresentation {
    val estimate = estimateSeconds?.takeIf { it > 0 }
    val progress = calculateRunningProgress(startedAt, estimate, now)
    return AndroidHomeWidgetRunningPresentation(
        elapsedSeconds = progress.elapsedSeconds,
        elapsedText = formatRunningDuration(progress.elapsedSeconds),
        remainingSeconds = progress.remainingSeconds,
        remainingText = estimate?.let { formatRunningDuration(progress.remainingSeconds) },
        overrunSeconds = progress.overrunSeconds?.takeIf { it > 0L },
        overrunText = progress.overrunSeconds?.takeIf { it > 0L }?.let { "+${formatRunningDuration(it)}" },
        progressPermille = estimate?.let { (progress.progress * 1000f).roundToInt().coerceIn(0, 1000) },
    )
}

internal fun projectAndroidHomeWidget(day: TodayDay, now: Instant): AndroidHomeWidgetProjection {
    val nextPlanned = day.allEntries.firstOrNull { it.lifecycleState == LifecycleState.PLANNED }
    val execution = day.activeExecution
    if (!hasActiveExecution(day)) return AndroidHomeWidgetProjection.Idle(nextPlanned)
    val runningTask = validatedActiveTask(day) ?: return AndroidHomeWidgetProjection.InvalidActiveState
    val canonicalExecution = execution ?: return AndroidHomeWidgetProjection.InvalidActiveState

    val presentation = androidHomeWidgetRunningPresentation(
        startedAt = canonicalExecution.startedAt,
        estimateSeconds = runningTask.estimateSeconds,
        now = now,
    )
    return AndroidHomeWidgetProjection.Running(
        task = runningTask,
        nextPlanned = nextPlanned,
        startedAt = canonicalExecution.startedAt,
        elapsedSeconds = presentation.elapsedSeconds,
        remainingSeconds = presentation.remainingSeconds,
        overrunSeconds = presentation.overrunSeconds,
        estimateSeconds = runningTask.estimateSeconds?.takeIf { it > 0 },
        progressPermille = presentation.progressPermille,
    )
}

internal fun canonicalAndroidHomeWidgetCompleteExecutionId(
    task: TodayTask,
    day: TodayDay,
): String? {
    if (task.id.isBlank()) return null
    return task.executionId?.takeIf(String::isNotBlank)
        ?: day.activeExecution
            ?.takeIf { it.entryId == task.id }
            ?.id
            ?.takeIf(String::isNotBlank)
}

internal fun canonicalAndroidHomeWidgetStartTask(
    projection: AndroidHomeWidgetProjection.Idle,
): TodayTask? = projection.nextPlanned?.takeIf {
    it.id.isNotBlank() && it.lifecycleState == LifecycleState.PLANNED
}

private fun hasActiveExecution(day: TodayDay): Boolean =
    day.activeExecution != null || day.activeEntry != null ||
        day.allEntries.any { it.lifecycleState == LifecycleState.RUNNING }

private fun validatedActiveTask(day: TodayDay): TodayTask? {
    val execution = day.activeExecution ?: return null
    val task = day.runningTask ?: return null
    if (task.lifecycleState != LifecycleState.RUNNING || execution.entryId != task.id) return null
    if (task.executionId?.let { it != execution.id } == true) return null
    return task
}

internal fun formatAndroidHomeWidgetPlannedMetadata(task: TodayTask): String? {
    val plannedStart = task.plannedStartMinute
        ?.takeIf { it >= 0 }
        ?.let { minute -> String.format(Locale.ROOT, "%02d:%02d", minute / 60, minute % 60) }
    val estimate = task.estimateSeconds
        ?.takeIf { it > 0 }
        ?.let { seconds -> "${seconds / 60}分" }
    return listOfNotNull(plannedStart, estimate).takeIf { it.isNotEmpty() }?.joinToString(" · ")
}

internal sealed interface AndroidHomeWidgetAction {
    data class Start(val entryId: String) : AndroidHomeWidgetAction
    data class Complete(val entryId: String, val executionId: String) : AndroidHomeWidgetAction
}

internal data class AndroidHomeWidgetDisplayTask(
    val title: String,
    val metadata: String?,
)

/** A one-shot RemoteViews presentation. It has no lifecycle identity and never owns an alarm. */
internal sealed interface AndroidHomeWidgetOptimisticPresentation {
    val canDispatchLifecycleAction: Boolean
    val ownsBoundaryAlarm: Boolean

    data class Running(
        val title: String,
        val tapElapsedRealtimeMillis: Long,
    ) : AndroidHomeWidgetOptimisticPresentation {
        override val canDispatchLifecycleAction: Boolean = false
        override val ownsBoundaryAlarm: Boolean = false
    }

    data class Idle(
        val nextPlanned: AndroidHomeWidgetDisplayTask?,
    ) : AndroidHomeWidgetOptimisticPresentation {
        override val canDispatchLifecycleAction: Boolean = false
        override val ownsBoundaryAlarm: Boolean = false
    }
}

internal fun optimisticAndroidHomeWidgetStart(
    taskTitle: String?,
    tapElapsedRealtimeMillis: Long,
): AndroidHomeWidgetOptimisticPresentation.Running? =
    taskTitle?.takeIf(String::isNotBlank)?.let {
        AndroidHomeWidgetOptimisticPresentation.Running(it, tapElapsedRealtimeMillis)
    }

internal fun optimisticAndroidHomeWidgetComplete(
    nextPlanned: AndroidHomeWidgetDisplayTask?,
): AndroidHomeWidgetOptimisticPresentation.Idle =
    AndroidHomeWidgetOptimisticPresentation.Idle(nextPlanned)

internal sealed interface AndroidHomeWidgetActionPlan {
    data object Stale : AndroidHomeWidgetActionPlan
    data class Start(val task: TodayTask, val placementRevision: Int) : AndroidHomeWidgetActionPlan
    data class Complete(val task: TodayTask) : AndroidHomeWidgetActionPlan
}

internal fun resolveAndroidHomeWidgetAction(
    day: TodayDay,
    action: AndroidHomeWidgetAction,
): AndroidHomeWidgetActionPlan {
    if (!day.isCurrent) return AndroidHomeWidgetActionPlan.Stale

    return when (action) {
        is AndroidHomeWidgetAction.Start -> {
            val target = if (hasActiveExecution(day)) null else
                day.allEntries.firstOrNull { it.lifecycleState == LifecycleState.PLANNED }
            if (target == null || target.id != action.entryId) {
                AndroidHomeWidgetActionPlan.Stale
            } else {
                AndroidHomeWidgetActionPlan.Start(target, day.placementRevision)
            }
        }

        is AndroidHomeWidgetAction.Complete -> {
            val execution = day.activeExecution
            val task = validatedActiveTask(day)
            if (execution == null || task == null ||
                action.entryId != execution.entryId || action.entryId != task.id ||
                action.executionId != execution.id ||
                task.executionId?.let { it != execution.id } == true
            ) {
                AndroidHomeWidgetActionPlan.Stale
            } else {
                AndroidHomeWidgetActionPlan.Complete(
                    task.copy(executionId = execution.id, activeStartedAt = execution.startedAt),
                )
            }
        }
    }
}

internal sealed interface AndroidHomeWidgetState {
    data class Content(
        val day: TodayDay,
        val projection: AndroidHomeWidgetProjection,
        val notice: String? = null,
    ) : AndroidHomeWidgetState

    data object SignedOut : AndroidHomeWidgetState
    data object Unavailable : AndroidHomeWidgetState
}

internal enum class AndroidHomeWidgetRequestKind {
    INITIAL_LOAD,
    CANONICAL_REFRESH,
    ACTION,
}

internal fun shouldShowAndroidHomeWidgetLoading(kind: AndroidHomeWidgetRequestKind): Boolean =
    kind == AndroidHomeWidgetRequestKind.INITIAL_LOAD

internal class AndroidHomeWidgetController(
    private val repository: TodayRepository,
    private val now: () -> Instant = Instant::now,
) {
    fun refresh(): AndroidHomeWidgetState = readCanonical()

    fun perform(action: AndroidHomeWidgetAction): AndroidHomeWidgetState {
        val before = readCanonical()
        val content = before as? AndroidHomeWidgetState.Content ?: return before
        val plan = resolveAndroidHomeWidgetAction(content.day, action)
        val mutation = when (plan) {
            AndroidHomeWidgetActionPlan.Stale -> return content
            is AndroidHomeWidgetActionPlan.Start -> runCatching {
                repository.startTask(plan.task, plan.placementRevision)
            }.getOrNull()
            is AndroidHomeWidgetActionPlan.Complete -> runCatching {
                repository.completeTask(plan.task)
            }.getOrNull()
        }

        if (mutation is TodayMutationResult.Unauthorized) return AndroidHomeWidgetState.SignedOut

        // A response can be ambiguous after the server has committed. Never invent local
        // lifecycle state; render only a fresh canonical read after every dispatched command.
        val after = readCanonical()
        return if ((mutation == null || mutation is TodayMutationResult.Failure) && after is AndroidHomeWidgetState.Content) {
            after.copy(notice = "操作を完了できませんでした。最新の状態を表示しています。")
        } else {
            after
        }
    }

    private fun readCanonical(): AndroidHomeWidgetState {
        val result = runCatching { repository.loadDay() }.getOrNull()
            ?: return AndroidHomeWidgetState.Unavailable
        return when (result) {
            is TodayResult.Success -> {
                if (!result.day.isCurrent) return AndroidHomeWidgetState.Unavailable
                val projection = projectAndroidHomeWidget(result.day, now())
                if (projection is AndroidHomeWidgetProjection.InvalidActiveState) {
                    AndroidHomeWidgetState.Unavailable
                } else {
                    AndroidHomeWidgetState.Content(result.day, projection)
                }
            }
            TodayResult.Unauthorized -> AndroidHomeWidgetState.SignedOut
            is TodayResult.Failure -> AndroidHomeWidgetState.Unavailable
        }
    }

}

internal class AndroidHomeWidgetActionGate {
    private var active = false
    private var refreshQueued = false

    @Synchronized
    fun tryBegin(isRefresh: Boolean): Boolean {
        if (active) {
            if (isRefresh) refreshQueued = true
            return false
        }
        active = true
        return true
    }

    /** Returns true once if an app refresh arrived while another Widget request was running. */
    @Synchronized
    fun finish(): Boolean {
        active = false
        val shouldRefresh = refreshQueued
        refreshQueued = false
        return shouldRefresh
    }
}
