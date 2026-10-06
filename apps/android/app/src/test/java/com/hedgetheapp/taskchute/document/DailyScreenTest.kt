package com.hedgetheapp.taskchute.document

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DailyScreenTest {
    @Test
    fun cursorIdentityWaitsForCanonicalDailyDocument() {
        assertNull(dailyCursorEditorIdentity(DailyUiState(selectedDate = "2026-10-06")))

        val identity = dailyCursorEditorIdentity(
            DailyUiState(
                selectedDate = "2026-10-06",
                document = dailyDocument("daily-document-a", "2026-10-06"),
            ),
        )

        assertEquals("daily-document-a", identity?.documentId)
        assertEquals("daily-document-a", identity?.sessionKey)
    }

    @Test
    fun differentDailyDocumentsGetIndependentEditorSessions() {
        val first = dailyCursorEditorIdentity(
            DailyUiState(document = dailyDocument("daily-document-a", "2026-10-06")),
        )
        val second = dailyCursorEditorIdentity(
            DailyUiState(document = dailyDocument("daily-document-b", "2026-10-07")),
        )

        assertEquals("daily-document-a", first?.documentId)
        assertEquals("daily-document-b", second?.documentId)
        assert(first?.sessionKey != second?.sessionKey)
    }

    private fun dailyDocument(documentId: String, date: String) = AndroidDailyDocument(
        documentId = documentId,
        taskchuteDayId = "day-$date",
        logicalDate = date,
        markdownBody = "body",
        revision = 1,
    )
}
