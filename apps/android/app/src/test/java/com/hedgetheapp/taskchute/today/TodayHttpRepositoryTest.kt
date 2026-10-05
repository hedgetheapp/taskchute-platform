package com.hedgetheapp.taskchute.today

import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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
            diagnosticsEnabled = true,
        )

        assertEquals(TodayResult.Unauthorized, repository.loadDay())
        assertEquals("/api/v1/taskchute-days/current", requestedPath)
        assertEquals(1, handoffs)
    }

    @Test
    fun serverAndMalformedProjectionFailuresStayRetryableWithoutAuthHandoff() {
        var handoffs = 0
        val serverFailure = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(503, "unavailable") },
            onUnauthorized = { handoffs++ },
        )
        val malformedProjection = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(200, "{}") },
            onUnauthorized = { handoffs++ },
        )

        assertEquals(TodayResult.Failure("Todayを読み込めませんでした。再試行してください。"), serverFailure.loadDay())
        assertEquals(TodayResult.Failure("サーバーのTodayデータを読み取れませんでした。"), malformedProjection.loadDay())
        assertEquals(0, handoffs)
    }

    @Test
    fun debugNonprodDiagnosticClassifies503UsingOnlyCanonicalErrorCode() {
        val repository = diagnosticRepository(
            response = TodayHttpResponse(
                503,
                """{"error":{"code":"infrastructure_ambiguous","message":"private server detail","reconcile":true}}""",
            ),
        )

        val result = repository.loadDay() as TodayResult.Failure

        assertEquals("Todayを読み込めませんでした。再試行してください。", result.message)
        assertEquals("HTTP 503 / infrastructure_ambiguous", result.diagnostic)
        assertFalse(result.diagnostic.orEmpty().contains("private server detail"))
    }

    @Test
    fun malformedServerErrorReportsStatusWithoutReadingBodyDetails() {
        val result = diagnosticRepository(TodayHttpResponse(500, "not-json private detail")).loadDay() as TodayResult.Failure

        assertEquals("HTTP 500", result.diagnostic)
        assertFalse(result.diagnostic.orEmpty().contains("private detail"))
    }

    @Test
    fun malformedSuccessProjectionIsDistinctFromHttpFailure() {
        val result = diagnosticRepository(TodayHttpResponse(200, "{}")).loadDay() as TodayResult.Failure

        assertEquals("HTTP 200 / PARSE_ERROR", result.diagnostic)
    }

    @Test
    fun absentOrThrownTransportResponseUsesNetworkClassification() {
        val noResponse = diagnosticRepository(null).loadDay() as TodayResult.Failure
        val transportFailure = TodayHttpRepository(
            request = { _, _, _ -> error("transport detail must not escape") },
            onUnauthorized = {},
            diagnosticsEnabled = true,
        ).loadDay() as TodayResult.Failure

        assertEquals("NETWORK_NO_RESPONSE", noResponse.diagnostic)
        assertEquals("NETWORK_NO_RESPONSE", transportFailure.diagnostic)
        assertEquals("接続できませんでした。再試行してください。", transportFailure.message)
    }

    @Test
    fun validProjectionSucceedsAndReleaseOrNonCanonicalBuildDoesNotExposeDiagnostics() {
        val success = diagnosticRepository(TodayHttpResponse(200, VALID_PROJECTION)).loadDay()
        val productionFacing = diagnosticRepository(TodayHttpResponse(503, "{}"), enabled = false).loadDay() as TodayResult.Failure

        assertTrue(success is TodayResult.Success)
        assertNull(productionFacing.diagnostic)
        assertTrue(shouldExposeTodayDiagnostic(true, CANONICAL_NONPROD_URL))
        assertFalse(shouldExposeTodayDiagnostic(false, CANONICAL_NONPROD_URL))
        assertFalse(shouldExposeTodayDiagnostic(true, "https://taskchute.example"))
        assertFalse(shouldExposeTodayDiagnostic(true, "$CANONICAL_NONPROD_URL/unexpected"))
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
        assertTrue(!body.contains("input_precision"))
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
        const val CANONICAL_NONPROD_URL = "https://taskchute-web-nonprod.taskfulness-sync.workers.dev"
        const val VALID_PROJECTION = """
            {"taskchute_day":{"id":"day-1","logical_date":"2026-10-05"},"is_current":true,
            "planning_enabled":true,"placement_revision":0,"sections":[],"unsectioned_entries":[],"active_execution":null}
        """

        fun diagnosticRepository(response: TodayHttpResponse?, enabled: Boolean = true) = TodayHttpRepository(
            request = { _, _, _ -> response },
            onUnauthorized = {},
            diagnosticsEnabled = enabled,
        )

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
