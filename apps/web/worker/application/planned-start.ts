import type { SetEntryPlannedStartRequest, SetEntryPlannedStartResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface PlannedStartEntryRow {
  section_id: string | null;
  position: number;
  lifecycle_state: string;
  planned_start_minute: number | null;
  routine_occurrence_id: string | null;
}

export function isSetEntryPlannedStartRequest(value: unknown): value is SetEntryPlannedStartRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !("user_id" in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && (body.planned_start_minute === null || Number.isSafeInteger(body.planned_start_minute))
    && Number.isSafeInteger(body.expected_placement_revision) && Number(body.expected_placement_revision) >= 0;
}

export async function setEntryPlannedStart(
  db: D1Database,
  appUserId: string,
  request: SetEntryPlannedStartRequest,
): Promise<SetEntryPlannedStartResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "SetEntryPlannedStart", requestFingerprint);

  const [dayResult, entryResult, contextResult] = await db.batch([
    db.prepare(`SELECT placement_revision, establishment_boundary_minutes FROM taskchute_days
      WHERE app_user_id = ? AND id = ?`).bind(appUserId, request.taskchute_day_id),
    db.prepare(`SELECT section_id, position, lifecycle_state, planned_start_minute, routine_occurrence_id FROM entries
      WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ?`)
      .bind(appUserId, request.entry_id, request.taskchute_day_id),
    request.planned_start_minute === null
      ? db.prepare("SELECT NULL AS section_id WHERE false")
      : db.prepare(`SELECT section_id FROM taskchute_day_section_contexts
          WHERE app_user_id = ? AND taskchute_day_id = ?
            AND logical_start_minute IS NOT NULL AND logical_end_minute IS NOT NULL
            AND logical_start_minute <= ? AND ? < logical_end_minute
          ORDER BY context_order LIMIT 2`)
        .bind(appUserId, request.taskchute_day_id, request.planned_start_minute, request.planned_start_minute),
  ]);
  const converged = await readOperation(db, appUserId, request.operation_id);
  if (converged) return replayOperation(converged, "SetEntryPlannedStart", requestFingerprint);

  const reject = (message: string, revision = false) => persistRejection<SetEntryPlannedStartResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "SetEntryPlannedStart",
    requestFingerprint,
    outcomeKind: revision ? "revision_conflict" : "domain_rejection",
    result: { code: revision ? "revision_conflict" : "resource_conflict", message },
  });
  const day = dayResult.results[0] as { placement_revision: number; establishment_boundary_minutes: number } | undefined;
  const entry = entryResult.results[0] as PlannedStartEntryRow | undefined;
  if (!day || !entry) return reject("Entry or TaskChuteDay is unavailable");
  if (entry.lifecycle_state !== "planned") return reject("Only a planned Entry planned start can be edited");
  if (entry.routine_occurrence_id !== null) return reject("Routine-derived Entry planned start is read-only");
  if (day.placement_revision !== request.expected_placement_revision) return reject("The placement revision is stale", true);

  let targetSectionId = entry.section_id;
  if (request.planned_start_minute !== null) {
    const boundary = day.establishment_boundary_minutes;
    if (request.planned_start_minute < boundary || request.planned_start_minute >= boundary + 1440) {
      return reject("Planned start must be inside the established TaskChuteDay logical interval");
    }
    if (contextResult.results.length !== 1) {
      return reject("Planned start requires exactly one authoritative timed Section context");
    }
    targetSectionId = (contextResult.results[0] as { section_id: string }).section_id;
  }

  let targetPosition = entry.position;
  if (targetSectionId !== entry.section_id) {
    const position = await db.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS position FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?`)
      .bind(appUserId, request.taskchute_day_id, targetSectionId).first<{ position: number }>();
    if (!position) throw new Error("Planned-start destination position did not resolve");
    targetPosition = position.position;
  }

  const result: SetEntryPlannedStartResult = {
    entry_id: request.entry_id,
    section_id: targetSectionId,
    planned_start_minute: request.planned_start_minute,
    position: targetPosition,
    placement_revision: request.expected_placement_revision + 1,
  };
  const assertionId = `planned-start:${request.operation_id}`;
  const now = new Date().toISOString();
  try {
    const [guard, , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, d.app_user_id, d.id, ? FROM taskchute_days d
        WHERE d.app_user_id = ? AND d.id = ? AND d.placement_revision = ?
          AND EXISTS (SELECT 1 FROM entries e WHERE e.app_user_id = d.app_user_id AND e.id = ?
            AND e.taskchute_day_id = d.id AND e.lifecycle_state = 'planned'
            AND e.routine_occurrence_id IS NULL AND e.section_id IS ?
            AND e.position = ? AND e.planned_start_minute IS ?)
          AND (? IS NULL OR EXISTS (SELECT 1 FROM taskchute_day_section_contexts c
            WHERE c.app_user_id = d.app_user_id AND c.taskchute_day_id = d.id AND c.section_id = ?
              AND c.logical_start_minute IS NOT NULL AND c.logical_end_minute IS NOT NULL
              AND c.logical_start_minute <= ? AND ? < c.logical_end_minute))`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          request.expected_placement_revision, request.entry_id, entry.section_id, entry.position, entry.planned_start_minute,
          request.planned_start_minute, targetSectionId, request.planned_start_minute, request.planned_start_minute),
      db.prepare(`UPDATE entries SET section_id = ?, position = ?, planned_start_minute = ?
        WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ? AND lifecycle_state = 'planned'
          AND routine_occurrence_id IS NULL
          AND section_id IS ? AND position = ? AND planned_start_minute IS ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(targetSectionId, targetPosition, request.planned_start_minute, appUserId, request.entry_id,
          request.taskchute_day_id, entry.section_id, entry.position, entry.planned_start_minute,
          appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND section_id IS ?
            AND position = ? AND planned_start_minute IS ? AND lifecycle_state = 'planned'
            AND routine_occurrence_id IS NULL)`)
        .bind(appUserId, request.taskchute_day_id, request.expected_placement_revision, appUserId, request.operation_id,
          appUserId, request.entry_id, targetSectionId, targetPosition, request.planned_start_minute),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ?
          AND section_id IS ? AND position = ? AND planned_start_minute IS ? AND lifecycle_state = 'planned'
          AND routine_occurrence_id IS NULL)
        AND EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
        THEN 1 ELSE 0 END WHERE EXISTS
          (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.entry_id, request.taskchute_day_id,
          targetSectionId, targetPosition, request.planned_start_minute,
          appUserId, request.taskchute_day_id, result.placement_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetEntryPlannedStart', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), now, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "SetEntryPlannedStart", requestFingerprint);
      const latestRevision = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.taskchute_day_id).first<number>("placement_revision");
      if (latestRevision !== request.expected_placement_revision) return reject("The placement revision is stale", true);
      return reject("Entry placement or lifecycle changed before planned start could commit");
    }
    if (assertion?.meta.changes === 0 || operationPersist?.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The planned-start mutation did not converge", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "SetEntryPlannedStart", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
