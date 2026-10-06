package com.hedgetheapp.taskchute.document

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue

/** Device-local caret offsets keyed only by canonical Document identity. */
internal class DocumentCursorPreferences internal constructor(
    private val storage: Storage,
) {
    constructor(context: Context) : this(
        SharedPreferencesStorage(
            context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE),
        ),
    )

    private val lastWrittenOffsets = mutableMapOf<String, Int>()

    fun readCaretOffset(documentId: String): Int? {
        if (documentId.isBlank()) return null
        return runCatching { storage.readInt(key(documentId)) }
            .getOrNull()
            ?.takeIf { it >= 0 }
    }

    fun writeCaretOffset(documentId: String, offset: Int) {
        if (documentId.isBlank() || offset < 0) return
        if (lastWrittenOffsets[documentId] == offset) return
        if (readCaretOffset(documentId) == offset) {
            lastWrittenOffsets[documentId] = offset
            return
        }
        storage.writeInt(key(documentId), offset)
        lastWrittenOffsets[documentId] = offset
    }

    private fun key(documentId: String) = "$CARET_OFFSET_PREFIX$documentId"

    internal interface Storage {
        fun readInt(key: String): Int?
        fun writeInt(key: String, value: Int)
    }

    private class SharedPreferencesStorage(
        private val preferences: SharedPreferences,
    ) : Storage {
        override fun readInt(key: String): Int? {
            if (!preferences.contains(key)) return null
            return preferences.getInt(key, 0)
        }

        override fun writeInt(key: String, value: Int) {
            preferences.edit().putInt(key, value).apply()
        }
    }

    companion object {
        internal const val PREFERENCES_NAME = "taskchute.document.cursor.v1"
        internal const val CARET_OFFSET_PREFIX = "caret_offset.v1."
    }
}

internal fun initialMarkdownTextFieldValue(value: String, savedCaretOffset: Int?): TextFieldValue {
    val offset = savedCaretOffset ?: return TextFieldValue(value)
    return TextFieldValue(value, selection = TextRange(offset.coerceIn(0, value.length)))
}

internal fun persistedDocumentCaretOffset(selection: TextRange): Int = selection.end

internal fun clampMarkdownTextFieldValueToBody(fieldValue: TextFieldValue, body: String): TextFieldValue {
    if (fieldValue.text == body) return fieldValue
    return fieldValue.copy(
        text = body,
        selection = TextRange(
            fieldValue.selection.start.coerceIn(0, body.length),
            fieldValue.selection.end.coerceIn(0, body.length),
        ),
        composition = null,
    )
}
