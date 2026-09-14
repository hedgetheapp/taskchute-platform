package com.hedgetheapp.taskchute.config

import java.net.URI

object AppConfig {
    fun validateBaseUrl(raw: String): String {
        val value = raw.trim().removeSuffix("/")
        require(value.isNotEmpty()) { "TaskChute server URL is not configured" }
        val uri = URI(value)
        val schemeAllowed = uri.scheme == "https" || (uri.scheme == "http" && uri.host in setOf("127.0.0.1", "localhost"))
        require(schemeAllowed) { "TaskChute server URL must use HTTPS" }
        require(uri.userInfo == null && uri.query == null && uri.fragment == null) { "TaskChute server URL must not contain credentials or query data" }
        require(!uri.path.orEmpty().contains("..")) { "TaskChute server URL path is invalid" }
        return value
    }
}
