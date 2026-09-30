package com.hedgetheapp.taskchute.wear

import java.security.SecureRandom
import java.util.UUID

/** UUIDv7 layout matching the canonical Android lifecycle request identity generator. */
internal object WearUUIDv7 {
    private val random = SecureRandom()

    @Synchronized
    fun next(): String {
        val timestamp = System.currentTimeMillis() and 0x0000FFFFFFFFFFFFL
        val most = (timestamp shl 16) or 0x7000L or (random.nextInt() and 0x0fff).toLong()
        val least = (random.nextLong() and 0x3fffffffffffffffL) or Long.MIN_VALUE
        return UUID(most, least).toString()
    }
}
