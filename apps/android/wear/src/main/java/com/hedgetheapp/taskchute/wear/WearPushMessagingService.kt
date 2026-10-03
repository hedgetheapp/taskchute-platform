package com.hedgetheapp.taskchute.wear

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

internal object WearPushMessage {
    const val RUNNING_PROJECTION_INVALIDATED = "running_projection_invalidated"

    fun isRunningProjectionInvalidation(data: Map<String, String>): Boolean =
        data == mapOf("type" to RUNNING_PROJECTION_INVALIDATED)
}

class WearPushMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (WearPushMessage.isRunningProjectionInvalidation(message.data)) {
            WearPushWork.enqueueInvalidation(applicationContext)
        }
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) {
        // Never persist or pass the token through WorkManager input/logging. The worker obtains
        // the current Firebase token and sends it over the authenticated registration endpoint.
        WearPushWork.enqueueRegistration(applicationContext)
    }
}
