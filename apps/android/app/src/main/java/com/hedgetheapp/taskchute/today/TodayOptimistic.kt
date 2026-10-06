package com.hedgetheapp.taskchute.today

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Presentation-only projections. These helpers never change the canonical Day or server
 * request semantics; they only make an accepted local intent visible while the command runs.
 */
internal fun applyOptimisticPlanning(
    day: TodayDay,
    editor: TaskEditorState,
    input: NormalizedTaskInput,
): TodayDay {
    val original = editor.originalTask
    val taskId = input.clientTaskId ?: original?.taskId
    val entryId = input.clientEntryId ?: original?.id
    if (entryId == null) return day

    val optimistic = if (original == null) {
        val actualStart = input.actualStartInstant ?: input.actualStartMinute?.let { logicalMinuteToInstant(day, it) }
        val actualEnd = input.actualEndMinute?.let { logicalMinuteToInstant(day, it) }
        val lifecycle = when {
            actualEnd != null -> LifecycleState.COMPLETED
            actualStart != null -> LifecycleState.RUNNING
            else -> LifecycleState.PLANNED
        }
        val optimisticExecutionId = actualStart?.let { "optimistic-$entryId" }
        val duration = if (actualStart != null && actualEnd != null) {
            runCatching { Duration.between(Instant.parse(actualStart), Instant.parse(actualEnd)).seconds.toInt().coerceAtLeast(0) }.getOrNull()
        } else null
        TodayTask(
            id = entryId,
            title = input.title,
            lifecycleState = lifecycle,
            project = input.projectId?.let { TodayProject(it, input.projectTitle ?: it) },
            mode = input.modeId?.let { TodayMode(it, input.modeTitle ?: it) },
            estimateSeconds = input.estimateSeconds,
            plannedStartMinute = input.plannedStartMinute,
            executionId = optimisticExecutionId,
            activeStartedAt = if (lifecycle == LifecycleState.RUNNING) actualStart else null,
            taskId = taskId,
            firstStartedAt = actualStart,
            lastEndedAt = actualEnd,
            completedDurationSeconds = duration,
            startReminderOffsetMinutes = input.startReminderOffsetMinutes,
            notifyOnEstimateOverrun = input.notifyOnEstimateOverrun,
        )
    } else {
        val actualStart = input.actualStartInstant ?: input.actualStartMinute?.let { logicalMinuteToInstant(day, it) }
        val actualEnd = input.actualEndMinute?.let { logicalMinuteToInstant(day, it) }
        val rollbackToPlanned = original.lifecycleState == LifecycleState.RUNNING
            && input.actualStartMinute == null && input.actualEndMinute == null
        val directCompletedRollback = original.lifecycleState == LifecycleState.COMPLETED
            && input.actualStartMinute == null && input.actualEndMinute == null
        val reopenToRunning = original.lifecycleState == LifecycleState.COMPLETED
            && input.actualStartMinute != null && input.actualEndMinute == null
        val lifecycle = when {
            rollbackToPlanned || directCompletedRollback -> LifecycleState.PLANNED
            reopenToRunning -> LifecycleState.RUNNING
            actualEnd != null -> LifecycleState.COMPLETED
            actualStart != null -> LifecycleState.RUNNING
            else -> original.lifecycleState
        }
        val duration = if (actualStart != null && actualEnd != null) {
            runCatching {
                java.time.Duration.between(Instant.parse(actualStart), Instant.parse(actualEnd)).seconds
                    .toInt()
                    .coerceAtLeast(0)
            }.getOrNull()
        } else {
            original.completedDurationSeconds
        }
        val preservedHistoricalStart = original.firstStartedAt
            ?.takeUnless { rollbackToPlanned && it == original.activeStartedAt }
        original.copy(
            title = if (directCompletedRollback) original.title else input.title,
            project = if (directCompletedRollback) original.project
                else input.projectId?.let { TodayProject(it, input.projectTitle ?: it) },
            mode = if (directCompletedRollback) original.mode
                else input.modeId?.let { TodayMode(it, input.modeTitle ?: it) },
            estimateSeconds = if (directCompletedRollback) original.estimateSeconds else input.estimateSeconds,
            plannedStartMinute = if (directCompletedRollback) original.plannedStartMinute else input.plannedStartMinute,
            lifecycleState = lifecycle,
            executionId = when (lifecycle) {
                LifecycleState.PLANNED -> null
                LifecycleState.RUNNING -> original.executionId ?: "optimistic-$entryId"
                LifecycleState.COMPLETED -> original.executionId
            },
            activeStartedAt = when (lifecycle) {
                LifecycleState.RUNNING -> if (reopenToRunning) {
                    input.actualStartInstant ?: original.firstStartedAt ?: actualStart
                } else actualStart ?: original.activeStartedAt
                LifecycleState.PLANNED, LifecycleState.COMPLETED -> null
            },
            firstStartedAt = when {
                directCompletedRollback -> null
                rollbackToPlanned -> preservedHistoricalStart
                reopenToRunning -> input.actualStartInstant ?: original.firstStartedAt ?: actualStart
                else -> actualStart ?: original.firstStartedAt
            },
            lastEndedAt = when {
                directCompletedRollback -> null
                rollbackToPlanned -> original.lastEndedAt
                reopenToRunning -> null
                actualEnd != null -> actualEnd
                lifecycle == LifecycleState.COMPLETED -> original.lastEndedAt
                else -> null
            },
            completedDurationSeconds = if (reopenToRunning || directCompletedRollback) 0 else duration,
            startReminderOffsetMinutes = if (directCompletedRollback) original.startReminderOffsetMinutes
                else input.startReminderOffsetMinutes,
            notifyOnEstimateOverrun = if (directCompletedRollback) original.notifyOnEstimateOverrun
                else input.notifyOnEstimateOverrun,
        )
    }

    val exactActualSection = input.actualStartInstant?.let { value ->
        runCatching { Instant.parse(value) }.getOrNull()?.let { resolveOptimisticExecutionSection(day, it) }
    }
    val withoutOriginal = day.removeEntry(entryId)
    val targetSectionId = if (original?.lifecycleState == LifecycleState.COMPLETED
        && input.actualStartMinute == null && input.actualEndMinute == null) {
        day.sectionIdOf(entryId)
    } else {
        exactActualSection ?: input.sectionId
    }
    val updatedDay = withoutOriginal.insertEntry(targetSectionId, optimistic)
    return when (optimistic.lifecycleState) {
        LifecycleState.RUNNING -> updatedDay.copy(
            activeExecution = TodayExecution(
                optimistic.executionId ?: "optimistic-$entryId",
                entryId,
                optimistic.activeStartedAt ?: Instant.now().toString(),
                optimistic.estimateSeconds,
            ),
        )
        LifecycleState.COMPLETED -> updatedDay.copy(activeExecution = null)
        LifecycleState.PLANNED -> updatedDay.copy(
            activeExecution = updatedDay.activeExecution?.takeUnless { it.entryId == entryId },
        )
    }
}

