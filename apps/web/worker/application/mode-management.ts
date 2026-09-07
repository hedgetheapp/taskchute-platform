import type {
  CreateModeRequest, CreateModeResult, ModeBoardProjection, ModeBoardItemProjection,
  ReorderModesRequest, ReorderModesResult, SetEntryModeRequest, SetEntryModeResult,
  UpdateModeRequest, UpdateModeResult, SetModeArchivedRequest, SetModeArchivedResult,
  DeleteModeRequest, DeleteModeResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation, type CommandType } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";
import { resolveTaskChuteDay } from "../domain/taskchute-day";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRevision(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}
function isTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
}
function operationId(value: unknown): value is string { return typeof value === "string" && isUuidV7(value); }

export function isCreateModeRequest(value: unknown): value is CreateModeRequest {
  return isRecord(value) && !("user_id" in value) && operationId(value.operation_id)
    && typeof value.mode_id === "string" && isUuidV7(value.mode_id) && isTitle(value.title);
}
export function isUpdateModeRequest(value: unknown): value is UpdateModeRequest {
  return isRecord(value) && !("user_id" in value) && operationId(value.operation_id)
    && typeof value.mode_id === "string" && isUuidV7(value.mode_id)
    && isRevision(value.expected_settings_revision) && isTitle(value.expected_title) && isTitle(value.title);
}
export function isReorderModesRequest(value: unknown): value is ReorderModesRequest {
  return isRecord(value) && !("user_id" in value) && operationId(value.operation_id)
    && Array.isArray(value.mode_ids) && value.mode_ids.length > 0
    && value.mode_ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(value.mode_ids).size === value.mode_ids.length && isRevision(value.expected_board_revision);
}
export function isSetEntryModeRequest(value: unknown): value is SetEntryModeRequest {
  return isRecord(value) && !("user_id" in value) && operationId(value.operation_id)
    && typeof value.entry_id === "string" && isUuidV7(value.entry_id)
    && (value.expected_mode_id === null || (typeof value.expected_mode_id === "string" && isUuidV7(value.expected_mode_id)))
    && (value.mode_id === null || (typeof value.mode_id === "string" && isUuidV7(value.mode_id)));
}
export function isSetModeArchivedRequest(value: unknown): value is SetModeArchivedRequest {
  return isRecord(value) && !('user_id' in value) && operationId(value.operation_id)
    && typeof value.mode_id === 'string' && isUuidV7(value.mode_id)
    && typeof value.archived === 'boolean' && isRevision(value.expected_settings_revision);
}
export function isDeleteModeRequest(value: unknown): value is DeleteModeRequest {
  return isRecord(value) && !('user_id' in value) && operationId(value.operation_id)
    && typeof value.mode_id === 'string' && isUuidV7(value.mode_id)
    && isRevision(value.expected_settings_revision) && isRevision(value.expected_board_revision);
}

type ModeRow = { id: string; title: string; board_position: number; settings_revision: number; archived: number };

async function reject<T>(db: D1Database, appUserId: string, request: { operation_id: string }, commandType: CommandType,
  requestFingerprint: string, code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id, commandType, requestFingerprint,
    outcomeKind: "domain_rejection", result: { code, message } });
}
async function revisionReject<T>(db: D1Database, appUserId: string, request: { operation_id: string }, commandType: CommandType,
  requestFingerprint: string, message: string): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id, commandType, requestFingerprint,
    outcomeKind: "revision_conflict", result: { code: "revision_conflict", message } });
}
async function persistSuccess<T>(db: D1Database, appUserId: string, operationIdValue: string, commandType: CommandType,
  requestFingerprint: string, result: T, now: string): Promise<T> {
  await db.prepare(`INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, 'success', ?, ?)`)
    .bind(appUserId, operationIdValue, commandType, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now).run();
  return result;
}

