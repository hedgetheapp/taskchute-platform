package com.hedgetheapp.taskchute.network

import com.hedgetheapp.taskchute.auth.AuthTransport
import com.hedgetheapp.taskchute.auth.AuthTransportResult
import com.hedgetheapp.taskchute.auth.SessionCredential
import com.hedgetheapp.taskchute.config.AppConfig
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class NativeAuthHttpClient(rawBaseUrl: String) : AuthTransport {
    private val baseUrl = AppConfig.validateBaseUrl(rawBaseUrl)
    private val baseOrigin = URL(baseUrl).let { "${it.protocol}://${it.authority}" }
    private val cookies = CookieJar()

    override fun signIn(email: String, password: String): AuthTransportResult {
        return request("POST", "/api/auth/sign-in/email", AuthRequestJson.signIn(email, password), clearCookieBeforeRequest = true)
            .toResult(unauthorized = AuthTransportResult.InvalidCredentials)
    }

    override fun restoreSession(session: SessionCredential): AuthTransportResult {
        cookies.replace(session)
        return request("GET", "/api/auth/get-session", null).toResult(unauthorized = AuthTransportResult.Unauthorized)
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
            cookies.capture(connection.headerFields.entries.filter { it.key.equals("Set-Cookie", true) }.flatMap { it.value ?: emptyList() })
            HttpResult(status)
        } catch (_: IOException) {
            HttpResult(null)
        } finally {
            connection.disconnect()
        }
    }

    private fun HttpResult.toResult(unauthorized: AuthTransportResult): AuthTransportResult = when {
        status == null -> AuthTransportResult.TransientFailure()
        status == 401 -> unauthorized
        status in 200..299 -> AuthTransportResult.Authenticated(cookies.snapshot())
        status >= 500 -> AuthTransportResult.TransientFailure()
        else -> AuthTransportResult.ProtocolFailure
    }

    private data class HttpResult(val status: Int?)
}
