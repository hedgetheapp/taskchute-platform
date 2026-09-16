package com.hedgetheapp.taskchute.document

import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue
import com.hedgetheapp.taskchute.today.JsonEncoding
import com.hedgetheapp.taskchute.today.TodayHttpResponse

class DocumentHttpRepository(
    private val request: (method: String, path: String, body: String?) -> TodayHttpResponse?,
    private val onUnauthorized: () -> Unit = {},
) : AndroidDocumentRepository {
    override fun listStandalone(archived: Boolean): DocumentListResult {
        return when (val response = execute("GET", "/api/v1/documents?archived=$archived", null)) {
            is HttpResult.Success -> runCatching {
                val root = response.body.objectValue()
                val documents = root.arrayField("documents").map { value ->
                    val item = value.objectValue()
                    AndroidDocumentSummary(
                        documentId = item.stringField("document_id"),
                        title = item.stringField("title"),
                        revision = item.intField("revision"),
                        updatedAt = item.stringField("updated_at"),
                    )
                }
                DocumentListResult.Success(documents)
            }.getOrElse { DocumentListResult.Failure("ノート一覧を読み取れませんでした。再試行してください。") }
            HttpResult.Unauthorized -> DocumentListResult.Unauthorized
            is HttpResult.Failure -> DocumentListResult.Failure(response.message)
        }
    }

    override fun fetchStandalone(documentId: String): DocumentResult = fetch("/api/v1/documents/${JsonEncoding.pathSegment(documentId)}", DocumentKind.STANDALONE)

    override fun createStandalone(request: StandaloneCreateRequest): DocumentResult = mutation(
        "POST",
        "/api/v1/documents",
        """{"operation_id":"${JsonEncoding.escape(request.operationId)}","document_id":"${JsonEncoding.escape(request.documentId)}","title":"${JsonEncoding.escape(request.title.trim())}","markdown_body":"${JsonEncoding.escape(request.markdownBody)}"}""",
    )

    override fun updateStandalone(request: StandaloneUpdateRequest): DocumentResult = mutation(
        "POST",
        "/api/v1/documents/${JsonEncoding.pathSegment(request.documentId)}",
        """{"operation_id":"${JsonEncoding.escape(request.operationId)}","document_id":"${JsonEncoding.escape(request.documentId)}","expected_revision":${request.expectedRevision},"title":"${JsonEncoding.escape(request.title.trim())}","markdown_body":"${JsonEncoding.escape(request.markdownBody)}"}""",
    )

    override fun setStandaloneArchived(request: SetStandaloneDocumentArchivedRequest): DocumentLifecycleResult = lifecycleMutation(
        "/api/v1/documents/${JsonEncoding.pathSegment(request.documentId)}/archive",
        """{"operation_id":"${JsonEncoding.escape(request.operationId)}","document_id":"${JsonEncoding.escape(request.documentId)}","expected_revision":${request.expectedRevision},"archived":${request.archived}}""",
    )

    override fun deleteStandalone(request: DeleteStandaloneDocumentRequest): DocumentLifecycleResult = lifecycleMutation(
        "/api/v1/documents/${JsonEncoding.pathSegment(request.documentId)}/delete",
        """{"operation_id":"${JsonEncoding.escape(request.operationId)}","document_id":"${JsonEncoding.escape(request.documentId)}","expected_revision":${request.expectedRevision}}""",
    )

    override fun fetchTaskPrimary(documentId: String): DocumentResult = fetch("/api/v1/task-primary-documents/${JsonEncoding.pathSegment(documentId)}", DocumentKind.TASK_PRIMARY)

    override fun ensureTaskPrimary(request: TaskPrimaryEnsureRequest): DocumentResult = mutation(
        "POST",
        "/api/v1/tasks/${JsonEncoding.pathSegment(request.taskId)}/primary-document",
        """{"operation_id":"${JsonEncoding.escape(request.operationId)}","task_id":"${JsonEncoding.escape(request.taskId)}","document_id":"${JsonEncoding.escape(request.documentId)}"}""",
    )

    override fun updateTaskPrimary(request: TaskPrimaryUpdateRequest): DocumentResult = mutation(
        "POST",
        "/api/v1/task-primary-documents/${JsonEncoding.pathSegment(request.documentId)}",
        """{"operation_id":"${JsonEncoding.escape(request.operationId)}","task_id":"${JsonEncoding.escape(request.taskId)}","document_id":"${JsonEncoding.escape(request.documentId)}","expected_revision":${request.expectedRevision},"markdown_body":"${JsonEncoding.escape(request.markdownBody)}"}""",
    )

    private fun fetch(path: String, kind: DocumentKind): DocumentResult = when (val response = execute("GET", path, null)) {
        is HttpResult.Success -> runCatching { DocumentResult.Success(parseDocument(response.body.objectValue(), kind)) }
            .getOrElse { DocumentResult.Failure("ノートを読み取れませんでした。再試行してください。") }
        HttpResult.Unauthorized -> DocumentResult.Unauthorized
        is HttpResult.Failure -> if (response.notFound) DocumentResult.Missing else DocumentResult.Failure(response.message)
    }

    private fun mutation(method: String, path: String, body: String): DocumentResult = when (val response = execute(method, path, body)) {
        is HttpResult.Success -> runCatching {
            val root = response.body.objectValue()
            DocumentResult.Success(parseDocument(root.objectField("document"), if (root.objectField("document").stringField("kind") == "task_primary") DocumentKind.TASK_PRIMARY else DocumentKind.STANDALONE))
        }.getOrElse { DocumentResult.Failure("ノートの保存結果を読み取れませんでした。再試行してください。") }
        HttpResult.Unauthorized -> DocumentResult.Unauthorized
        is HttpResult.Failure -> when {
            response.ambiguous -> DocumentResult.Ambiguous(response.message)
            response.conflict -> DocumentResult.Conflict(response.message)
            response.notFound -> DocumentResult.Missing
            else -> DocumentResult.Failure(response.message)
        }
    }

    private fun lifecycleMutation(path: String, body: String): DocumentLifecycleResult = when (val response = execute("POST", path, body)) {
        is HttpResult.Success -> runCatching {
            val root = response.body.objectValue()
            val document = root.fields["document"]?.let { parseDocument(it.objectValue(), DocumentKind.STANDALONE) }
            DocumentLifecycleResult.Success(document)
        }.getOrElse { DocumentLifecycleResult.Success() }
        HttpResult.Unauthorized -> DocumentLifecycleResult.Unauthorized
        is HttpResult.Failure -> when {
            response.ambiguous -> DocumentLifecycleResult.Ambiguous(response.message)
            response.conflict -> DocumentLifecycleResult.Conflict(response.message)
            response.notFound -> DocumentLifecycleResult.Missing
            else -> DocumentLifecycleResult.Failure(response.message)
        }
    }

    private fun execute(method: String, path: String, body: String?): HttpResult {
        val response = runCatching { request(method, path, body) }.getOrNull()
            ?: return HttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
        return when {
            response.status == null -> HttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
            response.status == 401 -> {
                onUnauthorized()
                HttpResult.Unauthorized
            }
            response.status !in 200..299 -> {
                val code = runCatching {
                    response.body?.let { JsonParser(it).parse().objectValue().objectField("error").stringField("code") }
                }.getOrNull()
                HttpResult.Failure(
                    message = when (code) {
                        "revision_conflict" -> "サーバー側でノートが変更されています。再読み込みしてください。"
                        "infrastructure_ambiguous" -> "保存結果を確認できませんでした。元の操作を再試行してください。"
                        else -> "ノートを保存できませんでした。再試行してください。"
                    },
                    notFound = response.status == 404,
                    conflict = code == "revision_conflict" || response.status == 409,
                    ambiguous = code == "infrastructure_ambiguous" || response.status == 503,
                )
            }
            else -> HttpResult.Success(response.body ?: "")
        }
    }

    private fun parseDocument(value: JsonValue.Object, kind: DocumentKind): AndroidDocument = AndroidDocument(
        documentId = value.stringField("document_id"),
        kind = kind,
        title = value.nullableStringField("title") ?: "",
        markdownBody = value.stringField("markdown_body"),
        revision = value.intField("revision"),
        taskId = value.nullableStringField("task_id"),
        createdAt = value.nullableStringField("created_at") ?: "",
        updatedAt = value.nullableStringField("updated_at") ?: "",
    )

    private sealed interface HttpResult {
        data class Success(val body: String) : HttpResult
        data object Unauthorized : HttpResult
        data class Failure(
            val message: String,
            val notFound: Boolean = false,
            val conflict: Boolean = false,
            val ambiguous: Boolean = false,
        ) : HttpResult
    }
}

private fun String.objectValue(): JsonValue.Object = JsonParser(this).parse() as? JsonValue.Object
    ?: error("Document response must be an object")

private fun JsonValue.objectValue(): JsonValue.Object = this as? JsonValue.Object ?: error("Document field must be an object")

private fun JsonValue.Object.objectField(name: String): JsonValue.Object = fields[name]?.objectValue()
    ?: error("Document field '$name' must be an object")

private fun JsonValue.Object.arrayField(name: String): List<JsonValue> = (fields[name] as? JsonValue.Array)?.values
    ?: error("Document field '$name' must be an array")

private fun JsonValue.Object.stringField(name: String): String = (fields[name] as? JsonValue.StringValue)?.value
    ?: error("Document field '$name' must be a string")

private fun JsonValue.Object.nullableStringField(name: String): String? = when (val value = fields[name]) {
    null, JsonValue.Null -> null
    is JsonValue.StringValue -> value.value
    else -> error("Document field '$name' must be a string or null")
}

private fun JsonValue.Object.intField(name: String): Int = (fields[name] as? JsonValue.NumberValue)?.value?.toIntOrNull()
    ?: error("Document field '$name' must be an integer")
