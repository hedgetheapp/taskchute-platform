package com.hedgetheapp.taskchute.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.platform.testTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidNavigationBarInstrumentedTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun footerExposesFiveDestinationsAndSelectedState() {
        val selected = mutableStateOf(AndroidDestination.TODAY)
        composeRule.setContent {
            TaskChuteTheme {
                AndroidNavigationBar(
                    selected = selected.value,
                    onToday = {},
                    onNotes = {},
                    onDaily = {},
                    onReview = {},
                    onSettings = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Task").assertIsDisplayed().assertIsSelected()
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsDisplayed().assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Daily").assertIsDisplayed().assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Review").assertIsDisplayed().assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Settings").assertIsDisplayed().assertIsNotSelected()

        composeRule.runOnIdle { selected.value = AndroidDestination.DAILY }
        composeRule.onNodeWithContentDescription("Task").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Daily").assertIsSelected()
        composeRule.onNodeWithContentDescription("Review").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Settings").assertIsNotSelected()

        composeRule.runOnIdle { selected.value = AndroidDestination.REVIEW }
        composeRule.onNodeWithContentDescription("Task").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Daily").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Review").assertIsSelected()
        composeRule.onNodeWithContentDescription("Settings").assertIsNotSelected()

        composeRule.runOnIdle { selected.value = AndroidDestination.SETTINGS }
        composeRule.onNodeWithContentDescription("Task").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Daily").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Review").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Settings").assertIsSelected()
    }

    @Test
    fun fiveDestinationFooterFitsNarrowPhoneWidth() {
        composeRule.setContent {
            Box(Modifier.width(320.dp).testTag("narrow-footer")) {
                TaskChuteTheme {
                    AndroidNavigationBar(
                        selected = AndroidDestination.REVIEW,
                        onToday = {},
                        onNotes = {},
                        onDaily = {},
                        onReview = {},
                        onSettings = {},
                    )
                }
            }
        }

        val descriptions = listOf("Task", "ノート一覧", "Daily", "Review", "Settings")
        val container = composeRule.onNodeWithTag("narrow-footer").fetchSemanticsNode().boundsInRoot
        val itemBounds = descriptions.map { description ->
            composeRule.onNodeWithContentDescription(description).fetchSemanticsNode().boundsInRoot
        }
        assertTrue(itemBounds.first().left >= container.left)
        assertTrue(itemBounds.last().right <= container.right)
        itemBounds.zipWithNext().forEach { (left, right) ->
            assertTrue("Footer items must not overlap", left.right <= right.left + 0.5f)
        }
        composeRule.onNodeWithContentDescription("Review").assertIsDisplayed().assertIsSelected()
    }
}
