import type {
  DeleteEffectiveDayOverrideRequest,
  DeleteEffectiveDayOverrideResult,
  EffectiveDayCalendarProjection,
  EffectiveDayOverrideProjection,
  UpsertEffectiveDayOverrideRequest,
  UpsertEffectiveDayOverrideResult,
} from "../../src/shared/contracts";
import { classifyEffectiveDay, effectiveDayCoverage, type EffectiveDayOverrideValue } from "../../src/shared/effective-day-calendar";
import { createRoutineCalendarContext, type RoutineCalendarContext } from "../../src/shared/routine-recurrence";
import { isUuidV7 } from "../domain/uuidv7";
import { isLogicalDate } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";
import {
  buildCalendarReconciliationPlan,
  readRoutineCalendarOverrides,
  type CalendarReconciliationPlan,
} from "./routine-calendar-reconciliation";

interface OverrideRow {
  logical_date: string;
  override_kind: "workday" | "holiday";
  reason: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface EffectiveDayOverrideMutationHooks {
  /** Internal deterministic race-test seam; not part of the HTTP/API contract. */
  beforeMutation?: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).every((key) => expected.has(key)) && keys.every((key) => key in value || key === "reason");
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isReason(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.trim().length <= 500);
}

export function isUpsertEffectiveDayOverrideRequest(value: unknown): value is UpsertEffectiveDayOverrideRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "logical_date", "override_kind", "reason", "expected_revision"])) return false;
  return !("user_id" in value)
    && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.logical_date === "string" && isLogicalDate(value.logical_date)
    && (value.override_kind === "workday" || value.override_kind === "holiday")
    && isReason(value.reason)
    && (value.expected_revision === null || isRevision(value.expected_revision));
}

export function isDeleteEffectiveDayOverrideRequest(value: unknown): value is DeleteEffectiveDayOverrideRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "logical_date", "expected_revision"])) return false;
  return !("user_id" in value)
    && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.logical_date === "string" && isLogicalDate(value.logical_date)
    && (value.expected_revision === null || isRevision(value.expected_revision));
}

function normalizeReason(reason: string | null | undefined): string | null {
  const normalized = reason?.trim() ?? "";
  return normalized === "" ? null : normalized;
}

function projection(row: OverrideRow): EffectiveDayOverrideProjection {
  return {
    logical_date: row.logical_date,
    override_kind: row.override_kind,
    reason: row.reason,
    revision: row.revision,
    updated_at: row.updated_at,
  };
}

function classify(logicalDate: string, row: OverrideRow | null) {
  const override: EffectiveDayOverrideValue | null = row ? projection(row) : null;
  return classifyEffectiveDay({ logicalDate, override });
}

