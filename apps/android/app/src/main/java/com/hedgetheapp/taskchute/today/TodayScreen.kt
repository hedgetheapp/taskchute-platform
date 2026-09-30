package com.hedgetheapp.taskchute.today

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.zIndex
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.Context
import android.view.accessibility.AccessibilityManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.painterResource
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.delay
import kotlin.math.abs
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt
import com.hedgetheapp.taskchute.R
import com.hedgetheapp.taskchute.document.NotesController
import com.hedgetheapp.taskchute.document.TaskNoteBottomSheet
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AndroidNavigationBar
import com.hedgetheapp.taskchute.ui.ChromeIcon
import com.hedgetheapp.taskchute.ui.TaskChuteIcons
import com.hedgetheapp.taskchute.ui.MovableAddFab
import com.hedgetheapp.taskchute.ui.TaskChuteColors
import com.hedgetheapp.taskchute.ui.TaskChuteDatePickerDialog
import com.hedgetheapp.taskchute.ui.TaskChuteDateNavigator

private fun currentLogicalDate(day: TodayDay): String {
    val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
    val local = ZonedDateTime.now(zone)
    val logicalDate = if (local.hour * 60 + local.minute < day.establishmentBoundaryMinutes) local.toLocalDate().minusDays(1) else local.toLocalDate()
    return logicalDate.toString()
}

internal data class AndroidDateMoveRequest(
    val entryIds: Set<String>,
    val allowPastSource: Boolean,
)

