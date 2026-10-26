import type { InternalDocumentLinkCandidate, InternalDocumentLinkSearchProjection } from "../../src/shared/contracts";
import { HttpError } from "./errors";

const PAGE_SIZE = 20;
const SCAN_SIZE = 100;
const MAX_QUERY_LENGTH = 80;
const MAX_CURSOR_LENGTH = 2048;

type SearchPhase = "active" | "archived";

interface SearchCursor {
  version: 1;
  query: string;
  phase: SearchPhase;
  updated_at: string | null;
  document_id: string | null;
}

interface SearchRow {
  document_id: string;
  kind: string;
  title: string | null;
  updated_at: string;
  archived_at: string | null;
  task_id: string | null;
  task_title: string | null;
  task_created_at: string | null;
  task_project_title: string | null;
  project_id: string | null;
  project_title: string | null;
  project_archived: number | null;
  project_board_position: number | null;
  logical_date: string | null;
}

function encodeCursor(cursor: SearchCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(value: string, query: string): SearchCursor {
  if (!value || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new HttpError(400, "malformed_request", "Invalid document search cursor");
  }
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("bad cursor");
    const cursor = parsed as Partial<SearchCursor>;
    const validPosition = (cursor.updated_at === null && cursor.document_id === null)
      || (typeof cursor.updated_at === "string" && cursor.updated_at.length <= 40
        && typeof cursor.document_id === "string" && cursor.document_id.length > 0 && cursor.document_id.length <= 128);
    if (cursor.version !== 1 || cursor.query !== query || !["active", "archived"].includes(String(cursor.phase)) || !validPosition) {
      throw new Error("bad cursor");
    }
    return cursor as SearchCursor;
  } catch {
    throw new HttpError(400, "malformed_request", "Invalid document search cursor");
  }
}

function candidateFor(row: SearchRow): InternalDocumentLinkCandidate | null {
  if (row.kind === "standalone" && row.title !== null) {
    return {
      document_id: row.document_id,
      kind: "standalone",
      label: row.title,
      context: null,
      archived: row.archived_at !== null,
      logical_date: null,
    };
  }
  if (row.kind === "task_primary" && row.task_id !== null && row.task_title !== null) {
    const createdDate = row.task_created_at?.slice(0, 10);
    const context = row.task_project_title
      ? `${row.task_project_title}${createdDate ? ` · ${createdDate}` : ""}`
      : createdDate ? `プロジェクトなし · ${createdDate}` : null;
    return {
      document_id: row.document_id,
      kind: "task_primary",
      label: row.task_title,
      context,
      archived: false,
      logical_date: null,
    };
  }
  if (row.kind === "project_primary" && row.project_id !== null && row.project_title !== null) {
    return {
      document_id: row.document_id,
      kind: "project_primary",
      label: row.project_title,
      context: row.project_board_position === null ? "プロジェクト" : `プロジェクト ${row.project_board_position}番`,
      archived: row.project_archived === 1,
      logical_date: null,
    };
  }
  if (row.kind === "daily_primary" && row.logical_date !== null) {
    return {
      document_id: row.document_id,
      kind: "daily_primary",
      label: row.logical_date,
      context: null,
      archived: false,
      logical_date: row.logical_date,
    };
  }
  return null;
}

function matches(candidate: InternalDocumentLinkCandidate, query: string): boolean {
  if (query === "") return true;
  const needle = query.toLowerCase();
  return candidate.label.toLowerCase().includes(needle) || (candidate.context?.toLowerCase().includes(needle) ?? false);
}

