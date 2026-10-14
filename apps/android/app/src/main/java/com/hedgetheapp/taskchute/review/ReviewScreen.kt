package com.hedgetheapp.taskchute.review

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedgetheapp.taskchute.ui.AndroidDestination
import com.hedgetheapp.taskchute.ui.AndroidNavigationBar
import com.hedgetheapp.taskchute.ui.TaskChuteColors
import com.hedgetheapp.taskchute.ui.TaskChuteIcons
import java.time.LocalDate
import java.time.format.DateTimeFormatter

internal enum class ReviewPrimaryView(val label: String, val contentTitle: String) {
    DATE("Date", "日付ごとの集計"),
    PROJECT("Project", "プロジェクトごとの集計"),
    MODE("Mode", "モードごとの集計"),
    NOTE("Note", "ノートごとの集計"),
}

internal enum class ReviewPeriodGranularity(val selectorLabel: String, val menuLabel: String) {
    DAILY("Day", "Daily"),
    MONTHLY("Month", "Monthly"),
    YEARLY("Year", "Yearly"),
}

internal data class ReviewPeriodState(
    val granularity: ReviewPeriodGranularity,
    val anchor: LocalDate?,
)

internal data class ReviewScreenState(
    val selectedView: ReviewPrimaryView,
    val period: ReviewPeriodState,
)

internal fun selectReviewView(state: ReviewScreenState, view: ReviewPrimaryView): ReviewScreenState =
    state.copy(selectedView = view)

internal fun selectReviewGranularity(
    state: ReviewScreenState,
    granularity: ReviewPeriodGranularity,
): ReviewScreenState {
    val anchor = when (granularity) {
        ReviewPeriodGranularity.DAILY -> state.period.anchor
        ReviewPeriodGranularity.MONTHLY -> state.period.anchor?.withDayOfMonth(1)
        ReviewPeriodGranularity.YEARLY -> state.period.anchor?.withDayOfYear(1)
    }
    return state.copy(period = ReviewPeriodState(granularity, anchor))
}

internal fun stepReviewPeriod(state: ReviewScreenState, amount: Long): ReviewScreenState {
    val anchor = state.period.anchor?.let { current ->
        when (state.period.granularity) {
            ReviewPeriodGranularity.DAILY -> current.plusDays(amount)
            ReviewPeriodGranularity.MONTHLY -> current.plusMonths(amount)
            ReviewPeriodGranularity.YEARLY -> current.plusYears(amount)
        }
    }
    return state.copy(period = state.period.copy(anchor = anchor))
}

internal fun reviewPeriodLabel(period: ReviewPeriodState): String = period.anchor?.let { anchor ->
    when (period.granularity) {
        ReviewPeriodGranularity.DAILY -> anchor.format(DateTimeFormatter.ofPattern("yyyy/MM/dd"))
        ReviewPeriodGranularity.MONTHLY -> anchor.format(DateTimeFormatter.ofPattern("yyyy/MM"))
        ReviewPeriodGranularity.YEARLY -> anchor.format(DateTimeFormatter.ofPattern("yyyy"))
    }
} ?: "—"

