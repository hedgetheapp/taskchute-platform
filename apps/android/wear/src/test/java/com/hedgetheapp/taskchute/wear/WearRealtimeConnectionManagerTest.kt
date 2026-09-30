package com.hedgetheapp.taskchute.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WearRealtimeConnectionManagerTest {
    @Test
    fun foregroundConnectsOnceAndBackgroundStopsWithoutReconnect() {
        val scheduler = FakeScheduler()
        val factory = FakeSocketFactory()
        val manager = manager(scheduler, factory)

        manager.start()
        manager.start()
        assertEquals(1, factory.sockets.size)
        assertEquals(listOf("watch_session=opaque"), factory.cookies)

        manager.stop()
        scheduler.runCurrent()
        scheduler.advanceBy(60_000)
        assertTrue(factory.sockets.single().closed)
        assertEquals(1, factory.sockets.size)

        manager.start()
        assertEquals(2, factory.sockets.size)
    }

    @Test
    fun transientFailureReconnectsOnlyWhileForegroundAndRetainsWatchCookie() {
        val scheduler = FakeScheduler()
        val factory = FakeSocketFactory()
        val manager = manager(scheduler, factory)
        manager.start()

        factory.sockets.single().fail(responseCode = null)
        scheduler.runCurrent()
        scheduler.advanceBy(499)
        assertEquals(1, factory.sockets.size)
        scheduler.advanceBy(1)
        assertEquals(2, factory.sockets.size)
        assertEquals(listOf("watch_session=opaque", "watch_session=opaque"), factory.cookies)

        manager.stop()
        scheduler.advanceBy(60_000)
        assertEquals(2, factory.sockets.size)
    }

    @Test
    fun unauthorizedHandshakeDoesNotReconnectAndNotifiesOnce() {
        val scheduler = FakeScheduler()
        val factory = FakeSocketFactory()
        var unauthorized = 0
        val manager = manager(scheduler, factory, onUnauthorized = { unauthorized += 1 })
        manager.start()

        factory.sockets.single().fail(responseCode = 401)
        scheduler.runCurrent()
        scheduler.advanceBy(60_000)

        assertEquals(1, unauthorized)
        assertEquals(1, factory.sockets.size)
    }

    @Test
    fun dayInvalidationBurstCoalescesAndDifferentDatesBecomeWildcard() {
        val scheduler = FakeScheduler()
        val factory = FakeSocketFactory()
        val dates = mutableListOf<String?>()
        val manager = manager(scheduler, factory, onInvalidation = dates::add)
        manager.start()
        val socket = factory.sockets.single()

        socket.message("2026-10-01")
        socket.message("2026-10-01")
        socket.message("2026-10-02")
        scheduler.runCurrent()
        scheduler.advanceBy(49)
        assertTrue(dates.isEmpty())
        scheduler.advanceBy(1)

        assertEquals(listOf(null), dates)
    }

    @Test
    fun callbacksFromStoppedSocketCannotInvalidateResumedSession() {
        val scheduler = FakeScheduler()
        val factory = FakeSocketFactory()
        val dates = mutableListOf<String?>()
        val manager = manager(scheduler, factory, onInvalidation = dates::add)
        manager.start()
        val stale = factory.sockets.single()
        manager.stop()
        manager.start()

        stale.message("2026-10-01")
        scheduler.runCurrent()
        scheduler.advanceBy(100)

        assertEquals(2, factory.sockets.size)
        assertFalse(stale === factory.sockets.last())
        assertTrue(dates.isEmpty())
    }

    private fun manager(
        scheduler: FakeScheduler,
        factory: FakeSocketFactory,
        onInvalidation: (String?) -> Unit = {},
        onUnauthorized: () -> Unit = {},
    ) = WearRealtimeConnectionManager(
        cookieProvider = { "watch_session=opaque" },
        socketFactory = factory,
        scheduler = scheduler,
        random = { 0.5 },
        callbacks = WearRealtimeCallbacks(onDayInvalidation = onInvalidation, onUnauthorized = onUnauthorized),
        parseInvalidation = { message ->
            when {
                message == "wildcard" -> listOf(null)
                message.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$")) -> listOf(message)
                else -> null
            }
        },
    )

    private class FakeSocketFactory : WearRealtimeSocketFactory {
        val cookies = mutableListOf<String>()
        val sockets = mutableListOf<FakeSocket>()

        override fun open(cookieHeader: String, listener: WearRealtimeSocketListener): WearRealtimeSocket {
            cookies += cookieHeader
            return FakeSocket(listener).also(sockets::add)
        }
    }

    private class FakeSocket(private val listener: WearRealtimeSocketListener) : WearRealtimeSocket {
        var closed = false
            private set

        override fun close() {
            closed = true
            listener.onClosed(this)
        }

        fun message(value: String) = listener.onMessage(this, value)
        fun fail(responseCode: Int?) = listener.onFailure(this, responseCode)
    }

    private class FakeScheduler : WearRealtimeScheduler {
        private data class Ticket(
            val atMillis: Long,
            val sequence: Long,
            val action: () -> Unit,
            var cancelled: Boolean = false,
        ) : WearRealtimeCancellable {
            override fun cancel() {
                cancelled = true
            }
        }

        private val tickets = mutableListOf<Ticket>()
        private var nowMillis = 0L
        private var sequence = 0L

        override fun schedule(delayMillis: Long, action: () -> Unit): WearRealtimeCancellable {
            return Ticket(nowMillis + delayMillis, sequence++, action).also(tickets::add)
        }

        fun runCurrent() = advanceBy(0)

        fun advanceBy(deltaMillis: Long) {
            val target = nowMillis + deltaMillis
            while (true) {
                val next = tickets.asSequence()
                    .filter { !it.cancelled && it.atMillis <= target }
                    .minWithOrNull(compareBy<Ticket> { it.atMillis }.thenBy { it.sequence })
                    ?: break
                tickets.remove(next)
                nowMillis = next.atMillis
                if (!next.cancelled) next.action()
            }
            nowMillis = target
        }
    }
}