async function readRows(db: D1Database, appUserId: string, cursor: SearchCursor): Promise<SearchRow[]> {
  const positionClause = cursor.updated_at === null
    ? ""
    : "AND (d.updated_at < ? OR (d.updated_at = ? AND d.document_id < ?))";
  const bindings: unknown[] = [appUserId];
  if (cursor.updated_at !== null && cursor.document_id !== null) {
    bindings.push(cursor.updated_at, cursor.updated_at, cursor.document_id);
  }
  bindings.push(appUserId, appUserId, appUserId, appUserId, appUserId, appUserId, appUserId, appUserId, appUserId);

  const result = await db.prepare(`WITH page AS MATERIALIZED (
      SELECT d.document_id, d.kind, d.title, d.updated_at, d.archived_at
      FROM documents d
      WHERE d.app_user_id = ? ${positionClause}
      ORDER BY d.updated_at DESC, d.document_id DESC
      LIMIT ${SCAN_SIZE + 1}
    )
    SELECT page.document_id, page.kind, page.title, page.updated_at, page.archived_at,
      t.id AS task_id, t.title AS task_title, t.created_at AS task_created_at, task_project.title AS task_project_title,
      p.id AS project_id, p.title AS project_title,
      CASE WHEN pa.project_id IS NULL THEN 0 ELSE 1 END AS project_archived,
      pbi.board_position AS project_board_position,
      day.logical_date
    FROM page
    LEFT JOIN task_primary_documents tr
      ON tr.app_user_id = ? AND tr.document_id = page.document_id AND page.kind = 'task_primary'
    LEFT JOIN tasks t ON t.app_user_id = ? AND t.id = tr.task_id
    LEFT JOIN projects task_project ON task_project.app_user_id = ? AND task_project.id = t.project_id
    LEFT JOIN project_primary_documents pr
      ON pr.app_user_id = ? AND pr.document_id = page.document_id AND page.kind = 'project_primary'
    LEFT JOIN projects p ON p.app_user_id = ? AND p.id = pr.project_id
    LEFT JOIN project_archives pa ON pa.app_user_id = ? AND pa.project_id = p.id
    LEFT JOIN project_board_items pbi ON pbi.app_user_id = ? AND pbi.project_id = p.id
    LEFT JOIN daily_primary_documents dr
      ON dr.app_user_id = ? AND dr.document_id = page.document_id AND page.kind = 'daily_primary'
    LEFT JOIN taskchute_days day ON day.app_user_id = ? AND day.id = dr.taskchute_day_id
    ORDER BY page.updated_at DESC, page.document_id DESC`).bind(...bindings).all<SearchRow>();
  return result.results;
}

/**
 * Read-only title/date search. Each request materializes at most 101 owner
 * Document metadata rows, returns at most 20 matches, and pages by the
 * existing owner/updated/document index. Bodies and other owners never enter
 * the query result.
 */
export async function searchInternalDocumentLinks(
  db: D1Database,
  appUserId: string,
  rawQuery: string,
  rawCursor?: string,
): Promise<InternalDocumentLinkSearchProjection> {
  const query = rawQuery.trim();
  if (query.length > MAX_QUERY_LENGTH) throw new HttpError(400, "malformed_request", "Document search query is too long");
  const cursor = rawCursor !== undefined ? decodeCursor(rawCursor, query) : {
    version: 1 as const, query, phase: "active" as const, updated_at: null, document_id: null,
  };
  const rows = await readRows(db, appUserId, cursor);
  const scanned = rows.slice(0, SCAN_SIZE);
  const candidates: InternalDocumentLinkCandidate[] = [];
  let consumed = 0;
  for (const row of scanned) {
    consumed += 1;
    const candidate = candidateFor(row);
    if (!candidate || candidate.archived !== (cursor.phase === "archived") || !matches(candidate, query)) continue;
    candidates.push(candidate);
    if (candidates.length === PAGE_SIZE) break;
  }

  const moreRows = rows.length > consumed;
  const lastConsumed = scanned[consumed - 1];
  let next: SearchCursor | null = null;
  if (moreRows && lastConsumed) {
    next = { ...cursor, updated_at: lastConsumed.updated_at, document_id: lastConsumed.document_id };
  } else if (cursor.phase === "active") {
    next = { version: 1, query, phase: "archived", updated_at: null, document_id: null };
  }
  return { candidates, next_cursor: next ? encodeCursor(next) : null };
}

export const internalDocumentSearchScanLimit = SCAN_SIZE;
