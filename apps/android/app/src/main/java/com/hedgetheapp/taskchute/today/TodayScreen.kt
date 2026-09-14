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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(controller: TodayController, onSignOut: () -> Unit) {
    val state = controller.state
    LaunchedEffect(controller) { controller.loadCurrent() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("TaskChute", style = MaterialTheme.typography.labelMedium)
                        Text("Today", style = MaterialTheme.typography.titleLarge)
                    }
                },
                actions = {
                    TextButton(onClick = onSignOut) { Text("ログアウト") }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = true,
                    onClick = { controller.today() },
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
                    selected = false,
                    onClick = {},
                    enabled = false,
                    icon = { Text("⚙") },
                    label = { Text("設定") },
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
                -> TodayContent(controller, state, Modifier.fillMaxSize())
                TodayLoadStatus.ERROR -> TodayError(state.errorMessage ?: "Todayを読み込めませんでした。", controller::refresh)
                TodayLoadStatus.AUTH_REQUIRED -> TodayAuthRequired()
            }
            if (state.status == TodayLoadStatus.CONTENT || state.status == TodayLoadStatus.EMPTY || state.status == TodayLoadStatus.REFRESHING) {
                state.day?.runningTask?.let { task ->
                    if (state.day.isCurrent) {
                        RunningTaskPanel(
                            task = task,
                            controller = controller,
                            enabled = !state.pendingEntryIds.contains(task.id),
                            modifier = Modifier.align(Alignment.BottomCenter),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TodayContent(controller: TodayController, state: TodayUiState, modifier: Modifier) {
    val day = state.day ?: return LoadingToday()
    Column(modifier) {
        DateNavigator(day, controller)
        state.errorMessage?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
        }
        if (!day.hasEntries) {
            EmptyToday()
            return@Column
        }
        LazyColumn(
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 110.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            day.sections.forEach { section ->
                item(key = "section-${section.id}") { SectionHeader(section) }
                items(section.entries, key = { it.id }) { task ->
                    TodayTaskRow(task, day.isCurrent && !state.pendingEntryIds.contains(task.id), controller)
                }
            }
            if (day.unsectionedEntries.isNotEmpty()) {
                item(key = "section-unsectioned") { SectionHeader(null) }
                items(day.unsectionedEntries, key = { it.id }) { task ->
                    TodayTaskRow(task, day.isCurrent && !state.pendingEntryIds.contains(task.id), controller)
                }
            }
        }
    }
}

@Composable
private fun DateNavigator(day: TodayDay, controller: TodayController) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        IconButton(
            onClick = controller::previousDay,
            modifier = Modifier.semantics { contentDescription = "前の日" },
        ) { Text("‹", style = MaterialTheme.typography.headlineMedium) }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (day.isCurrent) "今日" else "予定日", style = MaterialTheme.typography.labelLarge)
            Text(day.logicalDate, style = MaterialTheme.typography.titleMedium)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = controller::nextDay,
                modifier = Modifier.semantics { contentDescription = "次の日" },
            ) { Text("›", style = MaterialTheme.typography.headlineMedium) }
            TextButton(onClick = controller::today, enabled = !day.isCurrent) { Text("今日") }
            IconButton(
                onClick = controller::refresh,
                modifier = Modifier.semantics { contentDescription = "Todayを更新" },
            ) { Text("↻") }
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
private fun TodayTaskRow(task: TodayTask, enabled: Boolean, controller: TodayController) {
    Card(modifier = Modifier.fillMaxWidth()) {
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
        }
    }
}

@Composable
private fun RunningTaskPanel(task: TodayTask, controller: TodayController, enabled: Boolean, modifier: Modifier) {
    Card(modifier = modifier.fillMaxWidth().padding(12.dp).navigationBarsPadding()) {
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
private fun LoadingToday() {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator()
        Spacer(Modifier.height(12.dp))
        Text("Todayを読み込んでいます…")
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

private fun formatMinute(value: Int?): String = value?.let { "${it / 60}:${(it % 60).toString().padStart(2, '0')}" } ?: "--:--"

private fun formatEstimate(seconds: Int): String = if (seconds < 3600) "${seconds / 60}分" else "${seconds / 3600}時間${(seconds % 3600) / 60}分"

private fun stateColor(state: LifecycleState): Color = when (state) {
    LifecycleState.PLANNED -> Color.Gray
    LifecycleState.RUNNING -> Color(0xFF2E7D32)
    LifecycleState.COMPLETED -> Color(0xFF1565C0)
}
