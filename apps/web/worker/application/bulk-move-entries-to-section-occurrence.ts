import type {
  BulkMoveEntriesToSectionOccurrenceRequest,
  BulkMoveEntriesToSectionOccurrenceResult,
  MoveEntryPlacementIntent,
} from "../../src/shared/contracts";
import { isSamePlannedStartCohort } from "../../src/shared/planned-entry-order";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isBulkMoveEntriesToSectionOccurrenceRequest(
  value: unknown,
): value is BulkMoveEntriesToSectionOccurrenceRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  const placement = body.placement;
  const placementValid = placement === undefined || (
    Boolean(placement) && typeof placement === "object"
      && (placement as Record<string, unknown>).kind === "relative_to_entry"
      && typeof (placement as Record<string, unknown>).anchor_entry_id === "string"
      && isUuidV7((placement as Record<string, unknown>).anchor_entry_id as string)
      && ((placement as Record<string, unknown>).edge === "before"
        || (placement as Record<string, unknown>).edge === "after")
  );
  return !(("user_id") in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && Array.isArray(body.entry_ids) && body.entry_ids.length > 0
    && body.entry_ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(body.entry_ids).size === body.entry_ids.length
    && (body.section_id === null || (typeof body.section_id === "string" && isUuidV7(body.section_id)))
    && Number.isSafeInteger(body.expected_placement_revision)
    && Number(body.expected_placement_revision) >= 0
    && placementValid;
}

interface SettingsRow {
  timezone: string;
  day_boundary_minutes: number;
}

interface DayRow {
  logical_date: string;
  placement_revision: number;
}

interface TargetRow {
  id: string;
  section_id: string | null;
  position: number;
  lifecycle_state: "planned" | "running" | "completed";
  planned_start_minute: number | null;
  routine_occurrence_id: string | null;
  routine_definition_id: string | null;
  routine_origin_taskchute_day_id: string | null;
  section_plan_override_present: number | null;
  section_override_id: string | null;
  planned_start_override_minute: number | null;
  suppression_count: number;
}

interface DisplayRow {
  id: string;
  section_id: string | null;
  position: number;
}

interface PlacementRow extends DisplayRow {
  lifecycle_state: "planned" | "running" | "completed";
  planned_start_minute: number | null;
}

interface PositionUpdate {
  entry_id: string;
  position: number;
}

interface RoutinePlan {
  entry_id: string;
  routine_occurrence_id: string;
  target_section_id: string | null;
  target_planned_start_minute: number | null;
  override_changed: boolean;
}

function sameNullable(left: string | number | null, right: string | number | null): boolean {
  return left === right;
}

function snapshotRows(rows: TargetRow[]): string {
  return JSON.stringify([...rows].sort((left, right) => left.id.localeCompare(right.id)).map((row) => ({
    id: row.id,
    section_id: row.section_id,
    position: row.position,
    lifecycle_state: row.lifecycle_state,
    planned_start_minute: row.planned_start_minute,
    routine_occurrence_id: row.routine_occurrence_id,
    routine_definition_id: row.routine_definition_id,
    routine_origin_taskchute_day_id: row.routine_origin_taskchute_day_id,
    section_plan_override_present: row.section_plan_override_present,
    section_override_id: row.section_override_id,
    planned_start_override_minute: row.planned_start_override_minute,
    suppression_count: row.suppression_count,
  })));
}

function requestForFingerprint(request: BulkMoveEntriesToSectionOccurrenceRequest) {
  return { ...request, entry_ids: [...request.entry_ids].sort() };
}

