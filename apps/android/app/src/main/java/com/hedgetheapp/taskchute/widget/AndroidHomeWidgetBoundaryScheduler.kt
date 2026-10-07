package com.hedgetheapp.taskchute.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import com.hedgetheapp.taskchute.today.LifecycleState
import java.security.MessageDigest
import java.time.Instant
import org.json.JSONObject

internal data class AndroidHomeWidgetBoundaryPlan(
    val identityKey: String,
    val triggerAtEpochMillis: Long,
)

internal enum class AndroidHomeWidgetBoundaryAlarmMode {
    EXACT,
    INEXACT,
}

internal data class AndroidHomeWidgetBoundaryAlarmRecord(
    val plan: AndroidHomeWidgetBoundaryPlan,
    val mode: AndroidHomeWidgetBoundaryAlarmMode,
)

internal sealed interface AndroidHomeWidgetBoundaryDecision {
    data object Keep : AndroidHomeWidgetBoundaryDecision
    data object Cancel : AndroidHomeWidgetBoundaryDecision
    data class Schedule(val record: AndroidHomeWidgetBoundaryAlarmRecord) : AndroidHomeWidgetBoundaryDecision
}

internal fun planAndroidHomeWidgetBoundary(
    state: AndroidHomeWidgetState,
    now: Instant,
): AndroidHomeWidgetBoundaryPlan? {
    val content = state as? AndroidHomeWidgetState.Content ?: return null
    if (!content.day.isCurrent) return null
    val running = content.projection as? AndroidHomeWidgetProjection.Running ?: return null
    val task = running.task
    val execution = content.day.activeExecution ?: return null
    val estimate = running.estimateSeconds?.takeIf { it > 0 } ?: return null
    if (task.lifecycleState != LifecycleState.RUNNING || task.id.isBlank() ||
        execution.id.isBlank() || execution.entryId != task.id ||
        task.executionId?.let { it != execution.id } == true ||
        running.startedAt != execution.startedAt
    ) {
        return null
    }

    val start = runCatching { Instant.parse(execution.startedAt) }.getOrNull() ?: return null
    val boundary = runCatching { start.plusSeconds(estimate.toLong()) }.getOrNull() ?: return null
    // Today derives elapsed in whole seconds. If the exact-boundary refresh lands within
    // that same second, keep one final one-shot for the first positive overrun second.
    val trigger = when {
        boundary.isAfter(now) -> boundary
        running.remainingSeconds == 0L && running.overrunSeconds == null ->
            runCatching { boundary.plusSeconds(1) }.getOrNull() ?: return null
        else -> return null
    }
    if (!trigger.isAfter(now)) return null
    val triggerAtEpochMillis = runCatching { trigger.toEpochMilli() }.getOrNull() ?: return null

    return AndroidHomeWidgetBoundaryPlan(
        identityKey = boundaryIdentityKey(task.id, execution.id, execution.startedAt, estimate, triggerAtEpochMillis),
        triggerAtEpochMillis = triggerAtEpochMillis,
    )
}

internal fun androidHomeWidgetBoundaryAlarmMode(
    sdkInt: Int,
    canScheduleExactAlarms: Boolean,
): AndroidHomeWidgetBoundaryAlarmMode =
    if (sdkInt < 31 || canScheduleExactAlarms) {
        AndroidHomeWidgetBoundaryAlarmMode.EXACT
    } else {
        AndroidHomeWidgetBoundaryAlarmMode.INEXACT
    }

internal fun decideAndroidHomeWidgetBoundary(
    current: AndroidHomeWidgetBoundaryAlarmRecord?,
    desired: AndroidHomeWidgetBoundaryPlan?,
    mode: AndroidHomeWidgetBoundaryAlarmMode,
): AndroidHomeWidgetBoundaryDecision = when {
    desired == null && current == null -> AndroidHomeWidgetBoundaryDecision.Keep
    desired == null -> AndroidHomeWidgetBoundaryDecision.Cancel
    current?.plan == desired && current.mode == mode -> AndroidHomeWidgetBoundaryDecision.Keep
    else -> AndroidHomeWidgetBoundaryDecision.Schedule(AndroidHomeWidgetBoundaryAlarmRecord(desired, mode))
}

internal fun isCurrentAndroidHomeWidgetBoundaryAlarm(deliveredKey: String?, currentKey: String?): Boolean =
    !deliveredKey.isNullOrBlank() && deliveredKey == currentKey

