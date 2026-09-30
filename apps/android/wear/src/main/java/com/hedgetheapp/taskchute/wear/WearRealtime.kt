package com.hedgetheapp.taskchute.wear

import android.os.Handler
import android.os.Looper
import kotlin.math.floor
import kotlin.math.min
import org.json.JSONArray
import org.json.JSONObject

internal interface WearRealtimeClient {
    fun start()
    fun stop()
}

internal interface WearRealtimeSocket {
    fun close()
}

internal interface WearRealtimeSocketListener {
    fun onOpen(socket: WearRealtimeSocket)
    fun onMessage(socket: WearRealtimeSocket, message: String)
    fun onFailure(socket: WearRealtimeSocket, responseCode: Int?)
    fun onClosed(socket: WearRealtimeSocket)
}

internal fun interface WearRealtimeSocketFactory {
    fun open(cookieHeader: String, listener: WearRealtimeSocketListener): WearRealtimeSocket
}

internal fun interface WearRealtimeCancellable {
    fun cancel()
}

internal fun interface WearRealtimeScheduler {
    fun schedule(delayMillis: Long, action: () -> Unit): WearRealtimeCancellable
}

internal data class WearRealtimeCallbacks(
    val onDayInvalidation: (String?) -> Unit = {},
    val onUnauthorized: () -> Unit = {},
)

/** The server's existing version-1 invalidation envelope; Wear consumes only Day scopes. */
internal object WearRealtimeInvalidationParser {
    private const val VERSION = 1
    private const val MAX_MESSAGE_BYTES = 16 * 1024
    private val logicalDatePattern = Regex("^\\d{4}-\\d{2}-\\d{2}$")

    fun parse(serialized: String): List<String?>? {
        if (serialized.toByteArray(Charsets.UTF_8).size > MAX_MESSAGE_BYTES) return null
        val message = runCatching { JSONObject(serialized) }.getOrNull() ?: return null
        if (!message.hasOnly("version", "type", "scopes")) return null
        val version = message.opt("version") as? Number ?: return null
        if (version.toDouble() != VERSION.toDouble() || message.optString("type") != "invalidate") return null
        val scopes = message.opt("scopes") as? JSONArray ?: return null
        if (scopes.length() !in 1..32) return null

        val dayDates = mutableListOf<String?>()
        for (index in 0 until scopes.length()) {
            val scope = scopes.optJSONObject(index) ?: return null
            when (scope.optString("kind")) {
                "day" -> {
                    if (!scope.hasOnly("kind", "logical_date")) return null
                    if (!scope.has("logical_date")) {
                        dayDates += null
                    } else {
                        val date = scope.opt("logical_date") as? String ?: return null
                        if (!logicalDatePattern.matches(date)) return null
                        dayDates += date
                    }
                }
                "projects", "modes", "routines" -> if (!scope.hasOnly("kind")) return null
                "documents" -> {
                    if (!scope.hasOnly("kind", "document_ids")) return null
                    if (scope.has("document_ids")) {
                        val ids = scope.opt("document_ids") as? JSONArray ?: return null
                        if (ids.length() > 100) return null
                        for (idIndex in 0 until ids.length()) {
                            val id = ids.opt(idIndex) as? String ?: return null
                            if (id.isEmpty() || id.length > 200) return null
                        }
                    }
                }
                else -> return null
            }
        }
        return dayDates
    }

    private fun JSONObject.hasOnly(vararg names: String): Boolean {
        val allowed = names.toSet()
        return keys().asSequence().all(allowed::contains)
    }
}

