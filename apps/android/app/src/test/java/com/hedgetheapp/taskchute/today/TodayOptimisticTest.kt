package com.hedgetheapp.taskchute.today

import androidx.compose.ui.geometry.Rect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayOptimisticTest {
    @Test
    fun planningOverlayProjectsReminderIntentForCreateAndEdit() {
        val createInput = NormalizedTaskInput(
            title = "Reminder task",
            projectId = null,
            modeId = null,
            sectionId = "morning",
            plannedStartMinute = 540,
            estimateSeconds = 600,
            clientTaskId = "task-reminder",
            clientEntryId = "entry-reminder",
            startReminderOffsetMinutes = 15,
            notifyOnEstimateOverrun = true,
        )
        val created = applyOptimisticPlanning(
            day(),
            TaskEditorState(TaskEditorMode.CREATE, day(), null, TaskEditorDraft()),
            createInput,
        ).allEntries.single { it.id == "entry-reminder" }

        assertEquals(15, created.startReminderOffsetMinutes)
        assertEquals(true, created.notifyOnEstimateOverrun)

        val source = day()
        val original = source.allEntries.single { it.id == "entry-a" }
        val editOnInput = createInput.copy(
            title = original.title,
            clientTaskId = null,
            clientEntryId = null,
            startReminderOffsetMinutes = 0,
            notifyOnEstimateOverrun = true,
        )
        val editedOn = applyOptimisticPlanning(
            source,
            TaskEditorState(TaskEditorMode.EDIT, source, original, TaskEditorDraft()),
            editOnInput,
        ).allEntries.single { it.id == original.id }

        assertEquals(0, editedOn.startReminderOffsetMinutes)
        assertEquals(true, editedOn.notifyOnEstimateOverrun)
    }

    @Test
    fun planningOverlayProjectsReminderOptOutForEdit() {
        val source = day()
        val original = source.allEntries.single { it.id == "entry-a" }.copy(
            startReminderOffsetMinutes = 15,
            notifyOnEstimateOverrun = true,
        )
        val sourceWithReminder = source.copy(
            sections = source.sections.map { section ->
                if (section.id == "morning") section.copy(
                    entries = section.entries.map { if (it.id == original.id) original else it },
                ) else section
            },
        )
        val projected = applyOptimisticPlanning(
            sourceWithReminder,
            TaskEditorState(TaskEditorMode.EDIT, sourceWithReminder, original, TaskEditorDraft()),
            NormalizedTaskInput(
                title = original.title,
                projectId = null,
                modeId = null,
                sectionId = "morning",
                plannedStartMinute = original.plannedStartMinute,
                estimateSeconds = original.estimateSeconds,
                startReminderOffsetMinutes = null,
                notifyOnEstimateOverrun = false,
            ),
        ).allEntries.single { it.id == original.id }

        assertNull(projected.startReminderOffsetMinutes)
        assertEquals(false, projected.notifyOnEstimateOverrun)
    }

    @Test
    fun planningOverlayAddsAndEditsWithoutChangingEntryIdentity() {
        val createInput = NormalizedTaskInput(
            title = "New",
            projectId = "p1",
            modeId = "m1",
            sectionId = "morning",
            plannedStartMinute = 540,
            estimateSeconds = 600,
            clientTaskId = "task-new",
            clientEntryId = "entry-new",
            projectTitle = "Project",
            modeTitle = "Mode",
        )
        val created = applyOptimisticPlanning(day(), TaskEditorState(TaskEditorMode.CREATE, day(), null, TaskEditorDraft()), createInput)
        val newTask = created.allEntries.first { it.id == "entry-new" }
        assertEquals("task-new", newTask.taskId)
        assertEquals("Project", newTask.project?.title)

        val original = day().allEntries.first()
        val edited = applyOptimisticPlanning(
            day(),
            TaskEditorState(TaskEditorMode.EDIT, day(), original, TaskEditorDraft()),
            createInput.copy(title = "Edited", clientTaskId = null, clientEntryId = null),
        )
        assertEquals("Edited", edited.allEntries.first { it.id == original.id }.title)
        assertEquals(original.id, edited.allEntries.first { it.title == "Edited" }.id)
    }

    @Test
    fun reorderAndMoveOverlayUsesEntryOrderAndPlacement() {
        val reordered = applyOptimisticDirectManipulation(
            day(),
            DirectManipulationRequest.Reorder("op", "day", "morning", listOf("entry-b", "entry-a"), 1),
        )
        assertEquals(listOf("entry-b", "entry-a"), reordered.sections.first().entries.map(TodayTask::id))

        val moved = applyOptimisticDirectManipulation(
            day(),
            DirectManipulationRequest.Move(
                operationId = "op-2",
                entryId = "entry-a",
                taskChuteDayId = "day",
                sectionId = "afternoon",
                expectedPlacementRevision = 1,
                placement = PlacementTarget("afternoon", "entry-c", PlacementEdge.BEFORE),
            ),
        )
        assertEquals(listOf("entry-b"), moved.sections.first { it.id == "morning" }.entries.map(TodayTask::id))
        assertEquals(listOf("entry-a", "entry-c"), moved.sections.first { it.id == "afternoon" }.entries.map(TodayTask::id))
    }

    @Test
    fun lifecycleOverlayShowsRunningAndCompletedImmediately() {
        val running = applyOptimisticLifecycle(day(), "entry-a", LifecycleState.RUNNING)
        assertEquals(LifecycleState.RUNNING, running.allEntries.first { it.id == "entry-a" }.lifecycleState)
        assertEquals("entry-a", running.runningTask?.id)
        assertNotNull(running.allEntries.first { it.id == "entry-a" }.activeStartedAt)

        val completed = applyOptimisticLifecycle(running, "entry-a", LifecycleState.COMPLETED)
        assertEquals(LifecycleState.COMPLETED, completed.allEntries.first { it.id == "entry-a" }.lifecycleState)
        assertNull(completed.runningTask)
        assertTrue(completed.allEntries.first { it.id == "entry-a" }.lastEndedAt != null)
    }

    @Test
    fun lifecycleEditorProjectionAppliesActualTimesBeforeReconcile() {
        val original = day().allEntries.first { it.id == "entry-a" }
        val projected = applyOptimisticPlanning(
            day(),
            TaskEditorState(TaskEditorMode.EDIT, day(), original, TaskEditorDraft()),
            NormalizedTaskInput(
                title = original.title,
                projectId = null,
                modeId = null,
                sectionId = "morning",
                plannedStartMinute = original.plannedStartMinute,
                estimateSeconds = original.estimateSeconds,
                actualStartMinute = 9 * 60,
                actualEndMinute = 10 * 60,
            ),
        )

        val task = projected.allEntries.first { it.id == original.id }
        assertEquals(LifecycleState.COMPLETED, task.lifecycleState)
        assertTrue(task.firstStartedAt!!.contains("T09:00"))
        assertTrue(task.lastEndedAt!!.contains("T10:00"))
        assertEquals(60 * 60, task.completedDurationSeconds)
        assertNull(projected.runningTask)
    }

    @Test
    fun lifecycleEditorProjectionWithStartOnlyBecomesRunning() {
        val original = day().allEntries.first { it.id == "entry-a" }
        val projected = applyOptimisticPlanning(
            day(),
            TaskEditorState(TaskEditorMode.EDIT, day(), original, TaskEditorDraft()),
            NormalizedTaskInput(
                title = original.title,
                projectId = null,
                modeId = null,
                sectionId = "morning",
                plannedStartMinute = original.plannedStartMinute,
                estimateSeconds = original.estimateSeconds,
                actualStartMinute = 9 * 60,
                actualEndMinute = null,
            ),
        )

        val task = projected.allEntries.first { it.id == original.id }
        assertEquals(LifecycleState.RUNNING, task.lifecycleState)
        assertNotNull(task.activeStartedAt)
        assertNull(task.lastEndedAt)
        assertEquals(original.id, projected.runningTask?.id)
    }

    @Test
    fun lifecycleEditorRollbackImmediatelyReturnsRunningEntryToPlannedAndKeepsOlderHistory() {
        val source = day()
        val original = source.allEntries.first { it.id == "entry-a" }.copy(
            lifecycleState = LifecycleState.RUNNING,
            executionId = "execution-active",
            activeStartedAt = "2026-09-20T10:00:00Z",
            firstStartedAt = "2026-09-20T08:00:00Z",
            lastEndedAt = "2026-09-20T08:45:00Z",
        )
        val runningDay = source.copy(
            sections = source.sections.map { section ->
                section.copy(entries = section.entries.map { if (it.id == original.id) original else it })
            },
            activeExecution = TodayExecution("execution-active", original.id, original.activeStartedAt!!, original.estimateSeconds),
        )
        val projected = applyOptimisticPlanning(
            runningDay,
            TaskEditorState(TaskEditorMode.EDIT, runningDay, original, TaskEditorDraft()),
            NormalizedTaskInput(original.title, null, null, "morning", original.plannedStartMinute,
                original.estimateSeconds, actualStartMinute = null, actualEndMinute = null),
        )

        val task = projected.allEntries.single { it.id == original.id }
        assertEquals(LifecycleState.PLANNED, task.lifecycleState)
        assertNull(task.executionId)
        assertNull(task.activeStartedAt)
        assertEquals("2026-09-20T08:00:00Z", task.firstStartedAt)
        assertEquals("2026-09-20T08:45:00Z", task.lastEndedAt)
        assertNull(projected.activeExecution)
    }

    @Test
    fun lifecycleEditorReopenImmediatelyKeepsTheCompletedExecutionStart() {
        val source = day()
        val original = source.allEntries.first { it.id == "entry-a" }.copy(
            lifecycleState = LifecycleState.COMPLETED,
            executionId = "execution-completed",
            activeStartedAt = null,
            firstStartedAt = "2026-09-20T09:00:13.456Z",
            lastEndedAt = "2026-09-20T09:30:15.789Z",
            completedDurationSeconds = 1_802,
        )
        val completedDay = source.copy(sections = source.sections.map { section ->
            section.copy(entries = section.entries.map { if (it.id == original.id) original else it })
        })
        val projected = applyOptimisticPlanning(
            completedDay,
            TaskEditorState(TaskEditorMode.EDIT, completedDay, original, TaskEditorDraft()),
            NormalizedTaskInput(original.title, null, null, "morning", original.plannedStartMinute,
                original.estimateSeconds, actualStartMinute = 9 * 60, actualEndMinute = null),
        )

        val task = projected.allEntries.single { it.id == original.id }
        assertEquals(LifecycleState.RUNNING, task.lifecycleState)
        assertEquals("execution-completed", task.executionId)
        assertEquals(original.firstStartedAt, task.activeStartedAt)
        assertEquals(original.firstStartedAt, task.firstStartedAt)
        assertNull(task.lastEndedAt)
        assertEquals(0, task.completedDurationSeconds)
        assertEquals("execution-completed", projected.activeExecution?.id)
        assertEquals(original.firstStartedAt, projected.activeExecution?.startedAt)
    }

    @Test
    fun dragTargetUsesStableSnapshotThresholdsDuringProvisionalAnimation() {
        val bounds = mapOf(
            "entry-a" to Rect(0f, 0f, 100f, 50f),
            "entry-b" to Rect(0f, 50f, 100f, 100f),
        )
        val first = resolveAndroidDropTarget(
            positionY = 90f,
            sourceEntryId = "entry-a",
            entryBounds = bounds,
            entrySectionIds = mapOf("entry-a" to "morning", "entry-b" to "morning"),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )
        val afterAnimation = resolveAndroidDropTarget(
            positionY = 90f,
            sourceEntryId = "entry-a",
            entryBounds = bounds,
            entrySectionIds = mapOf("entry-a" to "morning", "entry-b" to "morning"),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-b"), first?.key)
        assertEquals(PlacementEdge.AFTER, first?.edge)
        assertEquals(100f, first?.resolvedBoundaryY)
        assertEquals(first, afterAnimation)
    }

    @Test
    fun dragPresentationKeepsTheRealSourceEntryKeyInTheProvisionalOrder() {
        val preview = previewDayForTarget(
            day(),
            entryId = "entry-a",
            target = AndroidDropTarget(
                key = entryDropKey("entry-b"),
                sectionId = "morning",
                anchorEntryId = "entry-b",
                edge = PlacementEdge.AFTER,
            ),
        )

        assertEquals(
            listOf("entry-b", "entry-a"),
            preview.sections.first { it.id == "morning" }.entries.map(TodayTask::id),
        )
    }

    @Test
    fun crossSectionDragPreviewKeepsTheSourceEntryKeyExactlyOnce() {
        val preview = previewDayForTarget(
            day(),
            entryId = "entry-a",
            target = AndroidDropTarget(
                key = entryDropKey("entry-c"),
                sectionId = "afternoon",
                anchorEntryId = "entry-c",
                edge = PlacementEdge.BEFORE,
            ),
        )

        assertEquals(
            listOf("entry-b"),
            preview.sections.first { it.id == "morning" }.entries.map(TodayTask::id),
        )
        assertEquals(
            listOf("entry-a", "entry-c"),
            preview.sections.first { it.id == "afternoon" }.entries.map(TodayTask::id),
        )
        assertEquals(1, preview.allEntries.count { it.id == "entry-a" })
    }

    @Test
    fun completedRowsAreNotManualDropAnchors() {
        val target = resolveAndroidDropTarget(
            positionY = 120f,
            sourceEntryId = "entry-source",
            entryBounds = mapOf(
                "entry-completed" to Rect(0f, 50f, 100f, 100f),
            ),
            entrySectionIds = mapOf("entry-completed" to "afternoon"),
            entryAnchorEligible = mapOf("entry-completed" to false),
            emptySectionBounds = mapOf("afternoon" to Rect(0f, 100f, 100f, 140f)),
            emptySectionIds = mapOf("afternoon" to "afternoon"),
        )

        assertEquals(AndroidDropTarget("section:afternoon", "afternoon", null, null), target)
    }

    @Test
    fun consecutiveEmptySectionsRemainIndividuallyTargetable() {
        val target = resolveAndroidDropTarget(
            positionY = 165f,
            sourceEntryId = "entry-source",
            entryBounds = emptyMap(),
            entrySectionIds = emptyMap(),
            emptySectionBounds = mapOf(
                "morning" to Rect(0f, 100f, 100f, 140f),
                "afternoon" to Rect(0f, 140f, 100f, 180f),
            ),
            emptySectionIds = mapOf("morning" to "morning", "afternoon" to "afternoon"),
        )

        assertEquals("section:afternoon", target?.key)
        assertEquals("afternoon", target?.sectionId)
        assertEquals(null, target?.anchorEntryId)
    }

    private fun day() = TodayDay(
        logicalDate = "2026-09-20",
        isCurrent = true,
        planningEnabled = true,
        placementRevision = 1,
        sections = listOf(
            TodaySection("morning", "Morning", 480, 720, listOf(task("entry-a"), task("entry-b"))),
            TodaySection("afternoon", "Afternoon", 720, 1080, listOf(task("entry-c"))),
        ),
        unsectionedEntries = emptyList(),
        activeExecution = null,
        taskChuteDayId = "day",
    )

    private fun task(id: String) = TodayTask(
        id = id,
        title = id,
        lifecycleState = LifecycleState.PLANNED,
        project = null,
        mode = null,
        estimateSeconds = 600,
        plannedStartMinute = 540,
        executionId = null,
        activeStartedAt = null,
    )
}
