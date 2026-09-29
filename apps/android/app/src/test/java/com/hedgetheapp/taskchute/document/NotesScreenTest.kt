package com.hedgetheapp.taskchute.document

import org.junit.Assert.assertFalse
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
}
