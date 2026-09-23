package com.hedgetheapp.taskchute.document

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
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
import com.hedgetheapp.taskchute.ui.TaskChuteColors

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

    fun heading(source: String, selection: MarkdownSelection): MarkdownEditResult = editLines(source, selection, prefix = { line -> Regex("^#{1,6}\\s+").containsMatchIn(line) }) { line, allHavePrefix ->
        val existing = Regex("^#{1,6}\\s+").find(line)
        if (allHavePrefix) {
            LineEdit(line.removeRange(existing!!.range), map = { offset -> (offset - existing.value.length).coerceAtLeast(0) })
        } else if (existing != null) {
            val body = line.removeRange(existing.range)
            LineEdit("# $body", map = { offset ->
                if (offset <= existing.range.first) offset + 2 else offset - existing.value.length + 2
            })
        } else {
            LineEdit("# $line", map = { offset -> offset + 2 })
        }
    }

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
        val text = buildString {
            edits.forEachIndexed { index, edit ->
                append(edit.text)
                if (lines[index].hasNewline) append('\n')
            }
        }
        val starts = IntArray(lines.size)
        var outputStart = 0
        edits.forEachIndexed { index, edit ->
            starts[index] = outputStart
            outputStart += edit.text.length + if (lines[index].hasNewline) 1 else 0
        }
        fun mapPosition(position: Int): Int {
            val lineIndex = lines.indexOfLast { position >= it.start }.coerceAtLeast(0)
            val line = lines[lineIndex]
            val local = (position - line.start).coerceIn(0, line.text.length)
            return starts[lineIndex] + edits[lineIndex].map(local)
        }
        return MarkdownEditResult(text, MarkdownSelection(mapPosition(range.start), mapPosition(range.end)), ::mapPosition)
    }

}

private data class LineEdit(val text: String, val map: (Int) -> Int)

private data class SourceLine(val start: Int, val end: Int, val text: String, val hasNewline: Boolean)

private fun sourceLines(source: String): List<SourceLine> {
    if (source.isEmpty()) return listOf(SourceLine(0, 0, "", false))
    val result = mutableListOf<SourceLine>()
    var start = 0
    while (start <= source.length) {
        val newline = source.indexOf('\n', start)
        if (newline < 0) {
            result += SourceLine(start, source.length, source.substring(start), false)
            break
        }
        result += SourceLine(start, newline, source.substring(start, newline), true)
        start = newline + 1
        if (start == source.length) result += SourceLine(start, start, "", false)
    }
    return result
}

private fun touchedLineIndexes(lines: List<SourceLine>, selection: MarkdownSelection): Set<Int> {
    if (lines.isEmpty()) return emptySet()
    val startLine = lines.indexOfLast { selection.start >= it.start }.coerceAtLeast(0)
    val endAnchor = if (selection.end > selection.start) (selection.end - 1).coerceAtLeast(selection.start) else selection.start
    val endLine = lines.indexOfLast { endAnchor >= it.start }.coerceAtLeast(startLine)
    return (startLine..endLine).toSet()
}

internal class MarkdownPreviewTransformation(private val activeSelection: MarkdownSelection) : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val source = text.text
        val selection = activeSelection.normalized(source.length)
        val lines = sourceLines(source)
        val active = touchedLineIndexes(lines, selection)
        val builder = PreviewBuilder(source)
        lines.forEachIndexed { index, line ->
            if (index in active) {
                builder.append(line.start, line.end, line.text)
            } else {
                appendRenderedLine(builder, source, line)
            }
            if (line.hasNewline) builder.append(line.end, line.end + 1, "\n")
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
    val task = Regex("^- \\[([ xX])\\] (.*)$").matchEntire(text)
    if (task != null) {
        val prefixLength = 6
        val marker = if (task.groupValues[1].equals("x", ignoreCase = true)) "☑ " else "☐ "
        builder.append(line.start, line.start + prefixLength, marker, SpanStyle(color = Color.White))
        appendInline(builder, source, line.start + prefixLength, line.end)
        return
    }
    val bullet = Regex("^- (.*)$").matchEntire(text)
    if (bullet != null) {
        builder.append(line.start, line.start + 2, "• ", SpanStyle(color = TaskChuteColors.SecondaryText))
        appendInline(builder, source, line.start + 2, line.end)
        return
    }
    appendInline(builder, source, line.start, line.end)
}

