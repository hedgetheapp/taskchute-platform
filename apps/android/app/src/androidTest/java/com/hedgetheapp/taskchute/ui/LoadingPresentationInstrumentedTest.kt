package com.hedgetheapp.taskchute.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LoadingPresentationInstrumentedTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun sharedLoadingShowsOnlyTheGenericUserFacingLabel() {
        composeRule.setContent {
            TaskChuteTheme {
                FullScreenLoadingPresentation()
            }
        }

        composeRule.onNodeWithText("読み込み中").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("認証状態を確認しています…").fetchSemanticsNodes().isEmpty())
    }
}
