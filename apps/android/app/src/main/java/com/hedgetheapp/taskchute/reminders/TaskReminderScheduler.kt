package com.hedgetheapp.taskchute.reminders

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.hedgetheapp.taskchute.MainActivity
import com.hedgetheapp.taskchute.R
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayTask
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

/** Reconciles only canonical Today projections; this registry is a local alarm cache, not Task authority. */
class TaskReminderScheduler(context: Context) {
    private val appContext = context.applicationContext
    private val alarmManager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    @Synchronized
    fun reconcile(day: TodayDay) {
        if (day.establishmentTimezone.isNullOrBlank()) return
        val previous = readRecords()
        val next = previous.filterValues { it.logicalDate != day.logicalDate }.toMutableMap()
        val now = Instant.now()
        day.allEntries.forEach { task ->
            reminderTriggers(day, task).forEach { trigger ->
                if (!shouldScheduleTrigger(trigger, now)) return@forEach
                val key = reminderKey(day, task, trigger)
                val record = AlarmRecord(
                    key = key,
                    logicalDate = day.logicalDate,
                    entryId = task.id,
                    taskId = task.taskId.orEmpty(),
                    taskTitle = task.title,
                    plannedStartMinute = task.plannedStartMinute,
                    kind = trigger.kind,
                    triggerEpochMillis = trigger.instant.toEpochMilli(),
                    executionId = trigger.executionId,
                    startOffsetMinutes = task.startReminderOffsetMinutes,
                    estimateSeconds = task.estimateSeconds,
                )
                if (trigger.kind == ReminderTrigger.Kind.OVERRUN && !trigger.instant.isAfter(now)) {
                    val executionId = trigger.executionId!!
                    if (canPostNotifications() && !wasOverrunDelivered(executionId) && post(record)) {
                        markOverrunDelivered(executionId)
                    }
                } else {
                    next[key] = record
                }
            }
        }
        previous.values.filter { it.logicalDate == day.logicalDate && !next.containsKey(it.key) }.forEach(::cancel)
        next.values.filter { it.logicalDate == day.logicalDate }.forEach(::scheduleFuture)
        writeRecords(next)
    }

    /** Reboot/package/permission restoration schedules only future alarms; overdue delivery waits for canonical reload. */
    @Synchronized
    fun restoreFutureAlarms() {
        readRecords().values.forEach { record ->
            if (record.triggerEpochMillis > System.currentTimeMillis()) scheduleFuture(record) else cancel(record)
        }
    }

    @Synchronized
    fun onAlarm(intent: Intent) {
        val key = intent.getStringExtra(EXTRA_KEY) ?: return
        val record = readRecords()[key] ?: return
        // Keep the canonical intent recoverable if permission was revoked after scheduling.
        if (!canPostNotifications()) return
        if (record.kind == ReminderTrigger.Kind.OVERRUN) {
            val execution = record.executionId ?: return
            if (wasOverrunDelivered(execution)) return
            if (!post(record)) return
            markOverrunDelivered(execution)
        } else if (!post(record)) {
            return
        }
        val current = readRecords().toMutableMap()
        current.remove(key)
        writeRecords(current)
    }

