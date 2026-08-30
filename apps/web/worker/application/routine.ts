import type {
  ConvertEntryToRoutineRequest,
  ConvertEntryToRoutineResult,
  EndRoutineRequest,
  EndRoutineResult,
} from "../../src/shared/contracts";
import { isUuidV7, uuidv7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface RoutineEntryRow {
  task_id: string;
  taskchute_day_id: string;
  section_id: string | null;
  estimate_seconds: number | null;
  planned_start_minute: number | null;
  lifecycle_state: string;
  routine_occurrence_id: string | null;
}

interface RoutineDefinitionRow {
  id: string;
  task_id: string;
  default_section_id: string | null;
  default_estimate_seconds: number | null;
  default_planned_start_minute: number | null;
  materialization_order: number;
}

interface RoutineMaterializationPlan {
  routine_definition_id: string;
  routine_occurrence_id: string;
  entry_id: string;
  task_id: string;
  section_id: string | null;
  position: number;
  estimate_seconds: number | null;
  planned_start_minute: number | null;
}

interface CurrentRoutineDayRow {
  id: string;
  logical_date: string;
}

export interface RoutineMutationHooks {
  beforeMutation?: () => Promise<void>;
}

async function readCurrentRoutineDay(
  db: D1Database,
  appUserId: string,
  nowInstant: string,
): Promise<CurrentRoutineDayRow | null> {
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  if (!settings) return null;
  const resolved = resolveTaskChuteDay(nowInstant, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  });
  return db.prepare("SELECT id, logical_date FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?")
    .bind(appUserId, resolved.logicalDate).first<CurrentRoutineDayRow>();
}

function isLogicalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function isConvertEntryToRoutineRequest(value: unknown): value is ConvertEntryToRoutineRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.routine_definition_id === "string" && isUuidV7(body.routine_definition_id)
    && typeof body.routine_occurrence_id === "string" && isUuidV7(body.routine_occurrence_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && (body.end_logical_date === null || isLogicalDate(body.end_logical_date));
}

export function isEndRoutineRequest(value: unknown): value is EndRoutineRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.routine_definition_id === "string" && isUuidV7(body.routine_definition_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id);
}

async function rejectConversion(
  db: D1Database,
  appUserId: string,
  request: ConvertEntryToRoutineRequest,
  requestFingerprint: string,
  message: string,
): Promise<ConvertEntryToRoutineResult> {
  return persistRejection(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "ConvertEntryToRoutine",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code: "resource_conflict", message },
  });
}

