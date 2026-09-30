package com.hedgetheapp.taskchute.wear

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

internal const val WEAR_PAIRING_GRANT_TIMEOUT_MILLIS = 20_000L
internal const val WEAR_PAIRING_REQUEST_TIMEOUT_MILLIS = 10_000L

internal class WearPairingStateMachine(
    private val requestIdFactory: () -> String = WearPairingProtocol::newRequestId,
    private val nonceFactory: () -> String = WearPairingProtocol::newNonce,
) {
    var state by mutableStateOf<WearPairingState>(WearPairingState.Idle)
        private set

    private var pending: WearPairingRequest? = null

    internal val pendingIdentity: WearPairingRequest?
        get() = pending

    internal val hasPendingIdentity: Boolean
        get() = pending != null

    fun begin(): Boolean {
        if (state == WearPairingState.Sending || state == WearPairingState.Waiting || state == WearPairingState.Exchanging) {
            return false
        }
        pending = null
        state = WearPairingState.Sending
        return true
    }

    fun noConnectedPhone() {
        if (state == WearPairingState.Sending) fail()
    }

    fun prepareRequest(nodeId: String): WearPairingRequest? {
        if (state != WearPairingState.Sending || nodeId.isBlank()) return null
        return WearPairingRequest(
            requestId = requestIdFactory(),
            nonce = nonceFactory(),
            nodeId = nodeId,
        ).also {
            pending = it
            state = WearPairingState.Waiting
        }
    }

    fun isWaitingFor(requestId: String): Boolean =
        state == WearPairingState.Waiting && pending?.requestId == requestId

    fun sendFailed(requestId: String) {
        if (isWaitingFor(requestId)) fail()
    }

    fun acceptGrant(sourceNodeId: String, grant: WearPairGrant): Boolean {
        val request = pending ?: return false
        if (!isWaitingFor(request.requestId) || sourceNodeId != request.nodeId) return false
        if (grant.requestId != request.requestId || grant.nonce != request.nonce) return false
        state = WearPairingState.Exchanging
        return true
    }

    fun expire(requestId: String): Boolean {
        if (!isWaitingFor(requestId)) return false
        fail()
        return true
    }

    fun exchangeFinished(success: Boolean, message: String? = null) {
        clearPending()
        state = if (success) WearPairingState.Idle else WearPairingState.Error(message ?: PAIRING_RETRY_MESSAGE)
    }

    fun cancel() {
        clearPending()
        state = WearPairingState.Idle
    }

    private fun fail() {
        clearPending()
        state = WearPairingState.Error(PAIRING_RETRY_MESSAGE)
    }

    private fun clearPending() {
        pending = null
    }

    private companion object {
        const val PAIRING_RETRY_MESSAGE =
            "ログイン済みのPhoneアプリを開いて再試行してください。"
    }
}

internal class WearPairingRequest(
    val requestId: String,
    val nonce: String,
    val nodeId: String,
) {
    override fun toString(): String = "WearPairingRequest(requestId=$requestId, nodeId=$nodeId, nonce=<redacted>)"
}
