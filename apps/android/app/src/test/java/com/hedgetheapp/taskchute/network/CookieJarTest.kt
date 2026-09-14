package com.hedgetheapp.taskchute.network

import com.hedgetheapp.taskchute.auth.SessionCredential
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CookieJarTest {
    @Test
    fun capturesDynamicCookieNamesAndStripsAttributes() {
        val jar = CookieJar()

        jar.capture(listOf("__Secure-session_token=opaque-value; Path=/; HttpOnly", "another=two; Secure"))

        assertEquals("__Secure-session_token=opaque-value; another=two", jar.headerValue())
        assertEquals(mapOf("__Secure-session_token" to "opaque-value", "another" to "two"), jar.snapshot()?.cookies)
    }

    @Test
    fun emptySetCookieDeletesOnlyThatCookie() {
        val jar = CookieJar()
        jar.replace(SessionCredential(mapOf("first" to "one", "second" to "two")))

        jar.capture(listOf("first=; Max-Age=0", "malformed"))

        assertEquals(mapOf("second" to "two"), jar.snapshot()?.cookies)
    }

    @Test
    fun captureReportsDeletedCookieNames() {
        val jar = CookieJar()
        jar.replace(SessionCredential(mapOf("session" to "one")))

        assertEquals(setOf("session"), jar.capture(listOf("session=; Max-Age=0")))
    }

    @Test
    fun replacementDoesNotDependOnAWellKnownBetterAuthName() {
        val jar = CookieJar()
        jar.replace(SessionCredential(mapOf("server-chosen-cookie" to "opaque")))

        assertTrue(jar.headerValue()!!.contains("server-chosen-cookie=opaque"))
    }
}
