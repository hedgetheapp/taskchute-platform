package com.hedgetheapp.taskchute.today

data class TodayProject(
    val id: String,
    val title: String,
)

data class TodayMode(
    val id: String,
    val title: String,
)

data class TodayTask(
    val id: String,
    val title: String,
    val lifecycleState: LifecycleState,
    val project: TodayProject?,
    val mode: TodayMode?,
    val estimateSeconds: Int?,
    val plannedStartMinute: Int?,
    val executionId: String?,
    val activeStartedAt: String?,
    val routineDerived: Boolean = false,
    val taskId: String? = null,
    val primaryDocumentId: String? = null,
    val firstStartedAt: String? = null,
    val lastEndedAt: String? = null,
)

enum class LifecycleState {
    PLANNED,
    RUNNING,
    COMPLETED,
}

data class TodaySection(
    val id: String,
    val title: String,
    val startMinute: Int?,
    val endMinute: Int?,
    val entries: List<TodayTask>,
)

data class TodayExecution(
    val id: String,
    val entryId: String,
    val startedAt: String,
    val estimateSeconds: Int?,
)

data class TodayDay(
    val logicalDate: String,
    val isCurrent: Boolean,
    val planningEnabled: Boolean,
    val placementRevision: Int,
    val sections: List<TodaySection>,
    val unsectionedEntries: List<TodayTask>,
    val activeExecution: TodayExecution?,
    val taskChuteDayId: String? = null,
) {
    val allEntries: List<TodayTask> get() = sections.flatMap { it.entries } + unsectionedEntries
    val runningTask: TodayTask?
        get() = activeExecution?.let { execution -> allEntries.firstOrNull { it.id == execution.entryId } }
    val hasEntries: Boolean get() = allEntries.isNotEmpty()
}

/** Planning is available for an established current or future Day, never for the past. */
internal fun canPlanDay(day: TodayDay): Boolean =
    day.planningEnabled && day.taskChuteDayId != null

data class TodayHttpResponse(
    val status: Int?,
    val body: String?,
)

sealed interface TodayResult {
    data class Success(val day: TodayDay) : TodayResult
    data object Unauthorized : TodayResult
    data class Failure(val message: String) : TodayResult
}

sealed interface TodayMutationResult {
    data object Success : TodayMutationResult
    data object Unauthorized : TodayMutationResult
    data class Failure(val message: String) : TodayMutationResult
}

interface TodayRepository {
    fun loadDay(logicalDate: String? = null): TodayResult

    fun startTask(task: TodayTask, placementRevision: Int): TodayMutationResult

    fun completeTask(task: TodayTask): TodayMutationResult
}

enum class TodayLoadStatus {
    LOADING,
    REFRESHING,
    CONTENT,
    EMPTY,
    ERROR,
    AUTH_REQUIRED,
}

data class TodayUiState(
    val status: TodayLoadStatus = TodayLoadStatus.LOADING,
    val day: TodayDay? = null,
    val errorMessage: String? = null,
    val pendingEntryIds: Set<String> = emptySet(),
)
