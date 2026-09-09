import type { CompleteEntryRequest, CompleteEntryResult, StartEntryRequest, StartEntryResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation, type CommandType } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

function isLifecycleRequest(value: unknown): value is CompleteEntryRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body) && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && typeof body.execution_id === "string" && isUuidV7(body.execution_id);
}
export function isStartEntryRequest(value: unknown): value is StartEntryRequest {
  if (!isLifecycleRequest(value)) return false;
  const body = value as unknown as Record<string, unknown>;
  return !("expected_placement_revision" in body)
    || (Number.isInteger(body.expected_placement_revision) && Number(body.expected_placement_revision) >= 0);
}
export function isCompleteEntryRequest(value: unknown): value is CompleteEntryRequest {
  return isLifecycleRequest(value) && !("expected_placement_revision" in (value as unknown as Record<string, unknown>));
}

async function reject<T>(db: D1Database, appUserId: string, request: { operation_id: string }, commandType: CommandType,
  requestFingerprint: string, code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id, commandType, requestFingerprint,
    outcomeKind: "domain_rejection", result: { code, message } });
}

export async function startEntry(
  db: D1Database,
  appUserId: string,
  request: StartEntryRequest,
  nowInstant = new Date().toISOString(),
): Promise<StartEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "StartEntry", requestFingerprint);
  const now = nowInstant;
  const [entryResult, activeResult, collisionResult] = await db.batch([
    db.prepare(`SELECT e.lifecycle_state, e.section_id, e.planned_start_minute, e.taskchute_day_id, d.placement_revision,
          em.mode_id, md.title AS mode_title
      FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
      LEFT JOIN mode_definitions md ON md.app_user_id = em.app_user_id AND md.id = em.mode_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, request.entry_id),
    db.prepare("SELECT id, entry_id, started_at FROM executions WHERE app_user_id = ? AND ended_at IS NULL LIMIT 1").bind(appUserId),
    db.prepare("SELECT id FROM executions WHERE id = ?").bind(request.execution_id),
  ]);
  const convergedBeforeStart = await readOperation(db, appUserId, request.operation_id);
  if (convergedBeforeStart) return replayOperation(convergedBeforeStart, "StartEntry", requestFingerprint);
  if (entryResult.results.length === 0) return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_not_found", "Entry is unavailable");
  const entry = entryResult.results[0] as { lifecycle_state: string; section_id: string | null;
    planned_start_minute: number | null; taskchute_day_id: string; placement_revision: number;
    mode_id: string | null; mode_title: string | null };
  if (entry.section_id === null && entry.planned_start_minute !== null) {
    return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict",
      "Section-less Entry cannot have a planned start");
  }
  if (collisionResult.results.length > 0) return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict", "execution_id is already in use");
  if (entry.lifecycle_state !== "planned") {
    return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict", "Only a planned Entry can start");
  }
  if (activeResult.results.length > 0) return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict", "Another Execution is already active");
  const context = await db.prepare(`SELECT section_id FROM taskchute_day_section_contexts
    WHERE app_user_id = ? AND taskchute_day_id = ?
      AND julianday(actual_start_instant) <= julianday(?) AND julianday(?) < julianday(actual_end_instant)
    ORDER BY context_order LIMIT 2`).bind(appUserId, entry.taskchute_day_id, now, now).all<{ section_id: string }>();
  if (context.results.length !== 1) {
    return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict",
      "A timed Section context is required to start this Entry");
  }
  const targetSectionId = context.results[0]?.section_id ?? null;
  if (!targetSectionId) throw new Error("Start Section resolution did not converge");
  const movesSection = entry.section_id !== targetSectionId;
  if (movesSection && request.expected_placement_revision === undefined) {
    return reject(db, appUserId, request, "StartEntry", requestFingerprint, "resource_conflict",
      "A Section-changing Start requires its placement revision");
  }
  if (movesSection && entry.placement_revision !== request.expected_placement_revision) {
    return persistRejection(db, { appUserId, operationId: request.operation_id, commandType: "StartEntry", requestFingerprint,
      outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" } });
  }
  let targetPosition: number | null = null;
  if (movesSection) {
    const positionRow = await db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS position FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
      .bind(appUserId, entry.taskchute_day_id, targetSectionId).first<{ position: number }>();
    targetPosition = positionRow?.position ?? null;
  }
  const result: StartEntryResult = { entry_id: request.entry_id, lifecycle_state: "running",
    execution: { id: request.execution_id, entry_id: request.entry_id, started_at: now, ended_at: null },
    section_id: targetSectionId, placement_revision: movesSection ? request.expected_placement_revision! + 1 : null };
  const assertionId = `start:${request.operation_id}`;
  try {
    const [placementGuard, lifecycleGuard] = await db.batch([
      movesSection
        ? db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
            SELECT ?, app_user_id, id, ? FROM taskchute_days
            WHERE app_user_id = ? AND id = ? AND placement_revision = ?`)
          .bind(request.operation_id, request.expected_placement_revision, appUserId, entry.taskchute_day_id,
            request.expected_placement_revision)
        : db.prepare("SELECT 1 AS lifecycle_only"),
      db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, id, ?, 'StartEntry' FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
        AND NOT EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND ended_at IS NULL)
        AND (? = 0 OR EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?))`)
        .bind(appUserId, request.operation_id, request.execution_id, appUserId, request.entry_id, appUserId,
          movesSection ? 1 : 0, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET section_id = ?, position = ? WHERE app_user_id = ? AND id = ? AND section_id IS ?
        AND ? = 1 AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
        AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(targetSectionId, targetPosition, appUserId, request.entry_id, entry.section_id, movesSection ? 1 : 0,
          appUserId, request.operation_id, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1 WHERE app_user_id = ? AND id = ?
        AND ? = 1 AND placement_revision = ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
        AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, entry.taskchute_day_id, movesSection ? 1 : 0, request.expected_placement_revision ?? null,
          appUserId, request.operation_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
        SELECT ?, ?, ?, ?, NULL, ?, NULL WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.execution_id, appUserId, request.entry_id, now, now, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_project_snapshots
        (app_user_id, entry_id, project_id, project_title, captured_at)
        SELECT e.app_user_id, e.id, t.project_id, p.title, ?
          FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
          LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
         WHERE e.app_user_id = ? AND e.id = ?
           AND NOT EXISTS (SELECT 1 FROM entry_project_snapshots s
             WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
           AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(now, appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_task_snapshots
        (app_user_id, entry_id, task_id, task_title, captured_at)
        SELECT e.app_user_id, e.id, t.id, t.title, ?
          FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
         WHERE e.app_user_id = ? AND e.id = ?
           AND NOT EXISTS (SELECT 1 FROM entry_task_snapshots s
             WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
           AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(now, appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_mode_snapshots
        (app_user_id, entry_id, mode_id, mode_title, captured_at)
        SELECT e.app_user_id, e.id, em.mode_id, md.title, ?
          FROM entries e JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
          JOIN mode_definitions md ON md.app_user_id = em.app_user_id AND md.id = em.mode_id
         WHERE e.app_user_id = ? AND e.id = ?
           AND NOT EXISTS (SELECT 1 FROM entry_mode_snapshots s WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
           AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(now, appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET lifecycle_state = 'running' WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
        AND EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'running')
        AND EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at IS NULL)
        AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND section_id = ?
          AND planned_start_minute IS ?)
        AND ((? IS NULL AND NOT EXISTS (SELECT 1 FROM entry_mode_snapshots WHERE app_user_id = ? AND entry_id = ?))
          OR (? IS NOT NULL AND EXISTS (SELECT 1 FROM entry_mode_snapshots WHERE app_user_id = ? AND entry_id = ?
            AND mode_id = ? AND mode_title = ?)))
        AND EXISTS (SELECT 1 FROM entry_task_snapshots WHERE app_user_id = ? AND entry_id = ?
          AND task_id = (SELECT task_id FROM entries WHERE app_user_id = ? AND id = ?))
        AND (? = 0 OR EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?))
        THEN 1 ELSE 0 END WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.entry_id, appUserId, request.execution_id, request.entry_id,
          appUserId, request.entry_id, targetSectionId, entry.planned_start_minute,
          entry.mode_id, appUserId, request.entry_id, entry.mode_id, appUserId, request.entry_id, entry.mode_id, entry.mode_title,
          appUserId, request.entry_id, appUserId, request.entry_id,
          movesSection ? 1 : 0, appUserId,
          entry.taskchute_day_id, result.placement_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'StartEntry', ?, ?, 'success', ?, ? WHERE EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now, appUserId, request.operation_id),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM lifecycle_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (movesSection && placementGuard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "StartEntry", requestFingerprint);
      return persistRejection(db, { appUserId, operationId: request.operation_id, commandType: "StartEntry", requestFingerprint,
        outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" } });
    }
    if (lifecycleGuard.meta.changes === 0) {
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
    execution: { id: request.execution_id, entry_id: request.entry_id, started_at: execution.started_at, ended_at: now, outcome: "completed" } };
  const assertionId = `complete:${request.operation_id}`;
  try {
    const [guard] = await db.batch([
      db.prepare(`INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type)
        SELECT ?, ?, e.id, x.id, 'CompleteEntry' FROM entries e JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
        WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = 'running' AND x.id = ? AND x.ended_at IS NULL`)
        .bind(appUserId, request.operation_id, appUserId, request.entry_id, request.execution_id),
      db.prepare(`UPDATE executions SET ended_at = ?, terminal_outcome = 'completed' WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at IS NULL
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