private fun boundaryIdentityKey(
    entryId: String,
    executionId: String,
    startedAt: String,
    estimateSeconds: Int,
    triggerAtEpochMillis: Long,
): String {
    val identity = listOf(entryId, executionId, startedAt, estimateSeconds.toString(), triggerAtEpochMillis.toString())
        .joinToString(separator = "") { "${it.length}:$it" }
    val digest = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8))
    val hex = "0123456789abcdef"
    return buildString(digest.size * 2) {
        digest.forEach { byte ->
            val value = byte.toInt() and 0xff
            append(hex[value ushr 4])
            append(hex[value and 0x0f])
        }
    }
}

/** Keeps one presentation-only estimate-boundary wake-up for the currently rendered Widget state. */
internal class AndroidHomeWidgetBoundaryScheduler(context: Context) {
    private val appContext = context.applicationContext
    private val alarmManager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun reconcile(state: AndroidHomeWidgetState) {
        synchronized(LOCK) {
            if (AndroidHomeWidgetIntents.installedWidgetIds(appContext).isEmpty()) {
                cancelLocked()
                return
            }
            // A failed canonical read cannot prove that the active Execution changed.
            // Retain its one-shot alarm until a later canonical result can reconcile it.
            if (state is AndroidHomeWidgetState.Unavailable) return

            val now = Instant.now()
            val desired = planAndroidHomeWidgetBoundary(state, now)
            reconcileLocked(desired)
        }
    }

    fun cancelIfNoWidgets() {
        synchronized(LOCK) {
            if (AndroidHomeWidgetIntents.installedWidgetIds(appContext).isEmpty()) cancelLocked()
        }
    }

    fun onAlarm(intent: Intent) {
        val deliveredKey = intent.getStringExtra(EXTRA_BOUNDARY_KEY)
        val shouldRefresh = synchronized(LOCK) {
            val current = readRecord()
            if (!isCurrentAndroidHomeWidgetBoundaryAlarm(deliveredKey, current?.plan?.identityKey)) {
                false
            } else if (AndroidHomeWidgetIntents.installedWidgetIds(appContext).isEmpty()) {
                cancelLocked()
                false
            } else {
                cancelSystemAlarmLocked()
                writeRecord(null)
                true
            }
        }
        if (shouldRefresh) AndroidHomeWidgetIntents.requestRefresh(appContext)
    }

    /** Rebuilds the OS alarm after reboot/package replacement and re-evaluates exact access. */
    fun restorePendingBoundary() {
        val refreshNow = synchronized(LOCK) {
            val record = readRecord() ?: return
            if (AndroidHomeWidgetIntents.installedWidgetIds(appContext).isEmpty()) {
                cancelLocked()
                return
            }
            if (record.plan.triggerAtEpochMillis <= System.currentTimeMillis()) {
                cancelLocked()
                true
            } else {
                val mode = preferredMode()
                cancelSystemAlarmLocked()
                val restored = scheduleLocked(record.plan, mode)
                if (restored == null) {
                    writeRecord(null)
                } else {
                    writeRecord(AndroidHomeWidgetBoundaryAlarmRecord(record.plan, restored))
                }
                false
            }
        }
        if (refreshNow) AndroidHomeWidgetIntents.requestRefresh(appContext)
    }

    private fun reconcileLocked(desired: AndroidHomeWidgetBoundaryPlan?) {
        val current = readRecord()
        val mode = preferredMode()
        when (val decision = decideAndroidHomeWidgetBoundary(current, desired, mode)) {
            AndroidHomeWidgetBoundaryDecision.Keep -> Unit
            AndroidHomeWidgetBoundaryDecision.Cancel -> cancelLocked()
            is AndroidHomeWidgetBoundaryDecision.Schedule -> {
                cancelSystemAlarmLocked()
                // Persist before scheduling so a process death can recover the same PendingIntent.
                if (!writeRecord(decision.record)) return
                val actualMode = scheduleLocked(decision.record.plan, decision.record.mode)
                if (actualMode == null) {
                    cancelLocked()
                } else if (actualMode != decision.record.mode) {
                    writeRecord(decision.record.copy(mode = actualMode))
                }
            }
        }
    }

