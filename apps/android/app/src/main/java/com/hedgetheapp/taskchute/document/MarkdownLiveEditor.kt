package com.hedgetheapp.taskchute.document

import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import com.hedgetheapp.taskchute.R
import com.hedgetheapp.taskchute.ui.TaskChuteColors
import android.graphics.Paint as AndroidPaint
import kotlin.math.roundToInt

internal val LocalMarkdownEditorImeInsets = staticCompositionLocalOf<WindowInsets?> { null }

data class MarkdownSelection(val start: Int, val end: Int) {
    fun normalized(length: Int): MarkdownSelection {
        val left = start.coerceIn(0, length)
        val right = end.coerceIn(0, length)
        return if (left <= right) this.copy(start = left, end = right) else this.copy(start = right, end = left)
    }

    val collapsed: Boolean get() = start == end
}

data class MarkdownEditResult(
    val text: String,
    val selection: MarkdownSelection,
    val mapOffset: (Int) -> Int = { it },
)

object MarkdownEditCommands {
    fun bold(source: String, selection: MarkdownSelection): MarkdownEditResult {
        val range = selection.normalized(source.length)
        if (range.collapsed) {
            val text = source.substring(0, range.start) + "****" + source.substring(range.start)
            return MarkdownEditResult(text, MarkdownSelection(range.start + 2, range.start + 2)) { offset ->
                if (offset <= range.start) offset else offset + 4
            }
        }
        val alreadyWrapped = range.start >= 2 && range.end + 2 <= source.length &&
            source.substring(range.start - 2, range.start) == "**" &&
            source.substring(range.end, range.end + 2) == "**"
        if (alreadyWrapped) {
            val text = source.removeRange(range.end, range.end + 2).removeRange(range.start - 2, range.start)
            return MarkdownEditResult(text, MarkdownSelection(range.start - 2, range.end - 2)) { offset ->
                when {
                    offset <= range.start - 2 -> offset
                    offset >= range.end + 2 -> offset - 4
                    else -> (offset - 2).coerceAtLeast(range.start - 2)
                }
            }
        }
        val text = source.substring(0, range.start) + "**" + source.substring(range.start, range.end) + "**" + source.substring(range.end)
        return MarkdownEditResult(text, MarkdownSelection(range.start + 2, range.end + 2)) { offset ->
            when {
                offset <= range.start -> offset
                offset >= range.end -> offset + 4
                else -> offset + 2
            }
        }
    }

    fun headingLevel(source: String, selection: MarkdownSelection, level: Int): MarkdownEditResult {
        require(level in 1..5) { "Markdown heading picker supports levels H1 through H5" }
        return editLines(source, selection, prefix = { line -> atxHeadingPrefix.containsMatchIn(line) }) { line, _ ->
            val existing = atxHeadingPrefix.find(line)
            if (existing == null) {
                val newPrefix = "#".repeat(level) + " "
                LineEdit(newPrefix + line, map = { offset -> offset + newPrefix.length })
            } else {
                val oldHashCount = existing.groupValues[1].length
                val newPrefix = "#".repeat(level) + existing.groupValues[2]
                val body = line.removeRange(existing.range)
                LineEdit(newPrefix + body, map = { offset ->
                    if (offset < oldHashCount) offset.coerceAtMost(level)
                    else offset + newPrefix.length - existing.value.length
                })
            }
        }
    }

    private val atxHeadingPrefix = Regex("^(#{1,6})(\\s+)")

    fun bullet(source: String, selection: MarkdownSelection): MarkdownEditResult = editLines(source, selection, prefix = { line -> line.startsWith("- ") }) { line, allHavePrefix ->
        if (allHavePrefix) {
            LineEdit(line.removePrefix("- "), map = { offset -> (offset - 2).coerceAtLeast(0) })
        } else if (line.startsWith("- ")) {
            LineEdit(line, map = { offset -> offset })
        } else {
            LineEdit("- $line", map = { offset -> offset + 2 })
        }
    }

    fun checkbox(source: String, selection: MarkdownSelection): MarkdownEditResult = editLines(source, selection, prefix = { line -> line.startsWith("- [") }) { line, allHavePrefix ->
        val task = Regex("^- \\[([ xX])\\] ").find(line)
        if (allHavePrefix) {
            if (task != null) {
                LineEdit(line.removeRange(task.range), map = { offset -> (offset - task.value.length).coerceAtLeast(0) })
            } else {
                LineEdit(line.removePrefix("- "), map = { offset -> (offset - 2).coerceAtLeast(0) })
            }
        } else if (task != null) {
            LineEdit(line, map = { offset -> offset })
        } else if (line.startsWith("- ")) {
            LineEdit("- [ ] ${line.removePrefix("- ")}", map = { offset ->
                if (offset <= 2) offset + 4 else offset + 4
            })
        } else {
            LineEdit("- [ ] $line", map = { offset -> offset + 6 })
        }
    }

    fun quote(source: String, selection: MarkdownSelection): MarkdownEditResult = editLines(source, selection, prefix = { line -> line.startsWith("> ") }) { line, allHavePrefix ->
        if (allHavePrefix) {
            LineEdit(line.removePrefix("> "), map = { offset -> (offset - 2).coerceAtLeast(0) })
        } else if (line.startsWith("> ")) {
            LineEdit(line, map = { offset -> offset })
        } else {
            LineEdit("> $line", map = { offset -> offset + 2 })
        }
    }

    fun link(source: String, selection: MarkdownSelection): MarkdownEditResult {
        val range = selection.normalized(source.length)
        val label = source.substring(range.start, range.end)
        val text = if (range.collapsed) {
            source.substring(0, range.start) + "[](https://)" + source.substring(range.start)
        } else {
            source.substring(0, range.start) + "[$label](https://)" + source.substring(range.end)
        }
        val urlStart = if (range.collapsed) range.start + 3 else range.start + label.length + 3
        val urlEnd = urlStart + "https://".length
        return MarkdownEditResult(text, MarkdownSelection(urlStart, urlEnd)) { offset ->
            when {
                offset <= range.start -> offset
                range.collapsed -> offset + "[](https://)".length
                offset >= range.end -> offset + 4 + "https://".length
                else -> range.start + 1 + (offset - range.start)
            }
        }
    }

    fun horizontalRule(source: String, selection: MarkdownSelection): MarkdownEditResult {
        val lines = sourceLines(source)
        val caret = selection.end.coerceIn(0, source.length)
        val lineIndex = lines.indexOfLast { caret >= it.start }.coerceAtLeast(0)
        val line = lines[lineIndex]
        val needsTrailingSeparator = line.text.isNotEmpty() || line.lineEnding.isNotEmpty() ||
            (line.start == source.length && source.endsWith('\n'))
        val separator = line.lineEnding.takeIf { it.isNotEmpty() }
            ?: lines.take(lineIndex).lastOrNull { it.lineEnding.isNotEmpty() }?.lineEnding
            ?: "\n"
        val inserted = "---" + if (needsTrailingSeparator) separator else ""
        val text = source.substring(0, line.start) + inserted + source.substring(line.start)
        fun mapOffset(offset: Int): Int = if (offset >= line.start) offset + inserted.length else offset
        return MarkdownEditResult(
            text = text,
            selection = MarkdownSelection(mapOffset(selection.start), mapOffset(selection.end)),
            mapOffset = ::mapOffset,
        )
    }

    fun indent(source: String, selection: MarkdownSelection): MarkdownEditResult = editSelectedLines(source, selection) { line, _ ->
        val unit = listIndentUnit(line)
        LineEdit(" ".repeat(unit) + line, map = { offset -> offset + unit })
    }

    fun outdent(source: String, selection: MarkdownSelection): MarkdownEditResult = editSelectedLines(source, selection) { line, _ ->
        val unit = listIndentUnit(line)
        val leadingSpaces = line.takeWhile { it == ' ' }.length
        val removed = minOf(unit, leadingSpaces)
        if (removed == 0) {
            LineEdit(line, map = { offset -> offset })
        } else {
            LineEdit(line.drop(removed), map = { offset -> (offset - removed).coerceAtLeast(0) })
        }
    }

