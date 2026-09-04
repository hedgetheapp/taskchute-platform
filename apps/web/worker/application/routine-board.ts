import type {
  CreateRoutineRequest,
  CreateRoutineResult,
  ReorderRoutinesRequest,
  ReorderRoutinesResult,
  RoutineBoardProjection,
  RoutineScheduleInput,
  SetRoutineEnabledRequest,
  SetRoutineEnabledResult,
  UpdateRoutineRequest,
  UpdateRoutineResult,
} from "../../src/shared/contracts";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { isUuidV7, uuidv7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation, type CommandType } from "../persistence/operations";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";
import { HttpError } from "./errors";

interface CurrentContext {
  logicalDate: string;
  dayId: string | null;
  placementRevision: number | null;
  boundaryMinutes: number;
}

interface RoutineRow {
  routine_definition_id: string;
  task_id: string;
  title: string;
  project_id: string | null;
  project_title: string | null;
  schedule_kind: "daily" | "every_n_days" | "weekly";
  interval_days: number | null;
  weekdays_mask: number | null;
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  default_estimate_seconds: number | null;
  start_logical_date: string;
  end_logical_date: string | null;
  board_position: number;
  settings_revision: number;
  paused: number;
}

const weekdayValues = new Set([0, 1, 2, 3, 4, 5, 6]);

function isLogicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 300;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && isUuidV7(value);
}

function isSchedule(value: unknown): value is RoutineScheduleInput {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.kind === "daily") return Object.keys(row).length === 1;
  if (row.kind === "every_n_days") {
    return Object.keys(row).every((key) => key === "kind" || key === "interval_days")
      && Number.isSafeInteger(row.interval_days) && Number(row.interval_days) >= 2 && Number(row.interval_days) <= 365;
  }
  if (row.kind === "weekly") {
    return Object.keys(row).every((key) => key === "kind" || key === "weekdays")
      && Array.isArray(row.weekdays) && row.weekdays.length >= 1
      && new Set(row.weekdays).size === row.weekdays.length
      && row.weekdays.every((day) => Number.isInteger(day) && weekdayValues.has(day));
  }
  return false;
}

export function isCreateRoutineRequest(value: unknown): value is CreateRoutineRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body) && isUuid(body.operation_id) && isUuid(body.task_id)
    && isUuid(body.routine_definition_id) && isTitle(body.title)
    && Number.isSafeInteger(body.expected_board_revision) && Number(body.expected_board_revision) >= 0;
}

export function isSetRoutineEnabledRequest(value: unknown): value is SetRoutineEnabledRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body) && isUuid(body.operation_id) && isUuid(body.routine_definition_id)
    && typeof body.enabled === "boolean" && Number.isSafeInteger(body.expected_settings_revision)
    && Number(body.expected_settings_revision) >= 0;
}

export function isUpdateRoutineRequest(value: unknown): value is UpdateRoutineRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body) && isUuid(body.operation_id) && isUuid(body.routine_definition_id)
    && Number.isSafeInteger(body.expected_settings_revision) && Number(body.expected_settings_revision) >= 0
    && isTitle(body.title) && (body.project_id === null || isUuid(body.project_id))
    && isSchedule(body.schedule) && (body.default_section_id === null || isUuid(body.default_section_id))
    && (body.default_planned_start_minute === null || (Number.isSafeInteger(body.default_planned_start_minute)
      && Number(body.default_planned_start_minute) >= 0))
    && ((body.default_section_id === null) === (body.default_planned_start_minute === null))
    && (body.default_estimate_seconds === null || (Number.isSafeInteger(body.default_estimate_seconds)
      && Number(body.default_estimate_seconds) > 0))
    && isLogicalDate(body.start_logical_date) && (body.end_logical_date === null || isLogicalDate(body.end_logical_date))
    && (body.end_logical_date === null || body.start_logical_date <= body.end_logical_date);
}

export function isReorderRoutinesRequest(value: unknown): value is ReorderRoutinesRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body) && isUuid(body.operation_id)
    && Array.isArray(body.routine_definition_ids) && body.routine_definition_ids.length >= 1
    && new Set(body.routine_definition_ids).size === body.routine_definition_ids.length
    && body.routine_definition_ids.every(isUuid)
    && Number.isSafeInteger(body.expected_board_revision) && Number(body.expected_board_revision) >= 0;
}

function scheduleColumns(schedule: RoutineScheduleInput): { kind: string; interval: number | null; mask: number | null } {
  if (schedule.kind === "daily") return { kind: "daily", interval: null, mask: null };
  if (schedule.kind === "every_n_days") return { kind: schedule.kind, interval: schedule.interval_days, mask: null };
  return { kind: schedule.kind, interval: null,
    mask: schedule.weekdays.reduce((mask, day) => mask | (1 << day), 0) };
}

function scheduleProjection(row: RoutineRow): RoutineScheduleInput {
  if (row.schedule_kind === "daily") return { kind: "daily" };
  if (row.schedule_kind === "every_n_days") return { kind: "every_n_days", interval_days: row.interval_days! };
  return { kind: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6].filter((day) => ((row.weekdays_mask! >> day) & 1) === 1) };
}

async function currentContext(db: D1Database, appUserId: string, nowInstant: string): Promise<CurrentContext> {
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  if (!settings) throw new Error("Provisioned user has no TaskChuteDay settings");
  const resolved = resolveTaskChuteDay(nowInstant, { timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes });
  const day = await db.prepare(`SELECT id, placement_revision FROM taskchute_days
    WHERE app_user_id = ? AND logical_date = ?`).bind(appUserId, resolved.logicalDate)
    .first<{ id: string; placement_revision: number }>();
  return { logicalDate: resolved.logicalDate, dayId: day?.id ?? null,
    placementRevision: day?.placement_revision ?? null, boundaryMinutes: resolved.boundaryMinutes };
}