private fun logicalMinuteToInstant(day: TodayDay, minute: Int): String {
    val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.of("UTC")
    val date = LocalDate.parse(day.logicalDate).plusDays(if (minute < day.establishmentBoundaryMinutes) 1 else 0)
    return ZonedDateTime.of(date, LocalTime.of(minute / 60, minute % 60), zone).toInstant().toString()
}

internal fun applyOptimisticLifecycle(
    day: TodayDay,
    entryId: String,
    nextState: LifecycleState,
): TodayDay {
    val task = day.allEntries.firstOrNull { it.id == entryId }
    if (task == null) {
        return if (nextState == LifecycleState.COMPLETED
            && day.activeExecution?.entryId == entryId
            && day.activeEntry?.id == entryId
        ) {
            day.copy(activeExecution = null, activeEntry = null)
        } else day
    }
    val now = Instant.now().toString()
    val updated = when (nextState) {
        LifecycleState.RUNNING -> task.copy(
            lifecycleState = LifecycleState.RUNNING,
            executionId = task.executionId ?: "optimistic-$entryId",
            activeStartedAt = task.activeStartedAt ?: now,
            firstStartedAt = task.firstStartedAt ?: now,
        )
        LifecycleState.COMPLETED -> {
            val start = task.firstStartedAt ?: task.activeStartedAt
            val duration = start?.let { runCatching { Duration.between(Instant.parse(it), Instant.parse(now)).seconds.toInt().coerceAtLeast(0) }.getOrNull() }
            task.copy(
                lifecycleState = LifecycleState.COMPLETED,
                lastEndedAt = now,
                completedDurationSeconds = duration ?: task.completedDurationSeconds,
            )
        }
        LifecycleState.PLANNED -> task.copy(lifecycleState = LifecycleState.PLANNED)
    }
    val sourceSectionId = day.sectionIdOf(entryId)
    val targetSectionId = if (nextState == LifecycleState.RUNNING) {
        resolveOptimisticExecutionSection(day, Instant.parse(now)) ?: sourceSectionId
    } else {
        sourceSectionId
    }
    val replaced = day.removeEntry(entryId).insertEntry(targetSectionId, updated)
    return when (nextState) {
        LifecycleState.RUNNING -> replaced.copy(
            activeExecution = TodayExecution(updated.executionId ?: "optimistic-$entryId", entryId, now, updated.estimateSeconds),
        )
        LifecycleState.COMPLETED -> replaced.copy(activeExecution = null)
        LifecycleState.PLANNED -> replaced
    }
}

