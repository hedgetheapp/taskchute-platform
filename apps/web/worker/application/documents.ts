import type {
  CreateStandaloneDocumentRequest,
  CreateStandaloneDocumentResult,
  DeleteStandaloneDocumentRequest,
  DeleteStandaloneDocumentResult,
  SetStandaloneDocumentArchivedRequest,
  SetStandaloneDocumentArchivedResult,
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

type DocumentCommand = "CreateStandaloneDocument" | "UpdateDocument" | "SetStandaloneDocumentArchived" | "DeleteStandaloneDocument";

interface DocumentRow {
  document_id: string;
  app_user_id: string;
  kind: "standalone";
  title: string;
  markdown_body: string;
  revision: number;
  archived_at: string | null;
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

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 200;
}

export function isCreateStandaloneDocumentRequest(value: unknown): value is CreateStandaloneDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "document_id", "title", "markdown_body"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isTitle(value.title) && typeof value.markdown_body === "string";
}

export function isUpdateDocumentRequest(value: unknown): value is UpdateDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "document_id", "expected_revision", "title", "markdown_body"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isRevision(value.expected_revision) && isTitle(value.title) && typeof value.markdown_body === "string";
}

export function isSetStandaloneDocumentArchivedRequest(value: unknown): value is SetStandaloneDocumentArchivedRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "document_id", "expected_revision", "archived"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isRevision(value.expected_revision) && typeof value.archived === "boolean";
}

export function isDeleteStandaloneDocumentRequest(value: unknown): value is DeleteStandaloneDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "document_id", "expected_revision"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isRevision(value.expected_revision);
}

