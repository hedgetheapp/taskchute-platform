package com.hedgetheapp.taskchute.wear

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject

@RunWith(AndroidJUnit4::class)
class WearRealtimeProtocolInstrumentedTest {
    @Test
    fun parsesCanonicalDayInvalidationAndIgnoresOtherValidScopes() {
        val result = WearRealtimeInvalidationParser.parse(
            """{"version":1,"type":"invalidate","scopes":[{"kind":"day","logical_date":"2026-10-01"},{"kind":"projects"}]}""",
        )

        assertEquals(listOf("2026-10-01"), result)
    }

    @Test
    fun wildcardDayInvalidationIsPreservedAndMalformedEnvelopeRejected() {
        assertEquals(
            listOf(null),
            WearRealtimeInvalidationParser.parse("""{"version":1,"type":"invalidate","scopes":[{"kind":"day"}]}"""),
        )
        assertNull(WearRealtimeInvalidationParser.parse("""{"version":1,"type":"invalidate","scopes":[{"kind":"day","logical_date":"bad"}]}"""))
        assertNull(WearRealtimeInvalidationParser.parse("""{"version":1,"type":"other","scopes":[{"kind":"day"}]}"""))
    }

    @Test
    fun lifecycleBodiesCarryUuidV7AndCanonicalPlacementAndExecutionIdentity() {
        val start = JSONObject(newWearStartRequest("entry-7", placementRevision = 41).toJson())
        assertUuidV7(start.getString("operation_id"))
        assertUuidV7(start.getString("execution_id"))
        assertEquals("entry-7", start.getString("entry_id"))
        assertEquals(41, start.getInt("expected_placement_revision"))

        val complete = JSONObject(newWearCompleteRequest("entry-7", start.getString("execution_id")).toJson())
        assertUuidV7(complete.getString("operation_id"))
        assertEquals(start.getString("execution_id"), complete.getString("execution_id"))
        assertEquals("entry-7", complete.getString("entry_id"))
    }

    private fun assertUuidV7(value: String) {
        val uuid = UUID.fromString(value)
        assertEquals(7, uuid.version())
        assertEquals(2, uuid.variant())
        assertTrue(value.matches(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))
    }
}
