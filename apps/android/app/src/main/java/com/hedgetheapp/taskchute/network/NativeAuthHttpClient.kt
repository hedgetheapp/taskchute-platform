package com.hedgetheapp.taskchute.network

import com.hedgetheapp.taskchute.auth.AuthTransport
import com.hedgetheapp.taskchute.auth.AuthTransportResult
import com.hedgetheapp.taskchute.auth.SessionCredential
import com.hedgetheapp.taskchute.config.AppConfig
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class NativeAuthHttpClient(rawBaseUrl: String) : AuthTransport {
    private companion object {
        const val MAX_RESPONSE_BYTES = 64 * 1024
    }

    private val baseUrl = AppConfig.validateBaseUrl(rawBaseUrl)
    private val baseOrigin = URL(baseUrl).let { "${it.protocol}://${it.authority}" }
    private val cookies = CookieJar()

    override fun signIn(email: String, password: String): AuthTransportResult {
        return request("POST", "/api/auth/sign-in/email", AuthRequestJson.signIn(email, password), clearCookieBeforeRequest = true)
            .toResult(unauthorized = AuthTransportResult.InvalidCredentials, requireSessionCookie = true)
    }

    override fun restoreSession(session: SessionCredential): AuthTransportResult {
        cookies.replace(session)
        val result = request("GET", "/api/auth/get-session", null)
        val serverDeletedExistingCookie = result.deletedCookies.any(session.cookies::containsKey)
        return when {
            result.status == null -> AuthTransportResult.TransientFailure()
            result.status == 401 -> AuthTransportResult.Unauthorized
            result.status in 200..299 -> when (BetterAuthSessionResponseParser.validate(result.body)) {
                BetterAuthSessionBody.NO_SESSION -> AuthTransportResult.Unauthorized
                BetterAuthSessionBody.MALFORMED -> if (serverDeletedExistingCookie) {
                    AuthTransportResult.Unauthorized
                } else {
                    AuthTransportResult.ProtocolFailure
                }
                BetterAuthSessionBody.AUTHENTICATED -> if (serverDeletedExistingCookie) {
                    AuthTransportResult.Unauthorized
                } else {
                    AuthTransportResult.Authenticated(cookies.snapshot() ?: session)
                }
            }
            result.status >= 500 -> AuthTransportResult.TransientFailure()
            else -> AuthTransportResult.ProtocolFailure
        }
    }

    override fun signOut(): AuthTransportResult =
        request("POST", "/api/auth/sign-out", "{}", clearCookieBeforeRequest = false)
            .toResult(unauthorized = AuthTransportResult.Unauthorized)

    override fun useSession(session: SessionCredential) = cookies.replace(session)

    override fun currentSession(): SessionCredential? = cookies.snapshot()

    override fun clearSession() = cookies.clear()

    private fun request(method: String, path: String, body: String?, clearCookieBeforeRequest: Boolean = false): HttpResult {
        if (clearCookieBeforeRequest) cookies.clear()
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 10_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            cookies.headerValue()?.let { setRequestProperty("Cookie", it) }
            if (method != "GET") {
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Origin", baseOrigin)
                setRequestProperty("Referer", "$baseOrigin/")
                doOutput = true
            }
        }
        return try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val deletedCookies = cookies.capture(
                connection.headerFields.entries
                    .filter { it.key.equals("Set-Cookie", true) }
                    .flatMap { it.value ?: emptyList() },
            )
            val body = runCatching { readResponseBody(connection, status) }.getOrNull()
            HttpResult(status, body, deletedCookies)
        } catch (_: IOException) {
            HttpResult(null, null, emptySet())
        } finally {
            connection.disconnect()
        }
    }

    private fun HttpResult.toResult(
        unauthorized: AuthTransportResult,
        requireSessionCookie: Boolean = false,
    ): AuthTransportResult = when {
        status == null -> AuthTransportResult.TransientFailure()
        status == 401 -> unauthorized
        status in 200..299 -> {
            val session = cookies.snapshot()
            if (requireSessionCookie && session == null) AuthTransportResult.ProtocolFailure
            else AuthTransportResult.Authenticated(session)
        }
        status >= 500 -> AuthTransportResult.TransientFailure()
        else -> AuthTransportResult.ProtocolFailure
    }

    private fun readResponseBody(connection: HttpURLConnection, status: Int): String {
        val stream = if (status >= 400) connection.errorStream ?: return "" else connection.inputStream
        return stream.use { it.readBoundedUtf8() }
    }

    private fun InputStream.readBoundedUtf8(): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(4 * 1024)
        var total = 0
        while (true) {
            val count = read(buffer)
            if (count < 0) break
            total += count
            if (total > MAX_RESPONSE_BYTES) throw IOException("authentication response is too large")
            output.write(buffer, 0, count)
        }
        return String(output.toByteArray(), Charsets.UTF_8)
    }

    private data class HttpResult(
        val status: Int?,
        val body: String?,
        val deletedCookies: Set<String>,
    )
}
