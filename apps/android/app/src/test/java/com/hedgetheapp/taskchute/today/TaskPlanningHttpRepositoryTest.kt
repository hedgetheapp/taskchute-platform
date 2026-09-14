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
