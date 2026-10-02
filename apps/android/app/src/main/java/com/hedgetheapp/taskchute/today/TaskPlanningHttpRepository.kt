package com.hedgetheapp.taskchute.today

import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

class TaskPlanningHttpRepository(
    private val request: (method: String, path: String, body: String?) -> TodayHttpResponse?,
) : TaskPlanningRepository {
    private val ambiguousLifecycleOperationIds = mutableMapOf<String, String>()

    override fun loadReferences(): PlanningReferencesResult {
        val projectsResponse = execute("GET", "/api/v1/projects", null)
        if (projectsResponse !is PlanningHttpResult.Success) return projectsResponse.toReferencesResult()
        val modesResponse = execute("GET", "/api/v1/mode-board", null)
        if (modesResponse !is PlanningHttpResult.Success) return modesResponse.toReferencesResult()
        return runCatching {
            PlanningReferencesResult.Success(
                PlanningReferences(
                    projects = TaskPlanningJsonParser.parseProjects(projectsResponse.body),
                    modes = TaskPlanningJsonParser.parseModes(modesResponse.body),
                ),
            )
        }.getOrElse { PlanningReferencesResult.Failure("候補一覧を読み込めませんでした。再試行してください。") }
    }

    override fun save(editor: TaskEditorState, input: NormalizedTaskInput): PlanningSaveResult {
        return if (editor.mode == TaskEditorMode.CREATE) create(input, editor.day) else update(editor, input)
    }

    private fun create(input: NormalizedTaskInput, day: TodayDay): PlanningSaveResult {
        val taskId = input.clientTaskId ?: UUIDv7.next()
        val entryId = input.clientEntryId ?: UUIDv7.next()
        val operationId = UUIDv7.next()
        val logicalDateJson = if (day.isCurrent) "" else ",\"logical_date\":\"${JsonEncoding.escape(day.logicalDate)}\""
        val addBody = """
            {"operation_id":"${JsonEncoding.escape(operationId)}","task_id":"${JsonEncoding.escape(taskId)}","entry_id":"${JsonEncoding.escape(entryId)}","project_id":${nullableString(input.projectId)},"mode_id":${nullableString(input.modeId)},"title":"${JsonEncoding.escape(input.title)}","taskchute_day_id":"${JsonEncoding.escape(day.taskChuteDayId!!)}","section_id":${nullableString(input.sectionId)},"planned_start_minute":${input.plannedStartMinute ?: "null"},"expected_placement_revision":${day.placementRevision},"estimate_seconds":${input.estimateSeconds ?: "null"},"start_reminder_offset_minutes":${input.startReminderOffsetMinutes ?: "null"},"notify_on_estimate_overrun":${input.notifyOnEstimateOverrun}$logicalDateJson}
        """.trimIndent()
        val addPath = if (day.isCurrent) "/api/v1/taskchute-days/current/entries" else "/api/v1/taskchute-days/by-logical-date/entries"
        val added = execute("POST", addPath, addBody)
        var placementRevision = when (added) {
            PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
            is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(added.message)
            is PlanningHttpResult.Success -> runCatching { TaskPlanningJsonParser.parsePlacementRevision(added.body) }
                .getOrElse { return PlanningSaveResult.Failure("タスク追加結果を読み取れませんでした。再試行してください。") }
        }
        if (input.actualStartMinute != null) {
            when (val result = executeActualTimesForCreatedEntry(day, input, entryId, placementRevision)) {
                PlanningSaveResult.Success -> Unit
                is PlanningSaveResult.SuccessWithRevision -> placementRevision = result.placementRevision
                else -> return result
            }
        }
        return PlanningSaveResult.SuccessWithRevision(placementRevision)
    }

    private fun update(editor: TaskEditorState, input: NormalizedTaskInput): PlanningSaveResult {
        val task = editor.originalTask ?: return PlanningSaveResult.Failure("編集対象を取得できません。")
        val taskId = task.taskId ?: return PlanningSaveResult.Failure("編集対象のTask IDを取得できません。再読み込みしてください。")
        if (task.lifecycleState == LifecycleState.COMPLETED && input.actualStartMinute != null
            && input.actualEndMinute == null && task.executionId == null) {
            return PlanningSaveResult.Failure("複数の実行履歴があるため、このタスクを実行中へ戻せません。")
        }
        val currentProjectId = task.project?.id
        val currentModeId = task.mode?.id
        val currentSectionId = editor.day.sections.firstOrNull { section -> section.entries.any { it.id == task.id } }?.id
        if (editor.capability == TaskEditorCapability.ROUTINE_PLANNING) {
            val routineInput = synchronizeRoutineSectionPlan(editor.day, input)
            var placementRevision = editor.day.placementRevision
            if (currentSectionId != routineInput.sectionId || task.plannedStartMinute != routineInput.plannedStartMinute) {
                when (val result = executeRoutineSectionPlan(task, editor.day, routineInput.sectionId, routineInput.plannedStartMinute, placementRevision)) {
                    is PlanningSaveResult.SuccessWithRevision -> placementRevision = result.placementRevision
                    PlanningSaveResult.Success -> Unit
                    else -> return result
                }
            }
            if (task.estimateSeconds != routineInput.estimateSeconds) {
                when (val result = executeRoutineEstimate(task, editor.day, routineInput.estimateSeconds)) {
                    PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                    else -> return result
                }
            }
            when (val result = updateReminderSettingsIfChanged(task, taskId, input.title, currentProjectId, routineInput)) {
                PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                else -> return result
            }
            if (editor.day.isCurrent && routineInput.actualStartMinute != null) {
                return when (val actualResult = executeActualTimes(editor, routineInput, placementRevision)) {
                    PlanningSaveResult.Success -> PlanningSaveResult.SuccessWithRevision(placementRevision)
                    is PlanningSaveResult.SuccessWithRevision, PlanningSaveResult.Unauthorized, is PlanningSaveResult.Failure -> actualResult
                }
            }
            return PlanningSaveResult.SuccessWithRevision(placementRevision)
        }
        if (editor.capability != TaskEditorCapability.FULL_PLANNING) {
            if (!task.routineDerived && currentProjectId != input.projectId) {
                when (val result = executeTaskMetadata(task, taskId, input.projectId)) {
                    PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                    is PlanningHttpResult.Success -> Unit
                }
            }
            if (!task.routineDerived && currentModeId != input.modeId) {
                when (val result = executeMode(task, input.modeId)) {
                    PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                    is PlanningHttpResult.Success -> Unit
                }
            }
            if (task.lifecycleState == LifecycleState.RUNNING && task.estimateSeconds != input.estimateSeconds) {
                when (val result = if (task.routineDerived) {
                    executeRoutineEstimate(task, editor.day, input.estimateSeconds)
                } else {
                    executeEstimate(task.id, task.estimateSeconds, input.estimateSeconds)
                }) {
                    PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                    else -> return result
                }
            }
            when (val result = updateReminderSettingsIfChanged(task, taskId, task.title, currentProjectId, input)) {
                PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                else -> return result
            }
            return executeActualTimes(editor, input, editor.day.placementRevision)
        }
        if (task.title != input.title || currentProjectId != input.projectId) {
            when (val result = executeTaskMetadata(task, taskId, input.projectId, input.title)) {
                PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                is PlanningHttpResult.Success -> Unit
            }
        }
        if (currentModeId != input.modeId) {
            when (val result = executeMode(task, input.modeId)) {
                PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                is PlanningHttpResult.Success -> Unit
            }
        }
        var placementRevision = editor.day.placementRevision
        if (currentSectionId != input.sectionId) {
            val sectionMove = executeSectionMove(task, editor.day.taskChuteDayId, input.sectionId, placementRevision)
            when (val sectionResult = sectionMove.first) {
                PlanningSaveResult.Success -> placementRevision = sectionMove.second
                    ?: return PlanningSaveResult.Failure("Section移動結果を読み取れませんでした。再試行してください。")
                PlanningSaveResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                is PlanningSaveResult.Failure -> return sectionResult
                is PlanningSaveResult.SuccessWithRevision -> placementRevision = sectionResult.placementRevision
            }
        }
        if (task.estimateSeconds != input.estimateSeconds) {
            when (val result = executeEstimate(task.id, task.estimateSeconds, input.estimateSeconds)) {
                PlanningSaveResult.Success -> Unit
                else -> return result
            }
        }
        if (task.plannedStartMinute != input.plannedStartMinute) {
            when (val result = executePlannedStart(task.id, editor.day.taskChuteDayId, input.plannedStartMinute, placementRevision)) {
                PlanningSaveResult.Success -> Unit
                else -> return result
            }
        }
        when (val result = updateReminderSettingsIfChanged(task, taskId, input.title, input.projectId, input)) {
            PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
            else -> return result
        }
        return executeActualTimes(editor, input, placementRevision)
    }

    private fun updateReminderSettingsIfChanged(
        task: TodayTask,
        taskId: String,
        title: String,
        projectId: String?,
        input: NormalizedTaskInput,
    ): PlanningSaveResult {
        val startChanged = task.startReminderOffsetMinutes != input.startReminderOffsetMinutes
        val overrunChanged = task.notifyOnEstimateOverrun != input.notifyOnEstimateOverrun
        if (!startChanged && !overrunChanged) return PlanningSaveResult.Success
        val fields = buildString {
            if (startChanged) append(",\"start_reminder_offset_minutes\":${input.startReminderOffsetMinutes ?: "null"}")
            if (overrunChanged) append(",\"notify_on_estimate_overrun\":${input.notifyOnEstimateOverrun}")
        }
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","task_id":"${JsonEncoding.escape(taskId)}","expected_title":"${JsonEncoding.escape(title)}","expected_project_id":${nullableString(projectId)},"title":"${JsonEncoding.escape(title)}","project_id":${nullableString(projectId)}$fields}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/task-metadata", body).toSaveResult()
    }

    private fun executeActualTimes(
        editor: TaskEditorState,
        input: NormalizedTaskInput,
        placementRevision: Int,
    ): PlanningSaveResult {
        val task = editor.originalTask ?: return PlanningSaveResult.Success
        if (task.lifecycleState == LifecycleState.RUNNING && input.actualStartMinute == null && input.actualEndMinute == null) {
            return executeRevertEntryStart(editor, task)
        }
        if (input.actualStartMinute == null) return PlanningSaveResult.Success
        if (task.lifecycleState == LifecycleState.RUNNING && input.actualEndMinute == null
            && parseActualClock(formatExecutionClock(task.activeStartedAt, editor.day.establishmentTimezone)) == input.actualStartMinute) {
            return PlanningSaveResult.Success
        }
        val zone = editor.day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() }
            ?: return PlanningSaveResult.Failure("実績時間のタイムゾーンを取得できません。再読み込みしてください。")
        val expectedStartedAt = if (task.lifecycleState == LifecycleState.PLANNED) null else task.activeStartedAt ?: task.firstStartedAt
        val expectedEndedAt = if (task.lifecycleState == LifecycleState.PLANNED) null else task.lastEndedAt
        if (task.lifecycleState == LifecycleState.COMPLETED) {
            val unchangedStart = parseActualClock(formatExecutionClock(expectedStartedAt, editor.day.establishmentTimezone)) ==
                input.actualStartMinute
            val unchangedEnd = parseActualClock(formatExecutionClock(expectedEndedAt, editor.day.establishmentTimezone)) ==
                input.actualEndMinute
            if (unchangedStart && unchangedEnd) return PlanningSaveResult.Success
            if (task.executionId == null) {
                return PlanningSaveResult.Failure("複数の実行履歴があるため、実績時刻を変更できません。")
            }
        }
        val reopeningCompleted = task.lifecycleState == LifecycleState.COMPLETED && input.actualEndMinute == null
        val startedAt = if (reopeningCompleted) {
            val originalStart = expectedStartedAt
                ?: return PlanningSaveResult.Failure("再開する実行の開始時刻を取得できません。再読み込みしてください。")
            if (parseActualClock(formatExecutionClock(originalStart, editor.day.establishmentTimezone)) != input.actualStartMinute) {
                return PlanningSaveResult.Failure("実行中へ戻すときは開始時間を変更できません。")
            }
            originalStart
        } else {
            logicalMinuteToInstant(editor.day, input.actualStartMinute, zone)
        }
        val endedAt = input.actualEndMinute?.let { logicalMinuteToInstant(editor.day, it, zone) }
        val executionId = if (task.lifecycleState == LifecycleState.PLANNED) task.executionId ?: UUIDv7.next()
        else task.executionId ?: return PlanningSaveResult.Failure("対象の実行IDを取得できません。再読み込みしてください。")
        val expectedPlacement = if (task.lifecycleState == LifecycleState.PLANNED) {
            ",\"expected_placement_revision\":$placementRevision"
        } else {
            ""
        }
        val path = "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/execution-times"
        val inputPrecision = if (reopeningCompleted) "" else ",\"input_precision\":\"minute\""
        val payload = """
            {"entry_id":"${JsonEncoding.escape(task.id)}","execution_id":"${JsonEncoding.escape(executionId)}","expected_lifecycle_state":"${task.lifecycleState.name.lowercase()}","started_at":"${JsonEncoding.escape(startedAt)}","ended_at":${endedAt?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"},"expected_started_at":${expectedStartedAt?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"},"expected_ended_at":${expectedEndedAt?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"}$expectedPlacement$inputPrecision}
        """.trimIndent()
        return if (reopeningCompleted) {
            executeLifecycleMutation(path, payload).toSaveResult()
        } else {
            val body = payload.replaceFirst("{", "{\"operation_id\":\"${JsonEncoding.escape(UUIDv7.next())}\",")
            execute("POST", path, body).toSaveResult()
        }
    }

    private fun executeRevertEntryStart(editor: TaskEditorState, task: TodayTask): PlanningSaveResult {
        if (!editor.day.isCurrent) return PlanningSaveResult.Failure("開始の取り消しは今日のタスクだけ実行できます。")
        val executionId = task.executionId
            ?: return PlanningSaveResult.Failure("実行中のExecution IDを取得できません。再読み込みしてください。")
        val startedAt = task.activeStartedAt ?: task.firstStartedAt
            ?: return PlanningSaveResult.Failure("実行中の開始時刻を取得できません。再読み込みしてください。")
        val path = "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/revert-start"
        val payload = """
            {"entry_id":"${JsonEncoding.escape(task.id)}","execution_id":"${JsonEncoding.escape(executionId)}","expected_started_at":"${JsonEncoding.escape(startedAt)}"}
        """.trimIndent()
        return executeLifecycleMutation(path, payload).toSaveResult()
    }

    /** Reuse one operation identity for an unchanged D-156 intent after an ambiguous transport result. */
    private fun executeLifecycleMutation(path: String, payload: String): PlanningHttpResult {
        val intentKey = "$path|$payload"
        val operationId = ambiguousLifecycleOperationIds.getOrPut(intentKey, UUIDv7::next)
        val body = payload.replaceFirst("{", "{\"operation_id\":\"${JsonEncoding.escape(operationId)}\",")
        val result = execute("POST", path, body)
        when (result) {
            is PlanningHttpResult.Success -> ambiguousLifecycleOperationIds.remove(intentKey)
            PlanningHttpResult.Unauthorized -> Unit
            is PlanningHttpResult.Failure -> if (!result.ambiguous) ambiguousLifecycleOperationIds.remove(intentKey)
        }
        return result
    }

    private fun executeActualTimesForCreatedEntry(
        day: TodayDay,
        input: NormalizedTaskInput,
        entryId: String,
        placementRevision: Int,
    ): PlanningSaveResult {
        val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() }
            ?: return PlanningSaveResult.Failure("実績時間のタイムゾーンを取得できません。再読み込みしてください。")
        val startedAt = logicalMinuteToInstant(day, input.actualStartMinute!!, zone)
        val endedAt = input.actualEndMinute?.let { logicalMinuteToInstant(day, it, zone) }
        val expectedPlacement = ",\"expected_placement_revision\":$placementRevision"
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(entryId)}","execution_id":"${JsonEncoding.escape(UUIDv7.next())}","expected_lifecycle_state":"planned","started_at":"${JsonEncoding.escape(startedAt)}","ended_at":${endedAt?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"},"expected_started_at":null,"expected_ended_at":null$expectedPlacement,"input_precision":"minute"}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(entryId)}/execution-times", body).toSaveResult()
    }

    private fun logicalMinuteToInstant(day: TodayDay, minute: Int, zone: ZoneId): String {
        val date = LocalDate.parse(day.logicalDate).plusDays(if (minute < day.establishmentBoundaryMinutes) 1 else 0)
        return ZonedDateTime.of(date, LocalTime.of(minute / 60, minute % 60), zone).toInstant().toString()
    }

    private fun executeSectionMove(
        task: TodayTask,
        dayId: String?,
        sectionId: String?,
        expectedPlacementRevision: Int,
    ): Pair<PlanningSaveResult, Int?> {
        if (dayId == null) return PlanningSaveResult.Failure("編集対象の日を取得できません。") to null
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","section_id":${nullableString(sectionId)},"expected_placement_revision":$expectedPlacementRevision}
        """.trimIndent()
        return when (val result = execute("POST", "/api/v1/taskchute-days/current/entries/move", body)) {
            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized to null
            is PlanningHttpResult.Failure -> PlanningSaveResult.Failure(result.message) to null
            is PlanningHttpResult.Success -> runCatching { TaskPlanningJsonParser.parsePlacementRevision(result.body) }
                .map { PlanningSaveResult.Success to it }
                .getOrElse { PlanningSaveResult.Failure("Section移動結果を読み取れませんでした。") to null }
        }
    }
    private fun executeRoutineSectionPlan(
        task: TodayTask,
        day: TodayDay,
        sectionId: String?,
        plannedStartMinute: Int?,
        expectedPlacementRevision: Int,
    ): PlanningSaveResult {
        val dayId = day.taskChuteDayId ?: return PlanningSaveResult.Failure("編集対象の日を取得できません。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","section_id":${nullableString(sectionId)},"planned_start_minute":${plannedStartMinute ?: "null"},"expected_placement_revision":$expectedPlacementRevision,"action":"occurrence"}
        """.trimIndent()
        return when (val result = execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/routine-section-plan", body)) {
            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized
            is PlanningHttpResult.Failure -> PlanningSaveResult.Failure(result.message)
            is PlanningHttpResult.Success -> result.body?.let {
                runCatching { PlanningSaveResult.SuccessWithRevision(TaskPlanningJsonParser.parsePlacementRevision(it)) }
                    .getOrElse { PlanningSaveResult.Failure("RoutineのSection計画結果を読み取れませんでした。") }
            } ?: PlanningSaveResult.Success
        }
    }

    private fun executeRoutineEstimate(task: TodayTask, day: TodayDay, seconds: Int?): PlanningSaveResult {
        val dayId = day.taskChuteDayId ?: return PlanningSaveResult.Failure("編集対象の日を取得できません。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","estimate_seconds":${seconds ?: "null"},"action":"occurrence"}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/routine-estimate", body).toSaveResult()
    }

    private fun executeTaskMetadata(task: TodayTask, taskId: String, projectId: String?, title: String = task.title): PlanningHttpResult {
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","task_id":"${JsonEncoding.escape(taskId)}","expected_title":"${JsonEncoding.escape(task.title)}","expected_project_id":${nullableString(task.project?.id)},"title":"${JsonEncoding.escape(title)}","project_id":${nullableString(projectId)}}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/task-metadata", body)
    }

    private fun executeMode(task: TodayTask, modeId: String?): PlanningHttpResult {
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","expected_mode_id":${nullableString(task.mode?.id)},"mode_id":${nullableString(modeId)}}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/mode", body)
    }

    private fun executeEstimate(entryId: String, expectedSeconds: Int?, seconds: Int?): PlanningSaveResult {
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(entryId)}","estimate_seconds":${seconds ?: "null"}}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(entryId)}/estimate", body).toSaveResult()
    }

    private fun executePlannedStart(entryId: String, dayId: String?, minute: Int?, placementRevision: Int): PlanningSaveResult {
        if (dayId == null) return PlanningSaveResult.Failure("編集対象の日を取得できません。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(entryId)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","planned_start_minute":${minute ?: "null"},"expected_placement_revision":$placementRevision}
        """.trimIndent()
        return when (val result = execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(entryId)}/planned-start", body)) {
            is PlanningHttpResult.Success -> result.body?.let {
                runCatching { PlanningSaveResult.SuccessWithRevision(TaskPlanningJsonParser.parsePlacementRevision(it)) }
                    .getOrDefault(PlanningSaveResult.Success)
            } ?: PlanningSaveResult.Success
            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized
            is PlanningHttpResult.Failure -> PlanningSaveResult.Failure(result.message)
        }
    }

    private fun execute(method: String, path: String, body: String?): PlanningHttpResult {
        val response = runCatching { request(method, path, body) }.getOrNull()
            ?: return PlanningHttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
        return when {
            response.status == null -> PlanningHttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
            response.status == 401 -> PlanningHttpResult.Unauthorized
            response.status !in 200..299 -> PlanningHttpResult.Failure("Todayを更新できませんでした。再試行してください。",
                ambiguous = response.status >= 500)
            else -> PlanningHttpResult.Success(response.body)
        }
    }

    private fun nullableString(value: String?): String = value?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"
}

private sealed interface PlanningHttpResult {
    data class Success(val body: String?) : PlanningHttpResult
    data object Unauthorized : PlanningHttpResult
    data class Failure(val message: String, val ambiguous: Boolean = false) : PlanningHttpResult

    fun toSaveResult(): PlanningSaveResult = when (this) {
        is Success -> PlanningSaveResult.Success
        Unauthorized -> PlanningSaveResult.Unauthorized
        is Failure -> PlanningSaveResult.Failure(message)
    }

    fun toReferencesResult(): PlanningReferencesResult = when (this) {
        is Success -> PlanningReferencesResult.Failure("候補一覧を読み込めませんでした。再試行してください。")
        Unauthorized -> PlanningReferencesResult.Unauthorized
        is Failure -> PlanningReferencesResult.Failure(message)
    }
}

internal object TaskPlanningJsonParser {
    fun parseProjects(body: String?): List<TodayProject> = parseArray(body, "projects") { value ->
        TodayProject(value.stringField("id"), value.stringField("title"))
    }

    fun parseModes(body: String?): List<TodayMode> = parseArray(body, "modes") { value ->
        if (value.nullableBooleanField("archived") == true) null
        else TodayMode(value.stringField("id"), value.stringField("title"))
    }.filterNotNull()

    fun parsePlacementRevision(body: String?): Int {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("Add response must be an object")
        return root.intField("placement_revision")
    }

    private fun <T> parseArray(body: String?, name: String, mapper: (JsonValue.Object) -> T): List<T> {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("Reference response must be an object")
        return (root.fields[name] as? JsonValue.Array)?.values?.map { value ->
            mapper(value as? JsonValue.Object ?: error("Reference item must be an object"))
        } ?: error("Reference field '$name' must be an array")
    }

    private fun JsonValue.Object.stringField(name: String): String =
        (fields[name] as? JsonValue.StringValue)?.value ?: error("Field '$name' must be a string")

    private fun JsonValue.Object.nullableBooleanField(name: String): Boolean? = when (val value = fields[name]) {
        null, JsonValue.Null -> null
        is JsonValue.BooleanValue -> value.value
        else -> error("Field '$name' must be boolean or null")
    }

    private fun JsonValue.Object.intField(name: String): Int =
        (fields[name] as? JsonValue.NumberValue)?.value?.toIntOrNull() ?: error("Field '$name' must be an integer")
}
