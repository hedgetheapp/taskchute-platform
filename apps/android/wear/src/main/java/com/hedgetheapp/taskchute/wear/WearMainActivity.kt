package com.hedgetheapp.taskchute.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

class WearMainActivity : ComponentActivity() {
    private lateinit var controller: WearTodayController
    private lateinit var pairingBridge: WearPairingBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val installationId = { WearInstallationIdStore.get(this) }
        val repository = WearHttpRepository(
            BuildConfig.TASKCHUTE_BASE_URL,
            WearEncryptedSessionStore(this),
            installationIdProvider = installationId,
        )
        val realtime = WearRealtimeConnectionManager(
            cookieProvider = repository::realtimeCookieHeader,
            socketFactory = OkHttpWearRealtimeSocketFactory(BuildConfig.TASKCHUTE_BASE_URL),
            scheduler = AndroidWearRealtimeScheduler(),
            callbacks = WearRealtimeCallbacks(
                onDayInvalidation = { logicalDate -> controller.onDayInvalidation(logicalDate) },
                onUnauthorized = { controller.onRealtimeUnauthorized() },
            ),
        )
        controller = WearTodayController(
            repository,
            realtime,
            onCanonicalLifecycleReconciled = { day -> WearComplicationRefreshRequester.acceptCanonical(this, day) },
            onAuthenticated = { WearPushWork.enqueueRegistration(this) },
            onCanonicalRefreshAccepted = { day -> WearComplicationRefreshRequester.acceptCanonical(this, day) },
            onSessionInvalidated = { WearComplicationRefreshRequester.clearLastKnownGood(this) },
            onComplicationRefreshRequested = { WearComplicationRefreshRequester.request(this) },
        )
        pairingBridge = WearPairingBridge(this) { grant -> controller.onPairingGrant(pairingBridge, grant) }
        setContent { WearTaskChuteApp(controller, pairingBridge) }
    }

    override fun onStart() {
        super.onStart()
        controller.onForeground()
        pairingBridge.startListening()
    }

    override fun onStop() {
        pairingBridge.stopListening()
        controller.onBackground()
        super.onStop()
    }

    override fun onDestroy() {
        pairingBridge.close()
        controller.close()
        super.onDestroy()
    }
}
