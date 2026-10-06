package com.hedgetheapp.taskchute.document

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DocumentCursorPreferencesTest {
    @Test
    fun missingCursorHasNoSavedOffset() {
        assertNull(preferences().readCaretOffset(DOCUMENT_A))
    }

    @Test
    fun writeAndReadRoundTripsOneOffsetPerDocument() {
        val preferences = preferences()

        preferences.writeCaretOffset(DOCUMENT_A, 12)
        preferences.writeCaretOffset(DOCUMENT_B, 4)

        assertEquals(12, preferences.readCaretOffset(DOCUMENT_A))
        assertEquals(4, preferences.readCaretOffset(DOCUMENT_B))
    }

    @Test
    fun laterCaretPositionOverwritesEarlierPosition() {
        val preferences = preferences()
        preferences.writeCaretOffset(DOCUMENT_A, 12)
        preferences.writeCaretOffset(DOCUMENT_A, 19)

        assertEquals(19, preferences.readCaretOffset(DOCUMENT_A))
    }

    @Test
    fun duplicateAndInvalidWritesAreIgnored() {
        val storage = MemoryStorage()
        val preferences = DocumentCursorPreferences(storage)
        preferences.writeCaretOffset(DOCUMENT_A, 12)
        preferences.writeCaretOffset(DOCUMENT_A, 12)
        preferences.writeCaretOffset(DOCUMENT_A, -1)
        preferences.writeCaretOffset(" ", 3)

        assertEquals(1, storage.writeCount)
        assertEquals(12, preferences.readCaretOffset(DOCUMENT_A))
        assertNull(preferences.readCaretOffset(" "))
    }

    @Test
    fun negativeAndMalformedStoredValuesFallBackWithoutThrowing() {
        val storage = MemoryStorage()
        val keyA = "${DocumentCursorPreferences.CARET_OFFSET_PREFIX}$DOCUMENT_A"
        val keyB = "${DocumentCursorPreferences.CARET_OFFSET_PREFIX}$DOCUMENT_B"
        storage.values[keyA] = -5
        storage.values[keyB] = "not an integer"
        val preferences = DocumentCursorPreferences(storage)

        assertNull(preferences.readCaretOffset(DOCUMENT_A))
        assertNull(preferences.readCaretOffset(DOCUMENT_B))

        preferences.writeCaretOffset(DOCUMENT_B, 7)
        assertEquals(7, preferences.readCaretOffset(DOCUMENT_B))
    }

    private fun preferences(storage: MemoryStorage = MemoryStorage()) = DocumentCursorPreferences(storage)

    private class MemoryStorage : DocumentCursorPreferences.Storage {
        val values = mutableMapOf<String, Any>()
        var writeCount = 0

        override fun readInt(key: String): Int? = when (val value = values[key]) {
            null -> null
            is Int -> value
            else -> throw ClassCastException("Stored value is not an Int")
        }

        override fun writeInt(key: String, value: Int) {
            values[key] = value
            writeCount += 1
        }
    }

    private companion object {
        const val DOCUMENT_A = "document-a"
        const val DOCUMENT_B = "document-b"
    }
}
