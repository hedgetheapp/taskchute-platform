import type { DeleteCompletedEntryRequest, DeleteCompletedEntryResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isDeleteCompletedEntryRequest(value: unknown): value is DeleteCompletedEntryRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !("user_id" in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && Number.isSafeInteger(body.expected_placement_revision)
    && Number(body.expected_placement_revision) >= 0;
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
  lifecycle_state: "planned" | "running" | "completed";
  routine_occurrence_id: string | null;
  execution_count: number;
  active_execution_count: number;
}

async function reject(
  db: D1Database,
  appUserId: string,
  request: DeleteCompletedEntryRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<DeleteCompletedEntryResult> {
  return persistRejection<DeleteCompletedEntryResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "DeleteCompletedEntry",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

export async function deleteCompletedEntry(
  db: D1Database,
  appUserId: string,
  request: DeleteCompletedEntryRequest,
  now = new Date().toISOString(),
): Promise<DeleteCompletedEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<DeleteCompletedEntryResult>(prior, "DeleteCompletedEntry", requestFingerprint);

  const [settingsResult, dayResult] = await db.batch([
    db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?").bind(appUserId),
    db.prepare(`SELECT logical_date, placement_revision FROM taskchute_days
      WHERE app_user_id = ? AND id = ?`).bind(appUserId, request.taskchute_day_id),
  ]);
  const settings = settingsResult.results[0] as SettingsRow | undefined;
  const day = dayResult.results[0] as DayRow | undefined;
  if (!settings || !day) return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "TaskChuteDay is unavailable");

  const currentLogicalDate = resolveTaskChuteDay(now, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  }).logicalDate;
  if (day.logical_date !== currentLogicalDate) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Completed Entry deletion is available only for the current TaskChuteDay");
  }
  if (day.placement_revision !== request.expected_placement_revision) {
    return persistRejection<DeleteCompletedEntryResult>(db, {
      appUserId,
      operationId: request.operation_id,
      commandType: "DeleteCompletedEntry",
      requestFingerprint,
      outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }

  const target = await db.prepare(`SELECT e.id, e.lifecycle_state, e.routine_occurrence_id,
      (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id) AS execution_count,
      (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id AND x.ended_at IS NULL) AS active_execution_count
    FROM entries e
    WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = ?`).bind(
    appUserId, request.taskchute_day_id, request.entry_id,
  ).first<TargetRow>();
  if (!target) return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The Entry does not belong to this TaskChuteDay");
  if (target.lifecycle_state !== "completed") {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Only completed Entries can be hard deleted");
  }
  if (target.active_execution_count > 0) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "An active Execution cannot be hard deleted");
  }
  if (target.execution_count === 0) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "A completed Entry must have Execution history");
  }

  const executionRows = await db.prepare(`SELECT id FROM executions
    WHERE app_user_id = ? AND entry_id = ? ORDER BY id`).bind(appUserId, request.entry_id).all<{ id: string }>();
  const deletedExecutionIds = executionRows.results.map((row) => row.id);
  const result: DeleteCompletedEntryResult = {
    entry_id: request.entry_id,
    deleted_execution_ids: deletedExecutionIds,
    taskchute_day_id: request.taskchute_day_id,
    placement_revision: request.expected_placement_revision + 1,
  };
  const assertionId = `delete-completed-entry:${request.operation_id}`;

  try {
    const [guard, , , , , , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days
        WHERE app_user_id = ? AND id = ? AND logical_date = ? AND placement_revision = ?
          AND EXISTS (
            SELECT 1 FROM entries e
            WHERE e.app_user_id = taskchute_days.app_user_id AND e.taskchute_day_id = taskchute_days.id
              AND e.id = ? AND e.lifecycle_state = 'completed'
              AND EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id)
              AND NOT EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id AND x.ended_at IS NULL)
          )`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          currentLogicalDate, request.expected_placement_revision, request.entry_id),
      db.prepare(`DELETE FROM executions
        WHERE app_user_id = ? AND entry_id = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM lifecycle_command_guards
        WHERE app_user_id = ? AND entry_id = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_mode_snapshots
        WHERE app_user_id = ? AND entry_id = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_modes
        WHERE app_user_id = ? AND entry_id = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_project_snapshots
        WHERE app_user_id = ? AND entry_id = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_task_snapshots
        WHERE app_user_id = ? AND entry_id = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entries
        WHERE app_user_id = ? AND taskchute_day_id = ? AND id = ? AND lifecycle_state = 'completed'
          AND NOT EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = entries.app_user_id AND x.entry_id = entries.id)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, request.entry_id, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND logical_date = ? AND placement_revision = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, currentLogicalDate, request.expected_placement_revision,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
          AND NOT EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ?)
          AND NOT EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND entry_id = ?)
          THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.taskchute_day_id, result.placement_revision,
          appUserId, request.entry_id, appUserId, request.entry_id, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'DeleteCompletedEntry', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<DeleteCompletedEntryResult>(committed, "DeleteCompletedEntry", requestFingerprint);
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.taskchute_day_id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_placement_revision) {
        return persistRejection<DeleteCompletedEntryResult>(db, {
          appUserId,
          operationId: request.operation_id,
          commandType: "DeleteCompletedEntry",
          requestFingerprint,
          outcomeKind: "revision_conflict",
          result: { code: "revision_conflict", message: "The placement revision is stale" },
        });
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The completed Entry changed before deletion could commit");
    }
    if (assertion.meta.changes === 0 || operationPersist.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The completed Entry deletion did not converge", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<DeleteCompletedEntryResult>(committed, "DeleteCompletedEntry", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The completed Entry deletion outcome is unknown; reload canonical state and retry", true);
  }
}
