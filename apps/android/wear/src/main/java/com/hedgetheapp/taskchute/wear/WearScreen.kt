package com.hedgetheapp.taskchute.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

private val TaskChuteWearDarkColorScheme = ColorScheme(
    primary = Color(0xFFD9E2FF),
    primaryDim = Color(0xFFB2C5FF),
    primaryContainer = Color(0xFF2E4578),
    onPrimary = Color(0xFF102957),
    onPrimaryContainer = Color(0xFFD9E2FF),
    secondary = Color(0xFFC0C7DB),
    secondaryDim = Color(0xFFA4ADC2),
    secondaryContainer = Color(0xFF30384B),
    onSecondary = Color(0xFF252C3D),
    onSecondaryContainer = Color(0xFFDDE2F5),
    tertiary = Color(0xFFE5B9D8),
    tertiaryDim = Color(0xFFD09FC2),
    tertiaryContainer = Color(0xFF4A2942),
    onTertiary = Color(0xFF3A1B32),
    onTertiaryContainer = Color(0xFFFFD7F1),
    surfaceContainerLow = Color(0xFF000000),
    surfaceContainer = Color(0xFF080808),
    surfaceContainerHigh = Color(0xFF151515),
    onSurface = Color(0xFFF1F1EF),
    onSurfaceVariant = Color(0xFFB8B9BC),
    outline = Color(0xFF85878C),
    outlineVariant = Color(0xFF424448),
    background = Color(0xFF000000),
    onBackground = Color(0xFFF1F1EF),
    error = Color(0xFFFFB4AB),
    errorDim = Color(0xFFE46962),
    errorContainer = Color(0xFF5A1D1A),
    onError = Color(0xFF690005),
    onErrorContainer = Color(0xFFFFDAD6),
)

@Composable
internal fun WearTaskChuteTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = TaskChuteWearDarkColorScheme) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
        ) {
            content()
        }
    }
}

@Composable
internal fun WearTaskChuteApp(controller: WearTodayController, pairingBridge: WearPairingBridge) {
    WearTaskChuteTheme {
        when (val state = controller.state) {
            WearScreenState.Restoring, WearScreenState.Loading -> LoadingScreen()
            WearScreenState.SignedOut -> PairingScreen(pairingBridge.state, pairingBridge::beginPairing)
            is WearScreenState.Error -> ErrorScreen(state.message, controller::loadToday)
            is WearScreenState.Today -> TodayScreen(state.day, controller::start)
            is WearScreenState.Running -> RunningScreen(state.day, controller::complete)
            is WearScreenState.Completed -> CompletedScreen(state, controller::start)
            is WearScreenState.WaitingForPhone -> PairingScreen(pairingBridge.state, pairingBridge::beginPairing)
        }
    }
}

@Composable
private fun LoadingScreen() = WearList {
    item {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            CircularProgressIndicator()
            Text("読み込み中…", textAlign = TextAlign.Center)
        }
    }
}

