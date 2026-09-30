package com.hedgetheapp.taskchute.auth

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneWearPairingProtocolTest {
    @Test
    fun generatedPairingNonceAndRequestIdHaveExpectedFormats() {
        assertTrue(WearPairingProtocol.isNonce(WearPairingProtocol.newNonce()))
        val id = WearPairingProtocol.newRequestId()
        assertTrue(Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$").matches(id))
    }

    @Test
    fun invalidPathAndPayloadAreRejectedBeforeParsing() {
        assertFalse(WearPairingProtocol.isNonce("short"))
        assertTrue(WearPairingProtocol.parseRequest("watch-node", "/wrong", byteArrayOf(0x7b)) == null)
        assertTrue(WearPairingProtocol.parseRequest("", WearPairingProtocol.REQUEST_PATH, byteArrayOf(0x7b)) == null)
        assertTrue(WearPairingProtocol.parseRequest("watch-node", WearPairingProtocol.REQUEST_PATH, byteArrayOf()) == null)
    }
}
