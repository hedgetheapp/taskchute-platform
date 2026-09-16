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
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.entry_id === "string" && isUuidV7(value.entry_id)
    && typeof value.task_id === "string" && isUuidV7(value.task_id)
    && typeof value.expected_title === "string"
    && (value.expected_project_id === null || (typeof value.expected_project_id === "string" && isUuidV7(value.expected_project_id)))
    && typeof value.title === "string" && value.title.trim().length > 0 && value.title.trim().length <= 300
    && (value.project_id === null || (typeof value.project_id === "string" && isUuidV7(value.project_id)));
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
  lifecycle_state: string;
  routine_occurrence_id: string | null;
  logical_date: string;
  project_snapshot_entry_id: string | null;
  historical_project_id: string | null;
  historical_project_title: string | null;
  has_completed_execution: number;
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
      e.taskchute_day_id, e.lifecycle_state, e.routine_occurrence_id, d.logical_date,
      eps.entry_id AS project_snapshot_entry_id, eps.project_id AS historical_project_id,
      eps.project_title AS historical_project_title,
      EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
        AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed') AS has_completed_execution
    FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    LEFT JOIN entry_task_snapshots ets ON ets.app_user_id = e.app_user_id AND ets.entry_id = e.id
    LEFT JOIN entry_project_snapshots eps ON eps.app_user_id = e.app_user_id AND eps.entry_id = e.id
    WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ?`).bind(appUserId, request.entry_id, request.task_id)
    .first<MetadataRow>();
  if (!row) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Entry or Task is unavailable");
  const isCurrent = settings !== null && row.logical_date === currentLogicalDate;
  const isFuture = settings !== null && currentLogicalDate !== null && row.logical_date > currentLogicalDate;
  const isPlannedMetadataUpdate = (isCurrent || isFuture)
    && row.lifecycle_state === "planned" && row.routine_occurrence_id === null;
  const isCompletedHistoricalCorrection = isCurrent && row.lifecycle_state === "completed"
    && row.routine_occurrence_id === null && row.has_completed_execution === 1;
  if (!settings || (!isPlannedMetadataUpdate && !isCompletedHistoricalCorrection)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Only an ordinary planned Entry or an eligible completed current-Day Entry can correct Task metadata");
  }
  if (isFuture && (request.title !== row.task_title || request.expected_title !== row.task_title)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Future-Day Task title is read-only; only Project assignment can change");
  }
  if (isCompletedHistoricalCorrection
    && (request.title !== row.entry_task_title || request.expected_title !== row.entry_task_title)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Completed Entry title is read-only");
  }
  if (isCompletedHistoricalCorrection && row.project_snapshot_entry_id === null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The completed Entry historical Project snapshot is unavailable");
  }
  const expectedProjectId = isCompletedHistoricalCorrection ? row.historical_project_id : row.task_project_id;
  if ((!isCompletedHistoricalCorrection && row.task_title !== request.expected_title)
    || (isCompletedHistoricalCorrection && row.entry_task_title !== request.expected_title)
    || expectedProjectId !== request.expected_project_id) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Task metadata changed before editing");
  }
  const project = request.project_id === null
    ? null
    : isCompletedHistoricalCorrection && request.project_id === row.historical_project_id
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
    title: isCompletedHistoricalCorrection ? row.entry_task_title : request.title,
    project: project ? { id: project.id, title: project.title } : null,
  };
  if (isCompletedHistoricalCorrection) {
    const eligibleTarget = `EXISTS (SELECT 1 FROM entries e
      JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      LEFT JOIN entry_task_snapshots ets ON ets.app_user_id = e.app_user_id AND ets.entry_id = e.id
      WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
        AND e.lifecycle_state = 'completed' AND e.routine_occurrence_id IS NULL
        AND d.logical_date = ? AND COALESCE(ets.task_title, t.title) = ?
        AND EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
          AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed'))`;
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
            appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.logical_date, row.entry_task_title,
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
            appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.logical_date, row.entry_task_title,
            ...activeProjectBindings),
        db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
          SELECT ?, ?, CASE WHEN changes() = 1
            AND EXISTS (SELECT 1 FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?
              AND project_id IS ? AND project_title IS ?)
            AND ${eligibleTarget} AND ${activeProjectTarget}
            THEN 1 ELSE 0 END`)
          .bind(appUserId, assertionId, appUserId, request.entry_id, request.project_id, project?.title ?? null,
            appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.logical_date, row.entry_task_title,
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
            AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed') AS has_completed_execution
        FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
        JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
        LEFT JOIN entry_task_snapshots ets ON ets.app_user_id = e.app_user_id AND ets.entry_id = e.id
        LEFT JOIN entry_project_snapshots eps ON eps.app_user_id = e.app_user_id AND eps.entry_id = e.id
        WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ?`)
        .bind(appUserId, request.entry_id, request.task_id).first<{
          project_id: string | null; lifecycle_state: string; routine_occurrence_id: string | null;
          logical_date: string; entry_task_title: string; has_completed_execution: number;
        }>();
      if (!latest) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Entry or Task is unavailable");
      if (latest.project_id !== expectedProjectId || latest.lifecycle_state !== "completed"
        || latest.routine_occurrence_id !== null || latest.logical_date !== currentLogicalDate
        || latest.entry_task_title !== row.entry_task_title || latest.has_completed_execution !== 1) {
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
  const now = new Date().toISOString();
  const assertionId = `task-metadata:${request.operation_id}`;
  try {
    const [update, assertion, operation] = await db.batch([
      db.prepare(`UPDATE tasks SET title = ?, project_id = ?
        WHERE app_user_id = ? AND id = ? AND title = ? AND project_id IS ?
          AND EXISTS (SELECT 1 FROM entries e JOIN taskchute_days d
            ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
              AND e.lifecycle_state = 'planned' AND e.routine_occurrence_id IS NULL
              AND d.id = ? AND d.logical_date = ?)`)
        .bind(request.title, request.project_id, appUserId, request.task_id, request.expected_title, request.expected_project_id,
          appUserId, request.entry_id, request.task_id, row.taskchute_day_id, row.taskchute_day_id, row.logical_date),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ? AND title = ? AND project_id IS ?)
          AND EXISTS (SELECT 1 FROM entries e JOIN taskchute_days d
            ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
              AND e.lifecycle_state = 'planned' AND e.routine_occurrence_id IS NULL
              AND d.id = ? AND d.logical_date = ?)
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
      || latest.lifecycle_state !== "planned" || latest.routine_occurrence_id !== null
      || latest.task_title !== request.expected_title || latest.task_project_id !== request.expected_project_id) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Task metadata target changed before editing");
    }
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
