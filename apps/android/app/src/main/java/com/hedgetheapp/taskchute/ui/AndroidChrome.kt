package com.hedgetheapp.taskchute.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hedgetheapp.taskchute.R

enum class AndroidDestination { TODAY, NOTES, SETTINGS }

object TaskChuteColors {
    val Background = Color(0xFF191919)
    val NotesBackground = Color(0xFF171717)
    val Surface = Color(0xFF202020)
    val SurfaceElevated = Color(0xFF232323)
    val Control = Color(0xFF252525)
    val Divider = Color(0xFF343434)
    val PrimaryText = Color(0xFFF1F1EF)
    val SecondaryText = Color(0xFFA3A3A0)
    val AccentBlue = Color(0xFF52A3FF)
    val AccentContainer = Color(0xFF1F3B57)
    val RunningSurface = Color(0xFF1E2A33)
    val RunningControl = Color(0xFF25394A)
    val TaskActionBorder = Color(0xFF4A4A45)
    val SelectionBorder = Color(0xFF7F7F7A)
    val CompletedControl = Color(0xFF1F2D26)
    val CompletedIcon = Color(0xFF7BCF9B)
}

private val TaskChuteDarkColors = darkColorScheme(
    primary = TaskChuteColors.AccentBlue,
    onPrimary = TaskChuteColors.Background,
    primaryContainer = TaskChuteColors.AccentContainer,
    onPrimaryContainer = TaskChuteColors.PrimaryText,
    secondary = TaskChuteColors.SecondaryText,
    onSecondary = TaskChuteColors.Background,
    secondaryContainer = TaskChuteColors.Control,
    onSecondaryContainer = TaskChuteColors.PrimaryText,
    background = TaskChuteColors.Background,
    onBackground = TaskChuteColors.PrimaryText,
    surface = TaskChuteColors.Surface,
    onSurface = TaskChuteColors.PrimaryText,
    surfaceVariant = TaskChuteColors.SurfaceElevated,
    onSurfaceVariant = TaskChuteColors.SecondaryText,
    outline = TaskChuteColors.Divider,
)

@Composable
fun TaskChuteTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = TaskChuteDarkColors, content = content)
}

