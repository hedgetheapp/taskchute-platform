package com.hedgetheapp.taskchute.document

import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.TextRange
import java.net.URI
import java.time.LocalDate

sealed interface AndroidInternalDocumentRoute {
    data class Note(val documentId: String) : AndroidInternalDocumentRoute
    data class Daily(val logicalDate: String) : AndroidInternalDocumentRoute
}

enum class InternalDocumentLinkKind { STANDALONE, TASK_PRIMARY, PROJECT_PRIMARY, DAILY_PRIMARY }

data class InternalDocumentLinkCandidate(
    val documentId: String,
    val kind: InternalDocumentLinkKind,
    val label: String,
    val context: String?,
    val archived: Boolean,
    val logicalDate: String?,
) {
    fun destination(): String = if (kind == InternalDocumentLinkKind.DAILY_PRIMARY) {
        "/?view=daily&date=${logicalDate ?: label}"
    } else {
        "/?view=note&document=$documentId"
    }
}

data class InternalDocumentLinkSearchPage(
    val candidates: List<InternalDocumentLinkCandidate>,
    val nextCursor: String?,
)

sealed interface InternalDocumentLinkSearchResult {
    data class Success(val page: InternalDocumentLinkSearchPage) : InternalDocumentLinkSearchResult
    data object Unauthorized : InternalDocumentLinkSearchResult
    data class Failure(val message: String) : InternalDocumentLinkSearchResult
}

data class InternalLinkQueryToken(
    val start: Int,
    val endExclusive: Int,
    val query: String,
    val hasClosingMarker: Boolean = false,
)

internal fun parseAndroidInternalDocumentRoute(destination: String): AndroidInternalDocumentRoute? {
    val uri = runCatching { URI(destination) }.getOrNull() ?: return null
    if (uri.scheme != null || uri.rawAuthority != null || uri.rawPath != "/" || uri.rawFragment != null) return null
    val pairs = uri.rawQuery?.split('&')?.map { pair ->
        val separator = pair.indexOf('=')
        if (separator <= 0 || separator != pair.lastIndexOf('=')) return null
        pair.substring(0, separator) to pair.substring(separator + 1)
    } ?: return null
    if (pairs.size != 2 || pairs.map { it.first }.toSet().size != 2 || pairs.any { it.second.isEmpty() }) return null
    val values = pairs.toMap()
    return when {
        values.keys == setOf("view", "document") && values["view"] == "note" -> {
            val id = values["document"] ?: return null
            if (!UUID_V7_PATTERN.matches(id)) null else AndroidInternalDocumentRoute.Note(id)
        }
        values.keys == setOf("view", "date") && values["view"] == "daily" -> {
            val date = values["date"] ?: return null
            val parsed = runCatching { LocalDate.parse(date) }.getOrNull() ?: return null
            if (parsed.toString() == date) AndroidInternalDocumentRoute.Daily(date) else null
        }
        else -> null
    }
}

internal fun markdownDestinationIsSafe(destination: String): Boolean {
    if (parseAndroidInternalDocumentRoute(destination) != null) return true
    val uri = runCatching { URI(destination) }.getOrNull() ?: return false
    return (uri.scheme.equals("http", ignoreCase = true) || uri.scheme.equals("https", ignoreCase = true)) &&
        !uri.rawAuthority.isNullOrBlank()
}

internal fun activeInternalLinkQuery(value: TextFieldValue): InternalLinkQueryToken? {
    if (value.composition != null || !value.selection.collapsed) return null
    val caret = value.selection.end.coerceIn(0, value.text.length)
    val lineStart = value.text.lastIndexOf('\n', (caret - 1).coerceAtLeast(0)).let { if (it < 0) 0 else it + 1 }
    val opening = value.text.lastIndexOf("[[", caret - 1)
    if (opening < lineStart) return null
    val query = value.text.substring(opening + 2, caret)
    if (query.contains(']') || query.contains('\n') || query.length > 80) return null
    return InternalLinkQueryToken(
        start = opening,
        endExclusive = caret,
        query = query,
        hasClosingMarker = value.text.startsWith("]]", caret),
    )
}

internal fun insertInternalLinkTrigger(current: TextFieldValue): TextFieldValue? {
    if (current.composition != null) return null
    val start = current.selection.min.coerceIn(0, current.text.length)
    val end = current.selection.max.coerceIn(start, current.text.length)
    val selected = current.text.substring(start, end)
    if (selected.contains('\n') || selected.contains('\r')) return null

    val nextText = current.text.replaceRange(start, end, "[[$selected]]")
    return current.copy(
        text = nextText,
        selection = TextRange(start + 2 + selected.length),
    )
}

internal fun isInternalLinkSearchCurrent(
    token: InternalLinkQueryToken,
    current: TextFieldValue,
    dismissed: InternalLinkQueryToken?,
): Boolean = activeInternalLinkQuery(current) == token && dismissed != token

internal fun insertInternalMarkdownLink(
    current: TextFieldValue,
    expected: InternalLinkQueryToken,
    candidate: InternalDocumentLinkCandidate,
): TextFieldValue? {
    val replacementEnd = expected.endExclusive + if (expected.hasClosingMarker) 2 else 0
    if (current.composition != null || replacementEnd > current.text.length ||
        current.text.substring(expected.start, expected.endExclusive) != "[[${expected.query}" ||
        (expected.hasClosingMarker && current.text.substring(expected.endExclusive, replacementEnd) != "]]") ||
        current.selection.end != expected.endExclusive || !current.selection.collapsed
    ) return null
    val label = candidate.label.replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")
    val markdown = "[$label](${candidate.destination()})"
    val end = expected.start + markdown.length
    val text = current.text.replaceRange(expected.start, replacementEnd, markdown)
    return current.copy(text = text, selection = TextRange(end))
}

private val UUID_V7_PATTERN = Regex("(?i)[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
