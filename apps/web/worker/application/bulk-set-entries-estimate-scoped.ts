import type {
  BulkEstimateScopeInput,
  BulkSetEntriesEstimateScopedRequest,
  BulkSetEntriesEstimateScopedResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface SettingsRow { timezone: string; day_boundary_minutes: number; }
interface DayRow { id: string; logical_date: string; placement_revision: number; }

interface EntryState {
  id: string;
  taskchute_day_id: string;
  logical_date: string;
  lifecycle_state: "planned" | "running" | "completed";
  estimate_seconds: number | null;
  routine_occurrence_id: string | null;
  routine_definition_id: string | null;
  routine_origin_taskchute_day_id: string | null;
  estimate_override_present: number | null;
  estimate_override_seconds: number | null;
  default_estimate_seconds: number | null;
  defaults_revision: number | null;
  suppression_count: number;
}

interface DefinitionPlan {
  routine_definition_id: string;
  expected_defaults_revision: number;
  default_estimate_seconds: number | null;
  target_estimate_seconds: number | null;
}

interface OccurrencePlan {
  routine_occurrence_id: string;
  scope: "occurrence" | "definition";
  expected_override_present: number;
  expected_override_seconds: number | null;
  target_override_present: number;
  target_override_seconds: number | null;
}

interface EntryPlan extends EntryState {
  selected: boolean;
}

function isScopeInput(value: unknown): value is BulkEstimateScopeInput {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.entry_id !== "string" || !isUuidV7(body.entry_id)) return false;
  if (body.scope === "occurrence") return !Object.hasOwn(body, "expected_defaults_revision");
  return body.scope === "definition"
    && Number.isSafeInteger(body.expected_defaults_revision)
    && Number(body.expected_defaults_revision) >= 0;
}

export function isBulkSetEntriesEstimateScopedRequest(
  value: unknown,
): value is BulkSetEntriesEstimateScopedRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !Object.hasOwn(body, "user_id")
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && Array.isArray(body.entry_ids) && body.entry_ids.length > 0
    && body.entry_ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(body.entry_ids).size === body.entry_ids.length
    && (body.estimate_seconds === null
      || (Number.isSafeInteger(body.estimate_seconds) && Number(body.estimate_seconds) > 0))
    && Array.isArray(body.routine_scopes)
    && body.routine_scopes.every(isScopeInput)
    && new Set(body.routine_scopes.map((scope) => scope.entry_id)).size === body.routine_scopes.length;
}

function requestForFingerprint(request: BulkSetEntriesEstimateScopedRequest) {
  return {
    ...request,
    entry_ids: [...request.entry_ids].sort(),
    routine_scopes: [...request.routine_scopes].sort((left, right) => left.entry_id.localeCompare(right.entry_id)),
  };
}

async function reject(
  db: D1Database,
  appUserId: string,
  request: BulkSetEntriesEstimateScopedRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<BulkSetEntriesEstimateScopedResult> {
  return persistRejection<BulkSetEntriesEstimateScopedResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "BulkSetEntriesEstimateScoped",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

async function revisionReject(
  db: D1Database,
  appUserId: string,
  request: BulkSetEntriesEstimateScopedRequest,
  requestFingerprint: string,
  message: string,
): Promise<BulkSetEntriesEstimateScopedResult> {
  return persistRejection<BulkSetEntriesEstimateScopedResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "BulkSetEntriesEstimateScoped",
    requestFingerprint,
    outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message },
  });
}

function snapshotEntries(rows: EntryPlan[]): string {
  return JSON.stringify([...rows].sort((left, right) => left.id.localeCompare(right.id)).map((row) => ({
    id: row.id,
    taskchute_day_id: row.taskchute_day_id,
    lifecycle_state: row.lifecycle_state,
    estimate_seconds: row.estimate_seconds,
    routine_occurrence_id: row.routine_occurrence_id,
    routine_definition_id: row.routine_definition_id,
    routine_origin_taskchute_day_id: row.routine_origin_taskchute_day_id,
    estimate_override_present: row.estimate_override_present,
    estimate_override_seconds: row.estimate_override_seconds,
    suppression_count: row.suppression_count,
  })));
}

