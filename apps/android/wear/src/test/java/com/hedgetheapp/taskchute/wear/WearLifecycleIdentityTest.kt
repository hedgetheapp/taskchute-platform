package com.hedgetheapp.taskchute.wear

import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WearLifecycleIdentityTest {
    @Test
    fun startUsesUuidV7ForOperationAndExecutionAndRetainsPlacementRevision() {
        val request = newWearStartRequest("entry-1", placementRevision = 27)

        assertUuidV7(request.operationId)
        assertUuidV7(request.executionId)
        assertNotEquals(request.operationId, request.executionId)
        assertEquals("entry-1", request.entryId)
        assertEquals(27, request.expectedPlacementRevision)
    }

    @Test
    fun completeUsesUuidV7OperationAndPreservesCanonicalExecutionIdentity() {
        val request = newWearCompleteRequest("entry-2", "0199aabb-ccdd-7eef-8123-456789abcdef")

        assertUuidV7(request.operationId)
        assertEquals("entry-2", request.entryId)
        assertEquals("0199aabb-ccdd-7eef-8123-456789abcdef", request.executionId)
    }

    private fun assertUuidV7(value: String) {
        val parsed = UUID.fromString(value)
        assertEquals(7, parsed.version())
        assertEquals(2, parsed.variant())
        assertTrue(value.matches(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))
    }
}
