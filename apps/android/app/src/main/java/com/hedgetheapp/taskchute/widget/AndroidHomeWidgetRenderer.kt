package com.hedgetheapp.taskchute.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import com.hedgetheapp.taskchute.MainActivity
import com.hedgetheapp.taskchute.R
import com.hedgetheapp.taskchute.today.TodayTask

internal object AndroidHomeWidgetRenderer {
    fun loading(context: Context, widgetId: Int) {
        renderStatus(context, widgetId, R.string.home_widget_loading)
    }

    fun render(context: Context, widgetId: Int, state: AndroidHomeWidgetState) {
        when (state) {
            AndroidHomeWidgetState.SignedOut -> renderStatus(context, widgetId, R.string.home_widget_signed_out)
            AndroidHomeWidgetState.Unavailable -> renderStatus(context, widgetId, R.string.home_widget_unavailable)
            is AndroidHomeWidgetState.Content -> renderContent(context, widgetId, state)
        }
    }

    fun renderOptimistic(
        context: Context,
        widgetId: Int,
        presentation: AndroidHomeWidgetOptimisticPresentation,
    ) {
        val views = optimisticViews(context, presentation)
        AppWidgetManager.getInstance(context).partiallyUpdateAppWidget(widgetId, views)
    }

    internal fun optimisticViews(
        context: Context,
        presentation: AndroidHomeWidgetOptimisticPresentation,
    ): RemoteViews = RemoteViews(context.packageName, R.layout.taskchute_home_widget).apply {
        setViewVisibility(R.id.home_widget_notice, View.GONE)
        setViewVisibility(R.id.home_widget_status, View.GONE)
        when (presentation) {
            is AndroidHomeWidgetOptimisticPresentation.Running -> {
                setViewVisibility(R.id.home_widget_running_content, View.VISIBLE)
                setViewVisibility(R.id.home_widget_idle_content, View.GONE)
                setTextViewText(R.id.home_widget_running_title, presentation.title)
                setChronometer(
                    R.id.home_widget_elapsed,
                    presentation.tapElapsedRealtimeMillis,
                    "%s",
                    true,
                )
                setViewVisibility(R.id.home_widget_remaining_row, View.GONE)
                setViewVisibility(R.id.home_widget_overrun_row, View.GONE)
                setViewVisibility(R.id.home_widget_progress, View.GONE)
                setViewVisibility(R.id.home_widget_progress_overrun, View.GONE)
                setViewVisibility(R.id.home_widget_running_next_row, View.GONE)
                setViewVisibility(R.id.home_widget_running_no_next, View.GONE)
                setViewVisibility(R.id.home_widget_complete_action, View.GONE)
                setOnClickPendingIntent(R.id.home_widget_complete_action, null)
            }

            is AndroidHomeWidgetOptimisticPresentation.Idle -> {
                setViewVisibility(R.id.home_widget_running_content, View.GONE)
                setViewVisibility(R.id.home_widget_idle_content, View.VISIBLE)
                val next = presentation.nextPlanned
                if (next == null) {
                    setViewVisibility(R.id.home_widget_idle_task_row, View.GONE)
                    setViewVisibility(R.id.home_widget_idle_empty, View.VISIBLE)
                } else {
                    setViewVisibility(R.id.home_widget_idle_task_row, View.VISIBLE)
                    setViewVisibility(R.id.home_widget_idle_empty, View.GONE)
                    setTextViewText(R.id.home_widget_idle_task_title, next.title)
                    if (next.metadata.isNullOrBlank()) {
                        setViewVisibility(R.id.home_widget_idle_task_metadata, View.GONE)
                    } else {
                        setViewVisibility(R.id.home_widget_idle_task_metadata, View.VISIBLE)
                        setTextViewText(R.id.home_widget_idle_task_metadata, next.metadata)
                    }
                }
                setViewVisibility(R.id.home_widget_idle_start_action, View.GONE)
                setOnClickPendingIntent(R.id.home_widget_idle_start_action, null)
            }
        }
    }