    fun orderedList(source: String, selection: MarkdownSelection): MarkdownEditResult {
        val range = selection.normalized(source.length)
        val lines = sourceLines(source)
        val touched = touchedLineIndexes(lines, range)
        val singleCaretLine = if (range.collapsed) touched.singleOrNull() else null
        val selectedOrderedLine = singleCaretLine?.let { index ->
            val line = lines[index].text
            orderedListPrefix.find(line.substring(leadingWhitespaceLength(line)))
        }
        if (selectedOrderedLine != null) {
            val line = lines[singleCaretLine]
            val leading = leadingWhitespaceLength(line.text)
            val contentStart = leading + selectedOrderedLine.range.last + 1
            val content = line.text.substring(contentStart)
            val preserveTask = taskCheckboxPrefix.containsMatchIn(content)
            val newPrefix = if (preserveTask) line.text.substring(0, leading) + "- " else line.text.substring(0, leading)
            val edit = LineEdit(newPrefix + content, map = { offset ->
                if (offset <= contentStart) newPrefix.length else newPrefix.length + offset - contentStart
            })
            return editSelectedLines(source, selection) { currentLine, index ->
                if (index == singleCaretLine) edit else LineEdit(currentLine, map = { it })
            }
        }

        var number = 0
        return editSelectedLines(source, selection) { line, index ->
            if (index !in touched) {
                LineEdit(line, map = { it })
            } else {
                number += 1
                val leading = leadingWhitespaceLength(line)
                val bodyStart = listPrefixEnd(line, leading)
                val body = line.substring(bodyStart)
                val prefix = line.substring(0, leading) + "$number. "
                LineEdit(prefix + body, map = { offset ->
                    if (offset <= bodyStart) prefix.length else prefix.length + offset - bodyStart
                })
            }
        }
    }

    internal fun moveLine(source: String, selection: MarkdownSelection, direction: MarkdownLineMove): MarkdownEditResult {
        val lines = sourceLines(source)
        val touched = touchedLineIndexes(lines, selection.normalized(source.length)).sorted()
        val first = touched.firstOrNull() ?: return MarkdownEditResult(source, selection)
        val last = touched.last()
        val adjacent = when (direction) {
            MarkdownLineMove.UP -> first - 1
            MarkdownLineMove.DOWN -> last + 1
        }
        if (adjacent !in lines.indices) return MarkdownEditResult(source, selection)

        val order = lines.indices.toMutableList()
        when (direction) {
            MarkdownLineMove.UP -> {
                val block = order.subList(first, last + 1).toList()
                order.subList(first - 1, last + 1).clear()
                order.addAll(first - 1, block)
                order.add(last, first - 1)
            }
            MarkdownLineMove.DOWN -> {
                val after = order[last + 1]
                order.removeAt(last + 1)
                order.add(first, after)
            }
        }

        val outputStarts = IntArray(lines.size)
        val oldToNew = IntArray(lines.size)
        val text = buildString {
            order.forEachIndexed { outputIndex, originalIndex ->
                outputStarts[outputIndex] = length
                oldToNew[originalIndex] = outputIndex
                append(lines[originalIndex].text)
                append(lines[outputIndex].lineEnding)
            }
        }
        // A trailing blank line can move to the document end and change whether the raw source
        // ends in a newline. Preserve the canonical source's terminal-newline state in that case.
        if (text.endsWith('\n') != source.endsWith('\n')) return MarkdownEditResult(source, selection)

        fun mapOffset(offset: Int): Int {
            val bounded = offset.coerceIn(0, source.length)
            val originalIndex = lines.indexOfLast { bounded >= it.start }.coerceAtLeast(0)
            val originalLine = lines[originalIndex]
            val local = (bounded - originalLine.start).coerceIn(0, originalLine.text.length)
            return outputStarts[oldToNew[originalIndex]] + local
        }
        return MarkdownEditResult(
            text,
            MarkdownSelection(mapOffset(selection.start), mapOffset(selection.end)),
            ::mapOffset,
        )
    }

    fun underline(source: String, selection: MarkdownSelection): MarkdownEditResult {
        val range = selection.normalized(source.length)
        val open = "<u>"
        val close = "</u>"
        if (range.collapsed) {
            if (recognizedUnderlineRanges(source).any { range.start in it.first..it.second }) {
                return MarkdownEditResult(source, selection)
            }
            val text = source.substring(0, range.start) + open + close + source.substring(range.start)
            fun mapOffset(offset: Int): Int = when {
                offset < range.start -> offset
                offset == range.start -> range.start + open.length
                else -> offset + open.length + close.length
            }
            val caret = range.start + open.length
            return MarkdownEditResult(text, MarkdownSelection(caret, caret), ::mapOffset)
        }

        if (source.substring(range.start, range.end).contains('\n')) return MarkdownEditResult(source, selection)

        val existingUnderline = recognizedUnderlineRanges(source).firstOrNull { (contentStart, contentEnd) ->
            contentStart == range.start && contentEnd == range.end
        }
        if (existingUnderline != null) {
            val (contentStart, contentEnd) = existingUnderline
            val text = source.removeRange(contentEnd, contentEnd + close.length).removeRange(contentStart - open.length, contentStart)
            fun mapOffset(offset: Int): Int = when {
                offset < contentStart - open.length -> offset
                offset <= contentStart -> contentStart - open.length
                offset >= contentEnd + close.length -> offset - open.length - close.length
                else -> (offset - open.length).coerceIn(contentStart - open.length, contentEnd - open.length)
            }
            val unwrappedStart = contentStart - open.length
            val unwrappedEnd = contentEnd - open.length
            return MarkdownEditResult(
                text,
                if (selection.start > selection.end) MarkdownSelection(unwrappedEnd, unwrappedStart)
                else MarkdownSelection(unwrappedStart, unwrappedEnd),
                ::mapOffset,
            )
        }

        val selectedText = source.substring(range.start, range.end)
        if (selectedText.contains(open) || selectedText.contains(close) ||
            recognizedUnderlineRanges(source).any { (contentStart, contentEnd) -> range.start in contentStart..contentEnd || range.end in contentStart..contentEnd }
        ) {
            return MarkdownEditResult(source, selection)
        }
        val text = source.substring(0, range.start) + open + selectedText + close + source.substring(range.end)
        val selectedStart = range.start + open.length
        val selectedEnd = range.end + open.length
        return MarkdownEditResult(
            text,
            if (selection.start > selection.end) MarkdownSelection(selectedEnd, selectedStart)
            else MarkdownSelection(selectedStart, selectedEnd),
        ) { offset ->
            when {
                offset < range.start -> offset
                offset <= range.end -> offset + open.length
                else -> offset + open.length + close.length
            }
        }
    }

    private fun editSelectedLines(
        source: String,
        selection: MarkdownSelection,
        transform: (line: String, lineIndex: Int) -> LineEdit,
    ): MarkdownEditResult {
        val lines = sourceLines(source)
        val touched = touchedLineIndexes(lines, selection.normalized(source.length))
        val edits = lines.mapIndexed { index, line ->
            if (index in touched) transform(line.text, index) else LineEdit(line.text, map = { it })
        }
        return buildLineEditResult(source, selection, lines, edits)
    }

    private fun listIndentUnit(line: String): Int {
        val leading = leadingWhitespaceLength(line)
        val body = line.substring(leading)
        val ordered = orderedListPrefix.find(body)
        if (ordered != null) return ordered.groupValues[1].length + 1
        if (bulletListPrefix.containsMatchIn(body)) return 2
        return 2
    }

    private fun leadingWhitespaceLength(line: String): Int = line.takeWhile { it == ' ' || it == '\t' }.length

    private fun listPrefixEnd(line: String, leadingLength: Int): Int {
        val body = line.substring(leadingLength)
        val prefix = orderedListPrefix.find(body) ?: bulletListPrefix.find(body)
        return leadingLength + (prefix?.range?.last?.plus(1) ?: 0)
    }

