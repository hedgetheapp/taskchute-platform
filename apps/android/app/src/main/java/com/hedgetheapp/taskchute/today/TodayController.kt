package com.hedgetheapp.taskchute.today

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class TodayController(
    private val repository: TodayRepository,
    private val onUnauthorized: () -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    private val onCanonicalDayLoaded: (TodayDay) -> Unit = {},
) {
    var state by mutableStateOf(TodayUiState())
        private set

    private var lastRequestedLogicalDate: String? = null
    private var loadInFlight = false
    private var deferredRealtimeReload = false
    private var authRecoveryAttempted = false
    private var optimisticGeneration = 0L
    private var optimisticActive = false
    private var optimisticReconcileGeneration: Long? = null
    private val pendingEntryIds = mutableSetOf<String>()
    private val confirmedPlacementRevisionFloors = mutableMapOf<String, Int>()
    private val staleReconcileRetryFloors = mutableMapOf<String, Int>()

    fun loadCurrent() = load(null)

    fun refresh() {
        // A user-initiated retry starts a fresh, bounded auth-recovery attempt.
        authRecoveryAttempted = false
        load(lastRequestedLogicalDate)
    }

    /** Reconcile server state without blanking Today or showing the pull-to-refresh state. */
    fun reconcileSilently() {
        if (optimisticActive) optimisticReconcileGeneration = optimisticGeneration
        load(lastRequestedLogicalDate, visible = false)
    }

    fun applyOptimisticPlanning(editor: TaskEditorState, input: NormalizedTaskInput) {
        state.day?.let {
            beginOptimisticMutation()
            applyOptimisticDay(applyOptimisticPlanning(it, editor, input))
        }
    }

    fun applyOptimisticDirectManipulation(request: DirectManipulationRequest) {
        state.day?.let {
            beginOptimisticMutation()
            applyOptimisticDay(applyOptimisticDirectManipulation(it, request))
        }
    }

    /** Accepts the server placement revision without replacing the optimistic projection. */
    fun confirmPlacementRevision(logicalDate: String, revision: Int) {
        val previousFloor = confirmedPlacementRevisionFloors[logicalDate] ?: 0
        val nextRevision = maxOf(previousFloor, revision)
        confirmedPlacementRevisionFloors[logicalDate] = nextRevision
        if (nextRevision > previousFloor) staleReconcileRetryFloors.remove(logicalDate)
        val day = state.day?.takeIf { it.logicalDate == logicalDate }
        val nextDay = day?.copy(placementRevision = maxOf(day.placementRevision, nextRevision))
        val nextOptimisticDay = state.optimisticDay?.let { optimisticDay ->
            if (optimisticDay.logicalDate == logicalDate) {
                optimisticDay.copy(placementRevision = maxOf(optimisticDay.placementRevision, nextRevision))
            } else {
                optimisticDay
            }
        }
        if (nextDay != null) state = state.copy(day = nextDay, optimisticDay = nextOptimisticDay)
    }

    fun clearOptimisticPresentation() {
        optimisticActive = false
        optimisticReconcileGeneration = null
        if (state.optimisticDay != null) state = state.copy(optimisticDay = null)
    }

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
        beginOptimisticMutation()
        state.day?.let { applyOptimisticDay(applyOptimisticLifecycle(it, task.id, LifecycleState.RUNNING)) }
        publishPending()
        scope.launch {
            val canonicalTask = state.day?.allEntries?.firstOrNull { it.id == task.id } ?: task
            val result = withContext(Dispatchers.IO) { repository.startTask(canonicalTask, state.day?.placementRevision ?: 0) }
            finishMutation(task.id, result)
        }
    }

    fun complete(task: TodayTask) {
        if (state.day?.isCurrent != true || task.lifecycleState != LifecycleState.RUNNING || !pendingEntryIds.add(task.id)) return
        beginOptimisticMutation()
        state.day?.let { applyOptimisticDay(applyOptimisticLifecycle(it, task.id, LifecycleState.COMPLETED)) }
        publishPending()
        scope.launch {
            val canonicalTask = state.day?.allEntries?.firstOrNull { it.id == task.id } ?: task
            val result = withContext(Dispatchers.IO) { repository.completeTask(canonicalTask) }
            finishMutation(task.id, result)
        }
    }

    fun close() = scope.coroutineContext.cancel()

    private fun moveDay(delta: Long) {
        val date = state.day?.logicalDate ?: return
        val next = runCatching { LocalDate.parse(date).plusDays(delta).toString() }.getOrNull() ?: return
        load(next)
    }

    private fun load(logicalDate: String?, visible: Boolean = true) {
        if (loadInFlight) {
            if (!visible) deferredRealtimeReload = true
            return
        }
        loadInFlight = true
        lastRequestedLogicalDate = logicalDate
        val startedOptimisticGeneration = optimisticGeneration
        if (visible) {
            val hasExisting = state.day != null && state.status != TodayLoadStatus.ERROR
            optimisticActive = false
            optimisticReconcileGeneration = null
            state = state.copy(
                status = if (hasExisting) TodayLoadStatus.REFRESHING else TodayLoadStatus.LOADING,
                errorMessage = null,
                diagnosticMessage = null,
                optimisticDay = null,
            )
        }
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.loadDay(logicalDate) }
            loadInFlight = false
            when (result) {
                is TodayResult.Success -> {
                    authRecoveryAttempted = false
                    if (publishDay(result.day, startedOptimisticGeneration)) {
                        onCanonicalDayLoaded(result.day)
                        flushDeferredRealtimeReload(visible = false)
                    }
                }
                TodayResult.Unauthorized -> {
                    deferredRealtimeReload = false
                    if (!authRecoveryAttempted) {
                        authRecoveryAttempted = true
                        state = state.copy(status = TodayLoadStatus.AUTH_REQUIRED, errorMessage = "認証の有効期限を確認しています…", diagnosticMessage = null)
                        onUnauthorized()
                    } else {
                        // Do not cycle through SignedIn -> Today -> 401 -> restore indefinitely.
                        // Keep the saved session intact and expose the existing explicit retry UI.
                        state = state.copy(
                            status = TodayLoadStatus.ERROR,
                            errorMessage = "認証を確認後もTodayを読み込めませんでした。再試行してください。",
                            diagnosticMessage = null,
                        )
                    }
                }
                is TodayResult.Failure -> {
                    if (visible || state.day == null) {
                        state = state.copy(
                            status = TodayLoadStatus.ERROR,
                            errorMessage = result.message,
                            diagnosticMessage = result.diagnostic,
                        )
                    }
                    if (visible) flushDeferredRealtimeReload()
                }
            }
        }
    }

    private fun finishMutation(entryId: String, result: TodayMutationResult) {
        pendingEntryIds.remove(entryId)
        when (result) {
            TodayMutationResult.Success -> {
                deferredRealtimeReload = false
                reconcileSilently()
            }
            TodayMutationResult.Unauthorized -> {
                deferredRealtimeReload = false
                state = state.copy(status = TodayLoadStatus.AUTH_REQUIRED, errorMessage = "認証の有効期限を確認しています…")
                onUnauthorized()
            }
            is TodayMutationResult.Failure -> {
                clearOptimisticPresentation()
                state = state.copy(
                    status = if (state.day?.hasEntries == true) TodayLoadStatus.CONTENT else TodayLoadStatus.EMPTY,
                    errorMessage = result.message,
                )
                flushDeferredRealtimeReload()
            }
        }
    }

    private fun requestRealtimeReload() {
        if (loadInFlight || pendingEntryIds.isNotEmpty() || optimisticActive) {
            deferredRealtimeReload = true
            return
        }
        load(state.day?.logicalDate)
    }

    private fun flushDeferredRealtimeReload(visible: Boolean = true) {
        if (!deferredRealtimeReload || loadInFlight || pendingEntryIds.isNotEmpty()) return
        deferredRealtimeReload = false
        load(state.day?.logicalDate, visible = visible)
    }

    private fun publishDay(day: TodayDay, startedOptimisticGeneration: Long): Boolean {
        val floor = confirmedPlacementRevisionFloors[day.logicalDate] ?: 0
        if (day.placementRevision < floor) {
            scheduleStaleReconcile(day.logicalDate, floor)
            return false
        }
        confirmedPlacementRevisionFloors[day.logicalDate] = maxOf(floor, day.placementRevision)
        staleReconcileRetryFloors.remove(day.logicalDate)
        val replaceOptimistic = optimisticActive && optimisticReconcileGeneration == startedOptimisticGeneration
        if (replaceOptimistic) {
            optimisticActive = false
            optimisticReconcileGeneration = null
        }
        state = state.copy(
            status = if (day.hasEntries) TodayLoadStatus.CONTENT else TodayLoadStatus.EMPTY,
            day = day,
            errorMessage = null,
            diagnosticMessage = null,
            pendingEntryIds = pendingEntryIds.toSet(),
            optimisticDay = if (replaceOptimistic || !optimisticActive) null else state.optimisticDay,
        )
        return true
    }

    private fun scheduleStaleReconcile(logicalDate: String, floor: Int) {
        if (staleReconcileRetryFloors[logicalDate] == floor) return
        staleReconcileRetryFloors[logicalDate] = floor
        scope.launch {
            delay(100)
            if (state.day?.logicalDate != logicalDate ||
                confirmedPlacementRevisionFloors[logicalDate] != floor ||
                loadInFlight ||
                pendingEntryIds.isNotEmpty()
            ) return@launch
            load(logicalDate, visible = false)
        }
    }

    private fun publishPending() {
        state = state.copy(pendingEntryIds = pendingEntryIds.toSet(), errorMessage = null)
    }

    private fun applyOptimisticDay(day: TodayDay) {
        if (state.day?.logicalDate != day.logicalDate) return
        state = state.copy(
            optimisticDay = day,
            status = if (day.hasEntries) TodayLoadStatus.CONTENT else TodayLoadStatus.EMPTY,
            errorMessage = null,
        )
    }

    private fun beginOptimisticMutation() {
        optimisticGeneration += 1
        optimisticActive = true
        optimisticReconcileGeneration = null
    }
}