async function reject(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToSectionOccurrenceRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<BulkMoveEntriesToSectionOccurrenceResult> {
  return persistRejection<BulkMoveEntriesToSectionOccurrenceResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "BulkMoveEntriesToSectionOccurrence",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

async function bulkMoveEntriesToSectionOccurrenceAtPlacement(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToSectionOccurrenceRequest,
  requestFingerprint: string,
  currentLogicalDate: string,
  targetPlannedStart: number | null,
  targets: TargetRow[],
  now: string,
): Promise<BulkMoveEntriesToSectionOccurrenceResult> {
  const placement = request.placement as MoveEntryPlacementIntent;
  const displayRows = (await db.prepare(`SELECT e.id, e.section_id, e.position, e.lifecycle_state, e.planned_start_minute,
      COALESCE(c.context_order, -1) AS context_order
    FROM entries e
    LEFT JOIN taskchute_day_section_contexts c
      ON c.app_user_id = e.app_user_id AND c.taskchute_day_id = e.taskchute_day_id AND c.section_id = e.section_id
   WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
   ORDER BY CASE WHEN e.section_id IS NULL THEN -1 ELSE c.context_order END, e.position, e.id`)
    .bind(appUserId, request.taskchute_day_id).all<PlacementRow & { context_order: number }>()).results;
  const selectedSet = new Set(request.entry_ids);
  const selectedCanonical = displayRows.filter((row) => selectedSet.has(row.id));
  const anchor = displayRows.find((row) => row.id === placement.anchor_entry_id);
  if (selectedCanonical.length !== request.entry_ids.length || !anchor || selectedSet.has(anchor.id)
    || anchor.section_id !== request.section_id || anchor.lifecycle_state !== "planned") {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
      "The placement anchor must be an unselected planned Entry in the target Section");
  }

  const groups = new Map<string, PlacementRow[]>();
  for (const row of displayRows) {
    const key = row.section_id ?? "unsectioned";
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const targetKey = request.section_id ?? "unsectioned";
  const regrouped = new Map<string, PlacementRow[]>();
  for (const [key, group] of groups) regrouped.set(key, group.filter((row) => !selectedSet.has(row.id)));
  const remainingTarget = regrouped.get(targetKey) ?? [];
  const anchorIndex = remainingTarget.findIndex((row) => row.id === anchor.id);
  if (anchorIndex < 0) return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
    "The placement anchor is no longer available");
  remainingTarget.splice(anchorIndex + (placement.edge === "after" ? 1 : 0), 0, ...selectedCanonical);
  regrouped.set(targetKey, remainingTarget);

  // A same-Section block move must remain inside the existing planned-start cohorts.
  if (selectedCanonical.every((row) => row.section_id === request.section_id)) {
    const currentTargetPlanned = displayRows.filter((row) => row.section_id === request.section_id && row.lifecycle_state === "planned");
    const finalTargetPlanned = remainingTarget.filter((row) => row.lifecycle_state === "planned");
    if (currentTargetPlanned.length !== finalTargetPlanned.length
      || !finalTargetPlanned.every((row, index) => isSamePlannedStartCohort(row, currentTargetPlanned[index]))) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "Manual block move cannot cross planned-start cohorts");
    }
  }

  const affectedKeys = new Set<string>([targetKey, ...selectedCanonical.map((row) => row.section_id ?? "unsectioned")]);
  const finalPositionById = new Map<string, number>();
  const affectedIds: string[] = [];
  for (const key of affectedKeys) {
    for (const [index, row] of (regrouped.get(key) ?? []).entries()) {
      finalPositionById.set(row.id, index + 1);
      affectedIds.push(row.id);
    }
  }
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const changedEntryIds = request.entry_ids.filter((entryId) => {
    const target = targetById.get(entryId)!;
    return target.section_id !== request.section_id
      || target.planned_start_minute !== targetPlannedStart
      || target.position !== finalPositionById.get(entryId);
  });
  const routinePlans: RoutinePlan[] = request.entry_ids.flatMap((entryId) => {
    const target = targetById.get(entryId)!;
    if (target.routine_occurrence_id === null) return [];
    const overrideChanged = target.section_plan_override_present !== 1
      || !sameNullable(target.section_override_id, request.section_id)
      || !sameNullable(target.planned_start_override_minute, targetPlannedStart);
    return [{
      entry_id: target.id,
      routine_occurrence_id: target.routine_occurrence_id,
      target_section_id: request.section_id,
      target_planned_start_minute: targetPlannedStart,
      override_changed: overrideChanged,
    }];
  });
  const routineOverrideChangedEntryIds = routinePlans.filter((plan) => plan.override_changed).map((plan) => plan.entry_id);
  const positionUpdates = affectedIds.map((entryId) => ({ entry_id: entryId, position: finalPositionById.get(entryId)! }));
  const affectedIdsJson = JSON.stringify(affectedIds);
  const positionUpdatesJson = JSON.stringify(positionUpdates);
  const selectedExpectedJson = JSON.stringify(request.entry_ids.map((entryId) => ({
    entry_id: entryId,
    target_section_id: request.section_id,
    target_planned_start_minute: targetPlannedStart,
    position: finalPositionById.get(entryId),
  })));
  const snapshotJson = snapshotRows(targets);
  const routinePlansJson = JSON.stringify(routinePlans);
  const visibleChanged = changedEntryIds.length > 0;
  const result: BulkMoveEntriesToSectionOccurrenceResult = {
    taskchute_day_id: request.taskchute_day_id,
    entry_ids: request.entry_ids,
    changed_entry_ids: changedEntryIds,
    routine_override_changed_entry_ids: routineOverrideChangedEntryIds,
    section_id: request.section_id,
    planned_start_minute: targetPlannedStart,
    placement_revision: request.expected_placement_revision + (visibleChanged ? 1 : 0),
  };
  const assertionId = `bulk-section-occurrence:${request.operation_id}`;
  const shiftOffset = Math.max(...displayRows.map((row) => row.position), 0) + affectedIds.length + 1;

  try {
    const [guard, , , , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days
        WHERE app_user_id = ? AND id = ? AND placement_revision = ? AND logical_date >= ?
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM taskchute_day_section_contexts c
             WHERE c.app_user_id = ? AND c.taskchute_day_id = ? AND c.section_id = ?
               AND c.logical_start_minute IS NOT NULL AND c.logical_end_minute IS NOT NULL
          ))
          AND EXISTS (SELECT 1 FROM entries anchor WHERE anchor.app_user_id = ? AND anchor.taskchute_day_id = ?
            AND anchor.id = ? AND anchor.section_id IS ? AND anchor.position = ? AND anchor.lifecycle_state = 'planned')
          AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
            AND id IN (SELECT value FROM json_each(?))) = json_array_length(?)
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = json_extract(snapshot.value, '$.id')
            LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            WHERE e.id IS NULL OR e.section_id IS NOT json_extract(snapshot.value, '$.section_id')
              OR e.position != CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
              OR e.lifecycle_state != json_extract(snapshot.value, '$.lifecycle_state')
              OR e.planned_start_minute IS NOT json_extract(snapshot.value, '$.planned_start_minute')
              OR e.routine_occurrence_id IS NOT json_extract(snapshot.value, '$.routine_occurrence_id')
              OR ro.routine_definition_id IS NOT json_extract(snapshot.value, '$.routine_definition_id')
              OR ro.origin_taskchute_day_id IS NOT json_extract(snapshot.value, '$.routine_origin_taskchute_day_id')
              OR ro.section_plan_override_present IS NOT json_extract(snapshot.value, '$.section_plan_override_present')
              OR ro.section_override_id IS NOT json_extract(snapshot.value, '$.section_override_id')
              OR ro.planned_start_override_minute IS NOT json_extract(snapshot.value, '$.planned_start_override_minute')
              OR (SELECT COUNT(*) FROM routine_occurrence_suppressions s WHERE s.app_user_id = e.app_user_id
                AND s.routine_occurrence_id = e.routine_occurrence_id) != CAST(json_extract(snapshot.value, '$.suppression_count') AS INTEGER)
          )`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          request.expected_placement_revision, currentLogicalDate, request.section_id,
          appUserId, request.taskchute_day_id, request.section_id,
          appUserId, request.taskchute_day_id, placement.anchor_entry_id, request.section_id, anchor.position,
          appUserId, request.taskchute_day_id, JSON.stringify(request.entry_ids), JSON.stringify(request.entry_ids),
          snapshotJson, appUserId, request.taskchute_day_id),
      db.prepare(`UPDATE entries SET position = position + ?
        WHERE app_user_id = ? AND taskchute_day_id = ? AND id IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(shiftOffset, appUserId, request.taskchute_day_id, affectedIdsJson, appUserId, request.operation_id),
      db.prepare(`WITH requested(entry_id, position) AS (
          SELECT json_extract(value, '$.entry_id'), CAST(json_extract(value, '$.position') AS INTEGER) FROM json_each(?)
        )
        UPDATE entries SET section_id = ?, planned_start_minute = ?,
          position = (SELECT position FROM requested WHERE requested.entry_id = entries.id)
        WHERE app_user_id = ? AND taskchute_day_id = ? AND lifecycle_state = 'planned'
          AND id IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(selectedExpectedJson, request.section_id, targetPlannedStart, appUserId, request.taskchute_day_id,
          JSON.stringify(request.entry_ids), appUserId, request.operation_id),
      db.prepare(`WITH requested(entry_id, position) AS (
          SELECT json_extract(value, '$.entry_id'), CAST(json_extract(value, '$.position') AS INTEGER) FROM json_each(?)
        )
        UPDATE entries SET position = (SELECT position FROM requested WHERE requested.entry_id = entries.id)
        WHERE app_user_id = ? AND taskchute_day_id = ? AND id IN (SELECT entry_id FROM requested)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(positionUpdatesJson, appUserId, request.taskchute_day_id, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ? AND ? = 1
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, request.expected_placement_revision, visibleChanged ? 1 : 0, appUserId, request.operation_id),
      db.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 1,
          section_override_id = (SELECT json_extract(j.value, '$.target_section_id') FROM json_each(?) j
            WHERE json_extract(j.value, '$.routine_occurrence_id') = routine_occurrences.id
              AND CAST(json_extract(j.value, '$.override_changed') AS INTEGER) = 1),
          planned_start_override_minute = (SELECT json_extract(j.value, '$.target_planned_start_minute') FROM json_each(?) j
            WHERE json_extract(j.value, '$.routine_occurrence_id') = routine_occurrences.id
              AND CAST(json_extract(j.value, '$.override_changed') AS INTEGER) = 1)
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.routine_occurrence_id') FROM json_each(?)
          WHERE CAST(json_extract(value, '$.override_changed') AS INTEGER) = 1)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(routinePlansJson, routinePlansJson, appUserId, routinePlansJson, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) selected LEFT JOIN entries e
            ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = json_extract(selected.value, '$.entry_id')
            WHERE e.id IS NULL OR e.lifecycle_state != 'planned'
              OR e.section_id IS NOT json_extract(selected.value, '$.target_section_id')
              OR e.planned_start_minute IS NOT json_extract(selected.value, '$.target_planned_start_minute')
              OR e.position != CAST(json_extract(selected.value, '$.position') AS INTEGER))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) affected LEFT JOIN entries e
            ON e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = json_extract(affected.value, '$.entry_id')
            WHERE e.id IS NULL OR e.position != CAST(json_extract(affected.value, '$.position') AS INTEGER))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) plan JOIN routine_occurrences ro
            ON ro.app_user_id = ? AND ro.id = json_extract(plan.value, '$.routine_occurrence_id')
            WHERE ro.section_plan_override_present != 1
              OR ro.section_override_id IS NOT json_extract(plan.value, '$.target_section_id')
              OR ro.planned_start_override_minute IS NOT json_extract(plan.value, '$.target_planned_start_minute'))
          THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.taskchute_day_id, result.placement_revision,
          selectedExpectedJson, appUserId, request.taskchute_day_id,
          positionUpdatesJson, appUserId, request.taskchute_day_id,
          routinePlansJson, appUserId, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'BulkMoveEntriesToSectionOccurrence', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<BulkMoveEntriesToSectionOccurrenceResult>(committed, "BulkMoveEntriesToSectionOccurrence", requestFingerprint);
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.taskchute_day_id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_placement_revision) {
        return persistRejection<BulkMoveEntriesToSectionOccurrenceResult>(db, {
          appUserId, operationId: request.operation_id, commandType: "BulkMoveEntriesToSectionOccurrence", requestFingerprint,
          outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
        });
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Selected Entry or placement anchor changed before the block move could commit");
    }
    if (assertion?.meta.changes === 0 || operationPersist?.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The bulk block move did not converge", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<BulkMoveEntriesToSectionOccurrenceResult>(committed, "BulkMoveEntriesToSectionOccurrence", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The bulk block move outcome is unknown; reload canonical state and retry", true);
  }
}

