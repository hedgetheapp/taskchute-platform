package com.hedgetheapp.taskchute.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WearPlannedRowSpecTest {
    @Test
    fun plannedRowReservesFixedFigmaActionAndProjectionGeometry() {
        assertEquals(82, WearPlannedRowSpec.ROW_HEIGHT_DP)
        assertEquals(42, WearPlannedRowSpec.PROJECTION_WIDTH_DP)
        assertEquals(58, WearPlannedRowSpec.PROJECTION_HEIGHT_DP)
        assertEquals(48, WearPlannedRowSpec.ACTION_SIZE_DP)
        assertEquals(24, WearPlannedRowSpec.ACTION_ICON_SIZE_DP)
        assertEquals(1, WearPlannedRowSpec.ACTION_BORDER_DP)
        assertTrue(WearPlannedRowSpec.ACTION_SIZE_DP > 0)
    }
}
