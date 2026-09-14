package com.hedgetheapp.taskchute.network

import com.hedgetheapp.taskchute.auth.AuthTransportResult
import com.hedgetheapp.taskchute.auth.AuthUiState
import com.hedgetheapp.taskchute.auth.SessionCredential
import com.hedgetheapp.taskchute.auth.SessionStore
import com.hedgetheapp.taskchute.auth.AuthSessionCoordinator
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.net.ServerSocket
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeAuthHttpClientTest {
    @Test
    fun parserRecognizesCurrentBetterAuthShapes() {
        assertEquals(BetterAuthSessionBody.AUTHENTICATED, BetterAuthSessionResponseParser.validate(VALID_SESSION_BODY))
        assertEquals(BetterAuthSessionBody.NO_SESSION, BetterAuthSessionResponseParser.validate("{\"session\":null,\"user\":null}"))
    }

    @Test
    fun validBetterAuthSessionBodyAuthenticates() {
        withServer(200, VALID_SESSION_BODY) { baseUrl ->
            val client = NativeAuthHttpClient(baseUrl)

            val result = client.restoreSession(OLD_SESSION)

            assertEquals(AuthTransportResult.Authenticated(OLD_SESSION), result)
        }
    }

    @Test
    fun jsonNullMeansUnauthorized() {
        withServer(200, "null") { baseUrl ->
            assertEquals(AuthTransportResult.Unauthorized, NativeAuthHttpClient(baseUrl).restoreSession(OLD_SESSION))
        }
    }

    @Test
    fun emptyBetterAuthSessionMeansUnauthorized() {
        withServer(200, "{\"session\":null,\"user\":null}") { baseUrl ->
            assertEquals(AuthTransportResult.Unauthorized, NativeAuthHttpClient(baseUrl).restoreSession(OLD_SESSION))
        }
    }

    @Test
    fun malformedTwoHundredResponseFailsClosed() {
        withServer(200, "{\"session\":{\"id\":\"only-session\"}}") { baseUrl ->
            val result = NativeAuthHttpClient(baseUrl).restoreSession(OLD_SESSION)

            assertEquals(AuthTransportResult.ProtocolFailure, result)
            assertTrue(result !is AuthTransportResult.Authenticated)
        }
    }

    @Test
    fun unauthorizedStatusIsNotAuthenticated() {
        withServer(401, "null") { baseUrl ->
            assertEquals(AuthTransportResult.Unauthorized, NativeAuthHttpClient(baseUrl).restoreSession(OLD_SESSION))
        }
    }

    @Test
    fun serverFailureIsTransient() {
        withServer(500, "server failure") { baseUrl ->
            assertTrue(NativeAuthHttpClient(baseUrl).restoreSession(OLD_SESSION) is AuthTransportResult.TransientFailure)
        }
    }

    @Test
    fun networkFailureIsTransient() {
        val port = ServerSocket(0).use { it.localPort }

        val result = NativeAuthHttpClient("http://127.0.0.1:$port").restoreSession(OLD_SESSION)

        assertTrue(result is AuthTransportResult.TransientFailure)
    }

    @Test
    fun deletedCookieAndNoSessionCannotResurrectSavedCredential() {
        withServer(200, "null", "session_token=; Max-Age=0; Path=/") { baseUrl ->
            val saved = MemoryStore(OLD_SESSION)
            val client = NativeAuthHttpClient(baseUrl)

            val state = AuthSessionCoordinator(client, saved).restore()

            assertTrue(state is AuthUiState.SignedOut)
            assertEquals(null, saved.session)
            assertEquals(null, client.currentSession())
        }
    }

    @Test
    fun deletedCookieWinsEvenWhenBodyLooksAuthenticated() {
        withServer(200, VALID_SESSION_BODY, "session_token=; Max-Age=0; Path=/") { baseUrl ->
            val client = NativeAuthHttpClient(baseUrl)

            assertEquals(AuthTransportResult.Unauthorized, client.restoreSession(OLD_SESSION))
            assertEquals(null, client.currentSession())
        }
    }

    @Test
    fun rotatedCookieIsReturnedAfterValidatedSession() {
        withServer(200, VALID_SESSION_BODY, "session_token=new; Path=/") { baseUrl ->
            val result = NativeAuthHttpClient(baseUrl).restoreSession(OLD_SESSION)

            assertEquals(AuthTransportResult.Authenticated(SessionCredential(mapOf("session_token" to "new"))), result)
        }
    }

    @Test
    fun existingCookieMayRemainWhenValidatedResponseDoesNotRotate() {
        withServer(200, VALID_SESSION_BODY) { baseUrl ->
            val result = NativeAuthHttpClient(baseUrl).restoreSession(OLD_SESSION)

            assertEquals(AuthTransportResult.Authenticated(OLD_SESSION), result)
        }
    }

    @Test
    fun transientRestoreDoesNotClearEncryptedStore() {
        withServer(500, "server failure") { baseUrl ->
            val saved = MemoryStore(OLD_SESSION)

            AuthSessionCoordinator(NativeAuthHttpClient(baseUrl), saved).restore()

            assertEquals(OLD_SESSION, saved.session)
        }
    }

    private fun withServer(status: Int, body: String, setCookie: String? = null, block: (String) -> Unit) {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/auth/get-session") { exchange ->
            if (setCookie != null) exchange.responseHeaders.add("Set-Cookie", setCookie)
            val bytes = body.toByteArray(Charsets.UTF_8)
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            block("http://127.0.0.1:${server.address.port}")
        } finally {
            server.stop(0)
        }
    }

    private class MemoryStore(initial: SessionCredential?) : SessionStore {
        var session: SessionCredential? = initial
        override fun load() = session
        override fun save(session: SessionCredential): Boolean {
            this.session = session
            return true
        }
        override fun clear() {
            session = null
        }
    }

    private companion object {
        val OLD_SESSION = SessionCredential(mapOf("session_token" to "old"))
        const val VALID_SESSION_BODY = "{\"session\":{\"id\":\"session-id\",\"userId\":\"user-id\"},\"user\":{\"id\":\"user-id\"}}"
    }
}
