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
    fun routineBoardPreservesScheduleAndProjectMetadata() {
        val repository = SettingsHttpRepository({ _, path, _ ->
            if (path == "/api/v1/routines") TodayHttpResponse(200, """
                {"board_revision":2,"current_logical_date":"2026-09-16","sections":[],"routines":[{"routine_definition_id":"r1","task_id":"t1","title":"朝の準備","project":{"id":"p1","title":"Life"},"enabled":true,"schedule":{"kind":"weekly","weekdays":[1,3]},"default_section_id":null,"default_planned_start_minute":420,"default_estimate_seconds":1800,"default_mode_id":null,"start_logical_date":"2026-09-01","end_logical_date":null,"settings_revision":5}]}
            """.trimIndent()) else TodayHttpResponse(200, "{\"board_revision\":1,\"projects\":[]}")
        })

        val result = repository.loadRoutineBoard() as SettingsResult.Success
        val routine = result.value.routines.single()
        assertEquals("p1", routine.projectId)
        assertEquals(listOf(1, 3), routine.schedule.weekdays)
        assertEquals("毎週 月・水", routine.schedule.summary())
    }
}
