package com.hedgetheapp.taskchute.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.size
import androidx.compose.material3.FloatingActionButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp

@Composable
internal fun MovableAddFab(
    modifier: Modifier = Modifier,
    contentDescription: String,
    onClick: () -> Unit,
    onDrag: (Offset) -> Unit,
    containerColor: Color = Color(0xFFECECEC),
    contentColor: Color = TaskChuteColors.NotesBackground,
    iconSize: Dp = 24.dp,
) {
    FloatingActionButton(
        onClick = onClick,
        modifier = modifier
            .pointerInput(Unit) { detectMovableAddFabDrag(onDrag) }
            .semantics { this.contentDescription = contentDescription },
        shape = androidx.compose.foundation.shape.CircleShape,
        containerColor = containerColor,
        contentColor = contentColor,
    ) {
        ChromeIcon(TaskChuteIcons.Add, contentDescription, Modifier.size(iconSize))
    }
}

private suspend fun PointerInputScope.detectMovableAddFabDrag(onDrag: (Offset) -> Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        var last = down.position
        var dragging = false
        while (true) {
            val event = awaitPointerEvent()
            val change = event.changes.firstOrNull { it.id == down.id } ?: continue
            val delta = change.position - last
            last = change.position
            if (!dragging && (change.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                dragging = true
            }
            if (dragging) {
                change.consume()
                onDrag(delta)
            }
            if (change.changedToUpIgnoreConsumed() || !change.pressed) break
        }
    }
}
