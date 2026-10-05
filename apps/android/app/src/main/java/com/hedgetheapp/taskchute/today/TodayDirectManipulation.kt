package com.hedgetheapp.taskchute.today

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.hedgetheapp.taskchute.BuildConfig
import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class PlacementTarget(
    val sectionId: String?,
    val anchorEntryId: String,
    val edge: PlacementEdge,
)

enum class PlacementEdge { BEFORE, AFTER }

sealed interface DirectManipulationRequest {
    val operationId: String

    data class Reorder(
        override val operationId: String,
        val taskChuteDayId: String,
        val sectionId: String?,
        val entryIds: List<String>,
        val expectedPlacementRevision: Int,
    ) : DirectManipulationRequest

    data class Move(
        override val operationId: String,
        val entryId: String,
        val taskChuteDayId: String,
        val sectionId: String?,
        val expectedPlacementRevision: Int,
        val placement: PlacementTarget?,
        val routineScoped: Boolean = false,
        val relativePlannedStartAnchor: Boolean = false,
    ) : DirectManipulationRequest

    data class Duplicate(
        override val operationId: String,
        val sourceEntryId: String,
        val newTaskId: String,
        val newEntryId: String,
        val taskChuteDayId: String,
        val expectedPlacementRevision: Int,
    ) : DirectManipulationRequest

    data class MoveToDay(
        override val operationId: String,
        val sourceTaskChuteDayId: String,
        val entryIds: List<String>,
        val targetLogicalDate: String,
        val expectedSourcePlacementRevision: Int,
        val allowSectionFallback: Boolean,
    ) : DirectManipulationRequest

    data class Delete(
        override val operationId: String,
        val taskChuteDayId: String,
        val entryIds: List<String>,
        val expectedPlacementRevision: Int,
    ) : DirectManipulationRequest

    data class HardDelete(
        override val operationId: String,
        val entryId: String,
        val taskChuteDayId: String,
        val expectedPlacementRevision: Int,
    ) : DirectManipulationRequest
}

sealed interface DirectManipulationResult {
    data object Success : DirectManipulationResult
    data class SuccessWithRevision(val placementRevision: Int?) : DirectManipulationResult
    data object Unauthorized : DirectManipulationResult
    data object Ambiguous : DirectManipulationResult
    data class Failure(
        val message: String,
        val status: Int? = null,
        val code: String? = null,
        val serverMessage: String? = null,
        val reconcile: Boolean? = null,
    ) : DirectManipulationResult
}

internal const val DETERMINISTIC_FAILURE_MESSAGE = "操作を完了できませんでした。\nもう一度操作してください。"

internal fun parseDirectManipulationFailure(body: String?, status: Int?): DirectManipulationResult.Failure {
    val errorObject = runCatching {
        (JsonParser(body ?: "").parse() as? JsonValue.Object)
            ?.fields?.get("error") as? JsonValue.Object
    }.getOrNull()
    return DirectManipulationResult.Failure(
        message = DETERMINISTIC_FAILURE_MESSAGE,
        status = status,
        code = (errorObject?.fields?.get("code") as? JsonValue.StringValue)?.value,
        serverMessage = (errorObject?.fields?.get("message") as? JsonValue.StringValue)?.value,
        reconcile = when (val value = errorObject?.fields?.get("reconcile")) {
            is JsonValue.BooleanValue -> value.value
            else -> null
        },
    )
}

interface TodayDirectManipulationRepository {
    fun execute(request: DirectManipulationRequest): DirectManipulationResult
}

