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
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

class TaskPlanningController(
    private val repository: TaskPlanningRepository,
    private val onUnauthorized: () -> Unit,
    private val onSaved: () -> Unit,
    private val onPlacementRevisionConfirmed: (String, Int) -> Unit = { _, _ -> },
    private val onOptimisticIntent: (TaskEditorState, NormalizedTaskInput) -> Unit = { _, _ -> },
    private val onOptimisticFailure: (String) -> Unit = {},
    private val latestDay: () -> TodayDay? = { null },
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    private val now: () -> Instant = Instant::now,
) {
    var state by mutableStateOf(TaskPlanningUiState())
        private set
    private val successfulPlacementRevisions = mutableMapOf<String, Int>()

    fun openCreate(day: TodayDay) {
        val planningDay = freshPlanningDay(day)
        if (!canPlanDay(planningDay) || state.saving) return
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
        if (!canEditEntryDay(day) || state.saving) return
        val routineCapability = when {
            !task.routineDerived -> null
            task.lifecycleState == LifecycleState.PLANNED -> TaskEditorCapability.ROUTINE_PLANNING
            task.lifecycleState == LifecycleState.RUNNING && (day.isCurrent || isEstablishedPastDay(day)) -> TaskEditorCapability.RUNNING_METADATA
            task.lifecycleState == LifecycleState.COMPLETED && (day.isCurrent || isEstablishedPastDay(day)) -> TaskEditorCapability.COMPLETED_METADATA
            else -> return
        }
        if (!day.isCurrent && !isEstablishedPastDay(day) && task.lifecycleState != LifecycleState.PLANNED) return
        val capability = routineCapability ?: when (task.lifecycleState) {
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
                    actualStartText = when (task.lifecycleState) {
                        LifecycleState.PLANNED -> ""
                        LifecycleState.RUNNING -> formatExecutionClock(task.activeStartedAt, day.establishmentTimezone)
                        LifecycleState.COMPLETED -> formatExecutionClock(task.firstStartedAt ?: task.activeStartedAt, day.establishmentTimezone)
                    },
                    actualEndText = if (task.lifecycleState == LifecycleState.COMPLETED) {
                        formatExecutionClock(task.lastEndedAt, day.establishmentTimezone)
                    } else {
                        ""
                    },
                    startReminderOffsetMinutes = task.startReminderOffsetMinutes,
                    notifyOnEstimateOverrun = task.notifyOnEstimateOverrun,
                ),
                capability = capability,
            ),
        )
        loadReferences()
    }

    fun updateDraft(draft: TaskEditorDraft) {
        if (state.saving) return
        val editor = state.editor ?: return
        val startChanged = draft.actualStartText != editor.draft.actualStartText
        val endChanged = draft.actualEndText != editor.draft.actualEndText
        val nextDraft = draft.copy(
            exactActualStart = if (startChanged) null else draft.exactActualStart,
            actualStartManualEditVersion = if (startChanged) editor.draft.actualStartManualEditVersion + 1
                else draft.actualStartManualEditVersion,
            exactActualEnd = if (endChanged) null else draft.exactActualEnd,
        )
        state = state.copy(editor = editor.copy(draft = nextDraft), errorMessage = null)
    }

    /** Text input is manual intent, even when the retyped HH:mm matches the quick selection. */
    fun updateActualStartText(value: String) {
        if (state.saving) return
        val editor = state.editor ?: return
        state = state.copy(
            editor = editor.copy(draft = editor.draft.copy(
                actualStartText = value,
                exactActualStart = null,
                actualStartManualEditVersion = editor.draft.actualStartManualEditVersion + 1,
            )),
            errorMessage = null,
        )
    }

    /** A focused end field is manual intent, including a same-minute re-entry. */
    fun beginManualActualEndEdit() {
        if (state.saving) return
        val editor = state.editor ?: return
        if (editor.draft.exactActualEnd == null) return
        state = state.copy(
            editor = editor.copy(draft = editor.draft.copy(exactActualEnd = null)),
            errorMessage = null,
        )
    }

    fun canSelectActualEndEstimateQuickInput(): Boolean {
        if (state.saving) return false
        val editor = state.editor ?: return false
        return proposedActualEnd(editor, now()) != null
    }

    fun selectActualEndEstimate() {
        if (state.saving) return
        val editor = state.editor ?: return
        val proposed = proposedActualEnd(editor, now()) ?: return
        val text = formatExecutionClock(proposed.instant.toString(), editor.day.establishmentTimezone)
        if (text.isBlank()) return
        val minute = parseActualClock(text) ?: return
        state = state.copy(
            editor = editor.copy(draft = editor.draft.copy(
                actualEndText = text,
                exactActualEnd = proposed.copy(displayedMinute = minute),
            )),
            errorMessage = null,
        )
    }

    fun selectCurrentTime() {
        if (!canSelectActualStartQuickInput()) return
        selectExactActualStart(now(), ExactActualStartSource.NOW)
    }

    fun selectPreviousTaskEnd() {
        if (!canSelectActualStartQuickInput()) return
        val editor = state.editor ?: return
        val instant = resolvePreviousTaskEnd(editor.day, editor.originalTask) ?: return
        selectExactActualStart(instant, ExactActualStartSource.PREVIOUS_END)
    }

    internal fun previousTaskEndForEditor(): Instant? {
        if (!canSelectActualStartQuickInput()) return null
        val editor = state.editor ?: return null
        return resolvePreviousTaskEnd(editor.day, editor.originalTask)
    }

    internal fun canSelectActualStartQuickInput(): Boolean {
        if (state.saving) return false
        val editor = state.editor ?: return false
        return canUseActualStartQuickInputs(editor)
    }

    private fun selectExactActualStart(instant: Instant, source: ExactActualStartSource) {
        val editor = state.editor ?: return
        val text = formatExecutionClock(instant.toString(), editor.day.establishmentTimezone)
        if (text.isBlank()) return
        state = state.copy(
            editor = editor.copy(
                draft = editor.draft.copy(
                    actualStartText = text,
                    exactActualStart = ExactActualStart(instant, source),
                ),
            ),
            errorMessage = null,
        )
    }

    private fun proposedActualEnd(editor: TaskEditorState, at: Instant): ExactActualEnd? {
        if (!canUseActualStartQuickInputs(editor) || editor.day.taskChuteDayId == null) return null
        val timezone = editor.day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() }
            ?: return null
        val draft = editor.draft
        val visibleStart = parseActualClock(draft.actualStartText) ?: return null
        val effectiveStart = resolveEffectiveActualStart(editor, visibleStart, timezone) ?: return null
        val estimateSeconds = if (editor.capability == TaskEditorCapability.COMPLETED_METADATA) {
            editor.originalTask?.estimateSeconds?.toLong()?.takeIf { it > 0L }
        } else {
            draft.estimateText.trim().toLongOrNull()
                ?.takeIf { it > 0L && it <= Int.MAX_VALUE / 60L }
                ?.times(60L)
        } ?: return null
        val end = runCatching { effectiveStart.instant.plusSeconds(estimateSeconds) }.getOrNull() ?: return null
        if (end.isAfter(at)) return null
        val display = formatExecutionClock(end.toString(), timezone.id)
        val displayMinute = parseActualClock(display) ?: return null
        return ExactActualEnd(
            instant = end,
            sourceStartedAt = effectiveStart.instant,
            sourceStartText = draft.actualStartText,
            sourceStartManualEditVersion = draft.actualStartManualEditVersion,
            displayedMinute = displayMinute,
            sourceStartRequiresMinutePrecision = effectiveStart.requiresMinutePrecision,
        )
    }

    private data class EffectiveActualStart(
        val instant: Instant,
        val requiresMinutePrecision: Boolean,
    )

    private fun resolveEffectiveActualStart(
        editor: TaskEditorState,
        visibleMinute: Int,
        timezone: ZoneId,
    ): EffectiveActualStart? {
        val draft = editor.draft
        val quickStart = draft.exactActualStart?.instant?.takeIf {
            parseActualClock(formatExecutionClock(it.toString(), timezone.id)) == visibleMinute
        }
        if (quickStart != null) return EffectiveActualStart(quickStart, requiresMinutePrecision = false)

        if (draft.actualStartManualEditVersion == 0) {
            val canonicalStart = resolveCanonicalExecutionStart(editor.originalTask)?.takeIf {
                parseActualClock(formatExecutionClock(it.toString(), timezone.id)) == visibleMinute
            }
            if (canonicalStart != null) return EffectiveActualStart(canonicalStart, requiresMinutePrecision = false)
            return null
        }

        val day = editor.day
        val startDate = LocalDate.parse(day.logicalDate)
            .plusDays(if (visibleMinute < day.establishmentBoundaryMinutes) 1 else 0)
        val minuteStart = runCatching {
            ZonedDateTime.of(
                startDate,
                LocalTime.of(visibleMinute / 60, visibleMinute % 60),
                timezone,
            ).toInstant()
        }.getOrNull() ?: return null
        if (parseActualClock(formatExecutionClock(minuteStart.toString(), timezone.id)) != visibleMinute) return null
        if (!canProveManualMinuteWillNotSnap(editor, minuteStart, timezone)) return null
        return EffectiveActualStart(minuteStart, requiresMinutePrecision = true)
    }

    /**
     * D-147(B) may move a manual minute start to a completed Execution ending inside that
     * displayed minute. The Day projection can prove the no-snap case only when every ended
     * Entry exposes one canonical Execution; ambiguous or multi-Execution history fails closed.
     */
    private fun canProveManualMinuteWillNotSnap(
        editor: TaskEditorState,
        minuteStart: Instant,
        timezone: ZoneId,
    ): Boolean {
        val startZoned = runCatching { minuteStart.atZone(timezone) }.getOrNull() ?: return false
        val minuteEndLocal = runCatching { startZoned.toLocalDateTime().plusMinutes(1) }.getOrNull() ?: return false
        val endOffsets = timezone.rules.getValidOffsets(minuteEndLocal)
        if (endOffsets.size != 1 || endOffsets.single() != startZoned.offset) return false
        val minuteEnd = runCatching { ZonedDateTime.ofLocal(minuteEndLocal, timezone, startZoned.offset).toInstant() }
            .getOrNull() ?: return false
        if (Duration.between(minuteStart, minuteEnd) != Duration.ofMinutes(1)) return false
        val target = editor.originalTask
        for (entry in editor.day.allEntries) {
            val rawEnd = entry.lastEndedAt ?: continue
            val endedAt = runCatching { Instant.parse(rawEnd) }.getOrNull() ?: return false
            if (target?.lifecycleState == LifecycleState.COMPLETED
                && entry.id == target.id && entry.executionId != null
                && entry.executionId == target.executionId
            ) {
                // SetExecutionTimes excludes the selected Execution from its blocker query.
                continue
            }
            if (entry.lifecycleState == LifecycleState.RUNNING
                || entry.lifecycleState == LifecycleState.PLANNED
                || entry.executionId == null
            ) return false
            val startedAt = entry.firstStartedAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
                ?: return false
            if (startedAt.isBefore(minuteEnd) && endedAt.isAfter(minuteStart) && endedAt.isBefore(minuteEnd)) {
                return false
            }
        }
        return true
    }

    private fun resolveCanonicalExecutionStart(task: TodayTask?): Instant? {
        task ?: return null
        if (task.executionId == null) return null
        val raw = when (task.lifecycleState) {
            LifecycleState.PLANNED -> return null
            LifecycleState.RUNNING -> task.activeStartedAt ?: return null
            LifecycleState.COMPLETED -> {
                if (task.activeStartedAt != null && task.firstStartedAt != null) {
                    val active = runCatching { Instant.parse(task.activeStartedAt) }.getOrNull() ?: return null
                    val first = runCatching { Instant.parse(task.firstStartedAt) }.getOrNull() ?: return null
                    if (active != first) return null
                }
                task.activeStartedAt ?: task.firstStartedAt ?: return null
            }
        }
        return runCatching { Instant.parse(raw) }.getOrNull()
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
        val normalizedRequestInput = if (editor.capability == TaskEditorCapability.ROUTINE_PLANNING) {
            synchronizeRoutineSectionPlan(editor.day, requestInput)
        } else {
            requestInput
        }
        val previousState = state
        onOptimisticIntent(editor, normalizedRequestInput)
        // Keep the in-flight marker for controller callers while the editor sheet closes immediately.
        state = TaskPlanningUiState(saving = true)
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.save(editor, normalizedRequestInput) }
            when (result) {
                PlanningSaveResult.Success -> {
                    state = TaskPlanningUiState()
                    onSaved()
                }
                is PlanningSaveResult.SuccessWithRevision -> {
                    onPlacementRevisionConfirmed(editor.day.logicalDate, result.placementRevision)
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

    private fun canEditEntryDay(day: TodayDay): Boolean = day.taskChuteDayId != null
        && (!day.isCurrent || day.planningEnabled)

    private fun isEstablishedPastDay(day: TodayDay): Boolean = !day.isCurrent
        && !day.planningEnabled && day.taskChuteDayId != null

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
