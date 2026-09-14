package com.hedgetheapp.taskchute.network

internal enum class BetterAuthSessionBody {
    AUTHENTICATED,
    NO_SESSION,
    MALFORMED,
}

internal object BetterAuthSessionResponseParser {
    fun validate(body: String?): BetterAuthSessionBody {
        val root = runCatching { JsonParser(body ?: "").parse() }.getOrNull() ?: return BetterAuthSessionBody.MALFORMED
        if (root === JsonValue.Null) return BetterAuthSessionBody.NO_SESSION
        val rootObject = root as? JsonValue.Object ?: return BetterAuthSessionBody.MALFORMED
        val session = rootObject.fields["session"]
        val user = rootObject.fields["user"]
        if (session === JsonValue.Null && user === JsonValue.Null) return BetterAuthSessionBody.NO_SESSION
        val sessionObject = session as? JsonValue.Object ?: return BetterAuthSessionBody.MALFORMED
        val userObject = user as? JsonValue.Object ?: return BetterAuthSessionBody.MALFORMED
        val sessionId = (sessionObject.fields["id"] as? JsonValue.StringValue)?.value.orEmpty()
        val userId = (userObject.fields["id"] as? JsonValue.StringValue)?.value.orEmpty()
        val sessionUserId = (sessionObject.fields["userId"] as? JsonValue.StringValue)?.value
        return if (sessionId.isBlank() || userId.isBlank() || (sessionUserId != null && sessionUserId != userId)) {
            BetterAuthSessionBody.MALFORMED
        } else {
            BetterAuthSessionBody.AUTHENTICATED
        }
    }
}

internal sealed interface JsonValue {
    data object Null : JsonValue
    data class Object(val fields: Map<String, JsonValue>) : JsonValue
    data class Array(val values: List<JsonValue>) : JsonValue
    data class StringValue(val value: String) : JsonValue
    data class NumberValue(val value: String) : JsonValue
    data class BooleanValue(val value: Boolean) : JsonValue
}

internal class JsonParser(private val input: String) {
    private var index = 0

    fun parse(): JsonValue {
        skipWhitespace()
        val value = parseValue()
        skipWhitespace()
        require(index == input.length) { "trailing JSON content" }
        return value
    }

    private fun parseValue(): JsonValue {
        skipWhitespace()
        return when (input.getOrNull(index)) {
            'n' -> parseLiteral("null", JsonValue.Null)
            't' -> parseLiteral("true", JsonValue.BooleanValue(true))
            'f' -> parseLiteral("false", JsonValue.BooleanValue(false))
            '"' -> JsonValue.StringValue(parseString())
            '{' -> parseObject()
            '[' -> parseArray()
            '-', in '0'..'9' -> JsonValue.NumberValue(parseNumber())
            else -> error("invalid JSON value")
        }
    }

    private fun parseObject(): JsonValue.Object {
        expect('{')
        skipWhitespace()
        val fields = linkedMapOf<String, JsonValue>()
        if (takeIf('}')) return JsonValue.Object(fields)
        while (true) {
            val key = parseString()
            require(fields.put(key, run { expect(':'); parseValue() }) == null) { "duplicate JSON key" }
            skipWhitespace()
            if (takeIf('}')) return JsonValue.Object(fields)
            expect(',')
            skipWhitespace()
        }
    }

    private fun parseArray(): JsonValue.Array {
        expect('[')
        skipWhitespace()
        val values = mutableListOf<JsonValue>()
        if (takeIf(']')) return JsonValue.Array(values)
        while (true) {
            values += parseValue()
            skipWhitespace()
            if (takeIf(']')) return JsonValue.Array(values)
            expect(',')
            skipWhitespace()
        }
    }

    private fun parseString(): String {
        expect('"')
        val value = StringBuilder()
        while (true) {
            val character = input.getOrNull(index++) ?: error("unterminated JSON string")
            when (character) {
                '"' -> return value.toString()
                '\\' -> value.append(parseEscape())
                else -> {
                    require(character.code >= 0x20) { "control character in JSON string" }
                    value.append(character)
                }
            }
        }
    }

    private fun parseEscape(): Char = when (val escaped = input.getOrNull(index++) ?: error("unterminated JSON escape")) {
        '"', '\\', '/' -> escaped
        'b' -> '\b'
        'f' -> '\u000C'
        'n' -> '\n'
        'r' -> '\r'
        't' -> '\t'
        'u' -> {
            val digits = input.substring(index, index + 4)
            require(digits.length == 4 && digits.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) { "invalid unicode escape" }
            index += 4
            digits.toInt(16).toChar()
        }
        else -> error("invalid JSON escape")
    }

    private fun parseNumber(): String {
        val start = index
        if (takeIf('-')) Unit
        when {
            takeIf('0') -> Unit
            input.getOrNull(index)?.let { it in '1'..'9' } == true -> {
                index++
                while (input.getOrNull(index)?.let { it in '0'..'9' } == true) index++
            }
            else -> error("invalid JSON number")
        }
        if (takeIf('.')) {
            require(input.getOrNull(index)?.let { it in '0'..'9' } == true) { "invalid JSON fraction" }
            while (input.getOrNull(index)?.let { it in '0'..'9' } == true) index++
        }
        if (input.getOrNull(index) == 'e' || input.getOrNull(index) == 'E') {
            index++
            if (input.getOrNull(index) == '+' || input.getOrNull(index) == '-') index++
            require(input.getOrNull(index)?.let { it in '0'..'9' } == true) { "invalid JSON exponent" }
            while (input.getOrNull(index)?.let { it in '0'..'9' } == true) index++
        }
        return input.substring(start, index)
    }

    private fun <T : JsonValue> parseLiteral(expected: String, value: T): T {
        require(input.regionMatches(index, expected, 0, expected.length)) { "invalid JSON literal" }
        index += expected.length
        return value
    }

    private fun expect(expected: Char) {
        require(input.getOrNull(index++) == expected) { "expected JSON '$expected'" }
    }

    private fun takeIf(expected: Char): Boolean {
        if (input.getOrNull(index) != expected) return false
        index++
        return true
    }

    private fun skipWhitespace() {
        while (input.getOrNull(index)?.let { it == ' ' || it == '\n' || it == '\r' || it == '\t' } == true) index++
    }
}
