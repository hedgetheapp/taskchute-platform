package com.hedgetheapp.taskchute.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.rememberDatePickerState
import java.time.LocalDate
import java.time.ZoneOffset
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import com.hedgetheapp.taskchute.ui.TaskChuteColors
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AndroidNavigationBar
import com.hedgetheapp.taskchute.ui.ChromeIcon
import com.hedgetheapp.taskchute.ui.TaskChuteIcons

@Composable
fun SettingsScreen(
    controller: SettingsController,
    onNavigateToday: () -> Unit,
    onNavigateNotes: () -> Unit,
    onSignOut: () -> Unit,
) {
    val state = controller.state
    var leaveHome by remember { mutableStateOf(false) }
    BackHandler(enabled = state.destination != SettingsDestination.HOME && state.sectionEditor == null && state.projectEditor == null && state.routineEditor == null) { controller.showHome() }
    Scaffold(
        containerColor = TaskChuteColors.NotesBackground,
        bottomBar = {
            AndroidNavigationBar(
                selected = AndroidDestination.SETTINGS,
                onToday = onNavigateToday,
                onNotes = onNavigateNotes,
                onSettings = {},
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp)) {
            when (state.destination) {
                SettingsDestination.HOME -> SettingsHome(controller, onSignOut)
                SettingsDestination.SECTIONS -> SectionSettings(controller)
                SettingsDestination.PROJECTS -> ProjectSettings(controller)
                SettingsDestination.ROUTINES -> RoutineSettings(controller)
            }
            state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp)) }
            state.noticeMessage?.let { Text(it, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(vertical = 8.dp)) }
            if (state.unresolvedOperation != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("保存結果が未確認です。元の操作を保持しています。", modifier = Modifier.weight(1f))
                    TextButton(onClick = controller::retryUnresolved, enabled = state.pendingOperation == null) { Text("再試行") }
                }
            }
            if (state.loading) CircularProgressIndicator(modifier = Modifier.padding(16.dp))
        }
    }
    state.deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = controller::cancelDelete,
            title = { Text("${target.label}を削除しますか？") },
            text = { Text(if (target.kind == SettingsDeleteKind.SECTION) "時間帯は隣接Sectionへ吸収されます。" else "この操作は元に戻せません。") },
            confirmButton = { TextButton(onClick = controller::confirmDelete) { Text("削除") } },
            dismissButton = { TextButton(onClick = controller::cancelDelete) { Text("キャンセル") } },
        )
    }
}

@Composable
private fun SettingsHome(controller: SettingsController, onSignOut: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(top = 20.dp)) {
        Text("設定", style = MaterialTheme.typography.headlineMedium, color = TaskChuteColors.PrimaryText)
        Text("TaskChuteの時間と再利用設定を管理します。", color = TaskChuteColors.SecondaryText, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.height(26.dp))
        SettingsCard("セクション設定", "1日の時間帯（Section）を管理") { controller.openSections() }
        Spacer(Modifier.height(12.dp))
        SettingsCard("プロジェクト設定", "Projectの作成・編集・管理") { controller.openProjects() }
        Spacer(Modifier.height(12.dp))
        SettingsCard("ルーティン設定", "繰り返しTaskの作成・管理") { controller.openRoutines() }
        Spacer(Modifier.weight(1f))
        OutlinedButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth().height(50.dp).navigationBarsPadding().padding(bottom = 0.dp)) { Text("ログアウト") }
    }
}

