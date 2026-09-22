package com.hedgetheapp.taskchute.settings

import com.hedgetheapp.taskchute.today.TodayHttpResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsHttpRepositoryTest {
    @Test
    fun sectionConfigurationParsesCanonicalItems() {
        val repository = SettingsHttpRepository({ _, _, _ -> TodayHttpResponse(200, """
            {"configuration_version_id":"cfg-1","day_boundary_minutes":240,"items":[{"section_id":"s-1","title":"朝","logical_start_minute":300,"logical_end_minute":540}]}
        """.trimIndent()) })

        val result = repository.loadSectionConfiguration() as SettingsResult.Success
        assertEquals("cfg-1", result.value.configurationVersionId)
        assertEquals(AndroidSectionSetting("s-1", "朝", 300, 540), result.value.sections.single())
    }

    @Test
    fun projectMutationUsesCanonicalPathAndRevisionFields() {
        var path = ""
        var body = ""
        val repository = SettingsHttpRepository({ method, requestedPath, requestedBody ->
            path = "$method $requestedPath"; body = requestedBody.orEmpty(); TodayHttpResponse(200, "{}")
        })
        val result = repository.updateProject(UpdateProjectSettingsRequest("op-1", "project/1", 7, "Old", "新しい名前"))

        assertTrue(result is SettingsResult.Success)
        assertEquals("POST /api/v1/projects/project%2F1", path)
        assertTrue(body.contains("\"expected_settings_revision\":7"))
        assertTrue(body.contains("\"expected_title\":\"Old\""))
        assertTrue(body.contains("\"title\":\"新しい名前\""))
    }

    @Test
    fun createRoutineCarriesOptionalDefaultsAndKeepsNullsRepresentable() {
        var body = ""
        val repository = SettingsHttpRepository({ _, _, requestedBody ->
            body = requestedBody.orEmpty()
            TodayHttpResponse(200, "{}")
        })
        val result = repository.createRoutine(
            CreateRoutineSettingsRequest("op-1", "task-1", "routine-1", "朝", 4, "section-1", 570, 1500),
        )

        assertTrue(result is SettingsResult.Success)
        assertTrue(body.contains("\"default_section_id\":\"section-1\""))
        assertTrue(body.contains("\"default_planned_start_minute\":570"))
        assertTrue(body.contains("\"default_estimate_seconds\":1500"))
        body = ""
        repository.createRoutine(CreateRoutineSettingsRequest("op-2", "task-2", "routine-2", "空", 5))
        assertTrue(body.contains("\"default_section_id\":null"))
        assertTrue(body.contains("\"default_planned_start_minute\":null"))
        assertTrue(body.contains("\"default_estimate_seconds\":null"))
    }
    @Test
    fun routineBoardPreservesScheduleAndProjectMetadata() {
        val repository = SettingsHttpRepository({ _, path, _ ->
            if (path == "/api/v1/routines") TodayHttpResponse(200, """
                {"board_revision":2,"current_logical_date":"2026-09-16","sections":[],"routines":[{"routine_definition_id":"r1","task_id":"t1","title":"朝の準備","project":{"id":"p1","title":"Life"},"enabled":true,"schedule":{"kind":"weekly","weekdays":[1,3]},"default_section_id":null,"default_planned_start_minute":420,"default_estimate_seconds":1800,"default_mode_id":null,"start_logical_date":"2026-09-01","end_logical_date":null,"settings_revision":5}]}
            """.trimIndent()) else if (path == "/api/v1/project-board") TodayHttpResponse(200, "{\"board_revision\":1,\"projects\":[]}") else TodayHttpResponse(200, "{\"board_revision\":1,\"modes\":[]}")
        })

        val result = repository.loadRoutineBoard() as SettingsResult.Success
        val routine = result.value.routines.single()
        assertEquals("p1", routine.projectId)
        assertEquals(listOf(1, 3), routine.schedule.weekdays)
        assertEquals("毎週 月・水", routine.schedule.summary())
    }

    @Test
    fun fullCreateCarriesProjectModeScheduleAndPeriodFields() {
        var body = ""
        val repository = SettingsHttpRepository({ _, _, requestedBody ->
            body = requestedBody.orEmpty()
            TodayHttpResponse(200, "{}")
        })
        repository.createRoutine(CreateRoutineSettingsRequest(
            operationId = "op-full", taskId = "task-full", routineDefinitionId = "routine-full", title = "Full", expectedBoardRevision = 2,
            defaultSectionId = "section-1", defaultPlannedStartMinute = 540, defaultEstimateSeconds = 1500,
            defaultModeId = "mode-1", projectId = "project-1", schedule = RoutineScheduleSpec("weekly", weekdays = listOf(1, 3)),
            startLogicalDate = "2026-09-22", endLogicalDate = "2026-10-01",
        ))
        assertTrue(body.contains("\"project_id\":\"project-1\""))
        assertTrue(body.contains("\"default_mode_id\":\"mode-1\""))
        assertTrue(body.contains("\"schedule\":{\"kind\":\"weekly\",\"weekdays\":[1,3]}"))
        assertTrue(body.contains("\"start_logical_date\":\"2026-09-22\""))
        assertTrue(body.contains("\"end_logical_date\":\"2026-10-01\""))
    }
}
