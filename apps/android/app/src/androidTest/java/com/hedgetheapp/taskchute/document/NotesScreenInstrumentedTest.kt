package com.hedgetheapp.taskchute.document

import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextInputSelection
import androidx.compose.ui.test.swipe
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
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
        composeRule.onNodeWithText("本文を入力").performTextInput("manual flush")
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
        composeRule.onNodeWithText("本文を入力").performTextInput("discard me")
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
    fun reviewFooterWaitsForNotesAutosaveBeforeNavigating() {
        val repository = FakeRepository()
        val reviewNavigations = AtomicInteger()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen(onNavigateReview = { reviewNavigations.incrementAndGet() }) } }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.document != null }
        composeRule.runOnIdle { controller!!.updateBody("footer flush") }
        composeRule.onNodeWithContentDescription("Review").performClick()

        composeRule.waitUntil(10_000) {
            repository.updateCalls.get() == 1 && controller?.state?.editor == null && reviewNavigations.get() == 1
        }
        assertEquals(1, repository.updateCalls.get())
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
    fun reviewNavigationFromDirtyNotesWaitsForDiscardConfirmation() {
        val repository = FakeRepository().apply { failUpdates = true }
        val reviewNavigations = AtomicInteger()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen(onNavigateReview = { reviewNavigations.incrementAndGet() }) } }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.document != null }
        composeRule.runOnIdle { controller!!.updateBody("unsaved before Review") }
        composeRule.waitUntil(10_000) { controller?.state?.editor?.errorMessage == "failure" }

        composeRule.onNodeWithContentDescription("Review").performClick()
        composeRule.onNodeWithText("変更を破棄しますか？").assertIsDisplayed()
        assertEquals(0, reviewNavigations.get())
        composeRule.onNodeWithText("破棄して移動").performClick()
        composeRule.waitUntil(5_000) { controller?.state?.editor == null && reviewNavigations.get() == 1 }
    }

    @Test
    fun standaloneArchiveAndDeleteUseTheVisibleListActions() {
        val repository = FakeRepository().apply {
            activeDocuments = listOf(AndroidDocumentSummary("doc-archive", "Archive me", 4, "now"))
        }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithText("Archive me").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Archive meの操作").performClick()
        composeRule.onAllNodesWithText("アーカイブ").get(1).performClick()
        composeRule.waitUntil(10_000) { repository.archiveCalls.get() == 1 && controller?.state?.documents?.isEmpty() == true }

        composeRule.onNodeWithText("アーカイブ").performClick()
        composeRule.onNodeWithText("Archive me").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Archive meの操作").performClick()
        composeRule.onNodeWithText("削除").performClick()
        composeRule.onNodeWithText("ノートを削除").assertIsDisplayed()
        composeRule.onNodeWithText("削除").performClick()
        composeRule.waitUntil(10_000) { repository.deleteCalls.get() == 1 && controller?.state?.documents?.isEmpty() == true }
    }

    @Test
    fun materializedProjectPrimaryIsClearlyListedAndOpensBodyOnlyEditor() {
        val repository = FakeRepository().apply {
            projectDocuments = listOf(AndroidProjectDocumentSummary("project-doc", "project-1", "Project A", true, 2, "2026-09-10T01:02:03Z", "2026-09-15T04:05:06Z"))
            projectDocument = AndroidDocument("project-doc", DocumentKind.PROJECT_PRIMARY, "Project A", "old", 2, projectId = "project-1")
        }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithText("PROJECT NOTE").assertIsDisplayed()
        composeRule.onNodeWithText("Project A（アーカイブ）").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("作成日", substring = true).fetchSemanticsNodes().isNotEmpty())
        assertTrue(composeRule.onAllNodesWithText("更新日", substring = true).fetchSemanticsNodes().isNotEmpty())
        assertTrue(composeRule.onAllNodesWithContentDescription("Project A（アーカイブ）の操作").fetchSemanticsNodes().isEmpty())

        composeRule.onNodeWithContentDescription("PROJECT NOTE Project A（アーカイブ）").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.origin == NoteEditorOrigin.PROJECT_LIST }
        composeRule.onNodeWithText("Project A").assertIsDisplayed()
        composeRule.onNodeWithText("Project名はProject側が管理します。").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("タイトル", substring = false).fetchSemanticsNodes().isEmpty())
        composeRule.runOnIdle { controller!!.updateBody("project body") }
        composeRule.waitUntil(10_000) { repository.projectUpdateCalls.get() == 1 && controller?.state?.editor?.dirty == false }
    }

    @Test
    fun projectPrimaryCannotEnterOrOpenFromStandaloneSelectionMode() {
        val repository = FakeRepository().apply {
            activeDocuments = listOf(AndroidDocumentSummary("doc-1", "Standalone", 1, "now"))
            projectDocuments = listOf(AndroidProjectDocumentSummary("project-doc", "project-1", "Project A", false, 2))
            projectDocument = AndroidDocument("project-doc", DocumentKind.PROJECT_PRIMARY, "Project A", "body", 2, projectId = "project-1")
        }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }
        composeRule.waitUntil(10_000) { controller?.state?.documents?.isNotEmpty() == true }

        composeRule.runOnIdle { controller!!.enterSelection("doc-1") }
        composeRule.onNodeWithText("Project A").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("PROJECT NOTE Project A").performClick()
        composeRule.waitForIdle()
        assertEquals(0, repository.projectFetchCalls.get())
        assertEquals(null, controller?.state?.editor)
    }

    @Test
    fun standaloneLongPressSelectsRowAndSelectionTapsToggleWithoutCheckboxes() {
        val repository = FakeRepository().apply {
            activeDocuments = listOf(
                AndroidDocumentSummary("doc-1", "Standalone A", 1, "now"),
                AndroidDocumentSummary("doc-2", "Standalone B", 1, "now"),
            )
        }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("Standalone A").performTouchInput {
            down(pointerId = 0, position = androidx.compose.ui.geometry.Offset(40f, 39f))
            advanceEventTime(700)
            up(pointerId = 0)
        }
        composeRule.waitUntil(5_000) { controller?.state?.selectionModeActive == true }
        assertEquals(setOf("doc-1"), controller?.state?.selectedDocumentIds)
        composeRule.onNodeWithContentDescription("Standalone A").assertIsSelected()
        composeRule.onNodeWithContentDescription("Standalone B").assertIsNotSelected()
        assertTrue(composeRule.onAllNodesWithText("☑", substring = false).fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("☐", substring = false).fetchSemanticsNodes().isEmpty())

        composeRule.onNodeWithContentDescription("Standalone B").performClick()
        assertEquals(setOf("doc-1", "doc-2"), controller?.state?.selectedDocumentIds)
        composeRule.onNodeWithContentDescription("Standalone A").performClick()
        composeRule.onNodeWithContentDescription("Standalone B").performClick()
        composeRule.waitUntil(5_000) { controller?.state?.selectionModeActive == false }
        assertTrue(controller?.state?.selectedDocumentIds?.isEmpty() == true)
    }

    @Test
    fun horizontalSwipeDoesNotEnterStandaloneSelectionMode() {
        val repository = FakeRepository().apply {
            activeDocuments = listOf(AndroidDocumentSummary("doc-1", "Swipe note", 1, "now"))
        }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("Swipe note").performTouchInput {
            down(pointerId = 0, position = androidx.compose.ui.geometry.Offset(40f, 39f))
            moveTo(androidx.compose.ui.geometry.Offset(320f, 39f), delayMillis = 300)
            up(pointerId = 0)
        }
        composeRule.waitForIdle()
        assertFalse(controller?.state?.selectionModeActive == true)
        assertTrue(controller?.state?.selectedDocumentIds?.isEmpty() == true)
    }

    @Test
    fun unmaterializedProjectIsVisibleAndLazyEnsuresOnFirstTap() {
        val repository = FakeRepository().apply {
            projectCatalog = listOf(
                AndroidProjectNoteCandidate(
                    projectId = "project-new",
                    projectTitle = "Project New",
                    projectArchived = false,
                    boardPosition = 1,
                ),
            )
            projectEnsureResult = DocumentResult.Success(
                AndroidDocument(
                    documentId = "project-doc-new",
                    kind = DocumentKind.PROJECT_PRIMARY,
                    title = "Project New",
                    markdownBody = "",
                    revision = 0,
                    projectId = "project-new",
                ),
            )
        }
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithText("PROJECT NOTE").assertIsDisplayed()
        composeRule.onNodeWithText("Project New").assertIsDisplayed()
        assertEquals(0, repository.projectEnsureCalls.get())

        composeRule.onNodeWithContentDescription("PROJECT NOTE Project New").performClick()
        composeRule.waitUntil(10_000) {
            repository.projectEnsureCalls.get() == 1 &&
                controller?.state?.editor?.origin == NoteEditorOrigin.PROJECT_LIST
        }
        assertEquals("project-new", repository.lastProjectEnsure?.projectId)
        assertEquals("project-doc-new", controller?.state?.editor?.document?.documentId)
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
    fun notesEditorBodyFocusKeepsEditorSemantics() {
        val repository = FakeRepository()
        controller = NotesController(repository, onUnauthorized = {})
        composeRule.setContent { MaterialTheme { notesScreen() } }

        composeRule.onNodeWithContentDescription("ノートを新規作成").performClick()
        composeRule.waitUntil(10_000) { controller?.state?.editor?.document != null }
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsDisplayed()

        composeRule.onAllNodes(hasSetTextAction(), useUnmergedTree = true).get(1).performClick()
        composeRule.onAllNodes(hasSetTextAction(), useUnmergedTree = true).get(1).performTextInput("ime")
        composeRule.waitForIdle()

        composeRule.onNodeWithContentDescription("Markdown body").assertIsDisplayed()
    }

    @Test
    fun markdownImeToolbarExposesSixActionsAndAppliesBoldToRawSource() {
        val latest = mutableStateOf(TextFieldValue("live", selection = TextRange(0, 4)))
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                Box(Modifier.width(360.dp).height(48.dp)) {
                    MarkdownImeToolbar(
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        fieldValue = latest.value,
                        onValueChange = { latest.value = it },
                    )
                }
            }
        }

        composeRule.onNodeWithContentDescription("\u592a\u5b57").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u898b\u51fa\u3057").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u7b87\u6761\u66f8\u304d").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u30c1\u30a7\u30c3\u30af\u30ea\u30b9\u30c8").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u5f15\u7528").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("\u30ea\u30f3\u30af").assertIsDisplayed()

        val actionBounds = listOf("太字", "見出し", "箇条書き", "チェックリスト", "引用", "リンク")
            .map { composeRule.onNodeWithContentDescription(it).fetchSemanticsNode().boundsInRoot }
        val pixelsPerDp = composeRule.density.density
        actionBounds.forEach { bounds ->
            assertEquals("toolbar action stride remains compact", 44f, bounds.width / pixelsPerDp, 1f)
            assertEquals("toolbar action retains a 48dp tall hit area", 48f, bounds.height / pixelsPerDp, 1f)
            assertTrue("toolbar actions stay inside the 360dp portrait fixture", bounds.left >= 0f && bounds.right <= 360f * pixelsPerDp)
        }
        actionBounds.zipWithNext().forEach { (left, right) ->
            assertEquals("adjacent actions keep the 44dp stride", 44f, (right.center.x - left.center.x) / pixelsPerDp, 1f)
        }

        composeRule.onNodeWithContentDescription("\u592a\u5b57").performClick()
        assertEquals("**live**", latest.value.text)
        assertEquals(TextRange(2, 6), latest.value.selection)

        composeRule.runOnIdle { latest.value = TextFieldValue("heading") }
        composeRule.onNodeWithContentDescription("見出し").performClick()
        assertEquals("# heading", latest.value.text)

        composeRule.runOnIdle { latest.value = TextFieldValue("bullet") }
        composeRule.onNodeWithContentDescription("箇条書き").performClick()
        assertEquals("- bullet", latest.value.text)

        composeRule.runOnIdle { latest.value = TextFieldValue("check") }
        composeRule.onNodeWithContentDescription("チェックリスト").performClick()
        assertEquals("- [ ] check", latest.value.text)

        composeRule.runOnIdle { latest.value = TextFieldValue("quote") }
        composeRule.onNodeWithContentDescription("引用").performClick()
        assertEquals("> quote", latest.value.text)

        composeRule.runOnIdle { latest.value = TextFieldValue("OpenAI", selection = TextRange(0, 6)) }
        composeRule.onNodeWithContentDescription("リンク").performClick()
        assertEquals("[OpenAI](https://)", latest.value.text)
        assertEquals(TextRange(9, 17), latest.value.selection)
    }

    @Test
    fun lineNumberDisplayReadsThePersistedSettingWhenEditorOpens() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val preferences = context.getSharedPreferences(MarkdownEditorPreferences.PREFERENCES_NAME, 0)
        preferences.edit().remove(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY).commit()
        val showEditor = mutableStateOf(true)
        try {
            composeRule.setContent {
                if (showEditor.value) {
                    MaterialTheme {
                        MarkdownLiveEditor("first\nsecond", {}, true, Modifier.fillMaxWidth())
                    }
                }
            }
            composeRule.onNodeWithTag("markdown-line-number-gutter").assertIsDisplayed()
            assertTrue(composeRule.onAllNodesWithContentDescription("行番号を表示").fetchSemanticsNodes().isEmpty())
            composeRule.runOnIdle { showEditor.value = false }
            composeRule.waitForIdle()
            preferences.edit().putBoolean(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY, false).commit()
            composeRule.runOnIdle { showEditor.value = true }
            assertTrue(composeRule.onAllNodesWithTag("markdown-line-number-gutter").fetchSemanticsNodes().isEmpty())

            composeRule.runOnIdle { showEditor.value = false }
            composeRule.waitForIdle()
            preferences.edit().putBoolean(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY, true).commit()
            composeRule.runOnIdle { showEditor.value = true }
            composeRule.onNodeWithTag("markdown-line-number-gutter").assertIsDisplayed()
        } finally {
            preferences.edit().remove(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY).commit()
        }
    }

    @Test
    fun lineNumberSettingAppliesToStandaloneTaskAndProjectEditors() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val preferences = context.getSharedPreferences(MarkdownEditorPreferences.PREFERENCES_NAME, 0)
        val hadStoredValue = preferences.contains(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY)
        val previousValue = preferences.getBoolean(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY, true)
        val repository = FakeRepository().apply {
            standaloneDocuments["standalone-doc"] = AndroidDocument("standalone-doc", DocumentKind.STANDALONE, "Standalone", "body", 0)
            taskDocument = AndroidDocument("task-doc", DocumentKind.TASK_PRIMARY, "", "body", 0, taskId = "task-1")
            projectDocument = AndroidDocument("project-doc", DocumentKind.PROJECT_PRIMARY, "Project A", "body", 0, projectId = "project-1")
        }
        preferences.edit().putBoolean(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY, false).commit()
        controller = NotesController(repository, onUnauthorized = {})
        try {
            composeRule.setContent { MaterialTheme { notesScreen() } }

            controller!!.openStandalone("standalone-doc")
            composeRule.waitUntil(10_000) { controller?.state?.editor?.origin == NoteEditorOrigin.STANDALONE_LIST }
            assertTrue(composeRule.onAllNodesWithTag("markdown-line-number-gutter").fetchSemanticsNodes().isEmpty())
            composeRule.runOnIdle { controller!!.dismissEditor() }

            controller!!.openTaskPrimary("task-1", "Task title", "task-doc")
            composeRule.waitUntil(10_000) { controller?.state?.editor?.origin == NoteEditorOrigin.TODAY_TASK }
            assertTrue(composeRule.onAllNodesWithTag("markdown-line-number-gutter").fetchSemanticsNodes().isEmpty())
            composeRule.runOnIdle { controller!!.dismissEditor() }

            controller!!.openProjectPrimary("project-doc", "project-1", "Project A")
            composeRule.waitUntil(10_000) { controller?.state?.editor?.origin == NoteEditorOrigin.PROJECT_LIST }
            assertTrue(composeRule.onAllNodesWithTag("markdown-line-number-gutter").fetchSemanticsNodes().isEmpty())
        } finally {
            if (hadStoredValue) preferences.edit().putBoolean(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY, previousValue).commit()
            else preferences.edit().remove(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY).commit()
        }
    }

    @Test
    fun tappingBlankEditorAreaFocusesAtSourceStartWithoutChangingMarkdown() {
        val focusState = mutableStateOf(false)
        var latest = TextFieldValue("A short note")
        val saves = AtomicInteger()
        composeRule.setContent {
            MaterialTheme {
                MarkdownLiveEditor(
                    value = "A short note",
                    onValueChange = { saves.incrementAndGet() },
                    enabled = true,
                    modifier = Modifier.fillMaxWidth().fillMaxHeight(),
                    onTextFieldValueChange = { latest = it },
                    onBodyFocusChanged = { focusState.value = it },
                )
            }
        }

        composeRule.onNodeWithTag("markdown-editor-scroll-viewport").performTouchInput {
            click(Offset(width * 0.8f, height * 0.8f))
        }
        composeRule.waitForIdle()

        assertTrue("blank body taps focus the editable body", focusState.value)
        assertEquals("A short note", latest.text)
        assertEquals(TextRange(0), latest.selection)
        assertEquals("a blank-area tap must not enter the D-111 save path", 0, saves.get())
    }

    @Test
    fun tappingEmptyEditorAreaFocusesAtSourceStartWithoutSaving() {
        val focusState = mutableStateOf(false)
        var latest = TextFieldValue("")
        val saves = AtomicInteger()
        composeRule.setContent {
            MaterialTheme {
                MarkdownLiveEditor(
                    value = "",
                    onValueChange = { saves.incrementAndGet() },
                    enabled = true,
                    modifier = Modifier.fillMaxWidth().fillMaxHeight(),
                    onTextFieldValueChange = { latest = it },
                    onBodyFocusChanged = { focusState.value = it },
                )
            }
        }

        composeRule.onNodeWithTag("markdown-editor-scroll-viewport").performTouchInput {
            click(Offset(width * 0.8f, height * 0.6f))
        }
        composeRule.waitForIdle()

        assertTrue("an empty editor body can receive focus", focusState.value)
        assertEquals(TextRange(0), latest.selection)
        assertEquals(0, saves.get())
    }

    @Test
    fun notesToolbarIsAdjacentToSimulatedImeAfterBlankBodyTap() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val cursorStorage = context.getSharedPreferences(DocumentCursorPreferences.PREFERENCES_NAME, 0)
        val cursorKey = DocumentCursorPreferences.CARET_OFFSET_PREFIX + "task-doc"
        val hadCursor = cursorStorage.contains(cursorKey)
        val oldCursor = cursorStorage.getInt(cursorKey, 0)
        val repository = FakeRepository().apply {
            taskDocument = AndroidDocument("task-doc", DocumentKind.TASK_PRIMARY, "", "Daily task note", 0, taskId = "task-1")
        }
        controller = NotesController(repository, onUnauthorized = {})
        val simulatedImeHeight = 280.dp
        try {
            composeRule.setContent {
                val density = LocalDensity.current
                val simulatedImeInsets = remember(density) {
                    WindowInsets(bottom = with(density) { simulatedImeHeight.roundToPx() })
                }
                CompositionLocalProvider(LocalMarkdownEditorImeInsets provides simulatedImeInsets) {
                    MaterialTheme { notesScreen() }
                }
            }
            composeRule.runOnIdle { controller!!.openTaskPrimary("task-1", "Task title", "task-doc") }
            composeRule.waitUntil(10_000) { controller?.state?.editor?.document?.documentId == "task-doc" }

            composeRule.onNodeWithTag("markdown-editor-scroll-viewport").performTouchInput {
                click(Offset(width * 0.8f, height * 0.8f))
            }
            composeRule.waitForIdle()

            composeRule.onNodeWithTag("markdown-ime-toolbar").assertIsDisplayed()
            composeRule.onNodeWithText("Task title").assertIsDisplayed()
            assertTrue(composeRule.onAllNodesWithContentDescription("ノート一覧").fetchSemanticsNodes().isEmpty())
            assertEquals(0, DocumentCursorPreferences(context).readCaretOffset("task-doc"))
            assertEquals("blank focus does not send a Task Note update", 0, repository.taskUpdateCalls.get())

            val rootBottom = composeRule.onAllNodes(isRoot()).fetchSemanticsNodes().maxBy { it.boundsInRoot.height }.boundsInRoot.bottom
            val toolbarBottom = composeRule.onNodeWithTag("markdown-ime-toolbar").fetchSemanticsNode().boundsInRoot.bottom
            val imeHeightPx = with(composeRule.density) { simulatedImeHeight.toPx() }
            val twoDpPx = with(composeRule.density) { 2.dp.toPx() }
            assertEquals("Notes toolbar ends at the simulated keyboard top", rootBottom - imeHeightPx, toolbarBottom, twoDpPx)
        } finally {
            if (hadCursor) cursorStorage.edit().putInt(cursorKey, oldCursor).commit()
            else cursorStorage.edit().remove(cursorKey).commit()
        }
    }

    @Test
    fun taskNoteSheetShowsToolbarAfterBlankTapWithImeInsets() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val cursorStorage = context.getSharedPreferences(DocumentCursorPreferences.PREFERENCES_NAME, 0)
        val cursorKey = DocumentCursorPreferences.CARET_OFFSET_PREFIX + "task-doc"
        val hadCursor = cursorStorage.contains(cursorKey)
        val oldCursor = cursorStorage.getInt(cursorKey, 0)
        val repository = FakeRepository().apply {
            taskDocument = AndroidDocument("task-doc", DocumentKind.TASK_PRIMARY, "", "Task sheet body", 0, taskId = "task-1")
        }
        controller = NotesController(repository, onUnauthorized = {})
        val simulatedImeHeight = 280.dp
        try {
            composeRule.setContent {
                val density = LocalDensity.current
                val simulatedImeInsets = remember(density) {
                    WindowInsets(bottom = with(density) { simulatedImeHeight.roundToPx() })
                }
                CompositionLocalProvider(LocalMarkdownEditorImeInsets provides simulatedImeInsets) {
                    MaterialTheme { TaskNoteBottomSheet(requireNotNull(controller), onDismiss = {}) }
                }
            }
            composeRule.runOnIdle { controller!!.openTaskPrimary("task-1", "Task title", "task-doc") }
            composeRule.waitUntil(10_000) { controller?.state?.editor?.document?.documentId == "task-doc" }

            composeRule.onNodeWithTag("markdown-editor-scroll-viewport").performTouchInput {
                click(Offset(width * 0.8f, height * 0.8f))
            }
            composeRule.waitForIdle()

            composeRule.onNodeWithTag("markdown-ime-toolbar").assertIsDisplayed()
            composeRule.onNodeWithText("Task title").assertIsDisplayed()
            assertEquals(0, DocumentCursorPreferences(context).readCaretOffset("task-doc"))
            assertEquals(0, repository.taskUpdateCalls.get())
        } finally {
            if (hadCursor) cursorStorage.edit().putInt(cursorKey, oldCursor).commit()
            else cursorStorage.edit().remove(cursorKey).commit()
        }
    }

    @Test
    fun blockedEditorDoesNotFocusFromBlankAreaTap() {
        val focusState = mutableStateOf(false)
        var latest = TextFieldValue("blocked", selection = TextRange(3))
        val saves = AtomicInteger()
        composeRule.setContent {
            MaterialTheme {
                MarkdownLiveEditor(
                    value = "blocked",
                    onValueChange = { saves.incrementAndGet() },
                    enabled = false,
                    modifier = Modifier.fillMaxWidth().fillMaxHeight(),
                    onTextFieldValueChange = { latest = it },
                    onBodyFocusChanged = { focusState.value = it },
                )
            }
        }

        composeRule.onNodeWithTag("markdown-editor-scroll-viewport").performTouchInput {
            click(Offset(width * 0.8f, height * 0.8f))
        }
        composeRule.waitForIdle()

        assertFalse(focusState.value)
        assertEquals(TextRange(3), latest.selection)
        assertEquals(0, saves.get())
    }

    @Test
    fun lineNumbersTrackRealEditorScrollAndCaretBringIntoView() {
        val source = buildString {
            append("# TOP_ANCHOR\n\n")
            append("A very long paragraph that wraps several times when the editor is constrained to a narrow phone width.\n")
            repeat(70) { index ->
                append("line-$index unique-middle-anchor text that wraps at 360dp and remains one logical source line.\n\n")
            }
            append("BOTTOM_ANCHOR")
        }
        var latestFieldValue = TextFieldValue(source)
        val requestIme = mutableStateOf(false)
        composeRule.setContent {
            val density = LocalDensity.current
            val keyboardController = LocalSoftwareKeyboardController.current
            LaunchedEffect(requestIme.value) {
                if (requestIme.value) keyboardController?.show()
            }
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme {
                    Box(Modifier.width(360.dp).fillMaxHeight()) {
                        MarkdownLiveEditor(
                            value = source,
                            onValueChange = {},
                            enabled = true,
                            modifier = Modifier.fillMaxWidth(),
                            onTextFieldValueChange = { latestFieldValue = it },
                        )
                    }
                }
            }
        }

        val viewport = composeRule.onNodeWithTag("markdown-editor-scroll-viewport")
        val body = composeRule.onNodeWithContentDescription("Markdown body")
        body.performClick()
        body.performTextInput("X")
        composeRule.runOnIdle { requestIme.value = true }
        composeRule.waitForIdle()
        assertTrue(latestFieldValue.text.contains("X"))
        val scrollBefore = composeRule.onAllNodes(hasScrollAction(), useUnmergedTree = true)
            .fetchSemanticsNodes()
            .mapNotNull { node ->
                if (node.config.contains(SemanticsProperties.VerticalScrollAxisRange)) {
                    node.config[SemanticsProperties.VerticalScrollAxisRange].value()
                } else null
            }
            .maxOrNull() ?: error("the shared editor scroll viewport must expose its scroll offset")

        viewport.performTouchInput {
            swipe(
                start = Offset(width * 0.8f, height * 0.78f),
                end = Offset(width * 0.8f, height * 0.57f),
                durationMillis = 350,
            )
        }
        composeRule.waitForIdle()
        val scrollAfterSwipe = composeRule.onAllNodes(hasScrollAction(), useUnmergedTree = true)
            .fetchSemanticsNodes()
            .mapNotNull { node ->
                if (node.config.contains(SemanticsProperties.VerticalScrollAxisRange)) {
                    node.config[SemanticsProperties.VerticalScrollAxisRange].value()
                } else null
            }
            .maxOrNull() ?: error("the shared editor scroll viewport must expose its scroll offset")
        val scrollDelta = scrollAfterSwipe - scrollBefore
        assertTrue("the swipe must change the editor's actual scroll offset", scrollDelta > 10f)

        viewport.performTouchInput { click(Offset(width * 0.5f, 18f)) }
        composeRule.waitForIdle()
        assertTrue("a tap at the scrolled viewport top must hit later raw Markdown", latestFieldValue.selection.end > 20)
        val starts = markdownSourceLineStarts(latestFieldValue.text)
        val tappedLine = markdownSourceLineIndexAt(starts, latestFieldValue.selection.end)
        val matchingVisibleNumber = (tappedLine + 1..minOf(tappedLine + 8, starts.size))
            .firstOrNull { lineNumber ->
                composeRule.onAllNodesWithContentDescription("markdown-line-number-$lineNumber", useUnmergedTree = true)
                    .fetchSemanticsNodes().isNotEmpty()
            } ?: error("a visible logical line number should be available below the tapped anchor")
        val visibleNumberBounds = composeRule.onNodeWithContentDescription(
            "markdown-line-number-$matchingVisibleNumber",
            useUnmergedTree = true,
        ).fetchSemanticsNode().boundsInRoot
        val viewportBounds = viewport.fetchSemanticsNode().boundsInRoot
        viewport.performTouchInput {
            click(Offset(width * 0.7f, visibleNumberBounds.center.y - viewportBounds.top))
        }
        composeRule.waitForIdle()
        assertEquals(
            "a tap at the visible number's vertical position must hit that raw source line",
            matchingVisibleNumber - 1,
            markdownSourceLineIndexAt(starts, latestFieldValue.selection.end),
        )

        val scrollBeforeCaretMove = scrollAfterSwipe
        composeRule.onNodeWithContentDescription("Markdown body").performTextInputSelection(TextRange(latestFieldValue.text.length))
        composeRule.waitForIdle()
        val scrollAfterCaretMove = composeRule.onAllNodes(hasScrollAction(), useUnmergedTree = true)
            .fetchSemanticsNodes()
            .mapNotNull { node ->
                if (node.config.contains(SemanticsProperties.VerticalScrollAxisRange)) {
                    node.config[SemanticsProperties.VerticalScrollAxisRange].value()
                } else null
            }
            .maxOrNull() ?: error("the shared editor scroll viewport must expose its scroll offset")
        assertEquals(TextRange(latestFieldValue.text.length), latestFieldValue.selection)
        val caretScrollDelta = scrollAfterCaretMove - scrollBeforeCaretMove
        assertTrue("moving the caret to the end must bring that line into the viewport", caretScrollDelta > 10f)
        val lastLine = starts.size
        val lastLineNumber = composeRule.onNodeWithContentDescription("markdown-line-number-$lastLine", useUnmergedTree = true)
        val lastLineBounds = lastLineNumber.fetchSemanticsNode().boundsInRoot
        val caretViewportBounds = viewport.fetchSemanticsNode().boundsInRoot
        assertTrue("the end line number must be visible after caret bring-into-view", lastLineBounds.top >= caretViewportBounds.top - 3f && lastLineBounds.bottom <= caretViewportBounds.bottom + 3f)
        viewport.performTouchInput {
            click(Offset(width * 0.7f, lastLineBounds.center.y - caretViewportBounds.top))
        }
        composeRule.waitForIdle()
        assertEquals(lastLine - 1, markdownSourceLineIndexAt(starts, latestFieldValue.selection.end))
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
    private fun notesScreen(onNavigateReview: () -> Unit = {}) = NotesScreen(
        controller = requireNotNull(controller),
        onNavigateToday = {},
        onNavigateSettings = {},
        onNavigateReview = onNavigateReview,
    )

    private class FakeRepository : AndroidDocumentRepository {
        val createCalls = AtomicInteger()
        val updateCalls = AtomicInteger()
        val taskUpdateCalls = AtomicInteger()
        val archiveCalls = AtomicInteger()
        val deleteCalls = AtomicInteger()
        val projectFetchCalls = AtomicInteger()
        val projectUpdateCalls = AtomicInteger()
        val projectEnsureCalls = AtomicInteger()
        var lastCreate: StandaloneCreateRequest? = null
        var lastUpdate: StandaloneUpdateRequest? = null
        var lastProjectEnsure: ProjectPrimaryEnsureRequest? = null
        var taskDocument: AndroidDocument? = null
        var failUpdates = false
        var activeDocuments: List<AndroidDocumentSummary> = emptyList()
        val standaloneDocuments: MutableMap<String, AndroidDocument> = mutableMapOf()
        var archivedDocuments: List<AndroidDocumentSummary> = emptyList()
        var projectDocuments: List<AndroidProjectDocumentSummary> = emptyList()
        var projectCatalog: List<AndroidProjectNoteCandidate> = emptyList()
        var projectDocument: AndroidDocument? = null
        var projectEnsureResult: DocumentResult? = null

        override fun listStandalone(archived: Boolean) = DocumentListResult.Success(
            if (archived) archivedDocuments else activeDocuments,
            if (archived) emptyList() else projectDocuments,
        )

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

        override fun fetchStandalone(documentId: String): DocumentResult = standaloneDocuments[documentId]
            ?.let(DocumentResult::Success) ?: DocumentResult.Missing

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

        override fun fetchProjectPrimary(documentId: String): DocumentResult {
            projectFetchCalls.incrementAndGet()
            return projectDocument?.let { DocumentResult.Success(it) } ?: DocumentResult.Missing
        }

        override fun loadProjectBoard(): ProjectCatalogResult = ProjectCatalogResult.Success(
            if (projectCatalog.isNotEmpty()) projectCatalog else projectDocuments.mapIndexed { index, summary ->
                AndroidProjectNoteCandidate(
                    projectId = summary.projectId,
                    projectTitle = summary.projectTitle,
                    projectArchived = summary.projectArchived,
                    boardPosition = index,
                    documentId = summary.documentId,
                    revision = summary.revision,
                    createdAt = summary.createdAt,
                    updatedAt = summary.updatedAt,
                )
            },
        )

        override fun ensureProjectPrimary(request: ProjectPrimaryEnsureRequest): DocumentResult {
            projectEnsureCalls.incrementAndGet()
            lastProjectEnsure = request
            return projectEnsureResult
                ?: projectDocument?.let { DocumentResult.Success(it) }
                ?: DocumentResult.Success(
                    AndroidDocument(
                        documentId = request.documentId,
                        kind = DocumentKind.PROJECT_PRIMARY,
                        title = "Project A",
                        markdownBody = "",
                        revision = 0,
                        projectId = request.projectId,
                    ),
                )
        }

        override fun ensureTaskPrimary(request: TaskPrimaryEnsureRequest): DocumentResult = DocumentResult.Missing

        override fun updateTaskPrimary(request: TaskPrimaryUpdateRequest): DocumentResult {
            taskUpdateCalls.incrementAndGet()
            return DocumentResult.Success(
                AndroidDocument(request.documentId, DocumentKind.TASK_PRIMARY, "", request.markdownBody, request.expectedRevision + 1, taskId = request.taskId),
            )
        }

        override fun updateProjectPrimary(request: ProjectPrimaryUpdateRequest): DocumentResult {
            projectUpdateCalls.incrementAndGet()
            return DocumentResult.Success(AndroidDocument(
                request.documentId,
                DocumentKind.PROJECT_PRIMARY,
                "Project A",
                request.markdownBody,
                request.expectedRevision + 1,
                projectId = request.projectId,
            ))
        }
    }
}