@Composable
fun TodayScreen(controller: TodayController, onSignOut: () -> Unit) {
    TodayScreen(controller, null, {}, onSignOut)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(
    controller: TodayController,
    planningController: TaskPlanningController?,
    onNavigateSettings: () -> Unit,
    onSignOut: () -> Unit = {},
    onNavigateNotes: () -> Unit = {},
    onNavigateDaily: () -> Unit = {},
    directManipulationController: TodayDirectManipulationController? = null,
    onOpenTaskNote: (TodayTask) -> Unit = {},
    taskNoteController: NotesController? = null,
) {
    val state = controller.state
    val planningState = planningController?.state ?: TaskPlanningUiState()
    var selectedEntryIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var selectionModeActive by remember { mutableStateOf(false) }
    var datePickerMoveRequest by remember { mutableStateOf<AndroidDateMoveRequest?>(null) }
    var deleteEntryIds by remember { mutableStateOf<Set<String>?>(null) }
    var headerDatePickerVisible by remember { mutableStateOf(false) }
    var taskNoteSheetTask by remember { mutableStateOf<TodayTask?>(null) }
    val context = LocalContext.current
    val deterministicFailureToken = directManipulationController?.state?.let { directState ->
        if (directState.errorMessage == DETERMINISTIC_FAILURE_MESSAGE) directState.deterministicFailureToken else null
    }
    LaunchedEffect(controller) { controller.loadCurrent() }
    LaunchedEffect(deterministicFailureToken) {
        val token = deterministicFailureToken ?: return@LaunchedEffect
        val accessibilityManager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
        val timeoutMillis = accessibilityManager
            ?.getRecommendedTimeoutMillis(4_000, AccessibilityManager.FLAG_CONTENT_TEXT)
            ?.toLong()
            ?: 4_000L
        delay(timeoutMillis)
        directManipulationController?.clearDeterministicError(token)
    }
    LaunchedEffect(state.day, state.status) {
        selectionModeActive = false
        selectedEntryIds = emptySet()
    }
    val day = state.presentedDay
    var addFabOffset by remember(day?.logicalDate) { mutableStateOf(Offset.Zero) }
    var todayHeaderBottomPx by remember(day?.logicalDate) { mutableStateOf(0f) }
    var bottomOverlayTopPx by remember(day?.logicalDate) { mutableStateOf(Float.POSITIVE_INFINITY) }
    var bottomOverlayTopRootPx by remember(day?.logicalDate) { mutableStateOf(Float.POSITIVE_INFINITY) }
    if (headerDatePickerVisible && day != null) {
        TaskChuteDatePickerDialog(
            initialLogicalDate = day.logicalDate,
            onDismissRequest = { headerDatePickerVisible = false },
            onConfirm = { logicalDate ->
                headerDatePickerVisible = false
                controller.loadLogicalDate(logicalDate)
            },
        )
    }
    if (datePickerMoveRequest != null && day != null) {
        TaskChuteDatePickerDialog(
            initialLogicalDate = day.logicalDate,
            onDismissRequest = { datePickerMoveRequest = null },
            onConfirm = { logicalDate ->
                val request = datePickerMoveRequest ?: return@TaskChuteDatePickerDialog
                datePickerMoveRequest = null
                directManipulationController?.moveToDay(
                    day,
                    request.entryIds,
                    logicalDate,
                    allowPastSource = request.allowPastSource,
                )
            },
        )
    }
    val bulkSelected = day?.takeIf { canPlanDay(it) }
        ?.allEntries
        ?.filter { it.id in selectedEntryIds && it.lifecycleState == LifecycleState.PLANNED && !it.routineDerived }
        ?.map(TodayTask::id)
        ?.toSet()
        .orEmpty()

    Scaffold(
        containerColor = TaskChuteColors.Background,
        bottomBar = {
            Column {
                if (selectionModeActive && day != null) {
                    BulkActionBar(
                        count = bulkSelected.size,
                        hasSelection = bulkSelected.isNotEmpty(),
                        onChooseDate = {
                            datePickerMoveRequest = AndroidDateMoveRequest(bulkSelected, allowPastSource = false)
                        },
                        onDelete = { deleteEntryIds = bulkSelected },
                        onClear = {
                            selectionModeActive = false
                            selectedEntryIds = emptySet()
                        },
                    )
                }
                AndroidNavigationBar(
                    selected = AndroidDestination.TODAY,
                    onToday = controller::today,
                    onSettings = onNavigateSettings,
                    onNotes = onNavigateNotes,
                    onDaily = onNavigateDaily,
                )
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (state.status) {
                TodayLoadStatus.LOADING -> LoadingToday()
                TodayLoadStatus.REFRESHING,
                TodayLoadStatus.CONTENT,
                TodayLoadStatus.EMPTY,
                -> TodayContent(
                    controller = controller,
                    state = state,
                    planningController = planningController,
                    directManipulationController = directManipulationController,
                    onOpenTaskNote = { task ->
                        taskNoteSheetTask = task
                        onOpenTaskNote(task)
                    },
                    selectionModeActive = selectionModeActive,
                    onEnterSelection = { id ->
                        selectionModeActive = true
                        selectedEntryIds = selectedEntryIds + id
                    },
                    selectedEntryIds = selectedEntryIds,
                    onToggleSelection = { id ->
                        val next = if (id in selectedEntryIds) selectedEntryIds - id else selectedEntryIds + id
                        selectedEntryIds = next
                        selectionModeActive = next.isNotEmpty()
                    },
                    onOpenDatePicker = { entryIds, allowPastSource ->
                        datePickerMoveRequest = AndroidDateMoveRequest(entryIds, allowPastSource)
                    },
                    onOpenHeaderDatePicker = { headerDatePickerVisible = true },
                    onHeaderBoundsChanged = { todayHeaderBottomPx = it },
                    bottomOverlayTopRootPx = bottomOverlayTopRootPx,
                    onRequestDelete = { deleteEntryIds = it },
                    modifier = Modifier.fillMaxSize(),
                )
                TodayLoadStatus.ERROR -> TodayError(controller::refresh)
                TodayLoadStatus.AUTH_REQUIRED -> TodayAuthRequired()
            }
            if (state.status == TodayLoadStatus.CONTENT || state.status == TodayLoadStatus.EMPTY || state.status == TodayLoadStatus.REFRESHING) {
                state.presentedDay?.takeIf { canPlanDay(it) || it.isCurrent }?.let { day ->
                    val runningTask = if (day.isCurrent) day.runningTask else null
                    val canAdd = canPlanDay(day) && planningController != null
                    val unresolved = directManipulationController?.state?.unresolvedRequest != null
                    val deterministicFailure = deterministicFailureToken != null &&
                        directManipulationController?.state?.unresolvedRequest == null
                    LaunchedEffect(day.logicalDate, runningTask?.id, unresolved, deterministicFailure, selectionModeActive) {
                        if (selectionModeActive || (runningTask == null && !unresolved && !deterministicFailure)) {
                            bottomOverlayTopPx = Float.POSITIVE_INFINITY
                            bottomOverlayTopRootPx = Float.POSITIVE_INFINITY
                        }
                    }
                    if (canAdd || runningTask != null || unresolved || deterministicFailure) {
                        BoxWithConstraints(
                            modifier = Modifier
                                .fillMaxSize()
                                .zIndex(2f)
                                .navigationBarsPadding()
                                .padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
                        ) {
                            val density = LocalDensity.current
                            val fabSizePx = with(density) { 64.dp.toPx() }
                            val maxX = with(density) { (maxWidth - 64.dp).toPx().coerceAtLeast(0f) }
                            val safeTop = todayHeaderBottomPx + with(density) { 12.dp.toPx() }
                            val fabPanelGap = with(density) { 12.dp.toPx() }
                            val baselineFabTop = with(density) { maxHeight.toPx() } - fabSizePx
                            val overlayTop = bottomOverlayTopPx.takeIf { it.isFinite() }
                            val fabBaseTop = overlayTop?.let { it - fabPanelGap - fabSizePx } ?: baselineFabTop
                            val fabBaseOffsetY = fabBaseTop - baselineFabTop
                            val maxY = (fabBaseTop - safeTop).coerceAtLeast(0f)

                            if (canAdd && !selectionModeActive) {
                                MovableAddFab(
                                    onClick = { planningController.openCreate(day) },
                                    containerColor = Color(0xFFE8E8E5),
                                    contentColor = TaskChuteColors.Background,
                                    iconSize = 19.dp,
                                    contentDescription = "タスクを追加",
                                    onDrag = { delta ->
                                        addFabOffset = Offset(
                                            (addFabOffset.x + delta.x).coerceIn(-maxX, 0f),
                                            (addFabOffset.y + delta.y).coerceIn(-maxY, 0f),
                                        )
                                    },
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .offset {
                                            IntOffset(
                                                addFabOffset.x.roundToInt(),
                                                (fabBaseOffsetY + addFabOffset.y.coerceIn(-maxY, 0f)).roundToInt(),
                                            )
                                        }
                                        .size(64.dp)
                                )
                            }
                            if (runningTask != null || unresolved || deterministicFailure) {
                                Column(
                                    modifier = Modifier
                                        .align(Alignment.BottomCenter)
                                        .fillMaxWidth()
                                        .onGloballyPositioned {
                                            bottomOverlayTopPx = it.boundsInParent().top
                                            bottomOverlayTopRootPx = it.boundsInRoot().top
                                        },
                                    horizontalAlignment = Alignment.End,
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    if (unresolved) {
                                        OperationUnresolvedPanel(
                                            onRetry = directManipulationController::retryUnresolved,
                                        )
                                    }
                                    if (deterministicFailure) {
                                        OperationFailedPanel()
                                    }
                                    if (!selectionModeActive) runningTask?.let { task ->
                                        RunningTaskPanel(
                                            task = task,
                                            controller = controller,
                                            enabled = !state.pendingEntryIds.contains(task.id),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (planningController != null && planningState.editor != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = planningController::dismiss,
            sheetState = sheetState,
            containerColor = Color(0xFF202020),
            scrimColor = Color.Black.copy(alpha = 0.42f),
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
            dragHandle = {
                Box(Modifier.width(40.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFA3A3A0).copy(alpha = 0.55f)))
            },
        ) {
            TaskEditorForm(planningController, planningState, Modifier.imePadding())
        }
    }

    if (taskNoteSheetTask != null && taskNoteController != null) {
        TaskNoteBottomSheet(
            controller = taskNoteController,
            onDismiss = { taskNoteSheetTask = null },
        )
    }

    deleteEntryIds?.let { entryIds ->
        AlertDialog(
            onDismissRequest = { deleteEntryIds = null },
            title = { Text("タスクを削除") },
            text = { Text("選択した${entryIds.size}件の予定を削除しますか？") },
            confirmButton = {
                TextButton(onClick = {
                    deleteEntryIds = null
                    day?.let { currentDay ->
                        val task = currentDay.allEntries.singleOrNull { it.id in entryIds }
                        if (task != null && task.lifecycleState != LifecycleState.PLANNED) {
                            directManipulationController?.deleteLifecycle(currentDay, task)
                        } else {
                            directManipulationController?.delete(currentDay, entryIds)
                        }
                    }
                }) { Text("削除") }
            },
            dismissButton = { TextButton(onClick = { deleteEntryIds = null }) { Text("キャンセル") } },
        )
    }
}

@Composable
private fun BulkActionBar(
    count: Int,
    hasSelection: Boolean,
    onChooseDate: () -> Unit,
    onDelete: () -> Unit,
    onClear: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(72.dp).background(Color(0xFF222222)).padding(start = 14.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        Text("${count}件選択", modifier = Modifier.width(88.dp), color = TaskChuteColors.PrimaryText, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        BulkActionButton("日付", hasSelection, onChooseDate)
        BulkActionButton("削除", hasSelection, onDelete, Color(0xFFFF6B6B))
        BulkActionButton("解除", true, onClear)
    }
}

@Composable
private fun BulkActionButton(label: String, enabled: Boolean, onClick: () -> Unit, color: Color = TaskChuteColors.PrimaryText) {
    Box(
        modifier = Modifier.width(54.dp).height(48.dp).clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = if (enabled) color else color.copy(alpha = 0.38f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun TodayContent(
    controller: TodayController,
    state: TodayUiState,
    planningController: TaskPlanningController?,
    directManipulationController: TodayDirectManipulationController?,
    onOpenTaskNote: (TodayTask) -> Unit,
    selectionModeActive: Boolean,
    onEnterSelection: (String) -> Unit,
    selectedEntryIds: Set<String>,
    onToggleSelection: (String) -> Unit,
    onOpenDatePicker: (Set<String>, Boolean) -> Unit,
    onOpenHeaderDatePicker: () -> Unit,
    onHeaderBoundsChanged: (Float) -> Unit,
    bottomOverlayTopRootPx: Float,
    onRequestDelete: (Set<String>) -> Unit,
    modifier: Modifier,
) {
    val day = state.presentedDay ?: return LoadingToday()
    val rowBounds = remember { mutableStateMapOf<String, Rect>() }
    val dropBounds = remember { mutableStateMapOf<String, Rect>() }
    val dropBoundsSectionId = remember { mutableStateMapOf<String, String?>() }
    val dropBoundsEligible = remember { mutableStateMapOf<String, Boolean>() }
    val emptySectionDropBounds = remember { mutableStateMapOf<String, Rect>() }
    val emptySectionDropIds = remember { mutableStateMapOf<String, String?>() }
    var collapsedSectionIds by remember(day.logicalDate) { mutableStateOf<Set<String>>(emptySet()) }
    var dragState by remember { mutableStateOf<AndroidDragState?>(null) }
    var dragContentRootTop by remember { mutableStateOf(0f) }
    var dragViewportBounds by remember { mutableStateOf<Rect?>(null) }
    var dragPointerRootY by remember { mutableStateOf<Float?>(null) }
    var dragPointerHostRootTop by remember { mutableStateOf(0f) }
    var dragPointerDown by remember { mutableStateOf(false) }
    var dragPointerId by remember { mutableStateOf<PointerId?>(null) }
    var dragPointerSessionActive by remember { mutableStateOf(false) }
    var dragFinishIssued by remember { mutableStateOf(false) }
    var autoScrollConsumed by remember { mutableStateOf(false) }
    var openSwipeEntryId by remember { mutableStateOf<String?>(null) }
    // Active drag presentation always renders the canonical Day. The source slot stays stable;
    // only the pointer overlay and destination cue move.
    val renderDay = day
    LaunchedEffect(day.logicalDate, state.status) { openSwipeEntryId = null }
    LaunchedEffect(day, dragState != null) {
        day.sections.filter { section ->
            section.id !in collapsedSectionIds && section.entries.any(::isEligibleAndroidDropAnchor)
        }.forEach {
            emptySectionDropBounds.remove(it.id)
            emptySectionDropIds.remove(it.id)
        }
        if (day.unsectionedEntries.isNotEmpty() || dragState == null) {
            emptySectionDropBounds.remove(UNSECTIONED_DROP_KEY)
            emptySectionDropIds.remove(UNSECTIONED_DROP_KEY)
        }
    }
    fun updateDragPosition(pointerRootY: Float) {
        val current = dragState ?: return
        val positionY = pointerRootY
        val target = resolveAndroidDropTarget(
            positionY = positionY,
            sourceEntryId = current.entryId,
            sourceSectionId = current.sourceSectionId,
            entryBounds = current.entryBoundsSnapshot,
            entrySectionIds = current.entrySectionIdsSnapshot,
            entryAnchorEligible = current.entryAnchorEligibleSnapshot,
            // Task geometry remains frozen for D-127 stability. Empty Section headers can
            // mount after drag start (notably the temporary unsectioned header), so only
            // Section-level target maps are read live here.
            emptySectionBounds = emptySectionDropBounds.toMap(),
            emptySectionIds = emptySectionDropIds.toMap(),
            endedSectionIds = endedSectionIdsForAndroid(day),
        )
        dragState = current.copy(
            positionY = positionY,
            deltaY = positionY - (current.positionY - current.deltaY),
            target = target,
        )
        dragPointerRootY = positionY
    }
    fun finishDrag() {
        val drag = dragState ?: return
        dragState = null
        dragPointerRootY = null
        dragPointerDown = false
        dragPointerId = null
        dragPointerSessionActive = false
        autoScrollConsumed = false
        val target = drag.target ?: return
        val source = day.allEntries.firstOrNull { it.id == drag.entryId } ?: return
        val targetSectionId = target.sectionId
        val targetEntryId = target.anchorEntryId
        if (targetEntryId == null) {
            if (drag.sourceSectionId == targetSectionId) return
            directManipulationController?.move(
                day,
                source.id,
                targetSectionId,
                null,
                routineScoped = source.routineDerived,
                relativePlannedStartAnchor = false,
            )
            return
        }
        val edge = target.edge ?: return
        if (drag.sourceSectionId == targetSectionId) {
            val entries = sectionEntries(day, targetSectionId)
            val currentIds = entries.map { it.id }
            val sourceIndex = currentIds.indexOf(source.id)
            val targetIndex = currentIds.indexOf(targetEntryId)
            if (sourceIndex < 0 || targetIndex < 0 || sourceIndex == targetIndex) return
            val remaining = currentIds.filterNot { it == source.id }.toMutableList()
            var insertion = if (edge == PlacementEdge.BEFORE) targetIndex else targetIndex + 1
            if (sourceIndex < insertion) insertion -= 1
            remaining.add(insertion.coerceIn(0, remaining.size), source.id)
            if (remaining != currentIds) {
                directManipulationController?.move(
                    day,
                    source.id,
                    targetSectionId,
                    PlacementTarget(targetSectionId, targetEntryId, edge),
                    routineScoped = source.routineDerived,
                    relativePlannedStartAnchor = source.routineDerived,
                )
            }
        } else {
            directManipulationController?.move(
                day,
                source.id,
                targetSectionId,
                PlacementTarget(targetSectionId, targetEntryId, edge),
                routineScoped = source.routineDerived,
                relativePlannedStartAnchor = source.routineDerived,
            )
        }
    }
    // The parent pointer coroutine is intentionally keyed only by logical date so an active
    // drag is not cancelled by ordinary same-day recomposition. Keep its command callback
    // current so a later physical pointer-up uses the latest placement revision.
    val latestFinishDrag = rememberUpdatedState(newValue = { finishDrag() })
    val pullToRefreshState = rememberPullToRefreshState()
    val todayListState = rememberLazyListState()
    val edgeZonePx = with(LocalDensity.current) { D148_DRAG_EDGE_ZONE.dp.toPx() }
    val maxAutoScrollDeltaPx = with(LocalDensity.current) { D148_DRAG_MAX_SCROLL_PER_FRAME.dp.toPx() }
    val insertionLineHalfHeightPx = with(LocalDensity.current) { 1.5.dp.toPx() }
    LaunchedEffect(dragState != null, day.logicalDate) {
        while (dragState != null) {
            val pointerY = dragPointerRootY
            val viewport = dragViewportBounds
            val delta = if (pointerY != null && viewport != null) {
                androidDragAutoScrollDelta(
                    pointerY = pointerY,
                    viewportTop = viewport.top,
                    viewportBottom = viewport.bottom,
                    edgeZonePx = edgeZonePx,
                    maxDeltaPx = maxAutoScrollDeltaPx,
                    canScrollBackward = todayListState.canScrollBackward,
                    canScrollForward = todayListState.canScrollForward,
                )
            } else {
                0f
            }
            if (delta != 0f) {
                val consumed = todayListState.scrollBy(delta)
                if (shouldRebaseAndroidDragAfterConsumedScroll(consumed)) {
                    // Keep the source row in its canonical slot while the list is moving.
                    // The destination target is refreshed from the post-scroll geometry below;
                    // it is rendered as a non-layout-shifting cue.
                    autoScrollConsumed = true
                    // Scroll mutates LazyListState immediately, but bounds are published by
                    // the next layout pass. Rebase only after that pass, keeping ordinary
                    // drag hit-testing on its stable snapshot.
                    withFrameNanos { }
                    withFrameNanos { }
                    val current = dragState
                    val currentPointer = dragPointerRootY
                    if (current != null && currentPointer != null) {
                        val target = resolveAndroidDropTarget(
                            positionY = currentPointer,
                            sourceEntryId = current.entryId,
                            sourceSectionId = current.sourceSectionId,
                            entryBounds = dropBounds.toMap(),
                            entrySectionIds = dropBoundsSectionId.toMap(),
                            entryAnchorEligible = dropBoundsEligible.toMap(),
                            emptySectionBounds = emptySectionDropBounds.toMap(),
                            emptySectionIds = emptySectionDropIds.toMap(),
                            endedSectionIds = endedSectionIdsForAndroid(day),
                        )
                        dragState = current.copy(
                            rowBoundsSnapshot = rowBounds.toMap(),
                            entryBoundsSnapshot = dropBounds.toMap(),
                            entrySectionIdsSnapshot = dropBoundsSectionId.toMap(),
                            entryAnchorEligibleSnapshot = dropBoundsEligible.toMap(),
                            emptySectionBoundsSnapshot = emptySectionDropBounds.toMap(),
                            emptySectionIdsSnapshot = emptySectionDropIds.toMap(),
                            target = target,
                        )
                    }
                } else if (autoScrollConsumed) {
                    // A zero-consumed frame means the edge scroll stopped or reached a list
                    // boundary. Apply the latest target after the refreshed layout is stable.
                    withFrameNanos { }
                    withFrameNanos { }
                    autoScrollConsumed = false
                    // The canonical list never changes during drag. The latest target cue
                    // is already held in dragState and is rendered without layout shift.
                }
            } else if (autoScrollConsumed) {
                // The pointer left the edge zone. Settle the latest target without changing
                // row geometry while the list was scrolling.
                withFrameNanos { }
                withFrameNanos { }
                autoScrollConsumed = false
            }
            withFrameNanos { }
        }
    }
    LaunchedEffect(day.logicalDate) {
        dragState = null
        dragPointerRootY = null
        dragPointerDown = false
        dragPointerId = null
        dragPointerSessionActive = false
        dragFinishIssued = false
        autoScrollConsumed = false
    }
    val isRefreshing = state.status == TodayLoadStatus.REFRESHING
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = controller::refresh,
        state = pullToRefreshState,
        indicator = {
            PullToRefreshDefaults.IndicatorBox(
                state = pullToRefreshState,
                isRefreshing = isRefreshing,
                modifier = Modifier.align(Alignment.TopCenter).size(48.dp),
                shape = CircleShape,
                containerColor = Color(0xFF2D2D2D),
                elevation = 0.dp,
            ) {
                if (isRefreshing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(28.dp),
                        color = Color.White,
                        trackColor = Color.White.copy(alpha = 0.22f),
                        strokeWidth = 2.dp,
                    )
                } else {
                    CircularProgressIndicator(
                        progress = { pullToRefreshState.distanceFraction.coerceIn(0f, 1f) },
                        modifier = Modifier.size(28.dp),
                        color = Color.White,
                        trackColor = Color.White.copy(alpha = 0.22f),
                        strokeWidth = 2.dp,
                    )
                }
            }
        },
        modifier = modifier.onGloballyPositioned {
            dragPointerHostRootTop = it.boundsInRoot().top
        }.pointerInput(day.logicalDate) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                var moved = false
                while (true) {
                    // The parent observes the physical pointer early in the pipeline. Before
                    // handoff it remains passive so normal scroll/swipe/pull-to-refresh keeps
                    // its existing ownership. After handoff it becomes the sole drag consumer,
                    // so LazyColumn cannot turn a held drag into ordinary vertical scrolling
                    // when the source row is disposed by auto-scroll.
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    val change = event.changes.firstOrNull { it.id == down.id }
                    if (change == null) {
                        // A source-row disposal/cancellation must not end the parent-owned
                        // session. The physical pointer-up event remains the only commit path.
                        if (dragPointerSessionActive && dragPointerId == down.id) continue
                        break
                    }
                    if (kotlin.math.abs(change.position.x - down.position.x) > 4f || kotlin.math.abs(change.position.y - down.position.y) > 4f) moved = true
                    val parentOwnsDrag = shouldConsumeAndroidDragPointerMovement(
                        isDragActive = dragState != null && dragPointerSessionActive,
                        pointerMatches = dragPointerId == down.id,
                        pointerPressed = change.pressed,
                    )
                    if (parentOwnsDrag) {
                        updateDragPosition(androidDragPointerRootY(dragPointerHostRootTop, change.position.y))
                        change.consume()
                    }
                    if (change.changedToUpIgnoreConsumed() || !change.pressed) {
                        if (shouldFinishAndroidDragOnParentUp(
                                isDragActive = dragState != null,
                                isPhysicalPointerUp = change.changedToUpIgnoreConsumed(),
                                pointerMatches = dragPointerId == down.id && dragPointerSessionActive,
                                alreadyFinished = dragFinishIssued,
                            )
                        ) {
                            dragFinishIssued = true
                            latestFinishDrag.value()
                        } else if (!change.pressed) {
                            dragState = null
                            dragPointerRootY = null
                            dragPointerDown = false
                            dragPointerId = null
                            dragPointerSessionActive = false
                            dragFinishIssued = false
                            autoScrollConsumed = false
                        }
                        dragPointerDown = false
                        dragPointerId = null
                        dragPointerSessionActive = false
                        break
                    }
                }
                if (!moved && openSwipeEntryId != null) openSwipeEntryId = null
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
        TaskChuteDateNavigator(
            logicalDate = day.logicalDate,
            onPrevious = controller::previousDay,
            onNext = controller::nextDay,
            onOpenDatePicker = onOpenHeaderDatePicker,
            modifier = Modifier.onGloballyPositioned {
                onHeaderBoundsChanged(it.boundsInParent().bottom)
            },
        )
        state.errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
        }

        directManipulationController?.state?.feedbackMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 16.dp))
        }
        if (!renderDay.hasEntries && renderDay.sections.isEmpty() && renderDay.unsectionedEntries.isEmpty()) {
            EmptyToday(Modifier.fillMaxWidth().weight(1f))
            return@Column
        }
        Box(
            modifier = Modifier.fillMaxWidth().weight(1f).onGloballyPositioned {
                val bounds = it.boundsInRoot()
                dragContentRootTop = bounds.top
            },
        ) {
            LazyColumn(
                state = todayListState,
                modifier = Modifier.fillMaxSize().onGloballyPositioned {
                    val bounds = it.boundsInRoot()
                    // This is the actual LazyColumn viewport. Content padding belongs to
                    // the scrollable content, not to the viewport, so it must not be
                    // subtracted again when deciding whether the pointer is at the edge.
                    dragViewportBounds = Rect(
                        left = bounds.left,
                        top = bounds.top,
                        right = bounds.right,
                        bottom = minOf(
                            bounds.bottom,
                            bottomOverlayTopRootPx.takeIf { it.isFinite() } ?: bounds.bottom,
                        ),
                    )
                },
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 110.dp),
                // Keep section headers and task rows visually contiguous as one compact grouped surface.
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
            renderDay.sections.forEachIndexed { index, section ->
                if (index > 0) item(key = "section-gap-${section.id}") { Spacer(Modifier.height(12.dp)) }
                item(key = "section-${section.id}") {
                    SectionHeader(
                        section = section,
                        collapsed = section.id in collapsedSectionIds,
                        onToggleCollapsed = {
                            collapsedSectionIds = if (section.id in collapsedSectionIds) {
                                collapsedSectionIds - section.id
                            } else {
                                collapsedSectionIds + section.id
                            }
                        },
                        dropTarget = dragState?.target?.key == sectionDropKey(section.id),
                        modifier = Modifier.onGloballyPositioned {
                            val canonicalSection = day.sections.firstOrNull { it.id == section.id }
                            val hasEligibleAnchor = canonicalSection?.entries?.any(::isEligibleAndroidDropAnchor) == true
                            if (!hasEligibleAnchor || section.id in collapsedSectionIds) {
                                emptySectionDropBounds[section.id] = it.boundsInRoot()
                                emptySectionDropIds[section.id] = section.id
                            } else {
                                emptySectionDropBounds.remove(section.id)
                                emptySectionDropIds.remove(section.id)
                            }
                        },
                    )
                }
                if (section.id !in collapsedSectionIds) items(section.entries, key = { it.id }) { task ->
                    val canPastForwardMove = !day.planningEnabled && day.taskChuteDayId != null &&
                        task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived &&
                        task.firstStartedAt == null && task.lastEndedAt == null && task.executionId == null &&
                        directManipulationController != null
                    TodayTaskRow(
                        modifier = Modifier.animateItem(),
                        day = day,
                        task = task,
                        sectionId = section.id,
                        enabled = !state.pendingEntryIds.contains(task.id),
                        controller = controller,
                        showExecutionAction = day.isCurrent,
                        canEdit = canPlanDay(day) && (day.isCurrent || task.lifecycleState == LifecycleState.PLANNED)
                            && (!task.routineDerived || day.isCurrent)
                            && planningController != null,
                        onEdit = { planningController?.openEdit(day, task) },
                        canDuplicate = canPlanDay(day) && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived
                            && directManipulationController != null && directManipulationController.state.pendingEntryIds.isEmpty()
                            && directManipulationController.state.unresolvedRequest == null,
                        onDuplicate = { directManipulationController?.duplicate(day, task) },
                        canOpenNote = task.taskId != null,
                        canNoteOnly = task.taskId != null && !day.isCurrent &&
                            (task.lifecycleState == LifecycleState.COMPLETED || task.routineDerived || !canPlanDay(day)),
                        onOpenNote = { onOpenTaskNote(task) },
                        selectionModeActive = selectionModeActive,
                        onEnterSelection = { onEnterSelection(task.id) },
                        swipeMenuOpen = openSwipeEntryId == task.id,
                        onSwipeMenuOpened = { openSwipeEntryId = task.id },
                        onSwipeMenuClosed = { if (openSwipeEntryId == task.id) openSwipeEntryId = null },
                        selected = task.id in selectedEntryIds,
                        canSelect = directManipulationController?.canSelect(day, task) == true,
                        onToggleSelection = { onToggleSelection(task.id) },
                        canDayOperate = canPlanDay(day) && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived && directManipulationController != null,
                        canLifecycleDelete = day.isCurrent && task.lifecycleState != LifecycleState.PLANNED && !task.routineDerived && directManipulationController != null,
                        canPlannedDelete = canPlanDay(day) && task.lifecycleState == LifecycleState.PLANNED && task.routineDerived && directManipulationController != null,
                        canPastForwardOperate = canPastForwardMove,
                        onMovePrevious = { directManipulationController?.moveToDay(day, setOf(task.id), LocalDate.parse(day.logicalDate).minusDays(1).toString()) },
                        onMoveNext = { directManipulationController?.moveToDay(day, setOf(task.id), LocalDate.parse(day.logicalDate).plusDays(1).toString()) },
                        onMoveToday = { directManipulationController?.moveToDay(day, setOf(task.id), currentLogicalDate(day), allowPastSource = true) },
                        onPickDate = { onOpenDatePicker(setOf(task.id), canPastForwardMove) },
                        onDelete = { onRequestDelete(setOf(task.id)) },
                        canDrag = directManipulationController?.canDrag(day, task, selectedEntryIds) == true
                            && !state.pendingEntryIds.contains(task.id)
                            && (!todayListState.isScrollInProgress || dragState?.entryId == task.id),
                        dragging = dragState?.entryId == task.id,
                        dropTarget = false,
                        // A task target is represented by one insertion boundary line;
                        // do not paint the whole destination row as a second target.
                        dropTargetCue = false,
                        onDragStart = { pointerId, pointerPosition ->
                            directManipulationController?.takeIf { !todayListState.isScrollInProgress && it.canDrag(day, task) }?.let {
                                val bounds = dropBounds[task.id]
                                val pointerRootY = bounds?.top?.plus(pointerPosition.y) ?: pointerPosition.y
                                val sourceRootTop = bounds?.top ?: pointerRootY
                                dragPointerRootY = pointerRootY
                                dragPointerDown = true
                                dragPointerId = pointerId
                                dragPointerSessionActive = true
                                dragFinishIssued = false
                                autoScrollConsumed = false
                                dragState = AndroidDragState(
                                    entryId = task.id,
                                    sourceSectionId = section.id,
                                    positionY = pointerRootY,
                                    sourceStartRootTop = sourceRootTop,
                                    rowBoundsSnapshot = rowBounds.toMap(),
                                    entryBoundsSnapshot = dropBounds.toMap(),
                                    entrySectionIdsSnapshot = dropBoundsSectionId.toMap(),
                                    entryAnchorEligibleSnapshot = dropBoundsEligible.toMap(),
                                    emptySectionBoundsSnapshot = emptySectionDropBounds.toMap(),
                                    emptySectionIdsSnapshot = emptySectionDropIds.toMap(),
                                    target = null,
                                )
                            }
                        },
                        dropBounds = dropBounds,
                        dropBoundsSectionId = dropBoundsSectionId,
                        dropBoundsEligible = dropBoundsEligible,
                        rowBounds = rowBounds,
                    )
                }
            }
            if (renderDay.unsectionedEntries.isNotEmpty() || dragState != null) {
                if (renderDay.sections.isNotEmpty()) item(key = "section-gap-unsectioned") { Spacer(Modifier.height(12.dp)) }
                item(key = "section-unsectioned") {
                    SectionHeader(
                        section = null,
                        collapsed = UNSECTIONED_DROP_KEY in collapsedSectionIds,
                        onToggleCollapsed = {
                            collapsedSectionIds = if (UNSECTIONED_DROP_KEY in collapsedSectionIds) {
                                collapsedSectionIds - UNSECTIONED_DROP_KEY
                            } else {
                                collapsedSectionIds + UNSECTIONED_DROP_KEY
                            }
                        },
                        dropTarget = dragState?.target?.key == sectionDropKey(null),
                        modifier = Modifier.onGloballyPositioned {
                            val hasEligibleAnchor = day.unsectionedEntries.any(::isEligibleAndroidDropAnchor)
                            if (!hasEligibleAnchor && dragState != null) {
                                emptySectionDropBounds[UNSECTIONED_DROP_KEY] = it.boundsInRoot()
                                emptySectionDropIds[UNSECTIONED_DROP_KEY] = null
                            } else {
                                emptySectionDropBounds.remove(UNSECTIONED_DROP_KEY)
                                emptySectionDropIds.remove(UNSECTIONED_DROP_KEY)
                            }
                        },
                    )
                }
                if (UNSECTIONED_DROP_KEY !in collapsedSectionIds) items(renderDay.unsectionedEntries, key = { it.id }) { task ->
                    val canPastForwardMove = !day.planningEnabled && day.taskChuteDayId != null &&
                        task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived &&
                        task.firstStartedAt == null && task.lastEndedAt == null && task.executionId == null &&
                        directManipulationController != null
                    TodayTaskRow(
                        modifier = Modifier.animateItem(),
                        day = day,
                        task = task,
                        sectionId = null,
                        enabled = !state.pendingEntryIds.contains(task.id),
                        controller = controller,
                        showExecutionAction = day.isCurrent,
                        canEdit = canPlanDay(day) && (day.isCurrent || task.lifecycleState == LifecycleState.PLANNED)
                            && (!task.routineDerived || day.isCurrent)
                            && planningController != null,
                        onEdit = { planningController?.openEdit(day, task) },
                        canDuplicate = canPlanDay(day) && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived
                            && directManipulationController != null && directManipulationController.state.pendingEntryIds.isEmpty()
                            && directManipulationController.state.unresolvedRequest == null,
                        onDuplicate = { directManipulationController?.duplicate(day, task) },
                        canOpenNote = task.taskId != null,
                        canNoteOnly = task.taskId != null && !day.isCurrent &&
                            (task.lifecycleState == LifecycleState.COMPLETED || task.routineDerived || !canPlanDay(day)),
                        onOpenNote = { onOpenTaskNote(task) },
                        selectionModeActive = selectionModeActive,
                        onEnterSelection = { onEnterSelection(task.id) },
                        swipeMenuOpen = openSwipeEntryId == task.id,
                        onSwipeMenuOpened = { openSwipeEntryId = task.id },
                        onSwipeMenuClosed = { if (openSwipeEntryId == task.id) openSwipeEntryId = null },
                        selected = task.id in selectedEntryIds,
                        canSelect = directManipulationController?.canSelect(day, task) == true,
                        onToggleSelection = { onToggleSelection(task.id) },
                        canDayOperate = canPlanDay(day) && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived && directManipulationController != null,
                        canLifecycleDelete = day.isCurrent && task.lifecycleState != LifecycleState.PLANNED && !task.routineDerived && directManipulationController != null,
                        canPlannedDelete = canPlanDay(day) && task.lifecycleState == LifecycleState.PLANNED && task.routineDerived && directManipulationController != null,
                        canPastForwardOperate = canPastForwardMove,
                        onMovePrevious = { directManipulationController?.moveToDay(day, setOf(task.id), LocalDate.parse(day.logicalDate).minusDays(1).toString()) },
                        onMoveNext = { directManipulationController?.moveToDay(day, setOf(task.id), LocalDate.parse(day.logicalDate).plusDays(1).toString()) },
                        onMoveToday = { directManipulationController?.moveToDay(day, setOf(task.id), currentLogicalDate(day), allowPastSource = true) },
                        onPickDate = { onOpenDatePicker(setOf(task.id), canPastForwardMove) },
                        onDelete = { onRequestDelete(setOf(task.id)) },
                        canDrag = directManipulationController?.canDrag(day, task, selectedEntryIds) == true
                            && !state.pendingEntryIds.contains(task.id)
                            && (!todayListState.isScrollInProgress || dragState?.entryId == task.id),
                        dragging = dragState?.entryId == task.id,
                        dropTarget = false,
                        // A task target is represented by one insertion boundary line;
                        // do not paint the whole destination row as a second target.
                        dropTargetCue = false,
                        onDragStart = { pointerId, pointerPosition ->
                            directManipulationController?.takeIf { !todayListState.isScrollInProgress && it.canDrag(day, task) }?.let {
                                val bounds = dropBounds[task.id]
                                val pointerRootY = bounds?.top?.plus(pointerPosition.y) ?: pointerPosition.y
                                val sourceRootTop = bounds?.top ?: pointerRootY
                                dragPointerRootY = pointerRootY
                                dragPointerDown = true
                                dragPointerId = pointerId
                                dragPointerSessionActive = true
                                dragFinishIssued = false
                                autoScrollConsumed = false
                                dragState = AndroidDragState(
                                    entryId = task.id,
                                    sourceSectionId = null,
                                    positionY = pointerRootY,
                                    sourceStartRootTop = sourceRootTop,
                                    rowBoundsSnapshot = rowBounds.toMap(),
                                    entryBoundsSnapshot = dropBounds.toMap(),
                                    entrySectionIdsSnapshot = dropBoundsSectionId.toMap(),
                                    entryAnchorEligibleSnapshot = dropBoundsEligible.toMap(),
                                    emptySectionBoundsSnapshot = emptySectionDropBounds.toMap(),
                                    emptySectionIdsSnapshot = emptySectionDropIds.toMap(),
                                    target = null,
                                )
                            }
                        },
                        dropBounds = dropBounds,
                        dropBoundsSectionId = dropBoundsSectionId,
                        dropBoundsEligible = dropBoundsEligible,
                        rowBounds = rowBounds,
                    )
                }
            }
            }
            dragState?.target?.resolvedBoundaryY?.let { boundaryY ->
                DragInsertionLine(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp)
                        .offset {
                            IntOffset(
                                0,
                                (boundaryY - dragContentRootTop - insertionLineHalfHeightPx).roundToInt(),
                            )
                        }
                        // The cue is presentation-only, but must remain visible above the
                        // pointer-following source overlay when both occupy the same Y.
                        .zIndex(20f),
                )
            }
            dragState?.let { drag ->
                day.allEntries.firstOrNull { it.id == drag.entryId }?.let { draggedTask ->
                    val sourceTop = drag.sourceStartRootTop
                    DraggedTaskOverlay(
                        task = draggedTask,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp)
                            .offset { IntOffset(0, (sourceTop + drag.deltaY - dragContentRootTop).roundToInt()) }
                            .zIndex(10f),
                    )
                }
            }
        }
        }
    }
}

private const val UNSECTIONED_DROP_KEY = "__unsectioned__"
internal const val D148_DRAG_EDGE_ZONE = 72
internal const val D148_DRAG_MAX_SCROLL_PER_FRAME = 32

internal fun shouldRebaseAndroidDragAfterConsumedScroll(consumedPx: Float): Boolean =
    consumedPx.isFinite() && abs(consumedPx) > 0.5f

internal fun androidDragAutoScrollDelta(
    pointerY: Float,
    viewportTop: Float,
    viewportBottom: Float,
    edgeZonePx: Float,
    maxDeltaPx: Float,
    canScrollBackward: Boolean = true,
    canScrollForward: Boolean = true,
): Float {
    if (!pointerY.isFinite() || !viewportTop.isFinite() || !viewportBottom.isFinite() ||
        !edgeZonePx.isFinite() || !maxDeltaPx.isFinite() || edgeZonePx <= 0f || maxDeltaPx <= 0f ||
        viewportBottom <= viewportTop || viewportBottom - viewportTop <= edgeZonePx * 2f ||
        pointerY < viewportTop || pointerY > viewportBottom
    ) return 0f

    fun scaledDelta(distanceToEdge: Float): Float {
        val progress = ((edgeZonePx - distanceToEdge) / edgeZonePx).coerceIn(0f, 1f)
        return maxDeltaPx * (0.2f + 0.8f * progress * progress)
    }

    return when {
        pointerY <= viewportTop + edgeZonePx && canScrollBackward -> -scaledDelta(pointerY - viewportTop)
        pointerY >= viewportBottom - edgeZonePx && canScrollForward -> scaledDelta(viewportBottom - pointerY)
        else -> 0f
    }
}

internal data class AndroidDropTarget(
    val key: String,
    val sectionId: String?,
    val anchorEntryId: String?,
    val edge: PlacementEdge?,
    val resolvedBoundaryY: Float? = null,
)

private data class AndroidDragState(
    val entryId: String,
    val sourceSectionId: String?,
    val positionY: Float,
    val sourceStartRootTop: Float,
    val rowBoundsSnapshot: Map<String, Rect> = emptyMap(),
    val entryBoundsSnapshot: Map<String, Rect> = emptyMap(),
    val entrySectionIdsSnapshot: Map<String, String?> = emptyMap(),
    val entryAnchorEligibleSnapshot: Map<String, Boolean> = emptyMap(),
    val emptySectionBoundsSnapshot: Map<String, Rect> = emptyMap(),
    val emptySectionIdsSnapshot: Map<String, String?> = emptyMap(),
    val deltaY: Float = 0f,
    val target: AndroidDropTarget?,
)

internal fun entryDropKey(entryId: String): String = "entry:$entryId"

internal fun sectionDropKey(sectionId: String?): String = "section:${sectionId ?: UNSECTIONED_DROP_KEY}"

internal fun previewDayForTarget(day: TodayDay, entryId: String, target: AndroidDropTarget): TodayDay =
    previewOptimisticPlacement(
        day,
        entryId,
        target.sectionId,
        target.anchorEntryId?.let { PlacementTarget(target.sectionId, it, target.edge ?: PlacementEdge.AFTER) },
    )

internal fun isEligibleAndroidDropAnchor(task: TodayTask): Boolean =
    task.lifecycleState == LifecycleState.PLANNED

internal fun resolveAndroidDropTarget(
    positionY: Float,
    sourceEntryId: String,
    sourceSectionId: String? = null,
    entryBounds: Map<String, Rect>,
    entrySectionIds: Map<String, String?>,
    entryAnchorEligible: Map<String, Boolean> = emptyMap(),
    emptySectionBounds: Map<String, Rect>,
    emptySectionIds: Map<String, String?>,
    endedSectionIds: Set<String> = emptySet(),
): AndroidDropTarget? {
    if (!positionY.isFinite()) return null

    data class InsertionBoundary(
        val entryId: String,
        val sectionId: String?,
        val edge: PlacementEdge,
        val y: Float,
    )

    val validEntries = entryBounds.entries.filter {
        it.value.top.isFinite() && it.value.bottom.isFinite() && it.value.bottom >= it.value.top
    }
    val sectionRanges = validEntries.groupBy { entrySectionIds[it.key] }.mapValues { (_, entries) ->
        entries.minOf { it.value.top }..entries.maxOf { it.value.bottom }
    }
    val physicalBoundaryYsBySection = validEntries
        .groupBy { entrySectionIds[it.key] }
        .mapValues { (_, entries) ->
            entries.flatMap { listOf(it.value.top, it.value.bottom) }
                .filter { it.isFinite() }
                .distinct()
                .sorted()
        }

    val orderedEntryIdsBySection = validEntries
        .groupBy { entrySectionIds[it.key] }
        .mapValues { (_, entries) ->
            entries.sortedWith(compareBy<Map.Entry<String, Rect>>({ it.value.top }, { it.value.bottom }, { it.key }))
                .map { it.key }
        }
    val resolvedSourceSectionId = sourceSectionId ?: entrySectionIds[sourceEntryId]

    fun isLegalEntryAnchor(entryId: String): Boolean {
        val targetSectionId = entrySectionIds[entryId]
        if (targetSectionId in endedSectionIds || entryAnchorEligible[entryId] == false) return false
        // Single-entry Android D&D uses MoveEntry relative placement. Its server
        // authority adopts the concrete anchor's planned-start cohort; the
        // D-120 same-cohort restriction remains limited to ReorderEntries callers.
        return true
    }

    // A measured empty/collapsed Section header owns its own rectangle. Resolve it before
    // adjacent Task insertion boundaries so the header cue is the only destination shown.
    val emptyTarget = emptySectionBounds.entries
        .filter { emptySectionIds[it.key] !in endedSectionIds && positionY >= it.value.top && positionY <= it.value.bottom }
        .minWithOrNull(compareBy({ kotlin.math.abs(positionY - it.value.center.y) }, { it.key }))
    val emptyTargetSectionId = emptyTarget?.let { emptySectionIds[it.key] }
    if (emptyTarget != null && validEntries.none {
            entrySectionIds[it.key] == emptyTargetSectionId && positionY >= it.value.top && positionY <= it.value.bottom
        }) {
        return AndroidDropTarget(
            key = sectionDropKey(emptyTarget.key.takeUnless { it == UNSECTIONED_DROP_KEY }),
            sectionId = emptyTargetSectionId,
            anchorEntryId = null,
            edge = null,
        )
    }

    val eligibleEntries = validEntries.filter { it.key != sourceEntryId && isLegalEntryAnchor(it.key) }

    fun changesCanonicalOrder(entryId: String, sectionId: String?, edge: PlacementEdge): Boolean {
        if (resolvedSourceSectionId != sectionId) return true
        val currentIds = orderedEntryIdsBySection[sectionId].orEmpty()
        if (sourceEntryId !in currentIds || entryId !in currentIds) return true
        val withoutSource = currentIds.filterNot { it == sourceEntryId }.toMutableList()
        val anchorIndex = withoutSource.indexOf(entryId)
        if (anchorIndex < 0) return true
        withoutSource.add(if (edge == PlacementEdge.AFTER) anchorIndex + 1 else anchorIndex, sourceEntryId)
        return withoutSource != currentIds
    }

    val boundaries = eligibleEntries
        .flatMap { (entryId, bounds) ->
            val sectionId = entrySectionIds[entryId]
            listOf(
                // Sorting AFTER before BEFORE at a shared Y gives adjacent rows one
                // canonical boundary without changing the command semantics.
                InsertionBoundary(entryId, sectionId, PlacementEdge.AFTER, bounds.bottom),
                InsertionBoundary(entryId, sectionId, PlacementEdge.BEFORE, bounds.top),
            )
        }
        .filter { changesCanonicalOrder(it.entryId, it.sectionId, it.edge) }
        .sortedWith(compareBy<InsertionBoundary>({ it.y }, { if (it.edge == PlacementEdge.AFTER) 0 else 1 }, { it.entryId }))
        .fold(mutableListOf<InsertionBoundary>()) { unique, candidate ->
            if (unique.none {
                    it.sectionId == candidate.sectionId && abs(it.y - candidate.y) <= 0.5f
                }) {
                unique += candidate
            }
            unique
        }
    val entryTarget = boundaries.asSequence()
        .mapNotNull { boundary ->
            val range = sectionRanges[boundary.sectionId] ?: return@mapNotNull null
            val sectionBoundaries = boundaries.filter { it.sectionId == boundary.sectionId }
            val boundaryIndex = sectionBoundaries.indexOf(boundary)
            if (boundaryIndex < 0) return@mapNotNull null
            val physicalBoundaryYs = physicalBoundaryYsBySection[boundary.sectionId].orEmpty()
            val previousPhysicalY = physicalBoundaryYs.lastOrNull { it < boundary.y - 0.5f }
            val nextPhysicalY = physicalBoundaryYs.firstOrNull { it > boundary.y + 0.5f }
            val sourceBounds = entryBounds[sourceEntryId]
            var lower = if (boundaryIndex == 0) {
                if (resolvedSourceSectionId == boundary.sectionId && sourceBounds != null &&
                    sourceBounds.top.isFinite() && sourceBounds.top <= boundary.y
                ) {
                    sourceBounds.top
                } else {
                    range.start
                }
            } else {
                midpoint(previousPhysicalY ?: range.start, boundary.y)
            }
            var upper = midpoint(boundary.y, nextPhysicalY ?: range.endInclusive)
            if (resolvedSourceSectionId == boundary.sectionId && sourceBounds != null) {
                when {
                    boundary.y < sourceBounds.top -> {
                        upper = minOf(upper, midpoint(boundary.y, sourceBounds.top))
                    }
                    boundary.y > sourceBounds.bottom -> {
                        lower = maxOf(lower, midpoint(boundary.y, sourceBounds.bottom))
                    }
                    else -> return@mapNotNull null
                }
            }
            if (positionY < lower || positionY > upper) return@mapNotNull null
            boundary
        }
        .minWithOrNull(
            compareBy<InsertionBoundary>(
                { abs(positionY - it.y) },
                { if (it.edge == PlacementEdge.AFTER) 0 else 1 },
                { it.y },
                { it.entryId },
            ),
        )
    if (entryTarget != null) {
        return AndroidDropTarget(
            key = entryDropKey(entryTarget.entryId),
            sectionId = entryTarget.sectionId,
            anchorEntryId = entryTarget.entryId,
            edge = entryTarget.edge,
            resolvedBoundaryY = entryTarget.y,
        )
    }

    return null
}

private fun midpoint(first: Float, second: Float): Float = first + (second - first) / 2f

private fun endedSectionIdsForAndroid(day: TodayDay): Set<String> {
    if (!day.isCurrent) return emptySet()
    val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: return emptySet()
    val nowInstant = Instant.now()
    val now = ZonedDateTime.now(zone)
    val localMinute = now.hour * 60 + now.minute
    val logicalMinute = if (localMinute < day.establishmentBoundaryMinutes) localMinute + 1440 else localMinute
    return day.sections.filter { section ->
        section.actualEndInstant?.let { end ->
            runCatching { !nowInstant.isBefore(Instant.parse(end)) }.getOrNull()
        } ?: (section.endMinute != null && section.endMinute <= logicalMinute)
    }.mapTo(mutableSetOf()) { it.id }
}

@Composable
private fun DragInsertionLine(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(3.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(Color(0xFF58C8B2))
            .semantics { contentDescription = "挿入位置" },
    )
}

@Composable
private fun DraggedTaskOverlay(task: TodayTask, modifier: Modifier = Modifier) {
    val rowSurface = when (task.lifecycleState) {
        LifecycleState.RUNNING -> TaskChuteColors.RunningSurface
        LifecycleState.COMPLETED -> TaskChuteColors.SurfaceElevated
        LifecycleState.PLANNED -> TaskChuteColors.Surface
    }
    Card(
        modifier = modifier.height(84.dp).graphicsLayer { shadowElevation = 16.dp.toPx() },
        shape = RoundedCornerShape(0.dp),
        colors = CardDefaults.cardColors(containerColor = rowSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().height(84.dp).padding(end = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TaskProjectionSlot(task)
            Spacer(Modifier.width(4.dp))
            Column(
                Modifier.weight(1f).height(74.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(
                    task.title,
                    modifier = Modifier.fillMaxWidth().height(25.dp),
                    fontSize = 16.sp,
                    lineHeight = 25.sp,
                    fontWeight = FontWeight.Bold,
                    color = TaskChuteColors.PrimaryText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                TaskMetadata(task, Modifier.fillMaxWidth())
            }
        }
    }
}

private fun sectionEntries(day: TodayDay, sectionId: String?): List<TodayTask> =
    if (sectionId == null) day.unsectionedEntries else day.sections.firstOrNull { it.id == sectionId }?.entries.orEmpty()

private fun isLegalManualReorder(entries: List<TodayTask>, desiredIds: List<String>): Boolean {
    if (desiredIds.size != entries.size || desiredIds.toSet().size != entries.size) return false
    val byId = entries.associateBy(TodayTask::id)
    if (desiredIds.any { it !in byId }) return false
    val historicalCount = entries.count { it.lifecycleState != LifecycleState.PLANNED }
    if (desiredIds.take(historicalCount) != entries.take(historicalCount).map(TodayTask::id)) return false
    return desiredIds.withIndex().all { (index, id) ->
        val requested = byId[id] ?: return@all false
        val slot = entries[index]
        index < historicalCount || (
            requested.lifecycleState == LifecycleState.PLANNED
                && slot.lifecycleState == LifecycleState.PLANNED
                && requested.plannedStartMinute == slot.plannedStartMinute
            )
    }
}

@Composable
private fun SectionHeader(
    section: TodaySection?,
    collapsed: Boolean,
    onToggleCollapsed: () -> Unit,
    modifier: Modifier = Modifier,
    dropTarget: Boolean = false,
) {
    val title = section?.title ?: "セクションなし"
    val range = section?.let { "${formatMinute(it.startMinute)} - ${formatMinute(it.endMinute)}" }
    Row(
        modifier = modifier.fillMaxWidth().height(38.dp)
            .background(TaskChuteColors.SurfaceElevated)
            .then(if (dropTarget) Modifier.background(Color(0x8C18423C)).border(BorderStroke(2.dp, Color(0xFF58C8B2))) else Modifier)
            .clickable(onClick = onToggleCollapsed)
            .semantics { contentDescription = "${title}セクション${if (collapsed) "を展開" else "を折りたたむ"}" }
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            painter = painterResource(if (collapsed) R.drawable.today_section_chevron_right else R.drawable.today_section_expand_more),
            contentDescription = if (collapsed) "展開" else "折りたたみ",
            modifier = Modifier.size(20.dp),
            tint = TaskChuteColors.SecondaryText,
        )
        range?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, fontWeight = FontWeight.Medium),
                color = TaskChuteColors.SecondaryText,
                maxLines = 1,
            )
        }
        Text(
            title,
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, fontWeight = FontWeight.Medium),
            color = TaskChuteColors.PrimaryText,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TodayTaskRow(
    modifier: Modifier = Modifier,
    day: TodayDay,
    task: TodayTask,
    sectionId: String?,
    enabled: Boolean,
    controller: TodayController,
    showExecutionAction: Boolean,
    canEdit: Boolean,
    onEdit: () -> Unit,
    canDuplicate: Boolean,
    onDuplicate: () -> Unit,
    canOpenNote: Boolean,
    canNoteOnly: Boolean,
    onOpenNote: () -> Unit,
    selectionModeActive: Boolean,
    onEnterSelection: () -> Unit,
    swipeMenuOpen: Boolean,
    onSwipeMenuOpened: () -> Unit,
    onSwipeMenuClosed: () -> Unit,
    selected: Boolean,
    canSelect: Boolean,
    onToggleSelection: () -> Unit,
    canDayOperate: Boolean,
    canLifecycleDelete: Boolean,
    canPlannedDelete: Boolean,
    canPastForwardOperate: Boolean,
    onMovePrevious: () -> Unit,
    onMoveNext: () -> Unit,
    onMoveToday: () -> Unit,
    onPickDate: () -> Unit,
    onDelete: () -> Unit,
    canDrag: Boolean,
    dragging: Boolean,
    dropTarget: Boolean,
    dropTargetCue: Boolean,
    onDragStart: (PointerId, Offset) -> Unit,
    dropBounds: MutableMap<String, Rect>,
    dropBoundsSectionId: MutableMap<String, String?>,
    dropBoundsEligible: MutableMap<String, Boolean>,
    rowBounds: MutableMap<String, Rect>,
) {
    var actionsSheetOpen by remember(task.id) { mutableStateOf(false) }
    var swipeOffset by remember(task.id) { mutableStateOf(0f) }
    var swipeGestureStarted by remember(task.id) { mutableStateOf(false) }
    var swipeGestureStartOffset by remember(task.id) { mutableStateOf(0f) }
    LaunchedEffect(swipeMenuOpen, selectionModeActive) {
        if (!swipeMenuOpen || selectionModeActive) swipeOffset = 0f
    }
    val insertionPadding by animateDpAsState(
        if (dropTarget) 6.dp else 0.dp,
        label = "drop-target-padding",
    )
    val visualDropTarget = dropTarget || dropTargetCue
    val hasActions = canEdit || canDuplicate || canOpenNote || canDayOperate || canLifecycleDelete || canPlannedDelete || canPastForwardOperate
    val canSwipeNote = canOpenNote && (canEdit || canNoteOnly)
    val hasOtherActions = hasActions && (!canNoteOnly || canPastForwardOperate)
    val swipeActionCount = (if (canEdit) 1 else 0) + (if (canSwipeNote) 1 else 0) + (if (hasOtherActions) 1 else 0)
    val swipeThreshold = with(LocalDensity.current) { 48.dp.toPx() }
    val swipeRevealWidth = with(LocalDensity.current) {
        (swipeActionCount * 48 + ((swipeActionCount - 1).coerceAtLeast(0) * 8) + 4).dp.toPx()
    }
    val selectionSwipeWidth = with(LocalDensity.current) { 88.dp.toPx() }
    val rowSurface = when (task.lifecycleState) {
        LifecycleState.RUNNING -> TaskChuteColors.RunningSurface
        LifecycleState.COMPLETED -> TaskChuteColors.SurfaceElevated
        LifecycleState.PLANNED -> TaskChuteColors.Surface
    }
    // Keep the sole vertical drag owner outside the visual branch so placeholder swaps do not cancel it.
    val rowDragGestureModifier = if (canDrag) {
        Modifier.onGloballyPositioned {
            dropBounds[task.id] = it.boundsInRoot()
            dropBoundsSectionId[task.id] = sectionId
            dropBoundsEligible[task.id] = isEligibleAndroidDropAnchor(task)
        }.pointerInput(task.id) {
            detectShortLongPressDrag(
                onDragStart = onDragStart,
            )
        }
    } else Modifier
    Box(
        modifier.fillMaxWidth().background(rowSurface).then(rowDragGestureModifier).onGloballyPositioned {
            rowBounds[task.id] = it.boundsInRoot()
        },
    ) {
        if (!selectionModeActive && hasActions && swipeOffset <= -swipeThreshold) {
            Row(
                modifier = Modifier.align(Alignment.CenterEnd).zIndex(2f).padding(end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (canEdit) {
                    SwipeTaskAction(
                        iconRes = R.drawable.ic_material_edit_24,
                        description = "タスクを編集",
                        containerColor = Color(0xFF52391A),
                        borderColor = Color(0xFFFFB85C),
                        iconSize = 24.dp,
                        onClick = {
                            swipeOffset = 0f
                            onSwipeMenuClosed()
                            onEdit()
                        },
                    )
                }
                if (canSwipeNote) {
                    SwipeTaskAction(
                        iconRes = R.drawable.ic_material_sticky_note_2_24,
                        description = "タスクのノート",
                        containerColor = Color(0xFF44325C),
                        borderColor = Color(0xFFB794F4),
                        iconSize = 20.dp,
                        onClick = {
                            swipeOffset = 0f
                            onSwipeMenuClosed()
                            onOpenNote()
                        },
                    )
                }
                if (hasOtherActions) {
                    SwipeTaskAction(
                        iconRes = R.drawable.ic_material_more_horiz_24,
                        description = "タスクの操作",
                        containerColor = Color(0xFF3A3A3A),
                        borderColor = Color(0xFF5F5F5F),
                        iconSize = 24.dp,
                        onClick = {
                            swipeOffset = 0f
                            onSwipeMenuClosed()
                            actionsSheetOpen = true
                        },
                    )
                }
            }
        }
        Card(
            modifier = Modifier.fillMaxWidth().height(84.dp)
                .then(
                    if (selectionModeActive && canSelect && enabled) {
                        Modifier.clickable(onClick = onToggleSelection)
                    } else Modifier
                )
                .offset { IntOffset(swipeOffset.roundToInt(), 0) }
                .then(
                    if (dragging) Modifier.graphicsLayer {
                        alpha = 0.35f
                    } else Modifier,
                ).then(
                    if (dragging) Modifier
                    else if (visualDropTarget) Modifier
                        .background(Color(0x802C665D))
                        .border(BorderStroke(2.dp, Color(0xFF58C8B2)))
                    else Modifier,
                ).padding(top = insertionPadding)
                    .animateContentSize()
                    .semantics {
                        contentDescription = if (dragging) "タスクを移動中: " + task.title else "タスクをドラッグ: " + task.title
                    },
            shape = RoundedCornerShape(0.dp),
            colors = CardDefaults.cardColors(containerColor = rowSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().height(84.dp).padding(end = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (selectionModeActive) {
                    TaskSelectionSlot(
                        task = task,
                        selected = selected,
                        enabled = enabled && canSelect,
                        onToggleSelection = onToggleSelection,
                    )
                } else {
                    TaskProjectionSlot(task, day)
                }
                Spacer(Modifier.width(4.dp))
                val canEnterSelection = !selectionModeActive && canSelect
                val swipeActions = !selectionModeActive && (hasActions || canEnterSelection)
                val swipeModifier = Modifier.draggable(
                    state = rememberDraggableState { delta ->
                        if (!swipeGestureStarted) {
                            swipeGestureStarted = true
                            swipeGestureStartOffset = swipeOffset
                        }
                        swipeOffset = (swipeOffset + delta).coerceIn(
                            -swipeRevealWidth,
                            if (canEnterSelection) selectionSwipeWidth else 0f,
                        )
                    },
                    orientation = Orientation.Horizontal,
                    enabled = swipeActions,
                    onDragStopped = {
                        val movedRightFromOpen = swipeMenuOpen &&
                            swipeOffset >= swipeGestureStartOffset + swipeThreshold
                        when {
                            movedRightFromOpen -> {
                                swipeOffset = 0f
                                onSwipeMenuClosed()
                            }
                            canEnterSelection && swipeOffset >= swipeThreshold -> {
                                swipeOffset = 0f
                                onSwipeMenuClosed()
                                onEnterSelection()
                            }
                            swipeOffset <= -swipeThreshold -> {
                                swipeOffset = -swipeRevealWidth
                                onSwipeMenuOpened()
                            }
                            else -> {
                                swipeOffset = 0f
                                if (swipeMenuOpen) onSwipeMenuClosed()
                            }
                        }
                        swipeGestureStarted = false
                    },
                )
                Column(
                    Modifier.weight(1f).height(74.dp).then(swipeModifier),
                    verticalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Text(
                        task.title,
                        modifier = Modifier.fillMaxWidth().height(25.dp),
                        fontSize = 16.sp,
                        lineHeight = 25.sp,
                        fontWeight = FontWeight.Bold,
                        color = TaskChuteColors.PrimaryText,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    TaskMetadata(task, Modifier.fillMaxWidth())
                }
                Spacer(Modifier.width(10.dp))
                when {
                    task.lifecycleState == LifecycleState.COMPLETED -> {
                        Box(
                            modifier = Modifier.size(48.dp)
                                .clip(CircleShape)
                                .background(TaskChuteColors.CompletedControl)
                                .border(1.dp, TaskChuteColors.TaskActionBorder, CircleShape)
                                .semantics { contentDescription = "完了済み" },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                painter = painterResource(R.drawable.ic_material_check_24),
                                contentDescription = null,
                                tint = TaskChuteColors.CompletedIcon,
                                modifier = Modifier.size(17.dp),
                            )
                        }
                    }
                    showExecutionAction && task.lifecycleState == LifecycleState.PLANNED -> {
                        if (swipeOffset > -swipeThreshold) {
                            IconButton(
                                onClick = { controller.start(task) },
                                enabled = enabled,
                                modifier = Modifier.size(48.dp).clip(CircleShape)
                                    .background(TaskChuteColors.Control)
                                    .border(1.dp, TaskChuteColors.TaskActionBorder, CircleShape)
                                    .semantics { contentDescription = "タスクを開始" },
                            ) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_material_play_arrow_24),
                                    contentDescription = null,
                                    tint = TaskChuteColors.PrimaryText,
                                    modifier = Modifier.size(24.dp),
                                )
                            }
                        } else Spacer(Modifier.size(48.dp))
                    }
                    showExecutionAction && task.lifecycleState == LifecycleState.RUNNING -> {
                        if (swipeOffset > -swipeThreshold) {
                            IconButton(
                                onClick = { controller.complete(task) },
                                enabled = enabled,
                                modifier = Modifier.size(48.dp).clip(CircleShape)
                                    .background(TaskChuteColors.RunningControl)
                                    .border(1.dp, TaskChuteColors.TaskActionBorder, CircleShape)
                                    .semantics { contentDescription = "タスクを完了" },
                            ) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_material_stop_24),
                                    contentDescription = null,
                                    tint = TaskChuteColors.AccentBlue,
                                    modifier = Modifier.size(13.dp),
                                )
                            }
                        } else Spacer(Modifier.size(48.dp))
                    }
                    else -> Spacer(Modifier.size(48.dp))
                }
            }
        }
    }
    if (actionsSheetOpen) {
        ModalBottomSheet(
            onDismissRequest = { actionsSheetOpen = false },
            containerColor = Color(0xFF232323),
            scrimColor = Color.Black.copy(alpha = 0.46f),
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
            dragHandle = {
                Box(Modifier.width(40.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFA3A3A0).copy(alpha = 0.55f)))
            },
        ) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp).navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("タスク操作", style = MaterialTheme.typography.titleLarge, color = TaskChuteColors.PrimaryText)
                Text(task.title, style = MaterialTheme.typography.bodyMedium, color = TaskChuteColors.SecondaryText, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (canEdit) TaskActionRow(R.drawable.ic_material_edit_24, "編集", onClick = { actionsSheetOpen = false; onEdit() })
                if (canDuplicate) TaskActionRow(R.drawable.ic_material_repeat_24, "複製", onClick = { actionsSheetOpen = false; onDuplicate() })
                if (canPastForwardOperate) {
                    TaskActionRow(R.drawable.ic_material_schedule_24, "今日へ移動", onClick = { actionsSheetOpen = false; onMoveToday() })
                    TaskActionRow(R.drawable.ic_material_schedule_24, "日付を移動", onClick = { actionsSheetOpen = false; onPickDate() })
                } else if (canDayOperate) {
                    TaskActionRow(R.drawable.ic_material_chevron_left_24, "前の日へ移動", onClick = { actionsSheetOpen = false; onMovePrevious() })
                    TaskActionRow(R.drawable.ic_material_chevron_right_24, "次の日へ移動", onClick = { actionsSheetOpen = false; onMoveNext() })
                    TaskActionRow(R.drawable.ic_material_schedule_24, "日付を移動", onClick = { actionsSheetOpen = false; onPickDate() })
                    TaskActionRow(R.drawable.ic_material_delete_24, "削除", destructive = true, onClick = { actionsSheetOpen = false; onDelete() })
                } else if (canPlannedDelete || canLifecycleDelete) {
                    TaskActionRow(R.drawable.ic_material_delete_24, "削除", destructive = true, onClick = { actionsSheetOpen = false; onDelete() })
                }
            }
        }
    }
}

