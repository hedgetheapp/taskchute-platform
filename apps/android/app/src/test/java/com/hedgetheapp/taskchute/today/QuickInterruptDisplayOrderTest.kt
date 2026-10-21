package com.hedgetheapp.taskchute.today

import org.junit.Assert.assertEquals
import org.junit.Test

class QuickInterruptDisplayOrderTest {
    @Test
    fun runningAndCompletedTargetPlaceOnlyTheirPlannedContinuationImmediatelyAfter() {
        listOf(LifecycleState.RUNNING, LifecycleState.COMPLETED).forEach { lifecycle ->
            val entries = listOf(
                task("b", lifecycle, quickInterruptOrigin = true),
                task("later-history", LifecycleState.COMPLETED),
                task("planned-p"),
                task("continuation-c", target = "b"),
                task("planned-q"),
            )

            assertEquals(
                listOf("b", "continuation-c", "later-history", "planned-p", "planned-q"),
                canonicalQuickInterruptDisplayOrder(entries).map(TodayTask::id),
            )
        }
    }

    @Test
    fun hiddenTargetLeavesContinuationAtItsPlannedPosition() {
        val visible = listOf(
            task("planned-p"),
            task("continuation-c", target = "hidden-b"),
            task("planned-q"),
        )

        assertEquals(listOf("planned-p", "continuation-c", "planned-q"),
            canonicalQuickInterruptDisplayOrder(visible).map(TodayTask::id))
    }

    @Test
    fun startedContinuationUsesTheSuppliedHistoricalOrder() {
        val entries = listOf(
            task("b", LifecycleState.COMPLETED, quickInterruptOrigin = true),
            task("history-between", LifecycleState.COMPLETED),
            task("continuation-c", LifecycleState.RUNNING, target = "b"),
            task("planned-p"),
        )

        assertEquals(entries.map(TodayTask::id), canonicalQuickInterruptDisplayOrder(entries).map(TodayTask::id))
    }

    @Test
    fun repeatedPairsRemainIndependentAndUnpairedPlannedRowsKeepTheirOrder() {
        val entries = listOf(
            task("b1", LifecycleState.COMPLETED, quickInterruptOrigin = true),
            task("b2", LifecycleState.RUNNING, quickInterruptOrigin = true),
            task("planned-p"),
            task("c1", target = "b1"),
            task("c2", target = "b2"),
        )

        assertEquals(listOf("b1", "c1", "b2", "c2", "planned-p"),
            canonicalQuickInterruptDisplayOrder(entries).map(TodayTask::id))
    }

    @Test
    fun displayInterleaveDoesNotChangeTheCanonicalSectionOrderUsedByDrag() {
        val entries = listOf(
            task("b", LifecycleState.COMPLETED, quickInterruptOrigin = true),
            task("later-history", LifecycleState.COMPLETED),
            task("planned-p"),
            task("continuation-c", target = "b"),
        )
        val section = TodaySection("section", "Morning", 480, 720, entries)
        val day = TodayDay(
            logicalDate = "2026-10-21",
            isCurrent = true,
            planningEnabled = true,
            placementRevision = 1,
            sections = listOf(section),
            unsectionedEntries = emptyList(),
            activeExecution = null,
        )

        assertEquals(listOf("b", "continuation-c", "later-history", "planned-p"),
            canonicalQuickInterruptDisplayOrder(entries).map(TodayTask::id))
        assertEquals(listOf("b", "later-history", "planned-p", "continuation-c"),
            canonicalAndroidEntryOrderBySection(day)[section.id])
    }

    private fun task(
        id: String,
        lifecycle: LifecycleState = LifecycleState.PLANNED,
        quickInterruptOrigin: Boolean = false,
        target: String? = null,
    ) = TodayTask(
        id = id,
        title = id,
        lifecycleState = lifecycle,
        project = null,
        mode = null,
        estimateSeconds = null,
        plannedStartMinute = null,
        executionId = null,
        activeStartedAt = null,
        quickInterruptOrigin = quickInterruptOrigin,
        quickInterruptTargetEntryId = target,
    )
}
