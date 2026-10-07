package com.hedgetheapp.taskchute.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class AndroidHomeWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        if (shouldShowAndroidHomeWidgetLoading(AndroidHomeWidgetRequestKind.INITIAL_LOAD)) {
            appWidgetIds.forEach { AndroidHomeWidgetRenderer.loading(context, it) }
        }
        AndroidHomeWidgetIntents.requestRefresh(context, appWidgetIds)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        AndroidHomeWidgetBoundaryScheduler(context).cancelIfNoWidgets()
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        AndroidHomeWidgetBoundaryScheduler(context).cancelIfNoWidgets()
    }
}
