package com.hedgetheapp.taskchute.document

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.hedgetheapp.taskchute.today.UUIDv7
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface NoteEditorRequest {
    data class Create(val request: StandaloneCreateRequest) : NoteEditorRequest
    data class Update(val request: StandaloneUpdateRequest) : NoteEditorRequest
    data class TaskUpdate(val request: TaskPrimaryUpdateRequest) : NoteEditorRequest
}

sealed interface NoteLifecycleRequest {
    data class Archive(val request: SetStandaloneDocumentArchivedRequest) : NoteLifecycleRequest
    data class Delete(val request: DeleteStandaloneDocumentRequest) : NoteLifecycleRequest
}

enum class NoteEditorOrigin {
    STANDALONE_LIST,
    TODAY_TASK,
}

enum class NoteSaveStatus {
    SAVED,
    UNSAVED,
    SAVING,
    CONFLICT,
    AMBIGUOUS,
    ERROR,
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
    val saveStatus: NoteSaveStatus = NoteSaveStatus.SAVED,
) {
    val dirty: Boolean
        get() = if (document == null) title.isNotBlank() || markdownBody.isNotBlank()
        else title != document.title || markdownBody != document.markdownBody

    val blocked: Boolean get() = unresolvedRequest != null
}

data class NotesUiState(
    val loadingList: Boolean = false,
    val documents: List<AndroidDocumentSummary> = emptyList(),
    val archivedView: Boolean = false,
    val lifecycleSaving: Boolean = false,
    val unresolvedLifecycleRequest: NoteLifecycleRequest? = null,
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
    private var editorGeneration = 0
    private var debounceJob: Job? = null
    private var deferredNavigation: (() -> Unit)? = null

    var state by mutableStateOf(NotesUiState())
        private set

    val hasUnsavedChanges: Boolean
        get() = state.editor?.dirty == true || state.editor?.blocked == true || state.editor?.saving == true ||
            state.unresolvedTaskEnsure != null || state.lifecycleSaving || state.unresolvedLifecycleRequest != null

    val requiresDiscardConfirmation: Boolean
        get() = state.editor?.let { it.dirty && !it.saving && !it.blocked && it.errorMessage != null } == true

    fun load(archived: Boolean = state.archivedView) {
        if (state.loadingList) return
        state = state.copy(loadingList = true, archivedView = archived, errorMessage = null)
        scope.launch {
            when (val result = withContext(Dispatchers.IO) { repository.listStandalone(archived) }) {
                is DocumentListResult.Success -> state = state.copy(loadingList = false, documents = result.documents)
                DocumentListResult.Unauthorized -> {
                    state = state.copy(loadingList = false, errorMessage = "認証が必要です。")
                    onUnauthorized()
                }
                is DocumentListResult.Failure -> state = state.copy(loadingList = false, errorMessage = result.message)
            }
        }
    }

    fun setArchivedView(archived: Boolean) {
        if (state.editor != null || state.lifecycleSaving || state.unresolvedLifecycleRequest != null) return
        load(archived)
    }

    fun archiveStandalone(document: AndroidDocumentSummary, archived: Boolean) {
        if (state.lifecycleSaving || state.unresolvedLifecycleRequest != null || state.editor != null) return
        submitLifecycle(
            NoteLifecycleRequest.Archive(
                SetStandaloneDocumentArchivedRequest(UUIDv7.next(), document.documentId, document.revision, archived),
            ),
        )
    }

    fun deleteStandalone(document: AndroidDocumentSummary) {
        if (state.lifecycleSaving || state.unresolvedLifecycleRequest != null || state.editor != null) return
        submitLifecycle(
            NoteLifecycleRequest.Delete(
                DeleteStandaloneDocumentRequest(UUIDv7.next(), document.documentId, document.revision),
            ),
        )
    }

    fun retryLifecycle() {
        state.unresolvedLifecycleRequest?.let(::submitLifecycle)
    }

    fun openNew() {
        if (hasUnsavedChanges) return
        editorGeneration += 1
        val generation = editorGeneration
        val editor = NoteEditorState(
            kind = DocumentKind.STANDALONE,
            document = null,
            origin = NoteEditorOrigin.STANDALONE_LIST,
            title = "notitle",
            saveStatus = NoteSaveStatus.UNSAVED,
        )
        state = state.copy(editor = editor, errorMessage = null)
        submit(
            NoteEditorRequest.Create(StandaloneCreateRequest(UUIDv7.next(), UUIDv7.next(), "notitle", "")),
            generation,
        )
    }

    fun openStandalone(documentId: String) {
        if (hasUnsavedChanges) return
        editorGeneration += 1
        val generation = editorGeneration
        state = state.copy(editor = null, errorMessage = null, unresolvedTaskEnsure = null, unresolvedTaskTitle = null)
        scope.launch {
            when (val result = withContext(Dispatchers.IO) { repository.fetchStandalone(documentId) }) {
                is DocumentResult.Success -> if (generation == editorGeneration) state = state.copy(editor = editorFor(result.document, origin = NoteEditorOrigin.STANDALONE_LIST))
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
        editorGeneration += 1
        val generation = editorGeneration
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
            if (generation == editorGeneration) handleTaskPrimaryResult(result, taskId, taskTitle, ensureRequest)
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
        if (editor.blocked || editor.kind != DocumentKind.STANDALONE) return
        state = state.copy(editor = editor.copy(
            title = value,
            saveStatus = if (editor.saving) NoteSaveStatus.SAVING else if (editor.errorMessage == null) NoteSaveStatus.UNSAVED else editor.saveStatus,
        ), errorMessage = null)
        if (editor.errorMessage == null) scheduleAutosave()
    }

    fun updateBody(value: String) {
        val editor = state.editor ?: return
        if (editor.blocked) return
        state = state.copy(editor = editor.copy(
            markdownBody = value,
            saveStatus = if (editor.saving) NoteSaveStatus.SAVING else if (editor.errorMessage == null) NoteSaveStatus.UNSAVED else editor.saveStatus,
        ), errorMessage = null)
        if (editor.errorMessage == null) scheduleAutosave()
    }

    fun save() {
        val editor = state.editor ?: return
        if (editor.saving) return
        debounceJob?.cancel()
        debounceJob = null
        if (editor.unresolvedRequest != null) {
            submit(editor.unresolvedRequest)
            return
        }
        if (!editor.dirty) {
            state = state.copy(editor = editor.copy(saveStatus = NoteSaveStatus.SAVED, errorMessage = null))
            finishDeferredNavigationIfReady()
            return
        }
        val request = createRequest(editor)
        if (request == null) {
            state = state.copy(editor = editor.copy(saveStatus = NoteSaveStatus.ERROR, errorMessage = "タイトルを入力してください。"))
            return
        }
        submit(request)
    }

    fun retryUnresolved() {
        val request = state.editor?.unresolvedRequest ?: return
        submit(request)
    }

    fun dismissEditor() {
        if (!hasUnsavedChanges) clearEditor()
    }

    fun discardEditor(): Boolean {
        val editor = state.editor ?: return true
        if (editor.saving || editor.blocked) return false
        clearEditor()
        return true
    }

    fun flushAndNavigate(action: () -> Unit) {
        if (state.lifecycleSaving || state.unresolvedLifecycleRequest != null) return
        val editor = state.editor
        if (editor == null) {
            action()
            return
        }
        if (editor.blocked) return
        deferredNavigation = action
        if (editor.saving) return
        if (!editor.dirty) {
            finishDeferredNavigationIfReady()
        } else if (editor.errorMessage == null) {
            save()
        }
    }

    fun close() {
        debounceJob?.cancel()
        scope.cancel()
    }

    private fun submitLifecycle(request: NoteLifecycleRequest) {
        if (state.lifecycleSaving) return
        state = state.copy(lifecycleSaving = true, errorMessage = null, unresolvedLifecycleRequest = null)
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                when (request) {
                    is NoteLifecycleRequest.Archive -> repository.setStandaloneArchived(request.request)
                    is NoteLifecycleRequest.Delete -> repository.deleteStandalone(request.request)
                }
            }
            when (result) {
                is DocumentLifecycleResult.Success -> {
                    state = state.copy(lifecycleSaving = false)
                    load(state.archivedView)
                }
                DocumentLifecycleResult.Unauthorized -> {
                    state = state.copy(lifecycleSaving = false, errorMessage = "認証が必要です。")
                    onUnauthorized()
                }
                is DocumentLifecycleResult.Ambiguous -> state = state.copy(
                    lifecycleSaving = false,
                    unresolvedLifecycleRequest = request,
                    errorMessage = result.message,
                )
                is DocumentLifecycleResult.Conflict -> state = state.copy(lifecycleSaving = false, errorMessage = result.message)
                DocumentLifecycleResult.Missing -> state = state.copy(lifecycleSaving = false, errorMessage = "ノートが見つかりません。")
                is DocumentLifecycleResult.Failure -> state = state.copy(lifecycleSaving = false, errorMessage = result.message)
            }
        }
    }

    private fun createRequest(editor: NoteEditorState): NoteEditorRequest? {
        return if (editor.document == null) {
            NoteEditorRequest.Create(
                StandaloneCreateRequest(UUIDv7.next(), UUIDv7.next(), "notitle", ""),
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

    private fun submit(request: NoteEditorRequest, generation: Int = editorGeneration) {
        val editor = state.editor ?: return
        if (editor.saving) return
        state = state.copy(editor = editor.copy(saving = true, errorMessage = null, saveStatus = NoteSaveStatus.SAVING))
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                when (request) {
                    is NoteEditorRequest.Create -> repository.createStandalone(request.request)
                    is NoteEditorRequest.Update -> repository.updateStandalone(request.request)
                    is NoteEditorRequest.TaskUpdate -> repository.updateTaskPrimary(request.request)
                }
            }
            if (generation != editorGeneration) return@launch
            when (result) {
                is DocumentResult.Success -> adopt(result.document, request)
                DocumentResult.Unauthorized -> {
                    state = state.copy(editor = state.editor?.copy(saving = false, unresolvedRequest = request, saveStatus = NoteSaveStatus.AMBIGUOUS, errorMessage = "認証が必要です。保存内容を保持しています。"))
                    onUnauthorized()
                }
                is DocumentResult.Conflict -> {
                    deferredNavigation = null
                    state = state.copy(editor = state.editor?.copy(saving = false, saveStatus = NoteSaveStatus.CONFLICT, errorMessage = result.message))
                }
                is DocumentResult.Failure -> {
                    deferredNavigation = null
                    state = state.copy(editor = state.editor?.copy(saving = false, saveStatus = NoteSaveStatus.ERROR, errorMessage = result.message))
                }
                is DocumentResult.Ambiguous -> {
                    deferredNavigation = null
                    state = state.copy(editor = state.editor?.copy(saving = false, unresolvedRequest = request, saveStatus = NoteSaveStatus.AMBIGUOUS, errorMessage = result.message))
                    reconcileAmbiguous(request)
                }
                DocumentResult.Missing -> {
                    deferredNavigation = null
                    state = state.copy(editor = state.editor?.copy(saving = false, saveStatus = NoteSaveStatus.ERROR, errorMessage = "ノートが見つかりません。"))
                }
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
            if (result is DocumentResult.Success && matches(request, result.document)) adopt(result.document, request)
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

    private fun adopt(document: AndroidDocument, request: NoteEditorRequest) {
        val current = state.editor ?: return
        val localMatchesSent = localMatchesRequest(current, request)
        state = state.copy(
            editor = current.copy(
                document = document,
                title = if (current.kind == DocumentKind.STANDALONE && localMatchesSent) document.title else current.title,
                markdownBody = if (localMatchesSent) document.markdownBody else current.markdownBody,
                saving = false,
                unresolvedRequest = null,
                errorMessage = null,
                saveStatus = if (localMatchesSent) NoteSaveStatus.SAVED else NoteSaveStatus.UNSAVED,
            ),
            documents = updateSummary(document),
        )
        if (localMatchesSent) finishDeferredNavigationIfReady() else scheduleAutosave()
    }

    private fun localMatchesRequest(editor: NoteEditorState, request: NoteEditorRequest): Boolean = when (request) {
        is NoteEditorRequest.Create -> editor.kind == DocumentKind.STANDALONE
            && editor.title.trim() == request.request.title.trim()
            && editor.markdownBody == request.request.markdownBody
        is NoteEditorRequest.Update -> editor.kind == DocumentKind.STANDALONE
            && editor.title.trim() == request.request.title.trim()
            && editor.markdownBody == request.request.markdownBody
        is NoteEditorRequest.TaskUpdate -> editor.kind == DocumentKind.TASK_PRIMARY
            && editor.markdownBody == request.request.markdownBody
    }

    private fun updateSummary(document: AndroidDocument): List<AndroidDocumentSummary> {
        val summary = AndroidDocumentSummary(document.documentId, document.title, document.revision, document.updatedAt)
        val withoutCurrent = state.documents.filterNot { it.documentId == document.documentId }
        return if (document.kind == DocumentKind.STANDALONE) listOf(summary) + withoutCurrent else state.documents
    }

    private fun scheduleAutosave() {
        val generation = editorGeneration
        debounceJob?.cancel()
        val editor = state.editor ?: return
        if (editor.blocked || !editor.dirty) return
        debounceJob = scope.launch {
            delay(NOTE_AUTOSAVE_DEBOUNCE_MS)
            if (generation == editorGeneration && state.editor?.dirty == true && state.editor?.blocked == false && state.editor?.errorMessage == null) save()
        }
    }

    private fun finishDeferredNavigationIfReady() {
        val action = deferredNavigation ?: return
        val editor = state.editor ?: return
        if (editor.saving || editor.blocked || editor.dirty) return
        deferredNavigation = null
        clearEditor()
        action()
    }

    private fun clearEditor() {
        debounceJob?.cancel()
        debounceJob = null
        deferredNavigation = null
        editorGeneration += 1
        state = state.copy(editor = null, errorMessage = null)
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
        saveStatus = NoteSaveStatus.SAVED,
    )

    private companion object {
        const val NOTE_AUTOSAVE_DEBOUNCE_MS = 1_000L
    }
}
