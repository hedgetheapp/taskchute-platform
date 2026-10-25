package com.hedgetheapp.taskchute.document

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.ScrollState
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
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
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
        if (matchStart > cursor) appendTextWithInteractiveLinks(builder, source, cursor, matchStart)
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
    if (cursor < end) appendTextWithInteractiveLinks(builder, source, cursor, end)
}

private fun appendTextWithInteractiveLinks(builder: PreviewBuilder, source: String, start: Int, end: Int) {
    val links = markdownLinkSourceRanges(source).filter {
        it.sourceStart >= start && it.sourceEndExclusive <= end
    }
    var cursor = start
    links.forEach { link ->
        if (link.sourceStart > cursor) builder.append(cursor, link.sourceStart, source.substring(cursor, link.sourceStart))
        builder.append(
            link.sourceStart,
            link.sourceEndExclusive,
            source.substring(link.sourceStart, link.sourceEndExclusive),
            SpanStyle(color = TaskChuteColors.AccentBlue, textDecoration = TextDecoration.Underline),
        )
        cursor = link.sourceEndExclusive
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
    onOpenUrl: ((String) -> Unit)? = null,
    onTextFieldValueChange: ((TextFieldValue) -> Unit)? = null,
    editorSessionKey: Any = Unit,
    cursorDocumentId: String? = null,
) {
    val context = LocalContext.current
    val cursorPreferences = remember(context) { DocumentCursorPreferences(context) }
    val lineNumberPreferences = remember(context) { MarkdownEditorPreferences(context) }
    var showLineNumbers by remember { mutableStateOf(lineNumberPreferences.showLineNumbers()) }
    val editorScrollState = remember(editorSessionKey) { ScrollState(0) }
    val currentCursorDocumentId = rememberUpdatedState(cursorDocumentId)
    val currentTextFieldValueChange = rememberUpdatedState(onTextFieldValueChange)
    // Notes keep this key stable when an unmaterialized editor adopts its canonical document ID.
    val initialCaretOffset = remember(editorSessionKey) {
        cursorDocumentId?.let(cursorPreferences::readCaretOffset)
    }
    var fieldValue by remember(editorSessionKey) {
        mutableStateOf(initialMarkdownTextFieldValue(value, initialCaretOffset))
    }
    var selectionRestoreAfterTap by remember { mutableStateOf<TextRange?>(null) }
    var staleTextAfterCheckboxToggle by remember { mutableStateOf<String?>(null) }
    var hasFocus by remember { mutableStateOf(false) }
    var textLayoutResult by remember { mutableStateOf<androidx.compose.ui.text.TextLayoutResult?>(null) }
    var editorViewportHeightPx by remember { mutableIntStateOf(0) }
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    val uriHandler = LocalUriHandler.current
    val density = LocalDensity.current
    val imeVisible = WindowInsets.ime.getBottom(density) > 0
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
            fieldValue = clampMarkdownTextFieldValueToBody(fieldValue, value)
            currentCursorDocumentId.value?.let { documentId ->
                cursorPreferences.writeCaretOffset(documentId, persistedDocumentCaretOffset(fieldValue.selection))
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
            modifier = Modifier.fillMaxSize().padding(bottom = if (toolbarVisible) 52.dp else 0.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().height(40.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("行番号を表示", color = TaskChuteColors.SecondaryText, fontSize = 13.sp)
                Switch(
                    checked = showLineNumbers,
                    onCheckedChange = { enabled ->
                        showLineNumbers = enabled
                        lineNumberPreferences.setShowLineNumbers(enabled)
                    },
                    modifier = Modifier.semantics { contentDescription = "行番号を表示" },
                )
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .onSizeChanged { editorViewportHeightPx = it.height }
                    .testTag("markdown-editor-scroll-viewport"),
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
                                    selectionRestoreAfterTap = selectionAtDown
                                    if (fieldValue.selection != selectionAtDown) {
                                        fieldValue = fieldValue.copy(selection = selectionAtDown)
                                        onTextFieldValueObserved(fieldValue)
                                    }
                                    toggleCheckbox.value(checkbox.sourceStart)
                                } else if (link != null) {
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
                        .onFocusChanged { hasFocus = it.isFocused },
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
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(48.dp),
                fieldValue = fieldValue,
                onValueChange = { next ->
                    fieldValue = next
                    onValueChange(next.text)
                    onTextFieldValueObserved(next)
                    focusRequester.requestFocus()
                    keyboardController?.show()
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
                    color = TaskChuteColors.SecondaryText,
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
    fieldValue: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
) {
    val scrollState = rememberScrollState()
    Row(
        modifier = modifier.horizontalScroll(scrollState).padding(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MarkdownToolbarAction(R.drawable.ic_material_format_bold_24, "太字", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::bold, onValueChange)
        }
        MarkdownToolbarAction(R.drawable.ic_material_format_h1_24, "見出し", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::heading, onValueChange)
        }
        MarkdownToolbarAction(R.drawable.ic_material_format_list_bulleted_24, "箇条書き", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::bullet, onValueChange)
        }
        MarkdownToolbarAction(R.drawable.ic_material_checklist_24, "チェックリスト", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::checkbox, onValueChange)
        }
        MarkdownToolbarAction(R.drawable.ic_material_format_quote_24, "引用", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::quote, onValueChange)
        }
        MarkdownToolbarAction(R.drawable.ic_material_link_24, "リンク", modifier = Modifier.width(48.dp)) {
            applyMarkdownCommand(fieldValue, MarkdownEditCommands::link, onValueChange)
        }
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
        modifier = modifier.size(44.dp).focusProperties { canFocus = false }.semantics { contentDescription = description },
    ) {
        Icon(
            painter = painterResource(iconResource),
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            tint = TaskChuteColors.PrimaryText,
        )
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
