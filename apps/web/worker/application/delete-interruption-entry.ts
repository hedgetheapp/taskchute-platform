import type { DeleteInterruptionEntryRequest, DeleteInterruptionEntryResult } from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { analyzeContinuationLineage, type ContinuationEntryNode, type ContinuationLineageTombstone } from "./continuation-lineage";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface SettingsRow { timezone: string; day_boundary_minutes: number }
interface DayRow { logical_date: string; placement_revision: number }
interface EntryRow extends ContinuationEntryNode {
  task_id: string; taskchute_day_id: string; lifecycle_state: "planned" | "running" | "completed";
  routine_occurrence_id: string | null; section_id: string | null; position: number;
  planned_start_minute: number | null; quick_interrupt_origin: string | null;
}
interface ExecutionRow { id: string; entry_id: string; started_at: string; ended_at: string | null; terminal_outcome: "completed" | "interrupted" | null }
interface PairRow { target_entry_id: string; continuation_entry_id: string; created_at: string }
interface TombstoneRow extends ContinuationLineageTombstone {}
interface Snapshot { entries: EntryRow[]; executions: ExecutionRow[]; pairs: PairRow[]; lineage: TombstoneRow[] }

export function isDeleteInterruptionEntryRequest(value: unknown): value is DeleteInterruptionEntryRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const keys = ["operation_id", "taskchute_day_id", "entry_id", "expected_placement_revision", "confirmed"];
  return Object.keys(body).length === keys.length && keys.every((key) => key in body) && !("user_id" in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && typeof body.entry_id === "string" && isUuidV7(body.entry_id)
    && Number.isSafeInteger(body.expected_placement_revision) && Number(body.expected_placement_revision) >= 0
    && body.confirmed === true;
}

function row<T>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid persistence row");
  return value as T;
}
function rows<T>(values: unknown[]): T[] { return values.map((value) => row<T>(value)); }
function latestOutcome(executions: ExecutionRow[], entryId: string): string | null {
  const own = executions.filter((item) => item.entry_id === entryId)
    .sort((a, b) => (a.ended_at ?? a.started_at).localeCompare(b.ended_at ?? b.started_at) || a.id.localeCompare(b.id));
  return own.at(-1)?.terminal_outcome ?? null;
}
function validLifecycle(entry: EntryRow, executions: ExecutionRow[]): boolean {
  const own = executions.filter((item) => item.entry_id === entry.id);
  if (entry.lifecycle_state === "planned") return own.length === 0;
  if (entry.lifecycle_state === "running") return own.filter((item) => item.ended_at === null).length === 1;
  return own.length > 0 && own.every((item) => item.ended_at !== null);
}
async function reject(
  db: D1Database, appUserId: string, request: DeleteInterruptionEntryRequest, requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict", message: string,
): Promise<DeleteInterruptionEntryResult> {
  return persistRejection<DeleteInterruptionEntryResult>(db, {
    appUserId, operationId: request.operation_id, commandType: "DeleteInterruptionEntry", requestFingerprint,
    outcomeKind: "domain_rejection", result: { code, message },
  });
}

