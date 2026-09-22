package com.hedgetheapp.taskchute.settings

import com.hedgetheapp.taskchute.today.JsonEncoding
import com.hedgetheapp.taskchute.today.UUIDv7

data class AndroidSectionSetting(
    val id: String,
    val title: String,
    val startMinute: Int,
    val endMinute: Int,
)

data class AndroidSectionConfiguration(
    val configurationVersionId: String,
    val dayBoundaryMinutes: Int,
    val sections: List<AndroidSectionSetting>,
)

data class AndroidProjectSetting(
    val id: String,
    val title: String,
    val archived: Boolean,
    val boardPosition: Int,
    val settingsRevision: Int,
)

data class AndroidProjectBoard(
    val boardRevision: Int,
    val projects: List<AndroidProjectSetting>,
)

data class RoutineScheduleSpec(
    val kind: String = "daily",
    val intervalDays: Int? = null,
    val intervalWeeks: Int? = null,
    val intervalMonths: Int? = null,
    val weekdays: List<Int> = emptyList(),
    val dayOfMonth: Int? = null,
    val ordinal: Int? = null,
    val weekday: Int? = null,
) {
    fun toJson(): String = buildString {
        append("{\"kind\":\"").append(JsonEncoding.escape(kind)).append('"')
        intervalDays?.let { append(",\"interval_days\":").append(it) }
        intervalWeeks?.let { append(",\"interval_weeks\":").append(it) }
        intervalMonths?.let { append(",\"interval_months\":").append(it) }
        if (weekdays.isNotEmpty()) append(",\"weekdays\":[").append(weekdays.joinToString(",")).append(']')
        dayOfMonth?.let { append(",\"day_of_month\":").append(it) }
        ordinal?.let { append(",\"ordinal\":").append(it) }
        weekday?.let { append(",\"weekday\":").append(it) }
        append('}')
    }

    fun summary(): String = when (kind) {
        "daily" -> "毎日"
        "every_n_days" -> "${intervalDays ?: 2}日ごと"
        "weekly" -> "毎週 ${weekdays.joinToString("・") { weekdayLabel(it) }}"
        "every_n_weeks" -> "${intervalWeeks ?: 2}週間ごと ${weekdays.joinToString("・") { weekdayLabel(it) }}"
        "monthly_day" -> "毎月${dayOfMonth ?: 1}日"
        "monthly_last_day" -> "毎月末日"
        "monthly_nth_weekday" -> "毎月 第${ordinal ?: 1}${weekdayLabel(weekday ?: 0)}曜日"
        "monthly_last_weekday" -> "毎月 最終${weekdayLabel(weekday ?: 0)}曜日"
        "every_n_months_day" -> "${intervalMonths ?: 2}か月ごと ${dayOfMonth ?: 1}日"
        "every_n_months_last_day" -> "${intervalMonths ?: 2}か月ごと 月末"
        "workday" -> "営業日"
        "holiday" -> "休日"
        "official_holiday" -> "祝日"
        "monthly_last_workday" -> "月末営業日"
        else -> kind
    }

    private fun weekdayLabel(value: Int): String = listOf("日", "月", "火", "水", "木", "金", "土").getOrElse(value) { "?" }
}

data class AndroidRoutineSetting(
    val id: String,
    val taskId: String,
    val title: String,
    val projectId: String?,
    val projectTitle: String?,
    val enabled: Boolean,
    val schedule: RoutineScheduleSpec,
    val defaultSectionId: String?,
    val defaultPlannedStartMinute: Int?,
    val defaultEstimateSeconds: Int?,
    val defaultModeId: String?,
    val startLogicalDate: String,
    val endLogicalDate: String?,
    val settingsRevision: Int,
)

data class AndroidRoutineBoard(
    val boardRevision: Int,
    val currentLogicalDate: String,
    val sections: List<AndroidSectionSetting>,
    val routines: List<AndroidRoutineSetting>,
    val projects: List<AndroidProjectSetting> = emptyList(),
)

data class SectionConfigurationUpdateRequest(
    val operationId: String,
    val configurationVersionId: String,
    val expectedConfigurationVersionId: String,
    val items: List<AndroidSectionSetting>,
)

data class CreateProjectSettingsRequest(val operationId: String, val projectId: String, val title: String)

data class UpdateProjectSettingsRequest(
    val operationId: String,
    val projectId: String,
    val expectedSettingsRevision: Int,
    val expectedTitle: String,
    val title: String,
)

data class SetProjectArchivedSettingsRequest(
    val operationId: String,
    val projectId: String,
    val archived: Boolean,
    val expectedSettingsRevision: Int,
)

data class ReorderProjectsSettingsRequest(
    val operationId: String,
    val projectIds: List<String>,
    val expectedBoardRevision: Int,
)

data class DeleteProjectSettingsRequest(
    val operationId: String,
    val projectId: String,
    val expectedSettingsRevision: Int,
    val expectedBoardRevision: Int,
)

data class CreateRoutineSettingsRequest(
    val operationId: String,
    val taskId: String,
    val routineDefinitionId: String,
    val title: String,
    val expectedBoardRevision: Int,
    val defaultSectionId: String? = null,
    val defaultPlannedStartMinute: Int? = null,
    val defaultEstimateSeconds: Int? = null,
)

