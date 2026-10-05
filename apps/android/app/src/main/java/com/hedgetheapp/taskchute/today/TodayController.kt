package com.hedgetheapp.taskchute.today

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
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
    private var selectedLoadGeneration = 0L
    private var sessionGeneration = 0L
    private var deferredRealtimeReload = false
    private var authRecoveryAttempted = false
    private var optimisticGeneration = 0L
    private var optimisticActive = false
    private var optimisticReconcileGeneration: Long? = null
    private val pendingEntryIds = mutableSetOf<String>()
    private data class PendingComplete(val logicalDate: String, val entryId: String)
    private data class QueuedStartIntent(
        val logicalDate: String,
        val predecessorEntryId: String,
        val task: TodayTask,
    )
    private var pendingComplete: PendingComplete? = null
    private var queuedStartIntent: QueuedStartIntent? = null
    private val confirmedPlacementRevisionFloors = mutableMapOf<String, Int>()
    private val staleReconcileRetryFloors = mutableMapOf<String, Int>()
    private val canonicalDayCache = TodayDayMemoryCache()
    private data class SelectedDayLoad(
        val logicalDate: String?,
        val generation: Long,
        val sessionGeneration: Long,
        val visible: Boolean,
        val optimisticGeneration: Long,
    )
    private data class DayReadRequest(
        val logicalDate: String?,
        val sessionGeneration: Long,
        val result: Deferred<TodayResult>,
        var selectedLoad: SelectedDayLoad? = null,
    )
    private val dayReadRequests = mutableMapOf<String?, DayReadRequest>()
    private var pendingSelectedDayLoad: SelectedDayLoad? = null
    private var pendingPrefetchLogicalDate: String? = null

    private companion object {
        const val MAX_CONCURRENT_DAY_READS = 2
        const val WARM_DAY_REFRESH_ERROR = "保存済みのTodayを表示しています。最新情報を取得できませんでした。"
    }

    fun loadCurrent() = load(null)

    fun refresh() {
        // A user-initiated retry starts a fresh, bounded auth-recovery attempt.
        authRecoveryAttempted = false
        load(lastRequestedLogicalDate)
    }

    /** Reconcile server state without blanking Today or showing the pull-to-refresh state. */
    fun reconcileSilently() {
        if (pendingEntryIds.isNotEmpty()) {
            deferredRealtimeReload = true
            return
        }
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
        canonicalDayCache.remove(logicalDate)
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

    /** Read one adjacent Day early without changing the selected Day or persistent state. */
    fun prefetchLogicalDate(logicalDate: String) {
        if (logicalDate.isBlank()) return
        cachedCanonicalDay(logicalDate)?.let { return }
        if (dayReadRequests.containsKey(logicalDate) || pendingSelectedDayLoad?.logicalDate == logicalDate) return
        if (dayReadRequests.size >= MAX_CONCURRENT_DAY_READS) {
            pendingPrefetchLogicalDate = logicalDate
            return
        }
        startDayRead(logicalDate)
    }

    /** Discard Today data before an auth transition can expose it to another principal. */
    fun resetForSessionChange() {
        sessionGeneration += 1
        selectedLoadGeneration += 1
        dayReadRequests.values.forEach { it.result.cancel() }
        dayReadRequests.clear()
        pendingSelectedDayLoad = null
        pendingPrefetchLogicalDate = null
        canonicalDayCache.clear()
        lastRequestedLogicalDate = null
        loadInFlight = false
        deferredRealtimeReload = false
        authRecoveryAttempted = false
        optimisticGeneration += 1
        optimisticActive = false
        optimisticReconcileGeneration = null
        pendingEntryIds.clear()
        pendingComplete = null
        queuedStartIntent = null
        confirmedPlacementRevisionFloors.clear()
        staleReconcileRetryFloors.clear()
        state = TodayUiState()
    }

    fun onRealtimeConnected() = requestRealtimeReload()

    fun onRealtimeForeground() = requestRealtimeReload()

    fun onRealtimeDayInvalidation(logicalDate: String?) {
        if (logicalDate == null) canonicalDayCache.clear() else canonicalDayCache.remove(logicalDate)
        val selectedDate = state.selectedLogicalDate ?: state.day?.logicalDate
        if (logicalDate != null && selectedDate != null && logicalDate != selectedDate) return
        requestRealtimeReload()
    }

    fun start(task: TodayTask) {
        val canonicalDay = state.day ?: return
        val presentedDay = state.presentedDay?.takeIf { it.logicalDate == canonicalDay.logicalDate } ?: return
        if (!canonicalDay.isCurrent || queuedStartIntent != null || task.lifecycleState != LifecycleState.PLANNED) return
        val predecessor = pendingComplete
        if (predecessor != null && predecessor.logicalDate != canonicalDay.logicalDate) return
        val presentedTask = presentedDay.allEntries.firstOrNull { it.id == task.id } ?: return
        if (presentedTask.lifecycleState != LifecycleState.PLANNED || !pendingEntryIds.add(task.id)) return
        if (presentedDay.allEntries.any { it.lifecycleState == LifecycleState.RUNNING } ||
            presentedDay.activeExecution != null || presentedDay.activeEntry != null
        ) {
            pendingEntryIds.remove(task.id)
            return
        }
        beginOptimisticMutation()
        applyOptimisticDay(applyOptimisticLifecycle(presentedDay, task.id, LifecycleState.RUNNING))
        val queued = predecessor?.let {
            QueuedStartIntent(canonicalDay.logicalDate, it.entryId, presentedTask)
                .also { intent -> queuedStartIntent = intent }
        }
        publishPending()
        if (queued == null) {
            sendStart(
                task = canonicalDay.allEntries.firstOrNull { it.id == task.id } ?: presentedTask,
                logicalDate = canonicalDay.logicalDate,
                placementRevision = effectivePlacementRevision(canonicalDay),
                handoff = null,
            )
        }
    }

    fun complete(task: TodayTask) {
        val canonicalDay = state.day ?: return
        val presentedDay = state.presentedDay?.takeIf { it.logicalDate == canonicalDay.logicalDate } ?: return
        if (!canonicalDay.isCurrent || pendingComplete != null || task.lifecycleState != LifecycleState.RUNNING ||
            presentedDay.runningTask?.id != task.id || !pendingEntryIds.add(task.id)
        ) return
        val intent = PendingComplete(canonicalDay.logicalDate, task.id)
        pendingComplete = intent
        beginOptimisticMutation()
        applyOptimisticDay(applyOptimisticLifecycle(presentedDay, task.id, LifecycleState.COMPLETED))
        publishPending()
        val canonicalTask = canonicalDay.allEntries.firstOrNull { it.id == task.id }
            ?: canonicalDay.runningTask?.takeIf { it.id == task.id }
            ?: task
        val operationSessionGeneration = sessionGeneration
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.completeTask(canonicalTask) }
            if (operationSessionGeneration != sessionGeneration) return@launch
            finishComplete(intent, result)
        }
    }

    fun close() {
        canonicalDayCache.clear()
        dayReadRequests.values.forEach { it.result.cancel() }
        dayReadRequests.clear()
        scope.coroutineContext.cancel()
    }

    private fun moveDay(delta: Long) {
        val date = state.day?.logicalDate ?: return
        val next = runCatching { LocalDate.parse(date).plusDays(delta).toString() }.getOrNull() ?: return
        load(next)
    }

    private fun load(logicalDate: String?, visible: Boolean = true) {
        val activeDate = queuedStartIntent?.logicalDate ?: pendingComplete?.logicalDate
        if (activeDate != null) {
            val requestMatchesHandoff = logicalDate == activeDate ||
                (logicalDate == null && state.day?.logicalDate == activeDate && state.day?.isCurrent == true)
            if (!requestMatchesHandoff) {
                queuedStartIntent?.let(::cancelQueuedStartIntent)
            } else {
                deferredRealtimeReload = true
                return
            }
        }
        if (loadInFlight && (!visible || logicalDate == lastRequestedLogicalDate)) {
            if (!visible) deferredRealtimeReload = true
            return
        }
        val generation = ++selectedLoadGeneration
        val request = SelectedDayLoad(
            logicalDate = logicalDate,
            generation = generation,
            sessionGeneration = sessionGeneration,
            visible = visible,
            optimisticGeneration = optimisticGeneration,
        )
        lastRequestedLogicalDate = logicalDate
        if (visible) {
            val warmDay = logicalDate?.let(::cachedCanonicalDay)
            val hasSameDay = state.presentedDay?.let { existing ->
                (logicalDate == null && existing.isCurrent) || existing.logicalDate == logicalDate
            } == true
            optimisticActive = false
            optimisticReconcileGeneration = null
            state = state.copy(
                status = when {
                    warmDay != null || hasSameDay -> TodayLoadStatus.REFRESHING
                    else -> TodayLoadStatus.LOADING
                },
                day = warmDay ?: state.day,
                selectedLogicalDate = logicalDate,
                errorMessage = null,
                diagnosticMessage = null,
                optimisticDay = null,
            )
        }
        loadInFlight = true
        pendingSelectedDayLoad = null
        if (pendingPrefetchLogicalDate == logicalDate) pendingPrefetchLogicalDate = null
        startSelectedDayLoad(request)
    }

    private fun startSelectedDayLoad(request: SelectedDayLoad) {
        if (request.sessionGeneration != sessionGeneration || request.generation != selectedLoadGeneration) return
        val activeRead = dayReadRequests[request.logicalDate]
        if (activeRead != null) {
            activeRead.selectedLoad = request
            return
        }
        if (dayReadRequests.size >= MAX_CONCURRENT_DAY_READS) {
            pendingSelectedDayLoad = request
            return
        }
        startDayRead(request.logicalDate, request)
    }

    private fun startDayRead(logicalDate: String?, selectedLoad: SelectedDayLoad? = null) {
        dayReadRequests[logicalDate]?.let { existing ->
            if (selectedLoad != null) existing.selectedLoad = selectedLoad
            return
        }
        if (dayReadRequests.size >= MAX_CONCURRENT_DAY_READS) {
            if (selectedLoad != null) pendingSelectedDayLoad = selectedLoad
            else if (logicalDate != null) pendingPrefetchLogicalDate = logicalDate
            return
        }

        val requestSessionGeneration = sessionGeneration
        val request = DayReadRequest(
            logicalDate = logicalDate,
            sessionGeneration = requestSessionGeneration,
            result = scope.async(Dispatchers.IO) { repository.loadDay(logicalDate) },
            selectedLoad = selectedLoad,
        )
        dayReadRequests[logicalDate] = request
        scope.launch {
            val result = try {
                request.result.await()
            } catch (_: CancellationException) {
                null
            } catch (_: Exception) {
                TodayResult.Failure("接続できませんでした。再試行してください。")
            }
            if (dayReadRequests[logicalDate] === request) dayReadRequests.remove(logicalDate)
            if (request.sessionGeneration == sessionGeneration) {
                if (result != null) {
                    val canonicalResult = validateRequestedDay(logicalDate, result)
                    if (canonicalResult is TodayResult.Success) cacheCanonicalDay(canonicalResult.day)
                    request.selectedLoad?.let { selectedLoad ->
                        finishSelectedDayLoad(selectedLoad, canonicalResult)
                    }
                }
                startQueuedDayReads()
            }
        }
    }

    private fun startQueuedDayReads() {
        if (dayReadRequests.size >= MAX_CONCURRENT_DAY_READS) return
        val selected = pendingSelectedDayLoad
        if (selected != null) {
            pendingSelectedDayLoad = null
            if (selected.sessionGeneration == sessionGeneration && selected.generation == selectedLoadGeneration) {
                startSelectedDayLoad(selected)
            }
        }
        if (dayReadRequests.size < MAX_CONCURRENT_DAY_READS) {
            val prefetchedDate = pendingPrefetchLogicalDate
            pendingPrefetchLogicalDate = null
            if (prefetchedDate != null && prefetchedDate != lastRequestedLogicalDate && cachedCanonicalDay(prefetchedDate) == null) {
                startDayRead(prefetchedDate)
            }
        }
    }

    private fun validateRequestedDay(logicalDate: String?, result: TodayResult): TodayResult = when {
        result is TodayResult.Success && logicalDate != null && result.day.logicalDate != logicalDate ->
            TodayResult.Failure("Todayを読み込めませんでした。再試行してください。")
        else -> result
    }

    private fun finishSelectedDayLoad(request: SelectedDayLoad, result: TodayResult) {
        if (request.sessionGeneration != sessionGeneration || request.generation != selectedLoadGeneration) return
        loadInFlight = false
        when (result) {
            is TodayResult.Success -> {
                authRecoveryAttempted = false
                if (publishDay(result.day, request.optimisticGeneration)) {
                    onCanonicalDayLoaded(result.day)
                    flushDeferredRealtimeReload(visible = false)
                }
            }
            TodayResult.Unauthorized -> {
                deferredRealtimeReload = false
                canonicalDayCache.clear()
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
                val warmDay = state.presentedDay?.takeIf { it.logicalDate == request.logicalDate }
                if (request.visible && warmDay != null) {
                    state = state.copy(
                        status = if (warmDay.hasEntries) TodayLoadStatus.CONTENT else TodayLoadStatus.EMPTY,
                        errorMessage = WARM_DAY_REFRESH_ERROR,
                        diagnosticMessage = result.diagnostic,
                        selectedLogicalDate = null,
                    )
                } else if (request.visible || state.day == null) {
                    state = state.copy(
                        status = TodayLoadStatus.ERROR,
                        errorMessage = result.message,
                        diagnosticMessage = result.diagnostic,
                    )
                }
                if (request.visible) flushDeferredRealtimeReload()
            }
        }
    }

    private fun cachedCanonicalDay(logicalDate: String): TodayDay? {
        val cached = canonicalDayCache[logicalDate] ?: return null
        val revisionFloor = confirmedPlacementRevisionFloors[logicalDate] ?: 0
        if (cached.placementRevision < revisionFloor) {
            canonicalDayCache.remove(logicalDate)
            return null
        }
        return cached
    }

    private fun cacheCanonicalDay(day: TodayDay) {
        val revisionFloor = confirmedPlacementRevisionFloors[day.logicalDate] ?: 0
        if (day.placementRevision >= revisionFloor) canonicalDayCache.put(day)
    }

    private fun finishComplete(intent: PendingComplete, result: TodayMutationResult) {
        pendingEntryIds.remove(intent.entryId)
        if (pendingComplete == intent) pendingComplete = null
        publishPending()
        val dependentStart = queuedStartIntent?.takeIf { it.predecessorEntryId == intent.entryId }
        when (result) {
            TodayMutationResult.Success, is TodayMutationResult.SuccessWithRevision -> {
                if (dependentStart != null) {
                    if (dispatchQueuedStart(dependentStart, canonicalProof = false)) return
                    deferredRealtimeReload = false
                    reconcileSilently()
                } else {
                    deferredRealtimeReload = false
                    reconcileSilently()
                }
            }
            TodayMutationResult.Unauthorized -> {
                dependentStart?.let(::cancelQueuedStartIntent)
                deferredRealtimeReload = false
                clearOptimisticPresentation()
                publishPending()
                state = state.copy(status = TodayLoadStatus.AUTH_REQUIRED, errorMessage = "認証の有効期限を確認しています…")
                onUnauthorized()
            }
            is TodayMutationResult.Failure -> {
                if (dependentStart != null) {
                    reconcileAfterUncertainComplete(dependentStart, result.message)
                } else {
                    clearOptimisticPresentation()
                    setMutationFailure(result.message)
                    flushDeferredRealtimeReload()
                }
            }
        }
    }

    private fun reconcileAfterUncertainComplete(intent: QueuedStartIntent, completeError: String) {
        val operationSessionGeneration = sessionGeneration
        scope.launch {
            while (loadInFlight && queuedStartIntent == intent) delay(10)
            if (operationSessionGeneration != sessionGeneration || queuedStartIntent != intent) return@launch
            val result = withContext(Dispatchers.IO) { repository.loadDay(intent.logicalDate) }
            if (operationSessionGeneration != sessionGeneration || queuedStartIntent != intent) return@launch
            if (!isIntentStillSelected(intent)) {
                cancelQueuedStartIntent(intent)
                deferredRealtimeReload = false
                flushDeferredRealtimeReload()
                return@launch
            }
            when (result) {
                is TodayResult.Success -> {
                    val day = result.day
                    if (day.logicalDate != intent.logicalDate || !day.isCurrent) {
                        cancelQueuedStartIntent(intent)
                        deferredRealtimeReload = false
                        setMutationFailure(completeError)
                        return@launch
                    }
                    if (!publishDay(day, optimisticGeneration)) {
                        cancelQueuedStartIntent(intent)
                        deferredRealtimeReload = false
                        setMutationFailure(completeError)
                        return@launch
                    }
                    onCanonicalDayLoaded(day)
                    if (!dispatchQueuedStart(intent, canonicalProof = true)) {
                        deferredRealtimeReload = false
                        setMutationFailure(completeError)
                    }
                }
                TodayResult.Unauthorized -> {
                    cancelQueuedStartIntent(intent)
                    deferredRealtimeReload = false
                    state = state.copy(status = TodayLoadStatus.AUTH_REQUIRED, errorMessage = "認証の有効期限を確認しています…")
                    onUnauthorized()
                }
                is TodayResult.Failure -> {
                    cancelQueuedStartIntent(intent)
                    deferredRealtimeReload = false
                    setMutationFailure(completeError)
                }
            }
        }
    }

    private fun dispatchQueuedStart(intent: QueuedStartIntent, canonicalProof: Boolean): Boolean {
        if (queuedStartIntent != intent || !isIntentStillSelected(intent)) {
            cancelQueuedStartIntent(intent)
            return false
        }
        val day = state.day?.takeIf { it.logicalDate == intent.logicalDate && it.isCurrent } ?: run {
            cancelQueuedStartIntent(intent)
            return false
        }
        val task = day.allEntries.firstOrNull { it.id == intent.task.id }
        val eligible = task?.lifecycleState == LifecycleState.PLANNED
        val activeIds = listOfNotNull(day.activeExecution?.entryId, day.activeEntry?.id).toSet()
        val predecessorResolved = if (canonicalProof) {
            activeIds.isEmpty()
        } else {
            activeIds.isEmpty() || activeIds == setOf(intent.predecessorEntryId)
        }
        if (!eligible || !predecessorResolved) {
            cancelQueuedStartIntent(intent)
            return false
        }
        sendStart(task, intent.logicalDate, effectivePlacementRevision(day), intent)
        return true
    }

    private fun sendStart(task: TodayTask, logicalDate: String, placementRevision: Int, handoff: QueuedStartIntent?) {
        val operationSessionGeneration = sessionGeneration
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.startTask(task, placementRevision) }
            if (operationSessionGeneration != sessionGeneration) return@launch
            finishStart(task.id, logicalDate, handoff, result)
        }
    }

    private fun finishStart(entryId: String, logicalDate: String, handoff: QueuedStartIntent?, result: TodayMutationResult) {
        if (result is TodayMutationResult.SuccessWithRevision && result.placementRevision != null) {
            confirmPlacementRevision(logicalDate, result.placementRevision)
        }
        pendingEntryIds.remove(entryId)
        if (handoff != null && queuedStartIntent == handoff) queuedStartIntent = null
        publishPending()
        when (result) {
            TodayMutationResult.Success, is TodayMutationResult.SuccessWithRevision -> {
                deferredRealtimeReload = false
                reconcileSilently()
            }
            TodayMutationResult.Unauthorized -> {
                deferredRealtimeReload = false
                clearOptimisticPresentation()
                state = state.copy(status = TodayLoadStatus.AUTH_REQUIRED, errorMessage = "認証の有効期限を確認しています…")
                onUnauthorized()
            }
            is TodayMutationResult.Failure -> {
                clearOptimisticPresentation()
                setMutationFailure(result.message)
                if (handoff != null) {
                    deferredRealtimeReload = false
                    reconcileSilently()
                } else {
                    flushDeferredRealtimeReload()
                }
            }
        }
    }

    private fun isIntentStillSelected(intent: QueuedStartIntent): Boolean =
        state.day?.logicalDate == intent.logicalDate && state.day?.isCurrent == true &&
            (lastRequestedLogicalDate == null || lastRequestedLogicalDate == intent.logicalDate)

    private fun effectivePlacementRevision(day: TodayDay): Int =
        maxOf(day.placementRevision, confirmedPlacementRevisionFloors[day.logicalDate] ?: 0)

    private fun cancelQueuedStartIntent(intent: QueuedStartIntent) {
        if (queuedStartIntent != intent) return
        queuedStartIntent = null
        pendingEntryIds.remove(intent.task.id)
        clearOptimisticPresentation()
        publishPending()
    }

    private fun setMutationFailure(message: String) {
        state = state.copy(
            status = if (state.day?.hasEntries == true) TodayLoadStatus.CONTENT else TodayLoadStatus.EMPTY,
            errorMessage = message,
        )
    }

    private fun requestRealtimeReload() {
        canonicalDayCache.clear()
        if (loadInFlight || pendingEntryIds.isNotEmpty() || optimisticActive) {
            deferredRealtimeReload = true
            return
        }
        load(state.selectedLogicalDate ?: state.day?.logicalDate)
    }

    private fun flushDeferredRealtimeReload(visible: Boolean = true) {
        if (!deferredRealtimeReload || loadInFlight || pendingEntryIds.isNotEmpty()) return
        deferredRealtimeReload = false
        load(state.selectedLogicalDate ?: state.day?.logicalDate, visible = visible)
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
            selectedLogicalDate = null,
            errorMessage = null,
            diagnosticMessage = null,
            pendingEntryIds = pendingEntryIds.toSet(),
            optimisticDay = if (replaceOptimistic || !optimisticActive) null else state.optimisticDay,
        )
        cacheCanonicalDay(day)
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
        state.day?.logicalDate?.let(canonicalDayCache::remove)
    }
}
