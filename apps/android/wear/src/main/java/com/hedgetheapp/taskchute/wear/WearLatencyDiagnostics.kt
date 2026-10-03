package com.hedgetheapp.taskchute.wear

import android.util.Log

/** Non-sensitive timing markers for the nonprod debug Wear invalidation path only. */
internal object WearLatencyDiagnostics {
    private val enabled: Boolean
        get() = BuildConfig.DEBUG && BuildConfig.TASKCHUTE_BASE_URL
            .startsWith("https://taskchute-web-nonprod.taskfulness-sync.workers.dev")

    fun mark(stage: String, durationMillis: Long? = null) {
        if (!enabled) return
        val duration = durationMillis?.let { " durationMs=$it" }.orEmpty()
        Log.i("TaskChuteWearTiming", "stage=$stage epochMs=${System.currentTimeMillis()}$duration")
    }
}
