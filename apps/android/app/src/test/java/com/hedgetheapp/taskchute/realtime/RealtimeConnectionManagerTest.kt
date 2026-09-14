package com.hedgetheapp.taskchute.realtime

import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RealtimeConnectionManagerTest {
    @Test
    fun ownsOneActiveSocketAndReloadsAfterConnectionAndDayMessage() {
        val factory = FakeSocketFactory()
        val scheduler = FakeScheduler()
        var connected = 0
        val invalidated = mutableListOf<String?>()
        val manager = manager(factory, scheduler, RealtimeConnectionCallbacks(
            onConnected = { connected++ },
            onDayInvalidation = { invalidated += it },
        ))

        manager.start()
        manager.start()
        assertEquals(1, factory.opens.get())
        factory.socket!!.open()
        assertEquals(1, connected)
        factory.socket!!.message("{\"version\":1,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"day\",\"logical_date\":\"2026-09-14\"}]}")
        scheduler.runAll()
        assertEquals(listOf("2026-09-14"), invalidated)
    }

    @Test
    fun coalescesBurstAndWildcardWins() {
        val factory = FakeSocketFactory()
        val scheduler = FakeScheduler()
        val invalidated = mutableListOf<String?>()
        val manager = manager(factory, scheduler, RealtimeConnectionCallbacks(onDayInvalidation = { invalidated += it }))
        manager.start()
        factory.socket!!.open()
        factory.socket!!.message("{\"version\":1,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"day\",\"logical_date\":\"2026-09-14\"}]}")
        factory.socket!!.message("{\"version\":1,\"type\":\"invalidate\",\"scopes\":[{\"kind\":\"day\"}]}")
        scheduler.runAll()
        assertEquals(listOf(null), invalidated)
    }

    @Test
    fun reconnectUsesBoundedJitteredBackoffAndDoesNotDuplicateSockets() {
        val factory = FakeSocketFactory()
        val scheduler = FakeScheduler()
        val manager = manager(factory, scheduler, random = { 0.5 })
        manager.start()
        factory.socket!!.failure(500)
        assertEquals(500L, scheduler.delays.single())
        scheduler.runNext()
        assertEquals(2, factory.opens.get())
        factory.socket!!.failure(500)
        assertEquals(listOf(500L, 1000L), scheduler.delays)
        manager.stop()
        assertFalse(scheduler.hasRunnable())
    }

    @Test
    fun nullFailureUsesAuthProbeAndOnly401EntersAuthBoundary() {
        val factory = FakeSocketFactory()
        val scheduler = FakeScheduler()
        var authFailure = 0
        var probeStatus: Int? = 500
        val manager = manager(
            factory,
            scheduler,
            authProbe = RealtimeAuthProbe { callback -> callback(probeStatus) },
            callbacks = RealtimeConnectionCallbacks(onAuthFailure = { authFailure++ }),
        )
        manager.start()
        factory.socket!!.failure(null)
        assertEquals(0, authFailure)
        assertTrue(scheduler.hasRunnable())
        scheduler.runNext()
        assertEquals(2, factory.opens.get())

        probeStatus = 401
        factory.socket!!.failure(null)
        assertEquals(1, authFailure)
        assertEquals(RealtimeConnectionState.AUTH_REQUIRED, manager.currentState())
    }

    @Test
    fun logoutStopsSocketAndPreventsReconnect() {
        val factory = FakeSocketFactory()
        val scheduler = FakeScheduler()
        val manager = manager(factory, scheduler)
        manager.start()
        factory.socket!!.failure(500)
        manager.stop()
        scheduler.runAll()
        assertEquals(1, factory.opens.get())
        assertEquals(RealtimeConnectionState.IDLE, manager.currentState())
    }

    @Test
    fun sessionCookieIsProvidedWithoutAssumingCookieName() {
        val factory = FakeSocketFactory()
        val scheduler = FakeScheduler()
        val manager = manager(factory, scheduler, cookie = "server-chosen-session=opaque")
        manager.start()
        assertEquals("server-chosen-session=opaque", factory.cookies.single())
    }

    private fun manager(
        factory: FakeSocketFactory,
        scheduler: FakeScheduler,
        callbacks: RealtimeConnectionCallbacks = RealtimeConnectionCallbacks(),
        authProbe: RealtimeAuthProbe? = null,
        random: () -> Double = { 0.5 },
        cookie: String = "session=opaque",
    ): RealtimeConnectionManager = RealtimeConnectionManager(
        cookieProvider = { cookie },
        socketFactory = factory,
        scheduler = scheduler,
        authProbe = authProbe,
        random = random,
        callbacks = callbacks,
    )

    private class FakeScheduler : RealtimeScheduler {
        data class Task(val delay: Long, val action: () -> Unit, var cancelled: Boolean = false)
        val tasks = mutableListOf<Task>()
        val delays: List<Long> get() = tasks.map { it.delay }

        override fun schedule(delayMillis: Long, action: () -> Unit): RealtimeCancellable {
            val task = Task(delayMillis, action)
            tasks += task
            return RealtimeCancellable { task.cancelled = true }
        }

        fun runNext() {
            val task = tasks.firstOrNull { !it.cancelled } ?: return
            task.cancelled = true
            task.action()
        }

        fun runAll() {
            while (tasks.any { !it.cancelled }) runNext()
        }

        fun hasRunnable() = tasks.any { !it.cancelled }
    }

    private class FakeSocketFactory : RealtimeSocketFactory {
        val opens = AtomicInteger()
        val cookies = mutableListOf<String>()
        var socket: FakeSocket? = null

        override fun open(cookieHeader: String, listener: RealtimeSocketListener): RealtimeSocket {
            cookies += cookieHeader
            opens.incrementAndGet()
            return FakeSocket(listener).also { socket = it }
        }
    }

    private class FakeSocket(private val listener: RealtimeSocketListener) : RealtimeSocket {
        override fun close() = Unit
        fun open() = listener.onOpen(this)
        fun message(value: String) = listener.onMessage(this, value)
        fun failure(code: Int?) = listener.onFailure(this, code)
    }
}
