package com.hedgetheapp.taskchute.today

import java.util.LinkedHashMap

/** Small controller-owned LRU of canonical Day reads. Nothing is persisted. */
internal class TodayDayMemoryCache(private val capacity: Int = DEFAULT_CAPACITY) {
    init {
        require(capacity > 0)
    }

    private val entries = LinkedHashMap<String, TodayDay>(capacity, 0.75f, true)

    val size: Int get() = entries.size

    operator fun get(logicalDate: String): TodayDay? = entries[logicalDate]

    fun put(day: TodayDay) {
        entries[day.logicalDate] = day
        while (entries.size > capacity) {
            val leastRecentlyUsed = entries.entries.iterator()
            if (!leastRecentlyUsed.hasNext()) break
            leastRecentlyUsed.next()
            leastRecentlyUsed.remove()
        }
    }

    fun remove(logicalDate: String) {
        entries.remove(logicalDate)
    }

    fun clear() {
        entries.clear()
    }

    companion object {
        const val DEFAULT_CAPACITY = 3
    }
}
