import type {
  SetRoutineModeRequest,
  SetRoutineModeResult,
  SetRoutineEstimateRequest,
  SetRoutineEstimateResult,
  MoveEntryPlacementIntent,
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
  mode_override_present: number;
  entry_mode_id: string | null;
  default_mode_id: string | null;
  default_mode_title: string | null;
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

interface PlacementEntryRow {
  entry_id: string;
  section_id: string | null;
  position: number;
  lifecycle_state: string;
  planned_start_minute: number | null;
  section_plan_override_present: number;
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

export function isSetRoutineModeRequest(value: unknown): value is SetRoutineModeRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (!hasValidBase(body) || (body.action !== "occurrence" && body.action !== "definition")) return false;
  if (!(body.mode_id === null || (typeof body.mode_id === "string" && isUuidV7(body.mode_id)))) return false;
  return body.action === "occurrence"
    ? !(("expected_defaults_revision") in body)
    : Number.isSafeInteger(body.expected_defaults_revision) && Number(body.expected_defaults_revision) >= 0;
}

export function isSetRoutineSectionPlanRequest(value: unknown): value is SetRoutineSectionPlanRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (!hasValidBase(body)
    || !Number.isSafeInteger(body.expected_placement_revision)
    || Number(body.expected_placement_revision) < 0) return false;
  if (body.action === "reset") {
    return !("section_id" in body) && !("planned_start_minute" in body)
      && !("expected_defaults_revision" in body) && !("placement" in body);
  }
  if ("placement" in body && body.placement !== undefined) {
    const placement = body.placement;
    if (!placement || typeof placement !== "object") return false;
    const candidate = placement as Record<string, unknown>;
    if (candidate.kind !== "relative_to_entry"
      || typeof candidate.anchor_entry_id !== "string" || !isUuidV7(candidate.anchor_entry_id)
      || (candidate.edge !== "before" && candidate.edge !== "after")) return false;
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
      CASE WHEN rmo.routine_occurrence_id IS NULL THEN 0 ELSE 1 END AS mode_override_present,
      em.mode_id AS entry_mode_id, rdm.mode_id AS default_mode_id, md.title AS default_mode_title,
      rd.default_section_id, rd.default_planned_start_minute, rd.default_estimate_seconds, rd.defaults_revision
    FROM entries e
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
    LEFT JOIN routine_occurrence_mode_overrides rmo
      ON rmo.app_user_id = ro.app_user_id AND rmo.routine_occurrence_id = ro.id
    LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
    LEFT JOIN routine_definition_modes rdm
      ON rdm.app_user_id = rd.app_user_id AND rdm.routine_definition_id = rd.id
    LEFT JOIN mode_definitions md ON md.app_user_id = rdm.app_user_id AND md.id = rdm.mode_id
    WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, entryId).first<RoutineEditRow>();
}