@Composable
private fun TaskProjectionSlot(task: TodayTask, day: TodayDay? = null) {
    val forecast = day?.let { forecastForTask(it, task) }
    val projectionStart = formatMinute(forecast?.first)
    val projectionEnd = formatMinute(forecast?.second)
    Box(
        modifier = Modifier.size(width = 48.dp, height = 84.dp)
            .semantics {
                contentDescription = if (task.lifecycleState == LifecycleState.COMPLETED) {
                    "実績開始時刻: " + projectionStart + "、実績終了時刻: " + projectionEnd
                } else {
                    "開始見込み時刻: " + projectionStart + "、終了見込み時刻: " + projectionEnd
                }
            },
    ) {
        Text(
            projectionStart,
            modifier = Modifier.align(Alignment.TopCenter).offset(y = 5.dp).fillMaxWidth(),
            color = TaskChuteColors.SecondaryText,
            fontSize = 11.sp,
            lineHeight = 21.sp,
            textAlign = TextAlign.Center,
        )
        Box(
            modifier = Modifier.align(Alignment.TopCenter).offset(y = 27.dp)
                .width(0.5.dp).height(30.dp)
                .background(TaskChuteColors.SecondaryText),
        )
        Text(
            projectionEnd,
            modifier = Modifier.align(Alignment.BottomCenter).offset(y = (-5).dp).fillMaxWidth(),
            color = TaskChuteColors.SecondaryText,
            fontSize = 11.sp,
            lineHeight = 21.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun TaskSelectionSlot(
    task: TodayTask,
    selected: Boolean,
    enabled: Boolean,
    onToggleSelection: () -> Unit,
) {
    val visualSelected = selected && enabled
    val checkboxFill = if (visualSelected) TaskChuteColors.AccentBlue else TaskChuteColors.Surface
    val checkboxBorder = if (visualSelected) TaskChuteColors.AccentBlue else TaskChuteColors.SelectionBorder
    Box(
        modifier = Modifier.size(48.dp)
            .clickable(enabled = enabled, onClick = onToggleSelection)
            .semantics { contentDescription = "タスクを選択: " + task.title },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.size(18.dp)
                .clip(RoundedCornerShape(5.dp))
                .background(checkboxFill)
                .border(1.dp, checkboxBorder, RoundedCornerShape(5.dp))
                .graphicsLayer { alpha = if (enabled) 1f else 0.38f },
            contentAlignment = Alignment.Center,
        ) {
            if (visualSelected) {
                Icon(
                    painter = painterResource(R.drawable.ic_material_check_24),
                    contentDescription = null,
                    tint = TaskChuteColors.Background,
                    modifier = Modifier.size(12.dp),
                )
            }
        }
    }
}

@Composable
private fun TaskActionRow(iconRes: Int, label: String, destructive: Boolean = false, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().height(52.dp).clickable(onClick = onClick).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(painterResource(iconRes), contentDescription = null, tint = if (destructive) Color(0xFFFF6B6B) else TaskChuteColors.PrimaryText, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(16.dp))
        Text(label, color = if (destructive) Color(0xFFFF6B6B) else TaskChuteColors.PrimaryText, fontSize = 15.sp)
    }
}

@Composable
private fun TaskMetadata(task: TodayTask, modifier: Modifier = Modifier) {
    val estimate = task.estimateSeconds?.let { formatEstimate(it) + " /" } ?: "-- /"
    val status = when (task.lifecycleState) {
        LifecycleState.PLANNED -> "未開始"
        LifecycleState.RUNNING -> (task.activeStartedAt ?: task.firstStartedAt)?.let(::formatInstant)?.plus(" →") ?: "--:-- →"
        LifecycleState.COMPLETED -> null
    }
    Column(modifier.height(44.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Row(
            Modifier.fillMaxWidth().height(14.dp).padding(start = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TaskMetadataIcon(R.drawable.ic_material_hourglass_top_24)
            Spacer(Modifier.width(6.dp))
            Text(
                estimate,
                modifier = Modifier.widthIn(min = 33.dp),
                color = TaskChuteColors.SecondaryText,
                fontSize = 12.sp,
                lineHeight = 14.sp,
                maxLines = 1,
            )
            Spacer(Modifier.width(9.dp))
            TaskMetadataIcon(R.drawable.ic_material_schedule_24)
            Spacer(Modifier.width(5.dp))
            if (status != null) {
                Text(
                    status,
                    modifier = Modifier.weight(1f),
                    color = TaskChuteColors.SecondaryText,
                    fontSize = 12.sp,
                    lineHeight = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            } else {
                val start = task.firstStartedAt?.let(::formatInstant) ?: "--:--"
                val end = task.lastEndedAt?.let(::formatInstant) ?: "--:--"
                Text(
                    start + " → " + end,
                    modifier = Modifier.width(85.dp),
                    color = TaskChuteColors.SecondaryText,
                    fontSize = 12.sp,
                    lineHeight = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                )
                Text(
                    "(",
                    modifier = Modifier.width(6.dp),
                    color = TaskChuteColors.SecondaryText,
                    fontSize = 12.sp,
                    lineHeight = 14.sp,
                    maxLines = 1,
                )
                Spacer(Modifier.width(3.dp))
                TaskMetadataIcon(R.drawable.ic_material_timer_24)
                Spacer(Modifier.width(3.dp))
                Text(
                    formatDuration(task.completedDurationSeconds) + ")",
                    modifier = Modifier.weight(1f),
                    color = TaskChuteColors.SecondaryText,
                    fontSize = 12.sp,
                    lineHeight = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Row(
            Modifier.fillMaxWidth().height(17.dp).padding(start = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TaskMetadataIcon(R.drawable.ic_material_repeat_24, tint = if (task.routineDerived) TaskChuteColors.AccentBlue else TaskChuteColors.SecondaryText)
            Spacer(Modifier.width(6.dp))
            val context = listOfNotNull(task.project?.title, task.mode?.title).joinToString(" / ")
            Text(
                context,
                modifier = Modifier.weight(1f),
                color = TaskChuteColors.SecondaryText,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun TaskMetadataIcon(iconRes: Int, tint: Color = TaskChuteColors.SecondaryText) {
    Icon(
        painter = painterResource(iconRes),
        contentDescription = null,
        tint = tint,
        modifier = Modifier.size(10.dp),
    )
}

@Composable
private fun SwipeTaskAction(
    iconRes: Int,
    description: String,
    containerColor: Color,
    borderColor: Color,
    iconSize: androidx.compose.ui.unit.Dp,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier.width(48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        IconButton(
            onClick = onClick,
            modifier = Modifier.size(48.dp).clip(CircleShape).background(containerColor).border(1.dp, borderColor, CircleShape)
                .semantics { contentDescription = description },
        ) {
            Icon(painterResource(iconRes), contentDescription = null, tint = TaskChuteColors.PrimaryText, modifier = Modifier.size(iconSize))
        }
    }
}
@Composable
private fun OperationUnresolvedPanel(onRetry: () -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(116.dp)
            .clip(shape)
            .background(Color(0xFF332021))
            .border(1.dp, Color(0xFF7B3A3A), shape)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text(
            text = "操作結果を確認できませんでした",
            color = TaskChuteColors.PrimaryText,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onRetry,
            modifier = Modifier.width(220.dp).height(44.dp),
            shape = RoundedCornerShape(22.dp),
            contentPadding = PaddingValues(0.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = TaskChuteColors.PrimaryText,
                contentColor = TaskChuteColors.Background,
            ),
        ) {
            Text("元の操作を再試行", fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun OperationFailedPanel() {
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .clip(shape)
            .background(Color(0xFF332021))
            .border(1.dp, Color(0xFF7B3A3A), shape)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = DETERMINISTIC_FAILURE_MESSAGE,
            color = TaskChuteColors.PrimaryText,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun RunningTaskPanel(task: TodayTask, controller: TodayController, enabled: Boolean, modifier: Modifier = Modifier) {
    var now by remember(task.id, task.activeStartedAt, task.firstStartedAt, task.estimateSeconds) {
        mutableStateOf(Instant.now())
    }
    LaunchedEffect(task.id, task.activeStartedAt, task.firstStartedAt, task.estimateSeconds) {
        while (true) {
            now = Instant.now()
            delay(1_000L)
        }
    }

    val progress = calculateRunningProgress(
        startInstant = task.activeStartedAt ?: task.firstStartedAt,
        estimateSeconds = task.estimateSeconds,
        now = now,
    )
    val progressColor = if ((progress.overrunSeconds ?: 0L) > 0L) RUNNING_OVERRUN_COLOR else TaskChuteColors.AccentBlue

    Card(
        modifier = modifier.fillMaxWidth().height(104.dp),
        colors = CardDefaults.cardColors(containerColor = TaskChuteColors.RunningSurface),
        shape = RoundedCornerShape(22.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().height(40.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = task.title,
                    modifier = Modifier.weight(1f).padding(end = 8.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    color = TaskChuteColors.PrimaryText,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                )
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFE8E8E5))
                        .border(1.dp, TaskChuteColors.TaskActionBorder, CircleShape)
                        .graphicsLayer { alpha = if (enabled) 1f else 0.5f }
                        .clickable(enabled = enabled, onClick = { controller.complete(task) })
                        .semantics {
                            contentDescription = "実行中タスクを完了"
                            if (!enabled) disabled()
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        painter = painterResource(R.drawable.ic_material_stop_24),
                        contentDescription = null,
                        tint = TaskChuteColors.Background,
                        modifier = Modifier.size(11.dp),
                    )
                }
            }

            RunningProgressBar(progress = progress.progress, color = progressColor)

            Row(
                modifier = Modifier.fillMaxWidth().height(20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                RunningTimeValue(
                    iconRes = R.drawable.ic_material_schedule_24,
                    text = formatRunningDuration(progress.elapsedSeconds),
                    color = TaskChuteColors.PrimaryText,
                )
                if ((progress.overrunSeconds ?: 0L) > 0L) {
                    RunningOverrunValue(progress.overrunSeconds)
                } else {
                    RunningTimeValue(
                        iconRes = R.drawable.ic_material_hourglass_top_24,
                        text = formatRunningDuration(progress.remainingSeconds),
                        color = TaskChuteColors.SecondaryText,
                    )
                }
            }
        }
    }
}

@Composable
private fun RunningProgressBar(progress: Float, color: Color) {
    val fraction = progress.coerceIn(0f, 1f)
    BoxWithConstraints(
        modifier = Modifier.fillMaxWidth().height(10.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(RUNNING_PROGRESS_TRACK_COLOR),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction)
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(color),
        )
        Box(
            modifier = Modifier
                .offset(x = (maxWidth - 10.dp) * fraction)
                .size(10.dp)
                .background(color, CircleShape),
        )
    }
}

@Composable
private fun RunningTimeValue(iconRes: Int, text: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            painter = painterResource(iconRes),
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(10.dp),
        )
        Spacer(Modifier.width(5.dp))
        Text(text, color = color, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun RunningOverrunValue(overrunSeconds: Long?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            painter = painterResource(R.drawable.ic_material_hourglass_top_24),
            contentDescription = null,
            tint = TaskChuteColors.SecondaryText,
            modifier = Modifier.size(10.dp),
        )
        Spacer(Modifier.width(5.dp))
        Text("00:00:00", color = TaskChuteColors.SecondaryText, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Text("（", color = TaskChuteColors.SecondaryText, fontSize = 13.sp, maxLines = 1)
        Icon(
            painter = painterResource(R.drawable.ic_material_more_time_24),
            contentDescription = null,
            tint = RUNNING_OVERRUN_COLOR,
            modifier = Modifier.size(10.dp),
        )
        Spacer(Modifier.width(2.dp))
        Text(
            "+${formatRunningDuration(overrunSeconds)}",
            color = RUNNING_OVERRUN_COLOR,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
        Text("）", color = TaskChuteColors.SecondaryText, fontSize = 13.sp, maxLines = 1)
    }
}

private val RUNNING_PROGRESS_TRACK_COLOR = Color(0xFF3C464E)
private val RUNNING_OVERRUN_COLOR = Color(0xFFEBA44E)

@Composable
private fun TaskEditorForm(controller: TaskPlanningController, state: TaskPlanningUiState, modifier: Modifier) {
    val editor = state.editor ?: return
    val references = state.references
    val draft = editor.draft
    val lifecycleMetadataOnly = editor.capability == TaskEditorCapability.RUNNING_METADATA ||
        editor.capability == TaskEditorCapability.COMPLETED_METADATA
    val planningFieldsEditable = editor.capability == TaskEditorCapability.FULL_PLANNING ||
        editor.capability == TaskEditorCapability.ROUTINE_PLANNING
    val routinePlanning = editor.capability == TaskEditorCapability.ROUTINE_PLANNING
    val titleEditable = editor.mode == TaskEditorMode.CREATE || editor.capability == TaskEditorCapability.FULL_PLANNING
    var projectExpanded by remember(editor) { mutableStateOf(false) }
    var modeExpanded by remember(editor) { mutableStateOf(false) }
    var sectionExpanded by remember(editor) { mutableStateOf(false) }
    val validation = TaskEditorValidation.validate(draft, editor.capability)
    val selectedProject = references?.projects?.firstOrNull { it.id == draft.projectId }
    val selectedMode = references?.modes?.firstOrNull { it.id == draft.modeId }
    val selectedSection = editor.day.sections.firstOrNull { it.id == draft.sectionId }
    val titleFocusRequester = remember { FocusRequester() }
    LaunchedEffect(editor.mode, editor.originalTask?.id, editor.day.logicalDate) {
        if (editor.mode == TaskEditorMode.CREATE) {
            withFrameNanos { }
            titleFocusRequester.requestFocus()
        }
    }

    Column(
        modifier = modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            if (lifecycleMetadataOnly) "実績タスクの編集" else if (editor.mode == TaskEditorMode.CREATE) "タスクを追加" else "タスクを編集",
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            color = TaskChuteColors.PrimaryText,
        )
        if (lifecycleMetadataOnly) {
            Text("Task名: ${draft.title}", color = TaskChuteColors.SecondaryText)
        } else {
            CompactFigmaTextField(
                value = draft.title,
                onValueChange = { controller.updateDraft(draft.copy(title = it)) },
                label = "Task名",
                modifier = Modifier.fillMaxWidth().focusRequester(titleFocusRequester),
                enabled = titleEditable && !state.saving,
            )
        }
        ReferencePicker(
            label = "Project",
            value = selectedProject?.title ?: "なし",
            expanded = projectExpanded,
            onExpandedChange = { projectExpanded = it },
            options = listOf(null to "なし") + (references?.projects?.map { it.id to it.title } ?: emptyList()),
            onSelected = { controller.updateDraft(draft.copy(projectId = it)); projectExpanded = false },
            enabled = references != null && !state.loadingReferences && !state.saving && !routinePlanning,
        )
        ReferencePicker(
            label = "Mode",
            value = selectedMode?.title ?: "なし",
            expanded = modeExpanded,
            onExpandedChange = { modeExpanded = it },
            options = listOf(null to "なし") + (references?.modes?.map { it.id to it.title } ?: emptyList()),
            onSelected = { controller.updateDraft(draft.copy(modeId = it)); modeExpanded = false },
            enabled = references != null && !state.loadingReferences && !state.saving && !routinePlanning,
        )
        if (planningFieldsEditable) {
        ReferencePicker(
            label = "Section",
            value = selectedSection?.title ?: "なし",
            expanded = sectionExpanded,
            onExpandedChange = { sectionExpanded = it },
            options = listOf(null to "なし") + editor.day.sections.map { it.id to it.title },
            onSelected = {
                controller.updateDraft(
                    draft.copy(
                        sectionId = it,
                        plannedStartText = formatEditorMinute(editor.day.sections.firstOrNull { section -> section.id == it }?.startMinute),
                    ),
                )
                sectionExpanded = false
            },
            enabled = !state.saving,
        )
        CompactFigmaTextField(
            value = draft.plannedStartText,
            onValueChange = { controller.updateDraft(draft.copy(plannedStartText = it)) },
            label = "開始予定",
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.saving,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        }
        if (planningFieldsEditable || editor.capability == TaskEditorCapability.RUNNING_METADATA) {
        CompactFigmaTextField(
            value = draft.estimateText,
            onValueChange = { controller.updateDraft(draft.copy(estimateText = it)) },
            label = "見積（分）",
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.saving,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        )
        }
        if (editor.day.isCurrent) {
            CompactFigmaTextField(
                value = draft.actualStartText,
                onValueChange = { controller.updateDraft(draft.copy(actualStartText = it)) },
                label = "開始時間",
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.saving,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            CompactFigmaTextField(
                value = draft.actualEndText,
                onValueChange = { controller.updateDraft(draft.copy(actualEndText = it)) },
                label = "終了時間",
                modifier = Modifier.fillMaxWidth(),
                enabled = !state.saving,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
        }
        state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (references == null && !state.loadingReferences) {
            TextButton(onClick = controller::retryReferences) { Text("候補を再試行") }
        }
        if (validation.errorMessage != null && state.errorMessage != null) {
            Text(validation.errorMessage, color = MaterialTheme.colorScheme.error)
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(
                onClick = controller::dismiss,
                enabled = !state.saving,
                modifier = Modifier.width(82.dp).height(48.dp),
                contentPadding = PaddingValues(0.dp),
            ) { Text("キャンセル", maxLines = 1, softWrap = false) }
            Button(onClick = controller::save, enabled = references != null && !state.loadingReferences && !state.saving, modifier = Modifier.width(88.dp).height(48.dp), shape = RoundedCornerShape(24.dp), contentPadding = PaddingValues(0.dp)) {
                Text(if (editor.mode == TaskEditorMode.CREATE) "追加" else "保存")
            }
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun CompactFigmaTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
) {
    var focused by remember { mutableStateOf(false) }
    val borderColor = if (focused) TaskChuteColors.AccentBlue else Color(0xFF343434)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = true,
        keyboardOptions = keyboardOptions,
        textStyle = MaterialTheme.typography.bodyLarge.copy(
            color = TaskChuteColors.PrimaryText,
            fontSize = 15.sp,
        ),
        modifier = modifier
            .height(48.dp)
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, borderColor, RoundedCornerShape(16.dp))
            .onFocusChanged { focused = it.isFocused }
            .padding(horizontal = 16.dp),
        decorationBox = { innerTextField ->
            Box(Modifier.fillMaxSize()) {
                if (value.isBlank()) {
                    Text(
                        label,
                        color = Color(0xFFA3A3A0),
                        fontSize = 16.sp,
                        modifier = Modifier.align(Alignment.CenterStart),
                        maxLines = 1,
                    )
                } else {
                    Text(
                        label,
                        color = Color(0xFFA3A3A0),
                        fontSize = 12.sp,
                        modifier = Modifier.align(Alignment.TopStart).offset(y = (-1).dp),
                        maxLines = 1,
                    )
                }
                Box(
                    modifier = Modifier.fillMaxWidth().align(if (value.isBlank()) Alignment.CenterStart else Alignment.BottomStart)
                        .padding(bottom = if (value.isBlank()) 0.dp else 2.dp),
                ) { innerTextField() }
            }
        },
    )
}

@Composable
private fun ReferencePicker(
    label: String,
    value: String,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    options: List<Pair<String?, String>>,
    onSelected: (String?) -> Unit,
    enabled: Boolean,
) {
    val focusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    Box {
        OutlinedButton(
            onClick = {
                keyboardController?.hide()
                focusManager.clearFocus(force = true)
                focusRequester.requestFocus()
                onExpandedChange(true)
            },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().height(48.dp).focusRequester(focusRequester),
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, Color(0xFF343434)),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(label)
                Text(value, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { onExpandedChange(false) }) {
            options.forEach { (id, title) ->
                DropdownMenuItem(text = { Text(title) }, onClick = { onSelected(id) })
            }
        }
    }
}

@Composable
private fun LoadingToday() {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator(
            modifier = Modifier.size(32.dp),
            color = Color.White,
            strokeWidth = 3.dp,
        )
        Spacer(Modifier.height(12.dp))
        Text("読み込み中", color = TaskChuteColors.SecondaryText)
    }
}

@Composable
private fun EmptyToday(modifier: Modifier = Modifier) {
    BoxWithConstraints(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.TopCenter,
    ) {
        val topOffset = minOf(maxHeight * 0.40625f, (maxHeight - 58.dp).coerceAtLeast(0.dp))
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = topOffset),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "タスクはありません",
                modifier = Modifier.fillMaxWidth().height(28.dp),
                color = TaskChuteColors.PrimaryText,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                lineHeight = 28.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "この日の予定は空です。",
                modifier = Modifier.fillMaxWidth().height(22.dp),
                color = TaskChuteColors.SecondaryText,
                fontSize = 14.sp,
                lineHeight = 22.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun TodayError(retry: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "予定を読み込めませんでした",
            modifier = Modifier.fillMaxWidth(),
            color = TaskChuteColors.PrimaryText,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "通信状態を確認して、再試行してください",
            modifier = Modifier.fillMaxWidth(),
            color = TaskChuteColors.SecondaryText,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = retry,
            modifier = Modifier.width(180.dp).height(48.dp),
            shape = RoundedCornerShape(24.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = TaskChuteColors.PrimaryText,
                contentColor = TaskChuteColors.Background,
            ),
            contentPadding = PaddingValues(0.dp),
        ) {
            Text("再試行", fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun TodayAuthRequired() {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator()
        Spacer(Modifier.height(12.dp))
        Text("認証状態を確認しています…")
    }
}

private const val D112_DRAG_HOLD_MS = 350L

internal fun shouldFinishAndroidDragOnParentUp(
    isDragActive: Boolean,
    isPhysicalPointerUp: Boolean,
    pointerMatches: Boolean,
    alreadyFinished: Boolean,
): Boolean = isDragActive && isPhysicalPointerUp && pointerMatches && !alreadyFinished

internal fun shouldConsumeAndroidDragPointerMovement(
    isDragActive: Boolean,
    pointerMatches: Boolean,
    pointerPressed: Boolean,
): Boolean = isDragActive && pointerMatches && pointerPressed

internal fun androidDragPointerRootY(hostRootTop: Float, pointerLocalY: Float): Float =
    hostRootTop + pointerLocalY

private suspend fun PointerInputScope.detectShortLongPressDrag(
    onDragStart: (PointerId, Offset) -> Unit,
) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val held = withTimeoutOrNull(D112_DRAG_HOLD_MS) {
            while (true) {
                val event = awaitPointerEvent()
                val change = event.changes.firstOrNull { it.id == down.id }
                    ?: return@withTimeoutOrNull false
                if ((change.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                    return@withTimeoutOrNull false
                }
                if (change.changedToUpIgnoreConsumed()) return@withTimeoutOrNull false
            }
            false
        } == null
        if (!held) return@awaitEachGesture
        onDragStart(down.id, down.position)
        // The Today parent owns movement consumption and physical pointer-up completion.
        // This detector only waits for the handoff gesture while the source row remains
        // composed; disposal/cancellation after handoff must be harmless.
        drag(down.id) { }
        // The Today-level pointer session owns completion. A row may leave the
        // LazyColumn during edge auto-scroll, so row disposal/cancellation must
        // never commit or clear the active session here.
    }
}

private fun formatMinute(value: Int?): String = value?.let { (it / 60).toString().padStart(2, '0') + ":" + (it % 60).toString().padStart(2, '0') } ?: "--:--"

private fun formatEstimate(seconds: Int): String = "${seconds / 60}分"

private fun formatDuration(seconds: Int?): String = seconds?.let { "${it / 60}分" } ?: "--"
private fun timeRangeText(task: TodayTask): String? {
    if (task.lifecycleState == LifecycleState.PLANNED) return null
    val start = task.firstStartedAt ?: task.activeStartedAt
    val end = task.lastEndedAt
    return when {
        start != null && end != null -> "${formatInstant(start)} → ${formatInstant(end)}"
        start != null -> formatInstant(start)
        end != null -> formatInstant(end)
        else -> null
    }
}

private fun formatInstant(value: String): String = runCatching {
    Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm"))
}.getOrElse {
    value.substringAfter('T').take(5).ifBlank { "--:--" }
}

private fun stateColor(state: LifecycleState): Color = when (state) {
    LifecycleState.PLANNED -> Color.Gray
    LifecycleState.RUNNING -> Color(0xFF2E7D32)
    LifecycleState.COMPLETED -> Color(0xFF1565C0)
}
