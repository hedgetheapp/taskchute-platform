import type {
  DeleteProjectRequest,
  DeleteProjectResult,
  ProjectBoardProjection,
  ProjectBoardItemProjection,
  ReorderProjectsRequest,
  ReorderProjectsResult,
  SetProjectArchivedRequest,
  SetProjectArchivedResult,
  UpdateProjectRequest,
  UpdateProjectResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation, type CommandType } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
}

export function isUpdateProjectRequest(value: unknown): value is UpdateProjectRequest {
  return isRecord(value) && !("user_id" in value) && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.project_id === "string" && isUuidV7(value.project_id) && isRevision(value.expected_settings_revision)
    && typeof value.expected_title === "string" && isTitle(value.title);
}

export function isSetProjectArchivedRequest(value: unknown): value is SetProjectArchivedRequest {
  return isRecord(value) && !("user_id" in value) && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.project_id === "string" && isUuidV7(value.project_id) && typeof value.archived === "boolean"
    && isRevision(value.expected_settings_revision);
}

export function isReorderProjectsRequest(value: unknown): value is ReorderProjectsRequest {
  return isRecord(value) && !("user_id" in value) && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && Array.isArray(value.project_ids) && value.project_ids.length > 0
    && value.project_ids.every((id) => typeof id === "string" && isUuidV7(id))
    && new Set(value.project_ids).size === value.project_ids.length
    && isRevision(value.expected_board_revision);
}

export function isDeleteProjectRequest(value: unknown): value is DeleteProjectRequest {
  return isRecord(value) && !("user_id" in value) && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.project_id === "string" && isUuidV7(value.project_id) && isRevision(value.expected_settings_revision)
    && isRevision(value.expected_board_revision);
}

interface ProjectRow {
  id: string;
  title: string;
  board_position: number;
  settings_revision: number;
  archived: number;
}

async function readProject(db: D1Database, appUserId: string, projectId: string): Promise<ProjectRow | null> {
  return db.prepare(`SELECT p.id, p.title, i.board_position, i.settings_revision,
      CASE WHEN a.project_id IS NULL THEN 0 ELSE 1 END AS archived
    FROM projects p JOIN project_board_items i
      ON i.app_user_id = p.app_user_id AND i.project_id = p.id
    LEFT JOIN project_archives a
      ON a.app_user_id = p.app_user_id AND a.project_id = p.id
    WHERE p.app_user_id = ? AND p.id = ?`).bind(appUserId, projectId).first<ProjectRow>();
}

async function reject<T>(db: D1Database, appUserId: string, request: { operation_id: string },
  commandType: CommandType, requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id, commandType,
    requestFingerprint, outcomeKind: "domain_rejection", result: { code, message } });
}

async function revisionReject<T>(db: D1Database, appUserId: string, request: { operation_id: string },
  commandType: CommandType, requestFingerprint: string, message: string): Promise<T> {
  return persistRejection<T>(db, { appUserId, operationId: request.operation_id, commandType,
    requestFingerprint, outcomeKind: "revision_conflict", result: { code: "revision_conflict", message } });
}

async function persistNoop<T>(db: D1Database, appUserId: string, operationId: string, commandType: CommandType,
  requestFingerprint: string, result: T, now = new Date().toISOString()): Promise<T> {
  await db.prepare(`INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
     outcome_kind, result_json, created_at) VALUES (?, ?, ?, ?, ?, 'success', ?, ?)`)
    .bind(appUserId, operationId, commandType, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
      JSON.stringify(result), now).run();
  return result;
}

export async function loadProjectBoard(db: D1Database, appUserId: string): Promise<ProjectBoardProjection> {
  const [head, rows] = await db.batch([
    db.prepare("SELECT board_revision FROM project_board_heads WHERE app_user_id = ?").bind(appUserId),
    db.prepare(`SELECT p.id, p.title, i.board_position, i.settings_revision,
        CASE WHEN a.project_id IS NULL THEN 0 ELSE 1 END AS archived
      FROM projects p JOIN project_board_items i
        ON i.app_user_id = p.app_user_id AND i.project_id = p.id
      LEFT JOIN project_archives a
        ON a.app_user_id = p.app_user_id AND a.project_id = p.id
      WHERE p.app_user_id = ? ORDER BY i.board_position, p.id`).bind(appUserId),
  ]);
  return {
    board_revision: (head.results[0] as { board_revision?: number } | undefined)?.board_revision ?? 0,
    projects: rows.results.map((row) => {
      const item = row as ProjectRow;
      return { id: item.id, title: item.title, archived: item.archived === 1,
        board_position: item.board_position, settings_revision: item.settings_revision } satisfies ProjectBoardItemProjection;
    }),
  };
}

