package com.hedgetheapp.taskchute.wear

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

internal sealed interface WearAuthResult {
    data object SignedIn : WearAuthResult
    data object SignedOut : WearAuthResult
    data object TransientFailure : WearAuthResult
    data object ProtocolFailure : WearAuthResult
}

internal sealed interface WearLoadResult {
    data class Success(val day: WearDay) : WearLoadResult
    data object Unauthorized : WearLoadResult
    data class Failure(val ambiguous: Boolean) : WearLoadResult
}

internal sealed interface WearMutationResult {
    data object Success : WearMutationResult
    data object Unauthorized : WearMutationResult
    data object Ambiguous : WearMutationResult
    data object Rejected : WearMutationResult
}

internal enum class WearPushRegistrationResult { Success, Unauthorized, Retry, Rejected }

internal fun classifyWearPushRegistrationResponse(
    status: Int?,
    successPayload: Boolean,
): WearPushRegistrationResult = when {
    status == null || status >= 500 -> WearPushRegistrationResult.Retry
    status == 401 -> WearPushRegistrationResult.Unauthorized
    status !in 200..299 -> WearPushRegistrationResult.Rejected
    successPayload -> WearPushRegistrationResult.Success
    else -> WearPushRegistrationResult.Rejected
}

internal interface WearRepository {
    fun restoreSession(): WearAuthResult
    fun exchangePairingGrant(requestId: String, nonce: String, grant: String): WearAuthResult
    fun loadToday(): WearLoadResult
    fun start(day: WearDay, task: WearTask): WearMutationResult
    fun complete(task: WearTask): WearMutationResult
    fun clearSession() = Unit
}