@Composable
fun AndroidNavigationBar(
    selected: AndroidDestination,
    onToday: () -> Unit,
    onNotes: () -> Unit,
    onSettings: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .background(TaskChuteColors.Background),
    ) {
        Row(modifier = Modifier.fillMaxWidth().height(56.dp)) {
            AndroidNavigationItem(
                selected = selected == AndroidDestination.TODAY,
                label = "今日",
                iconRes = R.drawable.android_footer_task_alt,
                iconWidth = 20.dp,
                iconHeight = 20.dp,
                onClick = onToday,
                description = "今日",
                modifier = Modifier.weight(1f),
            )
            AndroidNavigationItem(
                selected = selected == AndroidDestination.NOTES,
                label = "ノート",
                iconRes = R.drawable.android_footer_description,
                iconWidth = 16.dp,
                iconHeight = 20.dp,
                onClick = onNotes,
                description = "ノート一覧",
                modifier = Modifier.weight(1f),
            )
            AndroidNavigationItem(
                selected = selected == AndroidDestination.SETTINGS,
                label = "設定",
                iconRes = R.drawable.android_footer_settings,
                iconWidth = 20.dp,
                iconHeight = 20.dp,
                onClick = onSettings,
                description = "設定",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun AndroidNavigationItem(
    selected: Boolean,
    label: String,
    iconRes: Int,
    iconWidth: Dp,
    iconHeight: Dp,
    onClick: () -> Unit,
    description: String,
    modifier: Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.TopCenter,
    ) {
        Box(
            modifier = Modifier
                .width(82.dp)
                .height(36.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(if (selected) Color(0xFF2F2F2D) else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                painter = painterResource(iconRes),
                contentDescription = null,
                modifier = Modifier.height(iconHeight).width(iconWidth),
                tint = if (selected) TaskChuteColors.PrimaryText else TaskChuteColors.SecondaryText,
            )
        }
        Text(
            label,
            modifier = Modifier.align(Alignment.BottomCenter),
            color = if (selected) TaskChuteColors.PrimaryText else TaskChuteColors.SecondaryText,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            lineHeight = 17.sp,
        )
    }
}

@Composable
fun ChromeIcon(icon: ImageVector, description: String, modifier: Modifier = Modifier) {
    Icon(icon, contentDescription = description, modifier = modifier.semantics { contentDescription = description })
}

object TaskChuteIcons {
    val Today: ImageVector = ImageVector.Builder("Today", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) {
            moveTo(3f, 10.5f); lineTo(12f, 3f); lineTo(21f, 10.5f); lineTo(21f, 21f); lineTo(14.5f, 21f)
            lineTo(14.5f, 14f); lineTo(9.5f, 14f); lineTo(9.5f, 21f); lineTo(3f, 21f); close()
        }.build()
    val Notes: ImageVector = ImageVector.Builder("Notes", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) {
            moveTo(5f, 3f); lineTo(19f, 3f); lineTo(19f, 21f); lineTo(5f, 21f); close()
            moveTo(8f, 7f); lineTo(16f, 7f); lineTo(16f, 8.5f); lineTo(8f, 8.5f); close()
            moveTo(8f, 11f); lineTo(16f, 11f); lineTo(16f, 12.5f); lineTo(8f, 12.5f); close()
            moveTo(8f, 15f); lineTo(13f, 15f); lineTo(13f, 16.5f); lineTo(8f, 16.5f); close()
        }.build()
    val Settings: ImageVector = ImageVector.Builder("Settings", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) {
            moveTo(10f, 2f); lineTo(14f, 2f); lineTo(14.5f, 5f); lineTo(17f, 6.5f); lineTo(20f, 5.5f); lineTo(22f, 9f)
            lineTo(19.5f, 11f); lineTo(19.5f, 14f); lineTo(22f, 16f); lineTo(20f, 19.5f); lineTo(17f, 18.5f); lineTo(14.5f, 20f)
            lineTo(14f, 23f); lineTo(10f, 23f); lineTo(9.5f, 20f); lineTo(7f, 18.5f); lineTo(4f, 19.5f); lineTo(2f, 16f)
            lineTo(4.5f, 14f); lineTo(4.5f, 11f); lineTo(2f, 9f); lineTo(4f, 5.5f); lineTo(7f, 6.5f); lineTo(9.5f, 5f); close()
            moveTo(12f, 9f); moveTo(12f, 9f); // center is intentionally open
        }.build()
    val Play: ImageVector = ImageVector.Builder("Play", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(8f, 5f); lineTo(19f, 12f); lineTo(8f, 19f); close() }.build()
    val Complete: ImageVector = ImageVector.Builder("Complete", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(6f, 6f); lineTo(18f, 6f); lineTo(18f, 18f); lineTo(6f, 18f); close() }.build()
    val Check: ImageVector = ImageVector.Builder("Check", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(9.5f, 17.5f); lineTo(4.5f, 12.5f); lineTo(6.5f, 10.5f); lineTo(9.5f, 13.5f); lineTo(17.5f, 5.5f); lineTo(19.5f, 7.5f); close() }.build()
    val More: ImageVector = ImageVector.Builder("More", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(5f, 10f); lineTo(7f, 10f); lineTo(7f, 14f); lineTo(5f, 14f); close(); moveTo(11f, 10f); lineTo(13f, 10f); lineTo(13f, 14f); lineTo(11f, 14f); close(); moveTo(17f, 10f); lineTo(19f, 10f); lineTo(19f, 14f); lineTo(17f, 14f); close() }.build()
    val Add: ImageVector = ImageVector.Builder("Add", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) {
            moveTo(11f, 3f); lineTo(13f, 3f); lineTo(13f, 11f); lineTo(21f, 11f); lineTo(21f, 13f)
            lineTo(13f, 13f); lineTo(13f, 21f); lineTo(11f, 21f); lineTo(11f, 13f); lineTo(3f, 13f); lineTo(3f, 11f); lineTo(11f, 11f); close()
        }.build()
    val Calendar: ImageVector = ImageVector.Builder("Calendar", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) {
            moveTo(5f, 4f); lineTo(7f, 4f); lineTo(7f, 2f); lineTo(9f, 2f); lineTo(9f, 4f)
            lineTo(15f, 4f); lineTo(15f, 2f); lineTo(17f, 2f); lineTo(17f, 4f); lineTo(19f, 4f)
            lineTo(19f, 20f); lineTo(5f, 20f); close()
            moveTo(7f, 8f); lineTo(17f, 8f); lineTo(17f, 10f); lineTo(7f, 10f); close()
        }.build()
    val ChevronLeft: ImageVector = ImageVector.Builder("ChevronLeft", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(15f, 5f); lineTo(8f, 12f); lineTo(15f, 19f); lineTo(17f, 17f); lineTo(12f, 12f); lineTo(17f, 7f); close() }.build()
    val ChevronRight: ImageVector = ImageVector.Builder("ChevronRight", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(9f, 5f); lineTo(16f, 12f); lineTo(9f, 19f); lineTo(7f, 17f); lineTo(12f, 12f); lineTo(7f, 7f); close() }.build()
    val ChevronDown: ImageVector = ImageVector.Builder("ChevronDown", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(5f, 8f); lineTo(12f, 15f); lineTo(19f, 8f); lineTo(17f, 6f); lineTo(12f, 11f); lineTo(7f, 6f); close() }.build()
    val Edit: ImageVector = ImageVector.Builder("Edit", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(4f, 17.5f); lineTo(4f, 20f); lineTo(6.5f, 20f); lineTo(18.5f, 8f); lineTo(16f, 5.5f); close(); moveTo(14.5f, 7f); lineTo(17f, 9.5f); close() }.build()
}
