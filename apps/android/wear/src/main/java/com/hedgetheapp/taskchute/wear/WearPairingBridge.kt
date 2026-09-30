package com.hedgetheapp.taskchute.wear

import android.content.Context
import java.util.concurrent.CancellationException
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import java.util.Base64
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal class WearPairGrant(val requestId: String, val nonce: String, val grant: String) {
    override fun toString(): String = "WearPairGrant(requestId=$requestId, nonce=<redacted>, grant=<redacted>)"
}

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
    private val stateMachine = WearPairingStateMachine()
    private var grantTimeoutJob: Job? = null

    val state: WearPairingState
        get() = stateMachine.state

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
        if (!stateMachine.begin()) return
        grantTimeoutJob?.cancel()
        grantTimeoutJob = null
        scope.launch {
            val node = try {
                withTimeoutOrNull(WEAR_PAIRING_REQUEST_TIMEOUT_MILLIS) {
                    withContext(Dispatchers.IO) {
                        val nodes = nodeClient.connectedNodes.await()
                        val phones = nodes.filter(Node::isNearby)
                        phones.singleOrNull() ?: if (phones.isEmpty() && nodes.size == 1) nodes.single() else null
                    }
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                null
            }
            if (node == null) {
                stateMachine.noConnectedPhone()
                return@launch
            }
            val request = stateMachine.prepareRequest(node.id) ?: return@launch
            val payload = JSONObject().put("request_id", request.requestId).put("nonce", request.nonce)
                .toString().toByteArray(Charsets.UTF_8)
            // Publish the request tuple before sendMessage: the phone can return a grant immediately.
            val sendSucceeded = try {
                withTimeoutOrNull(WEAR_PAIRING_REQUEST_TIMEOUT_MILLIS) {
                    withContext(Dispatchers.IO) {
                        messageClient.sendMessage(node.id, PHONE_REQUEST_PATH, payload).await()
                    }
                } != null
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                false
            }
            if (!sendSucceeded) {
                stateMachine.sendFailed(request.requestId)
                return@launch
            }
            if (stateMachine.isWaitingFor(request.requestId)) {
                grantTimeoutJob?.cancel()
                grantTimeoutJob = scope.launch {
                    delay(WEAR_PAIRING_GRANT_TIMEOUT_MILLIS)
                    stateMachine.expire(request.requestId)
                    grantTimeoutJob = null
                }
            }
        }
    }

    fun pairingExchangeStarted() = Unit

    fun pairingExchangeFinished(success: Boolean, message: String? = null) {
        grantTimeoutJob?.cancel()
        grantTimeoutJob = null
        stateMachine.exchangeFinished(success, message)
    }

    fun cancel() {
        grantTimeoutJob?.cancel()
        grantTimeoutJob = null
        stateMachine.cancel()
    }

    override fun onMessageReceived(event: MessageEvent) {
        val pending = stateMachine.pendingIdentity ?: return
        val pairGrant = WearPairingProtocol.parseGrant(
            sourceNodeId = event.sourceNodeId,
            expectedNodeId = pending.nodeId,
            expectedRequestId = pending.requestId,
            nonce = pending.nonce,
            path = event.path,
            bytes = event.data,
        ) ?: return
        if (!stateMachine.acceptGrant(event.sourceNodeId, pairGrant)) return
        grantTimeoutJob?.cancel()
        grantTimeoutJob = null
        onGrant(pairGrant)
    }

    fun close() {
        stopListening()
        grantTimeoutJob?.cancel()
        grantTimeoutJob = null
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
