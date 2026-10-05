package com.hedgetheapp.taskchute.today

import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue
import java.net.URI
import java.net.URLEncoder

class TodayHttpRepository(
    private val request: (method: String, path: String, body: String?) -> TodayHttpResponse?,
    private val onUnauthorized: () -> Unit,
    private val diagnosticsEnabled: Boolean = false,
) : TodayRepository {
    override fun loadDay(logicalDate: String?): TodayResult {
        val path = logicalDate?.let {
            "/api/v1/taskchute-days/by-logical-date?logical_date=${URLEncoder.encode(it, Charsets.UTF_8.name())}"
        } ?: "/api/v1/taskchute-days/current"
        return executeForDay("GET", path, null)
    }

    override fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult {
        val executionId = UUIDv7.next()
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","execution_id":"${JsonEncoding.escape(executionId)}","expected_placement_revision":$placementRevision}
        """.trimIndent()
        return executeMutation("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/start", body)
    }

    override fun completeTask(task: TodayTask): TodayMutationResult {
        val executionId = task.executionId ?: return TodayMutationResult.Failure("実行情報を取得できません。再読み込みしてください。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","execution_id":"${JsonEncoding.escape(executionId)}"}
        """.trimIndent()
        return executeMutation("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/complete", body)
    }

    private fun executeMutation(method: String, path: String, body: String?): TodayMutationResult {
        val response = runCatching { request(method, path, body) }.getOrNull()
            ?: return TodayMutationResult.Failure("接続できませんでした。再試行してください。")
        return when {
            response.status == null -> TodayMutationResult.Failure("接続できませんでした。再試行してください。")
            response.status == 401 -> {
                onUnauthorized()
                TodayMutationResult.Unauthorized
            }
            response.status !in 200..299 -> TodayMutationResult.Failure("Todayを更新できませんでした。再試行してください。")
            else -> TodayMutationResult.Success
        }
    }

    private fun executeForDay(method: String, path: String, body: String?): TodayResult {
        val response = runCatching { request(method, path, body) }.getOrNull()
            ?: return TodayResult.Failure(
                "接続できませんでした。再試行してください。",
                diagnostic = diagnostic("NETWORK_NO_RESPONSE"),
            )
        return when {
            response.status == null -> TodayResult.Failure(
                "接続できませんでした。再試行してください。",
                diagnostic = diagnostic("NETWORK_NO_RESPONSE"),
            )
            response.status == 401 -> {
                onUnauthorized()
                TodayResult.Unauthorized
            }
            response.status !in 200..299 -> TodayResult.Failure(
                "Todayを読み込めませんでした。再試行してください。",
                diagnostic = diagnostic(httpDiagnostic(response.status, response.body)),
            )
            else -> runCatching { TodayResult.Success(TodayJsonParser.parse(response.body)) }
                .getOrElse {
                    TodayResult.Failure(
                        "サーバーのTodayデータを読み取れませんでした。",
                        diagnostic = diagnostic("HTTP ${response.status} / PARSE_ERROR"),
                    )
                }
        }
    }

    private fun diagnostic(value: String): String? = value.takeIf { diagnosticsEnabled }

    private fun httpDiagnostic(status: Int, body: String?): String {
        val code = runCatching {
            val root = JsonParser(body.orEmpty()).parse() as? JsonValue.Object ?: return@runCatching null
            val error = root.fields["error"] as? JsonValue.Object ?: return@runCatching null
            val candidate = (error.fields["code"] as? JsonValue.StringValue)?.value
            candidate?.takeIf { it in CANONICAL_API_ERROR_CODES }
        }.getOrNull()
        return if (code == null) "HTTP $status" else "HTTP $status / $code"
    }

    private companion object {
        val CANONICAL_API_ERROR_CODES = setOf(
            "malformed_request",
            "unauthenticated",
            "forbidden",
            "resource_not_found",
            "resource_conflict",
            "revision_conflict",
            "operation_id_misuse",
            "operation_persistence_incompatible",
            "infrastructure_ambiguous",
        )
    }
}

internal fun shouldExposeTodayDiagnostic(debugBuild: Boolean, baseUrl: String): Boolean {
    if (!debugBuild) return false
    return runCatching {
        val uri = URI(baseUrl)
        uri.scheme.equals("https", ignoreCase = true) &&
            uri.host.equals("taskchute-web-nonprod.taskfulness-sync.workers.dev", ignoreCase = true) &&
            uri.port == -1 &&
            uri.rawUserInfo == null &&
            uri.rawPath.orEmpty().let { it.isEmpty() || it == "/" } &&
            uri.rawQuery == null &&
            uri.rawFragment == null
    }.getOrDefault(false)
}

internal object JsonEncoding {
    fun escape(value: String): String = buildString {
        value.forEach { character ->
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

    fun pathSegment(value: String): String = value
        .replace("%", "%25")
        .replace("/", "%2F")
        .replace("?", "%3F")
        .replace("#", "%23")
}

internal object UUIDv7 {
    private val random = java.security.SecureRandom()

    fun next(): String {
        val timestamp = System.currentTimeMillis() and 0x0000FFFFFFFFFFFFL
        val most = (timestamp shl 16) or 0x7000L or (random.nextInt() and 0x0fff).toLong()
        val least = (random.nextLong() and 0x3fffffffffffffffL) or Long.MIN_VALUE
        return java.util.UUID(most, least).toString()
    }
}
