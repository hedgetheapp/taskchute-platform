package com.hedgetheapp.taskchute.document

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.atomic.AtomicInteger
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NotesScreenInstrumentedTest {
    @get:Rule
    val composeRule = createComposeRule()

    private var controller: NotesController? = null

    @After
    fun tearDown() {
        controller?.close()
    }

    @Test
    fun plusCreatesCanonicalNoteAndTypingAutosavesWithoutExplicitSave() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.waitUntil(10_000) { repository.createCalls.get() == 1 && controller?.state?.editor?.document != null }
        composeRule.runOnIdle {
            controller!!.updateTitle("Android test note")
            controller!!.updateBody("# 日本語 😀")
        }

        composeRule.waitUntil(15_000) { repository.updateCalls.get() == 1 && controller?.state?.editor?.dirty == false }
        assertEquals("notitle", repository.lastCreate?.title)
        assertEquals("Android test note", repository.lastUpdate?.title)
        assertEquals("# 日本語 😀", repository.lastUpdate?.markdownBody)
        assertTrue(composeRule.onAllNodesWithText("保存済み").fetchSemanticsNodes().isNotEmpty())
    }

    @Test
    fun explicitSaveFlushesImmediately() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.document != null }
        assertTrue(composeRule.onAllNodesWithText("保存", substring = false).fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithText("Markdown").performTextInput("manual flush")
        composeRule.runOnIdle { controller!!.save() }

        composeRule.waitUntil(5_000) { repository.updateCalls.get() == 1 && controller?.state?.editor?.dirty == false }
        assertEquals("manual flush", repository.lastUpdate?.markdownBody)
    }

    @Test
    fun dirtyBackFlushesAndReturnsToNotesList() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.document != null }
        composeRule.runOnIdle { controller!!.updateBody("back flush") }
        composeRule.onNodeWithText("‹ ノート").performClick()

        composeRule.waitUntil(10_000) { repository.updateCalls.get() == 1 && controller?.state?.editor == null }
        assertEquals(1, repository.updateCalls.get())
    }

    @Test
    fun failedSaveAllowsExplicitDiscardAndActuallyLeavesEditor() {
        val repository = FakeRepository().apply { failUpdates = true }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.document != null }
        composeRule.onNodeWithText("Markdown").performTextInput("discard me")
        composeRule.waitUntil(5_000) { controller?.state?.editor?.errorMessage == "failure" }

        composeRule.onNodeWithText("‹ ノート").performClick()
        composeRule.onNodeWithText("変更を破棄しますか？").assertIsDisplayed()
        composeRule.onNodeWithText("破棄して移動").performClick()
        composeRule.waitUntil(5_000) { controller?.state?.editor == null }
        assertEquals(1, repository.updateCalls.get())
    }

    @Test
    fun taskPrimaryAutosavesAndBackReturnsToToday() {
        val repository = FakeRepository().apply {
            taskDocument = AndroidDocument("doc-task", DocumentKind.TASK_PRIMARY, "", "body", 0, taskId = "task-1")
        }
        val todayNavigations = AtomicInteger()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent {
            MaterialTheme {
                NotesScreen(
                    controller = requireNotNull(controller),
                    onNavigateToday = { todayNavigations.incrementAndGet() },
                    onNavigateSettings = {},
                )
            }
        }
        controller!!.openTaskPrimary("task-1", "Task title", "doc-task")
        composeRule.waitUntil(10_000) { controller?.state?.editor?.origin == NoteEditorOrigin.TODAY_TASK }
        composeRule.runOnIdle { controller!!.updateBody("task note") }
        composeRule.waitUntil(10_000) { repository.taskUpdateCalls.get() == 1 && controller?.state?.editor?.dirty == false }
        composeRule.runOnIdle {
            controller!!.flushAndNavigate { todayNavigations.incrementAndGet() }
        }
        composeRule.waitUntil(5_000) { todayNavigations.get() == 1 && controller?.state?.editor == null }
        assertEquals(1, todayNavigations.get())
    }

    @Test
    fun notesFooterReturnsFromEditorToTheNotesListAfterSafeFlush() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.document != null }
        composeRule.runOnIdle { controller!!.updateBody("footer flush") }
        composeRule.onNodeWithContentDescription("ノート一覧").performClick()

        composeRule.waitUntil(10_000) { repository.updateCalls.get() == 1 && controller?.state?.editor == null }
        assertEquals(1, repository.updateCalls.get())
    }

    @Test
    fun standaloneArchiveAndDeleteUseTheVisibleListActions() {
        val repository = FakeRepository().apply {
            activeDocuments = listOf(AndroidDocumentSummary("doc-archive", "Archive me", 4, "now"))
        }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithText("Archive me").assertIsDisplayed()
        composeRule.onNodeWithText("操作").performClick()
        composeRule.onAllNodesWithText("アーカイブ").get(1).performClick()
        composeRule.waitUntil(10_000) { repository.archiveCalls.get() == 1 && controller?.state?.documents?.isEmpty() == true }

        composeRule.onNodeWithText("アーカイブ").performClick()
        composeRule.onNodeWithText("Archive me").assertIsDisplayed()
        composeRule.onNodeWithText("操作").performClick()
        composeRule.onNodeWithText("削除").performClick()
        composeRule.onNodeWithText("ノートを削除").assertIsDisplayed()
        composeRule.onNodeWithText("削除").performClick()
        composeRule.waitUntil(10_000) { repository.deleteCalls.get() == 1 && controller?.state?.documents?.isEmpty() == true }
    }

    @Composable
    private fun notesScreen() = NotesScreen(
        controller = requireNotNull(controller),
        onNavigateToday = {},
        onNavigateSettings = {},
    )

    private class FakeRepository : AndroidDocumentRepository {
        val createCalls = AtomicInteger()
        val updateCalls = AtomicInteger()
        val taskUpdateCalls = AtomicInteger()
        val archiveCalls = AtomicInteger()
        val deleteCalls = AtomicInteger()
        var lastCreate: StandaloneCreateRequest? = null
        var lastUpdate: StandaloneUpdateRequest? = null
        var taskDocument: AndroidDocument? = null
        var failUpdates = false
        var activeDocuments: List<AndroidDocumentSummary> = emptyList()
        var archivedDocuments: List<AndroidDocumentSummary> = emptyList()

        override fun listStandalone(archived: Boolean) = DocumentListResult.Success(if (archived) archivedDocuments else activeDocuments)

        override fun setStandaloneArchived(request: SetStandaloneDocumentArchivedRequest): DocumentLifecycleResult {
            archiveCalls.incrementAndGet()
            val source = (activeDocuments + archivedDocuments).firstOrNull { it.documentId == request.documentId }
                ?: return DocumentLifecycleResult.Missing
            val updated = source.copy(revision = request.expectedRevision + 1)
            if (request.archived) {
                activeDocuments = activeDocuments.filterNot { it.documentId == request.documentId }
                archivedDocuments = archivedDocuments.filterNot { it.documentId == request.documentId } + updated
            } else {
                archivedDocuments = archivedDocuments.filterNot { it.documentId == request.documentId }
                activeDocuments = activeDocuments.filterNot { it.documentId == request.documentId } + updated
            }
            return DocumentLifecycleResult.Success()
        }

        override fun deleteStandalone(request: DeleteStandaloneDocumentRequest): DocumentLifecycleResult {
            deleteCalls.incrementAndGet()
            activeDocuments = activeDocuments.filterNot { it.documentId == request.documentId }
            archivedDocuments = archivedDocuments.filterNot { it.documentId == request.documentId }
            return DocumentLifecycleResult.Success()
        }

        override fun fetchStandalone(documentId: String): DocumentResult = DocumentResult.Missing

        override fun createStandalone(request: StandaloneCreateRequest): DocumentResult {
            createCalls.incrementAndGet()
            lastCreate = request
            return DocumentResult.Success(
                AndroidDocument(request.documentId, DocumentKind.STANDALONE, request.title, request.markdownBody, 0),
            )
        }

        override fun updateStandalone(request: StandaloneUpdateRequest): DocumentResult {
            updateCalls.incrementAndGet()
            lastUpdate = request
            if (failUpdates) return DocumentResult.Failure("failure")
            return DocumentResult.Success(
                AndroidDocument(request.documentId, DocumentKind.STANDALONE, request.title, request.markdownBody, request.expectedRevision + 1),
            )
        }

        override fun fetchTaskPrimary(documentId: String): DocumentResult = taskDocument?.let { DocumentResult.Success(it) }
            ?: DocumentResult.Missing

        override fun ensureTaskPrimary(request: TaskPrimaryEnsureRequest): DocumentResult = DocumentResult.Missing

        override fun updateTaskPrimary(request: TaskPrimaryUpdateRequest): DocumentResult {
            taskUpdateCalls.incrementAndGet()
            return DocumentResult.Success(
                AndroidDocument(request.documentId, DocumentKind.TASK_PRIMARY, "", request.markdownBody, request.expectedRevision + 1, taskId = request.taskId),
            )
        }
    }
}
