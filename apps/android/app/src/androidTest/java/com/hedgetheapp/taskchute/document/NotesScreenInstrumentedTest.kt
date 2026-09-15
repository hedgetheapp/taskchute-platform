package com.hedgetheapp.taskchute.document

import androidx.compose.material3.MaterialTheme
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
    fun notesDestinationCreatesAndSavesStandaloneDraft() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent {
            MaterialTheme {
                NotesScreen(
                    controller = requireNotNull(controller),
                    onNavigateToday = {},
                    onNavigateSettings = {},
                )
            }
        }

        composeRule.onAllNodesWithText("ノート").get(0).assertIsDisplayed()
        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.onNodeWithText("新規ノート").assertIsDisplayed()
        composeRule.onNodeWithText("タイトル").performTextInput("Android test note")
        composeRule.onNodeWithText("Markdown").performTextInput("# 日本語 😀")
        composeRule.onNodeWithText("保存").performClick()

        composeRule.waitUntil(15_000) { repository.createCalls.get() == 1 && controller?.state?.editor?.document != null }
        assertEquals(1, repository.createCalls.get())
        assertEquals("# 日本語 😀", repository.lastCreate?.markdownBody)
        assertEquals(0, repository.updateCalls.get())
    }

    @Test
    fun dirtyBackShowsDiscardConfirmationInsteadOfLeaving() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent {
            MaterialTheme {
                NotesScreen(
                    controller = requireNotNull(controller),
                    onNavigateToday = {},
                    onNavigateSettings = {},
                )
            }
        }
        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.onNodeWithText("タイトル").performTextInput("未保存")
        composeRule.onNodeWithText("‹ ノート").performClick()

        composeRule.onNodeWithText("変更を破棄しますか？").assertIsDisplayed()
        composeRule.onNodeWithText("キャンセル").performClick()
        composeRule.onNodeWithText("新規ノート").assertIsDisplayed()
    }

    @Test
    fun standaloneEditorBackReturnsToNotesList() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent {
            MaterialTheme {
                NotesScreen(
                    controller = requireNotNull(controller),
                    onNavigateToday = {},
                    onNavigateSettings = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.onNodeWithText("‹ ノート").performClick()

        assertTrue(composeRule.onAllNodesWithText("ノート").fetchSemanticsNodes().isNotEmpty())
        assertEquals(0, composeRule.onAllNodesWithText("新規ノート").fetchSemanticsNodes().size)
    }

    @Test
    fun taskPrimaryEditorBackReturnsToToday() {
        val repository = FakeRepository().apply {
            taskDocument = AndroidDocument(
                documentId = "doc-task",
                kind = DocumentKind.TASK_PRIMARY,
                title = "Task title",
                markdownBody = "body",
                revision = 0,
                taskId = "task-1",
            )
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
        composeRule.waitUntil(10_000) { repository.fetchTaskCalls.get() == 1 }
        composeRule.waitUntil(10_000) {
            controller?.state?.editor?.origin == NoteEditorOrigin.TODAY_TASK
        }
        assertFalse(controller!!.hasUnsavedChanges)

        composeRule.onNodeWithText("‹ 今日").performClick()

        composeRule.waitUntil(3_000) { todayNavigations.get() == 1 }
        assertEquals(1, todayNavigations.get())
    }

    private class FakeRepository : AndroidDocumentRepository {
        val createCalls = AtomicInteger()
        val updateCalls = AtomicInteger()
        var lastCreate: StandaloneCreateRequest? = null
        var taskDocument: AndroidDocument? = null
        val fetchTaskCalls = AtomicInteger()

        override fun listStandalone() = DocumentListResult.Success(emptyList())

        override fun fetchStandalone(documentId: String): DocumentResult = DocumentResult.Missing

        override fun createStandalone(request: StandaloneCreateRequest): DocumentResult {
            createCalls.incrementAndGet()
            lastCreate = request
            return DocumentResult.Success(
                AndroidDocument(
                    documentId = request.documentId,
                    kind = DocumentKind.STANDALONE,
                    title = request.title,
                    markdownBody = request.markdownBody,
                    revision = 0,
                ),
            )
        }

        override fun updateStandalone(request: StandaloneUpdateRequest): DocumentResult {
            updateCalls.incrementAndGet()
            return DocumentResult.Success(
                AndroidDocument(
                    documentId = request.documentId,
                    kind = DocumentKind.STANDALONE,
                    title = request.title,
                    markdownBody = request.markdownBody,
                    revision = request.expectedRevision + 1,
                ),
            )
        }

        override fun fetchTaskPrimary(documentId: String): DocumentResult {
            fetchTaskCalls.incrementAndGet()
            return taskDocument?.let { DocumentResult.Success(it) }
            ?: DocumentResult.Missing
        }

        override fun ensureTaskPrimary(request: TaskPrimaryEnsureRequest): DocumentResult = DocumentResult.Missing

        override fun updateTaskPrimary(request: TaskPrimaryUpdateRequest): DocumentResult = DocumentResult.Missing
    }
}
