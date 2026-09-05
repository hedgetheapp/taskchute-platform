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
  task_id: string;
  task_title: string;
  task_project_id: string | null;
  lifecycle_state: string;
  routine_occurrence_id: string | null;
  logical_date: string;
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
  const row = await db.prepare(`SELECT e.task_id, t.title AS task_title, t.project_id AS task_project_id,
      e.lifecycle_state, e.routine_occurrence_id, d.logical_date
    FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ?`).bind(appUserId, request.entry_id, request.task_id)
    .first<MetadataRow>();
  if (!row) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Entry or Task is unavailable");
  if (!settings || row.logical_date !== currentLogicalDate || row.lifecycle_state !== "planned" || row.routine_occurrence_id !== null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Only an ordinary planned current-Day Entry can edit Task metadata");
  }
  if (row.task_title !== request.expected_title || row.task_project_id !== request.expected_project_id) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Task metadata changed before editing");
  }
  const project = request.project_id === null
    ? null
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
    title: request.title,
    project: project ? { id: project.id, title: project.title } : null,
  };
  const now = new Date().toISOString();
  try {
    const [update, operation] = await db.batch([
      db.prepare(`UPDATE tasks SET title = ?, project_id = ?
        WHERE app_user_id = ? AND id = ? AND title = ? AND project_id IS ?
          AND EXISTS (SELECT 1 FROM entries e JOIN taskchute_days d
            ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.lifecycle_state = 'planned'
              AND e.routine_occurrence_id IS NULL AND d.logical_date = ?)`)
        .bind(request.title, request.project_id, appUserId, request.task_id, request.expected_title, request.expected_project_id,
          appUserId, request.entry_id, request.task_id, currentLogicalDate),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'UpdateTaskMetadata', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ? AND title = ? AND project_id IS ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, request.task_id, request.title, request.project_id),
    ]);
    if (update.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Task metadata changed before editing");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<UpdateTaskMetadataResult>(committed, "UpdateTaskMetadata", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