internal class WearHttpRepository(
    rawBaseUrl: String,
    private val sessionStore: WearSessionStore,
    private val requestTimeoutMillis: Int = DEFAULT_REQUEST_TIMEOUT_MILLIS,
    private val installationIdProvider: (() -> String?)? = null,
) : WearRepository {
    private val baseUrl = rawBaseUrl.trimEnd('/')
    private val origin = runCatching { URL(baseUrl) }.getOrNull()
        ?.takeIf { it.protocol.equals("https", ignoreCase = true) }
        ?.let { "${it.protocol}://${it.authority}" }
        .orEmpty()
    private val cookieLock = Any()
    private val cookies = linkedMapOf<String, String>()

    internal fun realtimeCookieHeader(): String? = cookieHeader()

    override fun clearSession() {
        unregisterPushRegistrationBestEffort()
        clearUnauthorized()
    }

    override fun restoreSession(): WearAuthResult {
        val saved = runCatching { sessionStore.load() }.getOrNull() ?: run {
            synchronized(cookieLock) { cookies.clear() }
            return WearAuthResult.SignedOut
        }
        synchronized(cookieLock) {
            cookies.clear()
            cookies.putAll(saved.cookies)
        }
        val response = request("GET", "/api/auth/get-session", null)
        return when {
            response.status == null || response.status >= 500 -> WearAuthResult.TransientFailure
            response.status == 401 -> clearUnauthorized()
            response.status !in 200..299 -> WearAuthResult.ProtocolFailure
            isAuthenticatedSession(response.body) -> persistCurrentSession(saved)
            response.body.trim() == "null" || response.body.isBlank() -> clearUnauthorized()
            else -> WearAuthResult.ProtocolFailure
        }
    }

    override fun exchangePairingGrant(requestId: String, nonce: String, grant: String): WearAuthResult {
        unregisterPushRegistrationBestEffort()
        synchronized(cookieLock) { cookies.clear() }
        sessionStore.clear()
        val body = JSONObject().put("request_id", requestId).put("nonce", nonce).put("grant", grant).toString()
        val response = request("POST", "/api/auth/wear/pairing-exchange", body)
        return when {
            response.status == null || response.status >= 500 -> WearAuthResult.TransientFailure
            response.status == 401 -> clearUnauthorized()
            response.status !in 200..299 -> WearAuthResult.ProtocolFailure
            cookieSnapshot().isEmpty() -> WearAuthResult.ProtocolFailure
            !sessionStore.save(WearCookieSession(cookieSnapshot())) -> WearAuthResult.ProtocolFailure
            else -> WearAuthResult.SignedIn
        }
    }

    override fun loadToday(): WearLoadResult {
        val response = request("GET", "/api/v1/taskchute-days/current", null)
        return when {
            response.status == null || response.status >= 500 -> WearLoadResult.Failure(ambiguous = true)
            response.status == 401 -> {
                clearUnauthorized()
                WearLoadResult.Unauthorized
            }
            response.status !in 200..299 -> WearLoadResult.Failure(ambiguous = false)
            else -> runCatching { WearLoadResult.Success(WearJsonParser.parseDay(response.body)) }
                .getOrElse { WearLoadResult.Failure(ambiguous = false) }
        }
    }

    override fun start(day: WearDay, task: WearTask): WearMutationResult {
        val body = newWearStartRequest(task.id, day.placementRevision).toJson()
        return mutate("/api/v1/entries/${pathSegment(task.id)}/start", body)
    }

    override fun complete(task: WearTask): WearMutationResult {
        val executionId = task.executionId ?: return WearMutationResult.Rejected
        val body = newWearCompleteRequest(task.id, executionId).toJson()
        return mutate("/api/v1/entries/${pathSegment(task.id)}/complete", body)
    }

    fun registerPushToken(installationId: String, token: String): WearPushRegistrationResult =
        pushRegistrationRequest(
            "/api/v1/wear/push-registration",
            JSONObject().put("installation_id", installationId).put("fcm_token", token).toString(),
            "registered",
        )

    fun unregisterPushRegistration(installationId: String): WearPushRegistrationResult =
        pushRegistrationRequest(
            "/api/v1/wear/push-registration/unregister",
            JSONObject().put("installation_id", installationId).toString(),
            "unregistered",
        )

    private fun pushRegistrationRequest(path: String, body: String, successField: String): WearPushRegistrationResult {
        val response = request("POST", path, body)
        val successfulPayload = runCatching { JSONObject(response.body).optBoolean(successField) }.getOrDefault(false)
        return classifyWearPushRegistrationResponse(response.status, successfulPayload)
    }

    private fun unregisterPushRegistrationBestEffort() {
        val installationId = runCatching { installationIdProvider?.invoke() }.getOrNull() ?: return
        runCatching { unregisterPushRegistration(installationId) }
    }

    private fun mutate(path: String, body: String): WearMutationResult {
        val response = request("POST", path, body)
        return when {
            response.status == null || response.status >= 500 -> WearMutationResult.Ambiguous
            response.status == 401 -> {
                clearUnauthorized()
                WearMutationResult.Unauthorized
            }
            response.status in 200..299 -> WearMutationResult.Success
            else -> WearMutationResult.Rejected
        }
    }

    private fun persistCurrentSession(fallback: WearCookieSession): WearAuthResult {
        val snapshot = cookieSnapshot()
        val latest = snapshot.takeIf { it.isNotEmpty() }?.let(::WearCookieSession) ?: fallback
        return if (sessionStore.save(latest)) WearAuthResult.SignedIn else WearAuthResult.ProtocolFailure
    }

    private fun clearUnauthorized(): WearAuthResult {
        synchronized(cookieLock) { cookies.clear() }
        sessionStore.clear()
        return WearAuthResult.SignedOut
    }

    private fun isAuthenticatedSession(body: String): Boolean = runCatching {
        val value = JSONObject(body)
        value.optJSONObject("user") != null && value.optJSONObject("session") != null
    }.getOrDefault(false)

    private fun request(method: String, path: String, body: String?): WearHttpResponse {
        if (origin.isBlank()) return WearHttpResponse(null, "")
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = requestTimeoutMillis
            readTimeout = requestTimeoutMillis
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cache-Control", "no-store")
            cookieHeader()?.let { setRequestProperty("Cookie", it) }
            if (method != "GET") {
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Origin", origin)
                setRequestProperty("Referer", "$origin/")
                doOutput = true
            }
        }
        return try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            connection.headerFields.entries
                .filter { it.key.equals("Set-Cookie", ignoreCase = true) }
                .flatMap { it.value ?: emptyList() }
                .forEach(::captureCookie)
            val stream = if (status >= 400) connection.errorStream else connection.inputStream
            WearHttpResponse(status, stream?.use { it.readBounded() }.orEmpty())
        } catch (_: IOException) {
            WearHttpResponse(null, "")
        } finally {
            connection.disconnect()
        }
    }

    private fun InputStream.readBounded(): String {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(4 * 1024)
        var total = 0
        while (true) {
            val count = read(buffer)
            if (count < 0) break
            total += count
            if (total > MAX_RESPONSE_BYTES) throw IOException("Watch response is too large")
            output.write(buffer, 0, count)
        }
        return output.toString(Charsets.UTF_8.name())
    }

    private fun captureCookie(header: String) {
        val pair = header.substringBefore(';')
        val separator = pair.indexOf('=')
        if (separator <= 0) return
        val name = pair.substring(0, separator).trim()
        val value = pair.substring(separator + 1).trim()
        if (name.isBlank() || name.any { it == '\r' || it == '\n' } || value.any { it == '\r' || it == '\n' }) return
        synchronized(cookieLock) {
            if (value.isEmpty()) cookies.remove(name) else cookies[name] = value
        }
    }

    private fun cookieSnapshot(): Map<String, String> = synchronized(cookieLock) { cookies.toMap() }

    private fun cookieHeader(): String? = cookieSnapshot().toSortedMap().entries
        .joinToString("; ") { "${it.key}=${it.value}" }.takeIf { it.isNotEmpty() }

    private fun pathSegment(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    private data class WearHttpResponse(val status: Int?, val body: String)

    private companion object {
        const val DEFAULT_REQUEST_TIMEOUT_MILLIS = 10_000
        const val MAX_RESPONSE_BYTES = 2 * 1024 * 1024
    }
}
