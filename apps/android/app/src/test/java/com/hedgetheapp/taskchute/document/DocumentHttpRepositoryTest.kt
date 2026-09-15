package com.hedgetheapp.taskchute.document

import com.hedgetheapp.taskchute.today.TodayHttpResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DocumentHttpRepositoryTest {
    @Test
    fun listParsesCanonicalStandaloneSummaries() {
        val repository = repository { _, _, _ ->
            TodayHttpResponse(200, """{"documents":[{"document_id":"doc-1","title":"新しいノート","revision":2,"updated_at":"2026-09-15T00:00:00Z"}]}""")
        }

        val result = repository.listStandalone() as DocumentListResult.Success

        assertEquals("doc-1", result.documents.single().documentId)
        assertEquals("新しいノート", result.documents.single().title)
        assertEquals(2, result.documents.single().revision)
    }

    @Test
    fun createAndUpdateKeepCanonicalJsonFieldsAndEscaping() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = DocumentHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, documentResponse("doc-1", "保存済み", "# 日本語 😀", 1))
            },
        )

        repository.createStandalone(StandaloneCreateRequest("op-1", "doc-1", "タイトル\"", "# 日本語 😀"))
        repository.updateStandalone(StandaloneUpdateRequest("op-2", "doc-1", 1, "タイトル", "本文"))

        assertEquals("/api/v1/documents", requests[0].second)
        assertTrue(requests[0].third.orEmpty().contains("\\\""))
        assertTrue(requests[0].third.orEmpty().contains("\"markdown_body\":\"# 日本語 😀\""))
        assertTrue(requests[1].third.orEmpty().contains("\"expected_revision\":1"))
        assertEquals("/api/v1/documents/doc-1", requests[1].second)
    }

    @Test
    fun unauthorizedIsReportedAndInvokesAuthBoundary() {
        var unauthorized = 0
        val repository = DocumentHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(401, null) },
            onUnauthorized = { unauthorized++ },
        )

        assertEquals(DocumentResult.Unauthorized, repository.fetchStandalone("doc-1"))
        assertEquals(1, unauthorized)
    }

    @Test
    fun networkAndServiceUnavailableMutationRetainAmbiguousBoundary() {
        val networkRepository = repository { _, _, _ -> null }
        assertTrue(networkRepository.createStandalone(StandaloneCreateRequest("op-1", "doc-1", "title", "body")) is DocumentResult.Ambiguous)

        val serviceRepository = repository { _, _, _ -> TodayHttpResponse(503, null) }
        assertTrue(serviceRepository.updateStandalone(StandaloneUpdateRequest("op-2", "doc-1", 0, "title", "body")) is DocumentResult.Ambiguous)
    }

    private fun repository(request: (String, String, String?) -> TodayHttpResponse?) = DocumentHttpRepository(request)

    private fun documentResponse(id: String, title: String, body: String, revision: Int): String =
        """{"document":{"document_id":"$id","kind":"standalone","title":"$title","markdown_body":"$body","revision":$revision,"created_at":"2026-09-15T00:00:00Z","updated_at":"2026-09-15T00:00:00Z"}}"""
}
