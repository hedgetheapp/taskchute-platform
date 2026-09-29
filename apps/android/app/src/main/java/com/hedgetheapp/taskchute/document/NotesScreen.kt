package com.hedgetheapp.taskchute.document

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AndroidNavigationBar
import com.hedgetheapp.taskchute.ui.MovableAddFab
import com.hedgetheapp.taskchute.ui.TaskChuteColors
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
@OptIn(ExperimentalMaterial3Api::class)
fun NotesScreen(
    controller: NotesController,
    onNavigateToday: () -> Unit,
    onNavigateSettings: () -> Unit,
    onNavigateDaily: () -> Unit = {},
) {
    val state = controller.state
    var leaveAction by remember { mutableStateOf<(() -> Unit)?>(null) }
    var deleteTarget by remember { mutableStateOf<AndroidDocumentSummary?>(null) }
    var actionTarget by remember { mutableStateOf<AndroidDocumentSummary?>(null) }
    var notesFabOffset by remember(state.archivedView) { mutableStateOf(Offset.Zero) }

    fun attemptLeave(action: () -> Unit) {
        when {
            controller.state.editor?.blocked == true -> Unit
            controller.state.lifecycleSaving || controller.state.unresolvedLifecycleRequest != null -> Unit
            controller.state.selectionModeActive -> {
                controller.exitSelection()
                action()
            }
            controller.requiresDiscardConfirmation -> leaveAction = action
            else -> controller.flushAndNavigate(action)
        }
    }

    fun leaveEditorToOrigin() {
        val origin = controller.state.editor?.origin
        attemptLeave {
            if (origin == NoteEditorOrigin.TODAY_TASK) onNavigateToday()
        }
    }

    BackHandler(enabled = state.editor != null) {
        attemptLeave(::leaveEditorToOrigin)
    }
    LaunchedEffect(controller, state.archivedView) { controller.load(state.archivedView) }

    if (leaveAction != null) {
        AlertDialog(
            onDismissRequest = { leaveAction = null },
            title = { Text("変更を破棄しますか？") },
            text = { Text("保存していないノートの変更は失われます。") },
            confirmButton = {
                TextButton(onClick = {
                    val action = leaveAction
                    leaveAction = null
                    if (controller.discardEditor()) action?.invoke()
                }) { Text("破棄して移動") }
            },
            dismissButton = { TextButton(onClick = { leaveAction = null }) { Text("キャンセル") } },
        )
    }

    Scaffold(
        containerColor = TaskChuteColors.NotesBackground,
        bottomBar = {
            Box(Modifier.imePadding()) {
                AndroidNavigationBar(
                    selected = AndroidDestination.NOTES,
                    onToday = { attemptLeave(onNavigateToday) },
                    onNotes = { attemptLeave {} },
                    onDaily = { attemptLeave(onNavigateDaily) },
                    onSettings = { attemptLeave(onNavigateSettings) },
                )
            }
        },
    ) { padding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(padding)) {
            if (state.editor == null) {
                NotesList(
                    controller = controller,
                    state = state,
                    onOpenActions = { actionTarget = it },
                    modifier = Modifier.fillMaxSize(),
                )
                if (!state.selectionModeActive) {
                    val density = LocalDensity.current
                    val maxX = with(density) { (maxWidth - 64.dp).toPx().coerceAtLeast(0f) }
                    val maxY = with(density) { (maxHeight - 64.dp).toPx().coerceAtLeast(0f) }
                    MovableAddFab(
                        contentDescription = "ノートを新規作成",
                        onClick = controller::openNew,
                        onDrag = { delta ->
                            notesFabOffset = Offset(
                                (notesFabOffset.x + delta.x).coerceIn(-maxX, 0f),
                                (notesFabOffset.y + delta.y).coerceIn(-maxY, 0f),
                            )
                        },
                        modifier = Modifier.align(Alignment.BottomEnd).offset {
                            IntOffset(notesFabOffset.x.roundToInt(), notesFabOffset.y.roundToInt())
                        }.size(64.dp),
                    )
                }
            } else {
                NoteEditor(
                    controller,
                    state.editor,
                    Modifier.fillMaxSize().imePadding(),
                    onBack = { attemptLeave(::leaveEditorToOrigin) },
                )
            }
        }
    }

    actionTarget?.let { document ->
        ModalBottomSheet(
            onDismissRequest = { actionTarget = null },
            containerColor = TaskChuteColors.SurfaceElevated,
        ) {
            Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(document.title, color = TaskChuteColors.PrimaryText, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                TextButton(onClick = {
                    actionTarget = null
                    controller.openStandalone(document.documentId, focusTitle = true)
                }, modifier = Modifier.fillMaxWidth()) { Text("名前を変更", color = TaskChuteColors.PrimaryText) }
                TextButton(onClick = {
                    actionTarget = null
                    controller.archiveStandalone(document, !state.archivedView)
                }, modifier = Modifier.fillMaxWidth()) { Text(if (state.archivedView) "復元" else "アーカイブ", color = TaskChuteColors.PrimaryText) }
                TextButton(onClick = { actionTarget = null; deleteTarget = document }, modifier = Modifier.fillMaxWidth()) {
                    Text("削除", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }

    deleteTarget?.let { document ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("ノートを削除") },
            text = { Text("「${document.title}」を完全に削除しますか？この操作は元に戻せません。") },
            confirmButton = {
                TextButton(onClick = {
                    deleteTarget = null
                    controller.deleteStandalone(document)
                }) { Text("削除") }
            },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("キャンセル") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskNoteBottomSheet(
    controller: NotesController,
    onDismiss: () -> Unit,
) {
    val state = controller.state
    fun attemptDismiss() {
        if (state.editor != null) {
            controller.flushAndNavigate(onDismiss)
        } else if (state.unresolvedTaskEnsure == null && state.unresolvedProjectEnsure == null) {
            onDismiss()
        }
    }
    ModalBottomSheet(
        onDismissRequest = ::attemptDismiss,
        containerColor = Color(0xFF232323),
        scrimColor = Color.Black.copy(alpha = 0.46f),
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = {
            Box(Modifier.width(40.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFA3A3A0)))
        },
    ) {
        Column(
            Modifier.fillMaxWidth().heightIn(min = 360.dp, max = 655.dp).navigationBarsPadding().imePadding().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("ノート", color = TaskChuteColors.PrimaryText, fontSize = 20.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
            when {
                state.editor?.origin == NoteEditorOrigin.TODAY_TASK -> {
                    val editor = state.editor!!
                    Text(editor.taskTitle ?: "タスクノート", color = TaskChuteColors.PrimaryText, fontSize = 17.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    MarkdownLiveEditor(
                        value = editor.markdownBody,
                        onValueChange = controller::updateBody,
                        enabled = !editor.blocked,
                        modifier = Modifier.fillMaxWidth().weight(1f).padding(top = 2.dp),
                        footer = {
                            HorizontalDivider(color = TaskChuteColors.Divider)
                            Text(
                                when (editor.saveStatus) {
                                    NoteSaveStatus.SAVING -> "保存中…"
                                    NoteSaveStatus.SAVED -> "保存済み"
                                    NoteSaveStatus.UNSAVED -> "未保存"
                                    NoteSaveStatus.CONFLICT -> "競合しています。内容を確認してください。"
                                    NoteSaveStatus.AMBIGUOUS -> "保存結果が未確定です。"
                                    NoteSaveStatus.ERROR -> "保存に失敗しました。"
                                },
                                color = if (editor.saveStatus in setOf(NoteSaveStatus.SAVED, NoteSaveStatus.UNSAVED, NoteSaveStatus.SAVING)) TaskChuteColors.SecondaryText else MaterialTheme.colorScheme.error,
                                fontSize = 13.sp,
                                fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                            )
                            editor.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                            if (editor.blocked) {
                                Text("保存結果が未確定です。元の操作を再試行してください。", color = MaterialTheme.colorScheme.error)
                                Button(onClick = controller::retryUnresolved, enabled = !editor.saving) { Text("元の保存を再試行") }
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                TextButton(onClick = ::attemptDismiss, enabled = !editor.saving, modifier = Modifier.width(88.dp).height(48.dp)) {
                                    Text("閉じる", color = Color(0xFFB794F4))
                                }
                            }
                        },
                    )
                }
                state.unresolvedTaskEnsure != null -> {
                    if (state.taskEnsureSaving) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                    state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    TextButton(onClick = controller::retryTaskPrimaryEnsure, enabled = !state.taskEnsureSaving) { Text("元のノート作成を再試行") }
                }
                state.unresolvedProjectEnsure != null -> {
                    if (state.projectEnsureSaving) CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
                    state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    TextButton(onClick = controller::retryProjectPrimaryEnsure, enabled = !state.projectEnsureSaving) { Text("元のノート作成を再試行") }
                }
                else -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
            }
        }
    }
}

@Composable
private fun NotesList(
    controller: NotesController,
    state: NotesUiState,
    onOpenActions: (AndroidDocumentSummary) -> Unit,
    modifier: Modifier,
) {
    Column(modifier.padding(horizontal = 20.dp, vertical = 18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(if (state.archivedView) "アーカイブ" else "ノート", style = MaterialTheme.typography.headlineMedium, color = TaskChuteColors.PrimaryText)
            Box(
                modifier = Modifier.width(92.dp).height(36.dp).clip(RoundedCornerShape(18.dp))
                    .background(TaskChuteColors.Control)
                    .clickable(enabled = !state.lifecycleSaving && state.unresolvedLifecycleRequest == null) {
                        controller.setArchivedView(!state.archivedView)
                    }
                    .semantics { contentDescription = if (state.archivedView) "通常のノート" else "アーカイブ" },
                contentAlignment = Alignment.Center,
            ) {
                Text(if (state.archivedView) "通常のノート" else "アーカイブ", color = TaskChuteColors.PrimaryText, style = MaterialTheme.typography.labelMedium)
            }
        }
        Spacer(Modifier.height(12.dp))
        state.errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
            TextButton(onClick = controller::load) { Text("再試行") }
            if (state.unresolvedTaskEnsure != null) {
                TextButton(onClick = controller::retryTaskPrimaryEnsure, enabled = !state.taskEnsureSaving) { Text("元のノート作成を再試行") }
            }
            if (state.unresolvedProjectEnsure != null) {
                TextButton(onClick = controller::retryProjectPrimaryEnsure, enabled = !state.projectEnsureSaving) { Text("元のノート作成を再試行") }
            }
            state.unresolvedLifecycleRequest?.let {
                TextButton(onClick = controller::retryLifecycle, enabled = !state.lifecycleSaving) { Text("元の操作を再試行") }
            }
        }
        if (state.loadingList) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
                Text("ノートを読み込んでいます…")
            }
        } else if (state.documents.isEmpty() && state.projectNotes.isEmpty() && state.errorMessage == null) {
            Text("ノートはありません。", color = TaskChuteColors.SecondaryText)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(state.documents, key = { it.documentId }) { document ->
                    val selected = document.documentId in state.selectedDocumentIds
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(78.dp)
                            .pointerInput(document.documentId, state.selectionModeActive) {
                                awaitEachGesture {
                                    val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                                    var moved = false
                                    var horizontal = 0f
                                    var vertical = 0f
                                    while (true) {
                                        val event = awaitPointerEvent(PointerEventPass.Initial)
                                        val change = event.changes.firstOrNull { it.id == down.id } ?: continue
                                        horizontal = change.position.x - down.position.x
                                        vertical = change.position.y - down.position.y
                                        if (!moved && (change.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                                            moved = true
                                        }
                                        if (change.changedToUpIgnoreConsumed() || !change.pressed) break
                                    }
                                    if (moved && horizontal > viewConfiguration.touchSlop && abs(horizontal) > abs(vertical)) {
                                        controller.enterSelection(document.documentId)
                                    }
                                }
                            },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (state.selectionModeActive) {
                            Box(
                                modifier = Modifier.width(48.dp).height(48.dp).clickable { controller.toggleSelection(document.documentId) }
                                    .semantics { contentDescription = if (selected) "選択済み ${document.title}" else "未選択 ${document.title}" },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(if (selected) "☑" else "☐", color = if (selected) TaskChuteColors.AccentBlue else TaskChuteColors.SecondaryText, fontSize = 22.sp)
                            }
                        }
                        Column(
                            modifier = Modifier.weight(1f).clickable {
                                if (state.selectionModeActive) controller.toggleSelection(document.documentId)
                                else controller.openStandalone(document.documentId)
                            }.padding(start = 2.dp, top = 10.dp, bottom = 10.dp),
                        ) {
                            Text(document.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = TaskChuteColors.PrimaryText, style = MaterialTheme.typography.titleMedium)
                            Text("作成日 ${formatDocumentTimestamp(document.createdAt)}", style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
                            Text("更新日 ${formatDocumentTimestamp(document.updatedAt)}", style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
                        }
                        if (!state.selectionModeActive) Box {
                            Box(
                                modifier = Modifier.width(48.dp).height(48.dp).clip(RoundedCornerShape(24.dp))
                                    .background(TaskChuteColors.Control)
                                    .clickable(enabled = !state.lifecycleSaving && state.unresolvedLifecycleRequest == null) { onOpenActions(document) }
                                    .semantics { contentDescription = "${document.title}の操作" },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("…", color = TaskChuteColors.PrimaryText, fontSize = 24.sp)
                            }
                        }
                    }
                    HorizontalDivider(color = TaskChuteColors.Divider)
                }
                if (!state.archivedView) {
                    items(state.projectNotes, key = { "project-${it.projectId}" }) { document ->
                        ProjectDocumentRow(
                            document = document,
                            selectionModeActive = state.selectionModeActive,
                            onOpen = { controller.openProjectNote(document) },
                        )
                        HorizontalDivider(color = TaskChuteColors.Divider)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectDocumentRow(
    document: AndroidProjectNoteCandidate,
    selectionModeActive: Boolean,
    onOpen: () -> Unit,
) {
    val title = document.projectTitle + if (document.projectArchived) "（アーカイブ）" else ""
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(92.dp)
            .clickable(enabled = !selectionModeActive, onClick = onOpen)
            .padding(start = 2.dp, top = 10.dp, bottom = 10.dp)
            .semantics { contentDescription = "PROJECT NOTE $title" },
    ) {
        Text("PROJECT NOTE", color = TaskChuteColors.AccentBlue, style = MaterialTheme.typography.labelMedium)
        Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = TaskChuteColors.PrimaryText, style = MaterialTheme.typography.titleMedium)
        Text("作成日 ${formatDocumentTimestamp(document.createdAt)}", style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
        Text("更新日 ${formatDocumentTimestamp(document.updatedAt)}", style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
    }
}

private fun formatDocumentTimestamp(value: String): String {
    if (value.isBlank()) return "--"
    return runCatching {
        Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
    }.getOrElse { value }
}

@Composable
private fun NoteEditor(controller: NotesController, editor: NoteEditorState, modifier: Modifier, onBack: () -> Unit) {
    val titleFocusRequester = remember(editor.sessionId) { FocusRequester() }
    var titleValue by remember(editor.sessionId) { mutableStateOf(TextFieldValue(editor.title)) }
    LaunchedEffect(editor.sessionId, editor.focusTitleOnStart) {
        if (editor.focusTitleOnStart && editor.kind == DocumentKind.STANDALONE) {
            titleValue = titleValue.copy(selection = TextRange(0, titleValue.text.length))
            titleFocusRequester.requestFocus()
        }
    }
    Column(
        modifier = modifier.padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack, enabled = !editor.blocked) {
                Text(if (editor.origin == NoteEditorOrigin.TODAY_TASK) "‹ 今日" else "‹ ノート")
            }
            Spacer(Modifier.width(8.dp))
            Text(if (editor.document == null) "新規ノート" else "ノート", style = MaterialTheme.typography.titleLarge, color = TaskChuteColors.PrimaryText)
        }
        if (editor.kind == DocumentKind.STANDALONE) {
            OutlinedTextField(
                value = titleValue,
                onValueChange = {
                    titleValue = it
                    controller.updateTitle(it.text)
                },
                label = { Text("タイトル") },
                singleLine = true,
                enabled = !editor.blocked,
                modifier = Modifier.fillMaxWidth().focusRequester(titleFocusRequester),
            )
        } else if (editor.kind == DocumentKind.TASK_PRIMARY) {
            Text(editor.taskTitle ?: "タスクノート", style = MaterialTheme.typography.titleMedium, color = TaskChuteColors.PrimaryText)
            Text("TaskタイトルはTask側が管理します。", style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
        } else {
            Text(editor.projectTitle ?: editor.title, style = MaterialTheme.typography.titleMedium, color = TaskChuteColors.PrimaryText)
            Text("Project名はProject側が管理します。", style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
        }
        MarkdownLiveEditor(
            value = editor.markdownBody,
            onValueChange = controller::updateBody,
            enabled = !editor.blocked,
            modifier = Modifier.fillMaxWidth().weight(1f),
            footer = {
                Text(
                    when (editor.saveStatus) {
                        NoteSaveStatus.SAVING -> "保存中…"
                        NoteSaveStatus.SAVED -> "保存済み"
                        NoteSaveStatus.UNSAVED -> "未保存"
                        NoteSaveStatus.CONFLICT -> "競合しています。内容を確認してください。"
                        NoteSaveStatus.AMBIGUOUS -> "保存結果が未確定です。"
                        NoteSaveStatus.ERROR -> "保存に失敗しました。"
                    },
                    color = if (editor.saveStatus in setOf(NoteSaveStatus.SAVED, NoteSaveStatus.UNSAVED, NoteSaveStatus.SAVING)) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
                editor.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (editor.blocked) {
                    Text("保存結果が未確定です。元の操作を再試行してください。", color = MaterialTheme.colorScheme.error)
                    Button(onClick = controller::retryUnresolved, enabled = !editor.saving) { Text("元の保存を再試行") }
                }
            },
        )
    }
}
