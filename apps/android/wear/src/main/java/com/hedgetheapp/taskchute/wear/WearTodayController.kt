package com.hedgetheapp.taskchute.wear

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal class WearTodayController(private val repository: WearRepository) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    var state by mutableStateOf<WearScreenState>(WearScreenState.Restoring)
        private set

    fun restore() {
        if (state != WearScreenState.Restoring && state !is WearScreenState.Error) return
        state = WearScreenState.Restoring
        scope.launch {
            val auth = withContext(Dispatchers.IO) { repository.restoreSession() }
            when (auth) {
                WearAuthResult.SignedOut -> state = WearScreenState.SignedOut
                WearAuthResult.SignedIn -> loadCanonical(showLoading = true)
                WearAuthResult.TransientFailure -> state = WearScreenState.Error("接続できません。通信を確認して再試行してください。")
                WearAuthResult.ProtocolFailure -> state = WearScreenState.Error("認証状態を確認できません。再試行してください。")
            }
        }
    }

    fun onPairingGrant(bridge: WearPairingBridge, pairGrant: WearPairGrant) {
        bridge.pairingExchangeStarted()
        scope.launch {
            val auth = withContext(Dispatchers.IO) {
                repository.exchangePairingGrant(pairGrant.requestId, pairGrant.nonce, pairGrant.grant)
            }
            when (auth) {
                WearAuthResult.SignedIn -> {
                    bridge.pairingExchangeFinished(true)
                    loadCanonical(showLoading = true)
                }
                WearAuthResult.SignedOut -> bridge.pairingExchangeFinished(false, "接続情報の有効期限が切れました。Watchから再度接続してください。")
                WearAuthResult.TransientFailure -> bridge.pairingExchangeFinished(false, "通信結果を確認できません。接続状態を確認して再試行してください。")
                WearAuthResult.ProtocolFailure -> bridge.pairingExchangeFinished(false, "接続を完了できません。Watchから再度接続してください。")
            }
        }
    }

    fun loadToday() {
        state = WearScreenState.Loading
        scope.launch { loadCanonical(showLoading = false) }
    }

    fun start(task: WearTask) {
        val day = when (val current = state) {
            is WearScreenState.Today -> current.day
            is WearScreenState.Completed -> current.day
            else -> return
        }
        if (day.activeExecution != null || task.lifecycle != WearLifecycle.PLANNED) return
        val optimisticExecution = WearExecution("pending-${task.id}", task.id, java.time.Instant.now().toString(), task.estimateSeconds)
        val optimistic = day.copy(activeExecution = optimisticExecution)
        state = WearScreenState.Running(optimistic)
        scope.launch {
            val mutation = withContext(Dispatchers.IO) { repository.start(day, task) }
            reconcileLifecycle(mutation, task, completion = false, previousDay = day)
        }
    }

    fun complete() {
        val day = (state as? WearScreenState.Running)?.day ?: return
        val task = day.runningTask?.let { running ->
            if (running.executionId != null) running else running.copy(executionId = day.activeExecution?.id)
        } ?: return
        scope.launch {
            val mutation = withContext(Dispatchers.IO) { repository.complete(task) }
            reconcileLifecycle(mutation, task, completion = true, previousDay = day)
        }
    }

    fun close() = scope.coroutineContext.cancel()

    private suspend fun reconcileLifecycle(
        mutation: WearMutationResult,
        task: WearTask,
        completion: Boolean,
        previousDay: WearDay,
    ) {
        if (mutation == WearMutationResult.Unauthorized) {
            state = WearScreenState.SignedOut
            return
        }
        val load = withContext(Dispatchers.IO) { repository.loadToday() }
        when (load) {
            WearLoadResult.Unauthorized -> state = WearScreenState.SignedOut
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
                    else -> state = if (day.activeExecution != null) WearScreenState.Running(day) else WearScreenState.Today(day)
                }
            }
        }
    }

    private suspend fun loadCanonical(showLoading: Boolean) {
        if (showLoading) state = WearScreenState.Loading
        when (val result = withContext(Dispatchers.IO) { repository.loadToday() }) {
            WearLoadResult.Unauthorized -> state = WearScreenState.SignedOut
            is WearLoadResult.Failure -> state = WearScreenState.Error("Todayを読み込めません。通信を確認して再試行してください。")
            is WearLoadResult.Success -> state = if (result.day.activeExecution != null) {
                WearScreenState.Running(result.day)
            } else {
                WearScreenState.Today(result.day)
            }
        }
    }
}
