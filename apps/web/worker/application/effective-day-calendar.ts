import type {
  DeleteEffectiveDayOverrideRequest,
  DeleteEffectiveDayOverrideResult,
  EffectiveDayCalendarProjection,
  EffectiveDayOverrideProjection,
  UpsertEffectiveDayOverrideRequest,
  UpsertEffectiveDayOverrideResult,
} from "../../src/shared/contracts";
import { classifyEffectiveDay, effectiveDayCoverage, type EffectiveDayOverrideValue } from "../../src/shared/effective-day-calendar";
import { isUuidV7 } from "../domain/uuidv7";
import { isLogicalDate } from "../domain/taskchute-day";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

interface OverrideRow {
  logical_date: string;
  override_kind: "workday" | "holiday";
  reason: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).every((key) => expected.has(key)) && keys.every((key) => key in value || key === "reason");
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isReason(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.trim().length <= 500);
}

export function isUpsertEffectiveDayOverrideRequest(value: unknown): value is UpsertEffectiveDayOverrideRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "logical_date", "override_kind", "reason", "expected_revision"])) return false;
  return !("user_id" in value)
    && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.logical_date === "string" && isLogicalDate(value.logical_date)
    && (value.override_kind === "workday" || value.override_kind === "holiday")
    && isReason(value.reason)
    && (value.expected_revision === null || isRevision(value.expected_revision));
}

export function isDeleteEffectiveDayOverrideRequest(value: unknown): value is DeleteEffectiveDayOverrideRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["operation_id", "logical_date", "expected_revision"])) return false;
  return !("user_id" in value)
    && typeof value.operation_id === "string" && isUuidV7(value.operation_id)
    && typeof value.logical_date === "string" && isLogicalDate(value.logical_date)
    && (value.expected_revision === null || isRevision(value.expected_revision));
}

function normalizeReason(reason: string | null | undefined): string | null {
  const normalized = reason?.trim() ?? "";
  return normalized === "" ? null : normalized;
}

function projection(row: OverrideRow): EffectiveDayOverrideProjection {
  return {
    logical_date: row.logical_date,
    override_kind: row.override_kind,
    reason: row.reason,
    revision: row.revision,
    updated_at: row.updated_at,
  };
}

function classify(logicalDate: string, row: OverrideRow | null) {
  const override: EffectiveDayOverrideValue | null = row ? projection(row) : null;
  return classifyEffectiveDay({ logicalDate, override });
}

