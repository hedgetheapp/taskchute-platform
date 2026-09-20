package com.hedgetheapp.taskchute.today

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskPlanningControllerTest {
    @Test
    fun createLoadsReferencesAndSaveDispatchesOnce() {
        val repository = FakePlanningRepository().apply { holdSave = true }
        var saved = 0
        val controller = controller(repository) { saved++ }

        controller.openCreate(currentDay())
        assertTrue(await { controller.state.references != null })
        controller.updateDraft(controller.state.editor!!.draft.copy(title = "新しいタスク", estimateText = "15"))
        controller.save()
        controller.save()

        assertTrue(repository.saveStarted.await(2, TimeUnit.SECONDS))
        assertEquals(1, repository.saveCalls.get())
        assertTrue(controller.state.saving)
        repository.releaseSave.countDown()
        assertTrue(await { controller.state.editor == null })
        assertTrue(await { saved == 1 })
        assertEquals(1, saved)
        assertEquals("新しいタスク", repository.lastInput?.title)
        assertEquals(900, repository.lastInput?.estimateSeconds)
        controller.close()
    }

    @Test
    fun invalidDraftDoesNotSendRequest() {
        val repository = FakePlanningRepository()
        val controller = controller(repository)
        controller.openCreate(currentDay())
        assertTrue(await { controller.state.references != null })

        controller.save()

        assertEquals(0, repository.saveCalls.get())
        assertNotNull(controller.state.errorMessage)
        assertTrue(controller.state.editor != null)
        controller.close()
    }

    @Test
    fun futurePlanningDayAllowsOrdinaryPlannedEditorButPastDoesNot() {
        val repository = FakePlanningRepository()
        val controller = controller(repository)
        controller.openEdit(futureDay(), plannedTask())
        assertTrue(await { controller.state.editor != null })
        assertEquals(TaskEditorCapability.FULL_PLANNING, controller.state.editor?.capability)
        controller.dismiss()

        controller.openEdit(pastDay(), plannedTask())
        assertNull(controller.state.editor)
        controller.openEdit(futureDay(), plannedTask(lifecycleState = LifecycleState.RUNNING))
        assertNull(controller.state.editor)
        controller.openEdit(currentDay(), plannedTask(routineDerived = true))
        assertNull(controller.state.editor)
        controller.openEdit(currentDay(), plannedTask(lifecycleState = LifecycleState.RUNNING))
        assertTrue(await { controller.state.editor != null })
        assertEquals(TaskEditorCapability.RUNNING_METADATA, controller.state.editor?.capability)
        controller.dismiss()
        controller.openEdit(currentDay(), plannedTask())
        assertTrue(await { controller.state.references != null })
        assertEquals(TaskEditorMode.EDIT, controller.state.editor?.mode)
        controller.close()
    }

    @Test
    fun futurePlanningDayAllowsCreate() {
        val repository = FakePlanningRepository()
        val controller = controller(repository)

        controller.openCreate(futureDay())

        assertTrue(await { controller.state.editor != null })
        assertEquals(TaskEditorMode.CREATE, controller.state.editor?.mode)
        controller.close()
    }

    @Test
    fun validationRejectsRolloverAndOverflowInputs() {
        assertNotNull(TaskEditorValidation.validate(TaskEditorDraft(title = "A", plannedStartText = "48:00")).errorMessage)
        assertNotNull(TaskEditorValidation.validate(TaskEditorDraft(title = "A", plannedStartText = "5:60")).errorMessage)
        assertNotNull(TaskEditorValidation.validate(TaskEditorDraft(title = "A", estimateText = "999999999999")).errorMessage)
        assertEquals(1500, TaskEditorValidation.validate(TaskEditorDraft(title = "A", plannedStartText = "25:00")).input?.plannedStartMinute)
        assertFalse(TaskEditorValidation.validate(TaskEditorDraft(title = "日本語😀")).input == null)
    }

    private fun controller(repository: FakePlanningRepository, onSaved: () -> Unit = {}): TaskPlanningController =
        TaskPlanningController(
            repository = repository,
            onUnauthorized = {},
            onSaved = onSaved,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

    private fun await(predicate: () -> Boolean): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
        while (System.nanoTime() < deadline) {
            if (predicate()) return true
            Thread.yield()
        }
        return predicate()
    }

    private class FakePlanningRepository : TaskPlanningRepository {
        var holdSave = false
        val saveStarted = CountDownLatch(1)
        val releaseSave = CountDownLatch(1)
        val saveCalls = AtomicInteger()
        var lastInput: NormalizedTaskInput? = null

        override fun loadReferences() = PlanningReferencesResult.Success(
            PlanningReferences(
                projects = listOf(TodayProject("project-1", "Project")),
                modes = listOf(TodayMode("mode-1", "Mode")),
            ),
        )

        override fun save(editor: TaskEditorState, input: NormalizedTaskInput): PlanningSaveResult {
            saveCalls.incrementAndGet()
            lastInput = input
            saveStarted.countDown()
            if (holdSave) releaseSave.await(2, TimeUnit.SECONDS)
            return PlanningSaveResult.Success
        }
    }

    private companion object {
        fun currentDay() = TodayDay(
            logicalDate = "2026-09-14",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 5,
            sections = listOf(TodaySection("section-1", "Morning", 480, 720, emptyList())),
            unsectionedEntries = emptyList(),
            activeExecution = null,
            taskChuteDayId = "day-1",
        )

        fun futureDay() = currentDay().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
        )

        fun pastDay() = currentDay().copy(
            logicalDate = "2026-09-13",
            isCurrent = false,
            planningEnabled = false,
            taskChuteDayId = null,
        )

        fun plannedTask(
            lifecycleState: LifecycleState = LifecycleState.PLANNED,
            routineDerived: Boolean = false,
        ) = TodayTask("entry-1", "Task", lifecycleState, null, null, 600, 540, null, null, routineDerived)
    }
}
