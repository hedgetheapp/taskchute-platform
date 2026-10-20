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
        return executeStartMutation("/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/start", body)
    }

    override fun completeTask(task: TodayTask): TodayMutationResult {
        val executionId = task.executionId ?: return TodayMutationResult.Failure("実行情報を取得できません。再読み込みしてください。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","execution_id":"${JsonEncoding.escape(executionId)}"}
        """.trimIndent()
        return executeMutation("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/complete", body)
    }

    override fun interruptTask(operation: TodayInterruptEntryRequest): TodayInterruptResult {
        val body = """
            {"operation_id":"${JsonEncoding.escape(operation.operationId)}","taskchute_day_id":"${JsonEncoding.escape(operation.taskChuteDayId)}","source_entry_id":"${JsonEncoding.escape(operation.sourceEntryId)}","active_execution_id":"${JsonEncoding.escape(operation.activeExecutionId)}","target_entry_id":"${JsonEncoding.escape(operation.targetEntryId)}","target_execution_id":"${JsonEncoding.escape(operation.targetExecutionId)}","continuation_entry_id":"${JsonEncoding.escape(operation.continuationEntryId)}","expected_placement_revision":${operation.expectedPlacementRevision}}
        """.trimIndent()
        val response = try {
            request("POST", "/api/v1/entries/${JsonEncoding.pathSegment(operation.sourceEntryId)}/interrupt", body)
        } catch (_: Exception) {
            null
        }
        if (response?.status == null) {
            return TodayInterruptResult.Ambiguous("中断・継続の結果を確認できません。")
        }
        if (response.status == 401) {
            onUnauthorized()
            return TodayInterruptResult.Unauthorized
        }
        if (response.status in 200..299) {
            val revision = runCatching { parseInterruptPlacementRevision(response.body, operation) }.getOrNull()
            return revision?.let(TodayInterruptResult::Confirmed)
                ?: TodayInterruptResult.Ambiguous("中断・継続の結果を確認できません。")
        }
        val error = parseInterruptError(response.body)
        if (response.status >= 500 || error?.first == "infrastructure_ambiguous" || error?.third == true) {
            return TodayInterruptResult.Ambiguous("中断・継続の結果を確認できません。")
        }
        return TodayInterruptResult.Rejected(
            code = error?.first ?: "http_${response.status}",
            message = error?.second ?: "中断・継続の前提が変わりました。Todayを再読み込みしてください。",
        )
    }

    private fun parseInterruptPlacementRevision(body: String?, request: TodayInterruptEntryRequest): Int {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("InterruptEntry response must be an object")
        fun requiredString(obj: JsonValue.Object, key: String): String =
            (obj.fields[key] as? JsonValue.StringValue)?.value?.takeIf { it.isNotBlank() }
                ?: error("InterruptEntry response $key must be a non-empty string")
        fun requiredObject(obj: JsonValue.Object, key: String): JsonValue.Object =
            obj.fields[key] as? JsonValue.Object ?: error("InterruptEntry response $key must be an object")
        fun requiredInt(obj: JsonValue.Object, key: String): Int =
            (obj.fields[key] as? JsonValue.NumberValue)?.value?.toIntOrNull()
                ?: error("InterruptEntry response $key must be an integer")

        require(requiredString(root, "taskchute_day_id") == request.taskChuteDayId)
        require(requiredString(root, "source_entry_id") == request.sourceEntryId)
        require(requiredString(root, "target_entry_id") == request.targetEntryId)
        require(requiredString(root, "continuation_entry_id") == request.continuationEntryId)
        requiredString(root, "interruption_instant")
        val interruptionMinute = requiredInt(root, "interruption_logical_minute")
        require(interruptionMinute >= 0)

        val sourceExecution = requiredObject(root, "source_execution")
        require(requiredString(sourceExecution, "id") == request.activeExecutionId)
        require(requiredString(sourceExecution, "entry_id") == request.sourceEntryId)
        requiredString(sourceExecution, "started_at")
        requiredString(sourceExecution, "ended_at")
        require(requiredString(sourceExecution, "outcome") == "interrupted")

        val targetExecution = requiredObject(root, "target_execution")
        require(requiredString(targetExecution, "id") == request.targetExecutionId)
        require(requiredString(targetExecution, "entry_id") == request.targetEntryId)
        requiredString(targetExecution, "started_at")
        require(targetExecution.fields["ended_at"] == JsonValue.Null)
        require(targetExecution.fields["outcome"] == null || targetExecution.fields["outcome"] == JsonValue.Null)

        val continuation = requiredObject(root, "continuation")
        require(requiredString(continuation, "entry_id") == request.continuationEntryId)
        requiredString(continuation, "task_id")
        requiredString(continuation, "section_id")
        require(requiredInt(continuation, "position") >= 0)
        require(requiredInt(continuation, "planned_start_minute") == interruptionMinute)
        val estimate = continuation.fields["estimate_seconds"]
        require(estimate == null || estimate == JsonValue.Null ||
            ((estimate as? JsonValue.NumberValue)?.value?.toIntOrNull()?.let { it >= 0 } == true))

        val revision = requiredInt(root, "placement_revision")
        require(revision == request.expectedPlacementRevision + 1)
        return revision
    }

    private fun parseInterruptError(body: String?): Triple<String, String, Boolean>? = runCatching {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object ?: return null
        val error = root.fields["error"] as? JsonValue.Object ?: return null
        val code = (error.fields["code"] as? JsonValue.StringValue)?.value ?: return null
        val message = (error.fields["message"] as? JsonValue.StringValue)?.value
            ?: "中断・継続の前提が変わりました。Todayを再読み込みしてください。"
        val reconcile = (error.fields["reconcile"] as? JsonValue.BooleanValue)?.value == true
        Triple(code, message, reconcile)
    }.getOrNull()

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

    private fun executeStartMutation(path: String, body: String?): TodayMutationResult {
        val response = runCatching { request("POST", path, body) }.getOrNull()
            ?: return TodayMutationResult.Failure("接続できませんでした。再試行してください。")
        return when {
            response.status == null -> TodayMutationResult.Failure("接続できませんでした。再試行してください。")
            response.status == 401 -> {
                onUnauthorized()
                TodayMutationResult.Unauthorized
            }
            response.status !in 200..299 -> TodayMutationResult.Failure("Todayを更新できませんでした。再試行してください。")
            else -> runCatching { parseStartPlacementRevision(response.body) }
                .fold(
                    onSuccess = TodayMutationResult::SuccessWithRevision,
                    onFailure = { TodayMutationResult.Failure("Todayを更新できませんでした。再試行してください。") },
                )
        }
    }

    private fun parseStartPlacementRevision(body: String?): Int? {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("Start response must be an object")
        val entryId = (root.fields["entry_id"] as? JsonValue.StringValue)?.value
            ?.takeIf { it.isNotBlank() } ?: error("Start response entry_id must be a string")
        require((root.fields["lifecycle_state"] as? JsonValue.StringValue)?.value == "running")
        val execution = root.fields["execution"] as? JsonValue.Object ?: error("Start response execution must be an object")
        require((execution.fields["id"] as? JsonValue.StringValue)?.value?.isNotBlank() == true)
        require((execution.fields["entry_id"] as? JsonValue.StringValue)?.value == entryId)
        require((execution.fields["started_at"] as? JsonValue.StringValue)?.value?.isNotBlank() == true)
        require(execution.fields["ended_at"] == JsonValue.Null)
        val revision = root.fields["placement_revision"] ?: error("Start response placement_revision is required")
        return when (revision) {
            JsonValue.Null -> null
            is JsonValue.NumberValue -> revision.value.toIntOrNull()?.takeIf { it >= 0 }
                ?: error("Start response placement_revision must be a non-negative integer or null")
            else -> error("Start response placement_revision must be a non-negative integer or null")
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
