package com.hedgetheapp.taskchute.today

import android.content.Context
import android.content.SharedPreferences

/** Device-local presentation preferences for the Android Today surface. */
internal class TodayDisplayPreferences internal constructor(
    private val storage: Storage,
) {
    constructor(context: Context) : this(
        SharedPreferencesStorage(
            context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE),
        ),
    )

    fun showCompleted(): Boolean = runCatching {
        storage.readBoolean(SHOW_COMPLETED_KEY, defaultValue = true)
    }.getOrDefault(true)

    fun setShowCompleted(show: Boolean) {
        runCatching { storage.writeBoolean(SHOW_COMPLETED_KEY, show) }
    }

    fun collapsedSections(logicalDate: String): Set<String> {
        if (runCatching { java.time.LocalDate.parse(logicalDate) }.isFailure) return emptySet()
        return runCatching { storage.readStringSet(collapseKey(logicalDate)).orEmpty().toSet() }
            .getOrDefault(emptySet())
            .filter(String::isNotBlank)
            .toSet()
    }

    fun setCollapsedSections(logicalDate: String, sectionKeys: Set<String>) {
        if (runCatching { java.time.LocalDate.parse(logicalDate) }.isFailure) return
        val key = collapseKey(logicalDate)
        runCatching {
            if (sectionKeys.isEmpty()) storage.remove(key) else storage.writeStringSet(key, sectionKeys.toSet())
        }
    }

    fun pruneCollapsedSections(logicalDate: String, validSectionKeys: Set<String>): Set<String> {
        val saved = collapsedSections(logicalDate)
        val pruned = saved intersect validSectionKeys
        if (saved != pruned) setCollapsedSections(logicalDate, pruned)
        return pruned
    }

    private fun collapseKey(logicalDate: String) = "$COLLAPSED_SECTIONS_PREFIX$logicalDate"

    internal interface Storage {
        fun readBoolean(key: String, defaultValue: Boolean): Boolean
        fun writeBoolean(key: String, value: Boolean)
        fun readStringSet(key: String): Set<String>?
        fun writeStringSet(key: String, value: Set<String>)
        fun remove(key: String)
    }

    private class SharedPreferencesStorage(
        private val preferences: SharedPreferences,
    ) : Storage {
        override fun readBoolean(key: String, defaultValue: Boolean) = preferences.getBoolean(key, defaultValue)
        override fun writeBoolean(key: String, value: Boolean) { preferences.edit().putBoolean(key, value).apply() }
        override fun readStringSet(key: String) = preferences.getStringSet(key, null)?.toSet()
        override fun writeStringSet(key: String, value: Set<String>) {
            preferences.edit().putStringSet(key, value.toSet()).apply()
        }
        override fun remove(key: String) { preferences.edit().remove(key).apply() }
    }

    companion object {
        internal const val PREFERENCES_NAME = "taskchute.today.display.v1"
        internal const val SHOW_COMPLETED_KEY = "show_completed.v1"
        internal const val COLLAPSED_SECTIONS_PREFIX = "collapsed_sections.v1."
        internal const val UNSECTIONED_KEY = "__unsectioned__"
    }
}
