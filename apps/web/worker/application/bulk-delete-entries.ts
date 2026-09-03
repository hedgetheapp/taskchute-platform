import type { BulkDeleteEntriesRequest, BulkDeleteEntriesResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isBulkDeleteEntriesRequest(value: unknown): value is BulkDeleteEntriesRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !("user_id" in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && Array.isArray(body.entry_ids) && body.entry_ids.length > 0
    && body.entry_ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(body.entry_ids).size === body.entry_ids.length
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
  routine_record_id: string | null;
  execution_count: number;
  suppression_count: number;
  position: number;
}

async function reject(
  db: D1Database,
  appUserId: string,
  request: BulkDeleteEntriesRequest,
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<BulkDeleteEntriesResult> {
  return persistRejection<BulkDeleteEntriesResult>(db, {
    appUserId,
    operationId: request.operation_id,
    commandType: "BulkDeleteEntries",
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

function targetSnapshot(rows: TargetRow[]): string {
  return JSON.stringify(rows.map((row) => ({
    id: row.id,
    lifecycle_state: row.lifecycle_state,
    routine_occurrence_id: row.routine_occurrence_id,
    position: row.position,
    execution_count: row.execution_count,
    suppression_count: row.suppression_count,
  })));
}

export async function bulkDeleteEntries(
  db: D1Database,
  appUserId: string,
  request: BulkDeleteEntriesRequest,
  now = new Date().toISOString(),
): Promise<BulkDeleteEntriesResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<BulkDeleteEntriesResult>(prior, "BulkDeleteEntries", requestFingerprint);

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
  if (day.logical_date < currentLogicalDate) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Bulk delete is unavailable for a past TaskChuteDay");
  }
  if (day.placement_revision !== request.expected_placement_revision) {
    return persistRejection<BulkDeleteEntriesResult>(db, {
      appUserId,
      operationId: request.operation_id,
      commandType: "BulkDeleteEntries",
      requestFingerprint,
      outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }

  const idsJson = JSON.stringify(request.entry_ids);
  const targetResult = await db.prepare(`SELECT e.id, e.lifecycle_state, e.routine_occurrence_id, e.position,
      ro.id AS routine_record_id,
      (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id) AS execution_count,
      (SELECT COUNT(*) FROM routine_occurrence_suppressions s
        WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id) AS suppression_count
    FROM entries e
    LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
    WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
      AND e.id IN (SELECT value FROM json_each(?))
    ORDER BY e.position, e.id`).bind(appUserId, request.taskchute_day_id, idsJson).all<TargetRow>();
  const targets = targetResult.results;
  if (targets.length !== request.entry_ids.length) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Every selected Entry must belong to this TaskChuteDay");
  }
  if (targets.some((target) => target.lifecycle_state !== "planned")) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Only planned Entries can be bulk deleted");
  }
  if (targets.some((target) => target.routine_occurrence_id === null && target.execution_count > 0)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "An ordinary Entry has execution history and cannot be removed safely");
  }
  if (targets.some((target) => target.routine_occurrence_id !== null
    && (target.routine_record_id === null || target.suppression_count > 0))) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "A Routine Entry is unavailable for this bulk operation");
  }

  const ordinaryIds = request.entry_ids.filter((id) => targets.some((target) => target.id === id && target.routine_occurrence_id === null));
  const routineIds = request.entry_ids.filter((id) => targets.some((target) => target.id === id && target.routine_occurrence_id !== null));
  const ordinaryIdsJson = JSON.stringify(ordinaryIds);
  const routineIdsJson = JSON.stringify(routineIds);
  const snapshotJson = targetSnapshot(targets);
  const result: BulkDeleteEntriesResult = {
    taskchute_day_id: request.taskchute_day_id,
    deleted_entry_ids: ordinaryIds,
    skipped_routine_entry_ids: routineIds,
    placement_revision: request.expected_placement_revision + 1,
  };
  const assertionId = `bulk-delete:${request.operation_id}`;

  try {
    const [guard, , , , assertion, operationPersist] = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days
        WHERE app_user_id = ? AND id = ? AND placement_revision = ? AND logical_date >= ?
          AND NOT EXISTS (
            SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ?
              AND e.id = json_extract(snapshot.value, '$.id')
            WHERE e.id IS NULL
              OR e.lifecycle_state != json_extract(snapshot.value, '$.lifecycle_state')
              OR e.routine_occurrence_id IS NOT json_extract(snapshot.value, '$.routine_occurrence_id')
              OR e.position != CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
              OR (CAST(json_extract(snapshot.value, '$.execution_count') AS INTEGER) !=
                (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id))
              OR (CAST(json_extract(snapshot.value, '$.suppression_count') AS INTEGER) !=
                (SELECT COUNT(*) FROM routine_occurrence_suppressions s
                  WHERE s.app_user_id = e.app_user_id AND s.routine_occurrence_id = e.routine_occurrence_id))
          )`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          request.expected_placement_revision, currentLogicalDate, snapshotJson, appUserId, request.taskchute_day_id),
      db.prepare(`DELETE FROM entries
        WHERE app_user_id = ? AND taskchute_day_id = ? AND lifecycle_state = 'planned'
          AND routine_occurrence_id IS NULL AND id IN (SELECT value FROM json_each(?))
          AND NOT EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = entries.app_user_id AND x.entry_id = entries.id)
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, ordinaryIdsJson, appUserId, request.operation_id),
      db.prepare(`INSERT INTO routine_occurrence_suppressions
        (app_user_id, routine_occurrence_id, suppressed_at, reason)
        SELECT e.app_user_id, e.routine_occurrence_id, ?, 'skip' FROM entries e
        WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.lifecycle_state = 'planned'
          AND e.routine_occurrence_id IS NOT NULL AND e.id IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(now, appUserId, request.taskchute_day_id, routineIdsJson, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND placement_revision = ?
          AND EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, request.expected_placement_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) selected
            JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = ?
              AND e.id = selected.value)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) selected
            WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
              AND e.id = selected.value AND e.lifecycle_state = 'planned'
              AND e.routine_occurrence_id IS NOT NULL)
              OR NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions s
                JOIN entries e ON e.app_user_id = s.app_user_id AND e.routine_occurrence_id = s.routine_occurrence_id
                WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = selected.value AND s.reason = 'skip'))
          THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId, appUserId, request.taskchute_day_id, result.placement_revision,
          ordinaryIdsJson, appUserId, request.taskchute_day_id, routineIdsJson,
          appUserId, request.taskchute_day_id, appUserId, request.taskchute_day_id,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'BulkDeleteEntries', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now,
          appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<BulkDeleteEntriesResult>(committed, "BulkDeleteEntries", requestFingerprint);
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.taskchute_day_id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_placement_revision) {
        return persistRejection<BulkDeleteEntriesResult>(db, {
          appUserId,
          operationId: request.operation_id,
          commandType: "BulkDeleteEntries",
          requestFingerprint,
          outcomeKind: "revision_conflict",
          result: { code: "revision_conflict", message: "The placement revision is stale" },
        });
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Selected Entries changed before bulk delete could commit");
    }
    if (assertion.meta.changes === 0 || operationPersist.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The bulk delete did not converge", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<BulkDeleteEntriesResult>(committed, "BulkDeleteEntries", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The bulk delete outcome is unknown; reload canonical state and retry", true);
  }
}
