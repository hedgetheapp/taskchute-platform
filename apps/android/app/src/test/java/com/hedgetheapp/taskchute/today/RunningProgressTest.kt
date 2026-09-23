package com.hedgetheapp.taskchute.today

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RunningProgressTest {
    private val start = Instant.parse("2026-09-23T00:00:00Z")

    @Test
    fun normalProgressCountsDownFromElapsedThreeMinutesFifteenSeconds() {
        val result = calculateRunningProgress(start.toString(), 1_800, start.plusSeconds(195))

        assertEquals(195L, result.elapsedSeconds)
        assertEquals(1_605L, result.remainingSeconds)
        assertEquals(0L, result.overrunSeconds)
        assertEquals(195f / 1_800f, result.progress, 0.0001f)
        assertEquals("00:03:15", formatRunningDuration(result.elapsedSeconds))
        assertEquals("00:26:45", formatRunningDuration(result.remainingSeconds))
    }

    @Test
    fun normalProgressCountsDownNearEstimateBoundary() {
        val result = calculateRunningProgress(start.toString(), 1_800, start.plusSeconds(1_104))

        assertEquals(1_104L, result.elapsedSeconds)
        assertEquals(696L, result.remainingSeconds)
        assertEquals("00:18:24", formatRunningDuration(result.elapsedSeconds))
        assertEquals("00:11:36", formatRunningDuration(result.remainingSeconds))
    }

    @Test
    fun normalProgressShowsEightSecondsRemainingNearCompletion() {
        val result = calculateRunningProgress(start.toString(), 1_800, start.plusSeconds(1_792))

        assertEquals(8L, result.remainingSeconds)
        assertEquals("00:29:52", formatRunningDuration(result.elapsedSeconds))
        assertEquals("00:00:08", formatRunningDuration(result.remainingSeconds))
    }

    @Test
    fun overrunUsesZeroRemainingAndOrangeDurationInputs() {
        val result = calculateRunningProgress(start.toString(), 1_800, start.plusSeconds(2_535))

        assertEquals(2_535L, result.elapsedSeconds)
        assertEquals(0L, result.remainingSeconds)
        assertEquals(735L, result.overrunSeconds)
        assertEquals(1f, result.progress)
        assertEquals("00:42:15", formatRunningDuration(result.elapsedSeconds))
        assertEquals("00:12:15", formatRunningDuration(result.overrunSeconds))
    }

    @Test
    fun exactEstimateBoundaryClampsProgressWithoutOverrun() {
        val result = calculateRunningProgress(start.toString(), 1_800, start.plusSeconds(1_800))

        assertEquals(0L, result.remainingSeconds)
        assertEquals(0L, result.overrunSeconds)
        assertEquals(1f, result.progress)
    }

    @Test
    fun missingOrInvalidEstimateDoesNotInventRemainingOrOverrun() {
        val missing = calculateRunningProgress(start.toString(), null, start.plusSeconds(195))
        val zero = calculateRunningProgress(start.toString(), 0, start.plusSeconds(195))

        assertEquals(195L, missing.elapsedSeconds)
        assertNull(missing.remainingSeconds)
        assertNull(missing.overrunSeconds)
        assertEquals(0f, missing.progress)
        assertNull(zero.remainingSeconds)
        assertNull(zero.overrunSeconds)
    }

    @Test
    fun missingOrInvalidStartUsesSafeFallback() {
        val missing = calculateRunningProgress(null, 1_800, start.plusSeconds(195))
        val invalid = calculateRunningProgress("not-an-instant", 1_800, start.plusSeconds(195))

        assertNull(missing.elapsedSeconds)
        assertNull(invalid.elapsedSeconds)
        assertEquals(0f, missing.progress)
        assertEquals("--:--:--", formatRunningDuration(missing.elapsedSeconds))
    }

    @Test
    fun durationFormattingDoesNotWrapAfterTwentyFourHours() {
        assertEquals("25:00:00", formatRunningDuration(25L * 3_600L))
        assertEquals("100:00:01", formatRunningDuration(100L * 3_600L + 1L))
        assertTrue(formatRunningDuration(0L) == "00:00:00")
    }
}