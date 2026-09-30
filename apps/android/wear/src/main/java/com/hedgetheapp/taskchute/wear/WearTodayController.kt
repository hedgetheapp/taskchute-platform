package com.hedgetheapp.taskchute.wear

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

internal class WearTodayController(
    private val repository: WearRepository,
    private val realtime: WearRealtimeClient = NoopWearRealtimeClient,
    private val mainDispatcher: CoroutineDispatcher = Dispatchers.Main.immediate,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private val scope = CoroutineScope(SupervisorJob() + mainDispatcher)
    private val authMutex = Mutex()
    private val loadMutex = Mutex()
    private val refreshGate = WearRefreshGate()

    private var foreground = false
    private var authenticated = false
    private var restoring = false
    private var lifecycleGeneration = 0L
    private var authGeneration = 0L
    private var nextLoadId = 0L
    private var latestAppliedLoadId = 0L

    var state by mutableStateOf<WearScreenState>(WearScreenState.Restoring)
        private set

    fun onForeground() {
        if (foreground) return
        foreground = true
        lifecycleGeneration += 1
        if (authenticated) {
            realtime.start()
            requestCanonicalRefresh(showLoading = true)
        } else {
            restore()
        }
    }

    fun onBackground() {
        if (!foreground) return
        foreground = false
        lifecycleGeneration += 1
        refreshGate.clearPending()
        realtime.stop()
    }

    fun restore() {
        if (restoring) return
        restoring = true
        if (foreground) state = WearScreenState.Restoring
        scope.launch {
            val auth = authMutex.withLock {
                withContext(ioDispatcher) { repository.restoreSession() }
            }
            restoring = false
            when (auth) {
                WearAuthResult.SignedOut -> transitionSignedOut()
                WearAuthResult.SignedIn -> {
                    authenticated = true
                    authGeneration += 1
                    if (foreground) {
                        realtime.start()
                        requestCanonicalRefresh(showLoading = true)
                    }
                }
                WearAuthResult.TransientFailure -> {
                    authenticated = false
                    state = WearScreenState.Error("接続できません。通信を確認して再試行してください。")
                }
                WearAuthResult.ProtocolFailure -> {
                    authenticated = false
                    state = WearScreenState.Error("認証状態を確認できません。再試行してください。")
                }
            }
        }
    }

    fun onPairingGrant(bridge: WearPairingBridge, pairGrant: WearPairGrant) {
        bridge.pairingExchangeStarted()
        scope.launch {
            val auth = authMutex.withLock {
                withContext(ioDispatcher) {
                    repository.exchangePairingGrant(pairGrant.requestId, pairGrant.nonce, pairGrant.grant)
                }
            }
            when (auth) {
                WearAuthResult.SignedIn -> {
                    bridge.pairingExchangeFinished(true)
                    authenticated = true
                    authGeneration += 1
                    if (foreground) {
                        realtime.start()
                        requestCanonicalRefresh(showLoading = true)
                    }
                }
                WearAuthResult.SignedOut -> {
                    authenticated = false
                    bridge.pairingExchangeFinished(false, "接続情報の有効期限が切れました。Watchから再度接続してください。")
                }
                WearAuthResult.TransientFailure -> bridge.pairingExchangeFinished(false, "通信結果を確認できません。接続状態を確認して再試行してください。")
                WearAuthResult.ProtocolFailure -> bridge.pairingExchangeFinished(false, "接続を完了できません。Watchから再度接続してください。")
            }
        }
    }

    fun loadToday() {
        if (!authenticated) {
            restore()
            return
        }
        requestCanonicalRefresh(showLoading = true)
    }

    fun onDayInvalidation(logicalDate: String?) {
        if (!foreground || !authenticated) return
        val currentDate = currentDay()?.logicalDate
        if (logicalDate == null || currentDate == null || logicalDate == currentDate) {
            requestCanonicalRefresh(showLoading = false)
        }
    }

    fun onRealtimeUnauthorized() {
        if (!foreground || !authenticated) return
        transitionSignedOut()
        scope.launch {
            authMutex.withLock { withContext(ioDispatcher) { repository.clearSession() } }
        }
    }

    fun start(task: WearTask) {
        val day = when (val current = state) {
            is WearScreenState.Today -> current.day
            is WearScreenState.Completed -> current.day
            else -> return
        }
        if (!authenticated || day.activeExecution != null || task.lifecycle != WearLifecycle.PLANNED) return
        val optimisticExecution = WearExecution(
            "pending-${task.id}", task.id, java.time.Instant.now().toString(), task.estimateSeconds,
        )
        state = WearScreenState.Running(day.copy(activeExecution = optimisticExecution))
        scope.launch {
            val mutation = withContext(ioDispatcher) { repository.start(day, task) }
            reconcileLifecycle(mutation, task, completion = false, previousDay = day)
        }
    }

    fun complete() {
        val day = (state as? WearScreenState.Running)?.day ?: return
        val task = day.runningTask?.let { running ->
            if (running.executionId != null) running else running.copy(executionId = day.activeExecution?.id)
        } ?: return
        scope.launch {
            val mutation = withContext(ioDispatcher) { repository.complete(task) }
            reconcileLifecycle(mutation, task, completion = true, previousDay = day)
        }
    }

    fun close() {
        realtime.stop()
        scope.coroutineContext.cancel()
    }

    private fun requestCanonicalRefresh(showLoading: Boolean) {
        if (!foreground || !authenticated || !refreshGate.request()) return
        scope.launch {
            var showLoadingForFetch = showLoading
            do {
                if (!foreground || !authenticated) refreshGate.clearPending()
                val lifecycleAtStart = lifecycleGeneration
                val authAtStart = authGeneration
                val loadId = ++nextLoadId
                if (showLoadingForFetch && foreground && authenticated) state = WearScreenState.Loading
                val result = loadMutex.withLock {
                    withContext(ioDispatcher) { repository.loadToday() }
                }
                if (lifecycleAtStart == lifecycleGeneration && authAtStart == authGeneration && foreground && authenticated) {
                    applyCanonicalRefresh(loadId, result)
                }
                showLoadingForFetch = false
            } while (refreshGate.finish() && foreground && authenticated)
        }
    }

    private fun applyCanonicalRefresh(loadId: Long, result: WearLoadResult) {
        if (loadId < latestAppliedLoadId) return
        latestAppliedLoadId = loadId
        when (result) {
            WearLoadResult.Unauthorized -> transitionSignedOut()
            is WearLoadResult.Failure -> state = WearScreenState.Error(
                "Todayを読み込めません。通信を確認してTodayを再読込してください。",
                currentDay(),
            )
            is WearLoadResult.Success -> state = stateForDay(result.day)
        }
    }

    private suspend fun reconcileLifecycle(
        mutation: WearMutationResult,
        task: WearTask,
        completion: Boolean,
        previousDay: WearDay,
    ) {
        if (mutation == WearMutationResult.Unauthorized) {
            transitionSignedOut()
            return
        }
        val lifecycleAtStart = lifecycleGeneration
        val authAtStart = authGeneration
        val loadId = ++nextLoadId
        val load = loadMutex.withLock { withContext(ioDispatcher) { repository.loadToday() } }
        if (!foreground || lifecycleAtStart != lifecycleGeneration || authAtStart != authGeneration || loadId < latestAppliedLoadId) return
        latestAppliedLoadId = loadId
        when (load) {
            WearLoadResult.Unauthorized -> transitionSignedOut()
            is WearLoadResult.Failure -> state = WearScreenState.Error(
                "接続できません。通信状態を確認してTodayを再読込してください。",
                previousDay,
            )
            is WearLoadResult.Success -> {
                val day = load.day
                val currentTask = day.allTasks.firstOrNull { it.id == task.id }
                when {
                    completion && currentTask?.lifecycle == WearLifecycle.COMPLETED ->
                        state = WearScreenState.Completed(day, currentTask)
                    !completion && day.activeExecution?.entryId == task.id -> state = WearScreenState.Running(day)
                    mutation == WearMutationResult.Rejected -> state = WearScreenState.Error(
                        "Taskは変更されていません。\n通信を確認して再試行してください。", day,
                    )
                    mutation == WearMutationResult.Success -> state = WearScreenState.Error(
                        "サーバー状態を確認できません。Todayを再読込してください。", day,
                    )
                    mutation == WearMutationResult.Ambiguous -> state = WearScreenState.Error(
                        "操作結果を確認できません。Todayを再読込してください。", day,
                    )
                    else -> state = stateForDay(day)
                }
            }
        }
    }

    private fun transitionSignedOut() {
        authenticated = false
        authGeneration += 1
        refreshGate.clearPending()
        realtime.stop()
        state = WearScreenState.SignedOut
    }

    private fun stateForDay(day: WearDay): WearScreenState =
        if (day.activeExecution != null) WearScreenState.Running(day) else WearScreenState.Today(day)

    private fun currentDay(): WearDay? = when (val current = state) {
        is WearScreenState.Today -> current.day
        is WearScreenState.Running -> current.day
        is WearScreenState.Completed -> current.day
        is WearScreenState.Error -> current.day
        else -> null
    }
}

private object NoopWearRealtimeClient : WearRealtimeClient {
    override fun start() = Unit
    override fun stop() = Unit
}
