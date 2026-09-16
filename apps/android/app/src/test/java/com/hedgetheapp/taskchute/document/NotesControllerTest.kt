package com.hedgetheapp.taskchute.document

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotesControllerTest {
    @Test
    fun standalonePlusCreatesCanonicalNoteImmediatelyAndAutosavesAfterIdle() {
        val repository = FakeRepository()
        val controller = controller(repository)

        controller.openNew()

        assertTrue(await { repository.createRequests.size == 1 })
        assertEquals("notitle", repository.createRequests.single().title)
        assertEquals("notitle", controller.state.editor?.title)
        assertFalse(controller.state.editor?.dirty ?: true)

        controller.updateTitle("日本語のノート")
        controller.updateBody("# 本文 😀")
        assertTrue(await { repository.updateRequests.size == 1 })
        assertEquals("日本語のノート", repository.updateRequests.single().title)
        assertEquals("# 本文 😀", repository.updateRequests.single().markdownBody)
        assertTrue(await { controller.state.editor?.saving == false })
        assertEquals(NoteSaveStatus.SAVED, controller.state.editor?.saveStatus)
        controller.close()
    }

    @Test
    fun canonicalCreateTitleIsAdopted() {
        val repository = FakeRepository().apply {
            createResult = DocumentResult.Success(document("doc-1", "notitle3", ""))
        }
        val controller = controller(repository)

        controller.openNew()

        assertTrue(await { controller.state.editor?.title == "notitle3" })
        assertEquals("doc-1", controller.state.editor?.document?.documentId)
        assertFalse(controller.state.editor?.dirty ?: true)
        controller.close()
    }

    @Test
    fun userCanContinueTypingWhileSaveIsInFlightAndFollowUpUsesLatestDraft() {
        val repository = FakeRepository().apply {
            fetchResult = DocumentResult.Success(document("doc-1", "Note", "old", 0))
            updateStarted = CountDownLatch(1)
            releaseUpdate = CountDownLatch(1)
            updateResultProvider = { request -> DocumentResult.Success(document(request.documentId, request.title, request.markdownBody, 1)) }
        }
        val controller = controller(repository)
        controller.openStandalone("doc-1")
        assertTrue(await { controller.state.editor != null })

        controller.updateBody("first")
        controller.save()
        assertTrue(repository.updateStarted!!.await(2, TimeUnit.SECONDS))
        assertEquals("first", repository.updateRequests.single().markdownBody)
        assertTrue(controller.state.editor?.saving == true)

        controller.updateBody("second")
        assertEquals("second", controller.state.editor?.markdownBody)
        assertEquals("first", repository.updateRequests.single().markdownBody)
        repository.releaseUpdate!!.countDown()

        assertTrue(await { repository.updateRequests.size == 2 })
        assertEquals("second", repository.updateRequests[1].markdownBody)
        assertTrue(await { controller.state.editor?.saving == false && controller.state.editor?.dirty == false })
        controller.close()
    }

    @Test
    fun explicitSaveFlushesImmediatelyAndCleanSaveIsNoOp() {
        val repository = FakeRepository().apply {
            fetchResult = DocumentResult.Success(document("doc-1", "Note", "old", 0))
        }
        val controller = controller(repository)
        controller.openStandalone("doc-1")
        assertTrue(await { controller.state.editor != null })

        controller.updateBody("new")
        controller.save()
        assertTrue(await { repository.updateRequests.size == 1 })
        controller.save()
        assertEquals(1, repository.updateRequests.size)
        controller.close()
    }

    @Test
    fun deferredBackFlushesThenClearsEditor() {
        val repository = FakeRepository().apply {
            fetchResult = DocumentResult.Success(document("doc-1", "Note", "old", 0))
        }
        val controller = controller(repository)
        val navigated = AtomicBoolean(false)
        controller.openStandalone("doc-1")
        assertTrue(await { controller.state.editor != null })
        controller.updateBody("new")
        controller.flushAndNavigate { navigated.set(true) }

        assertTrue(await { navigated.get() })
        assertNull(controller.state.editor)
        assertEquals(1, repository.updateRequests.size)
        controller.close()
    }

    @Test
    fun deferredNavigationWaitsForFollowUpWhenDraftChangesDuringFlush() {
        val repository = FakeRepository().apply {
            fetchResult = DocumentResult.Success(document("doc-1", "Note", "old", 0))
            updateStarted = CountDownLatch(1)
            releaseUpdate = CountDownLatch(1)
            updateResultProvider = { request -> DocumentResult.Success(document(request.documentId, request.title, request.markdownBody, request.expectedRevision + 1)) }
        }
        val controller = controller(repository)
        val navigated = AtomicBoolean(false)
        controller.openStandalone("doc-1")
        assertTrue(await { controller.state.editor != null })
        controller.updateBody("first")
        controller.save()
        assertTrue(repository.updateStarted!!.await(2, TimeUnit.SECONDS))

        controller.flushAndNavigate { navigated.set(true) }
        controller.updateBody("latest")
        repository.releaseUpdate!!.countDown()

        assertTrue(await { repository.updateRequests.size == 2 && navigated.get() })
        assertEquals("first", repository.updateRequests[0].markdownBody)
        assertEquals("latest", repository.updateRequests[1].markdownBody)
        assertNull(controller.state.editor)
        controller.close()
    }

    @Test
    fun deterministicFailurePreservesDraftAndExplicitDiscardSendsNoAdditionalMutation() {
        val repository = FakeRepository().apply {
            fetchResult = DocumentResult.Success(document("doc-1", "Note", "old", 0))
            updateResult = DocumentResult.Failure("network")
        }
        val controller = controller(repository)
        controller.openStandalone("doc-1")
        assertTrue(await { controller.state.editor != null })
        controller.updateBody("local draft")
        controller.save()
        assertTrue(await { controller.state.editor?.errorMessage == "network" })
        assertTrue(controller.requiresDiscardConfirmation)

        assertTrue(controller.discardEditor())
        assertNull(controller.state.editor)
        assertEquals(1, repository.updateRequests.size)
        controller.close()
    }

    @Test
    fun revisionConflictPreservesDraftAndBlocksAutomaticNavigation() {
        val repository = FakeRepository().apply {
            fetchResult = DocumentResult.Success(document("doc-1", "Note", "old", 0))
            updateResult = DocumentResult.Conflict("conflict")
        }
        val controller = controller(repository)
        val navigated = AtomicBoolean(false)
        controller.openStandalone("doc-1")
        assertTrue(await { controller.state.editor != null })
        controller.updateBody("local draft")
        controller.save()
        assertTrue(await { controller.state.editor?.saveStatus == NoteSaveStatus.CONFLICT })

        controller.flushAndNavigate { navigated.set(true) }
        assertFalse(navigated.get())
        assertEquals("local draft", controller.state.editor?.markdownBody)
        controller.close()
    }

    @Test
    fun ambiguousCreateRetainsExactRequestAndRetryReusesIt() {
        val repository = FakeRepository().apply {
            createResult = DocumentResult.Ambiguous("unknown")
            fetchResult = DocumentResult.Missing
        }
        val controller = controller(repository)

        controller.openNew()
        assertTrue(await { controller.state.editor?.unresolvedRequest != null })
        val original = controller.state.editor!!.unresolvedRequest as NoteEditorRequest.Create
        assertTrue(controller.state.editor!!.blocked)
        assertFalse(controller.discardEditor())

        repository.createResult = DocumentResult.Success(document(original.request.documentId, "notitle", ""))
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
            fetchResult = DocumentResult.Success(document("doc-1", "notitle", ""))
        }
        val controller = controller(repository)

        controller.openNew()

        assertTrue(await { controller.state.editor?.document?.documentId == "doc-1" })
        assertEquals(1, repository.createRequests.size)
        assertFalse(controller.state.editor!!.blocked)
        controller.close()
    }

    @Test
    fun taskPrimaryBodyAutosavesWithoutChangingTaskAuthority() {
        val repository = FakeRepository().apply {
            taskFetchResult = DocumentResult.Success(
                AndroidDocument("doc-1", DocumentKind.TASK_PRIMARY, "", "old", 2, taskId = "task-1"),
            )
        }
        val controller = controller(repository)

        controller.openTaskPrimary("task-1", "Task title", "doc-1")
        assertTrue(await { controller.state.editor?.document?.documentId == "doc-1" })
        controller.updateBody("本文")

        assertTrue(await { repository.taskUpdateRequests.size == 1 })
        val request = repository.taskUpdateRequests.single()
        assertEquals("task-1", request.taskId)
        assertEquals("doc-1", request.documentId)
        assertEquals(2, request.expectedRevision)
        assertEquals("本文", request.markdownBody)
        assertEquals("Task title", controller.state.editor?.taskTitle)
        controller.close()
    }

    @Test
    fun controllerCloseCancelsPendingAutosave() {
        val repository = FakeRepository().apply {
            fetchResult = DocumentResult.Success(document("doc-1", "Note", "old", 0))
        }
        val controller = controller(repository)
        controller.openStandalone("doc-1")
        assertTrue(await { controller.state.editor != null })
        controller.updateBody("pending")
        controller.close()
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(1_100)
        while (System.nanoTime() < deadline) Thread.yield()
        assertEquals(0, repository.updateRequests.size)
    }

    @Test
    fun standaloneLifecycleUsesExpectedRevisionAndExactRetry() {
        val repository = FakeRepository().apply { lifecycleResult = DocumentLifecycleResult.Ambiguous("unknown") }
        val controller = controller(repository)
        val summary = AndroidDocumentSummary("doc-1", "Note", 7, "2026-09-14T00:00:00Z")

        controller.archiveStandalone(summary, archived = true)

        assertTrue(await { controller.state.unresolvedLifecycleRequest != null })
        val original = controller.state.unresolvedLifecycleRequest as NoteLifecycleRequest.Archive
        assertEquals(7, original.request.expectedRevision)
        assertFalse(controller.state.lifecycleSaving)

        repository.lifecycleResult = DocumentLifecycleResult.Success()
        controller.retryLifecycle()
        assertTrue(await { controller.state.unresolvedLifecycleRequest == null && !controller.state.lifecycleSaving })
        assertEquals(original.request, repository.archiveRequests[1])
        controller.close()
    }

    @Test
    fun standaloneDeleteUsesExactDocumentAndRevision() {
        val repository = FakeRepository()
        val controller = controller(repository)
        controller.deleteStandalone(AndroidDocumentSummary("doc-2", "Delete me", 3, ""))

        assertTrue(await { repository.deleteRequests.size == 1 })
        assertEquals("doc-2", repository.deleteRequests.single().documentId)
        assertEquals(3, repository.deleteRequests.single().expectedRevision)
        controller.close()
    }

    @Test
    fun unresolvedLifecycleBlocksNavigationUntilExactRetry() {
        val repository = FakeRepository().apply { lifecycleResult = DocumentLifecycleResult.Ambiguous("unknown") }
        val controller = controller(repository)
        val navigated = AtomicBoolean(false)

        controller.archiveStandalone(AndroidDocumentSummary("doc-1", "Note", 1, ""), archived = true)
        assertTrue(await { controller.state.unresolvedLifecycleRequest != null })
        controller.flushAndNavigate { navigated.set(true) }

        assertFalse(navigated.get())
        controller.close()
    }

    private fun controller(repository: FakeRepository) = NotesController(
        repository = repository,
        onUnauthorized = {},
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
    )

    private fun await(predicate: () -> Boolean): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(4)
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
        val taskUpdateRequests = mutableListOf<TaskPrimaryUpdateRequest>()
        val archiveRequests = mutableListOf<SetStandaloneDocumentArchivedRequest>()
        val deleteRequests = mutableListOf<DeleteStandaloneDocumentRequest>()
        var createResult: DocumentResult? = null
        var updateResult: DocumentResult? = null
        var updateResultProvider: ((StandaloneUpdateRequest) -> DocumentResult)? = null
        var fetchResult: DocumentResult? = null
        var ensureResult: DocumentResult? = null
        var taskFetchResult: DocumentResult? = null
        var createStarted: CountDownLatch? = null
        var releaseCreate: CountDownLatch? = null
        var updateStarted: CountDownLatch? = null
        var releaseUpdate: CountDownLatch? = null
        var lifecycleResult: DocumentLifecycleResult = DocumentLifecycleResult.Success()

        override fun listStandalone(archived: Boolean) = DocumentListResult.Success(emptyList())

        override fun setStandaloneArchived(request: SetStandaloneDocumentArchivedRequest): DocumentLifecycleResult {
            archiveRequests += request
            return lifecycleResult
        }

        override fun deleteStandalone(request: DeleteStandaloneDocumentRequest): DocumentLifecycleResult {
            deleteRequests += request
            return lifecycleResult
        }

        override fun fetchStandalone(documentId: String): DocumentResult = fetchResult
            ?: createRequests.lastOrNull()?.let { request ->
                DocumentResult.Success(document(request.documentId, request.title, request.markdownBody))
            }
            ?: DocumentResult.Missing

        override fun createStandalone(request: StandaloneCreateRequest): DocumentResult {
            createRequests += request
            createStarted?.countDown()
            releaseCreate?.await(2, TimeUnit.SECONDS)
            return createResult ?: DocumentResult.Success(document(request.documentId, request.title, request.markdownBody))
        }

        override fun updateStandalone(request: StandaloneUpdateRequest): DocumentResult {
            updateRequests += request
            updateStarted?.countDown()
            releaseUpdate?.await(2, TimeUnit.SECONDS)
            return updateResultProvider?.invoke(request)
                ?: updateResult
                ?: DocumentResult.Success(document(request.documentId, request.title, request.markdownBody, request.expectedRevision + 1))
        }

        override fun fetchTaskPrimary(documentId: String): DocumentResult = taskFetchResult ?: DocumentResult.Missing

        override fun ensureTaskPrimary(request: TaskPrimaryEnsureRequest): DocumentResult {
            ensureRequests += request
            return ensureResult ?: DocumentResult.Missing
        }

        override fun updateTaskPrimary(request: TaskPrimaryUpdateRequest): DocumentResult {
            taskUpdateRequests += request
            return DocumentResult.Success(
                AndroidDocument(request.documentId, DocumentKind.TASK_PRIMARY, "", request.markdownBody, request.expectedRevision + 1, taskId = request.taskId),
            )
        }
    }

    private companion object {
        fun document(id: String, title: String, body: String, revision: Int = 1) = AndroidDocument(
            documentId = id,
            kind = DocumentKind.STANDALONE,
            title = title,
            markdownBody = body,
            revision = revision,
            createdAt = "2026-09-14T00:00:00Z",
            updatedAt = "2026-09-14T00:00:00Z",
        )
    }
}