    private fun renderStatus(context: Context, widgetId: Int, messageRes: Int) {
        val views = baseViews(context, widgetId)
        views.setViewVisibility(R.id.home_widget_running_content, android.view.View.GONE)
        views.setViewVisibility(R.id.home_widget_idle_content, android.view.View.GONE)
        views.setViewVisibility(R.id.home_widget_notice, android.view.View.GONE)
        views.setViewVisibility(R.id.home_widget_status, android.view.View.VISIBLE)
        views.setTextViewText(R.id.home_widget_status, context.getString(messageRes))
        update(context, widgetId, views)
    }

    private fun renderContent(context: Context, widgetId: Int, state: AndroidHomeWidgetState.Content) {
        val views = baseViews(context, widgetId)
        state.notice?.let { notice ->
            views.setViewVisibility(R.id.home_widget_notice, android.view.View.VISIBLE)
            views.setTextViewText(R.id.home_widget_notice, notice)
        } ?: views.setViewVisibility(R.id.home_widget_notice, android.view.View.GONE)
        views.setViewVisibility(R.id.home_widget_status, android.view.View.GONE)

        when (val projection = state.projection) {
            is AndroidHomeWidgetProjection.Running -> {
                views.setViewVisibility(R.id.home_widget_running_content, android.view.View.VISIBLE)
                views.setViewVisibility(R.id.home_widget_idle_content, android.view.View.GONE)
                views.setTextViewText(R.id.home_widget_running_title, projection.task.title)
                val elapsedMillis = projection.elapsedSeconds?.let { it.coerceAtLeast(0L) * 1000L }
                val chronometerBase = SystemClock.elapsedRealtime() - (elapsedMillis ?: 0L)
                views.setChronometer(R.id.home_widget_elapsed, chronometerBase, "%s", projection.elapsedSeconds != null)
                if (projection.elapsedSeconds == null) {
                    views.setTextViewText(R.id.home_widget_elapsed, "--:--:--")
                }

                views.setViewVisibility(R.id.home_widget_remaining_row, android.view.View.GONE)
                views.setViewVisibility(R.id.home_widget_overrun_row, android.view.View.GONE)
                if (projection.estimateSeconds != null) {
                    val overrun = projection.overrunSeconds
                    if (overrun != null && overrun > 0L) {
                        views.setViewVisibility(R.id.home_widget_overrun_row, android.view.View.VISIBLE)
                        val overrunBase = SystemClock.elapsedRealtime() - overrun.coerceAtLeast(0L) * 1000L
                        views.setChronometer(R.id.home_widget_overrun, overrunBase, "+%s", true)
                    } else {
                        views.setViewVisibility(R.id.home_widget_remaining_row, android.view.View.VISIBLE)
                        val remaining = projection.remainingSeconds
                        if (remaining == null) {
                            views.setChronometer(R.id.home_widget_remaining, SystemClock.elapsedRealtime(), "%s", false)
                            views.setTextViewText(R.id.home_widget_remaining, "--:--:--")
                        } else {
                            val remainingBase = SystemClock.elapsedRealtime() + remaining.coerceAtLeast(0L) * 1000L
                            views.setChronometerCountDown(R.id.home_widget_remaining, true)
                            views.setChronometer(R.id.home_widget_remaining, remainingBase, "%s", true)
                        }
                    }
                }

                val progress = projection.progressPermille
                if (progress != null && projection.overrunSeconds == null) {
                    views.setViewVisibility(R.id.home_widget_progress, android.view.View.VISIBLE)
                    views.setViewVisibility(R.id.home_widget_progress_overrun, android.view.View.GONE)
                    views.setProgressBar(R.id.home_widget_progress, 1000, progress, false)
                } else if (progress != null) {
                    views.setViewVisibility(R.id.home_widget_progress, android.view.View.GONE)
                    views.setViewVisibility(R.id.home_widget_progress_overrun, android.view.View.VISIBLE)
                    views.setProgressBar(R.id.home_widget_progress_overrun, 1000, progress, false)
                } else {
                    views.setViewVisibility(R.id.home_widget_progress, android.view.View.GONE)
                    views.setViewVisibility(R.id.home_widget_progress_overrun, android.view.View.GONE)
                }

                val next = projection.nextPlanned
                if (next == null) {
                    views.setViewVisibility(R.id.home_widget_running_next_row, android.view.View.GONE)
                    views.setViewVisibility(R.id.home_widget_running_no_next, android.view.View.VISIBLE)
                } else {
                    views.setViewVisibility(R.id.home_widget_running_next_row, android.view.View.VISIBLE)
                    views.setViewVisibility(R.id.home_widget_running_no_next, android.view.View.GONE)
                    setTaskText(views, R.id.home_widget_running_next_title, R.id.home_widget_running_next_metadata, next)
                }

                val executionId = projection.task.executionId
                    ?: state.day.activeExecution?.takeIf { it.entryId == projection.task.id }?.id
                if (executionId != null) {
                    val completeIntent = AndroidHomeWidgetIntents.actionPendingIntent(
                        context,
                        widgetId,
                        AndroidHomeWidgetAction.Complete(projection.task.id, executionId),
                        projection.nextPlanned?.toDisplayTask(),
                    )
                    views.setOnClickPendingIntent(R.id.home_widget_complete_action, completeIntent)
                    views.setContentDescription(
                        R.id.home_widget_complete_action,
                        context.getString(R.string.home_widget_complete_action),
                    )
                } else {
                    views.setViewVisibility(R.id.home_widget_complete_action, android.view.View.GONE)
                }
            }

            is AndroidHomeWidgetProjection.Idle -> {
                views.setViewVisibility(R.id.home_widget_running_content, android.view.View.GONE)
                views.setViewVisibility(R.id.home_widget_idle_content, android.view.View.VISIBLE)
                val next = projection.nextPlanned
                if (next == null) {
                    views.setViewVisibility(R.id.home_widget_idle_task_row, android.view.View.GONE)
                    views.setViewVisibility(R.id.home_widget_idle_empty, android.view.View.VISIBLE)
                } else {
                    views.setViewVisibility(R.id.home_widget_idle_task_row, android.view.View.VISIBLE)
                    views.setViewVisibility(R.id.home_widget_idle_empty, android.view.View.GONE)
                    setTaskText(views, R.id.home_widget_idle_task_title, R.id.home_widget_idle_task_metadata, next)
                    val startIntent = AndroidHomeWidgetIntents.actionPendingIntent(
                        context,
                        widgetId,
                        AndroidHomeWidgetAction.Start(next.id),
                        next.toDisplayTask(),
                    )
                    views.setOnClickPendingIntent(R.id.home_widget_idle_start_action, startIntent)
                    views.setContentDescription(
                        R.id.home_widget_idle_start_action,
                        context.getString(R.string.home_widget_start_action),
                    )
                }
            }

            AndroidHomeWidgetProjection.InvalidActiveState -> {
                renderStatus(context, widgetId, R.string.home_widget_unavailable)
                return
            }
        }
        update(context, widgetId, views)
    }

