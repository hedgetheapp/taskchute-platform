import type {
  SetRoutineEstimateRequest,
  SetRoutineEstimateResult,
  SetRoutineSectionPlanRequest,
  SetRoutineSectionPlanResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

type RoutineAction = "occurrence" | "definition" | "reset";

interface CurrentDayRow {
  id: string;
  logical_date: string;
}

interface RoutineEditRow {
  entry_id: string;
  taskchute_day_id: string;
  logical_date: string;
  placement_revision: number;
  section_id: string | null;
  position: number;
  lifecycle_state: string;
  estimate_seconds: number | null;
  planned_start_minute: number | null;
  routine_occurrence_id: string;
  routine_definition_id: string;
  section_plan_override_present: number;
  estimate_override_present: number;
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  default_estimate_seconds: number | null;
  defaults_revision: number;
}

interface SectionPlanTargetRow {
  entry_id: string;
  taskchute_day_id: string;
  logical_date: string;
  placement_revision: number;
  section_id: string | null;
  position: number;
  planned_start_minute: number | null;
  section_plan_override_present: number;
}

interface SectionPlanMutationPlan extends SectionPlanTargetRow {
  target_section_id: string | null;
  target_planned_start_minute: number | null;
  target_position: number;
  placement_changed: boolean;
}

function isAction(value: unknown): value is RoutineAction {
  return value === "occurrence" || value === "definition" || value === "reset";
}

function hasValidBase(body: Record<string, unknown>): boolean {
  return !("user_id" in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && isAction(body.action);
}

export function isSetRoutineEstimateRequest(value: unknown): value is SetRoutineEstimateRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (!hasValidBase(body)) return false;
  if (body.action === "reset") return !("estimate_seconds" in body) && !("expected_defaults_revision" in body);
  if (!(body.estimate_seconds === null
    || (Number.isSafeInteger(body.estimate_seconds) && Number(body.estimate_seconds) > 0))) return false;
  return body.action === "occurrence"
    ? !("expected_defaults_revision" in body)
    : Number.isSafeInteger(body.expected_defaults_revision) && Number(body.expected_defaults_revision) >= 0;
}

export function isSetRoutineSectionPlanRequest(value: unknown): value is SetRoutineSectionPlanRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (!hasValidBase(body)
    || !Number.isSafeInteger(body.expected_placement_revision)
    || Number(body.expected_placement_revision) < 0) return false;
  if (body.action === "reset") {
    return !("section_id" in body) && !("planned_start_minute" in body) && !("expected_defaults_revision" in body);
  }
  const validPair = (body.section_id === null && body.planned_start_minute === null)
    || (typeof body.section_id === "string" && isUuidV7(body.section_id)
      && Number.isSafeInteger(body.planned_start_minute) && Number(body.planned_start_minute) >= 0);
  if (!validPair) return false;
  return body.action === "occurrence"
    ? !("expected_defaults_revision" in body)
    : Number.isSafeInteger(body.expected_defaults_revision) && Number(body.expected_defaults_revision) >= 0;
}

async function readCurrentDay(db: D1Database, appUserId: string, nowInstant: string): Promise<CurrentDayRow | null> {
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  if (!settings) return null;
  const resolved = resolveTaskChuteDay(nowInstant, { timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes });
  return db.prepare("SELECT id, logical_date FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?")
    .bind(appUserId, resolved.logicalDate).first<CurrentDayRow>();
}