private fun appendInline(builder: PreviewBuilder, source: String, start: Int, end: Int) {
    val pattern = Regex("\\*\\*(.+?)\\*\\*|\\[([^\\]]+)\\]\\(([^)]+)\\)")
    var cursor = start
    pattern.findAll(source.substring(start, end)).forEach { match ->
        val matchStart = start + match.range.first
        val matchEnd = start + match.range.last + 1
        if (matchStart > cursor) builder.append(cursor, matchStart, source.substring(cursor, matchStart))
        if (match.groupValues[1].isNotEmpty()) {
            builder.append(matchStart, matchStart + 2, "")
            val contentStart = matchStart + 2
            val contentEnd = matchEnd - 2
            builder.append(contentStart, contentEnd, source.substring(contentStart, contentEnd), SpanStyle(fontWeight = FontWeight.Bold))
            builder.append(contentEnd, matchEnd, "")
        } else {
            val label = match.groupValues[2]
            val labelStart = matchStart + 1
            val labelEnd = labelStart + label.length
            builder.append(matchStart, labelStart, "")
            builder.append(labelStart, labelEnd, label, SpanStyle(color = TaskChuteColors.AccentBlue, textDecoration = TextDecoration.Underline))
            builder.append(labelEnd, matchEnd, "")
        }
        cursor = matchEnd
    }
    if (cursor < end) builder.append(cursor, end, source.substring(cursor, end))
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
) {
    var fieldValue by remember { mutableStateOf(TextFieldValue(value)) }
    var hasFocus by remember { mutableStateOf(false) }
    var textLayoutResult by remember { mutableStateOf<androidx.compose.ui.text.TextLayoutResult?>(null) }
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    val density = LocalDensity.current
    val imeVisible = WindowInsets.ime.getBottom(density) > 0
    val toolbarVisible = hasFocus && imeVisible && enabled
    val previewTransformation = remember(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end) {
        MarkdownPreviewTransformation(
            MarkdownSelection(fieldValue.selection.start, fieldValue.selection.end),
        )
    }
    val transformedPreview = remember(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end) {
        previewTransformation.filter(AnnotatedString(fieldValue.text))
    }
    val checkboxHits = remember(fieldValue.text, fieldValue.selection.start, fieldValue.selection.end) {
        renderedTaskCheckboxHits(
            source = fieldValue.text,
            selection = MarkdownSelection(fieldValue.selection.start, fieldValue.selection.end),
            mapping = transformedPreview.offsetMapping,
        )
    }
    val latestTextLayoutResult = rememberUpdatedState(textLayoutResult)
    val latestCheckboxHits = rememberUpdatedState(checkboxHits)
    val toggleCheckbox = rememberUpdatedState<(Int) -> Unit> { sourceStart ->
        if (enabled) {
            val result = toggleTaskCheckbox(fieldValue.text, sourceStart)
            if (result != null) {
                val selection = TextRange(
                    result.mapOffset(fieldValue.selection.start),
                    result.mapOffset(fieldValue.selection.end),
                )
                val composition = fieldValue.composition?.let {
                    TextRange(result.mapOffset(it.start), result.mapOffset(it.end))
                }
                val next = fieldValue.copy(text = result.text, selection = selection, composition = composition)
                fieldValue = next
                onValueChange(next.text)
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

    LaunchedEffect(value) {
        if (fieldValue.text != value) {
            val selection = TextRange(
                fieldValue.selection.start.coerceIn(0, value.length),
                fieldValue.selection.end.coerceIn(0, value.length),
            )
            fieldValue = fieldValue.copy(text = value, selection = selection, composition = null)
        }
    }

    Box(modifier) {
        Column(
            modifier = Modifier.fillMaxSize().padding(bottom = if (toolbarVisible) 52.dp else 0.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BasicTextField(
                value = fieldValue,
                onValueChange = {
                    fieldValue = it
                    onValueChange(it.text)
                },
                enabled = enabled,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = TaskChuteColors.PrimaryText, fontSize = 16.sp),
                cursorBrush = SolidColor(TaskChuteColors.PrimaryText),
                visualTransformation = previewTransformation,
                onTextLayout = { textLayoutResult = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .focusRequester(focusRequester)
                    .pointerInput(enabled, checkboxHits) {
                        if (!enabled) return@pointerInput
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            val layout = latestTextLayoutResult.value
                            val hits = latestCheckboxHits.value
                            val downOffset = layout?.getOffsetForPosition(down.position)
                            val hit = downOffset?.let { offset ->
                                hits.firstOrNull { offset in it.transformedStart until it.transformedEndExclusive }
                            }
                            if (hit != null) down.consume()

                            var released = false
                            var upPosition = down.position
                            while (!released) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull { it.id == down.id } ?: continue
                                upPosition = change.position
                                if (change.changedToUpIgnoreConsumed() || !change.pressed) {
                                    if (hit != null) change.consume()
                                    released = true
                                }
                            }

                            if (hit != null) {
                                val upOffset = layout?.getOffsetForPosition(upPosition)
                                if (upOffset != null && upOffset in hit.transformedStart until hit.transformedEndExclusive) {
                                    toggleCheckbox.value(hit.sourceStart)
                                }
                            }
                        }
                    }
                    .semantics {
                        contentDescription = "Markdown body"
                        if (checkboxActions.isNotEmpty()) customActions = checkboxActions
                    }
                    .onFocusChanged { hasFocus = it.isFocused },
                decorationBox = { innerTextField ->
                    Box(Modifier.fillMaxSize().padding(top = 2.dp)) {
                        if (fieldValue.text.isEmpty()) Text("Markdown", color = TaskChuteColors.SecondaryText)
                        innerTextField()
                    }
                },
            )
            footer()
        }
        if (toolbarVisible) {
            MarkdownImeToolbar(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(48.dp),
                fieldValue = fieldValue,
                onValueChange = { next ->
                    fieldValue = next
                    onValueChange(next.text)
                    focusRequester.requestFocus()
                    keyboardController?.show()
                },
            )
        }
    }
}
@Composable
internal fun MarkdownImeToolbar(
    modifier: Modifier,
    fieldValue: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
) {
    val scrollState = rememberScrollState()
    Row(
        modifier = modifier.horizontalScroll(scrollState).padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MarkdownToolbarAction("B", "太字", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::bold, onValueChange)
        }
        MarkdownToolbarAction("H", "見出し", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::heading, onValueChange)
        }
        MarkdownToolbarAction("•", "箇条書き", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::bullet, onValueChange)
        }
        MarkdownToolbarAction("☐", "チェックリスト", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::checkbox, onValueChange)
        }
        MarkdownToolbarAction("❯", "引用", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::quote, onValueChange)
        }
        MarkdownToolbarAction("↗", "リンク", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::link, onValueChange)
        }
    }
}

@Composable
private fun MarkdownToolbarAction(
    label: String,
    description: String,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = modifier.size(44.dp).focusProperties { canFocus = false }.semantics { contentDescription = description },
    ) {
        Text(label, color = TaskChuteColors.PrimaryText, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}

private fun applyMarkdownCommand(
    fieldValue: TextFieldValue,
    command: (String, MarkdownSelection) -> MarkdownEditResult,
    onValueChange: (TextFieldValue) -> Unit,
) {
    val result = command(
        fieldValue.text,
        MarkdownSelection(fieldValue.selection.start, fieldValue.selection.end),
    )
    val composition = fieldValue.composition?.let {
        TextRange(result.mapOffset(it.start), result.mapOffset(it.end))
    }
    onValueChange(
        TextFieldValue(
            text = result.text,
            selection = TextRange(result.selection.start, result.selection.end),
            composition = composition,
        ),
    )
}
