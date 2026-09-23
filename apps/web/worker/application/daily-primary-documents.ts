import type {
  DailyPrimaryDocument,
  DailyPrimaryDocumentListProjection,
  EnsureDailyPrimaryDocumentRequest,
  EnsureDailyPrimaryDocumentResult,
  UpdateDailyPrimaryDocumentRequest,
  UpdateDailyPrimaryDocumentResult,
} from "../../src/shared/contracts";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

type DailyCommand = "EnsureDailyPrimaryDocument" | "UpdateDailyPrimaryDocument";

interface DailyRow {
  document_id: string;
  app_user_id: string;
  taskchute_day_id: string;
  logical_date: string;
  kind: "daily_primary";
  markdown_body: string;
  revision: number;
  created_at: string;
  updated_at: string;
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

export function isEnsureDailyPrimaryDocumentRequest(value: unknown): value is EnsureDailyPrimaryDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "taskchute_day_id", "document_id"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.taskchute_day_id === "string" && isUuidV7(value.taskchute_day_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id);
}

export function isUpdateDailyPrimaryDocumentRequest(value: unknown): value is UpdateDailyPrimaryDocumentRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "taskchute_day_id", "document_id", "expected_revision", "markdown_body"])) return false;
  return typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.taskchute_day_id === "string" && isUuidV7(value.taskchute_day_id)
    && typeof value.document_id === "string" && isUuidV7(value.document_id)
    && isRevision(value.expected_revision) && typeof value.markdown_body === "string";
}

function projection(row: DailyRow): DailyPrimaryDocument {
  return {
    document_id: row.document_id,
    kind: "daily_primary",
    taskchute_day_id: row.taskchute_day_id,
    logical_date: row.logical_date,
    markdown_body: row.markdown_body,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rejection<T>(db: D1Database, appUserId: string, operationId: string, commandType: DailyCommand,
  requestFingerprint: string, code: "resource_not_found" | "resource_conflict", message: string): Promise<T> {
  return persistRejection<T>(db, {
    appUserId, operationId, commandType, requestFingerprint, outcomeKind: "domain_rejection", result: { code, message },
  });
}

function revisionRejection<T>(db: D1Database, appUserId: string, operationId: string, commandType: DailyCommand,
  requestFingerprint: string, message: string): Promise<T> {
  return persistRejection<T>(db, {
    appUserId, operationId, commandType, requestFingerprint, outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message },
  });
}

async function readByDay(db: D1Database, appUserId: string, dayId: string): Promise<DailyRow | null> {
  return db.prepare(`SELECT d.document_id, d.app_user_id, r.taskchute_day_id, day.logical_date, d.kind,
      d.markdown_body, d.revision, d.created_at, d.updated_at
    FROM daily_primary_documents r
    JOIN documents d ON d.app_user_id = r.app_user_id AND d.document_id = r.document_id AND d.kind = 'daily_primary'
    JOIN taskchute_days day ON day.app_user_id = r.app_user_id AND day.id = r.taskchute_day_id
    WHERE r.app_user_id = ? AND r.taskchute_day_id = ?`).bind(appUserId, dayId).first<DailyRow>();
}

async function readByDocument(db: D1Database, appUserId: string, documentId: string): Promise<DailyRow | null> {
  return db.prepare(`SELECT d.document_id, d.app_user_id, r.taskchute_day_id, day.logical_date, d.kind,
      d.markdown_body, d.revision, d.created_at, d.updated_at
    FROM documents d
    JOIN daily_primary_documents r ON r.app_user_id = d.app_user_id AND r.document_id = d.document_id
    JOIN taskchute_days day ON day.app_user_id = r.app_user_id AND day.id = r.taskchute_day_id
    WHERE d.app_user_id = ? AND d.document_id = ? AND d.kind = 'daily_primary'`).bind(appUserId, documentId).first<DailyRow>();
}

export async function loadDailyPrimaryDocuments(db: D1Database, appUserId: string): Promise<DailyPrimaryDocumentListProjection> {
  const rows = await db.prepare(`SELECT day.id AS taskchute_day_id, day.logical_date, r.document_id
    FROM taskchute_days day
    LEFT JOIN daily_primary_documents r ON r.app_user_id = day.app_user_id AND r.taskchute_day_id = day.id
    WHERE day.app_user_id = ? ORDER BY day.logical_date DESC, day.id DESC`).bind(appUserId).all<{
      taskchute_day_id: string; logical_date: string; document_id: string | null;
    }>();
  return { days: rows.results.map((row) => ({
    taskchute_day_id: row.taskchute_day_id,
    logical_date: row.logical_date,
    document_id: row.document_id,
  })) };
}

export async function loadDailyPrimaryDocument(db: D1Database, appUserId: string, documentId: string): Promise<DailyPrimaryDocument> {
  const row = await readByDocument(db, appUserId, documentId);
  if (!row) throw new HttpError(404, "resource_not_found", "Daily Note is unavailable");
  return projection(row);
}

async function persistExistingEnsure(db: D1Database, appUserId: string, request: EnsureDailyPrimaryDocumentRequest,
  requestFingerprint: string, document: DailyPrimaryDocument, nowInstant: string): Promise<void> {
  const assertionId = `daily-primary-ensure:${request.operation_id}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN EXISTS (
        SELECT 1 FROM daily_primary_documents
        WHERE app_user_id = ? AND taskchute_day_id = ? AND document_id = ?
      ) THEN 1 ELSE 0 END`).bind(appUserId, assertionId, appUserId, request.taskchute_day_id, document.document_id),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'EnsureDailyPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ?)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[1]?.meta.changes !== 1) throw new Error("EnsureDailyPrimaryDocument did not record its operation");
}