@Composable
private fun SettingsCard(title: String, subtitle: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).semantics { contentDescription = title },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = TaskChuteColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().height(76.dp).padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = TaskChuteColors.PrimaryText)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
            }
            ChromeIcon(TaskChuteIcons.ChevronRight, "${title}を開く", Modifier.size(22.dp))
        }
    }
}
@Composable
private fun SettingsHeader(title: String, onBack: () -> Unit, action: (() -> Unit)? = null, actionLabel: String? = null) {
    Row(Modifier.fillMaxWidth().height(58.dp).padding(horizontal = 0.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onBack, modifier = Modifier.width(92.dp)) { Text("‹ 戻る", color = TaskChuteColors.PrimaryText) }
        Text(title, style = MaterialTheme.typography.titleLarge, color = TaskChuteColors.PrimaryText, modifier = Modifier.weight(1f))
        if (action != null && actionLabel != null) {
            Box(
                modifier = Modifier.size(42.dp).clip(RoundedCornerShape(21.dp)).background(TaskChuteColors.Control)
                    .clickable(onClick = action).semantics { contentDescription = actionLabel },
                contentAlignment = Alignment.Center,
            ) { Text("＋", color = TaskChuteColors.PrimaryText, style = MaterialTheme.typography.titleLarge) }
        } else {
            Spacer(Modifier.size(42.dp))
        }
    }
}

