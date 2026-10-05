package com.hedgetheapp.taskchute.today

import android.graphics.Bitmap
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.unit.dp
import java.util.concurrent.CountDownLatch
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.io.FileOutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.After
import org.junit.Before
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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

    @Before
    fun clearDisplayPreferencesBeforeTest() {
        clearDisplayPreferences()
    }

    private fun captureTaskEditorScreenshot(name: String) {
        val bitmap = composeRule.onRoot().captureToImage().asAndroidBitmap()
        val output = InstrumentationRegistry.getInstrumentation().targetContext.cacheDir.resolve(name)
        FileOutputStream(output).use { stream ->
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream))
        }
    }

    @After
    fun tearDown() {
        repository?.releaseLoad?.countDown()
        repository?.releaseRefresh?.countDown()
        repository?.releaseStart?.countDown()
        repository?.releaseComplete?.countDown()
        controller?.close()
        planningController?.close()
        directManipulationController?.close()
        clearDisplayPreferences()
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
    fun fixedStartConflictAndSectionOverflowRemainAccessibleWhenCollapsed() {
        val prior = dayWith().sections.single().entries.single().copy(
            id = "entry-prior", title = "Prior work", estimateSeconds = 40_320, plannedStartMinute = 0,
        )
        val fixed = prior.copy(
            id = "entry-fixed", title = "Fixed meeting", estimateSeconds = 1_800,
            plannedStartMinute = 1_200, startReminderOffsetMinutes = 15,
        )
        val initialDay = dayWith().copy(
            isCurrent = false,
            startInstant = "2026-09-14T19:00:00Z",
            establishmentTimezone = "UTC",
            sections = listOf(TodaySection("section-1", "Morning", 0, 1_215, listOf(prior, fixed))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay = initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription(
            "タスクをドラッグ: Fixed meeting。固定開始20:00、終了見込み20:30、前の予定が12分重複しています",
        ).assertIsDisplayed()
        composeRule.onNodeWithText("⚠ 12分重複").assertIsDisplayed()
        val collapsedWarning = "Morningセクションを折りたたむ。警告: 固定開始への最大重複12分、セクション終了を15分超過"
        composeRule.onNodeWithContentDescription(collapsedWarning).assertIsDisplayed().performClick()
        composeRule.onNodeWithContentDescription(
            "Morningセクションを展開。警告: 固定開始への最大重複12分、セクション終了を15分超過",
        ).assertIsDisplayed()
        composeRule.onNodeWithText("⚠ 要確認").assertIsDisplayed()
    }

    @Test
    fun startDispatchesOnceAndReloadsRunningState() {
        val repo = launchScreen(FakeTodayRepository().apply { holdStart = true })
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを開始").performClick()
        composeRule.waitUntil(10_000) {
            repo.startCalls.get() == 1 && controller?.state?.pendingEntryIds?.contains("entry-1") == true
        }
        assertTrue(
            "optimistic Running projection must not retain the Start action",
            composeRule.onAllNodesWithContentDescription("タスクを開始", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isEmpty(),
        )
        assertEquals(1, repo.startCalls.get())

        repo.releaseStart.countDown()
        composeRule.waitUntil(10_000) {
            repo.startCalls.get() == 1 && controller?.state?.day?.runningTask != null
        }
        assertEquals(1, repo.startCalls.get())
        assertTrue(composeRule.onAllNodesWithText("実行中").fetchSemanticsNodes().isEmpty())
        // The canonical running task is intentionally shown both in its row and
        // in the floating panel, so assert the two surfaces rather than asking
        // a single-node query to choose one.
        assertEquals(
            2,
            composeRule.onAllNodesWithText("Running panel task").fetchSemanticsNodes().size,
        )
        composeRule.onNodeWithContentDescription("実行中タスクを完了").assertIsDisplayed()
    }

    @Test
    fun runningPanelCompleteDispatchesOnceAndCompletedTaskHasNoStart() {
        val repo = launchScreen(FakeTodayRepository(initialDay = dayWith(LifecycleState.RUNNING)).apply { holdComplete = true })
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("実行中タスクを完了").performClick()
        composeRule.waitUntil(10_000) {
            repo.completeCalls.get() == 1 && controller?.state?.pendingEntryIds?.contains("entry-1") == true
        }
        // The existing optimistic lifecycle projection removes the running panel while completion is pending.
        assertEquals(1, repo.completeCalls.get())

        repo.releaseComplete.countDown()
        composeRule.waitUntil(10_000) {
            repo.completeCalls.get() == 1 && controller?.state?.day?.allEntries?.singleOrNull()?.lifecycleState == LifecycleState.COMPLETED
        }
        assertEquals(1, repo.completeCalls.get())
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun immediateCompleteThenStartShowsOneRunningAndSerializesRequests() {
        val repo = FakeTodayRepository(initialDay = handoffDay()).apply {
            holdComplete = true
            holdStart = true
            onCompleteAccepted = { currentDay = applyOptimisticLifecycle(currentDay, it.id, LifecycleState.COMPLETED) }
            onStartAccepted = { currentDay = applyOptimisticLifecycle(currentDay, it.id, LifecycleState.RUNNING) }
        }
        launchScreen(repo)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("実行中タスクを完了").performClick()
        composeRule.waitUntil(10_000) { repo.completeCalls.get() == 1 }
        composeRule.onNodeWithContentDescription("タスクを開始").performClick()

        composeRule.waitUntil(10_000) {
            controller?.state?.presentedDay?.allEntries?.any {
                it.id == "entry-b" && it.lifecycleState == LifecycleState.RUNNING
            } == true
        }
        val optimistic = controller?.state?.presentedDay ?: error("Presented Day must remain available")
        assertEquals(LifecycleState.COMPLETED, optimistic.allEntries.single { it.id == "entry-a" }.lifecycleState)
        assertEquals(listOf("entry-b"), optimistic.allEntries.filter { it.lifecycleState == LifecycleState.RUNNING }.map { it.id })
        assertEquals("entry-b", optimistic.activeExecution?.entryId)
        assertEquals(0, repo.startCalls.get())

        repo.releaseComplete.countDown()
        composeRule.waitUntil(10_000) { repo.startCalls.get() == 1 }
        repo.releaseStart.countDown()
        composeRule.waitUntil(10_000) {
            controller?.state?.pendingEntryIds?.isEmpty() == true && controller?.state?.day?.runningTask?.id == "entry-b"
        }
        composeRule.onNodeWithContentDescription("実行中タスクを完了").assertIsDisplayed()
        assertEquals(1, repo.startCalls.get())
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
    fun todayHeaderUsesCompactDateAndDisplayMenuWithoutAdjacentDayControls() {
        val repo = launchScreen()
        waitForStatus(TodayLoadStatus.CONTENT)

        assertTrue(composeRule.onAllNodesWithContentDescription("前の日").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithContentDescription("次の日").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithText("2026-09-14 (月)").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("表示").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("完了タスクを表示").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("表示日付を選択").performClick()
        composeRule.onNodeWithText("キャンセル").performClick()
        assertTrue(repo.requestedDates.none { it == "2026-09-15" })
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

        composeRule.onNodeWithContentDescription("Task").assertIsDisplayed().assertIsEnabled()
        assertTrue(composeRule.onAllNodesWithText("プロジェクト").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("ノート一覧").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Daily").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Settings").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Settings").performClick()
        assertEquals(1, settingsClicks)
    }

    @Test
    fun completedVisibilityHidesOnlyCompletedRowsAndCanRestoreThem() {
        launchScreen(FakeTodayRepository(initialDay = displayTestDay()))
        waitForStatus(TodayLoadStatus.CONTENT)
        composeRule.onNodeWithText("Planned visibility row").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("Running visibility row").fetchSemanticsNodes().isNotEmpty())
        composeRule.onNodeWithText("Completed visibility row").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("表示").performClick()
        composeRule.onNodeWithContentDescription("完了タスクを表示").performClick()

        assertTrue(composeRule.onAllNodesWithText("Completed visibility row").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithText("Planned visibility row").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("Running visibility row").fetchSemanticsNodes().isNotEmpty())
        composeRule.onNodeWithText("Morning").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("表示").performClick()
        composeRule.onNodeWithContentDescription("完了タスクを表示").performClick()
        composeRule.onNodeWithText("Completed visibility row").assertIsDisplayed()
    }

    @Test
    fun completedOnlySectionRemainsVisibleWhenCompletedRowsAreHidden() {
        todayPreferences().setShowCompleted(false)
        launchScreen(FakeTodayRepository(initialDay = dayWith(LifecycleState.COMPLETED)))
        waitForStatus(TodayLoadStatus.CONTENT)
        assertTrue(composeRule.onAllNodesWithText("Write report").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithText("Morning").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Morningセクションを折りたたむ").assertIsDisplayed()
    }

    @Test
    fun savedDisplayAndCollapsePreferencesRestoreWhenTodayContentIsRecreated() {
        val prefs = todayPreferences()
        prefs.setShowCompleted(false)
        prefs.setCollapsedSections("2026-09-14", setOf("section-1"))
        val screenVisible = mutableStateOf(true)
        launchScreen(FakeTodayRepository(initialDay = displayTestDay()), screenVisibility = screenVisible)
        waitForStatus(TodayLoadStatus.CONTENT)
        composeRule.onNodeWithContentDescription("Morningセクションを展開").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("表示").performClick()
        composeRule.onNodeWithContentDescription("完了タスクを表示").assertIsDisplayed().assertIsEnabled()

        composeRule.runOnIdle { screenVisible.value = false }
        composeRule.waitForIdle()
        composeRule.runOnIdle { screenVisible.value = true }
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithContentDescription("Morningセクションを展開").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithContentDescription("Morningセクションを展開").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("表示").performClick()
        assertTrue(composeRule.onAllNodesWithContentDescription("完了タスクを表示").fetchSemanticsNodes().isNotEmpty())
        assertTrue(composeRule.onAllNodesWithText("Completed visibility row").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun unsectionedCollapsePreferenceRestoresFromStableSentinel() {
        val task = dayWith().sections.single().entries.single().copy(id = "unsectioned-entry", title = "Unsectioned task")
        todayPreferences().setCollapsedSections("2026-09-14", setOf(TodayDisplayPreferences.UNSECTIONED_KEY))
        launchScreen(FakeTodayRepository(initialDay = dayWith().copy(sections = emptyList(), unsectionedEntries = listOf(task))))
        waitForStatus(TodayLoadStatus.CONTENT)
        composeRule.onNodeWithContentDescription("セクションなしセクションを展開").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("Unsectioned task").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun staleSectionCollapsePreferenceIsPrunedAgainstCanonicalDay() {
        val prefs = todayPreferences()
        prefs.setCollapsedSections("2026-09-14", setOf("deleted-section"))
        launchScreen()
        waitForStatus(TodayLoadStatus.CONTENT)
        composeRule.waitUntil(5_000) { prefs.collapsedSections("2026-09-14").isEmpty() }
        composeRule.onNodeWithContentDescription("Morningセクションを折りたたむ").assertIsDisplayed()
    }

    @Test

    fun plannedRowShowsProjectionEstimateStatusAndContext() {
        val task = dayWith().sections.single().entries.single().copy(
            project = TodayProject("project-work", "仕事"),
            mode = TodayMode("mode-pc", "PC"),
        )
        val initialDay = dayWith().copy(
            isCurrent = false,
            startInstant = "2026-09-13T15:00:00Z",
            establishmentTimezone = "Asia/Tokyo",
            sections = listOf(dayWith().sections.single().copy(entries = listOf(task))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription(
            "開始見込み時刻: 00:00、終了見込み時刻: 00:10",
            useUnmergedTree = true,
        ).assertIsDisplayed()
        composeRule.onNodeWithText("10分 /").assertIsDisplayed()
        composeRule.onNodeWithText("未開始").assertIsDisplayed()
        composeRule.onNodeWithText("仕事 / PC").assertIsDisplayed()
    }

    @Test
    fun runningRowProjectsFromActualStartAndShowsActualMetadata() {
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
            establishmentTimezone = "Asia/Tokyo",
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription(
            "開始見込み時刻: 10:42、終了見込み時刻: 11:02",
            useUnmergedTree = true,
        ).assertIsDisplayed()
        composeRule.onNodeWithText("20分 /").assertIsDisplayed()
        composeRule.onNodeWithText("仕事 / PC").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクを完了").assertIsDisplayed()
    }

    @Test
    fun completedRowUsesActualProjectionAndCanonicalDuration() {
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
            establishmentTimezone = "Asia/Tokyo",
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription(
            "実績開始時刻: 09:15、実績終了時刻: 09:35",
            useUnmergedTree = true,
        ).assertIsDisplayed()
        composeRule.onNodeWithText("20分 /").assertIsDisplayed()
        composeRule.onNodeWithText("20分)").assertIsDisplayed()
        composeRule.onNodeWithText("(", substring = false).assertIsDisplayed()
        composeRule.onNodeWithContentDescription("完了済み").assertIsDisplayed()
    }

    @Test
    fun completedRowPrioritizesEndTimeWhenDurationReachesThreeDigits() {
        val task = dayWith(LifecycleState.COMPLETED).sections.single().entries.single().copy(
            plannedStartMinute = 540,
            estimateSeconds = 1200,
            firstStartedAt = "2026-09-14T09:12:00",
            lastEndedAt = "2026-09-14T16:21:00",
            completedDurationSeconds = 6_000,
        )
        val initialDay = dayWith(LifecycleState.COMPLETED).copy(
            sections = listOf(dayWith(LifecycleState.COMPLETED).sections.single().copy(entries = listOf(task))),
            activeExecution = null,
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("09:12 → 16:21", substring = false).assertIsDisplayed()
        composeRule.onNodeWithText("100分)", substring = false).assertIsDisplayed()
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
        val directRepository = FakeDirectManipulationRepository()
        launchPlanningScreen(FakePlanningRepository(), directRepository = directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクの操作").performClick()
        composeRule.onNodeWithText("前の日へ移動").assertIsDisplayed()
        composeRule.onNodeWithText("次の日へ移動").assertIsDisplayed()
        composeRule.onNodeWithText("日付を移動").assertIsDisplayed()
        composeRule.onNodeWithText("削除").assertIsDisplayed()

        composeRule.onNodeWithText("次の日へ移動").performClick()
        composeRule.waitUntil(5_000) { directRepository.bulkMoveCalls.get() == 1 }
        assertTrue(composeRule.onAllNodesWithText("次の日へ移動しました", substring = false).fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun longPressDragKeepsOnePointerGestureAndMovesRelativeToEligibleRow() {
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
            composeRule.onNodeWithText("Write report").assertIsDisplayed()
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals(0, directRepository.reorderCalls.get())
        assertEquals("entry-2", directRepository.lastMove?.placement?.anchorEntryId)
        assertFalse(directRepository.lastMove?.routineScoped == true)
        assertFalse(directRepository.lastMove?.relativePlannedStartAnchor == true)
        assertTrue(composeRule.onAllNodesWithText("タスクを編集").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun physicalTwoStepRelativeMoveUsesFreshRevisionWithoutNavigation() {
        val directRepository = FakeDirectManipulationRepository().apply {
            scriptedResults += DirectManipulationResult.SuccessWithRevision(6)
            scriptedResults += DirectManipulationResult.SuccessWithRevision(7)
        }
        val base = dayWith().sections.single().entries.single()
        val entries = (1..4).map { index ->
            base.copy(
                id = "physical-entry-$index",
                title = "Physical task $index",
                taskId = "physical-task-$index",
                plannedStartMinute = 540,
            )
        }
        val initialDay = dayWith().copy(
            placementRevision = 5,
            sections = listOf(dayWith().sections.single().copy(entries = entries)),
        )
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = initialDay,
            directRepository = directRepository,
            refreshAfterDirect = false,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        fun dragAfter(sourceTitle: String, targetTitle: String) {
            val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: $sourceTitle")
            val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
            val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: $targetTitle")
                .fetchSemanticsNode().boundsInRoot
            sourceNode.performTouchInput {
                down(center)
                advanceEventTime(600)
                moveBy(
                    Offset(0f, targetBounds.bottom - targetBounds.height * 0.1f - sourceBounds.center.y),
                    delayMillis = 100,
                )
                up()
            }
        }

        dragAfter("Physical task 2", "Physical task 3")
        composeRule.waitUntil(15_000) {
            directRepository.moves.size == 1 && controller?.state?.presentedDay?.placementRevision == 6
        }
        assertEquals(5, directRepository.moves[0].expectedPlacementRevision)

        // Same mounted Today screen and same parent pointerInput host: no navigation or reload.
        dragAfter("Physical task 2", "Physical task 4")
        composeRule.waitUntil(15_000) {
            directRepository.moves.size == 2 && controller?.state?.presentedDay?.placementRevision == 7
        }
        assertEquals(6, directRepository.moves[1].expectedPlacementRevision)
        assertEquals("physical-entry-4", directRepository.moves[1].placement?.anchorEntryId)
        assertEquals(PlacementEdge.AFTER, directRepository.moves[1].placement?.edge)
    }

    @Test
    fun physicalTwoStepRelativeMoveUsesFreshRevisionOnEstablishedFutureDay() {
        val directRepository = FakeDirectManipulationRepository().apply {
            scriptedResults += DirectManipulationResult.SuccessWithRevision(6)
            scriptedResults += DirectManipulationResult.SuccessWithRevision(7)
        }
        val base = dayWith().sections.single().entries.single()
        val entries = (1..4).map { index ->
            base.copy(
                id = "future-physical-entry-$index",
                title = "Future physical task $index",
                taskId = "future-physical-task-$index",
                plannedStartMinute = 540,
            )
        }
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
            placementRevision = 5,
            sections = listOf(dayWith().sections.single().copy(entries = entries)),
        )
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = futureDay,
            directRepository = directRepository,
            refreshAfterDirect = false,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        fun dragAfter(sourceTitle: String, targetTitle: String) {
            val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: $sourceTitle")
            val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
            val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: $targetTitle")
                .fetchSemanticsNode().boundsInRoot
            sourceNode.performTouchInput {
                down(center)
                advanceEventTime(600)
                moveBy(
                    Offset(0f, targetBounds.bottom - targetBounds.height * 0.1f - sourceBounds.center.y),
                    delayMillis = 100,
                )
                up()
            }
        }

        dragAfter("Future physical task 2", "Future physical task 3")
        composeRule.waitUntil(15_000) {
            directRepository.moves.size == 1 && controller?.state?.presentedDay?.placementRevision == 6
        }
        dragAfter("Future physical task 2", "Future physical task 4")
        composeRule.waitUntil(15_000) {
            directRepository.moves.size == 2 && controller?.state?.presentedDay?.placementRevision == 7
        }
        assertEquals(5, directRepository.moves[0].expectedPlacementRevision)
        assertEquals(6, directRepository.moves[1].expectedPlacementRevision)
        assertEquals("future-physical-entry-4", directRepository.moves[1].placement?.anchorEntryId)
    }

    @Test
    fun physicalDragUsesRevisionConfirmedByQuickAddOnSameScreen() {
        val directRepository = FakeDirectManipulationRepository().apply {
            scriptedResults += DirectManipulationResult.SuccessWithRevision(7)
        }
        val base = dayWith().sections.single().entries.single()
        val entries = (1..4).map { index ->
            base.copy(
                id = "quick-add-entry-$index",
                title = "Quick Add physical task $index",
                taskId = "quick-add-task-$index",
                plannedStartMinute = 540,
            )
        }
        val initialDay = dayWith().copy(
            placementRevision = 5,
            sections = listOf(dayWith().sections.single().copy(entries = entries)),
        )
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = initialDay,
            directRepository = directRepository,
            refreshAfterDirect = false,
        )
        waitForStatus(TodayLoadStatus.CONTENT)
        requireNotNull(controller).confirmPlacementRevision(initialDay.logicalDate, 6)
        composeRule.waitUntil(5_000) { controller?.state?.presentedDay?.placementRevision == 6 }

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Quick Add physical task 2")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Quick Add physical task 3")
            .fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(
                Offset(0f, targetBounds.bottom - targetBounds.height * 0.1f - sourceBounds.center.y),
                delayMillis = 100,
            )
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moves.size == 1 && controller?.state?.presentedDay?.placementRevision == 7 }
        assertEquals(6, directRepository.moves.single().expectedPlacementRevision)
    }

    @Test
    fun physicalRoutineMoveUsesCurrentParentPointerOwner() {
        val directRepository = FakeDirectManipulationRepository().apply {
            scriptedResults += DirectManipulationResult.SuccessWithRevision(6)
        }
        val base = dayWith().sections.single().entries.single()
        val routine = base.copy(
            id = "physical-routine-source",
            title = "Physical Routine source",
            taskId = "physical-routine-task",
            routineDerived = true,
            plannedStartMinute = 540,
        )
        val anchor = base.copy(
            id = "physical-routine-anchor",
            title = "Physical Routine anchor",
            taskId = "physical-routine-anchor-task",
            routineDerived = true,
            plannedStartMinute = 660,
        )
        val initialDay = dayWith().copy(
            placementRevision = 5,
            sections = listOf(dayWith().sections.single().copy(entries = listOf(routine, anchor))),
        )
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = initialDay,
            directRepository = directRepository,
            refreshAfterDirect = false,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Physical Routine source")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Physical Routine anchor")
            .fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.center.y - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moves.size == 1 }
        assertTrue(directRepository.moves.single().routineScoped)
        assertTrue(directRepository.moves.single().relativePlannedStartAnchor)
        assertEquals(5, directRepository.moves.single().expectedPlacementRevision)
    }

    @Test
    fun longPressDragMovesFourRowDifferentCohortUpwardWithOneMoveDispatch() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val entries = listOf("A", "B", "C", "D").mapIndexed { index, title ->
            base.copy(id = "entry-$title", title = title, taskId = "task-$title", plannedStartMinute = 540 + index * 60)
        }
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = entries)),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: D")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: B").fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.bottom - targetBounds.height * 0.1f - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals(0, directRepository.reorderCalls.get())
        assertEquals("entry-B", directRepository.lastMove?.placement?.anchorEntryId)
        assertFalse(directRepository.lastMove?.routineScoped == true)
        assertFalse(directRepository.lastMove?.relativePlannedStartAnchor == true)
    }

    @Test
    fun immediateTwoStepRelativeMoveUsesReturnedRevisionForCurrentDay() {
        val directRepository = FakeDirectManipulationRepository().apply {
            scriptedResults += DirectManipulationResult.SuccessWithRevision(6)
            scriptedResults += DirectManipulationResult.SuccessWithRevision(7)
        }
        val base = dayWith().sections.single().entries.single()
        val entries = (1..4).map { index ->
            base.copy(
                id = "entry-$index",
                title = "Task $index",
                taskId = "task-$index",
                plannedStartMinute = 540,
            )
        }
        val initialDay = dayWith().copy(
            placementRevision = 5,
            sections = listOf(dayWith().sections.single().copy(entries = entries)),
        )
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = initialDay,
            directRepository = directRepository,
            refreshAfterDirect = false,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        directManipulationController?.move(
            requireNotNull(controller?.state?.presentedDay),
            "entry-2",
            PlacementTarget("section-1", "entry-3", PlacementEdge.AFTER),
        )
        composeRule.waitUntil(15_000) {
            directRepository.moves.size == 1 && controller?.state?.presentedDay?.placementRevision == 6
        }
        assertEquals(5, directRepository.moves[0].expectedPlacementRevision)

        directManipulationController?.move(
            requireNotNull(controller?.state?.presentedDay),
            "entry-2",
            PlacementTarget("section-1", "entry-4", PlacementEdge.AFTER),
        )
        composeRule.waitUntil(15_000) {
            directRepository.moves.size == 2 && controller?.state?.presentedDay?.placementRevision == 7
        }
        assertEquals("entry-2", directRepository.moves[1].entryId)
        assertEquals("entry-4", directRepository.moves[1].placement?.anchorEntryId)
        assertEquals(PlacementEdge.AFTER, directRepository.moves[1].placement?.edge)
        assertEquals(6, directRepository.moves[1].expectedPlacementRevision)
    }

    @Test
    fun immediateTwoStepRelativeMoveUsesReturnedRevisionForEstablishedFutureDay() {
        val directRepository = FakeDirectManipulationRepository().apply {
            scriptedResults += DirectManipulationResult.SuccessWithRevision(6)
            scriptedResults += DirectManipulationResult.SuccessWithRevision(7)
        }
        val base = dayWith().sections.single().entries.single()
        val entries = (1..4).map { index ->
            base.copy(
                id = "future-entry-$index",
                title = "Future task $index",
                taskId = "future-task-$index",
                plannedStartMinute = 540,
            )
        }
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
            placementRevision = 5,
            sections = listOf(dayWith().sections.single().copy(entries = entries)),
        )
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = futureDay,
            directRepository = directRepository,
            refreshAfterDirect = false,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        directManipulationController?.move(
            requireNotNull(controller?.state?.presentedDay),
            "future-entry-2",
            PlacementTarget("section-1", "future-entry-3", PlacementEdge.AFTER),
        )
        composeRule.waitUntil(15_000) {
            directRepository.moves.size == 1 && controller?.state?.presentedDay?.placementRevision == 6
        }
        directManipulationController?.move(
            requireNotNull(controller?.state?.presentedDay),
            "future-entry-2",
            PlacementTarget("section-1", "future-entry-4", PlacementEdge.AFTER),
        )
        composeRule.waitUntil(15_000) {
            directRepository.moves.size == 2 && controller?.state?.presentedDay?.placementRevision == 7
        }
        assertEquals("future-entry-4", directRepository.moves[1].placement?.anchorEntryId)
        assertEquals(PlacementEdge.AFTER, directRepository.moves[1].placement?.edge)
        assertEquals(6, directRepository.moves[1].expectedPlacementRevision)
    }

    @Test
    fun longPressDragMovesFourRowDifferentCohortDownwardWithOneMoveDispatch() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val entries = listOf(
            base.copy(id = "entry-a", title = "Cohort A", taskId = "task-a", plannedStartMinute = 540),
            base.copy(id = "entry-b", title = "Cohort B", taskId = "task-b", plannedStartMinute = 540),
            base.copy(id = "entry-c", title = "Cohort C", taskId = "task-c", plannedStartMinute = 600),
            base.copy(id = "entry-d", title = "Cohort D", taskId = "task-d", plannedStartMinute = 600),
        )
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = entries)),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Cohort A")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Cohort D")
            .fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.bottom - targetBounds.height * 0.1f - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals(0, directRepository.reorderCalls.get())
        assertEquals("entry-d", directRepository.lastMove?.placement?.anchorEntryId)
        assertFalse(directRepository.lastMove?.routineScoped == true)
        assertFalse(directRepository.lastMove?.relativePlannedStartAnchor == true)
    }

    @Test
    fun sameCohortCurrentDayDragShowsCueAndReordersOnceOnRelease() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val first = base.copy(id = "entry-two-a", title = "Two row A", taskId = "task-two-a", plannedStartMinute = 540)
        val second = base.copy(id = "entry-two-b", title = "Two row B", taskId = "task-two-b", plannedStartMinute = 540)
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(first, second))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository, refreshAfterDirect = false)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceA = composeRule.onNodeWithContentDescription("タスクをドラッグ: Two row A")
        val sourceABounds = sourceA.fetchSemanticsNode().boundsInRoot
        val targetB = composeRule.onNodeWithContentDescription("タスクをドラッグ: Two row B")
        val targetBBounds = targetB.fetchSemanticsNode().boundsInRoot
        val root = composeRule.onRoot()
        composeRule.mainClock.autoAdvance = false
        var fingerDown = false
        try {
            root.performTouchInput {
                down(sourceABounds.center)
                fingerDown = true
                advanceEventTime(600)
                moveTo(Offset(targetBBounds.center.x, targetBBounds.bottom - 8f), delayMillis = 100)
            }
            composeRule.mainClock.advanceTimeBy(100)
            val insertionCue = composeRule.onNodeWithContentDescription("挿入位置")
            insertionCue.assertIsDisplayed()
            val cueBounds = insertionCue.fetchSemanticsNode().boundsInRoot
            assertTrue(
                "the visible insertion cue must identify the same AFTER boundary that release dispatches",
                kotlin.math.abs(cueBounds.center.y - targetBBounds.bottom) <= 4f,
            )
            assertEquals("a held drag must not dispatch before physical pointer-up", 0, directRepository.moveCalls.get())
            root.performTouchInput { up() }
            fingerDown = false
            composeRule.mainClock.advanceTimeBy(100)
        } finally {
            if (fingerDown) root.performTouchInput { up() }
            composeRule.mainClock.autoAdvance = true
        }
        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals(0, directRepository.reorderCalls.get())
        assertEquals("entry-two-b", directRepository.lastMove?.placement?.anchorEntryId)
        assertEquals(PlacementEdge.AFTER, directRepository.lastMove?.placement?.edge)
        val secondAfterMove = composeRule.onNodeWithContentDescription("タスクをドラッグ: Two row B")
            .fetchSemanticsNode().boundsInRoot
        val firstAfterMove = composeRule.onNodeWithContentDescription("タスクをドラッグ: Two row A")
            .fetchSemanticsNode().boundsInRoot
        assertTrue(
            "the released anchor/edge must change the rendered canonical section order",
            secondAfterMove.center.y < firstAfterMove.center.y,
        )
    }

    @Test
    fun samePairCanBeReversedImmediatelyAfterSuccessfulReorderWithoutRefresh() {
        val directRepository = FakeDirectManipulationRepository().apply {
            scriptedResults += DirectManipulationResult.SuccessWithRevision(6)
            scriptedResults += DirectManipulationResult.SuccessWithRevision(7)
            scriptedResults += DirectManipulationResult.SuccessWithRevision(8)
        }
        val base = dayWith().sections.single().entries.single()
        val first = base.copy(id = "entry-reverse-a", title = "Reverse A", taskId = "task-reverse-a", plannedStartMinute = 540)
        val second = base.copy(id = "entry-reverse-b", title = "Reverse B", taskId = "task-reverse-b", plannedStartMinute = 540)
        val third = base.copy(id = "entry-reverse-c", title = "Reverse C", taskId = "task-reverse-c", plannedStartMinute = 540)
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(first, second, third))),
        )
        launchPlanningScreen(
            FakePlanningRepository(), initialDay, directRepository,
            refreshAfterDirect = false, silentReconcileAfterDirect = true,
        )
        waitForStatus(TodayLoadStatus.CONTENT)
        val todayRepository = requireNotNull(repository)
        todayRepository.holdRefresh = true
        directRepository.onRequestExecuted = { request ->
            if (request is DirectManipulationRequest.Move) {
                todayRepository.currentDay = applyOptimisticDirectManipulation(todayRepository.currentDay, request)
                    .copy(placementRevision = request.expectedPlacementRevision + 1)
            }
        }

        val root = composeRule.onRoot()
        composeRule.mainClock.autoAdvance = false
        var fingerDown = false
        try {
            val sourceA = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse A")
                .fetchSemanticsNode().boundsInRoot
            val targetB = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse B")
                .fetchSemanticsNode().boundsInRoot
            root.performTouchInput {
                down(sourceA.center)
                fingerDown = true
                advanceEventTime(600)
                moveTo(Offset(targetB.center.x, targetB.bottom - 8f), delayMillis = 100)
            }
            composeRule.mainClock.advanceTimeBy(100)
            val firstCue = composeRule.onNodeWithContentDescription("挿入位置")
            firstCue.assertIsDisplayed()
            assertEquals(0, directRepository.moveCalls.get())
            root.performTouchInput { up() }
            fingerDown = false
            composeRule.mainClock.advanceTimeBy(100)

            composeRule.waitUntil(15_000) {
                directRepository.moveCalls.get() == 1 &&
                    directManipulationController?.state?.pendingEntryIds?.isEmpty() == true &&
                    synchronized(todayRepository.requestedDates) { todayRepository.requestedDates.size == 2 } &&
                    controller?.state?.presentedDay?.sections?.singleOrNull()?.entries?.map { it.id } ==
                    listOf("entry-reverse-b", "entry-reverse-a", "entry-reverse-c") &&
                    controller?.state?.presentedDay?.placementRevision == 6
            }
            assertEquals(listOf("entry-reverse-a", "entry-reverse-b", "entry-reverse-c"),
                controller?.state?.day?.sections?.single()?.entries?.map { it.id })
            assertEquals(listOf("entry-reverse-b", "entry-reverse-a", "entry-reverse-c"),
                controller?.state?.presentedDay?.sections?.single()?.entries?.map { it.id })
            assertEquals("no manual refresh is issued; only initial load and silent reconcile run", 2,
                synchronized(todayRepository.requestedDates) { todayRepository.requestedDates.size })

            // Let the first reorder's item-placement animation publish its final bounds before
            // asserting the next physical drag; the product flow does not require a refresh.
            composeRule.mainClock.advanceTimeBy(600)
            composeRule.mainClock.advanceTimeByFrame()
            val sourceB = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse B")
                .fetchSemanticsNode().boundsInRoot
            val targetA = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse A")
                .fetchSemanticsNode().boundsInRoot
            root.performTouchInput {
                down(sourceB.center)
                fingerDown = true
                advanceEventTime(600)
                moveTo(Offset(targetA.center.x, targetA.bottom - 8f), delayMillis = 100)
            }
            composeRule.mainClock.advanceTimeBy(100)
            val reverseCueVisible = composeRule.onAllNodesWithContentDescription("挿入位置")
                .fetchSemanticsNodes().isNotEmpty()
            assertTrue(
                "same-pair reverse drag must expose the boundary after A; canonical=${controller?.state?.day?.sections?.single()?.entries?.map { it.id }}, " +
                    "presented=${controller?.state?.presentedDay?.sections?.single()?.entries?.map { it.id }}, " +
                    "pending=${directManipulationController?.state?.pendingEntryIds}",
                reverseCueVisible,
            )
            val reverseCueBounds = composeRule.onNodeWithContentDescription("挿入位置")
                .fetchSemanticsNode().boundsInRoot
            assertTrue(kotlin.math.abs(reverseCueBounds.center.y - targetA.bottom) <= 4f)
            assertEquals("the reverse Move must wait for physical pointer-up", 1, directRepository.moveCalls.get())
            root.performTouchInput { up() }
            fingerDown = false
            composeRule.mainClock.advanceTimeBy(100)
        } finally {
            if (fingerDown) root.performTouchInput { up() }
            composeRule.mainClock.autoAdvance = true
        }

        composeRule.waitUntil(15_000) {
            directRepository.moveCalls.get() == 2 &&
                directManipulationController?.state?.pendingEntryIds?.isEmpty() == true
        }
        assertEquals(listOf("entry-reverse-a", "entry-reverse-b", "entry-reverse-c"),
            controller?.state?.presentedDay?.sections?.single()?.entries?.map { it.id })
        assertEquals("the second intent uses the revision confirmed by the first Move", 7,
            controller?.state?.presentedDay?.placementRevision)

        todayRepository.releaseRefresh.countDown()
        composeRule.waitUntil(15_000) {
            synchronized(todayRepository.requestedDates) { todayRepository.requestedDates.size >= 3 } &&
                controller?.state?.day?.sections?.singleOrNull()?.entries?.map { it.id } ==
                listOf("entry-reverse-a", "entry-reverse-b", "entry-reverse-c") &&
                controller?.state?.presentedDay?.placementRevision == 7
        }
        assertEquals(2, directRepository.moves.size)
        assertEquals("entry-reverse-a", directRepository.moves[0].entryId)
        assertEquals("entry-reverse-b", directRepository.moves[0].placement?.anchorEntryId)
        assertEquals(PlacementEdge.AFTER, directRepository.moves[0].placement?.edge)
        assertEquals(5, directRepository.moves[0].expectedPlacementRevision)
        assertEquals("entry-reverse-b", directRepository.moves[1].entryId)
        assertEquals("entry-reverse-a", directRepository.moves[1].placement?.anchorEntryId)
        assertEquals(PlacementEdge.AFTER, directRepository.moves[1].placement?.edge)
        assertEquals(6, directRepository.moves[1].expectedPlacementRevision)
        assertEquals(0, directRepository.reorderCalls.get())

        val sourceC = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse C")
            .fetchSemanticsNode().boundsInRoot
        val targetAAfterReconcile = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse A")
            .fetchSemanticsNode().boundsInRoot
        var thirdFingerDown = false
        composeRule.mainClock.autoAdvance = false
        try {
            root.performTouchInput {
                down(sourceC.center)
                thirdFingerDown = true
                advanceEventTime(600)
                moveTo(Offset(targetAAfterReconcile.center.x, targetAAfterReconcile.top + 8f), delayMillis = 100)
            }
            composeRule.mainClock.advanceTimeBy(100)
            composeRule.onNodeWithContentDescription("挿入位置").assertIsDisplayed()
            assertEquals("a third drag remains available after canonical reconciliation", 2, directRepository.moveCalls.get())
            root.performTouchInput { up() }
            thirdFingerDown = false
            composeRule.mainClock.advanceTimeBy(100)
        } finally {
            if (thirdFingerDown) root.performTouchInput { up() }
            composeRule.mainClock.autoAdvance = true
        }
        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 3 && directManipulationController?.state?.pendingEntryIds?.isEmpty() == true }
        assertEquals("entry-reverse-c", directRepository.moves[2].entryId)
        assertEquals("entry-reverse-a", directRepository.moves[2].placement?.anchorEntryId)
        assertEquals(PlacementEdge.BEFORE, directRepository.moves[2].placement?.edge)
        assertEquals(7, directRepository.moves[2].expectedPlacementRevision)
        val aBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse A")
            .fetchSemanticsNode().boundsInRoot
        val bBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse B")
            .fetchSemanticsNode().boundsInRoot
        val cBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Reverse C")
            .fetchSemanticsNode().boundsInRoot
        assertTrue(cBounds.center.y < aBounds.center.y && aBounds.center.y < bBounds.center.y)
    }

    @Test
    fun twoRowFutureDayMovesUpToTheOnlyMeaningfulBoundary() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val first = base.copy(id = "future-two-a", title = "Future two A", taskId = "future-two-task-a", plannedStartMinute = 540)
        val second = base.copy(id = "future-two-b", title = "Future two B", taskId = "future-two-task-b", plannedStartMinute = 600)
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-two-day",
            sections = listOf(dayWith().sections.single().copy(entries = listOf(first, second))),
        )
        launchPlanningScreen(FakePlanningRepository(), futureDay, directRepository, refreshAfterDirect = false)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceB = composeRule.onNodeWithContentDescription("タスクをドラッグ: Future two B")
        val sourceBBounds = sourceB.fetchSemanticsNode().boundsInRoot
        val targetA = composeRule.onNodeWithContentDescription("タスクをドラッグ: Future two A")
        val targetABounds = targetA.fetchSemanticsNode().boundsInRoot
        sourceB.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetABounds.top + targetABounds.height * 0.1f - sourceBBounds.center.y), delayMillis = 100)
            up()
        }
        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals("future-two-a", directRepository.lastMove?.placement?.anchorEntryId)
        assertEquals(PlacementEdge.BEFORE, directRepository.lastMove?.placement?.edge)

        assertEquals(1, directRepository.moveCalls.get())
    }

    @Test
    fun routineRelativeSameSectionDropUsesOccurrenceAwareMoveOnce() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val routine = base.copy(id = "entry-routine", title = "Routine source", taskId = "task-routine", routineDerived = true, plannedStartMinute = 540)
        val anchor = base.copy(id = "entry-routine-anchor", title = "Routine anchor", taskId = "task-routine-anchor", plannedStartMinute = 660)
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(routine, anchor))),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Routine source")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Routine anchor")
            .fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.center.y - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals("entry-routine-anchor", directRepository.lastMove?.placement?.anchorEntryId)
        assertTrue(directRepository.lastMove?.routineScoped == true)
        assertTrue(directRepository.lastMove?.relativePlannedStartAnchor == true)
    }

    @Test
    fun futureDayOrdinaryDifferentCohortDropUsesRelativeMoveOnce() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val entries = listOf("A", "B", "C", "D").mapIndexed { index, title ->
            base.copy(id = "future-entry-$title", title = "Future $title", taskId = "future-task-$title", plannedStartMinute = 540 + index * 60)
        }
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
            sections = listOf(dayWith().sections.single().copy(entries = entries)),
        )
        launchPlanningScreen(FakePlanningRepository(), futureDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Future A")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Future D")
            .fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.bottom - targetBounds.height * 0.1f - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals("future-entry-D", directRepository.lastMove?.placement?.anchorEntryId)
        assertFalse(directRepository.lastMove?.routineScoped == true)
        assertFalse(directRepository.lastMove?.relativePlannedStartAnchor == true)
    }

    @Test
    fun futureDayRoutineDifferentCohortDropUsesOccurrenceAwareMoveOnce() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val routine = base.copy(
            id = "future-routine-source",
            title = "Future Routine source",
            taskId = "future-routine-task",
            routineDerived = true,
            plannedStartMinute = 540,
        )
        val anchor = base.copy(
            id = "future-routine-anchor",
            title = "Future Routine anchor",
            taskId = "future-routine-anchor-task",
            routineDerived = true,
            plannedStartMinute = 660,
        )
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
            sections = listOf(dayWith().sections.single().copy(entries = listOf(routine, anchor))),
        )
        launchPlanningScreen(FakePlanningRepository(), futureDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Future Routine source")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Future Routine anchor")
            .fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.center.y - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals("future-routine-anchor", directRepository.lastMove?.placement?.anchorEntryId)
        assertTrue(directRepository.lastMove?.routineScoped == true)
        assertTrue(directRepository.lastMove?.relativePlannedStartAnchor == true)
    }

    @Test
    fun longPressDragMovesAcrossVisibleSectionsWithOneDispatch() {
        val directRepository = FakeDirectManipulationRepository()
        val base = dayWith().sections.single().entries.single()
        val source = base.copy(id = "entry-cross-source", title = "Cross source", taskId = "task-cross-source")
        val target = base.copy(id = "entry-cross-target", title = "Cross target", taskId = "task-cross-target")
        val initialDay = dayWith().copy(
            sections = listOf(
                TodaySection("section-cross-source", "Cross source section", 480, 720, listOf(source)),
                TodaySection("section-cross-target", "Cross target section", 720, 900, listOf(target)),
            ),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Cross source")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Cross target")
            .fetchSemanticsNode()
            .boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.center.y - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals("section-cross-target", directRepository.lastMove?.sectionId)
        assertEquals("entry-cross-target", directRepository.lastMove?.placement?.anchorEntryId)
        assertFalse(directRepository.lastMove?.relativePlannedStartAnchor == true)
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
        assertTrue("Quick Add FAB must remain above the footer-adjacent unresolved panel", fabBounds.bottom < panelMessageBounds.top)

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
        assertTrue("Quick Add FAB must remain above the footer-adjacent failure panel", fabBounds.bottom < messageBounds.top)
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithText(DETERMINISTIC_FAILURE_MESSAGE, substring = false)
                .fetchSemanticsNodes()
                .isEmpty()
        }
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
    }

    @Test
    fun quickAddShowsSixFieldsAndSendsOneCanonicalSave() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを追加").performClick()
        assertNull(planningController?.state?.editor?.draft?.startReminderOffsetMinutes)
        composeRule.onNodeWithText("開始時刻", substring = false).assertIsDisplayed()
        composeRule.onNodeWithContentDescription("開始通知タイミング").assertIsNotEnabled()
        captureTaskEditorScreenshot("d155a-task-editor-reminder-off.png")
        composeRule.onNodeWithText("開始通知", useUnmergedTree = true).assertIsDisplayed()
            .performTouchInput { click() }
        assertEquals(0, planningController?.state?.editor?.draft?.startReminderOffsetMinutes)
        captureTaskEditorScreenshot("d155a-task-editor-reminder-on-start-time.png")
        composeRule.onNodeWithContentDescription("超過通知").assertIsDisplayed().performClick()
        captureTaskEditorScreenshot("d155a-task-editor-reminder-on-overrun-on.png")
        composeRule.onNodeWithContentDescription("開始通知タイミング").assertIsEnabled().performClick()
        composeRule.onNodeWithText("15分前", substring = false).performClick()
        val editableFields = composeRule.onAllNodes(hasSetTextAction())
        val titleField = editableFields.get(0)
        titleField.assertIsFocused().performTextInput("Plan from Android")
        captureTaskEditorScreenshot("d155b-task-editor-focused-cursor.png")
        fun titleIsFocused(): Boolean {
            val config = titleField.fetchSemanticsNode().config
            return config.contains(SemanticsProperties.Focused) && config[SemanticsProperties.Focused]
        }
        fun waitForPickerAndTitleFocusToLeave(option: String) {
            composeRule.waitUntil(5_000) {
                composeRule.onAllNodesWithText(option, substring = false).fetchSemanticsNodes().isNotEmpty()
            }
            composeRule.waitUntil(5_000) { !titleIsFocused() }
            assertFalse("Task title regained focus while $option picker was open", titleIsFocused())
        }
        composeRule.onNodeWithText("プロジェクト", substring = false).performClick()
        waitForPickerAndTitleFocusToLeave("Project")
        composeRule.onNodeWithText("Project", substring = false).performClick()
        assertFalse("Task title regained focus after Project selection", titleIsFocused())
        composeRule.onNodeWithText("モード", substring = false).performClick()
        waitForPickerAndTitleFocusToLeave("Mode")
        composeRule.onNodeWithText("Mode", substring = false).performClick()
        assertFalse("Task title regained focus after Mode selection", titleIsFocused())
        composeRule.onNodeWithText("セクション", substring = false).performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("Morning", substring = false).fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.waitUntil(5_000) { !titleIsFocused() }
        assertFalse("Task title regained focus while Section picker was open", titleIsFocused())
        val morningOptions = composeRule.onAllNodesWithText("Morning", substring = false)
        morningOptions.get(morningOptions.fetchSemanticsNodes().lastIndex).performClick()
        assertFalse("Task title regained focus after Section selection", titleIsFocused())
        val startField = editableFields.get(1)
        startField.performTextClearance()
        startField.performTextInput("900")
        startField.assertIsFocused()
        val estimateField = editableFields.get(2)
        estimateField.performTextClearance()
        estimateField.performTextInput("10")
        estimateField.assertIsFocused()
        assertTrue(editableFields.fetchSemanticsNodes().size >= 3)
        listOf("Task名", "セクション", "プロジェクト", "モード", "開始予定", "見積", "開始時間", "終了時間")
            .forEach { label ->
                assertEquals(
                    "Expected one visible $label field label",
                    1,
                    composeRule.onAllNodesWithText(label, substring = false).fetchSemanticsNodes().size,
                )
            }
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
        assertEquals(15, planningRepository.lastInput?.startReminderOffsetMinutes)
        assertEquals(true, planningRepository.lastInput?.notifyOnEstimateOverrun)
        composeRule.waitUntil(5_000) {
            runCatching {
                composeRule.onNodeWithContentDescription("タスクを追加").assertIsDisplayed()
                true
            }.getOrDefault(false)
        }
        composeRule.onNodeWithContentDescription("タスクを追加").performClick()
        val nextCreateTitleField = composeRule.onAllNodes(hasSetTextAction()).get(0)
        composeRule.waitUntil(5_000) {
            val config = nextCreateTitleField.fetchSemanticsNode().config
            config.contains(SemanticsProperties.Focused) && config[SemanticsProperties.Focused]
        }
        nextCreateTitleField.assertIsFocused()
        composeRule.onNodeWithText("キャンセル").performClick()
        composeRule.waitUntil(5_000) { planningController?.state?.editor == null }
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
    fun quickAddFabCanMoveAcrossTodayContentRegion() {
        launchPlanningScreen(FakePlanningRepository())
        waitForStatus(TodayLoadStatus.CONTENT)

        val fab = composeRule.onNodeWithContentDescription("タスクを追加")
        val initialTop = fab.fetchSemanticsNode().boundsInRoot.top
        fab.performTouchInput {
            down(center)
            moveTo(center + Offset(0f, -240f), delayMillis = 100)
            up()
        }
        val movedTop = fab.fetchSemanticsNode().boundsInRoot.top
        assertTrue("Quick Add should move well beyond the old 32dp drag range", initialTop - movedTop > 80f)
    }

    @Test
    fun futureEstablishedDayAllowsPlanningButHidesExecution() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        controller?.nextDay()
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
    fun runningPanelIsFooterAdjacentAndAddFabIsAboveIt() {
        val planningRepository = FakePlanningRepository()
        launchPlanningScreen(planningRepository, initialDay = dayWith(LifecycleState.RUNNING))
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithContentDescription("タスクを追加").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("実行中").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("実行中タスクを完了").assertIsDisplayed()
        val addBounds = composeRule.onNodeWithContentDescription("タスクを追加").fetchSemanticsNode().boundsInRoot
        val panelBounds = composeRule.onNodeWithContentDescription("実行中タスクを完了").fetchSemanticsNode().boundsInRoot
        assertTrue(
            "Quick Add must sit above the footer-adjacent running panel",
            addBounds.bottom <= panelBounds.top,
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
    fun emptyUnsectionedHeaderMountsAfterDragStartAndAcceptsMove() {
        val directRepository = FakeDirectManipulationRepository()
        val source = dayWith().sections.single().entries.single().copy(taskId = "task-source")
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(source))),
            unsectionedEntries = emptyList(),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository, refreshAfterDirect = false)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Write report")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            // The temporary unsectioned header is mounted after drag handoff. Its expected
            // center is one 12dp gap plus half of the 38dp header below the source row;
            // move once to that position, then nudge after the layout publishes its bounds.
            val pxPerDp = sourceBounds.height / 84f
            val headerDelta = sourceBounds.height * 0.5f + 31f * pxPerDp
            moveBy(Offset(0f, headerDelta), delayMillis = 100)
            moveBy(Offset(0f, 2f), delayMillis = 100)
            assertTrue(composeRule.onAllNodesWithContentDescription("挿入位置").fetchSemanticsNodes().isEmpty())
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals(null, directRepository.lastMove?.sectionId)
        assertEquals(null, directRepository.lastMove?.placement)
    }

    @Test
    fun multipleEmptySectionHeadersRemainIndividuallySpatialTargets() {
        val directRepository = FakeDirectManipulationRepository()
        val source = dayWith().sections.single().entries.single().copy(taskId = "task-source")
        val base = dayWith().sections.single()
        val initialDay = dayWith().copy(
            sections = listOf(
                base.copy(id = "section-source", title = "Morning", entries = listOf(source)),
                TodaySection("section-afternoon", "Afternoon empty", 720, 900, emptyList()),
                TodaySection("section-night", "Night empty", 900, 1200, emptyList()),
            ),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository, refreshAfterDirect = false)
        waitForStatus(TodayLoadStatus.CONTENT)

        fun dragToHeader(title: String) {
            val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Write report")
            val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
            val targetBounds = composeRule.onNodeWithText(title).fetchSemanticsNode().boundsInRoot
            sourceNode.performTouchInput {
                down(center)
                advanceEventTime(600)
                moveBy(Offset(0f, targetBounds.center.y - sourceBounds.center.y), delayMillis = 100)
                assertTrue(composeRule.onAllNodesWithContentDescription("挿入位置").fetchSemanticsNodes().isEmpty())
                up()
            }
        }

        dragToHeader("Afternoon empty")
        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals("section-afternoon", directRepository.moves[0].sectionId)
        assertEquals(null, directRepository.moves[0].placement)

        dragToHeader("Night empty")
        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 2 }
        assertEquals("section-night", directRepository.moves[1].sectionId)
        assertEquals(null, directRepository.moves[1].placement)
    }

    @Test
    fun futureDayEmptySectionHeaderUsesSectionOnlyMove() {
        val directRepository = FakeDirectManipulationRepository()
        val source = dayWith().sections.single().entries.single().copy(taskId = "future-empty-source")
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-empty-day",
            sections = listOf(
                dayWith().sections.single().copy(entries = listOf(source)),
                TodaySection("future-empty-section", "Future empty", 720, 900, emptyList()),
            ),
        )
        launchPlanningScreen(FakePlanningRepository(), futureDay, directRepository, refreshAfterDirect = false)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Write report")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val targetBounds = composeRule.onNodeWithText("Future empty").fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, targetBounds.center.y - sourceBounds.center.y), delayMillis = 100)
            assertTrue(composeRule.onAllNodesWithContentDescription("挿入位置").fetchSemanticsNodes().isEmpty())
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals("future-empty-section", directRepository.lastMove?.sectionId)
        assertEquals(null, directRepository.lastMove?.placement)
    }

    @Test
    fun routineEmptySectionHeaderUsesOccurrenceAwareNoAnchorMove() {
        val directRepository = FakeDirectManipulationRepository()
        val source = dayWith().sections.single().entries.single().copy(
            taskId = "task-routine",
            routineDerived = true,
        )
        val initialDay = dayWith().copy(
            sections = listOf(
                dayWith().sections.single().copy(entries = listOf(source)),
                TodaySection("section-empty-routine", "Empty routine section", 720, 900, emptyList()),
            ),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay, directRepository)
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Write report")
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val emptySectionBounds = composeRule.onNodeWithText("Empty routine section").fetchSemanticsNode().boundsInRoot
        sourceNode.performTouchInput {
            down(center)
            advanceEventTime(600)
            moveBy(Offset(0f, emptySectionBounds.center.y - sourceBounds.center.y), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals("section-empty-routine", directRepository.lastMove?.sectionId)
        assertEquals(null, directRepository.lastMove?.placement)
        assertTrue(directRepository.lastMove?.routineScoped == true)
        assertFalse(directRepository.lastMove?.relativePlannedStartAnchor == true)
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
    fun longPressDragNearBottomEdgeAutoScrollsTowardInitiallyOffscreenRows() {
        val directRepository = FakeDirectManipulationRepository().apply {
            // Keep the list at the post-drag scroll position long enough to assert
            // that the initially off-screen anchor became visible.
            result = DirectManipulationResult.Ambiguous
        }
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = longDragCrossSectionDay(),
            directRepository = directRepository,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceNode = composeRule.onNodeWithContentDescription("タスクをドラッグ: Drag source")
        assertTrue(composeRule.onAllNodesWithText("Offscreen target", substring = false).fetchSemanticsNodes().isEmpty())
        val sourceBounds = sourceNode.fetchSemanticsNode().boundsInRoot
        val rootBounds = composeRule.onRoot().fetchSemanticsNode().boundsInRoot
        composeRule.onRoot().performTouchInput {
            down(sourceBounds.center)
            advanceEventTime(600)
            // The API 33 fixture is 1080x2400; keep the pointer inside the measured
            // LazyColumn viewport's bottom edge zone rather than relying on a device-
            // specific absolute screen coordinate.
            moveTo(Offset(sourceBounds.center.x, rootBounds.bottom - 180f), delayMillis = 100)
            advanceEventTime(1_000)
            assertEquals(0, directRepository.moveCalls.get())
            // Once the list has advanced, move into the newly revealed destination row
            // while keeping the same physical pointer session.
            moveBy(Offset(0f, -400f), delayMillis = 100)
            up()
        }

        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals("section-target", directRepository.lastMove?.sectionId)
        assertEquals("entry-offscreen-target", directRepository.lastMove?.placement?.anchorEntryId)
        composeRule.onNodeWithText("Offscreen target", substring = false).assertIsDisplayed()
    }

    @Test
    fun routineDragAfterAutoScrollShowsAndDispatchesTheSameVisibleRowBoundary() {
        val directRepository = FakeDirectManipulationRepository()
        val scrolledDay = longDragCrossSectionDay().let { day ->
            day.copy(
                logicalDate = "2026-09-15",
                isCurrent = false,
                taskChuteDayId = "d163-established-future",
                sections = day.sections.mapIndexed { index, section ->
                    section.copy(entries = section.entries.mapIndexed { entryIndex, task ->
                        task.copy(routineDerived = index == 0 && entryIndex == 0 || index == 1)
                    })
                },
            )
        }
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay = scrolledDay,
            directRepository = directRepository,
            refreshAfterDirect = false,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        val sourceBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Drag source")
            .fetchSemanticsNode().boundsInRoot
        val root = composeRule.onRoot()
        val rootBounds = root.fetchSemanticsNode().boundsInRoot
        root.performTouchInput {
            down(sourceBounds.center)
            advanceEventTime(600)
            moveTo(Offset(sourceBounds.center.x, rootBounds.bottom - 180f), delayMillis = 100)
        }
        composeRule.mainClock.autoAdvance = false
        composeRule.mainClock.advanceTimeBy(1_200)
        // Move inside the measured viewport while keeping the same physical pointer down.
        // This pauses edge scrolling so assertions can inspect the live drag surface.
        root.performTouchInput { moveTo(Offset(sourceBounds.center.x, rootBounds.center.y)) }
        composeRule.mainClock.advanceTimeBy(100)
        val dateHeaderBottom = composeRule.onNodeWithText("2026-09-15", substring = true)
            .fetchSemanticsNode().boundsInRoot.bottom
        val footerTop = composeRule.onNodeWithContentDescription("Daily")
            .fetchSemanticsNode().boundsInRoot.top
        val sourceBoundsAfterDrop = composeRule.onAllNodesWithContentDescription("タスクをドラッグ: Drag source")
            .fetchSemanticsNodes().map { it.boundsInRoot }
        assertTrue(
            "the source row should be outside the visible Task list while the parent still owns the held drag; source=$sourceBoundsAfterDrop, list=($dateHeaderBottom,$footerTop)",
            sourceBoundsAfterDrop.none { it.bottom > dateHeaderBottom && it.top < footerTop },
        )
        val targetBounds = composeRule.onNodeWithContentDescription("タスクをドラッグ: Offscreen target")
            .fetchSemanticsNode().boundsInRoot
        val releasePosition = Offset(targetBounds.center.x, targetBounds.bottom - 20f)
        root.performTouchInput { moveTo(releasePosition) }
        composeRule.mainClock.advanceTimeBy(100)
        val cueBounds = composeRule.onNodeWithContentDescription("挿入位置").fetchSemanticsNode().boundsInRoot
        assertTrue("cue must align with the target row boundary", kotlin.math.abs(cueBounds.center.y - targetBounds.bottom) <= 4f)
        root.performTouchInput { up() }
        composeRule.mainClock.advanceTimeBy(100)
        composeRule.mainClock.autoAdvance = true
        composeRule.waitUntil(15_000) { directRepository.moveCalls.get() == 1 }
        assertEquals(1, directRepository.moveCalls.get())
        assertEquals("entry-offscreen-target", directRepository.lastMove?.placement?.anchorEntryId)
        assertEquals(PlacementEdge.AFTER, directRepository.lastMove?.placement?.edge)
        assertTrue(directRepository.lastMove?.routineScoped == true)
        assertTrue(directRepository.lastMove?.relativePlannedStartAnchor == true)
        composeRule.onNodeWithText("Offscreen target", substring = false).assertIsDisplayed()
    }

    @Test
    fun establishedFutureRoutineOccurrenceEditorAllowsOccurrenceTitleChange() {
        val planningRepository = FakePlanningRepository()
        val routine = dayWith().sections.single().entries.single().copy(routineDerived = true)
        val futureDay = dayWith().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "d163-future-title-day",
            sections = listOf(dayWith().sections.single().copy(entries = listOf(routine))),
        )
        launchPlanningScreen(planningRepository, initialDay = futureDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed().performClick()
        composeRule.onNodeWithContentDescription("開始通知", useUnmergedTree = true).assertIsNotEnabled()
        composeRule.onNodeWithContentDescription("超過通知", useUnmergedTree = true).assertIsNotEnabled()
        val titleField = composeRule.onNode(hasSetTextAction() and hasText("Write report"), useUnmergedTree = true)
        titleField.assertIsEnabled()
        titleField.performTextClearance()
        composeRule.onNode(
            hasSetTextAction() and hasText("", substring = false),
            useUnmergedTree = true,
        ).performTextInput("Occurrence title")
        composeRule.onNodeWithText("保存").performClick()
        composeRule.waitUntil(5_000) { planningRepository.saveCalls.get() == 1 }
        assertEquals("Occurrence title", planningRepository.lastInput?.title)
        assertEquals("2026-09-15", planningRepository.lastEditor?.day?.logicalDate)
        assertEquals(TaskEditorCapability.ROUTINE_PLANNING, planningRepository.lastEditor?.capability)
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
            composeRule.onAllNodesWithText("実績タスクの編集").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("実績タスクの編集").assertIsDisplayed()
        composeRule.onNodeWithText("プロジェクト").assertIsDisplayed()
        composeRule.onNodeWithText("モード").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("セクション", substring = false).fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("開始予定", substring = false).fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithText("見積", substring = false).assertIsDisplayed().assertIsEnabled()
    }

    @Test
    fun runningEditorCanClearStartAndSaveLifecycleRollbackIntent() {
        val planningRepository = FakePlanningRepository()
        val initialDay = dayWith(LifecycleState.RUNNING).copy(establishmentTimezone = "UTC")
        launchPlanningScreen(planningRepository, initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onAllNodesWithText("Running panel task").get(0).performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").performClick()
        composeRule.onNodeWithText("実績タスクの編集").assertIsDisplayed()
        composeRule.onNodeWithText("終了時間", substring = false).assertIsDisplayed()
        val fields = composeRule.onAllNodes(hasSetTextAction())
        assertEquals(3, fields.fetchSemanticsNodes().size)
        fields.get(1).performTextClearance()
        assertEquals("", planningController?.state?.editor?.draft?.actualStartText)
        assertEquals("", planningController?.state?.editor?.draft?.actualEndText)

        composeRule.onNodeWithText("保存", substring = false).performScrollTo().performClick()
        composeRule.waitUntil(10_000) { planningRepository.saveCalls.get() == 1 }
        assertNull(planningRepository.lastInput?.actualStartMinute)
        assertNull(planningRepository.lastInput?.actualEndMinute)
        composeRule.waitUntil(5_000) { planningController?.state?.editor == null }
    }

    @Test
    fun completedEditorCanKeepStartAndClearEndToRequestReopen() {
        val planningRepository = FakePlanningRepository()
        val completed = dayWith(LifecycleState.COMPLETED).sections.single().entries.single().copy(
            taskId = "task-completed",
            executionId = "execution-completed",
            firstStartedAt = "2026-09-14T09:00:13.456Z",
            lastEndedAt = "2026-09-14T09:30:15.789Z",
        )
        val initialDay = dayWith(LifecycleState.COMPLETED).copy(
            establishmentTimezone = "UTC",
            sections = listOf(dayWith().sections.single().copy(entries = listOf(completed))),
        )
        launchPlanningScreen(planningRepository, initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").performClick()
        composeRule.onNodeWithText("実績タスクの編集").assertIsDisplayed()
        val fields = composeRule.onAllNodes(hasSetTextAction())
        assertEquals(2, fields.fetchSemanticsNodes().size)
        fields.get(1).performTextClearance()
        assertEquals("09:00", planningController?.state?.editor?.draft?.actualStartText)
        assertEquals("", planningController?.state?.editor?.draft?.actualEndText)

        composeRule.onNodeWithText("保存", substring = false).performScrollTo().performClick()
        composeRule.waitUntil(10_000) { planningRepository.saveCalls.get() == 1 }
        assertEquals(540, planningRepository.lastInput?.actualStartMinute)
        assertNull(planningRepository.lastInput?.actualEndMinute)
        assertEquals("execution-completed", planningRepository.lastEditor?.originalTask?.executionId)
        composeRule.waitUntil(5_000) { planningController?.state?.editor == null }
    }

    @Test
    fun completedEditorClearsBothActualTimesAndSavesDirectPlannedRollback() {
        val planningRepository = FakePlanningRepository()
        val completed = dayWith(LifecycleState.COMPLETED).sections.single().entries.single().copy(
            taskId = "task-completed",
            executionId = "execution-completed",
            firstStartedAt = "2026-09-14T09:00:13.456Z",
            lastEndedAt = "2026-09-14T09:30:15.789Z",
        )
        val initialDay = dayWith(LifecycleState.COMPLETED).copy(
            establishmentTimezone = "UTC",
            sections = listOf(dayWith().sections.single().copy(entries = listOf(completed))),
        )
        launchPlanningScreen(planningRepository, initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクを編集").performClick()
        val fields = composeRule.onAllNodes(hasSetTextAction())
        assertEquals(2, fields.fetchSemanticsNodes().size)
        fields.get(0).performTextClearance()
        fields.get(1).performTextClearance()

        composeRule.onNodeWithText("保存", substring = false).performScrollTo().performClick()
        composeRule.waitUntil(10_000) { planningRepository.saveCalls.get() == 1 }
        assertNull(planningRepository.lastInput?.actualStartMinute)
        assertNull(planningRepository.lastInput?.actualEndMinute)
        assertEquals(LifecycleState.COMPLETED, planningRepository.lastEditor?.originalTask?.lifecycleState)
        composeRule.waitUntil(5_000) { planningController?.state?.editor == null }
    }

    @Test
    fun taskNoteIndicatorIsInformationalAndExistingSwipeNoteStillOpens() {
        val base = dayWith().sections.single().entries.single()
        val task = base.copy(
            taskId = "task-with-primary-note",
            primaryDocumentId = "empty-body-primary-document",
            project = TodayProject("project-1", "Project"),
            mode = TodayMode("mode-1", "Mode"),
        )
        val initialDay = dayWith().copy(
            sections = listOf(dayWith().sections.single().copy(entries = listOf(task))),
        )
        var openedTaskNote = 0
        launchPlanningScreen(FakePlanningRepository(), initialDay, onOpenTaskNote = { openedTaskNote++ })
        waitForStatus(TodayLoadStatus.CONTENT)

        val contextBounds = composeRule.onNodeWithText("Project / Mode").fetchSemanticsNode().boundsInRoot
        val rootBounds = composeRule.onRoot().fetchSemanticsNode().boundsInRoot
        val noteIconCenter = Offset(
            x = contextBounds.left - with(composeRule.density) { 11.dp.toPx() } - rootBounds.left,
            y = contextBounds.center.y - rootBounds.top,
        )
        composeRule.onRoot().performTouchInput { click(noteIconCenter) }
        assertEquals("The metadata icon must not open a Note", 0, openedTaskNote)

        composeRule.onNodeWithText(task.title).performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクのノート").assertIsDisplayed().performClick()
        assertEquals("The established swipe action still opens the Task Primary Note", 1, openedTaskNote)
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
        val task = dayWith(LifecycleState.RUNNING, routineDerived = true).sections.single().entries.single().copy(
            taskId = "task-routine-running",
            primaryDocumentId = "empty-body-primary-document",
        )
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
    fun pastPlannedTaskExposesEditorSingleRowDeleteAndExistingForwardMove() {
        val directRepository = FakeDirectManipulationRepository()
        val task = dayWith().sections.single().entries.single().copy(taskId = "task-history")
        val initialDay = dayWith().copy(
            logicalDate = "2000-01-01",
            isCurrent = false,
            planningEnabled = false,
            sections = listOf(dayWith().sections.single().copy(entries = listOf(task))),
        )
        launchPlanningScreen(
            FakePlanningRepository(),
            initialDay,
            directRepository,
        )
        waitForStatus(TodayLoadStatus.CONTENT)

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクのノート").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("タスクの操作").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed().performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("タスクを編集").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("タスクを編集").assertIsDisplayed()
        composeRule.onNodeWithText("開始時間", substring = false).assertIsDisplayed()
        composeRule.onNodeWithText("終了時間", substring = false).assertIsDisplayed()
        composeRule.onNodeWithText("キャンセル", substring = false).performClick()

        composeRule.onNodeWithText("Write report").performTouchInput { swipeLeft() }
        composeRule.onNodeWithContentDescription("タスクの操作").performClick()
        composeRule.onNodeWithText("今日へ移動").assertIsDisplayed()
        composeRule.onNodeWithText("日付を移動").assertIsDisplayed()
        composeRule.onNodeWithText("削除", substring = false).assertIsDisplayed().performClick()
        composeRule.onNodeWithText("選択した1件の予定を削除しますか？").assertIsDisplayed()
        composeRule.onNodeWithText("削除", substring = false).performClick()
        composeRule.waitUntil(5_000) { directRepository.deleteCalls.get() == 1 }
        val delete = directRepository.lastRequest as DirectManipulationRequest.Delete
        assertEquals(listOf(task.id), delete.entryIds)
        assertEquals("day-1", delete.taskChuteDayId)
    }

    @Test
    fun pastRunningAndCompletedRowsOpenTheirExistingHistoricalEditors() {
        val running = dayWith(LifecycleState.RUNNING).sections.single().entries.single().copy(
            id = "past-running", title = "Past Running", taskId = "task-past-running",
            executionId = "execution-past-running", activeStartedAt = "2000-01-01T09:00:00Z",
            firstStartedAt = "2000-01-01T09:00:00Z",
        )
        val completed = dayWith(LifecycleState.COMPLETED).sections.single().entries.single().copy(
            id = "past-completed", title = "Past Completed", taskId = "task-past-completed",
            executionId = "execution-past-completed", firstStartedAt = "2000-01-01T10:00:00Z",
            lastEndedAt = "2000-01-01T10:30:00Z",
        )
        val base = dayWith(LifecycleState.RUNNING)
        val initialDay = base.copy(
            logicalDate = "2000-01-01", isCurrent = false, planningEnabled = false,
            sections = listOf(base.sections.single().copy(entries = listOf(running, completed))),
            activeExecution = TodayExecution("execution-past-running", running.id, "2000-01-01T09:00:00Z", 600),
        )
        launchPlanningScreen(FakePlanningRepository(), initialDay)
        waitForStatus(TodayLoadStatus.CONTENT)

        for (taskTitle in listOf("Past Running", "Past Completed")) {
            composeRule.onNodeWithText(taskTitle).performTouchInput { swipeLeft() }
            composeRule.onNodeWithContentDescription("タスクを編集").assertIsDisplayed().performClick()
            composeRule.waitUntil(5_000) {
                composeRule.onAllNodesWithText("実績タスクの編集").fetchSemanticsNodes().isNotEmpty()
            }
            composeRule.onNodeWithText("実績タスクの編集").assertIsDisplayed()
            composeRule.onNodeWithText("プロジェクト").assertIsDisplayed()
            composeRule.onNodeWithText("モード").assertIsDisplayed()
            assertTrue(composeRule.onAllNodesWithContentDescription("タスクを開始").fetchSemanticsNodes().isEmpty())
            composeRule.onNodeWithText("キャンセル", substring = false).performClick()
        }
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
        screenVisibility: MutableState<Boolean>? = null,
    ): FakeTodayRepository {
        repository = repo
        controller = TodayController(
            repository = repo,
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        )
        composeRule.setContent {
            MaterialTheme {
                if (screenVisibility?.value != false) {
                    TodayScreen(
                        controller = requireNotNull(controller),
                        planningController = null,
                        onNavigateSettings = onNavigateSettings,
                        onSignOut = {},
                    )
                }
            }
        }
        return repo
    }

    private fun todayPreferences() = TodayDisplayPreferences(
        InstrumentationRegistry.getInstrumentation().targetContext,
    )

    private fun clearDisplayPreferences() {
        InstrumentationRegistry.getInstrumentation().targetContext
            .getSharedPreferences(TodayDisplayPreferences.PREFERENCES_NAME, 0)
            .edit()
            .clear()
            .commit()
    }

    private fun launchPlanningScreen(
        planningRepository: FakePlanningRepository,
        initialDay: TodayDay = dayWith(),
        directRepository: FakeDirectManipulationRepository? = null,
        onOpenTaskNote: (TodayTask) -> Unit = {},
        refreshAfterDirect: Boolean = true,
        silentReconcileAfterDirect: Boolean = false,
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
                onRefresh = {
                    if (silentReconcileAfterDirect) controller?.reconcileSilently()
                    else if (refreshAfterDirect) controller?.refresh()
                },
                onUnauthorized = {},
                onOptimisticIntent = controller!!::applyOptimisticDirectManipulation,
                onPlacementRevisionConfirmed = controller!!::confirmPlacementRevision,
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
        @Volatile var holdRefresh = false
        @Volatile
        var holdStart = false
        @Volatile
        var holdComplete = false
        @Volatile
        var onStartAccepted: ((TodayTask) -> Unit)? = null
        @Volatile
        var onCompleteAccepted: ((TodayTask) -> Unit)? = null
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
            onStartAccepted?.invoke(task) ?: run { currentDay = dayWith(LifecycleState.RUNNING) }
            return TodayMutationResult.Success
        }

        override fun completeTask(task: TodayTask): TodayMutationResult {
            completeCalls.incrementAndGet()
            if (holdComplete) releaseComplete.await()
            onCompleteAccepted?.invoke(task) ?: run { currentDay = dayWith(LifecycleState.COMPLETED) }
            return TodayMutationResult.Success
        }
    }

    private class FakePlanningRepository : TaskPlanningRepository {
        val saveCalls = AtomicInteger()
        @Volatile var lastInput: NormalizedTaskInput? = null
        @Volatile var lastEditor: TaskEditorState? = null

        override fun loadReferences() = PlanningReferencesResult.Success(
            PlanningReferences(
                projects = listOf(TodayProject("project-1", "Project")),
                modes = listOf(TodayMode("mode-1", "Mode")),
            ),
        )

        override fun save(editor: TaskEditorState, input: NormalizedTaskInput): PlanningSaveResult {
            saveCalls.incrementAndGet()
            lastEditor = editor
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
        val moves = CopyOnWriteArrayList<DirectManipulationRequest.Move>()
        val scriptedResults = CopyOnWriteArrayList<DirectManipulationResult>()
        @Volatile var onRequestExecuted: ((DirectManipulationRequest) -> Unit)? = null

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
                    moves += request
                }
                is DirectManipulationRequest.MoveToDay -> bulkMoveCalls.incrementAndGet()
                is DirectManipulationRequest.Delete -> deleteCalls.incrementAndGet()
                is DirectManipulationRequest.HardDelete -> deleteCalls.incrementAndGet()
            }
            onRequestExecuted?.invoke(request)
            return scriptedResults.removeFirstOrNull() ?: result
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
        assertTrue(composeRule.onAllNodesWithText("ノート", substring = false).fetchSemanticsNodes().isEmpty())
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

        fun handoffDay() = dayWith().copy(
            sections = listOf(
                TodaySection(
                    id = "section-1",
                    title = "Morning",
                    startMinute = 480,
                    endMinute = 720,
                    entries = listOf(
                        dayWith(LifecycleState.RUNNING).sections.single().entries.single().copy(
                            id = "entry-a", title = "Task A", taskId = "task-a", executionId = "execution-a",
                        ),
                        dayWith().sections.single().entries.single().copy(
                            id = "entry-b", title = "Task B", taskId = "task-b",
                        ),
                    ),
                ),
            ),
            activeExecution = TodayExecution("execution-a", "entry-a", "2026-09-14T01:00:00Z", 600),
        )

        fun displayTestDay(): TodayDay {
            val planned = dayWith().sections.single().entries.single().copy(
                id = "planned-visible", title = "Planned visibility row",
            )
            val running = dayWith(LifecycleState.RUNNING).sections.single().entries.single().copy(
                id = "running-visible", title = "Running visibility row",
            )
            val completed = dayWith(LifecycleState.COMPLETED).sections.single().entries.single().copy(
                id = "completed-visible", title = "Completed visibility row",
            )
            return dayWith().copy(
                sections = listOf(dayWith().sections.single().copy(entries = listOf(planned, running, completed))),
                activeExecution = TodayExecution(
                    id = "execution-1",
                    entryId = running.id,
                    startedAt = "2026-09-14T01:00:00Z",
                    estimateSeconds = 600,
                ),
            )
        }

        fun emptyDay() = TodayDay(
            logicalDate = "2026-09-14",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 0,
            sections = emptyList(),
            unsectionedEntries = emptyList(),
            activeExecution = null,
        )

        fun longDragDay() = dayWith().copy(
            sections = listOf(
                dayWith().sections.single().copy(
                    entries = buildList {
                        add(
                            TodayTask(
                                id = "entry-drag-source",
                                title = "Drag source",
                                lifecycleState = LifecycleState.PLANNED,
                                project = null,
                                mode = null,
                                estimateSeconds = 600,
                                plannedStartMinute = 540,
                                executionId = null,
                                activeStartedAt = null,
                            ),
                        )
                        repeat(10) { index ->
                            add(
                                TodayTask(
                                    id = "entry-filler-$index",
                                    title = "Filler $index",
                                    lifecycleState = LifecycleState.PLANNED,
                                    project = null,
                                    mode = null,
                                    estimateSeconds = 600,
                                    plannedStartMinute = 540,
                                    executionId = null,
                                    activeStartedAt = null,
                                ),
                            )
                        }
                        add(
                            TodayTask(
                                id = "entry-offscreen-target",
                                title = "Offscreen target",
                                lifecycleState = LifecycleState.PLANNED,
                                project = null,
                                mode = null,
                                estimateSeconds = 600,
                                plannedStartMinute = 780,
                                executionId = null,
                                activeStartedAt = null,
                            ),
                        )
                    },
                ),
            ),
        )

        fun longDragCrossSectionDay() = longDragDay().let { sourceDay ->
            val sourceSection = sourceDay.sections.single()
            sourceDay.copy(
                sections = listOf(
                    sourceSection.copy(
                        id = "section-source",
                        title = "Source",
                        endMinute = 720,
                        entries = sourceSection.entries.dropLast(1),
                    ),
                    TodaySection(
                        id = "section-target",
                        title = "Destination",
                        startMinute = 720,
                        endMinute = 900,
                        entries = listOf(sourceSection.entries.last()),
                    ),
                ),
            )
        }
    }
}
