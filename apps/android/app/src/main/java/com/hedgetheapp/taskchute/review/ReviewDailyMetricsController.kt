package com.hedgetheapp.taskchute.review

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.hedgetheapp.taskchute.today.TodayDay
import com.hedgetheapp.taskchute.today.TodayResult
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

internal enum class ReviewDailyMetricsStatus {
    IDLE,
    LOADING,
    CONTENT,
    EMPTY,
    UNESTABLISHED,
    FUTURE_UNAVAILABLE,
    ERROR,
    AUTH_REQUIRED,
}

internal data class ReviewDailyMetricsUiState(
    val status: ReviewDailyMetricsStatus = ReviewDailyMetricsStatus.IDLE,
    val currentLogicalDate: String? = null,
    val selectedLogicalDate: String? = null,
    val metrics: ReviewDailyMetrics? = null,
    val message: String? = null,
)

/** Reads canonical Today projections without using TodayController's optimistic presentation or cache. */
internal class ReviewDailyMetricsController(
    private val loadDay: (logicalDate: String?) -> TodayResult,
    private val onUnauthorized: () -> Unit,
    private val onCanonicalCurrentDayLoaded: (TodayDay) -> Unit = {},
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private class LoadOperation(
        var readStarted: Boolean = false,
        var job: Job? = null,
    )

    private val repositoryMutex = Mutex()

    var state by mutableStateOf(ReviewDailyMetricsUiState())
        private set

    private var requestGeneration = 0L
    private var sessionGeneration = 0L
    private var activeLoad: LoadOperation? = null
    private var closed = false

    /** A null selection means the canonical current Day; it is never derived from the device clock. */
    fun loadDaily(selectedLogicalDate: String? = null, debounceMillis: Long = 0) {
        if (closed) return
        if (state.status == ReviewDailyMetricsStatus.LOADING && state.selectedLogicalDate == selectedLogicalDate) return

        val generation = ++requestGeneration
        val session = sessionGeneration
        activeLoad?.let { previous ->
            if (!previous.readStarted) previous.job?.cancel()
        }
        val operation = LoadOperation()
        activeLoad = operation
        state = ReviewDailyMetricsUiState(
            status = ReviewDailyMetricsStatus.LOADING,
            currentLogicalDate = if (selectedLogicalDate == null) null else state.currentLogicalDate,
            selectedLogicalDate = selectedLogicalDate,
        )
        operation.job = scope.launch {
            if (debounceMillis > 0) delay(debounceMillis)
            val selectedDate = selectedLogicalDate?.let(::parseDate)
            if (selectedLogicalDate != null && selectedDate == null) {
                publishError(generation, session, "日付を確認できませんでした。")
                return@launch
            }

            operation.readStarted = true
            val currentResult = readSafely(null)
            if (session == sessionGeneration && !closed
                && currentResult is TodayResult.Success
                && currentResult.day.isCurrent
                && !currentResult.day.taskChuteDayId.isNullOrBlank()
            ) {
                runCatching { onCanonicalCurrentDayLoaded(currentResult.day) }
            }
            if (!isCurrent(generation, session)) return@launch
            when (currentResult) {
                TodayResult.Unauthorized -> publishUnauthorized(generation, session)
                is TodayResult.Failure -> publishError(generation, session, "接続できません。再試行してください。")
                is TodayResult.Success -> loadSelectedProjection(
                    generation = generation,
                    session = session,
                    requestedDate = selectedDate,
                    currentDay = currentResult.day,
                )
            }
        }
    }

    /** Invalidates the in-flight response when the Review destination leaves composition. */
    fun cancelActiveLoad() {
        if (closed) return
        requestGeneration += 1
        activeLoad?.let { operation ->
            if (!operation.readStarted) operation.job?.cancel()
        }
        activeLoad = null
        state = ReviewDailyMetricsUiState()
    }

    /** Drops all Review projection state before authentication changes owner or restores a session. */
    fun resetForSessionChange() {
        sessionGeneration += 1
        requestGeneration += 1
        activeLoad?.job?.cancel()
        activeLoad = null
        state = ReviewDailyMetricsUiState()
    }

    fun close() {
        if (closed) return
        closed = true
        sessionGeneration += 1
        requestGeneration += 1
        activeLoad?.job?.cancel()
        activeLoad = null
        state = ReviewDailyMetricsUiState()
        scope.coroutineContext.cancel()
    }

    private suspend fun loadSelectedProjection(
        generation: Long,
        session: Long,
        requestedDate: LocalDate?,
        currentDay: TodayDay,
    ) {
        if (!currentDay.isCurrent || currentDay.taskChuteDayId.isNullOrBlank()) {
            publishError(generation, session, "現在の日付を確認できませんでした。再試行してください。")
            return
        }
        val currentDate = parseDate(currentDay.logicalDate)
        if (currentDate == null) {
            publishError(generation, session, "現在の日付を確認できませんでした。再試行してください。")
            return
        }
        val targetDate = requestedDate ?: currentDate
        state = state.copy(
            currentLogicalDate = currentDate.toString(),
            selectedLogicalDate = targetDate.toString(),
        )

        when {
            targetDate.isAfter(currentDate) -> {
                if (isCurrent(generation, session)) {
                    state = state.copy(
                        status = ReviewDailyMetricsStatus.FUTURE_UNAVAILABLE,
                        metrics = null,
                        message = "未来日の集計はまだ接続されていません。",
                    )
                }
            }
            targetDate == currentDate -> publishDay(generation, session, currentDay, targetDate, currentDate, requireCurrent = true)
            else -> {
                val historicalResult = readSafely(targetDate.toString())
                if (!isCurrent(generation, session)) return
                when (historicalResult) {
                    TodayResult.Unauthorized -> publishUnauthorized(generation, session)
                    is TodayResult.Failure -> publishError(generation, session, "接続できません。再試行してください。")
                    is TodayResult.Success -> publishDay(
                        generation,
                        session,
                        historicalResult.day,
                        targetDate,
                        currentDate,
                        requireCurrent = false,
                    )
                }
            }
        }
    }

    private fun publishDay(
        generation: Long,
        session: Long,
        day: TodayDay,
        targetDate: LocalDate,
        currentDate: LocalDate,
        requireCurrent: Boolean,
    ) {
        if (!isCurrent(generation, session)) return
        if (parseDate(day.logicalDate) != targetDate || day.isCurrent != requireCurrent) {
            publishError(generation, session, "選択した日の集計を確認できませんでした。再試行してください。")
            return
        }
        when (val projection = projectReviewDailyMetrics(day)) {
            ReviewDailyProjection.Unestablished -> {
                state = state.copy(
                    status = ReviewDailyMetricsStatus.UNESTABLISHED,
                    currentLogicalDate = currentDate.toString(),
                    selectedLogicalDate = targetDate.toString(),
                    metrics = null,
                    message = "この日はまだ記録されていません。",
                )
            }
            ReviewDailyProjection.Invalid -> publishError(
                generation,
                session,
                "完了時間を含む集計データを確認できませんでした。再試行してください。",
            )
            is ReviewDailyProjection.Available -> {
                state = state.copy(
                    status = if (projection.metrics.hasEntries) ReviewDailyMetricsStatus.CONTENT else ReviewDailyMetricsStatus.EMPTY,
                    currentLogicalDate = currentDate.toString(),
                    selectedLogicalDate = targetDate.toString(),
                    metrics = projection.metrics,
                    message = null,
                )
            }
        }
    }

    private suspend fun readSafely(logicalDate: String?): TodayResult = try {
        repositoryMutex.withLock {
            withContext(ioDispatcher) { loadDay(logicalDate) }
        }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        TodayResult.Failure("Review day read failed")
    }

    private fun publishUnauthorized(generation: Long, session: Long) {
        if (!isCurrent(generation, session)) return
        state = state.copy(
            status = ReviewDailyMetricsStatus.AUTH_REQUIRED,
            metrics = null,
            message = "認証状態を確認しています…",
        )
        onUnauthorized()
    }

    private fun publishError(generation: Long, session: Long, message: String) {
        if (!isCurrent(generation, session)) return
        state = state.copy(
            status = ReviewDailyMetricsStatus.ERROR,
            metrics = null,
            message = message,
        )
    }

    private fun isCurrent(generation: Long, session: Long): Boolean =
        !closed && generation == requestGeneration && session == sessionGeneration

    private fun parseDate(value: String): LocalDate? = runCatching { LocalDate.parse(value) }.getOrNull()
}

