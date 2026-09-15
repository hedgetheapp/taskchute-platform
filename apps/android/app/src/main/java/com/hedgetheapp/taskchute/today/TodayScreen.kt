package com.hedgetheapp.taskchute.today

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.LocalDate

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
            onClick = {},
            enabled = false,
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
) {
    val state = controller.state
    val planningState = planningController?.state ?: TaskPlanningUiState()
    LaunchedEffect(controller) { controller.loadCurrent() }

    Scaffold(
        bottomBar = {
            AndroidNavigationBar(
                selected = AndroidDestination.TODAY,
                onToday = controller::today,
                onSettings = onNavigateSettings,
            )
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
                            if (canAdd) {
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
        ModalBottomSheet(onDismissRequest = planningController::dismiss) {
            TaskEditorForm(planningController, planningState, Modifier.imePadding())
        }
    }
}

@Composable
private fun TodayContent(
    controller: TodayController,
    state: TodayUiState,
    planningController: TaskPlanningController?,
    modifier: Modifier,
) {
    val day = state.day ?: return LoadingToday()
    Column(modifier) {
        DateNavigator(
            day = day,
            controller = controller,
        )
        state.errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
        }
        if (!day.hasEntries) {
            EmptyToday()
            return@Column
        }
        LazyColumn(
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 110.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            day.sections.forEach { section ->
                item(key = "section-${section.id}") { SectionHeader(section) }
                items(section.entries, key = { it.id }) { task ->
                    TodayTaskRow(
                        task = task,
                        enabled = day.isCurrent && !state.pendingEntryIds.contains(task.id),
                        controller = controller,
                        canEdit = day.isCurrent && day.planningEnabled && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived && planningController != null,
                        onEdit = { planningController?.openEdit(day, task) },
                    )
                }
            }
            if (day.unsectionedEntries.isNotEmpty()) {
                item(key = "section-unsectioned") { SectionHeader(null) }
                items(day.unsectionedEntries, key = { it.id }) { task ->
                    TodayTaskRow(
                        task = task,
                        enabled = day.isCurrent && !state.pendingEntryIds.contains(task.id),
                        controller = controller,
                        canEdit = day.isCurrent && day.planningEnabled && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived && planningController != null,
                        onEdit = { planningController?.openEdit(day, task) },
                    )
                }
            }
        }
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
private fun SectionHeader(section: TodaySection?) {
    val title = section?.title ?: "セクションなし"
    val range = section?.let { "${formatMinute(it.startMinute)}–${formatMinute(it.endMinute)}" }
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 2.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        range?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun TodayTaskRow(
    task: TodayTask,
    enabled: Boolean,
    controller: TodayController,
    canEdit: Boolean,
    onEdit: () -> Unit,
) {
    var editMenuExpanded by remember(task.id) { mutableStateOf(false) }
    Card(
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(14.dp).clip(MaterialTheme.shapes.small).border(
                    BorderStroke(1.dp, stateColor(task.lifecycleState)),
                    MaterialTheme.shapes.small,
                ),
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(task.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val metadata = listOfNotNull(
                    task.project?.title,
                    task.mode?.title,
                    task.estimateSeconds?.let(::formatEstimate),
                    task.plannedStartMinute?.let(::formatMinute),
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
            if (canEdit) {
                Box {
                    IconButton(
                        onClick = { editMenuExpanded = true },
                        modifier = Modifier.semantics { contentDescription = "タスクの編集メニュー" },
                    ) { Text("…") }
                    DropdownMenu(
                        expanded = editMenuExpanded,
                        onDismissRequest = { editMenuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("編集") },
                            onClick = {
                                editMenuExpanded = false
                                onEdit()
                            },
                        )
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

private fun formatWeekday(value: String): String = runCatching {
    val date = LocalDate.parse(value)
    val weekdays = listOf("月", "火", "水", "木", "金", "土", "日")
    weekdays[date.dayOfWeek.value - 1]
}.getOrDefault(value)

private fun formatMinute(value: Int?): String = value?.let { "${it / 60}:${(it % 60).toString().padStart(2, '0')}" } ?: "--:--"

private fun formatEstimate(seconds: Int): String = if (seconds < 3600) "${seconds / 60}分" else "${seconds / 3600}時間${(seconds % 3600) / 60}分"

private fun stateColor(state: LifecycleState): Color = when (state) {
    LifecycleState.PLANNED -> Color.Gray
    LifecycleState.RUNNING -> Color(0xFF2E7D32)
    LifecycleState.COMPLETED -> Color(0xFF1565C0)
}
