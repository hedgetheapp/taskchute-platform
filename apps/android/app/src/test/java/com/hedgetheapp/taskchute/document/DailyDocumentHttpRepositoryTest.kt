package com.hedgetheapp.taskchute.document

import com.hedgetheapp.taskchute.today.TodayHttpResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DailyDocumentHttpRepositoryTest {
    @Test
    fun listParsesEstablishedDaysWithoutCreatingDocuments() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = DailyDocumentHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, """{"days":[{"taskchute_day_id":"day-1","logical_date":"2026-09-23","document_id":null}]}""")
            },
        )

        val result = repository.listDaily() as DailyListResult.Success

        assertEquals("day-1", result.days.single().taskchuteDayId)
        assertEquals(null, result.days.single().documentId)
        assertEquals(Triple("GET", "/api/v1/daily-primary-documents", null), requests.single())
    }

    @Test
    fun ensureAndUpdateUseExplicitRoutesAndCasPayload() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val documentJson = """{"document":{"document_id":"doc-1","kind":"daily_primary","taskchute_day_id":"day-1","logical_date":"2026-09-23","markdown_body":"本文","revision":1,"created_at":"2026-09-23T00:00:00Z","updated_at":"2026-09-23T00:01:00Z"}}"""
        val repository = DailyDocumentHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, documentJson)
            },
        )

        assertTrue(repository.ensureDaily(DailyEnsureRequest("op-1", "day-1", "doc-1")) is DailyResult.Success)
        assertTrue(repository.updateDaily(DailyUpdateRequest("op-2", "day-1", "doc-1", 1, "本文 😀")) is DailyResult.Success)

        assertEquals("POST", requests[0].first)
        assertEquals("/api/v1/taskchute-days/day-1/daily-primary-document", requests[0].second)
        assertTrue(requests[0].third.orEmpty().contains("\"taskchute_day_id\":\"day-1\""))
        assertEquals("/api/v1/daily-primary-documents/doc-1", requests[1].second)
        assertTrue(requests[1].third.orEmpty().contains("\"expected_revision\":1"))
        assertTrue(requests[1].third.orEmpty().contains("本文 😀"))
    }

    @Test
    fun ambiguousAndUnauthorizedResponsesKeepCanonicalBoundaries() {
        var unauthorized = 0
        val unauthorizedRepository = DailyDocumentHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(401, null) },
            onUnauthorized = { unauthorized++ },
        )
        assertEquals(DailyResult.Unauthorized, unauthorizedRepository.fetchDaily("doc-1"))
        assertEquals(1, unauthorized)

        val ambiguousRepository = DailyDocumentHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(503, """{"error":{"code":"infrastructure_ambiguous"}}""") },
        )
        assertTrue(ambiguousRepository.updateDaily(DailyUpdateRequest("op-2", "day-1", "doc-1", 0, "body")) is DailyResult.Ambiguous)
    }
}
