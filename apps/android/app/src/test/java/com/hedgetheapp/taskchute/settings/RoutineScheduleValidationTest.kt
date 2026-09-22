package com.hedgetheapp.taskchute.settings

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RoutineScheduleValidationTest {
    @Test
    fun invalidDraftsAreRejectedBeforeApply() {
        assertFalse(schedule("every_n_days", interval = "1") != null)
        assertTrue(schedule("every_n_days", interval = "2") != null)
        assertTrue(schedule("weekly", weekdays = "1,3") != null)

        listOf("", "1,8", "1,x", "1,1").forEach { weekdays ->
            assertFalse("weekly=$weekdays", schedule("weekly", weekdays = weekdays) != null)
        }

        assertFalse(schedule("monthly_nth_weekday", ordinal = "6", weekday = "1") != null)
    }

    @Test
    fun allCanonicalScheduleFamiliesRemainValid() {
        listOf("daily", "monthly_last_day", "workday", "holiday", "official_holiday", "monthly_last_workday").forEach { kind ->
            assertTrue(kind, schedule(kind) != null)
        }
        assertTrue(schedule("every_n_weeks", interval = "2", weekdays = "1,3") != null)
        assertTrue(schedule("monthly_day", day = "15") != null)
        assertTrue(schedule("monthly_nth_weekday", ordinal = "2", weekday = "1") != null)
        assertTrue(schedule("monthly_last_weekday", weekday = "1") != null)
        assertTrue(schedule("every_n_months_day", interval = "2", day = "15") != null)
        assertTrue(schedule("every_n_months_last_day", interval = "2") != null)
    }

    private fun schedule(
        kind: String,
        interval: String = "",
        day: String = "",
        ordinal: String = "",
        weekday: String = "",
        weekdays: String = "",
    ): RoutineScheduleSpec? = parseRoutineScheduleDraft(kind, interval, day, ordinal, weekday, weekdays)
}
