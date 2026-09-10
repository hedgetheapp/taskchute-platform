import type { MoveEntryPlacementIntent, MoveEntryRequest, MoveEntryResult, SetEntryEstimateRequest, SetEntryEstimateResult } from "../../src/shared/contracts";
import { canonicalizeEntryOrder } from "../../src/shared/planned-entry-order";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isMoveEntryRequest(value: unknown): value is MoveEntryRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  const placement = body.placement;
  const validPlacement = placement === undefined || (typeof placement === "object" && placement !== null
    && (placement as Record<string, unknown>).kind === "relative_to_entry"
    && typeof (placement as Record<string, unknown>).anchor_entry_id === "string"
    && isUuidV7((placement as Record<string, unknown>).anchor_entry_id as string)
    && ((placement as Record<string, unknown>).edge === "before" || (placement as Record<string, unknown>).edge === "after"));
  return !('user_id' in body) && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && (body.section_id === null || (typeof body.section_id === "string" && isUuidV7(body.section_id)))
    && Number.isInteger(body.expected_placement_revision) && Number(body.expected_placement_revision) >= 0
    && validPlacement;
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
  const entry = await db.prepare("SELECT lifecycle_state, routine_occurrence_id FROM entries WHERE app_user_id = ? AND id = ?")
    .bind(appUserId, request.entry_id).first<{ lifecycle_state: string; routine_occurrence_id: string | null }>();
  if (!entry || entry.lifecycle_state !== "planned" || entry.routine_occurrence_id !== null) return persistRejection(db, { appUserId, operationId: request.operation_id,
    commandType: "SetEntryEstimate", requestFingerprint, outcomeKind: "domain_rejection",
    result: { code: entry ? "resource_conflict" : "resource_not_found", message: "Only an available planned Entry estimate can be edited" } });
  const result = { entry_id: request.entry_id, estimate_seconds: request.estimate_seconds };
  const now = new Date().toISOString();
  try {
    const [update] = await db.batch([
      db.prepare(`UPDATE entries SET estimate_seconds = ? WHERE app_user_id = ? AND id = ?
        AND lifecycle_state = 'planned' AND routine_occurrence_id IS NULL`)
        .bind(request.estimate_seconds, appUserId, request.entry_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetEntryEstimate', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
          AND routine_occurrence_id IS NULL AND estimate_seconds IS ?)`)
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
  type MoveRow = { id: string; section_id: string | null; position: number;
    lifecycle_state: "planned" | "running" | "completed"; planned_start_minute: number | null;
    routine_occurrence_id: string | null; first_started_at: string | null };
  const [dayResult, entryResult, sectionResult, sourceRowsResult, targetRowsResult] = await db.batch([
    db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, request.taskchute_day_id),
    db.prepare(`SELECT section_id, lifecycle_state, planned_start_minute, routine_occurrence_id FROM entries
      WHERE app_user_id = ? AND id = ? AND taskchute_day_id = ?`)
      .bind(appUserId, request.entry_id, request.taskchute_day_id),
    request.section_id ? db.prepare(`SELECT section_id AS id, logical_start_minute FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?
        AND logical_start_minute IS NOT NULL AND logical_end_minute IS NOT NULL`)
      .bind(appUserId, request.taskchute_day_id, request.section_id) : db.prepare("SELECT 1 AS id, NULL AS logical_start_minute"),
    db.prepare(`SELECT e.id, e.section_id, e.position, e.lifecycle_state, e.planned_start_minute, e.routine_occurrence_id,
        (SELECT MIN(x.started_at) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id) AS first_started_at
      FROM entries e WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.section_id IS
        (SELECT source.section_id FROM entries source WHERE source.app_user_id = ? AND source.id = ? AND source.taskchute_day_id = ?)
        ORDER BY e.position, e.id`)
      .bind(appUserId, request.taskchute_day_id, appUserId, request.entry_id, request.taskchute_day_id),
    db.prepare(`SELECT e.id, e.section_id, e.position, e.lifecycle_state, e.planned_start_minute, e.routine_occurrence_id,
        (SELECT MIN(x.started_at) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id) AS first_started_at
      FROM entries e WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.section_id IS ? ORDER BY e.position, e.id`)
      .bind(appUserId, request.taskchute_day_id, request.section_id),
  ]);
  const day = dayResult.results[0] as { placement_revision: number } | undefined;
  const entry = entryResult.results[0] as { section_id: string | null; lifecycle_state: string;
    planned_start_minute: number | null; routine_occurrence_id: string | null } | undefined;
  const reject = (message: string, revision = false) => persistRejection<MoveEntryResult>(db, { appUserId,
    operationId: request.operation_id, commandType: "MoveEntry", requestFingerprint,
    outcomeKind: revision ? "revision_conflict" : "domain_rejection",
    result: { code: revision ? "revision_conflict" : "resource_conflict", message } });
  if (!day || !entry || sectionResult.results.length === 0) return reject("Entry, Day, or Section is unavailable");
  if (entry.lifecycle_state !== "planned") return reject("Only a planned Entry can move");
  if (entry.routine_occurrence_id !== null) return reject("Routine-derived Entry placement is read-only");
  if (day.placement_revision !== request.expected_placement_revision) return reject("The placement revision is stale", true);

  // MoveEntry is also used by the legacy Section selector. The two queries above
  // intentionally keep that command backward compatible while the optional relative
  // intent adds a server-authoritative row target for D-083.
  const sourceRows = sourceRowsResult.results as unknown as MoveRow[];
  const targetRows = targetRowsResult.results as unknown as MoveRow[];
  const sourceCanonical = canonicalizeEntryOrder(sourceRows);
  const targetCanonical = entry.section_id === request.section_id ? sourceCanonical : canonicalizeEntryOrder(targetRows);
  const source = sourceCanonical.find((candidate) => candidate.id === request.entry_id);
  if (!source || source.lifecycle_state !== "planned" || source.routine_occurrence_id !== null) {
    return reject("Only a planned Entry can move");
  }
  const placement = request.placement as MoveEntryPlacementIntent | undefined;
  const anchor = placement ? targetCanonical.find((candidate) => candidate.id === placement.anchor_entry_id) : undefined;
  if (placement && (!anchor || anchor.id === source.id || anchor.lifecycle_state !== "planned"
    || anchor.section_id !== request.section_id)) return reject("The target Entry is not a valid planned anchor");
  const targetPlannedStart = placement
    ? anchor!.planned_start_minute
    : request.section_id === null ? null : (sectionResult.results[0] as { logical_start_minute: number }).logical_start_minute;
  const oldSection = source.section_id;
  const targetAfterRemoval = targetCanonical.filter((candidate) => candidate.id !== source.id);
  const moved = { ...source, section_id: request.section_id, planned_start_minute: targetPlannedStart };
  let insertIndex = targetAfterRemoval.length;
  if (placement) {
    const anchorIndex = targetAfterRemoval.findIndex((candidate) => candidate.id === anchor!.id);
    insertIndex = anchorIndex + (placement.edge === "after" ? 1 : 0);
  } else {
    const targetCohortIndices = targetAfterRemoval
      .map((candidate, index) => candidate.lifecycle_state === "planned" && candidate.planned_start_minute === targetPlannedStart ? index : -1)
      .filter((index) => index >= 0);
    if (targetCohortIndices.length > 0) insertIndex = targetCohortIndices[targetCohortIndices.length - 1]! + 1;
  }
  const targetDesired = [...targetAfterRemoval];
  targetDesired.splice(insertIndex, 0, moved);
  const desiredIds = targetDesired.map((candidate) => candidate.id);
  const canonicalTargetIds = targetCanonical.map((candidate) => candidate.id);
  const isNoOp = oldSection === request.section_id && source.planned_start_minute === targetPlannedStart
    && desiredIds.every((id, index) => id === canonicalTargetIds[index]) && desiredIds.length === canonicalTargetIds.length;
  const allSnapshotRows = [...new Map([...sourceRows, ...targetRows].map((row) => [row.id, row])).values()];
  const snapshotJson = JSON.stringify(allSnapshotRows);
  const now = new Date().toISOString();
  if (isNoOp) {
    const result: MoveEntryResult = { entry_id: source.id, section_id: source.section_id, position: source.position,
      placement_revision: day.placement_revision };
    try {
      const [guard, operationPersist] = await db.batch([
        db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
          SELECT ?, app_user_id, id, ? FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?
          AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
            AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?))) = json_array_length(?)
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = json_extract(snapshot.value, '$.id')
            WHERE e.id IS NULL OR e.section_id IS NOT json_extract(snapshot.value, '$.section_id')
              OR e.position != CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
              OR e.lifecycle_state != json_extract(snapshot.value, '$.lifecycle_state')
              OR e.planned_start_minute IS NOT json_extract(snapshot.value, '$.planned_start_minute')
          )`)
          .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
            request.expected_placement_revision, appUserId, request.taskchute_day_id, snapshotJson, snapshotJson,
            snapshotJson, appUserId, request.taskchute_day_id),
        db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
          request_fingerprint, outcome_kind, result_json, created_at)
          SELECT ?, ?, 'MoveEntry', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
            appUserId, request.operation_id),
        db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
          .bind(appUserId, request.operation_id),
      ]);
      if (guard.meta.changes === 0) {
        const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
          .bind(appUserId, request.taskchute_day_id).first<{ placement_revision: number }>();
        if (latest?.placement_revision !== request.expected_placement_revision) return reject("The placement revision is stale", true);
        return reject("Entry order or placement changed before MoveEntry could commit");
      }
      if (operationPersist.meta.changes === 0) return reject("MoveEntry could not be committed atomically");
      return result;
    } catch {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "MoveEntry", requestFingerprint);
      throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
    }
  }

  const targetCohort = targetDesired.filter((candidate) => candidate.lifecycle_state === "planned"
    && candidate.planned_start_minute === targetPlannedStart);
  const targetCohortSlots = targetRows.filter((candidate) => candidate.lifecycle_state === "planned"
    && candidate.planned_start_minute === targetPlannedStart).map((candidate) => candidate.position);
  if (oldSection === request.section_id) {
    if (!targetCohortSlots.includes(source.position)) targetCohortSlots.push(source.position);
  } else {
    const targetMaximum = targetRows.reduce((maximum, candidate) => Math.max(maximum, candidate.position), 0);
    targetCohortSlots.push(targetMaximum + 1);
  }
  targetCohortSlots.sort((left, right) => left - right);
  if (targetCohortSlots.length !== targetCohort.length) return reject("Target planned cohort slots are unavailable");
  const assignments = targetCohort.map((candidate, index) => ({ entry_id: candidate.id, section_id: request.section_id,
    planned_start_minute: targetPlannedStart, target_position: targetCohortSlots[index]! }));
  const assignmentsById = new Map(assignments.map((assignment) => [assignment.entry_id, assignment]));
  const result: MoveEntryResult = { entry_id: source.id, section_id: request.section_id,
    position: assignmentsById.get(source.id)?.target_position ?? source.position,
    placement_revision: request.expected_placement_revision + 1 };
  const historicalSnapshot = allSnapshotRows.filter((candidate) => candidate.lifecycle_state !== "planned");
  const historicalJson = JSON.stringify(historicalSnapshot);
  const assignmentsJson = JSON.stringify(assignments);
  const affectedIdsJson = JSON.stringify(assignments.map((assignment) => assignment.entry_id));
  const shiftOffset = Math.max(...allSnapshotRows.map((candidate) => candidate.position), 0) + allSnapshotRows.length + 1;
  const assertionId = `move-entry:${request.operation_id}`;
  try {
    const [guard, , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?
        AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
          AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?))) = json_array_length(?)
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?) snapshot
          LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = json_extract(snapshot.value, '$.id')
          WHERE e.id IS NULL OR e.section_id IS NOT json_extract(snapshot.value, '$.section_id')
            OR e.position != CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
            OR e.lifecycle_state != json_extract(snapshot.value, '$.lifecycle_state')
            OR e.planned_start_minute IS NOT json_extract(snapshot.value, '$.planned_start_minute')
        )`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          request.expected_placement_revision, appUserId, request.taskchute_day_id, snapshotJson, snapshotJson,
          snapshotJson, appUserId, request.taskchute_day_id),
      db.prepare(`UPDATE entries SET position = position + ?
        WHERE app_user_id = ? AND taskchute_day_id = ?
          AND id IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(shiftOffset, appUserId, request.taskchute_day_id, affectedIdsJson, appUserId, request.operation_id),
      db.prepare(`WITH requested(entry_id, section_id, planned_start_minute, target_position) AS (
          SELECT json_extract(value, '$.entry_id'), json_extract(value, '$.section_id'),
            json_extract(value, '$.planned_start_minute'), CAST(json_extract(value, '$.target_position') AS INTEGER)
          FROM json_each(?)
        ) UPDATE entries SET section_id = (SELECT section_id FROM requested WHERE requested.entry_id = entries.id),
          position = (SELECT target_position FROM requested WHERE requested.entry_id = entries.id),
          planned_start_minute = (SELECT planned_start_minute FROM requested WHERE requested.entry_id = entries.id)
        WHERE app_user_id = ? AND taskchute_day_id = ?
          AND id IN (SELECT entry_id FROM requested)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(assignmentsJson, appUserId, request.taskchute_day_id, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?) requested LEFT JOIN entries e
            ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = json_extract(requested.value, '$.entry_id')
            AND e.section_id IS json_extract(requested.value, '$.section_id')
            AND e.position = CAST(json_extract(requested.value, '$.target_position') AS INTEGER)
            AND e.planned_start_minute IS json_extract(requested.value, '$.planned_start_minute')
          WHERE e.id IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?) historical LEFT JOIN entries e
            ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = json_extract(historical.value, '$.id')
            AND e.section_id IS json_extract(historical.value, '$.section_id')
            AND e.position = CAST(json_extract(historical.value, '$.position') AS INTEGER)
            AND e.lifecycle_state = json_extract(historical.value, '$.lifecycle_state')
          WHERE e.id IS NULL
        ) THEN 1 ELSE 0 END WHERE EXISTS
        (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.taskchute_day_id, result.placement_revision,
          assignmentsJson, appUserId, request.taskchute_day_id, historicalJson, appUserId, request.taskchute_day_id,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'MoveEntry', ?, ?, 'success', ?, ? WHERE EXISTS
        (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.taskchute_day_id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_placement_revision) return reject("The placement revision is stale", true);
      return reject("Entry order or placement changed before MoveEntry could commit");
    }
    if (assertion?.meta.changes === 0 || operationPersist?.meta.changes === 0) return reject("MoveEntry could not be committed atomically");
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "MoveEntry", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
