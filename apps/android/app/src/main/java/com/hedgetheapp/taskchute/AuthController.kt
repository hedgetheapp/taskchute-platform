package com.hedgetheapp.taskchute

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.hedgetheapp.taskchute.auth.AuthSessionCoordinator
import com.hedgetheapp.taskchute.auth.AuthUiState
import com.hedgetheapp.taskchute.config.AppConfig
import com.hedgetheapp.taskchute.network.NativeAuthHttpClient
import com.hedgetheapp.taskchute.security.EncryptedSessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AuthController internal constructor(
    private val coordinator: AuthSessionCoordinator?,
    private val scope: CoroutineScope,
    private val stateObserver: ((AuthUiState) -> Unit)?,
    private val nativeClient: NativeAuthHttpClient?,
) {
    private data class Runtime(
        val coordinator: AuthSessionCoordinator?,
        val client: NativeAuthHttpClient?,
    )

    private constructor(runtime: Runtime, scope: CoroutineScope) : this(
        coordinator = runtime.coordinator,
        scope = scope,
        stateObserver = null,
        nativeClient = runtime.client,
    )

    constructor(context: Context, rawBaseUrl: String) : this(
        runtime = createRuntime(context, rawBaseUrl),
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    )

    internal constructor(
        coordinator: AuthSessionCoordinator?,
        scope: CoroutineScope,
        stateObserver: ((AuthUiState) -> Unit)?,
    ) : this(coordinator, scope, stateObserver, null)

    var state by mutableStateOf<AuthUiState>(AuthUiState.Restoring)
        private set

    private var operationInFlight = false

    fun restore() = launchIfAvailable(AuthUiState.Restoring) { it.restore() }

    fun retry() = launchIfAvailable(AuthUiState.Restoring) { it.restore() }

    fun signIn(email: String, password: String) = launchIfAvailable(AuthUiState.SigningIn) { it.signIn(email.trim(), password) }

    fun signOut() = launchIfAvailable(AuthUiState.SigningOut) { it.signOut() }

    internal fun authenticatedRequest(method: String, path: String, body: String? = null) =
        nativeClient?.requestAuthenticated(method, path, body)

    internal fun realtimeCookieHeader(): String? = nativeClient?.realtimeCookieHeader()

    internal fun probeRealtimeSession(): Int? = nativeClient?.requestAuthenticated("GET", "/api/v1/realtime")?.status

    fun close() {
        scope.coroutineContext.cancel()
    }

    private fun launchIfAvailable(startingState: AuthUiState, action: (AuthSessionCoordinator) -> AuthUiState) {
        if (coordinator == null) {
            publishState(AuthUiState.SignedOut("接続先が設定されていません。アプリ設定を確認してください。"))
            return
        }
        if (operationInFlight) return
        operationInFlight = true
        publishState(startingState)
        scope.launch {
            val result = try {
                withContext(Dispatchers.IO) { action(coordinator) }
            } finally {
                operationInFlight = false
            }
            publishState(result)
        }
    }

    private fun publishState(next: AuthUiState) {
        state = next
        stateObserver?.invoke(next)
    }

    private companion object {
        fun createRuntime(context: Context, rawBaseUrl: String): Runtime {
            val configError = runCatching { AppConfig.validateBaseUrl(rawBaseUrl) }.exceptionOrNull()
            val transport = configError?.let { null } ?: runCatching { NativeAuthHttpClient(rawBaseUrl) }.getOrNull()
            return Runtime(
                coordinator = transport?.let { AuthSessionCoordinator(it, EncryptedSessionStore(context.applicationContext)) },
                client = transport,
            )
        }
    }
}