class TodayDirectManipulationHttpRepository(
    private val request: (method: String, path: String, body: String?) -> TodayHttpResponse?,
    private val onUnauthorized: () -> Unit = {},
) : TodayDirectManipulationRepository {
    override fun execute(request: DirectManipulationRequest): DirectManipulationResult {
        val path: String
        val body: String
        when (request) {
            is DirectManipulationRequest.Reorder -> {
                path = "/api/v1/taskchute-days/current/entries/reorder"
                body = """{"operation_id":"${JsonEncoding.escape(request.operationId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskChuteDayId)}","section_id":${nullableString(request.sectionId)},"entry_ids":[${request.entryIds.joinToString(",") { "\"${JsonEncoding.escape(it)}\"" }}],"expected_placement_revision":${request.expectedPlacementRevision}}"""
            }
            is DirectManipulationRequest.Move -> {
                path = if (request.routineScoped) {
                    "/api/v1/taskchute-days/current/entries/bulk-section-occurrence"
                } else {
                    "/api/v1/taskchute-days/current/entries/move"
                }
                val placementJson = request.placement?.let {
                    ",\"placement\":{\"kind\":\"relative_to_entry\",\"anchor_entry_id\":\"${JsonEncoding.escape(it.anchorEntryId)}\",\"edge\":\"${it.edge.name.lowercase()}\"}"
                }.orEmpty()
                val relativePlannedStartJson = if (request.relativePlannedStartAnchor) {
                    ",\"relative_planned_start\":\"anchor\""
                } else {
                    ""
                }
                body = if (request.routineScoped) {
                    """{"operation_id":"${JsonEncoding.escape(request.operationId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskChuteDayId)}","entry_ids":["${JsonEncoding.escape(request.entryId)}"],"section_id":${nullableString(request.sectionId)},"expected_placement_revision":${request.expectedPlacementRevision}$placementJson$relativePlannedStartJson}"""
                } else {
                    """{"operation_id":"${JsonEncoding.escape(request.operationId)}","entry_id":"${JsonEncoding.escape(request.entryId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskChuteDayId)}","section_id":${nullableString(request.sectionId)},"expected_placement_revision":${request.expectedPlacementRevision}$placementJson$relativePlannedStartJson}"""
                }
            }
            is DirectManipulationRequest.Duplicate -> {
                path = "/api/v1/entries/${JsonEncoding.pathSegment(request.sourceEntryId)}/duplicate"
                body = """{"operation_id":"${JsonEncoding.escape(request.operationId)}","source_entry_id":"${JsonEncoding.escape(request.sourceEntryId)}","new_task_id":"${JsonEncoding.escape(request.newTaskId)}","new_entry_id":"${JsonEncoding.escape(request.newEntryId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskChuteDayId)}","expected_placement_revision":${request.expectedPlacementRevision}}"""
            }
            is DirectManipulationRequest.MoveToDay -> {
                path = "/api/v1/taskchute-days/entries/bulk-move-to-day"
                body = """{"operation_id":"${JsonEncoding.escape(request.operationId)}","source_taskchute_day_id":"${JsonEncoding.escape(request.sourceTaskChuteDayId)}","entry_ids":[${request.entryIds.joinToString(",") { "\"${JsonEncoding.escape(it)}\"" }}],"target_logical_date":"${JsonEncoding.escape(request.targetLogicalDate)}","expected_source_placement_revision":${request.expectedSourcePlacementRevision},"allow_section_fallback":${request.allowSectionFallback}}"""
            }
            is DirectManipulationRequest.Delete -> {
                path = "/api/v1/taskchute-days/current/entries/bulk-delete"
                body = """{"operation_id":"${JsonEncoding.escape(request.operationId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskChuteDayId)}","entry_ids":[${request.entryIds.joinToString(",") { "\"${JsonEncoding.escape(it)}\"" }}],"expected_placement_revision":${request.expectedPlacementRevision}}"""
            }
            is DirectManipulationRequest.HardDelete -> {
                path = "/api/v1/entries/${JsonEncoding.pathSegment(request.entryId)}/delete-completed"
                body = """{"operation_id":"${JsonEncoding.escape(request.operationId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskChuteDayId)}","entry_id":"${JsonEncoding.escape(request.entryId)}","expected_placement_revision":${request.expectedPlacementRevision}}"""
            }
        }
        return execute("POST", path, body)
    }

    private fun execute(method: String, path: String, body: String): DirectManipulationResult {
        val response = runCatching { request(method, path, body) }.getOrNull()
            ?: return DirectManipulationResult.Ambiguous
        return when {
            response.status == null -> DirectManipulationResult.Ambiguous
            response.status == 401 -> {
                onUnauthorized()
                DirectManipulationResult.Unauthorized
            }
            response.status == 503 -> DirectManipulationResult.Ambiguous
            response.status !in 200..299 -> parseDirectManipulationFailure(response.body, response.status)
            else -> runCatching { TaskPlanningJsonParser.parsePlacementRevision(response.body) }
                .getOrNull()
                ?.let(DirectManipulationResult::SuccessWithRevision)
                ?: DirectManipulationResult.Success
        }
    }

    private fun nullableString(value: String?): String = value?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"
}

