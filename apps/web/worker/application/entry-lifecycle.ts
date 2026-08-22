import type { CompleteEntryRequest, CompleteEntryResult, StartEntryRequest, StartEntryResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation, type CommandType } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

function isLifecycleRequest(value: unknown): value is StartEntryRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body) && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && typeof body.execution_id === "string" && isUuidV7(body.execution_id);
}
export const isStartEntryRequest = isLifecycleRequest;
export const isCompleteEntryRequest = isLifecycleRequest;

async function reject<T>(db: D1Database, appUserId: string, request: StartEntryRequest, commandType: CommandType,
  requestFingerprint: string, code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id, commandType, requestFingerprint,
    outcomeKind: "domain_rejection", result: { code, message } });
}

export async function startEntry(db: D1Database, appUserId: string, request: StartEntryRequest): Promise<StartEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "StartEntry", requestFingerprint);
  const [entryResult, activeResult, collisionResult] = await db.batch([
    db.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?").bind(appUserId, request.entry_id),
    db.prepare("SELECT id, entry_id, started_at FROM executions WHERE app_user_id = ? AND ended_at IS NULL LIMIT 1").bind(appUserId),
    db.prepare("SELECT id FROM executions WHERE id = ?").bind(request.execution_id),
  ]);
  const convergedBeforeStart = await readOperation(db, appUserId, request.operation_id);
  if (convergedBeforeStart) return replayOperation(convergedBeforeStart, "StartEntry", requestFingerprint);
  if (entryResult.results.length === 0) return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_not_found", "Entry is unavailable");
  if (collisionResult.results.length > 0) return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict", "execution_id is already in use");
  if ((entryResult.results[0] as { lifecycle_state: string }).lifecycle_state !== "planned") {
    return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict", "Only a planned Entry can start");
  }
  if (activeResult.results.length > 0) return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict", "Another Execution is already active");
  const now = new Date().toISOString();
  const result: StartEntryResult = { entry_id: request.entry_id, lifecycle_state: "running",
    execution: { id: request.execution_id, entry_id: request.entry_id, started_at: now, ended_at: null } };
  const assertionId = `start:${request.operation_id}`;
  try {
    const [guard] = await db.batch([
      db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, id, ?, 'StartEntry' FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
        AND NOT EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND ended_at IS NULL)`)
        .bind(appUserId, request.operation_id, request.execution_id, appUserId, request.entry_id, appUserId),
      db.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
        SELECT ?, ?, ?, ?, NULL, ? WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.execution_id, appUserId, request.entry_id, now, now, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET lifecycle_state = 'running' WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
        AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'running')
        AND EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at IS NULL)
        THEN 1 ELSE 0 END WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.entry_id, appUserId, request.execution_id, request.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'StartEntry', ?, ?, 'success', ?, ? WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now, appUserId, request.operation_id),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "StartEntry", requestFingerprint);
      const active = await db.prepare("SELECT id FROM executions WHERE app_user_id = ? AND ended_at IS NULL LIMIT 1").bind(appUserId).first();
      return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict",
        active ? "Another Execution is already active" : "Only a planned Entry can start");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "StartEntry", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}

export async function completeEntry(db: D1Database, appUserId: string, request: CompleteEntryRequest): Promise<CompleteEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "CompleteEntry", requestFingerprint);
  const [entryResult, executionResult] = await db.batch([
    db.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?").bind(appUserId, request.entry_id),
    db.prepare("SELECT started_at, ended_at, entry_id FROM executions WHERE app_user_id = ? AND id = ?").bind(appUserId, request.execution_id),
  ]);
  const convergedBeforeComplete = await readOperation(db, appUserId, request.operation_id);
  if (convergedBeforeComplete) return replayOperation(convergedBeforeComplete, "CompleteEntry", requestFingerprint);
  if (entryResult.results.length === 0 || executionResult.results.length === 0) {
    return reject(db, appUserId, request, "CompleteEntry", requestFingerprint, "resource_not_found", "Entry or Execution is unavailable");
  }
  const execution = executionResult.results[0] as { started_at: string; ended_at: string | null; entry_id: string };
  if (execution.entry_id !== request.entry_id || execution.ended_at !== null || (entryResult.results[0] as { lifecycle_state: string }).lifecycle_state !== "running") {
    return reject(db, appUserId, request, "CompleteEntry", requestFingerprint, "resource_conflict", "Execution is not completable");
  }
  const now = new Date().toISOString();
  const result: CompleteEntryResult = { entry_id: request.entry_id, lifecycle_state: "completed",
    execution: { id: request.execution_id, entry_id: request.entry_id, started_at: execution.started_at, ended_at: now } };
  const assertionId = `complete:${request.operation_id}`;
  try {
    const [guard] = await db.batch([
      db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, e.id, x.id, 'CompleteEntry' FROM entries e JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
        WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = 'running' AND x.id = ? AND x.ended_at IS NULL`)
        .bind(appUserId, request.operation_id, appUserId, request.entry_id, request.execution_id),
      db.prepare(`UPDATE executions SET ended_at = ? WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at IS NULL
        AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(now, appUserId, request.execution_id, request.entry_id, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET lifecycle_state = 'completed' WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'running'
        AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'completed')
        AND EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ? AND ended_at = ?)
        THEN 1 ELSE 0 END WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.entry_id, appUserId, request.execution_id, now, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'CompleteEntry', ?, ?, 'success', ?, ? WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now, appUserId, request.operation_id),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "CompleteEntry", requestFingerprint);
      return reject(db, appUserId, request, "CompleteEntry", requestFingerprint, "resource_conflict", "Execution is not completable");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "CompleteEntry", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
