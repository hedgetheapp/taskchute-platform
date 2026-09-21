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
    private val latestDay: () -> TodayDay? = { null },
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var state by mutableStateOf(TaskPlanningUiState())
        private set
    private val successfulPlacementRevisions = mutableMapOf<String, Int>()

    fun openCreate(day: TodayDay) {
        val planningDay = freshPlanningDay(day)
        if (!canEditDay(planningDay) || state.saving) return
        val zone = planningDay.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() }
        val section = if (zone == null) {
            // Older projections without canonical timezone cannot safely infer wall-clock Section.
            planningDay.sections.firstOrNull()
        } else {
            resolveInitialSection(planningDay, ZonedDateTime.now(zone))
        }
        state = TaskPlanningUiState(
            editor = TaskEditorState(
                mode = TaskEditorMode.CREATE,
                day = planningDay,
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
            LifecycleState.COMPLETED -> TaskEditorCapability.COMPLETED_METADATA
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
                    actualStartText = formatExecutionClock(task.activeStartedAt ?: task.firstStartedAt, day.establishmentTimezone),
                    actualEndText = formatExecutionClock(task.lastEndedAt, day.establishmentTimezone),
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
        val originalEditor = state.editor ?: return
        if (state.saving) return
        val editor = if (originalEditor.mode == TaskEditorMode.CREATE) {
            originalEditor.copy(day = freshPlanningDay(originalEditor.day))
        } else {
            originalEditor
        }
        val validation = TaskEditorValidation.validate(editor.draft, editor.capability)
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
                is PlanningSaveResult.SuccessWithRevision -> {
                    rememberPlacementRevision(editor.day.logicalDate, result.placementRevision)
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

    private fun freshPlanningDay(day: TodayDay): TodayDay {
        val canonicalRevision = latestDay()
            ?.takeIf { it.logicalDate == day.logicalDate }
            ?.placementRevision
        val rememberedRevision = successfulPlacementRevisions[day.logicalDate]
        val revision = maxOf(day.placementRevision, canonicalRevision ?: day.placementRevision, rememberedRevision ?: day.placementRevision)
        return if (revision == day.placementRevision) day else day.copy(placementRevision = revision)
    }

    private fun rememberPlacementRevision(logicalDate: String, revision: Int) {
        successfulPlacementRevisions[logicalDate] = maxOf(successfulPlacementRevisions[logicalDate] ?: 0, revision)
    }
}