export async function updateProject(db: D1Database, appUserId: string, input: UpdateProjectRequest,
  nowInstant = new Date().toISOString()): Promise<UpdateProjectResult> {
  const request = { ...input, expected_title: input.expected_title.trim(), title: input.title.trim() };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<UpdateProjectResult>(prior, "UpdateProject", requestFingerprint);
  const row = await readProject(db, appUserId, request.project_id);
  if (!row) return reject(db, appUserId, request, "UpdateProject", requestFingerprint, "resource_not_found", "Project is unavailable");
  if (row.settings_revision !== request.expected_settings_revision) {
    return revisionReject(db, appUserId, request, "UpdateProject", requestFingerprint, "The Project settings revision is stale");
  }
  if (row.title !== request.expected_title) {
    return reject(db, appUserId, request, "UpdateProject", requestFingerprint, "resource_conflict", "The Project title changed before editing");
  }
  const result: UpdateProjectResult = { project: { id: row.id, title: request.title }, settings_revision: row.settings_revision + (row.title === request.title ? 0 : 1) };
  if (row.title === request.title) return persistNoop(db, appUserId, request.operation_id, "UpdateProject", requestFingerprint, result, nowInstant);
  try {
    const [guard, update, revision, operation] = await db.batch([
      db.prepare(`INSERT INTO project_command_guards (app_user_id, operation_id, project_id, command_type)
        SELECT ?, ?, ?, 'UpdateProject'
        WHERE EXISTS (SELECT 1 FROM projects WHERE app_user_id = ? AND id = ? AND title = ?)
          AND EXISTS (SELECT 1 FROM project_board_items WHERE app_user_id = ? AND project_id = ? AND settings_revision = ?)`)
        .bind(appUserId, request.operation_id, request.project_id, appUserId, request.project_id, request.expected_title,
          appUserId, request.project_id, request.expected_settings_revision),
      db.prepare(`UPDATE projects SET title = ? WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(request.title, appUserId, request.project_id, appUserId, request.operation_id),
      db.prepare(`UPDATE project_board_items SET settings_revision = settings_revision + 1
        WHERE app_user_id = ? AND project_id = ? AND settings_revision = ?
          AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.project_id, request.expected_settings_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at) SELECT ?, ?, 'UpdateProject', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
          appUserId, request.operation_id),
      db.prepare("DELETE FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0 || update.meta.changes === 0 || revision.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateProjectResult>(committed, "UpdateProject", requestFingerprint);
      return revisionReject(db, appUserId, request, "UpdateProject", requestFingerprint, "The Project changed before editing");
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<UpdateProjectResult>(committed, "UpdateProject", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}

export async function setProjectArchived(db: D1Database, appUserId: string, request: SetProjectArchivedRequest,
  nowInstant = new Date().toISOString()): Promise<SetProjectArchivedResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<SetProjectArchivedResult>(prior, "SetProjectArchived", requestFingerprint);
  const row = await readProject(db, appUserId, request.project_id);
  if (!row) return reject(db, appUserId, request, "SetProjectArchived", requestFingerprint, "resource_not_found", "Project is unavailable");
  if (row.settings_revision !== request.expected_settings_revision) {
    return revisionReject(db, appUserId, request, "SetProjectArchived", requestFingerprint, "The Project settings revision is stale");
  }
  if ((row.archived === 1) === request.archived) {
    return persistNoop(db, appUserId, request.operation_id, "SetProjectArchived", requestFingerprint,
      { project_id: request.project_id, archived: request.archived, settings_revision: row.settings_revision }, nowInstant);
  }
  const result: SetProjectArchivedResult = { project_id: request.project_id, archived: request.archived,
    settings_revision: row.settings_revision + 1 };
  try {
    const [guard, archive, remove, revision, operation] = await db.batch([
      db.prepare(`INSERT INTO project_command_guards (app_user_id, operation_id, project_id, command_type)
        SELECT ?, ?, ?, 'SetProjectArchived' WHERE EXISTS (
          SELECT 1 FROM project_board_items WHERE app_user_id = ? AND project_id = ? AND settings_revision = ?)`)
        .bind(appUserId, request.operation_id, request.project_id, appUserId, request.project_id, request.expected_settings_revision),
      request.archived
        ? db.prepare(`INSERT INTO project_archives (app_user_id, project_id, archived_at)
            SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, request.project_id, nowInstant, appUserId, request.operation_id)
        : db.prepare("SELECT 1 AS noop"),
      request.archived
        ? db.prepare("SELECT 1 AS noop")
        : db.prepare(`DELETE FROM project_archives WHERE app_user_id = ? AND project_id = ?
            AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
          .bind(appUserId, request.project_id, appUserId, request.operation_id),
      db.prepare(`UPDATE project_board_items SET settings_revision = settings_revision + 1
        WHERE app_user_id = ? AND project_id = ? AND settings_revision = ?
          AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.project_id, request.expected_settings_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at) SELECT ?, ?, 'SetProjectArchived', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
          appUserId, request.operation_id),
      db.prepare("DELETE FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?")
        .bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0 || revision.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<SetProjectArchivedResult>(committed, "SetProjectArchived", requestFingerprint);
      return revisionReject(db, appUserId, request, "SetProjectArchived", requestFingerprint, "The Project changed before archiving");
    }
    void archive; void remove;
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<SetProjectArchivedResult>(committed, "SetProjectArchived", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}

export async function reorderProjects(db: D1Database, appUserId: string, request: ReorderProjectsRequest,
  nowInstant = new Date().toISOString()): Promise<ReorderProjectsResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<ReorderProjectsResult>(prior, "ReorderProjects", requestFingerprint);
  const [head, rows] = await db.batch([
    db.prepare("SELECT board_revision FROM project_board_heads WHERE app_user_id = ?").bind(appUserId),
    db.prepare("SELECT project_id FROM project_board_items WHERE app_user_id = ? ORDER BY board_position, project_id").bind(appUserId),
  ]);
  const boardRevision = (head.results[0] as { board_revision?: number } | undefined)?.board_revision;
  const existing = rows.results.map((row) => (row as { project_id: string }).project_id);
  if (boardRevision === undefined || existing.length !== request.project_ids.length
    || existing.some((id) => !request.project_ids.includes(id))) {
    return reject(db, appUserId, request, "ReorderProjects", requestFingerprint, "resource_conflict", "Project order does not match the owned Project set");
  }
  if (boardRevision !== request.expected_board_revision) {
    return revisionReject(db, appUserId, request, "ReorderProjects", requestFingerprint, "The Project board revision is stale");
  }
  const result: ReorderProjectsResult = { project_ids: request.project_ids, board_revision: boardRevision + 1 };
  if (existing.every((id, index) => id === request.project_ids[index])) {
    return persistNoop(db, appUserId, request.operation_id, "ReorderProjects", requestFingerprint,
      { project_ids: request.project_ids, board_revision: boardRevision }, nowInstant);
  }
  const idsJson = JSON.stringify(request.project_ids);
  try {
    const [guard, shift, setPositions, bump, operation] = await db.batch([
      db.prepare(`INSERT INTO project_command_guards (app_user_id, operation_id, project_id, command_type)
        SELECT ?, ?, ?, 'ReorderProjects' FROM project_board_heads
        WHERE app_user_id = ? AND board_revision = ?`).bind(appUserId, request.operation_id, request.project_ids[0], appUserId, request.expected_board_revision),
      db.prepare(`UPDATE project_board_items SET board_position = board_position + 1000000
        WHERE app_user_id = ? AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, appUserId, request.operation_id),
      db.prepare(`UPDATE project_board_items SET board_position = 1 + CAST((SELECT key FROM json_each(?)
          WHERE json_each.value = project_board_items.project_id) AS INTEGER)
        WHERE app_user_id = ? AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(idsJson, appUserId, appUserId, request.operation_id),
      db.prepare(`UPDATE project_board_heads SET board_revision = board_revision + 1
        WHERE app_user_id = ? AND board_revision = ?
          AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.expected_board_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at) SELECT ?, ?, 'ReorderProjects', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
          appUserId, request.operation_id),
      db.prepare("DELETE FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0 || bump.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<ReorderProjectsResult>(committed, "ReorderProjects", requestFingerprint);
      return revisionReject(db, appUserId, request, "ReorderProjects", requestFingerprint, "The Project board changed before reordering");
    }
    void shift; void setPositions;
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<ReorderProjectsResult>(committed, "ReorderProjects", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}

export async function deleteProject(db: D1Database, appUserId: string, request: DeleteProjectRequest,
  nowInstant = new Date().toISOString()): Promise<DeleteProjectResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<DeleteProjectResult>(prior, "DeleteProject", requestFingerprint);
  const row = await readProject(db, appUserId, request.project_id);
  if (!row) return reject(db, appUserId, request, "DeleteProject", requestFingerprint, "resource_not_found", "Project is unavailable");
  const head = await db.prepare("SELECT board_revision FROM project_board_heads WHERE app_user_id = ?").bind(appUserId).first<{ board_revision: number }>();
  if (row.settings_revision !== request.expected_settings_revision) {
    return revisionReject(db, appUserId, request, "DeleteProject", requestFingerprint, "The Project settings revision is stale");
  }
  if (!head || head.board_revision !== request.expected_board_revision) {
    return revisionReject(db, appUserId, request, "DeleteProject", requestFingerprint, "The Project board revision is stale");
  }
  const taskCount = await db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE app_user_id = ? AND project_id = ?")
    .bind(appUserId, request.project_id).first<number>("count") ?? 0;
  const result: DeleteProjectResult = { project_id: request.project_id, board_revision: request.expected_board_revision + 1,
    unassigned_task_count: taskCount };
  try {
    const [guard, shift, tasks, archive, item, project, compact, bump, operation] = await db.batch([
      db.prepare(`INSERT INTO project_command_guards (app_user_id, operation_id, project_id, command_type)
        SELECT ?, ?, ?, 'DeleteProject' FROM project_board_items i JOIN project_board_heads h
          ON h.app_user_id = i.app_user_id
        WHERE i.app_user_id = ? AND i.project_id = ? AND i.settings_revision = ? AND h.board_revision = ?`)
        .bind(appUserId, request.operation_id, request.project_id, appUserId, request.project_id,
          request.expected_settings_revision, request.expected_board_revision),
      db.prepare(`UPDATE project_board_items SET board_position = board_position + 1000000
        WHERE app_user_id = ? AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, appUserId, request.operation_id),
      db.prepare(`UPDATE tasks SET project_id = NULL WHERE app_user_id = ? AND project_id = ?
        AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.project_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM project_archives WHERE app_user_id = ? AND project_id = ?
        AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.project_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM project_board_items WHERE app_user_id = ? AND project_id = ?
        AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.project_id, appUserId, request.operation_id),
      db.prepare(`DELETE FROM projects WHERE app_user_id = ? AND id = ?
        AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.project_id, appUserId, request.operation_id),
      db.prepare(`UPDATE project_board_items SET board_position = (
          SELECT COUNT(*) FROM project_board_items later
           WHERE later.app_user_id = project_board_items.app_user_id
             AND later.board_position <= project_board_items.board_position)
        WHERE app_user_id = ? AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, appUserId, request.operation_id),
      db.prepare(`UPDATE project_board_heads SET board_revision = board_revision + 1
        WHERE app_user_id = ? AND board_revision = ?
          AND EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.expected_board_revision, appUserId, request.operation_id),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at) SELECT ?, ?, 'DeleteProject', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), nowInstant,
          appUserId, request.operation_id),
      db.prepare("DELETE FROM project_command_guards WHERE app_user_id = ? AND operation_id = ?").bind(appUserId, request.operation_id),
    ]);
    if (guard.meta.changes === 0 || project.meta.changes === 0 || bump.meta.changes === 0 || operation.meta.changes === 0) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<DeleteProjectResult>(committed, "DeleteProject", requestFingerprint);
      return revisionReject(db, appUserId, request, "DeleteProject", requestFingerprint, "The Project changed before deletion");
    }
    void shift; void tasks; void archive; void item; void compact;
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<DeleteProjectResult>(committed, "DeleteProject", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
