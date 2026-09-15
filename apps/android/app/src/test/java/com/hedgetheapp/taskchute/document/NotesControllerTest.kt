package com.hedgetheapp.taskchute.document

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotesControllerTest {
    @Test
    fun newDraftDoesNotWriteUntilExplicitSaveAndThenUpdatesCanonicalDocument() {
        val repository = FakeRepository()
        val controller = controller(repository)

        controller.openNew()
        controller.updateTitle("日本語のノート")
        controller.updateBody("# 本文 😀")
        assertEquals(0, repository.createRequests.size)

        controller.save()
        assertTrue(await { controller.state.editor?.document != null })
        assertEquals(1, repository.createRequests.size)
        assertFalse(controller.state.editor!!.dirty)

        controller.updateBody("更新した本文")
        controller.save()
        assertTrue(await { repository.updateRequests.size == 1 && controller.state.editor?.dirty == false })
        assertEquals(1, repository.updateRequests.size)
        assertEquals(1, controller.state.editor?.document?.revision)
        controller.close()
    }

    @Test
    fun ambiguousCreateRetainsExactRequestUntilRetry() {
        val repository = FakeRepository().apply {
            createResult = DocumentResult.Ambiguous("unknown")
            fetchResult = DocumentResult.Missing
        }
        val controller = controller(repository)
        controller.openNew()
        controller.updateTitle("Retry me")
        controller.updateBody("body")
        controller.save()
        assertTrue(await { controller.state.editor?.unresolvedRequest != null })
        val original = controller.state.editor!!.unresolvedRequest as NoteEditorRequest.Create
        controller.updateTitle("different")
        controller.updateBody("different")
        assertEquals(original, controller.state.editor!!.unresolvedRequest)
        assertTrue(controller.state.editor!!.blocked)

        repository.createResult = DocumentResult.Success(document(original.request.documentId, original.request.title, original.request.markdownBody))
        controller.retryUnresolved()
        assertTrue(await { controller.state.editor?.unresolvedRequest == null })
        assertEquals(2, repository.createRequests.size)
        assertEquals(original.request, repository.createRequests[1])
        controller.close()
    }

    @Test
    fun ambiguousCommittedCreateConvergesByExactDocumentIdWithoutSecondCreate() {
        val repository = FakeRepository().apply {
            createResult = DocumentResult.Ambiguous("unknown")
            fetchResult = DocumentResult.Success(document("doc-1", "Committed", "body"))
        }
        val controller = controller(repository)
        controller.openNew()
        controller.updateTitle("Committed")
        controller.updateBody("body")
        controller.save()

        assertTrue(await { controller.state.editor?.unresolvedRequest == null })
        assertEquals(1, repository.createRequests.size)
        assertEquals("doc-1", controller.state.editor?.document?.documentId)
        controller.close()
    }

    @Test
    fun staleConflictPreservesLocalDraftAndDoesNotAdoptServerText() {
        val repository = FakeRepository().apply {
            fetchResult = DocumentResult.Success(document("doc-1", "Original", "server"))
            updateResult = DocumentResult.Conflict("conflict")
        }
        val controller = controller(repository)
        controller.openStandalone("doc-1")
        assertTrue(await { controller.state.editor != null })
        controller.updateBody("local draft")
        controller.save()

        assertTrue(await { controller.state.editor?.errorMessage == "conflict" })
        assertEquals("local draft", controller.state.editor?.markdownBody)
        assertNull(controller.state.editor?.unresolvedRequest)
        controller.close()
    }

    @Test
    fun ambiguousTaskPrimaryEnsureRetainsExactRequestAndRetriesIt() {
        val repository = FakeRepository().apply {
            ensureResult = DocumentResult.Ambiguous("unknown")
            taskFetchResult = DocumentResult.Missing
        }
        val controller = controller(repository)

        controller.openTaskPrimary("task-1", "Task title", null)
        assertTrue(await { controller.state.unresolvedTaskEnsure != null })
        val original = controller.state.unresolvedTaskEnsure!!

        repository.ensureResult = DocumentResult.Success(
            AndroidDocument("doc-1", DocumentKind.TASK_PRIMARY, "", "body", 0, taskId = "task-1"),
        )
        controller.retryTaskPrimaryEnsure()

        assertTrue(await { controller.state.editor?.document?.documentId == "doc-1" })
        assertEquals(2, repository.ensureRequests.size)
        assertEquals(original, repository.ensureRequests[1])
        assertEquals("Task title", controller.state.editor?.taskTitle)
        controller.close()
    }

    private fun controller(repository: FakeRepository) = NotesController(
        repository = repository,
        onUnauthorized = {},
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
    )

    private fun await(predicate: () -> Boolean): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
        while (System.nanoTime() < deadline) {
            if (predicate()) return true
            Thread.yield()
        }
        return predicate()
    }

    private class FakeRepository : AndroidDocumentRepository {
        val createRequests = mutableListOf<StandaloneCreateRequest>()
        val updateRequests = mutableListOf<StandaloneUpdateRequest>()
        val ensureRequests = mutableListOf<TaskPrimaryEnsureRequest>()
        var createResult: DocumentResult? = null
        var updateResult: DocumentResult? = null
        var fetchResult: DocumentResult? = null
        var ensureResult: DocumentResult? = null
        var taskFetchResult: DocumentResult? = null

        override fun listStandalone() = DocumentListResult.Success(emptyList())

        override fun fetchStandalone(documentId: String): DocumentResult = fetchResult
            ?: createRequests.lastOrNull()?.let { request ->
                DocumentResult.Success(document(request.documentId, request.title, request.markdownBody).copy(revision = 0))
            }
            ?: DocumentResult.Missing

        override fun createStandalone(request: StandaloneCreateRequest): DocumentResult {
            createRequests += request
            return createResult ?: DocumentResult.Success(document(request.documentId, request.title, request.markdownBody).copy(revision = 0))
        }

        override fun updateStandalone(request: StandaloneUpdateRequest): DocumentResult {
            updateRequests += request
            return updateResult ?: DocumentResult.Success(document(request.documentId, request.title, request.markdownBody))
        }

        override fun fetchTaskPrimary(documentId: String): DocumentResult = taskFetchResult ?: DocumentResult.Missing

        override fun ensureTaskPrimary(request: TaskPrimaryEnsureRequest): DocumentResult {
            ensureRequests += request
            return ensureResult ?: DocumentResult.Missing
        }

        override fun updateTaskPrimary(request: TaskPrimaryUpdateRequest): DocumentResult = DocumentResult.Missing
    }

    private companion object {
        fun document(id: String, title: String, body: String) = AndroidDocument(
            documentId = id,
            kind = DocumentKind.STANDALONE,
            title = title,
            markdownBody = body,
            revision = if (body == "server") 0 else 1,
            createdAt = "2026-09-14T00:00:00Z",
            updatedAt = "2026-09-14T00:00:00Z",
        )
    }
}
