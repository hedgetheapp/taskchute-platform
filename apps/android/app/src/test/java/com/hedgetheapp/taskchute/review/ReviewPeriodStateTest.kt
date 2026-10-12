package com.hedgetheapp.taskchute.review

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

class ReviewPeriodStateTest {
    @Test
    fun switchingPrimaryViewsRetainsSharedPeriodAndAnchor() {
        val initial = ReviewScreenState(
            selectedView = ReviewPrimaryView.DATE,
            period = ReviewPeriodState(ReviewPeriodGranularity.DAILY, LocalDate.of(2026, 1, 31)),
        )

        var state = initial
        listOf(ReviewPrimaryView.PROJECT, ReviewPrimaryView.MODE, ReviewPrimaryView.NOTE, ReviewPrimaryView.DATE).forEach { view ->
            state = selectReviewView(state, view)
            assertEquals(view, state.selectedView)
            assertEquals(initial.period, state.period)
        }
    }

    @Test
    fun granularityAndPreviousNextUpdateOneSharedPeriod() {
        var state = ReviewScreenState(
            selectedView = ReviewPrimaryView.DATE,
            period = ReviewPeriodState(ReviewPeriodGranularity.DAILY, LocalDate.of(2026, 1, 31)),
        )

        state = selectReviewGranularity(state, ReviewPeriodGranularity.MONTHLY)
        assertEquals("2026/01", reviewPeriodLabel(state.period))
        state = stepReviewPeriod(state, -1)
        assertEquals("2025/12", reviewPeriodLabel(state.period))
        state = selectReviewView(state, ReviewPrimaryView.PROJECT)
        state = stepReviewPeriod(state, 1)
        assertEquals("2026/01", reviewPeriodLabel(state.period))
        state = selectReviewGranularity(state, ReviewPeriodGranularity.YEARLY)
        assertEquals("2026", reviewPeriodLabel(state.period))
        state = stepReviewPeriod(state, -1)
        assertEquals("2025", reviewPeriodLabel(state.period))
    }
}