export async function bulkMoveEntriesToSectionOccurrence(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToSectionOccurrenceRequest,
  now = new Date().toISOString(),
): Promise<BulkMoveEntriesToSectionOccurrenceResult> {
  const requestFingerprint = await fingerprint(requestForFingerprint(request));
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<BulkMoveEntriesToSectionOccurrenceResult>(
    prior,
    "BulkMoveEntriesToSectionOccurrence",
    requestFingerprint,
  );

  const [settingsResult, dayResult, sectionResult] = await db.batch([
    db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?").bind(appUserId),
    db.prepare(`SELECT logical_date, placement_revision FROM taskchute_days
      WHERE app_user_id = ? AND id = ?`).bind(appUserId, request.taskchute_day_id),
    request.section_id === null
      ? db.prepare("SELECT NULL AS id, NULL AS logical_start_minute WHERE false")
      : db.prepare(`SELECT section_id AS id, logical_start_minute, logical_end_minute
          FROM taskchute_day_section_contexts
         WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?
           AND logical_start_minute IS NOT NULL AND logical_end_minute IS NOT NULL`)
        .bind(appUserId, request.taskchute_day_id, request.section_id),
  ]);
  const settings = settingsResult.results[0] as SettingsRow | undefined;
  const day = dayResult.results[0] as DayRow | undefined;
  if (!settings || !day) return reject(
    db, appUserId, request, requestFingerprint, "resource_not_found", "TaskChuteDay is unavailable",
  );
  if (request.section_id !== null && sectionResult.results.length === 0) return reject(
    db, appUserId, request, requestFingerprint, "resource_not_found",
    "Section is unavailable in this TaskChuteDay",
  );

  const currentLogicalDate = resolveTaskChuteDay(now, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  }).logicalDate;
  if (day.logical_date < currentLogicalDate) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "Routine-inclusive Bulk Section change is available only for the current or a future TaskChuteDay",
  );
  if (day.placement_revision !== request.expected_placement_revision) {
    return persistRejection<BulkMoveEntriesToSectionOccurrenceResult>(db, {
      appUserId,
      operationId: request.operation_id,
      commandType: "BulkMoveEntriesToSectionOccurrence",
      requestFingerprint,
      outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }

  const idsJson = JSON.stringify(request.entry_ids);
  const targetResult = await db.prepare(`SELECT e.id, e.section_id, e.position, e.lifecycle_state,
      e.planned_start_minute, e.routine_occurrence_id,
      ro.routine_definition_id, ro.origin_taskchute_day_id AS routine_origin_taskchute_day_id,
      ro.section_plan_override_present,
      ro.section_override_id, ro.planned_start_override_minute,
      (SELECT COUNT(*) FROM routine_occurrence_suppressions s
        WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id) AS suppression_count
    FROM entries e
    LEFT JOIN routine_occurrences ro
      ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
      AND e.id IN (SELECT value FROM json_each(?))
    ORDER BY e.id`).bind(appUserId, request.taskchute_day_id, idsJson).all<TargetRow>();
  const targets = targetResult.results;
  if (targets.length !== request.entry_ids.length) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "Every selected Entry must belong to this TaskChuteDay",
  );
  if (targets.some((target) => target.lifecycle_state !== "planned")) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "Only planned Entries can have their Section changed in bulk",
  );
  if (targets.some((target) => target.routine_occurrence_id !== null && (
    target.routine_definition_id === null || target.routine_origin_taskchute_day_id !== request.taskchute_day_id
      || target.section_plan_override_present === null
  ))) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "A selected Routine Entry has an unavailable RoutineOccurrence",
  );
  if (targets.some((target) => target.routine_occurrence_id !== null && target.suppression_count > 0)) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "A selected Routine Entry is unavailable for this bulk Section change",
  );

  const targetPlannedStart = request.section_id === null
    ? null
    : (sectionResult.results[0] as { logical_start_minute: number }).logical_start_minute;
  if (request.placement) {
    return bulkMoveEntriesToSectionOccurrenceAtPlacement(
      db, appUserId, request, requestFingerprint, currentLogicalDate, targetPlannedStart, targets, now,
    );
  }
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const changedEntryIds = request.entry_ids.filter((entryId) => {
    const target = targetById.get(entryId)!;
    return !sameNullable(target.section_id, request.section_id)
      || !sameNullable(target.planned_start_minute, targetPlannedStart);
  });
  const routinePlans: RoutinePlan[] = request.entry_ids.flatMap((entryId) => {
    const target = targetById.get(entryId)!;
    if (target.routine_occurrence_id === null) return [];
    const overrideChanged = target.section_plan_override_present !== 1
      || !sameNullable(target.section_override_id, request.section_id)
      || !sameNullable(target.planned_start_override_minute, targetPlannedStart);
    return [{
      entry_id: target.id,
      routine_occurrence_id: target.routine_occurrence_id,
      target_section_id: request.section_id,
      target_planned_start_minute: targetPlannedStart,
      override_changed: overrideChanged,
    }];
  });
  const routineOverrideChangedEntryIds = routinePlans
    .filter((plan) => plan.override_changed)
    .map((plan) => plan.entry_id);

  const changedSet = new Set(changedEntryIds);
  const displayRows = (await db.prepare(`SELECT e.id, e.section_id, e.position,
      COALESCE(c.context_order, -1) AS context_order
    FROM entries e
    LEFT JOIN taskchute_day_section_contexts c
      ON c.app_user_id = e.app_user_id AND c.taskchute_day_id = e.taskchute_day_id AND c.section_id = e.section_id
   WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
   ORDER BY CASE WHEN e.section_id IS NULL THEN -1 ELSE c.context_order END, e.position, e.id`)
    .bind(appUserId, request.taskchute_day_id).all<DisplayRow & { context_order: number }>()).results;
  const movingIds = displayRows
    .filter((entry) => changedSet.has(entry.id) && entry.section_id !== request.section_id)
    .map((entry) => entry.id);
  const existingTargetPositions = displayRows
    .filter((entry) => entry.section_id === request.section_id)
    .map((entry) => entry.position);
  const nextPosition = Math.max(...existingTargetPositions, 0) + 1;
  const positionUpdates: PositionUpdate[] = movingIds.map((entryId, index) => ({
    entry_id: entryId,
    position: nextPosition + index,
  }));
  const positionUpdatesJson = JSON.stringify(positionUpdates);
  const selectedExpectedJson = JSON.stringify(request.entry_ids.map((entryId) => {
    const target = targetById.get(entryId)!;
    const position = positionUpdates.find((update) => update.entry_id === entryId)?.position ?? target.position;
    return {
      entry_id: entryId,
      target_section_id: request.section_id,
      target_planned_start_minute: targetPlannedStart,
      position,
    };
  }));
  const routinePlansJson = JSON.stringify(routinePlans);
  const snapshotJson = snapshotRows(targets);
  const visibleChanged = changedEntryIds.length > 0;
  const result: BulkMoveEntriesToSectionOccurrenceResult = {
    taskchute_day_id: request.taskchute_day_id,
    entry_ids: request.entry_ids,
    changed_entry_ids: changedEntryIds,
    routine_override_changed_entry_ids: routineOverrideChangedEntryIds,
    section_id: request.section_id,
    planned_start_minute: targetPlannedStart,
    placement_revision: request.expected_placement_revision + (visibleChanged ? 1 : 0),
  };
  const assertionId = `bulk-section-occurrence:${request.operation_id}`;

  try {
    const [guard, , , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days
        WHERE app_user_id = ? AND id = ? AND placement_revision = ? AND logical_date >= ?
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM taskchute_day_section_contexts c
             WHERE c.app_user_id = ? AND c.taskchute_day_id = ? AND c.section_id = ?
               AND c.logical_start_minute IS NOT NULL AND c.logical_end_minute IS NOT NULL
          ))
          AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
            AND id IN (SELECT value FROM json_each(?))) = json_array_length(?)
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ?
              AND e.id = json_extract(snapshot.value, '$.id')
            LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            WHERE e.id IS NULL
              OR e.section_id IS NOT json_extract(snapshot.value, '$.section_id')
              OR e.position != CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
              OR e.lifecycle_state != json_extract(snapshot.value, '$.lifecycle_state')
              OR e.planned_start_minute IS NOT json_extract(snapshot.value, '$.planned_start_minute')
              OR e.routine_occurrence_id IS NOT json_extract(snapshot.value, '$.routine_occurrence_id')
              OR ro.routine_definition_id IS NOT json_extract(snapshot.value, '$.routine_definition_id')
              OR ro.origin_taskchute_day_id IS NOT json_extract(snapshot.value, '$.routine_origin_taskchute_day_id')
              OR ro.section_plan_override_present IS NOT json_extract(snapshot.value, '$.section_plan_override_present')
              OR ro.section_override_id IS NOT json_extract(snapshot.value, '$.section_override_id')
              OR ro.planned_start_override_minute IS NOT json_extract(snapshot.value, '$.planned_start_override_minute')
              OR (SELECT COUNT(*) FROM routine_occurrence_suppressions s
                WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id)
                != CAST(json_extract(snapshot.value, '$.suppression_count') AS INTEGER)
          )`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          request.expected_placement_revision, currentLogicalDate, request.section_id,
          appUserId, request.taskchute_day_id, request.section_id,
          appUserId, request.taskchute_day_id, idsJson, idsJson,
          snapshotJson, appUserId, request.taskchute_day_id),
      db.prepare(`WITH requested(entry_id, position) AS (
          SELECT json_extract(value, '$.entry_id'), CAST(json_extract(value, '$.position') AS INTEGER)
            FROM json_each(?)
        )
        UPDATE entries SET section_id = ?, position = (SELECT position FROM requested WHERE requested.entry_id = entries.id),
          planned_start_minute = ?
        WHERE app_user_id = ? AND taskchute_day_id = ? AND lifecycle_state = 'planned'
          AND id IN (SELECT entry_id FROM requested)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(positionUpdatesJson, request.section_id, targetPlannedStart, appUserId, request.taskchute_day_id,
          appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET planned_start_minute = ?
        WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?
          AND lifecycle_state = 'planned' AND id IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(targetPlannedStart, appUserId, request.taskchute_day_id, request.section_id, idsJson,
          appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ? AND ? = 1
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, request.expected_placement_revision, visibleChanged ? 1 : 0,
          appUserId, request.operation_id),
      db.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 1,
          section_override_id = (SELECT json_extract(j.value, '$.target_section_id') FROM json_each(?) j
            WHERE json_extract(j.value, '$.routine_occurrence_id') = routine_occurrences.id
              AND CAST(json_extract(j.value, '$.override_changed') AS INTEGER) = 1),
          planned_start_override_minute = (SELECT json_extract(j.value, '$.target_planned_start_minute') FROM json_each(?) j
            WHERE json_extract(j.value, '$.routine_occurrence_id') = routine_occurrences.id
              AND CAST(json_extract(j.value, '$.override_changed') AS INTEGER) = 1)
        WHERE app_user_id = ?
          AND id IN (SELECT json_extract(value, '$.routine_occurrence_id') FROM json_each(?)
            WHERE CAST(json_extract(value, '$.override_changed') AS INTEGER) = 1)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(routinePlansJson, routinePlansJson, appUserId, routinePlansJson, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) selected
            LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ?
              AND e.id = json_extract(selected.value, '$.entry_id')
            WHERE e.id IS NULL OR e.lifecycle_state != 'planned'
              OR e.section_id IS NOT json_extract(selected.value, '$.target_section_id')
              OR e.planned_start_minute IS NOT json_extract(selected.value, '$.target_planned_start_minute')
              OR e.position != COALESCE((SELECT CAST(json_extract(p.value, '$.position') AS INTEGER)
                FROM json_each(?) p WHERE json_extract(p.value, '$.entry_id') = e.id), e.position)
          )
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) plan
            JOIN routine_occurrences ro ON ro.app_user_id = ?
              AND ro.id = json_extract(plan.value, '$.routine_occurrence_id')
            WHERE ro.section_plan_override_present != 1
              OR ro.section_override_id IS NOT json_extract(plan.value, '$.target_section_id')
              OR ro.planned_start_override_minute IS NOT json_extract(plan.value, '$.target_planned_start_minute')
          )
          THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.taskchute_day_id, result.placement_revision,
          selectedExpectedJson, appUserId, request.taskchute_day_id, positionUpdatesJson,
          routinePlansJson, appUserId, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'BulkMoveEntriesToSectionOccurrence', ?, ?, 'success', ?, ?
         WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<BulkMoveEntriesToSectionOccurrenceResult>(
        committed, "BulkMoveEntriesToSectionOccurrence", requestFingerprint,
      );
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.taskchute_day_id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_placement_revision) {
        return persistRejection<BulkMoveEntriesToSectionOccurrenceResult>(db, {
          appUserId,
          operationId: request.operation_id,
          commandType: "BulkMoveEntriesToSectionOccurrence",
          requestFingerprint,
          outcomeKind: "revision_conflict",
          result: { code: "revision_conflict", message: "The placement revision is stale" },
        });
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "Selected Entry or Routine occurrence state changed before the bulk Section change could commit");
    }
    if (assertion?.meta.changes === 0 || operationPersist?.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The bulk Routine Section change did not converge", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<BulkMoveEntriesToSectionOccurrenceResult>(
      committed, "BulkMoveEntriesToSectionOccurrence", requestFingerprint,
    );
    throw new HttpError(503, "infrastructure_ambiguous", "The bulk Routine Section change outcome is unknown; reload canonical state and retry", true);
  }
}
