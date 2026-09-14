package com.hedgetheapp.taskchute.today

import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue

internal object TodayJsonParser {
    fun parse(body: String?): TodayDay {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("Today response must be an object")
        val taskChuteDay = root.objectField("taskchute_day")
        val logicalDate = taskChuteDay.stringField("logical_date")
        val sections = root.arrayField("sections").map { value -> parseSection(value.asObject()) }
        val unsectioned = root.arrayField("unsectioned_entries").map { value -> parseTask(value.asObject()) }
        val activeExecution = root.nullableObjectField("active_execution")?.let(::parseExecution)
        val day = TodayDay(
            logicalDate = logicalDate,
            isCurrent = root.booleanField("is_current"),
            planningEnabled = root.booleanField("planning_enabled"),
            placementRevision = root.intField("placement_revision"),
            sections = sections,
            unsectionedEntries = unsectioned,
            activeExecution = activeExecution,
        )
        require(activeExecution == null || day.allEntries.any { it.id == activeExecution.entryId }) {
            "active execution entry is missing from Today projection"
        }
        return day
    }

    private fun parseSection(value: JsonValue.Object): TodaySection = TodaySection(
        id = value.stringField("id"),
        title = value.stringField("title"),
        startMinute = value.nullableIntField("logical_start_minute"),
        endMinute = value.nullableIntField("logical_end_minute"),
        entries = value.arrayField("entries").map { it.asObject() }.map(::parseTask),
    )

    private fun parseTask(value: JsonValue.Object): TodayTask {
        val task = value.objectField("task")
        val lifecycle = when (value.stringField("lifecycle_state")) {
            "planned" -> LifecycleState.PLANNED
            "running" -> LifecycleState.RUNNING
            "completed" -> LifecycleState.COMPLETED
            else -> error("unknown Today lifecycle state")
        }
        val executionSummary = value.nullableObjectField("execution_summary")
        return TodayTask(
            id = value.stringField("id"),
            title = task.stringField("title"),
            lifecycleState = lifecycle,
            project = task.nullableObjectField("project")?.let {
                TodayProject(it.stringField("id"), it.stringField("title"))
            },
            mode = value.nullableObjectField("mode")?.let {
                TodayMode(it.stringField("id"), it.stringField("title"))
            },
            estimateSeconds = value.nullableIntField("estimate_seconds"),
            plannedStartMinute = value.nullableIntField("planned_start_minute"),
            executionId = executionSummary?.nullableStringField("active_execution_id"),
            activeStartedAt = executionSummary?.nullableStringField("active_started_at"),
        )
    }

    private fun parseExecution(value: JsonValue.Object): TodayExecution = TodayExecution(
        id = value.stringField("id"),
        entryId = value.stringField("entry_id"),
        startedAt = value.stringField("started_at"),
        estimateSeconds = value.nullableIntField("entry_estimate_seconds"),
    )

    private fun JsonValue.Object.objectField(name: String): JsonValue.Object =
        fields[name] as? JsonValue.Object ?: error("Today field '$name' must be an object")

    private fun JsonValue.Object.nullableObjectField(name: String): JsonValue.Object? = when (val value = fields[name]) {
        null, JsonValue.Null -> null
        is JsonValue.Object -> value
        else -> error("Today field '$name' must be an object or null")
    }

    private fun JsonValue.Object.arrayField(name: String): List<JsonValue> =
        (fields[name] as? JsonValue.Array)?.values ?: error("Today field '$name' must be an array")

    private fun JsonValue.Object.stringField(name: String): String =
        (fields[name] as? JsonValue.StringValue)?.value ?: error("Today field '$name' must be a string")

    private fun JsonValue.Object.nullableStringField(name: String): String? = when (val value = fields[name]) {
        null, JsonValue.Null -> null
        is JsonValue.StringValue -> value.value
        else -> error("Today field '$name' must be a string or null")
    }

    private fun JsonValue.Object.booleanField(name: String): Boolean =
        (fields[name] as? JsonValue.BooleanValue)?.value ?: error("Today field '$name' must be boolean")

    private fun JsonValue.Object.intField(name: String): Int =
        nullableIntField(name) ?: error("Today field '$name' must be an integer")

    private fun JsonValue.Object.nullableIntField(name: String): Int? = when (val value = fields[name]) {
        null, JsonValue.Null -> null
        is JsonValue.NumberValue -> value.value.toIntOrNull() ?: error("Today field '$name' must be an integer")
        else -> error("Today field '$name' must be an integer or null")
    }

    private fun JsonValue.asObject(): JsonValue.Object = this as? JsonValue.Object
        ?: error("Today collection item must be an object")
}
