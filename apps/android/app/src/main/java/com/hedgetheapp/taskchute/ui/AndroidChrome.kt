package com.hedgetheapp.taskchute.ui

import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

enum class AndroidDestination { TODAY, NOTES, SETTINGS }

private val TaskChuteDarkColors = darkColorScheme(
    primary = Color(0xFFD0BCFF),
    onPrimary = Color(0xFF381E72),
    primaryContainer = Color(0xFF4F378B),
    onPrimaryContainer = Color(0xFFEADDFF),
    secondary = Color(0xFFCCC2DC),
    onSecondary = Color(0xFF332D41),
    secondaryContainer = Color(0xFF4A4458),
    onSecondaryContainer = Color(0xFFE8DEF8),
    background = Color(0xFF111318),
    onBackground = Color(0xFFE3E2E9),
    surface = Color(0xFF111318),
    onSurface = Color(0xFFE3E2E9),
    surfaceVariant = Color(0xFF45464F),
    onSurfaceVariant = Color(0xFFC7C5D0),
    outline = Color(0xFF91909A),
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
    NavigationBar {
        NavigationBarItem(
            selected = selected == AndroidDestination.TODAY,
            onClick = onToday,
            icon = { Icon(TaskChuteIcons.Today, contentDescription = null) },
            label = { androidx.compose.material3.Text("今日") },
        )
        NavigationBarItem(
            selected = selected == AndroidDestination.NOTES,
            onClick = onNotes,
            modifier = Modifier.semantics { contentDescription = "ノート一覧" },
            icon = { Icon(TaskChuteIcons.Notes, contentDescription = null) },
            label = { androidx.compose.material3.Text("ノート") },
        )
        NavigationBarItem(
            selected = selected == AndroidDestination.SETTINGS,
            onClick = onSettings,
            icon = { Icon(TaskChuteIcons.Settings, contentDescription = null) },
            label = { androidx.compose.material3.Text("設定") },
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
    val ChevronLeft: ImageVector = ImageVector.Builder("ChevronLeft", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(15f, 5f); lineTo(8f, 12f); lineTo(15f, 19f); lineTo(17f, 17f); lineTo(12f, 12f); lineTo(17f, 7f); close() }.build()
    val ChevronRight: ImageVector = ImageVector.Builder("ChevronRight", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(9f, 5f); lineTo(16f, 12f); lineTo(9f, 19f); lineTo(7f, 17f); lineTo(12f, 12f); lineTo(7f, 7f); close() }.build()
    val ChevronDown: ImageVector = ImageVector.Builder("ChevronDown", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(5f, 8f); lineTo(12f, 15f); lineTo(19f, 8f); lineTo(17f, 6f); lineTo(12f, 11f); lineTo(7f, 6f); close() }.build()
    val Edit: ImageVector = ImageVector.Builder("Edit", 24.dp, 24.dp, 24f, 24f)
        .path(fill = SolidColor(Color.White)) { moveTo(4f, 17.5f); lineTo(4f, 20f); lineTo(6.5f, 20f); lineTo(18.5f, 8f); lineTo(16f, 5.5f); close(); moveTo(14.5f, 7f); lineTo(17f, 9.5f); close() }.build()
}