    private val orderedListPrefix = Regex("^(\\d{1,9}[.)])[ \\t]+")
    private val bulletListPrefix = Regex("^[-+*][ \\t]+")
    private val taskCheckboxPrefix = Regex("^\\[([ xX])\\][ \\t]+")

    internal fun recognizedUnderlineRanges(source: String): List<Pair<Int, Int>> {
        val open = "<u>"
        val close = "</u>"
        val ranges = mutableListOf<Pair<Int, Int>>()
        var cursor = 0
        while (cursor < source.length) {
            val nextOpen = nextUnescapedMarker(source, open, cursor)
            val nextClose = nextUnescapedMarker(source, close, cursor)
            if (nextOpen < 0 && nextClose < 0) break
            if (nextClose >= 0 && (nextOpen < 0 || nextClose < nextOpen)) return emptyList()
            val closeIndex = nextUnescapedMarker(source, close, nextOpen + open.length)
            val nestedOpen = nextUnescapedMarker(source, open, nextOpen + open.length)
            if (closeIndex < 0 || (nestedOpen >= 0 && nestedOpen < closeIndex)) return emptyList()
            ranges += (nextOpen + open.length) to closeIndex
            cursor = closeIndex + close.length
        }
        return ranges
    }

    private fun nextUnescapedMarker(source: String, marker: String, fromIndex: Int): Int {
        var index = source.indexOf(marker, fromIndex)
        while (index >= 0) {
            var precedingBackslashes = 0
            var preceding = index - 1
            while (preceding >= 0 && source[preceding] == '\\') {
                precedingBackslashes += 1
                preceding -= 1
            }
            if (precedingBackslashes % 2 == 0) return index
            index = source.indexOf(marker, index + marker.length)
        }
        return -1
    }

    private fun editLines(
        source: String,
        selection: MarkdownSelection,
        prefix: (String) -> Boolean,
        transform: (line: String, allHavePrefix: Boolean) -> LineEdit,
    ): MarkdownEditResult {
        val range = selection.normalized(source.length)
        val lines = sourceLines(source)
        val touched = touchedLineIndexes(lines, range)
        val allHavePrefix = touched.all { prefix(lines[it].text) }
        val edits = lines.mapIndexed { index, line ->
            if (index in touched) transform(line.text, allHavePrefix) else LineEdit(line.text, map = { offset -> offset })
        }
        return buildLineEditResult(source, selection, lines, edits)
    }

    private fun buildLineEditResult(
        source: String,
        selection: MarkdownSelection,
        lines: List<SourceLine>,
        edits: List<LineEdit>,
    ): MarkdownEditResult {
        val text = buildString {
            edits.forEachIndexed { index, edit ->
                append(edit.text)
                append(lines[index].lineEnding)
            }
        }
        val starts = IntArray(lines.size)
        var outputStart = 0
        edits.forEachIndexed { index, edit ->
            starts[index] = outputStart
            outputStart += edit.text.length + lines[index].lineEnding.length
        }
        fun mapPosition(position: Int): Int {
            val bounded = position.coerceIn(0, source.length)
            val lineIndex = lines.indexOfLast { bounded >= it.start }.coerceAtLeast(0)
            val line = lines[lineIndex]
            val local = (bounded - line.start).coerceIn(0, line.text.length)
            return starts[lineIndex] + edits[lineIndex].map(local)
        }
        return MarkdownEditResult(
            text,
            MarkdownSelection(mapPosition(selection.start), mapPosition(selection.end)),
            ::mapPosition,
        )
    }

}

internal enum class MarkdownToolbarActionId {
    BOLD,
    HEADING_1,
    HEADING_2,
    HEADING_3,
    HEADING_4,
    HEADING_5,
    BULLET,
    CHECKBOX,
    QUOTE,
    LINK,
    HORIZONTAL_RULE,
    INDENT,
    OUTDENT,
    ORDERED_LIST,
    MOVE_LINE_UP,
    MOVE_LINE_DOWN,
    UNDERLINE,
}

internal enum class MarkdownLineMove { UP, DOWN }

internal enum class MarkdownHeadingLevel(
    val level: Int,
    val action: MarkdownToolbarActionId,
    val accessibilityLabel: String,
) {
    H1(1, MarkdownToolbarActionId.HEADING_1, "H1 見出し1"),
    H2(2, MarkdownToolbarActionId.HEADING_2, "H2 見出し2"),
    H3(3, MarkdownToolbarActionId.HEADING_3, "H3 見出し3"),
    H4(4, MarkdownToolbarActionId.HEADING_4, "H4 見出し4"),
    H5(5, MarkdownToolbarActionId.HEADING_5, "H5 見出し5"),
}

internal data class MarkdownHeadingPickerSnapshot(
    val editorSessionKey: Any,
    val canonicalSource: String,
    val value: TextFieldValue,
)

internal fun isMarkdownHeadingPickerSnapshotCurrent(
    snapshot: MarkdownHeadingPickerSnapshot,
    editorSessionKey: Any,
    canonicalSource: String,
    current: TextFieldValue,
): Boolean = snapshot.editorSessionKey == editorSessionKey &&
    snapshot.canonicalSource == canonicalSource &&
    snapshot.value.text == current.text &&
    snapshot.value.selection == current.selection

internal data class ReversibleMarkdownToolbarEdit(
    val action: MarkdownToolbarActionId,
    val before: TextFieldValue,
    val after: TextFieldValue,
)

internal data class MarkdownToolbarActionResult(
    val value: TextFieldValue,
    val reversibleEdit: ReversibleMarkdownToolbarEdit?,
    val reverted: Boolean,
)

internal fun applyMarkdownToolbarAction(
    current: TextFieldValue,
    action: MarkdownToolbarActionId,
    previousEdit: ReversibleMarkdownToolbarEdit?,
): MarkdownToolbarActionResult {
    val incrementalAction = action in setOf(
        MarkdownToolbarActionId.INDENT,
        MarkdownToolbarActionId.OUTDENT,
        MarkdownToolbarActionId.MOVE_LINE_UP,
        MarkdownToolbarActionId.MOVE_LINE_DOWN,
    )
    if (!incrementalAction && previousEdit?.action == action && current == previousEdit.after) {
        return MarkdownToolbarActionResult(
            value = previousEdit.before,
            reversibleEdit = null,
            reverted = true,
        )
    }

    val range = MarkdownSelection(current.selection.start, current.selection.end)
    val edit = when (action) {
        MarkdownToolbarActionId.BOLD -> MarkdownEditCommands.bold(current.text, range)
        MarkdownToolbarActionId.HEADING_1 -> MarkdownEditCommands.headingLevel(current.text, range, 1)
        MarkdownToolbarActionId.HEADING_2 -> MarkdownEditCommands.headingLevel(current.text, range, 2)
        MarkdownToolbarActionId.HEADING_3 -> MarkdownEditCommands.headingLevel(current.text, range, 3)
        MarkdownToolbarActionId.HEADING_4 -> MarkdownEditCommands.headingLevel(current.text, range, 4)
        MarkdownToolbarActionId.HEADING_5 -> MarkdownEditCommands.headingLevel(current.text, range, 5)
        MarkdownToolbarActionId.BULLET -> MarkdownEditCommands.bullet(current.text, range)
        MarkdownToolbarActionId.CHECKBOX -> MarkdownEditCommands.checkbox(current.text, range)
        MarkdownToolbarActionId.QUOTE -> MarkdownEditCommands.quote(current.text, range)
        MarkdownToolbarActionId.LINK -> MarkdownEditCommands.link(current.text, range)
        MarkdownToolbarActionId.HORIZONTAL_RULE -> MarkdownEditCommands.horizontalRule(current.text, range)
        MarkdownToolbarActionId.INDENT -> MarkdownEditCommands.indent(current.text, range)
        MarkdownToolbarActionId.OUTDENT -> MarkdownEditCommands.outdent(current.text, range)
        MarkdownToolbarActionId.ORDERED_LIST -> MarkdownEditCommands.orderedList(current.text, range)
        MarkdownToolbarActionId.MOVE_LINE_UP -> MarkdownEditCommands.moveLine(current.text, range, MarkdownLineMove.UP)
        MarkdownToolbarActionId.MOVE_LINE_DOWN -> MarkdownEditCommands.moveLine(current.text, range, MarkdownLineMove.DOWN)
        MarkdownToolbarActionId.UNDERLINE -> MarkdownEditCommands.underline(current.text, range)
    }
    val composition = current.composition?.let {
        TextRange(edit.mapOffset(it.start), edit.mapOffset(it.end))
    }
    val next = TextFieldValue(
        text = edit.text,
        selection = TextRange(edit.selection.start, edit.selection.end),
        composition = composition,
    )
    val reversibleEdit = if (!incrementalAction && current.composition == null && next.composition == null && next != current) {
        ReversibleMarkdownToolbarEdit(action = action, before = current, after = next)
    } else {
        null
    }
    return MarkdownToolbarActionResult(next, reversibleEdit, reverted = false)
}

