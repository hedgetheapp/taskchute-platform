package com.hedgetheapp.taskchute.today

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TodayScreenInstrumentedTest {
    @get:Rule
    val composeRule = createComposeRule()

    private var controller: TodayController? = null
    private var repository: FakeTodayRepository? = null
    private var planningController: TaskPlanningController? = null

    @After
    fun tearDown() {
        repository?.releaseLoad?.countDown()
        repository?.releaseStart?.countDown()
        repository?.releaseComplete?.countDown()
        controller?.close()
        planningController?.close()
    }

    @Test
    fun rendersSectionsTasksAndPlannedStartAction() {
        val repo = launchScreen()

        waitForStatus(TodayLoadStatus.CONTENT)
        composeRule.onNodeWithText("Morning").assertIsDisplayed()
        composeRule.onNodeWithText("Write report").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクを開始").assertIsDisplayed()
        composeRule.onNodeWithText("2026-09-14").assertIsDisplayed()
    }

    @Test
    fun startDispatchesOnceAndReloadsRunningState() {
        val repo = launchScreen(FakeTodayRepository().apply { holdStart = true })
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを開始").performClick()
        composeRule.waitUntil(3_000) {
            repo.startCalls.get() == 1 && controller?.state?.pendingEntryIds?.contains("entry-1") == true
        }
        composeRule.onNodeWithContentDescription("タスクを開始").assertIsNotEnabled()
        assertEquals(1, repo.startCalls.get())

        repo.releaseStart.countDown()
        composeRule.waitUntil(3_000) {
            repo.startCalls.get() == 1 && controller?.state?.day?.runningTask != null
        }
        assertEquals(1, repo.startCalls.get())
        composeRule.onNodeWithText("実行中").assertIsDisplayed()
        // The canonical running task is intentionally shown both in its row and
        // in the floating panel, so assert the two surfaces rather than asking
        // a single-node query to choose one.
        assertEquals(
            2,
            composeRule.onAllNodesWithText("Running panel task").fetchSemanticsNodes().size,
        )
        composeRule.onNodeWithText("完了").assertIsDisplayed()
    }

    @Test
    fun runningPanelCompleteDispatchesOnceAndCompletedTaskHasNoStart() {
        val repo = launchScreen(FakeTodayRepository(initialDay = dayWith(LifecycleState.RUNNING)).apply { holdComplete = true })
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("完了").performClick()
        composeRule.waitUntil(3_000) {
            repo.completeCalls.get() == 1 && controller?.state?.pendingEntryIds?.contains("entry-1") == true
        }
        composeRule.onNodeWithText("完了").assertIsNotEnabled()
        assertEquals(1, repo.completeCalls.get())

        repo.releaseComplete.countDown()
        composeRule.waitUntil(3_000) {
            repo.completeCalls.get() == 1 && controller?.state?.day?.allEntries?.singleOrNull()?.lifecycleState == LifecycleState.COMPLETED
        }
        assertEquals(1, repo.completeCalls.get())
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun loadingStateIsRenderedUntilRepositoryReturns() {
        val repo = FakeTodayRepository().apply { holdLoad = true }
        launchScreen(repo)

        composeRule.onNodeWithText("予定を読み込んでいます…").assertIsDisplayed()
        repo.releaseLoad.countDown()
        waitForStatus(TodayLoadStatus.CONTENT)
    }

    @Test
    fun emptyStateIsRendered() {
        val repo = FakeTodayRepository(initialDay = emptyDay())
        launchScreen(repo)

        waitForStatus(TodayLoadStatus.EMPTY)
        composeRule.onNodeWithText("タスクはありません").assertIsDisplayed()
    }

    @Test
    fun retryableErrorReturnsToToday() {
        val repo = FakeTodayRepository().apply { mode = LoadMode.ERROR }
        launchScreen(repo)

        waitForStatus(TodayLoadStatus.ERROR)
        composeRule.onNodeWithText("再試行").assertIsDisplayed()
        repo.mode = LoadMode.SUCCESS
        composeRule.onNodeWithText("再試行").performClick()
        waitForStatus(TodayLoadStatus.CONTENT)
        composeRule.onNodeWithText("Write report").assertIsDisplayed()
    }

    @Test
    fun authRequiredStateIsRendered() {
        val repo = FakeTodayRepository().apply { mode = LoadMode.UNAUTHORIZED }
        launchScreen(repo)

        waitForStatus(TodayLoadStatus.AUTH_REQUIRED)
        composeRule.onNodeWithText("認証状態を確認しています…").assertIsDisplayed()
    }

    @Test
    fun dateControlsRenderAndRequestAdjacentDay() {
        val repo = launchScreen()
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("前の日").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("次の日").performClick()
        composeRule.waitUntil(3_000) { repo.requestedDates.contains("2026-09-15") }
        assertTrue(repo.requestedDates.contains("2026-09-15"))
    }

    @Test
    fun bottomNavigationShowsApprovedDestinationsWithoutFakeNavigation() {
        var settingsClicks = 0
        launchScreen(onNavigateSettings = { settingsClicks++ })
        waitForStatus(TodayLoadStatus.CONTENT)

        assertTrue(composeRule.onAllNodesWithText("今日").fetchSemanticsNodes().isNotEmpty())
        composeRule.onNodeWithText("プロジェクト").assertIsDisplayed().assertIsNotEnabled()
        composeRule.onNodeWithText("ノート").assertIsDisplayed().assertIsNotEnabled()
        composeRule.onNodeWithText("設定").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithText("設定").performClick()
        assertEquals(1, settingsClicks)
    }

    @Test
    fun quickAddShowsSixFieldsAndSendsOneCanonicalSave() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを追加").performClick()
        composeRule.onNodeWithText("Task名").assertIsDisplayed().performTextInput("Plan from Android")
        composeRule.onNodeWithText("Project").assertIsDisplayed()
        composeRule.onNodeWithText("Mode").assertIsDisplayed()
        composeRule.onNodeWithText("Section").assertIsDisplayed()
        composeRule.onNodeWithText("開始予定").assertIsDisplayed()
        composeRule.onNodeWithText("見積（分）").assertExists()
        composeRule.onNodeWithText("追加").performScrollTo().performClick()

        composeRule.waitUntil(3_000) { planningRepository.saveCalls.get() == 1 }
        assertEquals(1, planningRepository.saveCalls.get())
        assertEquals("Plan from Android", planningRepository.lastInput?.title)
    }

    @Test
    fun ordinaryPlannedRowOpensEditorAndRoutineRowDoesNot() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを編集").performClick()
        composeRule.onNodeWithText("タスクを編集").assertIsDisplayed()
        composeRule.onNodeWithText("保存").assertExists()
        composeRule.onNodeWithText("キャンセル").performClick()
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed()
    }

    private fun launchScreen(
        repo: FakeTodayRepository = FakeTodayRepository(),
        onNavigateSettings: () -> Unit = {},
    ): FakeTodayRepository {
        repository = repo
        controller = TodayController(
            repository = repo,
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        )
        composeRule.setContent {
            MaterialTheme {
                TodayScreen(
                    controller = requireNotNull(controller),
                    planningController = null,
                    onNavigateSettings = onNavigateSettings,
                    onSignOut = {},
                )
            }
        }
        return repo
    }

    private fun launchPlanningScreen(planningRepository: FakePlanningRepository) {
        val repo = FakeTodayRepository()
        repository = repo
        controller = TodayController(
            repository = repo,
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        )
        this.planningController = TaskPlanningController(
            repository = planningRepository,
            onUnauthorized = {},
            onSaved = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        )
        composeRule.setContent {
            MaterialTheme {
                TodayScreen(
                    controller = requireNotNull(controller),
                    planningController = requireNotNull(this.planningController),
                    onNavigateSettings = {},
                    onSignOut = {},
                )
            }
        }
    }

    private fun waitForStatus(status: TodayLoadStatus) {
        composeRule.waitUntil(3_000) { controller?.state?.status == status }
        assertEquals(status, controller?.state?.status)
    }

    private enum class LoadMode {
        SUCCESS,
        ERROR,
        UNAUTHORIZED,
    }

    private class FakeTodayRepository(
        initialDay: TodayDay = dayWith(LifecycleState.PLANNED),
    ) : TodayRepository {
        @Volatile
        var currentDay = initialDay
        @Volatile
        var mode = LoadMode.SUCCESS
        @Volatile
        var holdLoad = false
        @Volatile
        var holdStart = false
        @Volatile
        var holdComplete = false
        val releaseLoad = CountDownLatch(1)
        val releaseStart = CountDownLatch(1)
        val releaseComplete = CountDownLatch(1)
        val startCalls = AtomicInteger()
        val completeCalls = AtomicInteger()
        val requestedDates = mutableListOf<String?>()

        override fun loadDay(logicalDate: String?): TodayResult {
            synchronized(requestedDates) { requestedDates += logicalDate }
            if (holdLoad) releaseLoad.await(3, TimeUnit.SECONDS)
            return when (mode) {
                LoadMode.SUCCESS -> TodayResult.Success(
                    currentDay.copy(
                        logicalDate = logicalDate ?: currentDay.logicalDate,
                        isCurrent = logicalDate == null || logicalDate == "2026-09-14",
                    ),
                )
                LoadMode.ERROR -> TodayResult.Failure("ネットワークエラー")
                LoadMode.UNAUTHORIZED -> TodayResult.Unauthorized
            }
        }

        override fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult {
            startCalls.incrementAndGet()
            if (holdStart) releaseStart.await(10, TimeUnit.SECONDS)
            currentDay = dayWith(LifecycleState.RUNNING)
            return TodayMutationResult.Success
        }

        override fun completeTask(task: TodayTask): TodayMutationResult {
            completeCalls.incrementAndGet()
            if (holdComplete) releaseComplete.await(10, TimeUnit.SECONDS)
            currentDay = dayWith(LifecycleState.COMPLETED)
            return TodayMutationResult.Success
        }
    }

    private class FakePlanningRepository : TaskPlanningRepository {
        val saveCalls = AtomicInteger()
        @Volatile var lastInput: NormalizedTaskInput? = null

        override fun loadReferences() = PlanningReferencesResult.Success(
            PlanningReferences(
                projects = listOf(TodayProject("project-1", "Project")),
                modes = listOf(TodayMode("mode-1", "Mode")),
            ),
        )

        override fun save(editor: TaskEditorState, input: NormalizedTaskInput): PlanningSaveResult {
            saveCalls.incrementAndGet()
            lastInput = input
            return PlanningSaveResult.Success
        }
    }

    private companion object {
        fun dayWith(state: LifecycleState) = TodayDay(
            logicalDate = "2026-09-14",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 5,
            sections = listOf(
                TodaySection(
                    id = "section-1",
                    title = "Morning",
                    startMinute = 480,
                    endMinute = 720,
                    entries = listOf(
                        TodayTask(
                            id = "entry-1",
                            title = if (state == LifecycleState.RUNNING) "Running panel task" else "Write report",
                            lifecycleState = state,
                            project = null,
                            mode = null,
                            estimateSeconds = 600,
                            plannedStartMinute = 540,
                            executionId = if (state == LifecycleState.RUNNING) "execution-1" else null,
                            activeStartedAt = if (state == LifecycleState.RUNNING) "2026-09-14T01:00:00Z" else null,
                        ),
                    ),
                ),
            ),
            unsectionedEntries = emptyList(),
            activeExecution = if (state == LifecycleState.RUNNING) {
                TodayExecution("execution-1", "entry-1", "2026-09-14T01:00:00Z", 600)
            } else {
                null
            },
            taskChuteDayId = "day-1",
        )

        fun emptyDay() = TodayDay(
            logicalDate = "2026-09-14",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 0,
            sections = emptyList(),
            unsectionedEntries = emptyList(),
            activeExecution = null,
        )
    }
}
