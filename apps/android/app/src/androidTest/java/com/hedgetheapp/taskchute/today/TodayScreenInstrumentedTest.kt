package com.hedgetheapp.taskchute.today

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.compose.ui.geometry.Offset
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
    private var directManipulationController: TodayDirectManipulationController? = null

    @After
    fun tearDown() {
        repository?.releaseLoad?.countDown()
        repository?.releaseRefresh?.countDown()
        repository?.releaseStart?.countDown()
        repository?.releaseComplete?.countDown()
        controller?.close()
        planningController?.close()
        directManipulationController?.close()
    }

    @Test
    fun rendersSectionsTasksAndPlannedStartAction() {
        val repo = launchScreen()

        waitForStatus(TodayLoadStatus.CONTENT)
        composeRule.onNodeWithText("Morning").assertIsDisplayed()
        composeRule.onNodeWithText("Write report").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクを開始").assertIsDisplayed()
        composeRule.onNodeWithText("2026-09-14", substring = true).assertIsDisplayed()
    }

    @Test
    fun sectionHeaderCollapsesAndExpandsItsLocalTaskList() {
        launchScreen()
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("Morningセクションを折りたたむ").performClick()
        assertTrue(composeRule.onAllNodesWithText("Write report").fetchSemanticsNodes().isEmpty())

        composeRule.onNodeWithContentDescription("Morningセクションを展開").performClick()
        composeRule.onNodeWithText("Write report").assertIsDisplayed()
    }

    @Test
    fun startDispatchesOnceAndReloadsRunningState() {
        val repo = launchScreen(FakeTodayRepository().apply { holdStart = true })
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを開始").performClick()
        composeRule.waitUntil(10_000) {
            repo.startCalls.get() == 1 && controller?.state?.pendingEntryIds?.contains("entry-1") == true
        }
        composeRule.onNodeWithContentDescription("タスクを開始", useUnmergedTree = true).assertIsNotEnabled()
        assertEquals(1, repo.startCalls.get())

        repo.releaseStart.countDown()
        composeRule.waitUntil(10_000) {
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
        composeRule.waitUntil(10_000) {
            repo.completeCalls.get() == 1 && controller?.state?.pendingEntryIds?.contains("entry-1") == true
        }
        composeRule.onNodeWithText("完了").assertIsNotEnabled()
        assertEquals(1, repo.completeCalls.get())

        repo.releaseComplete.countDown()
        composeRule.waitUntil(10_000) {
            repo.completeCalls.get() == 1 && controller?.state?.day?.allEntries?.singleOrNull()?.lifecycleState == LifecycleState.COMPLETED
        }
        assertEquals(1, repo.completeCalls.get())
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun loadingStateIsRenderedUntilRepositoryReturns() {
        val repo = FakeTodayRepository().apply { holdLoad = true }
        launchScreen(repo)

        composeRule.onNodeWithText("読み込み中").assertIsDisplayed()
        repo.releaseLoad.countDown()
        waitForStatus(TodayLoadStatus.CONTENT)
    }

    @Test
    fun pullToRefreshKeepsTodayContentWhileRefreshing() {
        val repo = launchScreen()
        waitForStatus(TodayLoadStatus.CONTENT)
        repo.holdRefresh = true

        controller?.refresh()
        composeRule.waitUntil(15_000) {
            repo.requestedDates.size >= 2 && controller?.state?.status == TodayLoadStatus.REFRESHING
        }
        composeRule.onNodeWithText("Write report").assertIsDisplayed()

        repo.releaseRefresh.countDown()
        waitForStatus(TodayLoadStatus.CONTENT)
    }
    @Test
    fun emptyStateIsRenderedWithQuickAdd() {
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = emptyDay().copy(taskChuteDayId = "day-1"),
        )

        waitForStatus(TodayLoadStatus.EMPTY)
        composeRule.onNodeWithText("タスクはありません").assertIsDisplayed()
        composeRule.onNodeWithText("この日の予定は空です。").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクを追加").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("実行中").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun retryableErrorUsesFullScreenCopyAndReturnsThroughLoading() {
        val repo = FakeTodayRepository().apply { mode = LoadMode.ERROR }
        launchScreen(repo)

        waitForStatus(TodayLoadStatus.ERROR)
        composeRule.onNodeWithText("予定を読み込めませんでした").assertIsDisplayed()
        composeRule.onNodeWithText("通信状態を確認して、再試行してください").assertIsDisplayed()
        composeRule.onNodeWithText("再試行").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("Write report").fetchSemanticsNodes().isEmpty())

        repo.mode = LoadMode.SUCCESS
        repo.holdLoad = true
        composeRule.onNodeWithText("再試行").performClick()
        composeRule.onNodeWithText("読み込み中").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("Write report").fetchSemanticsNodes().isEmpty())

        repo.releaseLoad.countDown()
        waitForStatus(TodayLoadStatus.CONTENT)
        composeRule.onNodeWithText("Write report").assertIsDisplayed()
        assertEquals(listOf<String?>(null, null), repo.requestedDates)
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
        composeRule.waitUntil(15_000) { repo.requestedDates.contains("2026-09-15") }
        assertTrue(repo.requestedDates.contains("2026-09-15"))
    }

    @Test
    fun dateHeaderCancelLeavesSelectedDateUnchanged() {
        val repo = launchScreen()
        waitForStatus(TodayLoadStatus.CONTENT)
        val requestsBeforePicker = repo.requestedDates.toList()

        composeRule.onNodeWithContentDescription("表示日付を選択").performClick()
        composeRule.onNodeWithText("キャンセル").performClick()

        assertEquals(requestsBeforePicker, repo.requestedDates)
        composeRule.onNodeWithText("2026-09-14", substring = true).assertIsDisplayed()
    }

    @Test
    fun dateHeaderConfirmLoadsSelectedLogicalDate() {
        val repo = launchScreen()
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("表示日付を選択").performClick()
        composeRule.onNodeWithText("決定").performClick()

        composeRule.waitUntil(15_000) { repo.requestedDates.contains("2026-09-14") }
        assertTrue(repo.requestedDates.contains("2026-09-14"))
    }
    @Test
    fun bottomNavigationShowsApprovedDestinationsWithoutFakeNavigation() {
        var settingsClicks = 0
        launchScreen(onNavigateSettings = { settingsClicks++ })
        waitForStatus(TodayLoadStatus.CONTENT)

        assertTrue(composeRule.onAllNodesWithText("今日").fetchSemanticsNodes().isNotEmpty())
        assertTrue(composeRule.onAllNodesWithText("プロジェクト").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithText("ノート").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithText("設定").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithText("設定").performClick()
        assertEquals(1, settingsClicks)
    }

    @Test

    fun plannedRowShowsProjectionEstimateStatusAndContext() {
        val task = dayWith().sections.single().entries.single().copy(
            project = TodayProject("project-work", "仕事"),
            mode = TodayMode("mode-pc", "PC"),
        )
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(task))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("開始見込み時刻: 09:00、終了見込み時刻: 09:10").assertIsDisplayed()
        composeRule.onNodeWithText("10分 /").assertIsDisplayed()
        composeRule.onNodeWithText("未開始").assertIsDisplayed()
        composeRule.onNodeWithText("仕事 / PC").assertIsDisplayed()
    }

    @Test
    fun runningRowKeepsPlannedProjectionSeparateFromActualMetadata() {
        val task = dayWith(LifecycleState.RUNNING).sections.single().entries.single().copy(
            plannedStartMinute = 600,
            estimateSeconds = 1200,
            project = TodayProject("project-work", "仕事"),
            mode = TodayMode("mode-pc", "PC"),
            activeStartedAt = "2026-09-14T01:42:00Z",
            firstStartedAt = "2026-09-14T01:42:00Z",
        )
        val initialDay = dayWith(LifecycleState.RUNNING).copy(
            sections = listOf(dayWith(LifecycleState.RUNNING).sections.single().copy(entries = listOf(task))),
            activeExecution = TodayExecution("execution-1", task.id, "2026-09-14T01:42:00Z", 1200),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("開始見込み時刻: 10:00、終了見込み時刻: 10:20").assertIsDisplayed()
        composeRule.onNodeWithText("20分 /").assertIsDisplayed()
        composeRule.onNodeWithText("仕事 / PC").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクを完了").assertIsDisplayed()
    }

    @Test
    fun completedRowUsesPlannedProjectionAndCanonicalDuration() {
        val task = dayWith(LifecycleState.COMPLETED).sections.single().entries.single().copy(
            plannedStartMinute = 480,
            estimateSeconds = 1200,
            project = TodayProject("project-work", "仕事"),
            mode = TodayMode("mode-pc", "PC"),
            firstStartedAt = "2026-09-14T00:15:00Z",
            lastEndedAt = "2026-09-14T00:35:00Z",
            completedDurationSeconds = 1200,
        )
        val initialDay = dayWith(LifecycleState.COMPLETED).copy(
            sections = listOf(dayWith(LifecycleState.COMPLETED).sections.single().copy(entries = listOf(task))),
            activeExecution = null,
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("開始見込み時刻: 08:00、終了見込み時刻: 08:20").assertIsDisplayed()
        composeRule.onNodeWithText("20分 /").assertIsDisplayed()
        composeRule.onNodeWithText("20分)").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("完了済み").assertIsDisplayed()
    }
    @Test
    fun eligibleRowsEnterSelectionModeByLeftToRightSwipeAndAutoExitWhenLastSelectionCleared() {
        val directRepository = FakeDirectManipulationRepository()
        launchPlanningScreen(FakePlanningRepository(), directRepository = directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        assertEquals(1, composeRule.onAllNodesWithContentDescription("タスクを追加").fetchSemanticsNodes().size)
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを選択: Write report").fetchSemanticsNodes().isEmpty())

        composeRule.onNodeWithText("Write report").performTouchInput { swipeRight() }
        composeRule.onNodeWithText("1件選択").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクを選択: Write report").assertIsDisplayed()
        composeRule.onNodeWithText("日付").assertIsDisplayed()
        composeRule.onNodeWithText("削除").assertIsDisplayed()
        composeRule.onNodeWithText("解除").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("前日").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("翌日").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを追加").fetchSemanticsNodes().isEmpty())

        // Clearing the only selected row exits selection mode immediately.
        composeRule.onNodeWithContentDescription("タスクをドラッグ: Write report").performClick()
        assertTrue(composeRule.onAllNodesWithText("1件選択").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを選択: Write report").fetchSemanticsNodes().isEmpty())
        assertEquals(1, composeRule.onAllNodesWithContentDescription("タスクを追加").fetchSemanticsNodes().size)

        // A checkbox tap also clears the last selection without leaving a zero-selected mode.
        composeRule.onNodeWithText("Write report").performTouchInput { swipeRight() }
        composeRule.onNodeWithContentDescription("タスクを選択: Write report").performTouchInput { click(center) }
        assertTrue(composeRule.onAllNodesWithText("1件選択").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを選択: Write report").fetchSemanticsNodes().isEmpty())
        assertEquals(1, composeRule.onAllNodesWithContentDescription("タスクを追加").fetchSemanticsNodes().size)
    }
    @Test
    fun selectionModeShowsAllRowsButOnlyEligibleRowsAreEnabledAndHidesRunningPanel() {
        val base = dayWith().sections.single().entries.single()
        val planned = base.copy(id = "planned-selection", title = "Planned selection")
        val running = base.copy(
            id = "running-selection",
            title = "Running selection",
            lifecycleState = LifecycleState.RUNNING,
            taskId = "task-running-selection",
            executionId = "execution-selection",
            activeStartedAt = "2026-09-14T01:00:00Z",
        )
        val completed = base.copy(
            id = "completed-selection",
            title = "Completed selection",
            lifecycleState = LifecycleState.COMPLETED,
            taskId = "task-completed-selection",
        )
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(planned, running, completed))),
            activeExecution = TodayExecution("execution-selection", "running-selection", "2026-09-14T01:00:00Z", 600),
        )
        val directRepository = FakeDirectManipulationRepository()
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Planned selection").performTouchInput { swipeRight() }

        composeRule.onNodeWithContentDescription("タスクを選択: Planned selection").assertIsEnabled()
        composeRule.onNodeWithContentDescription("タスクを選択: Running selection").assertIsNotEnabled()
        composeRule.onNodeWithContentDescription("タスクを選択: Completed selection").assertIsNotEnabled()
        assertEquals(1, composeRule.onAllNodesWithText("Running selection").fetchSemanticsNodes().size)
        composeRule.onNodeWithText("Completed selection").performClick()
        composeRule.onNodeWithText("1件選択").assertIsDisplayed()
    }

    @Test
    fun rightToLeftOpensActionMenuAndSeparateLeftToRightEntersSelection() {
        val directRepository = FakeDirectManipulationRepository()
        val task = dayWith().sections.single().entries.single().copy(taskId = "task-1")
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(task))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())

        // The first Left → Right gesture only closes the open menu; it does not enter selection.
        composeRule.onNodeWithText("Write report").performTouchInput { swipeRight() }
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを編集").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("1件選択").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("タスクを開始").assertIsDisplayed()

        // A separate Left → Right gesture from neutral enters selection mode.
        composeRule.onNodeWithText("Write report").performTouchInput { swipeRight() }
        composeRule.onNodeWithText("1件選択").assertIsDisplayed()
    }

    @Test
    fun openActionMenuDismissesOnAnotherRowTapAndSectionToggle() {
        val base = dayWith().sections.single().entries.single()
        val first = base.copy(id = "entry-a", title = "Write report", taskId = "task-a")
        val second = base.copy(id = "entry-b", title = "Review report", taskId = "task-b")
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(first, second))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, FakeDirectManipulationRepository())
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed()
        composeRule.onNodeWithText("Review report").performTouchInput { click(center) }
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを編集").fetchSemanticsNodes().isEmpty())

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("Morningセクションを折りたたむ").performClick()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを編集").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("Morningセクションを展開").assertIsDisplayed()
    }
    @Test
    fun rowOverflowExposesCanonicalDayOperationsForPlannedCurrentEntry() {
        launchPlanningScreen(FakePlanningRepository(), directRepository = FakeDirectManipulationRepository())
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクの操作").performClick()
        composeRule.onNodeWithText("前の日へ移動").assertIsDisplayed()
        composeRule.onNodeWithText("次の日へ移動").assertIsDisplayed()
        composeRule.onNodeWithText("日付を移動").assertIsDisplayed()
        composeRule.onNodeWithText("削除").assertIsDisplayed()
    }

    @Test
    fun longPressDragReordersEligibleRowsWithoutOpeningEdit() {
        val directRepository = FakeDirectManipulationRepository()
        val first = TodayTask(
            id = "entry-1", title = "Write report", lifecycleState = LifecycleState.PLANNED,
            project = null, mode = null, estimateSeconds = 600, plannedStartMinute = 540,
            executionId = null, activeStartedAt = null, taskId = "task-1",
        )
        val second = first.copy(id = "entry-2", title = "Review report", taskId = "task-2")
        val initialDay = dayWith().copy(sections = listOf(dayWith().sections.single().copy(entries = listOf(first, second))))
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay,
            directRepository,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceDragNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Write report")
        val sourceBounds = sourceDragNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Review report").fetchSemanticsNode().boundsInRoot
        sourceDragNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.center.y + targetBounds.height * 0.25f - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.reorderCalls.get() == 1 }
        assertEquals(1, directRepository.reorderCalls.get())
        assertTrue(directRepository.lastReorderIds?.containsAll(listOf("entry-1", "entry-2")) == true)
        assertTrue(composeRule.onAllNodesWithText("タスクを編集").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun unresolvedOperationUsesBottomPanelAndPreservesTodayForExactRetry() {
        val directRepository = FakeDirectManipulationRepository().apply {
            result = DirectManipulationResult.Ambiguous
        }
        launchPlanningScreen(FakePlanningRepository(), directRepository = directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        directManipulationController?.reorder(
            day = dayWith(),
            sectionId = "section-1",
            entryIds = listOf("entry-1"),
            affectedEntryIds = setOf("entry-1"),
        )
        composeRule.waitUntil(15_000) {
            directRepository.reorderCalls.get() == 1 &&
                directManipulationController?.state?.unresolvedRequest != null
        }

        composeRule.onNodeWithText("操作結果を確認できませんでした").assertIsDisplayed()
        composeRule.onNodeWithText("元の操作を再試行").assertIsDisplayed()
        assertTrue(
            composeRule.onAllNodesWithText("操作結果を確認できませんでした。元の操作を再試行してください。")
                .fetchSemanticsNodes()
                .isEmpty(),
        )
        composeRule.onNodeWithText("Write report").assertIsDisplayed()
        val panelMessageBounds = composeRule.onNodeWithText("操作結果を確認できませんでした")
            .fetchSemanticsNode()
            .boundsInRoot
        val fabBounds = composeRule.onNodeWithContentDescription("タスクを追加")
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue("unresolved panel must remain above the Quick Add FAB", panelMessageBounds.bottom < fabBounds.top)

        val originalRequest = directRepository.firstRequest
        directRepository.result = DirectManipulationResult.Success
        composeRule.onNodeWithText("元の操作を再試行").performClick()
        composeRule.waitUntil(15_000) {
            directRepository.reorderCalls.get() == 2 &&
                directManipulationController?.state?.unresolvedRequest == null
        }

        assertEquals(originalRequest, directRepository.lastRequest)
        composeRule.onNodeWithText("Write report").assertIsDisplayed()
    }

    @Test
    fun deterministicFailureUsesTwoLineFeedbackWithoutRetryAndKeepsToday() {
        val directRepository = FakeDirectManipulationRepository().apply {
            result = DirectManipulationResult.Failure("server detail")
        }
        launchPlanningScreen(FakePlanningRepository(), directRepository = directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        directManipulationController?.reorder(
            day = dayWith(),
            sectionId = "section-1",
            entryIds = listOf("entry-1"),
            affectedEntryIds = setOf("entry-1"),
        )
        composeRule.waitUntil(15_000) {
            directRepository.reorderCalls.get() == 1 &&
                directManipulationController?.state?.errorMessage == DETERMINISTIC_FAILURE_MESSAGE &&
                directManipulationController?.state?.unresolvedRequest == null
        }

        composeRule.onNodeWithText(DETERMINISTIC_FAILURE_MESSAGE, substring = false).assertIsDisplayed()
        composeRule.onNodeWithText("Write report").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("元の操作を再試行").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("再試行").fetchSemanticsNodes().isEmpty())
        val messageBounds = composeRule.onNodeWithText(DETERMINISTIC_FAILURE_MESSAGE, substring = false)
            .fetchSemanticsNode()
            .boundsInRoot
        val fabBounds = composeRule.onNodeWithContentDescription("タスクを追加")
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue("failure panel must remain above the Quick Add FAB", messageBounds.bottom < fabBounds.top)
    }
    @Test
    fun eligibleSwipeOffersDirectTaskNoteAndOtherSheet() {
        val directRepository = FakeDirectManipulationRepository()
        var openedTaskNote = 0
        val task = dayWith().sections.single().entries.single().copy(taskId = "task-1")
        val initialDay = dayWith().copy(logicalDate = java.time.LocalDate.now().toString(), sections = listOf(dayWith().sections.single().copy(entries = listOf(task))))
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay,
            directRepository,
            onOpenTaskNote = { openedTaskNote++ },
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクのノート").assertIsDisplayed()
        assertActionIsOnRevealedRight("Write report", "タスクを編集")
        assertSwipeActionLabelsHidden()
        composeRule.onNodeWithContentDescription("タスクの操作").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクのノート").performClick()
        assertEquals(1, openedTaskNote)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクの操作").performClick()
        composeRule.onNodeWithText("複製").assertIsDisplayed().performClick()
        composeRule.waitUntil(15_000) { directRepository.duplicateCalls.get() == 1 }
        assertEquals(1, directRepository.duplicateCalls.get())
        assertEquals(1, composeRule.onAllNodesWithText("ノート").fetchSemanticsNodes().size)
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
        composeRule.waitUntil(10_000) {
            runCatching {
                composeRule.onNodeWithText("追加", substring = false).assertIsEnabled()
                true
            }.getOrDefault(false)
        }
        composeRule.onNodeWithText("追加").performScrollTo().performClick()

        composeRule.waitUntil(15_000) { planningRepository.saveCalls.get() == 1 }
        assertEquals(1, planningRepository.saveCalls.get())
        assertEquals("Plan from Android", planningRepository.lastInput?.title)
    }

    @Test
    fun currentDayShowsOneBottomRightAddAffordance() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを追加").assertIsDisplayed()
        assertEquals(1, composeRule.onAllNodesWithContentDescription("タスクを追加").fetchSemanticsNodes().size)
    }

    @Test
    fun futureEstablishedDayAllowsPlanningButHidesExecution() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("次の日").performClick()
        composeRule.waitUntil(15_000) {
            composeRule.onAllNodesWithText("2026-09-15", substring = true).fetchSemanticsNodes().isNotEmpty()
        }

        composeRule.onNodeWithContentDescription("タスクを追加").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("実行中").fetchSemanticsNodes().isEmpty())

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun futurePlannedRowExposesPlanningActionsWithoutExecution() {
        val directRepository = FakeDirectManipulationRepository()
        var openedTaskNote = 0
        val task = dayWith().sections.single().entries.single().copy(taskId = "future-task-1")
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
            sections = listOf(dayWith().sections.single().copy(entries = listOf(task))),
        )
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = futureDay,
            directRepository = directRepository,
            onOpenTaskNote = { openedTaskNote++ },
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("タスクを追加").assertIsDisplayed()
        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクのノート").performClick()
        assertEquals(1, openedTaskNote)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクの操作").performClick()
        composeRule.onNodeWithText("複製").assertIsDisplayed().performClick()
        composeRule.waitUntil(10_000) { directRepository.duplicateCalls.get() == 1 }
        assertEquals(1, directRepository.duplicateCalls.get())
    }

    @Test
    fun futurePlannedRowEntersSelectionModeByLeftToRightSwipe() {
        val directRepository = FakeDirectManipulationRepository()
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay = futureDay, directRepository = directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeRight() }
        composeRule.onNodeWithText("1件選択").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクを選択: Write report").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
    }
    @Test
    fun bottomRightAddRemainsSeparateFromRunningPanel() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository, initialDay = dayWith(LifecycleState.RUNNING))
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを追加").assertIsDisplayed()
        composeRule.onNodeWithText("実行中").assertIsDisplayed()
        composeRule.onNodeWithText("完了").assertIsDisplayed()
        val addBounds = composeRule.onNodeWithContentDescription("タスクを追加").fetchSemanticsNode().boundsInRoot
        val panelBounds = composeRule.onNodeWithText("実行中").fetchSemanticsNode().boundsInRoot
        assertTrue(
            "Quick Add must not overlap the running panel",
            addBounds.bottom <= panelBounds.top || addBounds.top >= panelBounds.bottom,
        )
    }

    @Test
    fun emptySectionHeaderAcceptsCrossSectionMoveWithoutRelativePlacement() {
        val directRepository = FakeDirectManipulationRepository()
        val source = dayWith().sections.single().entries.single().copy(taskId = "task-1")
        val initialDay = dayWith().copy(
            sections = listOf(
                dayWith().sections.single().copy(entries = listOf(source)),
                TodaySection("section-2", "Empty section", 720, 900, emptyList()),
            ),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Write report")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val emptySectionBounds = composeRule.onNodeWithText("Empty section").fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, emptySectionBounds.center.y - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals(null, directRepository.lastMove?.placement)
        assertEquals("section-2", directRepository.lastMove?.sectionId)
    }

    @Test
    fun collapsedNonEmptyConfiguredSectionHeaderAcceptsSectionOnlyMove() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val source = base.copy(id = "entry-source", title = "Move me", taskId = "task-source")
        val existing = base.copy(id = "entry-target", title = "Existing target", taskId = "task-target")
        val initialDay = dayWith().copy(
            sections = listOf(
                TodaySection("section-source", "Source", 480, 720, listOf(source)),
                TodaySection("section-target", "Target", 720, 900, listOf(existing)),
            ),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("Targetセクションを折りたたむ").performClick()
        assertTrue(composeRule.onAllNodesWithText("Existing target").fetchSemanticsNodes().isEmpty())

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Move me")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetHeader = composeRule.onNodeWithContentDescription("Targetセクションを展開")
        val targetBounds = targetHeader.fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.center.y - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals("section-target", directRepository.lastMove?.sectionId)
        assertEquals(null, directRepository.lastMove?.placement)
        composeRule.onNodeWithContentDescription("Targetセクションを展開").assertIsDisplayed()
    }

    @Test
    fun currentRunningRowExposesRichSwipeAndMetadataEditor() {
        val task = dayWith(LifecycleState.RUNNING).sections.single().entries.single().copy(taskId = "task-running")
        val initialDay = dayWith(LifecycleState.RUNNING).copy(
            sections = listOf(dayWith(LifecycleState.RUNNING).sections.single().copy(entries = listOf(task))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onAllNodesWithText("Running panel task").get(0).performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクのノート").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクの操作").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを完了").fetchSemanticsNodes().isEmpty())
        assertActionIsOnRevealedRight("Running panel task", "タスクを編集")
        assertSwipeActionLabelsHidden()

        composeRule.onNodeWithContentDescription("タスクを編集").performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("実行中タスクの編集").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("実行中タスクの編集").assertIsDisplayed()
        composeRule.onNodeWithText("Project").assertIsDisplayed()
        composeRule.onNodeWithText("Mode").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("Section", substring = false).fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("開始予定", substring = false).fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("見積（分）", substring = false).fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun runningRowWithoutTaskIdentityKeepsEditAndOtherButNoNote() {
        launchPlanningScreen(FakePlanningRepository(), initialDay = dayWith(LifecycleState.RUNNING))
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onAllNodesWithText("Running panel task").get(0).performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクの操作").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクのノート").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun routineDerivedRunningRowRemainsNoteOnly() {
        val task = dayWith(LifecycleState.RUNNING, routineDerived = true).sections.single().entries.single().copy(taskId = "task-routine-running")
        val initialDay = dayWith(LifecycleState.RUNNING, routineDerived = true).copy(
            sections = listOf(dayWith(LifecycleState.RUNNING, routineDerived = true).sections.single().copy(entries = listOf(task))),
        )
        var openedTaskNote = 0
        launchPlanningScreen(FakePlanningRepository(), initialDay, onOpenTaskNote = { openedTaskNote++ })
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onAllNodesWithText("Running panel task").get(0).performTouchInput { swipeLeft() }
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを完了").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("タスクのノート").assertIsDisplayed().performClick()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを編集").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクの操作").fetchSemanticsNodes().isEmpty())
        assertEquals(1, openedTaskNote)
    }
    @Test
    fun completedAndRoutineRowsExposeNoteOnlySwipe() {
        var openedTaskNotes = 0
        val base = dayWith().sections.single().entries.single()
        val completed = base.copy(id = "completed", title = "Completed", taskId = "task-completed", lifecycleState = LifecycleState.COMPLETED)
        val routine = base.copy(id = "routine", title = "Routine", taskId = "task-routine", routineDerived = true)
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(completed, routine))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, onOpenTaskNote = { openedTaskNotes++ })
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Completed").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクのノート").assertIsDisplayed().performClick()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクの操作").fetchSemanticsNodes().isEmpty())

        composeRule.onNodeWithText("Routine").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクのノート").assertIsDisplayed().performClick()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクの操作").fetchSemanticsNodes().isEmpty())
        assertEquals(2, openedTaskNotes)
    }

    @Test
    fun completedRowWithoutTaskIdentityHasNoNoteSwipe() {
        launchPlanningScreen(FakePlanningRepository(), initialDay = dayWith(LifecycleState.COMPLETED))
        waitForStatus(TodayLoadStatus.CONTENT)

        assertTrue(composeRule.onAllNodesWithContentDescription("タスクのノート").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクの操作").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun pastTaskWithIdentityExposesNoteOnlySwipe() {
        var openedTaskNote = 0
        val task = dayWith().sections.single().entries.single().copy(taskId = "task-history")
        val initialDay = dayWith().copy(
            logicalDate = "2000-01-01",
            isCurrent = false,
            planningEnabled = false,
            sections = listOf(dayWith().sections.single().copy(entries = listOf(task))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, onOpenTaskNote = { openedTaskNote++ })
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクのノート").assertIsDisplayed()
        assertActionIsOnRevealedRight("Write report", "タスクのノート")
        assertSwipeActionLabelsHidden()
        composeRule.onNodeWithContentDescription("タスクのノート").performClick()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクの操作").fetchSemanticsNodes().isEmpty())
        assertEquals(1, openedTaskNote)
    }
    @Test
    fun ordinaryPlannedRowUsesSwipeRevealForEditing() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed().performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("タスクを編集").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("タスクを編集").assertIsDisplayed()
        composeRule.onNodeWithText("保存").assertExists()
        composeRule.onNodeWithText("キャンセル").performClick()
        assertTrue(composeRule.onAllNodesWithText("タスクを編集").fetchSemanticsNodes().isEmpty())

        // Auxiliary actions remain available from the swipe-revealed Task Actions entry.
        assertTrue(composeRule.onAllNodesWithText("タスクを編集").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクの操作").performClick()
        composeRule.onNodeWithText("タスク操作").assertIsDisplayed()
    }

    @Test
    fun runningRowsHaveNoEditOverflow() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository, initialDay = dayWith(LifecycleState.RUNNING))
        waitForStatus(TodayLoadStatus.CONTENT)
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを編集").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun completedRowsHaveNoEditOverflow() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository, initialDay = dayWith(LifecycleState.COMPLETED))
        waitForStatus(TodayLoadStatus.CONTENT)
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを編集").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun routineRowsHaveNoEditOverflow() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository, initialDay = dayWith(routineDerived = true))
        waitForStatus(TodayLoadStatus.CONTENT)
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを編集").fetchSemanticsNodes().isEmpty())
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

    private fun launchPlanningScreen(
        planningRepository: FakePlanningRepository,
        initialDay: TodayDay = dayWith(),
        directRepository: FakeDirectManipulationRepository? = null,
        onOpenTaskNote: (TodayTask) -> Unit = {},
    ) {
        val repo = FakeTodayRepository(initialDay = initialDay)
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
        this.directManipulationController = directRepository?.let {
            TodayDirectManipulationController(
                repository = it,
                onRefresh = controller!!::refresh,
                onUnauthorized = {},
                scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
            )
        }
        composeRule.setContent {
            MaterialTheme {
                TodayScreen(
                    controller = requireNotNull(controller),
                    planningController = requireNotNull(this.planningController),
                    onNavigateSettings = {},
                    onSignOut = {},
                    directManipulationController = this@TodayScreenInstrumentedTest.directManipulationController,
                    onOpenTaskNote = onOpenTaskNote,
                )
            }
        }
    }

    private fun waitForStatus(status: TodayLoadStatus) {
        composeRule.waitUntil(15_000) { controller?.state?.status == status }
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
        var holdRefresh = false
        @Volatile
        var holdStart = false
        @Volatile
        var holdComplete = false
        val releaseLoad = CountDownLatch(1)
        val releaseRefresh = CountDownLatch(1)
        val releaseStart = CountDownLatch(1)
        val releaseComplete = CountDownLatch(1)
        val startCalls = AtomicInteger()
        val completeCalls = AtomicInteger()
        val requestedDates = mutableListOf<String?>()

        override fun loadDay(logicalDate: String?): TodayResult {
            synchronized(requestedDates) { requestedDates += logicalDate }
            if (holdLoad) releaseLoad.await()
            if (holdRefresh) releaseRefresh.await()
            return when (mode) {
                LoadMode.SUCCESS -> TodayResult.Success(
                    currentDay.copy(
                        logicalDate = logicalDate ?: currentDay.logicalDate,
                        isCurrent = currentDay.isCurrent && (logicalDate == null || logicalDate == "2026-09-14"),
                    ),
                )
                LoadMode.ERROR -> TodayResult.Failure("ネットワークエラー")
                LoadMode.UNAUTHORIZED -> TodayResult.Unauthorized
            }
        }

        override fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult {
            startCalls.incrementAndGet()
            if (holdStart) releaseStart.await()
            currentDay = dayWith(LifecycleState.RUNNING)
            return TodayMutationResult.Success
        }

        override fun completeTask(task: TodayTask): TodayMutationResult {
            completeCalls.incrementAndGet()
            if (holdComplete) releaseComplete.await()
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

    private class FakeDirectManipulationRepository : TodayDirectManipulationRepository {
        val reorderCalls = AtomicInteger()
        val moveCalls = AtomicInteger()
        val duplicateCalls = AtomicInteger()
        val bulkMoveCalls = AtomicInteger()
        val deleteCalls = AtomicInteger()
        var lastReorderIds: List<String>? = null
        @Volatile var firstRequest: DirectManipulationRequest? = null
        @Volatile var lastRequest: DirectManipulationRequest? = null
        @Volatile var result: DirectManipulationResult = DirectManipulationResult.Success
        var lastMove: DirectManipulationRequest.Move? = null

        override fun execute(request: DirectManipulationRequest): DirectManipulationResult {
            if (firstRequest == null) firstRequest = request
            lastRequest = request
            when (request) {
                is DirectManipulationRequest.Reorder -> {
                    reorderCalls.incrementAndGet()
                    lastReorderIds = request.entryIds
                }
                is DirectManipulationRequest.Duplicate -> duplicateCalls.incrementAndGet()
                is DirectManipulationRequest.Move -> {
                    moveCalls.incrementAndGet()
                    lastMove = request
                }
                is DirectManipulationRequest.MoveToDay -> bulkMoveCalls.incrementAndGet()
                is DirectManipulationRequest.Delete -> deleteCalls.incrementAndGet()
            }
            return result
        }
    }

    private fun assertActionIsOnRevealedRight(rowTitle: String, actionDescription: String) {
        val rowBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: $rowTitle")
            .fetchSemanticsNode()
            .boundsInRoot
        val actionBounds = composeRule.onNodeWithContentDescription(actionDescription)
            .fetchSemanticsNode()
            .boundsInRoot
        assertTrue("$actionDescription must be in the revealed right-side area", actionBounds.left > rowBounds.center.x)
    }

    private fun assertSwipeActionLabelsHidden() {
        assertTrue(composeRule.onAllNodesWithText("編集", substring = false).fetchSemanticsNodes().isEmpty())
        assertEquals(1, composeRule.onAllNodesWithText("ノート", substring = false).fetchSemanticsNodes().size)
        assertTrue(composeRule.onAllNodesWithText("その他", substring = false).fetchSemanticsNodes().isEmpty())
    }
    private companion object {
        fun dayWith(state: LifecycleState = LifecycleState.PLANNED, routineDerived: Boolean = false) = TodayDay(
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
                            routineDerived = routineDerived,
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
