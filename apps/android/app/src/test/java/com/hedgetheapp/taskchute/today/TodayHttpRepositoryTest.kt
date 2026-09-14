package com.hedgetheapp.taskchute.today

import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayHttpRepositoryTest {
    @Test
    fun unauthorizedReadTriggersAuthHandoff() {
        var handoffs = 0
        var requestedPath = ""
        val repository = TodayHttpRepository(
            request = { _, path, _ -> requestedPath = path; TodayHttpResponse(401, "{}").also { } },
            onUnauthorized = { handoffs++ },
        )

        assertEquals(TodayResult.Unauthorized, repository.loadDay())
        assertEquals("/api/v1/taskchute-days/current", requestedPath)
        assertEquals(1, handoffs)
    }

    @Test
    fun startUsesExistingEntryAndPlacementContract() {
        var method = ""
        var path = ""
        var body = ""
        val repository = TodayHttpRepository(
            request = { requestMethod, requestPath, requestBody ->
                method = requestMethod
                path = requestPath
                body = requestBody.orEmpty()
                TodayHttpResponse(204, null)
            },
            onUnauthorized = {},
        )

        assertEquals(TodayMutationResult.Success, repository.startTask(plannedTask(), 7))
        assertEquals("POST", method)
        assertEquals("/api/v1/entries/entry-1/start", path)
        assertTrue(body.contains("\"entry_id\":\"entry-1\""))
        assertTrue(body.contains("\"expected_placement_revision\":7"))
        assertTrue(body.contains("\"operation_id\":\""))
        assertTrue(body.contains("\"execution_id\":\""))
    }

    @Test
    fun completeWithoutExecutionDoesNotSendRequest() {
        val requests = AtomicInteger()
        val repository = TodayHttpRepository(
            request = { _, _, _ -> requests.incrementAndGet(); TodayHttpResponse(204, null) },
            onUnauthorized = {},
        )

        val result = repository.completeTask(plannedTask())

        assertTrue(result is TodayMutationResult.Failure)
        assertEquals(0, requests.get())
    }

    @Test
    fun dateReadUsesCanonicalLogicalDateQuery() {
        var path = ""
        val repository = TodayHttpRepository(
            request = { _, requestPath, _ -> path = requestPath; TodayHttpResponse(401, null) },
            onUnauthorized = {},
        )

        repository.loadDay("2026-09-14")

        assertEquals("/api/v1/taskchute-days/by-logical-date?logical_date=2026-09-14", path)
    }

    private companion object {
        fun plannedTask() = TodayTask(
            id = "entry-1",
            title = "Task",
            lifecycleState = LifecycleState.PLANNED,
            project = null,
            mode = null,
            estimateSeconds = 600,
            plannedStartMinute = 540,
            executionId = null,
            activeStartedAt = null,
        )
    }
}
