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
    fun listParsesStandaloneAndProjectPrimarySummaries() {
        val repository = repository { _, _, _ ->
            TodayHttpResponse(200, """{"documents":[{"document_id":"doc-1","title":"Note","revision":2,"updated_at":"2026-09-15T00:00:00Z"}],"project_documents":[{"document_id":"project-doc-1","kind":"project_primary","project_id":"project-1","project_title":"Project A","project_archived":true,"revision":4,"created_at":"2026-09-10T01:02:03Z","updated_at":"2026-09-15T04:05:06Z"}]}""")
        }

        val result = repository.listStandalone() as DocumentListResult.Success

        assertEquals("doc-1", result.documents.single().documentId)
        assertEquals("project-doc-1", result.projectDocuments.single().documentId)
        assertEquals("project-1", result.projectDocuments.single().projectId)
        assertEquals("Project A", result.projectDocuments.single().projectTitle)
        assertTrue(result.projectDocuments.single().projectArchived)
        assertEquals(4, result.projectDocuments.single().revision)
    }

    @Test
    fun missingProjectDocumentsIsBackwardCompatible() {
        val repository = repository { _, _, _ ->
            TodayHttpResponse(200, """{"documents":[]}""")
        }

        val result = repository.listStandalone() as DocumentListResult.Success

        assertTrue(result.projectDocuments.isEmpty())
    }

    @Test
    fun projectBoardParsesAllProjectsWithBoardOrder() {
        val repository = repository { method, path, _ ->
            assertEquals("GET", method)
            assertEquals("/api/v1/project-board", path)
            TodayHttpResponse(200, """{"board_revision":8,"projects":[{"id":"project-b","title":"Project B","archived":true,"board_position":2},{"id":"project-a","title":"Project A","archived":false,"board_position":1}]}""")
        }

        val result = repository.loadProjectBoard() as ProjectCatalogResult.Success

        assertEquals(listOf("project-b", "project-a"), result.projects.map { it.projectId })
        assertTrue(result.projects.first().projectArchived)
        assertEquals(2, result.projects.first().boardPosition)
    }

    @Test
    fun projectPrimaryEnsureUsesExactExistingRouteAndPayload() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = DocumentHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, projectDocumentResponse("project-doc-1", "project-1", "Project A", "", 1))
            },
        )

        val result = repository.ensureProjectPrimary(ProjectPrimaryEnsureRequest("op-ensure", "project-1", "project-doc-1"))

        assertTrue(result is DocumentResult.Success)
        assertEquals("POST", requests.single().first)
        assertEquals("/api/v1/projects/project-1/primary-document", requests.single().second)
        assertEquals("project-doc-1", (result as DocumentResult.Success).document.documentId)
        assertTrue(requests.single().third.orEmpty().contains("\"operation_id\":\"op-ensure\""))
        assertTrue(requests.single().third.orEmpty().contains("\"project_id\":\"project-1\""))
        assertTrue(requests.single().third.orEmpty().contains("\"document_id\":\"project-doc-1\""))
    }

    @Test
    fun projectPrimaryFetchUsesCanonicalRouteAndFields() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = DocumentHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, projectDocumentResponse("project-doc-1", "project-1", "Project A", "body", 3).substringAfter("{\"document\":").removeSuffix("}"))
            },
        )

        val result = repository.fetchProjectPrimary("project-doc-1") as DocumentResult.Success

        assertEquals("GET", requests.single().first)
        assertEquals("/api/v1/project-primary-documents/project-doc-1", requests.single().second)
        assertEquals("project-doc-1", result.document.documentId)
        assertEquals(DocumentKind.PROJECT_PRIMARY, result.document.kind)
        assertEquals("project-1", result.document.projectId)
        assertEquals("Project A", result.document.title)
        assertEquals("body", result.document.markdownBody)
        assertEquals(3, result.document.revision)
    }

    @Test
    fun projectPrimaryUpdateUsesCanonicalRouteAndNeverSendsTitle() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = DocumentHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, """{"document":{"document_id":"project-doc-1","kind":"project_primary","project_id":"project-1","project_title":"Project A","markdown_body":"new body","revision":4,"created_at":"2026-09-10T01:02:03Z","updated_at":"2026-09-15T04:05:06Z"}}""")
            },
        )

        val result = repository.updateProjectPrimary(ProjectPrimaryUpdateRequest("op-project", "project-1", "project-doc-1", 3, "new body"))

        assertTrue(result is DocumentResult.Success)
        assertEquals("POST", requests.single().first)
        assertEquals("/api/v1/project-primary-documents/project-doc-1", requests.single().second)
        assertTrue(requests.single().third.orEmpty().contains("\"project_id\":\"project-1\""))
        assertTrue(requests.single().third.orEmpty().contains("\"expected_revision\":3"))
        assertTrue(requests.single().third.orEmpty().contains("\"markdown_body\":\"new body\""))
        assertTrue(!requests.single().third.orEmpty().contains("\"title\""))
    }

    @Test
    fun unknownDocumentKindFailsSafelyInsteadOfBecomingStandalone() {
        val repository = repository { _, _, _ ->
            TodayHttpResponse(200, """{"document":{"document_id":"doc-1","kind":"future_kind","title":"x","markdown_body":"","revision":0}}""")
        }

        assertTrue(repository.fetchStandalone("doc-1") is DocumentResult.Failure)
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

    @Test
    fun standaloneLifecycleUsesCanonicalPathsAndRevisionPayloads() {
        val requests = mutableListOf<Pair<String, String?>>()
        val repository = DocumentHttpRepository(
            request = { _, path, body ->
                requests += path to body
                if (path.endsWith("/archive")) {
                    TodayHttpResponse(200, documentResponse("doc-1", "Note", "body", 3))
                } else {
                    TodayHttpResponse(200, """{"document_id":"doc-1","deleted":true}""")
                }
            },
        )

        assertTrue(repository.setStandaloneArchived(SetStandaloneDocumentArchivedRequest("op-a", "doc-1", 2, true)) is DocumentLifecycleResult.Success)
        assertTrue(repository.deleteStandalone(DeleteStandaloneDocumentRequest("op-d", "doc-1", 3)) is DocumentLifecycleResult.Success)
        assertEquals("/api/v1/documents/doc-1/archive", requests[0].first)
        assertTrue(requests[0].second.orEmpty().contains("\"expected_revision\":2"))
        assertTrue(requests[0].second.orEmpty().contains("\"archived\":true"))
        assertEquals("/api/v1/documents/doc-1/delete", requests[1].first)
        assertTrue(requests[1].second.orEmpty().contains("\"expected_revision\":3"))
    }

    private fun repository(request: (String, String, String?) -> TodayHttpResponse?) = DocumentHttpRepository(request)

    private fun documentResponse(id: String, title: String, body: String, revision: Int): String =
        """{"document":{"document_id":"$id","kind":"standalone","title":"$title","markdown_body":"$body","revision":$revision,"created_at":"2026-09-15T00:00:00Z","updated_at":"2026-09-15T00:00:00Z"}}"""

    private fun projectDocumentResponse(id: String, projectId: String, projectTitle: String, body: String, revision: Int): String =
        """{"document":{"document_id":"$id","kind":"project_primary","project_id":"$projectId","project_title":"$projectTitle","markdown_body":"$body","revision":$revision,"created_at":"2026-09-10T01:02:03Z","updated_at":"2026-09-15T04:05:06Z"}}"""
}