private data class LineEdit(val text: String, val map: (Int) -> Int)

private data class SourceLine(val start: Int, val end: Int, val text: String, val lineEnding: String) {
    val hasNewline: Boolean get() = lineEnding.isNotEmpty()
}

private fun sourceLines(source: String): List<SourceLine> {
    if (source.isEmpty()) return listOf(SourceLine(0, 0, "", ""))
    val result = mutableListOf<SourceLine>()
    var start = 0
    while (start <= source.length) {
        val newline = source.indexOf('\n', start)
        if (newline < 0) {
            result += SourceLine(start, source.length, source.substring(start), "")
            break
        }
        val lineEnd = if (newline > start && source[newline - 1] == '\r') newline - 1 else newline
        result += SourceLine(start, lineEnd, source.substring(start, lineEnd), source.substring(lineEnd, newline + 1))
        start = newline + 1
        if (start == source.length) result += SourceLine(start, start, "", "")
    }
    return result
}

internal fun markdownSourceLineStarts(source: String): List<Int> = buildList {
    add(0)
    source.forEachIndexed { index, character ->
        if (character == '\n') add(index + 1)
    }
}

internal fun markdownSourceLineIndexAt(starts: List<Int>, sourceOffset: Int): Int {
    val index = starts.binarySearch(sourceOffset)
    return (if (index >= 0) index else -index - 2).coerceIn(0, starts.lastIndex)
}

private fun touchedLineIndexes(lines: List<SourceLine>, selection: MarkdownSelection): Set<Int> {
    if (lines.isEmpty()) return emptySet()
    val startLine = lines.indexOfLast { selection.start >= it.start }.coerceAtLeast(0)
    val endAnchor = if (selection.end > selection.start) (selection.end - 1).coerceAtLeast(selection.start) else selection.start
    val endLine = lines.indexOfLast { endAnchor >= it.start }.coerceAtLeast(startLine)
    return (startLine..endLine).toSet()
}

internal class MarkdownPreviewTransformation(private val activeSelection: MarkdownSelection?) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val source = text.text
        val lines = sourceLines(source)
        val active = activeSelection?.let { touchedLineIndexes(lines, it.normalized(source.length)) }.orEmpty()
        val builder = PreviewBuilder(source)
        lines.forEachIndexed { index, line ->
            if (index in active) {
                appendTextWithInteractiveLinks(builder, source, line.start, line.end)
            } else {
                appendRenderedLine(builder, source, line)
            }
            if (line.hasNewline) builder.append(line.end, line.end + line.lineEnding.length, line.lineEnding)
        }
        return TransformedText(
            builder.build(),
            object : OffsetMapping {
                override fun originalToTransformed(offset: Int): Int = builder.originalToTransformed(offset)
                override fun transformedToOriginal(offset: Int): Int = builder.transformedToOriginal(offset)
            },
        )
    }
}

private fun appendRenderedLine(builder: PreviewBuilder, source: String, line: SourceLine) {
    val text = line.text
    val thematicBreak = Regex("^ {0,3}(?:(?:\\*\\s*){3,}|(?:-\\s*){3,}|(?:_\\s*){3,})$")
    if (thematicBreak.matches(text)) {
        builder.append(
            line.start,
            line.end,
            "────────────────────────────────",
            SpanStyle(color = TaskChuteColors.SecondaryText, fontSize = 12.sp, letterSpacing = 1.sp),
        )
        return
    }
    val heading = Regex("^(#{1,6})(\\s+)(.*)$").matchEntire(text)
    if (heading != null) {
        val prefixLength = heading.groupValues[1].length + heading.groupValues[2].length
        builder.append(line.start, line.start + prefixLength, "")
        val size = when (heading.groupValues[1].length) {
            1 -> 22.sp
            2 -> 20.sp
            3 -> 18.sp
            else -> 16.sp
        }
        builder.append(line.start + prefixLength, line.end, heading.groupValues[3], SpanStyle(fontWeight = FontWeight.Bold, fontSize = size))
        return
    }
    val quote = Regex("^(>\\s+)(.*)$").matchEntire(text)
    if (quote != null) {
        val prefixLength = quote.groupValues[1].length
        builder.append(line.start, line.start + prefixLength, "")
        builder.append(line.start + prefixLength, line.end, quote.groupValues[2], SpanStyle(fontStyle = FontStyle.Italic, color = TaskChuteColors.SecondaryText))
        return
    }
    val leading = leadingMarkdownIndent(text)
    val bodyStart = line.start + leading.length
    if (leading.isNotEmpty()) builder.append(line.start, bodyStart, leading)
    val body = text.substring(leading.length)
    val ordered = Regex("^(\\d{1,9}[.)][ \\t]+)(.*)$").matchEntire(body)
    if (ordered != null) {
        val prefixLength = ordered.groupValues[1].length
        val contentStart = bodyStart + prefixLength
        builder.append(bodyStart, contentStart, ordered.groupValues[1], SpanStyle(color = TaskChuteColors.SecondaryText))
        val task = Regex("^\\[([ xX])\\][ \\t]+").find(source.substring(contentStart, line.end))
        if (task != null) {
            val marker = if (task.groupValues[1].equals("x", ignoreCase = true)) "☑ " else "☐ "
            builder.append(contentStart, contentStart + task.value.length, marker, SpanStyle(color = Color.White))
            appendInline(builder, source, contentStart + task.value.length, line.end)
        } else {
            appendInline(builder, source, contentStart, line.end)
        }
        return
    }
    val task = Regex("^- \\[([ xX])\\] (.*)$").matchEntire(body)
    if (task != null) {
        val prefixLength = 6
        val marker = if (task.groupValues[1].equals("x", ignoreCase = true)) "☑ " else "☐ "
        builder.append(bodyStart, bodyStart + prefixLength, marker, SpanStyle(color = Color.White))
        appendInline(builder, source, bodyStart + prefixLength, line.end)
        return
    }
    val bullet = Regex("^[-+*] (.*)$").matchEntire(body)
    if (bullet != null) {
        builder.append(bodyStart, bodyStart + 2, "• ", SpanStyle(color = TaskChuteColors.SecondaryText))
        appendInline(builder, source, bodyStart + 2, line.end)
        return
    }
    appendInline(builder, source, bodyStart, line.end)
}

private fun leadingMarkdownIndent(source: String): String = source.takeWhile { it == ' ' || it == '\t' }

