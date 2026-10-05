package com.hedgetheapp.taskchute.today

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class TodayDayMemoryCacheTest {
    @Test
    fun cacheIsBoundedAndEvictsLeastRecentlyUsedDay() {
        val cache = TodayDayMemoryCache(capacity = 3)
        val days = (1..4).map { day("2026-10-0$it") }
        days.take(3).forEach(cache::put)

        assertSame(days[0], cache[days[0].logicalDate]) // promote Day 1
        cache.put(days[3])

        assertSame(days[0], cache[days[0].logicalDate])
        assertNull(cache[days[1].logicalDate])
        assertSame(days[2], cache[days[2].logicalDate])
        assertSame(days[3], cache[days[3].logicalDate])
        assertEquals(3, cache.size)
    }

    @Test
    fun cacheSupportsDateInvalidationAndSessionClear() {
        val cache = TodayDayMemoryCache()
        val first = day("2026-10-01")
        val second = day("2026-10-02")
        cache.put(first)
        cache.put(second)

        cache.remove(first.logicalDate)
        assertNull(cache[first.logicalDate])
        assertSame(second, cache[second.logicalDate])

        cache.clear()
        assertEquals(0, cache.size)
        assertNull(cache[second.logicalDate])
    }

    private fun day(date: String) = TodayDay(
        logicalDate = date,
        isCurrent = false,
        planningEnabled = false,
        placementRevision = 1,
        sections = emptyList(),
        unsectionedEntries = emptyList(),
        activeExecution = null,
    )
}
