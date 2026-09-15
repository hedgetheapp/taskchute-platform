package com.hedgetheapp.taskchute.document

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.hedgetheapp.taskchute.today.AndroidDestination
import com.hedgetheapp.taskchute.today.AndroidNavigationBar

@Composable
fun NotesScreen(
    controller: NotesController,
    onNavigateToday: () -> Unit,
    onNavigateSettings: () -> Unit,
) {
    val state = controller.state
    var leaveAction by remember { mutableStateOf<(() -> Unit)?>(null) }

    fun attemptLeave(action: () -> Unit) {
        val editor = controller.state.editor
        when {
            editor?.blocked == true || editor?.saving == true -> Unit
            controller.hasUnsavedChanges -> leaveAction = action
            else -> {
                controller.dismissEditor()
                action()
            }
        }
    }

    BackHandler(enabled = state.editor != null) {
        attemptLeave {
            controller.dismissEditor()
            onNavigateToday()
        }
    }
    LaunchedEffect(controller) { controller.load() }

    if (leaveAction != null) {
        AlertDialog(
            onDismissRequest = { leaveAction = null },
            title = { Text("変更を破棄しますか？") },
            text = { Text("保存していないノートの変更は失われます。") },
            confirmButton = {
                TextButton(onClick = {
                    val action = leaveAction
                    leaveAction = null
                    controller.dismissEditor()
                    action?.invoke()
                }) { Text("破棄して移動") }
            },
            dismissButton = { TextButton(onClick = { leaveAction = null }) { Text("キャンセル") } },
        )
    }

    Scaffold(
        bottomBar = {
            AndroidNavigationBar(
                selected = AndroidDestination.NOTES,
                onToday = { attemptLeave(onNavigateToday) },
                onNotes = {},
                onSettings = { attemptLeave(onNavigateSettings) },
            )
        },
        floatingActionButton = {
            if (state.editor == null) {
                FloatingActionButton(onClick = controller::openNew, modifier = Modifier.semantics { contentDescription = "ノートを新規作成" }) { Text("＋") }
            }
        },
    ) { padding ->
        if (state.editor == null) {
            NotesList(controller, state, Modifier.fillMaxSize().padding(padding))
        } else {
            NoteEditor(
                controller,
                state.editor,
                Modifier.fillMaxSize().padding(padding).imePadding(),
                onBack = {
                    attemptLeave {
                        controller.dismissEditor()
                        onNavigateToday()
                    }
                },
            )
        }
    }
}

@Composable
private fun NotesList(controller: NotesController, state: NotesUiState, modifier: Modifier) {
    Column(modifier.padding(horizontal = 20.dp, vertical = 18.dp)) {
        Text("ノート", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(12.dp))
        state.errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error)
            TextButton(onClick = controller::load) { Text("再試行") }
            if (state.unresolvedTaskEnsure != null) {
                TextButton(onClick = controller::retryTaskPrimaryEnsure, enabled = !state.taskEnsureSaving) { Text("元のノート作成を再試行") }
            }
        }
        if (state.loadingList) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.padding(8.dp))
                Text("ノートを読み込んでいます…")
            }
        } else if (state.documents.isEmpty() && state.errorMessage == null) {
            Text("ノートはありません。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(state.documents, key = { it.documentId }) { document ->
                    Column(
                        modifier = Modifier.fillMaxWidth().clickable { controller.openStandalone(document.documentId) }.padding(vertical = 14.dp),
                    ) {
                        Text(document.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("更新 ${document.updatedAt}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    HorizontalDivider()
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
            TextButton(onClick = onBack, enabled = !editor.blocked && !editor.saving) { Text("‹ ノート") }
            Spacer(Modifier.width(8.dp))
            Text(if (editor.document == null) "新規ノート" else "ノート", style = MaterialTheme.typography.titleLarge)
        }
        if (editor.kind == DocumentKind.STANDALONE) {
            OutlinedTextField(
                value = editor.title,
                onValueChange = controller::updateTitle,
                label = { Text("タイトル") },
                singleLine = true,
                enabled = !editor.blocked && !editor.saving,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Text(editor.taskTitle ?: "タスクノート", style = MaterialTheme.typography.titleMedium)
            Text("TaskタイトルはTask側が管理します。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        OutlinedTextField(
            value = editor.markdownBody,
            onValueChange = controller::updateBody,
            label = { Text("Markdown") },
            enabled = !editor.blocked && !editor.saving,
            modifier = Modifier.fillMaxWidth().weight(1f),
        )
        editor.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (editor.blocked) {
            Text("保存結果が未確定です。元の操作を再試行してください。", color = MaterialTheme.colorScheme.error)
            Button(onClick = controller::retryUnresolved, enabled = !editor.saving) { Text("元の保存を再試行") }
        } else {
            Button(onClick = controller::save, enabled = !editor.saving, modifier = Modifier.fillMaxWidth()) {
                Text(if (editor.saving) "保存中…" else "保存")
            }
        }
    }
}