@Composable
internal fun ReviewScreen(
    dailyMetricsController: ReviewDailyMetricsController,
    periodMetricsController: ReviewPeriodMetricsController,
    onNavigateToday: () -> Unit,
    onNavigateNotes: () -> Unit,
    onNavigateDaily: () -> Unit,
    onNavigateSettings: () -> Unit,
    initialAnchor: LocalDate? = null,
) {
    var state by remember(initialAnchor) {
        mutableStateOf(
            ReviewScreenState(
                selectedView = ReviewPrimaryView.DATE,
                period = ReviewPeriodState(ReviewPeriodGranularity.DAILY, initialAnchor),
            ),
        )
    }
    val dailyMetricsState = dailyMetricsController.state
    val periodMetricsState = periodMetricsController.state

    fun revalidateDailySelection(next: ReviewScreenState) {
        if (next.selectedView != ReviewPrimaryView.DATE) {
            dailyMetricsController.cancelActiveLoad()
            periodMetricsController.cancelActiveLoad()
            return
        }
        if (next.period.granularity == ReviewPeriodGranularity.DAILY) {
            dailyMetricsController.loadDaily(next.period.anchor?.toString(), debounceMillis = 250)
            next.period.anchor?.toString()?.let {
                periodMetricsController.load(ReviewPeriodGranularity.DAILY, it)
            } ?: periodMetricsController.cancelActiveLoad()
            return
        }
        val anchor = next.period.anchor?.toString()
        if (anchor == null) {
            periodMetricsController.cancelActiveLoad()
            if (dailyMetricsState.currentLogicalDate == null
                && dailyMetricsState.status == ReviewDailyMetricsStatus.IDLE
            ) {
                dailyMetricsController.loadDaily()
            }
            return
        }
        dailyMetricsController.cancelActiveLoad()
        periodMetricsController.load(next.period.granularity, anchor)
    }

    androidx.compose.runtime.LaunchedEffect(dailyMetricsController, periodMetricsController) {
        dailyMetricsController.loadDaily(initialAnchor?.toString())
        state.period.anchor?.toString()?.let { periodMetricsController.load(state.period.granularity, it) }
    }
    androidx.compose.runtime.LaunchedEffect(dailyMetricsState.currentLogicalDate) {
        if (state.period.anchor == null) {
            val currentDate = dailyMetricsState.currentLogicalDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            if (currentDate != null) {
                val anchor = when (state.period.granularity) {
                    ReviewPeriodGranularity.DAILY -> currentDate
                    ReviewPeriodGranularity.MONTHLY -> currentDate.withDayOfMonth(1)
                    ReviewPeriodGranularity.YEARLY -> currentDate.withDayOfYear(1)
                }
                val next = state.copy(period = state.period.copy(anchor = anchor))
                state = next
                revalidateDailySelection(next)
            }
        }
    }
    androidx.compose.runtime.DisposableEffect(dailyMetricsController) {
        onDispose {
            dailyMetricsController.cancelActiveLoad()
            periodMetricsController.cancelActiveLoad()
        }
    }

    Scaffold(
        containerColor = TaskChuteColors.Background,
        bottomBar = {
            AndroidNavigationBar(
                selected = AndroidDestination.REVIEW,
                onToday = onNavigateToday,
                onNotes = onNavigateNotes,
                onDaily = onNavigateDaily,
                onReview = {},
                onSettings = onNavigateSettings,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Review", style = MaterialTheme.typography.headlineMedium, color = TaskChuteColors.PrimaryText)
            ReviewPrimaryTabs(
                selectedView = state.selectedView,
                onSelect = {
                    val next = selectReviewView(state, it)
                    state = next
                    revalidateDailySelection(next)
                },
            )
            ReviewPeriodControls(
                period = state.period,
                onSelectGranularity = {
                    val next = selectReviewGranularity(state, it)
                    state = next
                    revalidateDailySelection(next)
                },
                onPrevious = {
                    val next = stepReviewPeriod(state, -1)
                    state = next
                    revalidateDailySelection(next)
                },
                onNext = {
                    val next = stepReviewPeriod(state, 1)
                    state = next
                    revalidateDailySelection(next)
                },
            )
            Surface(
                modifier = Modifier.fillMaxWidth().weight(1f),
                shape = RoundedCornerShape(18.dp),
                color = TaskChuteColors.Surface,
            ) {
                Box(
                    modifier = Modifier.fillMaxSize().padding(20.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    when (state.selectedView) {
                        ReviewPrimaryView.DATE -> if (state.period.granularity == ReviewPeriodGranularity.DAILY) {
                            ReviewDailyMetricsContent(
                                state = dailyMetricsState,
                                onRetry = { dailyMetricsController.loadDaily(state.period.anchor?.toString()) },
                                routineActivityState = periodMetricsState.routineActivity,
                                onRoutineActivityRetry = {
                                    state.period.anchor?.toString()?.let {
                                        periodMetricsController.load(ReviewPeriodGranularity.DAILY, it)
                                    }
                                },
                            )
                        } else if (state.period.anchor == null) {
                            ReviewPeriodAnchorContent(
                                currentDayState = dailyMetricsState,
                                onRetry = { dailyMetricsController.loadDaily() },
                            )
                        } else {
                            ReviewPeriodMetricsContent(
                                state = periodMetricsState,
                                onRetry = {
                                    periodMetricsController.load(state.period.granularity, state.period.anchor.toString())
                                },
                            )
                        }
                        else -> ReviewPlaceholderContent(state.selectedView.contentTitle)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewPeriodAnchorContent(
    currentDayState: ReviewDailyMetricsUiState,
    onRetry: () -> Unit,
) {
    if (currentDayState.status == ReviewDailyMetricsStatus.ERROR) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("サーバーの現在日を確認できませんでした。", color = TaskChuteColors.SecondaryText, textAlign = TextAlign.Center)
            Button(onClick = onRetry) { Text("再試行") }
        }
    } else {
        ReviewLoadingMessage("サーバーの現在日を確認しています")
    }
}

@Composable
private fun ReviewPeriodMetricsContent(
    state: ReviewPeriodMetricsUiState,
    onRetry: () -> Unit,
) {
    when (state.status) {
        ReviewPeriodMetricsStatus.CONTENT,
        ReviewPeriodMetricsStatus.EMPTY,
        -> {
            val metrics = state.metrics ?: return ReviewCenteredMessage("集計データを確認できませんでした")
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                if (state.status == ReviewPeriodMetricsStatus.EMPTY) {
                    Text(state.message ?: "この期間のTaskChuteDayに対象Entryはありません。", color = TaskChuteColors.SecondaryText)
                }
                ReviewMetricRow("Completed（完了）", "${metrics.completedCount} 件")
                ReviewMetricRow("Unexecuted（Planned）", "${metrics.unexecutedCount} 件")
                ReviewMetricRow("Completed actual duration", formatReviewDuration(metrics.completedActualDurationSeconds))
                ReviewRoutineActivityContent(state.routineActivity, onRetry)
            }
        }
        ReviewPeriodMetricsStatus.UNESTABLISHED -> Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            ReviewRoutineActivityContent(state.routineActivity, onRetry)
            Text(state.message ?: "この期間に記録されたTaskChuteDayはありません。", color = TaskChuteColors.SecondaryText)
        }
        ReviewPeriodMetricsStatus.ERROR -> Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(state.message ?: "集計データを読み込めませんでした。", color = TaskChuteColors.SecondaryText, textAlign = TextAlign.Center)
            Button(onClick = onRetry) { Text("再試行") }
            ReviewRoutineActivityContent(state.routineActivity, onRetry)
        }
        ReviewPeriodMetricsStatus.AUTH_REQUIRED -> ReviewLoadingMessage(state.message ?: "認証状態を確認しています…")
        ReviewPeriodMetricsStatus.ACTIVITY_ONLY -> ReviewRoutineActivityContent(state.routineActivity, onRetry)
        ReviewPeriodMetricsStatus.IDLE,
        ReviewPeriodMetricsStatus.LOADING,
        -> ReviewLoadingMessage("期間集計を読み込んでいます")
    }
}

@Composable
private fun ReviewDailyMetricsContent(
    state: ReviewDailyMetricsUiState,
    onRetry: () -> Unit,
    routineActivityState: ReviewRoutineActivityUiState,
    onRoutineActivityRetry: () -> Unit,
) {
    when (state.status) {
        ReviewDailyMetricsStatus.CONTENT,
        ReviewDailyMetricsStatus.EMPTY,
        -> {
            val metrics = state.metrics ?: return ReviewCenteredMessage("集計データを確認できませんでした")
            LazyColumn(
                modifier = Modifier.fillMaxSize().testTag("review-daily-list"),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 8.dp),
            ) {
                if (state.status == ReviewDailyMetricsStatus.EMPTY) item {
                    Text("この日のTaskChuteDayにEntryはありません", color = TaskChuteColors.SecondaryText)
                }
                item(key = "review-daily-routine-activity") {
                    ReviewRoutineActivityContent(routineActivityState, onRoutineActivityRetry)
                }
                item(key = "review-daily-summary-completed") {
                    ReviewMetricRow("Completed（完了）", "${metrics.completedCount} 件")
                }
                item(key = "review-daily-summary-unexecuted") {
                    ReviewMetricRow("Unexecuted（Planned）", "${metrics.unexecutedCount} 件")
                }
                item(key = "review-daily-summary-duration") {
                    ReviewMetricRow("Completed actual duration", formatReviewDuration(metrics.completedActualDurationSeconds))
                }
                item(key = "review-daily-completed-heading") {
                    ReviewDailyListHeading("Completed（完了したタスク）")
                }
                if (metrics.completedEntries.isEmpty()) {
                    item(key = "review-daily-completed-empty") { ReviewDailyEmptyListMessage() }
                } else {
                    items(metrics.completedEntries, key = { "completed-${it.id}" }) { entry ->
                        ReviewDailyEntryRow(entry)
                    }
                }
                item(key = "review-daily-unexecuted-heading") {
                    ReviewDailyListHeading("Unexecuted（未実行 / Planned）")
                }
                if (metrics.unexecutedEntries.isEmpty()) {
                    item(key = "review-daily-unexecuted-empty") { ReviewDailyEmptyListMessage() }
                } else {
                    items(metrics.unexecutedEntries, key = { "planned-${it.id}" }) { entry ->
                        ReviewDailyEntryRow(entry)
                    }
                }
            }
        }
        ReviewDailyMetricsStatus.UNESTABLISHED -> Column(
            modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            ReviewRoutineActivityContent(routineActivityState, onRoutineActivityRetry)
            Text(state.message ?: "この日はまだ記録されていません。", color = TaskChuteColors.SecondaryText)
        }
        ReviewDailyMetricsStatus.FUTURE_UNAVAILABLE -> Column(
            modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            ReviewRoutineActivityContent(routineActivityState, onRoutineActivityRetry)
            Text(state.message ?: "未来日の集計はまだ接続されていません。", color = TaskChuteColors.SecondaryText)
        }
        ReviewDailyMetricsStatus.ERROR -> Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(state.message ?: "集計データを読み込めませんでした。", color = TaskChuteColors.SecondaryText, textAlign = TextAlign.Center)
            Button(onClick = onRetry) { Text("再試行") }
            ReviewRoutineActivityContent(routineActivityState, onRoutineActivityRetry)
        }
        ReviewDailyMetricsStatus.AUTH_REQUIRED -> ReviewLoadingMessage(state.message ?: "認証状態を確認しています…")
        ReviewDailyMetricsStatus.IDLE,
        ReviewDailyMetricsStatus.LOADING,
        -> ReviewLoadingMessage("日次集計を読み込んでいます")
    }
}

@Composable
private fun ReviewRoutineActivityContent(
    state: ReviewRoutineActivityUiState,
    onRetry: () -> Unit,
) {
    val activity = state.activity
    val countText = when (state.status) {
        ReviewRoutineActivityStatus.PARTIAL,
        ReviewRoutineActivityStatus.COMPLETE,
        -> activity?.createdCount?.let { "$it 件" } ?: "—"
        else -> "—"
    }
    val deletedText = when (state.status) {
        ReviewRoutineActivityStatus.PARTIAL,
        ReviewRoutineActivityStatus.COMPLETE,
        -> activity?.deletedCount?.let { "$it 件" } ?: "—"
        else -> "—"
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ReviewMetricRow("Routine Created", countText)
        ReviewMetricRow("Routine Deleted", deletedText)
        val coverageLabel = when (state.status) {
            ReviewRoutineActivityStatus.UNMEASURED -> "未計測"
            ReviewRoutineActivityStatus.PARTIAL -> "一部計測（開始: ${activity?.coverageStartedAt ?: "日時不明"}）"
            ReviewRoutineActivityStatus.COMPLETE -> "計測済み"
            ReviewRoutineActivityStatus.UNAVAILABLE -> "利用不可（サーバー更新後に再試行してください）"
            ReviewRoutineActivityStatus.ERROR -> state.message ?: "読み込めませんでした。"
            ReviewRoutineActivityStatus.AUTH_REQUIRED -> "認証状態を確認しています…"
            ReviewRoutineActivityStatus.LOADING -> "Routine活動を読み込んでいます"
            ReviewRoutineActivityStatus.IDLE -> "Routine活動は未読込です"
        }
        Text("Routine activity coverage: $coverageLabel", color = TaskChuteColors.SecondaryText)
        if (state.status == ReviewRoutineActivityStatus.ERROR) {
            Button(onClick = onRetry) { Text("Routine活動を再試行") }
        }
    }
}

@Composable
private fun ReviewDailyListHeading(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleMedium,
        color = TaskChuteColors.PrimaryText,
        fontWeight = FontWeight.SemiBold,
    )
}

