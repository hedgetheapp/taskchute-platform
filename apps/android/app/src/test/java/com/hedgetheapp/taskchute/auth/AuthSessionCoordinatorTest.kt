package com.hedgetheapp.taskchute.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthSessionCoordinatorTest {
    @Test
    fun noStoredSessionStartsSignedOut() {
        val transport = FakeTransport()
        val coordinator = AuthSessionCoordinator(transport, FakeStore())

        assertEquals(AuthUiState.SignedOut(), coordinator.restore())
        assertTrue(transport.session == null)
    }

    @Test
    fun validRestorePersistsUpdatedDynamicCookies() {
        val store = FakeStore(SessionCredential(mapOf("opaque_cookie" to "one")))
        val transport = FakeTransport().apply { restoreResult = AuthTransportResult.Authenticated(SessionCredential(mapOf("rotated_cookie" to "two"))) }
        val coordinator = AuthSessionCoordinator(transport, store)

        assertEquals(AuthUiState.SignedIn(), coordinator.restore())
        assertEquals(mapOf("rotated_cookie" to "two"), store.session?.cookies)
    }

    @Test
    fun unauthorizedRestoreClearsStoredSession() {
        val store = FakeStore(SessionCredential(mapOf("opaque_cookie" to "one")))
        val transport = FakeTransport().apply { restoreResult = AuthTransportResult.Unauthorized }

        val state = AuthSessionCoordinator(transport, store).restore()

        assertTrue(state is AuthUiState.SignedOut)
        assertEquals(null, store.session)
    }

    @Test
    fun authenticatedResultWithoutValidatedSessionCannotReuseSavedCredential() {
        val saved = SessionCredential(mapOf("opaque_cookie" to "one"))
        val store = FakeStore(saved)
        val transport = FakeTransport().apply { restoreResult = AuthTransportResult.Authenticated() }

        val state = AuthSessionCoordinator(transport, store).restore()

        assertEquals(AuthUiState.NetworkError("セッションを安全に保存できません。再試行してください。", true), state)
        assertEquals(saved, store.session)
    }

    @Test
    fun transientRestoreRetainsSessionAndIsNotSignedOut() {
        val store = FakeStore(SessionCredential(mapOf("opaque_cookie" to "one")))
        val transport = FakeTransport().apply { restoreResult = AuthTransportResult.TransientFailure() }

        val state = AuthSessionCoordinator(transport, store).restore()

        assertEquals(AuthUiState.NetworkError("接続を確認してから再試行してください。", true), state)
        assertTrue(store.session != null)
    }

    @Test
    fun invalidCredentialsDoNotPersistASession() {
        val store = FakeStore()
        val transport = FakeTransport().apply { signInResult = AuthTransportResult.InvalidCredentials }

        val state = AuthSessionCoordinator(transport, store).signIn("a@example.test", "not-logged")

        assertEquals(AuthUiState.SignedOut("メールアドレスまたはパスワードを確認してください。"), state)
        assertEquals(null, store.session)
    }

    @Test
    fun ambiguousLogoutRetainsSession() {
        val store = FakeStore(SessionCredential(mapOf("opaque_cookie" to "one")))
        val transport = FakeTransport().apply { signOutResult = AuthTransportResult.TransientFailure() }
        val coordinator = AuthSessionCoordinator(transport, store)
        coordinator.restore()

        val state = coordinator.signOut()

        assertTrue(state is AuthUiState.SignedIn)
        assertTrue(store.session != null)
    }

    private class FakeStore(initial: SessionCredential? = null) : SessionStore {
        var session: SessionCredential? = initial
        override fun load() = session
        override fun save(session: SessionCredential): Boolean { this.session = session; return true }
        override fun clear() { session = null }
    }

    private class FakeTransport : AuthTransport {
        var session: SessionCredential? = null
        var restoreResult: AuthTransportResult = AuthTransportResult.Authenticated(SessionCredential(mapOf("session" to "value")))
        var signInResult: AuthTransportResult = AuthTransportResult.Authenticated(SessionCredential(mapOf("session" to "value")))
        var signOutResult: AuthTransportResult = AuthTransportResult.Unauthorized
        override fun signIn(email: String, password: String): AuthTransportResult { session = (signInResult as? AuthTransportResult.Authenticated)?.session; return signInResult }
        override fun restoreSession(session: SessionCredential): AuthTransportResult { this.session = session; return restoreResult }
        override fun signOut() = signOutResult
        override fun useSession(session: SessionCredential) { this.session = session }
        override fun currentSession() = session
        override fun clearSession() { session = null }
    }
}
