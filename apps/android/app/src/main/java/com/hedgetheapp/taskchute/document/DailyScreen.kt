package com.hedgetheapp.taskchute.document

import android.app.DatePickerDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AndroidNavigationBar
import com.hedgetheapp.taskchute.ui.ChromeIcon
import com.hedgetheapp.taskchute.ui.TaskChuteColors
import com.hedgetheapp.taskchute.ui.TaskChuteIcons
import java.time.LocalDate

@Composable
fun DailyScreen(
    controller: DailyController,
    onNavigateToday: () -> Unit,
    onNavigateNotes: () -> Unit,
    onNavigateSettings: () -> Unit,
) {
    val state = controller.state
    val context = LocalContext.current
    var navigationRequested by remember { mutableStateOf<(() -> Unit)?>(null) }

    fun leave(action: () -> Unit) {
        if (controller.hasUnsavedChanges) navigationRequested = action else action()
    }

    BackHandler(enabled = true) { leave(onNavigateToday) }
    LaunchedEffect(controller) { controller.loadCurrent() }

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

    Scaffold(
        containerColor = TaskChuteColors.NotesBackground,
        bottomBar = {
            AndroidNavigationBar(
                selected = AndroidDestination.DAILY,
                onToday = { leave(onNavigateToday) },
                onNotes = { leave(onNavigateNotes) },
                onDaily = { },
                onSettings = { leave(onNavigateSettings) },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).imePadding().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("デイリーノート", color = TaskChuteColors.PrimaryText, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                IconButton(onClick = controller::previousDate, enabled = state.selectedDate != null, modifier = Modifier.semantics { contentDescription = "前の日" }) {
                    ChromeIcon(TaskChuteIcons.ChevronLeft, "前の日")
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    state.selectedDate ?: "---- -- --",
                    color = TaskChuteColors.PrimaryText,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.semantics { contentDescription = "デイリーノートの日付" },
                )
                Spacer(Modifier.width(12.dp))
                IconButton(onClick = controller::nextDate, enabled = state.selectedDate != null, modifier = Modifier.semantics { contentDescription = "次の日" }) {
                    ChromeIcon(TaskChuteIcons.ChevronRight, "次の日")
                }
                IconButton(
                    onClick = {
                        val date = state.selectedDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return@IconButton
                        DatePickerDialog(context, { _, year, month, day -> controller.selectDate(LocalDate.of(year, month + 1, day).toString()) }, date.year, date.monthValue - 1, date.dayOfMonth).show()
                    },
                    enabled = state.selectedDate != null,
                    modifier = Modifier.semantics { contentDescription = "日付を選択" },
                ) { ChromeIcon(TaskChuteIcons.Calendar, "日付を選択") }
            }
            when {
                state.loading -> Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator() }
                state.document != null -> {
                    MarkdownLiveEditor(
                        value = state.markdownBody,
                        onValueChange = controller::updateBody,
                        enabled = !state.blocked,
                        modifier = Modifier.fillMaxWidth().weight(1f),
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
                            if (state.blocked) Button(onClick = controller::retryUnresolved, enabled = !state.saving) { Text("元の保存を再試行") }
                        },
                    )
                }
                else -> {
                    Text(state.errorMessage ?: "この日のデイリーノートは利用できません。", color = TaskChuteColors.SecondaryText)
                }
            }
        }
    }
}
