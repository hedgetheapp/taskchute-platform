package com.hedgetheapp.taskchute.today

import java.util.concurrent.CountDownLatch
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import androidx.compose.ui.geometry.Rect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayDirectManipulationTest {
    @Test
    fun parentDragCommitRequiresThePhysicalPointerUpAndMatchingActiveSession() {
        assertFalse(
            shouldFinishAndroidDragOnParentUp(
                isDragActive = true,
                isPhysicalPointerUp = false,
                pointerMatches = true,
                alreadyFinished = false,
            ),
        )
        assertFalse(
            shouldFinishAndroidDragOnParentUp(
                isDragActive = true,
                isPhysicalPointerUp = true,
                pointerMatches = false,
                alreadyFinished = false,
            ),
        )
        assertTrue(
            shouldFinishAndroidDragOnParentUp(
                isDragActive = true,
                isPhysicalPointerUp = true,
                pointerMatches = true,
                alreadyFinished = false,
            ),
        )
    }

    @Test
    fun parentDragCommitCannotBeIssuedTwiceForOnePointerUp() {
        assertFalse(
            shouldFinishAndroidDragOnParentUp(
                isDragActive = true,
                isPhysicalPointerUp = true,
                pointerMatches = true,
                alreadyFinished = true,
            ),
        )
    }

    @Test
    fun parentConsumesOnlyTheMatchingPostHandoffPointer() {
        assertFalse(
            shouldConsumeAndroidDragPointerMovement(
                isDragActive = false,
                pointerMatches = true,
                pointerPressed = true,
            ),
        )
        assertFalse(
            shouldConsumeAndroidDragPointerMovement(
                isDragActive = true,
                pointerMatches = false,
                pointerPressed = true,
            ),
        )
        assertFalse(
            shouldConsumeAndroidDragPointerMovement(
                isDragActive = true,
                pointerMatches = true,
                pointerPressed = false,
            ),
        )
        assertTrue(
            shouldConsumeAndroidDragPointerMovement(
                isDragActive = true,
                pointerMatches = true,
                pointerPressed = true,
            ),
        )
    }

    @Test
    fun postHandoffRootPointerPositionUsesOnlyTheStableParentCoordinate() {
        assertEquals(412f, androidDragPointerRootY(300f, 112f), 0f)
    }

    @Test
    fun dragAutoScrollReturnsZeroOutsideTheViewportEdgeZones() {
        assertEquals(0f, androidDragAutoScrollDelta(300f, 100f, 700f, 80f, 32f), 0f)
        assertEquals(0f, androidDragAutoScrollDelta(50f, 100f, 700f, 80f, 32f), 0f)
        assertEquals(0f, androidDragAutoScrollDelta(750f, 100f, 700f, 80f, 32f), 0f)
    }

    @Test
    fun dragAutoScrollUsesSignedDirectionAndIncreasesTowardTheEdge() {
        val topNear = androidDragAutoScrollDelta(150f, 100f, 700f, 80f, 32f)
        val topAtEdge = androidDragAutoScrollDelta(100f, 100f, 700f, 80f, 32f)
        val bottomNear = androidDragAutoScrollDelta(650f, 100f, 700f, 80f, 32f)
        val bottomAtEdge = androidDragAutoScrollDelta(700f, 100f, 700f, 80f, 32f)

        assertTrue(topNear < 0f)
        assertTrue(bottomNear > 0f)
        assertTrue(kotlin.math.abs(topAtEdge) >= kotlin.math.abs(topNear))
        assertTrue(bottomAtEdge >= bottomNear)
        assertEquals(-32f, topAtEdge, 0f)
        assertEquals(32f, bottomAtEdge, 0f)
    }

    @Test
    fun dragAutoScrollSafelyHandlesTinyViewportsAndListBoundaries() {
        assertEquals(0f, androidDragAutoScrollDelta(100f, 100f, 240f, 80f, 32f), 0f)
        assertEquals(0f, androidDragAutoScrollDelta(100f, 100f, 700f, 80f, 32f, canScrollBackward = false), 0f)
        assertEquals(0f, androidDragAutoScrollDelta(700f, 100f, 700f, 80f, 32f, canScrollForward = false), 0f)
    }

    @Test
    fun autoScrollRebaseStartsOnlyAfterScrollConsumesPixels() {
        assertFalse(shouldRebaseAndroidDragAfterConsumedScroll(0f))
        assertFalse(shouldRebaseAndroidDragAfterConsumedScroll(0.5f))
        assertFalse(shouldRebaseAndroidDragAfterConsumedScroll(-0.5f))
        assertTrue(shouldRebaseAndroidDragAfterConsumedScroll(0.51f))
        assertTrue(shouldRebaseAndroidDragAfterConsumedScroll(-0.51f))
    }

    @Test
    fun staleOffscreenGeometryCannotCreateInsertionCueInsideVisibleTaskRow() {
        val staleAndVisibleBounds = mapOf(
            "stale-offscreen" to Rect(0f, 100f, 400f, 180f),
            "visible-target" to Rect(0f, 140f, 400f, 240f),
        )
        val staleTarget = resolveAndroidDropTarget(
            positionY = 175f,
            sourceEntryId = "source",
            sourceSectionId = "source-section",
            entryBounds = staleAndVisibleBounds,
            entrySectionIds = mapOf("stale-offscreen" to "destination", "visible-target" to "destination"),
            entryAnchorEligible = mapOf("stale-offscreen" to true, "visible-target" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )
        val geometry = snapshotVisibleAndroidDragGeometry(
            visibleItemKeys = setOf("source", "visible-target"),
            entryBounds = staleAndVisibleBounds,
            entrySectionIds = mapOf("stale-offscreen" to "destination", "visible-target" to "destination"),
            entryAnchorEligible = mapOf("stale-offscreen" to true, "visible-target" to true),
        )

        val target = resolveAndroidDropTarget(
            positionY = 175f,
            sourceEntryId = "source",
            sourceSectionId = "source-section",
            entryBounds = geometry.entryBounds,
            entrySectionIds = geometry.entrySectionIds,
            entryAnchorEligible = geometry.entryAnchorEligible,
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
            canonicalEntryOrderBySection = mapOf<String?, List<String>>(
                "source-section" to listOf("source"),
                "destination" to listOf("stale-offscreen", "visible-target"),
            ),
        )

        // Reproduces the old failure: the disposed row's retained bottom was 180px,
        // which lies inside the currently visible target row (140..240px).
        assertEquals("stale-offscreen", staleTarget?.anchorEntryId)
        assertEquals(180f, staleTarget?.resolvedBoundaryY)
        assertEquals(setOf("visible-target"), geometry.entryBounds.keys)
        assertEquals("visible-target", target?.anchorEntryId)
        assertTrue(target?.resolvedBoundaryY == 140f || target?.resolvedBoundaryY == 240f)
        assertTrue(target?.resolvedBoundaryY != 180f)
        val releasedAtCue = resolveAndroidDropTarget(
            positionY = target!!.resolvedBoundaryY!!,
            sourceEntryId = "source",
            sourceSectionId = "source-section",
            entryBounds = geometry.entryBounds,
            entrySectionIds = geometry.entrySectionIds,
            entryAnchorEligible = geometry.entryAnchorEligible,
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
            canonicalEntryOrderBySection = mapOf<String?, List<String>>(
                "source-section" to listOf("source"),
                "destination" to listOf("stale-offscreen", "visible-target"),
            ),
            canonicalEntrySectionById = mapOf(
                "source" to "source-section",
                "stale-offscreen" to "destination",
                "visible-target" to "destination",
            ),
        )
        assertEquals("the visible insertion cue and release resolve to one command target", target, releasedAtCue)
    }

    @Test
    fun insertionCueIsOnlyAResolvedLegalRowBoundary() {
        val bounds = mapOf(
            "routine-source" to Rect(0f, 20f, 100f, 100f),
            "routine-anchor" to Rect(0f, 100f, 100f, 180f),
            "routine-next" to Rect(0f, 180f, 100f, 260f),
        )
        val sections = bounds.keys.associateWith { "section-1" }
        val order = mapOf<String?, List<String>>("section-1" to listOf("routine-source", "routine-anchor", "routine-next"))
        val target = resolveAndroidDropTarget(
            positionY = 150f,
            sourceEntryId = "routine-source",
            sourceSectionId = "section-1",
            entryBounds = bounds,
            entrySectionIds = sections,
            entryAnchorEligible = bounds.keys.associateWith { true },
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
            canonicalEntryOrderBySection = order,
            canonicalEntrySectionById = sections,
        )

        assertEquals("routine-anchor", target?.anchorEntryId)
        assertEquals(PlacementEdge.AFTER, target?.edge)
        assertEquals(180f, target?.resolvedBoundaryY)
        assertTrue(target?.resolvedBoundaryY == bounds[target?.anchorEntryId]?.top
            || target?.resolvedBoundaryY == bounds[target?.anchorEntryId]?.bottom)
        assertEquals(
            "release on the rendered line must preserve anchor, section and edge",
            target,
            resolveAndroidDropTarget(
                positionY = target!!.resolvedBoundaryY!!,
                sourceEntryId = "routine-source",
                sourceSectionId = "section-1",
                entryBounds = bounds,
                entrySectionIds = sections,
                entryAnchorEligible = bounds.keys.associateWith { true },
                emptySectionBounds = emptyMap(),
                emptySectionIds = emptyMap(),
                canonicalEntryOrderBySection = order,
                canonicalEntrySectionById = sections,
            ),
        )
    }

    @Test
    fun staleMovedLifecycleAndEndedSectionAnchorsHaveNoCue() {
        val bounds = mapOf("anchor" to Rect(0f, 100f, 100f, 180f))
        val staleSource = resolveAndroidDropTarget(
            positionY = 150f,
            sourceEntryId = "source",
            sourceSectionId = "old-source-section",
            entryBounds = bounds,
            entrySectionIds = mapOf("anchor" to "target-section", "source" to "old-source-section"),
            entryAnchorEligible = mapOf("source" to true, "anchor" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
            canonicalEntrySectionById = mapOf("source" to "new-source-section", "anchor" to "target-section"),
        )
        val staleSection = resolveAndroidDropTarget(
            positionY = 150f,
            sourceEntryId = "source",
            sourceSectionId = "source-section",
            entryBounds = bounds,
            entrySectionIds = mapOf("anchor" to "old-section"),
            entryAnchorEligible = mapOf("anchor" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
            canonicalEntrySectionById = mapOf("source" to "source-section", "anchor" to "new-section"),
        )
        val ineligibleLifecycle = resolveAndroidDropTarget(
            positionY = 150f,
            sourceEntryId = "source",
            sourceSectionId = "source-section",
            entryBounds = bounds,
            entrySectionIds = mapOf("anchor" to "target-section"),
            entryAnchorEligible = mapOf("anchor" to false),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )
        val endedSection = resolveAndroidDropTarget(
            positionY = 150f,
            sourceEntryId = "source",
            sourceSectionId = "source-section",
            entryBounds = bounds,
            entrySectionIds = mapOf("anchor" to "ended-section"),
            entryAnchorEligible = mapOf("anchor" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
            endedSectionIds = setOf("ended-section"),
        )

        assertNull(staleSource)
        assertNull(staleSection)
        assertNull(ineligibleLifecycle)
        assertNull(endedSection)
    }

    @Test
    fun repeatedConsumedScrollKeepsRebasePendingUntilScrollStops() {
        var rebasePending = false

        listOf(12f, 12f, 8f).forEach { consumed ->
            if (shouldRebaseAndroidDragAfterConsumedScroll(consumed)) rebasePending = true
        }
        assertTrue(rebasePending)

        val stopConsumed = 0f
        if (!shouldRebaseAndroidDragAfterConsumedScroll(stopConsumed)) rebasePending = false
        assertFalse(rebasePending)
    }

    @Test
    fun refreshedBoundsAreUsedForTheNewlyVisibleDropTarget() {
        val beforeScroll = resolveAndroidDropTarget(
            positionY = 620f,
            sourceEntryId = "entry-source",
            entryBounds = mapOf("entry-visible" to Rect(0f, 120f, 100f, 200f)),
            entrySectionIds = mapOf("entry-visible" to "section-1"),
            entryAnchorEligible = mapOf("entry-visible" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )
        val afterScroll = resolveAndroidDropTarget(
            positionY = 620f,
            sourceEntryId = "entry-source",
            entryBounds = mapOf("entry-offscreen-before" to Rect(0f, 580f, 100f, 660f)),
            entrySectionIds = mapOf("entry-offscreen-before" to "section-2"),
            entryAnchorEligible = mapOf("entry-offscreen-before" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(null, beforeScroll)
        assertEquals(
            AndroidDropTarget("entry:entry-offscreen-before", "section-2", "entry-offscreen-before", PlacementEdge.AFTER, 660f),
            afterScroll,
        )
    }

    @Test
    fun adjacentRowsResolveToOneCanonicalInsertionBoundary() {
        val target = resolveAndroidDropTarget(
            positionY = 100f,
            sourceEntryId = "entry-source",
            entryBounds = mapOf(
                "entry-a" to Rect(0f, 20f, 100f, 100f),
                "entry-b" to Rect(0f, 100f, 100f, 180f),
            ),
            entrySectionIds = mapOf("entry-a" to "section-1", "entry-b" to "section-1"),
            entryAnchorEligible = mapOf("entry-a" to true, "entry-b" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-a"), target?.key)
        assertEquals(PlacementEdge.AFTER, target?.edge)
        assertEquals(100f, target?.resolvedBoundaryY)
    }

    @Test
    fun sourceAfterAdjacentRowsCanResolveTheUpperBoundaryWithoutSelfTarget() {
        val target = resolveAndroidDropTarget(
            positionY = 100f,
            sourceEntryId = "entry-d",
            entryBounds = mapOf(
                "entry-a" to Rect(0f, 20f, 100f, 100f),
                "entry-b" to Rect(0f, 100f, 100f, 180f),
                "entry-c" to Rect(0f, 180f, 100f, 260f),
                "entry-d" to Rect(0f, 260f, 100f, 340f),
            ),
            entrySectionIds = mapOf(
                "entry-a" to "section-1",
                "entry-b" to "section-1",
                "entry-c" to "section-1",
                "entry-d" to "section-1",
            ),
            entryAnchorEligible = mapOf(
                "entry-a" to true,
                "entry-b" to true,
                "entry-c" to true,
                "entry-d" to true,
            ),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-a"), target?.key)
        assertEquals(PlacementEdge.AFTER, target?.edge)
        assertEquals(100f, target?.resolvedBoundaryY)
    }

    @Test
    fun sourceBeforeTargetCanResolveTheLowerAdjacentBoundary() {
        val target = resolveAndroidDropTarget(
            positionY = 220f,
            sourceEntryId = "entry-b",
            entryBounds = mapOf(
                "entry-a" to Rect(0f, 20f, 100f, 100f),
                "entry-b" to Rect(0f, 100f, 100f, 180f),
                "entry-c" to Rect(0f, 180f, 100f, 260f),
                "entry-d" to Rect(0f, 260f, 100f, 340f),
            ),
            entrySectionIds = mapOf(
                "entry-a" to "section-1",
                "entry-b" to "section-1",
                "entry-c" to "section-1",
                "entry-d" to "section-1",
            ),
            entryAnchorEligible = mapOf(
                "entry-a" to true,
                "entry-b" to true,
                "entry-c" to true,
                "entry-d" to true,
            ),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-c"), target?.key)
        assertEquals(PlacementEdge.AFTER, target?.edge)
        assertEquals(260f, target?.resolvedBoundaryY)
    }

    @Test
    fun ordinarySameCohortUsesForgivingOwnershipZone() {
        val target = resolveAndroidDropTarget(
            positionY = 240f,
            sourceEntryId = "entry-b",
            sourceSectionId = "section-1",
            entryBounds = mapOf(
                "entry-a" to Rect(0f, 20f, 100f, 100f),
                "entry-b" to Rect(0f, 100f, 100f, 180f),
                "entry-c" to Rect(0f, 180f, 100f, 260f),
                "entry-d" to Rect(0f, 260f, 100f, 340f),
            ),
            entrySectionIds = mapOf(
                "entry-a" to "section-1",
                "entry-b" to "section-1",
                "entry-c" to "section-1",
                "entry-d" to "section-1",
            ),
            entryAnchorEligible = mapOf(
                "entry-a" to true,
                "entry-b" to true,
                "entry-c" to true,
                "entry-d" to true,
            ),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-c"), target?.key)
        assertEquals(PlacementEdge.AFTER, target?.edge)
        assertEquals(260f, target?.resolvedBoundaryY)
    }

    @Test
    fun ordinaryCrossCohortBoundaryIsExposedForSingleTaskMove() {
        val target = resolveAndroidDropTarget(
            positionY = 240f,
            sourceEntryId = "entry-a",
            sourceSectionId = "section-1",
            entryBounds = mapOf(
                "entry-a" to Rect(0f, 20f, 100f, 100f),
                "entry-b" to Rect(0f, 100f, 100f, 180f),
                "entry-c" to Rect(0f, 180f, 100f, 260f),
                "entry-d" to Rect(0f, 260f, 100f, 340f),
            ),
            entrySectionIds = mapOf(
                "entry-a" to "section-1",
                "entry-b" to "section-1",
                "entry-c" to "section-1",
                "entry-d" to "section-1",
            ),
            entryAnchorEligible = mapOf(
                "entry-a" to true,
                "entry-b" to true,
                "entry-c" to true,
                "entry-d" to true,
            ),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-c"), target?.key)
        assertEquals(PlacementEdge.AFTER, target?.edge)
        assertEquals(260f, target?.resolvedBoundaryY)
    }

    @Test
    fun sourceSlotIsNeutralWhenEveryVisibleBoundaryPreservesOrder() {
        val target = resolveAndroidDropTarget(
            positionY = 150f,
            sourceEntryId = "entry-b",
            sourceSectionId = "section-1",
            entryBounds = mapOf(
                "entry-a" to Rect(0f, 20f, 100f, 100f),
                "entry-b" to Rect(0f, 100f, 100f, 180f),
                "entry-c" to Rect(0f, 180f, 100f, 260f),
            ),
            entrySectionIds = mapOf(
                "entry-a" to "section-1",
                "entry-b" to "section-1",
                "entry-c" to "section-1",
            ),
            entryAnchorEligible = mapOf(
                "entry-a" to true,
                "entry-b" to true,
                "entry-c" to true,
            ),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertNull(target)
    }

    @Test
    fun twoRowSourceAExposesOnlyMeaningfulDownwardMove() {
        val target = resolveAndroidDropTarget(
            positionY = 160f,
            sourceEntryId = "entry-a",
            sourceSectionId = "section-1",
            entryBounds = mapOf(
                "entry-a" to Rect(0f, 20f, 100f, 100f),
                "entry-b" to Rect(0f, 100f, 100f, 180f),
            ),
            entrySectionIds = mapOf("entry-a" to "section-1", "entry-b" to "section-1"),
            entryAnchorEligible = mapOf("entry-a" to true, "entry-b" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-b"), target?.key)
        assertEquals(PlacementEdge.AFTER, target?.edge)
        assertEquals(180f, target?.resolvedBoundaryY)
    }

    @Test
    fun twoRowSourceBExposesOnlyMeaningfulUpwardMove() {
        val target = resolveAndroidDropTarget(
            positionY = 40f,
            sourceEntryId = "entry-b",
            sourceSectionId = "section-1",
            entryBounds = mapOf(
                "entry-a" to Rect(0f, 20f, 100f, 100f),
                "entry-b" to Rect(0f, 100f, 100f, 180f),
            ),
            entrySectionIds = mapOf("entry-a" to "section-1", "entry-b" to "section-1"),
            entryAnchorEligible = mapOf("entry-a" to true, "entry-b" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-a"), target?.key)
        assertEquals(PlacementEdge.BEFORE, target?.edge)
        assertEquals(20f, target?.resolvedBoundaryY)
    }

    @Test
    fun reorderedTwoRowSourceCanMoveBackAfterTheOtherRow() {
        val target = resolveAndroidDropTarget(
            positionY = 160f,
            sourceEntryId = "entry-b",
            sourceSectionId = "section-1",
            entryBounds = mapOf(
                "entry-b" to Rect(0f, 20f, 100f, 100f),
                "entry-a" to Rect(0f, 100f, 100f, 180f),
            ),
            entrySectionIds = mapOf("entry-a" to "section-1", "entry-b" to "section-1"),
            entryAnchorEligible = mapOf("entry-a" to true, "entry-b" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-a"), target?.key)
        assertEquals(PlacementEdge.AFTER, target?.edge)
    }

    @Test
    fun twoRowNoOpZonesDoNotResolveToVisibleMoveTargets() {
        val commonBounds = mapOf(
            "entry-a" to Rect(0f, 20f, 100f, 100f),
            "entry-b" to Rect(0f, 100f, 100f, 180f),
        )
        val commonSections = mapOf("entry-a" to "section-1", "entry-b" to "section-1")
        assertNull(
            resolveAndroidDropTarget(
                positionY = 120f,
                sourceEntryId = "entry-a",
                sourceSectionId = "section-1",
                entryBounds = commonBounds,
                entrySectionIds = commonSections,
                entryAnchorEligible = mapOf("entry-a" to true, "entry-b" to true),
                emptySectionBounds = emptyMap(),
                emptySectionIds = emptyMap(),
            ),
        )
        assertNull(
            resolveAndroidDropTarget(
                positionY = 80f,
                sourceEntryId = "entry-b",
                sourceSectionId = "section-1",
                entryBounds = commonBounds,
                entrySectionIds = commonSections,
                entryAnchorEligible = mapOf("entry-a" to true, "entry-b" to true),
                emptySectionBounds = emptyMap(),
                emptySectionIds = emptyMap(),
            ),
        )
    }

    @Test
    fun routineRelativeBoundaryMayCrossPlannedStartCohortsWithinSection() {
        val target = resolveAndroidDropTarget(
            positionY = 150f,
            sourceEntryId = "routine-source",
            sourceSectionId = "section-1",
            entryBounds = mapOf(
                "routine-source" to Rect(0f, 20f, 100f, 100f),
                "routine-anchor" to Rect(0f, 100f, 100f, 180f),
            ),
            entrySectionIds = mapOf(
                "routine-source" to "section-1",
                "routine-anchor" to "section-1",
            ),
            entryAnchorEligible = mapOf("routine-anchor" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("routine-anchor"), target?.key)
        assertEquals(PlacementEdge.AFTER, target?.edge)
        assertEquals(180f, target?.resolvedBoundaryY)
    }

    @Test
    fun crossSectionBoundaryRemainsAvailableAcrossCohorts() {
        val target = resolveAndroidDropTarget(
            positionY = 150f,
            sourceEntryId = "entry-source",
            sourceSectionId = "section-1",
            entryBounds = mapOf("entry-target" to Rect(0f, 100f, 100f, 180f)),
            entrySectionIds = mapOf("entry-target" to "section-2"),
            entryAnchorEligible = mapOf("entry-target" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(entryDropKey("entry-target"), target?.key)
    }

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
        assertTrue(
            "pending=${controller.state.pendingEntryIds} refreshes=$refreshes",
            await { controller.state.pendingEntryIds.isEmpty() && refreshes == 1 },
        )
        assertEquals(1, refreshes)
        controller.close()
    }

    @Test
    fun futurePlanningAllowsEligibleMutationButPastRemainsReadOnly() {
        val controller = TodayDirectManipulationController(
            repository = FakeRepository(),
            onRefresh = {},
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        assertTrue(controller.canDrag(day(), task(LifecycleState.PLANNED)))
        assertFalse(controller.canDrag(day(), task(LifecycleState.RUNNING)))
        assertFalse(controller.canDrag(day(), task(LifecycleState.COMPLETED)))
        assertTrue(controller.canDrag(day(), task(LifecycleState.PLANNED, routineDerived = true)))
        assertTrue(controller.canDrag(futureDay(), task(LifecycleState.PLANNED)))
        assertTrue(controller.canSelect(futureDay(), task(LifecycleState.PLANNED)))
        assertFalse(controller.canDrag(pastDay(), task(LifecycleState.PLANNED)))
        assertFalse(controller.canSelect(pastDay(), task(LifecycleState.PLANNED)))
        controller.close()
    }

    @Test
    fun successfulPlacementRevisionIsConfirmedBeforeRefresh() {
        val repository = FakeRepository().apply {
            result = DirectManipulationResult.SuccessWithRevision(8)
        }
        val confirmations = mutableListOf<Pair<String, Int>>()
        val controller = TodayDirectManipulationController(
            repository = repository,
            onRefresh = {},
            onUnauthorized = {},
            onPlacementRevisionConfirmed = { date, revision -> confirmations += date to revision },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

        controller.reorder(day(), "section-1", listOf("entry-2", "entry-1"), setOf("entry-1"))

        assertTrue(await { controller.state.pendingEntryIds.isEmpty() })
        assertEquals(listOf("2026-09-14" to 8), confirmations)
        controller.close()
    }

    @Test
    fun consecutiveMovesUseTheConfirmedRevisionForTheNextRequest() {
        val requests = CopyOnWriteArrayList<DirectManipulationRequest>()
        val initialDay = day()
        var latestDay = initialDay
        val repository = object : TodayDirectManipulationRepository {
            override fun execute(request: DirectManipulationRequest): DirectManipulationResult {
                requests += request
                return DirectManipulationResult.SuccessWithRevision(
                    initialDay.placementRevision + requests.size,
                )
            }
        }
        val controller = TodayDirectManipulationController(
            repository = repository,
            onRefresh = {},
            onUnauthorized = {},
            onPlacementRevisionConfirmed = { date, revision ->
                if (date == latestDay.logicalDate) {
                    latestDay = latestDay.copy(
                        placementRevision = maxOf(latestDay.placementRevision, revision),
                    )
                }
            },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        val target = PlacementTarget("section-1", "entry-2", PlacementEdge.AFTER)

        controller.move(latestDay, "entry-1", target)
        assertTrue(await { requests.size == 1 && controller.state.pendingEntryIds.isEmpty() })
        controller.move(latestDay, "entry-1", target)
        assertTrue(await { requests.size == 2 && controller.state.pendingEntryIds.isEmpty() })

        assertEquals(
            listOf(initialDay.placementRevision, initialDay.placementRevision + 1),
            requests.map { (it as DirectManipulationRequest.Move).expectedPlacementRevision },
        )
        controller.close()
    }

    @Test
    fun futurePlanningDispatchesDuplicateMoveAndDeleteCommands() {
        val repository = FakeRepository()
        val controller = TodayDirectManipulationController(
            repository = repository,
            onRefresh = {},
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        val future = futureDay()
        val source = task(LifecycleState.PLANNED)

        controller.duplicate(future, source)
        assertTrue(await { repository.requests.size == 1 && controller.state.pendingEntryIds.isEmpty() })
        controller.moveToDay(future, setOf(source.id), "2026-09-16")
        assertTrue(await { repository.requests.size == 2 && controller.state.pendingEntryIds.isEmpty() })
        controller.delete(future, setOf(source.id))

        assertTrue(await { repository.requests.size == 3 })
        assertTrue(repository.requests[0] is DirectManipulationRequest.Duplicate)
        assertTrue(repository.requests[1] is DirectManipulationRequest.MoveToDay)
        assertTrue(repository.requests[2] is DirectManipulationRequest.Delete)
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
        assertFalse(requests[0].third.orEmpty().contains("relative_planned_start"))
        assertTrue(requests[1].second.endsWith("/entries/entry-1/duplicate"))
        assertTrue(requests[2].third.orEmpty().contains("\"section_id\":\"section-empty\""))
        assertFalse(requests[2].third.orEmpty().contains("\"placement\""))
    }

    @Test
    fun httpRepositoryParsesSuccessfulPlacementRevisionWhenPresent() {
        val repository = TodayDirectManipulationHttpRepository(
            request = { _, _, _ -> TodayHttpResponse(200, "{\"placement_revision\":8}") },
        )

        assertEquals(
            DirectManipulationResult.SuccessWithRevision(8),
            repository.execute(DirectManipulationRequest.Move(
                operationId = "op-revision",
                entryId = "entry-1",
                taskChuteDayId = "day-1",
                sectionId = "section-2",
                expectedPlacementRevision = 7,
                placement = null,
            )),
        )
    }

    @Test
    fun httpRepositoryPreservesStructuredWorkerFailureWithoutChangingGenericUiCopy() {
        val result = parseDirectManipulationFailure(
            """{"error":{"code":"resource_conflict","message":"placement snapshot conflict","reconcile":true}}""",
            409,
        )

        assertEquals(DETERMINISTIC_FAILURE_MESSAGE, result.message)
        assertEquals(409, result.status)
        assertEquals("resource_conflict", result.code)
        assertEquals("placement snapshot conflict", result.serverMessage)
        assertEquals(true, result.reconcile)
    }

    @Test
    fun realHttpClientChainUsesReturnedRevisionForImmediateSecondMove() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val responses = mutableListOf(
            TodayHttpResponse(200, "{\"placement_revision\":1}"),
            TodayHttpResponse(
                409,
                """{"error":{"code":"resource_conflict","message":"placement snapshot conflict","reconcile":true}}""",
            ),
        )
        val repository = TodayDirectManipulationHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                responses.removeAt(0)
            },
        )
        var confirmedRevision = 0
        val controller = TodayDirectManipulationController(
            repository = repository,
            onRefresh = {},
            onUnauthorized = {},
            onPlacementRevisionConfirmed = { _, revision -> confirmedRevision = revision },
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        val initial = fourTaskDay().copy(placementRevision = 0)

        controller.move(
            initial,
            entryId = "entry-2",
            target = PlacementTarget("section-1", "entry-3", PlacementEdge.AFTER),
        )
        assertTrue(await { requests.size == 1 && confirmedRevision == 1 })
        assertTrue(requests[0].third.orEmpty().contains("\"entry_id\":\"entry-2\""))
        assertTrue(requests[0].third.orEmpty().contains("\"anchor_entry_id\":\"entry-3\""))
        assertTrue(requests[0].third.orEmpty().contains("\"edge\":\"after\""))
        assertTrue(requests[0].third.orEmpty().contains("\"expected_placement_revision\":0"))

        controller.move(
            initial.copy(placementRevision = confirmedRevision),
            entryId = "entry-2",
            target = PlacementTarget("section-1", "entry-4", PlacementEdge.AFTER),
        )
        assertTrue(await {
            requests.size == 2 &&
                controller.state.pendingEntryIds.isEmpty() &&
                controller.state.lastDeterministicFailure != null
        })
        assertTrue(requests[1].third.orEmpty().contains("\"entry_id\":\"entry-2\""))
        assertTrue(requests[1].third.orEmpty().contains("\"anchor_entry_id\":\"entry-4\""))
        assertTrue(requests[1].third.orEmpty().contains("\"edge\":\"after\""))
        assertTrue(requests[1].third.orEmpty().contains("\"expected_placement_revision\":1"))
        assertEquals(DETERMINISTIC_FAILURE_MESSAGE, controller.state.errorMessage)
        assertEquals(409, controller.state.lastDeterministicFailure?.status)
        assertEquals("resource_conflict", controller.state.lastDeterministicFailure?.code)
        assertEquals("placement snapshot conflict", controller.state.lastDeterministicFailure?.serverMessage)
        assertEquals(true, controller.state.lastDeterministicFailure?.reconcile)
        controller.close()
    }

    @Test
    fun todayPresentedDayCarriesConfirmedRevisionIntoImmediateSecondHttpMove() {
        val initialDay = fourTaskDay().copy(placementRevision = 0)
        val requests = mutableListOf<Triple<String, String, String?>>()
        val responses = mutableListOf(
            TodayHttpResponse(200, "{\"placement_revision\":1}"),
            TodayHttpResponse(200, "{\"placement_revision\":2}"),
        )
        val httpRepository = TodayDirectManipulationHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                responses.removeAt(0)
            },
        )
        val todayRepository = object : TodayRepository {
            override fun loadDay(logicalDate: String?): TodayResult = TodayResult.Success(initialDay)
            override fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult = TodayMutationResult.Success
            override fun completeTask(task: TodayTask): TodayMutationResult = TodayMutationResult.Success
        }
        val todayController = TodayController(
            repository = todayRepository,
            onUnauthorized = {},
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        todayController.loadCurrent()
        assertTrue(await { todayController.state.presentedDay != null })
        val directController = TodayDirectManipulationController(
            repository = httpRepository,
            onRefresh = {},
            onUnauthorized = {},
            onOptimisticIntent = todayController::applyOptimisticDirectManipulation,
            onPlacementRevisionConfirmed = todayController::confirmPlacementRevision,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

        directController.move(
            requireNotNull(todayController.state.presentedDay),
            entryId = "entry-2",
            target = PlacementTarget("section-1", "entry-3", PlacementEdge.AFTER),
        )
        assertTrue(
            "requests=${requests.size} revision=${todayController.state.presentedDay?.placementRevision} pending=${directController.state.pendingEntryIds}",
            await {
                requests.size == 1 &&
                    todayController.state.presentedDay?.placementRevision == 1 &&
                    directController.state.pendingEntryIds.isEmpty()
            },
        )
        assertEquals(
            listOf("entry-1", "entry-3", "entry-2", "entry-4"),
            todayController.state.presentedDay?.sections?.single()?.entries?.map { it.id },
        )

        directController.move(
            requireNotNull(todayController.state.presentedDay),
            entryId = "entry-2",
            target = PlacementTarget("section-1", "entry-4", PlacementEdge.AFTER),
        )
        assertTrue(await {
            requests.size == 2 &&
                todayController.state.presentedDay?.placementRevision == 2 &&
                directController.state.pendingEntryIds.isEmpty()
        })
        assertTrue(requests[1].third.orEmpty().contains("\"entry_id\":\"entry-2\""))
        assertTrue(requests[1].third.orEmpty().contains("\"anchor_entry_id\":\"entry-4\""))
        assertTrue(requests[1].third.orEmpty().contains("\"edge\":\"after\""))
        assertTrue(requests[1].third.orEmpty().contains("\"expected_placement_revision\":1"))
        assertEquals(
            listOf("entry-1", "entry-3", "entry-4", "entry-2"),
            todayController.state.presentedDay?.sections?.single()?.entries?.map { it.id },
        )
        directController.close()
        todayController.close()
    }

    @Test
    fun routineMoveUsesOccurrenceEndpointAndNoOrdinaryEntryPayload() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = TodayDirectManipulationHttpRepository(request = { method, path, body ->
            requests += Triple(method, path, body)
            TodayHttpResponse(200, "{}")
        })
        assertEquals(
            DirectManipulationResult.Success,
            repository.execute(DirectManipulationRequest.Move(
                operationId = "op-routine-move",
                entryId = "entry-1",
                taskChuteDayId = "day-1",
                sectionId = "section-2",
                expectedPlacementRevision = 5,
                placement = PlacementTarget("section-2", "entry-2", PlacementEdge.BEFORE),
                routineScoped = true,
                relativePlannedStartAnchor = true,
            )),
        )
        assertEquals("/api/v1/taskchute-days/current/entries/bulk-section-occurrence", requests.single().second)
        assertTrue(requests.single().third.orEmpty().contains("\"entry_ids\":[\"entry-1\"]"))
        assertTrue(requests.single().third.orEmpty().contains("\"placement\""))
        assertTrue(requests.single().third.orEmpty().contains("\"relative_planned_start\":\"anchor\""))
    }

    @Test
    fun routineNoAnchorMoveUsesOccurrenceEndpointWithoutRelativeAnchor() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = TodayDirectManipulationHttpRepository(request = { method, path, body ->
            requests += Triple(method, path, body)
            TodayHttpResponse(200, "{}")
        })

        assertEquals(
            DirectManipulationResult.Success,
            repository.execute(DirectManipulationRequest.Move(
                operationId = "op-routine-empty-section",
                entryId = "entry-routine",
                taskChuteDayId = "day-1",
                sectionId = "section-empty",
                expectedPlacementRevision = 5,
                placement = null,
                routineScoped = true,
                relativePlannedStartAnchor = false,
            )),
        )

        assertEquals("/api/v1/taskchute-days/current/entries/bulk-section-occurrence", requests.single().second)
        assertTrue(requests.single().third.orEmpty().contains("\"section_id\":\"section-empty\""))
        assertFalse(requests.single().third.orEmpty().contains("\"placement\""))
        assertFalse(requests.single().third.orEmpty().contains("relative_planned_start"))
    }

    @Test
    fun routineSectionlessNoAnchorMoveRemainsOccurrenceAware() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = TodayDirectManipulationHttpRepository(request = { method, path, body ->
            requests += Triple(method, path, body)
            TodayHttpResponse(200, "{}")
        })

        repository.execute(DirectManipulationRequest.Move(
            operationId = "op-routine-unsectioned",
            entryId = "entry-routine",
            taskChuteDayId = "day-1",
            sectionId = null,
            expectedPlacementRevision = 5,
            placement = null,
            routineScoped = true,
            relativePlannedStartAnchor = false,
        ))

        assertEquals("/api/v1/taskchute-days/current/entries/bulk-section-occurrence", requests.single().second)
        assertTrue(requests.single().third.orEmpty().contains("\"section_id\":null"))
        assertFalse(requests.single().third.orEmpty().contains("\"placement\""))
        assertFalse(requests.single().third.orEmpty().contains("relative_planned_start"))
    }

    @Test
    fun establishedPastPlannedTaskCanDispatchForwardMoveWhenExplicitlyAllowed() {
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
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        controller.moveToDay(pastDay().copy(taskChuteDayId = "past-day"), setOf("entry-1"), "2026-09-20", allowPastSource = true)
        assertTrue(await { requests.singleOrNull() is DirectManipulationRequest.MoveToDay })
        controller.close()
    }

    @Test
    fun establishedPastPlannedTaskCanDispatchCurrentAndFutureDatePickerMoves() {
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
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )
        val source = pastDay().copy(taskChuteDayId = "past-day")

        controller.moveToDay(source, setOf("entry-1"), "2026-09-14", allowPastSource = true)
        assertTrue(await { requests.size == 1 && controller.state.pendingEntryIds.isEmpty() })
        controller.moveToDay(source, setOf("entry-1"), "2026-09-20", allowPastSource = true)

        assertTrue(await { requests.size == 2 })
        assertEquals(
            listOf("2026-09-14", "2026-09-20"),
            requests.map { (it as DirectManipulationRequest.MoveToDay).targetLogicalDate },
        )
        controller.close()
    }

    @Test
    fun establishedPastPlannedTaskRejectsPastDatePickerTargetWithoutMutation() {
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
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
        )

        controller.moveToDay(
            pastDay().copy(taskChuteDayId = "past-day"),
            setOf("entry-1"),
            "2026-09-12",
            allowPastSource = true,
        )

        assertTrue(requests.isEmpty())
        assertEquals("過去の日には移動できません。", controller.state.errorMessage)
        controller.close()
    }

    @Test
    fun onlyPlannedRowsIncludingRoutineRowsCanBeDropAnchors() {
        assertTrue(isEligibleAndroidDropAnchor(task(LifecycleState.PLANNED)))
        assertTrue(isEligibleAndroidDropAnchor(task(LifecycleState.PLANNED, routineDerived = true)))
        assertFalse(isEligibleAndroidDropAnchor(task(LifecycleState.RUNNING)))
        assertFalse(isEligibleAndroidDropAnchor(task(LifecycleState.COMPLETED)))
    }

    @Test
    fun routineSourceCanResolveRelativePlacementAgainstRoutineAnchor() {
        val target = resolveAndroidDropTarget(
            positionY = 300f,
            sourceEntryId = "routine-source",
            entryBounds = mapOf("routine-anchor" to Rect(0f, 260f, 100f, 340f)),
            entrySectionIds = mapOf("routine-anchor" to "section-1"),
            entryAnchorEligible = mapOf("routine-anchor" to true),
            emptySectionBounds = emptyMap(),
            emptySectionIds = emptyMap(),
        )

        assertEquals(
            AndroidDropTarget("entry:routine-anchor", "section-1", "routine-anchor", PlacementEdge.AFTER, 340f),
            target,
        )
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

        assertEquals(AndroidDropTarget("entry:entry-2", "section-2", "entry-2", PlacementEdge.AFTER, 340f), target)
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
    fun lifecycleDeleteUsesExistingEntryDeleteCompletedEndpoint() {
        val requests = mutableListOf<Triple<String, String, String?>>()
        val repository = TodayDirectManipulationHttpRepository(
            request = { method, path, body ->
                requests += Triple(method, path, body)
                TodayHttpResponse(200, "{}")
            },
        )

        assertEquals(
            DirectManipulationResult.Success,
            repository.execute(DirectManipulationRequest.HardDelete("op-hard-delete", "entry-1", "day-1", 7)),
        )
        assertEquals("/api/v1/entries/entry-1/delete-completed", requests.single().second)
        assertTrue(requests.single().third.orEmpty().contains("\"entry_id\":\"entry-1\""))
        assertTrue(requests.single().third.orEmpty().contains("\"expected_placement_revision\":7"))
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
    fun dropTargetResolverPrefersEmptySectionHeaderOverAdjacentTaskBoundary() {
        val target = resolveAndroidDropTarget(
            positionY = 180f,
            sourceEntryId = "entry-source",
            entryBounds = mapOf("entry-target" to Rect(0f, 100f, 100f, 220f)),
            entrySectionIds = mapOf("entry-target" to "section-morning"),
            entryAnchorEligible = mapOf("entry-target" to true),
            emptySectionBounds = mapOf("section-afternoon" to Rect(0f, 170f, 100f, 250f)),
            emptySectionIds = mapOf("section-afternoon" to "section-afternoon"),
        )

        assertEquals(AndroidDropTarget("section:section-afternoon", "section-afternoon", null, null), target)
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

    @Test
    fun deterministicFailureDismissalIsGenerationSafe() {
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
        assertTrue(await { controller.state.deterministicFailureToken != null })
        val firstToken = controller.state.deterministicFailureToken ?: error("missing first token")

        controller.reorder(day(), "section-1", listOf("entry-2", "entry-1"), setOf("entry-1"))
        assertTrue(await { controller.state.deterministicFailureToken?.let { it != firstToken } == true })
        val secondToken = controller.state.deterministicFailureToken ?: error("missing second token")

        controller.clearDeterministicError(firstToken)
        assertEquals(secondToken, controller.state.deterministicFailureToken)
        assertEquals(DETERMINISTIC_FAILURE_MESSAGE, controller.state.errorMessage)

        controller.clearDeterministicError(secondToken)
        assertEquals(null, controller.state.deterministicFailureToken)
        assertEquals(null, controller.state.errorMessage)
        controller.close()
    }
    private fun await(predicate: () -> Boolean): Boolean {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
        while (System.nanoTime() < deadline) {
            if (predicate()) return true
            Thread.sleep(1)
        }
        return predicate()
    }

    private class FakeRepository : TodayDirectManipulationRepository {
        val reorderCalls = AtomicInteger()
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        var hold = false
        var result: DirectManipulationResult = DirectManipulationResult.Success
        val requests = CopyOnWriteArrayList<DirectManipulationRequest>()

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

        fun fourTaskDay() = day().copy(
            sections = listOf(
                day().sections.single().copy(
                    entries = (1..4).map { index ->
                        task(LifecycleState.PLANNED).copy(
                            id = "entry-$index",
                            taskId = "task-$index",
                            title = "Task $index",
                        )
                    },
                ),
            ),
        )

        fun futureDay() = day().copy(
            logicalDate = "2026-09-15",
            isCurrent = false,
            taskChuteDayId = "future-day-1",
        )

        fun pastDay() = day().copy(
            logicalDate = "2026-09-13",
            isCurrent = false,
            planningEnabled = false,
            taskChuteDayId = null,
        )
    }
}