    private fun setTaskText(views: RemoteViews, titleId: Int, metadataId: Int, task: TodayTask) {
        views.setTextViewText(titleId, task.title)
        val metadata = formatAndroidHomeWidgetPlannedMetadata(task)
        if (metadata == null) {
            views.setViewVisibility(metadataId, android.view.View.GONE)
        } else {
            views.setViewVisibility(metadataId, android.view.View.VISIBLE)
            views.setTextViewText(metadataId, metadata)
        }
    }

    private fun TodayTask.toDisplayTask() = AndroidHomeWidgetDisplayTask(
        title = title,
        metadata = formatAndroidHomeWidgetPlannedMetadata(this),
    )

    private fun baseViews(context: Context, widgetId: Int): RemoteViews =
        RemoteViews(context.packageName, R.layout.taskchute_home_widget).apply {
            setOnClickPendingIntent(R.id.home_widget_root, AndroidHomeWidgetIntents.openAppPendingIntent(context, widgetId))
        }

    private fun update(context: Context, widgetId: Int, views: RemoteViews) {
        AppWidgetManager.getInstance(context).updateAppWidget(widgetId, views)
    }

}

internal object AndroidHomeWidgetIntents {
    const val ACTION_REFRESH = "com.hedgetheapp.taskchute.widget.ACTION_REFRESH"
    const val ACTION_START = "com.hedgetheapp.taskchute.widget.ACTION_START"
    const val ACTION_COMPLETE = "com.hedgetheapp.taskchute.widget.ACTION_COMPLETE"
    const val EXTRA_WIDGET_ID = "widget_id"
    const val EXTRA_ENTRY_ID = "entry_id"
    const val EXTRA_EXECUTION_ID = "execution_id"
    const val EXTRA_WIDGET_IDS = "widget_ids"
    const val EXTRA_PRESENTATION_PAYLOAD_AVAILABLE = "presentation_payload_available"
    const val EXTRA_PRESENTATION_TASK_TITLE = "presentation_task_title"
    const val EXTRA_PRESENTATION_TASK_METADATA = "presentation_task_metadata"

