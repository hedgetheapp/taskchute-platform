package com.hedgetheapp.taskchute.document

data class AndroidDocument(
    val documentId: String,
    val kind: DocumentKind,
    val title: String,
    val markdownBody: String,
    val revision: Int,
    val taskId: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
)

enum class DocumentKind { STANDALONE, TASK_PRIMARY }

data class AndroidDocumentSummary(
    val documentId: String,
    val title: String,
    val revision: Int,
    val updatedAt: String,
)

sealed interface DocumentListResult {
    data class Success(val documents: List<AndroidDocumentSummary>) : DocumentListResult
    data object Unauthorized : DocumentListResult
    data class Failure(val message: String) : DocumentListResult
}

sealed interface DocumentResult {
    data class Success(val document: AndroidDocument) : DocumentResult
    data object Missing : DocumentResult
    data object Unauthorized : DocumentResult
    data class Conflict(val message: String) : DocumentResult
    data class Ambiguous(val message: String) : DocumentResult
    data class Failure(val message: String) : DocumentResult
}

data class StandaloneCreateRequest(
    val operationId: String,
    val documentId: String,
    val title: String,
    val markdownBody: String,
)

data class StandaloneUpdateRequest(
    val operationId: String,
    val documentId: String,
    val expectedRevision: Int,
    val title: String,
    val markdownBody: String,
)

data class TaskPrimaryEnsureRequest(
    val operationId: String,
    val taskId: String,
    val documentId: String,
)

data class TaskPrimaryUpdateRequest(
    val operationId: String,
    val taskId: String,
    val documentId: String,
    val expectedRevision: Int,
    val markdownBody: String,
)

interface AndroidDocumentRepository {
    fun listStandalone(): DocumentListResult

    fun fetchStandalone(documentId: String): DocumentResult

    fun createStandalone(request: StandaloneCreateRequest): DocumentResult

    fun updateStandalone(request: StandaloneUpdateRequest): DocumentResult

    fun fetchTaskPrimary(documentId: String): DocumentResult

    fun ensureTaskPrimary(request: TaskPrimaryEnsureRequest): DocumentResult

    fun updateTaskPrimary(request: TaskPrimaryUpdateRequest): DocumentResult
}