data class UpdateRoutineSettingsRequest(
    val operationId: String,
    val routineDefinitionId: String,
    val expectedSettingsRevision: Int,
    val title: String,
    val projectId: String?,
    val schedule: RoutineScheduleSpec,
    val defaultSectionId: String?,
    val defaultPlannedStartMinute: Int?,
    val defaultEstimateSeconds: Int?,
    val defaultModeId: String?,
    val startLogicalDate: String,
    val endLogicalDate: String?,
)

data class SetRoutineEnabledSettingsRequest(
    val operationId: String,
    val routineDefinitionId: String,
    val enabled: Boolean,
    val expectedSettingsRevision: Int,
)

data class DeleteRoutineSettingsRequest(
    val operationId: String,
    val routineDefinitionId: String,
    val expectedSettingsRevision: Int,
    val expectedBoardRevision: Int,
)

sealed interface SettingsResult<out T> {
    data class Success<T>(val value: T) : SettingsResult<T>
    data object Unauthorized : SettingsResult<Nothing>
    data class Failure(
        val message: String,
        val ambiguous: Boolean = false,
        val conflict: Boolean = false,
    ) : SettingsResult<Nothing>
}

sealed interface SettingsOperation {
    data class UpdateSections(val request: SectionConfigurationUpdateRequest) : SettingsOperation
    data class CreateProject(val request: CreateProjectSettingsRequest) : SettingsOperation
    data class UpdateProject(val request: UpdateProjectSettingsRequest) : SettingsOperation
    data class ArchiveProject(val request: SetProjectArchivedSettingsRequest) : SettingsOperation
    data class ReorderProjects(val request: ReorderProjectsSettingsRequest) : SettingsOperation
    data class DeleteProject(val request: DeleteProjectSettingsRequest) : SettingsOperation
    data class CreateRoutine(val request: CreateRoutineSettingsRequest) : SettingsOperation
    data class UpdateRoutine(val request: UpdateRoutineSettingsRequest) : SettingsOperation
    data class EnableRoutine(val request: SetRoutineEnabledSettingsRequest) : SettingsOperation
    data class DeleteRoutine(val request: DeleteRoutineSettingsRequest) : SettingsOperation
}

interface AndroidSettingsRepository {
    fun loadSectionConfiguration(): SettingsResult<AndroidSectionConfiguration>
    fun updateSectionConfiguration(request: SectionConfigurationUpdateRequest): SettingsResult<Unit>

    fun loadProjectBoard(): SettingsResult<AndroidProjectBoard>
    fun createProject(request: CreateProjectSettingsRequest): SettingsResult<Unit>
    fun updateProject(request: UpdateProjectSettingsRequest): SettingsResult<Unit>
    fun setProjectArchived(request: SetProjectArchivedSettingsRequest): SettingsResult<Unit>
    fun reorderProjects(request: ReorderProjectsSettingsRequest): SettingsResult<Unit>
    fun deleteProject(request: DeleteProjectSettingsRequest): SettingsResult<Unit>

    fun loadRoutineBoard(): SettingsResult<AndroidRoutineBoard>
    fun createRoutine(request: CreateRoutineSettingsRequest): SettingsResult<Unit>
    fun updateRoutine(request: UpdateRoutineSettingsRequest): SettingsResult<Unit>
    fun setRoutineEnabled(request: SetRoutineEnabledSettingsRequest): SettingsResult<Unit>
    fun deleteRoutine(request: DeleteRoutineSettingsRequest): SettingsResult<Unit>
}

enum class SettingsDestination { HOME, SECTIONS, PROJECTS, ROUTINES }

data class SectionEditorDraft(
    val id: String,
    val title: String,
    val startText: String,
    val endText: String,
    val isNew: Boolean,
)

data class ProjectEditorDraft(val id: String?, val title: String, val revision: Int = 0, val isNew: Boolean = id == null)

data class RoutineEditorDraft(
    val id: String?,
    val taskId: String?,
    val title: String,
    val projectId: String?,
    val schedule: RoutineScheduleSpec,
    val defaultSectionId: String?,
    val defaultPlannedStartText: String,
    val defaultEstimateText: String,
    val defaultModeId: String?,
    val startLogicalDate: String,
    val endLogicalDate: String,
    val settingsRevision: Int = 0,
    val isNew: Boolean = id == null,
)

enum class SettingsDeleteKind { SECTION, PROJECT, ROUTINE }

data class SettingsDeleteTarget(val kind: SettingsDeleteKind, val id: String, val label: String)

data class SettingsUiState(
    val destination: SettingsDestination = SettingsDestination.HOME,
    val loading: Boolean = false,
    val sectionConfiguration: AndroidSectionConfiguration? = null,
    val projectBoard: AndroidProjectBoard? = null,
    val projectArchivedView: Boolean = false,
    val routineBoard: AndroidRoutineBoard? = null,
    val sectionEditor: SectionEditorDraft? = null,
    val projectEditor: ProjectEditorDraft? = null,
    val routineEditor: RoutineEditorDraft? = null,
    val deleteTarget: SettingsDeleteTarget? = null,
    val pendingOperation: String? = null,
    val unresolvedOperation: SettingsOperation? = null,
    val errorMessage: String? = null,
    val noticeMessage: String? = null,
)

fun newOperationId(): String = UUIDv7.next()
