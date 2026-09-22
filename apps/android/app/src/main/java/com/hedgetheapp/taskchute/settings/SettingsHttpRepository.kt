package com.hedgetheapp.taskchute.settings

import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue
import com.hedgetheapp.taskchute.today.JsonEncoding
import com.hedgetheapp.taskchute.today.TodayHttpResponse

class SettingsHttpRepository(
    private val request: (method: String, path: String, body: String?) -> TodayHttpResponse?,
    private val onUnauthorized: () -> Unit = {},
) : AndroidSettingsRepository {
    override fun loadSectionConfiguration(): SettingsResult<AndroidSectionConfiguration> =
        get("/api/v1/section-configuration") { parseSectionConfiguration(it) }

    override fun updateSectionConfiguration(request: SectionConfigurationUpdateRequest): SettingsResult<Unit> = mutation(
        "/api/v1/section-configuration",
        """{"operation_id":"${esc(request.operationId)}","configuration_version_id":"${esc(request.configurationVersionId)}","expected_configuration_version_id":"${esc(request.expectedConfigurationVersionId)}","items":[${request.items.joinToString(",") { item ->
            "{\"section_id\":\"${esc(item.id)}\",\"title\":\"${esc(item.title.trim())}\",\"logical_start_minute\":${item.startMinute},\"logical_end_minute\":${item.endMinute}}"
        }}]}""",
    )

    override fun loadProjectBoard(): SettingsResult<AndroidProjectBoard> =
        get("/api/v1/project-board") { parseProjectBoard(it) }

    override fun createProject(request: CreateProjectSettingsRequest): SettingsResult<Unit> = mutation(
        "/api/v1/projects",
        """{"operation_id":"${esc(request.operationId)}","project_id":"${esc(request.projectId)}","title":"${esc(request.title.trim())}"}""",
    )

    override fun updateProject(request: UpdateProjectSettingsRequest): SettingsResult<Unit> = mutation(
        "/api/v1/projects/${JsonEncoding.pathSegment(request.projectId)}",
        """{"operation_id":"${esc(request.operationId)}","project_id":"${esc(request.projectId)}","expected_settings_revision":${request.expectedSettingsRevision},"expected_title":"${esc(request.expectedTitle)}","title":"${esc(request.title.trim())}"}""",
    )

    override fun setProjectArchived(request: SetProjectArchivedSettingsRequest): SettingsResult<Unit> = mutation(
        "/api/v1/projects/${JsonEncoding.pathSegment(request.projectId)}/archive",
        """{"operation_id":"${esc(request.operationId)}","project_id":"${esc(request.projectId)}","archived":${request.archived},"expected_settings_revision":${request.expectedSettingsRevision}}""",
    )

    override fun reorderProjects(request: ReorderProjectsSettingsRequest): SettingsResult<Unit> = mutation(
        "/api/v1/projects/reorder",
        """{"operation_id":"${esc(request.operationId)}","project_ids":[${request.projectIds.joinToString(",") { "\"${esc(it)}\"" }}],"expected_board_revision":${request.expectedBoardRevision}}""",
    )

    override fun deleteProject(request: DeleteProjectSettingsRequest): SettingsResult<Unit> = mutation(
        "/api/v1/projects/${JsonEncoding.pathSegment(request.projectId)}/delete",
        """{"operation_id":"${esc(request.operationId)}","project_id":"${esc(request.projectId)}","expected_settings_revision":${request.expectedSettingsRevision},"expected_board_revision":${request.expectedBoardRevision}}""",
    )

    override fun loadRoutineBoard(): SettingsResult<AndroidRoutineBoard> {
        return when (val routines = get("/api/v1/routines") { parseRoutineBoard(it) }) {
            is SettingsResult.Success -> when (val projects = loadProjectBoard()) {
                is SettingsResult.Success -> when (val modes = loadModeBoard()) {
                    is SettingsResult.Success -> SettingsResult.Success(routines.value.copy(projects = projects.value.projects, modes = modes.value))
                    else -> SettingsResult.Success(routines.value.copy(projects = projects.value.projects))
                }
                else -> routines
            }
            else -> routines
        }
    }

    override fun createRoutine(request: CreateRoutineSettingsRequest): SettingsResult<Unit> {
        val fullFields = request.startLogicalDate?.let { startDate ->
            ",\"project_id\":${nullable(request.projectId)},\"default_mode_id\":${nullable(request.defaultModeId)}," +
                "\"schedule\":${request.schedule.toJson()},\"start_logical_date\":\"${esc(startDate)}\",\"end_logical_date\":${nullable(request.endLogicalDate)}"
        } ?: ""
        return mutation(
            "/api/v1/routines",
            """{"operation_id":"${esc(request.operationId)}","task_id":"${esc(request.taskId)}","routine_definition_id":"${esc(request.routineDefinitionId)}","title":"${esc(request.title.trim())}","expected_board_revision":${request.expectedBoardRevision},"default_section_id":${nullable(request.defaultSectionId)},"default_planned_start_minute":${request.defaultPlannedStartMinute ?: "null"},"default_estimate_seconds":${request.defaultEstimateSeconds ?: "null"}$fullFields}""",
        )
    }
    override fun updateRoutine(request: UpdateRoutineSettingsRequest): SettingsResult<Unit> = mutation(
        "/api/v1/routines/${JsonEncoding.pathSegment(request.routineDefinitionId)}",
        """{"operation_id":"${esc(request.operationId)}","routine_definition_id":"${esc(request.routineDefinitionId)}","expected_settings_revision":${request.expectedSettingsRevision},"title":"${esc(request.title.trim())}","project_id":${nullable(request.projectId)},"schedule":${request.schedule.toJson()},"default_section_id":${nullable(request.defaultSectionId)},"default_planned_start_minute":${request.defaultPlannedStartMinute ?: "null"},"default_estimate_seconds":${request.defaultEstimateSeconds ?: "null"},"default_mode_id":${nullable(request.defaultModeId)},"start_logical_date":"${esc(request.startLogicalDate)}","end_logical_date":${nullable(request.endLogicalDate)}}""",
    )

    override fun setRoutineEnabled(request: SetRoutineEnabledSettingsRequest): SettingsResult<Unit> = mutation(
        "/api/v1/routines/${JsonEncoding.pathSegment(request.routineDefinitionId)}/enabled",
        """{"operation_id":"${esc(request.operationId)}","routine_definition_id":"${esc(request.routineDefinitionId)}","enabled":${request.enabled},"expected_settings_revision":${request.expectedSettingsRevision}}""",
    )

    override fun deleteRoutine(request: DeleteRoutineSettingsRequest): SettingsResult<Unit> = mutation(
        "/api/v1/routines/${JsonEncoding.pathSegment(request.routineDefinitionId)}/delete",
        """{"operation_id":"${esc(request.operationId)}","routine_definition_id":"${esc(request.routineDefinitionId)}","expected_settings_revision":${request.expectedSettingsRevision},"expected_board_revision":${request.expectedBoardRevision}}""",
    )

    private fun <T> get(path: String, parse: (JsonValue.Object) -> T): SettingsResult<T> = when (val response = execute("GET", path, null)) {
        is HttpResult.Success -> runCatching { SettingsResult.Success(parse(response.body.objectValue())) }
            .getOrElse { SettingsResult.Failure("設定データを読み取れませんでした。再試行してください。") }
        HttpResult.Unauthorized -> SettingsResult.Unauthorized
        is HttpResult.Failure -> SettingsResult.Failure(response.message, response.ambiguous, response.conflict)
    }

    private fun mutation(path: String, body: String): SettingsResult<Unit> = when (val response = execute("POST", path, body)) {
        is HttpResult.Success -> SettingsResult.Success(Unit)
        HttpResult.Unauthorized -> SettingsResult.Unauthorized
        is HttpResult.Failure -> SettingsResult.Failure(response.message, response.ambiguous, response.conflict)
    }

    private fun execute(method: String, path: String, body: String?): HttpResult {
        val response = runCatching { request(method, path, body) }.getOrNull()
            ?: return HttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
        return when {
            response.status == null -> HttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
            response.status == 401 -> { onUnauthorized(); HttpResult.Unauthorized }
            response.status !in 200..299 -> {
                val code = runCatching { response.body?.let { JsonParser(it).parse().objectValue().objectField("error").stringField("code") } }.getOrNull()
                HttpResult.Failure(
                    message = when (code) {
                        "revision_conflict" -> "設定が別の画面で変更されています。再読み込みしてください。"
                        "infrastructure_ambiguous" -> "保存結果を確認できませんでした。元の操作を再試行してください。"
                        else -> "設定を保存できませんでした。再試行してください。"
                    },
                    ambiguous = code == "infrastructure_ambiguous" || response.status == 503,
                    conflict = code == "revision_conflict" || response.status == 409,
                )
            }
            else -> HttpResult.Success(response.body ?: "{}")
        }
    }

    private fun parseSectionConfiguration(root: JsonValue.Object): AndroidSectionConfiguration = AndroidSectionConfiguration(
        configurationVersionId = root.stringField("configuration_version_id"),
        dayBoundaryMinutes = root.intField("day_boundary_minutes"),
        sections = root.arrayField("items").map { item ->
            val value = item.objectValue()
            AndroidSectionSetting(value.stringField("section_id"), value.stringField("title"), value.intField("logical_start_minute"), value.intField("logical_end_minute"))
        },
    )

    private fun loadModeBoard(): SettingsResult<List<AndroidModeSetting>> =
        get("/api/v1/mode-board") { root -> root.arrayField("modes").map { value ->
            val item = value.objectValue()
            AndroidModeSetting(item.stringField("id"), item.stringField("title"), item.booleanField("archived"), item.intField("board_position"), item.intField("settings_revision"))
        } }
    private fun parseProjectBoard(root: JsonValue.Object): AndroidProjectBoard = AndroidProjectBoard(
        boardRevision = root.intField("board_revision"),
        projects = root.arrayField("projects").map { value ->
            val item = value.objectValue()
            AndroidProjectSetting(item.stringField("id"), item.stringField("title"), item.booleanField("archived"), item.intField("board_position"), item.intField("settings_revision"))
        },
    )

    private fun parseRoutineBoard(root: JsonValue.Object): AndroidRoutineBoard = AndroidRoutineBoard(
        boardRevision = root.intField("board_revision"),
        currentLogicalDate = root.stringField("current_logical_date"),
        sections = root.arrayField("sections").map { value ->
            val item = value.objectValue()
            AndroidSectionSetting(item.stringField("id"), item.stringField("title"), item.intField("logical_start_minute"), item.intField("logical_end_minute"))
        },
        routines = root.arrayField("routines").map { value ->
            val item = value.objectValue()
            AndroidRoutineSetting(
                id = item.stringField("routine_definition_id"), taskId = item.stringField("task_id"), title = item.stringField("title"),
                projectId = item.objectFieldOrNull("project")?.nullableStringField("id"),
                projectTitle = item.objectFieldOrNull("project")?.nullableStringField("title"), enabled = item.booleanField("enabled"),
                schedule = parseSchedule(item.objectField("schedule")), defaultSectionId = item.nullableStringField("default_section_id"),
                defaultPlannedStartMinute = item.nullableIntField("default_planned_start_minute"), defaultEstimateSeconds = item.nullableIntField("default_estimate_seconds"),
                defaultModeId = item.objectFieldOrNull("default_mode")?.nullableStringField("id") ?: item.nullableStringField("default_mode_id"),
                startLogicalDate = item.stringField("start_logical_date"), endLogicalDate = item.nullableStringField("end_logical_date"),
                settingsRevision = item.intField("settings_revision"),
            )
        },
    )

    private fun parseSchedule(value: JsonValue.Object): RoutineScheduleSpec {
        val weekdays = value.arrayFieldOrNull("weekdays")?.map { it.intValue() } ?: emptyList()
        return RoutineScheduleSpec(value.stringField("kind"), value.nullableIntField("interval_days"), value.nullableIntField("interval_weeks"), value.nullableIntField("interval_months"), weekdays, value.nullableIntField("day_of_month"), value.nullableIntField("ordinal"), value.nullableIntField("weekday"))
    }

    private fun esc(value: String) = JsonEncoding.escape(value)
    private fun nullable(value: String?): String = value?.let { "\"${esc(it)}\"" } ?: "null"

    private sealed interface HttpResult {
        data class Success(val body: String) : HttpResult
        data object Unauthorized : HttpResult
        data class Failure(val message: String, val ambiguous: Boolean = false, val conflict: Boolean = false) : HttpResult
    }
}

