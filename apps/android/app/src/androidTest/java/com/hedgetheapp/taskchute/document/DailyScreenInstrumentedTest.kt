package com.hedgetheapp.taskchute.document

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.click
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayResult
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DailyScreenInstrumentedTest {
    @get:Rule
    val composeRule = createComposeRule()

    private var controller: DailyController? = null

    @After
    fun tearDown() {
        controller?.close()
    }

    @Test
    fun dailySurfaceLoadsExistingDocumentAndKeepsNavigationFooterAvailable() {
        val repository = FakeRepository()
        controller = DailyController(
            repository = repository,
            loadDay = { TodayResult.Success(day()) },
            onUnauthorized = {},
        )
        composeRule.setContent {
            MaterialTheme {
                DailyScreen(
                    controller = requireNotNull(controller),
                    onNavigateToday = {},
                    onNavigateNotes = {},
                    onNavigateSettings = {},
                )
            }
        }

        composeRule.waitUntil(10_000) { controller?.state?.document != null }
        composeRule.onNodeWithText("2026-09-29 (火)").assertIsDisplayed()
        composeRule.onNodeWithText("Daily").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("前の日").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("次の日").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("表示").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithText("2026-09-29 (火)").performClick()
        composeRule.onNodeWithText("キャンセル").assertIsDisplayed().performClick()
        assertEquals("2026-09-29", controller?.state?.selectedDate)
    }

    @Test
    fun dailyNavigationBarHidesOnlyForFocusedBodyWithVisibleIme() {
        assertTrue(shouldShowDailyNavigationBar(editorBodyFocused = false, imeVisible = true))
        assertTrue(shouldShowDailyNavigationBar(editorBodyFocused = true, imeVisible = false))
        assertFalse(shouldShowDailyNavigationBar(editorBodyFocused = true, imeVisible = true))
    }

    @Test
    fun dailyEditorReadsTheStoredLineNumberSetting() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val preferences = context.getSharedPreferences(MarkdownEditorPreferences.PREFERENCES_NAME, 0)
        val hadStoredValue = preferences.contains(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY)
        val previousValue = preferences.getBoolean(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY, true)
        preferences.edit().putBoolean(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY, false).commit()
        controller = DailyController(
            repository = FakeRepository(),
            loadDay = { TodayResult.Success(day()) },
            onUnauthorized = {},
        )
        try {
            composeRule.setContent {
                MaterialTheme {
                    DailyScreen(
                        controller = requireNotNull(controller),
                        onNavigateToday = {},
                        onNavigateNotes = {},
                        onNavigateSettings = {},
                    )
                }
            }
            composeRule.waitUntil(10_000) { controller?.state?.document != null }
            assertTrue(composeRule.onAllNodesWithTag("markdown-line-number-gutter").fetchSemanticsNodes().isEmpty())
            assertTrue(composeRule.onAllNodesWithText("保存済み").fetchSemanticsNodes().isNotEmpty())
        } finally {
            if (hadStoredValue) preferences.edit().putBoolean(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY, previousValue).commit()
            else preferences.edit().remove(MarkdownEditorPreferences.SHOW_LINE_NUMBERS_KEY).commit()
        }
    }

    @Test
    fun dailyBlankTapShowsToolbarAboveSimulatedImeAndHidesNavigation() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val cursorStorage = context.getSharedPreferences(DocumentCursorPreferences.PREFERENCES_NAME, 0)
        val cursorKey = DocumentCursorPreferences.CARET_OFFSET_PREFIX + "doc-1"
        val hadCursor = cursorStorage.contains(cursorKey)
        val oldCursor = cursorStorage.getInt(cursorKey, 0)
        val repository = FakeRepository()
        controller = DailyController(
            repository = repository,
            loadDay = { TodayResult.Success(day()) },
            onUnauthorized = {},
        )
        val simulatedImeHeight = 280.dp
        try {
            composeRule.setContent {
                val density = LocalDensity.current
                val simulatedImeInsets = remember(density) {
                    WindowInsets(bottom = with(density) { simulatedImeHeight.roundToPx() })
                }
                CompositionLocalProvider(LocalMarkdownEditorImeInsets provides simulatedImeInsets) {
                    MaterialTheme {
                        DailyScreen(
                            controller = requireNotNull(controller),
                            onNavigateToday = {},
                            onNavigateNotes = {},
                            onNavigateSettings = {},
                        )
                    }
                }
            }
            composeRule.waitUntil(10_000) { controller?.state?.document != null }

            composeRule.onNodeWithTag("markdown-editor-scroll-viewport").performTouchInput {
                click(Offset(width * 0.8f, height * 0.8f))
            }
            composeRule.waitForIdle()

            composeRule.onNodeWithTag("markdown-ime-toolbar").assertIsDisplayed()
            composeRule.onNodeWithText("2026-09-29 (火)").assertIsDisplayed()
            composeRule.onNodeWithText("保存済み").assertIsDisplayed()
            assertTrue(composeRule.onAllNodesWithContentDescription("Daily").fetchSemanticsNodes().isEmpty())
            assertEquals(0, DocumentCursorPreferences(context).readCaretOffset("doc-1"))
            assertEquals("focus-only blank tap does not save the Daily document", 0, repository.updateCalls.get())

            val rootBottom = composeRule.onRoot().fetchSemanticsNode().boundsInRoot.bottom
            val toolbarBottom = composeRule.onNodeWithTag("markdown-ime-toolbar").fetchSemanticsNode().boundsInRoot.bottom
            val imeHeightPx = with(composeRule.density) { simulatedImeHeight.toPx() }
            val twoDpPx = with(composeRule.density) { 2.dp.toPx() }
            assertEquals("toolbar ends at the simulated keyboard top", rootBottom - imeHeightPx, toolbarBottom, twoDpPx)
        } finally {
            if (hadCursor) cursorStorage.edit().putInt(cursorKey, oldCursor).commit()
            else cursorStorage.edit().remove(cursorKey).commit()
        }
    }

    @Test
    fun dailyHeadingPickerSurvivesImeInsetChangeAndOnlySavesAfterSelection() {
        val repository = FakeRepository()
        val imeVisible = mutableStateOf(true)
        controller = DailyController(
            repository = repository,
            loadDay = { TodayResult.Success(day()) },
            onUnauthorized = {},
        )
        composeRule.setContent {
            val density = LocalDensity.current
            val simulatedImeInsets = remember(density, imeVisible.value) {
                WindowInsets(bottom = if (imeVisible.value) with(density) { 280.dp.roundToPx() } else 0)
            }
            CompositionLocalProvider(LocalMarkdownEditorImeInsets provides simulatedImeInsets) {
                MaterialTheme {
                    DailyScreen(
                        controller = requireNotNull(controller),
                        onNavigateToday = {},
                        onNavigateNotes = {},
                        onNavigateSettings = {},
                    )
                }
            }
        }
        composeRule.waitUntil(10_000) { controller?.state?.document != null }

        composeRule.onNodeWithTag("markdown-editor-scroll-viewport").performTouchInput {
            click(Offset(width * 0.8f, height * 0.8f))
        }
        composeRule.onNodeWithTag("markdown-ime-toolbar").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("見出しを選択").performClick()
        composeRule.onNodeWithContentDescription("H3 見出し3").assertIsDisplayed()
        assertEquals("opening the Daily picker does not save", 0, repository.updateCalls.get())
        assertEquals("Daily body", controller?.state?.markdownBody)

        composeRule.runOnIdle { imeVisible.value = false }
        composeRule.waitForIdle()
        composeRule.onNodeWithContentDescription("H3 見出し3").assertIsDisplayed()
        assertEquals("IME inset change while picker is open does not save", 0, repository.updateCalls.get())

        composeRule.onNodeWithContentDescription("H3 見出し3").performClick()
        composeRule.waitUntil(10_000) { repository.updateCalls.get() > 0 }
        assertEquals("### Daily body", repository.lastUpdateBody)
    }

    @Test
    fun reviewNavigationFromDirtyDailyWaitsForSaveConfirmation() {
        val repository = FakeRepository()
        val reviewNavigations = AtomicInteger()
        controller = DailyController(
            repository = repository,
            loadDay = { TodayResult.Success(day()) },
            onUnauthorized = {},
        )
        composeRule.setContent {
            MaterialTheme {
                DailyScreen(
                    controller = requireNotNull(controller),
                    onNavigateToday = {},
                    onNavigateNotes = {},
                    onNavigateSettings = {},
                    onNavigateReview = { reviewNavigations.incrementAndGet() },
                )
            }
        }

        composeRule.waitUntil(10_000) { controller?.state?.document != null }
        composeRule.runOnIdle { controller!!.updateBody("unsaved before Review") }
        composeRule.onNodeWithContentDescription("Review").performClick()
        composeRule.onNodeWithText("保存して移動しますか？").assertIsDisplayed()
        assertEquals(0, reviewNavigations.get())
        composeRule.onNodeWithText("保存して移動").performClick()
        composeRule.waitUntil(10_000) { repository.updateCalls.get() == 1 && reviewNavigations.get() == 1 }
        assertEquals("unsaved before Review", repository.lastUpdateBody)
    }

    private class FakeRepository : DailyDocumentRepository {
        val updateCalls = AtomicInteger()
        var lastUpdateBody: String? = null

        override fun listDaily() = DailyListResult.Success(listOf(AndroidDailyDocumentSummary("day-1", "2026-09-29", "doc-1")))

        override fun fetchDaily(documentId: String) = DailyResult.Success(AndroidDailyDocument(documentId, "day-1", "2026-09-29", "Daily body", 0))

        override fun ensureDaily(request: DailyEnsureRequest) = error("unexpected ensure")

        override fun updateDaily(request: DailyUpdateRequest): DailyResult {
            updateCalls.incrementAndGet()
            lastUpdateBody = request.markdownBody
            return DailyResult.Success(
                AndroidDailyDocument(
                    request.documentId,
                    request.taskchuteDayId,
                    "2026-09-29",
                    request.markdownBody,
                    request.expectedRevision + 1,
                ),
            )
        }
    }

    private companion object {
        fun day() = TodayDay(
            logicalDate = "2026-09-29",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 0,
            sections = emptyList(),
            unsectionedEntries = emptyList(),
            activeExecution = null,
            taskChuteDayId = "day-1",
        )
    }
}
