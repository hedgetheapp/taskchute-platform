package com.hedgetheapp.taskchute

import com.hedgetheapp.taskchute.auth.AuthSessionCoordinator
import com.hedgetheapp.taskchute.auth.AuthTransport
import com.hedgetheapp.taskchute.auth.AuthTransportResult
import com.hedgetheapp.taskchute.auth.AuthUiState
import com.hedgetheapp.taskchute.auth.SessionCredential
import com.hedgetheapp.taskchute.auth.SessionStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthControllerTest {
    @Test
    fun startsInRestoringAndFirstRestoreActuallyRuns() {
        val transport = ControlledTransport()
        val recorder = StateRecorder()
        val controller = controller(transport, recorder = recorder)

        assertEquals(AuthUiState.Restoring, controller.state)
        controller.restore()

        assertTrue(transport.restoreStarted.await(2, TimeUnit.SECONDS))
        assertEquals(1, transport.restoreCalls.get())
        transport.releaseRestore()
        assertTrue(recorder.await(AuthUiState.SignedIn()))
        controller.close()
    }

    @Test
    fun firstRestoreWithoutSavedSessionCompletesSignedOut() {
        val transport = ControlledTransport()
        val recorder = StateRecorder()
        val controller = controller(transport, FakeStore(), recorder)

        controller.restore()

        assertTrue(recorder.await(AuthUiState.SignedOut()))
        assertEquals(0, transport.restoreCalls.get())
        controller.close()
    }

    @Test
    fun firstRestoreWithValidSavedSessionCompletesSignedIn() {
        val transport = ControlledTransport()
        val recorder = StateRecorder()
        val controller = controller(transport, FakeStore(SAVED_SESSION), recorder)

        controller.restore()

        assertTrue(transport.restoreStarted.await(2, TimeUnit.SECONDS))
        transport.releaseRestore()
        assertTrue(recorder.await(AuthUiState.SignedIn()))
        controller.close()
    }

    @Test
    fun duplicateRestoreWhileInFlightIsSuppressed() {
        val transport = ControlledTransport()
        val recorder = StateRecorder()
        val controller = controller(transport, FakeStore(SAVED_SESSION), recorder)

        controller.restore()
        assertTrue(transport.restoreStarted.await(2, TimeUnit.SECONDS))
        controller.restore()

        assertEquals(1, transport.restoreCalls.get())
        transport.releaseRestore()
        assertTrue(recorder.await(AuthUiState.SignedIn()))
        controller.close()
    }

    @Test
    fun retryFromNetworkErrorStartsANewRestore() {
        val transport = ControlledTransport().apply { restoreResult = AuthTransportResult.TransientFailure() }
        val recorder = StateRecorder()
        val controller = controller(transport, FakeStore(SAVED_SESSION), recorder)

        controller.restore()
        transport.releaseRestore()
        assertTrue(recorder.await { it is AuthUiState.NetworkError })
        assertEquals(1, transport.restoreCalls.get())

        transport.restoreResult = AuthTransportResult.Authenticated(SAVED_SESSION)
        controller.retry()

        assertTrue(recorder.await(AuthUiState.SignedIn()))
        assertEquals(2, transport.restoreCalls.get())
        controller.close()
    }

    @Test
    fun signInIsBlockedWhileRestoreIsActive() {
        val transport = ControlledTransport()
        val recorder = StateRecorder()
        val controller = controller(transport, FakeStore(SAVED_SESSION), recorder)

        controller.restore()
        assertTrue(transport.restoreStarted.await(2, TimeUnit.SECONDS))
        controller.signIn("user@example.test", "password")

        assertEquals(0, transport.signInCalls.get())
        transport.releaseRestore()
        assertTrue(recorder.await(AuthUiState.SignedIn()))
        controller.close()
    }

    @Test
    fun signOutIsBlockedWhileRestoreIsActive() {
        val transport = ControlledTransport()
        val recorder = StateRecorder()
        val controller = controller(transport, FakeStore(SAVED_SESSION), recorder)

        controller.restore()
        assertTrue(transport.restoreStarted.await(2, TimeUnit.SECONDS))
        controller.signOut()

        assertEquals(0, transport.signOutCalls.get())
        transport.releaseRestore()
        assertTrue(recorder.await(AuthUiState.SignedIn()))
        controller.close()
    }

    @Test
    fun blockingRestoreRunsOffMainThread() {
        val transport = ControlledTransport()
        val recorder = StateRecorder()
        val controller = controller(transport, FakeStore(SAVED_SESSION), recorder)

        controller.restore()
        assertTrue(transport.restoreStarted.await(2, TimeUnit.SECONDS))

        assertFalse(transport.restoreThreadName.contains("main", ignoreCase = true))
        transport.releaseRestore()
        assertTrue(recorder.await(AuthUiState.SignedIn()))
        controller.close()
    }

    private fun controller(
        transport: ControlledTransport,
        store: SessionStore = FakeStore(SAVED_SESSION),
        recorder: StateRecorder = StateRecorder(),
    ): AuthController {
        return AuthController(
            coordinator = AuthSessionCoordinator(transport, store),
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
            stateObserver = recorder::record,
        ).also { recorder.controller = it }
    }

    private class StateRecorder {
        lateinit var controller: AuthController
        private val states = mutableListOf<AuthUiState>()

        @Synchronized
        fun record(state: AuthUiState) {
            states += state
            (this as java.lang.Object).notifyAll()
        }

        fun await(expected: AuthUiState): Boolean = await { it == expected }

        fun await(predicate: (AuthUiState) -> Boolean): Boolean {
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
            synchronized(this) {
                while (states.none(predicate)) {
                    val remaining = deadline - System.nanoTime()
                    if (remaining <= 0) return false
                    TimeUnit.NANOSECONDS.timedWait(this, remaining)
                }
                return true
            }
        }
    }

    private class ControlledTransport : AuthTransport {
        val restoreCalls = AtomicInteger()
        val signInCalls = AtomicInteger()
        val signOutCalls = AtomicInteger()
        val restoreStarted = CountDownLatch(1)
        private val restoreRelease = CountDownLatch(1)
        var restoreResult: AuthTransportResult = AuthTransportResult.Authenticated(SAVED_SESSION)
        var restoreThreadName: String = ""

        override fun signIn(email: String, password: String): AuthTransportResult {
            signInCalls.incrementAndGet()
            return AuthTransportResult.Authenticated(SAVED_SESSION)
        }

        override fun restoreSession(session: SessionCredential): AuthTransportResult {
            restoreCalls.incrementAndGet()
            restoreThreadName = Thread.currentThread().name
            restoreStarted.countDown()
            restoreRelease.await(2, TimeUnit.SECONDS)
            return restoreResult
        }

        override fun signOut(): AuthTransportResult {
            signOutCalls.incrementAndGet()
            return AuthTransportResult.Unauthorized
        }

        override fun useSession(session: SessionCredential) = Unit
        override fun currentSession(): SessionCredential? = SAVED_SESSION
        override fun clearSession() = Unit

        fun releaseRestore() = restoreRelease.countDown()
    }

    private class FakeStore(initial: SessionCredential? = null) : SessionStore {
        private var session = initial
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
        val SAVED_SESSION = SessionCredential(mapOf("session" to "value"))
    }
}
