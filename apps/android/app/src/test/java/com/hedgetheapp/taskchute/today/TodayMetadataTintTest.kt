package com.hedgetheapp.taskchute.today

import com.hedgetheapp.taskchute.ui.TaskChuteColors
import org.junit.Assert.assertEquals
import org.junit.Test

class TodayMetadataTintTest {
    @Test
    fun taskPrimaryNoteRelationAloneControlsNoteIndicatorColor() {
        assertEquals(TaskChuteColors.SecondaryText, taskNoteMetadataTint(null))

        // The projection carries relation identity, not Document body content.
        assertEquals(TaskChuteColors.AccentBlue, taskNoteMetadataTint("empty-body-primary-document"))
    }

    @Test
    fun routineAndNoteIndicatorsKeepTheirIndependentStates() {
        assertEquals(TaskChuteColors.SecondaryText, taskRoutineMetadataTint(false))
        assertEquals(TaskChuteColors.SecondaryText, taskNoteMetadataTint(null))

        assertEquals(TaskChuteColors.AccentBlue, taskRoutineMetadataTint(true))
        assertEquals(TaskChuteColors.AccentBlue, taskNoteMetadataTint("task-primary-document"))

        assertEquals(TaskChuteColors.AccentBlue, taskRoutineMetadataTint(true))
        assertEquals(TaskChuteColors.SecondaryText, taskNoteMetadataTint(null))

        assertEquals(TaskChuteColors.SecondaryText, taskRoutineMetadataTint(false))
        assertEquals(TaskChuteColors.AccentBlue, taskNoteMetadataTint("task-primary-document"))
    }
}
