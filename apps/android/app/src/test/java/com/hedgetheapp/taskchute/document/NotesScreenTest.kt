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
}
