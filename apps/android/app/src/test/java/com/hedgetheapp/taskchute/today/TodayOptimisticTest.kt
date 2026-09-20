package com.hedgetheapp.taskchute.today

import androidx.compose.ui.geometry.Rect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayOptimisticTest {
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