export async function loadRoutineBoard(
  db: D1Database,
  appUserId: string,
  nowInstant = new Date().toISOString(),
): Promise<RoutineBoardProjection> {
  const context = await currentContext(db, appUserId, nowInstant);
  const [head, routines, sections] = await db.batch([
    db.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?").bind(appUserId),
    db.prepare(`SELECT r.id AS routine_definition_id, r.task_id, t.title, p.id AS project_id,
        p.title AS project_title, s.schedule_kind, s.interval_days, s.weekdays_mask,
        r.default_section_id, r.default_planned_start_minute, r.default_estimate_seconds,
        r.start_logical_date, r.end_logical_date, b.board_position, b.settings_revision,
        CASE WHEN EXISTS (SELECT 1 FROM routine_pause_intervals pi WHERE pi.app_user_id = r.app_user_id
          AND pi.routine_definition_id = r.id AND pi.paused_logical_date <= ?
          AND (pi.resumed_logical_date IS NULL OR ? < pi.resumed_logical_date)) THEN 1 ELSE 0 END AS paused
      FROM routine_definitions r
      JOIN tasks t ON t.app_user_id = r.app_user_id AND t.id = r.task_id
      JOIN routine_schedules s ON s.app_user_id = r.app_user_id AND s.routine_definition_id = r.id
      JOIN routine_board_items b ON b.app_user_id = r.app_user_id AND b.routine_definition_id = r.id
      LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
      WHERE r.app_user_id = ? ORDER BY b.board_position, r.id`)
      .bind(context.logicalDate, context.logicalDate, appUserId),
    db.prepare(`SELECT i.section_id AS id, i.title, i.logical_start_minute, i.logical_end_minute
      FROM section_configuration_heads h JOIN section_configuration_items i
        ON i.app_user_id = h.app_user_id AND i.configuration_version_id = h.configuration_version_id
      WHERE h.app_user_id = ? ORDER BY i.configuration_order`).bind(appUserId),
  ]);
  const revision = (head.results[0] as { board_revision?: number } | undefined)?.board_revision ?? 0;
  return {
    board_revision: revision,
    current_logical_date: context.logicalDate,
    sections: sections.results as RoutineBoardProjection["sections"],
    routines: (routines.results as unknown as RoutineRow[]).map((row) => ({
      routine_definition_id: row.routine_definition_id, task_id: row.task_id, title: row.title,
      project: row.project_id && row.project_title ? { id: row.project_id, title: row.project_title } : null,
      enabled: row.paused === 0, schedule: scheduleProjection(row), default_section_id: row.default_section_id,
      default_planned_start_minute: row.default_planned_start_minute,
      default_estimate_seconds: row.default_estimate_seconds, start_logical_date: row.start_logical_date,
      end_logical_date: row.end_logical_date, board_position: row.board_position,
      settings_revision: row.settings_revision,
    })),
  };
}

async function reject<T>(db: D1Database, appUserId: string, operationId: string, commandType: CommandType,
  requestFingerprint: string, message: string, conflict = false): Promise<T> {
  return persistRejection(db, { appUserId, operationId, commandType, requestFingerprint,
    outcomeKind: conflict ? "revision_conflict" : "domain_rejection",
    result: conflict ? { message } : { code: "resource_conflict", message } });
}

async function persistSuccess<T>(db: D1Database, input: { appUserId: string; operationId: string;
  commandType: CommandType; requestFingerprint: string; result: T; now: string }): Promise<T> {
  try {
    await db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type,
      request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
      VALUES (?, ?, ?, ?, ?, 'success', ?, ?)`)
      .bind(input.appUserId, input.operationId, input.commandType, REQUEST_FINGERPRINT_VERSION,
        input.requestFingerprint, JSON.stringify(input.result), input.now).run();
    return input.result;
  } catch {
    const prior = await readOperation(db, input.appUserId, input.operationId);
    if (prior) return replayOperation(prior, input.commandType, input.requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine outcome is unknown; reload and retry", true);
  }
}

export async function createRoutine(db: D1Database, appUserId: string, request: CreateRoutineRequest,
  nowInstant = new Date().toISOString()): Promise<CreateRoutineResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "CreateRoutine", requestFingerprint);
  const context = await currentContext(db, appUserId, nowInstant);
  const [head, count, collisions] = await Promise.all([
    db.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?").bind(appUserId)
      .first<{ board_revision: number }>(),
    db.prepare("SELECT COUNT(*) AS value FROM routine_board_items WHERE app_user_id = ?").bind(appUserId)
      .first<{ value: number }>(),
    db.prepare(`SELECT 1 AS found FROM tasks WHERE id IN (?, ?) UNION ALL
      SELECT 1 FROM routine_definitions WHERE id = ?`).bind(request.task_id, request.routine_definition_id,
      request.routine_definition_id).all(),
  ]);
  if (!head || head.board_revision !== request.expected_board_revision) {
    return reject(db, appUserId, request.operation_id, "CreateRoutine", requestFingerprint,
      "The Routine board revision is stale", true);
  }
  if (collisions.results.length > 0) {
    return reject(db, appUserId, request.operation_id, "CreateRoutine", requestFingerprint,
      "Routine identity or board state is unavailable");
  }
  const position = (count?.value ?? 0) + 1;
  const result: CreateRoutineResult = { routine_definition_id: request.routine_definition_id,
    task_id: request.task_id, board_position: position, board_revision: request.expected_board_revision + 1,
    settings_revision: 0 };
  const pauseId = uuidv7();
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO tasks (id, app_user_id, project_id, title, created_at)
        SELECT ?, ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM routine_board_heads
          WHERE app_user_id = ? AND board_revision = ?)`)
        .bind(request.task_id, appUserId, request.title.trim(), nowInstant, appUserId, request.expected_board_revision),
      db.prepare(`INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type,
        start_logical_date, end_logical_date, default_section_id, default_estimate_seconds,
        default_planned_start_minute, materialization_order, defaults_revision, created_at)
        SELECT ?, ?, ?, 'daily', ?, NULL, NULL, NULL, NULL, ?, 0, ? WHERE EXISTS (
          SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ?)`)
        .bind(request.routine_definition_id, appUserId, request.task_id, context.logicalDate, position,
          nowInstant, appUserId, request.task_id),
      db.prepare(`INSERT INTO routine_schedules VALUES (?, ?, 'daily', NULL, NULL)`)
        .bind(appUserId, request.routine_definition_id),
      db.prepare(`INSERT INTO routine_board_items VALUES (?, ?, ?, 0)`)
        .bind(appUserId, request.routine_definition_id, position),
      db.prepare(`INSERT INTO routine_pause_intervals
        (id, app_user_id, routine_definition_id, paused_logical_date, resumed_logical_date, created_at)
        VALUES (?, ?, ?, ?, NULL, ?)`)
        .bind(pauseId, appUserId, request.routine_definition_id, context.logicalDate, nowInstant),
      db.prepare(`UPDATE routine_board_heads SET board_revision = board_revision + 1
        WHERE app_user_id = ? AND board_revision = ?`).bind(appUserId, request.expected_board_revision),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type,
        request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'CreateRoutine', ?, ?, 'success', ?, ? WHERE EXISTS (
          SELECT 1 FROM routine_board_heads WHERE app_user_id = ? AND board_revision = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, result.board_revision),
    ]);
    if (results[5]?.meta.changes === 0 || results[6]?.meta.changes === 0) throw new Error("concurrent board mutation");
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "CreateRoutine", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine creation outcome is unknown; reload and retry", true);
  }
}

