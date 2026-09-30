package com.hedgetheapp.taskchute.auth

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.hedgetheapp.taskchute.today.TodayHttpResponse
import java.util.Base64
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

internal data class PhoneWearPairRequest(
    val nodeId: String,
    val requestId: String,
    val nonce: String,
)

internal data class PhoneWearPairingUiState(
    val request: PhoneWearPairRequest,
    val submitting: Boolean = false,
    val error: String? = null,
)

internal object WearPairingProtocol {
    const val REQUEST_PATH = "/d154/pair-request"
    const val GRANT_PATH = "/d154/pair-grant"
    private val uuidV4Pattern = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

    fun parseRequest(nodeId: String, path: String, payload: ByteArray): PhoneWearPairRequest? {
        if (nodeId.isBlank() || path != REQUEST_PATH || payload.size !in 1..4096) return null
        return runCatching {
            val body = JSONObject(payload.toString(Charsets.UTF_8))
            val requestId = body.getString("request_id")
            val nonce = body.getString("nonce")
            if (!uuidV4Pattern.matches(requestId) || !isNonce(nonce)) null
            else PhoneWearPairRequest(nodeId, requestId, nonce)
        }.getOrNull()
    }

    fun encodeGrant(requestId: String, grant: String): ByteArray = JSONObject()
        .put("request_id", requestId)
        .put("grant", grant)
        .toString()
        .toByteArray(Charsets.UTF_8)

    fun isNonce(value: String): Boolean = decode32(value) != null

    fun newNonce(): String = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(ByteArray(32).also(java.security.SecureRandom()::nextBytes))

    fun newRequestId(): String = UUID.randomUUID().toString()

    private fun decode32(value: String): ByteArray? = runCatching {
        if (!Regex("^[A-Za-z0-9_-]{43}$").matches(value)) return null
        Base64.getUrlDecoder().decode(value).takeIf { bytes ->
            bytes.size == 32 && Base64.getUrlEncoder().withoutPadding().encodeToString(bytes) == value
        }
    }.getOrNull()
}

internal class PhoneWearPairingController(
    context: Context,
    private val request: (String, String, String?) -> TodayHttpResponse?,
    private val onUnauthorized: () -> Unit,
) : MessageClient.OnMessageReceivedListener {
    private val appContext = context.applicationContext
    private val messageClient = Wearable.getMessageClient(appContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var foreground = false
    private var signedIn = false
    private var listenerRegistered = false

    var pending by androidx.compose.runtime.mutableStateOf<PhoneWearPairingUiState?>(null)
        private set

    fun setForeground(value: Boolean) {
        foreground = value
        synchronizeListener()
    }

    fun setSignedIn(value: Boolean) {
        signedIn = value
        if (!value) pending = null
        synchronizeListener()
    }

    fun reject() {
        pending = null
    }

    fun confirm() {
        val current = pending ?: return
        if (!foreground || !signedIn || current.submitting) return
        pending = current.copy(submitting = true, error = null)
        scope.launch {
            val response = withContext(Dispatchers.IO) {
                val body = JSONObject()
                    .put("request_id", current.request.requestId)
                    .put("nonce", current.request.nonce)
                    .toString()
                runCatching { request("POST", "/api/auth/wear/pairing-grant", body) }.getOrNull()
            }
            if (response?.status == 401) {
                onUnauthorized()
                pending = null
                return@launch
            }
            if (response?.status == null || response.status !in 200..299) {
                pending = current.copy(submitting = false, error = "接続を開始できません。もう一度お試しください。")
                return@launch
            }
            val grant = runCatching {
                val json = JSONObject(response?.body ?: error("missing response"))
                val value = json.getString("grant")
                val expiresAt = java.time.Instant.parse(json.getString("expires_at")).toEpochMilli()
                value.takeIf {
                    Regex("^[A-Za-z0-9_-]{43}$").matches(it)
                        && expiresAt > System.currentTimeMillis()
                        && expiresAt - System.currentTimeMillis() <= 120_000L
                }
            }.getOrNull()
            if (grant == null) {
                pending = current.copy(submitting = false, error = "接続情報を確認できません。もう一度お試しください。")
                return@launch
            }
            val payload = WearPairingProtocol.encodeGrant(current.request.requestId, grant)
            val sent = runCatching {
                messageClient.sendMessage(current.request.nodeId, WearPairingProtocol.GRANT_PATH, payload)
            }.getOrNull()
            if (sent == null) {
                if (pending?.request?.requestId == current.request.requestId) {
                    pending = current.copy(submitting = false, error = "Watchへ接続情報を送れません。近くで再試行してください。")
                }
                return@launch
            }
            sent
                .addOnSuccessListener {
                    if (pending?.request?.requestId == current.request.requestId) pending = null
                }
                .addOnFailureListener {
                    if (pending?.request?.requestId == current.request.requestId) {
                        pending = current.copy(submitting = false, error = "Watchへ接続情報を送れません。近くで再試行してください。")
                    }
                }
        }
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (!foreground || !signedIn) return
        val request = WearPairingProtocol.parseRequest(event.sourceNodeId, event.path, event.data) ?: return
        val existing = pending
        if (existing == null || existing.request.requestId == request.requestId) {
            pending = PhoneWearPairingUiState(request)
        }
    }

    fun close() {
        foreground = false
        signedIn = false
        synchronizeListener()
        scope.coroutineContext.cancel()
    }

    private fun synchronizeListener() {
        val shouldListen = foreground && signedIn
        if (shouldListen && !listenerRegistered) {
            messageClient.addListener(this)
                .addOnSuccessListener {
                    listenerRegistered = true
                    if (!foreground || !signedIn) synchronizeListener()
                }
                .addOnFailureListener { listenerRegistered = false }
        } else if (!shouldListen && listenerRegistered) {
            messageClient.removeListener(this)
            listenerRegistered = false
        }
    }
}