@Composable
internal fun PairingScreen(pairingState: WearPairingState, onConnect: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
            .background(Color.Black, CircleShape)
            .border(1.dp, Color(0xFF2E2E2E), CircleShape)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        val presentation = pairingState.presentation()
        Column(
            modifier = Modifier
                .fillMaxWidth(0.625f)
                .offset(y = (-10).dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Text(
                "ログイン",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontSize = 12.sp,
                    lineHeight = 14.sp,
                    fontWeight = FontWeight.Bold,
                ),
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
            )
            if (presentation.errorTitle != null) {
                Text(
                    presentation.errorTitle,
                    style = MaterialTheme.typography.titleLarge.copy(fontSize = 12.sp, lineHeight = 14.sp),
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                )
                Text(
                    presentation.errorMessage.orEmpty(),
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, lineHeight = 11.sp),
                    textAlign = TextAlign.Center,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Button(
                onClick = onConnect,
                enabled = !presentation.isBusy,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(25.dp)
                    .semantics { contentDescription = presentation.actionContentDescription },
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            ) {
                if (presentation.isBusy) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                        CircularProgressIndicator(Modifier.size(15.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            presentation.actionLabel,
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontSize = 8.sp,
                                lineHeight = 10.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            maxLines = 1,
                        )
                    }
                } else {
                    Text(
                        presentation.actionLabel,
                        style = MaterialTheme.typography.labelLarge.copy(
                            fontSize = 8.sp,
                            lineHeight = 10.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun ErrorScreen(message: String, onRetry: () -> Unit) = WearList {
    item {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Image(painterResource(R.drawable.ic_material_error_24), contentDescription = null, modifier = Modifier.size(26.dp))
            Text("接続できません", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Text(message, textAlign = TextAlign.Center)
            Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("再試行") }
        }
    }
}

@Composable
private fun TodayScreen(day: WearDay, onStart: (WearTask) -> Unit) = WearList {
    item {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(formatWearDate(day.logicalDate), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        }
    }
    day.sections.forEach { section ->
        val planned = section.tasks.filter { it.lifecycle == WearLifecycle.PLANNED }
        if (planned.isEmpty()) return@forEach
        item(key = "section-${section.id}") {
            SectionHeader(section)
        }
        items(planned, key = { it.id }) { task -> TaskRow(day, task, onStart) }
    }
    val unsectionedPlanned = day.unsectionedTasks.filter { it.lifecycle == WearLifecycle.PLANNED }
    if (unsectionedPlanned.isNotEmpty()) {
        item(key = "section-unsectioned") {
            Text("Sectionなし", style = MaterialTheme.typography.titleSmall, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
        }
        items(unsectionedPlanned, key = { it.id }) { task -> TaskRow(day, task, onStart) }
    }
    if (day.allTasks.none { it.lifecycle == WearLifecycle.PLANNED }) {
        item { Text("予定はありません", textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
    }
}

@Composable
private fun SectionHeader(section: WearSection) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("${formatWearMinute(section.startMinute)} - ${formatWearMinute(section.endMinute)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(5.dp))
        Text(section.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun TaskRow(day: WearDay, task: WearTask, onStart: (WearTask) -> Unit) {
    val projection = wearForecast(day, task, Instant.now())
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp, horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        ProjectionSlot(projection)
        Column(
            modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(task.title, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                Image(painterResource(R.drawable.ic_material_hourglass_top_24), contentDescription = null, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(3.dp))
                Text(task.estimateSeconds?.let { "${it / 60}分" } ?: "--", style = MaterialTheme.typography.labelMedium)
                if (task.routineDerived) {
                    Spacer(Modifier.width(5.dp))
                    Image(painterResource(R.drawable.ic_material_repeat_24), contentDescription = "Routine", modifier = Modifier.size(13.dp))
                }
            }
        }
        Button(
            onClick = { onStart(task) },
            modifier = Modifier.size(44.dp).semantics { contentDescription = "Start ${task.title}" },
            shape = CircleShape,
            contentPadding = PaddingValues(0.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            ),
        ) {
            Image(painterResource(R.drawable.ic_material_play_arrow_24), contentDescription = null, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun ProjectionSlot(projection: WearProjection) {
    val lineColor = MaterialTheme.colorScheme.outlineVariant
    Column(
        modifier = Modifier.width(42.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(formatWearMinute(projection.startMinute), style = MaterialTheme.typography.labelSmall, maxLines = 1)
        Canvas(Modifier.height(12.dp).width(1.dp)) {
            drawLine(
                color = lineColor,
                start = androidx.compose.ui.geometry.Offset(size.width / 2f, 0f),
                end = androidx.compose.ui.geometry.Offset(size.width / 2f, size.height),
                strokeWidth = 1.dp.toPx(),
            )
        }
        Text(formatWearMinute(projection.endMinute), style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

@Composable
private fun RunningScreen(day: WearDay, onComplete: () -> Unit) {
    val task = day.runningTask ?: return ErrorScreen("実行中Taskを確認できません。Todayを再読込してください。") { }
    var now by remember(task.id) { mutableStateOf(Instant.now()) }
    LaunchedEffect(task.id) {
        while (true) {
            delay(1_000)
            now = Instant.now()
        }
    }
    val progress = wearProgress(day.activeExecution?.startedAt ?: task.activeStartedAt, task.estimateSeconds, now)
    WearList {
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("実行中", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
                Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Image(
                        painterResource(R.drawable.ic_material_fiber_manual_record_24),
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onBackground),
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(task.title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                if (progress.fraction != null) {
                    ProgressRing(progress.fraction, Modifier.size(100.dp))
                    TimeLine(R.drawable.ic_material_schedule_24, "経過", formatWearDuration(progress.elapsedSeconds))
                    TimeLine(
                        R.drawable.ic_material_hourglass_top_24,
                        if ((progress.overrunSeconds ?: 0L) > 0) "超過" else "残り",
                        if ((progress.overrunSeconds ?: 0L) > 0) formatWearDuration(progress.overrunSeconds) else formatWearDuration(progress.remainingSeconds),
                    )
                } else {
                    TimeLine(R.drawable.ic_material_schedule_24, "経過", formatWearDuration(progress.elapsedSeconds))
                }
                Button(
                    onClick = onComplete,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    ),
                ) {
                    Image(painterResource(R.drawable.ic_material_stop_24), contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Complete")
                }
            }
        }
    }
}

@Composable
private fun TimeLine(icon: Int, label: String, time: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        Image(painterResource(icon), contentDescription = null, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(4.dp))
        Text("$label  ", style = MaterialTheme.typography.labelMedium)
        Text(time, style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp, fontWeight = FontWeight.Normal))
    }
}

@Composable
private fun ProgressRing(progress: Float, modifier: Modifier = Modifier) {
    val indicator = MaterialTheme.colorScheme.primary
    val track = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.18f)
    Canvas(modifier) {
        val stroke = 5.dp.toPx()
        drawArc(track, -90f, 360f, false, style = Stroke(stroke))
        drawArc(indicator, -90f, 360f * progress.coerceIn(0f, 1f), false, style = Stroke(stroke, cap = StrokeCap.Round))
    }
}

@Composable
private fun CompletedScreen(state: WearScreenState.Completed, onStart: (WearTask) -> Unit) = WearList {
    item {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Image(painterResource(R.drawable.ic_material_check_circle_24), contentDescription = null, modifier = Modifier.size(34.dp))
            Text("完了しました", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Text(state.completedTask.title, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
            state.completedTask.completedDurationSeconds?.let {
                TimeLine(R.drawable.ic_material_schedule_24, "実績", formatWearDuration(it.toLong()))
            }
            Spacer(Modifier.height(4.dp))
            Text("次のTask", style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center)
            val next = state.day.nextPlannedTask
            if (next == null) {
                Text("予定はありません", textAlign = TextAlign.Center)
            } else {
                TaskRow(state.day, next, onStart)
            }
        }
    }
}

@Composable
private fun WearList(content: androidx.wear.compose.foundation.lazy.TransformingLazyColumnScope.() -> Unit) {
    TransformingLazyColumn(contentPadding = PaddingValues(horizontal = 12.dp, vertical = 18.dp), content = content)
}

private fun formatWearDate(value: String): String = runCatching {
    DateTimeFormatter.ofPattern("yyyy-MM-dd(EEE)", Locale.JAPAN).format(LocalDate.parse(value))
}.getOrDefault(value)
