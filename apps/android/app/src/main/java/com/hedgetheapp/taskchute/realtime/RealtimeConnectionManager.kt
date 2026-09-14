package com.hedgetheapp.taskchute.realtime

import android.os.Handler
import android.os.Looper
import kotlin.math.floor
import kotlin.math.min

internal enum class RealtimeConnectionState {
    IDLE,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    AUTH_REQUIRED,
}

internal interface RealtimeSocket {
    fun close()
}

internal interface RealtimeSocketListener {
    fun onOpen(socket: RealtimeSocket)
    fun onMessage(socket: RealtimeSocket, message: String)
    fun onFailure(socket: RealtimeSocket, responseCode: Int?)
    fun onClosed(socket: RealtimeSocket)
}

internal fun interface RealtimeSocketFactory {
    fun open(cookieHeader: String, listener: RealtimeSocketListener): RealtimeSocket
}

internal fun interface RealtimeCancellable {
    fun cancel()
}

internal fun interface RealtimeScheduler {
    fun schedule(delayMillis: Long, action: () -> Unit): RealtimeCancellable
}

internal fun interface RealtimeAuthProbe {
    fun probe(callback: (status: Int?) -> Unit)
}

internal data class RealtimeConnectionCallbacks(
    val onConnected: () -> Unit = {},
    val onDayInvalidation: (logicalDate: String?) -> Unit = {},
    val onAuthFailure: () -> Unit = {},
    val onStateChanged: (RealtimeConnectionState) -> Unit = {},
)

internal class RealtimeConnectionManager(
    private val cookieProvider: () -> String?,
    private val socketFactory: RealtimeSocketFactory,
    private val scheduler: RealtimeScheduler,
    private val authProbe: RealtimeAuthProbe?,
    private val random: () -> Double = Math::random,
    private val callbacks: RealtimeConnectionCallbacks = RealtimeConnectionCallbacks(),
) {
    private companion object {
        const val INITIAL_RECONNECT_DELAY_MS = 500L
        const val MAX_RECONNECT_DELAY_MS = 30_000L
        const val INVALIDATION_COALESCE_DELAY_MS = 50L
    }

    private var started = false
    private var nextConnectionId = 0L
    private var activeConnectionId = 0L
    private var activeSocket: RealtimeSocket? = null
    private var reconnectAttempt = 0
    private var reconnectTimer: RealtimeCancellable? = null
    private var invalidationTimer: RealtimeCancellable? = null
    private var invalidationPending = false
    private var invalidationWildcard = false
    private var invalidationDate: String? = null
    private var state = RealtimeConnectionState.IDLE

    fun currentState(): RealtimeConnectionState = state

    fun start() {
        if (started) return
        started = true
        reconnectAttempt = 0
        connect()
    }

    fun stop() {
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
        setState(RealtimeConnectionState.IDLE)
    }

    private fun connect() {
        if (!started || activeSocket != null || reconnectTimer != null) return
        val cookieHeader = cookieProvider() ?: run {
            started = false
            setState(RealtimeConnectionState.AUTH_REQUIRED)
            callbacks.onAuthFailure()
            return
        }
        val connectionId = ++nextConnectionId
        activeConnectionId = connectionId
        setState(if (reconnectAttempt == 0) RealtimeConnectionState.CONNECTING else RealtimeConnectionState.RECONNECTING)
        try {
            val socket = socketFactory.open(cookieHeader, object : RealtimeSocketListener {
                override fun onOpen(socket: RealtimeSocket) {
                    if (!isActive(connectionId, socket)) return
                    reconnectTimer = null
                    reconnectAttempt = 0
                    setState(RealtimeConnectionState.CONNECTED)
                    callbacks.onConnected()
                }

                override fun onMessage(socket: RealtimeSocket, message: String) {
                    if (!isActive(connectionId, socket)) return
                    val invalidation = RealtimeInvalidationParser.parse(message) ?: return
                    invalidation.dayScopes.forEach { enqueueDayInvalidation(it.logicalDate) }
                }

                override fun onFailure(socket: RealtimeSocket, responseCode: Int?) {
                    if (!isActive(connectionId, socket)) return
                    activeSocket = null
                    if (responseCode == 401) {
                        enterAuthRequired()
                    } else if (responseCode == null && authProbe != null) {
                        authProbe.probe { status ->
                            if (!started || activeConnectionId != connectionId || activeSocket != null) return@probe
                            if (status == 401) enterAuthRequired() else scheduleReconnect()
                        }
                    } else {
                        scheduleReconnect()
                    }
                }

                override fun onClosed(socket: RealtimeSocket) {
                    if (!isActive(connectionId, socket)) return
                    activeSocket = null
                    if (started) scheduleReconnect()
                }
            })
            activeSocket = socket
        } catch (_: Throwable) {
            if (activeConnectionId == connectionId) scheduleReconnect()
        }
    }

    private fun isActive(connectionId: Long, socket: RealtimeSocket): Boolean =
        started && activeConnectionId == connectionId && activeSocket === socket

    private fun enterAuthRequired() {
        started = false
        reconnectTimer?.cancel()
        reconnectTimer = null
        activeSocket?.close()
        activeSocket = null
        setState(RealtimeConnectionState.AUTH_REQUIRED)
        callbacks.onAuthFailure()
    }

    private fun scheduleReconnect() {
        if (!started || reconnectTimer != null) return
        val exponential = min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS shl reconnectAttempt.coerceAtMost(6))
        reconnectAttempt = min(reconnectAttempt + 1, 8)
        val jitter = floor(exponential.toDouble() * ((random().coerceIn(0.0, 1.0) * 0.4) - 0.2)).toLong()
        setState(RealtimeConnectionState.RECONNECTING)
        reconnectTimer = scheduler.schedule((exponential + jitter).coerceAtLeast(100L)) {
            reconnectTimer = null
            connect()
        }
    }

    private fun enqueueDayInvalidation(logicalDate: String?) {
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
        if (invalidationTimer != null) return
        invalidationTimer = scheduler.schedule(INVALIDATION_COALESCE_DELAY_MS) {
            invalidationTimer = null
            if (!invalidationPending || !started) return@schedule
            val date = if (invalidationWildcard) null else invalidationDate
            invalidationPending = false
            invalidationWildcard = false
            invalidationDate = null
            callbacks.onDayInvalidation(date)
        }
    }

    private fun setState(next: RealtimeConnectionState) {
        state = next
        callbacks.onStateChanged(next)
    }
}

internal class AndroidRealtimeScheduler(
    private val handler: Handler = Handler(Looper.getMainLooper()),
) : RealtimeScheduler {
    override fun schedule(delayMillis: Long, action: () -> Unit): RealtimeCancellable {
        val runnable = Runnable(action)
        handler.postDelayed(runnable, delayMillis)
        return RealtimeCancellable { handler.removeCallbacks(runnable) }
    }
}
