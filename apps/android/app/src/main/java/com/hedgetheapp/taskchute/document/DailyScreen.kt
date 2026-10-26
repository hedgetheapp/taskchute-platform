package com.hedgetheapp.taskchute.document

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AndroidNavigationBar
import com.hedgetheapp.taskchute.ui.TaskChuteDatePickerDialog
import com.hedgetheapp.taskchute.ui.TaskChuteDateNavigator
import com.hedgetheapp.taskchute.ui.TaskChuteColors
import com.hedgetheapp.taskchute.R

internal data class DailyCursorEditorIdentity(val sessionKey: String, val documentId: String)

internal fun dailyCursorEditorIdentity(state: DailyUiState): DailyCursorEditorIdentity? =
    state.document?.documentId?.let { DailyCursorEditorIdentity(sessionKey = it, documentId = it) }

internal fun shouldShowDailyNavigationBar(editorBodyFocused: Boolean, imeVisible: Boolean): Boolean =
    !(editorBodyFocused && imeVisible)

@Composable
fun DailyScreen(
    controller: DailyController,
    onNavigateToday: () -> Unit,
    onNavigateNotes: () -> Unit,
    onNavigateSettings: () -> Unit,
    onNavigateReview: () -> Unit = {},
    initialDate: String? = null,
    onOpenInternalLink: (AndroidInternalDocumentRoute) -> Unit = {},
    onSearchInternalLinks: (suspend (String, String?) -> InternalDocumentLinkSearchResult)? = null,
    onNavigateInternalBack: (() -> Unit)? = null,
) {
    val state = controller.state
    val cursorIdentity = dailyCursorEditorIdentity(state)
    val density = LocalDensity.current
    val imeInsets = LocalMarkdownEditorImeInsets.current ?: WindowInsets.ime
    val imeVisible = imeInsets.getBottom(density) > 0
    var editorBodyFocused by remember { mutableStateOf(false) }
    val imeEditorActive = editorBodyFocused && imeVisible
    val showNavigationBar = shouldShowDailyNavigationBar(editorBodyFocused, imeVisible)
    var datePickerVisible by remember { mutableStateOf(false) }
    var navigationRequested by remember { mutableStateOf<(() -> Unit)?>(null) }

    fun leave(action: () -> Unit) {
        if (controller.hasUnsavedChanges) navigationRequested = action else action()
    }

    BackHandler(enabled = true) { leave(onNavigateInternalBack ?: onNavigateToday) }
    LaunchedEffect(controller, initialDate) {
        if (initialDate == null) controller.loadCurrent() else controller.loadExistingDate(initialDate)
    }

    navigationRequested?.let { action ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { navigationRequested = null },
            title = { Text("保存して移動しますか？") },
            text = { Text("デイリーノートの変更を保存して移動します。") },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    navigationRequested = null
                    controller.flushAndNavigate(action)
                }) { Text("保存して移動") }
            },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { navigationRequested = null }) { Text("キャンセル") } },
        )
    }
    if (datePickerVisible && state.selectedDate != null) {
        TaskChuteDatePickerDialog(
            initialLogicalDate = state.selectedDate,
            onDismissRequest = { datePickerVisible = false },
            onConfirm = {
                datePickerVisible = false
                controller.selectDate(it)
            },
        )
    }

    Scaffold(
        containerColor = TaskChuteColors.NotesBackground,
        bottomBar = {
            if (showNavigationBar) {
                AndroidNavigationBar(
                    selected = AndroidDestination.DAILY,
                    onToday = { leave(onNavigateToday) },
                    onNotes = { leave(onNavigateNotes) },
                    onReview = { leave(onNavigateReview) },
                    onDaily = { },
                    onSettings = { leave(onNavigateSettings) },
                )
            }
        },
    ) { padding ->
        val contentPadding = imeEditorScaffoldPadding(padding, imeEditorActive, LocalLayoutDirection.current)
        Column(
            Modifier.fillMaxSize().padding(contentPadding).windowInsetsPadding(imeInsets)
                .padding(horizontal = 20.dp).padding(top = 12.dp, bottom = if (imeEditorActive) 0.dp else 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            TaskChuteDateNavigator(
                logicalDate = state.selectedDate,
                onPrevious = controller::previousDate,
                onNext = controller::nextDate,
                onOpenDatePicker = { datePickerVisible = true },
            )
            when {
                state.loading -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator() }
                state.document != null -> {
                    MarkdownLiveEditor(
                        value = state.markdownBody,
                        onValueChange = controller::updateBody,
                        enabled = !state.blocked,
                        modifier = Modifier.fillMaxWidth().weight(1f),
                        editorSessionKey = cursorIdentity?.sessionKey ?: state.selectedDate ?: Unit,
                        cursorDocumentId = cursorIdentity?.documentId,
                        onOpenInternalLink = onOpenInternalLink,
                        onSearchInternalLinks = onSearchInternalLinks,
                        onTransientValueChange = controller::updateBodyWithoutAutosave,
                        onBodyFocusChanged = { editorBodyFocused = it },
                        footer = {
                            Text(
                                when (state.saveStatus) {
                                    DailySaveStatus.SAVING -> "保存中…"
                                    DailySaveStatus.SAVED -> "保存済み"
                                    DailySaveStatus.UNSAVED -> "未保存"
                                    DailySaveStatus.CONFLICT -> "競合しています。内容を確認してください。"
                                    DailySaveStatus.AMBIGUOUS -> "保存結果が未確定です。"
                                    DailySaveStatus.ERROR -> "保存に失敗しました。"
                                },
                                color = if (state.saveStatus in setOf(DailySaveStatus.SAVED, DailySaveStatus.UNSAVED, DailySaveStatus.SAVING)) TaskChuteColors.SecondaryText else MaterialTheme.colorScheme.error,
                                fontSize = 13.sp,
                            )
                            state.errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                            if (state.canRetryLoad) {
                                androidx.compose.material3.TextButton(onClick = controller::retryLoad) { Text("再試行") }
                            }
                            if (state.blocked) Button(onClick = controller::retryUnresolved, enabled = !state.saving) { Text("元の保存を再試行") }
                        },
                    )
                }
                else -> {
                    Column {
                        Text(state.errorMessage ?: "この日のデイリーノートは利用できません。", color = TaskChuteColors.SecondaryText)
                        if (state.canRetryLoad) {
                            androidx.compose.material3.TextButton(onClick = controller::retryLoad) { Text("再試行") }
                        }
                    }
                }
            }
        }
    }
}
