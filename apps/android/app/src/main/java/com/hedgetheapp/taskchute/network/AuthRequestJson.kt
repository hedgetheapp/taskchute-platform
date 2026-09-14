package com.hedgetheapp.taskchute.network

object AuthRequestJson {
    fun signIn(email: String, password: String): String =
        "{\"email\":\"${escape(email)}\",\"password\":\"${escape(password)}\"}"

    private fun escape(value: String): String = buildString {
        for (character in value) {
            when (character) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (character.code < 0x20) append("\\u%04x".format(character.code)) else append(character)
            }
        }
    }
}
