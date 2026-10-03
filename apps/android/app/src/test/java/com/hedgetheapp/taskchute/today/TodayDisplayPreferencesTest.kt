package com.hedgetheapp.taskchute.today

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TodayDisplayPreferencesTest {
    @Test
    fun completedVisibilityDefaultsToShown() {
        assertTrue(preferences().showCompleted())
    }

    @Test
    fun savedOffRestoresOff() {
        val storage = MemoryStorage()
        preferences(storage).setShowCompleted(false)
        assertFalse(preferences(storage).showCompleted())
    }

    @Test
    fun savedOnRestoresOn() {
        val storage = MemoryStorage()
        preferences(storage).setShowCompleted(false)
        preferences(storage).setShowCompleted(true)
        assertTrue(preferences(storage).showCompleted())
    }

    @Test
    fun noSavedCollapseStateDefaultsExpanded() {
        assertTrue(preferences().collapsedSections(DATE_A).isEmpty())
    }

    @Test
    fun collapseStateRestoresForItsLogicalDate() {
        val storage = MemoryStorage()
        preferences(storage).setCollapsedSections(DATE_A, setOf("section-a"))
        assertEquals(setOf("section-a"), preferences(storage).collapsedSections(DATE_A))
    }

    @Test
    fun collapseStateDoesNotLeakToAnotherDate() {
        val storage = MemoryStorage()
        preferences(storage).setCollapsedSections(DATE_A, setOf("section-a"))
        assertTrue(preferences(storage).collapsedSections(DATE_B).isEmpty())
    }

    @Test
    fun unsectionedGroupUsesStablePersistedKey() {
        val storage = MemoryStorage()
        preferences(storage).setCollapsedSections(DATE_A, setOf(TodayDisplayPreferences.UNSECTIONED_KEY))
        assertEquals(setOf(TodayDisplayPreferences.UNSECTIONED_KEY), preferences(storage).collapsedSections(DATE_A))
    }

    @Test
    fun expandingRemovesPersistedCollapseKey() {
        val storage = MemoryStorage()
        preferences(storage).setCollapsedSections(DATE_A, setOf("section-a"))
        preferences(storage).setCollapsedSections(DATE_A, emptySet())
        assertTrue(preferences(storage).collapsedSections(DATE_A).isEmpty())
    }

    @Test
    fun pruningRemovesDeletedSectionIds() {
        val storage = MemoryStorage()
        preferences(storage).setCollapsedSections(DATE_A, setOf("deleted-section"))
        assertTrue(preferences(storage).pruneCollapsedSections(DATE_A, setOf("section-a")).isEmpty())
        assertTrue(preferences(storage).collapsedSections(DATE_A).isEmpty())
    }

    @Test
    fun pruningPreservesCanonicalSectionIds() {
        val storage = MemoryStorage()
        preferences(storage).setCollapsedSections(DATE_A, setOf("section-a", "deleted-section"))
        assertEquals(setOf("section-a"), preferences(storage).pruneCollapsedSections(DATE_A, setOf("section-a")))
    }

    @Test
    fun malformedStorageValuesFallBackWithoutThrowing() {
        val storage = MemoryStorage().apply {
            malformedKeys += TodayDisplayPreferences.SHOW_COMPLETED_KEY
            malformedKeys += "${TodayDisplayPreferences.COLLAPSED_SECTIONS_PREFIX}$DATE_A"
        }
        val preferences = preferences(storage)
        assertTrue(preferences.showCompleted())
        assertTrue(preferences.collapsedSections(DATE_A).isEmpty())
        preferences.setShowCompleted(false)
        preferences.setCollapsedSections(DATE_A, setOf("section-a"))
        assertFalse(preferences.showCompleted())
        assertEquals(setOf("section-a"), preferences.collapsedSections(DATE_A))
    }

    private fun preferences(storage: MemoryStorage = MemoryStorage()) = TodayDisplayPreferences(storage)

    private class MemoryStorage : TodayDisplayPreferences.Storage {
        private val booleans = mutableMapOf<String, Boolean>()
        private val sets = mutableMapOf<String, Set<String>>()
        val malformedKeys = mutableSetOf<String>()

        override fun readBoolean(key: String, defaultValue: Boolean): Boolean {
            check(key !in malformedKeys)
            return booleans[key] ?: defaultValue
        }

        override fun writeBoolean(key: String, value: Boolean) {
            malformedKeys.remove(key)
            booleans[key] = value
        }

        override fun readStringSet(key: String): Set<String>? {
            check(key !in malformedKeys)
            return sets[key]
        }

        override fun writeStringSet(key: String, value: Set<String>) {
            malformedKeys.remove(key)
            sets[key] = value.toSet()
        }

        override fun remove(key: String) {
            malformedKeys.remove(key)
            sets.remove(key)
            booleans.remove(key)
        }
    }

    private companion object {
        const val DATE_A = "2026-10-03"
        const val DATE_B = "2026-10-04"
    }
}
