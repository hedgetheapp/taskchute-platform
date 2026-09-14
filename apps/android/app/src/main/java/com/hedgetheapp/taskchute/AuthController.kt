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

class AuthController(context: Context, rawBaseUrl: String) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val configError = runCatching { AppConfig.validateBaseUrl(rawBaseUrl) }.exceptionOrNull()
    private val transport = configError?.let { null } ?: runCatching { NativeAuthHttpClient(rawBaseUrl) }.getOrNull()
    private val coordinator = transport?.let { AuthSessionCoordinator(it, EncryptedSessionStore(context.applicationContext)) }

    var state by mutableStateOf<AuthUiState>(AuthUiState.Restoring)
        private set

    fun restore() = launchIfAvailable { it.restore() }

    fun retry() = launchIfAvailable { it.restore() }

    fun signIn(email: String, password: String) = launchIfAvailable { it.signIn(email.trim(), password) }

    fun signOut() = launchIfAvailable { it.signOut() }

    fun close() {
        scope.coroutineContext.cancel()
    }

    private fun launchIfAvailable(action: (AuthSessionCoordinator) -> AuthUiState) {
        if (coordinator == null) {
            state = AuthUiState.SignedOut("接続先が設定されていません。アプリ設定を確認してください。")
            return
        }
        if (state is AuthUiState.SigningIn || state is AuthUiState.SigningOut || state is AuthUiState.Restoring) return
        scope.launch {
            state = withContext(Dispatchers.IO) { action(coordinator) }
        }
    }
}