function eligibleExpression(alias: string): string {
  return `${alias}.start_logical_date <= ? AND (${alias}.end_logical_date IS NULL OR ${alias}.end_logical_date >= ?)
    AND (s.schedule_kind = 'daily'
      OR (s.schedule_kind = 'every_n_days' AND CAST(julianday(?) - julianday(${alias}.start_logical_date) AS INTEGER) % s.interval_days = 0)
      OR (s.schedule_kind = 'weekly' AND (s.weekdays_mask & (1 << CAST(strftime('%w', ?) AS INTEGER))) <> 0))
    AND NOT EXISTS (SELECT 1 FROM routine_pause_intervals pi WHERE pi.app_user_id = ${alias}.app_user_id
      AND pi.routine_definition_id = ${alias}.id AND pi.paused_logical_date <= ?
      AND (pi.resumed_logical_date IS NULL OR ? < pi.resumed_logical_date))`;
}

async function currentMaterializationPlan(db: D1Database, appUserId: string, routineId: string,
  context: CurrentContext, resuming = false): Promise<{ occurrenceId: string; entryId: string; taskId: string; title: string;
    projectId: string | null; projectTitle: string | null; sectionId: string | null;
    plannedStart: number | null; estimate: number | null; position: number } | null> {
  if (!context.dayId || context.placementRevision === null) return null;
  const eligibility = resuming
    ? `r.start_logical_date <= ? AND (r.end_logical_date IS NULL OR r.end_logical_date >= ?)
      AND (s.schedule_kind = 'daily'
        OR (s.schedule_kind = 'every_n_days' AND CAST(julianday(?) - julianday(r.start_logical_date) AS INTEGER) % s.interval_days = 0)
        OR (s.schedule_kind = 'weekly' AND (s.weekdays_mask & (1 << CAST(strftime('%w', ?) AS INTEGER))) <> 0))`
    : eligibleExpression("r");
  const bindings = resuming
    ? [appUserId, routineId, context.logicalDate, context.logicalDate, context.logicalDate, context.logicalDate, context.dayId]
    : [appUserId, routineId, context.logicalDate, context.logicalDate, context.logicalDate,
        context.logicalDate, context.logicalDate, context.logicalDate, context.dayId];
  const definition = await db.prepare(`SELECT r.task_id, t.title, p.id AS project_id, p.title AS project_title,
      r.default_section_id, r.default_planned_start_minute, r.default_estimate_seconds
    FROM routine_definitions r JOIN routine_schedules s ON s.app_user_id = r.app_user_id AND s.routine_definition_id = r.id
    JOIN tasks t ON t.app_user_id = r.app_user_id AND t.id = r.task_id
    LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
    WHERE r.app_user_id = ? AND r.id = ? AND ${eligibility}
      AND NOT EXISTS (SELECT 1 FROM routine_occurrences o WHERE o.app_user_id = r.app_user_id
        AND o.routine_definition_id = r.id AND o.origin_taskchute_day_id = ?)`)
    .bind(...bindings)
    .first<{ task_id: string; title: string; project_id: string | null; project_title: string | null;
      default_section_id: string | null; default_planned_start_minute: number | null;
      default_estimate_seconds: number | null }>();
  if (!definition) return null;
  if (definition.default_section_id !== null) {
    const valid = await db.prepare(`SELECT COUNT(*) AS count FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? AND logical_start_minute <= ?
        AND ? < logical_end_minute`).bind(appUserId, context.dayId, definition.default_section_id,
        definition.default_planned_start_minute, definition.default_planned_start_minute)
      .first<{ count: number }>();
    if (valid?.count !== 1) throw new HttpError(409, "resource_conflict",
      "Routine placement is unavailable in the current TaskChuteDay context", true);
  }
  const pos = await db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS value FROM entries
    WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?`)
    .bind(appUserId, context.dayId, definition.default_section_id).first<{ value: number }>();
  return { occurrenceId: uuidv7(), entryId: uuidv7(), taskId: definition.task_id, title: definition.title,
    projectId: definition.project_id, projectTitle: definition.project_title,
    sectionId: definition.default_section_id, plannedStart: definition.default_planned_start_minute,
    estimate: definition.default_estimate_seconds, position: pos?.value ?? 1 };
}

export async function setRoutineEnabled(db: D1Database, appUserId: string, request: SetRoutineEnabledRequest,
  nowInstant = new Date().toISOString()): Promise<SetRoutineEnabledResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "SetRoutineEnabled", requestFingerprint);
  const context = await currentContext(db, appUserId, nowInstant);
  const row = await db.prepare(`SELECT b.settings_revision,
    EXISTS (SELECT 1 FROM routine_pause_intervals p WHERE p.app_user_id = b.app_user_id
      AND p.routine_definition_id = b.routine_definition_id AND p.paused_logical_date <= ?
      AND (p.resumed_logical_date IS NULL OR ? < p.resumed_logical_date)) AS paused
    FROM routine_board_items b WHERE b.app_user_id = ? AND b.routine_definition_id = ?`)
    .bind(context.logicalDate, context.logicalDate, appUserId, request.routine_definition_id)
    .first<{ settings_revision: number; paused: number }>();
  if (!row) return reject(db, appUserId, request.operation_id, "SetRoutineEnabled", requestFingerprint,
    "Routine is unavailable");
  if (row.settings_revision !== request.expected_settings_revision) return reject(db, appUserId,
    request.operation_id, "SetRoutineEnabled", requestFingerprint, "The Routine settings revision is stale", true);
  if ((row.paused === 0) === request.enabled) return reject(db, appUserId, request.operation_id,
    "SetRoutineEnabled", requestFingerprint, "Routine already has the requested state");
  const plan = request.enabled
    ? await currentMaterializationPlan(db, appUserId, request.routine_definition_id, context, true)
    : null;
  const result: SetRoutineEnabledResult = { routine_definition_id: request.routine_definition_id,
    enabled: request.enabled, settings_revision: row.settings_revision + 1 };
  const pauseId = uuidv7();
  const assertionId = uuidv7();
  try {
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
        SELECT ?, ?, 'SetRoutineEnabled' WHERE EXISTS (SELECT 1 FROM routine_board_items
          WHERE app_user_id = ? AND routine_definition_id = ? AND settings_revision = ?)`)
        .bind(appUserId, request.operation_id, appUserId, request.routine_definition_id,
          request.expected_settings_revision),
      request.enabled
        ? db.prepare(`UPDATE routine_pause_intervals SET resumed_logical_date = ? WHERE app_user_id = ?
          AND routine_definition_id = ? AND resumed_logical_date IS NULL AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(context.logicalDate, appUserId, request.routine_definition_id, appUserId, request.operation_id)
        : db.prepare(`INSERT INTO routine_pause_intervals
          (id, app_user_id, routine_definition_id, paused_logical_date, resumed_logical_date, created_at)
          SELECT ?, ?, ?, ?, NULL, ? WHERE EXISTS (SELECT 1 FROM routine_board_items
            WHERE app_user_id = ? AND routine_definition_id = ? AND settings_revision = ?)
            AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(pauseId, appUserId, request.routine_definition_id, context.logicalDate, nowInstant,
            appUserId, request.routine_definition_id, request.expected_settings_revision,
            appUserId, request.operation_id),
      db.prepare(`UPDATE routine_board_items SET settings_revision = settings_revision + 1
        WHERE app_user_id = ? AND routine_definition_id = ? AND settings_revision = ? AND EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.routine_definition_id, request.expected_settings_revision,
          appUserId, request.operation_id),
    ];
    if (plan && context.dayId && context.placementRevision !== null) {
      statements.push(
        db.prepare(`INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id,
          origin_taskchute_day_id, created_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(plan.occurrenceId, appUserId, request.routine_definition_id, context.dayId, nowInstant,
            appUserId, request.operation_id),
        db.prepare(`INSERT INTO routine_occurrence_task_snapshots
          (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, plan.occurrenceId, plan.title, plan.projectId, plan.projectTitle,
            appUserId, request.operation_id),
        db.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
          lifecycle_state, estimate_seconds, created_at, planned_start_minute, routine_occurrence_id)
          SELECT ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(plan.entryId, appUserId, plan.taskId, context.dayId, plan.sectionId, plan.position,
            plan.estimate, nowInstant, plan.plannedStart, plan.occurrenceId, appUserId, request.operation_id),
        db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
          WHERE app_user_id = ? AND id = ? AND placement_revision = ? AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, context.dayId, context.placementRevision, appUserId, request.operation_id),
      );
    }
    statements.push(db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      VALUES (?, ?, CASE WHEN EXISTS (SELECT 1 FROM routine_board_items
        WHERE app_user_id = ? AND routine_definition_id = ? AND settings_revision = ?)
        AND (? = 0 OR (EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ?
          AND placement_revision = ?) AND EXISTS (SELECT 1 FROM routine_occurrences
          WHERE app_user_id = ? AND id = ? AND routine_definition_id = ?)
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ?
            AND routine_occurrence_id = ?))) THEN 1 ELSE 0 END)`)
      .bind(appUserId, assertionId, appUserId, request.routine_definition_id, result.settings_revision,
        plan ? 1 : 0, appUserId, context.dayId, (context.placementRevision ?? 0) + (plan ? 1 : 0),
        appUserId, plan?.occurrenceId ?? "", request.routine_definition_id,
        appUserId, plan?.entryId ?? "", plan?.occurrenceId ?? ""));
    statements.push(db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type,
      request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
      SELECT ?, ?, 'SetRoutineEnabled', ?, ?, 'success', ?, ? WHERE EXISTS (
        SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify(result), nowInstant, appUserId, assertionId));
    statements.push(db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, assertionId));
    statements.push(db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, request.operation_id));
    const results = await db.batch(statements);
    if (results[0]?.meta.changes === 0 || results[2]?.meta.changes === 0 || results.at(-3)?.meta.changes === 0) {
      throw new Error("concurrent Routine toggle");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "SetRoutineEnabled", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine toggle outcome is unknown; reload and retry", true);
  }
}

