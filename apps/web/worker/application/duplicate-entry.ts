import type { DuplicateEntryRequest, DuplicateEntryResult } from "../../src/shared/contracts";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isDuplicateEntryRequest(value: unknown): value is DuplicateEntryRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body)
    && [body.operation_id, body.source_entry_id, body.new_task_id, body.new_entry_id, body.taskchute_day_id]
      .every((id) => typeof id === "string" && isUuidV7(id))
    && Number.isInteger(body.expected_placement_revision) && Number(body.expected_placement_revision) >= 0;
}

interface SourceRow {
  task_id: string; title: string; project_id: string | null; section_id: string | null;
  estimate_seconds: number | null; planned_start_minute: number | null; position: number; placement_revision: number;
  lifecycle_state: "planned" | "completed"; routine_occurrence_id: string | null; establishment_boundary_minutes: number;
}

interface UserSettingsRow {
  timezone: string;
  day_boundary_minutes: number;
}

async function reject(
  db: D1Database, appUserId: string, request: DuplicateEntryRequest, requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict", message: string,
): Promise<DuplicateEntryResult> {
  return persistRejection<DuplicateEntryResult>(db, { appUserId, operationId: request.operation_id,
    commandType: "DuplicateEntry", requestFingerprint, outcomeKind: "domain_rejection", result: { code, message } });
}

