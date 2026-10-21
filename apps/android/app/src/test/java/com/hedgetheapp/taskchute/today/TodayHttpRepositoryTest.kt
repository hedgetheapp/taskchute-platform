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
                TodayHttpResponse(200, START_RESULT_NO_MOVE)
            },
            onUnauthorized = {},
        )

        assertEquals(TodayMutationResult.SuccessWithRevision(null), repository.startTask(plannedTask(), 7))
        assertEquals("POST", method)
        assertEquals("/api/v1/entries/entry-1/start", path)
        assertTrue(body.contains("\"entry_id\":\"entry-1\""))
        assertTrue(body.contains("\"expected_placement_revision\":7"))
        assertTrue(body.contains("\"operation_id\":\""))
        assertTrue(body.contains("\"execution_id\":\""))
        assertTrue(!body.contains("input_precision"))
    }

    @Test
    fun startRetainsCanonicalPlacementRevisionWhenActualSectionChanges() {
        val repository = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(200, START_RESULT_MOVED) },
            onUnauthorized = {},
        )

        assertEquals(TodayMutationResult.SuccessWithRevision(8), repository.startTask(plannedTask(), 7))
    }

    @Test
    fun malformedStartSuccessFailsClosedWhenRevisionHandoffIsMissing() {
        val repository = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(200, START_RESULT_NO_REVISION) },
            onUnauthorized = {},
        )

        assertTrue(repository.startTask(plannedTask(), 7) is TodayMutationResult.Failure)
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
    fun crossDayRunningPresentationUsesExistingCompleteEntryAndExecutionIdentity() {
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
        val crossDayRunningTask = TodayTask(
            id = "entry-from-origin-day",
            title = "Cross-day task",
            lifecycleState = LifecycleState.RUNNING,
            project = null,
            mode = null,
            estimateSeconds = 900,
            plannedStartMinute = null,
            executionId = "execution-cross-day",
            activeStartedAt = "2026-10-04T23:50:00Z",
        )

        assertEquals(TodayMutationResult.Success, repository.completeTask(crossDayRunningTask))
        assertEquals("POST", method)
        assertEquals("/api/v1/entries/entry-from-origin-day/complete", path)
        assertTrue(body.contains("\"entry_id\":\"entry-from-origin-day\""))
        assertTrue(body.contains("\"execution_id\":\"execution-cross-day\""))
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

    @Test
    fun interruptUsesD073ContractAndKeepsExactPayloadForReplay() {
        val requests = mutableListOf<Triple<String, String, String>>()
        val repository = TodayHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body.orEmpty())
                TodayHttpResponse(200, interruptResult(INTERRUPT_REQUEST))
            },
            onUnauthorized = {},
        )

        assertEquals(TodayInterruptResult.Confirmed(8), repository.interruptTask(INTERRUPT_REQUEST))
        assertEquals(TodayInterruptResult.Confirmed(8), repository.interruptTask(INTERRUPT_REQUEST))
        assertEquals(2, requests.size)
        assertEquals("POST", requests.first().first)
        assertEquals("/api/v1/entries/source-entry/interrupt", requests.first().second)
        assertEquals(requests.first().third, requests.last().third)
        assertTrue(requests.first().third.contains("\"operation_id\":\"operation-1\""))
        assertTrue(requests.first().third.contains("\"active_execution_id\":\"execution-a\""))
        assertTrue(requests.first().third.contains("\"target_execution_id\":\"execution-b\""))
        assertTrue(requests.first().third.contains("\"continuation_entry_id\":\"continuation-a\""))
        assertTrue(requests.first().third.contains("\"expected_placement_revision\":7"))
    }

    @Test
    fun interruptSeparatesAmbiguousOutcomeFromDeterministicRejection() {
        val ambiguous = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(503, """{"error":{"code":"infrastructure_ambiguous","message":"private","reconcile":true}}""") },
            onUnauthorized = {},
        )
        val stale = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(409, """{"error":{"code":"revision_conflict","message":"stale"}}""") },
            onUnauthorized = {},
        )
        val malformedSuccess = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(200, "{}") },
            onUnauthorized = {},
        )

        assertTrue(ambiguous.interruptTask(INTERRUPT_REQUEST) is TodayInterruptResult.Ambiguous)
        assertEquals("revision_conflict", (stale.interruptTask(INTERRUPT_REQUEST) as TodayInterruptResult.Rejected).code)
        assertTrue(malformedSuccess.interruptTask(INTERRUPT_REQUEST) is TodayInterruptResult.Ambiguous)
    }

    @Test
    fun quickInterruptUsesDedicatedCurrentDayCommandAndReplaysTheExactPayload() {
        val requests = mutableListOf<Triple<String, String, String>>()
        val repository = TodayHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body.orEmpty())
                TodayHttpResponse(200, quickInterruptResult(QUICK_INTERRUPT_REQUEST))
            },
            onUnauthorized = {},
        )

        assertEquals(TodayQuickInterruptResult.Confirmed(8), repository.quickInterruptTask(QUICK_INTERRUPT_REQUEST))
        assertEquals(TodayQuickInterruptResult.Confirmed(8), repository.quickInterruptTask(QUICK_INTERRUPT_REQUEST))
        assertEquals(2, requests.size)
        assertEquals("POST", requests.first().first)
        assertEquals("/api/v1/taskchute-days/current/quick-interrupt", requests.first().second)
        assertEquals(requests.first().third, requests.last().third)
        assertTrue(requests.first().third.contains("\"operation_id\":\"quick-operation-1\""))
        assertTrue(requests.first().third.contains("\"quick_task_id\":\"quick-task-1\""))
        assertTrue(requests.first().third.contains("\"source_entry_id\":\"source-entry\""))
        assertTrue(requests.first().third.contains("\"continuation_entry_id\":\"continuation-a\""))
        assertTrue(requests.first().third.contains("\"expected_placement_revision\":7"))
    }

    @Test
    fun quickInterruptSeparatesAmbiguousOutcomeFromDeterministicRejectionAndValidatesResponse() {
        var handoffs = 0
        val ambiguous = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(503, """{"error":{"code":"infrastructure_ambiguous","message":"private","reconcile":true}}""") },
            onUnauthorized = {},
        )
        val stale = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(409, """{"error":{"code":"revision_conflict","message":"stale"}}""") },
            onUnauthorized = {},
        )
        val malformed = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(200, quickInterruptResult(QUICK_INTERRUPT_REQUEST).replace("quick-task-1", "wrong-task")) },
            onUnauthorized = {},
        )
        val unauthorized = TodayHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(401, null) },
            onUnauthorized = { handoffs++ },
        )

        assertTrue(ambiguous.quickInterruptTask(QUICK_INTERRUPT_REQUEST) is TodayQuickInterruptResult.Ambiguous)
        assertEquals("revision_conflict", (stale.quickInterruptTask(QUICK_INTERRUPT_REQUEST) as TodayQuickInterruptResult.Rejected).code)
        assertTrue(malformed.quickInterruptTask(QUICK_INTERRUPT_REQUEST) is TodayQuickInterruptResult.Ambiguous)
        assertEquals(TodayQuickInterruptResult.Unauthorized, unauthorized.quickInterruptTask(QUICK_INTERRUPT_REQUEST))
        assertEquals(1, handoffs)
    }

    private companion object {
        const val CANONICAL_NONPROD_URL = "https://taskchute-web-nonprod.taskfulness-sync.workers.dev"
        val INTERRUPT_REQUEST = TodayInterruptEntryRequest(
            operationId = "operation-1",
            taskChuteDayId = "day-1",
            sourceEntryId = "source-entry",
            activeExecutionId = "execution-a",
            targetEntryId = "target-entry",
            targetExecutionId = "execution-b",
            continuationEntryId = "continuation-a",
            expectedPlacementRevision = 7,
        )
        val QUICK_INTERRUPT_REQUEST = TodayQuickInterruptRequest(
            operationId = "quick-operation-1",
            taskChuteDayId = "day-1",
            sourceEntryId = "source-entry",
            activeExecutionId = "execution-a",
            quickTaskId = "quick-task-1",
            targetEntryId = "target-entry",
            targetExecutionId = "execution-b",
            continuationEntryId = "continuation-a",
            expectedPlacementRevision = 7,
        )
        const val VALID_PROJECTION = """
            {"taskchute_day":{"id":"day-1","logical_date":"2026-10-05"},"is_current":true,
            "planning_enabled":true,"placement_revision":0,"sections":[],"unsectioned_entries":[],"active_execution":null}
        """
        const val START_RESULT_NO_MOVE = """
            {"entry_id":"entry-1","lifecycle_state":"running","execution":{"id":"execution-1","entry_id":"entry-1","started_at":"2026-09-14T09:00:00Z","ended_at":null},"section_id":"section-1","placement_revision":null}
        """
        const val START_RESULT_MOVED = """
            {"entry_id":"entry-1","lifecycle_state":"running","execution":{"id":"execution-1","entry_id":"entry-1","started_at":"2026-09-14T09:00:00Z","ended_at":null},"section_id":"section-2","placement_revision":8}
        """
        const val START_RESULT_NO_REVISION = """
            {"entry_id":"entry-1","lifecycle_state":"running","execution":{"id":"execution-1","entry_id":"entry-1","started_at":"2026-09-14T09:00:00Z","ended_at":null},"section_id":"section-2"}
        """

        fun diagnosticRepository(response: TodayHttpResponse?, enabled: Boolean = true) = TodayHttpRepository(
            request = { _, _, _ -> response },
            onUnauthorized = {},
            diagnosticsEnabled = enabled,
        )

        fun interruptResult(request: TodayInterruptEntryRequest) = """
            {"taskchute_day_id":"${request.taskChuteDayId}","source_entry_id":"${request.sourceEntryId}","target_entry_id":"${request.targetEntryId}","continuation_entry_id":"${request.continuationEntryId}","interruption_instant":"2026-09-14T09:01:00Z","interruption_logical_minute":541,"placement_revision":${request.expectedPlacementRevision + 1},"source_execution":{"id":"${request.activeExecutionId}","entry_id":"${request.sourceEntryId}","started_at":"2026-09-14T09:00:00Z","ended_at":"2026-09-14T09:01:00Z","outcome":"interrupted"},"target_execution":{"id":"${request.targetExecutionId}","entry_id":"${request.targetEntryId}","started_at":"2026-09-14T09:01:00Z","ended_at":null,"outcome":null},"continuation":{"entry_id":"${request.continuationEntryId}","task_id":"task-a","section_id":"section-1","position":2,"planned_start_minute":541,"estimate_seconds":540}}
        """.trimIndent()

        fun quickInterruptResult(request: TodayQuickInterruptRequest) = """
            {"taskchute_day_id":"${request.taskChuteDayId}","source_entry_id":"${request.sourceEntryId}","quick_task_id":"${request.quickTaskId}","quick_interrupt_origin":"quick_interrupt","target_entry_id":"${request.targetEntryId}","target_execution_id":"${request.targetExecutionId}","continuation_entry_id":"${request.continuationEntryId}","interruption_instant":"2026-09-14T09:01:00Z","section_id":"section-1","placement_revision":${request.expectedPlacementRevision + 1},"source_execution":{"id":"${request.activeExecutionId}","entry_id":"${request.sourceEntryId}","started_at":"2026-09-14T09:00:00Z","ended_at":"2026-09-14T09:01:00Z","outcome":"interrupted"},"target_execution":{"id":"${request.targetExecutionId}","entry_id":"${request.targetEntryId}","started_at":"2026-09-14T09:01:00Z","ended_at":null},"continuation":{"entry_id":"${request.continuationEntryId}","task_id":"task-a","section_id":"section-1","position":2,"planned_start_minute":null,"estimate_seconds":540}}
        """.trimIndent()

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
