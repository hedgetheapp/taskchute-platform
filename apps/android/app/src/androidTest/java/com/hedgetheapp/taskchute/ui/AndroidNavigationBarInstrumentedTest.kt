package com.hedgetheapp.taskchute.ui

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidNavigationBarInstrumentedTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun footerExposesFourEnglishDestinationsAndSelectedState() {
        val selected = mutableStateOf(AndroidDestination.TODAY)
        composeRule.setContent {
            TaskChuteTheme {
                AndroidNavigationBar(
                    selected = selected.value,
                    onToday = {},
                    onNotes = {},
                    onDaily = {},
                    onSettings = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("Task").assertIsDisplayed().assertIsSelected()
        composeRule.onNodeWithContentDescription("Notes").assertIsDisplayed().assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Daily").assertIsDisplayed().assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Settings").assertIsDisplayed().assertIsNotSelected()

        composeRule.runOnIdle { selected.value = AndroidDestination.DAILY }
        composeRule.onNodeWithContentDescription("Task").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Notes").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Daily").assertIsSelected()
        composeRule.onNodeWithContentDescription("Settings").assertIsNotSelected()

        composeRule.runOnIdle { selected.value = AndroidDestination.SETTINGS }
        composeRule.onNodeWithContentDescription("Task").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Notes").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Daily").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("Settings").assertIsSelected()
    }
}