package com.hedgetheapp.taskchute.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class TaskChuteDateNavigatorTest {
    @Test
    fun dateLabelIncludesLogicalDateAndJapaneseWeekday() {
        assertEquals("2026-09-24 (木)", formatTaskChuteDateLabel("2026-09-24"))
        assertEquals("---- -- --", formatTaskChuteDateLabel(null))
    }
}
