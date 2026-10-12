package com.hedgetheapp.taskchute.document

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayResult
import org.junit.After
import org.junit.Assert.assertEquals
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
