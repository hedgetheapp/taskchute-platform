import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";
import type { UpdateTaskMetadataRequest, UpdateTaskMetadataResult } from "../../src/shared/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUpdateTaskMetadataRequest(value: unknown): value is UpdateTaskMetadataRequest {
  if (!isRecord(value) || "user_id" in value) return false;
  const validReminderOffset = value.start_reminder_offset_minutes === undefined
    || value.start_reminder_offset_minutes === null
    || (typeof value.start_reminder_offset_minutes === "number"
      && Number.isSafeInteger(value.start_reminder_offset_minutes)
      && [0, 5, 10, 15, 30, 60].includes(value.start_reminder_offset_minutes));
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.entry_id === "string" && isUuidV7(value.entry_id)
    && typeof value.task_id === "string" && isUuidV7(value.task_id)
    && typeof value.expected_title === "string"
    && (value.expected_project_id === null || (typeof value.expected_project_id === "string" && isUuidV7(value.expected_project_id)))
    && typeof value.title === "string" && value.title.trim().length > 0 && value.title.trim().length <= 300
    && (value.project_id === null || (typeof value.project_id === "string" && isUuidV7(value.project_id)))
    && validReminderOffset
    && (value.notify_on_estimate_overrun === undefined || typeof value.notify_on_estimate_overrun === "boolean");
}

function normalizedRequest(request: UpdateTaskMetadataRequest): UpdateTaskMetadataRequest {
  return { ...request, expected_title: request.expected_title.trim(), title: request.title.trim() };
}

async function reject<T>(
  db: D1Database,
  appUserId: string,
  request: UpdateTaskMetadataRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id,
    commandType: "UpdateTaskMetadata", requestFingerprint, outcomeKind: "domain_rejection", result: { code, message } });
}

interface MetadataRow {
  taskchute_day_id: string;
  task_id: string;
  task_title: string;
  entry_task_title: string;
  task_project_id: string | null;
  task_project_title: string | null;
  lifecycle_state: string;
  routine_occurrence_id: string | null;
  planned_start_minute: number | null;
  estimate_seconds: number | null;
  start_reminder_offset_minutes: number | null;
  notify_on_estimate_overrun: number;
  logical_date: string;
  project_snapshot_entry_id: string | null;
  historical_project_id: string | null;
  historical_project_title: string | null;
  routine_snapshot_occurrence_id: string | null;
  routine_title_override: string | null;
  routine_entry_task_title: string | null;
  routine_project_id: string | null;
  routine_project_title: string | null;
  has_completed_execution: number;
  active_execution_count: number;
}

interface ProjectRow { id: string; title: string }

