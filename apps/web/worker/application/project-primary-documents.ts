import type {
  EnsureProjectPrimaryDocumentRequest,
  EnsureProjectPrimaryDocumentResult,
  ProjectPrimaryDocument,
  UpdateProjectPrimaryDocumentRequest,
  UpdateProjectPrimaryDocumentResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

type ProjectPrimaryCommand = "EnsureProjectPrimaryDocument" | "UpdateProjectPrimaryDocument";

interface ProjectPrimaryRow {
  document_id: string;
  app_user_id: string;
  project_id: string;
  project_title: string;
  kind: "project_primary";
  markdown_body: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectPrimaryDocumentMutationHooks {
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

export function isEnsureProjectPrimaryDocumentRequest(value: unknown): value is EnsureProjectPrimaryDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "project_id", "document_id"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.project_id === "string" && isUuidV7(value.project_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id);
}

export function isUpdateProjectPrimaryDocumentRequest(value: unknown): value is UpdateProjectPrimaryDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "project_id", "document_id", "expected_revision", "markdown_body"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.project_id === "string" && isUuidV7(value.project_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isRevision(value.expected_revision) && typeof value.markdown_body === "string";
}

function projection(row: ProjectPrimaryRow): ProjectPrimaryDocument {
  return {
    document_id: row.document_id, kind: "project_primary", project_id: row.project_id,
    project_title: row.project_title, markdown_body: row.markdown_body, revision: row.revision,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

function rejection<T>(db: D1Database, appUserId: string, operationId: string, commandType: ProjectPrimaryCommand,
  requestFingerprint: string, code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, {
    appUserId, operationId, commandType, requestFingerprint, outcomeKind: "domain_rejection", result: { code, message },
  });
}

function revisionRejection<T>(db: D1Database, appUserId: string, operationId: string, commandType: ProjectPrimaryCommand,
  requestFingerprint: string, message: string): Promise<T> {
  return persistRejection<T>(db, {
    appUserId, operationId, commandType, requestFingerprint, outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message },
  });
}

async function readByProject(db: D1Database, appUserId: string, projectId: string): Promise<ProjectPrimaryRow | null> {
  return db.prepare(`SELECT d.document_id, d.app_user_id, r.project_id, p.title AS project_title, d.kind,
      d.markdown_body, d.revision, d.created_at, d.updated_at
    FROM project_primary_documents r
    JOIN documents d ON d.app_user_id = r.app_user_id AND d.document_id = r.document_id AND d.kind = 'project_primary'
    JOIN projects p ON p.app_user_id = r.app_user_id AND p.id = r.project_id
    WHERE r.app_user_id = ? AND r.project_id = ?`).bind(appUserId, projectId).first<ProjectPrimaryRow>();
}

async function readByDocument(db: D1Database, appUserId: string, documentId: string): Promise<ProjectPrimaryRow | null> {
  return db.prepare(`SELECT d.document_id, d.app_user_id, r.project_id, p.title AS project_title, d.kind,
      d.markdown_body, d.revision, d.created_at, d.updated_at
    FROM documents d
    JOIN project_primary_documents r ON r.app_user_id = d.app_user_id AND r.document_id = d.document_id
    JOIN projects p ON p.app_user_id = r.app_user_id AND p.id = r.project_id
    WHERE d.app_user_id = ? AND d.document_id = ? AND d.kind = 'project_primary'`).bind(appUserId, documentId).first<ProjectPrimaryRow>();
}

export async function loadProjectPrimaryDocument(db: D1Database, appUserId: string, projectId: string): Promise<ProjectPrimaryDocument> {
  const row = await readByProject(db, appUserId, projectId);
  if (!row) throw new HttpError(404, "resource_not_found", "Project Primary Document is unavailable");
  return projection(row);
}

export async function loadProjectPrimaryDocumentById(db: D1Database, appUserId: string, documentId: string): Promise<ProjectPrimaryDocument> {
  const row = await readByDocument(db, appUserId, documentId);
  if (!row) throw new HttpError(404, "resource_not_found", "Project Primary Document is unavailable");
  return projection(row);
}

async function persistExistingEnsure(
  db: D1Database, appUserId: string, request: EnsureProjectPrimaryDocumentRequest, requestFingerprint: string,
  document: ProjectPrimaryDocument, nowInstant: string,
): Promise<void> {
  const assertionId = `project-primary-ensure:${request.operation_id}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN EXISTS (
        SELECT 1 FROM project_primary_documents
        WHERE app_user_id = ? AND project_id = ? AND document_id = ?
      ) THEN 1 ELSE 0 END`).bind(appUserId, assertionId, appUserId, request.project_id, document.document_id),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'EnsureProjectPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[1]?.meta.changes !== 1) throw new Error("EnsureProjectPrimaryDocument did not record its operation");
}

async function persistEnsureCreation(
  db: D1Database, appUserId: string, request: EnsureProjectPrimaryDocumentRequest, requestFingerprint: string,
  document: ProjectPrimaryDocument, nowInstant: string,
): Promise<void> {
  const assertionId = `project-primary-ensure:${request.operation_id}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO documents
      (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at)
      VALUES (?, ?, 'project_primary', NULL, '', 0, ?, ?, NULL)`)
      .bind(document.document_id, appUserId, nowInstant, nowInstant),
    db.prepare(`INSERT INTO project_primary_documents (app_user_id, project_id, document_id, document_kind, created_at)
      VALUES (?, ?, ?, 'project_primary', ?)`)
      .bind(appUserId, request.project_id, document.document_id, nowInstant),
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN changes() = 1 AND EXISTS (
        SELECT 1 FROM documents WHERE app_user_id = ? AND document_id = ? AND kind = 'project_primary'
      ) AND EXISTS (
        SELECT 1 FROM project_primary_documents WHERE app_user_id = ? AND project_id = ? AND document_id = ?
      ) THEN 1 ELSE 0 END`)
      .bind(appUserId, assertionId, appUserId, document.document_id, appUserId, request.project_id, document.document_id),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'EnsureProjectPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[3]?.meta.changes !== 1) throw new Error("EnsureProjectPrimaryDocument did not record its operation");
}

export async function ensureProjectPrimaryDocument(db: D1Database, appUserId: string,
  input: EnsureProjectPrimaryDocumentRequest, nowInstant = new Date().toISOString(), hooks: ProjectPrimaryDocumentMutationHooks = {}): Promise<EnsureProjectPrimaryDocumentResult> {
  const requestFingerprint = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<EnsureProjectPrimaryDocumentResult>(prior, "EnsureProjectPrimaryDocument", requestFingerprint);
  const project = await db.prepare("SELECT id, title FROM projects WHERE app_user_id = ? AND id = ?").bind(appUserId, input.project_id).first<{ id: string; title: string }>();
  if (!project) return rejection(db, appUserId, input.operation_id, "EnsureProjectPrimaryDocument", requestFingerprint,
    "resource_not_found", "Project is unavailable");
  const existing = await readByProject(db, appUserId, input.project_id);
  if (existing) {
    const document = projection(existing);
    try {
      await persistExistingEnsure(db, appUserId, input, requestFingerprint, document, nowInstant);
      return { document };
    } catch {
      const committed = await readOperation(db, appUserId, input.operation_id);
      if (committed) return replayOperation<EnsureProjectPrimaryDocumentResult>(committed, "EnsureProjectPrimaryDocument", requestFingerprint);
      throw new HttpError(503, "infrastructure_ambiguous", "The Project Primary Document ensure outcome is unknown", true);
    }
  }
  const identity = await db.prepare("SELECT document_id FROM documents WHERE document_id = ?").bind(input.document_id).first();
  if (identity) return rejection(db, appUserId, input.operation_id, "EnsureProjectPrimaryDocument", requestFingerprint,
    "resource_conflict", "Document identity is already in use");
  await hooks.beforeMutation?.();
  const document: ProjectPrimaryDocument = {
    document_id: input.document_id, kind: "project_primary", project_id: input.project_id,
    project_title: project.title, markdown_body: "", revision: 0, created_at: nowInstant, updated_at: nowInstant,
  };
  try {
    await persistEnsureCreation(db, appUserId, input, requestFingerprint, document, nowInstant);
    return { document };
  } catch {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<EnsureProjectPrimaryDocumentResult>(committed, "EnsureProjectPrimaryDocument", requestFingerprint);
    const concurrent = await readByProject(db, appUserId, input.project_id);
    if (concurrent) {
      const canonical = projection(concurrent);
      try {
        await persistExistingEnsure(db, appUserId, input, requestFingerprint, canonical, nowInstant);
        return { document: canonical };
      } catch {
        const replay = await readOperation(db, appUserId, input.operation_id);
        if (replay) return replayOperation<EnsureProjectPrimaryDocumentResult>(replay, "EnsureProjectPrimaryDocument", requestFingerprint);
        throw new HttpError(503, "infrastructure_ambiguous", "The Project Primary Document ensure outcome is unknown", true);
      }
    }
    const identityAfter = await db.prepare("SELECT document_id FROM documents WHERE document_id = ?").bind(input.document_id).first();
    if (identityAfter) return rejection(db, appUserId, input.operation_id, "EnsureProjectPrimaryDocument", requestFingerprint,
      "resource_conflict", "Document identity is already in use");
    throw new HttpError(503, "infrastructure_ambiguous", "The Project Primary Document ensure outcome is unknown", true);
  }
}

async function persistUpdate(
  db: D1Database, appUserId: string, request: UpdateProjectPrimaryDocumentRequest, requestFingerprint: string,
  document: ProjectPrimaryDocument, mutation: D1PreparedStatement, nowInstant: string,
): Promise<void> {
  const assertionId = `project-primary-update:${request.operation_id}`;
  const results = await db.batch([
    mutation,
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`).bind(appUserId, assertionId),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'UpdateProjectPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[2]?.meta.changes !== 1) throw new Error("UpdateProjectPrimaryDocument did not record its operation");
}