export async function deleteInterruptionEntry(
  db: D1Database, appUserId: string, request: DeleteInterruptionEntryRequest,
  now = new Date().toISOString(),
): Promise<DeleteInterruptionEntryResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<DeleteInterruptionEntryResult>(prior, "DeleteInterruptionEntry", requestFingerprint);

  const [settingsResult, dayResult, targetResult] = await db.batch([
    db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?").bind(appUserId),
    db.prepare("SELECT logical_date, placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, request.taskchute_day_id),
    db.prepare(`SELECT e.id, e.task_id, e.taskchute_day_id, e.lifecycle_state, e.routine_occurrence_id,
        e.section_id, e.position, e.planned_start_minute, e.estimate_seconds,
        e.continuation_chain_id, e.continuation_parent_entry_id, t.quick_interrupt_origin,
        (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id) AS execution_count,
        (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id AND x.ended_at IS NULL) AS active_execution_count,
        (SELECT COUNT(*) FROM entries other WHERE other.app_user_id = e.app_user_id AND other.task_id = e.task_id) AS task_entry_count
      FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      WHERE e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = ?`)
      .bind(appUserId, request.taskchute_day_id, request.entry_id),
  ]);
  const settings = settingsResult.results[0] as SettingsRow | undefined;
  const day = dayResult.results[0] as DayRow | undefined;
  const target = targetResult.results[0] as (EntryRow & {
    execution_count: number; active_execution_count: number; task_entry_count: number;
  }) | undefined;
  if (!settings || !day || !target) {
    return reject(db, appUserId, request, requestFingerprint, "resource_not_found", "Entry or established Day is unavailable");
  }
  const currentDate = resolveTaskChuteDay(now, {
    timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes,
  }).logicalDate;
  if (day.logical_date > currentDate) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Future-Day Entries cannot be hard deleted");
  }
  if (day.placement_revision !== request.expected_placement_revision) {
    return persistRejection<DeleteInterruptionEntryResult>(db, {
      appUserId, operationId: request.operation_id, commandType: "DeleteInterruptionEntry", requestFingerprint,
      outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
    });
  }
  if (target.routine_occurrence_id !== null || target.continuation_chain_id === null) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "This Entry is outside the approved interruption-delete scope");
  }
  const chainId = target.continuation_chain_id;
  const [entryResult, executionResult, pairResult, lineageResult, futureLink] = await Promise.all([
    db.prepare(`SELECT e.id, e.task_id, e.taskchute_day_id, e.lifecycle_state, e.routine_occurrence_id,
        e.section_id, e.position, e.planned_start_minute, e.estimate_seconds, e.continuation_chain_id,
        e.continuation_parent_entry_id, t.quick_interrupt_origin
      FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      WHERE e.app_user_id = ? AND e.continuation_chain_id = ? ORDER BY e.id`).bind(appUserId, chainId).all<EntryRow>(),
    db.prepare(`SELECT x.id, x.entry_id, x.started_at, x.ended_at, x.terminal_outcome
      FROM executions x JOIN entries e ON e.app_user_id = x.app_user_id AND e.id = x.entry_id
      WHERE x.app_user_id = ? AND e.continuation_chain_id = ? ORDER BY x.id`).bind(appUserId, chainId).all<ExecutionRow>(),
    db.prepare(`SELECT q.target_entry_id, q.continuation_entry_id, q.created_at FROM quick_interrupt_entry_pairs q
      WHERE q.app_user_id = ? AND (q.target_entry_id IN
        (SELECT id FROM entries WHERE app_user_id = ? AND continuation_chain_id = ?)
        OR q.continuation_entry_id IN
        (SELECT id FROM entries WHERE app_user_id = ? AND continuation_chain_id = ?))
      ORDER BY q.target_entry_id, q.continuation_entry_id`)
      .bind(appUserId, appUserId, chainId, appUserId, chainId).all<PairRow>(),
    db.prepare(`SELECT deleted_entry_id, continuation_chain_id, continuation_parent_entry_id, root_estimate_seconds
      FROM continuation_lineage_tombstones WHERE app_user_id = ? AND continuation_chain_id = ? ORDER BY deleted_entry_id`)
      .bind(appUserId, chainId).all<TombstoneRow>(),
    db.prepare("SELECT 1 AS linked FROM completed_entry_future_routines WHERE app_user_id = ? AND source_entry_id = ?")
      .bind(appUserId, request.entry_id).first(),
  ]);
  if (futureLink) return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "This Entry is linked to a future Routine");

  const entries = rows<EntryRow>(entryResult.results);
  const executions = rows<ExecutionRow>(executionResult.results);
  const pairs = rows<PairRow>(pairResult.results);
  const lineage = rows<TombstoneRow>(lineageResult.results);
  const analysis = analyzeContinuationLineage(chainId, entries, lineage);
  if (!analysis.valid || !entries.some((item) => item.id === target.id)) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The interruption chain has missing or inconsistent ancestry");
  }
  if (entries.some((item) => item.routine_occurrence_id !== null || !validLifecycle(item, executions))) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The chain contains protected or inconsistent lifecycle facts");
  }
  const ownExecutions = executions.filter((item) => item.entry_id === target.id);
  const interruptedSource = target.lifecycle_state === "completed" && latestOutcome(executions, target.id) === "interrupted";
  const continuation = target.continuation_parent_entry_id !== null;
  const quickTarget = target.quick_interrupt_origin === "quick_interrupt"
    && target.lifecycle_state !== "planned" && target.task_entry_count === 1;
  if (!interruptedSource && !continuation && !quickTarget) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Only an interruption source, continuation, or Quick target can be deleted here");
  }
  if (target.active_execution_count > 1 || target.execution_count !== ownExecutions.length) {
    return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The Entry has ambiguous Execution facts");
  }

  const retainsLineage = analysis.liveDescendantIds.has(target.id);
  const snapshot: Snapshot = { entries, executions, pairs, lineage };
  const snapshotJson = JSON.stringify(snapshot);
  const survivors = entries.filter((item) => item.id !== target.id);
  const candidateLineage = [...lineage];
  if (retainsLineage) candidateLineage.push({
    deleted_entry_id: target.id,
    continuation_chain_id: chainId,
    continuation_parent_entry_id: target.continuation_parent_entry_id,
    root_estimate_seconds: target.id === chainId ? target.estimate_seconds : null,
  });
  let expectedLineage: TombstoneRow[] = [];
  if (survivors.length > 0) {
    const after = analyzeContinuationLineage(chainId, survivors, candidateLineage);
    expectedLineage = candidateLineage.filter((item) => after.requiredTombstoneIds.has(item.deleted_entry_id));
    if (!analyzeContinuationLineage(chainId, survivors, expectedLineage).valid) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "The deletion cannot preserve valid surviving lineage");
    }
  }
  const expectedPairs = pairs.filter((item) => item.target_entry_id !== target.id && item.continuation_entry_id !== target.id);
  const expectedLineageJson = JSON.stringify(expectedLineage);
  const expectedPairsJson = JSON.stringify(expectedPairs);
  const deletedExecutionIds = ownExecutions.map((item) => item.id).sort();
  const result: DeleteInterruptionEntryResult = {
    entry_id: target.id, deleted_execution_ids: deletedExecutionIds,
    taskchute_day_id: request.taskchute_day_id, placement_revision: request.expected_placement_revision + 1,
  };
  const assertionId = `delete-interruption:${request.operation_id}`;

  try {
    const statements = await db.batch([
      db.prepare(`INSERT INTO placement_command_guards (operation_id, app_user_id, taskchute_day_id, expected_revision)
        SELECT ?, app_user_id, id, ? FROM taskchute_days
         WHERE app_user_id = ? AND id = ? AND logical_date = ? AND logical_date <= ? AND placement_revision = ?`)
        .bind(request.operation_id, request.expected_placement_revision, appUserId, request.taskchute_day_id,
          day.logical_date, currentDate, request.expected_placement_revision),
      db.prepare(`INSERT INTO interruption_delete_command_guards
        (app_user_id, operation_id, taskchute_day_id, entry_id, continuation_chain_id,
         continuation_parent_entry_id, expected_placement_revision, retains_lineage, snapshot_json)
        SELECT ?, ?, ?, e.id, e.continuation_chain_id, e.continuation_parent_entry_id, ?, ?, ?
          FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
          JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
         WHERE EXISTS (SELECT 1 FROM placement_command_guards g
           WHERE g.app_user_id = e.app_user_id AND g.operation_id = ? AND g.expected_revision = ?)
           AND e.app_user_id = ? AND e.taskchute_day_id = ? AND e.id = ?
           AND e.continuation_chain_id = ? AND e.continuation_parent_entry_id IS ?
           AND e.lifecycle_state = ? AND e.estimate_seconds IS ? AND e.position = ?
           AND t.quick_interrupt_origin IS ? AND e.routine_occurrence_id IS NULL
           AND d.logical_date = ? AND d.logical_date <= ? AND d.placement_revision = ?
           AND (e.continuation_parent_entry_id IS NOT NULL
             OR (e.lifecycle_state = 'completed' AND (SELECT x.terminal_outcome FROM executions x
               WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id
               ORDER BY CASE WHEN x.ended_at IS NOT NULL THEN x.ended_at ELSE x.started_at END DESC, x.id DESC LIMIT 1) = 'interrupted')
             OR (t.quick_interrupt_origin = 'quick_interrupt' AND e.lifecycle_state IN ('running', 'completed')
               AND (SELECT COUNT(*) FROM entries same_task WHERE same_task.app_user_id = e.app_user_id AND same_task.task_id = e.task_id) = 1))
           AND ((e.lifecycle_state = 'planned' AND NOT EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id))
             OR (e.lifecycle_state = 'running' AND (SELECT COUNT(*) FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id AND x.ended_at IS NULL) = 1)
             OR (e.lifecycle_state = 'completed' AND EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id)
               AND NOT EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id AND x.ended_at IS NULL)))
           AND NOT EXISTS (SELECT 1 FROM completed_entry_future_routines c WHERE c.app_user_id = e.app_user_id AND c.source_entry_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM continuation_lineage_tombstones old WHERE old.app_user_id = e.app_user_id AND old.deleted_entry_id = e.id)`)
        .bind(appUserId, request.operation_id, request.taskchute_day_id, request.expected_placement_revision,
          retainsLineage ? 1 : 0, snapshotJson, request.operation_id, request.expected_placement_revision,
          appUserId, request.taskchute_day_id, request.entry_id, chainId, target.continuation_parent_entry_id,
          target.lifecycle_state, target.estimate_seconds, target.position, target.quick_interrupt_origin,
          day.logical_date, currentDate, request.expected_placement_revision),
      db.prepare(`INSERT INTO continuation_lineage_tombstones
        (app_user_id, deleted_entry_id, continuation_chain_id, continuation_parent_entry_id, root_estimate_seconds)
        SELECT e.app_user_id, e.id, e.continuation_chain_id, e.continuation_parent_entry_id,
          CASE WHEN e.id = e.continuation_chain_id THEN e.estimate_seconds ELSE NULL END
          FROM entries e JOIN interruption_delete_command_guards g ON g.app_user_id = e.app_user_id
            AND g.entry_id = e.id AND g.retains_lineage = 1
         WHERE e.app_user_id = ? AND g.operation_id = ?`)
        .bind(appUserId, request.operation_id),
      db.prepare(`DELETE FROM executions WHERE app_user_id = ? AND entry_id = ?
        AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, target.id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM lifecycle_command_guards WHERE app_user_id = ? AND entry_id = ?
        AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, target.id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_mode_snapshots WHERE app_user_id = ? AND entry_id = ?
        AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, target.id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_modes WHERE app_user_id = ? AND entry_id = ?
        AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, target.id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?
        AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, target.id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_task_snapshots WHERE app_user_id = ? AND entry_id = ?
        AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, target.id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, target.id, appUserId, request.operation_id),
      db.prepare(`WITH RECURSIVE ancestors(node_id, parent_id) AS (
          SELECT e.id, e.continuation_parent_entry_id FROM entries e
           WHERE e.app_user_id = ? AND e.continuation_chain_id = ?
          UNION
          SELECT node.node_id, node.parent_id FROM ancestors child JOIN (
            SELECT e.id AS node_id, e.continuation_parent_entry_id AS parent_id FROM entries e
             WHERE e.app_user_id = ? AND e.continuation_chain_id = ?
            UNION ALL
            SELECT l.deleted_entry_id, l.continuation_parent_entry_id FROM continuation_lineage_tombstones l
             WHERE l.app_user_id = ? AND l.continuation_chain_id = ?
          ) node ON node.node_id = child.parent_id WHERE child.parent_id IS NOT NULL
        )
        DELETE FROM continuation_lineage_tombstones WHERE app_user_id = ? AND continuation_chain_id = ?
          AND deleted_entry_id NOT IN (SELECT node_id FROM ancestors)
          AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, chainId, appUserId, chainId, appUserId, chainId,
          appUserId, chainId, appUserId, request.operation_id),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id = ? AND logical_date = ? AND placement_revision = ?
          AND EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.taskchute_day_id, day.logical_date, request.expected_placement_revision,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          NOT EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND id = ?)
          AND NOT EXISTS (SELECT 1 FROM executions WHERE app_user_id = ? AND entry_id = ?)
          AND NOT EXISTS (SELECT 1 FROM lifecycle_command_guards WHERE app_user_id = ? AND entry_id = ?)
          AND NOT EXISTS (SELECT 1 FROM entry_mode_snapshots WHERE app_user_id = ? AND entry_id = ?)
          AND NOT EXISTS (SELECT 1 FROM entry_modes WHERE app_user_id = ? AND entry_id = ?)
          AND NOT EXISTS (SELECT 1 FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?)
          AND NOT EXISTS (SELECT 1 FROM entry_task_snapshots WHERE app_user_id = ? AND entry_id = ?)
          AND NOT EXISTS (SELECT 1 FROM quick_interrupt_entry_pairs WHERE app_user_id = ? AND (target_entry_id = ? OR continuation_entry_id = ?))
          AND EXISTS (SELECT 1 FROM taskchute_days WHERE app_user_id = ? AND id = ? AND placement_revision = ?)
          AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ? AND continuation_chain_id = ?) = ?
          AND (SELECT COUNT(*) FROM continuation_lineage_tombstones WHERE app_user_id = ? AND continuation_chain_id = ?) = ?
          AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (
            SELECT 1 FROM continuation_lineage_tombstones l WHERE l.app_user_id = ?
              AND l.deleted_entry_id IS json_extract(j.value, '$.deleted_entry_id')
              AND l.continuation_chain_id IS json_extract(j.value, '$.continuation_chain_id')
              AND l.continuation_parent_entry_id IS json_extract(j.value, '$.continuation_parent_entry_id')
              AND l.root_estimate_seconds IS json_extract(j.value, '$.root_estimate_seconds')))
          AND (SELECT COUNT(*) FROM quick_interrupt_entry_pairs q WHERE q.app_user_id = ? AND (
            q.target_entry_id IN (SELECT id FROM entries WHERE app_user_id = ? AND continuation_chain_id = ?)
            OR q.continuation_entry_id IN (SELECT id FROM entries WHERE app_user_id = ? AND continuation_chain_id = ?))) = ?
          AND NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (
            SELECT 1 FROM quick_interrupt_entry_pairs q WHERE q.app_user_id = ?
              AND q.target_entry_id IS json_extract(j.value, '$.target_entry_id')
              AND q.continuation_entry_id IS json_extract(j.value, '$.continuation_entry_id')
              AND q.created_at IS json_extract(j.value, '$.created_at')))
          AND NOT EXISTS (SELECT 1 FROM entries child WHERE child.app_user_id = ? AND child.continuation_chain_id = ?
            AND child.continuation_parent_entry_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM entries parent WHERE parent.app_user_id = child.app_user_id
              AND parent.id = child.continuation_parent_entry_id AND parent.continuation_chain_id = child.continuation_chain_id)
            AND NOT EXISTS (SELECT 1 FROM continuation_lineage_tombstones parent WHERE parent.app_user_id = child.app_user_id
              AND parent.deleted_entry_id = child.continuation_parent_entry_id AND parent.continuation_chain_id = child.continuation_chain_id))
          AND (NOT EXISTS (SELECT 1 FROM entries WHERE app_user_id = ? AND continuation_chain_id = ?)
            OR EXISTS (SELECT 1 FROM entries root WHERE root.app_user_id = ? AND root.id = ?
              AND root.continuation_chain_id = root.id AND root.continuation_parent_entry_id IS NULL)
            OR EXISTS (SELECT 1 FROM continuation_lineage_tombstones root WHERE root.app_user_id = ?
              AND root.deleted_entry_id = ? AND root.continuation_chain_id = ? AND root.continuation_parent_entry_id IS NULL))
          THEN 1 ELSE 0 END
        WHERE EXISTS (SELECT 1 FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, assertionId,
          appUserId, target.id, appUserId, target.id, appUserId, target.id, appUserId, target.id,
          appUserId, target.id, appUserId, target.id, appUserId, target.id, appUserId, target.id, target.id,
          appUserId, request.taskchute_day_id, result.placement_revision,
          appUserId, chainId, survivors.length, appUserId, chainId, expectedLineage.length,
          expectedLineageJson, appUserId,
          appUserId, appUserId, chainId, appUserId, chainId, expectedPairs.length,
          expectedPairsJson, appUserId,
          appUserId, chainId,
          appUserId, chainId,
          appUserId, chainId,
          appUserId, chainId, chainId,
          appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
        request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'DeleteInterruptionEntry', ?, ?, 'success', ?, ?
         WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), now, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
      db.prepare("DELETE FROM interruption_delete_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
      db.prepare("DELETE FROM placement_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    const placementGuard = statements[0]!;
    const deleteGuard = statements[1]!;
    const assertion = statements[12]!;
    const operationPersist = statements[13]!;
    if (placementGuard.meta.changes === 0 || deleteGuard.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<DeleteInterruptionEntryResult>(committed, "DeleteInterruptionEntry", requestFingerprint);
      const latest = await db.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, request.taskchute_day_id).first<{ placement_revision: number }>();
      if (latest?.placement_revision !== request.expected_placement_revision) {
        return persistRejection<DeleteInterruptionEntryResult>(db, {
          appUserId, operationId: request.operation_id, commandType: "DeleteInterruptionEntry", requestFingerprint,
          outcomeKind: "revision_conflict", result: { code: "revision_conflict", message: "The placement revision is stale" },
        });
      }
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Entry, chain, or Quick pairing changed before deletion could commit");
    }
    if (assertion.meta.changes === 0 || operationPersist.meta.changes === 0) {
      throw new HttpError(503, "infrastructure_ambiguous", "The interruption Entry deletion did not converge", true);
    }
    return result;
  } catch (error) {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<DeleteInterruptionEntryResult>(committed, "DeleteInterruptionEntry", requestFingerprint);
    if (String(error).includes("interruption_delete_snapshot_changed")) {
      return reject(db, appUserId, request, requestFingerprint, "resource_conflict", "Entry, chain, or Quick pairing changed before deletion could commit");
    }
    throw new HttpError(503, "infrastructure_ambiguous", "The interruption Entry deletion outcome is unknown; reload canonical state and retry", true);
  }
}