async function readRoutineEditRow(db: D1Database, appUserId: string, entryId: string): Promise<RoutineEditRow | null> {
  return db.prepare(`SELECT e.id AS entry_id, e.taskchute_day_id, d.logical_date, d.placement_revision,
      e.section_id, e.position, e.lifecycle_state, e.estimate_seconds, e.planned_start_minute,
      ro.id AS routine_occurrence_id, ro.routine_definition_id,
      ro.section_plan_override_present, ro.estimate_override_present,
      rd.default_section_id, rd.default_planned_start_minute, rd.default_estimate_seconds, rd.defaults_revision
    FROM entries e
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
    WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, entryId).first<RoutineEditRow>();
}

async function reject<T>(
  db: D1Database,
  appUserId: string,
  operationId: string,
  commandType: "SetRoutineEstimate" | "SetRoutineSectionPlan",
  requestFingerprint: string,
  message: string,
  revision = false,
): Promise<T> {
  return persistRejection(db, {
    appUserId,
    operationId,
    commandType,
    requestFingerprint,
    outcomeKind: revision ? "revision_conflict" : "domain_rejection",
    result: { code: revision ? "revision_conflict" : "resource_conflict", message },
  });
}

function isEditableCurrentRoutine(row: RoutineEditRow | null, currentDay: CurrentDayRow | null, requestedDayId: string): row is RoutineEditRow {
  return row !== null && currentDay !== null && row.taskchute_day_id === requestedDayId
    && row.taskchute_day_id === currentDay.id && row.lifecycle_state === "planned";
}

export async function setRoutineEstimate(
  db: D1Database,
  appUserId: string,
  request: SetRoutineEstimateRequest,
  nowInstant = new Date().toISOString(),
): Promise<SetRoutineEstimateResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "SetRoutineEstimate", requestFingerprint);
  const [currentDay, row] = await Promise.all([
    readCurrentDay(db, appUserId, nowInstant),
    readRoutineEditRow(db, appUserId, request.entry_id),
  ]);
  if (!isEditableCurrentRoutine(row, currentDay, request.taskchute_day_id)) {
    return reject(db, appUserId, request.operation_id, "SetRoutineEstimate", requestFingerprint,
      "Only a current-Day planned Routine Entry estimate can be edited");
  }
  const activeDay = currentDay!;
  if (request.action === "definition" && row.defaults_revision !== request.expected_defaults_revision) {
    return reject(db, appUserId, request.operation_id, "SetRoutineEstimate", requestFingerprint,
      "The Routine defaults revision is stale", true);
  }

  const targetEstimate = request.action === "reset" ? row.default_estimate_seconds : request.estimate_seconds;
  const targetOverridePresent = request.action === "occurrence";
  const result: SetRoutineEstimateResult = {
    entry_id: row.entry_id,
    estimate_seconds: targetEstimate,
    estimate_override_present: targetOverridePresent,
    defaults_revision: row.defaults_revision + (request.action === "definition" ? 1 : 0),
  };
  const assertionId = `routine-estimate:${request.operation_id}`;
  const now = new Date().toISOString();
  try {
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
        SELECT ?, ?, 'SetRoutineEstimate' WHERE EXISTS (
          SELECT 1 FROM entries e
          JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
          JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
          WHERE e.app_user_id = ? AND e.id = ? AND e.taskchute_day_id = ? AND e.lifecycle_state = 'planned'
            AND ro.id = ? AND rd.id = ? AND rd.defaults_revision = ?
        )`).bind(appUserId, request.operation_id, appUserId, row.entry_id, row.taskchute_day_id,
          row.routine_occurrence_id, row.routine_definition_id, row.defaults_revision),
    ];

    if (request.action === "definition") {
      statements.push(
        db.prepare(`UPDATE routine_definitions SET default_estimate_seconds = ?, defaults_revision = defaults_revision + 1
          WHERE app_user_id = ? AND id = ? AND defaults_revision = ? AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(targetEstimate, appUserId, row.routine_definition_id, request.expected_defaults_revision,
            appUserId, request.operation_id),
        db.prepare(`UPDATE routine_occurrences SET estimate_override_present = 0, estimate_override_seconds = NULL
          WHERE app_user_id = ? AND id = ? AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, row.routine_occurrence_id, appUserId, request.operation_id),
        db.prepare(`UPDATE entries SET estimate_seconds = ? WHERE app_user_id = ? AND lifecycle_state = 'planned'
          AND routine_occurrence_id IN (
            SELECT ro.id FROM routine_occurrences ro
            JOIN taskchute_days d ON d.app_user_id = ro.app_user_id AND d.id = ro.origin_taskchute_day_id
            WHERE ro.app_user_id = ? AND ro.routine_definition_id = ? AND ro.estimate_override_present = 0
              AND d.logical_date >= ?
          ) AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
            .bind(targetEstimate, appUserId, appUserId, row.routine_definition_id, activeDay.logical_date,
            appUserId, request.operation_id),
      );
    } else if (request.action === "occurrence") {
      statements.push(
        db.prepare(`UPDATE routine_occurrences SET estimate_override_present = 1, estimate_override_seconds = ?
          WHERE app_user_id = ? AND id = ? AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(targetEstimate, appUserId, row.routine_occurrence_id, appUserId, request.operation_id),
        db.prepare(`UPDATE entries SET estimate_seconds = ? WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(targetEstimate, appUserId, row.entry_id, appUserId, request.operation_id),
      );
    } else {
      statements.push(
        db.prepare(`UPDATE routine_occurrences SET estimate_override_present = 0, estimate_override_seconds = NULL
          WHERE app_user_id = ? AND id = ? AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, row.routine_occurrence_id, appUserId, request.operation_id),
        db.prepare(`UPDATE entries SET estimate_seconds = (
            SELECT rd.default_estimate_seconds FROM routine_occurrences ro
            JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
            WHERE ro.app_user_id = entries.app_user_id AND ro.id = entries.routine_occurrence_id
          ) WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, row.entry_id, appUserId, request.operation_id),
      );
    }

    statements.push(
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM entries e JOIN routine_occurrences ro
          ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
          JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
          WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = 'planned'
            AND e.estimate_seconds IS ? AND ro.estimate_override_present = ?
            AND ro.estimate_override_seconds IS ? AND rd.defaults_revision = ?)
        THEN 1 ELSE 0 END WHERE EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, row.entry_id, targetEstimate,
          targetOverridePresent ? 1 : 0, targetOverridePresent ? targetEstimate : null,
          result.defaults_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetRoutineEstimate', ?, ?, 'success', ?, ? WHERE EXISTS (
          SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), now, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    );
    const results = await db.batch(statements);
    if (results[0]?.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "SetRoutineEstimate", requestFingerprint);
      const latest = await readRoutineEditRow(db, appUserId, row.entry_id);
      if (request.action === "definition" && latest?.defaults_revision !== request.expected_defaults_revision) {
        return reject(db, appUserId, request.operation_id, "SetRoutineEstimate", requestFingerprint,
          "The Routine defaults revision is stale", true);
      }
      return reject(db, appUserId, request.operation_id, "SetRoutineEstimate", requestFingerprint,
        "Routine estimate state changed before commit");
    }
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (!committed) throw new Error("Routine estimate committed without an operation result");
    return replayOperation(committed, "SetRoutineEstimate", requestFingerprint);
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "SetRoutineEstimate", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine estimate outcome is unknown; reload and retry", true);
  }
}

async function validateSectionPair(
  db: D1Database,
  appUserId: string,
  dayId: string,
  sectionId: string | null,
  plannedStart: number | null,
): Promise<boolean> {
  if (sectionId === null || plannedStart === null) return sectionId === null && plannedStart === null;
  const rows = await db.prepare(`SELECT section_id FROM taskchute_day_section_contexts
    WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?
      AND logical_start_minute IS NOT NULL AND logical_end_minute IS NOT NULL
      AND logical_start_minute <= ? AND ? < logical_end_minute LIMIT 2`)
    .bind(appUserId, dayId, sectionId, plannedStart, plannedStart).all();
  return rows.results.length === 1;
}

async function buildSectionPlans(
  db: D1Database,
  appUserId: string,
  row: RoutineEditRow,
  currentLogicalDate: string,
  action: RoutineAction,
  sectionId: string | null,
  plannedStart: number | null,
): Promise<SectionPlanMutationPlan[] | null> {
  const targets = action === "definition"
    ? await db.prepare(`SELECT e.id AS entry_id, e.taskchute_day_id, d.logical_date, d.placement_revision,
        e.section_id, e.position, e.planned_start_minute, ro.section_plan_override_present
      FROM entries e
      JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
      JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      WHERE e.app_user_id = ? AND ro.routine_definition_id = ? AND e.lifecycle_state = 'planned'
        AND d.logical_date >= ? AND (ro.section_plan_override_present = 0 OR e.id = ?)
      ORDER BY d.logical_date, e.id`).bind(appUserId, row.routine_definition_id, currentLogicalDate, row.entry_id)
      .all<SectionPlanTargetRow>()
    : { results: [{ entry_id: row.entry_id, taskchute_day_id: row.taskchute_day_id,
        logical_date: row.logical_date, placement_revision: row.placement_revision,
        section_id: row.section_id, position: row.position, planned_start_minute: row.planned_start_minute,
        section_plan_override_present: row.section_plan_override_present }] };
  for (const target of targets.results) {
    if (!await validateSectionPair(db, appUserId, target.taskchute_day_id, sectionId, plannedStart)) return null;
  }
  const allEntries = await db.prepare(`SELECT taskchute_day_id, section_id, MAX(position) AS max_position
    FROM entries WHERE app_user_id = ? GROUP BY taskchute_day_id, section_id`).bind(appUserId)
    .all<{ taskchute_day_id: string; section_id: string | null; max_position: number }>();
  const next = new Map(allEntries.results.map((item) => [`${item.taskchute_day_id}:${item.section_id ?? ""}`, item.max_position + 1]));
  return targets.results.map((target) => {
    const placementChanged = target.section_id !== sectionId || target.planned_start_minute !== plannedStart;
    let position = target.position;
    if (target.section_id !== sectionId) {
      const key = `${target.taskchute_day_id}:${sectionId ?? ""}`;
      position = next.get(key) ?? 1;
      next.set(key, position + 1);
    }
    return { ...target, target_section_id: sectionId, target_planned_start_minute: plannedStart,
      target_position: position, placement_changed: placementChanged };
  });
}

export async function setRoutineSectionPlan(
  db: D1Database,
  appUserId: string,
  request: SetRoutineSectionPlanRequest,
  nowInstant = new Date().toISOString(),
): Promise<SetRoutineSectionPlanResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "SetRoutineSectionPlan", requestFingerprint);
  const [currentDay, row] = await Promise.all([
    readCurrentDay(db, appUserId, nowInstant),
    readRoutineEditRow(db, appUserId, request.entry_id),
  ]);
  if (!isEditableCurrentRoutine(row, currentDay, request.taskchute_day_id)) {
    return reject(db, appUserId, request.operation_id, "SetRoutineSectionPlan", requestFingerprint,
      "Only a current-Day planned Routine Entry placement can be edited");
  }
  const activeDay = currentDay!;
  if (row.placement_revision !== request.expected_placement_revision) {
    return reject(db, appUserId, request.operation_id, "SetRoutineSectionPlan", requestFingerprint,
      "The placement revision is stale", true);
  }
  if (request.action === "definition" && row.defaults_revision !== request.expected_defaults_revision) {
    return reject(db, appUserId, request.operation_id, "SetRoutineSectionPlan", requestFingerprint,
      "The Routine defaults revision is stale", true);
  }
  const targetSection = request.action === "reset" ? row.default_section_id : request.section_id;
  const targetPlannedStart = request.action === "reset" ? row.default_planned_start_minute : request.planned_start_minute;
  const plans = await buildSectionPlans(db, appUserId, row, activeDay.logical_date, request.action,
    targetSection, targetPlannedStart);
  if (!plans) {
    return reject(db, appUserId, request.operation_id, "SetRoutineSectionPlan", requestFingerprint,
      "The Section plan is unavailable in an affected established TaskChuteDay context");
  }
  const currentPlan = plans.find((plan) => plan.entry_id === row.entry_id)!;
  const changedDays = [...new Map(plans.filter((plan) => plan.placement_changed)
    .map((plan) => [plan.taskchute_day_id, plan])).values()];
  const planJson = JSON.stringify(plans);
  const changedDaysJson = JSON.stringify(changedDays);
  const targetOverridePresent = request.action === "occurrence";
  const result: SetRoutineSectionPlanResult = {
    entry_id: row.entry_id,
    section_id: targetSection,
    planned_start_minute: targetPlannedStart,
    position: currentPlan.target_position,
    placement_revision: row.placement_revision + (currentPlan.placement_changed ? 1 : 0),
    section_plan_override_present: targetOverridePresent,
    defaults_revision: row.defaults_revision + (request.action === "definition" ? 1 : 0),
  };
  const assertionId = `routine-section-plan:${request.operation_id}`;
  const now = new Date().toISOString();
  try {
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
        SELECT ?, ?, 'SetRoutineSectionPlan' WHERE EXISTS (
          SELECT 1 FROM entries e
          JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
          JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
          JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
          WHERE e.app_user_id = ? AND e.id = ? AND e.taskchute_day_id = ? AND e.lifecycle_state = 'planned'
            AND ro.id = ? AND rd.id = ? AND rd.defaults_revision = ? AND d.placement_revision = ?
        ) AND NOT EXISTS (SELECT 1 FROM json_each(?) j
          LEFT JOIN entries e ON e.app_user_id = ? AND e.id = json_extract(j.value, '$.entry_id')
          LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
          LEFT JOIN taskchute_days d ON d.app_user_id = ? AND d.id = json_extract(j.value, '$.taskchute_day_id')
          WHERE e.id IS NULL OR e.lifecycle_state <> 'planned'
            OR e.section_id IS NOT json_extract(j.value, '$.section_id')
            OR e.position <> CAST(json_extract(j.value, '$.position') AS INTEGER)
            OR e.planned_start_minute IS NOT json_extract(j.value, '$.planned_start_minute')
            OR ro.section_plan_override_present <> CAST(json_extract(j.value, '$.section_plan_override_present') AS INTEGER)
            OR d.placement_revision <> CAST(json_extract(j.value, '$.placement_revision') AS INTEGER)
        ) AND NOT EXISTS (SELECT 1 FROM json_each(?) j
          WHERE json_extract(j.value, '$.target_section_id') IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM taskchute_day_section_contexts c WHERE c.app_user_id = ?
              AND c.taskchute_day_id = json_extract(j.value, '$.taskchute_day_id')
              AND c.section_id = json_extract(j.value, '$.target_section_id')
              AND c.logical_start_minute <= CAST(json_extract(j.value, '$.target_planned_start_minute') AS INTEGER)
              AND CAST(json_extract(j.value, '$.target_planned_start_minute') AS INTEGER) < c.logical_end_minute
          ))`).bind(appUserId, request.operation_id, appUserId, row.entry_id, row.taskchute_day_id,
          row.routine_occurrence_id, row.routine_definition_id, row.defaults_revision, row.placement_revision,
          planJson, appUserId, appUserId, planJson, appUserId),
    ];
    if (request.action === "definition") {
      statements.push(
        db.prepare(`UPDATE routine_definitions SET default_section_id = ?, default_planned_start_minute = ?,
          defaults_revision = defaults_revision + 1 WHERE app_user_id = ? AND id = ? AND defaults_revision = ?
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(targetSection, targetPlannedStart, appUserId, row.routine_definition_id,
            request.expected_defaults_revision, appUserId, request.operation_id),
        db.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 0,
          section_override_id = NULL, planned_start_override_minute = NULL
          WHERE app_user_id = ? AND id = ? AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, row.routine_occurrence_id, appUserId, request.operation_id),
      );
    } else if (request.action === "occurrence") {
      statements.push(db.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 1,
        section_override_id = ?, planned_start_override_minute = ? WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(targetSection, targetPlannedStart, appUserId, row.routine_occurrence_id, appUserId, request.operation_id));
    } else {
      statements.push(db.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 0,
        section_override_id = NULL, planned_start_override_minute = NULL
        WHERE app_user_id = ? AND id = ? AND EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, row.routine_occurrence_id, appUserId, request.operation_id));
    }
    statements.push(
      db.prepare(`UPDATE entries SET
        section_id = (SELECT json_extract(j.value, '$.target_section_id') FROM json_each(?) j
          WHERE json_extract(j.value, '$.entry_id') = entries.id),
        planned_start_minute = (SELECT json_extract(j.value, '$.target_planned_start_minute') FROM json_each(?) j
          WHERE json_extract(j.value, '$.entry_id') = entries.id),
        position = CAST((SELECT json_extract(j.value, '$.target_position') FROM json_each(?) j
          WHERE json_extract(j.value, '$.entry_id') = entries.id) AS INTEGER)
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.entry_id') FROM json_each(?))
          AND lifecycle_state = 'planned' AND EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(planJson, planJson, planJson, appUserId, planJson, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.taskchute_day_id') FROM json_each(?))
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, changedDaysJson, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        NOT EXISTS (SELECT 1 FROM json_each(?) j LEFT JOIN entries e
          ON e.app_user_id = ? AND e.id = json_extract(j.value, '$.entry_id')
          WHERE e.id IS NULL OR e.section_id IS NOT json_extract(j.value, '$.target_section_id')
            OR e.planned_start_minute IS NOT json_extract(j.value, '$.target_planned_start_minute')
            OR e.position <> CAST(json_extract(j.value, '$.target_position') AS INTEGER))
        AND NOT EXISTS (SELECT 1 FROM json_each(?) j LEFT JOIN taskchute_days d
          ON d.app_user_id = ? AND d.id = json_extract(j.value, '$.taskchute_day_id')
          WHERE d.id IS NULL OR d.placement_revision <> CAST(json_extract(j.value, '$.placement_revision') AS INTEGER) + 1)
        AND EXISTS (SELECT 1 FROM routine_occurrences WHERE app_user_id = ? AND id = ?
          AND section_plan_override_present = ? AND section_override_id IS ?
          AND planned_start_override_minute IS ?)
        AND EXISTS (SELECT 1 FROM routine_definitions WHERE app_user_id = ? AND id = ? AND defaults_revision = ?
          AND default_section_id IS ? AND default_planned_start_minute IS ?)
        THEN 1 ELSE 0 END WHERE EXISTS (
          SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, planJson, appUserId, changedDaysJson, appUserId,
          appUserId, row.routine_occurrence_id, targetOverridePresent ? 1 : 0,
          targetOverridePresent ? targetSection : null, targetOverridePresent ? targetPlannedStart : null,
          appUserId, row.routine_definition_id, result.defaults_revision,
          request.action === "definition" ? targetSection : row.default_section_id,
          request.action === "definition" ? targetPlannedStart : row.default_planned_start_minute,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetRoutineSectionPlan', ?, ?, 'success', ?, ? WHERE EXISTS (
          SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), now, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    );
    const results = await db.batch(statements);
    if (results[0]?.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "SetRoutineSectionPlan", requestFingerprint);
      const latest = await readRoutineEditRow(db, appUserId, row.entry_id);
      if (request.action === "definition" && latest?.defaults_revision !== request.expected_defaults_revision) {
        return reject(db, appUserId, request.operation_id, "SetRoutineSectionPlan", requestFingerprint,
          "The Routine defaults revision is stale", true);
      }
      if (latest?.placement_revision !== request.expected_placement_revision) {
        return reject(db, appUserId, request.operation_id, "SetRoutineSectionPlan", requestFingerprint,
          "The placement revision is stale", true);
      }
      return reject(db, appUserId, request.operation_id, "SetRoutineSectionPlan", requestFingerprint,
        "Routine placement state changed before commit");
    }
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (!committed) throw new Error("Routine placement committed without an operation result");
    return replayOperation(committed, "SetRoutineSectionPlan", requestFingerprint);
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "SetRoutineSectionPlan", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine placement outcome is unknown; reload and retry", true);
  }
}