    private fun scheduleFuture(record: AlarmRecord) {
        if (!canScheduleExact() || !canPostNotifications()) {
            cancel(record)
            return
        }
        if (record.triggerEpochMillis <= System.currentTimeMillis()) return
        runCatching {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, record.triggerEpochMillis, alarmPendingIntent(record))
        }.onFailure { cancel(record) }
    }

    private fun canScheduleExact(): Boolean = Build.VERSION.SDK_INT < 31 || alarmManager.canScheduleExactAlarms()

    private fun canPostNotifications(): Boolean =
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(appContext, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && NotificationManagerCompat.from(appContext).areNotificationsEnabled()

    private fun alarmPendingIntent(record: AlarmRecord): PendingIntent {
        val intent = Intent(appContext, TaskReminderAlarmReceiver::class.java)
            .setAction(ACTION_ALARM)
            .setData(android.net.Uri.parse("taskchute-reminder://${android.net.Uri.encode(record.key)}"))
            .putExtra(EXTRA_KEY, record.key)
        return PendingIntent.getBroadcast(appContext, stableId(record.key), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun cancel(record: AlarmRecord) {
        val intent = Intent(appContext, TaskReminderAlarmReceiver::class.java)
            .setAction(ACTION_ALARM)
            .setData(android.net.Uri.parse("taskchute-reminder://${android.net.Uri.encode(record.key)}"))
        val pending = PendingIntent.getBroadcast(appContext, stableId(record.key), intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE) ?: return
        alarmManager.cancel(pending)
        pending.cancel()
    }

    private fun post(record: AlarmRecord): Boolean {
        if (!canPostNotifications()) return false
        val manager = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "TaskChute タスク通知", NotificationManager.IMPORTANCE_HIGH))
        }
        val openToday = PendingIntent.getActivity(appContext, stableId("open:${record.key}"),
            Intent(appContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val start = record.kind == ReminderTrigger.Kind.START
        val offset = record.startOffsetMinutes ?: 0
        val title = if (start) {
            if (offset == 0) "開始予定です" else "開始予定 ${if (offset == 60) "1時間前" else "${offset}分前"}"
        } else "見積を超えました"
        val detail = if (start) {
            val plannedTime = record.plannedStartMinute?.let { minute ->
                String.format(java.util.Locale.ROOT, "%02d:%02d", (minute / 60) % 24, minute % 60)
            }
            if (plannedTime == null) record.taskTitle else "${record.taskTitle} · $plannedTime"
        } else "${record.taskTitle} · 見積 ${((record.estimateSeconds ?: 0) / 60)}分"
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_material_schedule_24)
            .setContentTitle(title)
            .setContentText(detail)
            .setStyle(NotificationCompat.BigTextStyle().bigText(detail))
            .setContentIntent(openToday)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build()
        return runCatching {
            NotificationManagerCompat.from(appContext).notify(stableId(record.key), notification)
            true
        }.getOrDefault(false)
    }

    private fun wasOverrunDelivered(executionId: String): Boolean =
        executionId in preferences.getStringSet(KEY_DELIVERED, emptySet()).orEmpty()

    private fun markOverrunDelivered(executionId: String): Boolean {
        val delivered = preferences.getStringSet(KEY_DELIVERED, emptySet()).orEmpty().toMutableSet()
        if (executionId in delivered) return false
        delivered += executionId
        preferences.edit().putStringSet(KEY_DELIVERED, delivered).apply()
        return true
    }

    private fun readRecords(): Map<String, AlarmRecord> {
        val array = runCatching { JSONArray(preferences.getString(KEY_RECORDS, "[]")) }.getOrNull() ?: return emptyMap()
        return buildMap {
            for (index in 0 until array.length()) {
                val item = runCatching { array.getJSONObject(index) }.getOrNull() ?: continue
                val record = runCatching { AlarmRecord.fromJson(item) }.getOrNull() ?: continue
                put(record.key, record)
            }
        }
    }

    private fun writeRecords(records: Map<String, AlarmRecord>) {
        val array = JSONArray()
        records.values.forEach { array.put(it.toJson()) }
        preferences.edit().putString(KEY_RECORDS, array.toString()).apply()
    }

    private fun reminderKey(day: TodayDay, task: TodayTask, trigger: ReminderTrigger): String = when (trigger.kind) {
        ReminderTrigger.Kind.START -> "${day.taskChuteDayId}:${task.id}:start"
        ReminderTrigger.Kind.OVERRUN -> "${day.taskChuteDayId}:${task.id}:overrun:${trigger.executionId}"
    }

    private data class AlarmRecord(
        val key: String,
        val logicalDate: String,
        val entryId: String,
        val taskId: String,
        val taskTitle: String,
        val plannedStartMinute: Int?,
        val kind: ReminderTrigger.Kind,
        val triggerEpochMillis: Long,
        val executionId: String?,
        val startOffsetMinutes: Int?,
        val estimateSeconds: Int?,
    ) {
        fun toJson() = JSONObject().put("key", key).put("logical_date", logicalDate).put("entry_id", entryId)
            .put("task_id", taskId).put("task_title", taskTitle).put("planned_start_minute", plannedStartMinute)
            .put("kind", kind.name)
            .put("trigger_epoch_millis", triggerEpochMillis).put("execution_id", executionId)
            .put("start_offset_minutes", startOffsetMinutes).put("estimate_seconds", estimateSeconds)

        companion object {
            fun fromJson(value: JSONObject) = AlarmRecord(
                key = value.getString("key"), logicalDate = value.getString("logical_date"),
                entryId = value.getString("entry_id"), taskId = value.optString("task_id"),
                taskTitle = value.getString("task_title"),
                plannedStartMinute = if (value.isNull("planned_start_minute")) null else value.getInt("planned_start_minute"),
                kind = ReminderTrigger.Kind.valueOf(value.getString("kind")),
                triggerEpochMillis = value.getLong("trigger_epoch_millis"), executionId = value.optString("execution_id").takeIf(String::isNotBlank),
                startOffsetMinutes = if (value.isNull("start_offset_minutes")) null else value.getInt("start_offset_minutes"),
                estimateSeconds = if (value.isNull("estimate_seconds")) null else value.getInt("estimate_seconds"),
            )
        }
    }

    companion object {
        private const val PREFERENCES = "task_reminder_registry"
        private const val KEY_RECORDS = "records"
        private const val KEY_DELIVERED = "overrun_delivered_execution_ids"
        private const val CHANNEL_ID = "task_reminders"
        private const val ACTION_ALARM = "com.hedgetheapp.taskchute.reminders.ALARM"
        private const val EXTRA_KEY = "alarm_key"
        private fun stableId(value: String): Int = value.hashCode() and 0x7fffffff
    }
}

class TaskReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        TaskReminderScheduler(context).onAlarm(intent)
    }
}

class TaskReminderRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> TaskReminderScheduler(context).restoreFutureAlarms()
        }
    }
}
