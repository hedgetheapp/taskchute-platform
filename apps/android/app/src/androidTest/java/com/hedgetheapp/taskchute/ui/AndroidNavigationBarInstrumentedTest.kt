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
    fun footerExposesThreeDestinationsAndSelectedState() {
        val selected = mutableStateOf(AndroidDestination.TODAY)
        composeRule.setContent {
            TaskChuteTheme {
                AndroidNavigationBar(
                    selected = selected.value,
                    onToday = {},
                    onNotes = {},
                    onSettings = {},
                )
            }
        }

        composeRule.onNodeWithContentDescription("今日").assertIsDisplayed().assertIsSelected()
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsDisplayed().assertIsNotSelected()
        composeRule.onNodeWithContentDescription("設定").assertIsDisplayed().assertIsNotSelected()

        composeRule.runOnIdle { selected.value = AndroidDestination.NOTES }
        composeRule.onNodeWithContentDescription("今日").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsSelected()
        composeRule.onNodeWithContentDescription("設定").assertIsNotSelected()

        composeRule.runOnIdle { selected.value = AndroidDestination.SETTINGS }
        composeRule.onNodeWithContentDescription("今日").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsNotSelected()
        composeRule.onNodeWithContentDescription("設定").assertIsSelected()
    }
}