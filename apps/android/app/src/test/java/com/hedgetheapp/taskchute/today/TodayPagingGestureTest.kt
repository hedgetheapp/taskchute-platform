package com.hedgetheapp.taskchute.today

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TodayPagingGestureTest {
    @Test
    fun axisWaitsForTouchSlopAndLocksVerticalIntent() {
        assertEquals(TodayPagingGestureAxis.UNDECIDED, resolveTodayPagingGestureAxis(8f, 7f, 10f))
        assertEquals(TodayPagingGestureAxis.VERTICAL, resolveTodayPagingGestureAxis(18f, 19f, 10f))
        assertEquals(TodayPagingGestureAxis.HORIZONTAL, resolveTodayPagingGestureAxis(-24f, 8f, 10f))
        assertEquals(TodayPagingGestureAxis.VERTICAL, resolveTodayPagingGestureAxis(20f, 17f, 10f))
    }

    @Test
    fun distanceAndVelocityCommitOnlyOnePhysicalDirection() {
        assertEquals(-1, committedTodayPagingDirection(-300f, -100f, 1_000f, 1_200f))
        assertEquals(1, committedTodayPagingDirection(300f, 100f, 1_000f, 1_200f))
        assertEquals(-1, committedTodayPagingDirection(-45f, -1_500f, 1_000f, 1_200f))
        assertNull(committedTodayPagingDirection(-45f, -300f, 1_000f, 1_200f))
        assertNull(committedTodayPagingDirection(0f, 0f, 1_000f, 1_200f))
        assertNull(committedTodayPagingDirection(400f, 1_500f, 0f, 1_200f))
    }

    @Test
    fun physicalDirectionLoadsExactlyOneAdjacentLogicalDate() {
        assertEquals("2026-10-06", adjacentTodayLogicalDate("2026-10-05", -1))
        assertEquals("2026-10-04", adjacentTodayLogicalDate("2026-10-05", 1))
        assertEquals("2027-01-01", adjacentTodayLogicalDate("2026-12-31", -1))
    }
}
