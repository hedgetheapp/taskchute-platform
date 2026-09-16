import type {
  CreateFutureRoutineFromCompletedEntryRequest,
  CreateFutureRoutineFromCompletedEntryResult,
} from "../../src/shared/contracts";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";
import { HttpError } from "./errors";

const commandType = "CreateFutureRoutineFromCompletedEntry" as const;

interface SourceRow {
  entry_id: string;
  taskchute_day_id: string;
  logical_date: string;
  lifecycle_state: string;
  routine_occurrence_id: string | null;
  section_id: string | null;
  planned_start_minute: number | null;
  estimate_seconds: number | null;
  task_id: string;
  task_title: string;
  project_snapshot_entry_id: string | null;
  project_id: string | null;
  project_title: string | null;
  mode_snapshot_entry_id: string | null;
  snapshot_mode_id: string | null;
  snapshot_mode_title: string | null;
  live_mode_id: string | null;
  has_completed_execution: number;
  has_active_execution: number;
}

interface SourceMetadata {
  source: SourceRow;
  projectId: string | null;
  modeId: string | null;
  defaultSectionId: string | null;
  defaultPlannedStartMinute: number | null;
  sectionConfigurationVersionId: string | null;
}

interface CorrelationRow {
  source_entry_id: string;
  routine_definition_id: string;
  task_id: string;
  start_logical_date: string;
  defaults_revision: number;
  board_position: number | null;
  board_revision: number;
}

interface CurrentLogicalDayContext {
  logicalDate: string;
  timezone: string;
  boundaryMinutes: number;
}

export interface CompletedEntryFutureRoutineHooks {
  beforeMutation?: () => Promise<void>;
}

export function isCreateFutureRoutineFromCompletedEntryRequest(
  value: unknown,
): value is CreateFutureRoutineFromCompletedEntryRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  return keys.join(",") === "expected_board_revision,operation_id,routine_definition_id,source_entry_id,task_id"
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.source_entry_id === "string" && isUuidV7(body.source_entry_id)
    && typeof body.task_id === "string" && isUuidV7(body.task_id)
    && typeof body.routine_definition_id === "string" && isUuidV7(body.routine_definition_id)
    && body.source_entry_id !== body.task_id && body.source_entry_id !== body.routine_definition_id
    && body.task_id !== body.routine_definition_id
    && Number.isSafeInteger(body.expected_board_revision) && Number(body.expected_board_revision) >= 0;
}

function nextLogicalDate(logicalDate: string): string {
  const [year, month, day] = logicalDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}

async function rejectDomain<T>(db: D1Database, appUserId: string,
  request: CreateFutureRoutineFromCompletedEntryRequest, requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id,
    commandType, requestFingerprint, outcomeKind: "domain_rejection", result: { code, message } });
}

async function rejectRevision<T>(db: D1Database, appUserId: string,
  request: CreateFutureRoutineFromCompletedEntryRequest, requestFingerprint: string,
  message: string): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id,
    commandType, requestFingerprint, outcomeKind: "revision_conflict", result: { message } });
}

