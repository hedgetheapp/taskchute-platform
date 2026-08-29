import type { ReorderEntriesRequest, ReorderEntriesResult } from "../../src/shared/contracts";
import { canonicalizeEntryOrder, isSamePlannedStartCohort } from "../../src/shared/planned-entry-order";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isReorderEntriesRequest(value: unknown): value is ReorderEntriesRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && (body.section_id === null || (typeof body.section_id === "string" && isUuidV7(body.section_id)))
    && Array.isArray(body.entry_ids) && body.entry_ids.length > 0
    && body.entry_ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(body.entry_ids).size === body.entry_ids.length
    && Number.isInteger(body.expected_placement_revision) && Number(body.expected_placement_revision) >= 0;
}

export async function reorderEntries(db: D1Database, appUserId: string, request: ReorderEntriesRequest): Promise<ReorderEntriesResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "ReorderEntries", requestFingerprint);
  const reject = (code: "resource_not_found" | "resource_conflict", message: string) => persistRejection<ReorderEntriesResult>(db, {
    appUserId, operationId: request.operation_id, commandType: "ReorderEntries", requestFingerprint,
    outcomeKind: "domain_rejection", result: { code, message },
  });
  const [dayResult, sectionResult, entriesResult] = await db.batch([
    db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?").bind(appUserId, request.taskchute_day_id),
    request.section_id ? db.prepare(`SELECT section_id AS id FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
      .bind(appUserId, request.taskchute_day_id, request.section_id) : db.prepare("SELECT 1 AS id"),
    db.prepare(`SELECT id, position, lifecycle_state, planned_start_minute FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ? ORDER BY position, id`)
      .bind(appUserId, request.taskchute_day_id, request.section_id),
  ]);
  const convergedBeforeMutation = await readOperation(db, appUserId, request.operation_id);
  if (convergedBeforeMutation) return replayOperation(convergedBeforeMutation, "ReorderEntries", requestFingerprint);
  const day = dayResult.results[0] as { placement_revision?: unknown } | undefined;
  if (!day || typeof day.placement_revision !== "number") return reject("resource_not_found", "TaskChuteDay is unavailable");
  if (sectionResult.results.length === 0) return reject("resource_not_found", "Section is unavailable");
  type ReorderRow = { id: string; position: number; lifecycle_state: "planned" | "running" | "completed"; planned_start_minute: number | null };
  const currentEntries = entriesResult.results as ReorderRow[];
  if (request.section_id === null && currentEntries.some((entry) => entry.planned_start_minute !== null)) {
    return reject("resource_conflict", "Section-less Entries cannot have a planned start");
  }
  const canonicalEntries = canonicalizeEntryOrder(currentEntries);
  const currentIds = canonicalEntries.map((row) => row.id);
  if (currentIds.length !== request.entry_ids.length || !request.entry_ids.every((id) => currentIds.includes(id))) {
    return reject("resource_conflict", "Reorder must contain every Entry in the Section exactly once");
  }
  if (canonicalEntries.some((entry, index) => entry.lifecycle_state !== "planned" && request.entry_ids[index] !== entry.id)) {
    return reject("resource_conflict", "Running or completed Entries must remain at their canonical positions");
  }
  let segment = 0;
  const plannedSegments = new Map<string, number>();
  const positionSegments: number[] = [];
  for (const entry of canonicalEntries) {
    positionSegments.push(segment);
    if (entry.lifecycle_state === "planned") plannedSegments.set(entry.id, segment);
    else segment += 1;
  }
  if (request.entry_ids.some((entryId, index) => {
    const plannedSegment = plannedSegments.get(entryId);
    return plannedSegment !== undefined && plannedSegment !== positionSegments[index];
  })) return reject("resource_conflict", "Planned Entries cannot cross running or completed Entries");
  const entriesById = new Map(canonicalEntries.map((entry) => [entry.id, entry]));
  if (request.entry_ids.some((entryId, index) => {
    const requestedEntry = entriesById.get(entryId);
    const canonicalSlot = canonicalEntries[index];
    return canonicalSlot?.lifecycle_state === "planned"
      && !isSamePlannedStartCohort(requestedEntry, canonicalSlot);
  })) return reject("resource_conflict", "Manual Reorder cannot cross planned-start cohorts");
  if (day.placement_revision !== request.expected_placement_revision) {
    return persistRejection(db, { appUserId, operationId: request.operation_id, commandType: "ReorderEntries", requestFingerprint,
      outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" } });
  }
  const result: ReorderEntriesResult = { taskchute_day_id: request.taskchute_day_id, section_id: request.section_id,
    entry_ids: request.entry_ids, placement_revision: request.expected_placement_revision + 1 };
  const assertionId = `reorder:${request.operation_id}`;
  const now = new Date().toISOString();
  const cohortJson = JSON.stringify(currentEntries);
  const plannedTargetsJson = JSON.stringify(currentEntries.flatMap((entry, index) => entry.lifecycle_state === "planned"
    ? [{ entry_id: request.entry_ids[index], target_position: entry.position }]
    : []));
  const shiftOffset = Math.max(...currentEntries.map((entry) => entry.position), 0) + currentEntries.length + 1;
  try {
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?
        AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?) = json_array_length(?)
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?) snapshot
          LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.section_id IS ?
            AND e.id = json_extract(snapshot.value, '$.id')
          WHERE e.id IS NULL
            OR e.position != CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
            OR e.lifecycle_state != json_extract(snapshot.value, '$.lifecycle_state')
            OR e.planned_start_minute IS NOT json_extract(snapshot.value, '$.planned_start_minute')
        )`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          request.expected_placement_revision, appUserId, request.taskchute_day_id, request.section_id, cohortJson,
          cohortJson, appUserId, request.taskchute_day_id, request.section_id),
      db.prepare(`UPDATE entries SET position = position + ?
        WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ? AND lifecycle_state = 'planned'
          AND id IN (SELECT json_extract(value, '$.entry_id') FROM json_each(?))
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(shiftOffset, appUserId, request.taskchute_day_id, request.section_id, plannedTargetsJson,
          appUserId, request.operation_id),
      db.prepare(`WITH requested(entry_id, target_position) AS (
          SELECT json_extract(value, '$.entry_id'), CAST(json_extract(value, '$.target_position') AS INTEGER)
          FROM json_each(?)
        )
        UPDATE entries SET position = (
          SELECT target_position FROM requested WHERE requested.entry_id = entries.id
        )
        WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?
          AND lifecycle_state = 'planned' AND id IN (SELECT entry_id FROM requested)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(plannedTargetsJson, appUserId, request.taskchute_day_id, request.section_id, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1 WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
        AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?) = json_array_length(?)
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?) requested
          LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.section_id IS ?
            AND e.id = json_extract(requested.value, '$.entry_id')
            AND e.position = CAST(json_extract(requested.value, '$.target_position') AS INTEGER)
            AND e.lifecycle_state = 'planned'
          WHERE e.id IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?) snapshot
          LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.section_id IS ?
            AND e.id = json_extract(snapshot.value, '$.id')
            AND e.position = CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
            AND e.lifecycle_state = json_extract(snapshot.value, '$.lifecycle_state')
          WHERE json_extract(snapshot.value, '$.lifecycle_state') != 'planned' AND e.id IS NULL
        )
        THEN 1 ELSE 0 END WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.taskchute_day_id, result.placement_revision,
          appUserId, request.taskchute_day_id, request.section_id, cohortJson,
          plannedTargetsJson, appUserId, request.taskchute_day_id, request.section_id,
          cohortJson, appUserId, request.taskchute_day_id, request.section_id,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'ReorderEntries', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ];
    const [guard] = await db.batch(statements);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "ReorderEntries", requestFingerprint);
      const [latestDay, latestEntries] = await db.batch([
        db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
          .bind(appUserId, request.taskchute_day_id),
        db.prepare(`SELECT id, position, lifecycle_state, planned_start_minute FROM entries
          WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ? ORDER BY position, id`)
          .bind(appUserId, request.taskchute_day_id, request.section_id),
      ]);
      if ((latestDay.results[0] as { placement_revision?: unknown } | undefined)?.placement_revision
        !== request.expected_placement_revision) {
        return persistRejection(db, { appUserId, operationId: request.operation_id, commandType: "ReorderEntries", requestFingerprint,
          outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" } });
      }
      const latestCohort = latestEntries.results as ReorderRow[];
      if (JSON.stringify(latestCohort) !== cohortJson) {
        return reject("resource_conflict", "Entry order or lifecycle changed before Reorder could commit");
      }
      throw new HttpError(503, "infrastructure_ambiguous", "The Reorder guard was not acquired", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "ReorderEntries", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
