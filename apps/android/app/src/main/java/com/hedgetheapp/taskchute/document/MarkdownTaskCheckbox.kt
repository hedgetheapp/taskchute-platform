package com.hedgetheapp.taskchute.document

import androidx.compose.ui.text.input.OffsetMapping

internal data class RenderedTaskCheckboxHit(
    val sourceStart: Int,
    val transformedStart: Int,
    val transformedEndExclusive: Int,
    val checked: Boolean,
    val label: String,
)

internal fun toggleTaskCheckbox(source: String, markerStart: Int): MarkdownEditResult? {
    if (markerStart < 0 || markerStart + TASK_CHECKBOX_MARKER_LENGTH > source.length) return null
    val marker = source.substring(markerStart, markerStart + TASK_CHECKBOX_MARKER_LENGTH)
    val replacement = when (marker) {
        "- [ ] " -> "- [x] "
        "- [x] ", "- [X] " -> "- [ ] "
        else -> return null
    }
    return MarkdownEditResult(
        text = source.replaceRange(markerStart, markerStart + TASK_CHECKBOX_MARKER_LENGTH, replacement),
        selection = MarkdownSelection(markerStart, markerStart),
    )
}

internal fun renderedTaskCheckboxHits(
    source: String,
    selection: MarkdownSelection,
    mapping: OffsetMapping,
): List<RenderedTaskCheckboxHit> {
    val active = activeLineStarts(source, selection)
    val hits = mutableListOf<RenderedTaskCheckboxHit>()
    var lineStart = 0
    source.split('\n').forEach { lineWithPossibleCarriageReturn ->
        val line = lineWithPossibleCarriageReturn.removeSuffix("\r")
        val task = TASK_CHECKBOX_PATTERN.matchEntire(line)
        if (task != null && lineStart !in active) {
            val sourceEnd = lineStart + TASK_CHECKBOX_MARKER_LENGTH
            val transformedStart = mapping.originalToTransformed(lineStart)
            val transformedEnd = mapping.originalToTransformed(sourceEnd)
            if (transformedEnd > transformedStart) {
                hits += RenderedTaskCheckboxHit(
                    sourceStart = lineStart,
                    transformedStart = transformedStart,
                    transformedEndExclusive = transformedEnd,
                    checked = task.groupValues[1].equals("x", ignoreCase = true),
                    label = task.groupValues[2],
                )
            }
        }
        lineStart += lineWithPossibleCarriageReturn.length + 1
    }
    return hits
}

private fun activeLineStarts(source: String, selection: MarkdownSelection): Set<Int> {
    val range = selection.normalized(source.length)
    val active = mutableSetOf<Int>()
    var lineStart = 0
    source.split('\n').forEach { lineWithPossibleCarriageReturn ->
        val lineEnd = lineStart + lineWithPossibleCarriageReturn.removeSuffix("\r").length
        val touched = if (range.collapsed) {
            range.start in lineStart..lineEnd
        } else {
            range.start < lineEnd + 1 && range.end > lineStart
        }
        if (touched) active += lineStart
        lineStart += lineWithPossibleCarriageReturn.length + 1
    }
    return active
}

private const val TASK_CHECKBOX_MARKER_LENGTH = 6
private val TASK_CHECKBOX_PATTERN = Regex("^- \\[([ xX])\\] (.*)$")
