package com.hedgetheapp.taskchute.network

import com.hedgetheapp.taskchute.auth.SessionCredential

class CookieJar {
    private val cookies = linkedMapOf<String, String>()

    fun replace(session: SessionCredential?) {
        cookies.clear()
        if (session != null) cookies.putAll(session.cookies)
    }

    fun capture(setCookieHeaders: Iterable<String>) {
        for (header in setCookieHeaders) {
            val firstPart = header.substringBefore(';')
            val separator = firstPart.indexOf('=')
            if (separator <= 0) continue
            val name = firstPart.substring(0, separator).trim()
            val value = firstPart.substring(separator + 1).trim()
            if (!isCookieName(name) || value.any { it == '\r' || it == '\n' }) continue
            if (value.isEmpty()) cookies.remove(name) else cookies[name] = value
        }
    }

    fun snapshot(): SessionCredential? = cookies.takeIf { it.isNotEmpty() }?.let { SessionCredential(it.toSortedMap()) }

    fun headerValue(): String? = cookies.toSortedMap().entries.joinToString("; ") { "${it.key}=${it.value}" }.takeIf { it.isNotEmpty() }

    fun clear() = cookies.clear()

    private fun isCookieName(value: String): Boolean = value.isNotEmpty() && value.all {
        it.isLetterOrDigit() || it in "!#$%&'*+-.^_`|~"
    }
}