export async function convertEntryToRoutine(
  db: D1Database,
  appUserId: string,
  request: ConvertEntryToRoutineRequest,
  nowInstant = new Date().toISOString(),
  hooks: RoutineMutationHooks = {},
): Promise<ConvertEntryToRoutineResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "ConvertEntryToRoutine", requestFingerprint);

  const currentDay = await readCurrentRoutineDay(db, appUserId, nowInstant);
  if (!currentDay || currentDay.id !== request.taskchute_day_id) {
    return rejectConversion(db, appUserId, request, requestFingerprint, "Only a current-Day Entry can become a Routine");
  }
  const [entry, definitionCollision, occurrenceCollision, orderRow] = await Promise.all([
    db.prepare(`SELECT task_id, taskchute_day_id, section_id, estimate_seconds, planned_start_minute,
      lifecycle_state, routine_occurrence_id FROM entries WHERE app_user_id = ? AND id = ?`)
      .bind(appUserId, request.entry_id).first<RoutineEntryRow>(),
    db.prepare("SELECT id FROM routine_definitions WHERE id = ?").bind(request.routine_definition_id).first(),
    db.prepare("SELECT id FROM routine_occurrences WHERE id = ?").bind(request.routine_occurrence_id).first(),
    db.prepare("SELECT COALESCE(MAX(materialization_order), 0) + 1 AS value FROM routine_definitions WHERE app_user_id = ?")
      .bind(appUserId).first<{ value: number }>(),
  ]);
  if (!entry || entry.taskchute_day_id !== currentDay.id) {
    return rejectConversion(db, appUserId, request, requestFingerprint, "Entry is unavailable on the current TaskChuteDay");
  }
  if (entry.lifecycle_state !== "planned" || entry.routine_occurrence_id !== null) {
    return rejectConversion(db, appUserId, request, requestFingerprint, "Only a planned non-Routine Entry can become a Routine");
  }
  if (request.end_logical_date !== null && request.end_logical_date < currentDay.logical_date) {
    return rejectConversion(db, appUserId, request, requestFingerprint, "Routine end date cannot precede its start date");
  }
  if (definitionCollision || occurrenceCollision || !orderRow) {
    return rejectConversion(db, appUserId, request, requestFingerprint, "Routine identity is already in use");
  }

  const assertionId = `routine-convert:${request.operation_id}`;
  await hooks.beforeMutation?.();
  try {
    const [guard, , , , assertion, operation] = await db.batch([
      db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
        SELECT ?, ?, 'ConvertEntryToRoutine' WHERE EXISTS (
          SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ?
            AND lifecycle_state = 'planned' AND routine_occurrence_id IS NULL)`)
        .bind(appUserId, request.operation_id, appUserId, request.entry_id, currentDay.id),
      db.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute,
         materialization_order, created_at)
         SELECT ?, ?, e.task_id, 'daily', ?, ?, e.section_id, e.estimate_seconds,
           e.planned_start_minute, ?, ? FROM entries e
         WHERE e.app_user_id = ? AND e.id = ? AND e.taskchute_day_id = ?
           AND e.lifecycle_state = 'planned' AND e.routine_occurrence_id IS NULL
           AND EXISTS (SELECT 1 FROM routine_command_guards
             WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.routine_definition_id, appUserId, currentDay.logical_date,
          request.end_logical_date, orderRow.value, nowInstant, appUserId, request.entry_id,
          currentDay.id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.routine_occurrence_id, appUserId, request.routine_definition_id, currentDay.id,
          nowInstant, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET routine_occurrence_id = ?
        WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ? AND lifecycle_state = 'planned'
          AND routine_occurrence_id IS NULL AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.routine_occurrence_id, appUserId, request.entry_id, currentDay.id,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM routine_definitions r JOIN entries e
            ON e.app_user_id = r.app_user_id AND e.id = ?
            WHERE r.app_user_id = ? AND r.id = ? AND r.task_id = e.task_id
              AND r.default_section_id IS e.section_id
              AND r.default_estimate_seconds IS e.estimate_seconds
              AND r.default_planned_start_minute IS e.planned_start_minute)
          AND EXISTS (SELECT 1 FROM routine_occurrences WHERE app_user_id = ? AND id = ?
            AND routine_definition_id = ? AND origin_taskchute_day_id = ?)
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ?
            AND routine_occurrence_id = ? AND task_id = ? AND taskchute_day_id = ?)
          THEN 1 ELSE 0 END WHERE EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, request.entry_id, appUserId, request.routine_definition_id,
          appUserId, request.routine_occurrence_id, request.routine_definition_id, currentDay.id,
          appUserId, request.entry_id, request.routine_occurrence_id, entry.task_id, currentDay.id,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'ConvertEntryToRoutine', ?, ?, 'success', json_object(
          'routine_definition_id', r.id, 'routine_occurrence_id', ?, 'entry_id', ?,
          'task_id', r.task_id, 'taskchute_day_id', ?, 'end_logical_date', r.end_logical_date), ?
        FROM routine_definitions r WHERE r.app_user_id = ? AND r.id = ? AND EXISTS (
          SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          request.routine_occurrence_id, request.entry_id, currentDay.id, nowInstant,
          appUserId, request.routine_definition_id, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0 || assertion?.meta.changes === 0 || operation?.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "ConvertEntryToRoutine", requestFingerprint);
      return rejectConversion(db, appUserId, request, requestFingerprint, "Entry changed before Routine conversion could commit");
    }
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (!committed) throw new Error("Routine conversion committed without an operation result");
    return replayOperation(committed, "ConvertEntryToRoutine", requestFingerprint);
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "ConvertEntryToRoutine", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine conversion outcome is unknown; reload canonical state and retry", true);
  }
}

async function rejectEnd(
  db: D1Database,
  appUserId: string,
  request: EndRoutineRequest,
  requestFingerprint: string,
  message: string,
): Promise<EndRoutineResult> {
  return persistRejection(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "EndRoutine",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code: "resource_conflict", message },
  });
}

export async function endRoutine(
  db: D1Database,
  appUserId: string,
  request: EndRoutineRequest,
  nowInstant = new Date().toISOString(),
): Promise<EndRoutineResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "EndRoutine", requestFingerprint);
  const currentDay = await readCurrentRoutineDay(db, appUserId, nowInstant);
  if (!currentDay || currentDay.id !== request.taskchute_day_id) {
    return rejectEnd(db, appUserId, request, requestFingerprint, "Routine can only be ended from the current TaskChuteDay");
  }
  const definition = await db.prepare(`SELECT end_logical_date FROM routine_definitions
    WHERE app_user_id = ? AND id = ?`).bind(appUserId, request.routine_definition_id)
    .first<{ end_logical_date: string | null }>();
  if (!definition) return rejectEnd(db, appUserId, request, requestFingerprint, "Routine is unavailable");
  if (definition.end_logical_date !== null && definition.end_logical_date <= currentDay.logical_date) {
    return rejectEnd(db, appUserId, request, requestFingerprint, "Routine is already ended");
  }
  const result: EndRoutineResult = {
    routine_definition_id: request.routine_definition_id,
    end_logical_date: currentDay.logical_date,
  };
  const assertionId = `routine-end:${request.operation_id}`;
  try {
    const [guard, , assertion, operation] = await db.batch([
      db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
        SELECT ?, ?, 'EndRoutine' WHERE EXISTS (SELECT 1 FROM routine_definitions
          WHERE app_user_id = ? AND id = ? AND (end_logical_date IS NULL OR end_logical_date > ?))`)
        .bind(appUserId, request.operation_id, appUserId, request.routine_definition_id, currentDay.logical_date),
      db.prepare(`UPDATE routine_definitions SET end_logical_date = ? WHERE app_user_id = ? AND id = ?
        AND (end_logical_date IS NULL OR end_logical_date > ?) AND EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(currentDay.logical_date, appUserId, request.routine_definition_id, currentDay.logical_date,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN EXISTS (SELECT 1 FROM routine_definitions
          WHERE app_user_id = ? AND id = ? AND end_logical_date = ?) THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.routine_definition_id, currentDay.logical_date,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'EndRoutine', ?, ?, 'success', ?, ? WHERE EXISTS (
          SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0 || assertion?.meta.changes === 0 || operation?.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "EndRoutine", requestFingerprint);
      return rejectEnd(db, appUserId, request, requestFingerprint, "Routine changed before end could commit");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "EndRoutine", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine end outcome is unknown; reload canonical state and retry", true);
  }
}

async function missingRoutineCount(db: D1Database, appUserId: string, dayId: string, logicalDate: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM routine_definitions r
    WHERE r.app_user_id = ? AND r.recurrence_type = 'daily' AND r.start_logical_date <= ?
      AND (r.end_logical_date IS NULL OR r.end_logical_date >= ?)
      AND NOT EXISTS (SELECT 1 FROM routine_occurrences o WHERE o.app_user_id = r.app_user_id
        AND o.routine_definition_id = r.id AND o.origin_taskchute_day_id = ?)`)
    .bind(appUserId, logicalDate, logicalDate, dayId).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function ensureCurrentDayRoutineEntries(
  db: D1Database,
  appUserId: string,
  day: { id: string; logical_date: string; establishment_boundary_minutes: number; placement_revision: number },
  nowInstant: string,
  retry = true,
  hooks: RoutineMutationHooks = {},
): Promise<void> {
  const definitions = await db.prepare(`SELECT r.id, r.task_id, r.default_section_id,
      r.default_estimate_seconds, r.default_planned_start_minute, r.materialization_order
    FROM routine_definitions r WHERE r.app_user_id = ? AND r.recurrence_type = 'daily'
      AND r.start_logical_date <= ? AND (r.end_logical_date IS NULL OR r.end_logical_date >= ?)
      AND NOT EXISTS (SELECT 1 FROM routine_occurrences o WHERE o.app_user_id = r.app_user_id
        AND o.routine_definition_id = r.id AND o.origin_taskchute_day_id = ?)
    ORDER BY r.materialization_order`).bind(appUserId, day.logical_date, day.logical_date, day.id)
    .all<RoutineDefinitionRow>();
  if (definitions.results.length === 0) return;

  const [contexts, positions] = await db.batch([
    db.prepare(`SELECT section_id, logical_start_minute, logical_end_minute FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`).bind(appUserId, day.id),
    db.prepare(`SELECT section_id, MAX(position) AS max_position FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? GROUP BY section_id`).bind(appUserId, day.id),
  ]);
  const contextRows = contexts.results as Array<{ section_id: string; logical_start_minute: number | null; logical_end_minute: number | null }>;
  const nextPosition = new Map<string, number>();
  for (const row of positions.results as Array<{ section_id: string | null; max_position: number }>) {
    nextPosition.set(row.section_id ?? "", row.max_position + 1);
  }
  const plans: RoutineMaterializationPlan[] = definitions.results.map((definition) => {
    let sectionId: string | null = null;
    if (definition.default_planned_start_minute !== null) {
      const boundary = day.establishment_boundary_minutes;
      const matches = contextRows.filter((context) => context.logical_start_minute !== null
        && context.logical_end_minute !== null
        && context.logical_start_minute <= definition.default_planned_start_minute!
        && definition.default_planned_start_minute! < context.logical_end_minute);
      if (definition.default_planned_start_minute < boundary
        || definition.default_planned_start_minute >= boundary + 1440 || matches.length !== 1) {
        throw new Error("Routine default planned start is invalid for the established TaskChuteDay context");
      }
      sectionId = matches[0]!.section_id;
    } else if (definition.default_section_id !== null
      && contextRows.some((context) => context.section_id === definition.default_section_id)) {
      sectionId = definition.default_section_id;
    }
    const key = sectionId ?? "";
    const position = nextPosition.get(key) ?? 1;
    nextPosition.set(key, position + 1);
    return {
      routine_definition_id: definition.id,
      routine_occurrence_id: uuidv7(),
      entry_id: uuidv7(),
      task_id: definition.task_id,
      section_id: sectionId,
      position,
      estimate_seconds: definition.default_estimate_seconds,
      planned_start_minute: definition.default_planned_start_minute,
    };
  });
  const plansJson = JSON.stringify(plans);
  const guardId = uuidv7();
  const assertionId = `routine-materialize:${guardId}`;
  await hooks.beforeMutation?.();
  try {
    const [guard, , , revision, assertion] = await db.batch([
      db.prepare(`INSERT INTO routine_materialization_guards
        (app_user_id, taskchute_day_id, guard_id, expected_revision)
        SELECT ?, id, ?, ? FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?
          AND json_array_length(?) > 0
          AND NOT EXISTS (SELECT 1 FROM json_each(?) j
            LEFT JOIN routine_definitions r ON r.app_user_id = ?
              AND r.id = json_extract(j.value, '$.routine_definition_id')
            WHERE r.id IS NULL OR r.recurrence_type <> 'daily' OR r.start_logical_date > ?
              OR (r.end_logical_date IS NOT NULL AND r.end_logical_date < ?)
              OR EXISTS (SELECT 1 FROM routine_occurrences o WHERE o.app_user_id = r.app_user_id
                AND o.routine_definition_id = r.id AND o.origin_taskchute_day_id = ?))`)
        .bind(appUserId, guardId, day.placement_revision, appUserId, day.id, day.placement_revision,
          plansJson, plansJson, appUserId, day.logical_date, day.logical_date, day.id),
      db.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
        SELECT json_extract(value, '$.routine_occurrence_id'), ?, json_extract(value, '$.routine_definition_id'), ?, ?
        FROM json_each(?) WHERE EXISTS (SELECT 1 FROM routine_materialization_guards
          WHERE app_user_id = ? AND taskchute_day_id = ? AND guard_id = ?)`)
        .bind(appUserId, day.id, nowInstant, plansJson, appUserId, day.id, guardId),
      db.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, created_at, planned_start_minute, routine_occurrence_id)
        SELECT json_extract(value, '$.entry_id'), ?, json_extract(value, '$.task_id'), ?,
          json_extract(value, '$.section_id'), CAST(json_extract(value, '$.position') AS INTEGER), 'planned',
          json_extract(value, '$.estimate_seconds'), ?, json_extract(value, '$.planned_start_minute'),
          json_extract(value, '$.routine_occurrence_id') FROM json_each(?)
        WHERE EXISTS (SELECT 1 FROM routine_materialization_guards
          WHERE app_user_id = ? AND taskchute_day_id = ? AND guard_id = ?)`)
        .bind(appUserId, day.id, nowInstant, plansJson, appUserId, day.id, guardId),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ? AND EXISTS (
          SELECT 1 FROM routine_materialization_guards WHERE app_user_id = ? AND taskchute_day_id = ? AND guard_id = ?)`)
        .bind(appUserId, day.id, day.placement_revision, appUserId, day.id, guardId),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          (SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?) = ?
          AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (
            SELECT 1 FROM routine_occurrences o JOIN entries e
              ON e.app_user_id = o.app_user_id AND e.routine_occurrence_id = o.id
            WHERE o.app_user_id = ? AND o.id = json_extract(j.value, '$.routine_occurrence_id')
              AND o.routine_definition_id = json_extract(j.value, '$.routine_definition_id')
              AND o.origin_taskchute_day_id = ? AND e.id = json_extract(j.value, '$.entry_id')
              AND e.taskchute_day_id = ?)) THEN 1 ELSE 0 END WHERE EXISTS (
            SELECT 1 FROM routine_materialization_guards WHERE app_user_id = ? AND taskchute_day_id = ? AND guard_id = ?)`)
        .bind(appUserId, assertionId, appUserId, day.id, day.placement_revision + 1, plansJson,
          appUserId, day.id, day.id, appUserId, day.id, guardId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare(`DELETE FROM routine_materialization_guards
        WHERE app_user_id = ? AND taskchute_day_id = ? AND guard_id = ?`).bind(appUserId, day.id, guardId),
    ]);
    if (guard.meta.changes > 0 && revision?.meta.changes > 0 && assertion?.meta.changes > 0) return;
  } catch {
    // A concurrent load or placement mutation may have won. Re-read before deciding whether retry is needed.
  }
  const missing = await missingRoutineCount(db, appUserId, day.id, day.logical_date);
  if (missing === 0) return;
  if (retry) {
    const latest = await db.prepare(`SELECT id, logical_date, establishment_boundary_minutes, placement_revision
      FROM taskchute_days WHERE app_user_id = ? AND id = ?`).bind(appUserId, day.id)
      .first<{ id: string; logical_date: string; establishment_boundary_minutes: number; placement_revision: number }>();
    if (latest) return ensureCurrentDayRoutineEntries(db, appUserId, latest, nowInstant, false);
  }
  throw new Error("Routine materialization did not converge");
}
