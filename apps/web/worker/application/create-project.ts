import type { CreateProjectRequest, CreateProjectResult } from "../../src/shared/contracts";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";

export function isCreateProjectRequest(value: unknown): value is CreateProjectRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    !("user_id" in body) &&
    typeof body.operation_id === "string" &&
    isUuidV7(body.operation_id) &&
    typeof body.project_id === "string" &&
    isUuidV7(body.project_id) &&
    typeof body.title === "string" &&
    body.title.trim().length > 0 &&
    body.title.length <= 200
  );
}

export async function createProject(
  db: D1Database,
  appUserId: string,
  request: CreateProjectRequest,
): Promise<CreateProjectResult> {
  const semantic = { project_id: request.project_id, title: request.title.trim() };
  const requestFingerprint = await fingerprint(semantic);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<CreateProjectResult>(prior, "CreateProject", requestFingerprint);

  const collision = await db.prepare("SELECT app_user_id FROM projects WHERE id = ?").bind(request.project_id).first<{
    app_user_id: string;
  }>();
  if (collision) {
    return persistRejection<CreateProjectResult>(db, {
      appUserId,
      operationId: request.operation_id,
      commandType: "CreateProject",
      requestFingerprint,
      outcomeKind: "domain_rejection",
      result: { code: "resource_conflict", message: "project_id is already in use" },
    });
  }

  const result: CreateProjectResult = { project: { id: request.project_id, title: semantic.title } };
  const now = new Date().toISOString();
  try {
    await db.batch([
      db
        .prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
        .bind(request.project_id, appUserId, semantic.title, now),
      db
        .prepare(`INSERT INTO project_board_items (app_user_id, project_id, board_position, settings_revision)
          SELECT ?, ?, COALESCE(MAX(board_position), 0) + 1, 0
            FROM project_board_items WHERE app_user_id = ?`)
        .bind(appUserId, request.project_id, appUserId),
      db.prepare("UPDATE project_board_heads SET board_revision = board_revision + 1 WHERE app_user_id = ?").bind(appUserId),
      db
        .prepare(
          `INSERT INTO operations
            (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
             outcome_kind, result_json, created_at)
           SELECT ?, ?, 'CreateProject', ?, ?, 'success', ?, ?
            WHERE EXISTS (SELECT 1 FROM project_board_items WHERE app_user_id = ? AND project_id = ?)`,
        )
        .bind(
          appUserId,
          request.operation_id,
          REQUEST_FINGERPRINT_VERSION,
          requestFingerprint,
          JSON.stringify(result),
          now,
          appUserId,
          request.project_id,
        ),
    ]);
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<CreateProjectResult>(committed, "CreateProject", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
