package com.hedgetheapp.taskchute.wear

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WearRefreshGateTest {
    @Test
    fun invalidationBurstDuringLoadCoalescesToOneFollowUp() {
        val gate = WearRefreshGate()

        assertTrue(gate.request())
        repeat(20) { assertFalse(gate.request()) }
        assertTrue(gate.finish())
        assertFalse(gate.finish())
        assertTrue(gate.request())
        assertFalse(gate.finish())
    }

    @Test
    fun backgroundCanClearQueuedFollowUpWithoutChangingActiveLoadOwnership() {
        val gate = WearRefreshGate()

        assertTrue(gate.request())
        assertFalse(gate.request())
        gate.clearPending()
        assertFalse(gate.finish())
        assertTrue(gate.request())
        assertFalse(gate.finish())
    }
}
