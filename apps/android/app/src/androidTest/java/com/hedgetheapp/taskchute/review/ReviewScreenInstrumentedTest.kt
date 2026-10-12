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

    @After
    fun closeControllers() {
        controllers.forEach(ReviewDailyMetricsController::close)
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
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    dailyMetricsController = controller,
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
        composeRule.onNodeWithText("月次・年次の集計はまだ接続されていません").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("2 件").fetchSemanticsNodes().isEmpty())
        composeRule.onNodeWithContentDescription("Next period").performClick()
        composeRule.onNodeWithContentDescription("Selected period: 2026/02").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Project").performClick()
        composeRule.onNodeWithContentDescription("Selected period: 2026/02").assertIsDisplayed()

        composeRule.onNodeWithContentDescription("Task").performClick()
        assertEquals(1, todayNavigations.get())
    }

    @Test
    fun monthlyDailyViewDoesNotReuseDailyMetrics() {
        val controller = metricsController { _ -> day("2026-01-31", current = true, entries = sampleEntries()) }
        composeRule.setContent {
            TaskChuteTheme {
                ReviewScreen(
                    dailyMetricsController = controller,
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
        composeRule.onNodeWithText("月次・年次の集計はまだ接続されていません").assertIsDisplayed()
        assertTrue(composeRule.onAllNodesWithText("0 件").fetchSemanticsNodes().isEmpty())
        assertTrue(composeRule.onAllNodesWithText("2 件").fetchSemanticsNodes().isEmpty())
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
                    onNavigateToday = {},
                    onNavigateNotes = {},
                    onNavigateDaily = {},
                    onNavigateSettings = {},
                )
            }
        }

        composeRule.waitUntil(5_000) { composeRule.onAllNodesWithText("2 件").fetchSemanticsNodes().isNotEmpty() }
        composeRule.onNodeWithContentDescription("Previous period").performClick()
        composeRule.waitUntil(5_000) {
            composeRule.onAllNodesWithText("2026/10/12").fetchSemanticsNodes().isNotEmpty()
                && composeRule.onAllNodesWithText("1 件").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithContentDescription("Selected period: 2026/10/12").assertIsDisplayed()
        composeRule.onNodeWithText("0 件").assertIsDisplayed()
        composeRule.onNodeWithText("10秒").assertIsDisplayed()
        assertEquals(listOf(null, null, "2026-10-12"), requests)
    }

    private fun metricsController(dayForDate: (String?) -> TodayDay) = ReviewDailyMetricsController(
        loadDay = { logicalDate -> TodayResult.Success(dayForDate(logicalDate)) },
        onUnauthorized = {},
    ).also(controllers::add)

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

