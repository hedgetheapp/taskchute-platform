import type { BulkMoveEntriesToDayRequest, BulkMoveEntriesToDayResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { isLogicalDate, resolveTaskChuteDay, resolveTaskChuteDayForLogicalDate } from "../domain/taskchute-day";
import {
  readDaySectionContexts,
  readFutureDayEstablishmentPlan,
  type DayRow,
  type DaySectionContextRow,
  type SettingsRow,
} from "./load-current-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface SourceEntryRow {
  id: string;
  taskchute_day_id: string;
  section_id: string | null;
  position: number;
  lifecycle_state: "planned" | "running" | "completed";
  planned_start_minute: number | null;
  routine_occurrence_id: string | null;
  routine_origin_taskchute_day_id: string | null;
  section_plan_override_present: number | null;
  section_override_id: string | null;
  planned_start_override_minute: number | null;
  execution_count: number;
  suppression_count: number;
  context_order: number;
}

interface TargetDayState extends DayRow {
  isNew: boolean;
  contexts: DaySectionContextRow[];
}

interface Assignment {
  entry_id: string;
  target_section_id: string | null;
  target_planned_start_minute: number | null;
  target_position: number;
  routine_occurrence_id: string | null;
  routine_override_present: number;
}

export function isBulkMoveEntriesToDayRequest(value: unknown): value is BulkMoveEntriesToDayRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !("user_id" in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.source_taskchute_day_id === "string" && isUuidV7(body.source_taskchute_day_id)
    && Array.isArray(body.entry_ids) && body.entry_ids.length > 0
    && body.entry_ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(body.entry_ids).size === body.entry_ids.length
    && typeof body.target_logical_date === "string" && isLogicalDate(body.target_logical_date)
    && Number.isSafeInteger(body.expected_source_placement_revision)
    && Number(body.expected_source_placement_revision) >= 0
    && typeof body.allow_section_fallback === "boolean";
}

function semanticRequest(request: BulkMoveEntriesToDayRequest): BulkMoveEntriesToDayRequest {
  return { ...request, entry_ids: [...request.entry_ids].sort() };
}

