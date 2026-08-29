import type { MoveEntryRequest, MoveEntryResult, SetEntryEstimateRequest, SetEntryEstimateResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isMoveEntryRequest(value: unknown): value is MoveEntryRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body) && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && (body.section_id === null || (typeof body.section_id === "string" && isUuidV7(body.section_id)))
    && Number.isInteger(body.expected_placement_revision) && Number(body.expected_placement_revision) >= 0;
}

export function isSetEntryEstimateRequest(value: unknown): value is SetEntryEstimateRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body) && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && (body.estimate_seconds === null || (Number.isSafeInteger(body.estimate_seconds) && Number(body.estimate_seconds) > 0));
}

export async function setEntryEstimate(db: D1Database, appUserId: string, request: SetEntryEstimateRequest): Promise<SetEntryEstimateResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "SetEntryEstimate", requestFingerprint);
  const entry = await db.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
    .bind(appUserId, request.entry_id).first<{ lifecycle_state: string }>();
  if (!entry || entry.lifecycle_state !== "planned") return persistRejection(db, { appUserId, operationId: request.operation_id,
    commandType: "SetEntryEstimate", requestFingerprint, outcomeKind: "domain_rejection",
    result: { code: entry ? "resource_conflict" : "resource_not_found", message: "Only an available planned Entry estimate can be edited" } });
  const result = { entry_id: request.entry_id, estimate_seconds: request.estimate_seconds };
  const now = new Date().toISOString();
  try {
    const [update] = await db.batch([
      db.prepare("UPDATE entries SET estimate_seconds = ? WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'")
        .bind(request.estimate_seconds, appUserId, request.entry_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetEntryEstimate', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned' AND estimate_seconds IS ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, request.entry_id, request.estimate_seconds),
    ]);
    if (update.meta.changes === 0) return persistRejection(db, { appUserId, operationId: request.operation_id,
      commandType: "SetEntryEstimate", requestFingerprint, outcomeKind: "domain_rejection",
      result: { code: "resource_conflict", message: "Only a planned Entry estimate can be edited" } });
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "SetEntryEstimate", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}

export async function moveEntry(db: D1Database, appUserId: string, request: MoveEntryRequest): Promise<MoveEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "MoveEntry", requestFingerprint);
  const [dayResult, entryResult, sectionResult, targetPositionResult] = await db.batch([
    db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, request.taskchute_day_id),
    db.prepare("SELECT section_id, lifecycle_state, planned_start_minute FROM entries WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ?")
      .bind(appUserId, request.entry_id, request.taskchute_day_id),
    request.section_id ? db.prepare(`SELECT section_id AS id FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
      .bind(appUserId, request.taskchute_day_id, request.section_id) : db.prepare("SELECT 1 AS id"),
    db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?")
      .bind(appUserId, request.taskchute_day_id, request.section_id),
  ]);
  const day = dayResult.results[0] as { placement_revision: number } | undefined;
  const entry = entryResult.results[0] as { section_id: string | null; lifecycle_state: string; planned_start_minute: number | null } | undefined;
  const reject = (message: string, revision = false) => persistRejection<MoveEntryResult>(db, { appUserId,
    operationId: request.operation_id, commandType: "MoveEntry", requestFingerprint,
    outcomeKind: revision ? "revision_conflict" : "domain_rejection",
    result: { code: revision ? "revision_conflict" : "resource_conflict", message } });
  if (!day || !entry || sectionResult.results.length === 0) return reject("Entry, Day, or Section is unavailable");
  if (entry.lifecycle_state !== "planned") return reject("Only a planned Entry can move");
  if (entry.section_id === request.section_id) return reject("Entry is already in that Section");
  if (day.placement_revision !== request.expected_placement_revision) return reject("The placement revision is stale", true);
  const position = (targetPositionResult.results[0] as { position: number }).position;
  const result = { entry_id: request.entry_id, section_id: request.section_id, position,
    placement_revision: request.expected_placement_revision + 1 };
  const now = new Date().toISOString();
  const oldSection = entry.section_id;
  const assertionId = `move-entry:${request.operation_id}`;
  try {
    const [guard, , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id, request.expected_placement_revision),
      db.prepare(`UPDATE entries SET section_id = ?, position = ?, planned_start_minute = NULL
        WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
        AND section_id IS ? AND planned_start_minute IS ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.section_id, position, appUserId, request.entry_id, oldSection, entry.planned_start_minute,
          appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1 WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
        AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
          AND section_id IS ? AND position = ? AND planned_start_minute IS NULL)`)
        .bind(appUserId, request.taskchute_day_id, appUserId, request.operation_id,
          appUserId, request.entry_id, request.section_id, position),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
          AND section_id IS ? AND position = ? AND planned_start_minute IS NULL)
        AND EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
        THEN 1 ELSE 0 END WHERE EXISTS
        (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.entry_id, request.section_id, position,
          appUserId, request.taskchute_day_id, result.placement_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'MoveEntry', ?, ?, 'success', ?, ? WHERE EXISTS
        (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) return reject("The placement revision is stale", true);
    if (assertion?.meta.changes === 0 || operationPersist?.meta.changes === 0) return reject("Only a planned Entry can move");
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "MoveEntry", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
