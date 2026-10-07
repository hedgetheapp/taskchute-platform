package com.hedgetheapp.taskchute.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock

class AndroidHomeWidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val appContext = context.applicationContext
        val actionName = intent.action ?: return
        val isRefreshAction = actionName == AndroidHomeWidgetIntents.ACTION_REFRESH
        val isTaskAction = actionName == AndroidHomeWidgetIntents.ACTION_START ||
            actionName == AndroidHomeWidgetIntents.ACTION_COMPLETE
        if (!isRefreshAction && !isTaskAction) return

        val request = actionRequest(intent)
        val widgetId = intent.getIntExtra(AndroidHomeWidgetIntents.EXTRA_WIDGET_ID, AppWidgetManagerIds.INVALID)
        val installedIds = AndroidHomeWidgetIntents.installedWidgetIds(appContext)
        val ids = if (isRefreshAction) {
            val requestedIds = intent.getIntArrayExtra(AndroidHomeWidgetIntents.EXTRA_WIDGET_IDS)
            val requestedSet = requestedIds?.toSet()
            installedIds.filter { requestedSet == null || it in requestedSet }.toIntArray()
        } else {
            intArrayOf(widgetId).filter { it != AppWidgetManagerIds.INVALID && it in installedIds }.toIntArray()
        }
        if (ids.isEmpty()) return

        val isRefresh = isRefreshAction || request == null
        val pendingResult = goAsync()
        val gate = PROCESS_ACTION_GATE
        if (!runCatching { gate.tryBegin(isRefresh) }.getOrDefault(false)) {
            runCatching { pendingResult.finish() }
            return
        }

        request?.let { action ->
            runCatching {
                val presentation = when (action) {
                    is AndroidHomeWidgetAction.Start -> optimisticAndroidHomeWidgetStart(
                        intent.getStringExtra(AndroidHomeWidgetIntents.EXTRA_PRESENTATION_TASK_TITLE),
                        SystemClock.elapsedRealtime(),
                    )

                    is AndroidHomeWidgetAction.Complete -> if (
                        intent.getBooleanExtra(AndroidHomeWidgetIntents.EXTRA_PRESENTATION_PAYLOAD_AVAILABLE, false)
                    ) {
                        optimisticAndroidHomeWidgetComplete(
                            intent.getStringExtra(AndroidHomeWidgetIntents.EXTRA_PRESENTATION_TASK_TITLE)
                                ?.takeIf(String::isNotBlank)
                                ?.let { title ->
                                    AndroidHomeWidgetDisplayTask(
                                        title = title,
                                        metadata = intent.getStringExtra(AndroidHomeWidgetIntents.EXTRA_PRESENTATION_TASK_METADATA),
                                    )
                                },
                        )
                    } else {
                        null
                    }
                }
                presentation?.let { AndroidHomeWidgetRenderer.renderOptimistic(appContext, widgetId, it) }
            }
        }

        val finishPending = {
            val refreshAgain = runCatching(gate::finish).getOrDefault(false)
            runCatching { pendingResult.finish() }
            if (refreshAgain) runCatching { AndroidHomeWidgetIntents.requestRefresh(appContext) }
        }
        val worker = runCatching {
            Thread({
                try {
                    val requestKind = if (isRefresh) {
                        AndroidHomeWidgetRequestKind.CANONICAL_REFRESH
                    } else {
                        AndroidHomeWidgetRequestKind.ACTION
                    }
                    if (shouldShowAndroidHomeWidgetLoading(requestKind)) {
                        ids.forEach { AndroidHomeWidgetRenderer.loading(appContext, it) }
                    }
                    val runtime = createAndroidHomeWidgetRuntime(appContext)
                    val state = when (runtime) {
                        is AndroidHomeWidgetRuntime.Ready -> request?.let(runtime.controller::perform) ?: runtime.controller.refresh()
                        AndroidHomeWidgetRuntime.SignedOut -> AndroidHomeWidgetState.SignedOut
                        AndroidHomeWidgetRuntime.Unavailable -> AndroidHomeWidgetState.Unavailable
                    }
                    AndroidHomeWidgetBoundaryScheduler(appContext).reconcile(state)
                    ids.forEach { AndroidHomeWidgetRenderer.render(appContext, it, state) }
                } catch (_: Throwable) {
                    ids.forEach {
                        runCatching {
                            AndroidHomeWidgetRenderer.render(appContext, it, AndroidHomeWidgetState.Unavailable)
                        }
                    }
                } finally {
                    finishPending()
                }
            }, "taskchute-home-widget").apply { isDaemon = true }
        }.getOrElse {
            finishPending()
            return
        }
        if (runCatching { worker.start() }.isFailure) {
            finishPending()
        }
    }

    private fun actionRequest(intent: Intent): AndroidHomeWidgetAction? = when (intent.action) {
        AndroidHomeWidgetIntents.ACTION_START -> intent.getStringExtra(AndroidHomeWidgetIntents.EXTRA_ENTRY_ID)
            ?.takeIf { it.isNotBlank() }
            ?.let(AndroidHomeWidgetAction::Start)
        AndroidHomeWidgetIntents.ACTION_COMPLETE -> {
            val entryId = intent.getStringExtra(AndroidHomeWidgetIntents.EXTRA_ENTRY_ID)?.takeIf { it.isNotBlank() }
            val executionId = intent.getStringExtra(AndroidHomeWidgetIntents.EXTRA_EXECUTION_ID)?.takeIf { it.isNotBlank() }
            if (entryId == null || executionId == null) null else AndroidHomeWidgetAction.Complete(entryId, executionId)
        }
        else -> null
    }

    private object AppWidgetManagerIds {
        const val INVALID = -1
    }

    private companion object {
        val PROCESS_ACTION_GATE = AndroidHomeWidgetActionGate()
    }
}
