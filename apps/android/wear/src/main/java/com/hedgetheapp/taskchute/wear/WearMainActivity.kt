package com.hedgetheapp.taskchute.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

class WearMainActivity : ComponentActivity() {
    private lateinit var controller: WearTodayController
    private lateinit var pairingBridge: WearPairingBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = WearHttpRepository(BuildConfig.TASKCHUTE_BASE_URL, WearEncryptedSessionStore(this))
        controller = WearTodayController(repository)
        pairingBridge = WearPairingBridge(this) { grant -> controller.onPairingGrant(pairingBridge, grant) }
        controller.restore()
        setContent { WearTaskChuteApp(controller, pairingBridge) }
    }

    override fun onStart() {
        super.onStart()
        pairingBridge.startListening()
    }

    override fun onStop() {
        pairingBridge.stopListening()
        super.onStop()
    }

    override fun onDestroy() {
        pairingBridge.close()
        controller.close()
        super.onDestroy()
    }
}