export async function updateTaskMetadata(
  db: D1Database,
  appUserId: string,
  input: UpdateTaskMetadataRequest,
  nowInstant = new Date().toISOString(),
): Promise<UpdateTaskMetadataResult> {
  const request = normalizedRequest(input);
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<UpdateTaskMetadataResult>(prior, "UpdateTaskMetadata", requestFingerprint);

  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  const currentLogicalDate = settings
    ? resolveTaskChuteDay(nowInstant, { timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes }).logicalDate
    : null;
  const row = await db.prepare(`SELECT e.task_id, t.title AS task_title,
      COALESCE(ets.task_title, t.title) AS entry_task_title, t.project_id AS task_project_id,
      p.title AS task_project_title,
      CASE WHEN e.lifecycle_state = 'planned' THEN COALESCE(ro.title_override, rs.task_title, t.title)
           WHEN rs.routine_occurrence_id IS NOT NULL THEN rs.task_title
           WHEN ets.entry_id IS NOT NULL THEN ets.task_title ELSE t.title END AS routine_entry_task_title,
      rs.routine_occurrence_id AS routine_snapshot_occurrence_id,
      ro.title_override AS routine_title_override,
      rs.project_id AS routine_project_id, rs.project_title AS routine_project_title,
      e.taskchute_day_id, e.lifecycle_state, e.routine_occurrence_id, d.logical_date,
      e.planned_start_minute, e.estimate_seconds, e.start_reminder_offset_minutes, e.notify_on_estimate_overrun,
      eps.entry_id AS project_snapshot_entry_id, eps.project_id AS historical_project_id,
      eps.project_title AS historical_project_title,
      EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
        AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed') AS has_completed_execution,
      (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
        AND x.ended_at IS NULL AND x.terminal_outcome IS NULL) AS active_execution_count
    FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    LEFT JOIN routine_occurrence_task_snapshots rs ON rs.app_user_id = e.app_user_id AND rs.routine_occurrence_id = e.routine_occurrence_id
    LEFT JOIN entry_task_snapshots ets ON ets.app_user_id = e.app_user_id AND ets.entry_id = e.id
    LEFT JOIN entry_project_snapshots eps ON eps.app_user_id = e.app_user_id AND eps.entry_id = e.id
    LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
    WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ?`).bind(appUserId, request.entry_id, request.task_id)
    .first<MetadataRow>();
  if (!row) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Entry or Task is unavailable");
  const isCurrent = settings !== null && row.logical_date === currentLogicalDate;
  const isFuture = settings !== null && currentLogicalDate !== null && row.logical_date > currentLogicalDate;
  const isPast = settings !== null && currentLogicalDate !== null && row.logical_date < currentLogicalDate;
  const hasStartReminderPatch = Object.prototype.hasOwnProperty.call(request, "start_reminder_offset_minutes");
  const hasOverrunReminderPatch = Object.prototype.hasOwnProperty.call(request, "notify_on_estimate_overrun");
  if (hasStartReminderPatch || hasOverrunReminderPatch) {
    const metadataUnchanged = request.title === row.task_title && request.expected_title === row.task_title
      && request.project_id === row.task_project_id && request.expected_project_id === row.task_project_id;
    const plannedEligible = (isCurrent || isFuture) && row.lifecycle_state === "planned";
    const runningEligible = isCurrent && row.lifecycle_state === "running";
    const startOffset = hasStartReminderPatch ? request.start_reminder_offset_minutes! : row.start_reminder_offset_minutes;
    const notifyOnOverrun = hasOverrunReminderPatch ? request.notify_on_estimate_overrun! : row.notify_on_estimate_overrun === 1;
    if (!metadataUnchanged || (!plannedEligible && !runningEligible)
      || (runningEligible && hasStartReminderPatch)
      || (startOffset !== null && row.planned_start_minute === null)
      || (notifyOnOverrun && (row.estimate_seconds === null || row.estimate_seconds <= 0))) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Reminder settings are not eligible for this Entry state or planning data");
    }
    const lifecycle = row.lifecycle_state;
    const allowedDate = isCurrent ? "d.logical_date = ?" : "d.logical_date > ?";
    const expectedDate = currentLogicalDate!;
    const assertionId = `task-metadata:${request.operation_id}`;
    const updatedResult: UpdateTaskMetadataResult = {
      entry_id: request.entry_id, task_id: request.task_id,
      title: row.task_title,
      project: row.task_project_id === null || row.task_project_title === null
        ? null : { id: row.task_project_id, title: row.task_project_title },
    };
    const nextStartOffset = hasStartReminderPatch ? request.start_reminder_offset_minutes! : row.start_reminder_offset_minutes;
    const nextOverrun = hasOverrunReminderPatch ? (request.notify_on_estimate_overrun ? 1 : 0) : row.notify_on_estimate_overrun;
    try {
      const [update, assertion, operation] = await db.batch([
        db.prepare(`UPDATE entries SET
            start_reminder_offset_minutes = CASE WHEN ? = 1 THEN ? ELSE start_reminder_offset_minutes END,
            notify_on_estimate_overrun = CASE WHEN ? = 1 THEN ? ELSE notify_on_estimate_overrun END
          WHERE app_user_id = ? AND id = ? AND task_id = ? AND taskchute_day_id = ?
            AND lifecycle_state = ? AND routine_occurrence_id IS ?
            AND planned_start_minute IS ? AND estimate_seconds IS ?
            AND start_reminder_offset_minutes IS ? AND notify_on_estimate_overrun = ?
            AND EXISTS (SELECT 1 FROM taskchute_days d WHERE d.app_user_id = entries.app_user_id
              AND d.id = entries.taskchute_day_id AND ${allowedDate})
            AND EXISTS (SELECT 1 FROM tasks t WHERE t.app_user_id = entries.app_user_id
              AND t.id = entries.task_id AND t.title = ? AND t.project_id IS ?)`)
          .bind(hasStartReminderPatch ? 1 : 0, request.start_reminder_offset_minutes ?? null,
            hasOverrunReminderPatch ? 1 : 0, request.notify_on_estimate_overrun ? 1 : 0,
            appUserId, request.entry_id, request.task_id, row.taskchute_day_id, lifecycle, row.routine_occurrence_id,
            row.planned_start_minute, row.estimate_seconds, row.start_reminder_offset_minutes, row.notify_on_estimate_overrun,
            expectedDate, row.task_title, row.task_project_id),
        db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
          SELECT ?, ?, CASE WHEN changes() = 1 AND EXISTS (SELECT 1 FROM entries e
            JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
            WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
              AND e.lifecycle_state = ? AND e.routine_occurrence_id IS ?
              AND e.planned_start_minute IS ? AND e.estimate_seconds IS ?
              AND e.start_reminder_offset_minutes IS ? AND e.notify_on_estimate_overrun = ?
              AND d.logical_date ${isCurrent ? "=" : ">"} ? AND t.title = ? AND t.project_id IS ?)
            THEN 1 ELSE 0 END`)
          .bind(appUserId, assertionId, appUserId, request.entry_id, request.task_id, row.taskchute_day_id,
            lifecycle, row.routine_occurrence_id, row.planned_start_minute, row.estimate_seconds,
            nextStartOffset, nextOverrun, expectedDate, row.task_title, row.task_project_id),
        db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
            request_fingerprint, outcome_kind, result_json, created_at)
          SELECT ?, ?, 'UpdateTaskMetadata', ?, ?, 'success', ?, ? WHERE EXISTS
            (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
          .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
            JSON.stringify(updatedResult), nowInstant, appUserId, assertionId),
        db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      ]);
      if (update.meta.changes > 0 && assertion.meta.changes > 0 && operation.meta.changes > 0) return updatedResult;
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Reminder settings changed before editing");
    } catch {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
      throw new HttpError(503, "infrastructure_ambiguous", "The reminder settings outcome is unknown; reload canonical state and retry", true);
    }
  }
  const isPastRoutineCorrection = isPast && row.routine_occurrence_id !== null
    && (row.lifecycle_state === "planned" || row.lifecycle_state === "running" || row.lifecycle_state === "completed");
  if (isPastRoutineCorrection) {
    if (row.routine_snapshot_occurrence_id !== row.routine_occurrence_id) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The Routine occurrence snapshot is unavailable");
    }
    if (request.title !== row.routine_entry_task_title || request.expected_title !== row.routine_entry_task_title
      || request.expected_project_id !== row.routine_project_id) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Routine occurrence metadata changed before editing");
    }
    const hasTargetProject = request.project_id === row.routine_project_id;
    const project = request.project_id === null
      ? null
      : hasTargetProject
        ? { id: request.project_id, title: row.routine_project_title! }
        : await db.prepare(`SELECT p.id, p.title FROM projects p WHERE p.app_user_id = ? AND p.id = ?
          AND NOT EXISTS (SELECT 1 FROM project_archives a WHERE a.app_user_id = p.app_user_id AND a.project_id = p.id)`)
          .bind(appUserId, request.project_id).first<ProjectRow>();
    if (request.project_id !== null && !project) {
      return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Project is unavailable");
    }
    const result: UpdateTaskMetadataResult = {
      entry_id: request.entry_id, task_id: request.task_id, title: row.routine_entry_task_title!,
      project: project ? { id: project.id, title: project.title } : null,
    };
    const executionGuard = row.lifecycle_state === "planned" ? "1 = 1"
      : row.lifecycle_state === "running"
        ? `EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
            AND x.ended_at IS NULL AND x.terminal_outcome IS NULL)`
        : `EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
            AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed')`;
    const snapshotTarget = (expectedProjectId: string | null) => `EXISTS (SELECT 1 FROM entries e
      JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
      JOIN routine_occurrence_task_snapshots rs ON rs.app_user_id = ro.app_user_id AND rs.routine_occurrence_id = ro.id
      WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
        AND e.routine_occurrence_id = ? AND e.lifecycle_state = ? AND d.logical_date = ? AND d.logical_date < ?
        AND (CASE WHEN e.lifecycle_state = 'planned' THEN COALESCE(ro.title_override, rs.task_title)
          ELSE rs.task_title END) = ? AND rs.project_id IS ? AND ${executionGuard}
        AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions s
          WHERE s.app_user_id = ro.app_user_id AND s.routine_occurrence_id = ro.id))`;
    const guardBindings = (expectedProjectId: string | null) => [appUserId, request.entry_id, request.task_id, row.taskchute_day_id,
      row.routine_occurrence_id, row.lifecycle_state, row.logical_date, currentLogicalDate,
      row.routine_entry_task_title, expectedProjectId];
    const assertionId = `routine-task-metadata:${request.operation_id}`;
    try {
      const [update, assertion, operation] = await db.batch([
        db.prepare(`UPDATE routine_occurrence_task_snapshots SET project_id = ?, project_title = ?
          WHERE app_user_id = ? AND routine_occurrence_id = ? AND project_id IS ?
            AND ${snapshotTarget(row.routine_project_id)}`)
          .bind(request.project_id, project?.title ?? null, appUserId, row.routine_occurrence_id,
            row.routine_project_id, ...guardBindings(row.routine_project_id)),
        db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
          SELECT ?, ?, CASE WHEN changes() = 1 AND EXISTS (SELECT 1 FROM routine_occurrence_task_snapshots
            WHERE app_user_id = ? AND routine_occurrence_id = ? AND project_id IS ? AND project_title IS ?)
            AND ${snapshotTarget(request.project_id)} THEN 1 ELSE 0 END`)
          .bind(appUserId, assertionId, appUserId, row.routine_occurrence_id, request.project_id,
            project?.title ?? null, ...guardBindings(request.project_id)),
        db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
            request_fingerprint, outcome_kind, result_json, created_at)
          SELECT ?, ?, 'UpdateTaskMetadata', ?, ?, 'success', ?, ? WHERE EXISTS
            (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
          .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
            JSON.stringify(result), nowInstant, appUserId, assertionId),
        db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      ]);
      if (update.meta.changes > 0 && assertion.meta.changes > 0 && operation.meta.changes > 0) return result;
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Routine occurrence metadata changed before editing");
    } catch {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
      throw new HttpError(503, "infrastructure_ambiguous", "The Routine occurrence metadata outcome is unknown; reload and retry", true);
    }
  }
  const isPlannedMetadataUpdate = (isCurrent || isFuture || isPast)
    && row.lifecycle_state === "planned" && row.routine_occurrence_id === null;
  const isRunningMetadataUpdate = isCurrent
    && row.lifecycle_state === "running" && row.routine_occurrence_id === null;
  const isHistoricalRunningCorrection = isPast && row.lifecycle_state === "running"
    && row.routine_occurrence_id === null && row.active_execution_count === 1;
  const isCompletedHistoricalCorrection = (isCurrent || isPast) && row.lifecycle_state === "completed"
    && row.routine_occurrence_id === null && row.has_completed_execution === 1;
  const isEntryProjectSnapshotCorrection = isCompletedHistoricalCorrection || isHistoricalRunningCorrection;
  if (!settings || (!isPlannedMetadataUpdate && !isRunningMetadataUpdate
    && !isHistoricalRunningCorrection && !isCompletedHistoricalCorrection)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
      "Only an eligible ordinary planned Entry or current/past Running or Completed Entry can correct Task metadata");
  }
  if (isPast && isPlannedMetadataUpdate
    && (request.title !== row.task_title || request.project_id !== row.task_project_id)) {
    const sharedAuthority = await db.prepare(`SELECT
        EXISTS (SELECT 1 FROM entries other WHERE other.app_user_id = ? AND other.task_id = ? AND other.id <> ?) AS other_entries,
        EXISTS (SELECT 1 FROM routine_definitions rd WHERE rd.app_user_id = ? AND rd.task_id = ?) AS routine_definitions`)
      .bind(appUserId, request.task_id, request.entry_id, appUserId, request.task_id)
      .first<{ other_entries: number; routine_definitions: number }>();
    if (sharedAuthority?.other_entries || sharedAuthority?.routine_definitions) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "A past Planned Task shared with another Entry or Routine cannot safely change Task-level metadata");
    }
  }
  if (isFuture && (request.title !== row.task_title || request.expected_title !== row.task_title)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Future-Day Task title is read-only; only Project assignment can change");
  }
  if ((isRunningMetadataUpdate || isHistoricalRunningCorrection)
    && (request.title !== row.entry_task_title || request.expected_title !== row.entry_task_title)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Running Entry Task title is read-only; only Project assignment can change");
  }
  if (isCompletedHistoricalCorrection
    && (request.title !== row.entry_task_title || request.expected_title !== row.entry_task_title)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Completed Entry title is read-only");
  }
  if (isEntryProjectSnapshotCorrection && row.project_snapshot_entry_id === null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The Entry historical Project snapshot is unavailable");
  }
  const expectedProjectId = isEntryProjectSnapshotCorrection ? row.historical_project_id : row.task_project_id;
  if ((!isEntryProjectSnapshotCorrection && row.task_title !== request.expected_title)
    || (isEntryProjectSnapshotCorrection && row.entry_task_title !== request.expected_title)
    || expectedProjectId !== request.expected_project_id) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Task metadata changed before editing");
  }
  const project = request.project_id === null
    ? null
    : isEntryProjectSnapshotCorrection && request.project_id === row.historical_project_id
      ? { id: request.project_id, title: row.historical_project_title! }
      : await db.prepare(`SELECT p.id, p.title FROM projects p WHERE p.app_user_id = ? AND p.id = ?
        AND (NOT EXISTS (SELECT 1 FROM project_archives a
          WHERE a.app_user_id = p.app_user_id AND a.project_id = p.id) OR p.id = ?)`)
        .bind(appUserId, request.project_id, request.expected_project_id).first<ProjectRow>();
  if (request.project_id !== null && !project) {
    return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Project is unavailable");
  }
  const result: UpdateTaskMetadataResult = {
    entry_id: request.entry_id,
    task_id: request.task_id,
    title: isEntryProjectSnapshotCorrection ? row.entry_task_title : isRunningMetadataUpdate ? row.task_title : request.title,
    project: project ? { id: project.id, title: project.title } : null,
  };
  if (isEntryProjectSnapshotCorrection) {
    const executionGuard = row.lifecycle_state === "running"
      ? `EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
          AND x.ended_at IS NULL AND x.terminal_outcome IS NULL)`
      : `EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
          AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed')`;
    const eligibleTarget = `EXISTS (SELECT 1 FROM entries e
      JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      LEFT JOIN entry_task_snapshots ets ON ets.app_user_id = e.app_user_id AND ets.entry_id = e.id
      WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
        AND e.lifecycle_state = ? AND e.routine_occurrence_id IS NULL
        AND d.logical_date = ? AND d.logical_date <= ? AND COALESCE(ets.task_title, t.title) = ?
        AND ${executionGuard})`;
    const activeProjectTarget = request.project_id === null ? "1 = 1" : `EXISTS (SELECT 1 FROM projects p
      WHERE p.app_user_id = ? AND p.id = ? AND NOT EXISTS (SELECT 1 FROM project_archives a
        WHERE a.app_user_id = p.app_user_id AND a.project_id = p.id))`;
    const activeProjectBindings = request.project_id === null ? [] : [appUserId, request.project_id];
    if (request.project_id === expectedProjectId) {
      try {
        const operation = await db.prepare(`INSERT INTO operations
            (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
          SELECT ?, ?, 'UpdateTaskMetadata', ?, ?, 'success', ?, ?
          WHERE ${eligibleTarget} AND EXISTS (SELECT 1 FROM entry_project_snapshots
            WHERE app_user_id = ? AND entry_id = ? AND project_id IS ?)`)
          .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
            appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.lifecycle_state,
            row.logical_date, currentLogicalDate, row.entry_task_title,
            appUserId, request.entry_id, expectedProjectId).run();
        if (operation.meta.changes > 0) return result;
        const committed = await readOperation(db, appUserId, request.operation_id);
        if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
        return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Completed Entry metadata changed before editing");
      } catch {
        const committed = await readOperation(db, appUserId, request.operation_id);
        if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
        throw new HttpError(503, "infrastructure_ambiguous", "The completed Entry Project outcome is unknown; reload canonical state and retry", true);
      }
    }

    const assertionId = `task-metadata:${request.operation_id}`;
    try {
      const [update, assertion, operation] = await db.batch([
        db.prepare(`UPDATE entry_project_snapshots SET project_id = ?, project_title = ?
          WHERE app_user_id = ? AND entry_id = ? AND project_id IS ? AND ${eligibleTarget} AND ${activeProjectTarget}`)
          .bind(request.project_id, project?.title ?? null, appUserId, request.entry_id, expectedProjectId,
            appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.lifecycle_state,
            row.logical_date, currentLogicalDate, row.entry_task_title,
            ...activeProjectBindings),
        db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
          SELECT ?, ?, CASE WHEN changes() = 1
            AND EXISTS (SELECT 1 FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?
              AND project_id IS ? AND project_title IS ?)
            AND ${eligibleTarget} AND ${activeProjectTarget}
            THEN 1 ELSE 0 END`)
          .bind(appUserId, assertionId, appUserId, request.entry_id, request.project_id, project?.title ?? null,
            appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.lifecycle_state,
            row.logical_date, currentLogicalDate, row.entry_task_title,
            ...activeProjectBindings),
        db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
            request_fingerprint, outcome_kind, result_json, created_at)
          SELECT ?, ?, 'UpdateTaskMetadata', ?, ?, 'success', ?, ? WHERE EXISTS
            (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
          .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
            appUserId, assertionId),
        db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      ]);
      if (update.meta.changes === 0 || assertion.meta.changes === 0 || operation.meta.changes === 0) {
        const committed = await readOperation(db, appUserId, request.operation_id);
        if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
        return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Completed Entry metadata changed before editing");
      }
      return result;
    } catch {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
      const latest = await db.prepare(`SELECT eps.project_id, e.lifecycle_state, e.routine_occurrence_id,
          d.logical_date, COALESCE(ets.task_title, t.title) AS entry_task_title,
          EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
            AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed') AS has_completed_execution,
          (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
            AND x.ended_at IS NULL AND x.terminal_outcome IS NULL) AS active_execution_count
        FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
        JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
        LEFT JOIN entry_task_snapshots ets ON ets.app_user_id = e.app_user_id AND ets.entry_id = e.id
        LEFT JOIN entry_project_snapshots eps ON eps.app_user_id = e.app_user_id AND eps.entry_id = e.id
        WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ?`)
        .bind(appUserId, request.entry_id, request.task_id).first<{
          project_id: string | null; lifecycle_state: string; routine_occurrence_id: string | null;
          logical_date: string; entry_task_title: string; has_completed_execution: number; active_execution_count: number;
        }>();
      if (!latest) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Entry or Task is unavailable");
      if (latest.project_id !== expectedProjectId || latest.lifecycle_state !== row.lifecycle_state
        || latest.routine_occurrence_id !== null || latest.logical_date !== row.logical_date
        || latest.entry_task_title !== row.entry_task_title
        || (row.lifecycle_state === "completed" && latest.has_completed_execution !== 1)
        || (row.lifecycle_state === "running" && latest.active_execution_count !== 1)) {
        return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Completed Entry metadata changed before editing");
      }
      if (request.project_id !== null) {
        const latestProject = await db.prepare(`SELECT p.id, a.project_id AS archived_project_id FROM projects p
          LEFT JOIN project_archives a ON a.app_user_id = p.app_user_id AND a.project_id = p.id
          WHERE p.app_user_id = ? AND p.id = ?`).bind(appUserId, request.project_id)
          .first<{ id: string; archived_project_id: string | null }>();
        if (!latestProject) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Project is unavailable");
        if (latestProject.archived_project_id !== null) {
          return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "An archived Project cannot be newly selected");
        }
      }
      throw new HttpError(503, "infrastructure_ambiguous", "The completed Entry Project outcome is unknown; reload canonical state and retry", true);
    }
  }
  const editableLifecycle = isRunningMetadataUpdate ? "running" : "planned";
  const pastTaskAuthorityGuard = isPast && isPlannedMetadataUpdate
    ? `AND NOT EXISTS (SELECT 1 FROM entries other WHERE other.app_user_id = e.app_user_id
        AND other.task_id = e.task_id AND other.id <> e.id)
      AND NOT EXISTS (SELECT 1 FROM routine_definitions rd WHERE rd.app_user_id = e.app_user_id AND rd.task_id = e.task_id)`
    : "";
  const now = new Date().toISOString();
  const assertionId = `task-metadata:${request.operation_id}`;
  try {
    const [update, assertion, operation] = await db.batch([
      db.prepare(`UPDATE tasks SET title = ?, project_id = ?
        WHERE app_user_id = ? AND id = ? AND title = ? AND project_id IS ?
          AND EXISTS (SELECT 1 FROM entries e JOIN taskchute_days d
            ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
              AND e.lifecycle_state = '${editableLifecycle}' AND e.routine_occurrence_id IS NULL
              AND d.id = ? AND d.logical_date = ? ${pastTaskAuthorityGuard})`)
        .bind(request.title, request.project_id, appUserId, request.task_id, request.expected_title, request.expected_project_id,
          appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.taskchute_day_id, row.logical_date),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ? AND title = ? AND project_id IS ?)
          AND EXISTS (SELECT 1 FROM entries e JOIN taskchute_days d
            ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
              AND e.lifecycle_state = '${editableLifecycle}' AND e.routine_occurrence_id IS NULL
              AND d.id = ? AND d.logical_date = ? ${pastTaskAuthorityGuard})
          THEN 1 ELSE 0 END`)
        .bind(appUserId, assertionId, appUserId, request.task_id, request.title, request.project_id,
          appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.taskchute_day_id, row.logical_date),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'UpdateTaskMetadata', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
    ]);
    if (update.meta.changes === 0 || assertion.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Task metadata changed before editing");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
    const latest = await db.prepare(`SELECT e.taskchute_day_id, e.task_id, t.title AS task_title, t.project_id AS task_project_id,
        e.lifecycle_state, e.routine_occurrence_id, d.logical_date
      FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ?`)
      .bind(appUserId, request.entry_id, request.task_id).first<MetadataRow>();
    if (!latest) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Entry or Task is unavailable");
    if (latest.taskchute_day_id !== row.taskchute_day_id || latest.logical_date !== row.logical_date
      || latest.lifecycle_state !== editableLifecycle || latest.routine_occurrence_id !== null
      || latest.task_title !== request.expected_title || latest.task_project_id !== request.expected_project_id) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Task metadata target changed before editing");
    }
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
