package com.hedgetheapp.taskchute.review

import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayActiveEntry
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayExecution
import com.hedgetheapp.taskchute.today.TodaySection
import com.hedgetheapp.taskchute.today.TodayTask
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReviewDailyMetricsProjectionTest {
    @Test
    fun countsDistinctCompletedAndPlannedEntriesAndIgnoresRunningAndOtherDaysActiveEntry() {
        val completed = task("entry-completed", LifecycleState.COMPLETED, actual = 1_800, estimate = 60)
            .copy(taskId = "shared-task")
        val duplicate = completed.copy()
        val day = establishedDay(
            sectionEntries = listOf(
                completed,
                task("entry-completed-2", LifecycleState.COMPLETED, actual = 2_100, estimate = 7_200)
                    .copy(taskId = "shared-task"),
                task("entry-planned", LifecycleState.PLANNED, actual = null, estimate = 900),
                task("entry-running", LifecycleState.RUNNING, actual = null, estimate = 300),
            ),
            unsectionedEntries = listOf(duplicate),
            activeEntry = TodayActiveEntry("other-day-running", "other-task", "別の日の実行", LifecycleState.RUNNING, 3_600),
            activeExecution = TodayExecution("other-execution", "other-day-running", "2026-10-12T15:00:00Z", 3_600),
        )

        val projection = projectReviewDailyMetrics(day) as ReviewDailyProjection.Available

        assertEquals(2, projection.metrics.completedCount)
        assertEquals(1, projection.metrics.unexecutedCount)
        assertEquals(3_900L, projection.metrics.completedActualDurationSeconds)
        assertTrue(projection.metrics.hasEntries)
    }

    @Test
    fun usesWholeServerSummaryForMultipleExecutionsAcrossMidnightOnOwningDay() {
        val completed = task(
            id = "entry-crossing-midnight",
            state = LifecycleState.COMPLETED,
            actual = 7_200,
            estimate = 1,
        ).copy(
            firstStartedAt = "2026-10-12T23:00:00Z",
            lastEndedAt = "2026-10-13T01:00:00Z",
        )
        val day = establishedDay(logicalDate = "2026-10-12", sectionEntries = listOf(completed))

        val projection = projectReviewDailyMetrics(day) as ReviewDailyProjection.Available

        assertEquals(1, projection.metrics.completedCount)
        assertEquals(7_200L, projection.metrics.completedActualDurationSeconds)
    }

    @Test
    fun missingOrNegativeCompletedDurationFailsClosed() {
        val missing = projectReviewDailyMetrics(
            establishedDay(sectionEntries = listOf(task("missing", LifecycleState.COMPLETED, actual = null))),
        )
        val invalid = projectReviewDailyMetrics(
            establishedDay(sectionEntries = listOf(task("negative", LifecycleState.COMPLETED, actual = -1))),
        )

        assertEquals(ReviewDailyProjection.Invalid, missing)
        assertEquals(ReviewDailyProjection.Invalid, invalid)
    }

    @Test
    fun establishedEmptyDayIsVerifiedZeroButUnestablishedDayHasNoMetrics() {
        val emptyEstablished = projectReviewDailyMetrics(establishedDay(sectionEntries = emptyList()))
        val unestablished = projectReviewDailyMetrics(
            TodayDay(
                logicalDate = "2026-10-12",
                isCurrent = false,
                planningEnabled = false,
                placementRevision = 0,
                sections = emptyList(),
                unsectionedEntries = emptyList(),
                activeExecution = null,
                taskChuteDayId = null,
            ),
        )

        val emptyMetrics = (emptyEstablished as ReviewDailyProjection.Available).metrics
        assertEquals(0, emptyMetrics.completedCount)
        assertEquals(0, emptyMetrics.unexecutedCount)
        assertEquals(0L, emptyMetrics.completedActualDurationSeconds)
        assertTrue(!emptyMetrics.hasEntries)
        assertEquals(ReviewDailyProjection.Unestablished, unestablished)
    }

    @Test
    fun totalUsesLongArithmeticAndDurationFormatterKeepsExactSeconds() {
        val projection = projectReviewDailyMetrics(
            establishedDay(
                sectionEntries = listOf(
                    task("large-1", LifecycleState.COMPLETED, actual = Int.MAX_VALUE),
                    task("large-2", LifecycleState.COMPLETED, actual = Int.MAX_VALUE),
                ),
            ),
        ) as ReviewDailyProjection.Available

        assertEquals(Int.MAX_VALUE.toLong() * 2, projection.metrics.completedActualDurationSeconds)
        assertEquals("0秒", formatReviewDuration(0))
        assertEquals("1時間 2分 3秒", formatReviewDuration(3_723))
        assertEquals("1193046時間 28分 14秒", formatReviewDuration(Int.MAX_VALUE.toLong() * 2))
    }

    private fun establishedDay(
        logicalDate: String = "2026-10-13",
        sectionEntries: List<TodayTask>,
        unsectionedEntries: List<TodayTask> = emptyList(),
        activeEntry: TodayActiveEntry? = null,
        activeExecution: TodayExecution? = null,
    ) = TodayDay(
        logicalDate = logicalDate,
        isCurrent = logicalDate == "2026-10-13",
        planningEnabled = logicalDate == "2026-10-13",
        placementRevision = 1,
        sections = listOf(TodaySection("section", "Section", 0, 1_440, sectionEntries)),
        unsectionedEntries = unsectionedEntries,
        activeExecution = activeExecution,
        taskChuteDayId = "day-$logicalDate",
        activeEntry = activeEntry,
    )

    private fun task(
        id: String,
        state: LifecycleState,
        actual: Int?,
        estimate: Int? = null,
    ) = TodayTask(
        id = id,
        title = id,
        lifecycleState = state,
        project = null,
        mode = null,
        estimateSeconds = estimate,
        plannedStartMinute = null,
        executionId = null,
        activeStartedAt = null,
        completedDurationSeconds = actual,
    )
}

