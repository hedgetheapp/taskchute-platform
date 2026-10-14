package com.hedgetheapp.taskchute.review

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue
import com.hedgetheapp.taskchute.today.TodayHttpResponse
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

internal data class ReviewPeriodMetrics(
    val granularity: ReviewPeriodGranularity,
    val anchor: String,
    val establishedDayCount: Long,
    val completedCount: Long,
    val unexecutedCount: Long,
    val completedActualDurationSeconds: Long,
    val routineActivity: ReviewRoutineActivity? = null,
)

internal enum class ReviewRoutineActivityCoverage { UNMEASURED, PARTIAL, COMPLETE }

internal data class ReviewRoutineActivity(
    val coverage: ReviewRoutineActivityCoverage,
    val createdCount: Long?,
    val deletedCount: Long?,
    val coverageStartedAt: String?,
    val coverageStartedLogicalDate: String?,
)

internal enum class ReviewRoutineActivityStatus {
    IDLE,
    LOADING,
    UNMEASURED,
    PARTIAL,
    COMPLETE,
    UNAVAILABLE,
    ERROR,
    AUTH_REQUIRED,
}

internal data class ReviewRoutineActivityUiState(
    val status: ReviewRoutineActivityStatus = ReviewRoutineActivityStatus.IDLE,
    val activity: ReviewRoutineActivity? = null,
    val message: String? = null,
)

internal sealed interface ReviewPeriodMetricsResult {
    data class Success(val metrics: ReviewPeriodMetrics) : ReviewPeriodMetricsResult
    data class RoutineActivitySuccess(val activity: ReviewRoutineActivity?) : ReviewPeriodMetricsResult
    data object Unauthorized : ReviewPeriodMetricsResult
    data class Failure(val message: String) : ReviewPeriodMetricsResult
}