async function persistSuccess<T>(db: D1Database, appUserId: string,
  request: CreateFutureRoutineFromCompletedEntryRequest, requestFingerprint: string,
  result: T, nowInstant: string): Promise<T> {
  try {
    await db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type,
      request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
      VALUES (?, ?, ?, ?, ?, 'success', ?, ?)`)
      .bind(appUserId, request.operation_id, commandType, REQUEST_FINGERPRINT_VERSION,
        requestFingerprint, JSON.stringify(result), nowInstant).run();
    return result;
  } catch {
    const prior = await readOperation(db, appUserId, request.operation_id);
    if (prior) return replayOperation<T>(prior, commandType, requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine conversion outcome is unknown; reload and retry", true);
  }
}

async function readCurrentLogicalDayContext(
  db: D1Database,
  appUserId: string,
  nowInstant: string,
): Promise<CurrentLogicalDayContext> {
  const settings = await db.prepare(`SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?`)
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  if (!settings) throw new HttpError(404, "resource_not_found", "TaskChute settings are unavailable");
  return {
    logicalDate: resolveTaskChuteDay(nowInstant, { timezone: settings.timezone,
      boundaryMinutes: settings.day_boundary_minutes }).logicalDate,
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  };
}

async function readSource(db: D1Database, appUserId: string, entryId: string): Promise<SourceRow | null> {
  return db.prepare(`SELECT e.id AS entry_id, e.taskchute_day_id, d.logical_date, e.lifecycle_state,
      e.routine_occurrence_id, e.section_id, e.planned_start_minute, e.estimate_seconds,
      t.id AS task_id, t.title AS task_title,
      eps.entry_id AS project_snapshot_entry_id, eps.project_id, eps.project_title,
      ems.entry_id AS mode_snapshot_entry_id, ems.mode_id AS snapshot_mode_id,
      ems.mode_title AS snapshot_mode_title, em.mode_id AS live_mode_id,
      EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
        AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed') AS has_completed_execution,
      EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
        AND x.ended_at IS NULL) AS has_active_execution
    FROM entries e
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
    LEFT JOIN entry_project_snapshots eps ON eps.app_user_id = e.app_user_id AND eps.entry_id = e.id
    LEFT JOIN entry_mode_snapshots ems ON ems.app_user_id = e.app_user_id AND ems.entry_id = e.id
    LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
    WHERE e.app_user_id = ? AND e.id = ?`)
    .bind(appUserId, entryId).first<SourceRow>();
}

async function readCorrelation(db: D1Database, appUserId: string, sourceEntryId: string): Promise<CorrelationRow | null> {
  return db.prepare(`SELECT c.source_entry_id, r.id AS routine_definition_id, r.task_id,
      r.start_logical_date, r.defaults_revision, b.board_position, h.board_revision
    FROM completed_entry_future_routines c
    JOIN routine_definitions r ON r.app_user_id = c.app_user_id AND r.id = c.routine_definition_id
    LEFT JOIN routine_board_items b ON b.app_user_id = r.app_user_id AND b.routine_definition_id = r.id
    JOIN routine_board_heads h ON h.app_user_id = c.app_user_id
    WHERE c.app_user_id = ? AND c.source_entry_id = ?`)
    .bind(appUserId, sourceEntryId).first<CorrelationRow>();
}

function correlationResult(row: CorrelationRow, alreadyConverted: boolean): CreateFutureRoutineFromCompletedEntryResult {
  return { source_entry_id: row.source_entry_id, task_id: row.task_id,
    routine_definition_id: row.routine_definition_id, board_position: row.board_position,
    board_revision: row.board_revision, settings_revision: row.defaults_revision,
    start_logical_date: row.start_logical_date, source_was_already_converted: alreadyConverted };
}

async function readBoard(db: D1Database, appUserId: string): Promise<{
  boardRevision: number; boardPosition: number; materializationOrder: number;
}> {
  const row = await db.prepare(`SELECT h.board_revision,
      COALESCE((SELECT MAX(board_position) FROM routine_board_items WHERE app_user_id = h.app_user_id), 0) + 1 AS board_position,
      COALESCE((SELECT MAX(materialization_order) FROM routine_definitions WHERE app_user_id = h.app_user_id), 0) + 1 AS materialization_order
    FROM routine_board_heads h WHERE h.app_user_id = ?`).bind(appUserId)
    .first<{ board_revision: number; board_position: number; materialization_order: number }>();
  if (!row) throw new HttpError(404, "resource_not_found", "Routine Board is unavailable");
  return { boardRevision: row.board_revision, boardPosition: row.board_position,
    materializationOrder: row.materialization_order };
}

async function readMetadata(db: D1Database, appUserId: string, source: SourceRow,
  currentLogicalDate: string, request: CreateFutureRoutineFromCompletedEntryRequest,
  requestFingerprint: string): Promise<SourceMetadata> {
  if (source.logical_date !== currentLogicalDate || source.lifecycle_state !== "completed"
    || source.routine_occurrence_id !== null || source.has_completed_execution !== 1
    || source.has_active_execution !== 0) {
    return rejectDomain(db, appUserId, request, requestFingerprint, "resource_conflict",
      "Only a completed ordinary Entry on the current established Day can create a future Routine");
  }
  if (source.project_snapshot_entry_id !== source.entry_id
    || ((source.project_id === null) !== (source.project_title === null))) {
    return rejectDomain(db, appUserId, request, requestFingerprint, "resource_conflict",
      "The completed Entry historical Project snapshot is unavailable");
  }
  if (source.live_mode_id !== source.snapshot_mode_id) {
    return rejectDomain(db, appUserId, request, requestFingerprint, "resource_conflict",
      "The completed Entry historical Mode is inconsistent; correct it before creating a Routine");
  }

  if (source.project_id !== null) {
    const project = await db.prepare(`SELECT p.id, a.project_id AS archived_project_id FROM projects p
      LEFT JOIN project_archives a ON a.app_user_id = p.app_user_id AND a.project_id = p.id
      WHERE p.app_user_id = ? AND p.id = ?`).bind(appUserId, source.project_id)
      .first<{ id: string; archived_project_id: string | null }>();
    if (!project || project.archived_project_id !== null) {
      return rejectDomain(db, appUserId, request, requestFingerprint, "resource_conflict",
        "The historical Project is archived or unavailable; correct or clear the Entry Project first");
    }
  }
  if (source.snapshot_mode_id !== null) {
    const mode = await db.prepare(`SELECT m.id, a.mode_id AS archived_mode_id FROM mode_definitions m
      LEFT JOIN mode_archives a ON a.app_user_id = m.app_user_id AND a.mode_id = m.id
      WHERE m.app_user_id = ? AND m.id = ?`).bind(appUserId, source.snapshot_mode_id)
      .first<{ id: string; archived_mode_id: string | null }>();
    if (!mode || mode.archived_mode_id !== null) {
      return rejectDomain(db, appUserId, request, requestFingerprint, "resource_conflict",
        "The historical Mode is archived or unavailable; correct or clear the Entry Mode first");
    }
  }

  const config = await db.prepare(`SELECT h.configuration_version_id FROM section_configuration_heads h
    WHERE h.app_user_id = ?`).bind(appUserId).first<{ configuration_version_id: string }>();
  let defaultSectionId: string | null = null;
  let defaultPlannedStartMinute: number | null = null;
  if (source.section_id !== null && source.planned_start_minute !== null && config) {
    const valid = await db.prepare(`SELECT 1 AS valid FROM section_configuration_items i
      WHERE i.app_user_id = ? AND i.configuration_version_id = ? AND i.section_id = ?
        AND i.logical_start_minute <= ? AND ? < i.logical_end_minute`)
      .bind(appUserId, config.configuration_version_id, source.section_id,
        source.planned_start_minute, source.planned_start_minute).first();
    if (valid) {
      defaultSectionId = source.section_id;
      defaultPlannedStartMinute = source.planned_start_minute;
    }
  }
  return { source, projectId: source.project_id, modeId: source.snapshot_mode_id,
    defaultSectionId, defaultPlannedStartMinute,
    sectionConfigurationVersionId: config?.configuration_version_id ?? null };
}

function sourceStillMatchesSql(): string {
  return `EXISTS (SELECT 1 FROM entries e
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
    JOIN entry_project_snapshots eps ON eps.app_user_id = e.app_user_id AND eps.entry_id = e.id
    LEFT JOIN entry_mode_snapshots ems ON ems.app_user_id = e.app_user_id AND ems.entry_id = e.id
    LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
    WHERE e.app_user_id = ? AND e.id = ? AND e.task_id = ? AND e.taskchute_day_id = ?
      AND d.logical_date = ?
      AND EXISTS (SELECT 1 FROM user_settings us WHERE us.app_user_id = e.app_user_id
        AND us.timezone IS ? AND us.day_boundary_minutes IS ?)
      AND e.lifecycle_state = 'completed' AND e.routine_occurrence_id IS NULL
      AND e.section_id IS ? AND e.planned_start_minute IS ? AND e.estimate_seconds IS ? AND t.title IS ?
      AND eps.project_id IS ? AND eps.project_title IS ?
      AND ems.mode_id IS ? AND ems.mode_title IS ? AND em.mode_id IS ?
      AND EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
        AND x.ended_at IS NOT NULL AND x.terminal_outcome = 'completed')
      AND NOT EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
        AND x.ended_at IS NULL))`;
}

export async function createFutureRoutineFromCompletedEntry(
  db: D1Database,
  appUserId: string,
  request: CreateFutureRoutineFromCompletedEntryRequest,
  nowInstant = new Date().toISOString(),
  hooks: CompletedEntryFutureRoutineHooks = {},
): Promise<CreateFutureRoutineFromCompletedEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, commandType, requestFingerprint);

  const existing = await readCorrelation(db, appUserId, request.source_entry_id);
  if (existing) {
    return persistSuccess(db, appUserId, request, requestFingerprint,
      correlationResult(existing, true), nowInstant);
  }

  const currentDay = await readCurrentLogicalDayContext(db, appUserId, nowInstant);
  const source = await readSource(db, appUserId, request.source_entry_id);
  if (!source) return rejectDomain(db, appUserId, request, requestFingerprint,
    "resource_not_found", "Entry is unavailable");
  const metadata = await readMetadata(db, appUserId, source, currentDay.logicalDate, request, requestFingerprint);
  const board = await readBoard(db, appUserId);
  if (board.boardRevision !== request.expected_board_revision) {
    return rejectRevision(db, appUserId, request, requestFingerprint, "The Routine Board revision is stale");
  }
  const collisions = await db.prepare(`SELECT
      EXISTS (SELECT 1 FROM tasks WHERE id = ?) AS task_id_used,
      EXISTS (SELECT 1 FROM routine_definitions WHERE id = ?) AS routine_id_used`)
    .bind(request.task_id, request.routine_definition_id)
    .first<{ task_id_used: number; routine_id_used: number }>();
  if (collisions?.task_id_used || collisions?.routine_id_used) {
    return rejectDomain(db, appUserId, request, requestFingerprint,
      "resource_conflict", "The requested new Routine identity is unavailable");
  }

  const startLogicalDate = nextLogicalDate(currentDay.logicalDate);
  const result: CreateFutureRoutineFromCompletedEntryResult = {
    source_entry_id: source.entry_id, task_id: request.task_id,
    routine_definition_id: request.routine_definition_id, board_position: board.boardPosition,
    board_revision: board.boardRevision + 1, settings_revision: 0,
    start_logical_date: startLogicalDate, source_was_already_converted: false,
  };
  const preconditionId = `future-routine-pre:${request.operation_id}`;
  const postconditionId = `future-routine-post:${request.operation_id}`;
  const stableSourceSql = sourceStillMatchesSql();
  const stableSourceBindings = [appUserId, source.entry_id, source.task_id, source.taskchute_day_id,
    currentDay.logicalDate, currentDay.timezone, currentDay.boundaryMinutes,
    source.section_id, source.planned_start_minute, source.estimate_seconds,
    source.task_title, metadata.projectId, source.project_title, metadata.modeId,
    source.snapshot_mode_title, metadata.modeId];

  await hooks.beforeMutation?.();
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN EXISTS (SELECT 1 FROM routine_board_heads
            WHERE app_user_id = ? AND board_revision = ?)
          AND NOT EXISTS (SELECT 1 FROM completed_entry_future_routines
            WHERE app_user_id = ? AND source_entry_id = ?)
          AND NOT EXISTS (SELECT 1 FROM tasks WHERE id = ?)
          AND NOT EXISTS (SELECT 1 FROM routine_definitions WHERE id = ?)
          AND ${stableSourceSql}
          AND (? IS NULL OR EXISTS (SELECT 1 FROM projects p
            WHERE p.app_user_id = ? AND p.id = ? AND NOT EXISTS (SELECT 1 FROM project_archives a
              WHERE a.app_user_id = p.app_user_id AND a.project_id = p.id)))
          AND (? IS NULL OR EXISTS (SELECT 1 FROM mode_definitions m
            WHERE m.app_user_id = ? AND m.id = ? AND NOT EXISTS (SELECT 1 FROM mode_archives a
              WHERE a.app_user_id = m.app_user_id AND a.mode_id = m.id)))
          AND ((? IS NULL AND NOT EXISTS (SELECT 1 FROM section_configuration_heads WHERE app_user_id = ?))
            OR EXISTS (SELECT 1 FROM section_configuration_heads WHERE app_user_id = ? AND configuration_version_id = ?))
          AND (? IS NULL OR EXISTS (SELECT 1 FROM section_configuration_items i
            WHERE i.app_user_id = ? AND i.configuration_version_id = ? AND i.section_id = ?
              AND i.logical_start_minute <= ? AND ? < i.logical_end_minute))
          THEN 1 ELSE 0 END`)
        .bind(appUserId, preconditionId, appUserId, request.expected_board_revision,
          appUserId, source.entry_id, request.task_id, request.routine_definition_id,
          ...stableSourceBindings,
          metadata.projectId, appUserId, metadata.projectId,
          metadata.modeId, appUserId, metadata.modeId,
          metadata.sectionConfigurationVersionId, appUserId, appUserId, metadata.sectionConfigurationVersionId,
          metadata.defaultSectionId, appUserId, metadata.sectionConfigurationVersionId,
          metadata.defaultSectionId, metadata.defaultPlannedStartMinute, metadata.defaultPlannedStartMinute),
      db.prepare(`INSERT INTO tasks (id, app_user_id, project_id, title, created_at)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM transaction_assertions
          WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(request.task_id, appUserId, metadata.projectId, source.task_title, nowInstant, appUserId, preconditionId),
      db.prepare(`INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type,
        start_logical_date, end_logical_date, default_section_id, default_estimate_seconds,
        default_planned_start_minute, materialization_order, defaults_revision, created_at)
        SELECT ?, ?, ?, 'daily', ?, NULL, ?, ?, ?, ?, 0, ? WHERE EXISTS (
          SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(request.routine_definition_id, appUserId, request.task_id, startLogicalDate,
          metadata.defaultSectionId, source.estimate_seconds, metadata.defaultPlannedStartMinute,
          board.materializationOrder, nowInstant, appUserId, preconditionId),
      db.prepare(`INSERT INTO routine_schedules
        (app_user_id, routine_definition_id, schedule_kind, interval_days, interval_weeks,
         interval_months, weekdays_mask, month_day, month_ordinal, month_weekday)
        SELECT ?, ?, 'daily', NULL, NULL, NULL, NULL, NULL, NULL, NULL WHERE EXISTS (
          SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.routine_definition_id, appUserId, preconditionId),
      db.prepare(`INSERT INTO routine_definition_modes (app_user_id, routine_definition_id, mode_id)
        SELECT ?, ?, ? WHERE ? IS NOT NULL AND EXISTS (SELECT 1 FROM transaction_assertions
          WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.routine_definition_id, metadata.modeId, metadata.modeId, appUserId, preconditionId),
      db.prepare(`INSERT INTO routine_board_items (app_user_id, routine_definition_id, board_position, settings_revision)
        SELECT ?, ?, ?, 0 WHERE EXISTS (SELECT 1 FROM transaction_assertions
          WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.routine_definition_id, board.boardPosition, appUserId, preconditionId),
      db.prepare(`UPDATE routine_board_heads SET board_revision = board_revision + 1
        WHERE app_user_id = ? AND board_revision = ? AND EXISTS (SELECT 1 FROM transaction_assertions
          WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.expected_board_revision, appUserId, preconditionId),
      db.prepare(`INSERT INTO completed_entry_future_routines
        (app_user_id, source_entry_id, routine_definition_id, created_at)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM transaction_assertions
          WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, source.entry_id, request.routine_definition_id, nowInstant, appUserId, preconditionId),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ? AND project_id IS ? AND title IS ?)
          AND EXISTS (SELECT 1 FROM routine_definitions WHERE app_user_id = ? AND id = ? AND task_id = ?
            AND recurrence_type = 'daily' AND start_logical_date = ? AND end_logical_date IS NULL
            AND default_section_id IS ? AND default_planned_start_minute IS ?
            AND default_estimate_seconds IS ? AND materialization_order = ? AND defaults_revision = 0)
          AND EXISTS (SELECT 1 FROM routine_schedules WHERE app_user_id = ? AND routine_definition_id = ?
            AND schedule_kind = 'daily')
          AND ((? IS NULL AND NOT EXISTS (SELECT 1 FROM routine_definition_modes
              WHERE app_user_id = ? AND routine_definition_id = ?))
            OR EXISTS (SELECT 1 FROM routine_definition_modes WHERE app_user_id = ?
              AND routine_definition_id = ? AND mode_id = ?))
          AND EXISTS (SELECT 1 FROM routine_board_items WHERE app_user_id = ? AND routine_definition_id = ?
            AND board_position = ? AND settings_revision = 0)
          AND EXISTS (SELECT 1 FROM routine_board_heads WHERE app_user_id = ? AND board_revision = ?)
          AND EXISTS (SELECT 1 FROM completed_entry_future_routines WHERE app_user_id = ?
            AND source_entry_id = ? AND routine_definition_id = ?)
          AND NOT EXISTS (SELECT 1 FROM routine_occurrences WHERE app_user_id = ? AND routine_definition_id = ?)
          AND NOT EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND routine_occurrence_id IN
            (SELECT id FROM routine_occurrences WHERE app_user_id = ? AND routine_definition_id = ?))
          AND ${stableSourceSql}
          THEN 1 ELSE 0 END WHERE EXISTS (SELECT 1 FROM transaction_assertions
            WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, postconditionId,
          appUserId, request.task_id, metadata.projectId, source.task_title,
          appUserId, request.routine_definition_id, request.task_id, startLogicalDate,
          metadata.defaultSectionId, metadata.defaultPlannedStartMinute, source.estimate_seconds, board.materializationOrder,
          appUserId, request.routine_definition_id,
          metadata.modeId, appUserId, request.routine_definition_id,
          appUserId, request.routine_definition_id, metadata.modeId,
          appUserId, request.routine_definition_id, board.boardPosition,
          appUserId, result.board_revision,
          appUserId, source.entry_id, request.routine_definition_id,
          appUserId, request.routine_definition_id, appUserId, appUserId, request.routine_definition_id,
          ...stableSourceBindings,
          appUserId, preconditionId),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type,
        request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, ?, ?, ?, 'success', ?, ? WHERE EXISTS (SELECT 1 FROM transaction_assertions
          WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, commandType, REQUEST_FINGERPRINT_VERSION,
          requestFingerprint, JSON.stringify(result), nowInstant, appUserId, postconditionId),
      db.prepare(`DELETE FROM transaction_assertions WHERE app_user_id = ? AND id IN (?, ?)`)
        .bind(appUserId, preconditionId, postconditionId),
    ]);
    const requiredChanges = [0, 1, 2, 3, 5, 6, 7, 8, 9];
    if (requiredChanges.some((index) => results[index]?.meta.changes !== 1)) {
      throw new Error("Atomic future Routine postcondition did not hold");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, commandType, requestFingerprint);

    const correlated = await readCorrelation(db, appUserId, source.entry_id);
    if (correlated) {
      return persistSuccess(db, appUserId, request, requestFingerprint,
        correlationResult(correlated, true), nowInstant);
    }

    const [latestBoard, latestSource, latestDay] = await Promise.all([
      readBoard(db, appUserId), readSource(db, appUserId, source.entry_id),
      readCurrentLogicalDayContext(db, appUserId, nowInstant),
    ]);
    if (latestBoard.boardRevision !== request.expected_board_revision) {
      return rejectRevision(db, appUserId, request, requestFingerprint, "The Routine Board revision is stale");
    }
    if (!latestSource || latestSource.lifecycle_state !== "completed"
      || latestSource.routine_occurrence_id !== null || latestSource.logical_date !== currentDay.logicalDate
      || latestDay.logicalDate !== currentDay.logicalDate || latestDay.timezone !== currentDay.timezone
      || latestDay.boundaryMinutes !== currentDay.boundaryMinutes
      || latestSource.task_id !== source.task_id || latestSource.task_title !== source.task_title
      || latestSource.section_id !== source.section_id || latestSource.planned_start_minute !== source.planned_start_minute
      || latestSource.estimate_seconds !== source.estimate_seconds
      || latestSource.project_id !== metadata.projectId || latestSource.project_title !== source.project_title
      || latestSource.snapshot_mode_id !== metadata.modeId
      || latestSource.snapshot_mode_title !== source.snapshot_mode_title
      || latestSource.live_mode_id !== metadata.modeId) {
      return rejectDomain(db, appUserId, request, requestFingerprint, "resource_conflict",
        "The completed Entry or its historical metadata changed before conversion");
    }
    throw new HttpError(503, "infrastructure_ambiguous", "The Routine conversion outcome is unknown; reload and retry the exact operation", true);
  }
}
