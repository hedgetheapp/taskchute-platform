import type {
  BulkMoveEntriesToSectionScopedRequest,
  BulkMoveEntriesToSectionScopedResult,
  BulkRoutineSectionScopeInput,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

type ScopeInput = BulkRoutineSectionScopeInput;

interface SettingsRow {
  timezone: string;
  day_boundary_minutes: number;
}

interface DayRow {
  id: string;
  logical_date: string;
  placement_revision: number;
}

interface EntryState {
  id: string;
  taskchute_day_id: string;
  logical_date: string;
  placement_revision: number;
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
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  defaults_revision: number | null;
  suppression_count: number;
}

interface EntryPlan extends EntryState {
  target_section_id: string | null;
  target_planned_start_minute: number | null;
  target_position: number;
  selected: boolean;
}

interface DefinitionPlan {
  routine_definition_id: string;
  expected_defaults_revision: number;
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  target_section_id: string | null;
  target_planned_start_minute: number | null;
}

interface OccurrencePlan {
  routine_occurrence_id: string;
  action: "occurrence" | "definition";
  target_section_id: string | null;
  target_planned_start_minute: number | null;
  override_changed: boolean;
}

interface DisplayRow {
  id: string;
  taskchute_day_id: string;
  section_id: string | null;
  position: number;
  context_order: number;
}

interface DayPlan {
  taskchute_day_id: string;
  expected_placement_revision: number;
  visible_changed: boolean;
}

function isScopeInput(value: unknown): value is ScopeInput {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.entry_id !== "string" || !isUuidV7(body.entry_id)) return false;
  if (body.scope === "occurrence") return !Object.hasOwn(body, "expected_defaults_revision");
  return body.scope === "definition"
    && Number.isSafeInteger(body.expected_defaults_revision)
    && Number(body.expected_defaults_revision) >= 0;
}

export function isBulkMoveEntriesToSectionScopedRequest(
  value: unknown,
): value is BulkMoveEntriesToSectionScopedRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !Object.hasOwn(body, "user_id")
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && Array.isArray(body.entry_ids) && body.entry_ids.length > 0
    && body.entry_ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(body.entry_ids).size === body.entry_ids.length
    && (body.section_id === null || (typeof body.section_id === "string" && isUuidV7(body.section_id)))
    && Array.isArray(body.routine_scopes) && body.routine_scopes.length > 0
    && body.routine_scopes.every(isScopeInput)
    && new Set(body.routine_scopes.map((scope) => scope.entry_id)).size === body.routine_scopes.length
    && Number.isSafeInteger(body.expected_placement_revision)
    && Number(body.expected_placement_revision) >= 0;
}

function sameNullable(left: string | number | null, right: string | number | null): boolean {
  return left === right;
}

function requestForFingerprint(request: BulkMoveEntriesToSectionScopedRequest) {
  return {
    ...request,
    entry_ids: [...request.entry_ids].sort(),
    routine_scopes: [...request.routine_scopes].sort((left, right) => left.entry_id.localeCompare(right.entry_id)),
  };
}

function snapshotRows(rows: EntryPlan[]): string {
  return JSON.stringify([...rows].sort((left, right) => left.id.localeCompare(right.id)).map((row) => ({
    id: row.id,
    taskchute_day_id: row.taskchute_day_id,
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
    placement_revision: row.placement_revision,
  })));
}

async function reject(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToSectionScopedRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<BulkMoveEntriesToSectionScopedResult> {
  return persistRejection<BulkMoveEntriesToSectionScopedResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "BulkMoveEntriesToSectionScoped",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

async function revisionReject(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToSectionScopedRequest,
  requestFingerprint: string,
  message: string,
): Promise<BulkMoveEntriesToSectionScopedResult> {
  return persistRejection<BulkMoveEntriesToSectionScopedResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "BulkMoveEntriesToSectionScoped",
    requestFingerprint,
    outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message },
  });
}

function scopeFor(scopeByEntry: Map<string, ScopeInput>, entryId: string): ScopeInput {
  return scopeByEntry.get(entryId)!;
}

