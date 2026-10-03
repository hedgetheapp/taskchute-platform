package com.hedgetheapp.taskchute.wear

import androidx.work.ExistingWorkPolicy
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WearPushProtocolTest {
    @Test
    fun acceptsOnlyTheExactDataOnlyInvalidationMessage() {
        assertTrue(WearPushMessage.isRunningProjectionInvalidation(
            mapOf("type" to "running_projection_invalidated"),
        ))
        assertFalse(WearPushMessage.isRunningProjectionInvalidation(
            mapOf("type" to "running_projection_invalidated", "title" to "private content"),
        ))
        assertFalse(WearPushMessage.isRunningProjectionInvalidation(mapOf("type" to "unknown")))
        assertFalse(WearPushMessage.isRunningProjectionInvalidation(emptyMap()))
    }

    @Test
    fun installationIdentityAcceptsCanonicalUuidV7Only() {
        assertTrue(WearInstallationIdStore.isUuidV7("0199f2d1-2a00-7abc-8def-0123456789ab"))
        assertFalse(WearInstallationIdStore.isUuidV7("0199f2d1-2a00-4abc-8def-0123456789ab"))
        assertFalse(WearInstallationIdStore.isUuidV7("not-an-id"))
    }

    @Test
    fun invalidationWorkReplacesPendingWorkInsteadOfBuildingAnUnboundedQueue() {
        assertTrue(WearPushWork.invalidationCoalescingPolicy == ExistingWorkPolicy.REPLACE)
    }

    @Test
    fun backgroundRetriesStopAfterTheBoundedAttemptCount() {
        assertTrue(WearPushWork.shouldRetry(0))
        assertTrue(WearPushWork.shouldRetry(4))
        assertFalse(WearPushWork.shouldRetry(5))
        assertFalse(WearPushWork.shouldRetry(50))
    }

    @Test
    fun registrationResponseRequiresCommittedSuccessAndRetriesOnlyTransientOutcomes() {
        assertEquals(WearPushRegistrationResult.Success,
            classifyWearPushRegistrationResponse(200, true))
        assertEquals(WearPushRegistrationResult.Rejected,
            classifyWearPushRegistrationResponse(200, false))
        assertEquals(WearPushRegistrationResult.Unauthorized,
            classifyWearPushRegistrationResponse(401, false))
        assertEquals(WearPushRegistrationResult.Retry,
            classifyWearPushRegistrationResponse(503, false))
        assertEquals(WearPushRegistrationResult.Retry,
            classifyWearPushRegistrationResponse(null, false))
    }
}
