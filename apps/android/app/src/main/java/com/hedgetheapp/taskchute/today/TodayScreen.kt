package com.hedgetheapp.taskchute.today

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import android.app.DatePickerDialog
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.withTimeoutOrNull
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class AndroidDestination {
    TODAY,
    PROJECTS,
    NOTES,
    SETTINGS,
}

@Composable
fun AndroidNavigationBar(
    selected: AndroidDestination,
    onToday: () -> Unit,
    onSettings: () -> Unit,
    onNotes: () -> Unit = {},
) {
    NavigationBar {
        NavigationBarItem(
            selected = selected == AndroidDestination.TODAY,
            onClick = onToday,
            icon = { Text("⌂") },
            label = { Text("今日") },
        )
        NavigationBarItem(
            selected = false,
            onClick = {},
            enabled = false,
            icon = { Text("▦") },
            label = { Text("プロジェクト") },
        )
        NavigationBarItem(
            selected = false,
            onClick = onNotes,
            enabled = true,
            modifier = Modifier.semantics { contentDescription = "ノート一覧" },
            icon = { Text("▤") },
            label = { Text("ノート") },
        )
        NavigationBarItem(
            selected = selected == AndroidDestination.SETTINGS,
            onClick = onSettings,
            icon = { Text("⚙") },
            label = { Text("設定") },
        )
    }
}

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
    directManipulationController: TodayDirectManipulationController? = null,
    onOpenTaskNote: (TodayTask) -> Unit = {},
) {
    val state = controller.state
    val planningState = planningController?.state ?: TaskPlanningUiState()
    var selectedEntryIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var datePickerEntryIds by remember { mutableStateOf<Set<String>?>(null) }
    var deleteEntryIds by remember { mutableStateOf<Set<String>?>(null) }
    val context = LocalContext.current
    LaunchedEffect(controller) { controller.loadCurrent() }
    LaunchedEffect(state.day, state.status) { selectedEntryIds = emptySet() }
    LaunchedEffect(datePickerEntryIds, state.day?.logicalDate) {
        val entryIds = datePickerEntryIds ?: return@LaunchedEffect
        val pickerDay = state.day ?: return@LaunchedEffect
        val parsed = LocalDate.parse(pickerDay.logicalDate)
        DatePickerDialog(
            context,
            { _, year, month, date ->
                datePickerEntryIds = null
                directManipulationController?.moveToDay(
                    pickerDay,
                    entryIds,
                    LocalDate.of(year, month + 1, date).toString(),
                    "指定した日に移動しました",
                )
            },
            parsed.year,
            parsed.monthValue - 1,
            parsed.dayOfMonth,
        ).also { dialog ->
            dialog.setOnCancelListener { datePickerEntryIds = null }
            dialog.show()
        }
    }

    val day = state.day
    val bulkSelected = day?.takeIf { it.isCurrent && it.planningEnabled }
        ?.allEntries
        ?.filter { it.id in selectedEntryIds && it.lifecycleState == LifecycleState.PLANNED && !it.routineDerived }
        ?.map(TodayTask::id)
        ?.toSet()
        .orEmpty()

    Scaffold(
        bottomBar = {
            Column {
                if (day != null && bulkSelected.isNotEmpty()) {
                    BulkActionBar(
                        count = bulkSelected.size,
                        onPrevious = {
                            directManipulationController?.moveToDay(day, bulkSelected, LocalDate.parse(day.logicalDate).minusDays(1).toString(), "前の日へ移動しました")
                        },
                        onNext = {
                            directManipulationController?.moveToDay(day, bulkSelected, LocalDate.parse(day.logicalDate).plusDays(1).toString(), "次の日へ移動しました")
                        },
                        onChooseDate = { datePickerEntryIds = bulkSelected },
                        onDelete = { deleteEntryIds = bulkSelected },
                        onClear = { selectedEntryIds = emptySet() },
                    )
                }
                AndroidNavigationBar(
                    selected = AndroidDestination.TODAY,
                    onToday = controller::today,
                    onSettings = onNavigateSettings,
                    onNotes = onNavigateNotes,
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
                    onOpenTaskNote = onOpenTaskNote,
                    selectedEntryIds = selectedEntryIds,
                    onToggleSelection = { id ->
                        selectedEntryIds = if (id in selectedEntryIds) selectedEntryIds - id else selectedEntryIds + id
                    },
                    onOpenDatePicker = { datePickerEntryIds = it },
                    onRequestDelete = { deleteEntryIds = it },
                    modifier = Modifier.fillMaxSize(),
                )
                TodayLoadStatus.ERROR -> TodayError(state.errorMessage ?: "予定を読み込めませんでした。", controller::refresh)
                TodayLoadStatus.AUTH_REQUIRED -> TodayAuthRequired()
            }
            if (state.status == TodayLoadStatus.CONTENT || state.status == TodayLoadStatus.EMPTY || state.status == TodayLoadStatus.REFRESHING) {
                state.day?.takeIf { it.isCurrent }?.let { day ->
                    val runningTask = day.runningTask
                    val canAdd = day.planningEnabled && day.taskChuteDayId != null && planningController != null
                    if (runningTask != null || canAdd) {
                        Column(
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .fillMaxWidth()
                                .navigationBarsPadding()
                                .padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
                            horizontalAlignment = Alignment.End,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            if (canAdd && bulkSelected.isEmpty()) {
                                FloatingActionButton(
                                    onClick = { planningController.openCreate(day) },
                                    modifier = Modifier.semantics { contentDescription = "タスクを追加" },
                                ) { Text("＋") }
                            }
                            runningTask?.let { task ->
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

    if (planningController != null && planningState.editor != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = planningController::dismiss,
            sheetState = sheetState,
        ) {
            TaskEditorForm(planningController, planningState, Modifier.imePadding())
        }
    }

    deleteEntryIds?.let { entryIds ->
        AlertDialog(
            onDismissRequest = { deleteEntryIds = null },
            title = { Text("タスクを削除") },
            text = { Text("選択した${entryIds.size}件の予定を削除しますか？") },
            confirmButton = {
                TextButton(onClick = {
                    deleteEntryIds = null
                    day?.let { directManipulationController?.delete(it, entryIds, "削除しました") }
                }) { Text("削除") }
            },
            dismissButton = { TextButton(onClick = { deleteEntryIds = null }) { Text("キャンセル") } },
        )
    }
}

@Composable
private fun BulkActionBar(
    count: Int,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onChooseDate: () -> Unit,
    onDelete: () -> Unit,
    onClear: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text("${count}件選択", modifier = Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
        TextButton(onClick = onPrevious) { Text("前日") }
        TextButton(onClick = onNext) { Text("翌日") }
        TextButton(onClick = onChooseDate) { Text("日付") }
        TextButton(onClick = onDelete) { Text("削除") }
        TextButton(onClick = onClear) { Text("解除") }
    }
}

@Composable
private fun TodayContent(
    controller: TodayController,
    state: TodayUiState,
    planningController: TaskPlanningController?,
    directManipulationController: TodayDirectManipulationController?,
    onOpenTaskNote: (TodayTask) -> Unit,
    selectedEntryIds: Set<String>,
    onToggleSelection: (String) -> Unit,
    onOpenDatePicker: (Set<String>) -> Unit,
    onRequestDelete: (Set<String>) -> Unit,
    modifier: Modifier,
) {
    val day = state.day ?: return LoadingToday()
    val dropBounds = remember { mutableStateMapOf<String, Rect>() }
    val dropBoundsSectionId = remember { mutableStateMapOf<String, String?>() }
    val emptySectionDropBounds = remember { mutableStateMapOf<String, Rect>() }
    val emptySectionDropIds = remember { mutableStateMapOf<String, String?>() }
    var collapsedSectionIds by remember(day.logicalDate) { mutableStateOf<Set<String>>(emptySet()) }
    var dragState by remember { mutableStateOf<AndroidDragState?>(null) }
    LaunchedEffect(day, dragState != null) {
        day.sections.filterNot { it.entries.isEmpty() }.forEach {
            emptySectionDropBounds.remove(it.id)
            emptySectionDropIds.remove(it.id)
        }
        if (day.unsectionedEntries.isNotEmpty() || dragState == null) {
            emptySectionDropBounds.remove(UNSECTIONED_DROP_KEY)
            emptySectionDropIds.remove(UNSECTIONED_DROP_KEY)
        }
    }
    fun updateDragPosition(deltaY: Float) {
        val current = dragState ?: return
        val positionY = current.positionY + deltaY
        val target = resolveAndroidDropTarget(
            positionY = positionY,
            sourceEntryId = current.entryId,
            entryBounds = dropBounds,
            entrySectionIds = dropBoundsSectionId,
            emptySectionBounds = emptySectionDropBounds,
            emptySectionIds = emptySectionDropIds,
        )
        dragState = current.copy(
            positionY = positionY,
            deltaY = current.deltaY + deltaY,
            target = target,
        )
    }
    fun finishDrag() {
        val drag = dragState ?: return
        dragState = null
        val target = drag.target ?: return
        val source = day.allEntries.firstOrNull { it.id == drag.entryId } ?: return
        val targetSectionId = target.sectionId
        val targetEntryId = target.anchorEntryId
        if (targetEntryId == null) {
            if (drag.sourceSectionId == targetSectionId) return
            directManipulationController?.move(day, source.id, targetSectionId, null)
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
            if (remaining != currentIds && isLegalManualReorder(entries, remaining)) {
                directManipulationController?.reorder(day, targetSectionId, remaining, setOf(source.id))
            }
        } else {
            directManipulationController?.move(
                day,
                source.id,
                targetSectionId,
                PlacementTarget(targetSectionId, targetEntryId, edge),
            )
        }
    }
    PullToRefreshBox(
        isRefreshing = state.status == TodayLoadStatus.REFRESHING,
        onRefresh = controller::refresh,
        modifier = modifier,
    ) {
        Column(Modifier.fillMaxSize()) {
        DateNavigator(
            day = day,
            controller = controller,
        )
        state.errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
        }
        directManipulationController?.state?.errorMessage?.let {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Text(it, color = MaterialTheme.colorScheme.error)
                if (directManipulationController.state.unresolvedRequest != null) {
                    TextButton(onClick = directManipulationController::retryUnresolved) { Text("元の操作を再試行") }
                }
            }
        }
        directManipulationController?.state?.feedbackMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 16.dp))
        }
        if (!day.hasEntries && day.sections.isEmpty() && day.unsectionedEntries.isEmpty()) {
            EmptyToday()
            return@Column
        }
        LazyColumn(
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 110.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            day.sections.forEach { section ->
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
                            if (section.entries.isEmpty()) {
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
                    TodayTaskRow(
                        task = task,
                        sectionId = section.id,
                        enabled = day.isCurrent && !state.pendingEntryIds.contains(task.id),
                        controller = controller,
                        canEdit = day.isCurrent && day.planningEnabled && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived && planningController != null,
                        onEdit = { planningController?.openEdit(day, task) },
                        canDuplicate = day.isCurrent && day.planningEnabled && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived
                            && directManipulationController != null && directManipulationController.state.pendingEntryIds.isEmpty()
                            && directManipulationController.state.unresolvedRequest == null,
                        onDuplicate = { directManipulationController?.duplicate(day, task) },
                        canOpenNote = task.taskId != null,
                        onOpenNote = { onOpenTaskNote(task) },
                        selected = task.id in selectedEntryIds,
                        canSelect = directManipulationController?.canSelect(day, task) == true,
                        onToggleSelection = { onToggleSelection(task.id) },
                        canDayOperate = day.isCurrent && day.planningEnabled && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived && directManipulationController != null,
                        onMovePrevious = { directManipulationController?.moveToDay(day, setOf(task.id), LocalDate.parse(day.logicalDate).minusDays(1).toString(), "前の日へ移動しました") },
                        onMoveNext = { directManipulationController?.moveToDay(day, setOf(task.id), LocalDate.parse(day.logicalDate).plusDays(1).toString(), "次の日へ移動しました") },
                        onPickDate = { onOpenDatePicker(setOf(task.id)) },
                        onDelete = { onRequestDelete(setOf(task.id)) },
                        canDrag = directManipulationController?.canDrag(day, task, selectedEntryIds) == true
                            && !state.pendingEntryIds.contains(task.id),
                        dragging = dragState?.entryId == task.id,
                        dragDeltaY = dragState?.takeIf { it.entryId == task.id }?.deltaY ?: 0f,
                        dropTarget = dragState?.target?.key == entryDropKey(task.id),
                        onDragStart = { pointerPosition ->
                            directManipulationController?.takeIf { it.canDrag(day, task) }?.let {
                                val bounds = dropBounds[task.id]
                                dragState = AndroidDragState(
                                    entryId = task.id,
                                    sourceSectionId = section.id,
                                    positionY = bounds?.top?.plus(pointerPosition.y) ?: pointerPosition.y,
                                    target = null,
                                )
                            }
                        },
                        onDragMove = ::updateDragPosition,
                        onDragEnd = ::finishDrag,
                        onDragCancel = { dragState = null },
                        dropBounds = dropBounds,
                        dropBoundsSectionId = dropBoundsSectionId,
                    )
                }
            }
            if (day.unsectionedEntries.isNotEmpty() || dragState != null) {
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
                            if (day.unsectionedEntries.isEmpty() && dragState != null) {
                                emptySectionDropBounds[UNSECTIONED_DROP_KEY] = it.boundsInRoot()
                                emptySectionDropIds[UNSECTIONED_DROP_KEY] = null
                            } else {
                                emptySectionDropBounds.remove(UNSECTIONED_DROP_KEY)
                                emptySectionDropIds.remove(UNSECTIONED_DROP_KEY)
                            }
                        },
                    )
                }
                if (UNSECTIONED_DROP_KEY !in collapsedSectionIds) items(day.unsectionedEntries, key = { it.id }) { task ->
                    TodayTaskRow(
                        task = task,
                        sectionId = null,
                        enabled = day.isCurrent && !state.pendingEntryIds.contains(task.id),
                        controller = controller,
                        canEdit = day.isCurrent && day.planningEnabled && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived && planningController != null,
                        onEdit = { planningController?.openEdit(day, task) },
                        canDuplicate = day.isCurrent && day.planningEnabled && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived
                            && directManipulationController != null && directManipulationController.state.pendingEntryIds.isEmpty()
                            && directManipulationController.state.unresolvedRequest == null,
                        onDuplicate = { directManipulationController?.duplicate(day, task) },
                        canOpenNote = task.taskId != null,
                        onOpenNote = { onOpenTaskNote(task) },
                        selected = task.id in selectedEntryIds,
                        canSelect = directManipulationController?.canSelect(day, task) == true,
                        onToggleSelection = { onToggleSelection(task.id) },
                        canDayOperate = day.isCurrent && day.planningEnabled && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived && directManipulationController != null,
                        onMovePrevious = { directManipulationController?.moveToDay(day, setOf(task.id), LocalDate.parse(day.logicalDate).minusDays(1).toString(), "前の日へ移動しました") },
                        onMoveNext = { directManipulationController?.moveToDay(day, setOf(task.id), LocalDate.parse(day.logicalDate).plusDays(1).toString(), "次の日へ移動しました") },
                        onPickDate = { onOpenDatePicker(setOf(task.id)) },
                        onDelete = { onRequestDelete(setOf(task.id)) },
                        canDrag = directManipulationController?.canDrag(day, task, selectedEntryIds) == true
                            && !state.pendingEntryIds.contains(task.id),
                        dragging = dragState?.entryId == task.id,
                        dragDeltaY = dragState?.takeIf { it.entryId == task.id }?.deltaY ?: 0f,
                        dropTarget = dragState?.target?.key == entryDropKey(task.id),
                        onDragStart = { pointerPosition ->
                            directManipulationController?.takeIf { it.canDrag(day, task) }?.let {
                                val bounds = dropBounds[task.id]
                                dragState = AndroidDragState(
                                    entryId = task.id,
                                    sourceSectionId = null,
                                    positionY = bounds?.top?.plus(pointerPosition.y) ?: pointerPosition.y,
                                    target = null,
                                )
                            }
                        },
                        onDragMove = ::updateDragPosition,
                        onDragEnd = ::finishDrag,
                        onDragCancel = { dragState = null },
                        dropBounds = dropBounds,
                        dropBoundsSectionId = dropBoundsSectionId,
                    )
                }
            }
        }
        }
    }
}

