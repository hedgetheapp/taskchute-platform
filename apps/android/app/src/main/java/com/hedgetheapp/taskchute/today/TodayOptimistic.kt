package com.hedgetheapp.taskchute.today

import java.time.Instant

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
        TodayTask(
            id = entryId,
            title = input.title,
            lifecycleState = LifecycleState.PLANNED,
            project = input.projectId?.let { TodayProject(it, input.projectTitle ?: it) },
            mode = input.modeId?.let { TodayMode(it, input.modeTitle ?: it) },
            estimateSeconds = input.estimateSeconds,
            plannedStartMinute = input.plannedStartMinute,
            executionId = null,
            activeStartedAt = null,
            taskId = taskId,
        )
    } else {
        original.copy(
            title = input.title,
            project = input.projectId?.let { TodayProject(it, input.projectTitle ?: it) },
            mode = input.modeId?.let { TodayMode(it, input.modeTitle ?: it) },
            estimateSeconds = input.estimateSeconds,
            plannedStartMinute = input.plannedStartMinute,
        )
    }

    val withoutOriginal = day.removeEntry(entryId)
    return withoutOriginal.insertEntry(input.sectionId, optimistic)
}

internal fun applyOptimisticLifecycle(
    day: TodayDay,
    entryId: String,
    nextState: LifecycleState,
): TodayDay {
    val task = day.allEntries.firstOrNull { it.id == entryId } ?: return day
    val now = Instant.now().toString()
    val updated = when (nextState) {
        LifecycleState.RUNNING -> task.copy(
            lifecycleState = LifecycleState.RUNNING,
            activeStartedAt = task.activeStartedAt ?: now,
            firstStartedAt = task.firstStartedAt ?: now,
        )
        LifecycleState.COMPLETED -> {
            val start = task.firstStartedAt ?: task.activeStartedAt
            val duration = start?.let { runCatching { (java.time.Duration.between(Instant.parse(it), Instant.parse(now)).seconds).toInt().coerceAtLeast(0) }.getOrNull() }
            task.copy(
                lifecycleState = LifecycleState.COMPLETED,
                lastEndedAt = now,
                completedDurationSeconds = duration ?: task.completedDurationSeconds,
            )
        }
        LifecycleState.PLANNED -> task.copy(lifecycleState = LifecycleState.PLANNED)
    }
    val replaced = day.replaceEntry(updated)
    return when (nextState) {
        LifecycleState.RUNNING -> replaced.copy(
            activeExecution = TodayExecution("optimistic-$entryId", entryId, now, updated.estimateSeconds),
        )
        LifecycleState.COMPLETED -> replaced.copy(activeExecution = null)
        LifecycleState.PLANNED -> replaced
    }
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
    copy(unsectionedEntries = unsectionedEntries + task)
} else {
    copy(sections = sections.map { section -> if (section.id == sectionId) section.copy(entries = section.entries + task) else section })
}

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
    return if (targetSectionId == null) removed.copy(unsectionedEntries = target) else removed.copy(
        sections = removed.sections.map { section -> if (section.id == targetSectionId) section.copy(entries = target) else section },
    )
}

private fun reorderEntries(entries: List<TodayTask>, entryIds: List<String>): List<TodayTask> {
    val byId = entries.associateBy(TodayTask::id)
    return entryIds.mapNotNull(byId::get) + entries.filterNot { it.id in entryIds }
}