async function persistNoop<T>(db: D1Database, appUserId: string, operationId: string,
  commandType: "UpsertEffectiveDayOverride" | "DeleteEffectiveDayOverride", requestFingerprint: string,
  result: T, nowInstant: string): Promise<T> {
  try {
    await db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at) VALUES (?, ?, ?, ?, ?, 'success', ?, ?)`)
      .bind(appUserId, operationId, commandType, REQUEST_FINGERPRINT_VERSION,
        requestFingerprint, JSON.stringify(result), nowInstant).run();
    return result;
  } catch {
    const prior = await readOperation(db, appUserId, operationId);
    if (prior) return replayOperation<T>(prior, commandType, requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The override outcome is unknown; reload and retry", true);
  }
}

export async function loadEffectiveDayCalendar(
  db: D1Database,
  appUserId: string,
  logicalDate: string,
): Promise<EffectiveDayCalendarProjection> {
  const rows = await db.prepare(`SELECT logical_date, override_kind, reason, revision, created_at, updated_at
    FROM effective_day_overrides WHERE app_user_id = ? ORDER BY logical_date LIMIT 5000`).bind(appUserId).all<OverrideRow>();
  const selected = rows.results.find((row) => row.logical_date === logicalDate) ?? null;
  return {
    coverage: effectiveDayCoverage(),
    classification: classify(logicalDate, selected),
    overrides: rows.results.map(projection),
  };
}

export async function upsertEffectiveDayOverride(
  db: D1Database,
  appUserId: string,
  input: UpsertEffectiveDayOverrideRequest,
  nowInstant = new Date().toISOString(),
): Promise<UpsertEffectiveDayOverrideResult> {
  const request = { ...input, reason: normalizeReason(input.reason) };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "UpsertEffectiveDayOverride", requestFingerprint);
  const current = await db.prepare(`SELECT logical_date, override_kind, reason, revision, created_at, updated_at
    FROM effective_day_overrides WHERE app_user_id = ? AND logical_date = ?`)
    .bind(appUserId, request.logical_date).first<OverrideRow>();
  if (request.expected_revision === null && current) {
    return persistRejection(db, { appUserId, operationId: request.operation_id,
      commandType: "UpsertEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The day override already exists; reload before editing" } });
  }
  if (request.expected_revision !== null && (!current || current.revision !== request.expected_revision)) {
    return persistRejection(db, { appUserId, operationId: request.operation_id,
      commandType: "UpsertEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The day override revision is stale" } });
  }
  const nextRevision = current ? current.revision + 1 : 0;
  const nextRow: OverrideRow = {
    logical_date: request.logical_date,
    override_kind: request.override_kind,
    reason: request.reason ?? null,
    revision: nextRevision,
    created_at: current?.created_at ?? nowInstant,
    updated_at: nowInstant,
  };
  const result: UpsertEffectiveDayOverrideResult = { classification: classify(request.logical_date, nextRow) };
  if (current && current.override_kind === nextRow.override_kind && current.reason === nextRow.reason) {
    return persistNoop(db, appUserId, request.operation_id, "UpsertEffectiveDayOverride", requestFingerprint, {
      classification: classify(request.logical_date, current),
    }, nowInstant);
  }
  try {
    const [mutation, operation] = current
      ? await db.batch([
        db.prepare(`UPDATE effective_day_overrides SET override_kind = ?, reason = ?, revision = revision + 1, updated_at = ?
          WHERE app_user_id = ? AND logical_date = ? AND revision = ?`)
          .bind(nextRow.override_kind, nextRow.reason, nowInstant, appUserId, request.logical_date, current.revision),
        db.prepare(`INSERT INTO operations
          (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
           outcome_kind, result_json, created_at)
          SELECT ?, ?, 'UpsertEffectiveDayOverride', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM effective_day_overrides
            WHERE app_user_id = ? AND logical_date = ? AND override_kind = ? AND reason IS ? AND revision = ?)`)
          .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
            JSON.stringify(result), nowInstant, appUserId, request.logical_date, nextRow.override_kind,
            nextRow.reason, nextRevision),
      ])
      : await db.batch([
        db.prepare(`INSERT INTO effective_day_overrides
          (app_user_id, logical_date, override_kind, reason, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, 0, ?, ?)`)
          .bind(appUserId, nextRow.logical_date, nextRow.override_kind, nextRow.reason, nowInstant, nowInstant),
        db.prepare(`INSERT INTO operations
          (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
           outcome_kind, result_json, created_at)
          SELECT ?, ?, 'UpsertEffectiveDayOverride', ?, ?, 'success', ?, ?
          WHERE EXISTS (SELECT 1 FROM effective_day_overrides
            WHERE app_user_id = ? AND logical_date = ? AND override_kind = ? AND reason IS ? AND revision = 0)`)
          .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
            JSON.stringify(result), nowInstant, appUserId, request.logical_date, nextRow.override_kind, nextRow.reason),
      ]);
    if (mutation?.meta.changes !== 1 || operation?.meta.changes !== 1) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "UpsertEffectiveDayOverride", requestFingerprint);
      return persistRejection(db, { appUserId, operationId: request.operation_id,
        commandType: "UpsertEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The day override changed before it could be saved" } });
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "UpsertEffectiveDayOverride", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The override outcome is unknown; reload and retry", true);
  }
}

export async function deleteEffectiveDayOverride(
  db: D1Database,
  appUserId: string,
  input: DeleteEffectiveDayOverrideRequest,
  nowInstant = new Date().toISOString(),
): Promise<DeleteEffectiveDayOverrideResult> {
  const request = { ...input };
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "DeleteEffectiveDayOverride", requestFingerprint);
  const current = await db.prepare(`SELECT logical_date, override_kind, reason, revision, created_at, updated_at
    FROM effective_day_overrides WHERE app_user_id = ? AND logical_date = ?`)
    .bind(appUserId, request.logical_date).first<OverrideRow>();
  if (!current) {
    if (request.expected_revision !== null) {
      return persistRejection(db, { appUserId, operationId: request.operation_id,
        commandType: "DeleteEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The day override revision is stale" } });
    }
    return persistNoop(db, appUserId, request.operation_id, "DeleteEffectiveDayOverride", requestFingerprint,
      { classification: classify(request.logical_date, null) }, nowInstant);
  }
  if (request.expected_revision !== current.revision) {
    return persistRejection(db, { appUserId, operationId: request.operation_id,
      commandType: "DeleteEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
      result: { code: "revision_conflict", message: "The day override revision is stale" } });
  }
  const result: DeleteEffectiveDayOverrideResult = { classification: classify(request.logical_date, null) };
  try {
    const [mutation, operation] = await db.batch([
      db.prepare(`DELETE FROM effective_day_overrides
        WHERE app_user_id = ? AND logical_date = ? AND revision = ?`)
        .bind(appUserId, request.logical_date, current.revision),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'DeleteEffectiveDayOverride', ?, ?, 'success', ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM effective_day_overrides
          WHERE app_user_id = ? AND logical_date = ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, request.logical_date),
    ]);
    if (mutation?.meta.changes !== 1 || operation?.meta.changes !== 1) {
      const committed = await readOperation(db, appUserId, request.operation_id);
      if (committed) return replayOperation(committed, "DeleteEffectiveDayOverride", requestFingerprint);
      return persistRejection(db, { appUserId, operationId: request.operation_id,
        commandType: "DeleteEffectiveDayOverride", requestFingerprint, outcomeKind: "revision_conflict",
        result: { code: "revision_conflict", message: "The day override changed before it could be deleted" } });
    }
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "DeleteEffectiveDayOverride", requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The override outcome is unknown; reload and retry", true);
  }
}
