package com.hedgetheapp.taskchute.today

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class TodayController(
    private val repository: TodayRepository,
    private val onUnauthorized: () -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var state by mutableStateOf(TodayUiState())
        private set

    private var lastRequestedLogicalDate: String? = null
    private var loadInFlight = false
    private var deferredRealtimeReload = false
    private val pendingEntryIds = mutableSetOf<String>()

    fun loadCurrent() = load(null)

    fun refresh() = load(lastRequestedLogicalDate)

    fun previousDay() = moveDay(-1)

    fun nextDay() = moveDay(1)

    fun today() = load(null)

    fun loadLogicalDate(logicalDate: String) = load(logicalDate)

    fun onRealtimeConnected() = requestRealtimeReload()

    fun onRealtimeForeground() = requestRealtimeReload()

    fun onRealtimeDayInvalidation(logicalDate: String?) {
        val selectedDate = state.day?.logicalDate
        if (logicalDate != null && selectedDate != null && logicalDate != selectedDate) return
        requestRealtimeReload()
    }

    fun start(task: TodayTask) {
        if (state.day?.isCurrent != true || task.lifecycleState != LifecycleState.PLANNED || !pendingEntryIds.add(task.id)) return
        publishPending()
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.startTask(task, state.day?.placementRevision ?: 0) }
            finishMutation(task.id, result)
        }
    }

    fun complete(task: TodayTask) {
        if (state.day?.isCurrent != true || task.lifecycleState != LifecycleState.RUNNING || !pendingEntryIds.add(task.id)) return
        publishPending()
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.completeTask(task) }
            finishMutation(task.id, result)
        }
    }

    fun close() = scope.coroutineContext.cancel()

    private fun moveDay(delta: Long) {
        val date = state.day?.logicalDate ?: return
        val next = runCatching { LocalDate.parse(date).plusDays(delta).toString() }.getOrNull() ?: return
        load(next)
    }

    private fun load(logicalDate: String?) {
        if (loadInFlight) return
        loadInFlight = true
        lastRequestedLogicalDate = logicalDate
        val hasExisting = state.day != null && state.status != TodayLoadStatus.ERROR
        state = state.copy(
            status = if (hasExisting) TodayLoadStatus.REFRESHING else TodayLoadStatus.LOADING,
            errorMessage = null,
        )
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.loadDay(logicalDate) }
            loadInFlight = false
            when (result) {
                is TodayResult.Success -> {
                    publishDay(result.day)
                    flushDeferredRealtimeReload()
                }
                TodayResult.Unauthorized -> {
                    deferredRealtimeReload = false
                    state = state.copy(status = TodayLoadStatus.AUTH_REQUIRED, errorMessage = "認証の有効期限を確認しています…")
                    onUnauthorized()
                }
                is TodayResult.Failure -> {
                    state = state.copy(status = TodayLoadStatus.ERROR, errorMessage = result.message)
                    flushDeferredRealtimeReload()
                }
            }
        }
    }

    private fun finishMutation(entryId: String, result: TodayMutationResult) {
        pendingEntryIds.remove(entryId)
        when (result) {
            TodayMutationResult.Success -> {
                deferredRealtimeReload = false
                load(state.day?.logicalDate)
            }
            TodayMutationResult.Unauthorized -> {
                deferredRealtimeReload = false
                state = state.copy(status = TodayLoadStatus.AUTH_REQUIRED, errorMessage = "認証の有効期限を確認しています…")
                onUnauthorized()
            }
            is TodayMutationResult.Failure -> {
                state = state.copy(
                    status = if (state.day?.hasEntries == true) TodayLoadStatus.CONTENT else TodayLoadStatus.EMPTY,
                    errorMessage = result.message,
                )
                flushDeferredRealtimeReload()
            }
        }
    }

    private fun requestRealtimeReload() {
        if (loadInFlight || pendingEntryIds.isNotEmpty()) {
            deferredRealtimeReload = true
            return
        }
        load(state.day?.logicalDate)
    }

    private fun flushDeferredRealtimeReload() {
        if (!deferredRealtimeReload || loadInFlight || pendingEntryIds.isNotEmpty()) return
        deferredRealtimeReload = false
        load(state.day?.logicalDate)
    }

    private fun publishDay(day: TodayDay) {
        state = state.copy(
            status = if (day.hasEntries) TodayLoadStatus.CONTENT else TodayLoadStatus.EMPTY,
            day = day,
            errorMessage = null,
            pendingEntryIds = pendingEntryIds.toSet(),
        )
    }

    private fun publishPending() {
        state = state.copy(pendingEntryIds = pendingEntryIds.toSet(), errorMessage = null)
    }
}
