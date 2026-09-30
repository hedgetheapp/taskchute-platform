package com.hedgetheapp.taskchute.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class WearSessionAndProjectionTest {
    @Test
    fun cookieCodecRoundTripsAndRejectsMalformedEnvelope() {
        val session = WearCookieSession(mapOf("better-auth.session_token" to "opaque-session", "other" to "value"))
        assertEquals(session, WearCookieCodec.decode(WearCookieCodec.encode(session)))
        assertNull(WearCookieCodec.decode(byteArrayOf(0, 0, 0, 1)))
        assertFalse(runCatching { WearCookieCodec.encode(WearCookieSession(emptyMap())) }.isSuccess)
    }

    @Test
    fun pairingRequestIdAndNonceAreFreshAndCanonical() {
        val requestId = WearPairingProtocol.newRequestId()
        val nonce = WearPairingProtocol.newNonce()
        assertTrue(WearPairingProtocol.isRequestId(requestId))
        assertTrue(WearPairingProtocol.isNonce(nonce))
        assertFalse(WearPairingProtocol.isNonce("not-a-nonce"))
        assertFalse(WearPairingProtocol.isRequestId("00000000-0000-1000-8000-000000000000"))
    }

    @Test
    fun malformedOrWrongPeerPairingGrantIsRejected() {
        val nonce = WearPairingProtocol.newNonce()
        val requestId = WearPairingProtocol.newRequestId()
        assertNull(WearPairingProtocol.parseGrant("other-phone", "paired-phone", requestId, nonce, WearPairingProtocol.PHONE_GRANT_PATH, byteArrayOf(0x7b)))
        assertNull(WearPairingProtocol.parseGrant("paired-phone", "paired-phone", requestId, nonce, "/other", byteArrayOf(0x7b)))
        assertNull(WearPairingProtocol.parseGrant("paired-phone", "paired-phone", requestId, "bad", WearPairingProtocol.PHONE_GRANT_PATH, byteArrayOf(0x7b)))
        assertNull(WearPairingProtocol.parseGrant("paired-phone", "paired-phone", requestId, nonce, WearPairingProtocol.PHONE_GRANT_PATH, "not-json".toByteArray()))
    }

    @Test
    fun plannedForecastUsesDayCursorAndEstimate() {
        val first = task("first", estimateSeconds = 600)
        val target = task("target", estimateSeconds = 1200)
        val day = day(tasks = listOf(first, target))

        val projection = wearForecast(day, target, Instant.parse("2026-09-30T00:00:00Z"))

        assertEquals(550, projection.startMinute)
        assertEquals(570, projection.endMinute)
        assertEquals("09:10", formatWearMinute(projection.startMinute))
        assertEquals("09:30", formatWearMinute(projection.endMinute))
    }

    @Test
    fun runningProjectionAndProgressUseActualStartAndEstimate() {
        val running = task("running", WearLifecycle.RUNNING, 1800, started = "2026-09-30T04:30:00Z")
        val day = day(tasks = listOf(running), active = WearExecution("exec", "running", "2026-09-30T04:30:00Z", 1800))
        val now = Instant.parse("2026-09-30T04:34:00Z")

        assertEquals(WearProjection(810, 840), wearForecast(day, running, now))
        assertEquals(WearProgress(240, 1560, 0, 240f / 1800f), wearProgress("2026-09-30T04:30:00Z", 1800, now))
        assertEquals("00:04:00", formatWearDuration(240))
        assertEquals("01:01:01", formatWearDuration(3661))
    }

    @Test
    fun unknownEstimateShowsElapsedButNoRemainingOrProgress() {
        val result = wearProgress("2026-09-30T04:30:00Z", null, Instant.parse("2026-09-30T04:34:00Z"))

        assertEquals(240L, result.elapsedSeconds)
        assertNull(result.remainingSeconds)
        assertNull(result.fraction)
        assertEquals("--:--:--", formatWearDuration(null))
    }

    @Test
    fun runningTaskProjectionEndIsHiddenWithoutEstimate() {
        val running = task("running", WearLifecycle.RUNNING, null, started = "2026-09-30T04:30:00Z")
        val day = day(tasks = listOf(running), active = WearExecution("exec", "running", "2026-09-30T04:30:00Z", null))

        assertEquals(WearProjection(810, null), wearForecast(day, running, Instant.parse("2026-09-30T04:34:00Z")))
    }

    private fun task(
        id: String,
        lifecycle: WearLifecycle = WearLifecycle.PLANNED,
        estimateSeconds: Int? = null,
        started: String? = null,
    ) = WearTask(
        id = id,
        title = id,
        lifecycle = lifecycle,
        estimateSeconds = estimateSeconds,
        routineDerived = id.startsWith("routine"),
        executionId = null,
        activeStartedAt = started,
        firstStartedAt = started,
        completedDurationSeconds = null,
    )

    private fun day(tasks: List<WearTask>, active: WearExecution? = null) = WearDay(
        logicalDate = "2026-09-30",
        placementRevision = 4,
        sections = listOf(WearSection("section", "午前", 0, 720, tasks)),
        unsectionedTasks = emptyList(),
        activeExecution = active,
        startInstant = "2026-09-29T15:00:00Z",
        establishmentTimezone = "Asia/Tokyo",
    )
}
