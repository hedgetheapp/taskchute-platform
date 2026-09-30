package com.hedgetheapp.taskchute.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WearPairingStateMachineTest {
    private var id = 0
    private var nonce = 0

    private val machine = WearPairingStateMachine(
        requestIdFactory = { "request-${++id}" },
        nonceFactory = { "nonce-${++nonce}" },
    )

    @Test
    fun noConnectedPhoneFailsSafelyAndClearsRequestIdentity() {
        assertTrue(machine.begin())
        machine.noConnectedPhone()

        assertTrue(machine.state is WearPairingState.Error)
        assertNull(machine.pendingIdentity)
    }

    @Test
    fun sendFailureFailsSafelyAndClearsRequestIdentity() {
        val request = startRequest()
        machine.sendFailed(request.requestId)

        assertTrue(machine.state is WearPairingState.Error)
        assertNull(machine.pendingIdentity)
    }

    @Test
    fun matchingGrantBeforeTimeoutStartsExchangeAndMakesTimeoutInert() {
        val request = startRequest()

        assertTrue(machine.acceptGrant(request.nodeId, request.asGrant()))
        assertEquals(WearPairingState.Exchanging, machine.state)
        assertFalse(machine.expire(request.requestId))
    }

    @Test
    fun timeoutClearsRequestAndLateGrantCannotAuthorizeRetry() {
        val expired = startRequest()
        assertTrue(machine.expire(expired.requestId))
        assertTrue(machine.state is WearPairingState.Error)
        assertNull(machine.pendingIdentity)
        assertFalse(machine.acceptGrant(expired.nodeId, expired.asGrant()))

        assertTrue(machine.begin())
        val retry = machine.prepareRequest("phone")!!
        assertNotEquals(expired.requestId, retry.requestId)
        assertNotEquals(expired.nonce, retry.nonce)
        assertFalse(machine.acceptGrant(expired.nodeId, expired.asGrant()))
        assertTrue(machine.acceptGrant(retry.nodeId, retry.asGrant()))
    }

    @Test
    fun grantFromDifferentNodeOrRequestIsIgnored() {
        val request = startRequest()

        assertFalse(machine.acceptGrant("other-phone", request.asGrant()))
        assertFalse(machine.acceptGrant(request.nodeId, WearPairGrant("other-request", request.nonce, "grant")))
        assertFalse(machine.acceptGrant(request.nodeId, WearPairGrant(request.requestId, "other-nonce", "grant")))
        assertEquals(WearPairingState.Waiting, machine.state)
        assertTrue(machine.acceptGrant(request.nodeId, request.asGrant()))
    }

    @Test
    fun successfulAndFailedExchangeClearIdentity() {
        val successful = startRequest()
        assertTrue(machine.acceptGrant(successful.nodeId, successful.asGrant()))
        machine.exchangeFinished(success = true)
        assertEquals(WearPairingState.Idle, machine.state)
        assertNull(machine.pendingIdentity)

        startRequest()
        machine.exchangeFinished(success = false)
        assertTrue(machine.state is WearPairingState.Error)
        assertNull(machine.pendingIdentity)
    }

    @Test
    fun pairingPresentationKeepsIdleMinimalAndBusyBounded() {
        assertEquals(
            WearPairingPresentation("アプリで接続", "アプリで接続", isBusy = false),
            WearPairingState.Idle.presentation(),
        )
        listOf(WearPairingState.Sending, WearPairingState.Waiting, WearPairingState.Exchanging).forEach { state ->
            val presentation = state.presentation()
            assertEquals("アプリで接続", presentation.actionLabel)
            assertTrue(presentation.isBusy)
            assertNull(presentation.errorTitle)
        }
    }

    @Test
    fun pairingPresentationFailureProvidesSafeRetryWithoutRequestSecrets() {
        val presentation = WearPairingState.Error("ログイン済みのPhoneアプリを開いて再試行してください。")
            .presentation()

        assertEquals("再試行", presentation.actionLabel)
        assertEquals("再試行", presentation.actionContentDescription)
        assertEquals("接続できません", presentation.errorTitle)
        assertTrue(presentation.errorMessage.orEmpty().contains("Phoneアプリ"))
        assertFalse(presentation.errorMessage.orEmpty().contains("nonce"))
    }

    private fun startRequest(): WearPairingRequest {
        assertTrue(machine.begin())
        return machine.prepareRequest("phone")!!
    }

    private fun WearPairingRequest.asGrant() = WearPairGrant(requestId, nonce, "grant")
}