/** Main-thread-confined foreground socket manager; socket callbacks are marshalled to main. */
internal class WearRealtimeConnectionManager(
    private val cookieProvider: () -> String?,
    private val socketFactory: WearRealtimeSocketFactory,
    private val scheduler: WearRealtimeScheduler,
    private val random: () -> Double = Math::random,
    private val callbacks: WearRealtimeCallbacks = WearRealtimeCallbacks(),
    private val parseInvalidation: (String) -> List<String?>? = WearRealtimeInvalidationParser::parse,
) : WearRealtimeClient {
    private companion object {
        const val INITIAL_RECONNECT_DELAY_MS = 500L
        const val MAX_RECONNECT_DELAY_MS = 30_000L
        const val INVALIDATION_COALESCE_DELAY_MS = 50L
    }

    private var started = false
    private var nextConnectionId = 0L
    private var activeConnectionId = 0L
    private var activeSocket: WearRealtimeSocket? = null
    private var reconnectAttempt = 0
    private var reconnectTimer: WearRealtimeCancellable? = null
    private var invalidationTimer: WearRealtimeCancellable? = null
    private var invalidationPending = false
    private var invalidationWildcard = false
    private var invalidationDate: String? = null

    override fun start() {
        if (started) return
        started = true
        reconnectAttempt = 0
        connect()
    }

    override fun stop() {
        started = false
        nextConnectionId += 1
        reconnectTimer?.cancel()
        reconnectTimer = null
        invalidationTimer?.cancel()
        invalidationTimer = null
        invalidationPending = false
        invalidationWildcard = false
        invalidationDate = null
        activeSocket?.close()
        activeSocket = null
    }

    private fun connect() {
        if (!started || activeSocket != null || reconnectTimer != null) return
        val cookieHeader = cookieProvider()?.takeIf { it.isNotBlank() } ?: run {
            started = false
            callbacks.onUnauthorized()
            return
        }
        val connectionId = ++nextConnectionId
        activeConnectionId = connectionId
        try {
            val socket = socketFactory.open(cookieHeader, object : WearRealtimeSocketListener {
                override fun onOpen(socket: WearRealtimeSocket) = dispatch {
                    if (isActive(connectionId, socket)) reconnectAttempt = 0
                }

                override fun onMessage(socket: WearRealtimeSocket, message: String) = dispatch {
                    if (!isActive(connectionId, socket)) return@dispatch
                    parseInvalidation(message).orEmpty().forEach(::enqueueInvalidation)
                }

                override fun onFailure(socket: WearRealtimeSocket, responseCode: Int?) = dispatch {
                    if (!isActive(connectionId, socket)) return@dispatch
                    activeSocket = null
                    if (responseCode == 401) enterUnauthorized() else scheduleReconnect()
                }

                override fun onClosed(socket: WearRealtimeSocket) = dispatch {
                    if (!isActive(connectionId, socket)) return@dispatch
                    activeSocket = null
                    if (started) scheduleReconnect()
                }
            })
            if (!started || activeConnectionId != connectionId) socket.close() else activeSocket = socket
        } catch (_: Throwable) {
            if (started && activeConnectionId == connectionId) scheduleReconnect()
        }
    }

    private fun dispatch(action: () -> Unit) {
        scheduler.schedule(0L, action)
    }

    private fun isActive(connectionId: Long, socket: WearRealtimeSocket): Boolean =
        started && activeConnectionId == connectionId && activeSocket === socket

    private fun enterUnauthorized() {
        started = false
        nextConnectionId += 1
        reconnectTimer?.cancel()
        reconnectTimer = null
        invalidationTimer?.cancel()
        invalidationTimer = null
        invalidationPending = false
        invalidationWildcard = false
        invalidationDate = null
        activeSocket?.close()
        activeSocket = null
        callbacks.onUnauthorized()
    }

    private fun scheduleReconnect() {
        if (!started || reconnectTimer != null) return
        val baseDelay = min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS shl reconnectAttempt.coerceAtMost(6))
        reconnectAttempt = min(reconnectAttempt + 1, 8)
        val jitter = floor(baseDelay.toDouble() * ((random().coerceIn(0.0, 1.0) * 0.4) - 0.2)).toLong()
        reconnectTimer = scheduler.schedule((baseDelay + jitter).coerceAtLeast(100L)) {
            reconnectTimer = null
            connect()
        }
    }

    private fun enqueueInvalidation(logicalDate: String?) {
        if (!started) return
        invalidationPending = true
        if (logicalDate == null) {
            invalidationWildcard = true
            invalidationDate = null
        } else if (!invalidationWildcard && invalidationDate == null) {
            invalidationDate = logicalDate
        } else if (!invalidationWildcard && invalidationDate != logicalDate) {
            invalidationWildcard = true
            invalidationDate = null
        }
        if (invalidationTimer == null) {
            invalidationTimer = scheduler.schedule(INVALIDATION_COALESCE_DELAY_MS) {
                invalidationTimer = null
                if (!started || !invalidationPending) return@schedule
                val date = if (invalidationWildcard) null else invalidationDate
                invalidationPending = false
                invalidationWildcard = false
                invalidationDate = null
                callbacks.onDayInvalidation(date)
            }
        }
    }
}

internal class AndroidWearRealtimeScheduler(
    private val handler: Handler = Handler(Looper.getMainLooper()),
) : WearRealtimeScheduler {
    override fun schedule(delayMillis: Long, action: () -> Unit): WearRealtimeCancellable {
        val runnable = Runnable(action)
        handler.postDelayed(runnable, delayMillis)
        return WearRealtimeCancellable { handler.removeCallbacks(runnable) }
    }
}

/** One in-flight refresh plus at most one follow-up for a burst arriving during that fetch. */
internal class WearRefreshGate {
    private var inFlight = false
    private var rerunRequested = false

    fun request(): Boolean {
        if (inFlight) {
            rerunRequested = true
            return false
        }
        inFlight = true
        return true
    }

    /** Returns true while retaining ownership when exactly one follow-up fetch is needed. */
    fun finish(): Boolean {
        if (rerunRequested) {
            rerunRequested = false
            return true
        }
        inFlight = false
        return false
    }

    fun clearPending() {
        rerunRequested = false
    }
}
