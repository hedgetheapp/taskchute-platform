package com.hedgetheapp.taskchute.auth

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject

@RunWith(AndroidJUnit4::class)
class PhoneWearPairingProtocolInstrumentedTest {
    @Test
    fun acceptsOnlyWellFormedFreshWatchRequest() {
        val requestId = WearPairingProtocol.newRequestId()
        val nonce = WearPairingProtocol.newNonce()
        val payload = JSONObject().put("request_id", requestId).put("nonce", nonce).toString().toByteArray()

        val parsed = WearPairingProtocol.parseRequest("watch-node", WearPairingProtocol.REQUEST_PATH, payload)

        assertNotNull(parsed)
        assertEquals("watch-node", parsed?.nodeId)
        assertEquals(requestId, parsed?.requestId)
        assertEquals(nonce, parsed?.nonce)
        assertNull(WearPairingProtocol.parseRequest("watch-node", WearPairingProtocol.REQUEST_PATH, "{}".toByteArray()))
    }
}
