package com.hedgetheapp.taskchute.review

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hedgetheapp.taskchute.ui.TaskChuteTheme
import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayResult
import com.hedgetheapp.taskchute.today.TodaySection
import com.hedgetheapp.taskchute.today.TodayTask
import java.time.LocalDate
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReviewScreenInstrumentedTest {
    @get:Rule
    val composeRule = createComposeRule()
    private val controllers = mutableListOf<ReviewDailyMetricsController>()
    private val periodControllers = mutableListOf<ReviewPeriodMetricsController>()

    @After
    fun closeControllers() {
        controllers.forEach(ReviewDailyMetricsController::close)
        periodControllers.forEach(ReviewPeriodMetricsController::close)
    }

    @Test
    fun primaryViewsSharePeriodSelectionAndNavigationRemainsAvailable() {
        val todayNavigations = AtomicInteger()
        val controller = metricsController { logicalDate ->
            if (logicalDate == null || logicalDate == "2026-01-31") {
                day("2026-01-31", current = true, entries = sampleEntries())
            } else {
                day(logicalDate, current = false, entries = emptyList())
            }
        }
        val periodController = periodMetricsController { granularity, anchor ->
            ReviewPeriodMetricsResult.Success(periodMetrics(granularity, anchor, completed = if (anchor == "2026-01-01") 4 else 6))
        }
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    dailyMetricsController = controller,
                    periodMetricsController = periodController,
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
        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("2 件").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithText("Completed actual duration").assertIsDisplayed()
        composeRule.onNodeWithText("1時間 2分 3秒").assertIsDisplayed()

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
        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("4 件").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithText("Completed actual duration").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Next period").performClick()
        composeRule.onNodeWithContentDescription("Selected period: 2026/02").assertIsDisplayed()
        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("6 件").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithContentDescription("Project").performClick()
        composeRule.onNodeWithContentDescription("Selected period: 2026/02").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Review period: Monthly").performClick()
        composeRule.onNodeWithText("Yearly").performClick()
        composeRule.onNodeWithContentDescription("Selected period: 2026").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Date").performClick()
        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("6 件").fetchSemanticsNodes().isNotEmpty() }

        composeRule.onNodeWithContentDescription("Task").performClick()
        assertEquals(1, todayNavigations.get())
    }

    @Test
    fun monthlyDailyViewDoesNotReuseDailyMetrics() {
        val controller = metricsController { _ -> day("2026-01-31", current = true, entries = sampleEntries()) }
        val periodController = periodMetricsController { granularity, anchor ->
            ReviewPeriodMetricsResult.Success(periodMetrics(granularity, anchor, completed = 8, duration = 240))
        }
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    dailyMetricsController = controller,
                    periodMetricsController = periodController,
                    onNavigateToday = {},
                    onNavigateNotes = {},
                    onNavigateDaily = {},
                    onNavigateSettings = {},
                    initialAnchor = LocalDate.of(2026, 1, 31),
                )
            }
        }

        composeRule.onNodeWithContentDescription("Review period: Daily").performClick()
        composeRule.onNodeWithText("Monthly").performClick()
        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("8 件").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithText("Completed actual duration").assertIsDisplayed()
        composeRule.onNodeWithText("4分").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("2 件").fetchSemanticsNodes().isEmpty())
    }

    @Test
    fun routineActivityShowsCoverageCountsAndDoesNotInventUnmeasuredZero() {
        val unmeasured = ReviewRoutineActivity(ReviewRoutineActivityCoverage.UNMEASURED, null, null, null, null)
        val partial = ReviewRoutineActivity(
            ReviewRoutineActivityCoverage.PARTIAL,
            createdCount = 2,
            deletedCount = 1,
            coverageStartedAt = "2026-10-14T02:00:00.000Z",
            coverageStartedLogicalDate = "2026-10-14",
        )
        val complete = ReviewRoutineActivity(
            ReviewRoutineActivityCoverage.COMPLETE,
            createdCount = 0,
            deletedCount = 0,
            coverageStartedAt = "2026-10-14T02:00:00.000Z",
            coverageStartedLogicalDate = "2026-10-14",
        )
        val controller = metricsController { _ -> day("2026-10-14", current = true, entries = sampleEntries()) }
        val periodController = periodMetricsController { granularity, anchor ->
            when (granularity) {
                ReviewPeriodGranularity.DAILY -> ReviewPeriodMetricsResult.RoutineActivitySuccess(unmeasured)
                ReviewPeriodGranularity.MONTHLY -> ReviewPeriodMetricsResult.Success(
                    periodMetrics(granularity, anchor, routineActivity = partial),
                )
                ReviewPeriodGranularity.YEARLY -> ReviewPeriodMetricsResult.Success(
                    periodMetrics(granularity, anchor, routineActivity = complete),
                )
            }
        }
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    dailyMetricsController = controller,
                    periodMetricsController = periodController,
                    onNavigateToday = {},
                    onNavigateNotes = {},
                    onNavigateDaily = {},
                    onNavigateSettings = {},
                    initialAnchor = LocalDate.of(2026, 10, 14),
                )
            }
        }

        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("Routine activity coverage: 未計測").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("Routine Created").assertIsDisplayed()
        composeRule.onNodeWithText("Routine Deleted").assertIsDisplayed()
        assertEquals(2, composeRule.onAllNodesWithText("—").fetchSemanticsNodes().size)

        composeRule.onNodeWithContentDescription("Review period: Daily").performClick()
        composeRule.onNodeWithText("Monthly").performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("Routine activity coverage: 一部計測（開始: 2026-10-14T02:00:00.000Z）")
                .fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("Routine Created").assertIsDisplayed()
        composeRule.onNodeWithText("2 件").assertIsDisplayed()
        composeRule.onNodeWithText("Routine Deleted").assertIsDisplayed()
        composeRule.onNodeWithText("1 件").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("Review period: Monthly").performClick()
        composeRule.onNodeWithText("Yearly").performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("Routine activity coverage: 計測済み").fetchSemanticsNodes().isNotEmpty()
        }
        assertTrue(composeRule.onAllNodesWithText("0 件").fetchSemanticsNodes().isNotEmpty())
    }

    @Test
    fun changingDailyPeriodShowsTheSelectedHistoricalDayMetrics() {
        val requests = java.util.concurrent.CopyOnWriteArrayList<String?>()
        val controller = ReviewDailyMetricsController(
            loadDay = { logicalDate ->
                requests += logicalDate
                when (logicalDate) {
                    null -> TodayResult.Success(day("2026-10-13", current = true, entries = listOf(
                        task("today-done-a", LifecycleState.COMPLETED, 3_723),
                        task("today-done-b", LifecycleState.COMPLETED, 0),
                        task("today-plan", LifecycleState.PLANNED, null),
                    )))
                    "2026-10-12" -> TodayResult.Success(day("2026-10-12", current = false, entries = listOf(
                        task("previous-done", LifecycleState.COMPLETED, 10),
                    )))
                    else -> TodayResult.Failure("unexpected date")
                }
            },
            onUnauthorized = {},
        ).also(controllers::add)
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    dailyMetricsController = controller,
                    periodMetricsController = periodMetricsController { granularity, anchor ->
                        ReviewPeriodMetricsResult.Success(periodMetrics(granularity, anchor))
                    },
                    onNavigateToday = {},
                    onNavigateNotes = {},
                    onNavigateDaily = {},
                    onNavigateSettings = {},
                )
            }
        }

        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("2 件").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithText("today-done-a").assertIsDisplayed()
        composeRule.onNodeWithText("today-done-b").assertIsDisplayed()
        composeRule.onNodeWithText("today-plan").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("running").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("Previous period").performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("2026/10/12").fetchSemanticsNodes().isNotEmpty()
                && composeRule.onAllNodesWithText("1 件").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithContentDescription("Selected period: 2026/10/12").assertIsDisplayed()
        composeRule.onNodeWithText("0 件").assertIsDisplayed()
        composeRule.onNodeWithText("10秒").assertIsDisplayed()
        composeRule.onNodeWithText("previous-done").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("today-done-a").fetchSemanticsNodes().isEmpty())
        assertEquals(listOf(null, null, "2026-10-12"), requests)
    }

    @Test
    fun longDailyListsScrollWhilePeriodControlsAndFooterStayAvailable() {
        val entries = (0 until 80).map { index -> task("planned-$index", LifecycleState.PLANNED, duration = null) }
        val controller = metricsController { _ -> day("2026-10-13", current = true, entries = entries) }
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    dailyMetricsController = controller,
                    periodMetricsController = periodMetricsController { granularity, anchor ->
                        ReviewPeriodMetricsResult.Success(periodMetrics(granularity, anchor))
                    },
                    onNavigateToday = {},
                    onNavigateNotes = {},
                    onNavigateDaily = {},
                    onNavigateSettings = {},
                    initialAnchor = LocalDate.of(2026, 10, 13),
                )
            }
        }

        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("80 件").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithTag("review-daily-list").performScrollToNode(hasText("planned-79"))
        composeRule.onNodeWithText("planned-79").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Selected period: 2026/10/13").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Task").assertIsDisplayed()
    }

    private fun metricsController(dayForDate: (String?) -> TodayDay) = ReviewDailyMetricsController(
        loadDay = { logicalDate -> TodayResult.Success(dayForDate(logicalDate)) },
        onUnauthorized = {},
    ).also(controllers::add)

    private fun periodMetricsController(
        load: (ReviewPeriodGranularity, String) -> ReviewPeriodMetricsResult,
    ) = ReviewPeriodMetricsController(
        loadMetrics = load,
        onUnauthorized = {},
    ).also(periodControllers::add)

    private fun periodMetrics(
        granularity: ReviewPeriodGranularity,
        anchor: String,
        completed: Long = 0,
        unexecuted: Long = 0,
        duration: Long = 0,
        establishedDays: Long = 1,
        routineActivity: ReviewRoutineActivity? = null,
    ) = ReviewPeriodMetrics(
        granularity = granularity,
        anchor = anchor,
        establishedDayCount = establishedDays,
        completedCount = completed,
        unexecutedCount = unexecuted,
        completedActualDurationSeconds = duration,
        routineActivity = routineActivity,
    )

    private fun sampleEntries() = listOf(
        task("completed-a", LifecycleState.COMPLETED, duration = 3_723),
        task("completed-b", LifecycleState.COMPLETED, duration = 0),
        task("planned", LifecycleState.PLANNED, duration = null),
        task("running", LifecycleState.RUNNING, duration = null),
    )

    private fun day(logicalDate: String, current: Boolean, entries: List<TodayTask>) = TodayDay(
        logicalDate = logicalDate,
        isCurrent = current,
        planningEnabled = current,
        placementRevision = 1,
        sections = listOf(TodaySection("section", "Section", 0, 1_440, entries)),
        unsectionedEntries = emptyList(),
        activeExecution = null,
        taskChuteDayId = "day-$logicalDate",
    )

    private fun task(id: String, state: LifecycleState, duration: Int?) = TodayTask(
        id = id,
        title = id,
        lifecycleState = state,
        project = null,
        mode = null,
        estimateSeconds = 86_400,
        plannedStartMinute = null,
        executionId = null,
        activeStartedAt = null,
        completedDurationSeconds = duration,
    )
}