internal class ReviewPeriodMetricsHttpRepository(
    private val request: (method: String, path: String, body: String?) -> TodayHttpResponse?,
) {
    fun load(granularity: ReviewPeriodGranularity, anchor: String): ReviewPeriodMetricsResult {
        if (!isCanonicalAnchor(granularity, anchor)) {
            return ReviewPeriodMetricsResult.Failure("選択期間を確認できませんでした。")
        }
        val period = when (granularity) {
            ReviewPeriodGranularity.DAILY -> "daily"
            ReviewPeriodGranularity.MONTHLY -> "monthly"
            ReviewPeriodGranularity.YEARLY -> "yearly"
        }
        val encodedAnchor = URLEncoder.encode(anchor, Charsets.UTF_8.name())
        val response = runCatching {
            request("GET", "/api/v1/review/date-metrics?period=$period&anchor=$encodedAnchor", null)
        }.getOrNull() ?: return ReviewPeriodMetricsResult.Failure("接続できません。再試行してください。")

        return when {
            response.status == null -> ReviewPeriodMetricsResult.Failure("接続できません。再試行してください。")
            response.status == 401 -> ReviewPeriodMetricsResult.Unauthorized
            granularity == ReviewPeriodGranularity.DAILY && response.status in setOf(400, 404) ->
                ReviewPeriodMetricsResult.RoutineActivitySuccess(null)
            response.status !in 200..299 -> ReviewPeriodMetricsResult.Failure("集計データを読み込めませんでした。再試行してください。")
            granularity == ReviewPeriodGranularity.DAILY ->
                ReviewPeriodMetricsResult.RoutineActivitySuccess(parseDailyRoutineActivity(response.body, anchor))
            else -> runCatching { parseReviewPeriodMetrics(response.body, granularity, anchor) }
                .fold(ReviewPeriodMetricsResult::Success) {
                    ReviewPeriodMetricsResult.Failure("サーバーの集計データを読み取れませんでした。")
                }
        }
    }

    private fun parseReviewPeriodMetrics(
        body: String?,
        expectedGranularity: ReviewPeriodGranularity,
        expectedAnchor: String,
    ): ReviewPeriodMetrics {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("Review metrics response must be an object")
        val granularity = when ((root.fields["period_granularity"] as? JsonValue.StringValue)?.value) {
            "monthly" -> ReviewPeriodGranularity.MONTHLY
            "yearly" -> ReviewPeriodGranularity.YEARLY
            else -> error("Review metrics response has an invalid granularity")
        }
        require(granularity == expectedGranularity)
        val anchor = (root.fields["period_anchor"] as? JsonValue.StringValue)?.value
            ?.takeIf(::isLogicalDate) ?: error("Review metrics response has an invalid period anchor")
        require(anchor == expectedAnchor && isCanonicalAnchor(granularity, anchor))

        fun nonNegativeLong(field: String): Long =
            (root.fields[field] as? JsonValue.NumberValue)?.value?.toLongOrNull()
                ?.takeIf { it >= 0L } ?: error("Review metrics response has an invalid $field")

        return ReviewPeriodMetrics(
            granularity = granularity,
            anchor = anchor,
            establishedDayCount = nonNegativeLong("established_day_count"),
            completedCount = nonNegativeLong("completed_count"),
            unexecutedCount = nonNegativeLong("unexecuted_count"),
            completedActualDurationSeconds = nonNegativeLong("completed_actual_duration_seconds"),
            routineActivity = parseRoutineActivity(root.fields["routine_activity"]),
        )
    }

    private fun parseDailyRoutineActivity(body: String?, expectedAnchor: String): ReviewRoutineActivity? =
        runCatching {
            val root = JsonParser(body ?: "").parse() as? JsonValue.Object
                ?: error("Review activity response must be an object")
            require((root.fields["period_granularity"] as? JsonValue.StringValue)?.value == "daily")
            require((root.fields["period_anchor"] as? JsonValue.StringValue)?.value == expectedAnchor)
            parseRoutineActivity(root.fields["routine_activity"])
        }.getOrNull()

    private fun parseRoutineActivity(value: JsonValue?): ReviewRoutineActivity? = runCatching {
        val root = value as? JsonValue.Object ?: return null
        val coverage = when ((root.fields["coverage_status"] as? JsonValue.StringValue)?.value) {
            "UNMEASURED" -> ReviewRoutineActivityCoverage.UNMEASURED
            "PARTIAL" -> ReviewRoutineActivityCoverage.PARTIAL
            "COMPLETE" -> ReviewRoutineActivityCoverage.COMPLETE
            else -> return null
        }
        fun nullableString(field: String): String? = when (val fieldValue = root.fields[field]) {
            JsonValue.Null -> null
            is JsonValue.StringValue -> fieldValue.value
            else -> null
        }
        val createdRaw = root.fields["created_count"]
        val deletedRaw = root.fields["deleted_count"]
        val startedAt = nullableString("coverage_started_at")
        val startedLogicalDate = nullableString("coverage_started_logical_date")
        when (coverage) {
            ReviewRoutineActivityCoverage.UNMEASURED -> {
                require(createdRaw === JsonValue.Null && deletedRaw === JsonValue.Null)
                require((startedAt == null && startedLogicalDate == null)
                    || (startedAt != null && runCatching { Instant.parse(startedAt) }.isSuccess
                        && startedLogicalDate != null && isLogicalDate(startedLogicalDate)))
            }
            ReviewRoutineActivityCoverage.PARTIAL,
            ReviewRoutineActivityCoverage.COMPLETE,
            -> {
                val createdCount = (createdRaw as? JsonValue.NumberValue)?.value?.toLongOrNull()
                    ?.takeIf { it >= 0L }
                val deletedCount = (deletedRaw as? JsonValue.NumberValue)?.value?.toLongOrNull()
                    ?.takeIf { it >= 0L }
                require(createdCount != null && deletedCount != null)
                require(startedAt != null && runCatching { Instant.parse(startedAt) }.isSuccess)
                require(startedLogicalDate != null && isLogicalDate(startedLogicalDate))
                return ReviewRoutineActivity(coverage, createdCount, deletedCount, startedAt, startedLogicalDate)
            }
        }
        ReviewRoutineActivity(coverage, null, null, startedAt, startedLogicalDate)
    }.getOrNull()
}

internal enum class ReviewPeriodMetricsStatus {
    IDLE,
    LOADING,
    ACTIVITY_ONLY,
    CONTENT,
    EMPTY,
    UNESTABLISHED,
    ERROR,
    AUTH_REQUIRED,
}

internal data class ReviewPeriodMetricsUiState(
    val status: ReviewPeriodMetricsStatus = ReviewPeriodMetricsStatus.IDLE,
    val granularity: ReviewPeriodGranularity? = null,
    val anchor: String? = null,
    val metrics: ReviewPeriodMetrics? = null,
    val routineActivity: ReviewRoutineActivityUiState = ReviewRoutineActivityUiState(),
    val message: String? = null,
)