private fun String.objectValue(): JsonValue.Object = JsonParser(this).parse().objectValue()
private fun JsonValue.objectValue(): JsonValue.Object = this as? JsonValue.Object ?: error("expected object")
private fun JsonValue.Object.objectValue(): JsonValue.Object = this
private fun JsonValue.Object.objectField(name: String): JsonValue.Object = fields[name]?.objectValue() ?: error("expected object: $name")
private fun JsonValue.Object.objectFieldOrNull(name: String): JsonValue.Object? = when (val value = fields[name]) { null, JsonValue.Null -> null; else -> value.objectValue() }
private fun JsonValue.Object.arrayField(name: String): List<JsonValue> = (fields[name] as? JsonValue.Array)?.values ?: error("expected array: $name")
private fun JsonValue.Object.arrayFieldOrNull(name: String): List<JsonValue>? = when (val value = fields[name]) { null, JsonValue.Null -> null; is JsonValue.Array -> value.values; else -> error("expected array: $name") }
private fun JsonValue.Object.stringField(name: String): String = (fields[name] as? JsonValue.StringValue)?.value ?: error("expected string: $name")
private fun JsonValue.Object.nullableStringField(name: String): String? = when (val value = fields[name]) { null, JsonValue.Null -> null; is JsonValue.StringValue -> value.value; else -> error("expected nullable string: $name") }
private fun JsonValue.Object.intField(name: String): Int = (fields[name] as? JsonValue.NumberValue)?.value?.toIntOrNull() ?: error("expected int: $name")
private fun JsonValue.Object.nullableIntField(name: String): Int? = when (val value = fields[name]) { null, JsonValue.Null -> null; is JsonValue.NumberValue -> value.value.toIntOrNull() ?: error("expected int: $name"); else -> error("expected nullable int: $name") }
private fun JsonValue.Object.booleanField(name: String): Boolean = (fields[name] as? JsonValue.BooleanValue)?.value ?: error("expected boolean: $name")
private fun JsonValue.intValue(): Int = (this as? JsonValue.NumberValue)?.value?.toIntOrNull() ?: error("expected int")