private fun appendInline(
    builder: PreviewBuilder,
    source: String,
    start: Int,
    end: Int,
    baseStyle: SpanStyle? = null,
) {
    val underlineOpen = "<u>"
    val underlineClose = "</u>"
    val boldPattern = Regex("\\*\\*(.+?)\\*\\*")
    val linkPattern = Regex("\\[([^\\]]+)\\]\\(([^)]+)\\)")
    var cursor = start
    while (cursor < end) {
        val remaining = source.substring(cursor, end)
        val underline = MarkdownEditCommands.recognizedUnderlineRanges(remaining).firstOrNull()
        val bold = boldPattern.find(remaining)
        val link = linkPattern.find(remaining)
        val underlineStart = underline?.first?.minus(underlineOpen.length)
        val boldStart = bold?.range?.first
        val linkStart = link?.range?.first
        val nextStart = listOfNotNull(underlineStart, boldStart, linkStart).minOrNull()
        if (nextStart == null) {
            appendTextWithInteractiveLinks(builder, source, cursor, end, baseStyle)
            return
        }
        val absoluteStart = cursor + nextStart
        if (absoluteStart > cursor) appendTextWithInteractiveLinks(builder, source, cursor, absoluteStart, baseStyle)

        when (nextStart) {
            underlineStart -> {
                val (contentStartOffset, contentEndOffset) = requireNotNull(underline)
                val openStart = cursor + contentStartOffset - underlineOpen.length
                val contentStart = cursor + contentStartOffset
                val contentEnd = cursor + contentEndOffset
                val closeEnd = contentEnd + underlineClose.length
                builder.append(openStart, contentStart, "")
                appendInline(
                    builder,
                    source,
                    contentStart,
                    contentEnd,
                    mergePreviewStyle(baseStyle, SpanStyle(textDecoration = TextDecoration.Underline)),
                )
                builder.append(contentEnd, closeEnd, "")
                cursor = closeEnd
            }
            boldStart -> {
                val match = requireNotNull(bold)
                val matchStart = cursor + match.range.first
                val matchEnd = cursor + match.range.last + 1
                val contentStart = matchStart + 2
                val contentEnd = matchEnd - 2
                builder.append(matchStart, contentStart, "")
                appendInline(
                    builder,
                    source,
                    contentStart,
                    contentEnd,
                    mergePreviewStyle(baseStyle, SpanStyle(fontWeight = FontWeight.Bold)),
                )
                builder.append(contentEnd, matchEnd, "")
                cursor = matchEnd
            }
            else -> {
                val match = requireNotNull(link)
                val matchStart = cursor + match.range.first
                val matchEnd = cursor + match.range.last + 1
                val labelStart = matchStart + 1
                val labelEnd = labelStart + match.groupValues[1].length
                builder.append(matchStart, labelStart, "")
                appendInline(
                    builder,
                    source,
                    labelStart,
                    labelEnd,
                    mergePreviewStyle(
                        baseStyle,
                        SpanStyle(color = TaskChuteColors.AccentBlue, textDecoration = TextDecoration.Underline),
                    ),
                )
                builder.append(labelEnd, matchEnd, "")
                cursor = matchEnd
            }
        }
    }
}

private fun mergePreviewStyle(baseStyle: SpanStyle?, addedStyle: SpanStyle): SpanStyle =
    baseStyle?.merge(addedStyle) ?: addedStyle

private fun appendTextWithInteractiveLinks(
    builder: PreviewBuilder,
    source: String,
    start: Int,
    end: Int,
    baseStyle: SpanStyle? = null,
) {
    val links = markdownLinkSourceRanges(source).filter {
        it.sourceStart >= start && it.sourceEndExclusive <= end
    }
    var cursor = start
    links.forEach { link ->
        if (link.sourceStart > cursor) builder.append(cursor, link.sourceStart, source.substring(cursor, link.sourceStart), baseStyle)
        builder.append(
            link.sourceStart,
            link.sourceEndExclusive,
            source.substring(link.sourceStart, link.sourceEndExclusive),
            mergePreviewStyle(baseStyle, SpanStyle(color = TaskChuteColors.AccentBlue, textDecoration = TextDecoration.Underline)),
        )
        cursor = link.sourceEndExclusive
    }
    if (cursor < end) builder.append(cursor, end, source.substring(cursor, end), baseStyle)
}

private class PreviewBuilder(private val source: String) {
    private val output = AnnotatedString.Builder()
    private val sourceToDisplay = IntArray(source.length + 1) { -1 }
    private val displayToSource = mutableListOf<Int>()

    fun append(sourceStart: Int, sourceEnd: Int, display: String, style: SpanStyle? = null) {
        val outputStart = output.length
        if (style == null) {
            output.append(display)
        } else {
            output.pushStyle(style)
            output.append(display)
            output.pop()
        }
        val outputEnd = output.length
        val sourceLength = (sourceEnd - sourceStart).coerceAtLeast(0)
        val displayLength = outputEnd - outputStart
        for (index in 0..sourceLength) {
            val mapped = if (sourceLength == 0) outputStart else outputStart + (index * displayLength / sourceLength)
            sourceToDisplay[(sourceStart + index).coerceIn(0, source.length)] = mapped.coerceIn(outputStart, outputEnd)
        }
        while (displayToSource.size <= outputEnd) displayToSource += sourceStart.coerceIn(0, source.length)
        for (index in 0..displayLength) {
            val mapped = if (displayLength == 0) sourceStart else sourceStart + (index * sourceLength / displayLength)
            displayToSource[(outputStart + index).coerceIn(0, outputEnd)] = mapped.coerceIn(sourceStart, sourceEnd)
        }
    }

    fun build(): AnnotatedString {
        var previous = 0
        sourceToDisplay.indices.forEach { index ->
            if (sourceToDisplay[index] < 0) sourceToDisplay[index] = previous else sourceToDisplay[index] = maxOf(previous, sourceToDisplay[index])
            previous = sourceToDisplay[index]
        }
        var previousOriginal = 0
        displayToSource.indices.forEach { index ->
            displayToSource[index] = maxOf(previousOriginal, displayToSource[index])
            previousOriginal = displayToSource[index]
        }
        return output.toAnnotatedString()
    }

    fun originalToTransformed(offset: Int): Int = sourceToDisplay[offset.coerceIn(0, source.length)]

    fun transformedToOriginal(offset: Int): Int = displayToSource.getOrElse(offset.coerceIn(0, output.length)) { source.length }
}

