package com.hedgetheapp.taskchute.document

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AndroidNavigationBar
import com.hedgetheapp.taskchute.ui.TaskChuteColors

@Composable
fun NotesScreen(
    controller: NotesController,
    onNavigateToday: () -> Unit,
    onNavigateSettings: () -> Unit,
) {
    val state = controller.state
    var leaveAction by remember { mutableStateOf<(() -> Unit)?>(null) }
    var deleteTarget by remember { mutableStateOf<AndroidDocumentSummary?>(null) }

    fun attemptLeave(action: () -> Unit) {
        when {
            controller.state.editor?.blocked == true -> Unit
            controller.state.lifecycleSaving || controller.state.unresolvedLifecycleRequest != null -> Unit
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
            AndroidNavigationBar(
                selected = AndroidDestination.NOTES,
                onToday = { attemptLeave(onNavigateToday) },
                onNotes = { attemptLeave {} },
                onSettings = { attemptLeave(onNavigateSettings) },
            )
        },
        floatingActionButton = {
            if (state.editor == null) {
                FloatingActionButton(
                    onClick = controller::openNew,
                    shape = RoundedCornerShape(22.dp),
                    containerColor = Color(0xFFECECEC),
                    contentColor = TaskChuteColors.NotesBackground,
                    elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 0.dp),
                    modifier = Modifier.semantics { contentDescription = "ノートを新規作成" },
                ) { Text("＋") }
            }
        },
    ) { padding ->
        if (state.editor == null) {
            NotesList(
                controller = controller,
                state = state,
                onRequestDelete = { deleteTarget = it },
                modifier = Modifier.fillMaxSize().padding(padding),
            )
        } else {
            NoteEditor(
                controller,
                state.editor,
                Modifier.fillMaxSize().padding(padding).imePadding(),
                onBack = { attemptLeave(::leaveEditorToOrigin) },
            )
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
        } else if (state.unresolvedTaskEnsure == null) {
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
                else -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally))
            }
        }
    }
}

@Composable
private fun NotesList(
    controller: NotesController,
    state: NotesUiState,
    onRequestDelete: (AndroidDocumentSummary) -> Unit,
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
            state.unresolvedLifecycleRequest?.let {
                TextButton(onClick = controller::retryLifecycle, enabled = !state.lifecycleSaving) { Text("元の操作を再試行") }
            }
        }
        if (state.loadingList) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
                Text("ノートを読み込んでいます…")
            }
        } else if (state.documents.isEmpty() && state.errorMessage == null) {
            Text("ノートはありません。", color = TaskChuteColors.SecondaryText)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(state.documents, key = { it.documentId }) { document ->
                    var menuExpanded by remember(document.documentId) { mutableStateOf(false) }
                    Row(
                        modifier = Modifier.fillMaxWidth().height(78.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(
                            modifier = Modifier.weight(1f).clickable { controller.openStandalone(document.documentId) }.padding(start = 2.dp, top = 10.dp, bottom = 10.dp),
                        ) {
                            Text(document.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = TaskChuteColors.PrimaryText, style = MaterialTheme.typography.titleMedium)
                            Text("更新 ${document.updatedAt}", style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
                        }
                        Box {
                            Box(
                                modifier = Modifier.width(80.dp).height(34.dp).clip(RoundedCornerShape(17.dp))
                                    .background(TaskChuteColors.Control)
                                    .clickable(enabled = !state.lifecycleSaving && state.unresolvedLifecycleRequest == null) { menuExpanded = true }
                                    .semantics { contentDescription = "ノートの操作" },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text("操作", color = TaskChuteColors.PrimaryText, style = MaterialTheme.typography.labelMedium)
                            }
                            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                                DropdownMenuItem(
                                    text = { Text(if (state.archivedView) "復元" else "アーカイブ") },
                                    onClick = {
                                        menuExpanded = false
                                        controller.archiveStandalone(document, !state.archivedView)
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("削除") },
                                    onClick = {
                                        menuExpanded = false
                                        onRequestDelete(document)
                                    },
                                )
                            }
                        }
                    }
                    HorizontalDivider(color = TaskChuteColors.Divider)
                }
            }
        }
    }
}

@Composable
private fun NoteEditor(controller: NotesController, editor: NoteEditorState, modifier: Modifier, onBack: () -> Unit) {
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
                value = editor.title,
                onValueChange = controller::updateTitle,
                label = { Text("タイトル") },
                singleLine = true,
                enabled = !editor.blocked,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Text(editor.taskTitle ?: "タスクノート", style = MaterialTheme.typography.titleMedium, color = TaskChuteColors.PrimaryText)
            Text("TaskタイトルはTask側が管理します。", style = MaterialTheme.typography.bodySmall, color = TaskChuteColors.SecondaryText)
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