private fun resolveOptimisticExecutionSection(day: TodayDay, instant: Instant): String? {
    if (!day.isCurrent) return null
    val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: return null
    val local = instant.atZone(zone)
    val localMinute = local.hour * 60 + local.minute
    val logicalMinute = if (localMinute < day.establishmentBoundaryMinutes) localMinute + 1440 else localMinute
    return day.sections.firstOrNull { section ->
        val start = section.startMinute ?: return@firstOrNull false
        val end = section.endMinute ?: return@firstOrNull false
        logicalMinute >= start && logicalMinute < end &&
            (section.actualEndInstant == null || runCatching { instant.isBefore(Instant.parse(section.actualEndInstant)) }.getOrDefault(false))
    }?.id
}
internal fun applyOptimisticDirectManipulation(
    day: TodayDay,
    request: DirectManipulationRequest,
): TodayDay = when (request) {
    is DirectManipulationRequest.Reorder -> day.reorderSection(request.sectionId, request.entryIds)
    is DirectManipulationRequest.Move -> day.moveEntry(request.entryId, request.sectionId, request.placement)
    is DirectManipulationRequest.Duplicate -> {
        val source = day.allEntries.firstOrNull { it.id == request.sourceEntryId }
        if (source == null) day else day.insertEntry(day.sectionIdOf(source.id), source.copy(id = request.newEntryId, taskId = request.newTaskId))
    }
    is DirectManipulationRequest.MoveToDay -> request.entryIds.fold(day) { current, id -> current.removeEntry(id) }
    is DirectManipulationRequest.Delete -> request.entryIds.fold(day) { current, id -> current.removeEntry(id) }
    is DirectManipulationRequest.HardDelete -> day.removeEntry(request.entryId)
}

internal fun previewOptimisticPlacement(day: TodayDay, entryId: String, targetSectionId: String?, target: PlacementTarget?): TodayDay =
    applyOptimisticDirectManipulation(
        day,
        DirectManipulationRequest.Move(
            operationId = "preview",
            entryId = entryId,
            taskChuteDayId = day.taskChuteDayId ?: "preview",
            sectionId = targetSectionId,
            expectedPlacementRevision = day.placementRevision,
            placement = target,
        ),
    )

private fun TodayDay.removeEntry(entryId: String): TodayDay = copy(
    sections = sections.map { section -> section.copy(entries = section.entries.filterNot { it.id == entryId }) },
    unsectionedEntries = unsectionedEntries.filterNot { it.id == entryId },
    activeExecution = activeExecution?.takeUnless { it.entryId == entryId },
)

private fun TodayDay.replaceEntry(task: TodayTask): TodayDay = copy(
    sections = sections.map { section -> section.copy(entries = section.entries.map { if (it.id == task.id) task else it }) },
    unsectionedEntries = unsectionedEntries.map { if (it.id == task.id) task else it },
)

private fun TodayDay.sectionIdOf(entryId: String): String? = sections.firstOrNull { section -> section.entries.any { it.id == entryId } }?.id

private fun TodayDay.insertEntry(sectionId: String?, task: TodayTask): TodayDay = if (sectionId == null) {
    copy(unsectionedEntries = canonicalTaskOrder(unsectionedEntries + task))
} else {
    copy(sections = sections.map { section -> if (section.id == sectionId) section.copy(entries = canonicalTaskOrder(section.entries + task)) else section })
}

private fun canonicalTaskOrder(entries: List<TodayTask>): List<TodayTask> = entries.withIndex().sortedWith(
    compareBy<IndexedValue<TodayTask>> { if (it.value.lifecycleState == LifecycleState.PLANNED) 1 else 0 }
        .thenComparator { left, right ->
            if (left.value.lifecycleState == LifecycleState.PLANNED && right.value.lifecycleState == LifecycleState.PLANNED) {
                compareValues(left.value.plannedStartMinute, right.value.plannedStartMinute)
            } else {
                compareValues(left.value.firstStartedAt ?: left.value.activeStartedAt, right.value.firstStartedAt ?: right.value.activeStartedAt)
            }
        }
        .thenBy { it.index },
).map { it.value }

private fun TodayDay.reorderSection(sectionId: String?, entryIds: List<String>): TodayDay = if (sectionId == null) {
    copy(unsectionedEntries = reorderEntries(unsectionedEntries, entryIds))
} else {
    copy(sections = sections.map { section -> if (section.id == sectionId) section.copy(entries = reorderEntries(section.entries, entryIds)) else section })
}

private fun TodayDay.moveEntry(entryId: String, targetSectionId: String?, placement: PlacementTarget?): TodayDay {
    val task = allEntries.firstOrNull { it.id == entryId } ?: return this
    val removed = removeEntry(entryId)
    val target = if (targetSectionId == null) removed.unsectionedEntries.toMutableList()
    else removed.sections.firstOrNull { it.id == targetSectionId }?.entries?.toMutableList() ?: mutableListOf()
    val index = placement?.let { target.indexOfFirst { entry -> entry.id == it.anchorEntryId }.let { anchor -> if (anchor < 0) target.size else if (it.edge == PlacementEdge.BEFORE) anchor else anchor + 1 } } ?: target.size
    target.add(index.coerceIn(0, target.size), task)
    val ordered = if (placement == null) canonicalTaskOrder(target) else target
    return if (targetSectionId == null) removed.copy(unsectionedEntries = ordered) else removed.copy(
        sections = removed.sections.map { section -> if (section.id == targetSectionId) section.copy(entries = ordered) else section },
    )
}

private fun reorderEntries(entries: List<TodayTask>, entryIds: List<String>): List<TodayTask> {
    val byId = entries.associateBy(TodayTask::id)
    return entryIds.mapNotNull(byId::get) + entries.filterNot { it.id in entryIds }
}
