import type {
  EnsureTaskPrimaryDocumentRequest,
  EnsureTaskPrimaryDocumentResult,
  TaskPrimaryDocument,
  UpdateTaskPrimaryDocumentRequest,
  UpdateTaskPrimaryDocumentResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

type TaskPrimaryCommand = "EnsureTaskPrimaryDocument" | "UpdateTaskPrimaryDocument";

interface TaskPrimaryRow {
  document_id: string;
  app_user_id: string;
  task_id: string;
  kind: "task_primary";
  markdown_body: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface TaskPrimaryDocumentMutationHooks {
  beforeMutation?: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isEnsureTaskPrimaryDocumentRequest(value: unknown): value is EnsureTaskPrimaryDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "task_id", "document_id"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.task_id === "string" && isUuidV7(value.task_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id);
}

export function isUpdateTaskPrimaryDocumentRequest(value: unknown): value is UpdateTaskPrimaryDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "task_id", "document_id", "expected_revision", "markdown_body"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.task_id === "string" && isUuidV7(value.task_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isRevision(value.expected_revision) && typeof value.markdown_body === "string";
}

function projection(row: TaskPrimaryRow): TaskPrimaryDocument {
  return {
    document_id: row.document_id, kind: "task_primary", task_id: row.task_id,
    markdown_body: row.markdown_body, revision: row.revision,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function rejection<T>(db: D1Database, appUserId: string, operationId: string, commandType: TaskPrimaryCommand,
  requestFingerprint: string, code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, {
    appUserId, operationId, commandType, requestFingerprint, outcomeKind: "domain_rejection", result: { code, message },
  });
}

function revisionRejection<T>(db: D1Database, appUserId: string, operationId: string, commandType: TaskPrimaryCommand,
  requestFingerprint: string, message: string): Promise<T> {
  return persistRejection<T>(db, {
    appUserId, operationId, commandType, requestFingerprint, outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message },
  });
}

async function readByTask(db: D1Database, appUserId: string, taskId: string): Promise<TaskPrimaryRow | null> {
  return db.prepare(`SELECT d.document_id, d.app_user_id, r.task_id, d.kind, d.markdown_body,
      d.revision, d.created_at, d.updated_at
    FROM task_primary_documents r
    JOIN documents d ON d.app_user_id = r.app_user_id AND d.document_id = r.document_id AND d.kind = 'task_primary'
    WHERE r.app_user_id = ? AND r.task_id = ?`).bind(appUserId, taskId).first<TaskPrimaryRow>();
}

async function readByDocument(db: D1Database, appUserId: string, documentId: string): Promise<TaskPrimaryRow | null> {
  return db.prepare(`SELECT d.document_id, d.app_user_id, r.task_id, d.kind, d.markdown_body,
      d.revision, d.created_at, d.updated_at
    FROM documents d
    JOIN task_primary_documents r ON r.app_user_id = d.app_user_id AND r.document_id = d.document_id
    WHERE d.app_user_id = ? AND d.document_id = ? AND d.kind = 'task_primary'`).bind(appUserId, documentId).first<TaskPrimaryRow>();
}

export async function loadTaskPrimaryDocument(db: D1Database, appUserId: string, taskId: string): Promise<TaskPrimaryDocument> {
  const row = await readByTask(db, appUserId, taskId);
  if (!row) throw new HttpError(404, "resource_not_found", "Task Primary Document is unavailable");
  return projection(row);
}

export async function loadTaskPrimaryDocumentById(db: D1Database, appUserId: string, documentId: string): Promise<TaskPrimaryDocument> {
  const row = await readByDocument(db, appUserId, documentId);
  if (!row) throw new HttpError(404, "resource_not_found", "Task Primary Document is unavailable");
  return projection(row);
}

async function persistExistingEnsure(
  db: D1Database, appUserId: string, request: EnsureTaskPrimaryDocumentRequest, requestFingerprint: string,
  document: TaskPrimaryDocument, nowInstant: string,
): Promise<void> {
  const assertionId = `task-primary-ensure:${request.operation_id}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN EXISTS (
        SELECT 1 FROM task_primary_documents
        WHERE app_user_id = ? AND task_id = ? AND document_id = ?
      ) THEN 1 ELSE 0 END`).bind(appUserId, assertionId, appUserId, request.task_id, document.document_id),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'EnsureTaskPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[1]?.meta.changes !== 1) throw new Error("EnsureTaskPrimaryDocument did not record its operation");
}

async function persistEnsureCreation(
  db: D1Database, appUserId: string, request: EnsureTaskPrimaryDocumentRequest, requestFingerprint: string,
  document: TaskPrimaryDocument, nowInstant: string,
): Promise<void> {
  const assertionId = `task-primary-ensure:${request.operation_id}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO documents
      (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at)
      VALUES (?, ?, 'task_primary', NULL, '', 0, ?, ?, NULL)`)
      .bind(document.document_id, appUserId, nowInstant, nowInstant),
    db.prepare(`INSERT INTO task_primary_documents (app_user_id, task_id, document_id, document_kind, created_at)
      VALUES (?, ?, ?, 'task_primary', ?)`)
      .bind(appUserId, request.task_id, document.document_id, nowInstant),
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN changes() = 1 AND EXISTS (
        SELECT 1 FROM documents WHERE app_user_id = ? AND document_id = ? AND kind = 'task_primary'
      ) AND EXISTS (
        SELECT 1 FROM task_primary_documents WHERE app_user_id = ? AND task_id = ? AND document_id = ?
      ) THEN 1 ELSE 0 END`)
      .bind(appUserId, assertionId, appUserId, document.document_id, appUserId, request.task_id, document.document_id),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'EnsureTaskPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[3]?.meta.changes !== 1) throw new Error("EnsureTaskPrimaryDocument did not record its operation");
}

export async function ensureTaskPrimaryDocument(db: D1Database, appUserId: string,
  input: EnsureTaskPrimaryDocumentRequest, nowInstant = new Date().toISOString(), hooks: TaskPrimaryDocumentMutationHooks = {}): Promise<EnsureTaskPrimaryDocumentResult> {
  const requestFingerprint = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<EnsureTaskPrimaryDocumentResult>(prior, "EnsureTaskPrimaryDocument", requestFingerprint);
  const task = await db.prepare("SELECT id FROM tasks WHERE app_user_id = ? AND id = ?").bind(appUserId, input.task_id).first();
  if (!task) return rejection(db, appUserId, input.operation_id, "EnsureTaskPrimaryDocument", requestFingerprint,
    "resource_not_found", "Task is unavailable");
  const existing = await readByTask(db, appUserId, input.task_id);
  if (existing) {
    const document = projection(existing);
    try {
      await persistExistingEnsure(db, appUserId, input, requestFingerprint, document, nowInstant);
      return { document };
    } catch (error) {
      const committed = await readOperation(db, appUserId, input.operation_id);
      if (committed) return replayOperation<EnsureTaskPrimaryDocumentResult>(committed, "EnsureTaskPrimaryDocument", requestFingerprint);
      throw new HttpError(503, "infrastructure_ambiguous", "The Task Primary Document ensure outcome is unknown", true);
    }
  }
  const identity = await db.prepare("SELECT document_id FROM documents WHERE document_id = ?").bind(input.document_id).first();
  if (identity) return rejection(db, appUserId, input.operation_id, "EnsureTaskPrimaryDocument", requestFingerprint,
    "resource_conflict", "Document identity is already in use");
  await hooks.beforeMutation?.();
  const document: TaskPrimaryDocument = {
    document_id: input.document_id, kind: "task_primary", task_id: input.task_id,
    markdown_body: "", revision: 0, created_at: nowInstant, updated_at: nowInstant,
  };
  try {
    await persistEnsureCreation(db, appUserId, input, requestFingerprint, document, nowInstant);
    return { document };
  } catch (error) {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<EnsureTaskPrimaryDocumentResult>(committed, "EnsureTaskPrimaryDocument", requestFingerprint);
    const concurrent = await readByTask(db, appUserId, input.task_id);
    if (concurrent) {
      const canonical = projection(concurrent);
      try {
        await persistExistingEnsure(db, appUserId, input, requestFingerprint, canonical, nowInstant);
        return { document: canonical };
      } catch (persistError) {
        const replay = await readOperation(db, appUserId, input.operation_id);
        if (replay) return replayOperation<EnsureTaskPrimaryDocumentResult>(replay, "EnsureTaskPrimaryDocument", requestFingerprint);
        throw new HttpError(503, "infrastructure_ambiguous", "The Task Primary Document ensure outcome is unknown", true);
      }
    }
    const identityAfter = await db.prepare("SELECT document_id FROM documents WHERE document_id = ?").bind(input.document_id).first();
    if (identityAfter) return rejection(db, appUserId, input.operation_id, "EnsureTaskPrimaryDocument", requestFingerprint,
      "resource_conflict", "Document identity is already in use");
    throw new HttpError(503, "infrastructure_ambiguous", "The Task Primary Document ensure outcome is unknown", true);
  }
}

async function persistUpdate(
  db: D1Database, appUserId: string, request: UpdateTaskPrimaryDocumentRequest, requestFingerprint: string,
  document: TaskPrimaryDocument, mutation: D1PreparedStatement, nowInstant: string,
): Promise<void> {
  const assertionId = `task-primary-update:${request.operation_id}`;
  const results = await db.batch([
    mutation,
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`).bind(appUserId, assertionId),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'UpdateTaskPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[2]?.meta.changes !== 1) throw new Error("UpdateTaskPrimaryDocument did not record its operation");
}

