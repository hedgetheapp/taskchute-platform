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
) {
    constructor(context: Context, rawBaseUrl: String) : this(
        coordinator = createCoordinator(context, rawBaseUrl),
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        stateObserver = null,
    )

    var state by mutableStateOf<AuthUiState>(AuthUiState.Restoring)
        private set

    private var operationInFlight = false

    fun restore() = launchIfAvailable { it.restore() }

    fun retry() = launchIfAvailable { it.restore() }

    fun signIn(email: String, password: String) = launchIfAvailable { it.signIn(email.trim(), password) }

    fun signOut() = launchIfAvailable { it.signOut() }

    fun close() {
        scope.coroutineContext.cancel()
    }

    private fun launchIfAvailable(action: (AuthSessionCoordinator) -> AuthUiState) {
        if (coordinator == null) {
            publishState(AuthUiState.SignedOut("接続先が設定されていません。アプリ設定を確認してください。"))
            return
        }
        if (operationInFlight) return
        operationInFlight = true
        scope.launch {
            try {
                publishState(withContext(Dispatchers.IO) { action(coordinator) })
            } finally {
                operationInFlight = false
            }
        }
    }

    private fun publishState(next: AuthUiState) {
        state = next
        stateObserver?.invoke(next)
    }

    private companion object {
        fun createCoordinator(context: Context, rawBaseUrl: String): AuthSessionCoordinator? {
            val configError = runCatching { AppConfig.validateBaseUrl(rawBaseUrl) }.exceptionOrNull()
            val transport = configError?.let { null } ?: runCatching { NativeAuthHttpClient(rawBaseUrl) }.getOrNull()
            return transport?.let { AuthSessionCoordinator(it, EncryptedSessionStore(context.applicationContext)) }
        }
    }
}
