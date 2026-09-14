package com.hedgetheapp.taskchute.auth

data class SessionCredential(
    val cookies: Map<String, String>,
) {
    init {
        require(cookies.isNotEmpty()) { "session cookie jar must not be empty" }
        require(cookies.keys.all(::isSafeCookieName)) { "session cookie name is invalid" }
        require(cookies.values.all(::isSafeCookieValue)) { "session cookie value is invalid" }
    }

    fun normalized(): SessionCredential = SessionCredential(cookies.toSortedMap())

    private companion object {
        fun isSafeCookieName(value: String): Boolean = value.isNotEmpty() && value.all {
            it.isLetterOrDigit() || it in "!#$%&'*+-.^_`|~"
        }

        fun isSafeCookieValue(value: String): Boolean = value.none {
            it == '\r' || it == '\n' || it == '\u0000'
        }
    }
}

sealed interface AuthTransportResult {
    data class Authenticated(val session: SessionCredential? = null) : AuthTransportResult
    data object Unauthorized : AuthTransportResult
    data object InvalidCredentials : AuthTransportResult
    data class TransientFailure(val message: String = "network") : AuthTransportResult
    data object ProtocolFailure : AuthTransportResult
}

interface AuthTransport {
    fun signIn(email: String, password: String): AuthTransportResult

    fun restoreSession(session: SessionCredential): AuthTransportResult

    fun signOut(): AuthTransportResult

    fun useSession(session: SessionCredential)

    fun currentSession(): SessionCredential?

    fun clearSession()
}

interface SessionStore {
    fun load(): SessionCredential?

    fun save(session: SessionCredential): Boolean

    fun clear()
}

sealed interface AuthUiState {
    data object Restoring : AuthUiState
    data class SignedOut(val message: String? = null) : AuthUiState
    data object SigningIn : AuthUiState
    data class SignedIn(val message: String? = null) : AuthUiState
    data class NetworkError(val message: String, val sessionRetained: Boolean) : AuthUiState
    data object SigningOut : AuthUiState
}