    fun actionPendingIntent(
        context: Context,
        widgetId: Int,
        action: AndroidHomeWidgetAction,
        presentationTask: AndroidHomeWidgetDisplayTask? = null,
    ): PendingIntent {
        val (actionName, entryId, executionId) = when (action) {
            is AndroidHomeWidgetAction.Start -> Triple(ACTION_START, action.entryId, null)
            is AndroidHomeWidgetAction.Complete -> Triple(ACTION_COMPLETE, action.entryId, action.executionId)
        }
        val identity = Uri.Builder()
            .scheme("taskchute")
            .authority("home-widget")
            .appendPath(widgetId.toString())
            .appendPath(actionName.substringAfterLast('.'))
            .appendPath(entryId)
            .apply { executionId?.let(::appendPath) }
            .build()
        val intent = Intent(context, AndroidHomeWidgetActionReceiver::class.java)
            .setAction(actionName)
            .setData(identity)
            .putExtra(EXTRA_WIDGET_ID, widgetId)
            .putExtra(EXTRA_ENTRY_ID, entryId)
            .putExtra(EXTRA_PRESENTATION_PAYLOAD_AVAILABLE, true)
            .putExtra(EXTRA_PRESENTATION_TASK_TITLE, presentationTask?.title)
            .putExtra(EXTRA_PRESENTATION_TASK_METADATA, presentationTask?.metadata)
            .apply { executionId?.let { putExtra(EXTRA_EXECUTION_ID, it) } }
        return PendingIntent.getBroadcast(context, widgetId, intent, pendingIntentFlags())
    }

    fun openAppPendingIntent(context: Context, widgetId: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .setAction("${context.packageName}.OPEN_HOME_WIDGET")
            .setData(Uri.Builder().scheme("taskchute").authority("open-home-widget").appendPath(widgetId.toString()).build())
        return PendingIntent.getActivity(context, widgetId, intent, pendingIntentFlags())
    }

    fun requestRefresh(context: Context, widgetIds: IntArray? = null) {
        val installed = installedWidgetIds(context)
        val validIds = widgetIds?.filter { it in installed }?.toIntArray() ?: installed
        if (validIds.isEmpty()) return
        val intent = Intent(context, AndroidHomeWidgetActionReceiver::class.java)
            .setAction(ACTION_REFRESH)
            .putExtra(EXTRA_WIDGET_IDS, validIds)
        context.sendBroadcast(intent)
    }

    fun installedWidgetIds(context: Context): IntArray = AppWidgetManager.getInstance(context)
        .getAppWidgetIds(ComponentName(context, AndroidHomeWidgetProvider::class.java))

    private fun pendingIntentFlags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
}