@Composable
private fun ColumnScope.SectionSettings(controller: SettingsController) {
    val state = controller.state
    SettingsHeader("セクション設定", controller::showHome, controller::openNewSection, "＋")
    val sections = state.sectionConfiguration?.sections.orEmpty()
    LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(sections, key = { it.id }) { section ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = TaskChuteColors.Surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            ) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(section.title, style = MaterialTheme.typography.titleMedium); Text("${minuteText(section.startMinute)} - ${minuteText(section.endMinute)}") }
                    TextButton(onClick = { controller.openSection(section.id) }) { Text("編集") }
                    TextButton(onClick = { controller.requestDeleteSection(section.id) }, enabled = sections.size > 1) { Text("削除") }
                }
            }
        }
    }
    state.sectionEditor?.let { draft ->
        EditorSheet(title = if (draft.isNew) "セクション作成" else "セクション編集", onDismiss = controller::cancelSection, onSave = controller::saveSection, saveLabel = if (draft.isNew) "追加" else "保存") {
            OutlinedTextField(draft.title, { controller.updateSectionDraft(title = it) }, label = { Text("名前") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(draft.startText, { controller.updateSectionDraft(start = it) }, label = { Text("開始時刻（HH:mm）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(draft.endText, { controller.updateSectionDraft(end = it) }, label = { Text("終了時刻（HH:mm）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun ColumnScope.ProjectSettings(controller: SettingsController) {
    val state = controller.state
    SettingsHeader("プロジェクト設定", controller::showHome, controller::openNewProject, "＋")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = { controller.setProjectArchivedView(false) }) { Text("有効") }
        TextButton(onClick = { controller.setProjectArchivedView(true) }) { Text(if (state.projectArchivedView) "アーカイブ" else "アーカイブ") }
    }
    val projects = state.projectBoard?.projects.orEmpty().filter { it.archived == state.projectArchivedView }.sortedBy { it.boardPosition }
    LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(projects, key = { it.id }) { project ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(project.title, style = MaterialTheme.typography.titleMedium); Text(if (project.archived) "アーカイブ" else "有効") }
                    TextButton(onClick = { controller.moveProject(project.id, -1) }, enabled = !project.archived) { Text("↑") }
                    TextButton(onClick = { controller.moveProject(project.id, 1) }, enabled = !project.archived) { Text("↓") }
                    TextButton(onClick = { controller.openProject(project.id) }) { Text("編集") }
                }
            }
        }
    }
    state.projectEditor?.let { draft ->
        EditorSheet(if (draft.isNew) "プロジェクト作成" else "プロジェクト編集", controller::cancelProject, controller::saveProject, if (draft.isNew) "追加" else "保存") {
            OutlinedTextField(draft.title, controller::updateProjectDraft, label = { Text("プロジェクト名") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (!draft.isNew) {
                val project = state.projectBoard?.projects?.firstOrNull { it.id == draft.id }
                TextButton(onClick = { controller.archiveProject(requireNotNull(draft.id), !(project?.archived ?: false)) }) { Text(if (project?.archived == true) "復元" else "アーカイブ") }
                TextButton(onClick = { controller.requestDeleteProject(requireNotNull(draft.id)) }) { Text("削除") }
            }
        }
    }
}

@Composable
private fun ColumnScope.RoutineSettings(controller: SettingsController) {
    val state = controller.state
    val board = state.routineBoard
    val draft = state.routineEditor
    var scheduleSheet by remember { mutableStateOf(false) }
    var startDatePicker by remember { mutableStateOf(false) }
    var endDatePicker by remember { mutableStateOf(false) }
    SettingsHeader("ルーティン設定", controller::showHome, controller::openNewRoutine, "＋")
    val routines = board?.routines.orEmpty()
    LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(routines, key = { it.id }) { routine ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(routine.title, style = MaterialTheme.typography.titleMedium)
                        Text("${routine.schedule.summary()}・${routine.defaultPlannedStartMinute?.let(::minuteText) ?: "開始予定なし"}")
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(if (routine.enabled) "有効" else "無効", style = MaterialTheme.typography.labelSmall)
                        Switch(
                            checked = routine.enabled,
                            onCheckedChange = { controller.toggleRoutine(routine.id, it) },
                            modifier = Modifier.semantics {
                                contentDescription = "ルーティン: ${if (routine.enabled) "有効" else "無効"}。タップで切り替え"
                            },
                        )
                    }
                    TextButton(onClick = { controller.openRoutine(routine.id) }) { Text("編集") }
                    TextButton(onClick = { controller.requestDeleteRoutine(routine.id) }) { Text("削除") }
                }
            }
        }
    }
    draft?.let { current ->
        EditorSheet(if (current.isNew) "ルーティン作成" else "ルーティン編集", controller::cancelRoutine, controller::saveRoutine, if (current.isNew) "追加" else "保存") {
            OutlinedTextField(current.title, { controller.updateRoutineDraft(title = it) }, label = { Text("タスク名") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            RoutineChoiceField("プロジェクト", board?.projects.orEmpty().filter { !it.archived || it.id == current.projectId }.map { it.id to it.title }, current.projectId, "なし", controller::setRoutineProject)
            RoutineChoiceField("モード", board?.modes.orEmpty().filter { !it.archived || it.id == current.defaultModeId }.map { it.id to it.title }, current.defaultModeId, "なし", controller::setRoutineMode)
            RoutineChoiceField("Section", board?.sections.orEmpty().map { it.id to "${it.title} (${minuteText(it.startMinute)}-${minuteText(it.endMinute)})" }, current.defaultSectionId, "開始予定から自動", controller::setRoutineSection)
            OutlinedTextField(current.defaultPlannedStartText, { controller.updateRoutineDraft(start = it) }, label = { Text("開始予定（900 / 0900 / HH:mm）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(current.defaultEstimateText, { controller.updateRoutineDraft(estimate = it) }, label = { Text("見積（分）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedButton(onClick = { scheduleSheet = true }, modifier = Modifier.fillMaxWidth()) { Text("繰り返し: ${current.schedule.summary()}") }
            OutlinedButton(onClick = { startDatePicker = true }, modifier = Modifier.fillMaxWidth()) { Text("開始日: ${current.startLogicalDate}") }
            OutlinedButton(onClick = { endDatePicker = true }, modifier = Modifier.fillMaxWidth()) { Text("終了日: ${current.endLogicalDate.ifBlank { "なし" }}") }
            if (current.endLogicalDate.isNotBlank()) TextButton(onClick = { controller.setRoutineEndDate(null) }, modifier = Modifier.fillMaxWidth()) { Text("終了日をなしにする") }
        }
    }
    if (scheduleSheet && draft != null) ScheduleEditorSheet(draft.schedule, { scheduleSheet = false }, { controller.updateRoutineSchedule(it); scheduleSheet = false })
    if (startDatePicker && draft != null) RoutineDatePickerDialog(draft.startLogicalDate, { startDatePicker = false }) { controller.setRoutineStartDate(it); startDatePicker = false }
    if (endDatePicker && draft != null) RoutineDatePickerDialog(draft.endLogicalDate.ifBlank { draft.startLogicalDate }, { endDatePicker = false }) { controller.setRoutineEndDate(it); endDatePicker = false }
}

@Composable
private fun RoutineChoiceField(label: String, options: List<Pair<String, String>>, selected: String?, emptyLabel: String, onSelected: (String?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) { Text("$label: ${options.firstOrNull { it.first == selected }?.second ?: emptyLabel}") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text(emptyLabel) }, onClick = { onSelected(null); expanded = false })
            options.forEach { (id, title) -> DropdownMenuItem(text = { Text(title) }, onClick = { onSelected(id); expanded = false }) }
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun ScheduleEditorSheet(initial: RoutineScheduleSpec, onDismiss: () -> Unit, onApply: (RoutineScheduleSpec) -> Unit) {
    var kind by remember(initial) { mutableStateOf(initial.kind) }
    var interval by remember(initial) { mutableStateOf((initial.intervalDays ?: initial.intervalWeeks ?: initial.intervalMonths ?: "").toString()) }
    var day by remember(initial) { mutableStateOf((initial.dayOfMonth ?: "").toString()) }
    var ordinal by remember(initial) { mutableStateOf((initial.ordinal ?: "").toString()) }
    var weekday by remember(initial) { mutableStateOf((initial.weekday ?: "").toString()) }
    var weekdays by remember(initial) { mutableStateOf(initial.weekdays.joinToString(",")) }
    val schedule = parseRoutineScheduleDraft(kind, interval, day, ordinal, weekday, weekdays)
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(20.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("繰り返し設定", style = MaterialTheme.typography.titleLarge)
            RoutineChoiceField("種類", scheduleKindOptions(), kind, "毎日") { selected -> kind = selected ?: "daily" }
            if (kind in listOf("every_n_days", "every_n_weeks", "every_n_months_day", "every_n_months_last_day")) OutlinedTextField(interval, { interval = it }, label = { Text("間隔") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (kind in listOf("monthly_day", "every_n_months_day")) OutlinedTextField(day, { day = it }, label = { Text("日") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (kind == "monthly_nth_weekday") OutlinedTextField(ordinal, { ordinal = it }, label = { Text("第何週") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (kind in listOf("weekly", "every_n_weeks")) OutlinedTextField(weekdays, { weekdays = it }, label = { Text("曜日（0=日, カンマ区切り）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (kind in listOf("monthly_nth_weekday", "monthly_last_weekday")) OutlinedTextField(weekday, { weekday = it }, label = { Text("曜日（0=日）") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(
                onClick = { schedule?.let(onApply) },
                enabled = schedule != null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("適用") }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("キャンセル") }
        }
    }
}

private fun scheduleKindOptions(): List<Pair<String, String>> = listOf(
    "daily" to "毎日", "every_n_days" to "N日ごと", "weekly" to "毎週", "every_n_weeks" to "N週間ごと",
    "monthly_day" to "毎月指定日", "monthly_last_day" to "毎月末日", "monthly_nth_weekday" to "毎月第N曜日",
    "monthly_last_weekday" to "毎月最終曜日", "every_n_months_day" to "Nか月ごと指定日", "every_n_months_last_day" to "Nか月ごと月末",
    "workday" to "営業日", "holiday" to "休日", "official_holiday" to "祝日", "monthly_last_workday" to "月末営業日",
)


@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun RoutineDatePickerDialog(initialDate: String, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    val initialMillis = runCatching { LocalDate.parse(initialDate).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli() }.getOrNull()
    val picker = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
    DatePickerDialog(onDismissRequest = onDismiss, confirmButton = { TextButton(onClick = { picker.selectedDateMillis?.let { onConfirm(LocalDate.ofEpochDay(it / 86_400_000L).toString()) } }) { Text("決定") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("キャンセル") } }) { DatePicker(state = picker) }
}
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun EditorSheet(title: String, onDismiss: () -> Unit, onSave: () -> Unit, saveLabel: String, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(20.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp), content = {
            Text(title, style = MaterialTheme.typography.titleLarge)
            content()
            Button(onClick = onSave, modifier = Modifier.fillMaxWidth()) { Text(saveLabel) }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("キャンセル") }
        })
    }
}

private fun minuteText(value: Int): String = "%02d:%02d".format(value / 60, value % 60)