export async function updateProjectPrimaryDocument(db: D1Database, appUserId: string,
  input: UpdateProjectPrimaryDocumentRequest, nowInstant = new Date().toISOString(), hooks: ProjectPrimaryDocumentMutationHooks = {}): Promise<UpdateProjectPrimaryDocumentResult> {
  const requestFingerprint = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<UpdateProjectPrimaryDocumentResult>(prior, "UpdateProjectPrimaryDocument", requestFingerprint);
  const current = await readByDocument(db, appUserId, input.document_id);
  if (!current || current.project_id !== input.project_id) return rejection(db, appUserId, input.operation_id,
    "UpdateProjectPrimaryDocument", requestFingerprint, "resource_not_found", "Project Primary Document is unavailable");
  if (current.revision !== input.expected_revision) return revisionRejection(db, appUserId, input.operation_id,
    "UpdateProjectPrimaryDocument", requestFingerprint, "The Project Primary Document revision is stale");
  await hooks.beforeMutation?.();
  const sameContent = current.markdown_body === input.markdown_body;
  const document: ProjectPrimaryDocument = {
    ...projection(current), markdown_body: input.markdown_body,
    revision: sameContent ? current.revision : current.revision + 1,
    updated_at: sameContent ? current.updated_at : nowInstant,
  };
  const mutation = sameContent
    ? db.prepare(`UPDATE documents SET markdown_body = markdown_body
        WHERE app_user_id = ? AND document_id = ? AND kind = 'project_primary' AND revision = ? AND markdown_body = ?`)
      .bind(appUserId, input.document_id, input.expected_revision, current.markdown_body)
    : db.prepare(`UPDATE documents SET markdown_body = ?, revision = revision + 1, updated_at = ?
        WHERE app_user_id = ? AND document_id = ? AND kind = 'project_primary' AND revision = ?`)
      .bind(input.markdown_body, nowInstant, appUserId, input.document_id, input.expected_revision);
  try {
    await persistUpdate(db, appUserId, input, requestFingerprint, document, mutation, nowInstant);
    return { document };
  } catch {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<UpdateProjectPrimaryDocumentResult>(committed, "UpdateProjectPrimaryDocument", requestFingerprint);
    const latest = await readByDocument(db, appUserId, input.document_id);
    if (!latest || latest.revision !== input.expected_revision) return revisionRejection(db, appUserId, input.operation_id,
      "UpdateProjectPrimaryDocument", requestFingerprint, "The Project Primary Document changed before it could be saved");
    throw new HttpError(503, "infrastructure_ambiguous", "The Project Primary Document update outcome is unknown", true);
  }
}
