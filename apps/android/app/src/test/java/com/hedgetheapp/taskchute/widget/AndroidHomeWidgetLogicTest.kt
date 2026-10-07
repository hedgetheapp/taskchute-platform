package com.hedgetheapp.taskchute.widget

import com.hedgetheapp.taskchute.today.LifecycleState
import com.hedgetheapp.taskchute.today.TodayActiveEntry
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayExecution
import com.hedgetheapp.taskchute.today.TodayMode
import com.hedgetheapp.taskchute.today.TodayMutationResult
import com.hedgetheapp.taskchute.today.TodayProject
import com.hedgetheapp.taskchute.today.TodayRepository
import com.hedgetheapp.taskchute.today.TodayResult
import com.hedgetheapp.taskchute.today.TodaySection
import com.hedgetheapp.taskchute.today.TodayTask
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidHomeWidgetLogicTest {
    private val now = Instant.parse("2026-10-07T10:00:00Z")

    @Test
    fun idlePromotesFirstPlannedEntryAndExcludesCompletedEntries() {
        val day = day(
            tasks = listOf(
                task("completed", LifecycleState.COMPLETED),
                task("planned-first", LifecycleState.PLANNED),
                task("planned-second", LifecycleState.PLANNED),
            ),
        )

        val projection = projectAndroidHomeWidget(day, now) as AndroidHomeWidgetProjection.Idle

        assertEquals("planned-first", projection.nextPlanned?.id)
    }

    @Test
    fun runningProjectionShowsRunningAndNextPlanned() {
        val day = day(
            tasks = listOf(
                task("running", LifecycleState.RUNNING, executionId = "execution", startedAt = "2026-10-07T09:50:00Z"),
                task("completed", LifecycleState.COMPLETED),
                task("next", LifecycleState.PLANNED),
            ),
            execution = TodayExecution("execution", "running", "2026-10-07T09:50:00Z", 1800),
        )

        val projection = projectAndroidHomeWidget(day, now) as AndroidHomeWidgetProjection.Running

        assertEquals("running", projection.task.id)
        assertEquals("next", projection.nextPlanned?.id)
        assertEquals(600L, projection.elapsedSeconds)
        assertEquals(1200L, projection.remainingSeconds)
        assertNull(projection.overrunSeconds)
        assertEquals(1800, projection.estimateSeconds)
        assertEquals(333, projection.progressPermille)
    }

    @Test
    fun activeExecutionFromAnotherDayIsShownWithCurrentDayPlannedPreview() {
        val day = day(
            tasks = listOf(task("today-next", LifecycleState.PLANNED)),
            execution = TodayExecution("old-execution", "yesterday-entry", "2026-10-07T09:30:00Z", 3600),
            activeEntry = TodayActiveEntry("yesterday-entry", "task", "Yesterday task", LifecycleState.RUNNING, 3600),
        )

        val projection = projectAndroidHomeWidget(day, now) as AndroidHomeWidgetProjection.Running

        assertEquals("yesterday-entry", projection.task.id)
        assertEquals("old-execution", projection.task.executionId)
        assertEquals("today-next", projection.nextPlanned?.id)
    }

    @Test
    fun missingExecutionForRunningStateFailsClosed() {
        val day = day(tasks = listOf(task("running", LifecycleState.RUNNING)))

        assertTrue(projectAndroidHomeWidget(day, now) is AndroidHomeWidgetProjection.InvalidActiveState)
        assertTrue(resolveAndroidHomeWidgetAction(day, AndroidHomeWidgetAction.Start("planned")) is AndroidHomeWidgetActionPlan.Stale)
    }

    @Test
    fun emptyDayHasNoStartTarget() {
        val projection = projectAndroidHomeWidget(day(tasks = emptyList()), now) as AndroidHomeWidgetProjection.Idle

        assertNull(projection.nextPlanned)
        assertTrue(resolveAndroidHomeWidgetAction(day(tasks = emptyList()), AndroidHomeWidgetAction.Start("anything")) is AndroidHomeWidgetActionPlan.Stale)
    }

    @Test
    fun runningTimeUsesTodayFormattingAndOmitsGoalWhenEstimateIsAbsent() {
        val positive = androidHomeWidgetRunningPresentation("2026-10-07T09:50:00Z", 1800, now)
        val noEstimate = androidHomeWidgetRunningPresentation("2026-10-07T09:50:00Z", null, now)
        val nonPositiveEstimate = androidHomeWidgetRunningPresentation("2026-10-07T09:50:00Z", 0, now)

        assertEquals("00:10:00", positive.elapsedText)
        assertEquals(1200L, positive.remainingSeconds)
        assertEquals("00:20:00", positive.remainingText)
        assertNull(positive.overrunSeconds)
        assertNull(positive.overrunText)
        assertEquals(333, positive.progressPermille)
        assertEquals("00:10:00", noEstimate.elapsedText)
        assertNull(noEstimate.remainingSeconds)
        assertNull(noEstimate.remainingText)
        assertNull(noEstimate.overrunSeconds)
        assertNull(noEstimate.progressPermille)
        assertNull(nonPositiveEstimate.remainingText)
        assertNull(nonPositiveEstimate.progressPermille)
    }

    @Test
    fun estimateProgressCapsAtGoalButEstimateRemainsVisible() {
        val presentation = androidHomeWidgetRunningPresentation(
            startedAt = "2026-10-07T09:00:00Z",
            estimateSeconds = 1800,
            now = Instant.parse("2026-10-07T10:30:00Z"),
        )

        assertEquals("01:30:00", presentation.elapsedText)
        assertEquals(0L, presentation.remainingSeconds)
        assertEquals("00:00:00", presentation.remainingText)
        assertEquals(3600L, presentation.overrunSeconds)
        assertEquals("+01:00:00", presentation.overrunText)
        assertEquals(1000, presentation.progressPermille)
    }

    @Test
    fun estimateBoundaryHasZeroRemainingAndOverrunBeginsOnlyAfterBoundary() {
        val atBoundary = androidHomeWidgetRunningPresentation(
            startedAt = "2026-10-07T09:30:00Z",
            estimateSeconds = 1800,
            now = now,
        )
        val afterBoundary = androidHomeWidgetRunningPresentation(
            startedAt = "2026-10-07T09:30:00Z",
            estimateSeconds = 1800,
            now = now.plusSeconds(1),
        )

        assertEquals(0L, atBoundary.remainingSeconds)
        assertEquals("00:00:00", atBoundary.remainingText)
        assertNull(atBoundary.overrunSeconds)
        assertEquals(0L, afterBoundary.remainingSeconds)
        assertEquals(1L, afterBoundary.overrunSeconds)
        assertEquals("+00:00:01", afterBoundary.overrunText)
    }

    @Test
    fun estimateBoundaryPlanRequiresStableCanonicalIdentityAndFutureEnd() {
        val running = day(
            tasks = listOf(task("running", LifecycleState.RUNNING, executionId = "execution")),
            execution = TodayExecution("execution", "running", "2026-10-07T09:50:00Z", 1800),
        )
        val state = AndroidHomeWidgetState.Content(running, projectAndroidHomeWidget(running, now))
        val plan = planAndroidHomeWidgetBoundary(state, now)

        assertNotNull(plan)
        assertEquals(Instant.parse("2026-10-07T10:20:00Z").toEpochMilli(), plan?.triggerAtEpochMillis)

        val atBoundaryDay = running.copy(
            activeExecution = TodayExecution("execution", "running", "2026-10-07T09:30:00Z", 1800),
            sections = listOf(TodaySection("section", "Section", 0, 1440,
                listOf(task("running", LifecycleState.RUNNING, executionId = "execution")))),
        )
        val boundaryInstant = Instant.parse("2026-10-07T10:00:00Z")
        val atBoundaryState = AndroidHomeWidgetState.Content(
            atBoundaryDay,
            projectAndroidHomeWidget(atBoundaryDay, boundaryInstant),
        )
        val firstOverrunSecond = planAndroidHomeWidgetBoundary(atBoundaryState, boundaryInstant)
        assertEquals(Instant.parse("2026-10-07T10:00:01Z").toEpochMilli(), firstOverrunSecond?.triggerAtEpochMillis)
        val firstOverrunInstant = boundaryInstant.plusSeconds(1)
        val afterBoundaryState = AndroidHomeWidgetState.Content(
            atBoundaryDay,
            projectAndroidHomeWidget(atBoundaryDay, firstOverrunInstant),
        )
        assertNull(planAndroidHomeWidgetBoundary(afterBoundaryState, firstOverrunInstant))

        val mismatchedTask = running.copy(
            sections = listOf(TodaySection("section", "Section", 0, 1440,
                listOf(task("running", LifecycleState.RUNNING, executionId = "other-execution")))),
        )
        val mismatchedState = AndroidHomeWidgetState.Content(mismatchedTask, projectAndroidHomeWidget(mismatchedTask, now))
        assertNull(planAndroidHomeWidgetBoundary(mismatchedState, now))
    }

    @Test
    fun estimateBoundaryAlarmDeduplicatesAndReplacesChangedRunningIdentity() {
        val plan = AndroidHomeWidgetBoundaryPlan("entry-execution-start-estimate", 1_791_376_800_000L)
        val current = AndroidHomeWidgetBoundaryAlarmRecord(plan, AndroidHomeWidgetBoundaryAlarmMode.EXACT)

        assertTrue(decideAndroidHomeWidgetBoundary(
            current,
            plan,
            AndroidHomeWidgetBoundaryAlarmMode.EXACT,
        ) is AndroidHomeWidgetBoundaryDecision.Keep)
        assertTrue(decideAndroidHomeWidgetBoundary(
            current,
            plan.copy(identityKey = "changed-execution"),
            AndroidHomeWidgetBoundaryAlarmMode.EXACT,
        ) is AndroidHomeWidgetBoundaryDecision.Schedule)
        assertTrue(decideAndroidHomeWidgetBoundary(
            current,
            plan,
            AndroidHomeWidgetBoundaryAlarmMode.INEXACT,
        ) is AndroidHomeWidgetBoundaryDecision.Schedule)
        assertTrue(decideAndroidHomeWidgetBoundary(
            current,
            null,
            AndroidHomeWidgetBoundaryAlarmMode.EXACT,
        ) is AndroidHomeWidgetBoundaryDecision.Cancel)
    }

    @Test
    fun estimateBoundaryKeyChangesWhenEntryExecutionStartOrEstimateChanges() {
        fun plan(entryId: String, executionId: String, startedAt: String, estimate: Int): AndroidHomeWidgetBoundaryPlan {
            val runningTask = task(entryId, LifecycleState.RUNNING, executionId = executionId, estimateSeconds = estimate)
            val current = day(
                tasks = listOf(runningTask),
                execution = TodayExecution(executionId, entryId, startedAt, estimate),
            )
            return requireNotNull(planAndroidHomeWidgetBoundary(
                AndroidHomeWidgetState.Content(current, projectAndroidHomeWidget(current, now)),
                now,
            ))
        }

        val baseline = plan("entry", "execution", "2026-10-07T09:50:00Z", 1800)

        assertNotEquals(baseline.identityKey, plan("other-entry", "execution", "2026-10-07T09:50:00Z", 1800).identityKey)
        assertNotEquals(baseline.identityKey, plan("entry", "other-execution", "2026-10-07T09:50:00Z", 1800).identityKey)
        assertNotEquals(baseline.identityKey, plan("entry", "execution", "2026-10-07T09:51:00Z", 1800).identityKey)
        assertNotEquals(baseline.identityKey, plan("entry", "execution", "2026-10-07T09:50:00Z", 2400).identityKey)
    }

    @Test
    fun estimateBoundaryAlarmClearsForIdleEstimateLessAndSignedOutStates() {
        val noEstimate = day(
            tasks = listOf(task("running", LifecycleState.RUNNING, executionId = "execution", estimateSeconds = null)),
            execution = TodayExecution("execution", "running", "2026-10-07T09:50:00Z", null),
        )
        val idle = day(tasks = listOf(task("planned", LifecycleState.PLANNED)))
        val currentAlarm = AndroidHomeWidgetBoundaryAlarmRecord(
            AndroidHomeWidgetBoundaryPlan("previous", 1_791_376_800_000L),
            AndroidHomeWidgetBoundaryAlarmMode.INEXACT,
        )

        assertNull(planAndroidHomeWidgetBoundary(
            AndroidHomeWidgetState.Content(noEstimate, projectAndroidHomeWidget(noEstimate, now)), now,
        ))
        assertNull(planAndroidHomeWidgetBoundary(
            AndroidHomeWidgetState.Content(idle, projectAndroidHomeWidget(idle, now)), now,
        ))
        assertNull(planAndroidHomeWidgetBoundary(AndroidHomeWidgetState.SignedOut, now))
        assertTrue(decideAndroidHomeWidgetBoundary(
            currentAlarm,
            null,
            AndroidHomeWidgetBoundaryAlarmMode.INEXACT,
        ) is AndroidHomeWidgetBoundaryDecision.Cancel)
    }

    @Test
    fun estimateBoundaryAlarmUsesExactOnlyWhenAllowedAndRejectsStaleDelivery() {
        assertEquals(
            AndroidHomeWidgetBoundaryAlarmMode.EXACT,
            androidHomeWidgetBoundaryAlarmMode(sdkInt = 28, canScheduleExactAlarms = false),
        )
        assertEquals(
            AndroidHomeWidgetBoundaryAlarmMode.EXACT,
            androidHomeWidgetBoundaryAlarmMode(sdkInt = 31, canScheduleExactAlarms = true),
        )
        assertEquals(
            AndroidHomeWidgetBoundaryAlarmMode.INEXACT,
            androidHomeWidgetBoundaryAlarmMode(sdkInt = 31, canScheduleExactAlarms = false),
        )
        assertTrue(isCurrentAndroidHomeWidgetBoundaryAlarm("current", "current"))
        assertFalse(isCurrentAndroidHomeWidgetBoundaryAlarm("stale", "current"))
        assertFalse(isCurrentAndroidHomeWidgetBoundaryAlarm(null, "current"))
    }

    @Test
    fun startAndCompleteActionsKeepCurrentWidgetContentWhileInFlight() {
        assertTrue(shouldShowAndroidHomeWidgetLoading(AndroidHomeWidgetRequestKind.INITIAL_LOAD))
        assertFalse(shouldShowAndroidHomeWidgetLoading(AndroidHomeWidgetRequestKind.CANONICAL_REFRESH))
        assertFalse(shouldShowAndroidHomeWidgetLoading(AndroidHomeWidgetRequestKind.ACTION))
    }

    @Test
    fun plannedMetadataShowsOnlyCanonicalValues() {
        assertEquals("10:00 · 30分", formatAndroidHomeWidgetPlannedMetadata(
            task("planned", LifecycleState.PLANNED, plannedStartMinute = 600, estimateSeconds = 1800),
        ))
        assertEquals("25:15", formatAndroidHomeWidgetPlannedMetadata(
            task("planned", LifecycleState.PLANNED, plannedStartMinute = 1515, estimateSeconds = null),
        ))
        assertNull(formatAndroidHomeWidgetPlannedMetadata(task("planned", LifecycleState.PLANNED, estimateSeconds = null)))
    }

    @Test
    fun startRequiresIdleAndCurrentlyPromotedEntry() {
        val idle = day(tasks = listOf(task("first", LifecycleState.PLANNED), task("second", LifecycleState.PLANNED)))
        val running = day(
            tasks = listOf(task("first", LifecycleState.RUNNING, executionId = "execution"), task("second", LifecycleState.PLANNED)),
            execution = TodayExecution("execution", "first", "2026-10-07T09:00:00Z", 1800),
        )

        val valid = resolveAndroidHomeWidgetAction(idle, AndroidHomeWidgetAction.Start("first"))
        val staleSecond = resolveAndroidHomeWidgetAction(idle, AndroidHomeWidgetAction.Start("second"))
        val blockedByActive = resolveAndroidHomeWidgetAction(running, AndroidHomeWidgetAction.Start("second"))

        assertTrue(valid is AndroidHomeWidgetActionPlan.Start)
        assertEquals(7, (valid as AndroidHomeWidgetActionPlan.Start).placementRevision)
        assertTrue(staleSecond is AndroidHomeWidgetActionPlan.Stale)
        assertTrue(blockedByActive is AndroidHomeWidgetActionPlan.Stale)
    }

    @Test
    fun startRejectsNonCurrentDay() {
        val future = day(tasks = listOf(task("first", LifecycleState.PLANNED))).copy(isCurrent = false)

        assertTrue(resolveAndroidHomeWidgetAction(future, AndroidHomeWidgetAction.Start("first")) is AndroidHomeWidgetActionPlan.Stale)
    }

    @Test
    fun completeRequiresCanonicalActiveEntryAndExecutionIdentity() {
        val day = day(
            tasks = listOf(task("running", LifecycleState.RUNNING, executionId = "execution")),
            execution = TodayExecution("execution", "running", "2026-10-07T09:00:00Z", 1800),
        )

        val valid = resolveAndroidHomeWidgetAction(day, AndroidHomeWidgetAction.Complete("running", "execution"))
        val wrongEntry = resolveAndroidHomeWidgetAction(day, AndroidHomeWidgetAction.Complete("other", "execution"))
        val wrongExecution = resolveAndroidHomeWidgetAction(day, AndroidHomeWidgetAction.Complete("running", "old-execution"))

        assertTrue(valid is AndroidHomeWidgetActionPlan.Complete)
        assertEquals("execution", (valid as AndroidHomeWidgetActionPlan.Complete).task.executionId)
        assertTrue(wrongEntry is AndroidHomeWidgetActionPlan.Stale)
        assertTrue(wrongExecution is AndroidHomeWidgetActionPlan.Stale)
    }

    @Test
    fun staleActionOnlyReadsAndRendersFreshCanonicalDay() {
        val current = day(tasks = listOf(task("promoted", LifecycleState.PLANNED)))
        val repository = FakeRepository(reads = listOf(TodayResult.Success(current)))
        val controller = AndroidHomeWidgetController(repository) { now }

        val result = controller.perform(AndroidHomeWidgetAction.Start("old-entry"))

        assertTrue(result is AndroidHomeWidgetState.Content)
        assertEquals(1, repository.readCount)
        assertEquals(0, repository.started.size)
    }

    @Test
    fun successfulStartReconcilesBeforeDisplayingPromotedRunningState() {
        val idle = day(tasks = listOf(task("first", LifecycleState.PLANNED)))
        val running = day(tasks = listOf(task("first", LifecycleState.RUNNING, executionId = "new-execution")), execution =
            TodayExecution("new-execution", "first", "2026-10-07T10:00:00Z", 1800))
        val repository = FakeRepository(
            reads = listOf(TodayResult.Success(idle), TodayResult.Success(running)),
            startResult = TodayMutationResult.SuccessWithRevision(8),
        )
        val controller = AndroidHomeWidgetController(repository) { now }

        val result = controller.perform(AndroidHomeWidgetAction.Start("first"))

        assertTrue(result is AndroidHomeWidgetState.Content)
        assertEquals(2, repository.readCount)
        assertEquals(listOf("first" to 7), repository.started.map { it.first.id to it.second })
        assertTrue((result as AndroidHomeWidgetState.Content).projection is AndroidHomeWidgetProjection.Running)
    }

    @Test
    fun completeReconcilesCompletedTaskAwayAndPromotesNext() {
        val running = day(
            tasks = listOf(task("running", LifecycleState.RUNNING, executionId = "execution"), task("next", LifecycleState.PLANNED)),
            execution = TodayExecution("execution", "running", "2026-10-07T09:00:00Z", 1800),
        )
        val promoted = day(tasks = listOf(task("next", LifecycleState.PLANNED)))
        val repository = FakeRepository(
            reads = listOf(TodayResult.Success(running), TodayResult.Success(promoted)),
            completeResult = TodayMutationResult.Success,
        )
        val controller = AndroidHomeWidgetController(repository) { now }

        val result = controller.perform(AndroidHomeWidgetAction.Complete("running", "execution"))

        assertEquals(2, repository.readCount)
        assertEquals(listOf("running" to "execution"), repository.completed.map { it.id to it.executionId })
        assertEquals("next", ((result as AndroidHomeWidgetState.Content).projection as AndroidHomeWidgetProjection.Idle).nextPlanned?.id)
    }

    @Test
    fun mutationFailureDoesNotInventStateAndReconcilesCanonicalDay() {
        val idle = day(tasks = listOf(task("first", LifecycleState.PLANNED)))
        val repository = FakeRepository(
            reads = listOf(TodayResult.Success(idle), TodayResult.Success(idle)),
            startResult = TodayMutationResult.Failure("conflict"),
        )
        val controller = AndroidHomeWidgetController(repository) { now }

        val result = controller.perform(AndroidHomeWidgetAction.Start("first")) as AndroidHomeWidgetState.Content

        assertEquals(2, repository.readCount)
        assertEquals("first", (result.projection as AndroidHomeWidgetProjection.Idle).nextPlanned?.id)
        assertTrue(result.notice?.contains("操作を完了できません") == true)
    }

    @Test
    fun unauthorizedMutationStopsWithoutCanonicalSuccessAssumption() {
        val idle = day(tasks = listOf(task("first", LifecycleState.PLANNED)))
        val repository = FakeRepository(
            reads = listOf(TodayResult.Success(idle)),
            startResult = TodayMutationResult.Unauthorized,
        )
        val controller = AndroidHomeWidgetController(repository) { now }

        assertTrue(controller.perform(AndroidHomeWidgetAction.Start("first")) is AndroidHomeWidgetState.SignedOut)
        assertEquals(1, repository.readCount)
    }

    @Test
    fun lostReconciliationNeverDisplaysOptimisticMutation() {
        val idle = day(tasks = listOf(task("first", LifecycleState.PLANNED)))
        val repository = FakeRepository(
            reads = listOf(TodayResult.Success(idle), TodayResult.Failure("network")),
            startResult = TodayMutationResult.Success,
        )
        val controller = AndroidHomeWidgetController(repository) { now }

        assertTrue(controller.perform(AndroidHomeWidgetAction.Start("first")) is AndroidHomeWidgetState.Unavailable)
        assertEquals(2, repository.readCount)
    }

    @Test
    fun unauthorizedCanonicalReadNeverStartsMutation() {
        val repository = FakeRepository(reads = listOf(TodayResult.Unauthorized))
        val controller = AndroidHomeWidgetController(repository) { now }

        assertTrue(controller.perform(AndroidHomeWidgetAction.Start("first")) is AndroidHomeWidgetState.SignedOut)
        assertTrue(repository.started.isEmpty())
    }

    @Test
    fun actionGateDropsDuplicateActionsAndCoalescesOneRefresh() {
        val gate = AndroidHomeWidgetActionGate()

        assertTrue(gate.tryBegin(isRefresh = false))
        assertFalse(gate.tryBegin(isRefresh = false))
        assertFalse(gate.tryBegin(isRefresh = true))
        assertTrue(gate.finish())
        assertTrue(gate.tryBegin(isRefresh = true))
        assertFalse(gate.finish())
    }

    private fun day(
        tasks: List<TodayTask>,
        execution: TodayExecution? = null,
        activeEntry: TodayActiveEntry? = null,
    ) = TodayDay(
        logicalDate = "2026-10-07",
        isCurrent = true,
        planningEnabled = true,
        placementRevision = 7,
        sections = listOf(TodaySection("section", "Section", 0, 1440, tasks)),
        unsectionedEntries = emptyList(),
        activeExecution = execution,
        taskChuteDayId = "day-id",
        activeEntry = activeEntry,
    )

    private fun task(
        id: String,
        state: LifecycleState,
        executionId: String? = null,
        startedAt: String? = null,
        estimateSeconds: Int? = 1800,
        plannedStartMinute: Int? = null,
    ) = TodayTask(
        id = id,
        title = id,
        lifecycleState = state,
        project = TodayProject("project", "Project"),
        mode = TodayMode("mode", "Mode"),
        estimateSeconds = estimateSeconds,
        plannedStartMinute = plannedStartMinute,
        executionId = executionId,
        activeStartedAt = startedAt,
    )

    private class FakeRepository(
        reads: List<TodayResult>,
        private val startResult: TodayMutationResult = TodayMutationResult.Success,
        private val completeResult: TodayMutationResult = TodayMutationResult.Success,
    ) : TodayRepository {
        private val pendingReads = reads.toMutableList()
        val started = mutableListOf<Pair<TodayTask, Int>>()
        val completed = mutableListOf<TodayTask>()
        var readCount = 0
            private set

        override fun loadDay(logicalDate: String?): TodayResult {
            readCount += 1
            return pendingReads.removeAt(0)
        }

        override fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult {
            started += task to placementRevision
            return startResult
        }

        override fun completeTask(task: TodayTask): TodayMutationResult {
            completed += task
            return completeResult
        }
    }
}