/** Owns one read-only period request and fences stale responses across period and auth changes. */
internal class ReviewPeriodMetricsController(
    private val loadMetrics: (ReviewPeriodGranularity, String) -> ReviewPeriodMetricsResult,
    private val onUnauthorized: () -> Unit,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private class LoadOperation(
        var readStarted: Boolean = false,
        var job: Job? = null,
    )

    private val repositoryMutex = Mutex()

    var state by mutableStateOf(ReviewPeriodMetricsUiState())
        private set

    private var requestGeneration = 0L
    private var sessionGeneration = 0L
    private var activeLoad: LoadOperation? = null
    private var closed = false

    fun load(granularity: ReviewPeriodGranularity, anchor: String) {
        if (closed) return
        if ((state.status == ReviewPeriodMetricsStatus.LOADING
                || state.routineActivity.status == ReviewRoutineActivityStatus.LOADING)
            && state.granularity == granularity && state.anchor == anchor
        ) return

        val parsed = runCatching { LocalDate.parse(anchor) }.getOrNull()
        if (parsed == null || !isCanonicalAnchor(granularity, anchor)) {
            requestGeneration += 1
            activeLoad?.let { previous -> if (!previous.readStarted) previous.job?.cancel() }
            activeLoad = null
            state = ReviewPeriodMetricsUiState(
                status = if (granularity == ReviewPeriodGranularity.DAILY) {
                    ReviewPeriodMetricsStatus.ACTIVITY_ONLY
                } else ReviewPeriodMetricsStatus.ERROR,
                granularity = granularity,
                anchor = anchor,
                message = "選択期間を確認できませんでした。",
                routineActivity = ReviewRoutineActivityUiState(
                    status = ReviewRoutineActivityStatus.ERROR,
                    message = "選択期間を確認できませんでした。",
                ),
            )
            return
        }

        val generation = ++requestGeneration
        val session = sessionGeneration
        activeLoad?.let { previous -> if (!previous.readStarted) previous.job?.cancel() }
        val operation = LoadOperation()
        activeLoad = operation
        state = ReviewPeriodMetricsUiState(
            status = if (granularity == ReviewPeriodGranularity.DAILY) {
                ReviewPeriodMetricsStatus.ACTIVITY_ONLY
            } else ReviewPeriodMetricsStatus.LOADING,
            granularity = granularity,
            anchor = anchor,
            routineActivity = ReviewRoutineActivityUiState(status = ReviewRoutineActivityStatus.LOADING),
        )
        operation.job = scope.launch {
            operation.readStarted = true
            val result = readSafely(granularity, anchor)
            if (!isCurrent(generation, session)) return@launch
            when (result) {
                ReviewPeriodMetricsResult.Unauthorized -> {
                    state = state.copy(
                        status = if (granularity == ReviewPeriodGranularity.DAILY) {
                            ReviewPeriodMetricsStatus.ACTIVITY_ONLY
                        } else ReviewPeriodMetricsStatus.AUTH_REQUIRED,
                        metrics = null,
                        message = "認証状態を確認しています…",
                        routineActivity = ReviewRoutineActivityUiState(
                            status = ReviewRoutineActivityStatus.AUTH_REQUIRED,
                            message = "認証状態を確認しています…",
                        ),
                    )
                    onUnauthorized()
                }
                is ReviewPeriodMetricsResult.Failure -> state = state.copy(
                    status = if (granularity == ReviewPeriodGranularity.DAILY) {
                        ReviewPeriodMetricsStatus.ACTIVITY_ONLY
                    } else ReviewPeriodMetricsStatus.ERROR,
                    metrics = null,
                    message = result.message,
                    routineActivity = ReviewRoutineActivityUiState(
                        status = ReviewRoutineActivityStatus.ERROR,
                        message = result.message,
                    ),
                )
                is ReviewPeriodMetricsResult.RoutineActivitySuccess -> {
                    if (granularity == ReviewPeriodGranularity.DAILY) {
                        state = state.copy(routineActivity = routineActivityUiState(result.activity))
                    } else {
                        state = state.copy(
                            status = ReviewPeriodMetricsStatus.ERROR,
                            message = "選択期間の集計データを確認できませんでした。再試行してください。",
                            routineActivity = ReviewRoutineActivityUiState(
                                status = ReviewRoutineActivityStatus.UNAVAILABLE,
                                message = "活動データを確認できませんでした。",
                            ),
                        )
                    }
                }
                is ReviewPeriodMetricsResult.Success -> publishMetrics(generation, session, result.metrics, granularity, anchor)
            }
        }
    }

    fun cancelActiveLoad() {
        if (closed) return
        requestGeneration += 1
        activeLoad?.let { operation -> if (!operation.readStarted) operation.job?.cancel() }
        activeLoad = null
        state = ReviewPeriodMetricsUiState()
    }

    fun resetForSessionChange() {
        sessionGeneration += 1
        requestGeneration += 1
        activeLoad?.job?.cancel()
        activeLoad = null
        state = ReviewPeriodMetricsUiState()
    }

    fun close() {
        if (closed) return
        closed = true
        sessionGeneration += 1
        requestGeneration += 1
        activeLoad?.job?.cancel()
        activeLoad = null
        state = ReviewPeriodMetricsUiState()
        scope.coroutineContext.cancel()
    }

    private suspend fun readSafely(
        granularity: ReviewPeriodGranularity,
        anchor: String,
    ): ReviewPeriodMetricsResult = try {
        repositoryMutex.withLock { withContext(ioDispatcher) { loadMetrics(granularity, anchor) } }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        ReviewPeriodMetricsResult.Failure("接続できません。再試行してください。")
    }

    private fun publishMetrics(
        generation: Long,
        session: Long,
        metrics: ReviewPeriodMetrics,
        granularity: ReviewPeriodGranularity,
        anchor: String,
    ) {
        if (!isCurrent(generation, session)) return
        if (metrics.granularity != granularity || metrics.anchor != anchor
            || metrics.establishedDayCount < 0L || metrics.completedCount < 0L
            || metrics.unexecutedCount < 0L || metrics.completedActualDurationSeconds < 0L
        ) {
            state = state.copy(
                status = ReviewPeriodMetricsStatus.ERROR,
                metrics = null,
                message = "選択期間の集計データを確認できませんでした。再試行してください。",
                routineActivity = ReviewRoutineActivityUiState(
                    status = ReviewRoutineActivityStatus.UNAVAILABLE,
                    message = "活動データを確認できませんでした。",
                ),
            )
            return
        }
        val nextStatus = when {
            metrics.establishedDayCount == 0L -> ReviewPeriodMetricsStatus.UNESTABLISHED
            metrics.completedCount == 0L && metrics.unexecutedCount == 0L -> ReviewPeriodMetricsStatus.EMPTY
            else -> ReviewPeriodMetricsStatus.CONTENT
        }
        state = state.copy(
            status = nextStatus,
            metrics = if (nextStatus == ReviewPeriodMetricsStatus.UNESTABLISHED) null else metrics,
            routineActivity = routineActivityUiState(metrics.routineActivity),
            message = when (nextStatus) {
                ReviewPeriodMetricsStatus.UNESTABLISHED -> "この期間に記録されたTaskChuteDayはありません。"
                ReviewPeriodMetricsStatus.EMPTY -> "この期間のTaskChuteDayに対象Entryはありません。"
                else -> null
            },
        )
    }

    private fun isCurrent(generation: Long, session: Long): Boolean =
        !closed && generation == requestGeneration && session == sessionGeneration

    private fun routineActivityUiState(activity: ReviewRoutineActivity?): ReviewRoutineActivityUiState {
        if (activity == null || !isValidRoutineActivity(activity)) {
            return ReviewRoutineActivityUiState(
                status = ReviewRoutineActivityStatus.UNAVAILABLE,
                message = "Routine活動データを利用できません。",
            )
        }
        val status = when (activity.coverage) {
            ReviewRoutineActivityCoverage.UNMEASURED -> ReviewRoutineActivityStatus.UNMEASURED
            ReviewRoutineActivityCoverage.PARTIAL -> ReviewRoutineActivityStatus.PARTIAL
            ReviewRoutineActivityCoverage.COMPLETE -> ReviewRoutineActivityStatus.COMPLETE
        }
        return ReviewRoutineActivityUiState(status = status, activity = activity)
    }

    private fun isValidRoutineActivity(activity: ReviewRoutineActivity): Boolean = when (activity.coverage) {
        ReviewRoutineActivityCoverage.UNMEASURED -> activity.createdCount == null && activity.deletedCount == null
        ReviewRoutineActivityCoverage.PARTIAL,
        ReviewRoutineActivityCoverage.COMPLETE,
        -> activity.createdCount != null && activity.createdCount >= 0L
            && activity.deletedCount != null && activity.deletedCount >= 0L
            && activity.coverageStartedAt?.let { runCatching { Instant.parse(it) }.isSuccess } == true
            && activity.coverageStartedLogicalDate?.let(::isLogicalDate) == true
    }
}

internal fun isLogicalDate(value: String): Boolean =
    runCatching { LocalDate.parse(value).toString() == value }.getOrDefault(false)

internal fun isCanonicalAnchor(granularity: ReviewPeriodGranularity, anchor: String): Boolean {
    val date = runCatching { LocalDate.parse(anchor) }.getOrNull() ?: return false
    return when (granularity) {
        ReviewPeriodGranularity.DAILY -> true
        ReviewPeriodGranularity.MONTHLY -> date.dayOfMonth == 1
        ReviewPeriodGranularity.YEARLY -> date.monthValue == 1 && date.dayOfMonth == 1
    }
}