    private fun preferredMode(): AndroidHomeWidgetBoundaryAlarmMode {
        val canScheduleExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            runCatching { alarmManager.canScheduleExactAlarms() }.getOrDefault(false)
        return androidHomeWidgetBoundaryAlarmMode(Build.VERSION.SDK_INT, canScheduleExact)
    }

    private fun scheduleLocked(
        plan: AndroidHomeWidgetBoundaryPlan,
        requestedMode: AndroidHomeWidgetBoundaryAlarmMode,
    ): AndroidHomeWidgetBoundaryAlarmMode? {
        val pendingIntent = boundaryPendingIntent(plan.identityKey, PendingIntent.FLAG_UPDATE_CURRENT) ?: return null
        if (requestedMode == AndroidHomeWidgetBoundaryAlarmMode.EXACT) {
            try {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    plan.triggerAtEpochMillis,
                    pendingIntent,
                )
                return AndroidHomeWidgetBoundaryAlarmMode.EXACT
            } catch (_: SecurityException) {
                // Exact access can change between canScheduleExactAlarms() and this call.
            }
        }
        return runCatching {
            alarmManager.set(AlarmManager.RTC_WAKEUP, plan.triggerAtEpochMillis, pendingIntent)
            AndroidHomeWidgetBoundaryAlarmMode.INEXACT
        }.getOrNull()
    }

    private fun cancelLocked() {
        cancelSystemAlarmLocked()
        writeRecord(null)
    }

    private fun cancelSystemAlarmLocked() {
        val identityKey = readRecord()?.plan?.identityKey ?: return
        val pendingIntent = boundaryPendingIntent(identityKey, PendingIntent.FLAG_NO_CREATE) ?: return
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
    }

    private fun boundaryPendingIntent(identityKey: String, flag: Int): PendingIntent? {
        val intent = Intent(appContext, AndroidHomeWidgetBoundaryReceiver::class.java)
            .setAction(ACTION_ESTIMATE_BOUNDARY)
            .setData(Uri.parse("$BOUNDARY_INTENT_URI/$identityKey"))
            .putExtra(EXTRA_BOUNDARY_KEY, identityKey)
        return PendingIntent.getBroadcast(
            appContext,
            REQUEST_CODE,
            intent,
            flag or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun readRecord(): AndroidHomeWidgetBoundaryAlarmRecord? {
        val serialized = preferences.getString(KEY_RECORD, null) ?: return null
        return runCatching {
            val json = JSONObject(serialized)
            AndroidHomeWidgetBoundaryAlarmRecord(
                plan = AndroidHomeWidgetBoundaryPlan(
                    identityKey = json.getString("identity_key"),
                    triggerAtEpochMillis = json.getLong("trigger_at_epoch_millis"),
                ),
                mode = AndroidHomeWidgetBoundaryAlarmMode.valueOf(json.getString("mode")),
            )
        }.getOrNull()
    }

    private fun writeRecord(record: AndroidHomeWidgetBoundaryAlarmRecord?): Boolean {
        val editor = preferences.edit()
        if (record == null) {
            editor.remove(KEY_RECORD)
        } else {
            val json = JSONObject()
                .put("identity_key", record.plan.identityKey)
                .put("trigger_at_epoch_millis", record.plan.triggerAtEpochMillis)
                .put("mode", record.mode.name)
            editor.putString(KEY_RECORD, json.toString())
        }
        return editor.commit()
    }

    companion object {
        const val ACTION_ESTIMATE_BOUNDARY = "com.hedgetheapp.taskchute.widget.ACTION_ESTIMATE_BOUNDARY"
        const val EXTRA_BOUNDARY_KEY = "estimate_boundary_key"
        private const val PREFERENCES = "home_widget_boundary_alarm"
        private const val KEY_RECORD = "current_record"
        private const val REQUEST_CODE = 177
        private const val BOUNDARY_INTENT_URI = "taskchute://home-widget/estimate-boundary"
        private val LOCK = Any()
    }
}

class AndroidHomeWidgetBoundaryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AndroidHomeWidgetBoundaryScheduler.ACTION_ESTIMATE_BOUNDARY) return
        AndroidHomeWidgetBoundaryScheduler(context).onAlarm(intent)
    }
}

class AndroidHomeWidgetBoundaryRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED ->
                AndroidHomeWidgetBoundaryScheduler(context).restorePendingBoundary()
        }
    }
}