async function persistEnsureCreation(db: D1Database, appUserId: string, request: EnsureDailyPrimaryDocumentRequest,
  requestFingerprint: string, document: DailyPrimaryDocument, nowInstant: string): Promise<void> {
  const assertionId = `daily-primary-ensure:${request.operation_id}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO documents
      (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at)
      VALUES (?, ?, 'daily_primary', NULL, '', 0, ?, ?, NULL)`)
      .bind(document.document_id, appUserId, nowInstant, nowInstant),
    db.prepare(`INSERT INTO daily_primary_documents (app_user_id, taskchute_day_id, document_id, document_kind, created_at)
      VALUES (?, ?, ?, 'daily_primary', ?)`)
      .bind(appUserId, request.taskchute_day_id, document.document_id, nowInstant),
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN changes() = 1 AND EXISTS (
        SELECT 1 FROM documents WHERE app_user_id = ? AND document_id = ? AND kind = 'daily_primary'
      ) AND EXISTS (
        SELECT 1 FROM daily_primary_documents WHERE app_user_id = ? AND taskchute_day_id = ? AND document_id = ?
      ) THEN 1 ELSE 0 END`)
      .bind(appUserId, assertionId, appUserId, document.document_id, appUserId, request.taskchute_day_id, document.document_id),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'EnsureDailyPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ?)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[3]?.meta.changes !== 1) throw new Error("EnsureDailyPrimaryDocument did not record its operation");
}

export async function ensureDailyPrimaryDocument(db: D1Database, appUserId: string,
  input: EnsureDailyPrimaryDocumentRequest, nowInstant = new Date().toISOString()): Promise<EnsureDailyPrimaryDocumentResult> {
  const requestFingerprint = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<EnsureDailyPrimaryDocumentResult>(prior, "EnsureDailyPrimaryDocument", requestFingerprint);
  const day = await db.prepare("SELECT id, logical_date FROM taskchute_days WHERE app_user_id = ? AND id = ?")
    .bind(appUserId, input.taskchute_day_id).first<{ id: string; logical_date: string }>();
  if (!day) return rejection(db, appUserId, input.operation_id, "EnsureDailyPrimaryDocument", requestFingerprint,
    "resource_not_found", "Established TaskChuteDay is unavailable");
  const existing = await readByDay(db, appUserId, input.taskchute_day_id);
  if (existing) {
    const document = projection(existing);
    try {
      await persistExistingEnsure(db, appUserId, input, requestFingerprint, document, nowInstant);
      return { document };
    } catch {
      const committed = await readOperation(db, appUserId, input.operation_id);
      if (committed) return replayOperation<EnsureDailyPrimaryDocumentResult>(committed, "EnsureDailyPrimaryDocument", requestFingerprint);
      throw new HttpError(503, "infrastructure_ambiguous", "The Daily Note ensure outcome is unknown", true);
    }
  }
  const identity = await db.prepare("SELECT document_id FROM documents WHERE document_id = ?").bind(input.document_id).first();
  if (identity) return rejection(db, appUserId, input.operation_id, "EnsureDailyPrimaryDocument", requestFingerprint,
    "resource_conflict", "Document identity is already in use");
  const document: DailyPrimaryDocument = {
    document_id: input.document_id, kind: "daily_primary", taskchute_day_id: input.taskchute_day_id,
    logical_date: day.logical_date, markdown_body: "", revision: 0, created_at: nowInstant, updated_at: nowInstant,
  };
  try {
    await persistEnsureCreation(db, appUserId, input, requestFingerprint, document, nowInstant);
    return { document };
  } catch {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<EnsureDailyPrimaryDocumentResult>(committed, "EnsureDailyPrimaryDocument", requestFingerprint);
    const concurrent = await readByDay(db, appUserId, input.taskchute_day_id);
    if (concurrent) {
      const canonical = projection(concurrent);
      try {
        await persistExistingEnsure(db, appUserId, input, requestFingerprint, canonical, nowInstant);
        return { document: canonical };
      } catch {
        const replay = await readOperation(db, appUserId, input.operation_id);
        if (replay) return replayOperation<EnsureDailyPrimaryDocumentResult>(replay, "EnsureDailyPrimaryDocument", requestFingerprint);
      }
    }
    const identityAfter = await db.prepare("SELECT document_id FROM documents WHERE document_id = ?").bind(input.document_id).first();
    if (identityAfter) return rejection(db, appUserId, input.operation_id, "EnsureDailyPrimaryDocument", requestFingerprint,
      "resource_conflict", "Document identity is already in use");
    throw new HttpError(503, "infrastructure_ambiguous", "The Daily Note ensure outcome is unknown", true);
  }
}

async function persistUpdate(db: D1Database, appUserId: string, request: UpdateDailyPrimaryDocumentRequest,
  requestFingerprint: string, document: DailyPrimaryDocument, mutation: D1PreparedStatement, nowInstant: string): Promise<void> {
  const assertionId = `daily-primary-update:${request.operation_id}`;
  const results = await db.batch([
    mutation,
    db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
      SELECT ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END`).bind(appUserId, assertionId),
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      SELECT ?, ?, 'UpdateDailyPrimaryDocument', ?, ?, 'success', ?, ?
      WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ?)`)
      .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
        JSON.stringify({ document }), nowInstant, appUserId, assertionId),
    db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?").bind(appUserId, assertionId),
  ]);
  if (results[2]?.meta.changes !== 1) throw new Error("UpdateDailyPrimaryDocument did not record its operation");
}

export async function updateDailyPrimaryDocument(db: D1Database, appUserId: string,
  input: UpdateDailyPrimaryDocumentRequest, nowInstant = new Date().toISOString()): Promise<UpdateDailyPrimaryDocumentResult> {
  const requestFingerprint = await fingerprint(input);
  const prior = await readOperation(db, appUserId, input.operation_id);
  if (prior) return replayOperation<UpdateDailyPrimaryDocumentResult>(prior, "UpdateDailyPrimaryDocument", requestFingerprint);
  const current = await readByDocument(db, appUserId, input.document_id);
  if (!current || current.taskchute_day_id !== input.taskchute_day_id) return rejection(db, appUserId, input.operation_id,
    "UpdateDailyPrimaryDocument", requestFingerprint, "resource_not_found", "Daily Note is unavailable");
  if (current.revision !== input.expected_revision) return revisionRejection(db, appUserId, input.operation_id,
    "UpdateDailyPrimaryDocument", requestFingerprint, "The Daily Note revision is stale");
  const sameContent = current.markdown_body === input.markdown_body;
  const document: DailyPrimaryDocument = {
    ...projection(current), markdown_body: input.markdown_body,
    revision: sameContent ? current.revision : current.revision + 1,
    updated_at: sameContent ? current.updated_at : nowInstant,
  };
  const mutation = sameContent
    ? db.prepare(`UPDATE documents SET markdown_body = markdown_body
        WHERE app_user_id = ? AND document_id = ? AND kind = 'daily_primary' AND revision = ? AND markdown_body = ?`)
      .bind(appUserId, input.document_id, input.expected_revision, current.markdown_body)
    : db.prepare(`UPDATE documents SET markdown_body = ?, revision = revision + 1, updated_at = ?
        WHERE app_user_id = ? AND document_id = ? AND kind = 'daily_primary' AND revision = ?`)
      .bind(input.markdown_body, nowInstant, appUserId, input.document_id, input.expected_revision);
  try {
    await persistUpdate(db, appUserId, input, requestFingerprint, document, mutation, nowInstant);
    return { document };
  } catch {
    const committed = await readOperation(db, appUserId, input.operation_id);
    if (committed) return replayOperation<UpdateDailyPrimaryDocumentResult>(committed, "UpdateDailyPrimaryDocument", requestFingerprint);
    const latest = await readByDocument(db, appUserId, input.document_id);
    if (!latest || latest.revision !== input.expected_revision) return revisionRejection(db, appUserId, input.operation_id,
      "UpdateDailyPrimaryDocument", requestFingerprint, "The Daily Note changed before it could be saved");
    throw new HttpError(503, "infrastructure_ambiguous", "The Daily Note update outcome is unknown", true);
  }
}