export async function loadModeBoard(db: D1Database, appUserId: string): Promise<ModeBoardProjection> {
  const [head, rows] = await db.batch([
    db.prepare("SELECT board_revision FROM mode_board_heads WHERE app_user_id = ?").bind(appUserId),
    db.prepare(`SELECT m.id, m.title, i.board_position, i.settings_revision
        , CASE WHEN a.mode_id IS NULL THEN 0 ELSE 1 END AS archived
      FROM mode_definitions m JOIN mode_board_items i ON i.app_user_id = m.app_user_id AND i.mode_id = m.id
      LEFT JOIN mode_archives a ON a.app_user_id = m.app_user_id AND a.mode_id = m.id
      WHERE m.app_user_id = ? ORDER BY i.board_position, m.id`).bind(appUserId),
  ]);
  return {
    board_revision: (head.results[0] as { board_revision?: number } | undefined)?.board_revision ?? 0,
    modes: rows.results.map((row) => {
      const item = row as ModeRow;
      return { id: item.id, title: item.title, archived: item.archived === 1,
        board_position: item.board_position, settings_revision: item.settings_revision } satisfies ModeBoardItemProjection;
    }),
  };
}

export async function createMode(db: D1Database, appUserId: string, input: CreateModeRequest,
  now = new Date().toISOString()): Promise<CreateModeResult> {
  const request = { ...input, title: input.title.trim() };
  const fp = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<CreateModeResult>(prior, "CreateMode", fp);
  const [head, collision] = await db.batch([
    db.prepare("SELECT board_revision FROM mode_board_heads WHERE app_user_id = ?").bind(appUserId),
    db.prepare("SELECT id FROM mode_definitions WHERE app_user_id = ? AND id = ?").bind(appUserId, request.mode_id),
  ]);
  const revision = (head.results[0] as { board_revision?: number } | undefined)?.board_revision;
  if (revision === undefined) return reject(db, appUserId, request, "CreateMode", fp, "resource_not_found", "Mode board is unavailable");
  if (collision.results.length > 0) return reject(db, appUserId, request, "CreateMode", fp, "resource_conflict", "Mode identity is already in use");
  const result: CreateModeResult = { mode: { id: request.mode_id, title: request.title }, board_revision: revision + 1 };
  try {
    const [mode, item, bump, operation] = await db.batch([
      db.prepare(`INSERT INTO mode_definitions (id, app_user_id, title, created_at)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM mode_board_heads WHERE app_user_id = ? AND board_revision = ?)`)
        .bind(request.mode_id, appUserId, request.title, now, appUserId, revision),
      db.prepare(`INSERT INTO mode_board_items (app_user_id, mode_id, board_position, settings_revision)
        SELECT ?, ?, COALESCE((SELECT MAX(board_position) + 1 FROM mode_board_items WHERE app_user_id = ?), 1), 0
        WHERE EXISTS (SELECT 1 FROM mode_definitions WHERE app_user_id = ? AND id = ?)`)
        .bind(appUserId, request.mode_id, appUserId, appUserId, request.mode_id),
      db.prepare(`UPDATE mode_board_heads SET board_revision = board_revision + 1
        WHERE app_user_id = ? AND board_revision = ? AND EXISTS (SELECT 1 FROM mode_board_items WHERE app_user_id = ? AND mode_id = ?)`)
        .bind(appUserId, revision, appUserId, request.mode_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'CreateMode', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM mode_board_heads WHERE app_user_id = ? AND board_revision = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, fp, JSON.stringify(result), now, appUserId, revision + 1),
    ]);
    if (mode.meta.changes === 0 || item.meta.changes === 0 || bump.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<CreateModeResult>(committed, "CreateMode", fp);
      throw new HttpError(503, "infrastructure_ambiguous", "Mode creation did not converge", true);
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<CreateModeResult>(committed, "CreateMode", fp);
    throw new HttpError(503, "infrastructure_ambiguous", "The Mode creation outcome is unknown; reload canonical state before retrying", true);
  }
}

export async function updateMode(db: D1Database, appUserId: string, input: UpdateModeRequest,
  now = new Date().toISOString()): Promise<UpdateModeResult> {
  const request = { ...input, expected_title: input.expected_title.trim(), title: input.title.trim() };
  const fp = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<UpdateModeResult>(prior, "UpdateMode", fp);
  const row = await db.prepare(`SELECT m.id, m.title, i.board_position, i.settings_revision
    FROM mode_definitions m JOIN mode_board_items i ON i.app_user_id = m.app_user_id AND i.mode_id = m.id
    WHERE m.app_user_id = ? AND m.id = ?`).bind(appUserId, request.mode_id).first<ModeRow>();
  if (!row) return reject(db, appUserId, request, "UpdateMode", fp, "resource_not_found", "Mode is unavailable");
  if (row.settings_revision !== request.expected_settings_revision) return revisionReject(db, appUserId, request, "UpdateMode", fp, "The Mode settings revision is stale");
  if (row.title !== request.expected_title) return reject(db, appUserId, request, "UpdateMode", fp, "resource_conflict", "The Mode title changed before editing");
  const nextRevision = row.title === request.title ? row.settings_revision : row.settings_revision + 1;
  const result: UpdateModeResult = { mode: { id: row.id, title: request.title }, settings_revision: nextRevision };
  if (row.title === request.title) return persistSuccess(db, appUserId, request.operation_id, "UpdateMode", fp, result, now);
  try {
    const [update, bump, operation] = await db.batch([
      db.prepare(`UPDATE mode_definitions SET title = ? WHERE app_user_id = ? AND id = ? AND title = ?
        AND EXISTS (SELECT 1 FROM mode_board_items WHERE app_user_id = ? AND mode_id = ? AND settings_revision = ?)`)
        .bind(request.title, appUserId, request.mode_id, request.expected_title, appUserId, request.mode_id, request.expected_settings_revision),
      db.prepare(`UPDATE mode_board_items SET settings_revision = settings_revision + 1
        WHERE app_user_id = ? AND mode_id = ? AND settings_revision = ?`).bind(appUserId, request.mode_id, request.expected_settings_revision),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'UpdateMode', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM mode_definitions WHERE app_user_id = ? AND id = ? AND title = ?)
          AND EXISTS (SELECT 1 FROM mode_board_items WHERE app_user_id = ? AND mode_id = ? AND settings_revision = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, fp, JSON.stringify(result), now,
          appUserId, request.mode_id, request.title, appUserId, request.mode_id, request.expected_settings_revision + 1),
    ]);
    if (update.meta.changes === 0 || bump.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateModeResult>(committed, "UpdateMode", fp);
      return revisionReject(db, appUserId, request, "UpdateMode", fp, "The Mode changed before editing");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<UpdateModeResult>(committed, "UpdateMode", fp);
    throw new HttpError(503, "infrastructure_ambiguous", "The Mode rename outcome is unknown; reload canonical state before retrying", true);
  }
}

export async function reorderModes(db: D1Database, appUserId: string, request: ReorderModesRequest,
  now = new Date().toISOString()): Promise<ReorderModesResult> {
  const fp = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<ReorderModesResult>(prior, "ReorderModes", fp);
  const [head, rows] = await db.batch([
    db.prepare("SELECT board_revision FROM mode_board_heads WHERE app_user_id = ?").bind(appUserId),
    db.prepare("SELECT mode_id FROM mode_board_items WHERE app_user_id = ? ORDER BY board_position, mode_id").bind(appUserId),
  ]);
  const revision = (head.results[0] as { board_revision?: number } | undefined)?.board_revision;
  const existing = rows.results.map((row) => (row as { mode_id: string }).mode_id);
  if (revision === undefined || existing.length !== request.mode_ids.length || existing.some((id) => !request.mode_ids.includes(id))) {
    return reject(db, appUserId, request, "ReorderModes", fp, "resource_conflict", "Mode order does not match the owned Mode set");
  }
  if (revision !== request.expected_board_revision) return revisionReject(db, appUserId, request, "ReorderModes", fp, "The Mode board revision is stale");
  if (existing.every((id, i) => id === request.mode_ids[i])) {
    return persistSuccess(db, appUserId, request.operation_id, "ReorderModes", fp,
      { mode_ids: request.mode_ids, board_revision: revision }, now);
  }
  const idsJson = JSON.stringify(request.mode_ids);
  const result: ReorderModesResult = { mode_ids: request.mode_ids, board_revision: revision + 1 };
  try {
    const [, , bump, operation] = await db.batch([
      db.prepare(`UPDATE mode_board_items SET board_position = board_position + 1000000 WHERE app_user_id = ?`).bind(appUserId),
      db.prepare(`UPDATE mode_board_items SET board_position = 1 + CAST((SELECT key FROM json_each(?) WHERE json_each.value = mode_board_items.mode_id) AS INTEGER)
        WHERE app_user_id = ?`).bind(idsJson, appUserId),
      db.prepare(`UPDATE mode_board_heads SET board_revision = board_revision + 1 WHERE app_user_id = ? AND board_revision = ?`).bind(appUserId, revision),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'ReorderModes', ?, ?, 'success', ?, ? WHERE EXISTS
          (SELECT 1 FROM mode_board_heads WHERE app_user_id = ? AND board_revision = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, fp, JSON.stringify(result), now, appUserId, revision + 1),
    ]);
    if (bump.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<ReorderModesResult>(committed, "ReorderModes", fp);
      return revisionReject(db, appUserId, request, "ReorderModes", fp, "The Mode board changed before reorder could commit");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<ReorderModesResult>(committed, "ReorderModes", fp);
    throw new HttpError(503, "infrastructure_ambiguous", "The Mode reorder outcome is unknown; reload canonical state before retrying", true);
  }
}

export async function setModeArchived(db: D1Database, appUserId: string, request: SetModeArchivedRequest,
  nowInstant = new Date().toISOString()): Promise<SetModeArchivedResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<SetModeArchivedResult>(prior, "SetModeArchived", requestFingerprint);
  const row = await db.prepare(`SELECT m.id, m.title, i.board_position, i.settings_revision,
      CASE WHEN a.mode_id IS NULL THEN 0 ELSE 1 END AS archived
    FROM mode_definitions m JOIN mode_board_items i ON i.app_user_id = m.app_user_id AND i.mode_id = m.id
    LEFT JOIN mode_archives a ON a.app_user_id = m.app_user_id AND a.mode_id = m.id
    WHERE m.app_user_id = ? AND m.id = ?`).bind(appUserId, request.mode_id).first<ModeRow>();
  if (!row) return reject(db, appUserId, request, "SetModeArchived", requestFingerprint, "resource_not_found", "Mode is unavailable");
  if (row.settings_revision !== request.expected_settings_revision) {
    return revisionReject(db, appUserId, request, "SetModeArchived", requestFingerprint, "The Mode settings revision is stale");
  }
  if ((row.archived === 1) === request.archived) {
    return persistSuccess(db, appUserId, request.operation_id, "SetModeArchived", requestFingerprint,
      { mode_id: request.mode_id, archived: request.archived, settings_revision: row.settings_revision }, nowInstant);
  }
  const result: SetModeArchivedResult = { mode_id: request.mode_id, archived: request.archived,
    settings_revision: row.settings_revision + 1 };
  try {
    const [guard, archive, remove, revision, operation, cleanup] = await db.batch([
      db.prepare(`INSERT INTO mode_command_guards (app_user_id, operation_id, mode_id, command_type)
        SELECT ?, ?, ?, 'SetModeArchived' WHERE EXISTS
          (SELECT 1 FROM mode_board_items WHERE app_user_id = ? AND mode_id = ? AND settings_revision = ?)`)
        .bind(appUserId, request.operation_id, request.mode_id, appUserId, request.mode_id, request.expected_settings_revision),
      request.archived
        ? db.prepare(`INSERT INTO mode_archives (app_user_id, mode_id, archived_at)
            SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, request.mode_id, nowInstant, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS noop"),
      request.archived
        ? db.prepare("SELECT 1 AS noop")
        : db.prepare(`DELETE FROM mode_archives WHERE app_user_id = ? AND mode_id = ?
            AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, request.mode_id, appUserId, request.operation_id),
      db.prepare(`UPDATE mode_board_items SET settings_revision = settings_revision + 1
        WHERE app_user_id = ? AND mode_id = ? AND settings_revision = ?
          AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.mode_id, request.expected_settings_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at) SELECT ?, ?, 'SetModeArchived', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
          appUserId, request.operation_id),
      db.prepare("DELETE FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0 || revision.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<SetModeArchivedResult>(committed, "SetModeArchived", requestFingerprint);
      return revisionReject(db, appUserId, request, "SetModeArchived", requestFingerprint, "The Mode changed before archive state could commit");
    }
    void archive; void remove; void cleanup;
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<SetModeArchivedResult>(committed, "SetModeArchived", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Mode archive outcome is unknown; reload canonical state and retry", true);
  }
}

export async function deleteMode(db: D1Database, appUserId: string, request: DeleteModeRequest,
  nowInstant = new Date().toISOString()): Promise<DeleteModeResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<DeleteModeResult>(prior, "DeleteMode", requestFingerprint);
  const row = await db.prepare(`SELECT m.id, m.title, i.board_position, i.settings_revision,
      CASE WHEN a.mode_id IS NULL THEN 0 ELSE 1 END AS archived
    FROM mode_definitions m JOIN mode_board_items i ON i.app_user_id = m.app_user_id AND i.mode_id = m.id
    LEFT JOIN mode_archives a ON a.app_user_id = m.app_user_id AND a.mode_id = m.id
    WHERE m.app_user_id = ? AND m.id = ?`).bind(appUserId, request.mode_id).first<ModeRow>();
  if (!row) return reject(db, appUserId, request, "DeleteMode", requestFingerprint, "resource_not_found", "Mode is unavailable");
  const head = await db.prepare("SELECT board_revision FROM mode_board_heads WHERE app_user_id = ?")
    .bind(appUserId).first<{ board_revision: number }>();
  if (row.settings_revision !== request.expected_settings_revision) {
    return revisionReject(db, appUserId, request, "DeleteMode", requestFingerprint, "The Mode settings revision is stale");
  }
  if (!head || head.board_revision !== request.expected_board_revision) {
    return revisionReject(db, appUserId, request, "DeleteMode", requestFingerprint, "The Mode board revision is stale");
  }
  const count = await db.prepare("SELECT COUNT(*) AS count FROM entry_modes WHERE app_user_id = ? AND mode_id = ?")
    .bind(appUserId, request.mode_id).first<number>("count") ?? 0;
  const result: DeleteModeResult = { mode_id: request.mode_id, board_revision: request.expected_board_revision + 1,
    cleared_entry_count: count };
  try {
    const [guard, shift, clear, archive, item, definition, compact, bump, operation, cleanup] = await db.batch([
      db.prepare(`INSERT INTO mode_command_guards (app_user_id, operation_id, mode_id, command_type)
        SELECT ?, ?, ?, 'DeleteMode' FROM mode_board_items i JOIN mode_board_heads h
          ON h.app_user_id = i.app_user_id
        WHERE i.app_user_id = ? AND i.mode_id = ? AND i.settings_revision = ? AND h.board_revision = ?`)
        .bind(appUserId, request.operation_id, request.mode_id, appUserId, request.mode_id,
          request.expected_settings_revision, request.expected_board_revision),
      db.prepare(`UPDATE mode_board_items SET board_position = board_position + 1000000
        WHERE app_user_id = ? AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, appUserId, request.operation_id),
      db.prepare(`DELETE FROM entry_modes WHERE app_user_id = ? AND mode_id = ?
        AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.mode_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM mode_archives WHERE app_user_id = ? AND mode_id = ?
        AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.mode_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM mode_board_items WHERE app_user_id = ? AND mode_id = ?
        AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.mode_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM mode_definitions WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.mode_id, appUserId, request.operation_id),
      db.prepare(`UPDATE mode_board_items SET board_position = (
          SELECT COUNT(*) FROM mode_board_items later
           WHERE later.app_user_id = mode_board_items.app_user_id
             AND later.board_position <= mode_board_items.board_position)
        WHERE app_user_id = ? AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, appUserId, request.operation_id),
      db.prepare(`UPDATE mode_board_heads SET board_revision = board_revision + 1
        WHERE app_user_id = ? AND board_revision = ?
          AND EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.expected_board_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at) SELECT ?, ?, 'DeleteMode', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
          appUserId, request.operation_id),
      db.prepare("DELETE FROM mode_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0 || definition.meta.changes === 0 || bump.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<DeleteModeResult>(committed, "DeleteMode", requestFingerprint);
      return revisionReject(db, appUserId, request, "DeleteMode", requestFingerprint, "The Mode changed before deletion");
    }
    void shift; void clear; void archive; void item; void compact; void cleanup;
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<DeleteModeResult>(committed, "DeleteMode", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The Mode delete outcome is unknown; reload canonical state and retry", true);
  }
}

export async function setEntryMode(db: D1Database, appUserId: string, input: SetEntryModeRequest,
  nowInstant = new Date().toISOString()): Promise<SetEntryModeResult> {
  const fp = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<SetEntryModeResult>(prior, "SetEntryMode", fp);
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  const entry = await db.prepare(`SELECT e.lifecycle_state, e.routine_occurrence_id, em.mode_id, d.id AS taskchute_day_id, d.logical_date
    FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
    WHERE e.app_user_id = ? AND e.id = ?`).bind(appUserId, input.entry_id).first<{
      lifecycle_state: string; routine_occurrence_id: string | null; mode_id: string | null; taskchute_day_id: string; logical_date: string;
    }>();
  if (!settings || !entry) return reject(db, appUserId, input, "SetEntryMode", fp, "resource_not_found", "Entry is unavailable");
  const currentDate = resolveTaskChuteDay(nowInstant, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  }).logicalDate;
  const isCurrent = entry.logical_date === currentDate;
  const isFuture = entry.logical_date > currentDate;
  if ((!isCurrent && !isFuture) || entry.lifecycle_state !== "planned" || entry.routine_occurrence_id !== null) {
    return reject(db, appUserId, input, "SetEntryMode", fp, "resource_conflict", "Only an ordinary planned Entry on the current or an established future Day can change Mode");
  }
  if (entry.mode_id !== input.expected_mode_id) return revisionReject(db, appUserId, input, "SetEntryMode", fp, "The Entry Mode changed before editing");
  let title: string | null = null;
  if (input.mode_id !== null) {
    const mode = await db.prepare(`SELECT m.title, CASE WHEN a.mode_id IS NULL THEN 0 ELSE 1 END AS archived
      FROM mode_definitions m LEFT JOIN mode_archives a ON a.app_user_id = m.app_user_id AND a.mode_id = m.id
      WHERE m.app_user_id = ? AND m.id = ?`).bind(appUserId, input.mode_id).first<{ title: string; archived: number }>();
    if (!mode) return reject(db, appUserId, input, "SetEntryMode", fp, "resource_not_found", "Mode is unavailable");
    if (mode.archived === 1 && input.mode_id !== entry.mode_id) {
      return reject(db, appUserId, input, "SetEntryMode", fp, "resource_conflict", "An archived Mode cannot be newly assigned");
    }
    title = mode.title;
  }
  const result: SetEntryModeResult = { entry_id: input.entry_id, mode_id: input.mode_id, mode_title: title };
  const targetGuard = `EXISTS (SELECT 1 FROM entries e JOIN taskchute_days d
    ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    WHERE e.app_user_id = ? AND e.id = ? AND e.taskchute_day_id = ?
      AND e.lifecycle_state = 'planned' AND e.routine_occurrence_id IS NULL
      AND d.id = ? AND d.logical_date = ?)`;
  if (input.mode_id === input.expected_mode_id) {
    try {
      const operation = await db.prepare(`INSERT INTO operations
          (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetEntryMode', ?, ?, 'success', ?, ? WHERE ${targetGuard}
          AND (SELECT mode_id FROM entry_modes WHERE app_user_id = ? AND entry_id = ?) IS ?`)
        .bind(appUserId, input.operation_id, REQUEST_FINGERPRINT_VERSION, fp, JSON.stringify(result), nowInstant,
          appUserId, input.entry_id, entry.taskchute_day_id, entry.taskchute_day_id, entry.logical_date,
          appUserId, input.entry_id, input.mode_id).run();
      if (operation.meta.changes > 0) return result;
      const committed = await readOperation(db, appUserId, input.operation_id);
      if (committed) return replayOperation<SetEntryModeResult>(committed, "SetEntryMode", fp);
      return revisionReject(db, appUserId, input, "SetEntryMode", fp, "The Entry changed before Mode assignment could commit");
    } catch {
      const committed = await readOperation(db, appUserId, input.operation_id);
      if (committed) return replayOperation<SetEntryModeResult>(committed, "SetEntryMode", fp);
      throw new HttpError(503, "infrastructure_ambiguous", "The Entry Mode outcome is unknown; reload canonical state before retrying", true);
    }
  }
  try {
    const [, relation, operation] = await db.batch([
      db.prepare(`DELETE FROM entry_modes WHERE app_user_id = ? AND entry_id = ? AND mode_id IS ? AND ${targetGuard}`)
        .bind(appUserId, input.entry_id, input.expected_mode_id,
          appUserId, input.entry_id, entry.taskchute_day_id, entry.taskchute_day_id, entry.logical_date),
      input.mode_id === null
        ? db.prepare("SELECT 1 AS noop")
        : db.prepare(`INSERT INTO entry_modes (app_user_id, entry_id, mode_id)
            SELECT ?, ?, ? WHERE ${targetGuard}
              AND NOT EXISTS (SELECT 1 FROM entry_modes WHERE app_user_id = ? AND entry_id = ?)`)
          .bind(appUserId, input.entry_id, input.mode_id,
            appUserId, input.entry_id, entry.taskchute_day_id, entry.taskchute_day_id, entry.logical_date,
            appUserId, input.entry_id),
      db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
        SELECT ?, ?, 'SetEntryMode', ?, ?, 'success', ?, ? WHERE ${targetGuard}
          AND (SELECT mode_id FROM entry_modes WHERE app_user_id = ? AND entry_id = ?) IS ?`)
        .bind(appUserId, input.operation_id, REQUEST_FINGERPRINT_VERSION, fp, JSON.stringify(result), nowInstant,
          appUserId, input.entry_id, entry.taskchute_day_id, entry.taskchute_day_id, entry.logical_date,
          appUserId, input.entry_id, input.mode_id),
    ]);
    if (relation.meta.changes === 0 && input.mode_id !== null) {
      const committed = await readOperation(db, appUserId, input.operation_id);
      if (committed) return replayOperation<SetEntryModeResult>(committed, "SetEntryMode", fp);
      return revisionReject(db, appUserId, input, "SetEntryMode", fp, "The Entry Mode changed before editing");
    }
    if (operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, input.operation_id);
      if (committed) return replayOperation<SetEntryModeResult>(committed, "SetEntryMode", fp);
      return revisionReject(db, appUserId, input, "SetEntryMode", fp, "The Entry changed before Mode assignment could commit");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<SetEntryModeResult>(committed, "SetEntryMode", fp);
    throw new HttpError(503, "infrastructure_ambiguous", "The Entry Mode outcome is unknown; reload canonical state before retrying", true);
  }
}