export async function duplicateEntry(
  db: D1Database, appUserId: string, request: DuplicateEntryRequest, now = new Date().toISOString(),
): Promise<DuplicateEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const existing = await readOperation(db, appUserId, request.operation_id);
  if (existing) return replayOperation<DuplicateEntryResult>(existing, "DuplicateEntry", requestFingerprint);

  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<UserSettingsRow>();
  if (!settings) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Entry is not an eligible planned source");
  }
  const currentLogicalDate = resolveTaskChuteDay(now, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  }).logicalDate;

  const source = await db.prepare(`SELECT e.task_id, t.title, t.project_id, e.section_id, e.estimate_seconds,
      e.planned_start_minute, e.position, e.lifecycle_state, e.routine_occurrence_id, d.placement_revision, d.establishment_boundary_minutes
    FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    WHERE e.app_user_id = ? AND e.id = ? AND e.taskchute_day_id = ?
      AND ((e.lifecycle_state = 'planned' AND d.logical_date >= ?)
        OR (e.lifecycle_state = 'completed' AND d.logical_date = ?))`).bind(appUserId, request.source_entry_id, request.taskchute_day_id, currentLogicalDate, currentLogicalDate)
    .first<SourceRow>();
  if (!source) return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Entry is not an eligible planned source");
  const pairValid = source.section_id === null
    ? source.planned_start_minute === null
    : source.planned_start_minute !== null
      && source.planned_start_minute >= source.establishment_boundary_minutes
      && source.planned_start_minute < source.establishment_boundary_minutes + 1440
      && await db.prepare(`SELECT COUNT(*) AS count FROM taskchute_day_section_contexts
        WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?
          AND logical_start_minute IS NOT NULL AND logical_end_minute IS NOT NULL
          AND ? >= logical_start_minute AND ? < logical_end_minute`)
        .bind(appUserId, request.taskchute_day_id, source.section_id, source.planned_start_minute, source.planned_start_minute)
        .first<number>("count") === 1;
  if (!pairValid) return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Entry has an invalid Section and planned-start pair");
  if (source.placement_revision !== request.expected_placement_revision) {
    return persistRejection<DuplicateEntryResult>(db, { appUserId, operationId: request.operation_id,
      commandType: "DuplicateEntry", requestFingerprint, outcomeKind: "revision_conflict",
      result: { message: "The placement revision is stale" } });
  }
  const collision = await db.batch([
    db.prepare("SELECT id FROM tasks WHERE id = ?").bind(request.new_task_id),
    db.prepare("SELECT id FROM entries WHERE id = ?").bind(request.new_entry_id),
  ]);
  if (collision[0].results.length || collision[1].results.length) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "new task or entry identity is already in use");
  }
  const sectionRows = await db.prepare(`SELECT id, position, lifecycle_state, planned_start_minute FROM entries
    WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ? ORDER BY position, id`)
    .bind(appUserId, request.taskchute_day_id, source.section_id)
    .all<{ id: string; position: number; lifecycle_state: string; planned_start_minute: number | null }>();
  const sectionSnapshot = JSON.stringify(sectionRows.results);
  const shiftOffset = Math.max(...sectionRows.results.map((row) => row.position), 0) + sectionRows.results.length + 1;
  const result: DuplicateEntryResult = { task_id: request.new_task_id, entry_id: request.new_entry_id,
    taskchute_day_id: request.taskchute_day_id, section_id: source.section_id, position: source.position + 1,
    placement_revision: request.expected_placement_revision + 1 };
  const assertionId = `duplicate-entry:${request.operation_id}`;
  try {
    const [guard, , , , , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, ?, d.id, ? FROM taskchute_days d JOIN entries e ON e.app_user_id = d.app_user_id AND e.taskchute_day_id = d.id
          JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
        WHERE d.app_user_id = ? AND d.id = ? AND d.placement_revision = ?
          AND ((e.lifecycle_state = 'planned' AND d.logical_date >= ?)
            OR (e.lifecycle_state = 'completed' AND d.logical_date = ?))
          AND EXISTS (SELECT 1 FROM user_settings WHERE app_user_id = ? AND timezone = ? AND day_boundary_minutes = ?)
          AND e.id = ? AND e.lifecycle_state = ? AND e.position = ? AND e.routine_occurrence_id IS ?
          AND t.title = ? AND t.project_id IS ? AND e.section_id IS ? AND e.estimate_seconds IS ? AND e.planned_start_minute IS ?
          AND ((e.section_id IS NULL AND e.planned_start_minute IS NULL) OR (e.section_id IS NOT NULL
            AND e.planned_start_minute >= d.establishment_boundary_minutes
            AND e.planned_start_minute < d.establishment_boundary_minutes + 1440
            AND (SELECT COUNT(*) FROM taskchute_day_section_contexts c WHERE c.app_user_id = d.app_user_id
              AND c.taskchute_day_id = d.id AND c.section_id = e.section_id
              AND c.logical_start_minute IS NOT NULL AND c.logical_end_minute IS NOT NULL
              AND e.planned_start_minute >= c.logical_start_minute AND e.planned_start_minute < c.logical_end_minute) = 1))
          AND NOT EXISTS (SELECT 1 FROM tasks WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM entries WHERE id = ?)`)
        .bind(request.operation_id, appUserId, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          request.expected_placement_revision, currentLogicalDate, currentLogicalDate, appUserId, settings.timezone, settings.day_boundary_minutes,
          request.source_entry_id, source.lifecycle_state, source.position, source.routine_occurrence_id,
          source.title, source.project_id, source.section_id, source.estimate_seconds, source.planned_start_minute,
          request.new_task_id, request.new_entry_id),
      db.prepare(`UPDATE entries SET position = position + ? WHERE app_user_id = ? AND taskchute_day_id = ?
        AND section_id IS ? AND position > ? AND EXISTS (
          SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(shiftOffset, appUserId, request.taskchute_day_id, source.section_id, source.position, appUserId, request.operation_id),
      db.prepare(`UPDATE entries SET position = position - ? + 1 WHERE app_user_id = ? AND taskchute_day_id = ?
        AND section_id IS ? AND position > ? AND EXISTS (
          SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(shiftOffset, appUserId, request.taskchute_day_id, source.section_id, shiftOffset, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1 WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO tasks (id, app_user_id, project_id, title, created_at) SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.new_task_id, appUserId, source.project_id, source.title, now, appUserId, request.operation_id),
      db.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
          estimate_seconds, planned_start_minute, created_at) SELECT ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.new_entry_id, appUserId, request.new_task_id, request.taskchute_day_id, source.section_id,
          source.position + 1, source.estimate_seconds, source.planned_start_minute, now, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok) SELECT ?, ?, CASE WHEN
        EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)
        AND EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
        AND EXISTS (SELECT 1 FROM tasks WHERE app_user_id = ? AND id = ? AND project_id IS ? AND title = ?)
        AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND task_id = ? AND taskchute_day_id = ?
          AND section_id IS ? AND position = ? AND lifecycle_state = 'planned' AND estimate_seconds IS ?
          AND planned_start_minute IS ? AND routine_occurrence_id IS NULL)
        AND EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ? AND task_id = ? AND position = ?
          AND section_id IS ? AND estimate_seconds IS ? AND planned_start_minute IS ? AND routine_occurrence_id IS ?)
        AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id IS ?) = json_array_length(?) + 1
        AND NOT EXISTS (
          SELECT 1 FROM json_each(?) snapshot
          LEFT JOIN entries current ON current.app_user_id = ? AND current.taskchute_day_id = ?
            AND current.section_id IS ? AND current.id = json_extract(snapshot.value, '$.id')
          WHERE current.id IS NULL OR current.position != CASE
            WHEN CAST(json_extract(snapshot.value, '$.position') AS INTEGER) > ?
              THEN CAST(json_extract(snapshot.value, '$.position') AS INTEGER) + 1
            ELSE CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
          END
        )
        THEN 1 ELSE 0 END WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.operation_id, appUserId, request.taskchute_day_id,
          result.placement_revision, appUserId, request.new_task_id, source.project_id, source.title,
          appUserId, request.new_entry_id, request.new_task_id, request.taskchute_day_id, source.section_id, source.position + 1,
          source.estimate_seconds, source.planned_start_minute, appUserId, request.source_entry_id, source.task_id, source.position,
          source.section_id, source.estimate_seconds, source.planned_start_minute, source.routine_occurrence_id,
          appUserId, request.taskchute_day_id, source.section_id, sectionSnapshot,
          sectionSnapshot, appUserId, request.taskchute_day_id, source.section_id, source.position,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at) SELECT ?, ?, 'DuplicateEntry', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<DuplicateEntryResult>(committed, "DuplicateEntry", requestFingerprint);
      const [latestDay, latestTaskCollision, latestEntryCollision] = await db.batch([
        db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
          .bind(appUserId, request.taskchute_day_id),
        db.prepare("SELECT id FROM tasks WHERE id = ?").bind(request.new_task_id),
        db.prepare("SELECT id FROM entries WHERE id = ?").bind(request.new_entry_id),
      ]);
      const latestRevision = (latestDay.results[0] as { placement_revision?: unknown } | undefined)?.placement_revision;
      if (latestRevision !== request.expected_placement_revision) {
        return persistRejection<DuplicateEntryResult>(db, { appUserId, operationId: request.operation_id,
          commandType: "DuplicateEntry", requestFingerprint, outcomeKind: "revision_conflict",
          result: { code: "revision_conflict", message: "The placement revision is stale" } });
      }
      if (latestTaskCollision.results.length || latestEntryCollision.results.length) {
        return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "new task or entry identity is already in use");
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict",
        "The source Entry changed or became ineligible before Duplicate could commit");
    }
    if (assertion.meta.changes === 0 || operationPersist.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The Duplicate mutation did not converge", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<DuplicateEntryResult>(committed, "DuplicateEntry", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
