package com.hedgetheapp.taskchute.document

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.hedgetheapp.taskchute.today.UUIDv7
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface NoteEditorRequest {
    data class Create(val request: StandaloneCreateRequest) : NoteEditorRequest
    data class Update(val request: StandaloneUpdateRequest) : NoteEditorRequest
    data class TaskUpdate(val request: TaskPrimaryUpdateRequest) : NoteEditorRequest
}

enum class NoteEditorOrigin {
    STANDALONE_LIST,
    TODAY_TASK,
}

data class NoteEditorState(
    val kind: DocumentKind,
    val document: AndroidDocument?,
    val origin: NoteEditorOrigin = NoteEditorOrigin.STANDALONE_LIST,
    val taskTitle: String? = null,
    val taskId: String? = null,
    val title: String = "",
    val markdownBody: String = "",
    val saving: Boolean = false,
    val unresolvedRequest: NoteEditorRequest? = null,
    val errorMessage: String? = null,
) {
    val dirty: Boolean
        get() = if (document == null) title.isNotBlank() || markdownBody.isNotBlank()
        else title != document.title || markdownBody != document.markdownBody

    val blocked: Boolean get() = unresolvedRequest != null
}

data class NotesUiState(
    val loadingList: Boolean = false,
    val documents: List<AndroidDocumentSummary> = emptyList(),
    val editor: NoteEditorState? = null,
    val errorMessage: String? = null,
    val unresolvedTaskEnsure: TaskPrimaryEnsureRequest? = null,
    val unresolvedTaskTitle: String? = null,
    val taskEnsureSaving: Boolean = false,
)

