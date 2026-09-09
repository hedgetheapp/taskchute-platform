import type { InterruptEntryRequest, InterruptEntryResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveLogicalMinuteAtInstant, resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface InterruptEntryRow {
  entry_id: string;
  task_id: string;
  task_title: string;
  lifecycle_state: "planned" | "running" | "completed";
  section_id: string | null;
  position: number;
  planned_start_minute: number | null;
  estimate_seconds: number | null;
  taskchute_day_id: string;
  continuation_chain_id: string;
  routine_occurrence_id: string | null;
  mode_id: string | null;
  mode_title: string | null;
}

interface DayRow {
  id: string;
  logical_date: string;
  start_instant: string;
  end_instant: string;
  establishment_timezone: string;
  placement_revision: number;
}

interface ContextRow {
  section_id: string;
  logical_start_minute: number | null;
  logical_end_minute: number | null;
  actual_start_instant: string | null;
  actual_end_instant: string | null;
}

interface SectionEntryRow {
  id: string;
  position: number;
  planned_start_minute: number | null;
}

export function isInterruptEntryRequest(value: unknown): value is InterruptEntryRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !("user_id" in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && typeof body.source_entry_id === "string" && isUuidV7(body.source_entry_id)
    && typeof body.active_execution_id === "string" && isUuidV7(body.active_execution_id)
    && typeof body.target_entry_id === "string" && isUuidV7(body.target_entry_id)
    && typeof body.target_execution_id === "string" && isUuidV7(body.target_execution_id)
    && typeof body.continuation_entry_id === "string" && isUuidV7(body.continuation_entry_id)
    && body.source_entry_id !== body.target_entry_id
    && body.source_entry_id !== body.continuation_entry_id
    && body.target_entry_id !== body.continuation_entry_id
    && Number.isInteger(body.expected_placement_revision)
    && Number(body.expected_placement_revision) >= 0;
}

async function reject(
  db: D1Database,
  appUserId: string,
  request: InterruptEntryRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<InterruptEntryResult> {
  return persistRejection<InterruptEntryResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "InterruptEntry",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

function row<T>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid persistence row");
  return value as T;
}

function interruptionContext(contexts: ContextRow[], now: string): ContextRow | null {
  const matches = contexts.filter((context) => context.actual_start_instant !== null
    && context.actual_end_instant !== null
    && Date.parse(context.actual_start_instant) <= Date.parse(now)
    && Date.parse(now) < Date.parse(context.actual_end_instant));
  return matches.length === 1 ? matches[0]! : null;
}

export async function interruptEntry(
  db: D1Database,
  appUserId: string,
  request: InterruptEntryRequest,
  nowInstant = new Date().toISOString(),
): Promise<InterruptEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "InterruptEntry", requestFingerprint);

  const [settingsResult, dayResult, sourceResult, targetResult, activeResult, executionCollisionResult,
    entryCollisionResult, contextsResult] = await db.batch([
    db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?").bind(appUserId),
    db.prepare(`SELECT id, logical_date, start_instant, end_instant, establishment_timezone, placement_revision
      FROM taskchute_days WHERE app_user_id = ? AND id = ?`).bind(appUserId, request.taskchute_day_id),
    db.prepare(`SELECT e.id AS entry_id, e.task_id, t.title AS task_title, e.lifecycle_state, e.section_id,
        e.position, e.planned_start_minute, e.estimate_seconds, e.taskchute_day_id,
        e.continuation_chain_id, e.routine_occurrence_id, em.mode_id, md.title AS mode_title
      FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
      LEFT JOIN mode_definitions md ON md.app_user_id = em.app_user_id AND md.id = em.mode_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, request.source_entry_id),
    db.prepare(`SELECT e.id AS entry_id, e.task_id, t.title AS task_title, e.lifecycle_state, e.section_id,
        e.position, e.planned_start_minute, e.estimate_seconds, e.taskchute_day_id,
        e.continuation_chain_id, e.routine_occurrence_id, em.mode_id, md.title AS mode_title
      FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
      LEFT JOIN mode_definitions md ON md.app_user_id = em.app_user_id AND md.id = em.mode_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, request.target_entry_id),
    db.prepare(`SELECT id, entry_id, started_at FROM executions
      WHERE app_user_id = ? AND ended_at IS NULL`).bind(appUserId),
    db.prepare("SELECT id FROM executions WHERE app_user_id = ? AND id = ?").bind(appUserId, request.target_execution_id),
    db.prepare("SELECT id FROM entries WHERE app_user_id = ? AND id = ?").bind(appUserId, request.continuation_entry_id),
    db.prepare(`SELECT section_id, logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order, section_id`)
      .bind(appUserId, request.taskchute_day_id),
  ]);

  const settings = settingsResult.results[0] ? row<{ timezone: string; day_boundary_minutes: number }>(settingsResult.results[0]) : null;
  const day = dayResult.results[0] ? row<DayRow>(dayResult.results[0]) : null;
  const source = sourceResult.results[0] ? row<InterruptEntryRow>(sourceResult.results[0]) : null;
  const target = targetResult.results[0] ? row<InterruptEntryRow>(targetResult.results[0]) : null;
  if (!settings || !day || !source || !target) {
    return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Interrupt source, target, or Day is unavailable");
  }
  const convergedBeforeMutation = await readOperation(db, appUserId, request.operation_id);
  if (convergedBeforeMutation) return replayOperation(convergedBeforeMutation, "InterruptEntry", requestFingerprint);

  let currentDay;
  try {
    currentDay = resolveTaskChuteDay(nowInstant, { timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes });
  } catch {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Current TaskChuteDay could not be resolved");
  }
  if (day.logical_date !== currentDay.logicalDate
    || Date.parse(day.start_instant) !== Date.parse(currentDay.startInstant)
    || Date.parse(day.end_instant) !== Date.parse(currentDay.endInstant)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "InterruptEntry is limited to the current logical Day");
  }
  if (day.placement_revision !== request.expected_placement_revision) {
    return persistRejection<InterruptEntryResult>(db, {
      appUserId, operationId: request.operation_id, commandType: "InterruptEntry", requestFingerprint,
      outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }
  if (source.entry_id === target.entry_id || source.taskchute_day_id !== day.id || target.taskchute_day_id !== day.id) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Source and target must belong to the same Day");
  }
  if (source.lifecycle_state !== "running" || source.routine_occurrence_id !== null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Only an ordinary running Entry can be interrupted");
  }
  if (target.lifecycle_state !== "planned" || target.routine_occurrence_id !== null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Only an ordinary planned Entry can continue after an interrupt");
  }
  const activeRows = activeResult.results.map((value) => row<{ id: string; entry_id: string; started_at: string }>(value));
  const active = activeRows.length === 1 ? activeRows[0]! : null;
  if (!active || active.id !== request.active_execution_id || active.entry_id !== source.entry_id) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The active Execution precondition is stale");
  }
  if (executionCollisionResult.results.length > 0 || entryCollisionResult.results.length > 0) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The requested Execution or continuation Entry id is already in use");
  }
  const contexts = contextsResult.results.map((value) => row<ContextRow>(value));
  const context = interruptionContext(contexts, nowInstant);
  if (!context || context.logical_start_minute === null || context.logical_end_minute === null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "A unique timed Section context is required for continuation");
  }
  const interruptionLogicalMinute = resolveLogicalMinuteAtInstant(day.logical_date, day.establishment_timezone, nowInstant);
  if (interruptionLogicalMinute < context.logical_start_minute || interruptionLogicalMinute >= context.logical_end_minute) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Interruption minute is outside the current Section context");
  }

  // The query intentionally returns all Sections; identify the current Section
  // with a second narrow read so an unrelated Section never affects placement.
  const currentSectionEntries = await db.prepare(`SELECT id, position, planned_start_minute FROM entries
    WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position, id`)
    .bind(appUserId, day.id, context.section_id).all<SectionEntryRow>();
  const currentSection = currentSectionEntries.results;
  const sameMinutePositions = currentSection.filter((entry) => entry.planned_start_minute === interruptionLogicalMinute).map((entry) => entry.position);
  const maxPosition = Math.max(0, ...currentSection.map((entry) => entry.position));
  const maxSameMinutePosition = Math.max(0, ...sameMinutePositions);
  const targetMovesSection = target.section_id !== context.section_id;
  const targetPosition = targetMovesSection ? maxPosition + 1 : target.position;
  const continuationPosition = targetMovesSection
    ? maxPosition + 2
    : Math.max(maxSameMinutePosition + 1, maxPosition + 1);

  const chainId = source.continuation_chain_id || source.entry_id;
  const chainEstimate = await db.prepare(`SELECT
      (SELECT e0.estimate_seconds FROM entries e0
        WHERE e0.app_user_id = ? AND e0.continuation_chain_id = ? AND e0.continuation_parent_entry_id IS NULL
        ORDER BY e0.created_at, e0.id LIMIT 1) AS baseline_estimate_seconds,
      COALESCE(SUM(CASE WHEN x.ended_at IS NULL
        THEN unixepoch(?) - unixepoch(x.started_at)
        ELSE unixepoch(x.ended_at) - unixepoch(x.started_at) END), 0) AS cumulative_actual_seconds
    FROM entries e LEFT JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
    WHERE e.app_user_id = ? AND e.continuation_chain_id = ?`)
    .bind(appUserId, chainId, nowInstant, appUserId, chainId).first<{ baseline_estimate_seconds: number | null; cumulative_actual_seconds: number }>();
  const remainingEstimate = chainEstimate?.baseline_estimate_seconds === null || chainEstimate?.baseline_estimate_seconds === undefined
    ? null
    : chainEstimate.baseline_estimate_seconds - Math.max(0, Math.floor(chainEstimate.cumulative_actual_seconds));
  const continuationEstimate = remainingEstimate !== null && remainingEstimate > 0 ? remainingEstimate : null;
  const targetSectionId = context.section_id;
  const result: InterruptEntryResult = {
    taskchute_day_id: day.id,
    source_entry_id: source.entry_id,
    target_entry_id: target.entry_id,
    continuation_entry_id: request.continuation_entry_id,
    interruption_instant: nowInstant,
    interruption_logical_minute: interruptionLogicalMinute,
    placement_revision: request.expected_placement_revision + 1,
    source_execution: { id: request.active_execution_id, entry_id: source.entry_id, started_at: active.started_at, ended_at: nowInstant, outcome: "interrupted" },
    target_execution: { id: request.target_execution_id, entry_id: target.entry_id, started_at: nowInstant, ended_at: null },
    continuation: {
      entry_id: request.continuation_entry_id, task_id: source.task_id, section_id: context.section_id,
      position: continuationPosition, planned_start_minute: interruptionLogicalMinute, estimate_seconds: continuationEstimate,
    },
  };
  const assertionId = `interrupt:${request.operation_id}`;
  try {
    const [guard] = await db.batch([
      db.prepare(`INSERT INTO interrupt_command_guards
        (app_user_id, operation_id, taskchute_day_id, source_entry_id, source_execution_id,
         target_entry_id, target_execution_id, continuation_entry_id, expected_placement_revision)
        SELECT ?, ?, d.id, s.id, x.id, t.id, ?, ?, ?
          FROM taskchute_days d
          JOIN entries s ON s.app_user_id = d.app_user_id AND s.id = ? AND s.taskchute_day_id = d.id
          JOIN executions x ON x.app_user_id = s.app_user_id AND x.id = ? AND x.entry_id = s.id AND x.ended_at IS NULL
          JOIN entries t ON t.app_user_id = d.app_user_id AND t.id = ? AND t.taskchute_day_id = d.id
         WHERE d.app_user_id = ? AND d.id = ? AND d.placement_revision = ?
           AND s.lifecycle_state = 'running' AND s.routine_occurrence_id IS NULL
           AND t.lifecycle_state = 'planned' AND t.routine_occurrence_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM executions z WHERE z.app_user_id = d.app_user_id AND z.id = ?)
           AND NOT EXISTS (SELECT 1 FROM entries c WHERE c.app_user_id = d.app_user_id AND c.id = ?)`)
        .bind(appUserId, request.operation_id, request.target_execution_id, request.continuation_entry_id,
          request.expected_placement_revision, request.source_entry_id, request.active_execution_id, request.target_entry_id,
          appUserId, day.id, request.expected_placement_revision, request.target_execution_id, request.continuation_entry_id),
      db.prepare(`UPDATE entries SET section_id = ?, position = ?
        WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned' AND section_id IS ?
          AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(targetSectionId, targetPosition, appUserId, target.entry_id, target.section_id, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ?
          AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, day.id, request.expected_placement_revision, appUserId, request.operation_id),
      db.prepare(`UPDATE executions SET ended_at = ?, terminal_outcome = 'interrupted'
        WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at IS NULL
          AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(nowInstant, appUserId, request.active_execution_id, source.entry_id, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET lifecycle_state = 'completed'
        WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'running'
          AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, source.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, created_at, planned_start_minute, continuation_chain_id, continuation_parent_entry_id)
        SELECT ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.continuation_entry_id, appUserId, source.task_id, day.id, context.section_id, continuationPosition,
          continuationEstimate, nowInstant, interruptionLogicalMinute, chainId, source.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_modes (app_user_id, entry_id, mode_id)
        SELECT ?, ?, ? WHERE ? IS NOT NULL
          AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.continuation_entry_id, source.mode_id, source.mode_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
        SELECT ?, ?, ?, ?, NULL, ?, NULL
          WHERE EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.target_execution_id, appUserId, target.entry_id, nowInstant, nowInstant, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_project_snapshots
        (app_user_id, entry_id, project_id, project_title, captured_at)
        SELECT e.app_user_id, e.id, t.project_id, p.title, ?
          FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
          LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
         WHERE e.app_user_id = ? AND e.id = ?
           AND NOT EXISTS (SELECT 1 FROM entry_project_snapshots s WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
           AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(nowInstant, appUserId, target.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_task_snapshots
        (app_user_id, entry_id, task_id, task_title, captured_at)
        SELECT e.app_user_id, e.id, t.id, t.title, ?
          FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
         WHERE e.app_user_id = ? AND e.id = ?
           AND NOT EXISTS (SELECT 1 FROM entry_task_snapshots s WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
           AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(nowInstant, appUserId, target.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_mode_snapshots
        (app_user_id, entry_id, mode_id, mode_title, captured_at)
        SELECT e.app_user_id, e.id, em.mode_id, md.title, ?
          FROM entries e JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
          JOIN mode_definitions md ON md.app_user_id = em.app_user_id AND md.id = em.mode_id
         WHERE e.app_user_id = ? AND e.id = ?
           AND NOT EXISTS (SELECT 1 FROM entry_mode_snapshots s WHERE s.app_user_id = e.app_user_id AND s.entry_id = e.id)
           AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(nowInstant, appUserId, target.entry_id, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET lifecycle_state = 'running'
        WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'planned'
          AND EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, target.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'completed')
          AND EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at = ? AND terminal_outcome = 'interrupted')
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'running' AND section_id = ?
            AND planned_start_minute IS ?)
          AND EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at IS NULL)
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND task_id = ? AND section_id = ?
            AND planned_start_minute = ? AND lifecycle_state = 'planned' AND estimate_seconds IS ?)
          AND (SELECT COUNT(*) FROM executions WHERE app_user_id = ? AND ended_at IS NULL) = 1
        THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, day.id, result.placement_revision,
          appUserId, source.entry_id, appUserId, request.active_execution_id, source.entry_id, nowInstant,
          appUserId, target.entry_id, targetSectionId, target.planned_start_minute,
          appUserId, request.target_execution_id, target.entry_id,
          appUserId, request.continuation_entry_id, source.task_id, context.section_id, interruptionLogicalMinute, continuationEstimate,
          appUserId, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'InterruptEntry', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "InterruptEntry", requestFingerprint);
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, day.id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_placement_revision) {
        return persistRejection<InterruptEntryResult>(db, {
          appUserId, operationId: request.operation_id, commandType: "InterruptEntry", requestFingerprint,
          outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
        });
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "InterruptEntry preconditions changed before commit");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "InterruptEntry", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
