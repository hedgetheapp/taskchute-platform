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
import java.time.ZoneId
import java.time.ZonedDateTime

class TaskPlanningController(
    private val repository: TaskPlanningRepository,
    private val onUnauthorized: () -> Unit,
    private val onSaved: () -> Unit,
    private val onOptimisticIntent: (TaskEditorState, NormalizedTaskInput) -> Unit = { _, _ -> },
    private val onOptimisticFailure: (String) -> Unit = {},
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var state by mutableStateOf(TaskPlanningUiState())
        private set

    fun openCreate(day: TodayDay) {
        if (!canEditDay(day) || state.saving) return
        val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() }
        val section = if (zone == null) {
            // Older projections without canonical timezone cannot safely infer wall-clock Section.
            day.sections.firstOrNull()
        } else {
            resolveInitialSection(day, ZonedDateTime.now(zone))
        }
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
        if (!canEditDay(day) || state.saving || task.routineDerived || (!day.isCurrent && task.lifecycleState != LifecycleState.PLANNED)) return
        val capability = when (task.lifecycleState) {
            LifecycleState.PLANNED -> TaskEditorCapability.FULL_PLANNING
            LifecycleState.RUNNING -> TaskEditorCapability.RUNNING_METADATA
            LifecycleState.COMPLETED -> return
        }
        state = TaskPlanningUiState(
            editor = TaskEditorState(
                mode = TaskEditorMode.EDIT,
                day = day,
                originalTask = task,
                draft = TaskEditorDraft(
                    title = task.title,
                    projectId = task.project?.id,
                    modeId = task.mode?.id,
                    sectionId = day.sections.firstOrNull { section -> section.entries.any { it.id == task.id } }?.id,
                    plannedStartText = formatEditorMinute(task.plannedStartMinute),
                    estimateText = task.estimateSeconds?.let { (it / 60).toString() } ?: "",
                ),
                capability = capability,
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
        val requestInput = validation.input.copy(
            clientTaskId = if (editor.mode == TaskEditorMode.CREATE) UUIDv7.next() else null,
            clientEntryId = if (editor.mode == TaskEditorMode.CREATE) UUIDv7.next() else null,
            projectTitle = state.references?.projects?.firstOrNull { it.id == validation.input.projectId }?.title,
            modeTitle = state.references?.modes?.firstOrNull { it.id == validation.input.modeId }?.title,
        )
        val previousState = state
        onOptimisticIntent(editor, requestInput)
        // Keep the in-flight marker for controller callers while the editor sheet closes immediately.
        state = TaskPlanningUiState(saving = true)
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.save(editor, requestInput) }
            when (result) {
                PlanningSaveResult.Success -> {
                    state = TaskPlanningUiState()
                    onSaved()
                }
                PlanningSaveResult.Unauthorized -> {
                    onOptimisticFailure("認証が必要です。")
                    state = previousState.copy(saving = false, errorMessage = "認証が必要です。")
                    onUnauthorized()
                }
                is PlanningSaveResult.Failure -> {
                    onOptimisticFailure(result.message)
                    state = previousState.copy(saving = false, errorMessage = result.message)
                }
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

    private fun canEditDay(day: TodayDay): Boolean = canPlanDay(day)
}
