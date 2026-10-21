import type { QuickInterruptEntryRequest, QuickInterruptEntryResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveLogicalMinuteAtInstant, resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface DayRow {
  id: string;
  logical_date: string;
  start_instant: string;
  end_instant: string;
  establishment_timezone: string;
  placement_revision: number;
}

interface SourceRow {
  id: string;
  task_id: string;
  task_title: string;
  lifecycle_state: "planned" | "running" | "completed";
  section_id: string | null;
  position: number;
  planned_start_minute: number | null;
  estimate_seconds: number | null;
  taskchute_day_id: string;
  continuation_chain_id: string | null;
  routine_occurrence_id: string | null;
  mode_id: string | null;
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
  lifecycle_state: "planned" | "running" | "completed";
}

export function isQuickInterruptEntryRequest(value: unknown): value is QuickInterruptEntryRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const keys = ["operation_id", "taskchute_day_id", "source_entry_id", "active_execution_id", "quick_task_id",
    "target_entry_id", "target_execution_id", "continuation_entry_id", "expected_placement_revision"];
  if (Object.keys(body).length !== keys.length || keys.some((key) => !(key in body)) || "user_id" in body) return false;
  const ids = keys.slice(0, -1).map((key) => body[key]);
  return ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(ids).size === ids.length
    && Number.isSafeInteger(body.expected_placement_revision)
    && Number(body.expected_placement_revision) >= 0;
}

function row<T>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid persistence row");
  return value as T;
}

function resolveCurrentContext(contexts: ContextRow[], now: string): ContextRow | null {
  const instant = Date.parse(now);
  if (!Number.isFinite(instant)) return null;
  const matches = contexts.filter((context) => context.actual_start_instant !== null
    && context.actual_end_instant !== null
    && Date.parse(context.actual_start_instant) <= instant
    && instant < Date.parse(context.actual_end_instant));
  return matches.length === 1 ? matches[0]! : null;
}

