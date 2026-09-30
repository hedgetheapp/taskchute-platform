package com.hedgetheapp.taskchute.wear

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.time.Instant
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearSecurityInstrumentedTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun watchCookieSessionUsesEncryptedNoBackupStorageAndRoundTrips() {
        val store = WearEncryptedSessionStore(context)
        val rawSessionToken = "never-persist-this-in-plaintext-0123456789"
        store.clear()
        try {
            assertEquals(true, store.save(WearCookieSession(mapOf("better-auth.session_token" to rawSessionToken))))
            assertEquals(rawSessionToken, store.load()?.cookies?.get("better-auth.session_token"))
            val files = context.noBackupFilesDir.listFiles().orEmpty()
            assertFalse(files.any { it.readBytes().toString(Charsets.ISO_8859_1).contains(rawSessionToken) })
        } finally {
            store.clear()
        }
        assertNull(store.load())
    }

    @Test
    fun onlyGrantFromPairedPhoneForPendingRequestIsAccepted() {
        val requestId = WearPairingProtocol.newRequestId()
        val nonce = WearPairingProtocol.newNonce()
        val grant = WearPairingProtocol.newNonce()
        val payload = JSONObject().put("request_id", requestId).put("grant", grant).toString().toByteArray()

        val result = WearPairingProtocol.parseGrant(
            sourceNodeId = "paired-phone",
            expectedNodeId = "paired-phone",
            expectedRequestId = requestId,
            nonce = nonce,
            path = WearPairingProtocol.PHONE_GRANT_PATH,
            bytes = payload,
        )

        assertNotNull(result)
        assertEquals(nonce, result?.nonce)
        assertEquals(grant, result?.grant)
        assertNull(WearPairingProtocol.parseGrant("other-phone", "paired-phone", requestId, nonce, WearPairingProtocol.PHONE_GRANT_PATH, payload))
        assertNull(WearPairingProtocol.parseGrant("paired-phone", "paired-phone", "other-request", nonce, WearPairingProtocol.PHONE_GRANT_PATH, payload))
    }

    @Test
    fun todayProjectionParsesSectionRoutineForecastAndCompletedDuration() {
        val body = """
            {
              "is_current": true,
              "placement_revision": 9,
              "taskchute_day": {"id":"day","logical_date":"2026-09-30","start_instant":"2026-09-29T15:00:00Z","end_instant":"2026-09-30T15:00:00Z","establishment_timezone":"Asia/Tokyo"},
              "sections": [{"id":"morning","title":"午前","logical_start_minute":540,"logical_end_minute":720,"entries":[
                {"id":"planned","lifecycle_state":"planned","estimate_seconds":1200,"planned_start_minute":570,"task":{"id":"task-planned","title":"レビュー"},"routine":{"id":"routine"},"execution_summary":null},
                {"id":"completed","lifecycle_state":"completed","estimate_seconds":1200,"task":{"id":"task-completed","title":"確認"},"routine":null,"execution_summary":{"completed_duration_seconds":1260,"first_started_at":"2026-09-30T01:00:00Z","last_ended_at":"2026-09-30T01:21:00Z"}}
              ]}],
              "unsectioned_entries": [],
              "active_execution": null
            }
        """.trimIndent()

        val day = WearJsonParser.parseDay(body)

        assertEquals(1, day.sections.size)
        assertEquals("午前", day.sections.single().title)
        assertEquals(2, day.sections.single().tasks.size)
        assertEquals(true, day.sections.single().tasks.first().routineDerived)
        assertEquals(WearProjection(540, 560), wearForecast(day, day.sections.single().tasks.first(), Instant.parse("2026-09-30T00:00:00Z")))
        assertEquals(1260, day.sections.single().tasks.last().completedDurationSeconds)
    }

    @Test
    fun activeExecutionIsBoundToRunningTaskInCurrentDayProjection() {
        val body = """
            {
              "placement_revision": 2,
              "taskchute_day": {"logical_date":"2026-09-30","start_instant":"2026-09-29T15:00:00Z","establishment_timezone":"Asia/Tokyo"},
              "sections": [{"id":"section","title":"午前","logical_start_minute":540,"logical_end_minute":720,"entries":[
                {"id":"entry","lifecycle_state":"running","estimate_seconds":1800,"task":{"id":"task","title":"作業"},"routine":null,"execution_summary":{"active_execution_id":"execution","active_started_at":"2026-09-30T01:30:00Z"}}
              ]}],
              "unsectioned_entries": [],
              "active_execution": {"id":"execution","entry_id":"entry","started_at":"2026-09-30T01:30:00Z","entry_estimate_seconds":1800}
            }
        """.trimIndent()

        val day = WearJsonParser.parseDay(body)

        assertEquals("entry", day.runningTask?.id)
        assertEquals(1800, day.activeExecution?.estimateSeconds)
        assertEquals(WearProjection(630, 660), wearForecast(day, day.runningTask!!, Instant.parse("2026-09-30T01:40:00Z")))
    }
}
