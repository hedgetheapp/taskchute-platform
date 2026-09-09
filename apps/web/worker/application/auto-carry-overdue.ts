import type {
  AutoCarryOverduePlannedSettingProjection,
  SetAutoCarryOverduePlannedRequest,
  SetAutoCarryOverduePlannedResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface SettingRow {
  auto_carry_overdue_planned: number;
  updated_at: string;
}

interface DayRow {
  id: string;
  logical_date: string;
  placement_revision: number;
}

interface ContextRow {
  section_id: string;
  logical_start_minute: number | null;
  logical_end_minute: number | null;
  actual_start_instant: string | null;
  actual_end_instant: string | null;
  context_order: number;
}

interface CandidateRow {
  entry_id: string;
  section_id: string;
  position: number;
  planned_start_minute: number;
  routine_occurrence_id: string | null;
  origin_taskchute_day_id: string | null;
}

interface TargetPlannedRow {
  entry_id: string;
  position: number;
  planned_start_minute: number | null;
}

interface CarryResult {
  taskchute_day_id: string;
  current_section_id: string;
  carried_entry_ids: string[];
  placement_revision: number;
}

export function isSetAutoCarryOverduePlannedRequest(value: unknown): value is SetAutoCarryOverduePlannedRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !("user_id" in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.enabled === "boolean"
    && typeof body.expected_updated_at === "string"
    && body.expected_updated_at.length > 0;
}

export async function loadAutoCarryOverduePlannedSetting(
  db: D1Database,
  appUserId: string,
): Promise<AutoCarryOverduePlannedSettingProjection> {
  const row = await db.prepare(`SELECT auto_carry_overdue_planned, updated_at
    FROM user_settings WHERE app_user_id = ?`).bind(appUserId).first<SettingRow>();
  if (!row) throw new HttpError(404, "resource_not_found", "User settings are unavailable");
  return { auto_carry_overdue_planned: row.auto_carry_overdue_planned === 1, updated_at: row.updated_at };
}

export async function setAutoCarryOverduePlanned(
  db: D1Database,
  appUserId: string,
  request: SetAutoCarryOverduePlannedRequest,
  nowInstant = new Date().toISOString(),
): Promise<SetAutoCarryOverduePlannedResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "SetAutoCarryOverduePlanned", requestFingerprint);
  const current = await db.prepare(`SELECT auto_carry_overdue_planned, updated_at
    FROM user_settings WHERE app_user_id = ?`).bind(appUserId).first<SettingRow>();
  if (!current) return persistRejection(db, {
    appUserId, operationId: request.operation_id, commandType: "SetAutoCarryOverduePlanned",
    requestFingerprint, outcomeKind: "domain_rejection",
    result: { code: "resource_not_found", message: "User settings are unavailable" },
  });
  if (current.updated_at !== request.expected_updated_at) return persistRejection(db, {
    appUserId, operationId: request.operation_id, commandType: "SetAutoCarryOverduePlanned",
    requestFingerprint, outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message: "The user settings revision is stale" },
  });
  const updatedAt = request.enabled === (current.auto_carry_overdue_planned === 1) ? current.updated_at : nowInstant;
  const result: SetAutoCarryOverduePlannedResult = {
    auto_carry_overdue_planned: request.enabled,
    updated_at: updatedAt,
  };
  try {
    const [update, operation] = await db.batch([
      db.prepare(`UPDATE user_settings SET auto_carry_overdue_planned = ?, updated_at = ?
        WHERE app_user_id = ? AND updated_at = ?`).bind(request.enabled ? 1 : 0, updatedAt,
        appUserId, request.expected_updated_at),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetAutoCarryOverduePlanned', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM user_settings WHERE app_user_id = ?
          AND auto_carry_overdue_planned = ? AND updated_at = ?)`).bind(
        appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify(result), nowInstant, appUserId, request.enabled ? 1 : 0, updatedAt),
    ]);
    if (update.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "SetAutoCarryOverduePlanned", requestFingerprint);
      return persistRejection(db, {
        appUserId, operationId: request.operation_id, commandType: "SetAutoCarryOverduePlanned",
        requestFingerprint, outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The user settings revision is stale" },
      });
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "SetAutoCarryOverduePlanned", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The setting outcome is unknown; reload and retry", true);
  }
}

function currentContext(contexts: ContextRow[], nowInstant: string): ContextRow | null {
  const now = Date.parse(nowInstant);
  if (!Number.isFinite(now)) throw new Error("Invalid current instant");
  const matches = contexts.filter((context) => {
    if (!context.actual_start_instant || !context.actual_end_instant) return false;
    const start = Date.parse(context.actual_start_instant);
    const end = Date.parse(context.actual_end_instant);
    return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
  });
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("Current Section context is not unique");
  return matches[0]!;
}

function plannedOrder(left: { planned_start_minute: number | null; position: number; entry_id: string },
  right: { planned_start_minute: number | null; position: number; entry_id: string }): number {
  const leftStart = left.planned_start_minute ?? Number.NEGATIVE_INFINITY;
  const rightStart = right.planned_start_minute ?? Number.NEGATIVE_INFINITY;
  return leftStart - rightStart || left.position - right.position || left.entry_id.localeCompare(right.entry_id);
}

async function carryOnce(
  db: D1Database,
  appUserId: string,
  day: DayRow,
  nowInstant: string,
  current: ContextRow,
  operationId: string,
  requestFingerprint: string,
): Promise<CarryResult | null> {
  const contexts = await db.prepare(`SELECT section_id, logical_start_minute, logical_end_minute,
      actual_start_instant, actual_end_instant, context_order
    FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ?
    ORDER BY context_order, section_id`).bind(appUserId, day.id).all<ContextRow>();
  const contextById = new Map(contexts.results.map((item) => [item.section_id, item]));
  const candidatesResult = await db.prepare(`SELECT e.id AS entry_id, e.section_id, e.position,
      e.planned_start_minute, e.routine_occurrence_id, ro.origin_taskchute_day_id
    FROM entries e
    LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.lifecycle_state = 'planned'
      AND e.section_id IS NOT NULL AND e.section_id <> ? AND e.planned_start_minute IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions s
        WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id)`)
    .bind(appUserId, day.id, current.section_id).all<CandidateRow>();
  const candidates = candidatesResult.results.filter((entry) => {
    const source = contextById.get(entry.section_id);
    return source !== undefined && source.context_order < current.context_order
      && source.actual_end_instant !== null;
  }).sort((left, right) => {
    const leftContext = contextById.get(left.section_id)!.context_order;
    const rightContext = contextById.get(right.section_id)!.context_order;
    return leftContext - rightContext || left.planned_start_minute - right.planned_start_minute
      || left.position - right.position || left.entry_id.localeCompare(right.entry_id);
  });
  if (candidates.some((entry) => entry.routine_occurrence_id !== null && entry.origin_taskchute_day_id !== day.id)) {
    throw new HttpError(409, "resource_conflict", "Routine occurrence origin Day is not the current TaskChuteDay");
  }
  if (candidates.length === 0) return null;
  const targetResult = await db.prepare(`SELECT id AS entry_id, position, planned_start_minute
    FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? AND lifecycle_state = 'planned'
    ORDER BY planned_start_minute IS NULL, planned_start_minute, position, id`)
    .bind(appUserId, day.id, current.section_id).all<TargetPlannedRow>();
  const targetPlanned = targetResult.results.sort(plannedOrder);
  const maxResult = await db.prepare(`SELECT COALESCE(MAX(position), 0) AS value FROM entries
    WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`).bind(appUserId, day.id, current.section_id)
    .first<{ value: number }>();
  const targetMax = maxResult?.value ?? 0;
  const slots = targetPlanned.map((entry) => entry.position).sort((left, right) => left - right);
  for (let index = 0; index < candidates.length; index += 1) slots.push(targetMax + index + 1);
  const desiredEntries = [
    ...targetPlanned.filter((entry) => entry.planned_start_minute === null)
      .map((entry) => ({ entry_id: entry.entry_id, planned_start_minute: entry.planned_start_minute })),
    ...candidates.map((entry) => ({ entry_id: entry.entry_id, planned_start_minute: current.logical_start_minute })),
    ...targetPlanned.filter((entry) => entry.planned_start_minute !== null)
      .map((entry) => ({ entry_id: entry.entry_id, planned_start_minute: entry.planned_start_minute })),
  ];
  const desired = desiredEntries.map((entry) => entry.entry_id);
  const finalPositions = new Map(desired.map((entryId, index) => [entryId, slots[index]!]));
  const assertionId = `auto-carry:${operationId}`;
  const tempBase = Math.max(targetMax, ...candidates.map((entry) => entry.position), ...targetPlanned.map((entry) => entry.position), 0)
    + targetPlanned.length + candidates.length + 1000;
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
      SELECT ?, ?, id, placement_revision FROM taskchute_days
      WHERE app_user_id = ? AND id = ? AND placement_revision = ?`)
      .bind(operationId, appUserId, appUserId, day.id, day.placement_revision),
  ];
  targetPlanned.forEach((entry, index) => statements.push(
    db.prepare(`UPDATE entries SET position = ? WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ?
      AND section_id = ? AND lifecycle_state = 'planned' AND position = ?
      AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
      .bind(tempBase + index, appUserId, entry.entry_id, day.id, current.section_id, entry.position, appUserId, operationId),
  ));
  candidates.forEach((entry) => statements.push(
    db.prepare(`UPDATE entries SET section_id = ?, planned_start_minute = ?, position = ?
      WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ? AND lifecycle_state = 'planned'
        AND section_id = ? AND planned_start_minute = ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
      .bind(current.section_id, current.logical_start_minute, [...finalPositions].find(([id]) => id === entry.entry_id)?.[1],
        appUserId, entry.entry_id, day.id, entry.section_id, entry.planned_start_minute, appUserId, operationId),
  ));
  targetPlanned.forEach((entry) => statements.push(
    db.prepare(`UPDATE entries SET position = ? WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ?
      AND section_id = ? AND lifecycle_state = 'planned' AND position >= ?
      AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
      .bind([...finalPositions].find(([id]) => id === entry.entry_id)?.[1], appUserId, entry.entry_id, day.id,
        current.section_id, tempBase, appUserId, operationId),
  ));
  candidates.filter((entry) => entry.routine_occurrence_id !== null).forEach((entry) => statements.push(
    db.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 1,
        section_override_id = ?, planned_start_override_minute = ?
      WHERE app_user_id = ? AND id = ? AND origin_taskchute_day_id = ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
      .bind(current.section_id, current.logical_start_minute, appUserId, entry.routine_occurrence_id, day.id,
        appUserId, operationId),
  ));
  const expectedRevision = day.placement_revision + 1;
  statements.push(
    db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
      WHERE app_user_id = ? AND id = ? AND placement_revision = ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
      .bind(appUserId, day.id, day.placement_revision, appUserId, operationId),
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN
        (SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?) = ?
        AND NOT EXISTS (SELECT 1 FROM json_each(?) item WHERE NOT EXISTS (
          SELECT 1 FROM entries e WHERE e.app_user_id = ? AND e.id = json_extract(item.value, '$.entry_id')
            AND e.taskchute_day_id = ? AND e.section_id = ? AND e.lifecycle_state = 'planned'
            AND e.planned_start_minute IS json_extract(item.value, '$.planned_start_minute')
            AND e.position = CAST(json_extract(item.value, '$.position') AS INTEGER)))
        THEN 1 ELSE 0 END WHERE EXISTS (
          SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
      .bind(appUserId, assertionId, appUserId, day.id, expectedRevision,
        JSON.stringify(desiredEntries.map((entry) => ({ entry_id: entry.entry_id,
          planned_start_minute: entry.planned_start_minute, position: finalPositions.get(entry.entry_id) }))),
        appUserId, day.id, current.section_id, appUserId, operationId),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'AutoCarryOverduePlanned', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, operationId, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ taskchute_day_id: day.id, current_section_id: current.section_id,
          carried_entry_ids: candidates.map((entry) => entry.entry_id), placement_revision: expectedRevision }),
        nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
    db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, operationId),
  );
  try {
    const results = await db.batch(statements);
    const guard = results[0];
    const assertion = results[statements.length - 4];
    const operation = results[statements.length - 3];
    if (guard?.meta.changes === 0 || assertion?.meta.changes === 0 || operation?.meta.changes === 0) {
      return null;
    }
    return { taskchute_day_id: day.id, current_section_id: current.section_id,
      carried_entry_ids: candidates.map((entry) => entry.entry_id), placement_revision: expectedRevision };
  } catch {
    const committed = await readOperation(db, appUserId, operationId);
    if (committed) return replayOperation<CarryResult>(committed, "AutoCarryOverduePlanned",
      requestFingerprint);
    return null;
  }
}

export async function autoCarryCurrentDay(
  db: D1Database,
  appUserId: string,
  day: DayRow,
  nowInstant: string,
): Promise<CarryResult | null> {
  const setting = await db.prepare(`SELECT auto_carry_overdue_planned, updated_at FROM user_settings
    WHERE app_user_id = ?`).bind(appUserId).first<SettingRow>();
  if (!setting || setting.auto_carry_overdue_planned !== 1) return null;
  const contexts = await db.prepare(`SELECT section_id, logical_start_minute, logical_end_minute,
      actual_start_instant, actual_end_instant, context_order
    FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ?
    ORDER BY context_order, section_id`).bind(appUserId, day.id).all<ContextRow>();
  const current = currentContext(contexts.results, nowInstant);
  if (!current || current.logical_start_minute === null || current.logical_end_minute === null) return null;
  const operationId = `auto-carry:${appUserId}:${day.id}:${current.section_id}:${setting.updated_at}`;
  const requestFingerprint = await fingerprint({ day_id: day.id, current_section_id: current.section_id,
    setting_version: setting.updated_at });
  const prior = await readOperation(db, appUserId, operationId);
  if (prior) return replayOperation<CarryResult>(prior, "AutoCarryOverduePlanned", requestFingerprint);
  let latestDay = day;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await carryOnce(db, appUserId, latestDay, nowInstant, current, operationId, requestFingerprint);
    if (result) return result;
    const committed = await readOperation(db, appUserId, operationId);
    if (committed) return replayOperation<CarryResult>(committed, "AutoCarryOverduePlanned", requestFingerprint);
    const refreshed = await db.prepare(`SELECT id, logical_date, placement_revision FROM taskchute_days
      WHERE app_user_id = ? AND id = ?`).bind(appUserId, day.id).first<DayRow>();
    if (!refreshed) return null;
    latestDay = refreshed;
  }
  return null;
}
