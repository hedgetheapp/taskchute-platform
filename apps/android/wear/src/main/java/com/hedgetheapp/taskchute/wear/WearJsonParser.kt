package com.hedgetheapp.taskchute.wear

import org.json.JSONArray
import org.json.JSONObject

internal object WearJsonParser {
    fun parseDay(body: String): WearDay {
        val root = JSONObject(body)
        val day = root.getJSONObject("taskchute_day")
        val sectionsJson = root.getJSONArray("sections")
        val sections = (0 until sectionsJson.length()).map { index -> parseSection(sectionsJson.getJSONObject(index)) }
        val unsectionedJson = root.getJSONArray("unsectioned_entries")
        val unsectioned = (0 until unsectionedJson.length()).map { index -> parseTask(unsectionedJson.getJSONObject(index)) }
        val active = root.nullableObject("active_execution")?.let {
            WearExecution(it.getString("id"), it.getString("entry_id"), it.getString("started_at"), it.nullableInt("entry_estimate_seconds"))
        }
        val activeEntry = root.nullableObject("active_entry")?.let(::parseActiveEntry)
        val result = WearDay(
            logicalDate = day.getString("logical_date"),
            placementRevision = root.getInt("placement_revision"),
            sections = sections,
            unsectionedTasks = unsectioned,
            activeExecution = active,
            startInstant = day.optString("start_instant").takeUnless { it == "" || it == "null" },
            establishmentTimezone = day.optString("establishment_timezone").takeUnless { it == "" || it == "null" },
            activeEntry = activeEntry,
        )
        require(active == null || result.runningTask != null) { "Active Execution Entry is absent from current Day" }
        require(activeEntry == null || active?.entryId == activeEntry.id) { "Active Entry does not match Active Execution" }
        require(activeEntry == null || result.allTasks.none { it.id == activeEntry.id }) { "Active Entry must stay outside current Day rows" }
        require(activeEntry == null || activeEntry.lifecycle == WearLifecycle.RUNNING) { "Active Entry must be running" }
        require(activeEntry == null || activeEntry.estimateSeconds == active?.estimateSeconds) { "Active Entry estimate does not match Active Execution" }
        return result
    }

    private fun parseActiveEntry(value: JSONObject): WearActiveEntry {
        val lifecycle = when (value.getString("lifecycle_state")) {
            "running" -> WearLifecycle.RUNNING
            "planned" -> WearLifecycle.PLANNED
            "completed" -> WearLifecycle.COMPLETED
            else -> error("Unknown active Entry lifecycle state")
        }
        val task = value.getJSONObject("task")
        return WearActiveEntry(
            id = value.getString("id"),
            taskId = task.getString("id"),
            title = task.getString("title"),
            lifecycle = lifecycle,
            estimateSeconds = value.nullableInt("estimate_seconds"),
        )
    }

    private fun parseSection(value: JSONObject) = WearSection(
        id = value.getString("id"),
        title = value.getString("title"),
        startMinute = value.nullableInt("logical_start_minute"),
        endMinute = value.nullableInt("logical_end_minute"),
        tasks = value.getJSONArray("entries").mapObjects(::parseTask),
    )

    private fun parseTask(value: JSONObject): WearTask {
        val task = value.getJSONObject("task")
        val summary = value.nullableObject("execution_summary")
        val lifecycle = when (value.getString("lifecycle_state")) {
            "planned" -> WearLifecycle.PLANNED
            "running" -> WearLifecycle.RUNNING
            "completed" -> WearLifecycle.COMPLETED
            else -> error("Unknown lifecycle state")
        }
        return WearTask(
            id = value.getString("id"),
            title = task.getString("title"),
            lifecycle = lifecycle,
            estimateSeconds = value.nullableInt("estimate_seconds"),
            routineDerived = value.optJSONObject("routine") != null,
            executionId = summary?.optString("active_execution_id")?.takeUnless { it.isNullOrEmpty() || it == "null" }
                ?: summary?.optString("single_execution_id")?.takeUnless { it.isNullOrEmpty() || it == "null" },
            activeStartedAt = summary?.optString("active_started_at")?.takeUnless { it.isNullOrEmpty() || it == "null" },
            firstStartedAt = summary?.optString("first_started_at")?.takeUnless { it.isNullOrEmpty() || it == "null" },
            completedDurationSeconds = summary?.nullableInt("completed_duration_seconds"),
        )
    }

    private fun JSONObject.nullableObject(key: String): JSONObject? = if (isNull(key)) null else optJSONObject(key)
    private fun JSONObject.nullableInt(key: String): Int? = if (isNull(key)) null else getInt(key)
    private inline fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
        (0 until length()).map { index -> transform(getJSONObject(index)) }
}
