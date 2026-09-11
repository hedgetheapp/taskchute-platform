import type {
  CreateStandaloneDocumentRequest,
  CreateStandaloneDocumentResult,
  StandaloneDocument,
  StandaloneDocumentListProjection,
  StandaloneDocumentSummary,
  UpdateDocumentRequest,
  UpdateDocumentResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface DocumentRow {
  document_id: string;
  app_user_id: string;
  kind: "standalone";
  title: string;
  markdown_body: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentMutationHooks {
  /** Internal deterministic race-test seam; never exposed by the HTTP API. */
  beforeMutation?: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isCreateStandaloneDocumentRequest(value: unknown): value is CreateStandaloneDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "document_id", "title", "markdown_body"])) return false;
  return !Object.hasOwn(value, "user_id")
    && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isText(value.title) && value.title.trim().length >= 1 && value.title.trim().length <= 200
    && isText(value.markdown_body);
}

export function isUpdateDocumentRequest(value: unknown): value is UpdateDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "document_id", "expected_revision", "title", "markdown_body"])) return false;
  return !Object.hasOwn(value, "user_id")
    && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isRevision(value.expected_revision)
    && isText(value.title) && value.title.trim().length >= 1 && value.title.trim().length <= 200
    && isText(value.markdown_body);
}

