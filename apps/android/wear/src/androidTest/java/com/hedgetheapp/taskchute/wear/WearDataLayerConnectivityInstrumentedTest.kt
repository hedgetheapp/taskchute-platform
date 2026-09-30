package com.hedgetheapp.taskchute.wear

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WearDataLayerConnectivityInstrumentedTest {
    @Test
    fun pairedPhoneReceivesPairRequestOverWearableDataLayer() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val nodes = Tasks.await(Wearable.getNodeClient(context).connectedNodes, 15, TimeUnit.SECONDS)
        val nearbyPhones = nodes.filter(Node::isNearby)
        val phone = nearbyPhones.singleOrNull() ?: if (nearbyPhones.isEmpty() && nodes.size == 1) nodes.single() else null
        assertNotNull("Expected the officially paired Phone to be connected", phone)

        val request = JSONObject()
            .put("request_id", WearPairingProtocol.newRequestId())
            .put("nonce", WearPairingProtocol.newNonce())
            .toString()
            .toByteArray(Charsets.UTF_8)
        Tasks.await(
            Wearable.getMessageClient(context).sendMessage(
                requireNotNull(phone).id,
                WearPairingProtocol.PHONE_REQUEST_PATH,
                request,
            ),
            15,
            TimeUnit.SECONDS,
        )
    }
}