@Composable
fun MarkdownLiveEditor(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    modifier: Modifier,
    footer: @Composable ColumnScope.() -> Unit = {},
    onOpenUrl: ((String) -> Unit)? = null,
    onTextFieldValueChange: ((TextFieldValue) -> Unit)? = null,
    editorSessionKey: Any = Unit,
    cursorDocumentId: String? = null,
    onBodyFocusChanged: ((Boolean) -> Unit)? = null,
) {
    val context = LocalContext.current
    val cursorPreferences = remember(context) { DocumentCursorPreferences(context) }
    val lineNumberPreferences = remember(context) { MarkdownEditorPreferences(context) }
    val showLineNumbers = remember(context) { lineNumberPreferences.showLineNumbers() }
    val editorScrollState = remember(editorSessionKey) { ScrollState(0) }
    val toolbarScrollState = remember(editorSessionKey) { ScrollState(0) }
    val currentCursorDocumentId = rememberUpdatedState(cursorDocumentId)
    val currentTextFieldValueChange = rememberUpdatedState(onTextFieldValueChange)
    // Notes keep this key stable when an unmaterialized editor adopts its canonical document ID.
    val initialCaretOffset = remember(editorSessionKey) {
        cursorDocumentId?.let(cursorPreferences::readCaretOffset)
    }
    var fieldValue by remember(editorSessionKey) {
        mutableStateOf(initialMarkdownTextFieldValue(value, initialCaretOffset))
    }
    var reversibleToolbarEdit by remember(editorSessionKey) { mutableStateOf<ReversibleMarkdownToolbarEdit?>(null) }
    var headingPickerOpen by remember(editorSessionKey) { mutableStateOf(false) }
    var headingPickerSnapshot by remember(editorSessionKey) { mutableStateOf<MarkdownHeadingPickerSnapshot?>(null) }
    var restoreBodyFocusAfterHeadingPicker by remember(editorSessionKey) { mutableStateOf(false) }
    var selectionRestoreAfterTap by remember { mutableStateOf<TextRange?>(null) }
    var staleTextAfterCheckboxToggle by remember { mutableStateOf<String?>(null) }
    var hasFocus by remember { mutableStateOf(false) }
    var textLayoutResult by remember { mutableStateOf<androidx.compose.ui.text.TextLayoutResult?>(null) }
    var editorViewportHeightPx by remember { mutableIntStateOf(0) }
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    val uriHandler = LocalUriHandler.current
    val density = LocalDensity.current
    val imeInsets = LocalMarkdownEditorImeInsets.current ?: WindowInsets.ime
    val imeVisible = imeInsets.getBottom(density) > 0
    val toolbarVisible = hasFocus && imeVisible && enabled
    val onTextFieldValueObserved: (TextFieldValue) -> Unit = { next ->
        currentCursorDocumentId.value?.let { documentId ->
            cursorPreferences.writeCaretOffset(documentId, persistedDocumentCaretOffset(next.selection))
        }
        currentTextFieldValueChange.value?.invoke(next)
    }
    val previewSelection = if (hasFocus) MarkdownSelection(fieldValue.selection.start, fieldValue.selection.end) else null
    val previewTransformation = remember(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end, hasFocus) {
        MarkdownPreviewTransformation(
            previewSelection,
        )
    }
    val transformedPreview = remember(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end) {
        previewTransformation.filter(AnnotatedString(fieldValue.text))
    }
    val checkboxHits = remember(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end, hasFocus) {
        renderedTaskCheckboxHits(
            source = fieldValue.text,
            selection = previewSelection,
            mapping = transformedPreview.offsetMapping,
        )
    }
    val linkHits = remember(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end) {
        renderedMarkdownLinkHits(
            source = fieldValue.text,
            mapping = transformedPreview.offsetMapping,
        )
    }
    val latestTextLayoutResult = rememberUpdatedState(textLayoutResult)
    val latestTextFieldValue = rememberUpdatedState(fieldValue)
    val latestCheckboxHits = rememberUpdatedState(checkboxHits)
    val latestLinkHits = rememberUpdatedState(linkHits)
    val latestOpenUrl = rememberUpdatedState(onOpenUrl)
    val openUrl = rememberUpdatedState<(String) -> Unit> { destination ->
        val customOpener = latestOpenUrl.value
        if (customOpener != null) {
            runCatching { customOpener(destination) }
        } else {
            runCatching { uriHandler.openUri(destination) }
        }
    }
    val toggleCheckbox = rememberUpdatedState<(Int) -> Unit> { sourceStart ->
        if (enabled) {
            reversibleToolbarEdit = null
            val result = toggleTaskCheckbox(fieldValue.text, sourceStart)
            if (result != null) {
                val preserved = preservedSelectionAfterCheckboxToggle(
                    MarkdownSelection(fieldValue.selection.start, fieldValue.selection.end),
                    result,
                )
                val selection = TextRange(
                    preserved.start,
                    preserved.end,
                )
                val composition = fieldValue.composition?.let {
                    TextRange(result.mapOffset(it.start), result.mapOffset(it.end))
                }
                val next = fieldValue.copy(text = result.text, selection = selection, composition = composition)
                staleTextAfterCheckboxToggle = fieldValue.text
                fieldValue = next
                onValueChange(next.text)
                onTextFieldValueObserved(next)
                focusRequester.requestFocus()
                keyboardController?.show()
            }
        }
    }
    val checkboxActions = if (enabled) {
        checkboxHits.map { hit ->
            CustomAccessibilityAction(
                label = if (hit.checked) {
                    "\u5b8c\u4e86\u6e08\u307f\u30bf\u30b9\u30af\u3092\u672a\u5b8c\u4e86\u306b\u623b\u3059: " + hit.label
                } else {
                    "\u672a\u5b8c\u4e86\u30bf\u30b9\u30af\u3092\u5b8c\u4e86\u306b\u3059: " + hit.label
                },
                action = {
                    toggleCheckbox.value(hit.sourceStart)
                    true
                },
            )
        }
    } else {
        emptyList()
    }
    val linkActions = if (enabled) {
        linkHits.map { hit ->
            CustomAccessibilityAction(
                label = "リンクを開く: ${hit.destination}",
                action = {
                    openUrl.value(hit.destination)
                    true
                },
            )
        }
    } else {
        emptyList()
    }
    val interactiveActions = checkboxActions + linkActions

    LaunchedEffect(value) {
        if (fieldValue.text != value) {
            reversibleToolbarEdit = null
            fieldValue = clampMarkdownTextFieldValueToBody(fieldValue, value)
            currentCursorDocumentId.value?.let { documentId ->
                cursorPreferences.writeCaretOffset(documentId, persistedDocumentCaretOffset(fieldValue.selection))
            }
        }
    }

    LaunchedEffect(headingPickerOpen, restoreBodyFocusAfterHeadingPicker, enabled) {
        if (!headingPickerOpen && restoreBodyFocusAfterHeadingPicker) {
            restoreBodyFocusAfterHeadingPicker = false
            if (enabled) {
                focusRequester.requestFocus()
                keyboardController?.show()
            }
        }
    }

    LaunchedEffect(
        fieldValue.selection.start,
        fieldValue.selection.end,
        textLayoutResult,
        editorViewportHeightPx,
        hasFocus,
        enabled,
        transformedPreview.offsetMapping,
    ) {
        val layout = textLayoutResult ?: return@LaunchedEffect
        if (!hasFocus || !enabled || editorViewportHeightPx <= 0) return@LaunchedEffect

        val transformedCaret = transformedPreview.offsetMapping
            .originalToTransformed(fieldValue.selection.end)
            .coerceIn(0, transformedPreview.text.length)
        val caretLine = layout.getLineForOffset(transformedCaret)
        val textTopPaddingPx = with(density) { 2.dp.toPx() }
        val caretTop = layout.getLineTop(caretLine) + textTopPaddingPx
        val caretBottom = layout.getLineBottom(caretLine) + textTopPaddingPx
        val currentScrollTop = editorScrollState.value.toFloat()
        val currentScrollBottom = currentScrollTop + editorViewportHeightPx
        val requestedScrollTop = when {
            caretTop < currentScrollTop -> caretTop
            caretBottom > currentScrollBottom -> caretBottom - editorViewportHeightPx
            else -> return@LaunchedEffect
        }
        val boundedScrollTop = requestedScrollTop.roundToInt().coerceIn(0, editorScrollState.maxValue)
        if (boundedScrollTop != editorScrollState.value) editorScrollState.scrollTo(boundedScrollTop)
    }

    Box(modifier) {
        Column(
            modifier = Modifier.fillMaxSize().padding(bottom = if (toolbarVisible) 50.dp else 0.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .onSizeChanged { editorViewportHeightPx = it.height }
                    .testTag("markdown-editor-scroll-viewport")
                    .pointerInput(enabled, editorSessionKey) {
                        if (!enabled) return@pointerInput
                        awaitEachGesture {
                            val down = awaitFirstDown(
                                requireUnconsumed = false,
                                pass = PointerEventPass.Initial,
                            )
                            val currentValue = latestTextFieldValue.value
                            if (currentValue.composition != null) return@awaitEachGesture
                            val layout = latestTextLayoutResult.value
                            val isBelowContent = if (currentValue.text.isEmpty()) {
                                true
                            } else {
                                val lastLineBottom = layout?.let { textLayout ->
                                    textLayout.getLineBottom(textLayout.lineCount - 1) + with(density) { 2.dp.toPx() }
                                } ?: return@awaitEachGesture
                                down.position.y + editorScrollState.value > lastLineBottom
                            }
                            if (!isBelowContent) return@awaitEachGesture

                            var canceled = false
                            var upPosition = down.position
                            while (true) {
                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                val change = event.changes.firstOrNull { it.id == down.id } ?: continue
                                upPosition = change.position
                                if (change.changedToUpIgnoreConsumed()) break
                                if (!change.pressed || (change.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                                    canceled = true
                                    break
                                }
                            }

                            if (!canceled && (upPosition - down.position).getDistance() <= viewConfiguration.touchSlop) {
                                val next = latestTextFieldValue.value.copy(selection = TextRange(0))
                                reversibleToolbarEdit = null
                                fieldValue = next
                                onTextFieldValueObserved(next)
                                focusRequester.requestFocus()
                                keyboardController?.show()
                            }
                        }
                    },
            ) {
                Row(
                    modifier = Modifier.fillMaxSize().verticalScroll(editorScrollState),
                    verticalAlignment = Alignment.Top,
                ) {
                    if (showLineNumbers) {
                        MarkdownLineNumberGutter(
                            source = fieldValue.text,
                            layout = textLayoutResult,
                            offsetMapping = transformedPreview.offsetMapping,
                            scrollState = editorScrollState,
                            viewportHeightPx = editorViewportHeightPx,
                            transformedTextLength = transformedPreview.text.length,
                            modifier = Modifier.testTag("markdown-line-number-gutter"),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                    .pointerInput(enabled) {
                        if (!enabled) return@pointerInput
                        awaitEachGesture {
                            val down = awaitFirstDown(
                                requireUnconsumed = false,
                                pass = PointerEventPass.Initial,
                            )
                            val selectionAtDown = fieldValue.selection
                            val layout = latestTextLayoutResult.value
                            val checkbox = layout?.let { textLayout ->
                                val offset = textLayout.getOffsetForPosition(down.position)
                                latestCheckboxHits.value.firstOrNull {
                                    offset in it.transformedStart until it.transformedEndExclusive
                                } ?: run {
                                    val line = textLayout.getLineForVerticalPosition(down.position.y)
                                    latestCheckboxHits.value.firstOrNull { hit ->
                                        textLayout.getLineForOffset(hit.transformedStart) == line &&
                                            down.position.x <= textLayout.getBoundingBox((hit.transformedEndExclusive - 1).coerceAtLeast(hit.transformedStart)).right + 24f
                                    }
                                }
                            }
                            val link = layout?.getOffsetForPosition(down.position)?.let { offset ->
                                latestLinkHits.value.firstOrNull {
                                    offset in it.transformedStart until it.transformedEndExclusive
                                }
                            }
                            if (checkbox == null && link == null) return@awaitEachGesture

                            var canceled = false
                            var upPosition = down.position
                            while (true) {
                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                val change = event.changes.firstOrNull { it.id == down.id } ?: continue
                                upPosition = change.position
                                if (change.changedToUpIgnoreConsumed()) {
                                    break
                                }
                                if (!change.pressed) {
                                    canceled = true
                                    break
                                }
                                if ((change.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                                    canceled = true
                                    break
                                }
                            }

                            if (!canceled && (upPosition - down.position).getDistance() <= viewConfiguration.touchSlop) {
                                if (checkbox != null) {
                                    reversibleToolbarEdit = null
                                    selectionRestoreAfterTap = selectionAtDown
                                    if (fieldValue.selection != selectionAtDown) {
                                        fieldValue = fieldValue.copy(selection = selectionAtDown)
                                        onTextFieldValueObserved(fieldValue)
                                    }
                                    toggleCheckbox.value(checkbox.sourceStart)
                                } else if (link != null) {
                                    reversibleToolbarEdit = null
                                    selectionRestoreAfterTap = selectionAtDown
                                    if (fieldValue.selection != selectionAtDown) {
                                        fieldValue = fieldValue.copy(selection = selectionAtDown)
                                        onTextFieldValueObserved(fieldValue)
                                    }
                                    openUrl.value(link.destination)
                                }
                            }
                        }
                    },
                    ) {
                BasicTextField(
                    value = fieldValue,
                    onValueChange = {
                        if (it != fieldValue) reversibleToolbarEdit = null
                        val previousText = fieldValue.text
                        if (staleTextAfterCheckboxToggle == it.text && it.text != previousText) {
                            staleTextAfterCheckboxToggle = null
                        } else {
                            val restored = selectionRestoreAfterTap
                            if (it.text == previousText && restored != null) {
                                selectionRestoreAfterTap = null
                                fieldValue = it.copy(selection = restored)
                                onTextFieldValueObserved(fieldValue)
                            } else {
                                fieldValue = it
                                if (it.text != previousText) onValueChange(it.text)
                                onTextFieldValueObserved(it)
                            }
                        }
                    },
                    enabled = enabled,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = TaskChuteColors.PrimaryText, fontSize = 16.sp),
                    cursorBrush = SolidColor(TaskChuteColors.PrimaryText),
                    visualTransformation = previewTransformation,
                    onTextLayout = { textLayoutResult = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequester)
                        .semantics {
                            contentDescription = "Markdown body"
                            if (interactiveActions.isNotEmpty()) customActions = interactiveActions
                        }
                        .onFocusChanged {
                            hasFocus = it.isFocused
                            if (!it.isFocused && !headingPickerOpen) reversibleToolbarEdit = null
                            onBodyFocusChanged?.invoke(it.isFocused)
                        },
                    decorationBox = { innerTextField ->
                        Box(Modifier.fillMaxWidth().padding(top = 2.dp)) {
                            if (fieldValue.text.isEmpty()) Text("本文を入力", color = TaskChuteColors.SecondaryText)
                            innerTextField()
                        }
                    },
                )
            }
                }
            }
            footer()
        }
        if (toolbarVisible) {
            MarkdownImeToolbar(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(48.dp).testTag("markdown-ime-toolbar"),
                scrollState = toolbarScrollState,
                onAction = { action ->
                    val previousValue = fieldValue
                    val result = applyMarkdownToolbarAction(fieldValue, action, reversibleToolbarEdit)
                    reversibleToolbarEdit = result.reversibleEdit
                    selectionRestoreAfterTap = null
                    fieldValue = result.value
                    if (result.value.text != previousValue.text) onValueChange(result.value.text)
                    if (result.value != previousValue) {
                        onTextFieldValueObserved(result.value)
                        focusRequester.requestFocus()
                        keyboardController?.show()
                    }
                },
                onHeadingClick = {
                    headingPickerSnapshot = MarkdownHeadingPickerSnapshot(editorSessionKey, value, fieldValue)
                    restoreBodyFocusAfterHeadingPicker = false
                    headingPickerOpen = true
                },
            )
        }
        if (headingPickerOpen) {
            MarkdownHeadingPicker(
                enabled = enabled,
                onDismissRequest = {
                    headingPickerSnapshot = null
                    headingPickerOpen = false
                    restoreBodyFocusAfterHeadingPicker = enabled
                },
                onLevelSelected = { level ->
                    val snapshot = headingPickerSnapshot
                    if (
                        enabled && snapshot != null &&
                        isMarkdownHeadingPickerSnapshotCurrent(snapshot, editorSessionKey, value, fieldValue)
                    ) {
                        val previousValue = fieldValue
                        val result = applyMarkdownToolbarAction(fieldValue, level.action, reversibleToolbarEdit)
                        reversibleToolbarEdit = result.reversibleEdit
                        selectionRestoreAfterTap = null
                        fieldValue = result.value
                        if (result.value.text != previousValue.text) onValueChange(result.value.text)
                        if (result.value != previousValue) onTextFieldValueObserved(result.value)
                    } else {
                        reversibleToolbarEdit = null
                    }
                    headingPickerSnapshot = null
                    headingPickerOpen = false
                    restoreBodyFocusAfterHeadingPicker = enabled
                },
            )
        }
    }
}

@Composable
private fun MarkdownLineNumberGutter(
    source: String,
    layout: TextLayoutResult?,
    offsetMapping: OffsetMapping,
    scrollState: ScrollState,
    viewportHeightPx: Int,
    transformedTextLength: Int,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val starts = remember(source) { markdownSourceLineStarts(source) }
    val paint = remember(density) {
        AndroidPaint(AndroidPaint.ANTI_ALIAS_FLAG).apply {
            textSize = with(density) { 12.sp.toPx() }
        }
    }
    val sidePaddingPx = with(density) { 8.dp.roundToPx().toFloat() }
    val gutterWidthPx = remember(paint, starts.size, sidePaddingPx) {
        paint.measureText("9".repeat(starts.size.toString().length)).toInt() + sidePaddingPx.toInt() * 2
    }
    val textTopPaddingPx = with(density) { 2.dp.roundToPx().toFloat() }
    val contentHeightPx = (layout?.size?.height ?: 0) + textTopPaddingPx.toInt()
    val gutterHeight = with(density) { contentHeightPx.toDp() }
    val visibleNumbers = remember(
        source,
        layout,
        offsetMapping,
        scrollState.value,
        viewportHeightPx,
        transformedTextLength,
    ) {
        layout?.let {
            visibleMarkdownLineNumberPlacements(
                source = source,
                starts = starts,
                layout = it,
                offsetMapping = offsetMapping,
                scrollOffsetPx = scrollState.value,
                viewportHeightPx = viewportHeightPx.takeIf { height -> height > 0 }
                    ?: (it.size.height - scrollState.maxValue),
                textTopPaddingPx = textTopPaddingPx,
                transformedTextLength = transformedTextLength,
            )
        }.orEmpty()
    }

    Layout(
        content = {
            visibleNumbers.forEach { placement ->
                Text(
                    text = placement.lineNumber.toString(),
                    color = markdownLineNumberTint(),
                    fontSize = 12.sp,
                    textAlign = TextAlign.End,
                    maxLines = 1,
                    modifier = Modifier.semantics {
                        contentDescription = "markdown-line-number-${placement.lineNumber}"
                        hideFromAccessibility()
                    },
                )
            }
        },
        modifier = modifier.width(with(density) { gutterWidthPx.toDp() }).height(gutterHeight),
    ) { measurables, _ ->
        val placeables = measurables.map { it.measure(androidx.compose.ui.unit.Constraints(maxWidth = gutterWidthPx)) }
        layout(gutterWidthPx, contentHeightPx) {
            placeables.forEachIndexed { index, placeable ->
                val placement = visibleNumbers[index]
                val firstBaseline = placeable[FirstBaseline].takeUnless { it == androidx.compose.ui.layout.AlignmentLine.Unspecified } ?: placeable.height
                placeable.placeRelative(
                    x = gutterWidthPx - sidePaddingPx.toInt() - placeable.width,
                    y = (placement.baselinePx - firstBaseline).toInt(),
                )
            }
        }
    }
}

internal fun markdownLineNumberTint(): Color = TaskChuteColors.SecondaryText.copy(alpha = 0.8f)

private data class MarkdownLineNumberPlacement(val lineNumber: Int, val baselinePx: Float)

private fun visibleMarkdownLineNumberPlacements(
    source: String,
    starts: List<Int>,
    layout: TextLayoutResult,
    offsetMapping: OffsetMapping,
    scrollOffsetPx: Int,
    viewportHeightPx: Int,
    textTopPaddingPx: Float,
    transformedTextLength: Int,
): List<MarkdownLineNumberPlacement> {
    if (viewportHeightPx <= 0 || starts.isEmpty()) return emptyList()

    val scrollTop = scrollOffsetPx.toFloat()
    val scrollBottom = scrollTop + viewportHeightPx
    val firstVisibleVisualLine = layout.getLineForVerticalPosition((scrollTop - textTopPaddingPx).coerceAtLeast(0f))
    val lastVisibleVisualLine = layout.getLineForVerticalPosition((scrollBottom - textTopPaddingPx).coerceAtLeast(0f))
    val result = mutableListOf<MarkdownLineNumberPlacement>()
    for (visualLine in firstVisibleVisualLine..lastVisibleVisualLine) {
        val transformedStart = layout.getLineStart(visualLine)
        val sourceOffset = offsetMapping.transformedToOriginal(transformedStart).coerceIn(0, source.length)
        val sourceLineIndex = markdownSourceLineIndexAt(starts, sourceOffset)
        val sourceLineStart = starts[sourceLineIndex]
        val firstVisualLine = layout.getLineForOffset(
            offsetMapping.originalToTransformed(sourceLineStart).coerceIn(0, transformedTextLength),
        )
        if (visualLine != firstVisualLine) continue

        val baseline = layout.getLineBaseline(visualLine) + textTopPaddingPx
        if (baseline in scrollTop..scrollBottom) {
            result += MarkdownLineNumberPlacement(sourceLineIndex + 1, baseline)
        }
    }
    return result
}

@Composable
internal fun MarkdownImeToolbar(
    modifier: Modifier,
    scrollState: ScrollState = rememberScrollState(),
    onAction: (MarkdownToolbarActionId) -> Unit,
    onHeadingClick: () -> Unit,
) {
    Row(
        modifier = modifier.horizontalScroll(scrollState).padding(horizontal = 4.dp).testTag("markdown-ime-toolbar"),
        horizontalArrangement = Arrangement.spacedBy(0.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MarkdownToolbarAction(R.drawable.ic_material_format_bold_24, "太字", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.BOLD)
        }
        MarkdownToolbarHeadingAction(modifier = Modifier.width(44.dp), onClick = onHeadingClick)
        MarkdownToolbarAction(R.drawable.ic_material_format_list_bulleted_24, "箇条書き", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.BULLET)
        }
        MarkdownToolbarAction(R.drawable.ic_material_checklist_24, "チェックリスト", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.CHECKBOX)
        }
        MarkdownToolbarAction(R.drawable.ic_material_format_quote_24, "引用", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.QUOTE)
        }
        MarkdownToolbarAction(R.drawable.ic_material_link_24, "リンク", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.LINK)
        }
        MarkdownToolbarAction(R.drawable.ic_material_horizontal_rule_24, "区切り線", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.HORIZONTAL_RULE)
        }
        MarkdownToolbarAction(R.drawable.ic_material_format_indent_increase_24, "インデント", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.INDENT)
        }
        MarkdownToolbarAction(R.drawable.ic_material_format_indent_decrease_24, "インデント解除", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.OUTDENT)
        }
        MarkdownToolbarAction(R.drawable.ic_material_format_list_numbered_24, "番号付きリスト", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.ORDERED_LIST)
        }
        MarkdownToolbarAction(R.drawable.ic_material_move_line_up_24, "行を上へ", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.MOVE_LINE_UP)
        }
        MarkdownToolbarAction(R.drawable.ic_material_move_line_down_24, "行を下へ", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.MOVE_LINE_DOWN)
        }
        MarkdownToolbarAction(R.drawable.ic_material_format_underlined_24, "下線", modifier = Modifier.width(44.dp)) {
            onAction(MarkdownToolbarActionId.UNDERLINE)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MarkdownHeadingPicker(
    enabled: Boolean,
    onDismissRequest: () -> Unit,
    onLevelSelected: (MarkdownHeadingLevel) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismissRequest) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("markdown-heading-picker"),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "見出しレベル",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp).testTag("markdown-heading-picker-title"),
            )
            MarkdownHeadingLevel.values().forEach { level ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clickable(enabled = enabled) { onLevelSelected(level) }
                        .semantics {
                            contentDescription = level.accessibilityLabel
                            role = Role.Button
                        }
                        .testTag("markdown-heading-option-h${level.level}"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = level.accessibilityLabel,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun MarkdownToolbarHeadingAction(modifier: Modifier, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = modifier.height(48.dp).focusProperties { canFocus = false }
            .semantics { contentDescription = "見出しを選択" },
    ) {
        Text(
            text = "H",
            color = TaskChuteColors.PrimaryText,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun MarkdownToolbarAction(
    iconResource: Int,
    description: String,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = modifier.height(48.dp).focusProperties { canFocus = false }.semantics { contentDescription = description },
    ) {
        Icon(
            painter = painterResource(iconResource),
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = TaskChuteColors.PrimaryText,
        )
    }
}
