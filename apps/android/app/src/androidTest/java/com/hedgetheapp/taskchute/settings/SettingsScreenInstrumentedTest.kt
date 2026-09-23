package com.hedgetheapp.taskchute.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsScreenInstrumentedTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun settingsHomeShowsConceptCardsAndThreeTabNavigation() {
        val controller = SettingsController(FakeSettingsRepository(), {}, kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Unconfined))
        composeRule.setContent { SettingsScreen(controller, {}, {}, {}) }
        composeRule.onNodeWithText("TaskChuteの時間と再利用設定を管理します。").assertIsDisplayed()
        composeRule.onNodeWithText("セクション設定").assertIsDisplayed()
        composeRule.onNodeWithText("プロジェクト設定").assertIsDisplayed()
        composeRule.onNodeWithText("ルーティン設定").assertIsDisplayed()
        composeRule.onNodeWithText("今日").assertIsDisplayed()
        composeRule.onNodeWithText("ノート").assertIsDisplayed()
        controller.close()
    }

    @Test
    fun sectionCardOpensSectionListAndEditor() {
        val controller = SettingsController(FakeSettingsRepository(), {}, kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Unconfined))
        composeRule.setContent { SettingsScreen(controller, {}, {}, {}) }
        composeRule.onNodeWithContentDescription("セクション設定").performClick()
        composeRule.onNodeWithText("朝").assertIsDisplayed()
        composeRule.onAllNodesWithText("編集")[0].performClick()
        composeRule.onNodeWithText("セクション編集").assertIsDisplayed()
        controller.close()
    }

    @Test
    fun scheduleApplyIsDisabledForInvalidDraftAndEnabledForValidDraft() {
        val controller = SettingsController(FakeSettingsRepository(), {}, kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Unconfined))
        composeRule.setContent { SettingsScreen(controller, {}, {}, {}) }

        composeRule.onNodeWithContentDescription("ルーティン設定").performClick()
        composeRule.onNodeWithContentDescription("＋").performClick()
        composeRule.onNodeWithText("繰り返し: 毎日").performClick()
        composeRule.onNodeWithText("適用").assertIsEnabled()

        composeRule.onNodeWithText("種類: 毎日").performClick()
        composeRule.onNodeWithText("N日ごと").performClick()
        composeRule.onNodeWithText("適用").assertIsNotEnabled()

        composeRule.onNodeWithText("間隔").performTextInput("2")
        composeRule.onNodeWithText("適用").assertIsEnabled()
        controller.close()
    }
    @Test
    fun routineListShowsExplicitEnabledDisabledToggle() {
        val controller = SettingsController(FakeSettingsRepository(), {}, kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Unconfined))
        composeRule.setContent { SettingsScreen(controller, {}, {}, {}) }

        composeRule.onNodeWithContentDescription("ルーティン設定").performClick()
        composeRule.onNodeWithText("朝の準備").assertIsDisplayed()
        composeRule.onNodeWithText("有効").assertIsDisplayed()
        composeRule.onNodeWithText("無効").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("ルーティン: 有効。タップで切り替え").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("ルーティン: 無効。タップで切り替え").assertIsDisplayed()
        controller.close()
    }
}

private class FakeSettingsRepository : AndroidSettingsRepository {
    private val section = AndroidSectionConfiguration("v1", 0, listOf(AndroidSectionSetting("a", "朝", 0, 720), AndroidSectionSetting("b", "夜", 720, 1440)))
    override fun loadSectionConfiguration() = SettingsResult.Success(section)
    override fun updateSectionConfiguration(request: SectionConfigurationUpdateRequest) = SettingsResult.Success(Unit)
    override fun loadProjectBoard() = SettingsResult.Success(AndroidProjectBoard(1, emptyList()))
    override fun createProject(request: CreateProjectSettingsRequest) = SettingsResult.Success(Unit)
    override fun updateProject(request: UpdateProjectSettingsRequest) = SettingsResult.Success(Unit)
    override fun setProjectArchived(request: SetProjectArchivedSettingsRequest) = SettingsResult.Success(Unit)
    override fun reorderProjects(request: ReorderProjectsSettingsRequest) = SettingsResult.Success(Unit)
    override fun deleteProject(request: DeleteProjectSettingsRequest) = SettingsResult.Success(Unit)
    override fun loadRoutineBoard() = SettingsResult.Success(
        AndroidRoutineBoard(
            1,
            "2026-09-16",
            emptyList(),
            listOf(
                AndroidRoutineSetting("routine-enabled", "task-enabled", "朝の準備", null, null, true, RoutineScheduleSpec(), null, null, null, null, "2026-09-16", null, 1),
                AndroidRoutineSetting("routine-disabled", "task-disabled", "夜の振り返り", null, null, false, RoutineScheduleSpec(), null, null, null, null, "2026-09-16", null, 2),
            ),
        ),
    )
    override fun createRoutine(request: CreateRoutineSettingsRequest) = SettingsResult.Success(Unit)
    override fun updateRoutine(request: UpdateRoutineSettingsRequest) = SettingsResult.Success(Unit)
    override fun setRoutineEnabled(request: SetRoutineEnabledSettingsRequest) = SettingsResult.Success(Unit)
    override fun deleteRoutine(request: DeleteRoutineSettingsRequest) = SettingsResult.Success(Unit)
}
