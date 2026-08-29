import type { AddTaskToDayRequest, AddTaskToDayResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isAddTaskToDayRequest(value: unknown): value is AddTaskToDayRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    !("user_id" in body) &&
    typeof body.operation_id === "string" &&
    isUuidV7(body.operation_id) &&
    typeof body.task_id === "string" &&
    isUuidV7(body.task_id) &&
    typeof body.entry_id === "string" &&
    isUuidV7(body.entry_id) &&
    (body.project_id === null || (typeof body.project_id === "string" && isUuidV7(body.project_id))) &&
    typeof body.title === "string" &&
    body.title.trim().length > 0 &&
    body.title.length <= 300 &&
    typeof body.taskchute_day_id === "string" &&
    isUuidV7(body.taskchute_day_id) &&
    (body.section_id === null || (typeof body.section_id === "string" && isUuidV7(body.section_id))) &&
    Number.isInteger(body.expected_placement_revision) &&
    Number(body.expected_placement_revision) >= 0
  );
}

interface DayCheck { placement_revision: number }

function readDayCheck(rows: unknown[]): DayCheck | undefined {
  const row = rows[0];
  if (row === undefined) return undefined;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid persistence row");
  const value = (row as Record<string, unknown>).placement_revision;
  if (value === undefined) return undefined;
  if (typeof value !== "number") throw new Error("Invalid persistence row: placement_revision");
  return { placement_revision: value };
}

