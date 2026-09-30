package com.hedgetheapp.taskchute.wear

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import java.util.Base64
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal data class WearPairGrant(val requestId: String, val nonce: String, val grant: String)

internal object WearPairingProtocol {
    const val PHONE_REQUEST_PATH = "/d154/pair-request"
    const val PHONE_GRANT_PATH = "/d154/pair-grant"
    private val uuidV4Pattern = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
    private val base64Url32Pattern = Regex("^[A-Za-z0-9_-]{43}$")

    fun newRequestId(): String = UUID.randomUUID().toString()

    fun newNonce(): String = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(ByteArray(32).also(java.security.SecureRandom()::nextBytes))

    fun isRequestId(value: String): Boolean = uuidV4Pattern.matches(value)

    fun isNonce(value: String): Boolean = decodeCanonical32(value) != null

    fun isGrant(value: String): Boolean = decodeCanonical32(value) != null

    fun parseGrant(sourceNodeId: String, expectedNodeId: String?, expectedRequestId: String?, nonce: String?, path: String, bytes: ByteArray): WearPairGrant? {
        if (path != PHONE_GRANT_PATH || sourceNodeId.isBlank() || sourceNodeId != expectedNodeId || bytes.size !in 1..4096) return null
        val expectedNonce = nonce?.takeIf(::isNonce) ?: return null
        return runCatching {
            val body = JSONObject(String(bytes, Charsets.UTF_8))
            val requestId = body.getString("request_id")
            val grant = body.getString("grant")
            if (!isRequestId(requestId) || requestId != expectedRequestId || !isGrant(grant)) null
            else WearPairGrant(requestId, expectedNonce, grant)
        }.getOrNull()
    }

    private fun decodeCanonical32(value: String): ByteArray? = runCatching {
        if (!base64Url32Pattern.matches(value)) return null
        Base64.getUrlDecoder().decode(value).takeIf { decoded ->
            decoded.size == 32 && Base64.getUrlEncoder().withoutPadding().encodeToString(decoded) == value
        }
    }.getOrNull()
}

internal sealed interface WearPairingState {
    data object Idle : WearPairingState
    data object Sending : WearPairingState
    data object Waiting : WearPairingState
    data object Exchanging : WearPairingState
    data class Error(val message: String) : WearPairingState
}

internal class WearPairingBridge(
    context: Context,
    private val onGrant: (WearPairGrant) -> Unit,
) : MessageClient.OnMessageReceivedListener {
    private val messageClient = Wearable.getMessageClient(context.applicationContext)
    private val nodeClient = Wearable.getNodeClient(context.applicationContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var listening = false
    private var pendingRequestId: String? = null
    private var pendingNonce: String? = null
    private var targetPhoneNodeId: String? = null

    var state by mutableStateOf<WearPairingState>(WearPairingState.Idle)
        private set

    fun startListening() {
        if (listening) return
        messageClient.addListener(this).addOnSuccessListener { listening = true }
    }

    fun stopListening() {
        if (!listening) return
        messageClient.removeListener(this)
        listening = false
    }

    fun beginPairing() {
        if (state == WearPairingState.Sending || state == WearPairingState.Exchanging) return
        state = WearPairingState.Sending
        scope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) {
                    val nodes = nodeClient.connectedNodes.await()
                    val phones = nodes.filter(Node::isNearby)
                    val target = phones.singleOrNull() ?: if (phones.isEmpty() && nodes.size == 1) nodes.single() else null
                    target ?: error("近くのAndroid端末を特定できません。")
                }
            }
            val node = result.getOrNull()
            if (node == null) {
                state = WearPairingState.Error(result.exceptionOrNull()?.message ?: "Androidへ接続できません。")
                return@launch
            }
            val requestId = WearPairingProtocol.newRequestId()
            val nonce = WearPairingProtocol.newNonce()
            val payload = JSONObject().put("request_id", requestId).put("nonce", nonce).toString().toByteArray(Charsets.UTF_8)
            // Publish the request tuple before sendMessage: the phone can return a grant immediately.
            pendingRequestId = requestId
            pendingNonce = nonce
            targetPhoneNodeId = node.id
            state = WearPairingState.Waiting
            val send = runCatching {
                withContext(Dispatchers.IO) {
                    messageClient.sendMessage(node.id, PHONE_REQUEST_PATH, payload).await()
                }
            }
            if (send.isFailure) {
                pendingRequestId = null
                pendingNonce = null
                targetPhoneNodeId = null
                state = WearPairingState.Error("接続要求を送れません。もう一度お試しください。")
            }
        }
    }

    fun pairingExchangeStarted() {
        state = WearPairingState.Exchanging
    }

    fun pairingExchangeFinished(success: Boolean, message: String? = null) {
        pendingRequestId = null
        pendingNonce = null
        targetPhoneNodeId = null
        state = if (success) WearPairingState.Idle else WearPairingState.Error(message ?: "接続を完了できません。再試行してください。")
    }

    fun cancel() {
        pendingRequestId = null
        pendingNonce = null
        targetPhoneNodeId = null
        state = WearPairingState.Idle
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (state != WearPairingState.Waiting) return
        val pairGrant = WearPairingProtocol.parseGrant(
            sourceNodeId = event.sourceNodeId,
            expectedNodeId = targetPhoneNodeId,
            expectedRequestId = pendingRequestId,
            nonce = pendingNonce,
            path = event.path,
            bytes = event.data,
        ) ?: return
        state = WearPairingState.Exchanging
        onGrant(pairGrant)
    }

    fun close() {
        stopListening()
        scope.coroutineContext.cancel()
    }

    private companion object {
        const val PHONE_REQUEST_PATH = WearPairingProtocol.PHONE_REQUEST_PATH
    }
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { value -> if (continuation.isActive) continuation.resume(value) }
    addOnFailureListener { error -> if (continuation.isActive) continuation.resumeWithException(error) }
    addOnCanceledListener { continuation.cancel() }
}