async function validateBoardDefaults(db: D1Database, appUserId: string, request: UpdateRoutineRequest): Promise<boolean> {
  if (request.project_id !== null) {
    const project = await db.prepare("SELECT id FROM projects WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, request.project_id).first();
    if (!project) return false;
  }
  if (request.default_section_id === null) return true;
  const section = await db.prepare(`SELECT COUNT(*) AS count FROM section_configuration_heads h
    JOIN section_configuration_items i ON i.app_user_id = h.app_user_id
      AND i.configuration_version_id = h.configuration_version_id
    WHERE h.app_user_id = ? AND i.section_id = ? AND i.logical_start_minute <= ?
      AND ? < i.logical_end_minute`).bind(appUserId, request.default_section_id,
      request.default_planned_start_minute, request.default_planned_start_minute).first<{ count: number }>();
  return section?.count === 1;
}

interface PlannedOccurrenceRow {
  occurrence_id: string;
  entry_id: string;
  taskchute_day_id: string;
  logical_date: string;
  placement_revision: number;
  section_id: string | null;
  planned_start_minute: number | null;
  position: number;
  section_plan_override_present: number;
  estimate_override_present: number;
  suppressed: number;
  origin_taskchute_day_id: string;
}

function scheduleEligible(schedule: RoutineScheduleInput, start: string, end: string | null, date: string): boolean {
  if (date < start || (end !== null && date > end)) return false;
  const startDay = Math.floor(Date.parse(`${start}T00:00:00Z`) / 86_400_000);
  const target = new Date(`${date}T00:00:00Z`);
  const targetDay = Math.floor(target.valueOf() / 86_400_000);
  if (schedule.kind === "daily") return true;
  if (schedule.kind === "every_n_days") return (targetDay - startDay) % schedule.interval_days === 0;
  return schedule.weekdays.includes(target.getUTCDay());
}

async function pausedOn(db: D1Database, appUserId: string, routineId: string, date: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS paused FROM routine_pause_intervals WHERE app_user_id = ?
    AND routine_definition_id = ? AND paused_logical_date <= ?
    AND (resumed_logical_date IS NULL OR ? < resumed_logical_date) LIMIT 1`)
    .bind(appUserId, routineId, date, date).first();
  return row !== null;
}

async function readPlannedOccurrences(db: D1Database, appUserId: string, routineId: string,
  currentDate: string): Promise<PlannedOccurrenceRow[]> {
  const rows = await db.prepare(`SELECT o.id AS occurrence_id, e.id AS entry_id, e.taskchute_day_id,
      o.origin_taskchute_day_id,
      d.logical_date, d.placement_revision, e.section_id, e.planned_start_minute, e.position,
      o.section_plan_override_present, o.estimate_override_present,
      CASE WHEN x.routine_occurrence_id IS NULL THEN 0 ELSE 1 END AS suppressed
    FROM routine_occurrences o JOIN entries e
      ON e.app_user_id = o.app_user_id AND e.routine_occurrence_id = o.id
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    LEFT JOIN routine_occurrence_suppressions x
      ON x.app_user_id = o.app_user_id AND x.routine_occurrence_id = o.id
    WHERE o.app_user_id = ? AND o.routine_definition_id = ? AND e.lifecycle_state = 'planned'
      AND d.logical_date >= ? ORDER BY d.logical_date, e.id`)
    .bind(appUserId, routineId, currentDate).all<PlannedOccurrenceRow>();
  return rows.results;
}

async function sectionPlansForUpdate(db: D1Database, appUserId: string, rows: PlannedOccurrenceRow[],
  request: UpdateRoutineRequest): Promise<Array<PlannedOccurrenceRow & { target_section_id: string | null;
    target_planned_start_minute: number | null; target_position: number }> | null> {
  const targets = rows.filter((row) => row.section_plan_override_present === 0);
  if (request.default_section_id !== null) {
    for (const row of targets) {
      const valid = await db.prepare(`SELECT COUNT(*) AS count FROM taskchute_day_section_contexts
        WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?
          AND logical_start_minute <= ? AND ? < logical_end_minute`)
        .bind(appUserId, row.taskchute_day_id, request.default_section_id,
          request.default_planned_start_minute, request.default_planned_start_minute).first<{ count: number }>();
      if (valid?.count !== 1) return null;
    }
  }
  const positions = await db.prepare(`SELECT taskchute_day_id, section_id, MAX(position) AS max_position
    FROM entries WHERE app_user_id = ? GROUP BY taskchute_day_id, section_id`)
    .bind(appUserId).all<{ taskchute_day_id: string; section_id: string | null; max_position: number }>();
  const next = new Map(positions.results.map((row) => [`${row.taskchute_day_id}:${row.section_id ?? ""}`, row.max_position + 1]));
  return targets.map((row) => {
    let position = row.position;
    if (row.section_id !== request.default_section_id) {
      const key = `${row.taskchute_day_id}:${request.default_section_id ?? ""}`;
      position = next.get(key) ?? 1;
      next.set(key, position + 1);
    }
    return { ...row, target_section_id: request.default_section_id,
      target_planned_start_minute: request.default_planned_start_minute, target_position: position };
  });
}

async function newCurrentPlanForUpdate(db: D1Database, appUserId: string, taskId: string,
  request: UpdateRoutineRequest, context: CurrentContext, occurrences: PlannedOccurrenceRow[]) {
  if (!context.dayId || context.placementRevision === null
    || occurrences.some((row) => row.taskchute_day_id === context.dayId)
    || !scheduleEligible(request.schedule, request.start_logical_date, request.end_logical_date, context.logicalDate)
    || await pausedOn(db, appUserId, request.routine_definition_id, context.logicalDate)) return null;
  if (request.default_section_id !== null) {
    const valid = await db.prepare(`SELECT COUNT(*) AS count FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?
        AND logical_start_minute <= ? AND ? < logical_end_minute`)
      .bind(appUserId, context.dayId, request.default_section_id,
        request.default_planned_start_minute, request.default_planned_start_minute).first<{ count: number }>();
    if (valid?.count !== 1) return null;
  }
  const task = await db.prepare(`SELECT t.title,
      (SELECT title FROM projects WHERE app_user_id = ? AND id = ?) AS project_title
    FROM tasks t WHERE t.app_user_id = ? AND t.id = ?`)
    .bind(appUserId, request.project_id, appUserId, taskId)
    .first<{ title: string; project_title: string | null }>();
  if (!task) return null;
  const position = await db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS value FROM entries
    WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?`)
    .bind(appUserId, context.dayId, request.default_section_id).first<number>("value");
  return { occurrenceId: uuidv7(), entryId: uuidv7(), taskId, title: request.title.trim(),
    projectId: request.project_id, projectTitle: request.project_id === null ? null : task.project_title,
    sectionId: request.default_section_id, plannedStart: request.default_planned_start_minute,
    estimate: request.default_estimate_seconds, position: position ?? 1 };
}