async function reject(
  db: D1Database,
  appUserId: string,
  request: QuickInterruptEntryRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<QuickInterruptEntryResult> {
  return persistRejection<QuickInterruptEntryResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "QuickInterruptEntry",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

export async function quickInterruptEntry(
  db: D1Database,
  appUserId: string,
  request: QuickInterruptEntryRequest,
  nowInstant = new Date().toISOString(),
): Promise<QuickInterruptEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "QuickInterruptEntry", requestFingerprint);

  const [settingsResult, dayResult, sourceResult, activeResult, collisionResult, contextsResult] = await db.batch([
    db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?").bind(appUserId),
    db.prepare(`SELECT id, logical_date, start_instant, end_instant, establishment_timezone, placement_revision
      FROM taskchute_days WHERE app_user_id = ? AND id = ?`).bind(appUserId, request.taskchute_day_id),
    db.prepare(`SELECT e.id, e.task_id, t.title AS task_title, e.lifecycle_state, e.section_id, e.position,
        e.planned_start_minute, e.estimate_seconds, e.taskchute_day_id, e.continuation_chain_id,
        e.routine_occurrence_id, em.mode_id
      FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, request.source_entry_id),
    db.prepare(`SELECT id, entry_id, started_at FROM executions WHERE app_user_id = ? AND ended_at IS NULL`)
      .bind(appUserId),
    db.prepare(`SELECT id FROM tasks WHERE id IN (?, ?, ?, ?)
      UNION SELECT id FROM entries WHERE id IN (?, ?, ?, ?)
      UNION SELECT id FROM executions WHERE id IN (?, ?, ?, ?)`)
      .bind(request.quick_task_id, request.target_entry_id, request.target_execution_id, request.continuation_entry_id,
        request.quick_task_id, request.target_entry_id, request.target_execution_id, request.continuation_entry_id,
        request.quick_task_id, request.target_entry_id, request.target_execution_id, request.continuation_entry_id),
    db.prepare(`SELECT section_id, logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ?
      ORDER BY context_order, section_id`).bind(appUserId, request.taskchute_day_id),
  ]);
  const settings = settingsResult.results[0]
    ? row<{ timezone: string; day_boundary_minutes: number }>(settingsResult.results[0]) : null;
  const day = dayResult.results[0] ? row<DayRow>(dayResult.results[0]) : null;
  const source = sourceResult.results[0] ? row<SourceRow>(sourceResult.results[0]) : null;
  if (!settings || !day || !source) {
    return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Quick Interrupt source or Day is unavailable");
  }
  const convergedBeforeMutation = await readOperation(db, appUserId, request.operation_id);
  if (convergedBeforeMutation) return replayOperation(convergedBeforeMutation, "QuickInterruptEntry", requestFingerprint);

  let currentDay;
  try {
    currentDay = resolveTaskChuteDay(nowInstant, {
      timezone: settings.timezone,
      boundaryMinutes: settings.day_boundary_minutes,
    });
  } catch {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Current TaskChuteDay could not be resolved");
  }
  if (day.logical_date !== currentDay.logicalDate
    || Date.parse(day.start_instant) !== Date.parse(currentDay.startInstant)
    || Date.parse(day.end_instant) !== Date.parse(currentDay.endInstant)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Quick Interrupt is limited to the current established Day");
  }
  if (day.placement_revision !== request.expected_placement_revision) {
    return persistRejection<QuickInterruptEntryResult>(db, {
      appUserId, operationId: request.operation_id, commandType: "QuickInterruptEntry", requestFingerprint,
      outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }
  if (source.taskchute_day_id !== day.id || source.lifecycle_state !== "running" || source.routine_occurrence_id !== null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Only an ordinary current-Day Running Entry can be interrupted");
  }
  const activeRows = activeResult.results.map((value) => row<{ id: string; entry_id: string; started_at: string }>(value));
  if (activeRows.length !== 1 || activeRows[0]!.id !== request.active_execution_id || activeRows[0]!.entry_id !== source.id) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The active Execution precondition is stale or ambiguous");
  }
  if (collisionResult.results.length > 0) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "A Quick Interrupt identity is already in use");
  }
  const contexts = contextsResult.results.map((value) => row<ContextRow>(value));
  const context = resolveCurrentContext(contexts, nowInstant);
  if (!context || context.logical_start_minute === null || context.logical_end_minute === null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "A unique timed current Section is required for Quick Interrupt");
  }
  const interruptionLogicalMinute = resolveLogicalMinuteAtInstant(day.logical_date, day.establishment_timezone, nowInstant);
  if (interruptionLogicalMinute < context.logical_start_minute || interruptionLogicalMinute >= context.logical_end_minute) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The current Section does not contain the interruption instant");
  }

  const sectionResult = await db.prepare(`SELECT id, position, lifecycle_state FROM entries
    WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position, id`)
    .bind(appUserId, day.id, context.section_id).all<SectionEntryRow>();
  const sectionEntries = sectionResult.results;
  const maxPosition = Math.max(0, ...sectionEntries.map((entry) => entry.position));
  const targetPosition = maxPosition + 1;
  const continuationPosition = maxPosition + 2;
  const positionOffset = maxPosition + 2;

  const chainId = source.continuation_chain_id || source.id;
  const chainEstimate = await db.prepare(`SELECT
      (SELECT e0.estimate_seconds FROM entries e0
        WHERE e0.app_user_id = ? AND e0.continuation_chain_id = ? AND e0.continuation_parent_entry_id IS NULL
        ORDER BY e0.created_at, e0.id LIMIT 1) AS baseline_estimate_seconds,
      COALESCE(SUM(CASE WHEN x.ended_at IS NULL
        THEN unixepoch(?) - unixepoch(x.started_at)
        ELSE unixepoch(x.ended_at) - unixepoch(x.started_at) END), 0) AS cumulative_actual_seconds
    FROM entries e LEFT JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
    WHERE e.app_user_id = ? AND e.continuation_chain_id = ?`)
    .bind(appUserId, chainId, nowInstant, appUserId, chainId)
    .first<{ baseline_estimate_seconds: number | null; cumulative_actual_seconds: number }>();
  const remainingEstimate = chainEstimate?.baseline_estimate_seconds == null ? null
    : chainEstimate.baseline_estimate_seconds - Math.max(0, Math.floor(chainEstimate.cumulative_actual_seconds));
  const continuationEstimate = remainingEstimate !== null && remainingEstimate > 0 ? remainingEstimate : null;
  const result: QuickInterruptEntryResult = {
    taskchute_day_id: day.id,
    source_entry_id: source.id,
    quick_task_id: request.quick_task_id,
    target_entry_id: request.target_entry_id,
    target_execution_id: request.target_execution_id,
    continuation_entry_id: request.continuation_entry_id,
    quick_interrupt_origin: "quick_interrupt",
    interruption_instant: nowInstant,
    section_id: context.section_id,
    placement_revision: request.expected_placement_revision + 1,
    source_execution: {
      id: request.active_execution_id, entry_id: source.id, started_at: activeRows[0]!.started_at,
      ended_at: nowInstant, outcome: "interrupted",
    },
    target_execution: { id: request.target_execution_id, entry_id: request.target_entry_id, started_at: nowInstant, ended_at: null },
    continuation: {
      entry_id: request.continuation_entry_id, task_id: source.task_id, section_id: context.section_id,
      position: continuationPosition, planned_start_minute: null, estimate_seconds: continuationEstimate,
    },
  };
  const assertionId = `quick-interrupt:${request.operation_id}`;
  try {
    const [guard] = await db.batch([
      db.prepare(`INSERT INTO quick_interrupt_command_guards
        (app_user_id, operation_id, taskchute_day_id, source_entry_id, source_execution_id, quick_task_id,
         target_entry_id, target_execution_id, continuation_entry_id, expected_placement_revision)
        SELECT ?, ?, d.id, s.id, x.id, ?, ?, ?, ?, ?
          FROM user_settings us
          JOIN taskchute_days d ON d.app_user_id = us.app_user_id
          JOIN entries s ON s.app_user_id = d.app_user_id AND s.taskchute_day_id = d.id
          JOIN executions x ON x.app_user_id = s.app_user_id AND x.entry_id = s.id AND x.ended_at IS NULL
          LEFT JOIN entry_modes sm ON sm.app_user_id = s.app_user_id AND sm.entry_id = s.id
         WHERE us.app_user_id = ? AND us.timezone = ? AND us.day_boundary_minutes = ?
           AND d.id = ? AND d.logical_date = ? AND d.start_instant = ? AND d.end_instant = ?
           AND d.placement_revision = ? AND s.id = ? AND x.id = ?
           AND s.task_id = ? AND s.continuation_chain_id IS ? AND s.estimate_seconds IS ?
           AND x.started_at = ? AND sm.mode_id IS ?
           AND s.lifecycle_state = 'running' AND s.routine_occurrence_id IS NULL
           AND (SELECT COUNT(*) FROM executions a WHERE a.app_user_id = d.app_user_id AND a.ended_at IS NULL) = 1
           AND (SELECT COALESCE(MAX(e.position), 0) FROM entries e
             WHERE e.app_user_id = d.app_user_id AND e.taskchute_day_id = d.id AND e.section_id = ?) = ?
           AND (SELECT COUNT(*) FROM taskchute_day_section_contexts c WHERE c.app_user_id = d.app_user_id
             AND c.taskchute_day_id = d.id AND c.actual_start_instant IS NOT NULL AND c.actual_end_instant IS NOT NULL
             AND julianday(c.actual_start_instant) <= julianday(?) AND julianday(?) < julianday(c.actual_end_instant)) = 1
           AND EXISTS (SELECT 1 FROM taskchute_day_section_contexts c WHERE c.app_user_id = d.app_user_id
             AND c.taskchute_day_id = d.id AND c.section_id = ? AND c.logical_start_minute = ? AND c.logical_end_minute = ?
             AND julianday(c.actual_start_instant) <= julianday(?) AND julianday(?) < julianday(c.actual_end_instant))
           AND NOT EXISTS (SELECT 1 FROM tasks WHERE id IN (?, ?, ?, ?))
           AND NOT EXISTS (SELECT 1 FROM entries WHERE id IN (?, ?, ?, ?))
           AND NOT EXISTS (SELECT 1 FROM executions WHERE id IN (?, ?, ?, ?))`)
        .bind(appUserId, request.operation_id, request.quick_task_id, request.target_entry_id, request.target_execution_id,
          request.continuation_entry_id, request.expected_placement_revision,
          appUserId, settings.timezone, settings.day_boundary_minutes, day.id, currentDay.logicalDate,
          day.start_instant, day.end_instant, request.expected_placement_revision, source.id, request.active_execution_id,
          source.task_id, source.continuation_chain_id, source.estimate_seconds, activeRows[0]!.started_at, source.mode_id,
          context.section_id, maxPosition, nowInstant, nowInstant, context.section_id,
          context.logical_start_minute, context.logical_end_minute, nowInstant, nowInstant,
          request.quick_task_id, request.target_entry_id, request.target_execution_id, request.continuation_entry_id,
          request.quick_task_id, request.target_entry_id, request.target_execution_id, request.continuation_entry_id,
          request.quick_task_id, request.target_entry_id, request.target_execution_id, request.continuation_entry_id),
      db.prepare(`UPDATE entries SET position = position + ?
        WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? AND lifecycle_state = 'planned'
          AND EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(positionOffset, appUserId, day.id, context.section_id, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ?
          AND EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, day.id, request.expected_placement_revision, appUserId, request.operation_id),
      db.prepare(`UPDATE executions SET ended_at = ?, terminal_outcome = 'interrupted'
        WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at IS NULL
          AND EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(nowInstant, appUserId, request.active_execution_id, source.id, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET lifecycle_state = 'completed'
        WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'running'
          AND EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, source.id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO tasks (id, app_user_id, project_id, title, created_at, quick_interrupt_origin)
        SELECT ?, ?, NULL, '（割込）', ?, 'quick_interrupt'
          WHERE EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.quick_task_id, appUserId, nowInstant, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, created_at, planned_start_minute, start_reminder_offset_minutes, notify_on_estimate_overrun)
        SELECT ?, ?, ?, ?, ?, ?, 'running', NULL, ?, NULL, NULL, 0
          WHERE EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.target_entry_id, appUserId, request.quick_task_id, day.id, context.section_id,
          targetPosition, nowInstant, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, created_at, planned_start_minute, continuation_chain_id, continuation_parent_entry_id)
        SELECT ?, ?, ?, ?, ?, ?, 'planned', ?, ?, NULL, ?, ?
          WHERE EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.continuation_entry_id, appUserId, source.task_id, day.id, context.section_id,
          continuationPosition, continuationEstimate, nowInstant, chainId, source.id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_modes (app_user_id, entry_id, mode_id)
        SELECT ?, ?, ? WHERE ? IS NOT NULL
          AND EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.continuation_entry_id, source.mode_id, source.mode_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
        SELECT ?, ?, ?, ?, NULL, ?, NULL
          WHERE EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.target_execution_id, appUserId, request.target_entry_id, nowInstant, nowInstant, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_project_snapshots (app_user_id, entry_id, project_id, project_title, captured_at)
        SELECT e.app_user_id, e.id, NULL, NULL, ? FROM entries e
        WHERE e.app_user_id = ? AND e.id = ?
          AND EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(nowInstant, appUserId, request.target_entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entry_task_snapshots (app_user_id, entry_id, task_id, task_title, captured_at)
        SELECT e.app_user_id, e.id, t.id, t.title, ? FROM entries e JOIN tasks t
          ON t.app_user_id = e.app_user_id AND t.id = e.task_id
        WHERE e.app_user_id = ? AND e.id = ?
          AND EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(nowInstant, appUserId, request.target_entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO quick_interrupt_entry_pairs
        (app_user_id, target_entry_id, continuation_entry_id, created_at)
        SELECT app_user_id, target_entry_id, continuation_entry_id, ?
          FROM quick_interrupt_command_guards
         WHERE app_user_id = ? AND operation_id = ?`)
        .bind(nowInstant, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
          AND EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ? AND entry_id = ?
            AND ended_at = ? AND terminal_outcome = 'interrupted')
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND lifecycle_state = 'completed')
          AND EXISTS (SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ? AND title = '（割込）'
            AND project_id IS NULL AND quick_interrupt_origin = 'quick_interrupt')
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND task_id = ?
            AND taskchute_day_id = ? AND section_id = ? AND position = ? AND lifecycle_state = 'running'
            AND estimate_seconds IS NULL AND planned_start_minute IS NULL AND routine_occurrence_id IS NULL
            AND start_reminder_offset_minutes IS NULL AND notify_on_estimate_overrun = 0)
          AND EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND id = ? AND entry_id = ? AND ended_at IS NULL)
          AND EXISTS (SELECT 1 FROM entry_task_snapshots WHERE app_user_id = ? AND entry_id = ?
            AND task_id = ? AND task_title = '（割込）')
          AND EXISTS (SELECT 1 FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?
            AND project_id IS NULL AND project_title IS NULL)
          AND NOT EXISTS (SELECT 1 FROM entry_modes WHERE app_user_id = ? AND entry_id = ?)
          AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND task_id = ?
            AND taskchute_day_id = ? AND section_id = ? AND position = ? AND lifecycle_state = 'planned'
            AND planned_start_minute IS NULL AND estimate_seconds IS ?)
          AND EXISTS (SELECT 1 FROM quick_interrupt_entry_pairs WHERE app_user_id = ?
            AND target_entry_id = ? AND continuation_entry_id = ?)
          AND (SELECT COUNT(*) FROM executions WHERE app_user_id = ? AND ended_at IS NULL) = 1
          AND NOT EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
            AND section_id = ? AND lifecycle_state = 'planned' AND position <= ? AND id <> ?)
        THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, day.id, result.placement_revision,
          appUserId, request.active_execution_id, source.id, nowInstant, appUserId, source.id,
          appUserId, request.quick_task_id, appUserId, request.target_entry_id, request.quick_task_id,
          day.id, context.section_id, targetPosition, appUserId, request.target_execution_id, request.target_entry_id,
          appUserId, request.target_entry_id, request.quick_task_id, appUserId, request.target_entry_id,
          appUserId, request.target_entry_id, appUserId, request.continuation_entry_id, source.task_id,
          day.id, context.section_id, continuationPosition, continuationEstimate,
          appUserId, request.target_entry_id, request.continuation_entry_id,
          appUserId, appUserId, day.id, context.section_id, continuationPosition, request.continuation_entry_id,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'QuickInterruptEntry', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM quick_interrupt_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "QuickInterruptEntry", requestFingerprint);
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, day.id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_placement_revision) {
        return persistRejection<QuickInterruptEntryResult>(db, {
          appUserId, operationId: request.operation_id, commandType: "QuickInterruptEntry", requestFingerprint,
          outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
        });
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Quick Interrupt preconditions changed before commit");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "QuickInterruptEntry", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