function calendarSnapshotGuard(
  db: D1Database,
  appUserId: string,
  assertionId: string,
  current: OverrideRow | null,
  logicalDate: string,
  overridesJson: string,
  plan: CalendarReconciliationPlan,
  fromDate: string,
): D1PreparedStatement {
  const expectedOverride = current
    ? `EXISTS (SELECT 1 FROM effective_day_overrides WHERE app_user_id = ? AND logical_date = ?
        AND override_kind = ? AND reason IS ? AND revision = ?)`
    : `NOT EXISTS (SELECT 1 FROM effective_day_overrides WHERE app_user_id = ? AND logical_date = ?)`;
  const capturedRowMismatch = `NOT EXISTS (SELECT 1 FROM json_each(?) j
    LEFT JOIN routine_occurrences o ON o.app_user_id = ? AND o.id = json_extract(j.value, '$.occurrence_id')
    LEFT JOIN entries e ON e.app_user_id = o.app_user_id AND e.routine_occurrence_id = o.id
    LEFT JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    LEFT JOIN routine_definitions r ON r.app_user_id = o.app_user_id AND r.id = o.routine_definition_id
    LEFT JOIN routine_schedules s ON s.app_user_id = r.app_user_id AND s.routine_definition_id = r.id
    LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
    LEFT JOIN routine_occurrence_suppressions x ON x.app_user_id = o.app_user_id AND x.routine_occurrence_id = o.id
    WHERE o.id IS NULL OR e.id IS NULL OR d.id IS NULL OR r.id IS NULL OR s.schedule_kind IS NULL
      OR o.routine_definition_id IS NOT json_extract(j.value, '$.routine_definition_id')
      OR e.id IS NOT json_extract(j.value, '$.entry_id')
      OR e.taskchute_day_id IS NOT json_extract(j.value, '$.taskchute_day_id')
      OR d.logical_date IS NOT json_extract(j.value, '$.logical_date')
      OR o.origin_taskchute_day_id IS NOT json_extract(j.value, '$.origin_taskchute_day_id')
      OR e.lifecycle_state IS NOT json_extract(j.value, '$.lifecycle_state')
      OR d.placement_revision IS NOT CAST(json_extract(j.value, '$.placement_revision') AS INTEGER)
      OR e.section_id IS NOT json_extract(j.value, '$.section_id')
      OR e.planned_start_minute IS NOT json_extract(j.value, '$.planned_start_minute')
      OR e.position IS NOT CAST(json_extract(j.value, '$.position') AS INTEGER)
      OR o.section_plan_override_present IS NOT CAST(json_extract(j.value, '$.section_plan_override_present') AS INTEGER)
      OR o.estimate_override_present IS NOT CAST(json_extract(j.value, '$.estimate_override_present') AS INTEGER)
      OR em.mode_id IS NOT json_extract(j.value, '$.mode_id')
      OR (x.routine_occurrence_id IS NOT NULL) IS NOT (CAST(json_extract(j.value, '$.suppressed') AS INTEGER) = 1)
      OR x.reason IS NOT json_extract(j.value, '$.suppression_reason')
      OR s.schedule_kind IS NOT json_extract(j.value, '$.schedule_kind')
      OR r.start_logical_date IS NOT json_extract(j.value, '$.start_logical_date')
      OR r.end_logical_date IS NOT json_extract(j.value, '$.end_logical_date'))`;
  const extraRow = `NOT EXISTS (SELECT 1
    FROM routine_occurrences o
    JOIN routine_definitions r ON r.app_user_id = o.app_user_id AND r.id = o.routine_definition_id
    JOIN routine_schedules s ON s.app_user_id = r.app_user_id AND s.routine_definition_id = r.id
    JOIN entries e ON e.app_user_id = o.app_user_id AND e.routine_occurrence_id = o.id
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    WHERE o.app_user_id = ? AND e.lifecycle_state = 'planned' AND d.logical_date >= ?
      AND s.schedule_kind IN ('workday', 'holiday', 'official_holiday', 'monthly_last_workday')
      AND NOT EXISTS (SELECT 1 FROM json_each(?) j
        WHERE json_extract(j.value, '$.occurrence_id') = o.id
          AND json_extract(j.value, '$.entry_id') = e.id))`;
  const binds: unknown[] = [appUserId, assertionId];
  if (current) binds.push(appUserId, current.logical_date, current.override_kind, current.reason, current.revision);
  else binds.push(appUserId, logicalDate);
  binds.push(
    appUserId, overridesJson, overridesJson, appUserId,
    plan.rows.length > 0 ? JSON.stringify(plan.rows) : "[]", appUserId,
    appUserId, fromDate, plan.rows.length > 0 ? JSON.stringify(plan.rows) : "[]",
  );
  return db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
    SELECT ?, ?, CASE WHEN ${expectedOverride}
      AND NOT EXISTS (SELECT 1 FROM effective_day_overrides existing WHERE existing.app_user_id = ?
        AND NOT EXISTS (SELECT 1 FROM json_each(?) j
          WHERE json_extract(j.value, '$.logical_date') = existing.logical_date
            AND json_extract(j.value, '$.override_kind') = existing.override_kind
            AND json_extract(j.value, '$.reason') IS existing.reason
            AND CAST(json_extract(j.value, '$.revision') AS INTEGER) = existing.revision))
      AND NOT EXISTS (SELECT 1 FROM json_each(?) j
        WHERE NOT EXISTS (SELECT 1 FROM effective_day_overrides existing
          WHERE existing.app_user_id = ? AND existing.logical_date = json_extract(j.value, '$.logical_date')
            AND existing.override_kind = json_extract(j.value, '$.override_kind')
            AND existing.reason IS json_extract(j.value, '$.reason')
            AND existing.revision = CAST(json_extract(j.value, '$.revision') AS INTEGER)))
      AND ${capturedRowMismatch}
      AND ${extraRow}
      THEN 1 ELSE 0 END`).bind(...binds);
}

function calendarReconciliationStatements(
  db: D1Database,
  appUserId: string,
  assertionId: string,
  plan: CalendarReconciliationPlan,
  nowInstant: string,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  const guard = `EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`;
  if (plan.suppressIds.length > 0) {
    statements.push(db.prepare(`INSERT INTO routine_occurrence_suppressions
      (app_user_id, routine_occurrence_id, suppressed_at, reason)
      SELECT ?, value, ?, 'schedule' FROM json_each(?) WHERE ${guard}
      ON CONFLICT (app_user_id, routine_occurrence_id) DO UPDATE SET suppressed_at = excluded.suppressed_at, reason = excluded.reason`)
      .bind(appUserId, nowInstant, JSON.stringify(plan.suppressIds), appUserId, assertionId));
  }
  if (plan.unsuppressIds.length > 0) {
    statements.push(db.prepare(`DELETE FROM routine_occurrence_suppressions
      WHERE app_user_id = ? AND routine_occurrence_id IN (SELECT value FROM json_each(?)) AND ${guard}`)
      .bind(appUserId, JSON.stringify(plan.unsuppressIds), appUserId, assertionId));
  }
  if (plan.changedDays.length > 0) {
    statements.push(db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
      WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.taskchute_day_id') FROM json_each(?))
        AND placement_revision = CAST((SELECT json_extract(j.value, '$.placement_revision') FROM json_each(?) j
          WHERE json_extract(j.value, '$.taskchute_day_id') = taskchute_days.id) AS INTEGER)
        AND ${guard}`)
      .bind(appUserId, JSON.stringify(plan.changedDays), JSON.stringify(plan.changedDays), appUserId, assertionId));
  }
  if (plan.materializations.length > 0) {
    const materializationsJson = JSON.stringify(plan.materializations);
    statements.push(db.prepare(`INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
      SELECT json_extract(value, '$.routine_occurrence_id'), ?, json_extract(value, '$.routine_definition_id'),
        json_extract(value, '$.taskchute_day_id'), ? FROM json_each(?) WHERE ${guard}`)
      .bind(appUserId, nowInstant, materializationsJson, appUserId, assertionId));
    statements.push(db.prepare(`INSERT INTO routine_occurrence_task_snapshots
      (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
      SELECT ?, json_extract(value, '$.routine_occurrence_id'), json_extract(value, '$.title'),
        json_extract(value, '$.project_id'), json_extract(value, '$.project_title')
      FROM json_each(?) WHERE ${guard}`)
      .bind(appUserId, materializationsJson, appUserId, assertionId));
    statements.push(db.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, created_at, planned_start_minute, routine_occurrence_id)
      SELECT json_extract(value, '$.entry_id'), ?, json_extract(value, '$.task_id'),
        json_extract(value, '$.taskchute_day_id'), json_extract(value, '$.section_id'),
        CAST(json_extract(value, '$.position') AS INTEGER), 'planned',
        json_extract(value, '$.estimate_seconds'), ?, json_extract(value, '$.planned_start_minute'),
        json_extract(value, '$.routine_occurrence_id') FROM json_each(?) WHERE ${guard}`)
      .bind(appUserId, nowInstant, materializationsJson, appUserId, assertionId));
    statements.push(db.prepare(`INSERT INTO entry_modes (app_user_id, entry_id, mode_id)
      SELECT ?, json_extract(value, '$.entry_id'), json_extract(value, '$.mode_id') FROM json_each(?)
      WHERE json_extract(value, '$.mode_id') IS NOT NULL AND ${guard}`)
      .bind(appUserId, materializationsJson, appUserId, assertionId));
  }
  return statements;
}

async function readOverride(db: D1Database, appUserId: string, logicalDate: string): Promise<OverrideRow | null> {
  return db.prepare(`SELECT logical_date, override_kind, reason, revision, created_at, updated_at
    FROM effective_day_overrides WHERE app_user_id = ? AND logical_date = ?`)
    .bind(appUserId, logicalDate).first<OverrideRow>();
}

/** Loads one owner-scoped override snapshot for all calendar-aware recurrence evaluation. */
export async function loadRoutineCalendarSnapshot(db: D1Database, appUserId: string): Promise<EffectiveDayOverrideValue[]> {
  const rows = await db.prepare(`SELECT logical_date, override_kind, reason, revision, updated_at
    FROM effective_day_overrides WHERE app_user_id = ? ORDER BY logical_date`).bind(appUserId).all<EffectiveDayOverrideValue>();
  return rows.results;
}

/** Loads one owner-scoped override snapshot for all calendar-aware recurrence evaluation. */
export async function loadRoutineCalendarContext(db: D1Database, appUserId: string): Promise<RoutineCalendarContext> {
  return createRoutineCalendarContext(await loadRoutineCalendarSnapshot(db, appUserId));
}

function sameOverrideRow(left: OverrideRow | null, right: OverrideRow | null): boolean {
  if (left === null || right === null) return left === right;
  return left.logical_date === right.logical_date
    && left.override_kind === right.override_kind
    && left.reason === right.reason
    && left.revision === right.revision
    && left.created_at === right.created_at
    && left.updated_at === right.updated_at;
}

async function resolveCasFailure<T>(db: D1Database, appUserId: string, operationId: string,
  commandType: "UpsertEffectiveDayOverride" | "DeleteEffectiveDayOverride", requestFingerprint: string,
  logicalDate: string, expectedCurrent: OverrideRow | null, conflictResult: object,
  expectedOverrides: readonly EffectiveDayOverrideValue[] = []): Promise<T> {
  const committed = await readOperation(db, appUserId, operationId);
  if (committed) return replayOperation<T>(committed, commandType, requestFingerprint);
  const latest = await readOverride(db, appUserId, logicalDate);
  const latestOverrides = await readRoutineCalendarOverrides(db, appUserId);
  const sameCalendarSnapshot = expectedOverrides.length === latestOverrides.length
    && expectedOverrides.every((expected, index) => {
      const actual = latestOverrides[index];
      return actual?.logical_date === expected.logical_date
        && actual.override_kind === expected.override_kind
        && actual.reason === expected.reason
        && actual.revision === expected.revision
        && actual.updated_at === expected.updated_at;
    });
  if (!sameOverrideRow(latest, expectedCurrent) || !sameCalendarSnapshot) {
    return persistRejection<T>(db, { appUserId, operationId, commandType, requestFingerprint,
      outcomeKind: "revision_conflict", result: conflictResult });
  }
  throw new HttpError(503, "infrastructure_ambiguous", "The override outcome is unknown; reload and retry", true);
}

export async function loadEffectiveDayCalendar(
  db: D1Database,
  appUserId: string,
  logicalDate: string,
): Promise<EffectiveDayCalendarProjection> {
  const [selected, rows] = await Promise.all([
    readOverride(db, appUserId, logicalDate),
    db.prepare(`SELECT logical_date, override_kind, reason, revision, created_at, updated_at
      FROM effective_day_overrides WHERE app_user_id = ? ORDER BY logical_date`).bind(appUserId).all<OverrideRow>(),
  ]);
  return {
    coverage: effectiveDayCoverage(),
    classification: classify(logicalDate, selected),
    overrides: rows.results.map(projection),
  };
}

export async function upsertEffectiveDayOverride(
  db: D1Database,
  appUserId: string,
  input: UpsertEffectiveDayOverrideRequest,
  nowInstant = new Date().toISOString(),
  hooks: EffectiveDayOverrideMutationHooks = {},
): Promise<UpsertEffectiveDayOverrideResult> {
  const request = { ...input, reason: normalizeReason(input.reason) };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "UpsertEffectiveDayOverride", requestFingerprint);
  const current = await readOverride(db, appUserId, request.logical_date);
  if (request.expected_revision === null && current) {
    return persistRejection(db, { appUserId, operationId: request.operation_id,
      commandType: "UpsertEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The day override already exists; reload before editing" } });
  }
  if (request.expected_revision !== null && (!current || current.revision !== request.expected_revision)) {
    return persistRejection(db, { appUserId, operationId: request.operation_id,
      commandType: "UpsertEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The day override revision is stale" } });
  }
  const nextRevision = current ? current.revision + 1 : 0;
  const nextRow: OverrideRow = {
    logical_date: request.logical_date,
    override_kind: request.override_kind,
    reason: request.reason ?? null,
    revision: nextRevision,
    created_at: current?.created_at ?? nowInstant,
    updated_at: nowInstant,
  };
  const isNoop = current !== null && current.override_kind === nextRow.override_kind && current.reason === nextRow.reason;
  const result: UpsertEffectiveDayOverrideResult = {
    classification: classify(request.logical_date, isNoop ? current : nextRow),
  };
  const beforeOverrides = await readRoutineCalendarOverrides(db, appUserId);
  const nextOverride: EffectiveDayOverrideValue = {
    logical_date: nextRow.logical_date, override_kind: nextRow.override_kind,
    reason: nextRow.reason, revision: nextRow.revision, updated_at: nextRow.updated_at,
  };
  const afterOverrides = isNoop
    ? beforeOverrides
    : [...beforeOverrides.filter((row) => row.logical_date !== request.logical_date), nextOverride]
      .sort((left, right) => left.logical_date.localeCompare(right.logical_date));
  const plan = await buildCalendarReconciliationPlan(db, appUserId, request.logical_date, nowInstant, afterOverrides);
  const overridesJson = JSON.stringify(beforeOverrides);
  const mutationAssertionId = `effective-day-override-mutation:${request.operation_id}`;
  const operationAssertionId = `effective-day-override-operation:${request.operation_id}`;
  await hooks.beforeMutation?.();
  try {
    const mutation = current
      ? isNoop
        ? db.prepare(`UPDATE effective_day_overrides SET revision = revision
            WHERE app_user_id = ? AND logical_date = ? AND revision = ?
              AND override_kind = ? AND reason IS ? AND EXISTS (
                SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
          .bind(appUserId, request.logical_date, current.revision, current.override_kind, current.reason,
            appUserId, mutationAssertionId)
        : db.prepare(`UPDATE effective_day_overrides SET override_kind = ?, reason = ?, revision = revision + 1, updated_at = ?
            WHERE app_user_id = ? AND logical_date = ? AND revision = ? AND EXISTS (
              SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
          .bind(nextRow.override_kind, nextRow.reason, nowInstant, appUserId, request.logical_date, current.revision,
            appUserId, mutationAssertionId)
      : db.prepare(`INSERT INTO effective_day_overrides
          (app_user_id, logical_date, override_kind, reason, revision, created_at, updated_at)
          SELECT ?, ?, ?, ?, 0, ?, ? WHERE EXISTS (
            SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
          .bind(appUserId, nextRow.logical_date, nextRow.override_kind, nextRow.reason, nowInstant, nowInstant,
            appUserId, mutationAssertionId);
    const reconciliation = calendarReconciliationStatements(db, appUserId, mutationAssertionId, plan, nowInstant);
    const statements: D1PreparedStatement[] = [
      calendarSnapshotGuard(db, appUserId, mutationAssertionId, current, request.logical_date,
        overridesJson, plan, plan.fromDate),
      mutation,
      ...reconciliation,
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'UpsertEffectiveDayOverride', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, mutationAssertionId),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`)
        .bind(appUserId, operationAssertionId),
      db.prepare(`DELETE FROM transaction_assertions WHERE app_user_id = ? AND id IN (?, ?)`)
        .bind(appUserId, mutationAssertionId, operationAssertionId),
    ];
    const results = await db.batch(statements);
    const operation = results[2 + reconciliation.length];
    if (operation?.meta.changes !== 1) {
      return persistRejection(db, { appUserId, operationId: request.operation_id,
        commandType: "UpsertEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The calendar or planned Routine state changed before it could be saved" } });
    }
    return result;
  } catch {
    return resolveCasFailure(db, appUserId, request.operation_id, "UpsertEffectiveDayOverride",
      requestFingerprint, request.logical_date, current,
      { code: "revision_conflict", message: "The day override changed before it could be saved" }, beforeOverrides);
  }
}

export async function deleteEffectiveDayOverride(
  db: D1Database,
  appUserId: string,
  input: DeleteEffectiveDayOverrideRequest,
  nowInstant = new Date().toISOString(),
  hooks: EffectiveDayOverrideMutationHooks = {},
): Promise<DeleteEffectiveDayOverrideResult> {
  const request = { ...input };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "DeleteEffectiveDayOverride", requestFingerprint);
  const current = await readOverride(db, appUserId, request.logical_date);
  if (!current) {
    if (request.expected_revision !== null) {
      return persistRejection(db, { appUserId, operationId: request.operation_id,
        commandType: "DeleteEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The day override revision is stale" } });
    }
    const mutationAssertionId = `effective-day-override-mutation:${request.operation_id}`;
    const operationAssertionId = `effective-day-override-operation:${request.operation_id}`;
    await hooks.beforeMutation?.();
    try {
      const [, operation, operationAssertion] = await db.batch([
        db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
          SELECT ?, ?, CASE WHEN NOT EXISTS (SELECT 1 FROM effective_day_overrides
            WHERE app_user_id = ? AND logical_date = ?) THEN 1 ELSE 0 END`)
          .bind(appUserId, mutationAssertionId, appUserId, request.logical_date),
        db.prepare(`INSERT INTO operations
          (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
           outcome_kind, result_json, created_at)
          SELECT ?, ?, 'DeleteEffectiveDayOverride', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
          .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
            JSON.stringify({ classification: classify(request.logical_date, null) }), nowInstant,
            appUserId, mutationAssertionId),
        db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
          SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`)
          .bind(appUserId, operationAssertionId),
        db.prepare(`DELETE FROM transaction_assertions WHERE app_user_id = ? AND id IN (?, ?)`)
          .bind(appUserId, mutationAssertionId, operationAssertionId),
      ]);
      if (operation?.meta.changes !== 1 || operationAssertion?.meta.changes !== 1) {
        return resolveCasFailure(db, appUserId, request.operation_id, "DeleteEffectiveDayOverride",
          requestFingerprint, request.logical_date, current,
          { code: "revision_conflict", message: "The day override changed before it could be deleted" });
      }
      return { classification: classify(request.logical_date, null) };
    } catch {
      return resolveCasFailure(db, appUserId, request.operation_id, "DeleteEffectiveDayOverride",
        requestFingerprint, request.logical_date, current,
        { code: "revision_conflict", message: "The day override changed before it could be deleted" });
    }
  }
  if (request.expected_revision !== current.revision) {
    return persistRejection(db, { appUserId, operationId: request.operation_id,
      commandType: "DeleteEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The day override revision is stale" } });
  }
  const result: DeleteEffectiveDayOverrideResult = { classification: classify(request.logical_date, null) };
  const beforeOverrides = await readRoutineCalendarOverrides(db, appUserId);
  const afterOverrides = beforeOverrides.filter((row) => row.logical_date !== request.logical_date);
  const plan = await buildCalendarReconciliationPlan(db, appUserId, request.logical_date, nowInstant, afterOverrides);
  const overridesJson = JSON.stringify(beforeOverrides);
  const mutationAssertionId = `effective-day-override-mutation:${request.operation_id}`;
  const operationAssertionId = `effective-day-override-operation:${request.operation_id}`;
  await hooks.beforeMutation?.();
  try {
    const mutation = db.prepare(`DELETE FROM effective_day_overrides
      WHERE app_user_id = ? AND logical_date = ? AND revision = ? AND EXISTS (
        SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, request.logical_date, current.revision, appUserId, mutationAssertionId);
    const reconciliation = calendarReconciliationStatements(db, appUserId, mutationAssertionId, plan, nowInstant);
    const statements: D1PreparedStatement[] = [
      calendarSnapshotGuard(db, appUserId, mutationAssertionId, current, request.logical_date,
        overridesJson, plan, plan.fromDate),
      mutation,
      ...reconciliation,
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'DeleteEffectiveDayOverride', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, mutationAssertionId),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`)
        .bind(appUserId, operationAssertionId),
      db.prepare(`DELETE FROM transaction_assertions WHERE app_user_id = ? AND id IN (?, ?)`)
        .bind(appUserId, mutationAssertionId, operationAssertionId),
    ];
    const results = await db.batch(statements);
    const operation = results[2 + reconciliation.length];
    if (operation?.meta.changes !== 1) {
      return persistRejection(db, { appUserId, operationId: request.operation_id,
        commandType: "DeleteEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The calendar or planned Routine state changed before it could be saved" } });
    }
    return result;
  } catch {
    return resolveCasFailure(db, appUserId, request.operation_id, "DeleteEffectiveDayOverride",
      requestFingerprint, request.logical_date, current,
      { code: "revision_conflict", message: "The day override changed before it could be deleted" }, beforeOverrides);
  }
}
