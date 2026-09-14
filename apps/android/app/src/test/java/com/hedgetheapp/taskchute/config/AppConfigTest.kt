package com.hedgetheapp.taskchute.config

import org.junit.Assert.assertEquals
import org.junit.Test

class AppConfigTest {
    @Test
    fun acceptsHttpsAndStripsTrailingSlash() {
        assertEquals("https://taskchute.example", AppConfig.validateBaseUrl(" https://taskchute.example/ "))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsPlainHttpOutsideLoopback() {
        AppConfig.validateBaseUrl("http://taskchute.example")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsCredentialsInBaseUrl() {
        AppConfig.validateBaseUrl("https://user:password@taskchute.example")
    }
}
