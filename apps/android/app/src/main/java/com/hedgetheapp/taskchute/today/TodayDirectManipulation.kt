package com.hedgetheapp.taskchute.today

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
}

sealed interface DirectManipulationResult {
    data object Success : DirectManipulationResult
    data object Unauthorized : DirectManipulationResult
    data object Ambiguous : DirectManipulationResult
    data class Failure(val message: String) : DirectManipulationResult
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
                path = "/api/v1/taskchute-days/current/entries/move"
                val placementJson = request.placement?.let {
                    ",\"placement\":{\"kind\":\"relative_to_entry\",\"anchor_entry_id\":\"${JsonEncoding.escape(it.anchorEntryId)}\",\"edge\":\"${it.edge.name.lowercase()}\"}"
                }.orEmpty()
                body = """{"operation_id":"${JsonEncoding.escape(request.operationId)}","entry_id":"${JsonEncoding.escape(request.entryId)}","taskchute_day_id":"${JsonEncoding.escape(request.taskChuteDayId)}","section_id":${nullableString(request.sectionId)},"expected_placement_revision":${request.expectedPlacementRevision}$placementJson}"""
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
            response.status !in 200..299 -> DirectManipulationResult.Failure("Todayを更新できませんでした。再試行してください。")
            else -> DirectManipulationResult.Success
        }
    }

    private fun nullableString(value: String?): String = value?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"
}

data class DirectManipulationUiState(
    val pendingEntryIds: Set<String> = emptySet(),
    val errorMessage: String? = null,
    val unresolvedRequest: DirectManipulationRequest? = null,
    val feedbackMessage: String? = null,
)

class TodayDirectManipulationController(
    private val repository: TodayDirectManipulationRepository,
    private val onRefresh: () -> Unit,
    private val onUnauthorized: () -> Unit,
    private val loadDay: ((String) -> TodayResult)? = null,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    var state by mutableStateOf(DirectManipulationUiState())
        private set

    fun canDrag(day: TodayDay, task: TodayTask): Boolean =
        day.isCurrent && day.planningEnabled && day.taskChuteDayId != null
            && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived
            && state.pendingEntryIds.isEmpty() && state.unresolvedRequest == null

    fun canSelect(day: TodayDay, task: TodayTask): Boolean =
        day.isCurrent && day.planningEnabled && day.taskChuteDayId != null
            && task.lifecycleState == LifecycleState.PLANNED && !task.routineDerived
            && state.pendingEntryIds.isEmpty() && state.unresolvedRequest == null

    /** A group-relative drag needs a canonical multi-entry placement command, which is not available yet. */
    fun canDrag(day: TodayDay, task: TodayTask, selectedEntryIds: Set<String>): Boolean =
        canDrag(day, task) && !(selectedEntryIds.size > 1 && task.id in selectedEntryIds)

    fun reorder(day: TodayDay, sectionId: String?, entryIds: List<String>, affectedEntryIds: Set<String>) {
        if (entryIds.isEmpty() || state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null || day.taskChuteDayId == null) return
        dispatch(affectedEntryIds, DirectManipulationRequest.Reorder(UUIDv7.next(), day.taskChuteDayId, sectionId, entryIds, day.placementRevision))
    }

    fun move(day: TodayDay, entryId: String, target: PlacementTarget) {
        move(day, entryId, target.sectionId, target)
    }

    fun move(day: TodayDay, entryId: String, targetSectionId: String?, placement: PlacementTarget?) {
        if (state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null || day.taskChuteDayId == null) return
        dispatch(setOf(entryId), DirectManipulationRequest.Move(UUIDv7.next(), entryId, day.taskChuteDayId, targetSectionId, day.placementRevision, placement))
    }

    fun duplicate(day: TodayDay, source: TodayTask) {
        if (state.pendingEntryIds.isNotEmpty() || day.taskChuteDayId == null
            || state.unresolvedRequest != null || !day.isCurrent || !day.planningEnabled || source.lifecycleState != LifecycleState.PLANNED) return
        dispatch(
            setOf(source.id),
            DirectManipulationRequest.Duplicate(UUIDv7.next(), source.id, UUIDv7.next(), UUIDv7.next(), day.taskChuteDayId, day.placementRevision),
        )
    }

    fun moveToDay(day: TodayDay, entryIds: Set<String>, targetLogicalDate: String, successMessage: String? = null) {
        if (entryIds.isEmpty() || state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null
            || day.taskChuteDayId == null || !day.isCurrent || !day.planningEnabled
        ) return
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
            )
        }
    }

    fun delete(day: TodayDay, entryIds: Set<String>, successMessage: String? = null) {
        if (entryIds.isEmpty() || state.pendingEntryIds.isNotEmpty() || state.unresolvedRequest != null
            || day.taskChuteDayId == null || !day.isCurrent || !day.planningEnabled
        ) return
        dispatch(
            entryIds,
            DirectManipulationRequest.Delete(UUIDv7.next(), day.taskChuteDayId, entryIds.toList().sorted(), day.placementRevision),
            successMessage,
        )
    }

    fun retryUnresolved() {
        val request = state.unresolvedRequest ?: return
        dispatch(state.pendingEntryIds.ifEmpty { affectedEntries(request) }, request)
    }

    fun clearError() {
        state = state.copy(errorMessage = null, feedbackMessage = null)
    }

    fun clearFeedback() {
        state = state.copy(feedbackMessage = null)
    }

    fun close() = scope.cancel()

    private fun dispatch(entryIds: Set<String>, request: DirectManipulationRequest, successMessage: String? = null) {
        state = state.copy(pendingEntryIds = entryIds, errorMessage = null, feedbackMessage = null)
        scope.launch {
            val result = withContext(Dispatchers.IO) { repository.execute(request) }
            state = state.copy(pendingEntryIds = emptySet())
            when (result) {
                DirectManipulationResult.Success -> {
                    state = state.copy(errorMessage = null, unresolvedRequest = null, feedbackMessage = successMessage)
                    onRefresh()
                }
                DirectManipulationResult.Unauthorized -> onUnauthorized()
                DirectManipulationResult.Ambiguous -> state = state.copy(
                    unresolvedRequest = request,
                    errorMessage = "操作結果を確認できませんでした。元の操作を再試行してください。",
                )
                is DirectManipulationResult.Failure -> state = state.copy(errorMessage = result.message)
            }
        }
    }

    private fun affectedEntries(request: DirectManipulationRequest): Set<String> = when (request) {
        is DirectManipulationRequest.Reorder -> request.entryIds.toSet()
        is DirectManipulationRequest.Move -> setOf(request.entryId)
        is DirectManipulationRequest.Duplicate -> setOf(request.sourceEntryId)
        is DirectManipulationRequest.MoveToDay -> request.entryIds.toSet()
        is DirectManipulationRequest.Delete -> request.entryIds.toSet()
    }
}
