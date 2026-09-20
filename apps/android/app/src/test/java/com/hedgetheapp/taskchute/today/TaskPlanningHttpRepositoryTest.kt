package com.hedgetheapp.taskchute.today

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskPlanningHttpRepositoryTest {
    @Test
    fun createComposesCanonicalCommandsForAllEditorFields() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = TaskPlanningHttpRepository { method, path, body ->
            requests += Triple(method, path, body)
            when (path) {
                "/api/v1/taskchute-days/current/entries" -> TodayHttpResponse(200, "{\"placement_revision\":6}")
                else -> TodayHttpResponse(204, null)
            }
        }
        val result = repository.save(
            editor = TaskEditorState(TaskEditorMode.CREATE, currentDay(), null, TaskEditorDraft()),
            input = NormalizedTaskInput("日本語 \"Task\"", "project-1", "mode-1", "section-1", 600, 900),
        )

        assertEquals(PlanningSaveResult.Success, result)
        assertEquals(3, requests.size)
        assertEquals("POST", requests[0].first)
        assertEquals("/api/v1/taskchute-days/current/entries", requests[0].second)
        assertTrue(requests[0].third!!.contains("\\\"Task\\\""))
        assertTrue(requests[0].third!!.contains("\"project_id\":\"project-1\""))
        assertEquals("/api/v1/entries/${extractEntryId(requests[0].third!!)}/estimate", requests[1].second)
        assertTrue(requests[1].third!!.contains("\"estimate_seconds\":900"))
        assertEquals("/api/v1/entries/${extractEntryId(requests[0].third!!)}/planned-start", requests[2].second)
        assertTrue(requests[2].third!!.contains("\"planned_start_minute\":600"))
    }

@Test
    fun runningProjectSaveUsesOnlyTaskMetadataEndpoint() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val task = TodayTask("entry-1", "Running task", LifecycleState.RUNNING, TodayProject("project-old", "Old"), TodayMode("mode-old", "Old"), 600, 540, "execution-1", "2026-09-20T01:00:00Z", false, "task-1")
        val editor = TaskEditorState(
            TaskEditorMode.EDIT,
            currentDay(),
            task,
            TaskEditorDraft(title = task.title, projectId = "project-new", modeId = "mode-old", plannedStartText = "9:00", estimateText = "30"),
            TaskEditorCapability.RUNNING_METADATA,
        )
        val repository = TaskPlanningHttpRepository { method, path, body ->
            requests += Triple(method, path, body)
            TodayHttpResponse(204, null)
        }

        assertEquals(PlanningSaveResult.Success, repository.save(editor, editor.draft.let { NormalizedTaskInput(it.title, it.projectId, it.modeId, it.sectionId, 9 * 60, 30 * 60) }))
        assertEquals(1, requests.size)
        assertEquals("/api/v1/entries/entry-1/task-metadata", requests.single().second)
        assertTrue(requests.single().third!!.contains("\"title\":\"Running task\""))
        assertTrue(requests.single().third!!.contains("\"project_id\":\"project-new\""))
    }

    @Test
    fun runningModeSaveUsesOnlyModeEndpoint() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val task = TodayTask("entry-1", "Running task", LifecycleState.RUNNING, TodayProject("project-old", "Old"), TodayMode("mode-old", "Old"), 600, 540, "execution-1", "2026-09-20T01:00:00Z", false, "task-1")
        val editor = TaskEditorState(
            TaskEditorMode.EDIT,
            currentDay(),
            task,
            TaskEditorDraft(title = task.title, projectId = "project-old", modeId = "mode-new", plannedStartText = "9:00", estimateText = "30"),
            TaskEditorCapability.RUNNING_METADATA,
        )
        val repository = TaskPlanningHttpRepository { method, path, body ->
            requests += Triple(method, path, body)
            TodayHttpResponse(204, null)
        }

        assertEquals(PlanningSaveResult.Success, repository.save(editor, NormalizedTaskInput(task.title, "project-old", "mode-new", null, 9 * 60, 30 * 60)))
        assertEquals(1, requests.size)
        assertEquals("/api/v1/entries/entry-1/mode", requests.single().second)
        assertTrue(requests.single().third!!.contains("\"mode_id\":\"mode-new\""))
    }
    @Test
    fun unauthorizedReferenceOrMutationDoesNotLookLikeSuccess() {
        val repository = TaskPlanningHttpRepository { _, _, _ -> TodayHttpResponse(401, null) }
        assertEquals(PlanningReferencesResult.Unauthorized, repository.loadReferences())
        assertEquals(
            PlanningSaveResult.Unauthorized,
            repository.save(
                TaskEditorState(TaskEditorMode.CREATE, currentDay(), null, TaskEditorDraft()),
                NormalizedTaskInput("Task", null, null, null, null, null),
            ),
        )
    }

    private fun extractEntryId(body: String): String = Regex("\\\"entry_id\\\":\\\"([^\\\"]+)\\\"").find(body)!!.groupValues[1]

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
    }
}
