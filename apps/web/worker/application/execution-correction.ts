import { Temporal } from "@js-temporal/polyfill";
import type {
  ExecutionCorrectionLifecycleState,
  RevertEntryStartRequest,
  RevertEntryStartResult,
  SetExecutionTimesRequest,
  SetExecutionTimesResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { readDaySectionContexts } from "./load-current-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

type InstantField = "started_at" | "ended_at" | "expected_started_at" | "expected_ended_at";

interface EntryRow {
  entry_id: string;
  continuation_chain_id: string | null;
  continuation_parent_entry_id: string | null;
  taskchute_day_id: string;
  logical_date: string;
  lifecycle_state: ExecutionCorrectionLifecycleState;
  section_id: string | null;
  planned_start_minute: number | null;
  position: number;
  placement_revision: number;
  start_instant: string;
  end_instant: string;
  establishment_timezone: string;
}

interface ExecutionRow {
  id: string;
  entry_id: string;
  started_at: string;
  ended_at: string | null;
  terminal_outcome: "completed" | "interrupted" | null;
}

interface CurrentDayContext {
  timezone: string;
  boundaryMinutes: number;
  logicalDate: string;
  startInstant: string;
  endInstant: string;
}

interface MinuteBlocker {
  id: string;
  entry_id: string;
  started_at: string;
  ended_at: string;
}

interface DisplayedMinuteWindow {
  start: string;
  end: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalInstant(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isLifecycleState(value: unknown): value is ExecutionCorrectionLifecycleState {
  return value === "planned" || value === "running" || value === "completed";
}

export function isRevertEntryStartRequest(value: unknown): value is RevertEntryStartRequest {
  if (!isRecord(value) || "user_id" in value) return false;
  const legacyRunningRollback = !("expected_lifecycle_state" in value) && !("expected_ended_at" in value);
  const completedDirectRollback = value.expected_lifecycle_state === "completed"
    && typeof value.expected_ended_at === "string";
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.entry_id === "string" && isUuidV7(value.entry_id)
    && typeof value.execution_id === "string" && isUuidV7(value.execution_id)
    && typeof value.expected_started_at === "string"
    && (legacyRunningRollback || completedDirectRollback);
}

export function isSetExecutionTimesRequest(value: unknown): value is SetExecutionTimesRequest {
  if (!isRecord(value) || "user_id" in value) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.entry_id === "string" && isUuidV7(value.entry_id)
    && typeof value.execution_id === "string" && isUuidV7(value.execution_id)
    && isLifecycleState(value.expected_lifecycle_state)
    && typeof value.started_at === "string"
    && isOptionalInstant(value.ended_at)
    && isOptionalInstant(value.expected_started_at)
    && isOptionalInstant(value.expected_ended_at)
    && (!("expected_placement_revision" in value)
      || (Number.isInteger(value.expected_placement_revision) && Number(value.expected_placement_revision) >= 0))
    && (!("input_precision" in value) || value.input_precision === "minute");
}

function canonicalInstant(value: string, field: InstantField): string {
  try {
    return Temporal.Instant.from(value).toString({ smallestUnit: "millisecond" });
  } catch {
    throw new HttpError(400, "malformed_request", `Invalid ${field}`);
  }
}

function canonicalOptionalInstant(value: string | null, field: InstantField): string | null {
  return value === null ? null : canonicalInstant(value, field);
}

function compareInstants(left: string, right: string): number {
  return Temporal.Instant.compare(Temporal.Instant.from(left), Temporal.Instant.from(right));
}

function sameInstant(left: string, right: string): boolean {
  return compareInstants(canonicalInstant(left, "expected_started_at"), canonicalInstant(right, "expected_started_at")) === 0;
}

function normalizedTimesRequest(request: SetExecutionTimesRequest): SetExecutionTimesRequest {
  return {
    ...request,
    started_at: canonicalInstant(request.started_at, "started_at"),
    ended_at: canonicalOptionalInstant(request.ended_at, "ended_at"),
    expected_started_at: canonicalOptionalInstant(request.expected_started_at, "expected_started_at"),
    expected_ended_at: canonicalOptionalInstant(request.expected_ended_at, "expected_ended_at"),
  };
}

async function reject<T>(
  db: D1Database,
  appUserId: string,
  request: { operation_id: string },
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
  commandType: "SetExecutionTimes" | "RevertEntryStart" = "SetExecutionTimes",
): Promise<T> {
  return persistRejection<T>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType,
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

async function readEntry(db: D1Database, appUserId: string, entryId: string): Promise<EntryRow | null> {
  return db.prepare(`SELECT e.id AS entry_id, e.continuation_chain_id, e.continuation_parent_entry_id,
      e.taskchute_day_id, d.logical_date, e.lifecycle_state, e.section_id,
      e.planned_start_minute, e.position, d.placement_revision, d.start_instant, d.end_instant,
      d.establishment_timezone
    FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, entryId).first<EntryRow>();
}

function displayedMinuteWindow(startedAt: string, timezone: string): DisplayedMinuteWindow | null {
  try {
    const local = Temporal.Instant.from(startedAt).toZonedDateTimeISO(timezone);
    if (local.second !== 0 || local.millisecond !== 0 || local.microsecond !== 0 || local.nanosecond !== 0) return null;
    const minuteStart = local.with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
    return {
      start: minuteStart.toInstant().toString({ smallestUnit: "millisecond" }),
      end: minuteStart.add({ minutes: 1 }).toInstant().toString({ smallestUnit: "millisecond" }),
    };
  } catch {
    return null;
  }
}

async function findMinuteBlocker(
  db: D1Database,
  appUserId: string,
  entry: EntryRow,
  request: SetExecutionTimesRequest,
  window: DisplayedMinuteWindow,
): Promise<MinuteBlocker | null> {
  const rows = await db.prepare(`SELECT x.id, x.entry_id, x.started_at, x.ended_at
      FROM executions x JOIN entries blocker_entry
        ON blocker_entry.app_user_id = x.app_user_id AND blocker_entry.id = x.entry_id
     WHERE x.app_user_id = ? AND blocker_entry.taskchute_day_id = ? AND x.id <> ? AND x.ended_at IS NOT NULL`)
    .bind(appUserId, entry.taskchute_day_id, request.execution_id).all<MinuteBlocker>();
  let selected: MinuteBlocker | null = null;
  for (const row of rows.results) {
    if (compareInstants(row.started_at, window.start) <= 0
      && compareInstants(row.ended_at, window.start) > 0
      && compareInstants(row.ended_at, window.end) < 0
      && (!selected || compareInstants(row.ended_at, selected.ended_at) > 0)) {
      selected = row;
    }
  }
  return selected;
}

function blockerGuard(
  blocker: MinuteBlocker | null,
  appUserId: string,
  dayId: string,
): { sql: string; bindings: unknown[] } {
  if (!blocker) return { sql: "", bindings: [] };
  return {
    sql: `AND EXISTS (SELECT 1 FROM executions blocker
        JOIN entries blocker_entry ON blocker_entry.app_user_id = blocker.app_user_id AND blocker_entry.id = blocker.entry_id
       WHERE blocker.app_user_id = ? AND blocker.id = ? AND blocker.entry_id = ?
         AND blocker.started_at = ? AND blocker.ended_at = ?
         AND blocker_entry.taskchute_day_id = ?)`,
    bindings: [appUserId, blocker.id, blocker.entry_id, blocker.started_at, blocker.ended_at, dayId],
  };
}

async function readExecution(db: D1Database, appUserId: string, executionId: string): Promise<ExecutionRow | null> {
  return db.prepare("SELECT id, entry_id, started_at, ended_at, terminal_outcome FROM executions WHERE app_user_id = ? AND id = ?")
    .bind(appUserId, executionId).first<ExecutionRow>();
}

async function readCurrentDayContext(
  db: D1Database,
  appUserId: string,
  nowInstant: string,
): Promise<CurrentDayContext | null> {
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  if (!settings) return null;
  try {
    const resolved = resolveTaskChuteDay(nowInstant, {
      timezone: settings.timezone,
      boundaryMinutes: settings.day_boundary_minutes,
    });
    return {
      timezone: settings.timezone,
      boundaryMinutes: settings.day_boundary_minutes,
      logicalDate: resolved.logicalDate,
      startInstant: resolved.startInstant,
      endInstant: resolved.endInstant,
    };
  } catch {
    return null;
  }
}

function entryIsInCurrentDay(entry: EntryRow, currentDay: CurrentDayContext): boolean {
  return entry.logical_date === currentDay.logicalDate
    && compareInstants(entry.start_instant, currentDay.startInstant) === 0
    && compareInstants(entry.end_instant, currentDay.endInstant) === 0;
}

function currentDayGuardSql(alias: string, currentDay: CurrentDayContext): { sql: string; bindings: unknown[] } {
  return {
    sql: `AND ${alias}.logical_date = ?
      AND julianday(${alias}.start_instant) = julianday(?)
      AND julianday(${alias}.end_instant) = julianday(?)
      AND EXISTS (SELECT 1 FROM user_settings current_settings
        WHERE current_settings.app_user_id = ${alias}.app_user_id
          AND current_settings.timezone = ? AND current_settings.day_boundary_minutes = ?)`,
    bindings: [currentDay.logicalDate, currentDay.startInstant, currentDay.endInstant,
      currentDay.timezone, currentDay.boundaryMinutes],
  };
}

function normalizedRevertRequest(request: RevertEntryStartRequest): RevertEntryStartRequest {
  return {
    ...request,
    expected_started_at: canonicalInstant(request.expected_started_at, "expected_started_at"),
    ...(request.expected_ended_at === undefined
      ? {}
      : { expected_ended_at: canonicalInstant(request.expected_ended_at, "expected_ended_at") }),
  };
}

export async function revertEntryStart(
  db: D1Database,
  appUserId: string,
  input: RevertEntryStartRequest,
  nowInstant = new Date().toISOString(),
): Promise<RevertEntryStartResult> {
  const request = normalizedRevertRequest(input);
  const completedDirectRollback = request.expected_lifecycle_state === "completed";
  const expectedLifecycle = completedDirectRollback ? "completed" : "running";
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<RevertEntryStartResult>(prior, "RevertEntryStart", requestFingerprint);

  const [entry, execution, currentDay] = await Promise.all([
    readEntry(db, appUserId, request.entry_id),
    readExecution(db, appUserId, request.execution_id),
    readCurrentDayContext(db, appUserId, nowInstant),
  ]);
  const converged = await readOperation(db, appUserId, request.operation_id);
  if (converged) return replayOperation<RevertEntryStartResult>(converged, "RevertEntryStart", requestFingerprint);
  if (!entry || !execution) return reject<RevertEntryStartResult>(db, appUserId, request, requestFingerprint,
    "resource_not_found", "Entry or active Execution is unavailable", "RevertEntryStart");
  if (!currentDay || !entryIsInCurrentDay(entry, currentDay)) {
    return reject<RevertEntryStartResult>(db, appUserId, request, requestFingerprint,
      "resource_conflict", "RevertEntryStart is limited to the current established Day", "RevertEntryStart");
  }
  const expectedExecutionMatches = execution.entry_id === request.entry_id
    && sameInstant(execution.started_at, request.expected_started_at)
    && (completedDirectRollback
      ? execution.ended_at !== null
        && execution.terminal_outcome === "completed"
        && request.expected_ended_at !== undefined
        && sameInstant(execution.ended_at, request.expected_ended_at)
      : execution.ended_at === null && execution.terminal_outcome === null);
  if (!expectedExecutionMatches || entry.lifecycle_state !== expectedLifecycle) {
    return reject<RevertEntryStartResult>(db, appUserId, request, requestFingerprint,
      "resource_conflict", "The current Execution can no longer be reverted", "RevertEntryStart");
  }
  if (completedDirectRollback) {
    const executionCount = await db.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(appUserId, request.entry_id).first<number>("count");
    const chainCount = entry.continuation_chain_id === null ? 0 : await db.prepare(
      "SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND continuation_chain_id = ?",
    ).bind(appUserId, entry.continuation_chain_id).first<number>("count");
    if (executionCount !== 1 || entry.continuation_chain_id !== entry.entry_id
      || entry.continuation_parent_entry_id !== null || chainCount !== 1) {
      return reject<RevertEntryStartResult>(db, appUserId, request, requestFingerprint,
        "resource_conflict", "Only an isolated single-segment completed Execution can be reverted", "RevertEntryStart");
    }
  }

  const result: RevertEntryStartResult = {
    entry_id: request.entry_id,
    lifecycle_state: "planned",
    execution_id: request.execution_id,
    section_id: entry.section_id,
    planned_start_minute: entry.planned_start_minute,
    position: entry.position,
    placement_revision: entry.placement_revision,
  };
  const assertionId = `revert-start:${request.operation_id}`;
  const currentGuard = currentDayGuardSql("d", currentDay);
  const lifecycleExecutionGuard = completedDirectRollback
    ? `e.lifecycle_state = 'completed'
       AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed'
       AND julianday(x.ended_at) = julianday(?)
       AND (SELECT COUNT(*) FROM executions all_x
         WHERE all_x.app_user_id = e.app_user_id AND all_x.entry_id = e.id) = 1
       AND e.continuation_chain_id = e.id AND e.continuation_parent_entry_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM entries chain_entry
         WHERE chain_entry.app_user_id = e.app_user_id
           AND chain_entry.continuation_chain_id = e.continuation_chain_id
           AND chain_entry.id <> e.id)`
    : `e.lifecycle_state = 'running'
       AND x.ended_at IS NULL AND x.terminal_outcome IS NULL`;
  const lifecycleExecutionBindings = completedDirectRollback ? [request.expected_ended_at] : [];
  const deleteExecutionGuard = completedDirectRollback
    ? `AND julianday(ended_at) = julianday(?) AND terminal_outcome = 'completed'`
    : `AND ended_at IS NULL AND terminal_outcome IS NULL`;
  const deleteExecutionBindings = completedDirectRollback ? [request.expected_ended_at] : [];
  try {
    const [guard] = await db.batch([
      db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, e.id, x.id, 'RevertEntryStart'
          FROM entries e
          JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
          JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
         WHERE e.app_user_id = ? AND e.id = ?
           AND ${lifecycleExecutionGuard}
           AND x.id = ?
           AND julianday(x.started_at) = julianday(?)
           ${currentGuard.sql}`)
        .bind(appUserId, request.operation_id, appUserId, request.entry_id, ...lifecycleExecutionBindings,
          request.execution_id, request.expected_started_at, ...currentGuard.bindings),
      db.prepare(`DELETE FROM executions WHERE app_user_id = ? AND id = ?
        AND entry_id = ? AND julianday(started_at) = julianday(?) ${deleteExecutionGuard}
        AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.execution_id, request.entry_id, request.expected_started_at,
          ...deleteExecutionBindings, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET lifecycle_state = 'planned'
        WHERE app_user_id = ? AND id = ? AND lifecycle_state = ?
          AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, expectedLifecycle, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM entries e JOIN taskchute_days d
            ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = 'planned'
              AND e.section_id IS ? AND e.planned_start_minute IS ? AND e.position = ?
              AND d.placement_revision = ?)
          AND NOT EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ?)
        THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.entry_id, entry.section_id, entry.planned_start_minute,
          entry.position, entry.placement_revision, appUserId, request.execution_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
          request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'RevertEntryStart', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, request.operation_id),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<RevertEntryStartResult>(committed, "RevertEntryStart", requestFingerprint);
      return reject<RevertEntryStartResult>(db, appUserId, request, requestFingerprint,
        "resource_conflict", "Only the current active Start can be reverted", "RevertEntryStart");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<RevertEntryStartResult>(committed, "RevertEntryStart", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}

function overlapsSql(alias: string): string {
  return `NOT EXISTS (
      SELECT 1 FROM executions other
       WHERE other.app_user_id = ${alias}.app_user_id
         AND other.id <> ?
         AND (? IS NULL OR julianday(other.started_at) < julianday(?))
         AND (other.ended_at IS NULL OR julianday(other.ended_at) > julianday(?))
    )`;
}

async function findActualSectionTarget(
  db: D1Database,
  appUserId: string,
  dayId: string,
  startedAt: string,
): Promise<{ sectionId: string; position: number } | null> {
  const contexts = await readDaySectionContexts(db, appUserId, dayId);
  const matches = contexts.filter((context) => context.actual_start_instant !== null
    && context.actual_end_instant !== null
    && compareInstants(context.actual_start_instant, startedAt) <= 0
    && compareInstants(startedAt, context.actual_end_instant) < 0);
  if (matches.length !== 1 || !matches[0]) return null;
  const position = await db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS position
    FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
    .bind(appUserId, dayId, matches[0].section_id).first<{ position: number }>();
  if (!position) throw new Error("Actual Section target position did not converge");
  return { sectionId: matches[0].section_id, position: position.position };
}

function validateActualWindow(request: SetExecutionTimesRequest, entry: EntryRow, now: string): string | null {
  if (request.ended_at !== null && compareInstants(request.started_at, request.ended_at) > 0) {
    return "Actual start must not be after actual end";
  }
  if (compareInstants(request.started_at, now) > 0
    || (request.ended_at !== null && compareInstants(request.ended_at, now) > 0)) {
    return "Actual time cannot be in the future";
  }
  if (compareInstants(request.started_at, entry.start_instant) < 0
    || compareInstants(request.started_at, entry.end_instant) >= 0) {
    return "Actual start must be inside the owning established Day";
  }
  return null;
}

export async function setExecutionTimes(
  db: D1Database,
  appUserId: string,
  input: SetExecutionTimesRequest,
  nowInstant = new Date().toISOString(),
): Promise<SetExecutionTimesResult> {
  const request = normalizedTimesRequest(input);
  const now = canonicalInstant(nowInstant, "started_at");
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<SetExecutionTimesResult>(prior, "SetExecutionTimes", requestFingerprint);

  const entry = await readEntry(db, appUserId, request.entry_id);
  const execution = await readExecution(db, appUserId, request.execution_id);
  const converged = await readOperation(db, appUserId, request.operation_id);
  if (converged) return replayOperation<SetExecutionTimesResult>(converged, "SetExecutionTimes", requestFingerprint);
  if (!entry) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Entry is unavailable");

  if (request.expected_lifecycle_state !== entry.lifecycle_state) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Entry lifecycle state changed");
  }
  const reopeningCompleted = request.expected_lifecycle_state === "completed" && request.ended_at === null;
  let currentDay: CurrentDayContext | null = null;
  if (reopeningCompleted) {
    if (request.expected_started_at === null || !sameInstant(request.started_at, request.expected_started_at)) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "Reopening a completed Execution must preserve its original start");
    }
    currentDay = await readCurrentDayContext(db, appUserId, now);
    if (!currentDay || !entryIsInCurrentDay(entry, currentDay)) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "A completed Execution can only be reopened on the current established Day");
    }
  }
  if (request.expected_lifecycle_state === "planned") {
    if (execution || request.expected_started_at !== null || request.expected_ended_at !== null) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "A planned Entry must create a new Execution");
    }
  } else {
    if (!execution || execution.entry_id !== request.entry_id
      || (execution.ended_at === null && request.expected_lifecycle_state === "completed")
      || (execution.ended_at !== null && request.expected_lifecycle_state === "running")) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Execution is no longer editable in this lifecycle state");
    }
    if (reopeningCompleted && execution.terminal_outcome === "interrupted") {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "An interrupted Execution cannot be reopened as completed work");
    }
    if (request.expected_started_at === null || !sameInstant(execution.started_at, request.expected_started_at)
      || (request.expected_ended_at === null
        ? execution.ended_at !== null
        : execution.ended_at === null || !sameInstant(execution.ended_at, request.expected_ended_at))) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Execution changed before correction");
    }
  }
  let minuteBlocker: MinuteBlocker | null = null;
  let effectiveStartedAt = request.started_at;
  if (request.input_precision === "minute") {
    const minuteWindow = displayedMinuteWindow(request.started_at, entry.establishment_timezone);
    if (!minuteWindow) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "Minute precision requires a start at the beginning of the displayed minute");
    }
    minuteBlocker = await findMinuteBlocker(db, appUserId, entry, request, minuteWindow);
    if (minuteBlocker) effectiveStartedAt = minuteBlocker.ended_at;
  }
  const effectiveRequest = effectiveStartedAt === request.started_at
    ? request
    : { ...request, started_at: effectiveStartedAt };
  const windowError = validateActualWindow(effectiveRequest, entry, now);
  if (windowError) return reject(db, appUserId, request, requestFingerprint, "resource_conflict", windowError);

  if (request.expected_lifecycle_state === "planned" && entry.section_id === null && entry.planned_start_minute !== null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
      "Section-less Entry cannot have a planned start");
  }
  const plannedTransition = request.expected_lifecycle_state === "planned";
  const target = plannedTransition ? await findActualSectionTarget(db, appUserId, entry.taskchute_day_id, effectiveRequest.started_at) : null;
  if (plannedTransition && !target) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
      "A timed Section context is required for an actual start");
  }
  const targetState = effectiveRequest.ended_at === null ? "running" : "completed";
  const targetSectionId = target?.sectionId ?? entry.section_id;
  const movesSection = plannedTransition && targetSectionId !== entry.section_id;
  if (movesSection && request.expected_placement_revision === undefined) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
      "A Section-changing actual-time correction requires its placement revision");
  }
  const guardedPlacementRevision = movesSection || !plannedTransition ? request.expected_placement_revision : undefined;
  if (guardedPlacementRevision !== undefined && entry.placement_revision !== guardedPlacementRevision) {
    return persistRejection<SetExecutionTimesResult>(db, {
      appUserId, operationId: request.operation_id, commandType: "SetExecutionTimes", requestFingerprint,
      outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }
  const targetPosition = movesSection ? target?.position ?? entry.position : entry.position;
  const result: SetExecutionTimesResult = {
    entry_id: request.entry_id,
    lifecycle_state: targetState,
    execution: { id: request.execution_id, entry_id: request.entry_id, started_at: effectiveRequest.started_at, ended_at: effectiveRequest.ended_at },
    section_id: targetSectionId,
    planned_start_minute: entry.planned_start_minute,
    position: targetPosition,
    placement_revision: movesSection ? entry.placement_revision + 1 : entry.placement_revision,
  };
  const assertionId = `execution-times:${request.operation_id}`;
  const expectedRevision = guardedPlacementRevision ?? null;
  const dayId = entry.taskchute_day_id;
  const blockerGuardSpec = blockerGuard(minuteBlocker, appUserId, dayId);
  const currentDayGuard = reopeningCompleted && currentDay
    ? currentDayGuardSql("d", currentDay)
    : { sql: "", bindings: [] as unknown[] };
  const lifecycleGuard = request.expected_lifecycle_state === "planned"
    ? db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, e.id, ?, 'SetExecutionTimes'
          FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
         WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = 'planned'
           AND NOT EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = ? AND x.id = ?)
           AND (? IS NULL OR d.placement_revision = ?)
           AND ${overlapsSql("e")}
           ${blockerGuardSpec.sql}
           AND (? = 0 OR EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?))`)
      .bind(appUserId, request.operation_id, request.execution_id, appUserId, request.entry_id, appUserId, request.execution_id,
        expectedRevision, expectedRevision, request.execution_id, effectiveRequest.ended_at, effectiveRequest.ended_at, effectiveRequest.started_at,
        ...blockerGuardSpec.bindings,
        movesSection ? 1 : 0, appUserId, request.operation_id)
    : db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, e.id, x.id, 'SetExecutionTimes'
          FROM entries e JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
          JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
         WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = ? AND x.id = ?
           AND x.started_at = ?
           AND ((? IS NULL AND x.ended_at IS NULL) OR (? IS NOT NULL AND x.ended_at = ?))
           AND x.terminal_outcome IS ?
           AND (? IS NULL OR d.placement_revision = ?)
           AND ${overlapsSql("e")}
            ${blockerGuardSpec.sql}
            ${currentDayGuard.sql}`)
      .bind(appUserId, request.operation_id, appUserId, request.entry_id, request.expected_lifecycle_state, request.execution_id,
        request.expected_started_at, request.expected_ended_at, request.expected_ended_at, request.expected_ended_at,
        execution?.terminal_outcome ?? null, expectedRevision, expectedRevision, request.execution_id,
        effectiveRequest.ended_at, effectiveRequest.ended_at, effectiveRequest.started_at,
        ...blockerGuardSpec.bindings, ...currentDayGuard.bindings);
  try {
    const [placementGuard, guard] = await db.batch([
      movesSection
        ? db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
            SELECT ?, app_user_id, id, ? FROM taskchute_days
             WHERE app_user_id = ? AND id = ? AND placement_revision = ?`)
          .bind(request.operation_id, expectedRevision, appUserId, dayId, expectedRevision)
        : db.prepare("SELECT 1 AS no_placement_guard"),
      lifecycleGuard,
      movesSection
        ? db.prepare(`UPDATE entries SET section_id = ?, position = ? WHERE app_user_id = ? AND id = ?
            AND section_id IS ?
            AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
            AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(targetSectionId, targetPosition, appUserId, request.entry_id, entry.section_id, appUserId, request.operation_id, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS no_placement_update"),
      movesSection
        ? db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
            WHERE app_user_id = ? AND id = ? AND placement_revision = ?
              AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
              AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, dayId, expectedRevision, appUserId, request.operation_id, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS no_placement_revision"),
      request.expected_lifecycle_state === "planned"
        ? db.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
            SELECT ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE 'completed' END
              WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(request.execution_id, appUserId, request.entry_id, effectiveRequest.started_at, effectiveRequest.ended_at, now,
            effectiveRequest.ended_at, appUserId, request.operation_id)
        : db.prepare(`UPDATE executions SET started_at = ?, ended_at = ?,
            terminal_outcome = CASE WHEN ? IS NULL THEN NULL ELSE 'completed' END
            WHERE app_user_id = ? AND id = ? AND entry_id = ?
              AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(effectiveRequest.started_at, effectiveRequest.ended_at, effectiveRequest.ended_at, appUserId, request.execution_id, request.entry_id, appUserId, request.operation_id),
      plannedTransition
        ? db.prepare(`INSERT INTO entry_project_snapshots
            (app_user_id, entry_id, project_id, project_title, captured_at)
            SELECT e.app_user_id, e.id, t.project_id, p.title, ?
              FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
              LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
             WHERE e.app_user_id = ? AND e.id = ?
               AND NOT EXISTS (SELECT 1 FROM entry_project_snapshots s
                 WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
               AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(now, appUserId, request.entry_id, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS no_project_snapshot"),
      plannedTransition
        ? db.prepare(`INSERT INTO entry_task_snapshots
            (app_user_id, entry_id, task_id, task_title, captured_at)
            SELECT e.app_user_id, e.id, t.id, t.title, ?
              FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
             WHERE e.app_user_id = ? AND e.id = ?
               AND NOT EXISTS (SELECT 1 FROM entry_task_snapshots s
                 WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
               AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(now, appUserId, request.entry_id, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS no_task_snapshot"),
      plannedTransition
        ? db.prepare(`INSERT INTO entry_mode_snapshots
            (app_user_id, entry_id, mode_id, mode_title, captured_at)
            SELECT e.app_user_id, e.id, em.mode_id, md.title, ?
              FROM entries e JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
              JOIN mode_definitions md ON md.app_user_id = em.app_user_id AND md.id = em.mode_id
             WHERE e.app_user_id = ? AND e.id = ?
               AND NOT EXISTS (SELECT 1 FROM entry_mode_snapshots s WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
               AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(now, appUserId, request.entry_id, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS no_mode_snapshot"),
      db.prepare(`UPDATE entries SET lifecycle_state = ? WHERE app_user_id = ? AND id = ?
        AND lifecycle_state = ? AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(targetState, appUserId, request.entry_id, request.expected_lifecycle_state, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = ?)
          AND EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ? AND entry_id = ?
            AND started_at = ? AND ((? IS NULL AND ended_at IS NULL) OR ended_at = ?))
          AND (? = 0 OR EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND section_id = ?))
          AND (? = 0 OR EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?))
        THEN 1 ELSE 0 END WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.entry_id, targetState, appUserId, request.execution_id, request.entry_id,
          effectiveRequest.started_at, effectiveRequest.ended_at, effectiveRequest.ended_at, movesSection ? 1 : 0, appUserId, request.entry_id,
          targetSectionId, movesSection ? 1 : 0, appUserId, dayId, result.placement_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
          request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetExecutionTimes', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now, appUserId, request.operation_id),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (movesSection && placementGuard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<SetExecutionTimesResult>(committed, "SetExecutionTimes", requestFingerprint);
      return persistRejection<SetExecutionTimesResult>(db, { appUserId, operationId: request.operation_id,
        commandType: "SetExecutionTimes", requestFingerprint, outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The placement revision is stale" } });
    }
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<SetExecutionTimesResult>(committed, "SetExecutionTimes", requestFingerprint);
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Execution correction did not converge");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<SetExecutionTimesResult>(committed, "SetExecutionTimes", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
