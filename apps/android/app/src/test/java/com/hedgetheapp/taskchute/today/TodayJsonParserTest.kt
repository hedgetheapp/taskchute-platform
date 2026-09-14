package com.hedgetheapp.taskchute.today

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class TodayJsonParserTest {
    @Test
    fun parsesSectionsTaskMetadataAndRunningExecution() {
        val day = TodayJsonParser.parse(SAMPLE)

        assertEquals("2026-09-14", day.logicalDate)
        assertEquals(42, day.placementRevision)
        assertEquals(1, day.sections.size)
        assertEquals("Morning", day.sections.single().title)
        assertEquals("Write", day.sections.single().entries.single().title)
        assertEquals(LifecycleState.RUNNING, day.sections.single().entries.single().lifecycleState)
        assertEquals("p1", day.sections.single().entries.single().project?.id)
        assertEquals("m1", day.sections.single().entries.single().mode?.id)
        assertEquals("execution-1", day.activeExecution?.id)
        assertNotNull(day.runningTask)
        assertNull(day.unsectionedEntries.single().project)
    }

    @Test(expected = IllegalStateException::class)
    fun rejectsUnknownLifecycleState() {
        TodayJsonParser.parse(SAMPLE.replace("running", "paused"))
    }

    private companion object {
        const val SAMPLE = """
            {
              "taskchute_day":{"id":"day-1","logical_date":"2026-09-14","start_instant":"2026-09-14T00:00:00Z","end_instant":"2026-09-15T00:00:00Z","establishment_timezone":"Asia/Tokyo","establishment_boundary_minutes":240},
              "is_current":true,"planning_enabled":true,"placement_revision":42,"section_configuration_required":false,
              "sections":[{"id":"s1","title":"Morning","logical_start_minute":480,"logical_end_minute":720,"actual_start_instant":null,"actual_end_instant":null,"estimate_total_seconds":3600,"entries":[
                {"id":"e1","task":{"id":"t1","title":"Write","project":{"id":"p1","title":"Docs"},"primary_document_id":null},"section_id":"s1","position":1,"lifecycle_state":"running","estimate_seconds":1800,"planned_start_minute":510,"mode":{"id":"m1","title":"Focus","source":"live"},"routine":null,"execution_summary":{"first_started_at":"2026-09-14T01:00:00Z","last_ended_at":null,"completed_duration_seconds":0,"active_started_at":"2026-09-14T01:00:00Z","active_execution_id":"execution-1","single_execution_id":"execution-1","last_outcome":null}}
              ]}],
              "unsectioned_entries":[{"id":"e2","task":{"id":"t2","title":"Inbox","project":null},"section_id":null,"position":2,"lifecycle_state":"planned","estimate_seconds":null,"planned_start_minute":null,"mode":null,"routine":null,"execution_summary":{"first_started_at":null,"last_ended_at":null,"completed_duration_seconds":0,"active_started_at":null,"active_execution_id":null}}],
              "active_execution":{"id":"execution-1","entry_id":"e1","started_at":"2026-09-14T01:00:00Z","ended_at":null,"entry_estimate_seconds":1800},
              "next_entry":null,"projection_generated_at":"2026-09-14T01:00:00Z"
            }
        """
    }
}