@Composable
private fun ReviewDailyEmptyListMessage() {
    Text("0件", style = MaterialTheme.typography.bodyMedium, color = TaskChuteColors.SecondaryText)
}

@Composable
private fun ReviewDailyEntryRow(entry: ReviewDailyEntry) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            entry.title,
            style = MaterialTheme.typography.bodyLarge,
            color = TaskChuteColors.PrimaryText,
        )
        entry.completedDurationSeconds?.let { duration ->
            Text(
                "実績 ${formatReviewDuration(duration)}",
                style = MaterialTheme.typography.bodySmall,
                color = TaskChuteColors.SecondaryText,
            )
        }
    }
}

@Composable
private fun ReviewMetricRow(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.titleMedium, color = TaskChuteColors.SecondaryText)
        Text(value, style = MaterialTheme.typography.headlineSmall, color = TaskChuteColors.PrimaryText)
    }
}

@Composable
private fun ReviewLoadingMessage(message: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CircularProgressIndicator()
        Text(message, style = MaterialTheme.typography.bodyMedium, color = TaskChuteColors.SecondaryText, textAlign = TextAlign.Center)
    }
}

@Composable
private fun ReviewCenteredMessage(message: String) {
    Text(
        message,
        style = MaterialTheme.typography.bodyMedium,
        color = TaskChuteColors.SecondaryText,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun ReviewPlaceholderContent(title: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge, color = TaskChuteColors.PrimaryText, textAlign = TextAlign.Center)
        Spacer(Modifier.height(10.dp))
        Text("集計データは次の実装で対応します", style = MaterialTheme.typography.bodyMedium, color = TaskChuteColors.SecondaryText, textAlign = TextAlign.Center)
    }
}