export async function updateTaskPrimaryDocument(db: D1Database, appUserId: string,
  input: UpdateTaskPrimaryDocumentRequest, nowInstant = new Date().toISOString(), hooks: TaskPrimaryDocumentMutationHooks = {}): Promise<UpdateTaskPrimaryDocumentResult> {
  const requestFingerprint = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<UpdateTaskPrimaryDocumentResult>(prior, "UpdateTaskPrimaryDocument", requestFingerprint);
  const current = await readByDocument(db, appUserId, input.document_id);
  if (!current || current.task_id !== input.task_id) return rejection(db, appUserId, input.operation_id, "UpdateTaskPrimaryDocument", requestFingerprint,
    "resource_not_found", "Task Primary Document is unavailable");
  if (current.revision !== input.expected_revision) return revisionRejection(db, appUserId, input.operation_id,
    "UpdateTaskPrimaryDocument", requestFingerprint, "The Task Primary Document revision is stale");
  await hooks.beforeMutation?.();
  const sameContent = current.markdown_body === input.markdown_body;
  const document: TaskPrimaryDocument = {
    ...projection(current), markdown_body: input.markdown_body,
    revision: sameContent ? current.revision : current.revision + 1,
    updated_at: sameContent ? current.updated_at : nowInstant,
  };
  const mutation = sameContent
    ? db.prepare(`UPDATE documents SET markdown_body = markdown_body
        WHERE app_user_id = ? AND document_id = ? AND kind = 'task_primary' AND revision = ? AND markdown_body = ?`)
      .bind(appUserId, input.document_id, input.expected_revision, current.markdown_body)
    : db.prepare(`UPDATE documents SET markdown_body = ?, revision = revision + 1, updated_at = ?
        WHERE app_user_id = ? AND document_id = ? AND kind = 'task_primary' AND revision = ?`)
      .bind(input.markdown_body, nowInstant, appUserId, input.document_id, input.expected_revision);
  try {
    await persistUpdate(db, appUserId, input, requestFingerprint, document, mutation, nowInstant);
    return { document };
  } catch (error) {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<UpdateTaskPrimaryDocumentResult>(committed, "UpdateTaskPrimaryDocument", requestFingerprint);
    const latest = await readByDocument(db, appUserId, input.document_id);
    if (!latest || latest.revision !== input.expected_revision) return revisionRejection(db, appUserId,
      input.operation_id, "UpdateTaskPrimaryDocument", requestFingerprint, "The Task Primary Document changed before it could be saved");
    throw new HttpError(503, "infrastructure_ambiguous", "The Task Primary Document update outcome is unknown", true);
  }
}
