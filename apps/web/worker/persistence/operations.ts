import { HttpError } from "../application/errors";
import { REQUEST_FINGERPRINT_VERSION } from "../application/fingerprint";

export type CommandType = "CreateProject" | "AddTaskToDay" | "ReorderEntries" | "StartEntry" | "CompleteEntry"
  | "DuplicateEntry"
  | "BulkDeleteEntries"
  | "BulkMoveEntriesToDay"
  | "BulkMoveEntriesToSection"
  | "BulkMoveEntriesToSectionOccurrence"
  | "BulkMoveEntriesToSectionScoped"
  | "BulkSetEntriesEstimateScoped"
  | "EstablishInitialSectionConfiguration" | "MoveEntry" | "SetEntryEstimate" | "SetEntryPlannedStart"
  | "UpdateSectionConfiguration" | "ConvertEntryToRoutine" | "EndRoutine"
  | "SetRoutineEstimate" | "SetRoutineSectionPlan"
  | "CreateRoutine" | "SetRoutineEnabled" | "UpdateRoutine" | "ReorderRoutines" | "DeleteRoutine"
  | "SetExecutionTimes" | "UpdateTaskMetadata";
export type OutcomeKind = "success" | "domain_rejection" | "revision_conflict";

interface OperationRow {
  command_type: CommandType;
  request_fingerprint_version: number;
  request_fingerprint: string;
  outcome_kind: OutcomeKind;
  result_json: string;
}

export async function readOperation(
  db: D1Database,
  appUserId: string,
  operationId: string,
): Promise<OperationRow | null> {
  return db
    .prepare(
      `SELECT command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json
         FROM operations WHERE app_user_id = ? AND operation_id = ?`,
    )
    .bind(appUserId, operationId)
    .first<OperationRow>();
}

export function replayOperation<T>(row: OperationRow, commandType: CommandType, requestFingerprint: string): T {
  if (row.request_fingerprint_version !== REQUEST_FINGERPRINT_VERSION) {
    throw new HttpError(
      503,
      "operation_persistence_incompatible",
      "The stored operation fingerprint version is unsupported",
      true,
    );
  }
  if (row.command_type !== commandType || row.request_fingerprint !== requestFingerprint) {
    throw new HttpError(409, "operation_id_misuse", "operation_id was already used for a different semantic request");
  }
  if (row.outcome_kind === "revision_conflict") {
    const stored = JSON.parse(row.result_json) as { message?: string };
    throw new HttpError(409, "revision_conflict", stored.message ?? "The placement revision is stale", true);
  }
  if (row.outcome_kind === "domain_rejection") {
    const stored = JSON.parse(row.result_json) as { code: "resource_not_found" | "resource_conflict"; message: string };
    throw new HttpError(stored.code === "resource_not_found" ? 404 : 409, stored.code, stored.message, true);
  }
  return JSON.parse(row.result_json) as T;
}

export async function persistRejection<T>(
  db: D1Database,
  input: {
    appUserId: string;
    operationId: string;
    commandType: CommandType;
    requestFingerprint: string;
    outcomeKind: Exclude<OutcomeKind, "success">;
    result: object;
  },
): Promise<T> {
  try {
    await db
      .prepare(
        `INSERT INTO operations
          (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
           outcome_kind, result_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.appUserId,
        input.operationId,
        input.commandType,
        REQUEST_FINGERPRINT_VERSION,
        input.requestFingerprint,
        input.outcomeKind,
        JSON.stringify(input.result),
        new Date().toISOString(),
      )
      .run();
  } catch {
    const existing = await readOperation(db, input.appUserId, input.operationId);
    if (existing) return replayOperation<T>(existing, input.commandType, input.requestFingerprint);
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
  if (input.outcomeKind === "revision_conflict") {
    const result = input.result as { message?: string };
    throw new HttpError(409, "revision_conflict", result.message ?? "The placement revision is stale", true);
  }
  const result = input.result as { code: "resource_not_found" | "resource_conflict"; message: string };
  throw new HttpError(result.code === "resource_not_found" ? 404 : 409, result.code, result.message, true);
}