export async function bulkMoveEntriesToSectionScoped(
  db: D1Database,
  appUserId: string,
  request: BulkMoveEntriesToSectionScopedRequest,
  now = new Date().toISOString(),
): Promise<BulkMoveEntriesToSectionScopedResult> {
  const requestFingerprint = await fingerprint(requestForFingerprint(request));
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<BulkMoveEntriesToSectionScopedResult>(
    prior,
    "BulkMoveEntriesToSectionScoped",
    requestFingerprint,
  );

  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<SettingsRow>();
  const currentLogicalDate = settings
    ? resolveTaskChuteDay(now, { timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes }).logicalDate
    : null;
  const currentDay = currentLogicalDate === null ? null : await db.prepare(`SELECT id, logical_date, placement_revision
    FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?`).bind(appUserId, currentLogicalDate).first<DayRow>();
  const day = await db.prepare(`SELECT id, logical_date, placement_revision FROM taskchute_days
    WHERE app_user_id = ? AND id = ?`).bind(appUserId, request.taskchute_day_id).first<DayRow>();
  if (!settings || !currentDay || !day) return reject(
    db, appUserId, request, requestFingerprint, "resource_not_found", "TaskChuteDay is unavailable",
  );
  if (day.id !== currentDay.id || day.logical_date !== currentDay.logical_date) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "Routine-inclusive Bulk Section change is available only for the current TaskChuteDay",
  );
  if (request.expected_placement_revision !== day.placement_revision) return revisionReject(
    db, appUserId, request, requestFingerprint, "The placement revision is stale",
  );

  const currentSection = request.section_id === null
    ? null
    : await db.prepare(`SELECT logical_start_minute, logical_end_minute FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?
        AND logical_start_minute IS NOT NULL AND logical_end_minute IS NOT NULL`)
      .bind(appUserId, request.taskchute_day_id, request.section_id).first<{ logical_start_minute: number; logical_end_minute: number }>();
  if (request.section_id !== null && !currentSection) return reject(
    db, appUserId, request, requestFingerprint, "resource_not_found", "Section is unavailable in this TaskChuteDay",
  );
  const targetPlannedStart = currentSection?.logical_start_minute ?? null;
  const idsJson = JSON.stringify(request.entry_ids);
  const targetResult = await db.prepare(`SELECT e.id, e.taskchute_day_id, d.logical_date, d.placement_revision,
      e.section_id, e.position, e.lifecycle_state, e.planned_start_minute, e.routine_occurrence_id,
      ro.routine_definition_id, ro.origin_taskchute_day_id AS routine_origin_taskchute_day_id,
      ro.section_plan_override_present, ro.section_override_id, ro.planned_start_override_minute,
      rd.default_section_id, rd.default_planned_start_minute, rd.defaults_revision,
      (SELECT COUNT(*) FROM routine_occurrence_suppressions s
        WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id) AS suppression_count
    FROM entries e
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    LEFT JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
    WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
      AND e.id IN (SELECT value FROM json_each(?))
    ORDER BY e.id`).bind(appUserId, request.taskchute_day_id, idsJson).all<EntryState>();
  const targets = targetResult.results;
  if (targets.length !== request.entry_ids.length) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "Every selected Entry must belong to this TaskChuteDay",
  );
  if (targets.some((target) => target.lifecycle_state !== "planned")) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "Only planned Entries can have their Section changed in bulk",
  );
  if (targets.some((target) => target.routine_occurrence_id === null)) {
    // Ordinary rows are allowed in the mixed command, but never in routine_scopes.
  }
  if (targets.some((target) => target.routine_occurrence_id !== null && (
    target.routine_definition_id === null || target.routine_origin_taskchute_day_id !== request.taskchute_day_id
      || target.section_plan_override_present === null || target.defaults_revision === null
  ))) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "A selected Routine Entry has an unavailable RoutineOccurrence",
  );
  if (targets.some((target) => target.routine_occurrence_id !== null && target.suppression_count > 0)) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "A selected Routine Entry is unavailable for this bulk Section change",
  );

  const scopeByEntry = new Map(request.routine_scopes.map((scope) => [scope.entry_id, scope]));
  const routineTargets = targets.filter((target) => target.routine_occurrence_id !== null);
  if (routineTargets.length === 0) return reject(
    db, appUserId, request, requestFingerprint, "resource_conflict",
    "BulkMoveEntriesToSectionScoped requires at least one selected Routine Entry",
  );
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
    const scope = scopeFor(scopeByEntry, target.id);
    const definitionId = target.routine_definition_id!;
    const existingDefinition = definitions.get(definitionId);
    if (existingDefinition && (
      (existingDefinition.expected_defaults_revision !== (scope.scope === "definition" ? scope.expected_defaults_revision : -1))
      || (scope.scope === "definition") !== (existingDefinition.expected_defaults_revision >= 0)
    )) return reject(
      db, appUserId, request, requestFingerprint, "resource_conflict",
      "Selected Entries for one RoutineDefinition must use one consistent scope",
    );
    if (scope.scope === "definition") {
      if (target.defaults_revision !== scope.expected_defaults_revision) return revisionReject(
        db, appUserId, request, requestFingerprint, "The Routine defaults revision is stale",
      );
      if (!existingDefinition) definitions.set(definitionId, {
        routine_definition_id: definitionId,
        expected_defaults_revision: scope.expected_defaults_revision,
        default_section_id: target.default_section_id,
        default_planned_start_minute: target.default_planned_start_minute,
        target_section_id: request.section_id,
        target_planned_start_minute: targetPlannedStart,
      });
      const occurrenceId = target.routine_occurrence_id!;
      if (!occurrences.has(occurrenceId)) occurrences.set(occurrenceId, {
        routine_occurrence_id: occurrenceId,
        action: "definition",
        target_section_id: null,
        target_planned_start_minute: null,
        override_changed: target.section_plan_override_present === 1,
      });
      if (target.section_plan_override_present === 1) routineOverrideChangedEntryIds.push(target.id);
    } else {
      if (existingDefinition && existingDefinition.expected_defaults_revision >= 0) return reject(
        db, appUserId, request, requestFingerprint, "resource_conflict",
        "Selected Entries for one RoutineDefinition must use one consistent scope",
      );
      if (!existingDefinition) definitions.set(definitionId, {
        routine_definition_id: definitionId,
        expected_defaults_revision: -1,
        default_section_id: target.default_section_id,
        default_planned_start_minute: target.default_planned_start_minute,
        target_section_id: request.section_id,
        target_planned_start_minute: targetPlannedStart,
      });
      const occurrenceId = target.routine_occurrence_id!;
      const overrideChanged = target.section_plan_override_present !== 1
        || !sameNullable(target.section_override_id, request.section_id)
        || !sameNullable(target.planned_start_override_minute, targetPlannedStart);
      if (!occurrences.has(occurrenceId)) occurrences.set(occurrenceId, {
        routine_occurrence_id: occurrenceId,
        action: "occurrence",
        target_section_id: request.section_id,
        target_planned_start_minute: targetPlannedStart,
        override_changed: overrideChanged,
      });
      if (overrideChanged) routineOverrideChangedEntryIds.push(target.id);
    }
  }

  const definitionPlans = [...definitions.values()].filter((plan) => plan.expected_defaults_revision >= 0);
  const definitionIdsJson = JSON.stringify(definitionPlans.map((plan) => plan.routine_definition_id));
  const selectedDefinitionOccurrenceIds = [...occurrences.values()]
    .filter((plan) => plan.action === "definition").map((plan) => plan.routine_occurrence_id);
  const selectedDefinitionOccurrenceIdsJson = JSON.stringify(selectedDefinitionOccurrenceIds);
  const propagatedRows = definitionPlans.length === 0 ? [] : (await db.prepare(`SELECT e.id, e.taskchute_day_id, d.logical_date, d.placement_revision,
      e.section_id, e.position, e.lifecycle_state, e.planned_start_minute, e.routine_occurrence_id,
      ro.routine_definition_id, ro.origin_taskchute_day_id AS routine_origin_taskchute_day_id,
      ro.section_plan_override_present, ro.section_override_id, ro.planned_start_override_minute,
      rd.default_section_id, rd.default_planned_start_minute, rd.defaults_revision,
      (SELECT COUNT(*) FROM routine_occurrence_suppressions s
        WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id) AS suppression_count
    FROM entries e
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
    WHERE e.app_user_id = ? AND ro.routine_definition_id IN (SELECT value FROM json_each(?))
      AND e.lifecycle_state = 'planned' AND d.logical_date >= ?
      AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions s
        WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id)
      AND (ro.section_plan_override_present = 0 OR ro.id IN (SELECT value FROM json_each(?)))
    ORDER BY d.logical_date, e.id`).bind(
      appUserId, definitionIdsJson, currentDay.logical_date, selectedDefinitionOccurrenceIdsJson,
    ).all<EntryState>()).results;

  const entryPlans = new Map<string, EntryPlan>();
  for (const target of targets) entryPlans.set(target.id, {
    ...target,
    target_section_id: request.section_id,
    target_planned_start_minute: targetPlannedStart,
    target_position: target.position,
    selected: true,
  });
  for (const target of propagatedRows) {
    if (!entryPlans.has(target.id)) entryPlans.set(target.id, {
      ...target,
      target_section_id: request.section_id,
      target_planned_start_minute: targetPlannedStart,
      target_position: target.position,
      selected: false,
    });
  }
  const plans = [...entryPlans.values()];
  const affectedDayIds = [...new Set(plans.map((plan) => plan.taskchute_day_id))];
  const affectedDayIdsJson = JSON.stringify(affectedDayIds);
  if (request.section_id !== null) {
    const contexts = (await db.prepare(`SELECT taskchute_day_id, logical_start_minute, logical_end_minute
      FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND section_id = ?
        AND taskchute_day_id IN (SELECT value FROM json_each(?))
        AND logical_start_minute IS NOT NULL AND logical_end_minute IS NOT NULL`)
      .bind(appUserId, request.section_id, affectedDayIdsJson).all<{ taskchute_day_id: string; logical_start_minute: number; logical_end_minute: number }>()).results;
    const contextByDay = new Map(contexts.map((context) => [context.taskchute_day_id, context]));
    if (plans.some((plan) => {
      const context = contextByDay.get(plan.taskchute_day_id);
      return !context || targetPlannedStart === null
        || targetPlannedStart < context.logical_start_minute || targetPlannedStart >= context.logical_end_minute;
    })) return reject(
      db, appUserId, request, requestFingerprint, "resource_conflict",
      "The target Section is unavailable in an affected established TaskChuteDay context",
    );
  }

  const displayRows = (await db.prepare(`SELECT e.id, e.taskchute_day_id, e.section_id, e.position,
      COALESCE(c.context_order, -1) AS context_order
    FROM entries e
    LEFT JOIN taskchute_day_section_contexts c
      ON c.app_user_id = e.app_user_id AND c.taskchute_day_id = e.taskchute_day_id AND c.section_id = e.section_id
    WHERE e.app_user_id = ? AND e.taskchute_day_id IN (SELECT value FROM json_each(?))
    ORDER BY e.taskchute_day_id, CASE WHEN e.section_id IS NULL THEN -1 ELSE c.context_order END, e.position, e.id`)
    .bind(appUserId, affectedDayIdsJson).all<DisplayRow>()).results;
  const displayByDay = new Map<string, DisplayRow[]>();
  for (const row of displayRows) displayByDay.set(row.taskchute_day_id, [...(displayByDay.get(row.taskchute_day_id) ?? []), row]);
  const positionUpdates: Array<{ entry_id: string; position: number }> = [];
  const dayPlans: DayPlan[] = [];
  for (const dayId of affectedDayIds) {
    const dayEntries = displayByDay.get(dayId) ?? [];
    const dayEntriesById = new Map(dayEntries.map((entry) => [entry.id, entry]));
    const dayEntryPlans = plans.filter((plan) => plan.taskchute_day_id === dayId);
    if (dayEntryPlans.some((plan) => !dayEntriesById.has(plan.id))) return reject(
      db, appUserId, request, requestFingerprint, "resource_conflict", "An affected Entry is unavailable",
    );
    const targetPositions = dayEntries.filter((entry) => entry.section_id === request.section_id).map((entry) => entry.position);
    const nextPosition = Math.max(...targetPositions, 0) + 1;
    const movers = dayEntries.filter((entry) => {
      const plan = entryPlans.get(entry.id);
      return plan !== undefined && entry.section_id !== plan.target_section_id;
    });
    movers.forEach((entry, index) => {
      const position = nextPosition + index;
      entryPlans.get(entry.id)!.target_position = position;
      positionUpdates.push({ entry_id: entry.id, position });
    });
    const visibleChanged = dayEntryPlans.some((plan) => !sameNullable(plan.section_id, plan.target_section_id)
      || !sameNullable(plan.planned_start_minute, plan.target_planned_start_minute));
    const expectedRevision = dayEntryPlans[0]!.placement_revision;
    if (dayEntryPlans.some((plan) => plan.placement_revision !== expectedRevision)) return reject(
      db, appUserId, request, requestFingerprint, "resource_conflict", "An affected Day placement revision is inconsistent",
    );
    dayPlans.push({ taskchute_day_id: dayId, expected_placement_revision: expectedRevision, visible_changed: visibleChanged });
  }
  const definitionSnapshots = JSON.stringify([...definitions.values()].filter((plan) => plan.expected_defaults_revision >= 0));
  const occurrencePlans = [...occurrences.values()];
  const occurrencePlansJson = JSON.stringify(occurrencePlans);
  const plansJson = JSON.stringify(plans.map((plan) => ({
    id: plan.id,
    taskchute_day_id: plan.taskchute_day_id,
    section_id: plan.section_id,
    position: plan.position,
    lifecycle_state: plan.lifecycle_state,
    planned_start_minute: plan.planned_start_minute,
    routine_occurrence_id: plan.routine_occurrence_id,
    routine_definition_id: plan.routine_definition_id,
    routine_origin_taskchute_day_id: plan.routine_origin_taskchute_day_id,
    section_plan_override_present: plan.section_plan_override_present,
    section_override_id: plan.section_override_id,
    planned_start_override_minute: plan.planned_start_override_minute,
    suppression_count: plan.suppression_count,
    placement_revision: plan.placement_revision,
    target_section_id: plan.target_section_id,
    target_planned_start_minute: plan.target_planned_start_minute,
    target_position: plan.target_position,
  })));
  const dayPlansJson = JSON.stringify(dayPlans);
  const positionUpdatesJson = JSON.stringify(positionUpdates);
  const changedEntryIds = request.entry_ids.filter((entryId) => {
    const plan = entryPlans.get(entryId)!;
    return !sameNullable(plan.section_id, plan.target_section_id)
      || !sameNullable(plan.planned_start_minute, plan.target_planned_start_minute);
  });
  const propagatedEntryIds = positionUpdates
    .filter(({ entry_id }) => !entryPlans.get(entry_id)?.selected)
    .map(({ entry_id }) => entry_id);
  const definitionChangedIds = definitionPlans.map((plan) => plan.routine_definition_id).sort();
  const defaultsRevisions = definitionPlans.map((plan) => ({
    routine_definition_id: plan.routine_definition_id,
    defaults_revision: plan.expected_defaults_revision + 1,
  })).sort((left, right) => left.routine_definition_id.localeCompare(right.routine_definition_id));
  const affectedDayRevisions = dayPlans.map((plan) => ({
    taskchute_day_id: plan.taskchute_day_id,
    placement_revision: plan.expected_placement_revision + (plan.visible_changed ? 1 : 0),
  })).sort((left, right) => left.taskchute_day_id.localeCompare(right.taskchute_day_id));
  const result: BulkMoveEntriesToSectionScopedResult = {
    taskchute_day_id: request.taskchute_day_id,
    entry_ids: request.entry_ids,
    changed_entry_ids: changedEntryIds,
    propagated_entry_ids: propagatedEntryIds,
    routine_override_changed_entry_ids: routineOverrideChangedEntryIds,
    definition_changed_routine_definition_ids: definitionChangedIds,
    affected_day_revisions: affectedDayRevisions,
    defaults_revisions: defaultsRevisions,
    section_id: request.section_id,
    planned_start_minute: targetPlannedStart,
    placement_revision: request.expected_placement_revision
      + (dayPlans.find((plan) => plan.taskchute_day_id === request.taskchute_day_id)?.visible_changed ? 1 : 0),
  };
  routineOverrideChangedEntryIds.sort((left, right) => request.entry_ids.indexOf(left) - request.entry_ids.indexOf(right));
  const assertionId = `bulk-section-scoped:${request.operation_id}`;
  try {
    const [guard, , , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days
        WHERE app_user_id = ? AND id = ? AND logical_date = ? AND placement_revision = ?
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM taskchute_day_section_contexts c
             WHERE c.app_user_id = ? AND c.taskchute_day_id = ? AND c.section_id = ?
               AND c.logical_start_minute IS NOT NULL AND c.logical_end_minute IS NOT NULL
               AND c.logical_start_minute <= ? AND ? < c.logical_end_minute
          ))
          AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
            AND id IN (SELECT value FROM json_each(?))) = json_array_length(?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) p
            LEFT JOIN entries e ON e.app_user_id = ? AND e.id = json_extract(p.value, '$.id')
            LEFT JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
            LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            WHERE e.id IS NULL OR e.taskchute_day_id IS NOT json_extract(p.value, '$.taskchute_day_id')
              OR e.section_id IS NOT json_extract(p.value, '$.section_id')
              OR e.position != CAST(json_extract(p.value, '$.position') AS INTEGER)
              OR e.lifecycle_state != json_extract(p.value, '$.lifecycle_state')
              OR e.planned_start_minute IS NOT json_extract(p.value, '$.planned_start_minute')
              OR e.routine_occurrence_id IS NOT json_extract(p.value, '$.routine_occurrence_id')
              OR ro.routine_definition_id IS NOT json_extract(p.value, '$.routine_definition_id')
              OR ro.origin_taskchute_day_id IS NOT json_extract(p.value, '$.routine_origin_taskchute_day_id')
              OR ro.section_plan_override_present IS NOT json_extract(p.value, '$.section_plan_override_present')
              OR ro.section_override_id IS NOT json_extract(p.value, '$.section_override_id')
              OR ro.planned_start_override_minute IS NOT json_extract(p.value, '$.planned_start_override_minute')
              OR d.placement_revision != CAST(json_extract(p.value, '$.placement_revision') AS INTEGER)
              OR (SELECT COUNT(*) FROM routine_occurrence_suppressions s
                WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id)
                != CAST(json_extract(p.value, '$.suppression_count') AS INTEGER)
          )
          AND NOT EXISTS (SELECT 1 FROM json_each(?) r
            LEFT JOIN routine_definitions rd ON rd.app_user_id = ?
              AND rd.id = json_extract(r.value, '$.routine_definition_id')
            WHERE rd.id IS NULL OR rd.defaults_revision != CAST(json_extract(r.value, '$.expected_defaults_revision') AS INTEGER)
              OR rd.default_section_id IS NOT json_extract(r.value, '$.default_section_id')
              OR rd.default_planned_start_minute IS NOT json_extract(r.value, '$.default_planned_start_minute')
          )
          AND NOT EXISTS (SELECT 1 FROM json_each(?) p
            WHERE json_extract(p.value, '$.target_section_id') IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM taskchute_day_section_contexts c
                WHERE c.app_user_id = ? AND c.taskchute_day_id = json_extract(p.value, '$.taskchute_day_id')
                  AND c.section_id = json_extract(p.value, '$.target_section_id')
                  AND c.logical_start_minute IS NOT NULL AND c.logical_end_minute IS NOT NULL
                  AND c.logical_start_minute <= CAST(json_extract(p.value, '$.target_planned_start_minute') AS INTEGER)
                  AND CAST(json_extract(p.value, '$.target_planned_start_minute') AS INTEGER) < c.logical_end_minute
              ))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) d
            LEFT JOIN taskchute_days affected ON affected.app_user_id = ?
              AND affected.id = json_extract(d.value, '$.taskchute_day_id')
            WHERE affected.id IS NULL OR affected.placement_revision != CAST(json_extract(d.value, '$.expected_placement_revision') AS INTEGER))`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          currentDay.logical_date, request.expected_placement_revision, request.section_id,
          appUserId, request.taskchute_day_id, request.section_id, targetPlannedStart, targetPlannedStart,
          appUserId, request.taskchute_day_id, idsJson, idsJson, plansJson, appUserId,
          definitionSnapshots, appUserId, plansJson, appUserId, dayPlansJson, appUserId),
      db.prepare(`UPDATE routine_definitions SET default_section_id = (
          SELECT json_extract(r.value, '$.target_section_id') FROM json_each(?) r
           WHERE json_extract(r.value, '$.routine_definition_id') = routine_definitions.id),
          default_planned_start_minute = (
          SELECT json_extract(r.value, '$.target_planned_start_minute') FROM json_each(?) r
           WHERE json_extract(r.value, '$.routine_definition_id') = routine_definitions.id),
          defaults_revision = defaults_revision + 1
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.routine_definition_id') FROM json_each(?))
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(definitionSnapshots, definitionSnapshots, appUserId, definitionSnapshots, appUserId, request.operation_id),
      db.prepare(`UPDATE routine_occurrences SET
          section_plan_override_present = (SELECT CASE WHEN json_extract(r.value, '$.action') = 'occurrence' THEN 1 ELSE 0 END
            FROM json_each(?) r WHERE json_extract(r.value, '$.routine_occurrence_id') = routine_occurrences.id),
          section_override_id = (SELECT json_extract(r.value, '$.target_section_id')
            FROM json_each(?) r WHERE json_extract(r.value, '$.routine_occurrence_id') = routine_occurrences.id),
          planned_start_override_minute = (SELECT json_extract(r.value, '$.target_planned_start_minute')
            FROM json_each(?) r WHERE json_extract(r.value, '$.routine_occurrence_id') = routine_occurrences.id)
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.routine_occurrence_id') FROM json_each(?))
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(occurrencePlansJson, occurrencePlansJson, occurrencePlansJson, appUserId, occurrencePlansJson,
          appUserId, request.operation_id),
      db.prepare(`WITH requested(entry_id, section_id, planned_start_minute, position) AS (
          SELECT json_extract(value, '$.id'), json_extract(value, '$.target_section_id'),
            json_extract(value, '$.target_planned_start_minute'), CAST(json_extract(value, '$.target_position') AS INTEGER)
            FROM json_each(?)
        )
        UPDATE entries SET section_id = (SELECT section_id FROM requested WHERE requested.entry_id = entries.id),
          planned_start_minute = (SELECT planned_start_minute FROM requested WHERE requested.entry_id = entries.id),
          position = (SELECT position FROM requested WHERE requested.entry_id = entries.id)
        WHERE app_user_id = ? AND id IN (SELECT entry_id FROM requested) AND lifecycle_state = 'planned'
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(plansJson, appUserId, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.taskchute_day_id') FROM json_each(?)
          WHERE CAST(json_extract(value, '$.visible_changed') AS INTEGER) = 1)
          AND placement_revision = (SELECT CAST(json_extract(d.value, '$.expected_placement_revision') AS INTEGER)
            FROM json_each(?) d WHERE json_extract(d.value, '$.taskchute_day_id') = taskchute_days.id)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, dayPlansJson, dayPlansJson, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
          NOT EXISTS (SELECT 1 FROM json_each(?) p
            LEFT JOIN entries e ON e.app_user_id = ? AND e.id = json_extract(p.value, '$.id')
            WHERE e.id IS NULL OR e.lifecycle_state != 'planned'
              OR e.section_id IS NOT json_extract(p.value, '$.target_section_id')
              OR e.planned_start_minute IS NOT json_extract(p.value, '$.target_planned_start_minute')
              OR e.position != CAST(json_extract(p.value, '$.target_position') AS INTEGER))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) d
            LEFT JOIN taskchute_days affected ON affected.app_user_id = ?
              AND affected.id = json_extract(d.value, '$.taskchute_day_id')
            WHERE affected.id IS NULL OR affected.placement_revision != CAST(json_extract(d.value, '$.expected_placement_revision') AS INTEGER)
              + CASE WHEN CAST(json_extract(d.value, '$.visible_changed') AS INTEGER) = 1 THEN 1 ELSE 0 END)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) r
            LEFT JOIN routine_occurrences ro ON ro.app_user_id = ?
              AND ro.id = json_extract(r.value, '$.routine_occurrence_id')
            WHERE ro.id IS NULL
              OR ro.section_plan_override_present != CASE WHEN json_extract(r.value, '$.action') = 'occurrence' THEN 1 ELSE 0 END
              OR ro.section_override_id IS NOT CASE WHEN json_extract(r.value, '$.action') = 'occurrence'
                THEN json_extract(r.value, '$.target_section_id') ELSE NULL END
              OR ro.planned_start_override_minute IS NOT CASE WHEN json_extract(r.value, '$.action') = 'occurrence'
                THEN json_extract(r.value, '$.target_planned_start_minute') ELSE NULL END)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) d
            LEFT JOIN routine_definitions rd ON rd.app_user_id = ?
              AND rd.id = json_extract(d.value, '$.routine_definition_id')
            WHERE rd.id IS NULL OR rd.defaults_revision != CAST(json_extract(d.value, '$.expected_defaults_revision') AS INTEGER) + 1
              OR rd.default_section_id IS NOT json_extract(d.value, '$.target_section_id')
              OR rd.default_planned_start_minute IS NOT json_extract(d.value, '$.target_planned_start_minute'))
        THEN 1 ELSE 0 END WHERE EXISTS (
          SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, plansJson, appUserId, dayPlansJson, appUserId, occurrencePlansJson,
          appUserId, definitionSnapshots, appUserId, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
          request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'BulkMoveEntriesToSectionScoped', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<BulkMoveEntriesToSectionScopedResult>(
        committed, "BulkMoveEntriesToSectionScoped", requestFingerprint,
      );
      const latestDay = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.taskchute_day_id).first<{ placement_revision: number }>();
      if (latestDay?.placement_revision !== request.expected_placement_revision) return revisionReject(
        db, appUserId, request, requestFingerprint, "The placement revision is stale",
      );
      const latestDefinitions = definitionPlans.length === 0 ? [] : (await db.prepare(`SELECT id, defaults_revision
        FROM routine_definitions WHERE app_user_id = ? AND id IN (SELECT value FROM json_each(?))`)
        .bind(appUserId, definitionIdsJson).all<{ id: string; defaults_revision: number }>()).results;
      const latestDefinitionRevisions = new Map(latestDefinitions.map((definition) => [definition.id, definition.defaults_revision]));
      const staleDefinition = definitionPlans.some((plan) =>
        latestDefinitionRevisions.get(plan.routine_definition_id) !== plan.expected_defaults_revision);
      if (staleDefinition) return revisionReject(
        db, appUserId, request, requestFingerprint, "The Routine defaults revision is stale",
      );
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "Selected Entry, Routine, or affected Day state changed before the bulk Section change could commit");
    }
    if (assertion?.meta.changes === 0 || operationPersist?.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The scoped Routine Section change did not converge", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<BulkMoveEntriesToSectionScopedResult>(
      committed, "BulkMoveEntriesToSectionScoped", requestFingerprint,
    );
    throw new HttpError(503, "infrastructure_ambiguous", "The scoped Routine Section change outcome is unknown; reload canonical state and retry", true);
  }
}