function documentProjection(row: DocumentRow): StandaloneDocument {
  return {
    document_id: row.document_id,
    kind: row.kind,
    title: row.title,
    markdown_body: row.markdown_body,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function documentSummary(row: DocumentRow): StandaloneDocumentSummary {
  return {
    document_id: row.document_id,
    kind: row.kind,
    title: row.title,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rejection<T>(
  db: D1Database,
  appUserId: string,
  operationId: string,
  commandType: "CreateStandaloneDocument" | "UpdateDocument",
  requestFingerprint: string,
  code: "resource_not_found" | "resource_conflict",
  message: string,
): Promise<T> {
  return persistRejection<T>(db, {
    appUserId,
    operationId,
    commandType,
    requestFingerprint,
    outcomeKind: "domain_rejection",
    result: { code, message },
  });
}

function revisionRejection<T>(
  db: D1Database,
  appUserId: string,
  operationId: string,
  commandType: "CreateStandaloneDocument" | "UpdateDocument",
  requestFingerprint: string,
  message: string,
): Promise<T> {
  return persistRejection<T>(db, {
    appUserId,
    operationId,
    commandType,
    requestFingerprint,
    outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message },
  });
}

async function readDocument(db: D1Database, appUserId: string, documentId: string): Promise<DocumentRow | null> {
  return db.prepare(`SELECT document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at
    FROM documents WHERE app_user_id = ? AND document_id = ?`).bind(appUserId, documentId).first<DocumentRow>();
}

export async function loadStandaloneDocuments(
  db: D1Database,
  appUserId: string,
): Promise<StandaloneDocumentListProjection> {
  const rows = await db.prepare(`SELECT document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at
    FROM documents WHERE app_user_id = ? AND kind = 'standalone'
    ORDER BY updated_at DESC, document_id DESC`).bind(appUserId).all<DocumentRow>();
  return { documents: rows.results.map(documentSummary) };
}

export async function loadStandaloneDocument(
  db: D1Database,
  appUserId: string,
  documentId: string,
): Promise<StandaloneDocument> {
  const row = await readDocument(db, appUserId, documentId);
  if (!row) throw new HttpError(404, "resource_not_found", "Document is unavailable");
  return documentProjection(row);
}

export async function createStandaloneDocument(
  db: D1Database,
  appUserId: string,
  input: CreateStandaloneDocumentRequest,
  nowInstant = new Date().toISOString(),
  hooks: DocumentMutationHooks = {},
): Promise<CreateStandaloneDocumentResult> {
  const request = { ...input, title: input.title.trim() };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<CreateStandaloneDocumentResult>(prior, "CreateStandaloneDocument", requestFingerprint);

  const collision = await db.prepare("SELECT app_user_id FROM documents WHERE document_id = ?")
    .bind(request.document_id).first<{ app_user_id: string }>();
  if (collision) return rejection(db, appUserId, request.operation_id, "CreateStandaloneDocument", requestFingerprint,
    "resource_conflict", "Document identity is already in use");

  const document: StandaloneDocument = {
    document_id: request.document_id,
    kind: "standalone",
    title: request.title,
    markdown_body: request.markdown_body,
    revision: 0,
    created_at: nowInstant,
    updated_at: nowInstant,
  };
  const result: CreateStandaloneDocumentResult = { document };
  const assertionId = `document-create:${request.operation_id}`;
  await hooks.beforeMutation?.();
  try {
    const statements = [
      db.prepare(`INSERT INTO documents
        (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
        VALUES (?, ?, 'standalone', ?, ?, 0, ?, ?)`)
        .bind(request.document_id, appUserId, request.title, request.markdown_body, nowInstant, nowInstant),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`)
        .bind(appUserId, assertionId),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'CreateStandaloneDocument', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
    ];
    const results = await db.batch(statements);
    if (results[2]?.meta.changes !== 1) throw new Error("Document create did not record its operation");
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<CreateStandaloneDocumentResult>(committed, "CreateStandaloneDocument", requestFingerprint);
    const latest = await db.prepare("SELECT document_id FROM documents WHERE document_id = ?").bind(request.document_id).first();
    if (latest) return rejection(db, appUserId, request.operation_id, "CreateStandaloneDocument", requestFingerprint,
      "resource_conflict", "Document identity is already in use");
    throw new HttpError(503, "infrastructure_ambiguous", "The Document creation outcome is unknown; reload before retrying", true);
  }
}

export async function updateDocument(
  db: D1Database,
  appUserId: string,
  input: UpdateDocumentRequest,
  nowInstant = new Date().toISOString(),
  hooks: DocumentMutationHooks = {},
): Promise<UpdateDocumentResult> {
  const request = { ...input, title: input.title.trim() };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<UpdateDocumentResult>(prior, "UpdateDocument", requestFingerprint);
  const current = await readDocument(db, appUserId, request.document_id);
  if (!current) return rejection(db, appUserId, request.operation_id, "UpdateDocument", requestFingerprint,
    "resource_not_found", "Document is unavailable");
  if (current.revision !== request.expected_revision) return revisionRejection(db, appUserId, request.operation_id,
    "UpdateDocument", requestFingerprint, "The Document revision is stale");

  const document: StandaloneDocument = {
    ...documentProjection(current),
    title: request.title,
    markdown_body: request.markdown_body,
    revision: current.revision + 1,
    updated_at: nowInstant,
  };
  const result: UpdateDocumentResult = { document };
  const assertionId = `document-update:${request.operation_id}`;
  await hooks.beforeMutation?.();
  try {
    const results = await db.batch([
      db.prepare(`UPDATE documents SET title = ?, markdown_body = ?, revision = revision + 1, updated_at = ?
        WHERE app_user_id = ? AND document_id = ? AND kind = 'standalone' AND revision = ?`)
        .bind(request.title, request.markdown_body, nowInstant, appUserId, request.document_id, request.expected_revision),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`)
        .bind(appUserId, assertionId),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'UpdateDocument', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
    ]);
    if (results[2]?.meta.changes !== 1) throw new Error("Document update did not record its operation");
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation<UpdateDocumentResult>(committed, "UpdateDocument", requestFingerprint);
    const latest = await readDocument(db, appUserId, request.document_id);
    if (!latest || latest.revision !== request.expected_revision) return revisionRejection(db, appUserId,
      request.operation_id, "UpdateDocument", requestFingerprint, "The Document changed before it could be saved");
    throw new HttpError(503, "infrastructure_ambiguous", "The Document update outcome is unknown; reload before retrying", true);
  }
}