function documentProjection(row: DocumentRow): StandaloneDocument {
  return {
    document_id: row.document_id, kind: row.kind, title: row.title, markdown_body: row.markdown_body,
    revision: row.revision, archived_at: row.archived_at, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function documentSummary(row: DocumentRow): StandaloneDocumentSummary {
  return {
    document_id: row.document_id, kind: row.kind, title: row.title, revision: row.revision,
    archived_at: row.archived_at, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function rejection<T>(db: D1Database, appUserId: string, operationId: string, commandType: DocumentCommand,
  requestFingerprint: string, code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, {
    appUserId, operationId, commandType, requestFingerprint, outcomeKind: "domain_rejection", result: { code, message },
  });
}

function revisionRejection<T>(db: D1Database, appUserId: string, operationId: string, commandType: DocumentCommand,
  requestFingerprint: string, message: string): Promise<T> {
  return persistRejection<T>(db, {
    appUserId, operationId, commandType, requestFingerprint, outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message },
  });
}

async function readDocument(db: D1Database, appUserId: string, documentId: string): Promise<DocumentRow | null> {
  return db.prepare(`SELECT document_id, app_user_id, kind, title, markdown_body, revision, archived_at, created_at, updated_at
    FROM documents WHERE app_user_id = ? AND document_id = ? AND kind = 'standalone'`)
    .bind(appUserId, documentId).first<DocumentRow>();
}

export async function loadStandaloneDocuments(db: D1Database, appUserId: string, archived = false): Promise<StandaloneDocumentListProjection> {
  const rows = await db.prepare(`SELECT document_id, app_user_id, kind, title, markdown_body, revision, archived_at, created_at, updated_at
    FROM documents WHERE app_user_id = ? AND kind = 'standalone' AND archived_at ${archived ? "IS NOT NULL" : "IS NULL"}
    ORDER BY updated_at DESC, document_id DESC`).bind(appUserId).all<DocumentRow>();
  return { documents: rows.results.map(documentSummary) };
}

export async function loadStandaloneDocument(db: D1Database, appUserId: string, documentId: string): Promise<StandaloneDocument> {
  const row = await readDocument(db, appUserId, documentId);
  if (!row) throw new HttpError(404, "resource_not_found", "Document is unavailable");
  return documentProjection(row);
}

function allocatedTitle(base: string, suffix: number): string | null {
  const title = suffix === 0 ? base : `${base}${suffix}`;
  return title.length <= 200 ? title : null;
}

async function writeDocumentOperation(db: D1Database, operationId: string, appUserId: string, commandType: DocumentCommand,
  requestFingerprint: string, result: object, nowInstant: string, assertionId: string, mutation: D1PreparedStatement): Promise<void> {
  const results = await db.batch([
    mutation,
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`).bind(appUserId, assertionId),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, ?, ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, operationId, commandType, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify(result), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[2]?.meta.changes !== 1) throw new Error(`${commandType} did not record its operation`);
}

function isRetryableTitleCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed: documents\.app_user_id, documents\.title/i.test(message)
    || /documents_standalone_owner_title_uq/i.test(message);
}

export async function createStandaloneDocument(db: D1Database, appUserId: string, input: CreateStandaloneDocumentRequest,
  nowInstant = new Date().toISOString(), hooks: DocumentMutationHooks = {}): Promise<CreateStandaloneDocumentResult> {
  const request = { ...input, title: input.title.trim() };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<CreateStandaloneDocumentResult>(prior, "CreateStandaloneDocument", requestFingerprint);
  const identityCollision = await db.prepare("SELECT app_user_id FROM documents WHERE document_id = ?")
    .bind(request.document_id).first<{ app_user_id: string }>();
  if (identityCollision) return rejection(db, appUserId, request.operation_id, "CreateStandaloneDocument", requestFingerprint,
    "resource_conflict", "Document identity is already in use");

  await hooks.beforeMutation?.();
  for (let suffix = 0; suffix <= 1000; suffix += 1) {
    const title = allocatedTitle(request.title, suffix);
    if (!title) break;
    const document: StandaloneDocument = {
      document_id: request.document_id, kind: "standalone", title, markdown_body: request.markdown_body,
      revision: 0, archived_at: null, created_at: nowInstant, updated_at: nowInstant,
    };
    try {
      await writeDocumentOperation(db, request.operation_id, appUserId, "CreateStandaloneDocument", requestFingerprint,
        { document }, nowInstant, `document-create:${request.operation_id}`,
        db.prepare(`INSERT INTO documents
          (document_id, app_user_id, kind, title, markdown_body, revision, archived_at, created_at, updated_at)
          VALUES (?, ?, 'standalone', ?, ?, 0, NULL, ?, ?)`)
          .bind(request.document_id, appUserId, title, request.markdown_body, nowInstant, nowInstant));
      return { document };
    } catch (error) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<CreateStandaloneDocumentResult>(committed, "CreateStandaloneDocument", requestFingerprint);
      const identity = await db.prepare("SELECT document_id FROM documents WHERE document_id = ?").bind(request.document_id).first();
      if (identity) return rejection(db, appUserId, request.operation_id, "CreateStandaloneDocument", requestFingerprint,
        "resource_conflict", "Document identity is already in use");
      if (isRetryableTitleCollision(error)) continue;
      throw new HttpError(503, "infrastructure_ambiguous", "The Document creation outcome is unknown; reload before retrying", true);
    }
  }
  return rejection(db, appUserId, request.operation_id, "CreateStandaloneDocument", requestFingerprint,
    "resource_conflict", "No available standalone Note title could be allocated");
}

export async function updateDocument(db: D1Database, appUserId: string, input: UpdateDocumentRequest,
  nowInstant = new Date().toISOString(), hooks: DocumentMutationHooks = {}): Promise<UpdateDocumentResult> {
  const request = { ...input, title: input.title.trim() };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation<UpdateDocumentResult>(prior, "UpdateDocument", requestFingerprint);
  const current = await readDocument(db, appUserId, request.document_id);
  if (!current) return rejection(db, appUserId, request.operation_id, "UpdateDocument", requestFingerprint,
    "resource_not_found", "Document is unavailable");
  if (current.revision !== request.expected_revision) return revisionRejection(db, appUserId, request.operation_id,
    "UpdateDocument", requestFingerprint, "The Document revision is stale");
  await hooks.beforeMutation?.();
  const sameContent = current.title === request.title && current.markdown_body === request.markdown_body;
  for (let suffix = 0; suffix <= 1000; suffix += 1) {
    const title = allocatedTitle(request.title, suffix);
    if (!title) break;
    if (!sameContent) {
      const collision = await db.prepare(`SELECT document_id FROM documents
        WHERE app_user_id = ? AND kind = 'standalone' AND title = ? AND document_id <> ?`)
        .bind(appUserId, title, request.document_id).first();
      if (collision) continue;
    }
    const document: StandaloneDocument = {
      ...documentProjection(current), title, markdown_body: request.markdown_body,
      revision: sameContent ? current.revision : current.revision + 1,
      updated_at: sameContent ? current.updated_at : nowInstant,
    };
    const mutation = sameContent
      ? db.prepare(`UPDATE documents SET updated_at = updated_at
          WHERE app_user_id = ? AND document_id = ? AND kind = 'standalone'
            AND revision = ? AND title = ? AND markdown_body = ?`)
        .bind(appUserId, request.document_id, request.expected_revision, current.title, current.markdown_body)
      : db.prepare(`UPDATE documents SET title = ?, markdown_body = ?, revision = revision + 1, updated_at = ?
          WHERE app_user_id = ? AND document_id = ? AND kind = 'standalone' AND revision = ?`)
        .bind(title, request.markdown_body, nowInstant, appUserId, request.document_id, request.expected_revision);
    try {
      await writeDocumentOperation(db, request.operation_id, appUserId, "UpdateDocument", requestFingerprint,
        { document }, nowInstant, `document-update:${request.operation_id}`, mutation);
      return { document };
    } catch (error) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation<UpdateDocumentResult>(committed, "UpdateDocument", requestFingerprint);
      const latest = await readDocument(db, appUserId, request.document_id);
      if (latest && latest.revision !== request.expected_revision) return revisionRejection(db, appUserId,
        request.operation_id, "UpdateDocument", requestFingerprint, "The Document changed before it could be saved");
      if (isRetryableTitleCollision(error)) continue;
      if (!latest) return revisionRejection(db, appUserId, request.operation_id, "UpdateDocument", requestFingerprint,
        "The Document changed before it could be saved");
      throw new HttpError(503, "infrastructure_ambiguous", "The Document update outcome is unknown; reload before retrying", true);
    }
  }
  return rejection(db, appUserId, request.operation_id, "UpdateDocument", requestFingerprint,
    "resource_conflict", "No available standalone Note title could be allocated");
}

export async function setStandaloneDocumentArchived(db: D1Database, appUserId: string,
  input: SetStandaloneDocumentArchivedRequest, nowInstant = new Date().toISOString(), hooks: DocumentMutationHooks = {}): Promise<SetStandaloneDocumentArchivedResult> {
  const requestFingerprint = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<SetStandaloneDocumentArchivedResult>(prior, "SetStandaloneDocumentArchived", requestFingerprint);
  const current = await readDocument(db, appUserId, input.document_id);
  if (!current) return rejection(db, appUserId, input.operation_id, "SetStandaloneDocumentArchived", requestFingerprint,
    "resource_not_found", "Document is unavailable");
  if (current.revision !== input.expected_revision) return revisionRejection(db, appUserId, input.operation_id,
    "SetStandaloneDocumentArchived", requestFingerprint, "The Document revision is stale");
  const alreadyTarget = (current.archived_at !== null) === input.archived;
  const document: StandaloneDocument = {
    ...documentProjection(current),
    archived_at: input.archived ? (alreadyTarget ? current.archived_at : nowInstant) : null,
    revision: alreadyTarget ? current.revision : current.revision + 1,
    updated_at: alreadyTarget ? current.updated_at : nowInstant,
  };
  await hooks.beforeMutation?.();
  const mutation = alreadyTarget
    ? db.prepare(`UPDATE documents SET archived_at = archived_at
        WHERE app_user_id = ? AND document_id = ? AND kind = 'standalone' AND revision = ?
          AND ((? = 1 AND archived_at IS NOT NULL) OR (? = 0 AND archived_at IS NULL))`)
      .bind(appUserId, input.document_id, input.expected_revision, input.archived ? 1 : 0, input.archived ? 1 : 0)
    : db.prepare(`UPDATE documents SET archived_at = ?, revision = revision + 1, updated_at = ?
        WHERE app_user_id = ? AND document_id = ? AND kind = 'standalone' AND revision = ?
          AND ((? = 1 AND archived_at IS NULL) OR (? = 0 AND archived_at IS NOT NULL))`)
      .bind(input.archived ? nowInstant : null, nowInstant, appUserId, input.document_id, input.expected_revision,
        input.archived ? 1 : 0, input.archived ? 1 : 0);
  try {
    await writeDocumentOperation(db, input.operation_id, appUserId, "SetStandaloneDocumentArchived", requestFingerprint,
      { document }, nowInstant, `document-archive:${input.operation_id}`, mutation);
    return { document };
  } catch {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<SetStandaloneDocumentArchivedResult>(committed, "SetStandaloneDocumentArchived", requestFingerprint);
    const latest = await readDocument(db, appUserId, input.document_id);
    const expectedPreconditionArchived = alreadyTarget ? input.archived : !input.archived;
    if (!latest || latest.revision !== input.expected_revision || (latest.archived_at !== null) !== expectedPreconditionArchived) {
      return revisionRejection(db, appUserId, input.operation_id, "SetStandaloneDocumentArchived", requestFingerprint,
        "The Document changed before its archive state could be saved");
    }
    throw new HttpError(503, "infrastructure_ambiguous", "The Document archive outcome is unknown; retry the exact operation", true);
  }
}

export async function deleteStandaloneDocument(db: D1Database, appUserId: string,
  input: DeleteStandaloneDocumentRequest, nowInstant = new Date().toISOString(), hooks: DocumentMutationHooks = {}): Promise<DeleteStandaloneDocumentResult> {
  const requestFingerprint = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<DeleteStandaloneDocumentResult>(prior, "DeleteStandaloneDocument", requestFingerprint);
  const current = await readDocument(db, appUserId, input.document_id);
  if (!current) return rejection(db, appUserId, input.operation_id, "DeleteStandaloneDocument", requestFingerprint,
    "resource_not_found", "Document is unavailable");
  if (current.revision !== input.expected_revision) return revisionRejection(db, appUserId, input.operation_id,
    "DeleteStandaloneDocument", requestFingerprint, "The Document revision is stale");
  const result: DeleteStandaloneDocumentResult = { document_id: input.document_id, deleted: true };
  await hooks.beforeMutation?.();
  try {
    await writeDocumentOperation(db, input.operation_id, appUserId, "DeleteStandaloneDocument", requestFingerprint,
      result, nowInstant, `document-delete:${input.operation_id}`,
      db.prepare(`DELETE FROM documents WHERE app_user_id = ? AND document_id = ? AND kind = 'standalone' AND revision = ?`)
        .bind(appUserId, input.document_id, input.expected_revision));
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<DeleteStandaloneDocumentResult>(committed, "DeleteStandaloneDocument", requestFingerprint);
    const latest = await readDocument(db, appUserId, input.document_id);
    if (!latest || latest.revision !== input.expected_revision) {
      return revisionRejection(db, appUserId, input.operation_id, "DeleteStandaloneDocument", requestFingerprint,
        "The Document changed before it could be deleted");
    }
    throw new HttpError(503, "infrastructure_ambiguous", "The Document delete outcome is unknown; retry the exact operation", true);
  }
}