@Composable
private fun ReviewPrimaryTabs(
    selectedView: ReviewPrimaryView,
    onSelect: (ReviewPrimaryView) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(48.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ReviewPrimaryView.entries.forEach { view ->
            val isSelected = view == selectedView
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxSize()
                    .selectable(
                        selected = isSelected,
                        role = Role.Tab,
                        onClick = { onSelect(view) },
                    )
                    .semantics {
                        contentDescription = view.label
                        selected = isSelected
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    view.label,
                    color = if (isSelected) TaskChuteColors.PrimaryText else TaskChuteColors.SecondaryText,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                )
                Spacer(Modifier.height(6.dp))
                Box(
                    Modifier.fillMaxWidth(0.65f).height(2.dp)
                        .background(if (isSelected) TaskChuteColors.AccentBlue else TaskChuteColors.Divider),
                )
            }
        }
    }
}

@Composable
private fun ReviewPeriodControls(
    period: ReviewPeriodState,
    onSelectGranularity: (ReviewPeriodGranularity) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
) {
    var menuExpanded by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().height(48.dp)) {
        Box(Modifier.align(Alignment.CenterStart)) {
            OutlinedButton(
                onClick = { menuExpanded = true },
                modifier = Modifier.width(56.dp).height(40.dp)
                    .semantics { contentDescription = "Review period: ${period.granularity.menuLabel}" },
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp),
            ) {
                Text(
                    period.granularity.selectorLabel,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                )
                Icon(
                    imageVector = TaskChuteIcons.ChevronDown,
                    contentDescription = null,
                    modifier = Modifier.size(12.dp),
                    tint = TaskChuteColors.SecondaryText,
                )
            }
            DropdownMenu(
                expanded = menuExpanded,
                onDismissRequest = { menuExpanded = false },
            ) {
                ReviewPeriodGranularity.entries.forEach { granularity ->
                    DropdownMenuItem(
                        text = { Text(granularity.menuLabel) },
                        onClick = {
                            menuExpanded = false
                            onSelectGranularity(granularity)
                        },
                    )
                }
            }
        }
        Row(
            modifier = Modifier.align(Alignment.Center),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            IconButton(
                onClick = onPrevious,
                enabled = period.anchor != null,
                modifier = Modifier.size(36.dp).semantics { contentDescription = "Previous period" },
            ) {
                Icon(TaskChuteIcons.ChevronLeft, contentDescription = null, modifier = Modifier.size(20.dp), tint = TaskChuteColors.SecondaryText)
            }
            Text(
                reviewPeriodLabel(period),
                modifier = Modifier.width(72.dp).semantics { contentDescription = "Selected period: ${reviewPeriodLabel(period)}" },
                color = TaskChuteColors.PrimaryText,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Clip,
            )
            IconButton(
                onClick = onNext,
                enabled = period.anchor != null,
                modifier = Modifier.size(36.dp).semantics { contentDescription = "Next period" },
            ) {
                Icon(TaskChuteIcons.ChevronRight, contentDescription = null, modifier = Modifier.size(20.dp), tint = TaskChuteColors.SecondaryText)
            }
        }
    }
}

