package com.hedgetheapp.taskchute.auth

class AuthSessionCoordinator(
    private val transport: AuthTransport,
    private val store: SessionStore,
) {
    var state: AuthUiState = AuthUiState.Restoring
        private set

    fun restore(): AuthUiState {
        state = AuthUiState.Restoring
        val saved = runCatching { store.load() }.getOrNull()
        if (saved == null) {
            transport.clearSession()
            return setState(AuthUiState.SignedOut())
        }

        transport.useSession(saved)
        return when (val result = runCatching { transport.restoreSession(saved) }.getOrElse {
            AuthTransportResult.TransientFailure()
        }) {
            is AuthTransportResult.Authenticated -> {
                val current = result.session ?: transport.currentSession() ?: saved
                if (store.save(current.normalized())) {
                    setState(AuthUiState.SignedIn())
                } else {
                    setState(AuthUiState.NetworkError("セッションを安全に保存できません。再試行してください。", true))
                }
            }

            AuthTransportResult.Unauthorized -> {
                store.clear()
                transport.clearSession()
                setState(AuthUiState.SignedOut("セッションの有効期限が切れています。再度ログインしてください。"))
            }

            is AuthTransportResult.TransientFailure ->
                setState(AuthUiState.NetworkError("接続を確認してから再試行してください。", true))

            else -> setState(AuthUiState.NetworkError("認証状態を確認できません。再試行してください。", true))
        }
    }

    fun signIn(email: String, password: String): AuthUiState {
        state = AuthUiState.SigningIn
        return when (val result = runCatching { transport.signIn(email, password) }.getOrElse {
            AuthTransportResult.TransientFailure()
        }) {
            is AuthTransportResult.Authenticated -> {
                val session = result.session ?: transport.currentSession()
                if (session == null || !store.save(session.normalized())) {
                    transport.clearSession()
                    setState(AuthUiState.NetworkError("セッションを安全に保存できません。再試行してください。", false))
                } else {
                    setState(AuthUiState.SignedIn())
                }
            }

            AuthTransportResult.InvalidCredentials ->
                setState(AuthUiState.SignedOut("メールアドレスまたはパスワードを確認してください。"))

            is AuthTransportResult.TransientFailure ->
                setState(AuthUiState.SignedOut("接続できませんでした。時間をおいて再試行してください。"))

            else -> setState(AuthUiState.SignedOut("ログインを完了できませんでした。"))
        }
    }

    fun signOut(): AuthUiState {
        if (state is AuthUiState.SigningOut) return state
        state = AuthUiState.SigningOut
        return when (runCatching { transport.signOut() }.getOrElse { AuthTransportResult.TransientFailure() }) {
            is AuthTransportResult.Authenticated,
            AuthTransportResult.Unauthorized,
            -> {
                store.clear()
                transport.clearSession()
                setState(AuthUiState.SignedOut())
            }

            else -> setState(AuthUiState.SignedIn("ログアウトを完了できませんでした。接続後にもう一度お試しください。"))
        }
    }

    private fun setState(next: AuthUiState): AuthUiState {
        state = next
        return next
    }
}
