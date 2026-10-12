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
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
    val anchor: LocalDate,
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
        ReviewPeriodGranularity.MONTHLY -> state.period.anchor.withDayOfMonth(1)
        ReviewPeriodGranularity.YEARLY -> state.period.anchor.withDayOfYear(1)
    }
    return state.copy(period = ReviewPeriodState(granularity, anchor))
}

internal fun stepReviewPeriod(state: ReviewScreenState, amount: Long): ReviewScreenState {
    val anchor = when (state.period.granularity) {
        ReviewPeriodGranularity.DAILY -> state.period.anchor.plusDays(amount)
        ReviewPeriodGranularity.MONTHLY -> state.period.anchor.plusMonths(amount)
        ReviewPeriodGranularity.YEARLY -> state.period.anchor.plusYears(amount)
    }
    return state.copy(period = state.period.copy(anchor = anchor))
}

internal fun reviewPeriodLabel(period: ReviewPeriodState): String = when (period.granularity) {
    ReviewPeriodGranularity.DAILY -> period.anchor.format(DateTimeFormatter.ofPattern("yyyy/MM/dd"))
    ReviewPeriodGranularity.MONTHLY -> period.anchor.format(DateTimeFormatter.ofPattern("yyyy/MM"))
    ReviewPeriodGranularity.YEARLY -> period.anchor.format(DateTimeFormatter.ofPattern("yyyy"))
}

@Composable
fun ReviewScreen(
    onNavigateToday: () -> Unit,
    onNavigateNotes: () -> Unit,
    onNavigateDaily: () -> Unit,
    onNavigateSettings: () -> Unit,
    initialAnchor: LocalDate = LocalDate.now(),
) {
    var state by remember(initialAnchor) {
        mutableStateOf(
            ReviewScreenState(
                selectedView = ReviewPrimaryView.DATE,
                period = ReviewPeriodState(ReviewPeriodGranularity.DAILY, initialAnchor),
            ),
        )
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
                onSelect = { state = selectReviewView(state, it) },
            )
            ReviewPeriodControls(
                period = state.period,
                onSelectGranularity = { state = selectReviewGranularity(state, it) },
                onPrevious = { state = stepReviewPeriod(state, -1) },
                onNext = { state = stepReviewPeriod(state, 1) },
            )
            Surface(
                modifier = Modifier.fillMaxWidth().weight(1f),
                shape = RoundedCornerShape(18.dp),
                color = TaskChuteColors.Surface,
            ) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        state.selectedView.contentTitle,
                        style = MaterialTheme.typography.titleLarge,
                        color = TaskChuteColors.PrimaryText,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "集計データは次の実装で対応します",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TaskChuteColors.SecondaryText,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
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
                modifier = Modifier.size(36.dp).semantics { contentDescription = "Next period" },
            ) {
                Icon(TaskChuteIcons.ChevronRight, contentDescription = null, modifier = Modifier.size(20.dp), tint = TaskChuteColors.SecondaryText)
            }
        }
    }
}
