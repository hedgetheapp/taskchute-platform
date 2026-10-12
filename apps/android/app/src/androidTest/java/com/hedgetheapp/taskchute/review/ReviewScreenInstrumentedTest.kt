package com.hedgetheapp.taskchute.review

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hedgetheapp.taskchute.ui.TaskChuteTheme
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReviewScreenInstrumentedTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun primaryViewsSharePeriodSelectionAndNavigationRemainsAvailable() {
        val todayNavigations = AtomicInteger()
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    onNavigateToday = { todayNavigations.incrementAndGet() },
                    onNavigateNotes = {},
                    onNavigateDaily = {},
                    onNavigateSettings = {},
                    initialAnchor = LocalDate.of(2026, 1, 31),
                )
            }
        }

        composeRule.onNodeWithContentDescription("Date").assertIsDisplayed().assertIsSelected()
        composeRule.onNodeWithContentDescription("Selected period: 2026/01/31").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("Project").performClick().assertIsSelected()
        composeRule.onNodeWithText("プロジェクトごとの集計").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Selected period: 2026/01/31").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Mode").performClick().assertIsSelected()
        composeRule.onNodeWithText("モードごとの集計").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Note").performClick().assertIsSelected()
        composeRule.onNodeWithText("ノートごとの集計").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Date").performClick().assertIsSelected()
        composeRule.onNodeWithContentDescription("Selected period: 2026/01/31").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("Review period: Daily").performClick()
        composeRule.onNodeWithText("Monthly").performClick()
        composeRule.onNodeWithContentDescription("Selected period: 2026/01").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Next period").performClick()
        composeRule.onNodeWithContentDescription("Selected period: 2026/02").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Project").performClick()
        composeRule.onNodeWithContentDescription("Selected period: 2026/02").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("Task").performClick()
        assertEquals(1, todayNavigations.get())
    }

    @Test
    fun neutralPlaceholderDoesNotExposeMetrics() {
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    onNavigateToday = {},
                    onNavigateNotes = {},
                    onNavigateDaily = {},
                    onNavigateSettings = {},
                    initialAnchor = LocalDate.of(2026, 1, 31),
                )
            }
        }

        composeRule.onNodeWithText("集計データは次の実装で対応します").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("0").fetchSemanticsNodes().isEmpty())
    }
}
