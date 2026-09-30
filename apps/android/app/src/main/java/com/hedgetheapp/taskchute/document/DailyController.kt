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
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
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
    private var unauthorizedLoadGeneration: Int? = null
    private var debounceJob: Job? = null
    private var deferredNavigation: (() -> Unit)? = null
    private val dailySummaryCache = mutableMapOf<String, AndroidDailyDocumentSummary>()
    private var dailySurfaceLoaded = false
    private var pendingDocumentInvalidation = false
    private var documentRefreshInFlight = false

    var state by mutableStateOf(DailyUiState())
        private set

    val hasUnsavedChanges: Boolean get() = state.dirty || state.saving || state.blocked

    fun loadCurrent() {
        dailySurfaceLoaded = true
        scope.launch { loadDate(null) }
    }

    fun previousDate() = state.selectedDate?.let { changeDate(it, -1) }
    fun nextDate() = state.selectedDate?.let { changeDate(it, 1) }

    fun onRealtimeConnected() = onRealtimeForeground()

    fun onRealtimeForeground() {
        if (!dailySurfaceLoaded || state.document == null) return
        pendingDocumentInvalidation = true
        reconcileDocumentInvalidation()
    }

    fun onRealtimeDocumentsInvalidation(documentIds: Set<String>?) {
        if (!dailySurfaceLoaded) return
        val document = state.document ?: return
        if (documentIds != null && document.documentId !in documentIds) return
        pendingDocumentInvalidation = true
        reconcileDocumentInvalidation()
    }

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

        val cachedSummary = logicalDate?.let(dailySummaryCache::get)
        if (cachedSummary != null) {
            when (val result = withContext(Dispatchers.IO) { loadDay(logicalDate) }) {
                is TodayResult.Success -> {
                    if (generation != loadGeneration) return
                    val summary = cachedSummaryFor(result.day)
                    if (summary != null) {
                        loadDocumentForDay(generation, result.day, summary, allowCanonicalRefresh = true)
                    } else {
                        loadFromCanonicalList(generation, result.day)
                    }
                }
                TodayResult.Unauthorized -> showLoadUnauthorized(generation)
                is TodayResult.Failure -> {
                    if (generation == loadGeneration) state = state.copy(loading = false, errorMessage = result.message)
                }
            }
            return
        }

        val (dayResult, listResult) = coroutineScope {
            val day = async(Dispatchers.IO) { loadDay(logicalDate) }
            val summaries = async(Dispatchers.IO) { repository.listDaily() }
            day.await() to summaries.await()
        }
        if (generation != loadGeneration) return
        when (dayResult) {
            TodayResult.Unauthorized -> {
                showLoadUnauthorized(generation)
                return
            }
            is TodayResult.Failure -> {
                state = state.copy(loading = false, errorMessage = dayResult.message)
                return
            }
            is TodayResult.Success -> {
                when (listResult) {
                    DailyListResult.Unauthorized -> {
                        showLoadUnauthorized(generation, dayResult.day)
                        return
                    }
                    is DailyListResult.Failure -> {
                        state = state.copy(loading = false, day = dayResult.day, selectedDate = dayResult.day.logicalDate, errorMessage = listResult.message)
                        return
                    }
                    is DailyListResult.Success -> {
                        replaceSummaryCache(listResult.days)
                        loadDocumentForDay(generation, dayResult.day, cachedSummaryFor(dayResult.day), allowCanonicalRefresh = true)
                    }
                }
            }
        }
    }

    private suspend fun loadFromCanonicalList(generation: Int, day: TodayDay) {
        val listResult = withContext(Dispatchers.IO) { repository.listDaily() }
        if (generation != loadGeneration) return
        when (listResult) {
            is DailyListResult.Success -> {
                replaceSummaryCache(listResult.days)
                loadDocumentForDay(generation, day, cachedSummaryFor(day), allowCanonicalRefresh = false)
            }
            DailyListResult.Unauthorized -> {
                showLoadUnauthorized(generation, day)
            }
            is DailyListResult.Failure -> {
                state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = listResult.message)
            }
        }
    }

    private suspend fun loadDocumentForDay(
        generation: Int,
        day: TodayDay,
        summary: AndroidDailyDocumentSummary?,
        allowCanonicalRefresh: Boolean,
    ) {
        if (generation != loadGeneration) return
        val result = if (summary?.documentId != null) {
            withContext(Dispatchers.IO) { repository.fetchDaily(summary.documentId) }
        } else if (day.taskChuteDayId != null) {
            withContext(Dispatchers.IO) { repository.ensureDaily(DailyEnsureRequest(UUIDv7.next(), day.taskChuteDayId, UUIDv7.next())) }
        } else null

        if (result == DailyResult.Missing && summary?.documentId != null && allowCanonicalRefresh) {
            if (generation == loadGeneration && dailySummaryCache[day.logicalDate] == summary) {
                dailySummaryCache.remove(day.logicalDate)
            }
            loadFromCanonicalList(generation, day)
            return
        }
        if (generation != loadGeneration) return
        when (result) {
            is DailyResult.Success -> {
                dailySummaryCache[day.logicalDate] = AndroidDailyDocumentSummary(day.taskChuteDayId ?: result.document.taskchuteDayId, day.logicalDate, result.document.documentId)
                state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, document = result.document, markdownBody = result.document.markdownBody, saveStatus = DailySaveStatus.SAVED, errorMessage = null)
            }
            DailyResult.Unauthorized -> showLoadUnauthorized(generation, day)
            is DailyResult.Conflict -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = result.message, saveStatus = DailySaveStatus.CONFLICT)
            is DailyResult.Ambiguous -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = result.message, saveStatus = DailySaveStatus.AMBIGUOUS)
            is DailyResult.Failure -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = result.message)
            DailyResult.Missing -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, errorMessage = "デイリーノートを読み取れませんでした。")
            null -> state = state.copy(loading = false, day = day, selectedDate = day.logicalDate, document = null, markdownBody = "", errorMessage = "この日はまだ利用できません。")
        }
    }

    private fun cachedSummaryFor(day: TodayDay): AndroidDailyDocumentSummary? = day.taskChuteDayId?.let { dayId ->
        dailySummaryCache[day.logicalDate]?.takeIf { summary ->
            summary.taskchuteDayId == dayId && summary.logicalDate == day.logicalDate
        }
    }

    private fun replaceSummaryCache(summaries: List<AndroidDailyDocumentSummary>) {
        dailySummaryCache.clear()
        summaries.forEach { summary -> dailySummaryCache[summary.logicalDate] = summary }
    }

    private fun showLoadUnauthorized(generation: Int, day: TodayDay? = null) {
        if (generation != loadGeneration) return
        state = state.copy(
            loading = false,
            day = day ?: state.day,
            selectedDate = day?.logicalDate ?: state.selectedDate,
            errorMessage = "認証が必要です。",
        )
        if (unauthorizedLoadGeneration != generation) {
            unauthorizedLoadGeneration = generation
            onUnauthorized()
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
                    if (localMatches) {
                        finishDeferredNavigationIfReady()
                        reconcileDocumentInvalidation()
                    } else scheduleAutosave()
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

    private fun reconcileDocumentInvalidation() {
        val document = state.document ?: return
        if (!pendingDocumentInvalidation || state.dirty || state.saving || state.blocked || documentRefreshInFlight) return

        pendingDocumentInvalidation = false
        documentRefreshInFlight = true
        val documentId = document.documentId
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.fetchDaily(documentId) }
            documentRefreshInFlight = false
            if (state.document?.documentId != documentId) return@launch
            when (result) {
                is DailyResult.Success -> {
                    if (!state.dirty && !state.saving && !state.blocked) {
                        state = state.copy(
                            document = result.document,
                            markdownBody = result.document.markdownBody,
                            saveStatus = DailySaveStatus.SAVED,
                            errorMessage = null,
                        )
                    }
                }
                DailyResult.Unauthorized -> onUnauthorized()
                is DailyResult.Failure -> state = state.copy(errorMessage = result.message)
                DailyResult.Missing -> state = state.copy(errorMessage = "デイリーノートが見つかりません。")
                is DailyResult.Conflict -> state = state.copy(errorMessage = result.message, saveStatus = DailySaveStatus.CONFLICT)
                is DailyResult.Ambiguous -> state = state.copy(errorMessage = result.message, saveStatus = DailySaveStatus.AMBIGUOUS)
            }
            reconcileDocumentInvalidation()
        }
    }

    private fun changeDate(date: String, days: Long) {
        runCatching { selectDate(LocalDate.parse(date).plusDays(days).toString()) }
    }
}
