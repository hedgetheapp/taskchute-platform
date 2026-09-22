package com.hedgetheapp.taskchute.settings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

class SettingsController(
    private val repository: AndroidSettingsRepository,
    private val onUnauthorized: () -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var state by mutableStateOf(SettingsUiState())
        private set

    private var loadJob: Job? = null
    private var workingSections: AndroidSectionConfiguration? = null

    fun showHome() {
        if (isBusy()) return
        state = state.copy(destination = SettingsDestination.HOME, errorMessage = null)
    }

    fun openSections() { state = state.copy(destination = SettingsDestination.SECTIONS, errorMessage = null); loadSections() }
    fun openProjects() { state = state.copy(destination = SettingsDestination.PROJECTS, errorMessage = null); loadProjects() }
    fun openRoutines() { state = state.copy(destination = SettingsDestination.ROUTINES, errorMessage = null); loadRoutines() }

    fun setProjectArchivedView(archived: Boolean) {
        if (isBusy()) return
        state = state.copy(projectArchivedView = archived)
    }

    fun retry() {
        if (state.unresolvedOperation != null) retryUnresolved() else when (state.destination) {
            SettingsDestination.SECTIONS -> loadSections()
            SettingsDestination.PROJECTS -> loadProjects()
            SettingsDestination.ROUTINES -> loadRoutines()
            SettingsDestination.HOME -> Unit
        }
    }

    fun retryUnresolved() {
        val operation = state.unresolvedOperation ?: return
        if (state.pendingOperation != null) return
        state = state.copy(unresolvedOperation = null)
        submit(operation)
    }

    fun openNewSection() {
        val configuration = state.sectionConfiguration ?: return
        if (isBusy() || configuration.sections.isEmpty()) return
        val last = configuration.sections.last()
        val midpoint = last.startMinute + ((last.endMinute - last.startMinute).coerceAtLeast(2) / 2)
        val newSection = AndroidSectionSetting(newOperationId(), "新しいSection", midpoint, last.endMinute)
        val replaced = configuration.sections.dropLast(1) + last.copy(endMinute = midpoint) + newSection
        workingSections = configuration.copy(sections = replaced)
        state = state.copy(sectionEditor = SectionEditorDraft(newSection.id, newSection.title, minuteText(midpoint), minuteText(newSection.endMinute), true), errorMessage = null)
    }

    fun openSection(id: String) {
        val section = state.sectionConfiguration?.sections?.firstOrNull { it.id == id } ?: return
        if (isBusy()) return
        state = state.copy(sectionEditor = SectionEditorDraft(id, section.title, minuteText(section.startMinute), minuteText(section.endMinute), false), errorMessage = null)
    }

    fun updateSectionDraft(title: String? = null, start: String? = null, end: String? = null) {
        val draft = state.sectionEditor ?: return
        state = state.copy(sectionEditor = draft.copy(title = title ?: draft.title, startText = start ?: draft.startText, endText = end ?: draft.endText))
    }

    fun cancelSection() { state = state.copy(sectionEditor = null, errorMessage = null); workingSections = null }

    fun saveSection() {
        val draft = state.sectionEditor ?: return
        val configuration = workingSections ?: state.sectionConfiguration ?: return
        val start = parseMinute(draft.startText)
        val end = parseMinute(draft.endText)
        if (draft.title.trim().isEmpty() || start == null || end == null || start < 0 || end > configuration.dayBoundaryMinutes + 1440 || end <= start) {
            state = state.copy(errorMessage = "Section名と時刻を正しく入力してください。")
            return
        }
        val items = configuration.sections.map { if (it.id == draft.id) it.copy(title = draft.title.trim(), startMinute = start, endMinute = end) else it }
        if (!validSections(items, configuration.dayBoundaryMinutes)) {
            state = state.copy(errorMessage = "Sectionの時間帯は連続している必要があります。")
            return
        }
        val request = SectionConfigurationUpdateRequest(newOperationId(), newOperationId(), configuration.configurationVersionId, items)
        submit(SettingsOperation.UpdateSections(request))
    }

    fun requestDeleteSection(id: String) {
        val configuration = state.sectionConfiguration ?: return
        val section = configuration.sections.firstOrNull { it.id == id } ?: return
        if (configuration.sections.size <= 1 || isBusy()) return
        state = state.copy(deleteTarget = SettingsDeleteTarget(SettingsDeleteKind.SECTION, id, section.title))
    }

    fun openNewProject() { if (!isBusy()) state = state.copy(projectEditor = ProjectEditorDraft(null, "", isNew = true), errorMessage = null) }
    fun openProject(id: String) {
        val project = state.projectBoard?.projects?.firstOrNull { it.id == id } ?: return
        if (!isBusy()) state = state.copy(projectEditor = ProjectEditorDraft(project.id, project.title, project.settingsRevision, false), errorMessage = null)
    }
    fun updateProjectDraft(title: String) { state = state.copy(projectEditor = state.projectEditor?.copy(title = title)) }
    fun cancelProject() { state = state.copy(projectEditor = null, errorMessage = null) }

    fun saveProject() {
        val draft = state.projectEditor ?: return
        if (draft.title.trim().isEmpty()) { state = state.copy(errorMessage = "プロジェクト名を入力してください。"); return }
        val board = state.projectBoard ?: return
        val operation = if (draft.isNew) SettingsOperation.CreateProject(CreateProjectSettingsRequest(newOperationId(), newOperationId(), draft.title.trim()))
        else SettingsOperation.UpdateProject(UpdateProjectSettingsRequest(newOperationId(), requireNotNull(draft.id), draft.revision, state.projectBoard?.projects?.first { it.id == draft.id }.orEmptyTitle(), draft.title.trim()))
        submit(operation)
    }

    fun archiveProject(id: String, archived: Boolean) {
        val project = state.projectBoard?.projects?.firstOrNull { it.id == id } ?: return
        submit(SettingsOperation.ArchiveProject(SetProjectArchivedSettingsRequest(newOperationId(), id, archived, project.settingsRevision)))
    }

    fun moveProject(id: String, direction: Int) {
        val board = state.projectBoard ?: return
        val ordered = board.projects.sortedBy { it.boardPosition }.toMutableList()
        val from = ordered.indexOfFirst { it.id == id }
        val to = from + direction
        if (from < 0 || to !in ordered.indices) return
        val item = ordered.removeAt(from); ordered.add(to, item)
        submit(SettingsOperation.ReorderProjects(ReorderProjectsSettingsRequest(newOperationId(), ordered.map { it.id }, board.boardRevision)))
    }

    fun requestDeleteProject(id: String) {
        val project = state.projectBoard?.projects?.firstOrNull { it.id == id } ?: return
        if (!isBusy()) state = state.copy(deleteTarget = SettingsDeleteTarget(SettingsDeleteKind.PROJECT, id, project.title))
    }

    fun openNewRoutine() {
        val board = state.routineBoard ?: return
        if (!isBusy()) state = state.copy(routineEditor = RoutineEditorDraft(null, null, "", null, RoutineScheduleSpec(), null, "", "", null, board.currentLogicalDate, "", isNew = true), errorMessage = null)
    }
    fun openRoutine(id: String) {
        val routine = state.routineBoard?.routines?.firstOrNull { it.id == id } ?: return
        if (!isBusy()) state = state.copy(routineEditor = RoutineEditorDraft(routine.id, routine.taskId, routine.title, routine.projectId, routine.schedule, routine.defaultSectionId, routine.defaultPlannedStartMinute?.let(::minuteText) ?: "", routine.defaultEstimateSeconds?.let { (it / 60).toString() } ?: "", routine.defaultModeId, routine.startLogicalDate, routine.endLogicalDate ?: "", routine.settingsRevision, false), errorMessage = null)
    }
    fun updateRoutineDraft(
        title: String? = null, projectId: String? = null, modeId: String? = null, scheduleKind: String? = null,
        sectionId: String? = null, start: String? = null, estimate: String? = null,
        startDate: String? = null, endDate: String? = null,
    ) {
        val draft = state.routineEditor ?: return
        state = state.copy(routineEditor = draft.copy(
            title = title ?: draft.title,
            projectId = projectId ?: draft.projectId,
            defaultModeId = modeId ?: draft.defaultModeId,
            schedule = scheduleKind?.let { draft.schedule.copy(kind = it) } ?: draft.schedule,
            defaultSectionId = sectionId ?: draft.defaultSectionId,
            defaultPlannedStartText = start ?: draft.defaultPlannedStartText,
            defaultEstimateText = estimate ?: draft.defaultEstimateText,
            startLogicalDate = startDate ?: draft.startLogicalDate,
            endLogicalDate = endDate ?: draft.endLogicalDate,
        ))
    }
    fun setRoutineProject(id: String?) { state = state.copy(routineEditor = state.routineEditor?.copy(projectId = id)) }
    fun setRoutineMode(id: String?) { state = state.copy(routineEditor = state.routineEditor?.copy(defaultModeId = id)) }
    fun setRoutineSection(id: String?) { state = state.copy(routineEditor = state.routineEditor?.copy(defaultSectionId = id)) }
    fun updateRoutineSchedule(schedule: RoutineScheduleSpec) { state = state.copy(routineEditor = state.routineEditor?.copy(schedule = schedule)) }
    fun setRoutineStartDate(date: String) { state = state.copy(routineEditor = state.routineEditor?.copy(startLogicalDate = date)) }
    fun setRoutineEndDate(date: String?) { state = state.copy(routineEditor = state.routineEditor?.copy(endLogicalDate = date.orEmpty())) }
    fun cancelRoutine() { state = state.copy(routineEditor = null, errorMessage = null) }

    fun saveRoutine() {
        val draft = state.routineEditor ?: return
        val board = state.routineBoard ?: return
        val startDate = draft.startLogicalDate.trim()
        val endDate = draft.endLogicalDate.trim().ifBlank { null }
        if (draft.title.trim().isEmpty() || !validDate(startDate) || (endDate != null && (!validDate(endDate) || endDate < startDate))) {
            state = state.copy(errorMessage = "Routine名と開始日・終了日を正しく入力してください。")
            return
        }
        val start = draft.defaultPlannedStartText.takeIf { it.isNotBlank() }?.let(::parseRoutineMinute)
        val estimate = draft.defaultEstimateText.takeIf { it.isNotBlank() }?.let { raw ->
            raw.trim().toLongOrNull()?.takeIf { it in 1..(Int.MAX_VALUE / 60L) }?.times(60)?.toInt()
        }
        if ((draft.defaultPlannedStartText.isNotBlank() && start == null) || (draft.defaultEstimateText.isNotBlank() && estimate == null)) {
            state = state.copy(errorMessage = "開始予定と見積を正しく入力してください。")
            return
        }
        if (!validSchedule(draft.schedule)) {
            state = state.copy(errorMessage = "繰り返し設定を正しく入力してください。")
            return
        }
        val sectionId = start?.let { minute ->
            val matches = board.sections.filter { section -> section.startMinute <= minute && minute < section.endMinute }
            if (draft.defaultSectionId != null) {
                matches.singleOrNull { it.id == draft.defaultSectionId }?.id
            } else {
                matches.singleOrNull()?.id
            }
        }
        if (start != null && sectionId == null) {
            state = state.copy(errorMessage = "開始予定が設定済みSectionの範囲外です。")
            return
        }
        if (start == null && draft.defaultSectionId != null) {
            state = state.copy(errorMessage = "開始予定とSectionの組み合わせを確認してください。")
            return
        }
        val operation = if (draft.isNew) SettingsOperation.CreateRoutine(CreateRoutineSettingsRequest(
            operationId = newOperationId(), taskId = newOperationId(), routineDefinitionId = newOperationId(),
            title = draft.title.trim(), expectedBoardRevision = board.boardRevision,
            defaultSectionId = sectionId, defaultPlannedStartMinute = start, defaultEstimateSeconds = estimate,
            defaultModeId = draft.defaultModeId, projectId = draft.projectId, schedule = draft.schedule,
            startLogicalDate = startDate, endLogicalDate = endDate,
        )) else SettingsOperation.UpdateRoutine(UpdateRoutineSettingsRequest(
            operationId = newOperationId(), routineDefinitionId = requireNotNull(draft.id),
            expectedSettingsRevision = draft.settingsRevision, title = draft.title.trim(), projectId = draft.projectId,
            schedule = draft.schedule, defaultSectionId = sectionId, defaultPlannedStartMinute = start,
            defaultEstimateSeconds = estimate, defaultModeId = draft.defaultModeId,
            startLogicalDate = startDate, endLogicalDate = endDate,
        ))
        submit(operation)
    }
    fun toggleRoutine(id: String, enabled: Boolean) {
        val routine = state.routineBoard?.routines?.firstOrNull { it.id == id } ?: return
        submit(SettingsOperation.EnableRoutine(SetRoutineEnabledSettingsRequest(newOperationId(), id, enabled, routine.settingsRevision)))
    }
    fun requestDeleteRoutine(id: String) {
        val routine = state.routineBoard?.routines?.firstOrNull { it.id == id } ?: return
        if (!isBusy()) state = state.copy(deleteTarget = SettingsDeleteTarget(SettingsDeleteKind.ROUTINE, id, routine.title))
    }

    fun cancelDelete() { state = state.copy(deleteTarget = null) }
    fun confirmDelete() {
        val target = state.deleteTarget ?: return
        when (target.kind) {
            SettingsDeleteKind.SECTION -> deleteSection(target.id)
            SettingsDeleteKind.PROJECT -> state.projectBoard?.projects?.firstOrNull { it.id == target.id }?.let { submit(SettingsOperation.DeleteProject(DeleteProjectSettingsRequest(newOperationId(), it.id, it.settingsRevision, state.projectBoard?.boardRevision ?: 0))) }
            SettingsDeleteKind.ROUTINE -> state.routineBoard?.routines?.firstOrNull { it.id == target.id }?.let { submit(SettingsOperation.DeleteRoutine(DeleteRoutineSettingsRequest(newOperationId(), it.id, it.settingsRevision, state.routineBoard?.boardRevision ?: 0))) }
        }
    }

    fun close() { loadJob?.cancel(); scope.cancel() }

    private fun isBusy() = state.loading || state.pendingOperation != null || state.unresolvedOperation != null || state.deleteTarget != null
    private fun loadSections() { loadJob?.cancel(); state = state.copy(loading = true, errorMessage = null); loadJob = scope.launch { finishLoad(withContext(Dispatchers.IO) { repository.loadSectionConfiguration() }) { value -> state = state.copy(sectionConfiguration = value) } } }
    private fun loadProjects() { loadJob?.cancel(); state = state.copy(loading = true, errorMessage = null); loadJob = scope.launch { finishLoad(withContext(Dispatchers.IO) { repository.loadProjectBoard() }) { value -> state = state.copy(projectBoard = value) } } }
    private fun loadRoutines() { loadJob?.cancel(); state = state.copy(loading = true, errorMessage = null); loadJob = scope.launch { finishLoad(withContext(Dispatchers.IO) { repository.loadRoutineBoard() }) { value -> state = state.copy(routineBoard = value) } } }

    private suspend fun <T> finishLoad(result: SettingsResult<T>, assign: (T) -> Unit) {
        when (result) {
            is SettingsResult.Success -> { assign(result.value); state = state.copy(loading = false) }
            SettingsResult.Unauthorized -> { state = state.copy(loading = false, errorMessage = "認証が必要です。"); onUnauthorized() }
            is SettingsResult.Failure -> state = state.copy(loading = false, errorMessage = result.message)
        }
    }

    private fun submit(operation: SettingsOperation) {
        if (state.pendingOperation != null || state.unresolvedOperation != null) return
        state = state.copy(pendingOperation = operation::class.simpleName, errorMessage = null, noticeMessage = null, deleteTarget = null)
        scope.launch {
            val result = withContext(Dispatchers.IO) { execute(operation) }
            when (result) {
                is SettingsResult.Success -> {
                    state = state.copy(pendingOperation = null, unresolvedOperation = null, sectionEditor = null, projectEditor = null, routineEditor = null, noticeMessage = "保存しました。")
                    when (state.destination) { SettingsDestination.SECTIONS -> loadSections(); SettingsDestination.PROJECTS -> loadProjects(); SettingsDestination.ROUTINES -> loadRoutines(); SettingsDestination.HOME -> Unit }
                    workingSections = null
                }
                SettingsResult.Unauthorized -> { state = state.copy(pendingOperation = null, unresolvedOperation = operation, errorMessage = "認証が必要です。操作を保持しています。"); onUnauthorized() }
                is SettingsResult.Failure -> if (result.ambiguous) state = state.copy(pendingOperation = null, unresolvedOperation = operation, errorMessage = result.message) else state = state.copy(pendingOperation = null, errorMessage = result.message)
            }
        }
    }

    private fun execute(operation: SettingsOperation): SettingsResult<Unit> = when (operation) {
        is SettingsOperation.UpdateSections -> repository.updateSectionConfiguration(operation.request)
        is SettingsOperation.CreateProject -> repository.createProject(operation.request)
        is SettingsOperation.UpdateProject -> repository.updateProject(operation.request)
        is SettingsOperation.ArchiveProject -> repository.setProjectArchived(operation.request)
        is SettingsOperation.ReorderProjects -> repository.reorderProjects(operation.request)
        is SettingsOperation.DeleteProject -> repository.deleteProject(operation.request)
        is SettingsOperation.CreateRoutine -> repository.createRoutine(operation.request)
        is SettingsOperation.UpdateRoutine -> repository.updateRoutine(operation.request)
        is SettingsOperation.EnableRoutine -> repository.setRoutineEnabled(operation.request)
        is SettingsOperation.DeleteRoutine -> repository.deleteRoutine(operation.request)
    }

    private fun deleteSection(id: String) {
        val configuration = state.sectionConfiguration ?: return
        val index = configuration.sections.indexOfFirst { it.id == id }
        if (index < 0 || configuration.sections.size <= 1) return
        val target = configuration.sections[index]
        val sections = configuration.sections.toMutableList().apply {
            if (index < lastIndex) this[index + 1] = this[index + 1].copy(startMinute = target.startMinute)
            else this[index - 1] = this[index - 1].copy(endMinute = target.endMinute)
            removeAt(index)
        }
        submit(SettingsOperation.UpdateSections(SectionConfigurationUpdateRequest(newOperationId(), newOperationId(), configuration.configurationVersionId, sections)))
    }

    private fun validSections(items: List<AndroidSectionSetting>, boundaryMinutes: Int): Boolean {
        val sorted = items.sortedBy { it.startMinute }
        return sorted.firstOrNull()?.startMinute == boundaryMinutes && sorted.lastOrNull()?.endMinute == boundaryMinutes + 1440 && sorted.zipWithNext().all { it.first.endMinute == it.second.startMinute } && sorted.all { it.startMinute < it.endMinute }
    }

    private fun parseRoutineMinute(raw: String): Int? = raw.trim().let { value ->
        val compact = value.replace(":", "").let { if (it.length < 4) it.padStart(4, '0') else it }
        if (compact.length != 4 || compact.any { !it.isDigit() }) return null
        val hours = compact.substring(0, 2).toIntOrNull() ?: return null
        val minutes = compact.substring(2, 4).toIntOrNull() ?: return null
        if (hours !in 0..47 || minutes !in 0..59) return null
        hours * 60 + minutes
    }

    private fun validDate(value: String): Boolean = runCatching { LocalDate.parse(value).toString() == value }.getOrDefault(false)

    private fun validSchedule(schedule: RoutineScheduleSpec): Boolean = when (schedule.kind) {
        "daily", "monthly_last_day", "workday", "holiday", "official_holiday", "monthly_last_workday" -> true
        "every_n_days" -> schedule.intervalDays in 2..365
        "weekly" -> schedule.weekdays.isNotEmpty() && schedule.weekdays.distinct().size == schedule.weekdays.size && schedule.weekdays.all { it in 0..6 }
        "every_n_weeks" -> schedule.intervalWeeks in 2..52 && schedule.weekdays.isNotEmpty() && schedule.weekdays.distinct().size == schedule.weekdays.size && schedule.weekdays.all { it in 0..6 }
        "monthly_day" -> schedule.dayOfMonth in 1..31
        "monthly_nth_weekday" -> schedule.ordinal in 1..5 && schedule.weekday in 0..6
        "monthly_last_weekday" -> schedule.weekday in 0..6
        "every_n_months_day" -> schedule.intervalMonths in 2..12 && schedule.dayOfMonth in 1..31
        "every_n_months_last_day" -> schedule.intervalMonths in 2..12
        else -> false
    }

    private fun parseMinute(raw: String): Int? = raw.trim().let { value ->
        val parts = value.split(":")
        if (parts.size == 2) {
            val hours = parts[0].toIntOrNull() ?: return null
            val minutes = parts[1].toIntOrNull() ?: return null
            if (hours !in 0..47 || minutes !in 0..59) return null
            hours * 60 + minutes
        }
        else value.toIntOrNull()
    }?.takeIf { it in 0..2879 }

    private fun minuteText(value: Int): String = "%02d:%02d".format(value / 60, value % 60)
}

private fun AndroidProjectSetting?.orEmptyTitle(): String = this?.title ?: ""