async function reject<T>(
  db: D1Database,
  appUserId: string,
  operationId: string,
  commandType: "SetRoutineEstimate" | "SetRoutineSectionPlan" | "SetRoutineMode",
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

/**
 * D-085 Routine Mode command.  The live Entry relation remains the effective
 * projection; the typed Routine relations only record recurring default and
 * explicit occurrence override intent.
 */
export async function setRoutineMode(
  db: D1Database,
  appUserId: string,
  request: SetRoutineModeRequest,
  nowInstant = new Date().toISOString(),
): Promise<SetRoutineModeResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "SetRoutineMode", requestFingerprint);
  const [currentDay, row] = await Promise.all([
    readCurrentDay(db, appUserId, nowInstant),
    readRoutineEditRow(db, appUserId, request.entry_id),
  ]);
  if (!isEditableCurrentRoutine(row, currentDay, request.taskchute_day_id)) {
    return reject(db, appUserId, request.operation_id, "SetRoutineMode", requestFingerprint,
      "Only a current-Day planned Routine Entry Mode can be edited");
  }
  const activeDay = currentDay!;
  const targetMode = request.mode_id === null ? null : await db.prepare(`SELECT m.id, m.title,
      CASE WHEN a.mode_id IS NULL THEN 0 ELSE 1 END AS archived
    FROM mode_definitions m LEFT JOIN mode_archives a
      ON a.app_user_id = m.app_user_id AND a.mode_id = m.id
    WHERE m.app_user_id = ? AND m.id = ?`).bind(appUserId, request.mode_id)
    .first<{ id: string; title: string; archived: number }>();
  if (request.mode_id !== null && !targetMode) {
    return reject(db, appUserId, request.operation_id, "SetRoutineMode", requestFingerprint,
      "Mode is unavailable");
  }
  const assignmentBase = request.action === "definition" ? row.default_mode_id : row.entry_mode_id;
  if (targetMode?.archived === 1 && targetMode.id !== assignmentBase) {
    return reject(db, appUserId, request.operation_id, "SetRoutineMode", requestFingerprint,
      "An archived Mode cannot be newly assigned");
  }
  if (request.action === "definition" && row.defaults_revision !== request.expected_defaults_revision) {
    return reject(db, appUserId, request.operation_id, "SetRoutineMode", requestFingerprint,
      "The Routine defaults revision is stale", true);
  }

  const targetOverridePresent = request.action === "occurrence";
  const result: SetRoutineModeResult = {
    entry_id: row.entry_id,
    mode_id: request.mode_id,
    mode_title: targetMode?.title ?? null,
    mode_override_present: targetOverridePresent,
    defaults_revision: row.defaults_revision + (request.action === "definition" ? 1 : 0),
  };
  const assertionId = `routine-mode:${request.operation_id}`;
  const now = new Date().toISOString();
  try {
    const guard = db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
      SELECT ?, ?, 'SetRoutineMode' WHERE EXISTS (
        SELECT 1 FROM entries e
        JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
        JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
        WHERE e.app_user_id = ? AND e.id = ? AND e.taskchute_day_id = ?
          AND e.lifecycle_state = 'planned' AND ro.id = ? AND rd.id = ?
          AND rd.defaults_revision = ?
          AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions x
            WHERE x.app_user_id = ro.app_user_id AND x.routine_occurrence_id = ro.id))`)
      .bind(appUserId, request.operation_id, appUserId, row.entry_id, activeDay.id,
        row.routine_occurrence_id, row.routine_definition_id,
        request.action === "definition" ? request.expected_defaults_revision : row.defaults_revision);
    const statements: D1PreparedStatement[] = [guard];
    if (request.action === "occurrence") {
      statements.push(
        db.prepare(`INSERT INTO routine_occurrence_mode_overrides (app_user_id, routine_occurrence_id, mode_id)
          SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)
          ON CONFLICT (app_user_id, routine_occurrence_id) DO UPDATE SET mode_id = excluded.mode_id`)
          .bind(appUserId, row.routine_occurrence_id, request.mode_id, appUserId, request.operation_id),
        db.prepare(`DELETE FROM entry_modes WHERE app_user_id = ? AND entry_id = ?
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, row.entry_id, appUserId, request.operation_id),
        request.mode_id === null
          ? db.prepare("SELECT 1 AS noop")
          : db.prepare(`INSERT INTO entry_modes (app_user_id, entry_id, mode_id)
              SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
            .bind(appUserId, row.entry_id, request.mode_id, appUserId, request.operation_id),
      );
    } else {
      statements.push(
        request.mode_id === null
          ? db.prepare(`DELETE FROM routine_definition_modes WHERE app_user_id = ? AND routine_definition_id = ?
              AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
            .bind(appUserId, row.routine_definition_id, appUserId, request.operation_id)
          : db.prepare(`INSERT INTO routine_definition_modes (app_user_id, routine_definition_id, mode_id)
              SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)
              ON CONFLICT (app_user_id, routine_definition_id) DO UPDATE SET mode_id = excluded.mode_id`)
            .bind(appUserId, row.routine_definition_id, request.mode_id, appUserId, request.operation_id),
        db.prepare(`DELETE FROM routine_occurrence_mode_overrides WHERE app_user_id = ? AND routine_occurrence_id = ?
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, row.routine_occurrence_id, appUserId, request.operation_id),
        db.prepare(`DELETE FROM entry_modes WHERE app_user_id = ? AND entry_id IN (
            SELECT e.id FROM entries e JOIN routine_occurrences ro
              ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            LEFT JOIN routine_occurrence_mode_overrides rmo
              ON rmo.app_user_id = ro.app_user_id AND rmo.routine_occurrence_id = ro.id
            WHERE e.app_user_id = ? AND ro.routine_definition_id = ? AND e.lifecycle_state = 'planned'
              AND rmo.routine_occurrence_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions x
                WHERE x.app_user_id = ro.app_user_id AND x.routine_occurrence_id = ro.id))
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, appUserId, row.routine_definition_id, appUserId, request.operation_id),
        request.mode_id === null
          ? db.prepare("SELECT 1 AS noop")
          : db.prepare(`INSERT INTO entry_modes (app_user_id, entry_id, mode_id)
              SELECT e.app_user_id, e.id, ? FROM entries e JOIN routine_occurrences ro
                ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
              LEFT JOIN routine_occurrence_mode_overrides rmo
                ON rmo.app_user_id = ro.app_user_id AND rmo.routine_occurrence_id = ro.id
              WHERE e.app_user_id = ? AND ro.routine_definition_id = ? AND e.lifecycle_state = 'planned'
                AND rmo.routine_occurrence_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions x
                  WHERE x.app_user_id = ro.app_user_id AND x.routine_occurrence_id = ro.id)
                AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
            .bind(request.mode_id, appUserId, row.routine_definition_id, appUserId, request.operation_id),
        db.prepare(`UPDATE routine_definitions SET defaults_revision = defaults_revision + 1
          WHERE app_user_id = ? AND id = ? AND defaults_revision = ?
            AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, row.routine_definition_id, request.expected_defaults_revision, appUserId, request.operation_id),
        db.prepare(`UPDATE routine_board_items SET settings_revision = settings_revision + 1
          WHERE app_user_id = ? AND routine_definition_id = ?
            AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, row.routine_definition_id, appUserId, request.operation_id),
      );
    }
    statements.push(
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM entries e
            WHERE e.app_user_id = ? AND e.id = ? AND e.lifecycle_state = 'planned'
              AND (SELECT mode_id FROM entry_modes WHERE app_user_id = ? AND entry_id = e.id) IS ?)
          AND (SELECT COUNT(*) FROM routine_occurrence_mode_overrides
            WHERE app_user_id = ? AND routine_occurrence_id = ?) = ?
          AND (SELECT defaults_revision FROM routine_definitions
            WHERE app_user_id = ? AND id = ?) = ?
          AND (? = 0 OR NOT EXISTS (
            SELECT 1 FROM entries e JOIN routine_occurrences ro
              ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
            LEFT JOIN routine_occurrence_mode_overrides rmo
              ON rmo.app_user_id = ro.app_user_id AND rmo.routine_occurrence_id = ro.id
            WHERE e.app_user_id = ? AND ro.routine_definition_id = ? AND e.lifecycle_state = 'planned'
              AND rmo.routine_occurrence_id IS NULL
              AND (SELECT mode_id FROM entry_modes WHERE app_user_id = ? AND entry_id = e.id) IS NOT ?))
          THEN 1 ELSE 0 END WHERE EXISTS (
            SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, row.entry_id, appUserId, request.mode_id,
          appUserId, row.routine_occurrence_id, targetOverridePresent ? 1 : 0,
          appUserId, row.routine_definition_id, result.defaults_revision,
          request.action === "definition" ? 1 : 0, appUserId, row.routine_definition_id,
          appUserId, request.mode_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version,
         request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetRoutineMode', ?, ?, 'success', ?, ? WHERE EXISTS (
          SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), now, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    );
    const results = await db.batch(statements);
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "SetRoutineMode", requestFingerprint);
    if (results[0]?.meta.changes === 0) {
      const latest = await readRoutineEditRow(db, appUserId, row.entry_id);
      if (request.action === "definition" && latest?.defaults_revision !== request.expected_defaults_revision) {
        return reject(db, appUserId, request.operation_id, "SetRoutineMode", requestFingerprint,
          "The Routine defaults revision is stale", true);
      }
    }
    return reject(db, appUserId, request.operation_id, "SetRoutineMode", requestFingerprint,
      "Routine Mode state changed before commit");
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "SetRoutineMode", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine Mode outcome is unknown; reload and retry", true);
  }
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
  placement?: MoveEntryPlacementIntent,
): Promise<SectionPlanMutationPlan[] | null> {
  let targetSection = sectionId;
  let targetPlannedStart = plannedStart;
  if (placement) {
    const anchor = await db.prepare(`SELECT id AS entry_id, section_id, planned_start_minute
      FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND id = ? AND lifecycle_state = 'planned'`)
      .bind(appUserId, row.taskchute_day_id, placement.anchor_entry_id).first<{
        entry_id: string; section_id: string | null; planned_start_minute: number | null;
      }>();
    if (!anchor || anchor.entry_id === row.entry_id
      || anchor.section_id !== sectionId || anchor.planned_start_minute !== plannedStart) return null;
    targetSection = anchor.section_id;
    targetPlannedStart = anchor.planned_start_minute;
  }
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
    if (!await validateSectionPair(db, appUserId, target.taskchute_day_id, targetSection, targetPlannedStart)) return null;
  }
  const allEntries = await db.prepare(`SELECT taskchute_day_id, section_id, MAX(position) AS max_position
    FROM entries WHERE app_user_id = ? GROUP BY taskchute_day_id, section_id`).bind(appUserId)
    .all<{ taskchute_day_id: string; section_id: string | null; max_position: number }>();
  const next = new Map(allEntries.results.map((item) => [`${item.taskchute_day_id}:${item.section_id ?? ""}`, item.max_position + 1]));
  const plans = targets.results.map((target) => {
    const placementChanged = target.section_id !== targetSection || target.planned_start_minute !== targetPlannedStart;
    let position = target.position;
    if (target.section_id !== targetSection) {
      const key = `${target.taskchute_day_id}:${targetSection ?? ""}`;
      position = next.get(key) ?? 1;
      next.set(key, position + 1);
    }
    return { ...target, target_section_id: targetSection, target_planned_start_minute: targetPlannedStart,
      target_position: position, placement_changed: placementChanged };
  });
  if (!placement) return plans;

  const sectionIds = [...new Set([row.section_id, targetSection])];
  const placementRows = (await Promise.all(sectionIds.map((sourceSectionId) => db.prepare(`SELECT e.id AS entry_id,
      e.section_id, e.position, e.lifecycle_state, e.planned_start_minute,
      COALESCE(ro.section_plan_override_present, 0) AS section_plan_override_present
    FROM entries e LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.section_id IS ?
    ORDER BY e.position, e.id`).bind(appUserId, row.taskchute_day_id, sourceSectionId).all<PlacementEntryRow>())))
    .flatMap((result) => result.results);
  const targetRows = placementRows.filter((candidate) => candidate.lifecycle_state === "planned"
    && candidate.section_id === targetSection && candidate.planned_start_minute === targetPlannedStart)
    .sort((left, right) => left.position - right.position || left.entry_id.localeCompare(right.entry_id));
  const source = placementRows.find((candidate) => candidate.entry_id === row.entry_id);
  const anchor = targetRows.find((candidate) => candidate.entry_id === placement.anchor_entry_id);
  if (!source || source.lifecycle_state !== "planned" || !anchor) return null;
  const targetIds = targetRows.map((candidate) => candidate.entry_id).filter((entryId) => entryId !== source.entry_id);
  const anchorIndex = targetIds.indexOf(anchor.entry_id);
  if (anchorIndex < 0) return null;
  targetIds.splice(anchorIndex + (placement.edge === "after" ? 1 : 0), 0, source.entry_id);
  const targetSlots = targetRows.map((candidate) => candidate.position);
  if (!targetRows.some((candidate) => candidate.entry_id === source.entry_id)) {
    const maximum = Math.max(...placementRows.map((candidate) => candidate.position), 0);
    targetSlots.push(maximum + 1);
  }
  targetSlots.sort((left, right) => left - right);
  const placementById = new Map(plans.map((plan) => [plan.entry_id, plan]));
  const rowById = new Map(placementRows.map((candidate) => [candidate.entry_id, candidate]));
  targetIds.forEach((entryId, index) => {
    const candidate = rowById.get(entryId);
    if (!candidate) return;
    placementById.set(entryId, {
      entry_id: entryId, taskchute_day_id: row.taskchute_day_id, logical_date: row.logical_date,
      placement_revision: row.placement_revision, section_id: candidate.section_id, position: candidate.position,
      planned_start_minute: candidate.planned_start_minute, section_plan_override_present: candidate.section_plan_override_present,
      target_section_id: targetSection, target_planned_start_minute: targetPlannedStart,
      target_position: targetSlots[index]!, placement_changed: candidate.section_id !== targetSection
        || candidate.planned_start_minute !== targetPlannedStart || candidate.position !== targetSlots[index],
    });
  });
  return [...placementById.values()];
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
    targetSection, targetPlannedStart, request.action === "reset" ? undefined : request.placement);
  if (!plans) {
    return reject(db, appUserId, request.operation_id, "SetRoutineSectionPlan", requestFingerprint,
      "The Section plan is unavailable in an affected established TaskChuteDay context");
  }
  const currentPlan = plans.find((plan) => plan.entry_id === row.entry_id)!;
  const changedDays = [...new Map(plans.filter((plan) => plan.placement_changed)
    .map((plan) => [plan.taskchute_day_id, plan])).values()];
  const planJson = JSON.stringify(plans);
  const changedDaysJson = JSON.stringify(changedDays);
  const positionOnlyReorder = request.action === "occurrence" && request.placement !== undefined
    && currentPlan.section_id === targetSection && currentPlan.planned_start_minute === targetPlannedStart
    && row.section_plan_override_present === 0;
  const targetOverridePresent = request.action === "occurrence" ? !positionOnlyReorder : false;
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
    } else if (request.action === "occurrence" && !positionOnlyReorder) {
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
      db.prepare(`UPDATE entries SET position = position + ?
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.entry_id') FROM json_each(?))
          AND EXISTS (SELECT 1 FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(Math.max(...plans.map((plan) => plan.position), 0) + plans.length + 1,
          appUserId, planJson, appUserId, request.operation_id),
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