async function reject(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToDayRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<BulkMoveEntriesToDayResult> {
  return persistRejection<BulkMoveEntriesToDayResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "BulkMoveEntriesToDay",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

function contextSnapshot(contexts: DaySectionContextRow[]): string {
  return JSON.stringify(contexts.map((context) => ({
    section_id: context.section_id,
    configuration_version_id: context.configuration_version_id,
    title: context.title,
    logical_start_minute: context.logical_start_minute,
    logical_end_minute: context.logical_end_minute,
    actual_start_instant: context.actual_start_instant,
    actual_end_instant: context.actual_end_instant,
    context_order: context.context_order,
  })));
}

function entrySnapshot(rows: SourceEntryRow[]): string {
  return JSON.stringify(rows.map((row) => ({
    id: row.id,
    taskchute_day_id: row.taskchute_day_id,
    section_id: row.section_id,
    position: row.position,
    lifecycle_state: row.lifecycle_state,
    planned_start_minute: row.planned_start_minute,
    routine_occurrence_id: row.routine_occurrence_id,
    routine_origin_taskchute_day_id: row.routine_origin_taskchute_day_id,
    section_plan_override_present: row.section_plan_override_present,
    section_override_id: row.section_override_id,
    planned_start_override_minute: row.planned_start_override_minute,
    execution_count: row.execution_count,
    suppression_count: row.suppression_count,
  })));
}

function assignmentsSnapshot(assignments: Assignment[]): string {
  return JSON.stringify(assignments);
}

function targetRevision(target: TargetDayState): number {
  return target.isNew ? 0 : target.placement_revision;
}

async function resolveTargetDay(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToDayRequest,
  currentLogicalDate: string,
  settings: SettingsRow,
): Promise<TargetDayState> {
  const existing = await db.prepare(`SELECT id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, placement_revision
    FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?`)
    .bind(appUserId, request.target_logical_date).first<DayRow>();
  if (existing) return { ...existing, isNew: false, contexts: await readDaySectionContexts(db, appUserId, existing.id) };
  if (request.target_logical_date <= currentLogicalDate) {
    throw new HttpError(409, "resource_conflict", "The target logical date is not an available future TaskChuteDay");
  }
  const plan = await readFutureDayEstablishmentPlan(db, appUserId, request.target_logical_date);
  if (!plan) throw new HttpError(409, "resource_conflict", "The target future TaskChuteDay could not be resolved");
  const resolved = resolveTaskChuteDayForLogicalDate(request.target_logical_date, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  });
  return {
    ...plan.day,
    id: request.operation_id,
    logical_date: resolved.logicalDate,
    start_instant: resolved.startInstant,
    end_instant: resolved.endInstant,
    establishment_timezone: resolved.timezone,
    establishment_boundary_minutes: resolved.boundaryMinutes,
    placement_revision: 0,
    isNew: true,
    contexts: plan.contexts,
  };
}

function targetContextMatches(
  context: DaySectionContextRow | undefined,
): context is DaySectionContextRow & { logical_start_minute: number; logical_end_minute: number } {
  return context !== undefined && context.logical_start_minute !== null && context.logical_end_minute !== null;
}

async function moveEntries(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToDayRequest,
  now: string,
  retryTargetRace: boolean,
): Promise<BulkMoveEntriesToDayResult> {
  const requestFingerprint = await fingerprint(semanticRequest(request));
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<BulkMoveEntriesToDayResult>(prior, "BulkMoveEntriesToDay", requestFingerprint);

  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<SettingsRow>();
  const sourceDay = await db.prepare(`SELECT id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, placement_revision
    FROM taskchute_days WHERE app_user_id = ? AND id = ?`)
    .bind(appUserId, request.source_taskchute_day_id).first<DayRow>();
  if (!settings || !sourceDay) return reject(
    db, appUserId, request, requestFingerprint, "resource_not_found", "Source TaskChuteDay is unavailable",
  );
  const currentLogicalDate = resolveTaskChuteDay(now, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  }).logicalDate;
  if (request.target_logical_date < currentLogicalDate) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "A date move cannot target a past TaskChuteDay",
  );
  if (request.target_logical_date === sourceDay.logical_date) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "A date move target must differ from the source Day",
  );
  if (sourceDay.placement_revision !== request.expected_source_placement_revision) {
    return persistRejection<BulkMoveEntriesToDayResult>(db, {
      appUserId,
      operationId: request.operation_id,
      commandType: "BulkMoveEntriesToDay",
      requestFingerprint,
      outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The source placement revision is stale" },
    });
  }

  let target: TargetDayState;
  try {
    target = await resolveTargetDay(db, appUserId, request, currentLogicalDate, settings);
  } catch (error) {
    if (error instanceof HttpError) return reject(db, appUserId, request, requestFingerprint, "resource_conflict", error.message);
    throw error;
  }
  const idsJson = JSON.stringify(request.entry_ids);
  const sourceRows = (await db.prepare(`SELECT e.id, e.taskchute_day_id, e.section_id, e.position, e.lifecycle_state,
      e.planned_start_minute, e.routine_occurrence_id,
      ro.origin_taskchute_day_id AS routine_origin_taskchute_day_id,
      ro.section_plan_override_present, ro.section_override_id, ro.planned_start_override_minute,
      (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id) AS execution_count,
      (SELECT COUNT(*) FROM routine_occurrence_suppressions x
        WHERE x.app_user_id = e.app_user_id AND x.routine_occurrence_id = e.routine_occurrence_id) AS suppression_count,
      COALESCE(c.context_order, -1) AS context_order
    FROM entries e
    LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    LEFT JOIN taskchute_day_section_contexts c
      ON c.app_user_id = e.app_user_id AND c.taskchute_day_id = e.taskchute_day_id AND c.section_id = e.section_id
    WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id IN (SELECT value FROM json_each(?))
    ORDER BY CASE WHEN e.section_id IS NULL THEN -1 ELSE COALESCE(c.context_order, 2147483647) END,
      CASE WHEN e.planned_start_minute IS NULL THEN 0 ELSE 1 END,
      e.planned_start_minute, e.position, e.id`).bind(appUserId, sourceDay.id, idsJson).all<SourceEntryRow>()).results;
  if (sourceRows.length !== request.entry_ids.length) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "Every selected Entry must belong to the source TaskChuteDay",
  );
  if (sourceRows.some((row) => row.lifecycle_state !== "planned")) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "Only planned Entries can be moved between Days",
  );
  if (sourceRows.some((row) => row.execution_count > 0)) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "An Entry with execution history cannot be moved safely",
  );
  if (sourceRows.some((row) => row.routine_occurrence_id !== null
    && (row.routine_origin_taskchute_day_id === null || row.section_plan_override_present === null || row.suppression_count > 0))) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "A selected Routine occurrence is unavailable");
  }
  if (sourceRows.some((row) => row.section_id === null && row.planned_start_minute !== null)) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "An unsectioned Entry has an invalid planned start",
  );

  const targetContextsBySection = new Map(target.contexts.map((context) => [context.section_id, context]));
  const fallbackEntryIds: string[] = [];
  const assignments: Assignment[] = [];
  const targetTailBySection = new Map<string, number>();
  const targetSectionIds = [...new Set(sourceRows.map((row) => row.section_id))];
  for (const sectionId of targetSectionIds) {
    const row = await db.prepare(`SELECT COALESCE(MAX(position), 0) AS max_position FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?`)
      .bind(appUserId, target.id, sectionId).first<{ max_position: number }>();
    targetTailBySection.set(sectionId ?? "", row?.max_position ?? 0);
  }
  for (const row of sourceRows) {
    let targetSectionId: string | null = null;
    let targetStart: number | null = null;
    if (row.section_id !== null) {
      const targetContext = targetContextsBySection.get(row.section_id);
      if (targetContextMatches(targetContext)) {
        targetSectionId = row.section_id;
        targetStart = targetContext.logical_start_minute;
      } else {
        fallbackEntryIds.push(row.id);
      }
    }
    const key = targetSectionId ?? "";
    const position = (targetTailBySection.get(key) ?? 0) + 1;
    targetTailBySection.set(key, position);
    assignments.push({
      entry_id: row.id,
      target_section_id: targetSectionId,
      target_planned_start_minute: targetStart,
      target_position: position,
      routine_occurrence_id: row.routine_occurrence_id,
      routine_override_present: row.section_plan_override_present === 1 ? 1 : 0,
    });
  }
  if (fallbackEntryIds.length > 0 && !request.allow_section_fallback) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "A source Section is unavailable in the target frozen context; explicit fallback acknowledgement is required",
  );

  const sourceSnapshotJson = entrySnapshot(sourceRows);
  const contextsJson = contextSnapshot(target.contexts);
  const assignmentsJson = assignmentsSnapshot(assignments);
  const targetExpectedRevision = targetRevision(target);
  const targetConfigurationVersionId = target.contexts[0]?.configuration_version_id ?? null;
  const sourceRevision = request.expected_source_placement_revision + 1;
  const targetFinalRevision = targetExpectedRevision + 1;
  const result: BulkMoveEntriesToDayResult = {
    source_taskchute_day_id: sourceDay.id,
    target_taskchute_day_id: target.id,
    target_logical_date: target.logical_date,
    moved_entry_ids: [...request.entry_ids].sort(),
    fallback_entry_ids: [...fallbackEntryIds].sort(),
    source_placement_revision: sourceRevision,
    target_placement_revision: targetFinalRevision,
  };
  const assertionId = `bulk-move-to-day:${request.operation_id}`;

  try {
    const [guard, , , , , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM taskchute_days source
          WHERE source.app_user_id = ? AND source.id = ? AND source.logical_date = ?
            AND source.placement_revision = ?)
          AND (SELECT COUNT(*) FROM entries e WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
            AND e.id IN (SELECT value FROM json_each(?))) = json_array_length(?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN entries e ON e.app_user_id = ? AND e.id = json_extract(snapshot.value, '$.id')
            LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            WHERE e.id IS NULL OR e.taskchute_day_id IS NOT json_extract(snapshot.value, '$.taskchute_day_id')
              OR e.section_id IS NOT json_extract(snapshot.value, '$.section_id')
              OR e.position != CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
              OR e.lifecycle_state != json_extract(snapshot.value, '$.lifecycle_state')
              OR e.planned_start_minute IS NOT json_extract(snapshot.value, '$.planned_start_minute')
              OR e.routine_occurrence_id IS NOT json_extract(snapshot.value, '$.routine_occurrence_id')
              OR ro.origin_taskchute_day_id IS NOT json_extract(snapshot.value, '$.routine_origin_taskchute_day_id')
              OR ro.section_plan_override_present IS NOT json_extract(snapshot.value, '$.section_plan_override_present')
              OR ro.section_override_id IS NOT json_extract(snapshot.value, '$.section_override_id')
              OR ro.planned_start_override_minute IS NOT json_extract(snapshot.value, '$.planned_start_override_minute')
              OR (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id)
                != CAST(json_extract(snapshot.value, '$.execution_count') AS INTEGER)
              OR (SELECT COUNT(*) FROM routine_occurrence_suppressions x
                WHERE x.app_user_id = e.app_user_id AND x.routine_occurrence_id = e.routine_occurrence_id)
                != CAST(json_extract(snapshot.value, '$.suppression_count') AS INTEGER))
          AND (
            (? = 0 AND EXISTS (SELECT 1 FROM taskchute_days target
              WHERE target.app_user_id = ? AND target.id = ? AND target.logical_date = ?
                AND target.placement_revision = ?
                AND (SELECT COUNT(*) FROM taskchute_day_section_contexts c
                  WHERE c.app_user_id = target.app_user_id AND c.taskchute_day_id = target.id) = json_array_length(?)
                AND NOT EXISTS (SELECT 1 FROM json_each(?) expected
                  LEFT JOIN taskchute_day_section_contexts c ON c.app_user_id = target.app_user_id
                    AND c.taskchute_day_id = target.id AND c.section_id = json_extract(expected.value, '$.section_id')
                  WHERE c.section_id IS NULL OR c.configuration_version_id IS NOT json_extract(expected.value, '$.configuration_version_id')
                    OR c.title IS NOT json_extract(expected.value, '$.title')
                    OR c.logical_start_minute IS NOT json_extract(expected.value, '$.logical_start_minute')
                    OR c.logical_end_minute IS NOT json_extract(expected.value, '$.logical_end_minute')
                    OR c.actual_start_instant IS NOT json_extract(expected.value, '$.actual_start_instant')
                    OR c.actual_end_instant IS NOT json_extract(expected.value, '$.actual_end_instant')
                    OR c.context_order != CAST(json_extract(expected.value, '$.context_order') AS INTEGER))))
            OR (? = 1 AND NOT EXISTS (SELECT 1 FROM taskchute_days target
              WHERE target.app_user_id = ? AND target.logical_date = ?)
              AND EXISTS (SELECT 1 FROM user_settings s WHERE s.app_user_id = ?
                AND s.timezone = ? AND s.day_boundary_minutes = ?)
              AND (? IS NULL OR EXISTS (SELECT 1 FROM section_configuration_heads h
                WHERE h.app_user_id = ? AND h.configuration_version_id = ?))))`)
        .bind(request.operation_id, appUserId, sourceDay.id, request.expected_source_placement_revision,
          appUserId, sourceDay.id, sourceDay.logical_date, request.expected_source_placement_revision,
          appUserId, sourceDay.id, idsJson, idsJson, sourceSnapshotJson, appUserId,
          target.isNew ? 1 : 0, appUserId, target.id, target.logical_date, targetExpectedRevision,
          contextsJson, contextsJson,
          target.isNew ? 1 : 0, appUserId, target.logical_date, appUserId,
          target.establishment_timezone, target.establishment_boundary_minutes,
          target.isNew ? targetConfigurationVersionId : null,
          appUserId, targetConfigurationVersionId),
      db.prepare(`INSERT INTO taskchute_days
        (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
         establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'compatible', 0, ?
        WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
          AND NOT EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?)`)
        .bind(target.id, appUserId, target.logical_date, target.start_instant, target.end_instant,
          target.establishment_timezone, target.establishment_boundary_minutes, now,
          appUserId, request.operation_id, appUserId, target.logical_date),
      db.prepare(`INSERT INTO taskchute_day_section_contexts
        (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
         logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
        SELECT ?, ?, json_extract(value, '$.section_id'), json_extract(value, '$.configuration_version_id'),
          json_extract(value, '$.title'), json_extract(value, '$.logical_start_minute'),
          json_extract(value, '$.logical_end_minute'), json_extract(value, '$.actual_start_instant'),
          json_extract(value, '$.actual_end_instant'), CAST(json_extract(value, '$.context_order') AS INTEGER)
        FROM json_each(?) WHERE EXISTS (SELECT 1 FROM placement_command_guards
          WHERE app_user_id = ? AND operation_id = ?) AND ? = 1`)
        .bind(appUserId, target.id, contextsJson, appUserId, request.operation_id, target.isNew ? 1 : 0),
      db.prepare(`WITH requested(entry_id, section_id, planned_start_minute, position) AS (
          SELECT json_extract(value, '$.entry_id'), json_extract(value, '$.target_section_id'),
            json_extract(value, '$.target_planned_start_minute'), CAST(json_extract(value, '$.target_position') AS INTEGER)
          FROM json_each(?)
        ) UPDATE entries SET taskchute_day_id = ?,
          section_id = (SELECT section_id FROM requested WHERE requested.entry_id = entries.id),
          planned_start_minute = (SELECT planned_start_minute FROM requested WHERE requested.entry_id = entries.id),
          position = (SELECT position FROM requested WHERE requested.entry_id = entries.id)
        WHERE app_user_id = ? AND taskchute_day_id = ? AND lifecycle_state = 'planned'
          AND id IN (SELECT entry_id FROM requested)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(assignmentsJson, target.id, appUserId, sourceDay.id, appUserId, request.operation_id),
      db.prepare(`UPDATE routine_occurrences SET
          section_override_id = (SELECT json_extract(value, '$.target_section_id') FROM json_each(?)
            WHERE json_extract(value, '$.routine_occurrence_id') = routine_occurrences.id
              AND CAST(json_extract(value, '$.routine_override_present') AS INTEGER) = 1),
          planned_start_override_minute = (SELECT json_extract(value, '$.target_planned_start_minute') FROM json_each(?)
            WHERE json_extract(value, '$.routine_occurrence_id') = routine_occurrences.id
              AND CAST(json_extract(value, '$.routine_override_present') AS INTEGER) = 1)
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.routine_occurrence_id') FROM json_each(?)
          WHERE CAST(json_extract(value, '$.routine_override_present') AS INTEGER) = 1)
          AND section_plan_override_present = 1
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(assignmentsJson, assignmentsJson, appUserId, assignmentsJson, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, sourceDay.id, request.expected_source_placement_revision, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, target.id, targetExpectedRevision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
          AND EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND logical_date = ?
            AND placement_revision = ?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) expected
            LEFT JOIN entries e ON e.app_user_id = ? AND e.id = json_extract(expected.value, '$.entry_id')
            WHERE e.id IS NULL OR e.taskchute_day_id IS NOT ? OR e.lifecycle_state <> 'planned'
              OR e.section_id IS NOT json_extract(expected.value, '$.target_section_id')
              OR e.planned_start_minute IS NOT json_extract(expected.value, '$.target_planned_start_minute')
              OR e.position != CAST(json_extract(expected.value, '$.target_position') AS INTEGER))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) expected
            JOIN routine_occurrences ro ON ro.app_user_id = ? AND ro.id = json_extract(expected.value, '$.routine_occurrence_id')
            WHERE CAST(json_extract(expected.value, '$.routine_override_present') AS INTEGER) = 1
              AND (ro.section_plan_override_present <> 1
                OR ro.section_override_id IS NOT json_extract(expected.value, '$.target_section_id')
                OR ro.planned_start_override_minute IS NOT json_extract(expected.value, '$.target_planned_start_minute')))
          AND (SELECT COUNT(*) FROM taskchute_day_section_contexts c
            WHERE c.app_user_id = ? AND c.taskchute_day_id = ?) = json_array_length(?)
          THEN 1 ELSE 0 END`)
        .bind(appUserId, assertionId, appUserId, sourceDay.id, sourceRevision,
          appUserId, target.id, target.logical_date, targetFinalRevision,
          assignmentsJson, appUserId, target.id, assignmentsJson, appUserId,
          appUserId, target.id, contextsJson),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'BulkMoveEntriesToDay', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), now, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<BulkMoveEntriesToDayResult>(committed, "BulkMoveEntriesToDay", requestFingerprint);
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, sourceDay.id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_source_placement_revision) return persistRejection<BulkMoveEntriesToDayResult>(db, {
        appUserId,
        operationId: request.operation_id,
        commandType: "BulkMoveEntriesToDay",
        requestFingerprint,
        outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The source placement revision is stale" },
      });
      if (retryTargetRace && target.isNew) {
        const racedTarget = await db.prepare("SELECT id FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?")
          .bind(appUserId, target.logical_date).first<{ id: string }>();
        if (racedTarget) return moveEntries(db, appUserId, request, now, false);
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The source or target placement changed before the move could commit");
    }
    if (assertion?.meta.changes === 0 || operationPersist?.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The date move did not converge", true);
    }
    return result;
  } catch (error) {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<BulkMoveEntriesToDayResult>(committed, "BulkMoveEntriesToDay", requestFingerprint);
    if (retryTargetRace && target.isNew) {
      const racedTarget = await db.prepare("SELECT id FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?")
        .bind(appUserId, target.logical_date).first<{ id: string }>();
      if (racedTarget) return moveEntries(db, appUserId, request, now, false);
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "infrastructure_ambiguous", "The date move outcome is unknown; reload canonical state and retry", true);
  }
}

export async function bulkMoveEntriesToDay(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToDayRequest,
  now = new Date().toISOString(),
): Promise<BulkMoveEntriesToDayResult> {
  return moveEntries(db, appUserId, request, now, true);
}