class NotesController(
    private val repository: AndroidDocumentRepository,
    private val onUnauthorized: () -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var state by mutableStateOf(NotesUiState())
        private set

    val hasUnsavedChanges: Boolean
        get() = state.editor?.dirty == true || state.editor?.blocked == true || state.unresolvedTaskEnsure != null

    fun load() {
        if (state.loadingList) return
        state = state.copy(loadingList = true, errorMessage = null)
        scope.launch {
            when (val result = withContext(Dispatchers.IO) { repository.listStandalone() }) {
                is DocumentListResult.Success -> state = state.copy(loadingList = false, documents = result.documents)
                DocumentListResult.Unauthorized -> {
                    state = state.copy(loadingList = false, errorMessage = "認証が必要です。")
                    onUnauthorized()
                }
                is DocumentListResult.Failure -> state = state.copy(loadingList = false, errorMessage = result.message)
            }
        }
    }

    fun openNew() {
        if (hasUnsavedChanges) return
        state = state.copy(editor = NoteEditorState(DocumentKind.STANDALONE, null, origin = NoteEditorOrigin.STANDALONE_LIST))
    }

    fun openStandalone(documentId: String) {
        if (hasUnsavedChanges) return
        state = state.copy(editor = null, errorMessage = null, unresolvedTaskEnsure = null, unresolvedTaskTitle = null)
        scope.launch {
            when (val result = withContext(Dispatchers.IO) { repository.fetchStandalone(documentId) }) {
                is DocumentResult.Success -> state = state.copy(editor = editorFor(result.document, origin = NoteEditorOrigin.STANDALONE_LIST))
                DocumentResult.Missing -> state = state.copy(errorMessage = "ノートが見つかりません。")
                DocumentResult.Unauthorized -> {
                    state = state.copy(errorMessage = "認証が必要です。")
                    onUnauthorized()
                }
                is DocumentResult.Failure -> state = state.copy(errorMessage = result.message)
                is DocumentResult.Conflict -> state = state.copy(errorMessage = result.message)
                is DocumentResult.Ambiguous -> state = state.copy(errorMessage = result.message)
            }
        }
    }

    fun openTaskPrimary(taskId: String, taskTitle: String, primaryDocumentId: String?) {
        if (hasUnsavedChanges) return
        val ensureRequest = if (primaryDocumentId == null) {
            TaskPrimaryEnsureRequest(UUIDv7.next(), taskId, UUIDv7.next())
        } else {
            null
        }
        state = state.copy(
            editor = null,
            errorMessage = null,
            unresolvedTaskEnsure = ensureRequest,
            unresolvedTaskTitle = ensureRequest?.let { taskTitle },
            taskEnsureSaving = ensureRequest != null,
        )
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                if (primaryDocumentId != null) repository.fetchTaskPrimary(primaryDocumentId)
                else repository.ensureTaskPrimary(requireNotNull(ensureRequest))
            }
            handleTaskPrimaryResult(result, taskId, taskTitle, ensureRequest)
        }
    }

    fun retryTaskPrimaryEnsure() {
        val request = state.unresolvedTaskEnsure ?: return
        if (state.taskEnsureSaving) return
        state = state.copy(taskEnsureSaving = true, errorMessage = null)
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.ensureTaskPrimary(request) }
            handleTaskPrimaryResult(result, request.taskId, state.unresolvedTaskTitle, request)
        }
    }

    private fun handleTaskPrimaryResult(
        result: DocumentResult,
        taskId: String,
        taskTitle: String?,
        ensureRequest: TaskPrimaryEnsureRequest?,
    ) {
        when (result) {
            is DocumentResult.Success -> state = state.copy(
                editor = editorFor(result.document, taskTitle, taskId, NoteEditorOrigin.TODAY_TASK),
                unresolvedTaskEnsure = null,
                unresolvedTaskTitle = null,
                taskEnsureSaving = false,
            )
            DocumentResult.Missing -> state = state.copy(errorMessage = "タスクノートが見つかりません。", unresolvedTaskEnsure = null, unresolvedTaskTitle = null, taskEnsureSaving = false)
            DocumentResult.Unauthorized -> {
                state = state.copy(errorMessage = "認証が必要です。", unresolvedTaskEnsure = null, unresolvedTaskTitle = null, taskEnsureSaving = false)
                onUnauthorized()
            }
            is DocumentResult.Failure -> state = state.copy(errorMessage = result.message, unresolvedTaskEnsure = null, unresolvedTaskTitle = null, taskEnsureSaving = false)
            is DocumentResult.Conflict -> state = state.copy(errorMessage = result.message, unresolvedTaskEnsure = null, unresolvedTaskTitle = null, taskEnsureSaving = false)
            is DocumentResult.Ambiguous -> {
                state = state.copy(
                    errorMessage = result.message,
                    unresolvedTaskEnsure = ensureRequest ?: state.unresolvedTaskEnsure,
                    unresolvedTaskTitle = taskTitle ?: state.unresolvedTaskTitle,
                    taskEnsureSaving = false,
                )
                ensureRequest?.let { reconcileTaskPrimaryEnsure(it, taskTitle ?: state.unresolvedTaskTitle) }
            }
        }
    }

    fun updateTitle(value: String) {
        val editor = state.editor ?: return
        if (editor.blocked || editor.saving || editor.kind != DocumentKind.STANDALONE) return
        state = state.copy(editor = editor.copy(title = value), errorMessage = null)
    }

    fun updateBody(value: String) {
        val editor = state.editor ?: return
        if (editor.blocked || editor.saving) return
        state = state.copy(editor = editor.copy(markdownBody = value), errorMessage = null)
    }

    fun save() {
        val editor = state.editor ?: return
        if (editor.saving) return
        val request = editor.unresolvedRequest ?: createRequest(editor)
        if (request == null) {
            state = state.copy(editor = editor.copy(errorMessage = "タイトルを入力してください。"))
            return
        }
        submit(request)
    }

    fun retryUnresolved() {
        val request = state.editor?.unresolvedRequest ?: return
        submit(request)
    }

    fun dismissEditor() {
        if (!hasUnsavedChanges && state.editor?.saving != true) state = state.copy(editor = null, errorMessage = null)
    }

    fun close() = scope.cancel()

    private fun createRequest(editor: NoteEditorState): NoteEditorRequest? {
        return if (editor.document == null) {
            val title = editor.title.trim()
            if (title.isEmpty()) null else NoteEditorRequest.Create(
                StandaloneCreateRequest(UUIDv7.next(), UUIDv7.next(), title, editor.markdownBody),
            )
        } else if (editor.kind == DocumentKind.STANDALONE) {
            NoteEditorRequest.Update(
                StandaloneUpdateRequest(UUIDv7.next(), editor.document.documentId, editor.document.revision, editor.title.trim(), editor.markdownBody),
            )
        } else {
            NoteEditorRequest.TaskUpdate(
                TaskPrimaryUpdateRequest(UUIDv7.next(), editor.taskId ?: return null, editor.document.documentId, editor.document.revision, editor.markdownBody),
            )
        }
    }

    private fun submit(request: NoteEditorRequest) {
        val editor = state.editor ?: return
        if (editor.saving) return
        state = state.copy(editor = editor.copy(saving = true, errorMessage = null))
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                when (request) {
                    is NoteEditorRequest.Create -> repository.createStandalone(request.request)
                    is NoteEditorRequest.Update -> repository.updateStandalone(request.request)
                    is NoteEditorRequest.TaskUpdate -> repository.updateTaskPrimary(request.request)
                }
            }
            when (result) {
                is DocumentResult.Success -> adopt(result.document)
                DocumentResult.Unauthorized -> {
                    state = state.copy(editor = state.editor?.copy(saving = false, unresolvedRequest = request, errorMessage = "認証が必要です。保存内容を保持しています。"))
                    onUnauthorized()
                }
                is DocumentResult.Conflict -> state = state.copy(editor = state.editor?.copy(saving = false, errorMessage = result.message))
                is DocumentResult.Failure -> state = state.copy(editor = state.editor?.copy(saving = false, errorMessage = result.message))
                is DocumentResult.Ambiguous -> {
                    state = state.copy(editor = state.editor?.copy(saving = false, unresolvedRequest = request, errorMessage = result.message))
                    reconcileAmbiguous(request)
                }
                DocumentResult.Missing -> state = state.copy(editor = state.editor?.copy(saving = false, errorMessage = "ノートが見つかりません。"))
            }
        }
    }

    private fun reconcileAmbiguous(request: NoteEditorRequest) {
        scope.launch {
            val documentId = when (request) {
                is NoteEditorRequest.Create -> request.request.documentId
                is NoteEditorRequest.Update -> request.request.documentId
                is NoteEditorRequest.TaskUpdate -> request.request.documentId
            }
            val result = withContext(Dispatchers.IO) {
                when (request) {
                    is NoteEditorRequest.TaskUpdate -> repository.fetchTaskPrimary(documentId)
                    else -> repository.fetchStandalone(documentId)
                }
            }
            if (result is DocumentResult.Success && matches(request, result.document)) adopt(result.document)
        }
    }

    private fun reconcileTaskPrimaryEnsure(request: TaskPrimaryEnsureRequest, taskTitle: String?) {
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.fetchTaskPrimary(request.documentId) }
            if (result is DocumentResult.Success && result.document.kind == DocumentKind.TASK_PRIMARY
                && (result.document.taskId == null || result.document.taskId == request.taskId)
            ) {
                state = state.copy(
                    editor = editorFor(
                        result.document,
                        taskTitle = taskTitle,
                        taskId = request.taskId,
                        origin = NoteEditorOrigin.TODAY_TASK,
                    ),
                    unresolvedTaskEnsure = null,
                    unresolvedTaskTitle = null,
                    errorMessage = null,
                )
            }
        }
    }

    private fun matches(request: NoteEditorRequest, document: AndroidDocument): Boolean = when (request) {
        is NoteEditorRequest.Create -> document.kind == DocumentKind.STANDALONE
            && document.title == request.request.title.trim() && document.markdownBody == request.request.markdownBody
        is NoteEditorRequest.Update -> document.kind == DocumentKind.STANDALONE
            && document.documentId == request.request.documentId && document.title == request.request.title.trim()
            && document.markdownBody == request.request.markdownBody && document.revision >= request.request.expectedRevision
        is NoteEditorRequest.TaskUpdate -> document.kind == DocumentKind.TASK_PRIMARY
            && document.documentId == request.request.documentId && document.markdownBody == request.request.markdownBody
            && document.revision >= request.request.expectedRevision
    }

    private fun adopt(document: AndroidDocument) {
        val current = state.editor ?: return
        state = state.copy(
            editor = current.copy(
                document = document,
                title = if (current.kind == DocumentKind.STANDALONE) document.title else current.title,
                markdownBody = document.markdownBody,
                saving = false,
                unresolvedRequest = null,
                errorMessage = null,
            ),
            documents = state.documents.map { summary ->
                if (summary.documentId == document.documentId) summary.copy(title = document.title, revision = document.revision, updatedAt = document.updatedAt) else summary
            },
        )
    }

    private fun editorFor(
        document: AndroidDocument,
        taskTitle: String? = null,
        taskId: String? = null,
        origin: NoteEditorOrigin = NoteEditorOrigin.STANDALONE_LIST,
    ) = NoteEditorState(
        kind = document.kind,
        document = document,
        origin = origin,
        taskTitle = taskTitle,
        taskId = taskId ?: document.taskId,
        title = document.title,
        markdownBody = document.markdownBody,
    )
}
