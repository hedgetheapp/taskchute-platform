package com.hedgetheapp.taskchute.realtime

import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue

internal const val REALTIME_PROTOCOL_VERSION = 1
internal const val REALTIME_MAX_MESSAGE_BYTES = 16 * 1024

internal data class AndroidRealtimeInvalidation(
    val dayScopes: List<AndroidRealtimeDayScope>,
)

internal data class AndroidRealtimeDayScope(
    val logicalDate: String?,
)

internal object RealtimeInvalidationParser {
    fun parse(serialized: String): AndroidRealtimeInvalidation? {
        if (serialized.toByteArray(Charsets.UTF_8).size > REALTIME_MAX_MESSAGE_BYTES) return null
        val root = runCatching { JsonParser(serialized).parse() }.getOrNull() as? JsonValue.Object ?: return null
        if (!hasOnly(root, "version", "type", "scopes")) return null
        val version = (root.fields["version"] as? JsonValue.NumberValue)?.value?.toDoubleOrNull() ?: return null
        if (version != REALTIME_PROTOCOL_VERSION.toDouble()) return null
        if ((root.fields["type"] as? JsonValue.StringValue)?.value != "invalidate") return null
        val scopes = root.fields["scopes"] as? JsonValue.Array ?: return null
        if (scopes.values.isEmpty() || scopes.values.size > 32) return null

        val dayScopes = mutableListOf<AndroidRealtimeDayScope>()
        for (value in scopes.values) {
            val scope = value as? JsonValue.Object ?: return null
            val kind = (scope.fields["kind"] as? JsonValue.StringValue)?.value ?: return null
            when (kind) {
                "day" -> {
                    if (!hasOnly(scope, "kind", "logical_date")) return null
                    val logicalDate = if (!scope.fields.containsKey("logical_date")) {
                        null
                    } else {
                        val date = scope.fields["logical_date"] as? JsonValue.StringValue
                            ?: return null
                        date.value.takeIf(::isLogicalDate) ?: return null
                    }
                    dayScopes += AndroidRealtimeDayScope(logicalDate)
                }
                "projects", "modes", "routines" -> if (!hasOnly(scope, "kind")) return null
                "documents" -> {
                    if (!hasOnly(scope, "kind", "document_ids")) return null
                    if (!scope.fields.containsKey("document_ids")) {
                        Unit
                    } else when (val ids = scope.fields["document_ids"]) {
                        is JsonValue.Array -> {
                            if (ids.values.size > 100 || ids.values.any { !isSafeIdentifier(it) }) return null
                        }
                        else -> return null
                    }
                }
                else -> return null
            }
        }
        return AndroidRealtimeInvalidation(dayScopes)
    }

    private fun hasOnly(value: JsonValue.Object, vararg names: String): Boolean =
        value.fields.keys.all(names::contains)

    private fun isLogicalDate(value: String): Boolean =
        Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(value)

    private fun isSafeIdentifier(value: JsonValue): Boolean =
        (value as? JsonValue.StringValue)?.value?.let { it.isNotEmpty() && it.length <= 200 } == true
}
