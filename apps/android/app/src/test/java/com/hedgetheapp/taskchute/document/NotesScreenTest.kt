package com.hedgetheapp.taskchute.document

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotesScreenTest {
    @Test
    fun navigationBarIsHiddenOnlyForOpenEditorWithVisibleIme() {
        assertTrue(shouldShowNotesNavigationBar(editorOpen = false, imeVisible = false))
        assertTrue(shouldShowNotesNavigationBar(editorOpen = false, imeVisible = true))
        assertTrue(shouldShowNotesNavigationBar(editorOpen = true, imeVisible = false))
        assertFalse(shouldShowNotesNavigationBar(editorOpen = true, imeVisible = true))
    }

    @Test
    fun selectionLongPressIsBlockedOnlyWhileSelectionOrListScrollIsActive() {
        assertTrue(canStartNotesSelection(selectionModeActive = false, listScrollInProgress = false))
        assertFalse(canStartNotesSelection(selectionModeActive = false, listScrollInProgress = true))
        assertFalse(canStartNotesSelection(selectionModeActive = true, listScrollInProgress = false))
        assertFalse(canStartNotesSelection(selectionModeActive = true, listScrollInProgress = true))
    }

    @Test
    fun allMaterializedNoteKindsUseCanonicalDocumentIdAndEditorSession() {
        listOf(DocumentKind.STANDALONE, DocumentKind.TASK_PRIMARY, DocumentKind.PROJECT_PRIMARY).forEachIndexed { index, kind ->
            val documentId = "document-$index"
            val identity = noteCursorEditorIdentity(editor(kind, documentId, sessionId = 40 + index))

            assertEquals(40 + index, identity.sessionId)
            assertEquals(documentId, identity.documentId)
        }
    }

    @Test
    fun identityAdoptionKeepsNewNoteSessionWithoutReadingAnUnstableKey() {
        val unmaterialized = NoteEditorState(
            kind = DocumentKind.STANDALONE,
            document = null,
            markdownBody = "active in-session text",
            sessionId = 73,
        )
        val beforeAdoption = noteCursorEditorIdentity(unmaterialized)
        val afterAdoption = noteCursorEditorIdentity(
            unmaterialized.copy(document = document(DocumentKind.STANDALONE, "stable-document")),
        )

        assertNull(beforeAdoption.documentId)
        assertEquals(73, beforeAdoption.sessionId)
        assertEquals(beforeAdoption.sessionId, afterAdoption.sessionId)
        assertEquals("stable-document", afterAdoption.documentId)
    }

    private fun editor(kind: DocumentKind, documentId: String, sessionId: Int) = NoteEditorState(
        kind = kind,
        document = document(kind, documentId),
        sessionId = sessionId,
    )

    private fun document(kind: DocumentKind, documentId: String) = AndroidDocument(
        documentId = documentId,
        kind = kind,
        title = "title",
        markdownBody = "body",
        revision = 1,
    )
}
