import type { AddTaskToDayRequest, AddTaskToDayResult } from "../../src/shared/contracts";
import { isLogicalDate } from "../domain/taskchute-day";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";
import { readFutureDayEstablishmentPlan } from "./load-current-day";

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
    (body.logical_date === undefined || (typeof body.logical_date === "string" && isLogicalDate(body.logical_date))) &&
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

async function addTaskToEstablishedDay(
  db: D1Database,
  appUserId: string,
  request: AddTaskToDayRequest,
  requestFingerprint: string,
  semanticTitle: string,
): Promise<AddTaskToDayResult> {
  const context = { appUserId, request, requestFingerprint };

  const [dayResult, sectionResult, projectResult, taskCollisionResult, entryCollisionResult, positionResult] = await db.batch([
    db
      .prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, request.taskchute_day_id),
    request.section_id
      ? db.prepare(`SELECT section_id AS id, logical_start_minute FROM taskchute_day_section_contexts
          WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?
            AND logical_start_minute IS NOT NULL AND logical_end_minute IS NOT NULL`)
        .bind(appUserId, request.taskchute_day_id, request.section_id)
      : db.prepare("SELECT 1 AS id"),
    request.project_id
      ? db.prepare(`SELECT p.id FROM projects p WHERE p.app_user_id = ? AND p.id = ?
          AND NOT EXISTS (SELECT 1 FROM project_archives a WHERE a.app_user_id = p.app_user_id AND a.project_id = p.id)`)
        .bind(appUserId, request.project_id)
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
  const plannedStartMinute = request.section_id === null
    ? null
    : (sectionResult.results[0] as { logical_start_minute: number }).logical_start_minute;
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
          semanticTitle,
          now,
          request.operation_id,
          appUserId,
        ),
      db
        .prepare(
          `INSERT INTO entries
            (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
             planned_start_minute, created_at)
           SELECT ?, ?, ?, ?, ?, ?, 'planned', ?, ?
            WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE operation_id = ? AND app_user_id = ?)`,
        )
        .bind(
          request.entry_id,
          appUserId,
          request.task_id,
          request.taskchute_day_id,
          request.section_id,
          position,
          plannedStartMinute,
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

async function addTaskToFutureDay(
  db: D1Database,
  appUserId: string,
  request: AddTaskToDayRequest & { logical_date: string },
  requestFingerprint: string,
  semanticTitle: string,
  nowInstant: string,
  attempt = 0,
): Promise<AddTaskToDayResult> {
  const existing = await db.prepare(`SELECT id, placement_revision FROM taskchute_days
    WHERE app_user_id = ? AND logical_date = ?`).bind(appUserId, request.logical_date)
    .first<{ id: string; placement_revision: number }>();
  if (existing) {
    return addTaskToEstablishedDay(db, appUserId, { ...request, taskchute_day_id: existing.id }, requestFingerprint, semanticTitle);
  }
  if (request.expected_placement_revision !== 0) {
    throw new HttpError(409, "revision_conflict", "An unestablished future Day starts at revision 0", true);
  }
  const plan = await readFutureDayEstablishmentPlan(db, appUserId, request.logical_date, nowInstant);
  if (!plan) {
    // D-042: a past historical gap is read-only. Rejection itself must not create an operation row.
    throw new HttpError(409, "resource_conflict", "A Day without a past record is read-only", false);
  }
  const context = { appUserId, request, requestFingerprint };
  if (plan.configuration_version_id === null) {
    return reject(db, context, "resource_conflict", "Section configuration is required before future planning");
  }
  const [projectResult, taskCollisionResult, entryCollisionResult] = await db.batch([
    request.project_id
      ? db.prepare(`SELECT p.id FROM projects p WHERE p.app_user_id = ? AND p.id = ?
          AND NOT EXISTS (SELECT 1 FROM project_archives a WHERE a.app_user_id = p.app_user_id AND a.project_id = p.id)`)
        .bind(appUserId, request.project_id)
      : db.prepare("SELECT 1 AS id"),
    db.prepare("SELECT id FROM tasks WHERE id = ?").bind(request.task_id),
    db.prepare("SELECT id FROM entries WHERE id = ?").bind(request.entry_id),
  ]);
  const sectionAvailable = request.section_id === null || plan.contexts.some((context) => context.section_id === request.section_id);
  if (!sectionAvailable) return reject(db, context, "resource_not_found", "Section is unavailable");
  if (projectResult.results.length === 0) return reject(db, context, "resource_not_found", "Project is unavailable");
  if (taskCollisionResult.results.length > 0 || entryCollisionResult.results.length > 0) {
    return reject(db, context, "resource_conflict", "task_id or entry_id is already in use");
  }

  const now = nowInstant;
  const contextsJson = JSON.stringify(plan.contexts);
  const configurationVersionId = plan.configuration_version_id;
  const plannedStartMinute = request.section_id === null
    ? null
    : plan.contexts.find((context) => context.section_id === request.section_id)!.logical_start_minute;
  const result: AddTaskToDayResult = {
    task_id: request.task_id,
    entry_id: request.entry_id,
    taskchute_day_id: request.taskchute_day_id,
    section_id: request.section_id,
    position: 1,
    placement_revision: 1,
  };
  const assertionId = `establish-future-day:${request.operation_id}`;
  const configurationStillCurrent = `(CASE WHEN ? IS NULL THEN NOT EXISTS (
      SELECT 1 FROM section_configuration_heads WHERE app_user_id = ?
    ) ELSE EXISTS (
      SELECT 1 FROM section_configuration_heads h
      JOIN section_configuration_versions v ON v.app_user_id = h.app_user_id AND v.id = h.configuration_version_id
      WHERE h.app_user_id = ? AND h.configuration_version_id = ? AND v.day_boundary_minutes = ?
    ) END)`;
  try {
    await db.batch([
      db.prepare(`INSERT INTO taskchute_days
        (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
         establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'compatible', 0, ?
        WHERE EXISTS (SELECT 1 FROM user_settings WHERE app_user_id = ? AND timezone = ? AND day_boundary_minutes = ?)
          AND ${configurationStillCurrent}
        ON CONFLICT (app_user_id, logical_date) DO NOTHING`).bind(
          request.taskchute_day_id, appUserId, request.logical_date, plan.day.start_instant, plan.day.end_instant,
          plan.day.establishment_timezone, plan.day.establishment_boundary_minutes, now,
          appUserId, plan.settings.timezone, plan.settings.day_boundary_minutes,
          configurationVersionId, appUserId, appUserId, configurationVersionId, plan.settings.day_boundary_minutes,
        ),
      db.prepare(`INSERT INTO taskchute_day_section_contexts
        (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute,
         logical_end_minute, actual_start_instant, actual_end_instant, context_order)
        SELECT ?, ?, json_extract(value, '$.section_id'), json_extract(value, '$.configuration_version_id'),
          json_extract(value, '$.title'), json_extract(value, '$.logical_start_minute'),
          json_extract(value, '$.logical_end_minute'), json_extract(value, '$.actual_start_instant'),
          json_extract(value, '$.actual_end_instant'), CAST(json_extract(value, '$.context_order') AS INTEGER)
        FROM json_each(?) WHERE EXISTS (
          SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND logical_date = ?
        )`).bind(appUserId, request.taskchute_day_id, contextsJson, appUserId, request.taskchute_day_id, request.logical_date),
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, ?, d.id, 0 FROM taskchute_days d
        WHERE d.app_user_id = ? AND d.id = ? AND d.logical_date = ? AND d.placement_revision = 0
          AND (SELECT COUNT(*) FROM taskchute_day_section_contexts c
            WHERE c.app_user_id = d.app_user_id AND c.taskchute_day_id = d.id) = ?
          AND ${configurationStillCurrent}
          AND (? IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.app_user_id = ? AND p.id = ?
            AND NOT EXISTS (SELECT 1 FROM project_archives a WHERE a.app_user_id = p.app_user_id AND a.project_id = p.id)))
          AND (? IS NULL OR EXISTS (SELECT 1 FROM taskchute_day_section_contexts
            WHERE app_user_id = ? AND taskchute_day_id = d.id AND section_id = ?))
          AND NOT EXISTS (SELECT 1 FROM tasks WHERE id = ?)
          AND NOT EXISTS (SELECT 1 FROM entries WHERE id = ?)`).bind(
          request.operation_id, appUserId, appUserId, request.taskchute_day_id, request.logical_date, plan.contexts.length,
          configurationVersionId, appUserId, appUserId, configurationVersionId, plan.settings.day_boundary_minutes,
          request.project_id, appUserId, request.project_id,
          request.section_id, appUserId, request.section_id,
          request.task_id, request.entry_id,
        ),
      db.prepare(`UPDATE taskchute_days SET placement_revision = 1 WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO tasks (id, app_user_id, project_id, title, created_at)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.task_id, appUserId, request.project_id, semanticTitle, now, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         planned_start_minute, created_at)
        SELECT ?, ?, ?, ?, ?, 1, 'planned', ?, ? WHERE EXISTS (
          SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.entry_id, appUserId, request.task_id, request.taskchute_day_id, request.section_id,
          plannedStartMinute, now,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) VALUES (?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
          AND EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = 1)
          AND EXISTS (SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ?)
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ?)
        THEN 1 ELSE 0 END)`).bind(appUserId, assertionId, appUserId, request.operation_id,
          appUserId, request.taskchute_day_id, appUserId, request.task_id, appUserId, request.entry_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'AddTaskToDay', ?, ?, 'success', ?, ? WHERE EXISTS (
          SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), now, appUserId, request.operation_id),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<AddTaskToDayResult>(committed, "AddTaskToDay", requestFingerprint);
    const converged = await db.prepare(`SELECT id FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?`)
      .bind(appUserId, request.logical_date).first<{ id: string }>();
    if (converged) {
      return addTaskToEstablishedDay(db, appUserId, { ...request, taskchute_day_id: converged.id }, requestFingerprint, semanticTitle);
    }
    if (attempt === 0) return addTaskToFutureDay(db, appUserId, request, requestFingerprint, semanticTitle, nowInstant, 1);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}

export async function addTaskToDay(
  db: D1Database,
  appUserId: string,
  request: AddTaskToDayRequest,
  nowInstant = new Date().toISOString(),
): Promise<AddTaskToDayResult> {
  const semantic = { ...request, title: request.title.trim() };
  const requestFingerprint = await fingerprint(semantic);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<AddTaskToDayResult>(prior, "AddTaskToDay", requestFingerprint);
  return request.logical_date
    ? addTaskToFutureDay(db, appUserId, request as AddTaskToDayRequest & { logical_date: string }, requestFingerprint, semantic.title, nowInstant)
    : addTaskToEstablishedDay(db, appUserId, request, requestFingerprint, semantic.title);
}
