package com.hedgetheapp.taskchute.document

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayResult
import com.hedgetheapp.taskchute.today.UUIDv7
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate

enum class DailySaveStatus { SAVED, UNSAVED, SAVING, CONFLICT, AMBIGUOUS, ERROR }

data class DailyUiState(
    val loading: Boolean = false,
    val day: TodayDay? = null,
    val selectedDate: String? = null,
    val document: AndroidDailyDocument? = null,
    val markdownBody: String = "",
    val saving: Boolean = false,
    val saveStatus: DailySaveStatus = DailySaveStatus.SAVED,
    val errorMessage: String? = null,
    val unresolvedRequest: DailyUpdateRequest? = null,
) {
    val dirty: Boolean get() = document != null && markdownBody != document.markdownBody
    val blocked: Boolean get() = unresolvedRequest != null
}

class DailyController(
    private val repository: DailyDocumentRepository,
    private val loadDay: (String?) -> TodayResult,
    private val onUnauthorized: () -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    private var loadGeneration = 0
    private var debounceJob: Job? = null
    private var deferredNavigation: (() -> Unit)? = null

    var state by mutableStateOf(DailyUiState())
        private set

    val hasUnsavedChanges: Boolean get() = state.dirty || state.saving || state.blocked

    fun loadCurrent() {
        scope.launch { loadDate(null) }
    }

    fun previousDate() = state.selectedDate?.let { changeDate(it, -1) }
    fun nextDate() = state.selectedDate?.let { changeDate(it, 1) }

    fun selectDate(logicalDate: String) {
        if (logicalDate == state.selectedDate) return
        flushAndNavigate { scope.launch { loadDate(logicalDate) } }
    }

    fun updateBody(value: String) {
        if (state.blocked) return
        state = state.copy(markdownBody = value, saveStatus = if (state.saving) DailySaveStatus.SAVING else DailySaveStatus.UNSAVED, errorMessage = null)
        scheduleAutosave()
    }

    fun save() {
        val current = state.document ?: return
        if (state.saving || state.blocked) return
        debounceJob?.cancel()
        debounceJob = null
        if (!state.dirty) {
            state = state.copy(saveStatus = DailySaveStatus.SAVED, errorMessage = null)
            finishDeferredNavigationIfReady()
            return
        }
        submit(DailyUpdateRequest(UUIDv7.next(), current.taskchuteDayId, current.documentId, current.revision, state.markdownBody))
    }

    fun retryUnresolved() = state.unresolvedRequest?.let(::submit)

    fun flushAndNavigate(action: () -> Unit) {
        if (state.blocked) return
        deferredNavigation = action
        if (state.saving) return
        if (!state.dirty) finishDeferredNavigationIfReady() else save()
    }

    fun close() {
        debounceJob?.cancel()
        scope.cancel()
    }

    private suspend fun loadDate(logicalDate: String?) {
        val generation = ++loadGeneration
        state = state.copy(loading = true, errorMessage = null, unresolvedRequest = null)
        val result = withContext(Dispatchers.IO) { loadDay(logicalDate) }
        if (generation != loadGeneration) return
        when (result) {
            is TodayResult.Success -> loadDocumentForDay(generation, result.day)
            TodayResult.Unauthorized -> {
                state = state.copy(loading = false, errorMessage = "認証が必要です。")
                onUnauthorized()
            }
            is TodayResult.Failure -> state = state.copy(loading = false, errorMessage = result.message)
        }
    }

    private suspend fun loadDocumentForDay(generation: Int, day: TodayDay) {
        val summaries = when (val listResult = withContext(Dispatchers.IO) { repository.listDaily() }) {
            is DailyListResult.Success -> listResult.days
            DailyListResult.Unauthorized -> {
                state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = "認証が必要です。")
                onUnauthorized()
                return
            }
            is DailyListResult.Failure -> {
                state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = listResult.message)
                return
            }
        }
        if (generation != loadGeneration) return
        val summary = summaries.firstOrNull { it.taskchuteDayId == day.taskChuteDayId }
        val result = if (summary?.documentId != null) {
            withContext(Dispatchers.IO) { repository.fetchDaily(summary.documentId) }
        } else if (day.taskChuteDayId != null) {
            withContext(Dispatchers.IO) { repository.ensureDaily(DailyEnsureRequest(UUIDv7.next(), day.taskChuteDayId, UUIDv7.next())) }
        } else null
        if (generation != loadGeneration) return
        when (result) {
            is DailyResult.Success -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, document = result.document, markdownBody = result.document.markdownBody, saveStatus = DailySaveStatus.SAVED, errorMessage = null)
            DailyResult.Unauthorized -> { state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = "認証が必要です。"); onUnauthorized() }
            is DailyResult.Conflict -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = result.message, saveStatus = DailySaveStatus.CONFLICT)
            is DailyResult.Ambiguous -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = result.message, saveStatus = DailySaveStatus.AMBIGUOUS)
            is DailyResult.Failure -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = result.message)
            DailyResult.Missing -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = "デイリーノートを読み取れませんでした。")
            null -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, document = null, markdownBody = "", errorMessage = "この日はまだ利用できません。")
        }
    }

    private fun submit(request: DailyUpdateRequest) {
        if (state.saving) return
        state = state.copy(saving = true, saveStatus = DailySaveStatus.SAVING, errorMessage = null)
        scope.launch {
            when (val result = withContext(Dispatchers.IO) { repository.updateDaily(request) }) {
                is DailyResult.Success -> {
                    val localMatches = state.markdownBody == request.markdownBody
                    state = state.copy(document = result.document, markdownBody = if (localMatches) result.document.markdownBody else state.markdownBody, saving = false, unresolvedRequest = null, saveStatus = if (localMatches) DailySaveStatus.SAVED else DailySaveStatus.UNSAVED, errorMessage = null)
                    if (localMatches) finishDeferredNavigationIfReady() else scheduleAutosave()
                }
                DailyResult.Unauthorized -> { state = state.copy(saving = false, unresolvedRequest = request, saveStatus = DailySaveStatus.AMBIGUOUS, errorMessage = "認証が必要です。保存内容を保持しています。"); onUnauthorized() }
                is DailyResult.Conflict -> state = state.copy(saving = false, saveStatus = DailySaveStatus.CONFLICT, errorMessage = result.message)
                is DailyResult.Ambiguous -> state = state.copy(saving = false, unresolvedRequest = request, saveStatus = DailySaveStatus.AMBIGUOUS, errorMessage = result.message)
                is DailyResult.Failure -> state = state.copy(saving = false, saveStatus = DailySaveStatus.ERROR, errorMessage = result.message)
                DailyResult.Missing -> state = state.copy(saving = false, saveStatus = DailySaveStatus.ERROR, errorMessage = "デイリーノートが見つかりません。")
            }
        }
    }

    private fun scheduleAutosave() {
        debounceJob?.cancel()
        if (!state.dirty || state.blocked) return
        debounceJob = scope.launch {
            delay(1_000)
            if (state.dirty && !state.saving && !state.blocked) save()
        }
    }

    private fun finishDeferredNavigationIfReady() {
        if (state.saving || state.dirty || state.blocked) return
        val action = deferredNavigation ?: return
        deferredNavigation = null
        action()
    }

    private fun changeDate(date: String, days: Long) {
        runCatching { selectDate(LocalDate.parse(date).plusDays(days).toString()) }
    }
}
