import { Temporal } from "@js-temporal/polyfill";
import type {
  ExecutionCorrectionLifecycleState,
  SetExecutionTimesRequest,
  SetExecutionTimesResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { readDaySectionContexts } from "./load-current-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

type InstantField = "started_at" | "ended_at" | "expected_started_at" | "expected_ended_at";

interface EntryRow {
  entry_id: string;
  taskchute_day_id: string;
  lifecycle_state: ExecutionCorrectionLifecycleState;
  section_id: string | null;
  planned_start_minute: number | null;
  position: number;
  placement_revision: number;
  start_instant: string;
  end_instant: string;
}

interface ExecutionRow {
  id: string;
  entry_id: string;
  started_at: string;
  ended_at: string | null;
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
      || (Number.isInteger(value.expected_placement_revision) && Number(value.expected_placement_revision) >= 0));
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
): Promise<T> {
  return persistRejection<T>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "SetExecutionTimes",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

async function readEntry(db: D1Database, appUserId: string, entryId: string): Promise<EntryRow | null> {
  return db.prepare(`SELECT e.id AS entry_id, e.taskchute_day_id, e.lifecycle_state, e.section_id,
      e.planned_start_minute, e.position, d.placement_revision, d.start_instant, d.end_instant
    FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, entryId).first<EntryRow>();
}

async function readExecution(db: D1Database, appUserId: string, executionId: string): Promise<ExecutionRow | null> {
  return db.prepare("SELECT id, entry_id, started_at, ended_at FROM executions WHERE app_user_id = ? AND id = ?")
    .bind(appUserId, executionId).first<ExecutionRow>();
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

async function findSectionlessTarget(
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
  if (!position) throw new Error("Sectionless target position did not converge");
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
  if (request.expected_lifecycle_state === "completed" && request.ended_at === null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "A completed Entry cannot be reopened");
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
    if (request.expected_started_at === null || !sameInstant(execution.started_at, request.expected_started_at)
      || (request.expected_ended_at === null
        ? execution.ended_at !== null
        : execution.ended_at === null || !sameInstant(execution.ended_at, request.expected_ended_at))) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Execution changed before correction");
    }
  }
  const windowError = validateActualWindow(request, entry, now);
  if (windowError) return reject(db, appUserId, request, requestFingerprint, "resource_conflict", windowError);

  const movesFromUnsectioned = request.expected_lifecycle_state === "planned" && entry.section_id === null;
  if (request.expected_lifecycle_state === "planned" && !movesFromUnsectioned && request.expected_placement_revision !== undefined) {
    throw new HttpError(400, "malformed_request", "A sectioned planned correction must omit expected_placement_revision");
  }
  if (movesFromUnsectioned && request.expected_placement_revision === undefined) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
      "Setting actual time for an unsectioned Entry requires its placement revision");
  }
  if (request.expected_placement_revision !== undefined && entry.placement_revision !== request.expected_placement_revision) {
    return persistRejection<SetExecutionTimesResult>(db, {
      appUserId, operationId: request.operation_id, commandType: "SetExecutionTimes", requestFingerprint,
      outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }
  const target = movesFromUnsectioned ? await findSectionlessTarget(db, appUserId, entry.taskchute_day_id, request.started_at) : null;
  if (movesFromUnsectioned && !target) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
      "A timed Section context is required for an unsectioned actual start");
  }
  const targetState = request.ended_at === null ? "running" : "completed";
  const targetSectionId = target?.sectionId ?? entry.section_id;
  const targetPosition = target?.position ?? entry.position;
  if (!targetSectionId && movesFromUnsectioned) throw new Error("Sectionless correction target did not converge");
  const result: SetExecutionTimesResult = {
    entry_id: request.entry_id,
    lifecycle_state: targetState,
    execution: { id: request.execution_id, entry_id: request.entry_id, started_at: request.started_at, ended_at: request.ended_at },
    section_id: targetSectionId,
    planned_start_minute: movesFromUnsectioned ? null : entry.planned_start_minute,
    position: targetPosition,
    placement_revision: movesFromUnsectioned ? entry.placement_revision + 1 : entry.placement_revision,
  };
  const assertionId = `execution-times:${request.operation_id}`;
  const expectedRevision = request.expected_placement_revision ?? null;
  const lifecycleGuard = request.expected_lifecycle_state === "planned"
    ? db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, e.id, ?, 'SetExecutionTimes'
          FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
         WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = 'planned'
           AND NOT EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = ? AND x.id = ?)
           AND (? IS NULL OR d.placement_revision = ?)
           AND ${overlapsSql("e")}
           AND (? = 0 OR EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?))`)
      .bind(appUserId, request.operation_id, request.execution_id, appUserId, request.entry_id, appUserId, request.execution_id,
        expectedRevision, expectedRevision, request.execution_id, request.ended_at, request.ended_at, request.started_at,
        movesFromUnsectioned ? 1 : 0, appUserId, request.operation_id)
    : db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, e.id, x.id, 'SetExecutionTimes'
          FROM entries e JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
          JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
         WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = ? AND x.id = ?
           AND julianday(x.started_at) = julianday(?)
           AND ((? IS NULL AND x.ended_at IS NULL) OR (? IS NOT NULL AND julianday(x.ended_at) = julianday(?)))
           AND (? IS NULL OR d.placement_revision = ?)
           AND ${overlapsSql("e")}`)
      .bind(appUserId, request.operation_id, appUserId, request.entry_id, request.expected_lifecycle_state, request.execution_id,
        request.expected_started_at, request.expected_ended_at, request.expected_ended_at, request.expected_ended_at,
        expectedRevision, expectedRevision, request.execution_id, request.ended_at, request.ended_at, request.started_at);
  const dayId = entry.taskchute_day_id;
  try {
    const [placementGuard, guard] = await db.batch([
      movesFromUnsectioned
        ? db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
            SELECT ?, app_user_id, id, ? FROM taskchute_days
             WHERE app_user_id = ? AND id = ? AND placement_revision = ?`)
          .bind(request.operation_id, expectedRevision, appUserId, dayId, expectedRevision)
        : db.prepare("SELECT 1 AS no_placement_guard"),
      lifecycleGuard,
      movesFromUnsectioned
        ? db.prepare(`UPDATE entries SET section_id = ?, position = ? WHERE app_user_id = ? AND id = ?
            AND section_id IS NULL AND planned_start_minute IS NULL
            AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
            AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(targetSectionId, targetPosition, appUserId, request.entry_id, appUserId, request.operation_id, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS no_placement_update"),
      movesFromUnsectioned
        ? db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
            WHERE app_user_id = ? AND id = ? AND placement_revision = ?
              AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
              AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, dayId, expectedRevision, appUserId, request.operation_id, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS no_placement_revision"),
      request.expected_lifecycle_state === "planned"
        ? db.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
            SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(request.execution_id, appUserId, request.entry_id, request.started_at, request.ended_at, now, appUserId, request.operation_id)
        : db.prepare(`UPDATE executions SET started_at = ?, ended_at = ?
            WHERE app_user_id = ? AND id = ? AND entry_id = ?
              AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(request.started_at, request.ended_at, appUserId, request.execution_id, request.entry_id, appUserId, request.operation_id),
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
          request.started_at, request.ended_at, request.ended_at, movesFromUnsectioned ? 1 : 0, appUserId, request.entry_id,
          targetSectionId, movesFromUnsectioned ? 1 : 0, appUserId, dayId, result.placement_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
          request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetExecutionTimes', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now, appUserId, request.operation_id),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (movesFromUnsectioned && placementGuard.meta.changes === 0) {
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
