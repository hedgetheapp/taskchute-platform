package com.hedgetheapp.taskchute.security

import com.hedgetheapp.taskchute.auth.SessionCredential
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionEnvelopeCodecTest {
    @Test
    fun roundTripsDynamicOpaqueCookiesInDeterministicOrder() {
        val original = SessionCredential(mapOf("z-cookie" to "z", "a-cookie" to "a"))

        val decoded = SessionEnvelopeCodec.decode(SessionEnvelopeCodec.encode(original))

        assertEquals(original.normalized(), decoded)
    }

    @Test
    fun rejectsUnknownVersionAndTrailingBytes() {
        val encoded = SessionEnvelopeCodec.encode(SessionCredential(mapOf("cookie" to "value")))

        assertNull(SessionEnvelopeCodec.decode(encoded.copyOf().also { it[4] = 99 }))
        assertNull(SessionEnvelopeCodec.decode(encoded + byteArrayOf(0)))
    }

    @Test
    fun rejectsOversizedEnvelope() {
        assertNull(SessionEnvelopeCodec.decode(ByteArray(16 * 1024 + 1)))
    }
}
