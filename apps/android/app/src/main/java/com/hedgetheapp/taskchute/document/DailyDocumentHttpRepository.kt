package com.hedgetheapp.taskchute.document

import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue
import com.hedgetheapp.taskchute.today.JsonEncoding
import com.hedgetheapp.taskchute.today.TodayHttpResponse

interface DailyDocumentRepository {
    fun listDaily(): DailyListResult
    fun fetchDaily(documentId: String): DailyResult
    fun ensureDaily(request: DailyEnsureRequest): DailyResult
    fun updateDaily(request: DailyUpdateRequest): DailyResult
}

class DailyDocumentHttpRepository(
    private val request: (method: String, path: String, body: String?) -> TodayHttpResponse?,
    private val onUnauthorized: () -> Unit = {},
) : DailyDocumentRepository {
    override fun listDaily(): DailyListResult = when (val response = execute("GET", "/api/v1/daily-primary-documents", null)) {
        is HttpResult.Success -> runCatching {
            val days = response.body.objectValue().arrayField("days").map { value ->
                val item = value.objectValue()
                AndroidDailyDocumentSummary(item.stringField("taskchute_day_id"), item.stringField("logical_date"), item.nullableStringField("document_id"))
            }
            DailyListResult.Success(days)
        }.getOrElse { DailyListResult.Failure("デイリーノート一覧を読み取れませんでした。再試行してください。") }
        HttpResult.Unauthorized -> DailyListResult.Unauthorized
        is HttpResult.Failure -> DailyListResult.Failure(response.message)
    }

    override fun fetchDaily(documentId: String): DailyResult = when (val response = execute("GET", "/api/v1/daily-primary-documents/${JsonEncoding.pathSegment(documentId)}", null)) {
        is HttpResult.Success -> runCatching { DailyResult.Success(parseDaily(response.body.objectValue())) }
            .getOrElse { DailyResult.Failure("デイリーノートを読み取れませんでした。再試行してください。") }
        HttpResult.Unauthorized -> DailyResult.Unauthorized
        is HttpResult.Failure -> if (response.notFound) DailyResult.Missing else DailyResult.Failure(response.message)
    }

    override fun ensureDaily(request: DailyEnsureRequest): DailyResult = mutation(
        "/api/v1/taskchute-days/${JsonEncoding.pathSegment(request.taskchuteDayId)}/daily-primary-document",
        """{"operation_id":"${JsonEncoding.escape(request.operationId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskchuteDayId)}","document_id":"${JsonEncoding.escape(request.documentId)}"}""",
    )

    override fun updateDaily(request: DailyUpdateRequest): DailyResult = mutation(
        "/api/v1/daily-primary-documents/${JsonEncoding.pathSegment(request.documentId)}",
        """{"operation_id":"${JsonEncoding.escape(request.operationId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskchuteDayId)}","document_id":"${JsonEncoding.escape(request.documentId)}","expected_revision":${request.expectedRevision},"markdown_body":"${JsonEncoding.escape(request.markdownBody)}"}""",
    )

    private fun mutation(path: String, body: String): DailyResult = when (val response = execute("POST", path, body)) {
        is HttpResult.Success -> runCatching { DailyResult.Success(parseDaily(response.body.objectValue().objectField("document"))) }
            .getOrElse { DailyResult.Failure("デイリーノートの保存結果を読み取れませんでした。再試行してください。") }
        HttpResult.Unauthorized -> DailyResult.Unauthorized
        is HttpResult.Failure -> when {
            response.ambiguous -> DailyResult.Ambiguous(response.message)
            response.conflict -> DailyResult.Conflict(response.message)
            response.notFound -> DailyResult.Missing
            else -> DailyResult.Failure(response.message)
        }
    }

    private fun execute(method: String, path: String, body: String?): HttpResult {
        val response = runCatching { request(method, path, body) }.getOrNull()
            ?: return HttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
        return when {
            response.status == null -> HttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
            response.status == 401 -> { onUnauthorized(); HttpResult.Unauthorized }
            response.status !in 200..299 -> {
                val code = runCatching { response.body?.let { JsonParser(it).parse().objectValue().objectField("error").stringField("code") } }.getOrNull()
                HttpResult.Failure(
                    message = when (code) {
                        "revision_conflict" -> "サーバー側でノートが変更されています。再読み込みしてください。"
                        "infrastructure_ambiguous" -> "保存結果を確認できませんでした。元の操作を再試行してください。"
                        else -> "デイリーノートを保存できませんでした。再試行してください。"
                    },
                    notFound = response.status == 404,
                    conflict = code == "revision_conflict" || response.status == 409,
                    ambiguous = code == "infrastructure_ambiguous" || response.status == 503,
                )
            }
            else -> HttpResult.Success(response.body ?: "")
        }
    }

    private fun parseDaily(value: JsonValue.Object): AndroidDailyDocument = AndroidDailyDocument(
        documentId = value.stringField("document_id"),
        taskchuteDayId = value.stringField("taskchute_day_id"),
        logicalDate = value.stringField("logical_date"),
        markdownBody = value.stringField("markdown_body"),
        revision = value.intField("revision"),
        createdAt = value.nullableStringField("created_at") ?: "",
        updatedAt = value.nullableStringField("updated_at") ?: "",
    )

    private sealed interface HttpResult {
        data class Success(val body: String) : HttpResult
        data object Unauthorized : HttpResult
        data class Failure(val message: String, val notFound: Boolean = false, val conflict: Boolean = false, val ambiguous: Boolean = false) : HttpResult
    }
}

private fun String.objectValue(): JsonValue.Object = JsonParser(this).parse() as? JsonValue.Object
    ?: error("Daily response must be an object")

private fun JsonValue.objectValue(): JsonValue.Object = this as? JsonValue.Object ?: error("Daily field must be an object")

private fun JsonValue.Object.objectField(name: String): JsonValue.Object = fields[name]?.objectValue()
    ?: error("Daily field '$name' must be an object")

private fun JsonValue.Object.arrayField(name: String): List<JsonValue> = (fields[name] as? JsonValue.Array)?.values
    ?: error("Daily field '$name' must be an array")

private fun JsonValue.Object.stringField(name: String): String = (fields[name] as? JsonValue.StringValue)?.value
    ?: error("Daily field '$name' must be a string")

private fun JsonValue.Object.nullableStringField(name: String): String? = when (val value = fields[name]) {
    null, JsonValue.Null -> null
    is JsonValue.StringValue -> value.value
    else -> error("Daily field '$name' must be a string or null")
}

private fun JsonValue.Object.intField(name: String): Int = (fields[name] as? JsonValue.NumberValue)?.value?.toIntOrNull()
    ?: error("Daily field '$name' must be an integer")