function snapshotDefinitions(rows: DefinitionPlan[]): string {
  return JSON.stringify([...rows].sort((left, right) => left.routine_definition_id.localeCompare(right.routine_definition_id)));
}

function snapshotOccurrences(rows: OccurrencePlan[]): string {
  return JSON.stringify([...rows].sort((left, right) => left.routine_occurrence_id.localeCompare(right.routine_occurrence_id)));
}

function targetQuery() {
  return `SELECT e.id, e.taskchute_day_id, d.logical_date, e.lifecycle_state, e.estimate_seconds,
      e.routine_occurrence_id, ro.routine_definition_id,
      ro.origin_taskchute_day_id AS routine_origin_taskchute_day_id,
      ro.estimate_override_present, ro.estimate_override_seconds,
      rd.default_estimate_seconds, rd.defaults_revision,
      (SELECT COUNT(*) FROM routine_occurrence_suppressions s
        WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id) AS suppression_count
    FROM entries e
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    LEFT JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id`;
}

export async function bulkSetEntriesEstimateScoped(
  db: D1Database,
  appUserId: string,
  request: BulkSetEntriesEstimateScopedRequest,
  nowInstant = new Date().toISOString(),
): Promise<BulkSetEntriesEstimateScopedResult> {
  const requestFingerprint = await fingerprint(requestForFingerprint(request));
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<BulkSetEntriesEstimateScopedResult>(
    prior, "BulkSetEntriesEstimateScoped", requestFingerprint,
  );

  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<SettingsRow>();
  if (!settings) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "TaskChuteDay is unavailable");
  const currentLogicalDate = resolveTaskChuteDay(nowInstant, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  }).logicalDate;
  const [currentDay, day] = await Promise.all([
    db.prepare("SELECT id, logical_date, placement_revision FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?")
      .bind(appUserId, currentLogicalDate).first<DayRow>(),
    db.prepare("SELECT id, logical_date, placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, request.taskchute_day_id).first<DayRow>(),
  ]);
  if (!day || !currentDay) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "TaskChuteDay is unavailable");
  if (day.logical_date < currentLogicalDate) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "Bulk estimate change is unavailable for a past TaskChuteDay",
  );

  const idsJson = JSON.stringify(request.entry_ids);
  const targets = (await db.prepare(`${targetQuery()}
    WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id IN (SELECT value FROM json_each(?))
    ORDER BY e.id`).bind(appUserId, request.taskchute_day_id, idsJson).all<EntryState>()).results;
  if (targets.length !== request.entry_ids.length) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "Every selected Entry must belong to this TaskChuteDay",
  );
  if (targets.some((target) => target.lifecycle_state !== "planned")) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "Only planned Entries can have their estimate changed in bulk",
  );
  const routineTargets = targets.filter((target) => target.routine_occurrence_id !== null);
  if (routineTargets.some((target) => target.routine_definition_id === null
    || target.routine_origin_taskchute_day_id !== request.taskchute_day_id
    || target.estimate_override_present === null || target.defaults_revision === null
    || target.suppression_count > 0)) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict", "A selected Routine Entry is unavailable for this bulk estimate change",
  );
  if (routineTargets.length > 0 && day.id !== currentDay.id) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "Routine-inclusive Bulk estimate change is available only for the current TaskChuteDay",
  );

  const scopeByEntry = new Map(request.routine_scopes.map((scope) => [scope.entry_id, scope]));
  if (scopeByEntry.size !== routineTargets.length
    || routineTargets.some((target) => !scopeByEntry.has(target.id))
    || request.routine_scopes.some((scope) => !routineTargets.some((target) => target.id === scope.entry_id))) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "Routine scope assignments must exactly cover selected Routine Entries",
  );

  const definitions = new Map<string, DefinitionPlan>();
  const occurrences = new Map<string, OccurrencePlan>();
  const routineOverrideChangedEntryIds: string[] = [];
  for (const target of routineTargets) {
    const scope = scopeByEntry.get(target.id)!;
    const definitionId = target.routine_definition_id!;
    const previousDefinition = definitions.get(definitionId);
    const isDefinition = scope.scope === "definition";
    if (previousDefinition && ((previousDefinition.expected_defaults_revision >= 0) !== isDefinition
      || (isDefinition && previousDefinition.expected_defaults_revision !== scope.expected_defaults_revision))) return reject(
      db, appUserId, request, requestFingerprint, "resource_conflict",
      "Selected Entries for one RoutineDefinition must use one consistent scope",
    );
    if (isDefinition && target.defaults_revision !== scope.expected_defaults_revision) return revisionReject(
      db, appUserId, request, requestFingerprint, "The Routine defaults revision is stale",
    );
    if (!previousDefinition) definitions.set(definitionId, {
      routine_definition_id: definitionId,
      expected_defaults_revision: isDefinition ? scope.expected_defaults_revision : -1,
      default_estimate_seconds: target.default_estimate_seconds,
      target_estimate_seconds: request.estimate_seconds,
    });
    const occurrenceId = target.routine_occurrence_id!;
    const targetOverridePresent = isDefinition ? 0 : 1;
    const targetOverrideSeconds = isDefinition ? null : request.estimate_seconds;
    const overrideChanged = target.estimate_override_present !== targetOverridePresent
      || target.estimate_override_seconds !== targetOverrideSeconds;
    if (!occurrences.has(occurrenceId)) occurrences.set(occurrenceId, {
      routine_occurrence_id: occurrenceId,
      scope: isDefinition ? "definition" : "occurrence",
      expected_override_present: target.estimate_override_present!,
      expected_override_seconds: target.estimate_override_seconds,
      target_override_present: targetOverridePresent,
      target_override_seconds: targetOverrideSeconds,
    });
    if (overrideChanged) routineOverrideChangedEntryIds.push(target.id);
  }

  const definitionPlans = [...definitions.values()].filter((definition) => definition.expected_defaults_revision >= 0);
  const definitionIdsJson = JSON.stringify(definitionPlans.map((definition) => definition.routine_definition_id));
  const selectedOccurrenceIdsJson = JSON.stringify([...occurrences.values()]
    .filter((occurrence) => occurrence.scope === "definition")
    .map((occurrence) => occurrence.routine_occurrence_id));
  const propagatedRows = definitionPlans.length === 0 ? [] : (await db.prepare(`${targetQuery()}
    JOIN routine_occurrences selected_ro ON selected_ro.app_user_id = e.app_user_id
      AND selected_ro.id = e.routine_occurrence_id
    WHERE e.app_user_id = ? AND selected_ro.routine_definition_id IN (SELECT value FROM json_each(?))
      AND e.lifecycle_state = 'planned' AND d.logical_date >= ?
      AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions s
        WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id)
      AND (selected_ro.estimate_override_present = 0
        OR selected_ro.id IN (SELECT value FROM json_each(?)))
    ORDER BY d.logical_date, e.id`).bind(
      appUserId, definitionIdsJson, currentDay.logical_date, selectedOccurrenceIdsJson,
    ).all<EntryState>()).results;

  const entryPlans = new Map<string, EntryPlan>();
  for (const target of targets) entryPlans.set(target.id, { ...target, selected: true });
  for (const target of propagatedRows) if (!entryPlans.has(target.id)) entryPlans.set(target.id, { ...target, selected: false });
  const plans = [...entryPlans.values()];
  const selectedIds = new Set(request.entry_ids);
  const changedEntryIds = request.entry_ids.filter((entryId) => entryPlans.get(entryId)!.estimate_seconds !== request.estimate_seconds);
  const propagatedEntryIds = propagatedRows
    .filter((row) => !selectedIds.has(row.id) && row.estimate_seconds !== request.estimate_seconds)
    .map((row) => row.id);
  const definitionChangedIds = definitionPlans.map((definition) => definition.routine_definition_id).sort();
  const defaultsRevisions = definitionPlans.map((definition) => ({
    routine_definition_id: definition.routine_definition_id,
    defaults_revision: definition.expected_defaults_revision + 1,
  })).sort((left, right) => left.routine_definition_id.localeCompare(right.routine_definition_id));
  routineOverrideChangedEntryIds.sort((left, right) => request.entry_ids.indexOf(left) - request.entry_ids.indexOf(right));

  const result: BulkSetEntriesEstimateScopedResult = {
    taskchute_day_id: request.taskchute_day_id,
    entry_ids: request.entry_ids,
    estimate_seconds: request.estimate_seconds,
    changed_entry_ids: changedEntryIds,
    propagated_entry_ids: propagatedEntryIds,
    routine_override_changed_entry_ids: routineOverrideChangedEntryIds,
    definition_changed_routine_definition_ids: definitionChangedIds,
    defaults_revisions: defaultsRevisions,
  };
  const entriesJson = snapshotEntries(plans);
  const definitionsJson = snapshotDefinitions(definitionPlans);
  const occurrencesJson = snapshotOccurrences([...occurrences.values()]);
  const assertionId = `bulk-estimate-scoped:${request.operation_id}`;

  try {
    const [guard, , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
        SELECT ?, ?, 'BulkSetEntriesEstimateScoped'
        WHERE EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND logical_date >= ?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN entries e ON e.app_user_id = ? AND e.id = json_extract(snapshot.value, '$.id')
            LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            WHERE e.id IS NULL OR e.taskchute_day_id != json_extract(snapshot.value, '$.taskchute_day_id')
              OR e.lifecycle_state != json_extract(snapshot.value, '$.lifecycle_state')
              OR COALESCE(e.estimate_seconds, -1) != COALESCE(json_extract(snapshot.value, '$.estimate_seconds'), -1)
              OR e.routine_occurrence_id IS NOT json_extract(snapshot.value, '$.routine_occurrence_id')
              OR e.routine_occurrence_id IS NOT NULL AND (
                ro.routine_definition_id IS NOT json_extract(snapshot.value, '$.routine_definition_id')
                OR ro.origin_taskchute_day_id IS NOT json_extract(snapshot.value, '$.routine_origin_taskchute_day_id')
                OR ro.estimate_override_present IS NOT CAST(json_extract(snapshot.value, '$.estimate_override_present') AS INTEGER)
                OR ro.estimate_override_seconds IS NOT json_extract(snapshot.value, '$.estimate_override_seconds')
              )
              OR (SELECT COUNT(*) FROM routine_occurrence_suppressions s
                WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id)
                != CAST(json_extract(snapshot.value, '$.suppression_count') AS INTEGER))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN routine_definitions rd ON rd.app_user_id = ?
              AND rd.id = json_extract(snapshot.value, '$.routine_definition_id')
            WHERE rd.id IS NULL OR rd.defaults_revision != CAST(json_extract(snapshot.value, '$.expected_defaults_revision') AS INTEGER)
              OR rd.default_estimate_seconds IS NOT json_extract(snapshot.value, '$.default_estimate_seconds'))
          AND NOT EXISTS (SELECT 1 FROM entries e
            JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
            JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            WHERE e.app_user_id = ? AND rd.id IN (SELECT value FROM json_each(?))
              AND e.lifecycle_state = 'planned' AND d.logical_date >= ?
              AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions s
                WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id)
              AND ro.estimate_override_present = 0
              AND NOT EXISTS (SELECT 1 FROM json_each(?) expected
                WHERE json_extract(expected.value, '$.id') = e.id))`).bind(
        appUserId, request.operation_id, appUserId, request.taskchute_day_id, currentLogicalDate,
        entriesJson, appUserId, definitionsJson, appUserId, appUserId, definitionIdsJson, currentDay.logical_date, entriesJson,
      ),
      db.prepare(`UPDATE routine_definitions SET default_estimate_seconds = ?, defaults_revision = defaults_revision + 1
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.routine_definition_id') FROM json_each(?))
          AND defaults_revision = (SELECT CAST(json_extract(value, '$.expected_defaults_revision') AS INTEGER)
            FROM json_each(?) WHERE json_extract(value, '$.routine_definition_id') = routine_definitions.id)
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.estimate_seconds, appUserId, definitionsJson, definitionsJson, appUserId, request.operation_id),
      db.prepare(`UPDATE routine_occurrences SET
          estimate_override_present = (SELECT CAST(json_extract(value, '$.target_override_present') AS INTEGER)
            FROM json_each(?) WHERE json_extract(value, '$.routine_occurrence_id') = routine_occurrences.id),
          estimate_override_seconds = (SELECT json_extract(value, '$.target_override_seconds')
            FROM json_each(?) WHERE json_extract(value, '$.routine_occurrence_id') = routine_occurrences.id)
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.routine_occurrence_id') FROM json_each(?))
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(occurrencesJson, occurrencesJson, appUserId, occurrencesJson, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET estimate_seconds = ?
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?))
          AND lifecycle_state = 'planned'
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.estimate_seconds, appUserId, entriesJson, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          NOT EXISTS (SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN entries e ON e.app_user_id = ? AND e.id = json_extract(snapshot.value, '$.id')
            WHERE e.id IS NULL OR COALESCE(e.estimate_seconds, -1) != COALESCE(?, -1) OR e.lifecycle_state != 'planned')
          AND NOT EXISTS (SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN routine_occurrences ro ON ro.app_user_id = ? AND ro.id = json_extract(snapshot.value, '$.routine_occurrence_id')
            WHERE ro.id IS NULL OR ro.estimate_override_present != CAST(json_extract(snapshot.value, '$.target_override_present') AS INTEGER)
              OR ro.estimate_override_seconds IS NOT json_extract(snapshot.value, '$.target_override_seconds'))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN routine_definitions rd ON rd.app_user_id = ?
              AND rd.id = json_extract(snapshot.value, '$.routine_definition_id')
            WHERE rd.id IS NULL OR rd.defaults_revision != CAST(json_extract(snapshot.value, '$.expected_defaults_revision') AS INTEGER) + 1
              OR COALESCE(rd.default_estimate_seconds, -1) != COALESCE(?, -1))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) expected
            JOIN entries e ON e.app_user_id = ? AND e.id = json_extract(expected.value, '$.id')
            JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
            WHERE rd.id IN (SELECT value FROM json_each(?)) AND e.lifecycle_state = 'planned'
              AND ro.estimate_override_present = 0 AND COALESCE(e.estimate_seconds, -1) != COALESCE(?, -1))
        THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, entriesJson, appUserId, request.estimate_seconds,
          occurrencesJson, appUserId, definitionsJson, appUserId, request.estimate_seconds,
          entriesJson, appUserId, definitionIdsJson, request.estimate_seconds,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
          request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'BulkSetEntriesEstimateScoped', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<BulkSetEntriesEstimateScopedResult>(
        committed, "BulkSetEntriesEstimateScoped", requestFingerprint,
      );
      const latestDefinitions = definitionPlans.length === 0 ? [] : (await db.prepare(
        "SELECT id, defaults_revision FROM routine_definitions WHERE app_user_id = ? AND id IN (SELECT value FROM json_each(?))",
      ).bind(appUserId, definitionIdsJson).all<{ id: string; defaults_revision: number }>()).results;
      if (definitionPlans.some((plan) => latestDefinitions.find((row) => row.id === plan.routine_definition_id)?.defaults_revision
        !== plan.expected_defaults_revision)) return revisionReject(
        db, appUserId, request, requestFingerprint, "The Routine defaults revision is stale",
      );
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Selected Entry or Routine state changed before the bulk estimate change could commit");
    }
    if (assertion?.meta.changes === 0 || operationPersist?.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The bulk estimate change did not converge", true);
    }
    return result;
  } catch (error) {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<BulkSetEntriesEstimateScopedResult>(
      committed, "BulkSetEntriesEstimateScoped", requestFingerprint,
    );
    throw new HttpError(503, "infrastructure_ambiguous", "The bulk estimate change outcome is unknown; reload canonical state and retry", true);
  }
}
