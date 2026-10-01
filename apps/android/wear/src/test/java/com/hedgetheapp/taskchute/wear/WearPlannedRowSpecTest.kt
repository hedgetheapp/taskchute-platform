package com.hedgetheapp.taskchute.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WearPlannedRowSpecTest {
    @Test
    fun plannedRowScalesToRepresentativeWatchWidthsAndStaysCenteredWithinContent() {
        val narrow = WearLayoutSpec.forAvailableWidth(192f)
        val reference = WearLayoutSpec.forAvailableWidth(227f)

        assertEquals(350f * 192f / 454f, narrow.taskRowWidthDp, 0.01f)
        assertEquals(350f * 227f / 454f, reference.taskRowWidthDp, 0.01f)
        assertTrue(narrow.taskRowWidthDp <= narrow.contentWidthDp)
        assertTrue(reference.taskRowWidthDp <= reference.contentWidthDp)
    }

    @Test
    fun flexibleTextWidthNeverBecomesNegativeEvenWhenConstraintsAreTiny() {
        listOf(0f, 48f, 80f, 160f, 192f, 227f, 454f, 600f).forEach { width ->
            val layout = WearLayoutSpec.forAvailableWidth(width)
            assertTrue("negative text width at $width dp", layout.taskRowTextWidthDp >= 0f)
            assertTrue("row exceeds content at $width dp", layout.taskRowWidthDp <= layout.contentWidthDp)
        }
    }

    @Test
    fun actionVisualScalesButAccessibleTargetRemainsReserved() {
        val layout = WearLayoutSpec.forAvailableWidth(227f)

        assertEquals(24f, layout.actionVisualSizeDp, 0.01f)
        assertEquals(12f, layout.actionIconSizeDp, 0.01f)
        assertEquals(48f, layout.actionTouchTargetDp, 0f)
        assertTrue(layout.taskRowItemHeightDp >= layout.actionTouchTargetDp)
        assertTrue(layout.taskRowTextWidthDp > 0f)
    }

    @Test
    fun sizingScalesProportionallyThenClampsAtFigmaReference() {
        val halfScale = WearLayoutSpec.forAvailableWidth(227f)
        val reference = WearLayoutSpec.forAvailableWidth(454f)
        val larger = WearLayoutSpec.forAvailableWidth(600f)

        assertEquals(0.5f, halfScale.scale, 0.001f)
        assertEquals(10f, halfScale.scaledFigma(20f), 0.01f)
        assertEquals(1f, reference.scale, 0f)
        assertEquals(1f, larger.scale, 0f)
        assertEquals(350f, larger.taskRowWidthDp, 0f)
    }

    @Test
    fun responsiveScaleUsesTheSmallerAvailableDisplayDimension() {
        val layout = WearLayoutSpec.forAvailableSize(widthDp = 227f, heightDp = 200f)

        assertEquals(200f / 454f, layout.scale, 0.001f)
        assertEquals(350f * 200f / 454f, layout.taskRowWidthDp, 0.01f)
        assertTrue(layout.taskRowWidthDp <= layout.contentWidthDp)
    }

    @Test
    fun runningLayoutUsesHorizontalEstimateTrackAndKeepsStopHitTarget() {
        val layout = WearLayoutSpec.forAvailableWidth(227f)

        assertEquals(150f, layout.runningContentWidthDp, 0.01f)
        assertEquals(4f, layout.runningProgressHeightDp, 0.01f)
        assertTrue(layout.runningContentWidthDp > layout.runningProgressHeightDp)
        assertEquals(24f, layout.runningCompleteVisualSizeDp, 0.01f)
        assertEquals(12f, layout.runningCompleteIconSizeDp, 0.01f)
        assertEquals(48f, layout.actionTouchTargetDp, 0f)
        assertTrue(layout.runningTimeGroupWidthDp * 2f <= layout.runningContentWidthDp)
    }

    @Test
    fun invalidDisplayWidthProducesFiniteSafeGeometry() {
        listOf(Float.NaN, Float.POSITIVE_INFINITY, -10f).forEach { width ->
            val layout = WearLayoutSpec.forAvailableWidth(width)
            assertEquals(0f, layout.scale, 0f)
            assertEquals(0f, layout.contentWidthDp, 0f)
            assertEquals(0f, layout.taskRowTextWidthDp, 0f)
            assertTrue(layout.taskRowWidthDp.isFinite())
        }
    }
}
