package com.hedgetheapp.taskchute.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

class AndroidHomeWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { AndroidHomeWidgetRenderer.loading(context, it) }
        AndroidHomeWidgetIntents.requestRefresh(context, appWidgetIds)
    }
}