private const val UNSECTIONED_DROP_KEY = "__unsectioned__"

internal data class AndroidDropTarget(
    val key: String,
    val sectionId: String?,
    val anchorEntryId: String?,
    val edge: PlacementEdge?,
)

private data class AndroidDragState(
    val entryId: String,
    val sourceSectionId: String?,
    val positionY: Float,
    val deltaY: Float = 0f,
    val target: AndroidDropTarget?,
)

internal fun entryDropKey(entryId: String): String = "entry:$entryId"

internal fun sectionDropKey(sectionId: String?): String = "section:${sectionId ?: UNSECTIONED_DROP_KEY}"

internal fun resolveAndroidDropTarget(
    positionY: Float,
    sourceEntryId: String,
    entryBounds: Map<String, Rect>,
    entrySectionIds: Map<String, String?>,
    emptySectionBounds: Map<String, Rect>,
    emptySectionIds: Map<String, String?>,
): AndroidDropTarget? {
    val entryTarget = entryBounds.entries
        .filter { it.key != sourceEntryId && positionY >= it.value.top && positionY <= it.value.bottom }
        .minWithOrNull(compareBy({ kotlin.math.abs(positionY - it.value.center.y) }, { it.key }))
    if (entryTarget != null) {
        return AndroidDropTarget(
            key = entryDropKey(entryTarget.key),
            sectionId = entrySectionIds[entryTarget.key],
            anchorEntryId = entryTarget.key,
            edge = if (positionY < entryTarget.value.center.y) PlacementEdge.BEFORE else PlacementEdge.AFTER,
        )
    }

    val emptyTarget = emptySectionBounds.entries
        .filter { positionY >= it.value.top && positionY <= it.value.bottom }
        .minWithOrNull(compareBy({ kotlin.math.abs(positionY - it.value.center.y) }, { it.key }))
        ?: return null
    return AndroidDropTarget(
        key = sectionDropKey(emptyTarget.key.takeUnless { it == UNSECTIONED_DROP_KEY }),
        sectionId = emptySectionIds[emptyTarget.key],
        anchorEntryId = null,
        edge = null,
    )
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
private fun DateNavigator(day: TodayDay, controller: TodayController) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        IconButton(
            onClick = controller::previousDay,
            modifier = Modifier.semantics { contentDescription = "前の日" },
        ) { Text("‹", style = MaterialTheme.typography.headlineMedium) }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(day.logicalDate, style = MaterialTheme.typography.titleMedium)
            Text("（${formatWeekday(day.logicalDate)}）", style = MaterialTheme.typography.labelMedium)
            if (day.isCurrent) Text("今日", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = controller::nextDay,
                modifier = Modifier.semantics { contentDescription = "次の日" },
            ) { Text("›", style = MaterialTheme.typography.headlineMedium) }
            TextButton(onClick = controller::today, enabled = !day.isCurrent) { Text("今日") }
        }
    }
    HorizontalDivider()
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
    val range = section?.let { "${formatMinute(it.startMinute)}–${formatMinute(it.endMinute)}" }
    Row(
        modifier = modifier.fillMaxWidth()
            .then(if (dropTarget) Modifier.border(BorderStroke(2.dp, MaterialTheme.colorScheme.secondary), MaterialTheme.shapes.medium) else Modifier)
            .clickable(onClick = onToggleCollapsed)
            .semantics { contentDescription = "${title}セクション${if (collapsed) "を展開" else "を折りたたむ"}" }
            .padding(top = 8.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(if (collapsed) "›" else "⌄", style = MaterialTheme.typography.titleMedium)
            Text(title, style = MaterialTheme.typography.titleMedium)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            range?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (collapsed) Text("折りたたみ", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun TodayTaskRow(
    task: TodayTask,
    sectionId: String?,
    enabled: Boolean,
    controller: TodayController,
    canEdit: Boolean,
    onEdit: () -> Unit,
    canDuplicate: Boolean,
    onDuplicate: () -> Unit,
    canOpenNote: Boolean,
    onOpenNote: () -> Unit,
    selected: Boolean,
    canSelect: Boolean,
    onToggleSelection: () -> Unit,
    canDayOperate: Boolean,
    onMovePrevious: () -> Unit,
    onMoveNext: () -> Unit,
    onPickDate: () -> Unit,
    onDelete: () -> Unit,
    canDrag: Boolean,
    dragging: Boolean,
    dragDeltaY: Float,
    dropTarget: Boolean,
    onDragStart: (Offset) -> Unit,
    onDragMove: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
    dropBounds: MutableMap<String, Rect>,
    dropBoundsSectionId: MutableMap<String, String?>,
) {
    var editMenuExpanded by remember(task.id) { mutableStateOf(false) }
    val insertionPadding by animateDpAsState(if (dropTarget) 6.dp else 0.dp, label = "drop-target-padding")
    Card(
        modifier = Modifier.fillMaxWidth().then(
            if (dragging) Modifier.graphicsLayer {
                translationY = dragDeltaY
                shadowElevation = 10.dp.toPx()
                scaleX = 0.98f
                scaleY = 0.98f
            } else Modifier,
        ).then(
            if (dragging) Modifier.border(BorderStroke(2.dp, MaterialTheme.colorScheme.primary), MaterialTheme.shapes.medium)
            else if (dropTarget) Modifier.border(BorderStroke(2.dp, MaterialTheme.colorScheme.secondary), MaterialTheme.shapes.medium)
            else Modifier,
        ).padding(top = insertionPadding)
            .animateContentSize()
            .semantics {
            contentDescription = if (dragging) "タスクを移動中: ${task.title}" else "タスクをドラッグ: ${task.title}"
        },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(48.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (canSelect) {
                    Checkbox(
                        checked = selected,
                        onCheckedChange = { onToggleSelection() },
                        enabled = enabled,
                        modifier = Modifier.size(48.dp).padding(6.dp).semantics { contentDescription = "タスクを選択: ${task.title}" },
                    )
                } else {
                    Box(
                        modifier = Modifier.size(14.dp).clip(MaterialTheme.shapes.small).border(
                            BorderStroke(1.dp, stateColor(task.lifecycleState)),
                            MaterialTheme.shapes.small,
                        ),
                    )
                }
            }
            Spacer(Modifier.width(4.dp))
            val dragModifier = if (canDrag) {
                Modifier
                    .onGloballyPositioned {
                        dropBounds[task.id] = it.boundsInRoot()
                        dropBoundsSectionId[task.id] = sectionId
                    }
                    .pointerInput(task.id) {
                        detectShortLongPressDrag(
                            onDragStart = onDragStart,
                            onDragMove = onDragMove,
                            onDragEnd = onDragEnd,
                            onDragCancel = onDragCancel,
                        )
                    }
            } else Modifier
            Column(Modifier.weight(1f).then(dragModifier), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(task.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val metadata = listOfNotNull(
                    task.project?.title,
                    task.mode?.title,
                    task.plannedStartMinute?.let { "◷ ${formatMinute(it)}" },
                    task.estimateSeconds?.let { "⌛ ${formatEstimate(it)}" },
                    timeRangeText(task),
                ).joinToString(" · ")
                if (metadata.isNotBlank()) Text(metadata, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            when (task.lifecycleState) {
                LifecycleState.PLANNED -> IconButton(
                    onClick = { controller.start(task) },
                    enabled = enabled,
                    modifier = Modifier.semantics { contentDescription = "タスクを開始" },
                ) { Text("▶") }
                LifecycleState.RUNNING -> IconButton(
                    onClick = { controller.complete(task) },
                    enabled = enabled,
                    modifier = Modifier.semantics { contentDescription = "タスクを完了" },
                ) { Text("✓") }
                LifecycleState.COMPLETED -> Spacer(Modifier.size(48.dp))
            }
            if (canEdit || canDuplicate || canOpenNote || canDayOperate) {
                Box {
                    IconButton(
                        onClick = { editMenuExpanded = true },
                        modifier = Modifier.semantics { contentDescription = "タスクの編集メニュー" },
                    ) { Text("…") }
                    DropdownMenu(
                        expanded = editMenuExpanded,
                        onDismissRequest = { editMenuExpanded = false },
                    ) {
                        if (canEdit) {
                            DropdownMenuItem(
                                text = { Text("編集") },
                                onClick = {
                                    editMenuExpanded = false
                                    onEdit()
                                },
                            )
                        }
                        if (canDuplicate) {
                            DropdownMenuItem(
                                text = { Text("複製") },
                                onClick = {
                                    editMenuExpanded = false
                                    onDuplicate()
                                },
                            )
                        }
                        if (canOpenNote) {
                            DropdownMenuItem(
                                text = { Text("ノート") },
                                onClick = {
                                    editMenuExpanded = false
                                    onOpenNote()
                                },
                            )
                        }
                        if (canDayOperate) {
                            DropdownMenuItem(
                                text = { Text("前の日へ移動") },
                                onClick = {
                                    editMenuExpanded = false
                                    onMovePrevious()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("次の日へ移動") },
                                onClick = {
                                    editMenuExpanded = false
                                    onMoveNext()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("日付を選択") },
                                onClick = {
                                    editMenuExpanded = false
                                    onPickDate()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("削除") },
                                onClick = {
                                    editMenuExpanded = false
                                    onDelete()
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RunningTaskPanel(task: TodayTask, controller: TodayController, enabled: Boolean, modifier: Modifier = Modifier) {
    Card(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("実行中", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text(task.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                task.activeStartedAt?.let { Text("開始 $it", style = MaterialTheme.typography.bodySmall) }
            }
            Spacer(Modifier.width(8.dp))
            Button(onClick = { controller.complete(task) }, enabled = enabled) { Text("完了") }
        }
    }
}

@Composable
private fun TaskEditorForm(controller: TaskPlanningController, state: TaskPlanningUiState, modifier: Modifier) {
    val editor = state.editor ?: return
    val references = state.references
    val draft = editor.draft
    var projectExpanded by remember(editor) { mutableStateOf(false) }
    var modeExpanded by remember(editor) { mutableStateOf(false) }
    var sectionExpanded by remember(editor) { mutableStateOf(false) }
    val validation = TaskEditorValidation.validate(draft)
    val selectedProject = references?.projects?.firstOrNull { it.id == draft.projectId }
    val selectedMode = references?.modes?.firstOrNull { it.id == draft.modeId }
    val selectedSection = editor.day.sections.firstOrNull { it.id == draft.sectionId }

    Column(
        modifier = modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(if (editor.mode == TaskEditorMode.CREATE) "タスクを追加" else "タスクを編集", style = MaterialTheme.typography.titleLarge)
        OutlinedTextField(
            value = draft.title,
            onValueChange = { controller.updateDraft(draft.copy(title = it)) },
            label = { Text("Task名") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.saving,
        )
        ReferencePicker(
            label = "Project",
            value = selectedProject?.title ?: "なし",
            expanded = projectExpanded,
            onExpandedChange = { projectExpanded = it },
            options = listOf(null to "なし") + (references?.projects?.map { it.id to it.title } ?: emptyList()),
            onSelected = { controller.updateDraft(draft.copy(projectId = it)); projectExpanded = false },
            enabled = references != null && !state.saving,
        )
        ReferencePicker(
            label = "Mode",
            value = selectedMode?.title ?: "なし",
            expanded = modeExpanded,
            onExpandedChange = { modeExpanded = it },
            options = listOf(null to "なし") + (references?.modes?.map { it.id to it.title } ?: emptyList()),
            onSelected = { controller.updateDraft(draft.copy(modeId = it)); modeExpanded = false },
            enabled = references != null && !state.saving,
        )
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
        OutlinedTextField(
            value = draft.plannedStartText,
            onValueChange = { controller.updateDraft(draft.copy(plannedStartText = it)) },
            label = { Text("開始予定") },
            supportingText = { Text("H:mm（例 5:00）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.saving,
        )
        OutlinedTextField(
            value = draft.estimateText,
            onValueChange = { controller.updateDraft(draft.copy(estimateText = it)) },
            label = { Text("見積（分）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            enabled = !state.saving,
        )
        if (state.loadingReferences) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp))
                Text("候補を読み込んでいます…")
            }
        }
        state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (references == null && !state.loadingReferences) {
            TextButton(onClick = controller::retryReferences) { Text("候補を再試行") }
        }
        if (validation.errorMessage != null && state.errorMessage != null) {
            Text(validation.errorMessage, color = MaterialTheme.colorScheme.error)
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = controller::dismiss, enabled = !state.saving) { Text("キャンセル") }
            Button(onClick = controller::save, enabled = references != null && !state.saving) {
                Text(if (editor.mode == TaskEditorMode.CREATE) "追加" else "保存")
            }
        }
        Spacer(Modifier.height(12.dp))
    }
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
    Box {
        OutlinedButton(onClick = { onExpandedChange(true) }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
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
        CircularProgressIndicator()
        Spacer(Modifier.height(12.dp))
        Text("予定を読み込んでいます…")
    }
}

@Composable
private fun EmptyToday() {
    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("タスクはありません", style = MaterialTheme.typography.titleMedium)
        Text("この日の予定は空です。", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TodayError(message: String, retry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(message, color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(12.dp))
        Button(onClick = retry) { Text("再試行") }
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

private suspend fun PointerInputScope.detectShortLongPressDrag(
    onDragStart: (Offset) -> Unit,
    onDragMove: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit,
) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val held = withTimeoutOrNull(D112_DRAG_HOLD_MS) {
            while (true) {
                val event = awaitPointerEvent()
                val change = event.changes.firstOrNull { it.id == down.id }
                    ?: return@withTimeoutOrNull false
                if (change.changedToUpIgnoreConsumed()) return@withTimeoutOrNull false
            }
            false
        } == null
        if (!held) return@awaitEachGesture
        onDragStart(down.position)
        val completed = drag(down.id) { change ->
            onDragMove((change.position - change.previousPosition).y)
            change.consume()
        }
        if (completed) onDragEnd() else onDragCancel()
    }
}

private fun formatWeekday(value: String): String = runCatching {
    val date = LocalDate.parse(value)
    val weekdays = listOf("月", "火", "水", "木", "金", "土", "日")
    weekdays[date.dayOfWeek.value - 1]
}.getOrDefault(value)

private fun formatMinute(value: Int?): String = value?.let { "${it / 60}:${(it % 60).toString().padStart(2, '0')}" } ?: "--:--"

private fun formatEstimate(seconds: Int): String = if (seconds < 3600) "${seconds / 60}分" else "${seconds / 3600}時間${(seconds % 3600) / 60}分"

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
