package com.hedgetheapp.taskchute.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedgetheapp.taskchute.R
import java.time.LocalDate

/** Shared Today/Daily date header so both surfaces keep the same visual affordance. */
@Composable
fun TaskChuteDateNavigator(
    logicalDate: String?,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onOpenDatePicker: () -> Unit,
) {
    val enabled = logicalDate != null
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        IconButton(
            onClick = onPrevious,
            enabled = enabled,
            modifier = Modifier.size(44.dp).clip(CircleShape).background(TaskChuteColors.Control)
                .semantics { contentDescription = "前の日" },
        ) {
            Icon(painterResource(R.drawable.today_header_chevron_left), "前の日", Modifier.size(28.dp))
        }
        Row(
            modifier = Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(22.dp))
                .background(TaskChuteColors.SurfaceElevated)
                .clickable(enabled = enabled, onClick = onOpenDatePicker)
                .semantics { contentDescription = "表示日付を選択" }
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(painterResource(R.drawable.today_header_calendar_month), "日付", Modifier.size(28.dp))
            Spacer(Modifier.width(8.dp))
            Text(
                formatTaskChuteDateLabel(logicalDate),
                style = MaterialTheme.typography.titleMedium.copy(
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                ),
                color = TaskChuteColors.PrimaryText,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        IconButton(
            onClick = onNext,
            enabled = enabled,
            modifier = Modifier.size(44.dp).clip(CircleShape).background(TaskChuteColors.Control)
                .semantics { contentDescription = "次の日" },
        ) {
            Icon(painterResource(R.drawable.today_header_chevron_right), "次の日", Modifier.size(28.dp))
        }
    }
}

internal fun formatTaskChuteDateLabel(logicalDate: String?): String {
    if (logicalDate == null) return "---- -- --"
    val weekday = runCatching {
        val date = LocalDate.parse(logicalDate)
        listOf("月", "火", "水", "木", "金", "土", "日")[date.dayOfWeek.value - 1]
    }.getOrDefault(logicalDate)
    return "$logicalDate ($weekday)"
}
