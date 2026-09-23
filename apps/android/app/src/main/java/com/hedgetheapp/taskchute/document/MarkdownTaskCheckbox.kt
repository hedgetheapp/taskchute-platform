package com.hedgetheapp.taskchute.document

import androidx.compose.ui.text.input.OffsetMapping
import java.net.URI

internal data class RenderedTaskCheckboxHit(
    val sourceStart: Int,
    val transformedStart: Int,
    val transformedEndExclusive: Int,
    val checked: Boolean,
    val label: String,
)

internal data class MarkdownLinkSourceRange(
    val sourceStart: Int,
    val sourceEndExclusive: Int,
    val destination: String,
)

internal data class RenderedMarkdownLinkHit(
    val sourceStart: Int,
    val sourceEndExclusive: Int,
    val transformedStart: Int,
    val transformedEndExclusive: Int,
    val destination: String,
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

internal fun preservedSelectionAfterCheckboxToggle(
    selection: MarkdownSelection,
    result: MarkdownEditResult,
): MarkdownSelection = MarkdownSelection(
    start = result.mapOffset(selection.start),
    end = result.mapOffset(selection.end),
)

internal fun markdownLinkSourceRanges(source: String): List<MarkdownLinkSourceRange> {
    val markdownRanges = MARKDOWN_LINK_PATTERN.findAll(source).mapNotNull { match ->
        val destination = trimUrl(match.groupValues[2]) ?: return@mapNotNull null
        val labelStart = match.range.first + 1
        MarkdownLinkSourceRange(
            sourceStart = labelStart,
            sourceEndExclusive = labelStart + match.groupValues[1].length,
            destination = destination,
        )
    }.toList()
    val result = markdownRanges.toMutableList()
    val protectedRanges = MARKDOWN_LINK_PATTERN.findAll(source).map { it.range }.toList()
    PLAIN_URL_PATTERN.findAll(source).forEach { match ->
        val url = trimUrl(match.value) ?: return@forEach
        val start = match.range.first
        val end = start + url.length
        if (protectedRanges.none { start < it.last + 1 && end > it.first }) {
            result += MarkdownLinkSourceRange(start, end, url)
        }
    }
    return result.sortedWith(compareBy<MarkdownLinkSourceRange> { it.sourceStart }.thenBy { it.sourceEndExclusive })
}

internal fun renderedMarkdownLinkHits(
    source: String,
    mapping: OffsetMapping,
): List<RenderedMarkdownLinkHit> = markdownLinkSourceRanges(source)
    .mapNotNull { range ->
        val transformedStart = mapping.originalToTransformed(range.sourceStart)
        val transformedEnd = mapping.originalToTransformed(range.sourceEndExclusive)
        if (transformedEnd <= transformedStart) {
            null
        } else {
            RenderedMarkdownLinkHit(
                sourceStart = range.sourceStart,
                sourceEndExclusive = range.sourceEndExclusive,
                transformedStart = transformedStart,
                transformedEndExclusive = transformedEnd,
                destination = range.destination,
            )
        }
    }

private fun trimUrl(raw: String): String? {
    var end = raw.length
    while (end > 0 && raw[end - 1] in TRAILING_URL_PUNCTUATION) end -= 1
    while (end > 0 && raw[end - 1] == ')' && raw.substring(0, end).count { it == ')' } > raw.substring(0, end).count { it == '(' }) {
        end -= 1
    }
    val value = raw.substring(0, end)
    if (value.isBlank()) return null
    val uri = runCatching { URI(value) }.getOrNull() ?: return null
    if (!uri.scheme.equals("http", ignoreCase = true) && !uri.scheme.equals("https", ignoreCase = true)) return null
    if (uri.rawAuthority.isNullOrBlank()) return null
    return value
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
private val MARKDOWN_LINK_PATTERN = Regex("\\[([^]\\r\\n]+)\\]\\((https?://[^\\s)]+)\\)", RegexOption.IGNORE_CASE)
private val PLAIN_URL_PATTERN = Regex("https?://[^\\s<>\\\"']+", RegexOption.IGNORE_CASE)
private val TRAILING_URL_PUNCTUATION = setOf('.', ',', ';', ':', '!', '?', '\u3002', '\u3001', '\uff0c', '\uff1b', '\uff1a', '\uff01', '\uff1f')
