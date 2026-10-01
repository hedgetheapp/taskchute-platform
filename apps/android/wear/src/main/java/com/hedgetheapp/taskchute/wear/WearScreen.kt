package com.hedgetheapp.taskchute.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
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
private fun TodayScreen(day: WearDay, onStart: (WearTask) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val layout = WearLayoutSpec.forAvailableSize(maxWidth.value, maxHeight.value)
        WearList(
            contentPadding = PaddingValues(
                start = layout.horizontalPagePaddingDp.dp,
                end = layout.horizontalPagePaddingDp.dp,
                top = layout.todayTopPaddingDp.dp,
                bottom = layout.todayBottomPaddingDp.dp,
            ),
        ) {
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        formatWearDate(day.logicalDate),
                        modifier = Modifier.width(layout.taskRowWidthDp.dp),
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontSize = layout.scaledFigma(20f).sp,
                            lineHeight = layout.scaledFigma(24f).sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        color = Color(0xFFF1F1EF),
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(layout.groupGapDp.dp))
                }
            }
            day.sections.forEach { section ->
                val planned = section.tasks.filter { it.lifecycle == WearLifecycle.PLANNED }
                if (planned.isEmpty()) return@forEach
                item(key = "section-${section.id}") {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        SectionHeader(section, layout)
                    }
                }
                items(planned, key = { it.id }) { task ->
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        TaskRow(day, task, onStart, layout)
                    }
                }
            }
            val unsectionedPlanned = day.unsectionedTasks.filter { it.lifecycle == WearLifecycle.PLANNED }
            if (unsectionedPlanned.isNotEmpty()) {
                item(key = "section-unsectioned") {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            "Sectionなし",
                            modifier = Modifier.width(layout.taskRowWidthDp.dp),
                            style = MaterialTheme.typography.titleSmall.copy(
                                fontSize = layout.scaledFigma(14f).sp,
                                fontWeight = FontWeight.Bold,
                            ),
                            color = Color(0xFFF1F1EF),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(layout.groupGapDp.dp))
                    }
                }
                items(unsectionedPlanned, key = { it.id }) { task ->
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        TaskRow(day, task, onStart, layout)
                    }
                }
            }
            if (day.allTasks.none { it.lifecycle == WearLifecycle.PLANNED }) {
                item {
                    Text(
                        "予定はありません",
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                        fontSize = layout.scaledFigma(14f).sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(section: WearSection, layout: WearLayoutSpec) {
    Row(
        modifier = Modifier
            .width(layout.taskRowWidthDp.dp)
            .padding(vertical = layout.sectionVerticalPaddingDp.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "${formatWearMinute(section.startMinute)} - ${formatWearMinute(section.endMinute)}",
            modifier = Modifier.weight(1f, fill = false),
            style = MaterialTheme.typography.labelMedium.copy(
                fontSize = layout.scaledFigma(14f).sp,
                fontWeight = FontWeight.Medium,
            ),
            color = Color(0xFFA3A3A0),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.width(layout.scaledFigma(10f).dp))
        Text(
            section.title,
            modifier = Modifier.weight(1f, fill = false),
            style = MaterialTheme.typography.titleSmall.copy(
                fontSize = layout.scaledFigma(14f).sp,
                fontWeight = FontWeight.Bold,
            ),
            color = Color(0xFFF1F1EF),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun TaskRow(day: WearDay, task: WearTask, onStart: (WearTask) -> Unit, layout: WearLayoutSpec) {
    val projection = wearForecast(day, task, Instant.now())
    val rowShape = RoundedCornerShape(layout.taskRowRadiusDp.dp)
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .width(layout.taskRowWidthDp.dp)
                .height(layout.taskRowItemHeightDp.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(
                modifier = Modifier
                    .align(Alignment.Center)
                    .width(layout.taskRowWidthDp.dp)
                    .height(layout.taskRowVisualHeightDp.dp)
                    .clip(rowShape)
                    .background(Color(0xFF202020))
                    .border(layout.taskRowBorderDp.dp, Color(0xFF383838), rowShape)
                    .padding(
                        start = layout.scaledFigma(WearPlannedRowSpec.LEADING_PADDING_FIGMA.toFloat()).dp,
                        end = layout.scaledFigma(WearPlannedRowSpec.TRAILING_PADDING_FIGMA.toFloat()).dp,
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ProjectionSlot(projection, layout)
                Spacer(Modifier.width(layout.rowColumnGapDp.dp))
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.Start,
                    verticalArrangement = Arrangement.spacedBy(layout.scaledFigma(3f).dp),
                ) {
                    Text(
                        task.title,
                        modifier = Modifier.fillMaxWidth(),
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontSize = layout.scaledFigma(16f).sp,
                            lineHeight = layout.scaledFigma(19f).sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        color = Color(0xFFF1F1EF),
                        textAlign = TextAlign.Start,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Image(
                            painterResource(R.drawable.ic_material_hourglass_top_24),
                            contentDescription = null,
                            modifier = Modifier.size(layout.scaledFigma(14f).dp),
                            colorFilter = ColorFilter.tint(Color(0xFFA3A3A0)),
                        )
                        Spacer(Modifier.width(layout.scaledFigma(6f).dp))
                        Text(
                            task.estimateSeconds?.let { "${it / 60}分" } ?: "--",
                            modifier = Modifier.weight(1f, fill = false),
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontSize = layout.scaledFigma(11f).sp,
                                lineHeight = layout.scaledFigma(14f).sp,
                            ),
                            color = Color(0xFFA3A3A0),
                            maxLines = 1,
                            overflow = TextOverflow.Clip,
                        )
                        if (task.routineDerived) {
                            Spacer(Modifier.width(layout.scaledFigma(6f).dp))
                            Image(
                                painterResource(R.drawable.ic_material_repeat_24),
                                contentDescription = "Routine",
                                modifier = Modifier.size(layout.scaledFigma(14f).dp),
                                colorFilter = ColorFilter.tint(Color(0xFFA3A3A0)),
                            )
                        }
                    }
                }
                Spacer(Modifier.width(layout.rowColumnGapDp.dp))
                Spacer(Modifier.width(layout.actionTouchTargetDp.dp))
            }
            Box(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = layout.scaledFigma(WearPlannedRowSpec.TRAILING_PADDING_FIGMA.toFloat()).dp)
                    .size(layout.actionTouchTargetDp.dp)
                    .clickable(role = Role.Button, onClick = { onStart(task) })
                    .semantics { contentDescription = "Start ${task.title}" },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(layout.actionVisualSizeDp.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .border(maxOf(0.5f, layout.scaledFigma(1f)).dp, Color(0xFF4A4A45), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        painterResource(R.drawable.ic_material_play_arrow_24),
                        contentDescription = null,
                        modifier = Modifier.size(layout.actionIconSizeDp.dp),
                        colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onPrimaryContainer),
                    )
                }
            }
        }
        Spacer(Modifier.height(layout.groupGapDp.dp))
    }
}

@Composable
private fun ProjectionSlot(projection: WearProjection, layout: WearLayoutSpec) {
    val lineColor = Color(0xFFA3A3A0)
    Column(
        modifier = Modifier
            .width(layout.rowProjectionWidthDp.dp)
            .height(layout.rowProjectionHeightDp.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            formatWearMinute(projection.startMinute),
            style = MaterialTheme.typography.labelSmall.copy(fontSize = layout.scaledFigma(11f).sp, fontWeight = FontWeight.Bold),
            color = Color(0xFFA3A3A0),
            maxLines = 1,
        )
        Canvas(Modifier.height(layout.projectionConnectorHeightDp.dp).width(layout.scaledFigma(0.5f).dp)) {
            drawLine(
                color = lineColor,
                start = androidx.compose.ui.geometry.Offset(size.width / 2f, 0f),
                end = androidx.compose.ui.geometry.Offset(size.width / 2f, size.height),
                strokeWidth = maxOf(0.5f, layout.scaledFigma(0.5f)).dp.toPx(),
            )
        }
        Text(
            formatWearMinute(projection.endMinute),
            style = MaterialTheme.typography.labelSmall.copy(fontSize = layout.scaledFigma(11f).sp, fontWeight = FontWeight.Bold),
            color = Color(0xFFA3A3A0),
            maxLines = 1,
        )
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
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val layout = WearLayoutSpec.forAvailableSize(maxWidth.value, maxHeight.value)
        val overrun = progress.overrunSeconds?.takeIf { it > 0L }
        val hasRemaining = progress.fraction != null
        Column(
            modifier = Modifier
                .width(layout.runningContentWidthDp.dp)
                .align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(layout.scaledFigma(10f).dp),
        ) {
            Text(
                "実行中",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontSize = layout.scaledFigma(12f).sp,
                    lineHeight = layout.scaledFigma(15f).sp,
                    fontWeight = FontWeight.Bold,
                ),
                color = Color(0xFF52A3FF),
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
            Row(
                modifier = Modifier.width(layout.runningTitleGroupWidthDp.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(
                    painterResource(R.drawable.ic_material_fiber_manual_record_24),
                    contentDescription = null,
                    modifier = Modifier.size(layout.scaledFigma(16f).dp),
                    colorFilter = ColorFilter.tint(Color(0xFFF1F1EF)),
                )
                Spacer(Modifier.width(layout.scaledFigma(6f).dp))
                Text(
                    task.title,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontSize = layout.scaledFigma(24f).sp,
                        lineHeight = layout.scaledFigma(30f).sp,
                        fontWeight = FontWeight.Bold,
                    ),
                    color = Color(0xFFF1F1EF),
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                modifier = Modifier.width(layout.runningContentWidthDp.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RunningTimeMetric(
                    icon = R.drawable.ic_material_schedule_filled_24,
                    time = formatWearDuration(progress.elapsedSeconds),
                    widthDp = layout.runningTimeGroupWidthDp,
                    iconSizeDp = layout.scaledFigma(18f),
                    gapDp = layout.scaledFigma(6f),
                    fontSizeSp = layout.scaledFigma(20f),
                    color = Color(0xFFF1F1EF),
                    fontWeight = FontWeight.Bold,
                    description = "経過 ${formatWearDuration(progress.elapsedSeconds)}",
                    trailing = false,
                )
                if (hasRemaining) {
                    val rightTime = if (overrun != null) "+${formatWearDuration(overrun)}" else formatWearDuration(progress.remainingSeconds)
                    RunningTimeMetric(
                        icon = R.drawable.ic_material_hourglass_top_filled_24,
                        time = rightTime,
                        widthDp = layout.runningTimeGroupWidthDp,
                        iconSizeDp = layout.scaledFigma(18f),
                        gapDp = layout.scaledFigma(6f),
                        fontSizeSp = layout.scaledFigma(20f),
                        color = if (overrun != null) Color(0xFFEBA44E) else Color(0xFFA3A3A0),
                        fontWeight = FontWeight.Medium,
                        description = if (overrun != null) "超過 ${formatWearDuration(overrun)}" else "残り ${formatWearDuration(progress.remainingSeconds)}",
                        trailing = true,
                    )
                }
            }
            if (progress.fraction != null) {
                val trackShape = RoundedCornerShape(layout.runningProgressRadiusDp.dp)
                Box(
                    modifier = Modifier
                        .width(layout.runningProgressWidthDp.dp)
                        .height(layout.runningProgressHeightDp.dp)
                        .clip(trackShape)
                        .background(Color(0xFF303030)),
                ) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .fillMaxWidth(progress.fraction.coerceIn(0f, 1f))
                            .height(layout.runningProgressHeightDp.dp)
                            .background(if (overrun != null) Color(0xFFEBA44E) else MaterialTheme.colorScheme.primary, trackShape),
                    )
                }
            }
            Box(
                modifier = Modifier
                    .size(layout.actionTouchTargetDp.dp)
                    .clickable(role = Role.Button, onClick = onComplete)
                    .semantics { contentDescription = "Complete ${task.title}" },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(layout.runningCompleteVisualSizeDp.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.errorContainer)
                        .border(maxOf(0.5f, layout.scaledFigma(1f)).dp, Color(0xFF4A4A45), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(
                        painterResource(R.drawable.ic_material_stop_filled_24),
                        contentDescription = null,
                        modifier = Modifier.size(layout.runningCompleteIconSizeDp.dp),
                        colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onErrorContainer),
                    )
                }
            }
            day.nextPlannedTask?.let { RunningNextTaskCard(it, layout) }
        }
    }
}

@Composable
private fun RunningTimeMetric(
    icon: Int,
    time: String,
    widthDp: Float,
    iconSizeDp: Float,
    gapDp: Float,
    fontSizeSp: Float,
    color: Color,
    fontWeight: FontWeight,
    description: String,
    trailing: Boolean,
) {
    Row(
        modifier = Modifier.width(widthDp.dp).semantics { contentDescription = description },
        horizontalArrangement = if (trailing) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(painterResource(icon), contentDescription = null, modifier = Modifier.size(iconSizeDp.dp), colorFilter = ColorFilter.tint(color))
        Spacer(Modifier.width(gapDp.dp))
        Text(
            time,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleLarge.copy(fontSize = fontSizeSp.sp, lineHeight = (fontSizeSp * 1.2f).sp, fontWeight = fontWeight),
            color = color,
            textAlign = if (trailing) TextAlign.End else TextAlign.Start,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Clip,
        )
    }
}

@Composable
private fun RunningNextTaskCard(task: WearTask, layout: WearLayoutSpec) {
    val cardShape = RoundedCornerShape(layout.scaledFigma(18f).dp)
    Column(
        modifier = Modifier
            .width(layout.runningContentWidthDp.dp)
            .height(layout.runningNextCardHeightDp.dp)
            .clip(cardShape)
            .background(Color(0xFF202020))
            .padding(horizontal = layout.scaledFigma(14f).dp, vertical = layout.scaledFigma(10f).dp),
        verticalArrangement = Arrangement.spacedBy(layout.scaledFigma(2f).dp),
    ) {
        Text(
            "次",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = layout.scaledFigma(10f).sp, fontWeight = FontWeight.Bold),
            color = Color(0xFFA3A3A0),
            maxLines = 1,
        )
        Text(
            "${task.title}  ·  ${task.estimateSeconds?.let { "${it / 60}分" } ?: "--"}",
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = layout.scaledFigma(13f).sp, fontWeight = FontWeight.Medium),
            color = Color(0xFFF1F1EF),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun CompletedScreen(state: WearScreenState.Completed, onStart: (WearTask) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val layout = WearLayoutSpec.forAvailableSize(maxWidth.value, maxHeight.value)
        WearList {
            item {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
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
                        TaskRow(state.day, next, onStart, layout)
                    }
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
private fun WearList(
    contentPadding: PaddingValues = PaddingValues(horizontal = 12.dp, vertical = 18.dp),
    content: androidx.wear.compose.foundation.lazy.TransformingLazyColumnScope.() -> Unit,
) {
    TransformingLazyColumn(contentPadding = contentPadding, content = content)
}

private fun formatWearDate(value: String): String = runCatching {
    DateTimeFormatter.ofPattern("yyyy-MM-dd(EEE)", Locale.JAPAN).format(LocalDate.parse(value))
}.getOrDefault(value)
