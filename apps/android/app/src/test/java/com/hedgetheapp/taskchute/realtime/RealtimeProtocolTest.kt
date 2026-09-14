package com.hedgetheapp.taskchute.realtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RealtimeProtocolTest {
    @Test
    fun parsesSupportedVersionAndDayScopes() {
        val parsed = RealtimeInvalidationParser.parse(
            "{\"version\":1,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"day\",\"logical_date\":\"2026-09-14\"},{\"kind\":\"projects\"}]}",
        )

        assertEquals(listOf(AndroidRealtimeDayScope("2026-09-14")), parsed?.dayScopes)
    }

    @Test
    fun parsesWildcardDayAndIgnoresNonDayScopes() {
        val parsed = RealtimeInvalidationParser.parse(
            "{\"version\":1,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"day\"},{\"kind\":\"documents\"},{\"kind\":\"routines\"}]}",
        )

        assertEquals(listOf(AndroidRealtimeDayScope(null)), parsed?.dayScopes)
    }

    @Test
    fun rejectsMalformedUnsupportedAndOversizedMessages() {
        assertNull(RealtimeInvalidationParser.parse("not-json"))
        assertNull(RealtimeInvalidationParser.parse("{\"version\":2,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"day\"}]}"))
        assertNull(RealtimeInvalidationParser.parse("{\"version\":1,\"type\":\"command\",\"scopes\":[{\"kind\":\"day\"}]}"))
        assertNull(RealtimeInvalidationParser.parse("{\"version\":1,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"day\",\"logical_date\":null}]}"))
        assertNull(RealtimeInvalidationParser.parse("{\"version\":1,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"unknown\"}]}"))
        assertNull(RealtimeInvalidationParser.parse("x".repeat(REALTIME_MAX_MESSAGE_BYTES)))
        assertTrue(RealtimeInvalidationParser.parse("{\"version\":1,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"day\"}]}") != null)
    }
}