data class DirectManipulationUiState(
    val pendingEntryIds: Set<String> = emptySet(),
    val errorMessage: String? = null,
    val unresolvedRequest: DirectManipulationRequest? = null,
    val feedbackMessage: String? = null,
    val deterministicFailureToken: Long? = null,
    val lastDeterministicFailure: DirectManipulationResult.Failure? = null,
)

class TodayDirectManipulationController(
    private val repository: TodayDirectManipulationRepository,
    private val onRefresh: () -> Unit,
    private val onUnauthorized: () -> Unit,
    private val onOptimisticIntent: (DirectManipulationRequest) -> Unit = {},
    private val onOptimisticFailure: () -> Unit = {},
    private val loadDay: ((String) -> TodayResult)? = null,
    private val onPlacementRevisionConfirmed: (String, Int) -> Unit = { _, _ -> },
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var state by mutableStateOf(DirectManipulationUiState())
        private set

    private var nextDeterministicFailureToken = 0L

    fun canDrag(day: TodayDay, task: TodayTask): Boolean =
        canPlanDay(day)
            && task.lifecycleState == LifecycleState.PLANNED
            && state.pendingEntryIds.isEmpty() && state.unresolvedRequest == null

    fun canSelect(day: TodayDay, task: TodayTask): Boolean =
        canPlanDay(day)
            && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived
            && state.pendingEntryIds.isEmpty() && state.unresolvedRequest == null

    /** A group-relative drag needs a canonical multi-entry placement command, which is not available yet. */
    fun canDrag(day: TodayDay, task: TodayTask, selectedEntryIds: Set<String>): Boolean =
        canDrag(day, task) && !(selectedEntryIds.size > 1 && task.id in selectedEntryIds)

    fun reorder(day: TodayDay, sectionId: String?, entryIds: List<String>, affectedEntryIds: Set<String>) {
        val dayId = day.taskChuteDayId ?: return
        if (entryIds.isEmpty() || state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null || !canPlanDay(day)) return
        dispatch(
            affectedEntryIds,
            DirectManipulationRequest.Reorder(UUIDv7.next(), dayId, sectionId, entryIds, day.placementRevision),
            logicalDate = day.logicalDate,
        )
    }

    fun move(day: TodayDay, entryId: String, target: PlacementTarget) {
        move(day, entryId, target.sectionId, target)
    }

    fun move(
        day: TodayDay,
        entryId: String,
        targetSectionId: String?,
        placement: PlacementTarget?,
        routineScoped: Boolean = false,
        relativePlannedStartAnchor: Boolean = false,
    ) {
        val dayId = day.taskChuteDayId ?: return
        if (state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null || !canPlanDay(day)) return
        dispatch(
            setOf(entryId),
            DirectManipulationRequest.Move(
                UUIDv7.next(), entryId, dayId, targetSectionId, day.placementRevision,
                placement, routineScoped, relativePlannedStartAnchor,
            ),
            logicalDate = day.logicalDate,
        )
    }

    fun duplicate(day: TodayDay, source: TodayTask) {
        if (state.pendingEntryIds.isNotEmpty() || day.taskChuteDayId == null
            || state.unresolvedRequest != null || !canPlanDay(day) || source.lifecycleState != LifecycleState.PLANNED) return
        dispatch(
            setOf(source.id),
            DirectManipulationRequest.Duplicate(UUIDv7.next(), source.id, UUIDv7.next(), UUIDv7.next(), day.taskChuteDayId, day.placementRevision),
            logicalDate = day.logicalDate,
        )
    }

    fun moveToDay(day: TodayDay, entryIds: Set<String>, targetLogicalDate: String, successMessage: String? = null, allowPastSource: Boolean = false) {
        if (entryIds.isEmpty() || state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null
            || day.taskChuteDayId == null || (!canPlanDay(day) && !allowPastSource)
        ) return
        if (allowPastSource && targetLogicalDate < day.logicalDate) {
            state = state.copy(errorMessage = "過去の日には移動できません。", feedbackMessage = null)
            return
        }
        val ids = entryIds.toList().sorted()
        state = state.copy(pendingEntryIds = ids.toSet(), errorMessage = null, feedbackMessage = null)
        scope.launch {
            if (targetLogicalDate < day.logicalDate) {
                val target = withContext(Dispatchers.IO) { loadDay?.invoke(targetLogicalDate) }
                when (target) {
                    TodayResult.Unauthorized -> {
                        state = state.copy(pendingEntryIds = emptySet())
                        onUnauthorized()
                        return@launch
                    }
                    is TodayResult.Failure, null -> {
                        state = state.copy(pendingEntryIds = emptySet(), errorMessage = "移動先の日を確認できませんでした。再試行してください。")
                        return@launch
                    }
                    is TodayResult.Success -> if (target.day.taskChuteDayId == null) {
                        state = state.copy(pendingEntryIds = emptySet(), errorMessage = "未確立の過去の日には移動できません。")
                        return@launch
                    }
                }
            }
            dispatch(
                ids.toSet(),
                DirectManipulationRequest.MoveToDay(
                    operationId = UUIDv7.next(),
                    sourceTaskChuteDayId = day.taskChuteDayId,
                    entryIds = ids,
                    targetLogicalDate = targetLogicalDate,
                    expectedSourcePlacementRevision = day.placementRevision,
                    allowSectionFallback = true,
                ),
                successMessage,
                day.logicalDate,
            )
        }
    }

    fun delete(day: TodayDay, entryIds: Set<String>, successMessage: String? = null) {
        val historicalSingleDelete = !day.isCurrent && !day.planningEnabled && day.taskChuteDayId != null
            && entryIds.size == 1
        if (entryIds.isEmpty() || state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null
            || day.taskChuteDayId == null || (!canPlanDay(day) && !historicalSingleDelete)
        ) return
        dispatch(
            entryIds,
            DirectManipulationRequest.Delete(UUIDv7.next(), day.taskChuteDayId, entryIds.toList().sorted(), day.placementRevision),
            successMessage,
            day.logicalDate,
        )
    }

    fun deleteLifecycle(day: TodayDay, task: TodayTask, successMessage: String? = null) {
        val historicalPast = !day.isCurrent && !day.planningEnabled && day.taskChuteDayId != null
        if ((!day.isCurrent && !historicalPast) || day.taskChuteDayId == null || task.lifecycleState == LifecycleState.PLANNED
            || state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null) return
        dispatch(
            setOf(task.id),
            DirectManipulationRequest.HardDelete(UUIDv7.next(), task.id, day.taskChuteDayId, day.placementRevision),
            successMessage,
            day.logicalDate,
        )
    }

    fun retryUnresolved() {
        val request = state.unresolvedRequest ?: return
        dispatch(state.pendingEntryIds.ifEmpty { affectedEntries(request) }, request)
    }

    fun clearError() {
        state = state.copy(errorMessage = null, feedbackMessage = null, deterministicFailureToken = null, lastDeterministicFailure = null)
    }

    /** Clears only the deterministic failure instance that scheduled this dismissal. */
    fun clearDeterministicError(token: Long) {
        if (state.deterministicFailureToken == token && state.errorMessage == DETERMINISTIC_FAILURE_MESSAGE) {
            state = state.copy(errorMessage = null, deterministicFailureToken = null, lastDeterministicFailure = null)
        }
    }

    fun clearFeedback() {
        state = state.copy(feedbackMessage = null)
    }

    fun close() = scope.cancel()

    private var unresolvedLogicalDate: String? = null

    private fun dispatch(
        entryIds: Set<String>,
        request: DirectManipulationRequest,
        successMessage: String? = null,
        logicalDate: String? = null,
    ) {
        if (logicalDate != null) unresolvedLogicalDate = logicalDate
        onOptimisticIntent(request)
        state = state.copy(
            pendingEntryIds = entryIds,
            errorMessage = null,
            feedbackMessage = null,
            deterministicFailureToken = null,
            lastDeterministicFailure = null,
        )
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.execute(request) }
            logDebugResult(request, result, unresolvedLogicalDate)
            when (result) {
                DirectManipulationResult.Success -> {
                    unresolvedLogicalDate = null
                    state = state.copy(
                        pendingEntryIds = emptySet(),
                        errorMessage = null,
                        unresolvedRequest = null,
                        feedbackMessage = successMessage,
                    )
                    onRefresh()
                }
                is DirectManipulationResult.SuccessWithRevision -> {
                    result.placementRevision?.let { revision ->
                        unresolvedLogicalDate?.let { date -> onPlacementRevisionConfirmed(date, revision) }
                    }
                    unresolvedLogicalDate = null
                    state = state.copy(
                        pendingEntryIds = emptySet(),
                        errorMessage = null,
                        unresolvedRequest = null,
                        feedbackMessage = successMessage,
                    )
                    onRefresh()
                }
                DirectManipulationResult.Unauthorized -> {
                    state = state.copy(pendingEntryIds = emptySet())
                    onOptimisticFailure()
                    onUnauthorized()
                }
                DirectManipulationResult.Ambiguous -> {
                    state = state.copy(pendingEntryIds = emptySet())
                    onOptimisticFailure()
                    state = state.copy(
                        unresolvedRequest = request,
                        errorMessage = "操作結果を確認できませんでした。元の操作を再試行してください。",
                    )
                }
                is DirectManipulationResult.Failure -> {
                    state = state.copy(pendingEntryIds = emptySet())
                    onOptimisticFailure()
                    nextDeterministicFailureToken += 1
                    state = state.copy(
                        errorMessage = DETERMINISTIC_FAILURE_MESSAGE,
                        deterministicFailureToken = nextDeterministicFailureToken,
                        lastDeterministicFailure = result,
                    )
                }
            }
        }
    }

    private fun affectedEntries(request: DirectManipulationRequest): Set<String> = when (request) {
        is DirectManipulationRequest.Reorder -> request.entryIds.toSet()
        is DirectManipulationRequest.Move -> setOf(request.entryId)
        is DirectManipulationRequest.Duplicate -> setOf(request.sourceEntryId)
        is DirectManipulationRequest.MoveToDay -> request.entryIds.toSet()
        is DirectManipulationRequest.Delete -> request.entryIds.toSet()
        is DirectManipulationRequest.HardDelete -> setOf(request.entryId)
    }

    private fun logDebugResult(
        request: DirectManipulationRequest,
        result: DirectManipulationResult,
        logicalDate: String?,
    ) {
        if (!BuildConfig.DEBUG) return
        val commandAndRevision = when (request) {
            is DirectManipulationRequest.Reorder -> "reorder expectedRevision=${request.expectedPlacementRevision}"
            is DirectManipulationRequest.Move -> "move expectedRevision=${request.expectedPlacementRevision}"
            is DirectManipulationRequest.Duplicate -> "duplicate expectedRevision=${request.expectedPlacementRevision}"
            is DirectManipulationRequest.MoveToDay -> "moveToDay expectedRevision=${request.expectedSourcePlacementRevision}"
            is DirectManipulationRequest.Delete -> "delete expectedRevision=${request.expectedPlacementRevision}"
            is DirectManipulationRequest.HardDelete -> "hardDelete expectedRevision=${request.expectedPlacementRevision}"
        }
        val resultDetails = when (result) {
            is DirectManipulationResult.Failure ->
                "status=${result.status} code=${result.code} reconcile=${result.reconcile} serverMessage=${result.serverMessage}"
            is DirectManipulationResult.SuccessWithRevision -> "returnedRevision=${result.placementRevision}"
            DirectManipulationResult.Success -> "result=success"
            DirectManipulationResult.Unauthorized -> "result=unauthorized"
            DirectManipulationResult.Ambiguous -> "result=ambiguous"
        }
        runCatching {
            Log.d(
                "TodayDirectManipulation",
                "command=$commandAndRevision logicalDate=${logicalDate ?: "unknown"} $resultDetails",
            )
        }
    }
}
