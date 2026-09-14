package com.hedgetheapp.taskchute.network

import org.junit.Assert.assertEquals
import org.junit.Test

class AuthRequestJsonTest {
    @Test
    fun escapesJsonAndUsesUtf8SafeStringValues() {
        assertEquals(
            "{\"email\":\"a\\\"@example.test\",\"password\":\"p\\\\\\n\"}",
            AuthRequestJson.signIn("a\"@example.test", "p\\\n"),
        )
    }
}
