package com.hedgetheapp.taskchute.today

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import androidx.compose.ui.geometry.Rect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayDirectManipulationTest {
    @Test
    fun pendingPlacementMutationSuppressesDuplicateDispatch() {
        val repository = FakeRepository().apply { hold = true }
        var refreshes = 0
        val controller = TodayDirectManipulationController(
            repository = repository,
            onRefresh = { refreshes++ },
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

        controller.reorder(day(), "section-1", listOf("entry-2", "entry-1"), setOf("entry-1"))
        assertTrue(repository.started.await(2, TimeUnit.SECONDS))
        controller.reorder(day(), "section-1", listOf("entry-1", "entry-2"), setOf("entry-1"))
        assertEquals(1, repository.reorderCalls.get())
        assertTrue(controller.state.pendingEntryIds.contains("entry-1"))

        repository.release.countDown()
        assertTrue(await { controller.state.pendingEntryIds.isEmpty() && refreshes == 1 })
        assertEquals(1, refreshes)
        controller.close()
    }

    @Test
    fun dragEligibilityRejectsProtectedRowsAndNonCurrentDays() {
        val controller = TodayDirectManipulationController(
            repository = FakeRepository(),
            onRefresh = {},
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        assertTrue(controller.canDrag(day(), task(LifecycleState.PLANNED)))
        assertFalse(controller.canDrag(day(), task(LifecycleState.RUNNING)))
        assertFalse(controller.canDrag(day(), task(LifecycleState.COMPLETED)))
        assertFalse(controller.canDrag(day(), task(LifecycleState.PLANNED, routineDerived = true)))
        assertFalse(controller.canDrag(day().copy(isCurrent = false), task(LifecycleState.PLANNED)))
        controller.close()
    }

    @Test
    fun httpRepositoryUsesCanonicalMoveAndDuplicateEndpoints() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = TodayDirectManipulationHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, "{}")
            },
        )

        assertEquals(
            DirectManipulationResult.Success,
            repository.execute(DirectManipulationRequest.Move(
                operationId = "op-move",
                entryId = "entry-1",
                taskChuteDayId = "day-1",
                sectionId = "section-2",
                expectedPlacementRevision = 5,
                placement = PlacementTarget("section-2", "entry-2", PlacementEdge.AFTER),
            )),
        )
        assertEquals(
            DirectManipulationResult.Success,
            repository.execute(DirectManipulationRequest.Duplicate("op-duplicate", "entry-1", "task-2", "entry-2", "day-1", 5)),
        )
        assertEquals(
            DirectManipulationResult.Success,
            repository.execute(DirectManipulationRequest.Move(
                operationId = "op-empty-section",
                entryId = "entry-1",
                taskChuteDayId = "day-1",
                sectionId = "section-empty",
                expectedPlacementRevision = 5,
                placement = null,
            )),
        )
        assertEquals("/api/v1/taskchute-days/current/entries/move", requests[0].second)
        assertTrue(requests[0].third.orEmpty().contains("\"section_id\":\"section-2\""))
        assertTrue(requests[0].third.orEmpty().contains("\"edge\":\"after\""))
        assertTrue(requests[1].second.endsWith("/entries/entry-1/duplicate"))
        assertTrue(requests[2].third.orEmpty().contains("\"section_id\":\"section-empty\""))
        assertFalse(requests[2].third.orEmpty().contains("\"placement\""))
    }

    @Test
    fun emptySectionMoveOmitsRelativePlacement() {
        val requests = mutableListOf<DirectManipulationRequest>()
        val repository = object : TodayDirectManipulationRepository {
            override fun execute(request: DirectManipulationRequest): DirectManipulationResult {
                requests += request
                return DirectManipulationResult.Success
            }
        }
        val controller = TodayDirectManipulationController(
            repository = repository,
            onRefresh = {},
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

        controller.move(day(), "entry-1", "section-2", null)

        assertTrue(await { requests.size == 1 })
        assertEquals(1, requests.size)
        assertTrue(requests.single() is DirectManipulationRequest.Move)
        assertEquals(null, (requests.single() as DirectManipulationRequest.Move).placement)
        controller.close()
    }

    @Test
    fun dropTargetResolverSupportsCollapsedNonEmptySectionAreaWithoutPlacement() {
        val target = resolveAndroidDropTarget(
            positionY = 300f,
            sourceEntryId = "entry-1",
            entryBounds = emptyMap(),
            entrySectionIds = emptyMap(),
            emptySectionBounds = mapOf("section-2" to Rect(0f, 260f, 100f, 340f)),
            emptySectionIds = mapOf("section-2" to "section-2"),
        )

        assertEquals(AndroidDropTarget("section:section-2", "section-2", null, null), target)
        assertEquals(null, target?.anchorEntryId)
        assertEquals(null, target?.edge)
    }

    @Test
    fun dropTargetResolverKeepsVisibleEntryAnchorHigherPriorityThanSectionArea() {
        val target = resolveAndroidDropTarget(
            positionY = 300f,
            sourceEntryId = "entry-1",
            entryBounds = mapOf("entry-2" to Rect(0f, 260f, 100f, 340f)),
            entrySectionIds = mapOf("entry-2" to "section-2"),
            emptySectionBounds = mapOf("section-2" to Rect(0f, 260f, 100f, 340f)),
            emptySectionIds = mapOf("section-2" to "section-2"),
        )

        assertEquals(AndroidDropTarget("entry:entry-2", "section-2", "entry-2", PlacementEdge.AFTER), target)
    }
    @Test
    fun bulkDayOperationsUseCanonicalEndpointsAndPayloads() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = TodayDirectManipulationHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, "{}")
            },
        )

        assertEquals(
            DirectManipulationResult.Success,
            repository.execute(
                DirectManipulationRequest.MoveToDay(
                    operationId = "op-day",
                    sourceTaskChuteDayId = "day-1",
                    entryIds = listOf("entry-2", "entry-1"),
                    targetLogicalDate = "2026-09-15",
                    expectedSourcePlacementRevision = 7,
                    allowSectionFallback = true,
                ),
            ),
        )
        assertEquals(
            DirectManipulationResult.Success,
            repository.execute(DirectManipulationRequest.Delete("op-delete", "day-1", listOf("entry-1"), 7)),
        )

        assertEquals("/api/v1/taskchute-days/entries/bulk-move-to-day", requests[0].second)
        assertTrue(requests[0].third.orEmpty().contains("target_logical_date\":\"2026-09-15\""))
        assertTrue(requests[0].third.orEmpty().contains("expected_source_placement_revision\":7"))
        assertEquals("/api/v1/taskchute-days/current/entries/bulk-delete", requests[1].second)
    }

    @Test
    fun unestablishedPastTargetIsRejectedBeforeMutation() {
        val requests = mutableListOf<DirectManipulationRequest>()
        val controller = TodayDirectManipulationController(
            repository = object : TodayDirectManipulationRepository {
                override fun execute(request: DirectManipulationRequest): DirectManipulationResult {
                    requests += request
                    return DirectManipulationResult.Success
                }
            },
            onRefresh = {},
            onUnauthorized = {},
            loadDay = { TodayResult.Success(day().copy(logicalDate = "2026-09-13", taskChuteDayId = null)) },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

        controller.moveToDay(day(), setOf("entry-1"), "2026-09-13")

        assertTrue(await { controller.state.pendingEntryIds.isEmpty() && controller.state.errorMessage != null })
        assertTrue(requests.isEmpty())
        controller.close()
    }

    @Test
    fun multiSelectionDisablesGroupDragButKeepsSelectionEligibility() {
        val controller = TodayDirectManipulationController(
            repository = FakeRepository(),
            onRefresh = {},
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        val first = task(LifecycleState.PLANNED)
        assertTrue(controller.canSelect(day(), first))
        assertTrue(controller.canDrag(day(), first, setOf(first.id)))
        assertFalse(controller.canDrag(day(), first, setOf("entry-1", "entry-2")))
        assertFalse(controller.canSelect(day(), first.copy(lifecycleState = LifecycleState.RUNNING)))
        controller.close()
    }

    @Test
    fun dropTargetResolverPrefersEmptySectionWhenNoEntryAnchorIsHit() {
        val target = resolveAndroidDropTarget(
            positionY = 300f,
            sourceEntryId = "entry-1",
            entryBounds = mapOf("entry-2" to Rect(0f, 100f, 100f, 180f)),
            entrySectionIds = mapOf("entry-2" to "section-1"),
            emptySectionBounds = mapOf("section-2" to Rect(0f, 260f, 100f, 330f)),
            emptySectionIds = mapOf("section-2" to "section-2"),
        )

        assertEquals(AndroidDropTarget("section:section-2", "section-2", null, null), target)
    }

    @Test
    fun dropTargetResolverSupportsEmptyUnsectionedTarget() {
        val target = resolveAndroidDropTarget(
            positionY = 300f,
            sourceEntryId = "entry-1",
            entryBounds = emptyMap(),
            entrySectionIds = emptyMap(),
            emptySectionBounds = mapOf("__unsectioned__" to Rect(0f, 260f, 100f, 330f)),
            emptySectionIds = mapOf("__unsectioned__" to null),
        )

        assertEquals(AndroidDropTarget("section:__unsectioned__", null, null, null), target)
    }

    @Test
    fun dropTargetResolverReturnsNullOutsideEntriesAndEmptySections() {
        assertEquals(
            null,
            resolveAndroidDropTarget(
                positionY = 400f,
                sourceEntryId = "entry-1",
                entryBounds = mapOf("entry-2" to Rect(0f, 100f, 100f, 180f)),
                entrySectionIds = mapOf("entry-2" to "section-1"),
                emptySectionBounds = mapOf("section-2" to Rect(0f, 260f, 100f, 330f)),
                emptySectionIds = mapOf("section-2" to "section-2"),
            ),
        )
    }

    @Test
    fun ambiguousPlacementRetainsExactRequestForRetry() {
        val repository = FakeRepository().apply { result = DirectManipulationResult.Ambiguous }
        val controller = TodayDirectManipulationController(
            repository = repository,
            onRefresh = {},
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

        controller.reorder(day(), "section-1", listOf("entry-2", "entry-1"), setOf("entry-1"))
        assertTrue(await { repository.requests.size == 1 && controller.state.unresolvedRequest != null })
        val original = repository.requests.single()
        assertEquals(original, controller.state.unresolvedRequest)

        repository.result = DirectManipulationResult.Success
        controller.retryUnresolved()
        assertTrue(await { repository.requests.size == 2 && controller.state.unresolvedRequest == null })
        assertEquals(original, repository.requests[1])
        controller.close()
    }

    @Test
    fun deterministicFailureUsesApprovedMessageWithoutUnresolvedRequest() {
        val repository = FakeRepository().apply {
            result = DirectManipulationResult.Failure("server detail")
        }
        val controller = TodayDirectManipulationController(
            repository = repository,
            onRefresh = {},
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

        controller.reorder(day(), "section-1", listOf("entry-2", "entry-1"), setOf("entry-1"))

        assertTrue(await {
            controller.state.pendingEntryIds.isEmpty() &&
                controller.state.errorMessage == DETERMINISTIC_FAILURE_MESSAGE
        })
        assertEquals(null, controller.state.unresolvedRequest)
        controller.close()
    }
    private fun await(predicate: () -> Boolean): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
        while (System.nanoTime() < deadline) {
            if (predicate()) return true
            Thread.yield()
        }
        return predicate()
    }

    private class FakeRepository : TodayDirectManipulationRepository {
        val reorderCalls = AtomicInteger()
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        var hold = false
        var result: DirectManipulationResult = DirectManipulationResult.Success
        val requests = mutableListOf<DirectManipulationRequest>()

        override fun execute(request: DirectManipulationRequest): DirectManipulationResult {
            requests += request
            if (request is DirectManipulationRequest.Reorder) {
                reorderCalls.incrementAndGet()
                started.countDown()
                if (hold) release.await(2, TimeUnit.SECONDS)
            }
            return result
        }
    }

    private companion object {
        fun task(state: LifecycleState, routineDerived: Boolean = false) = TodayTask(
            id = "entry-1",
            title = "Task",
            lifecycleState = state,
            project = null,
            mode = null,
            estimateSeconds = 600,
            plannedStartMinute = 540,
            executionId = null,
            activeStartedAt = null,
            routineDerived = routineDerived,
        )

        fun day() = TodayDay(
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
                    entries = listOf(task(LifecycleState.PLANNED), task(LifecycleState.PLANNED).copy(id = "entry-2")),
                ),
            ),
            unsectionedEntries = emptyList(),
            activeExecution = null,
            taskChuteDayId = "day-1",
        )
    }
}
