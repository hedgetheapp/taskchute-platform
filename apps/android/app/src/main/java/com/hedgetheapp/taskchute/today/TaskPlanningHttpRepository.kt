package com.hedgetheapp.taskchute.today

import com.hedgetheapp.taskchute.network.JsonParser
import com.hedgetheapp.taskchute.network.JsonValue
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

class TaskPlanningHttpRepository(
    private val request: (method: String, path: String, body: String?) -> TodayHttpResponse?,
) : TaskPlanningRepository {
    private val ambiguousLifecycleOperationIds = mutableMapOf<String, String>()
    private val ambiguousRoutineTitleOperationIds = mutableMapOf<String, String>()
    private val ambiguousRoutineReminderMutations = mutableMapOf<String, PendingRoutineReminderMutation>()
    private val confirmedRoutinePlacementRevisions = mutableMapOf<String, Int>()

    override fun loadReferences(): PlanningReferencesResult {
        val projectsResponse = execute("GET", "/api/v1/projects", null)
        if (projectsResponse !is PlanningHttpResult.Success) return projectsResponse.toReferencesResult()
        val modesResponse = execute("GET", "/api/v1/mode-board", null)
        if (modesResponse !is PlanningHttpResult.Success) return modesResponse.toReferencesResult()
        return runCatching {
            PlanningReferencesResult.Success(
                PlanningReferences(
                    projects = TaskPlanningJsonParser.parseProjects(projectsResponse.body),
                    modes = TaskPlanningJsonParser.parseModes(modesResponse.body),
                ),
            )
        }.getOrElse { PlanningReferencesResult.Failure("候補一覧を読み込めませんでした。再試行してください。") }
    }

    override fun save(editor: TaskEditorState, input: NormalizedTaskInput): PlanningSaveResult {
        return if (editor.mode == TaskEditorMode.CREATE) create(input, editor.day) else update(editor, input)
    }

    private fun create(input: NormalizedTaskInput, day: TodayDay): PlanningSaveResult {
        val taskId = input.clientTaskId ?: UUIDv7.next()
        val entryId = input.clientEntryId ?: UUIDv7.next()
        val operationId = UUIDv7.next()
        val logicalDateJson = if (day.isCurrent) "" else ",\"logical_date\":\"${JsonEncoding.escape(day.logicalDate)}\""
        val addBody = """
            {"operation_id":"${JsonEncoding.escape(operationId)}","task_id":"${JsonEncoding.escape(taskId)}","entry_id":"${JsonEncoding.escape(entryId)}","project_id":${nullableString(input.projectId)},"mode_id":${nullableString(input.modeId)},"title":"${JsonEncoding.escape(input.title)}","taskchute_day_id":"${JsonEncoding.escape(day.taskChuteDayId!!)}","section_id":${nullableString(input.sectionId)},"planned_start_minute":${input.plannedStartMinute ?: "null"},"expected_placement_revision":${day.placementRevision},"estimate_seconds":${input.estimateSeconds ?: "null"},"start_reminder_offset_minutes":${input.startReminderOffsetMinutes ?: "null"},"notify_on_estimate_overrun":${input.notifyOnEstimateOverrun}$logicalDateJson}
        """.trimIndent()
        val addPath = if (day.isCurrent) "/api/v1/taskchute-days/current/entries" else "/api/v1/taskchute-days/by-logical-date/entries"
        val added = execute("POST", addPath, addBody)
        var placementRevision = when (added) {
            PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
            is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(added.message)
            is PlanningHttpResult.Success -> runCatching { TaskPlanningJsonParser.parsePlacementRevision(added.body) }
                .getOrElse { return PlanningSaveResult.Failure("タスク追加結果を読み取れませんでした。再試行してください。") }
        }
        if (input.actualStartMinute != null) {
            when (val result = executeActualTimesForCreatedEntry(day, input, entryId, placementRevision)) {
                PlanningSaveResult.Success -> Unit
                is PlanningSaveResult.SuccessWithRevision -> placementRevision = result.placementRevision
                else -> return result
            }
        }
        return PlanningSaveResult.SuccessWithRevision(placementRevision)
    }

    private fun update(editor: TaskEditorState, input: NormalizedTaskInput): PlanningSaveResult {
        val task = editor.originalTask ?: return PlanningSaveResult.Failure("編集対象を取得できません。")
        val taskId = task.taskId ?: return PlanningSaveResult.Failure("編集対象のTask IDを取得できません。再読み込みしてください。")
        if (task.lifecycleState == LifecycleState.COMPLETED && input.actualStartMinute != null
            && input.actualEndMinute == null && task.executionId == null) {
            return PlanningSaveResult.Failure("複数の実行履歴があるため、このタスクを実行中へ戻せません。")
        }
        val currentProjectId = task.project?.id
        val currentModeId = task.mode?.id
        val currentSectionId = editor.day.sections.firstOrNull { section -> section.entries.any { it.id == task.id } }?.id
        val directCompletedRollback = task.lifecycleState == LifecycleState.COMPLETED
            && input.actualStartMinute == null && input.actualEndMinute == null
        if (directCompletedRollback) {
            if (input.title != task.title || input.projectId != currentProjectId || input.modeId != currentModeId
                || input.sectionId != currentSectionId || input.plannedStartMinute != task.plannedStartMinute
                || input.estimateSeconds != task.estimateSeconds
                || input.startReminderOffsetMinutes != task.startReminderOffsetMinutes
                || input.notifyOnEstimateOverrun != task.notifyOnEstimateOverrun) {
                return PlanningSaveResult.Failure("完了済みから予定へ戻す操作では、他のタスク設定を同時に変更できません。")
            }
            return executeRevertEntryStart(editor, task, completedDirectRollback = true)
        }
        if (editor.capability == TaskEditorCapability.ROUTINE_PLANNING) {
            val routineInput = synchronizeRoutineSectionPlan(editor.day, input)
            val dayId = editor.day.taskChuteDayId ?: return PlanningSaveResult.Failure("編集対象の日を取得できません。")
            val placementKey = "$dayId\u0000${task.id}"
            val reminderChanged = reminderChanged(task, routineInput)
            val reminderIntentKey = routineReminderIntentKey(dayId, task, routineInput)
            val pendingReminder = ambiguousRoutineReminderMutations[placementKey]
            if (pendingReminder != null) {
                when {
                    task.startReminderOffsetMinutes == pendingReminder.nextStartOffset
                        && task.notifyOnEstimateOverrun == pendingReminder.nextNotifyOnOverrun -> {
                        ambiguousRoutineReminderMutations.remove(placementKey)
                    }
                    task.startReminderOffsetMinutes == pendingReminder.expectedStartOffset
                        && task.notifyOnEstimateOverrun == pendingReminder.expectedNotifyOnOverrun -> {
                        if (pendingReminder.intentKey != reminderIntentKey) {
                            return PlanningSaveResult.Failure(
                                "前回の通知保存結果を確認できません。Todayを再読み込みしてから再試行してください。",
                            )
                        }
                        return when (val retried = executePendingRoutineReminder(task, placementKey, pendingReminder)) {
                            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized
                            is PlanningHttpResult.Failure -> PlanningSaveResult.Failure(retried.message)
                            is PlanningHttpResult.Success -> {
                                val remembered = confirmedRoutinePlacementRevisions[placementKey]
                                    ?: editor.day.placementRevision
                                if ((editor.day.isCurrent || isHistoricalPastDay(editor.day))
                                    && routineInput.actualStartMinute != null) {
                                    when (val actualResult = executeActualTimes(editor, routineInput, remembered)) {
                                        PlanningSaveResult.Success -> PlanningSaveResult.SuccessWithRevision(remembered)
                                        else -> actualResult
                                    }
                                } else {
                                    PlanningSaveResult.SuccessWithRevision(remembered)
                                }
                            }
                        }
                    }
                    else -> ambiguousRoutineReminderMutations.remove(placementKey)
                }
            }
            val eligibleReminderDay = editor.day.isCurrent || editor.day.planningEnabled
            if (reminderChanged && (!eligibleReminderDay || task.lifecycleState != LifecycleState.PLANNED)) {
                return PlanningSaveResult.Failure("このRoutine occurrenceでは通知設定を変更できません。再読み込みしてください。")
            }
            if (reminderChanged && routineInput.startReminderOffsetMinutes != null
                && routineInput.plannedStartMinute == null) {
                return PlanningSaveResult.Failure("開始通知には開始予定が必要です。")
            }
            if (reminderChanged && routineInput.notifyOnEstimateOverrun
                && (routineInput.estimateSeconds == null || routineInput.estimateSeconds <= 0)) {
                return PlanningSaveResult.Failure("超過通知には1分以上の見積が必要です。")
            }
            val reminderMetadata = if (reminderChanged) {
                when (val lookup = loadRoutineReminderTaskMetadata(task)) {
                    is RoutineReminderMetadataLookup.Success -> lookup.metadata
                    RoutineReminderMetadataLookup.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is RoutineReminderMetadataLookup.Failure -> return PlanningSaveResult.Failure(lookup.message)
                }
            } else null
            val rememberedRevision = confirmedRoutinePlacementRevisions[placementKey] ?: editor.day.placementRevision
            var placementRevision = maxOf(editor.day.placementRevision, rememberedRevision)
            if (currentSectionId != routineInput.sectionId || task.plannedStartMinute != routineInput.plannedStartMinute) {
                when (val result = executeRoutineSectionPlan(task, editor.day, routineInput.sectionId, routineInput.plannedStartMinute, placementRevision)) {
                    is PlanningSaveResult.SuccessWithRevision -> {
                        placementRevision = result.placementRevision
                        confirmedRoutinePlacementRevisions[placementKey] = placementRevision
                    }
                    PlanningSaveResult.Success -> confirmedRoutinePlacementRevisions[placementKey] = placementRevision
                    else -> return result
                }
            }
            if (task.estimateSeconds != routineInput.estimateSeconds) {
                when (val result = executeRoutineEstimate(task, editor.day, routineInput.estimateSeconds)) {
                    PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                    else -> return result
                }
            }
            if (isHistoricalPastDay(editor.day) && currentProjectId != input.projectId) {
                when (executeTaskMetadata(task, taskId, input.projectId)) {
                    PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure("Projectを更新できませんでした。再読み込みしてください。")
                    is PlanningHttpResult.Success -> Unit
                }
            }
            if (isHistoricalPastDay(editor.day) && currentModeId != input.modeId) {
                when (val result = executeRoutineMode(task, editor.day, input.modeId)) {
                    PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                    is PlanningHttpResult.Success -> Unit
                }
            }
            if (input.title != task.title) {
                when (val result = executeRoutineTitle(task, editor.day, input.title)) {
                    PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                    else -> return result
                }
            }
            when (val result = updateReminderSettingsIfChanged(
                task, taskId, input, reminderMetadata,
                routineReminderKey = placementKey,
                routineReminderIntent = reminderIntentKey,
            )) {
                PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                else -> return result
            }
            if ((editor.day.isCurrent || isHistoricalPastDay(editor.day)) && routineInput.actualStartMinute != null) {
                return when (val actualResult = executeActualTimes(editor, routineInput, placementRevision)) {
                    PlanningSaveResult.Success -> PlanningSaveResult.SuccessWithRevision(placementRevision)
                    is PlanningSaveResult.SuccessWithRevision, PlanningSaveResult.Unauthorized, is PlanningSaveResult.Failure -> actualResult
                }
            }
            return PlanningSaveResult.SuccessWithRevision(placementRevision)
        }
        if (editor.capability != TaskEditorCapability.FULL_PLANNING) {
            val reminderChanged = reminderChanged(task, input)
            val routineReminderDayId = editor.day.taskChuteDayId
            val routineReminderKey = routineReminderDayId?.let { "$it\u0000${task.id}" }
            val routineReminderIntent = if (task.routineDerived && routineReminderDayId != null) {
                routineReminderIntentKey(routineReminderDayId, task, input)
            } else null
            val pendingReminder = routineReminderKey?.let(ambiguousRoutineReminderMutations::get)
            if (pendingReminder != null) {
                when {
                    task.startReminderOffsetMinutes == pendingReminder.nextStartOffset
                        && task.notifyOnEstimateOverrun == pendingReminder.nextNotifyOnOverrun -> {
                        ambiguousRoutineReminderMutations.remove(routineReminderKey)
                    }
                    task.startReminderOffsetMinutes == pendingReminder.expectedStartOffset
                        && task.notifyOnEstimateOverrun == pendingReminder.expectedNotifyOnOverrun -> {
                        if (pendingReminder.intentKey != routineReminderIntent) {
                            return PlanningSaveResult.Failure(
                                "前回の通知保存結果を確認できません。Todayを再読み込みしてから再試行してください。",
                            )
                        }
                        return when (val retried = executePendingRoutineReminder(
                            task, routineReminderKey, pendingReminder,
                        )) {
                            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized
                            is PlanningHttpResult.Failure -> PlanningSaveResult.Failure(retried.message)
                            is PlanningHttpResult.Success -> executeActualTimes(editor, input, editor.day.placementRevision)
                        }
                    }
                    else -> ambiguousRoutineReminderMutations.remove(routineReminderKey)
                }
            }
            if (task.routineDerived && reminderChanged) {
                if (task.lifecycleState == LifecycleState.COMPLETED) {
                    return PlanningSaveResult.Failure("完了済みRoutine occurrenceの通知設定は変更できません。")
                }
                if (task.lifecycleState == LifecycleState.RUNNING) {
                    if (input.startReminderOffsetMinutes != task.startReminderOffsetMinutes) {
                        return PlanningSaveResult.Failure("実行中は開始通知を変更できません。")
                    }
                    if (!editor.day.isCurrent) {
                        return PlanningSaveResult.Failure("過去Dayの通知設定は変更できません。再読み込みしてください。")
                    }
                } else if (input.startReminderOffsetMinutes != null && input.plannedStartMinute == null) {
                    return PlanningSaveResult.Failure("開始通知には開始予定が必要です。")
                }
                val effectiveEstimate = if (task.lifecycleState == LifecycleState.RUNNING) input.estimateSeconds
                    else task.estimateSeconds
                if (input.notifyOnEstimateOverrun && (effectiveEstimate == null || effectiveEstimate <= 0)) {
                    return PlanningSaveResult.Failure("超過通知には1分以上の見積が必要です。")
                }
            }
            val reminderMetadata = if (task.routineDerived && reminderChanged) {
                when (val lookup = loadRoutineReminderTaskMetadata(task)) {
                    is RoutineReminderMetadataLookup.Success -> lookup.metadata
                    RoutineReminderMetadataLookup.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is RoutineReminderMetadataLookup.Failure -> return PlanningSaveResult.Failure(lookup.message)
                }
            } else null
            if (!task.routineDerived && currentProjectId != input.projectId) {
                when (val result = executeTaskMetadata(task, taskId, input.projectId)) {
                    PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                    is PlanningHttpResult.Success -> Unit
                }
            } else if (task.routineDerived && isHistoricalPastDay(editor.day) && currentProjectId != input.projectId) {
                when (executeTaskMetadata(task, taskId, input.projectId)) {
                    PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure("Projectを更新できませんでした。再読み込みしてください。")
                    is PlanningHttpResult.Success -> Unit
                }
            }
            if (!task.routineDerived && currentModeId != input.modeId) {
                when (val result = executeMode(task, input.modeId)) {
                    PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                    is PlanningHttpResult.Success -> Unit
                }
            } else if (task.routineDerived && isHistoricalPastDay(editor.day) && currentModeId != input.modeId) {
                when (val result = executeRoutineMode(task, editor.day, input.modeId)) {
                    PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                    is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                    is PlanningHttpResult.Success -> Unit
                }
            }
            if (task.lifecycleState == LifecycleState.RUNNING && task.estimateSeconds != input.estimateSeconds) {
                when (val result = if (task.routineDerived) {
                    executeRoutineEstimate(task, editor.day, input.estimateSeconds)
                } else {
                    executeEstimate(task.id, task.estimateSeconds, input.estimateSeconds)
                }) {
                    PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                    else -> return result
                }
            }
            when (val result = updateReminderSettingsIfChanged(
                task, taskId, input, reminderMetadata,
                routineReminderKey = routineReminderKey,
                routineReminderIntent = routineReminderIntent,
            )) {
                PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
                else -> return result
            }
            return executeActualTimes(editor, input, editor.day.placementRevision)
        }
        if (task.title != input.title || currentProjectId != input.projectId) {
            when (val result = executeTaskMetadata(task, taskId, input.projectId, input.title)) {
                PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                is PlanningHttpResult.Success -> Unit
            }
        }
        if (currentModeId != input.modeId) {
            when (val result = executeMode(task, input.modeId)) {
                PlanningHttpResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                is PlanningHttpResult.Failure -> return PlanningSaveResult.Failure(result.message)
                is PlanningHttpResult.Success -> Unit
            }
        }
        var placementRevision = editor.day.placementRevision
        if (currentSectionId != input.sectionId) {
            val sectionMove = executeSectionMove(task, editor.day.taskChuteDayId, input.sectionId, placementRevision)
            when (val sectionResult = sectionMove.first) {
                PlanningSaveResult.Success -> placementRevision = sectionMove.second
                    ?: return PlanningSaveResult.Failure("Section移動結果を読み取れませんでした。再試行してください。")
                PlanningSaveResult.Unauthorized -> return PlanningSaveResult.Unauthorized
                is PlanningSaveResult.Failure -> return sectionResult
                is PlanningSaveResult.SuccessWithRevision -> placementRevision = sectionResult.placementRevision
            }
        }
        if (task.estimateSeconds != input.estimateSeconds) {
            when (val result = executeEstimate(task.id, task.estimateSeconds, input.estimateSeconds)) {
                PlanningSaveResult.Success -> Unit
                else -> return result
            }
        }
        if (task.plannedStartMinute != input.plannedStartMinute) {
            when (val result = executePlannedStart(task.id, editor.day.taskChuteDayId, input.plannedStartMinute, placementRevision)) {
                PlanningSaveResult.Success -> Unit
                else -> return result
            }
        }
        when (val result = updateReminderSettingsIfChanged(
            task, taskId, input,
            sharedTaskMetadata = RoutineReminderSharedTaskMetadata(input.title, input.projectId),
        )) {
            PlanningSaveResult.Success, is PlanningSaveResult.SuccessWithRevision -> Unit
            else -> return result
        }
        return executeActualTimes(editor, input, placementRevision)
    }

    private fun updateReminderSettingsIfChanged(
        task: TodayTask,
        taskId: String,
        input: NormalizedTaskInput,
        sharedTaskMetadata: RoutineReminderSharedTaskMetadata? = null,
        routineReminderKey: String? = null,
        routineReminderIntent: String? = null,
    ): PlanningSaveResult {
        val startChanged = task.startReminderOffsetMinutes != input.startReminderOffsetMinutes
        val overrunChanged = task.notifyOnEstimateOverrun != input.notifyOnEstimateOverrun
        if (!startChanged && !overrunChanged) return PlanningSaveResult.Success
        val title = sharedTaskMetadata?.title ?: task.routineBaseTitle ?: task.title
        val projectId = if (sharedTaskMetadata != null) sharedTaskMetadata.projectId else task.project?.id
        val fields = buildString {
            if (startChanged) append(",\"start_reminder_offset_minutes\":${input.startReminderOffsetMinutes ?: "null"}")
            if (overrunChanged) append(",\"notify_on_estimate_overrun\":${input.notifyOnEstimateOverrun}")
        }
        val operationId = UUIDv7.next()
        val body = """
            {"operation_id":"${JsonEncoding.escape(operationId)}","entry_id":"${JsonEncoding.escape(task.id)}","task_id":"${JsonEncoding.escape(taskId)}","expected_title":"${JsonEncoding.escape(title)}","expected_project_id":${nullableString(projectId)},"title":"${JsonEncoding.escape(title)}","project_id":${nullableString(projectId)}$fields}
        """.trimIndent()
        val path = "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/task-metadata"
        val result = execute("POST", path, body)
        if (routineReminderKey != null && routineReminderIntent != null) {
            when (result) {
                is PlanningHttpResult.Success -> ambiguousRoutineReminderMutations.remove(routineReminderKey)
                PlanningHttpResult.Unauthorized -> Unit
                is PlanningHttpResult.Failure -> if (result.ambiguous) {
                    ambiguousRoutineReminderMutations[routineReminderKey] = PendingRoutineReminderMutation(
                        intentKey = routineReminderIntent,
                        body = body,
                        expectedStartOffset = task.startReminderOffsetMinutes,
                        expectedNotifyOnOverrun = task.notifyOnEstimateOverrun,
                        nextStartOffset = input.startReminderOffsetMinutes,
                        nextNotifyOnOverrun = input.notifyOnEstimateOverrun,
                    )
                } else {
                    ambiguousRoutineReminderMutations.remove(routineReminderKey)
                }
            }
        }
        return result.toSaveResult()
    }

    private fun loadRoutineReminderTaskMetadata(task: TodayTask): RoutineReminderMetadataLookup {
        val routineDefinitionId = task.routineDefinitionId
            ?: return RoutineReminderMetadataLookup.Failure("Routine Definition IDを取得できません。Todayを再読み込みしてください。")
        val taskId = task.taskId
            ?: return RoutineReminderMetadataLookup.Failure("共有Task IDを取得できません。Todayを再読み込みしてください。")
        return when (val response = execute("GET", "/api/v1/routines", null)) {
            PlanningHttpResult.Unauthorized -> RoutineReminderMetadataLookup.Unauthorized
            is PlanningHttpResult.Failure -> RoutineReminderMetadataLookup.Failure(response.message)
            is PlanningHttpResult.Success -> runCatching {
                TaskPlanningJsonParser.parseRoutineReminderTaskMetadata(
                    response.body, routineDefinitionId, taskId,
                )
            }.fold(
                onSuccess = { metadata ->
                    if (metadata == null) {
                        RoutineReminderMetadataLookup.Failure(
                            "共有Task情報を取得できません。Routineが変更された可能性があります。再読み込みしてください。",
                        )
                    } else {
                        RoutineReminderMetadataLookup.Success(metadata)
                    }
                },
                onFailure = {
                    RoutineReminderMetadataLookup.Failure("共有Task情報を読み取れません。Todayを再読み込みしてください。")
                },
            )
        }
    }

    private fun executePendingRoutineReminder(
        task: TodayTask,
        key: String,
        pending: PendingRoutineReminderMutation,
    ): PlanningHttpResult {
        val result = execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/task-metadata", pending.body)
        when (result) {
            is PlanningHttpResult.Success -> ambiguousRoutineReminderMutations.remove(key)
            PlanningHttpResult.Unauthorized -> Unit
            is PlanningHttpResult.Failure -> if (!result.ambiguous) ambiguousRoutineReminderMutations.remove(key)
        }
        return result
    }

    private fun executeActualTimes(
        editor: TaskEditorState,
        input: NormalizedTaskInput,
        placementRevision: Int,
    ): PlanningSaveResult {
        val task = editor.originalTask ?: return PlanningSaveResult.Success
        if (task.lifecycleState == LifecycleState.COMPLETED
            && input.actualStartMinute == null && input.actualEndMinute == null) {
            return executeRevertEntryStart(editor, task, completedDirectRollback = true)
        }
        if (task.lifecycleState == LifecycleState.RUNNING && input.actualStartMinute == null && input.actualEndMinute == null) {
            return executeRevertEntryStart(editor, task)
        }
        if (input.actualStartMinute == null) return PlanningSaveResult.Success
        val sameRunningStart = if (input.actualStartInstant != null) {
            sameInstant(input.actualStartInstant, task.activeStartedAt)
        } else {
            parseActualClock(formatExecutionClock(task.activeStartedAt, editor.day.establishmentTimezone)) == input.actualStartMinute
        }
        if (task.lifecycleState == LifecycleState.RUNNING && input.actualEndMinute == null && sameRunningStart) {
            return PlanningSaveResult.Success
        }
        val zone = editor.day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() }
            ?: return PlanningSaveResult.Failure("実績時間のタイムゾーンを取得できません。再読み込みしてください。")
        val expectedStartedAt = if (task.lifecycleState == LifecycleState.PLANNED) null else task.activeStartedAt ?: task.firstStartedAt
        val expectedEndedAt = if (task.lifecycleState == LifecycleState.PLANNED) null else task.lastEndedAt
        if (task.lifecycleState == LifecycleState.COMPLETED) {
            val unchangedStart = if (input.actualStartInstant != null) {
                sameInstant(input.actualStartInstant, expectedStartedAt)
            } else {
                parseActualClock(formatExecutionClock(expectedStartedAt, editor.day.establishmentTimezone)) == input.actualStartMinute
            }
            val unchangedEnd = if (input.actualEndInstant != null) {
                sameInstant(input.actualEndInstant, expectedEndedAt)
            } else {
                parseActualClock(formatExecutionClock(expectedEndedAt, editor.day.establishmentTimezone)) ==
                    input.actualEndMinute
            }
            if (unchangedStart && unchangedEnd) return PlanningSaveResult.Success
            if (task.executionId == null) {
                return PlanningSaveResult.Failure("複数の実行履歴があるため、実績時刻を変更できません。")
            }
        }
        val reopeningCompleted = task.lifecycleState == LifecycleState.COMPLETED && input.actualEndMinute == null
        val startedAt = if (reopeningCompleted) {
            val originalStart = expectedStartedAt
                ?: return PlanningSaveResult.Failure("再開する実行の開始時刻を取得できません。再読み込みしてください。")
            val sameStart = if (input.actualStartInstant != null) {
                sameInstant(input.actualStartInstant, originalStart)
            } else {
                parseActualClock(formatExecutionClock(originalStart, editor.day.establishmentTimezone)) == input.actualStartMinute
            }
            if (!sameStart) {
                return PlanningSaveResult.Failure("実行中へ戻すときは開始時間を変更できません。")
            }
            originalStart
        } else {
            input.actualStartInstant ?: logicalMinuteToInstant(editor.day, input.actualStartMinute, zone)
        }
        val endedAt = input.actualEndInstant ?: input.actualEndMinute?.let {
            logicalEndMinuteToInstant(editor.day, input.actualStartMinute, it, zone)
        }
        val executionId = if (task.lifecycleState == LifecycleState.PLANNED) task.executionId ?: UUIDv7.next()
        else task.executionId ?: return PlanningSaveResult.Failure("対象の実行IDを取得できません。再読み込みしてください。")
        val expectedPlacement = if (task.lifecycleState == LifecycleState.PLANNED) {
            ",\"expected_placement_revision\":$placementRevision"
        } else {
            ""
        }
        val path = "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/execution-times"
        val inputPrecision = if (reopeningCompleted || input.actualStartInstant != null) "" else ",\"input_precision\":\"minute\""
        val payload = """
            {"entry_id":"${JsonEncoding.escape(task.id)}","execution_id":"${JsonEncoding.escape(executionId)}","expected_lifecycle_state":"${task.lifecycleState.name.lowercase()}","started_at":"${JsonEncoding.escape(startedAt)}","ended_at":${endedAt?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"},"expected_started_at":${expectedStartedAt?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"},"expected_ended_at":${expectedEndedAt?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"}$expectedPlacement$inputPrecision}
        """.trimIndent()
        return if (reopeningCompleted) {
            executeLifecycleMutation(path, payload).toExecutionTimesSaveResult()
        } else {
            val body = payload.replaceFirst("{", "{\"operation_id\":\"${JsonEncoding.escape(UUIDv7.next())}\",")
            execute("POST", path, body).toExecutionTimesSaveResult()
        }
    }

    private fun executeRevertEntryStart(
        editor: TaskEditorState,
        task: TodayTask,
        completedDirectRollback: Boolean = false,
    ): PlanningSaveResult {
        if (!editor.day.isCurrent && !isHistoricalPastDay(editor.day)) {
            return PlanningSaveResult.Failure("ライフサイクルを修正できるDayではありません。再読み込みしてください。")
        }
        val executionId = task.executionId
            ?: return PlanningSaveResult.Failure("対象のExecution IDを取得できません。再読み込みしてください。")
        val startedAt = task.activeStartedAt ?: task.firstStartedAt
            ?: return PlanningSaveResult.Failure("実行の開始時刻を取得できません。再読み込みしてください。")
        val endedAt = if (completedDirectRollback) task.lastEndedAt
            ?: return PlanningSaveResult.Failure("完了したExecutionの終了時刻を取得できません。再読み込みしてください。") else null
        val path = "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/revert-start"
        val payload = """
            {"entry_id":"${JsonEncoding.escape(task.id)}","execution_id":"${JsonEncoding.escape(executionId)}","expected_started_at":"${JsonEncoding.escape(startedAt)}"${if (completedDirectRollback) ",\"expected_lifecycle_state\":\"completed\",\"expected_ended_at\":\"${JsonEncoding.escape(endedAt!!)}\"" else ""}}
        """.trimIndent()
        return executeLifecycleMutation(path, payload).toSaveResult()
    }

    /** Reuse one operation identity for an unchanged D-156/D-157 intent after an ambiguous result. */
    private fun executeLifecycleMutation(path: String, payload: String): PlanningHttpResult {
        val intentKey = "$path|$payload"
        val operationId = ambiguousLifecycleOperationIds.getOrPut(intentKey, UUIDv7::next)
        val body = payload.replaceFirst("{", "{\"operation_id\":\"${JsonEncoding.escape(operationId)}\",")
        val result = execute("POST", path, body)
        when (result) {
            is PlanningHttpResult.Success -> ambiguousLifecycleOperationIds.remove(intentKey)
            PlanningHttpResult.Unauthorized -> Unit
            is PlanningHttpResult.Failure -> if (!result.ambiguous) ambiguousLifecycleOperationIds.remove(intentKey)
        }
        return result
    }

    private fun executeActualTimesForCreatedEntry(
        day: TodayDay,
        input: NormalizedTaskInput,
        entryId: String,
        placementRevision: Int,
    ): PlanningSaveResult {
        val zone = day.establishmentTimezone?.let { runCatching { ZoneId.of(it) }.getOrNull() }
            ?: return PlanningSaveResult.Failure("実績時間のタイムゾーンを取得できません。再読み込みしてください。")
        val actualStartMinute = input.actualStartMinute
            ?: return PlanningSaveResult.Failure("実績開始時刻を取得できません。再読み込みしてください。")
        val startedAt = input.actualStartInstant ?: logicalMinuteToInstant(day, actualStartMinute, zone)
        val endedAt = input.actualEndInstant ?: input.actualEndMinute?.let {
            logicalEndMinuteToInstant(day, actualStartMinute, it, zone)
        }
        val expectedPlacement = ",\"expected_placement_revision\":$placementRevision"
        val inputPrecision = if (input.actualStartInstant == null) ",\"input_precision\":\"minute\"" else ""
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(entryId)}","execution_id":"${JsonEncoding.escape(UUIDv7.next())}","expected_lifecycle_state":"planned","started_at":"${JsonEncoding.escape(startedAt)}","ended_at":${endedAt?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"},"expected_started_at":null,"expected_ended_at":null$expectedPlacement$inputPrecision}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(entryId)}/execution-times", body)
            .toExecutionTimesSaveResult()
    }

    private fun logicalMinuteToInstant(day: TodayDay, minute: Int, zone: ZoneId): String {
        val date = LocalDate.parse(day.logicalDate).plusDays(if (minute < day.establishmentBoundaryMinutes) 1 else 0)
        return ZonedDateTime.of(date, LocalTime.of(minute / 60, minute % 60), zone).toInstant().toString()
    }

    private fun logicalEndMinuteToInstant(day: TodayDay, startedMinute: Int, endedMinute: Int, zone: ZoneId): String {
        val startedDate = java.time.Instant.parse(logicalMinuteToInstant(day, startedMinute, zone)).atZone(zone).toLocalDate()
        val endDate = startedDate.plusDays(if (endedMinute < startedMinute) 1 else 0)
        return ZonedDateTime.of(endDate, LocalTime.of(endedMinute / 60, endedMinute % 60), zone).toInstant().toString()
    }

    private fun sameInstant(left: String, right: String?): Boolean {
        if (right == null) return false
        val leftInstant = runCatching { java.time.Instant.parse(left) }.getOrNull() ?: return false
        val rightInstant = runCatching { java.time.Instant.parse(right) }.getOrNull() ?: return false
        return leftInstant == rightInstant
    }

    private fun isHistoricalPastDay(day: TodayDay): Boolean = !day.isCurrent
        && !day.planningEnabled && day.taskChuteDayId != null

    private fun reminderChanged(task: TodayTask, input: NormalizedTaskInput): Boolean =
        task.startReminderOffsetMinutes != input.startReminderOffsetMinutes
            || task.notifyOnEstimateOverrun != input.notifyOnEstimateOverrun

    private fun routineReminderIntentKey(dayId: String, task: TodayTask, input: NormalizedTaskInput): String =
        listOf(dayId, task.id, task.routineDefinitionId.orEmpty(), task.taskId.orEmpty(), input.toString())
            .joinToString("\u0000")

    private fun executeSectionMove(
        task: TodayTask,
        dayId: String?,
        sectionId: String?,
        expectedPlacementRevision: Int,
    ): Pair<PlanningSaveResult, Int?> {
        if (dayId == null) return PlanningSaveResult.Failure("編集対象の日を取得できません。") to null
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","section_id":${nullableString(sectionId)},"expected_placement_revision":$expectedPlacementRevision}
        """.trimIndent()
        return when (val result = execute("POST", "/api/v1/taskchute-days/current/entries/move", body)) {
            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized to null
            is PlanningHttpResult.Failure -> PlanningSaveResult.Failure(result.message) to null
            is PlanningHttpResult.Success -> runCatching { TaskPlanningJsonParser.parsePlacementRevision(result.body) }
                .map { PlanningSaveResult.Success to it }
                .getOrElse { PlanningSaveResult.Failure("Section移動結果を読み取れませんでした。") to null }
        }
    }
    private fun executeRoutineSectionPlan(
        task: TodayTask,
        day: TodayDay,
        sectionId: String?,
        plannedStartMinute: Int?,
        expectedPlacementRevision: Int,
    ): PlanningSaveResult {
        val dayId = day.taskChuteDayId ?: return PlanningSaveResult.Failure("編集対象の日を取得できません。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","section_id":${nullableString(sectionId)},"planned_start_minute":${plannedStartMinute ?: "null"},"expected_placement_revision":$expectedPlacementRevision,"action":"occurrence"}
        """.trimIndent()
        return when (val result = execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/routine-section-plan", body)) {
            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized
            is PlanningHttpResult.Failure -> PlanningSaveResult.Failure(result.message)
            is PlanningHttpResult.Success -> result.body?.let {
                runCatching { PlanningSaveResult.SuccessWithRevision(TaskPlanningJsonParser.parsePlacementRevision(it)) }
                    .getOrElse { PlanningSaveResult.Failure("RoutineのSection計画結果を読み取れませんでした。") }
            } ?: PlanningSaveResult.Success
        }
    }

    private fun executeRoutineEstimate(task: TodayTask, day: TodayDay, seconds: Int?): PlanningSaveResult {
        val dayId = day.taskChuteDayId ?: return PlanningSaveResult.Failure("編集対象の日を取得できません。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","estimate_seconds":${seconds ?: "null"},"action":"occurrence"}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/routine-estimate", body).toSaveResult()
    }

    private fun executeRoutineTitle(task: TodayTask, day: TodayDay, title: String): PlanningSaveResult {
        val dayId = day.taskChuteDayId ?: return PlanningSaveResult.Failure("編集対象の日を取得できません。")
        val normalizedTitle = title.trim()
        val retryKey = "${dayId}\u0000${task.id}\u0000$normalizedTitle"
        val operationId = ambiguousRoutineTitleOperationIds.getOrPut(retryKey, UUIDv7::next)
        val body = """
            {"operation_id":"${JsonEncoding.escape(operationId)}","entry_id":"${JsonEncoding.escape(task.id)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","title":"${JsonEncoding.escape(normalizedTitle)}"}
        """.trimIndent()
        return when (val result = execute(
            "POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/routine-title", body,
        )) {
            is PlanningHttpResult.Success -> {
                ambiguousRoutineTitleOperationIds.remove(retryKey)
                PlanningSaveResult.Success
            }
            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized
            is PlanningHttpResult.Failure -> {
                if (!result.ambiguous) ambiguousRoutineTitleOperationIds.remove(retryKey)
                PlanningSaveResult.Failure(result.message)
            }
        }
    }

    private fun executeTaskMetadata(task: TodayTask, taskId: String, projectId: String?, title: String = task.title): PlanningHttpResult {
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","task_id":"${JsonEncoding.escape(taskId)}","expected_title":"${JsonEncoding.escape(task.title)}","expected_project_id":${nullableString(task.project?.id)},"title":"${JsonEncoding.escape(title)}","project_id":${nullableString(projectId)}}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/task-metadata", body)
    }

    private fun executeMode(task: TodayTask, modeId: String?): PlanningHttpResult {
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","expected_mode_id":${nullableString(task.mode?.id)},"mode_id":${nullableString(modeId)}}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/mode", body)
    }

    private fun executeRoutineMode(task: TodayTask, day: TodayDay, modeId: String?): PlanningHttpResult {
        val dayId = day.taskChuteDayId
            ?: return PlanningHttpResult.Failure("編集対象の日を取得できません。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(task.id)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","action":"occurrence","mode_id":${nullableString(modeId)}}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(task.id)}/routine-mode", body)
    }

    private fun executeEstimate(entryId: String, expectedSeconds: Int?, seconds: Int?): PlanningSaveResult {
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(entryId)}","estimate_seconds":${seconds ?: "null"}}
        """.trimIndent()
        return execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(entryId)}/estimate", body).toSaveResult()
    }

    private fun executePlannedStart(entryId: String, dayId: String?, minute: Int?, placementRevision: Int): PlanningSaveResult {
        if (dayId == null) return PlanningSaveResult.Failure("編集対象の日を取得できません。")
        val body = """
            {"operation_id":"${JsonEncoding.escape(UUIDv7.next())}","entry_id":"${JsonEncoding.escape(entryId)}","taskchute_day_id":"${JsonEncoding.escape(dayId)}","planned_start_minute":${minute ?: "null"},"expected_placement_revision":$placementRevision}
        """.trimIndent()
        return when (val result = execute("POST", "/api/v1/entries/${JsonEncoding.pathSegment(entryId)}/planned-start", body)) {
            is PlanningHttpResult.Success -> result.body?.let {
                runCatching { PlanningSaveResult.SuccessWithRevision(TaskPlanningJsonParser.parsePlacementRevision(it)) }
                    .getOrDefault(PlanningSaveResult.Success)
            } ?: PlanningSaveResult.Success
            PlanningHttpResult.Unauthorized -> PlanningSaveResult.Unauthorized
            is PlanningHttpResult.Failure -> PlanningSaveResult.Failure(result.message)
        }
    }

    private fun execute(method: String, path: String, body: String?): PlanningHttpResult {
        val response = runCatching { request(method, path, body) }.getOrNull()
            ?: return PlanningHttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
        return when {
            response.status == null -> PlanningHttpResult.Failure("接続できませんでした。再試行してください。", ambiguous = true)
            response.status == 401 -> PlanningHttpResult.Unauthorized
            response.status !in 200..299 -> PlanningHttpResult.Failure("Todayを更新できませんでした。再試行してください。",
                ambiguous = response.status >= 500)
            else -> PlanningHttpResult.Success(response.body)
        }
    }

    private fun nullableString(value: String?): String = value?.let { "\"${JsonEncoding.escape(it)}\"" } ?: "null"
}

private data class PendingRoutineReminderMutation(
    val intentKey: String,
    val body: String,
    val expectedStartOffset: Int?,
    val expectedNotifyOnOverrun: Boolean,
    val nextStartOffset: Int?,
    val nextNotifyOnOverrun: Boolean,
)

private sealed interface RoutineReminderMetadataLookup {
    data class Success(val metadata: RoutineReminderSharedTaskMetadata) : RoutineReminderMetadataLookup
    data object Unauthorized : RoutineReminderMetadataLookup
    data class Failure(val message: String) : RoutineReminderMetadataLookup
}

private sealed interface PlanningHttpResult {
    data class Success(val body: String?) : PlanningHttpResult
    data object Unauthorized : PlanningHttpResult
    data class Failure(val message: String, val ambiguous: Boolean = false) : PlanningHttpResult

    fun toSaveResult(): PlanningSaveResult = when (this) {
        is Success -> PlanningSaveResult.Success
        Unauthorized -> PlanningSaveResult.Unauthorized
        is Failure -> PlanningSaveResult.Failure(message)
    }

    fun toExecutionTimesSaveResult(): PlanningSaveResult = when (this) {
        is Success -> runCatching {
            PlanningSaveResult.SuccessWithRevision(TaskPlanningJsonParser.parsePlacementRevision(body))
        }.getOrElse {
            PlanningSaveResult.Failure("実績時刻の保存結果を読み取れませんでした。再読み込みしてください。")
        }
        Unauthorized -> PlanningSaveResult.Unauthorized
        is Failure -> PlanningSaveResult.Failure(message)
    }

    fun toReferencesResult(): PlanningReferencesResult = when (this) {
        is Success -> PlanningReferencesResult.Failure("候補一覧を読み込めませんでした。再試行してください。")
        Unauthorized -> PlanningReferencesResult.Unauthorized
        is Failure -> PlanningReferencesResult.Failure(message)
    }
}

internal object TaskPlanningJsonParser {
    fun parseProjects(body: String?): List<TodayProject> = parseArray(body, "projects") { value ->
        TodayProject(value.stringField("id"), value.stringField("title"))
    }

    fun parseModes(body: String?): List<TodayMode> = parseArray(body, "modes") { value ->
        if (value.nullableBooleanField("archived") == true) null
        else TodayMode(value.stringField("id"), value.stringField("title"))
    }.filterNotNull()

    fun parseRoutineReminderTaskMetadata(
        body: String?,
        routineDefinitionId: String,
        expectedTaskId: String,
    ): RoutineReminderSharedTaskMetadata? {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("Routine board response must be an object")
        val routines = root.fields["routines"] as? JsonValue.Array
            ?: error("Routine board field 'routines' must be an array")
        val item = routines.values.asSequence()
            .map { it as? JsonValue.Object ?: error("Routine item must be an object") }
            .firstOrNull { it.stringField("routine_definition_id") == routineDefinitionId }
            ?: return null
        if (item.stringField("task_id") != expectedTaskId) return null
        val projectId = when (val project = item.fields["project"]) {
            JsonValue.Null -> null
            is JsonValue.Object -> project.stringField("id")
            else -> error("Routine project must be an object or null")
        }
        return RoutineReminderSharedTaskMetadata(item.stringField("title"), projectId)
    }

    fun parsePlacementRevision(body: String?): Int {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("Add response must be an object")
        return root.intField("placement_revision")
    }

    private fun <T> parseArray(body: String?, name: String, mapper: (JsonValue.Object) -> T): List<T> {
        val root = JsonParser(body ?: "").parse() as? JsonValue.Object
            ?: error("Reference response must be an object")
        return (root.fields[name] as? JsonValue.Array)?.values?.map { value ->
            mapper(value as? JsonValue.Object ?: error("Reference item must be an object"))
        } ?: error("Reference field '$name' must be an array")
    }

    private fun JsonValue.Object.stringField(name: String): String =
        (fields[name] as? JsonValue.StringValue)?.value ?: error("Field '$name' must be a string")

    private fun JsonValue.Object.nullableBooleanField(name: String): Boolean? = when (val value = fields[name]) {
        null, JsonValue.Null -> null
        is JsonValue.BooleanValue -> value.value
        else -> error("Field '$name' must be boolean or null")
    }

    private fun JsonValue.Object.intField(name: String): Int =
        (fields[name] as? JsonValue.NumberValue)?.value?.toIntOrNull() ?: error("Field '$name' must be an integer")
}

internal data class RoutineReminderSharedTaskMetadata(
    val title: String,
    val projectId: String?,
)
