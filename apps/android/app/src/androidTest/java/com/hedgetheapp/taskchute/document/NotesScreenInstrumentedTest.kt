package com.hedgetheapp.taskchute.document

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performTouchInput
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


    @Test
    fun focusedMarkdownBodyShowsSixImeToolbarActionsAndKeepsSourceInput() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("\u30ce\u30fc\u30c8\u3092\u65b0\u898f\u4f5c\u6210").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.document != null }
        composeRule.onAllNodes(hasSetTextAction(), useUnmergedTree = true).get(1).performClick()
        composeRule.onAllNodes(hasSetTextAction(), useUnmergedTree = true).get(1).performTextInput("**live**")
        composeRule.waitForIdle()
        assertTrue(controller?.state?.editor?.markdownBody?.contains("**live**") == true)
    }

    @Test
    fun markdownImeToolbarExposesSixActionsAndAppliesBoldToRawSource() {
        var latest = TextFieldValue("live", selection = TextRange(0, 4))
        composeRule.setContent {
            MarkdownImeToolbar(
                modifier = Modifier.fillMaxWidth(),
                fieldValue = latest,
                onValueChange = { latest = it },
            )
        }

        composeRule.onNodeWithContentDescription("\u592a\u5b57").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u898b\u51fa\u3057").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u7b87\u6761\u66f8\u304d").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u30c1\u30a7\u30c3\u30af\u30ea\u30b9\u30c8").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u5f15\u7528").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u30ea\u30f3\u30af").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("\u592a\u5b57").performClick()
        assertEquals("**live**", latest.text)
        assertEquals(TextRange(2, 6), latest.selection)
    }

    @Test
    fun taskPrimaryBottomSheetUsesTheSameMarkdownEditorSurface() {
        val repository = FakeRepository().apply {
            taskDocument = AndroidDocument("doc-task", DocumentKind.TASK_PRIMARY, "", "body", 0, taskId = "task-1")
        }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent {
            MaterialTheme {
                TaskNoteBottomSheet(controller = requireNotNull(controller), onDismiss = {})
            }
        }
        controller!!.openTaskPrimary("task-1", "Task title", "doc-task")
        composeRule.waitUntil(10_000) { controller?.state?.editor?.origin == NoteEditorOrigin.TODAY_TASK }
        composeRule.onAllNodes(hasSetTextAction(), useUnmergedTree = true).get(0).performClick()
        composeRule.onAllNodes(hasSetTextAction(), useUnmergedTree = true).get(0).performTextInput(" - [ ] task")
        composeRule.waitForIdle()
        assertTrue(controller?.state?.editor?.markdownBody?.contains(" - [ ] task") == true)
    }


    @Test
    fun renderedTaskCheckboxAccessibilityActionTogglesRawMarkdown() {
        var latest = "active\n- [ ] task"
        composeRule.setContent {
            MarkdownLiveEditor(
                value = latest,
                onValueChange = { latest = it },
                enabled = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        val node = composeRule.onNodeWithContentDescription("Markdown body")
        val action = node.fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsActions.CustomActions].single().action
        var performed = false
        composeRule.runOnIdle {
            performed = action()
        }
        assertTrue(performed)
        composeRule.waitForIdle()
        assertEquals("active\n- [x] task", latest)
    }

    @Test
    fun renderedTaskCheckboxMarkerTapTogglesOnlyTheRenderedLine() {
        var latest = "active\n- [ ] task"
        composeRule.setContent {
            MarkdownLiveEditor(
                value = latest,
                onValueChange = { latest = it },
                enabled = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        composeRule.onNodeWithContentDescription("Markdown body").performTouchInput {
            click(androidx.compose.ui.geometry.Offset(20f, 70f))
        }
        composeRule.waitForIdle()
        assertEquals("active\n- [x] task", latest)
    }

    @Test
    fun plainUrlTapOpensExactDestinationWithoutMovingSelectionOrChangingSource() {
        val source = "active\nhttps://example.com/path?q=1#section"
        var latest = TextFieldValue(source, selection = TextRange(0, 0))
        var opened: String? = null
        composeRule.setContent {
            MarkdownLiveEditor(
                value = source,
                onValueChange = {},
                enabled = true,
                modifier = Modifier.fillMaxWidth(),
                onOpenUrl = { opened = it },
                onTextFieldValueChange = { latest = it },
            )
        }

        composeRule.onNodeWithContentDescription("Markdown body").performTouchInput {
            click(androidx.compose.ui.geometry.Offset(80f, 70f))
        }
        composeRule.waitForIdle()

        assertEquals("https://example.com/path?q=1#section", opened)
        assertEquals(source, latest.text)
        assertEquals(TextRange(0, 0), latest.selection)
    }

    @Test
    fun renderedMarkdownLinkAccessibilityActionOpensDestinationWithoutSourceMutation() {
        val source = "active\n[Example](https://example.com)"
        var latest = TextFieldValue(source, selection = TextRange(0, 0))
        var opened: String? = null
        composeRule.setContent {
            MarkdownLiveEditor(
                value = source,
                onValueChange = {},
                enabled = true,
                modifier = Modifier.fillMaxWidth(),
                onOpenUrl = { opened = it },
                onTextFieldValueChange = { latest = it },
            )
        }

        val action = composeRule.onNodeWithContentDescription("Markdown body")
            .fetchSemanticsNode()
            .config[androidx.compose.ui.semantics.SemanticsActions.CustomActions]
            .first { it.label.startsWith("リンクを開く:") }
            .action
        composeRule.runOnIdle { assertTrue(action()) }
        composeRule.waitForIdle()

        assertEquals("https://example.com", opened)
        assertEquals(source, latest.text)
        assertEquals(TextRange(0, 0), latest.selection)
    }

    @Test
    fun blockedMarkdownEditorDoesNotExposeCheckboxMutationAction() {
        composeRule.setContent {
            MarkdownLiveEditor(
                value = "active\n- [ ] task",
                onValueChange = {},
                enabled = false,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        val config = composeRule.onNodeWithContentDescription("Markdown body").fetchSemanticsNode().config
        assertFalse(config.contains(androidx.compose.ui.semantics.SemanticsActions.CustomActions))
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