async function reject(
  db: D1Database,
  input: { appUserId: string; request: AddTaskToDayRequest; requestFingerprint: string },
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<AddTaskToDayResult> {
  return persistRejection<AddTaskToDayResult>(db, {
    appUserId: input.appUserId,
    operationId: input.request.operation_id,
    commandType: "AddTaskToDay",
    requestFingerprint: input.requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

export async function addTaskToDay(
  db: D1Database,
  appUserId: string,
  request: AddTaskToDayRequest,
): Promise<AddTaskToDayResult> {
  const semantic = { ...request, title: request.title.trim() };
  const requestFingerprint = await fingerprint(semantic);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<AddTaskToDayResult>(prior, "AddTaskToDay", requestFingerprint);
  const context = { appUserId, request, requestFingerprint };

  const [dayResult, sectionResult, projectResult, taskCollisionResult, entryCollisionResult, positionResult] = await db.batch([
    db
      .prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, request.taskchute_day_id),
    request.section_id
      ? db.prepare(`SELECT section_id AS id FROM taskchute_day_section_contexts
          WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
        .bind(appUserId, request.taskchute_day_id, request.section_id)
      : db.prepare("SELECT 1 AS id"),
    request.project_id
      ? db.prepare("SELECT id FROM projects WHERE app_user_id = ? AND id = ?").bind(appUserId, request.project_id)
      : db.prepare("SELECT 1 AS id"),
    db.prepare("SELECT id FROM tasks WHERE id = ?").bind(request.task_id),
    db.prepare("SELECT id FROM entries WHERE id = ?").bind(request.entry_id),
    db
      .prepare(
        "SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?",
      )
      .bind(appUserId, request.taskchute_day_id, request.section_id),
  ]);
  const day = readDayCheck(dayResult.results);
  if (!day) return reject(db, context, "resource_not_found", "TaskChuteDay is unavailable");
  if (sectionResult.results.length === 0) return reject(db, context, "resource_not_found", "Section is unavailable");
  if (projectResult.results.length === 0) return reject(db, context, "resource_not_found", "Project is unavailable");
  if (taskCollisionResult.results.length > 0 || entryCollisionResult.results.length > 0) {
    return reject(db, context, "resource_conflict", "task_id or entry_id is already in use");
  }
  if (day.placement_revision !== request.expected_placement_revision) {
    return persistRejection<AddTaskToDayResult>(db, {
      appUserId,
      operationId: request.operation_id,
      commandType: "AddTaskToDay",
      requestFingerprint,
      outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }
  const positionRow = positionResult.results[0];
  if (!positionRow || typeof positionRow !== "object" || Array.isArray(positionRow)) {
    throw new Error("Invalid persistence row: next_position");
  }
  const position = (positionRow as Record<string, unknown>).next_position;
  if (typeof position !== "number" || !Number.isInteger(position) || position < 1) {
    throw new Error("Invalid persistence row: next_position");
  }
  const result: AddTaskToDayResult = {
    task_id: request.task_id,
    entry_id: request.entry_id,
    taskchute_day_id: request.taskchute_day_id,
    section_id: request.section_id,
    position,
    placement_revision: request.expected_placement_revision + 1,
  };
  const now = new Date().toISOString();
  const assertionId = `add-task-to-day:${request.operation_id}`;
  try {
    const [guardResult] = await db.batch([
      db
        .prepare(
          `INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
           SELECT ?, app_user_id, id, ? FROM taskchute_days
            WHERE app_user_id = ? AND id = ? AND placement_revision = ?`,
        )
        .bind(
          request.operation_id,
          request.expected_placement_revision,
          appUserId,
          request.taskchute_day_id,
          request.expected_placement_revision,
        ),
      db
        .prepare(
          `UPDATE taskchute_days SET placement_revision = placement_revision + 1
            WHERE app_user_id = ? AND id = ?
              AND EXISTS (
                SELECT 1 FROM placement_command_guards
                 WHERE operation_id = ? AND app_user_id = ? AND taskchute_day_id = taskchute_days.id
              )`,
        )
        .bind(appUserId, request.taskchute_day_id, request.operation_id, appUserId),
      db
        .prepare(
          `INSERT INTO tasks (id, app_user_id, project_id, title, created_at)
           SELECT ?, ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE operation_id = ? AND app_user_id = ?)`,
        )
        .bind(
          request.task_id,
          appUserId,
          request.project_id,
          semantic.title,
          now,
          request.operation_id,
          appUserId,
        ),
      db
        .prepare(
          `INSERT INTO entries
            (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
           SELECT ?, ?, ?, ?, ?, ?, 'planned', ?
            WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE operation_id = ? AND app_user_id = ?)`,
        )
        .bind(
          request.entry_id,
          appUserId,
          request.task_id,
          request.taskchute_day_id,
          request.section_id,
          position,
          now,
          request.operation_id,
          appUserId,
        ),
      db
        .prepare(
          `INSERT INTO transaction_assertions (app_user_id, id, ok)
           SELECT ?, ?, CASE WHEN
             EXISTS (SELECT 1 FROM placement_command_guards WHERE operation_id = ? AND app_user_id = ? AND expected_revision = ?)
             AND EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
             AND EXISTS (SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ?)
             AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ?)
           THEN 1 ELSE 0 END
            WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE operation_id = ? AND app_user_id = ?)`,
        )
        .bind(
          appUserId,
          assertionId,
          request.operation_id,
          appUserId,
          request.expected_placement_revision,
          appUserId,
          request.taskchute_day_id,
          request.expected_placement_revision + 1,
          appUserId,
          request.task_id,
          appUserId,
          request.entry_id,
          request.operation_id,
          appUserId,
        ),
      db
        .prepare(
          `INSERT INTO operations
            (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
             outcome_kind, result_json, created_at)
           SELECT ?, ?, 'AddTaskToDay', ?, ?, 'success', ?, ?
            WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE operation_id = ? AND app_user_id = ?)`,
        )
        .bind(
          appUserId,
          request.operation_id,
          REQUEST_FINGERPRINT_VERSION,
          requestFingerprint,
          JSON.stringify(result),
          now,
          request.operation_id,
          appUserId,
        ),
      db
        .prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, assertionId),
      db
        .prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guardResult.meta.changes === 0) {
      return persistRejection<AddTaskToDayResult>(db, {
        appUserId,
        operationId: request.operation_id,
        commandType: "AddTaskToDay",
        requestFingerprint,
        outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The placement revision is stale" },
      });
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<AddTaskToDayResult>(committed, "AddTaskToDay", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
