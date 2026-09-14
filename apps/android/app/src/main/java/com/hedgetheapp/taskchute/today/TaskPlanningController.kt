package com.hedgetheapp.taskchute.today

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class TaskPlanningController(
    private val repository: TaskPlanningRepository,
    private val onUnauthorized: () -> Unit,
    private val onSaved: () -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var state by mutableStateOf(TaskPlanningUiState())
        private set

    fun openCreate(day: TodayDay) {
        if (!canEditDay(day) || state.saving) return
        val section = day.sections.firstOrNull()
        state = TaskPlanningUiState(
            editor = TaskEditorState(
                mode = TaskEditorMode.CREATE,
                day = day,
                originalTask = null,
                draft = TaskEditorDraft(
                    sectionId = section?.id,
                    plannedStartText = formatEditorMinute(section?.startMinute),
                ),
            ),
        )
        loadReferences()
    }

    fun openEdit(day: TodayDay, task: TodayTask) {
        if (!canEditDay(day) || state.saving || task.lifecycleState != LifecycleState.PLANNED || task.routineDerived) return
        state = TaskPlanningUiState(
            editor = TaskEditorState(
                mode = TaskEditorMode.EDIT,
                day = day,
                originalTask = task,
                draft = TaskEditorDraft(
                    title = task.title,
                    projectId = task.project?.id,
                    modeId = task.mode?.id,
                    plannedStartText = formatEditorMinute(task.plannedStartMinute),
                    estimateText = task.estimateSeconds?.let { (it / 60).toString() } ?: "",
                ),
            ),
        )
        loadReferences()
    }

    fun updateDraft(draft: TaskEditorDraft) {
        if (state.saving || state.editor == null) return
        state = state.copy(editor = state.editor!!.copy(draft = draft), errorMessage = null)
    }

    fun dismiss() {
        if (!state.saving) state = TaskPlanningUiState()
    }

    fun retryReferences() {
        if (state.editor != null) loadReferences(force = true)
    }

    fun save() {
        val editor = state.editor ?: return
        if (state.saving) return
        val validation = TaskEditorValidation.validate(editor.draft)
        if (validation.input == null) {
            state = state.copy(errorMessage = validation.errorMessage)
            return
        }
        if (state.references == null) {
            state = state.copy(errorMessage = "候補一覧を読み込んでから保存してください。")
            if (!state.loadingReferences) loadReferences()
            return
        }
        state = state.copy(saving = true, errorMessage = null)
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.save(editor, validation.input) }
            when (result) {
                PlanningSaveResult.Success -> {
                    state = TaskPlanningUiState()
                    onSaved()
                }
                PlanningSaveResult.Unauthorized -> {
                    state = state.copy(saving = false, errorMessage = "認証が必要です。")
                    onUnauthorized()
                }
                is PlanningSaveResult.Failure -> state = state.copy(saving = false, errorMessage = result.message)
            }
        }
    }

    fun close() = scope.cancel()

    private fun loadReferences(force: Boolean = false) {
        if (state.editor == null || state.loadingReferences || (!force && state.references != null)) return
        state = state.copy(loadingReferences = true, errorMessage = null)
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.loadReferences() }
            when (result) {
                is PlanningReferencesResult.Success -> state = state.copy(
                    references = result.references,
                    loadingReferences = false,
                    errorMessage = null,
                )
                PlanningReferencesResult.Unauthorized -> {
                    state = state.copy(loadingReferences = false, errorMessage = "認証が必要です。")
                    onUnauthorized()
                }
                is PlanningReferencesResult.Failure -> state = state.copy(
                    loadingReferences = false,
                    errorMessage = result.message,
                )
            }
        }
    }

    private fun canEditDay(day: TodayDay): Boolean = day.isCurrent && day.planningEnabled && day.taskChuteDayId != null
}