export async function updateRoutine(db: D1Database, appUserId: string, request: UpdateRoutineRequest,
  nowInstant = new Date().toISOString()): Promise<UpdateRoutineResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "UpdateRoutine", requestFingerprint);
  const context = await currentContext(db, appUserId, nowInstant);
  const item = await db.prepare(`SELECT r.task_id, b.settings_revision FROM routine_definitions r
    JOIN routine_board_items b ON b.app_user_id = r.app_user_id AND b.routine_definition_id = r.id
    WHERE r.app_user_id = ? AND r.id = ?`).bind(appUserId, request.routine_definition_id)
    .first<{ task_id: string; settings_revision: number }>();
  if (!item) return reject(db, appUserId, request.operation_id, "UpdateRoutine", requestFingerprint, "Routine is unavailable");
  if (item.settings_revision !== request.expected_settings_revision) return reject(db, appUserId,
    request.operation_id, "UpdateRoutine", requestFingerprint, "The Routine settings revision is stale", true);
  if (!await validateBoardDefaults(db, appUserId, request)) return reject(db, appUserId,
    request.operation_id, "UpdateRoutine", requestFingerprint, "Project or Section settings are unavailable");

  const schedule = scheduleColumns(request.schedule);
  const occurrences = await readPlannedOccurrences(db, appUserId, request.routine_definition_id, context.logicalDate);
  const desired = new Map<string, boolean>();
  for (const row of occurrences) {
    const moved = row.taskchute_day_id !== row.origin_taskchute_day_id;
    desired.set(row.occurrence_id, moved || scheduleEligible(request.schedule, request.start_logical_date,
      request.end_logical_date, row.logical_date));
  }
  const eligibleRows = occurrences.filter((row) => desired.get(row.occurrence_id));
  const sectionPlans = await sectionPlansForUpdate(db, appUserId, eligibleRows, request);
  if (!sectionPlans) return reject(db, appUserId, request.operation_id, "UpdateRoutine", requestFingerprint,
    "Routine placement is unavailable in an affected TaskChuteDay context");
  const suppress = occurrences.filter((row) => !desired.get(row.occurrence_id) && row.suppressed === 0)
    .map((row) => ({ occurrence_id: row.occurrence_id }));
  const unsuppress = occurrences.filter((row) => desired.get(row.occurrence_id) && row.suppressed === 1)
    .map((row) => row.occurrence_id);
  const currentPlan = await newCurrentPlanForUpdate(db, appUserId, item.task_id, request, context, occurrences);
  const changedDayRows = [...new Map([
    ...occurrences.filter((row) => (desired.get(row.occurrence_id) ? 0 : 1) !== row.suppressed),
    ...sectionPlans.filter((row) => row.section_id !== row.target_section_id
      || row.planned_start_minute !== row.target_planned_start_minute),
  ].map((row) => [row.taskchute_day_id, { taskchute_day_id: row.taskchute_day_id,
    placement_revision: row.placement_revision }])).values()];
  if (currentPlan && context.dayId && context.placementRevision !== null
    && !changedDayRows.some((row) => row.taskchute_day_id === context.dayId)) {
    changedDayRows.push({ taskchute_day_id: context.dayId, placement_revision: context.placementRevision });
  }
  const plansJson = JSON.stringify(sectionPlans);
  const occurrencesJson = JSON.stringify(occurrences);
  const suppressJson = JSON.stringify(suppress);
  const unsuppressJson = JSON.stringify(unsuppress);
  const changedDaysJson = JSON.stringify(changedDayRows);
  const result: UpdateRoutineResult = { routine_definition_id: request.routine_definition_id,
    settings_revision: item.settings_revision + 1 };
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
        SELECT ?, ?, 'UpdateRoutine' WHERE EXISTS (SELECT 1 FROM routine_board_items
          WHERE app_user_id = ? AND routine_definition_id = ? AND settings_revision = ?)
        AND NOT EXISTS (SELECT 1 FROM json_each(?) j
          LEFT JOIN routine_occurrences o ON o.app_user_id = ?
            AND o.id = json_extract(j.value, '$.occurrence_id')
          LEFT JOIN entries e ON e.app_user_id = o.app_user_id AND e.routine_occurrence_id = o.id
          LEFT JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
          WHERE o.id IS NULL OR e.id IS NULL OR d.id IS NULL OR e.lifecycle_state <> 'planned'
            OR d.placement_revision <> CAST(json_extract(j.value, '$.placement_revision') AS INTEGER)
            OR o.section_plan_override_present <>
              CAST(json_extract(j.value, '$.section_plan_override_present') AS INTEGER)
            OR o.estimate_override_present <> CAST(json_extract(j.value, '$.estimate_override_present') AS INTEGER)
            OR (EXISTS (SELECT 1 FROM routine_occurrence_suppressions x
              WHERE x.app_user_id = o.app_user_id AND x.routine_occurrence_id = o.id)) <>
              CAST(json_extract(j.value, '$.suppressed') AS INTEGER))`)
        .bind(appUserId, request.operation_id, appUserId, request.routine_definition_id,
          request.expected_settings_revision, occurrencesJson, appUserId),
      db.prepare(`UPDATE tasks SET title = ?, project_id = ? WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM routine_board_items WHERE app_user_id = ? AND routine_definition_id = ?
          AND settings_revision = ?) AND EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.title.trim(), request.project_id, appUserId, item.task_id, appUserId,
          request.routine_definition_id, request.expected_settings_revision, appUserId, request.operation_id),
      db.prepare(`UPDATE routine_definitions SET start_logical_date = ?, end_logical_date = ?,
        default_section_id = ?, default_planned_start_minute = ?, default_estimate_seconds = ?,
        defaults_revision = defaults_revision + 1 WHERE app_user_id = ? AND id = ? AND EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.start_logical_date, request.end_logical_date, request.default_section_id,
          request.default_planned_start_minute, request.default_estimate_seconds, appUserId,
          request.routine_definition_id, appUserId, request.operation_id),
      db.prepare(`UPDATE routine_schedules SET schedule_kind = ?, interval_days = ?, weekdays_mask = ?
        WHERE app_user_id = ? AND routine_definition_id = ? AND EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(schedule.kind, schedule.interval, schedule.mask, appUserId, request.routine_definition_id,
          appUserId, request.operation_id),
      db.prepare(`UPDATE routine_board_items SET settings_revision = settings_revision + 1
        WHERE app_user_id = ? AND routine_definition_id = ? AND settings_revision = ? AND EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.routine_definition_id, request.expected_settings_revision,
          appUserId, request.operation_id),
      db.prepare(`UPDATE routine_occurrence_task_snapshots SET task_title = ?, project_id = ?,
        project_title = (SELECT title FROM projects WHERE app_user_id = ? AND id = ?)
        WHERE app_user_id = ? AND routine_occurrence_id IN (
          SELECT o.id FROM routine_occurrences o JOIN taskchute_days d
            ON d.app_user_id = o.app_user_id AND d.id = o.origin_taskchute_day_id
          JOIN entries e ON e.app_user_id = o.app_user_id AND e.routine_occurrence_id = o.id
          WHERE o.app_user_id = ? AND o.routine_definition_id = ? AND d.logical_date >= ?
            AND e.lifecycle_state = 'planned') AND EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.title.trim(), request.project_id, appUserId, request.project_id, appUserId,
          appUserId, request.routine_definition_id, context.logicalDate, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET estimate_seconds = ?
        WHERE app_user_id = ? AND lifecycle_state = 'planned' AND routine_occurrence_id IN (
          SELECT o.id FROM routine_occurrences o JOIN taskchute_days d
            ON d.app_user_id = o.app_user_id AND d.id = o.origin_taskchute_day_id
          WHERE o.app_user_id = ? AND o.routine_definition_id = ? AND d.logical_date >= ?
            AND o.estimate_override_present = 0)
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.default_estimate_seconds, appUserId, appUserId,
          request.routine_definition_id, context.logicalDate,
          appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET
        section_id = (SELECT json_extract(j.value, '$.target_section_id') FROM json_each(?) j
          WHERE json_extract(j.value, '$.entry_id') = entries.id),
        planned_start_minute = (SELECT json_extract(j.value, '$.target_planned_start_minute') FROM json_each(?) j
          WHERE json_extract(j.value, '$.entry_id') = entries.id),
        position = CAST((SELECT json_extract(j.value, '$.target_position') FROM json_each(?) j
          WHERE json_extract(j.value, '$.entry_id') = entries.id) AS INTEGER)
        WHERE app_user_id = ? AND lifecycle_state = 'planned'
          AND id IN (SELECT json_extract(value, '$.entry_id') FROM json_each(?))
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(plansJson, plansJson, plansJson, appUserId, plansJson, appUserId, request.operation_id),
      db.prepare(`INSERT INTO routine_occurrence_suppressions
        (app_user_id, routine_occurrence_id, suppressed_at, reason)
        SELECT ?, json_extract(value, '$.occurrence_id'), ?, 'schedule' FROM json_each(?)
        WHERE EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)
        ON CONFLICT (app_user_id, routine_occurrence_id) DO UPDATE SET suppressed_at = excluded.suppressed_at,
          reason = excluded.reason`)
        .bind(appUserId, nowInstant, suppressJson, appUserId, request.operation_id),
      db.prepare(`DELETE FROM routine_occurrence_suppressions WHERE app_user_id = ?
        AND routine_occurrence_id IN (SELECT value FROM json_each(?))
        AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, unsuppressJson, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.taskchute_day_id') FROM json_each(?))
          AND placement_revision = CAST((SELECT json_extract(j.value, '$.placement_revision') FROM json_each(?) j
            WHERE json_extract(j.value, '$.taskchute_day_id') = taskchute_days.id) AS INTEGER)
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, changedDaysJson, changedDaysJson, appUserId, request.operation_id),
      ...(currentPlan && context.dayId ? [
        db.prepare(`INSERT INTO routine_occurrences
          (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM routine_command_guards
            WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(currentPlan.occurrenceId, appUserId, request.routine_definition_id, context.dayId,
            nowInstant, appUserId, request.operation_id),
        db.prepare(`INSERT INTO routine_occurrence_task_snapshots
          (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM routine_command_guards
            WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, currentPlan.occurrenceId, currentPlan.title, currentPlan.projectId,
            currentPlan.projectTitle, appUserId, request.operation_id),
        db.prepare(`INSERT INTO entries
          (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
           estimate_seconds, created_at, planned_start_minute, routine_occurrence_id)
          SELECT ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(currentPlan.entryId, appUserId, currentPlan.taskId, context.dayId,
            currentPlan.sectionId, currentPlan.position, currentPlan.estimate, nowInstant,
            currentPlan.plannedStart, currentPlan.occurrenceId, appUserId, request.operation_id),
      ] : []),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        VALUES (?, ?, CASE WHEN EXISTS (SELECT 1 FROM routine_board_items
          WHERE app_user_id = ? AND routine_definition_id = ? AND settings_revision = ?)
          AND (SELECT COUNT(*) FROM taskchute_days d JOIN json_each(?) j
            ON d.id = json_extract(j.value, '$.taskchute_day_id')
            WHERE d.app_user_id = ? AND d.placement_revision =
              CAST(json_extract(j.value, '$.placement_revision') AS INTEGER) + 1)
            = json_array_length(?)
          AND (? = 0 OR (EXISTS (SELECT 1 FROM routine_occurrences
            WHERE app_user_id = ? AND id = ? AND routine_definition_id = ?)
            AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ?
              AND routine_occurrence_id = ?))) THEN 1 ELSE 0 END)`)
        .bind(appUserId, request.operation_id, appUserId, request.routine_definition_id,
          result.settings_revision, changedDaysJson, appUserId, changedDaysJson, currentPlan ? 1 : 0,
          appUserId, currentPlan?.occurrenceId ?? "", request.routine_definition_id,
          appUserId, currentPlan?.entryId ?? "", currentPlan?.occurrenceId ?? ""),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type,
        request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'UpdateRoutine', ?, ?, 'success', ?, ? WHERE EXISTS (
          SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, request.operation_id),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.operation_id),
      db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (results[0]?.meta.changes === 0 || results[4]?.meta.changes === 0 || results.at(-3)?.meta.changes === 0) {
      throw new Error("concurrent Routine update");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "UpdateRoutine", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine update outcome is unknown; reload and retry", true);
  }
}

export async function reorderRoutines(db: D1Database, appUserId: string, request: ReorderRoutinesRequest,
  nowInstant = new Date().toISOString()): Promise<ReorderRoutinesResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "ReorderRoutines", requestFingerprint);
  const head = await db.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
    .bind(appUserId).first<{ board_revision: number }>();
  const actual = await db.prepare("SELECT routine_definition_id FROM routine_board_items WHERE app_user_id = ? ORDER BY board_position")
    .bind(appUserId).all<{ routine_definition_id: string }>();
  if (!head || head.board_revision !== request.expected_board_revision) return reject(db, appUserId,
    request.operation_id, "ReorderRoutines", requestFingerprint, "The Routine board revision is stale", true);
  if (actual.results.length !== request.routine_definition_ids.length
    || new Set(actual.results.map((row) => row.routine_definition_id)).size !== request.routine_definition_ids.length
    || request.routine_definition_ids.some((id) => !actual.results.some((row) => row.routine_definition_id === id))) {
    return reject(db, appUserId, request.operation_id, "ReorderRoutines", requestFingerprint,
      "Routine order must contain every visible Routine exactly once");
  }
  const result: ReorderRoutinesResult = { routine_definition_ids: request.routine_definition_ids,
    board_revision: request.expected_board_revision + 1 };
  const orderJson = JSON.stringify(request.routine_definition_ids);
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
        SELECT ?, ?, 'ReorderRoutines' WHERE EXISTS (SELECT 1 FROM routine_board_heads
          WHERE app_user_id = ? AND board_revision = ?)`)
        .bind(appUserId, request.operation_id, appUserId, request.expected_board_revision),
      db.prepare(`UPDATE routine_board_items SET board_position = board_position + 1000000
        WHERE app_user_id = ? AND EXISTS (SELECT 1 FROM routine_command_guards
          WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, appUserId, request.operation_id),
      db.prepare(`UPDATE routine_board_items SET board_position = (
        SELECT CAST(j.key AS INTEGER) + 1 FROM json_each(?) j
        WHERE j.value = routine_board_items.routine_definition_id)
        WHERE app_user_id = ? AND EXISTS (SELECT 1 FROM routine_command_guards
          WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(orderJson, appUserId, appUserId, request.operation_id),
      db.prepare(`UPDATE routine_board_heads SET board_revision = board_revision + 1
        WHERE app_user_id = ? AND board_revision = ? AND EXISTS (SELECT 1 FROM routine_command_guards
          WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.expected_board_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type,
        request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'ReorderRoutines', ?, ?, 'success', ?, ? WHERE EXISTS (
          SELECT 1 FROM routine_board_heads WHERE app_user_id = ? AND board_revision = ?)
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, result.board_revision, appUserId, request.operation_id),
      db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (results[0]?.meta.changes === 0 || results[3]?.meta.changes === 0 || results[4]?.meta.changes === 0) {
      throw new Error("concurrent Routine reorder");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "ReorderRoutines", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine reorder outcome is unknown; reload and retry", true);
  }
}
