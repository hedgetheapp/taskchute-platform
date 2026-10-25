package com.hedgetheapp.taskchute.document

import android.content.Context
import android.content.SharedPreferences

/** Device-local Markdown editor display preferences. */
internal class MarkdownEditorPreferences internal constructor(
    private val storage: Storage,
) {
    constructor(context: Context) : this(
        SharedPreferencesStorage(
            context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE),
        ),
    )

    fun showLineNumbers(): Boolean = runCatching { storage.readBoolean(SHOW_LINE_NUMBERS_KEY) }.getOrNull() ?: true

    fun setShowLineNumbers(enabled: Boolean) {
        runCatching { storage.writeBoolean(SHOW_LINE_NUMBERS_KEY, enabled) }
    }

    internal interface Storage {
        fun readBoolean(key: String): Boolean?
        fun writeBoolean(key: String, value: Boolean)
    }

    private class SharedPreferencesStorage(
        private val preferences: SharedPreferences,
    ) : Storage {
        override fun readBoolean(key: String): Boolean? =
            if (preferences.contains(key)) preferences.getBoolean(key, true) else null

        override fun writeBoolean(key: String, value: Boolean) {
            preferences.edit().putBoolean(key, value).apply()
        }
    }

    companion object {
        internal const val PREFERENCES_NAME = "taskchute.markdown.editor.v1"
        internal const val SHOW_LINE_NUMBERS_KEY = "show_source_line_numbers.v1"
    }
}
