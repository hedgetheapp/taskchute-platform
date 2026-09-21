package com.hedgetheapp.taskchute.today

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class TaskEditorMode {
    CREATE,
    EDIT,
}

enum class TaskEditorCapability {
    FULL_PLANNING,
    RUNNING_METADATA,
    COMPLETED_METADATA,
}

data class TaskEditorDraft(
    val title: String = "",
    val projectId: String? = null,
    val modeId: String? = null,
    val sectionId: String? = null,
    val plannedStartText: String = "",
    val estimateText: String = "",
    val actualStartText: String = "",
    val actualEndText: String = "",
)

data class TaskEditorState(
    val mode: TaskEditorMode,
    val day: TodayDay,
    val originalTask: TodayTask?,
    val draft: TaskEditorDraft,
    val capability: TaskEditorCapability = TaskEditorCapability.FULL_PLANNING,
)

data class PlanningReferences(
    val projects: List<TodayProject>,
    val modes: List<TodayMode>,
)

data class NormalizedTaskInput(
    val title: String,
    val projectId: String?,
    val modeId: String?,
    val sectionId: String?,
    val plannedStartMinute: Int?,
    val estimateSeconds: Int?,
    val actualStartMinute: Int? = null,
    val actualEndMinute: Int? = null,
    val clientTaskId: String? = null,
    val clientEntryId: String? = null,
    val projectTitle: String? = null,
    val modeTitle: String? = null,
)

data class TaskEditorValidation(
    val input: NormalizedTaskInput?,
    val errorMessage: String?,
) {
    companion object {
        fun validate(draft: TaskEditorDraft, capability: TaskEditorCapability = TaskEditorCapability.FULL_PLANNING): TaskEditorValidation {
            val title = draft.title.trim()
            if (title.isEmpty()) return invalid("タスク名を入力してください。")
            if (title.length > 300) return invalid("タスク名は300文字以内で入力してください。")

            val plannedStart = parseMinute(draft.plannedStartText)
                ?: if (draft.plannedStartText.isBlank()) null else return invalid("開始予定は HH:mm（900 / 0900 も可）で入力してください。")
            val estimateMinutes = draft.estimateText.trim().toLongOrNull()
            if (draft.estimateText.isNotBlank() && (estimateMinutes == null || estimateMinutes <= 0L || estimateMinutes > Int.MAX_VALUE / 60L)) {
                return invalid("見積は1分以上の整数で入力してください。")
            }
            val actualStart = if (draft.actualStartText.isBlank()) null else parseActualClock(draft.actualStartText)
                ?: return invalid("開始時間は HH:mm（900 / 0900 も可）で入力してください。")
            val actualEnd = if (draft.actualEndText.isBlank()) null else parseActualClock(draft.actualEndText)
                ?: return invalid("終了時間は HH:mm（900 / 0900 も可）で入力してください。")
            if (actualEnd != null && actualStart == null) return invalid("終了時間だけは設定できません。開始時間を入力してください。")
            if (capability == TaskEditorCapability.RUNNING_METADATA && actualStart == null) {
                return invalid("実行中タスクは開始時間を入力してください。")
            }
            if (capability == TaskEditorCapability.COMPLETED_METADATA && (actualStart == null || actualEnd == null)) {
                return invalid("完了済みタスクは開始時間と終了時間を入力してください。")
            }
            return TaskEditorValidation(
                input = NormalizedTaskInput(
                    title = title,
                    projectId = draft.projectId,
                    modeId = draft.modeId,
                    sectionId = draft.sectionId,
                    plannedStartMinute = plannedStart,
                    estimateSeconds = estimateMinutes?.times(60L)?.toInt(),
                    actualStartMinute = actualStart,
                    actualEndMinute = actualEnd,
                ),
                errorMessage = null,
            )
        }

        private fun invalid(message: String) = TaskEditorValidation(null, message)

        internal fun parseMinute(value: String): Int? {
            val trimmed = value.trim()
            if (trimmed.isEmpty()) return null
            if (trimmed.all(Char::isDigit) && trimmed.length in 3..4) {
                val padded = trimmed.padStart(4, '0')
                val hours = padded.substring(0, 2).toIntOrNull() ?: return null
                val minutes = padded.substring(2).toIntOrNull() ?: return null
                if (hours !in 0..47 || minutes !in 0..59) return null
                return hours * 60 + minutes
            }
            val parts = trimmed.split(":")
            if (parts.size != 2 || parts[0].length !in 1..2 || parts[1].length != 2) return null
            val hours = parts[0].toIntOrNull() ?: return null
            val minutes = parts[1].toIntOrNull() ?: return null
            if (hours !in 0..47 || minutes !in 0..59) return null
            return hours * 60 + minutes
        }
    }
}

sealed interface PlanningReferencesResult {
    data class Success(val references: PlanningReferences) : PlanningReferencesResult
    data object Unauthorized : PlanningReferencesResult
    data class Failure(val message: String) : PlanningReferencesResult
}

sealed interface PlanningSaveResult {
    data object Success : PlanningSaveResult
    data class SuccessWithRevision(val placementRevision: Int) : PlanningSaveResult
    data object Unauthorized : PlanningSaveResult
    data class Failure(val message: String) : PlanningSaveResult
}

interface TaskPlanningRepository {
    fun loadReferences(): PlanningReferencesResult

    fun save(editor: TaskEditorState, input: NormalizedTaskInput): PlanningSaveResult
}

data class TaskPlanningUiState(
    val editor: TaskEditorState? = null,
    val references: PlanningReferences? = null,
    val loadingReferences: Boolean = false,
    val saving: Boolean = false,
    val errorMessage: String? = null,
)

internal fun formatEditorMinute(value: Int?): String = value?.let {
    "${(it / 60).toString().padStart(2, '0')}:${(it % 60).toString().padStart(2, '0')}"
} ?: ""

internal fun parseActualClock(value: String): Int? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) return null
    val digits = when {
        trimmed.all(Char::isDigit) && trimmed.length in 3..4 -> trimmed.padStart(4, '0')
        trimmed.matches(Regex("\\d{1,2}:\\d{2}")) -> trimmed.replace(":", "").padStart(4, '0')
        else -> return null
    }
    val hour = digits.substring(0, 2).toIntOrNull() ?: return null
    val minute = digits.substring(2).toIntOrNull() ?: return null
    return if (hour in 0..23 && minute in 0..59) hour * 60 + minute else null
}

internal fun formatActualClock(value: String?): String = parseActualClock(value ?: "")?.let {
    "${(it / 60).toString().padStart(2, '0')}:${(it % 60).toString().padStart(2, '0')}"
} ?: ""

/** Formats a canonical Execution instant using the Day's establishment timezone. */
internal fun formatExecutionClock(value: String?, timezoneId: String?): String {
    if (value.isNullOrBlank() || timezoneId.isNullOrBlank()) return ""
    val zone = runCatching { ZoneId.of(timezoneId) }.getOrNull() ?: return ""
    return runCatching {
        Instant.parse(value).atZone(zone).format(DateTimeFormatter.ofPattern("HH:mm"))
    }.getOrDefault("")
}
