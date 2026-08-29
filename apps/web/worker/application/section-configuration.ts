import type {
  EstablishInitialSectionConfigurationRequest,
  EstablishInitialSectionConfigurationResult,
} from "../../src/shared/contracts";
import { resolveSectionIntervals, validateSectionConfiguration } from "../domain/taskchute-day";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isEstablishInitialSectionConfigurationRequest(
  value: unknown,
): value is EstablishInitialSectionConfigurationRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.configuration_version_id === "string" && isUuidV7(body.configuration_version_id)
    && typeof body.taskchute_day_id === "string" && isUuidV7(body.taskchute_day_id)
    && Array.isArray(body.items) && body.items.length > 0
    && body.items.every((item) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.section_id === "string" && isUuidV7(candidate.section_id)
        && Number.isInteger(candidate.logical_start_minute)
        && Number.isInteger(candidate.logical_end_minute);
    });
}

export async function establishInitialSectionConfiguration(
  db: D1Database,
  appUserId: string,
  request: EstablishInitialSectionConfigurationRequest,
  nowInstant = new Date().toISOString(),
): Promise<EstablishInitialSectionConfigurationResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "EstablishInitialSectionConfiguration", requestFingerprint);
  const reject = (message: string) => persistRejection<EstablishInitialSectionConfigurationResult>(db, {
    appUserId, operationId: request.operation_id, commandType: "EstablishInitialSectionConfiguration",
    requestFingerprint, outcomeKind: "domain_rejection", result: { code: "resource_conflict", message },
  });
  const [dayResult, sectionsResult, versionResult, contextResult] = await db.batch([
    db.prepare(`SELECT id, logical_date, start_instant, end_instant, establishment_timezone,
      establishment_boundary_minutes FROM taskchute_days WHERE app_user_id = ? AND id = ?`)
      .bind(appUserId, request.taskchute_day_id),
    db.prepare("SELECT id, title FROM sections WHERE app_user_id = ? ORDER BY sort_order, id").bind(appUserId),
    db.prepare("SELECT id FROM section_configuration_versions WHERE app_user_id = ? LIMIT 1").bind(appUserId),
    db.prepare(`SELECT section_id, configuration_version_id, logical_start_minute, logical_end_minute,
      actual_start_instant, actual_end_instant FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order, section_id`)
      .bind(appUserId, request.taskchute_day_id),
  ]);
  const day = dayResult.results[0] as {
    id: string; logical_date: string; start_instant: string; end_instant: string;
    establishment_timezone: string; establishment_boundary_minutes: number;
  } | undefined;
  if (!day) return reject("TaskChuteDay is unavailable");
  if (versionResult.results.length > 0) return reject("Initial Section configuration is already established");
  const commandInstant = Date.parse(nowInstant);
  const dayStart = Date.parse(day.start_instant);
  const dayEnd = Date.parse(day.end_instant);
  if (!Number.isFinite(commandInstant) || !Number.isFinite(dayStart) || !Number.isFinite(dayEnd)
    || commandInstant < dayStart || commandInstant >= dayEnd) {
    return reject("Initial Section configuration can only target the current TaskChuteDay");
  }
  const sections = sectionsResult.results as Array<{ id: string; title: string }>;
  const contexts = contextResult.results as Array<{
    section_id: string; configuration_version_id: string | null;
    logical_start_minute: number | null; logical_end_minute: number | null;
    actual_start_instant: string | null; actual_end_instant: string | null;
  }>;
  const sectionIds = new Set(sections.map((section) => section.id));
  if (contexts.length !== sections.length
    || contexts.some((context) => !sectionIds.has(context.section_id)
      || context.configuration_version_id !== null
      || context.logical_start_minute !== null || context.logical_end_minute !== null
      || context.actual_start_instant !== null || context.actual_end_instant !== null)) {
    return reject("Current TaskChuteDay is not in the initial unknown Section configuration state");
  }
  if (sections.length !== request.items.length
    || new Set(request.items.map((item) => item.section_id)).size !== sections.length
    || !sections.every((section) => request.items.some((item) => item.section_id === section.id))) {
    return reject("Configuration must contain every stable Section exactly once");
  }
  if (!validateSectionConfiguration(day.establishment_boundary_minutes, request.items.map((item) => ({
    logicalStartMinute: item.logical_start_minute,
    logicalEndMinute: item.logical_end_minute,
  })))) return reject("Section ranges must cover the whole TaskChuteDay without gaps or overlaps");

  let intervals: Array<{ actualStartInstant: string; actualEndInstant: string }>;
  try {
    intervals = resolveSectionIntervals({
      logicalDate: day.logical_date,
      timezone: day.establishment_timezone,
      startInstant: day.start_instant,
      endInstant: day.end_instant,
    }, request.items.map((item) => ({ logicalStartMinute: item.logical_start_minute, logicalEndMinute: item.logical_end_minute })));
  } catch (error) {
    return reject(error instanceof Error ? error.message : "Section interval resolution failed");
  }
  const result = { configuration_version_id: request.configuration_version_id, taskchute_day_id: day.id };
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const itemsJson = JSON.stringify(request.items.map((item, index) => ({
    section_id: item.section_id,
    title: sectionById.get(item.section_id)?.title,
    logical_start_minute: item.logical_start_minute,
    logical_end_minute: item.logical_end_minute,
    actual_start_instant: intervals[index]?.actualStartInstant,
    actual_end_instant: intervals[index]?.actualEndInstant,
    configuration_order: index,
  })));
  const now = nowInstant;
  try {
    await db.batch([
      db.prepare(`INSERT INTO section_configuration_versions
        (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, ?, ?)`)
        .bind(request.configuration_version_id, appUserId, day.establishment_boundary_minutes, now),
      db.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
        .bind(appUserId, request.configuration_version_id),
      db.prepare(`INSERT INTO section_configuration_items
        (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
        SELECT ?, ?, json_extract(value, '$.section_id'), json_extract(value, '$.title'),
          CAST(json_extract(value, '$.logical_start_minute') AS INTEGER),
          CAST(json_extract(value, '$.logical_end_minute') AS INTEGER),
          CAST(json_extract(value, '$.configuration_order') AS INTEGER)
        FROM json_each(?)`)
        .bind(appUserId, request.configuration_version_id, itemsJson),
      db.prepare("DELETE FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ?")
        .bind(appUserId, day.id),
      db.prepare(`INSERT INTO taskchute_day_section_contexts
        (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
         logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
        SELECT ?, ?, json_extract(value, '$.section_id'), ?, json_extract(value, '$.title'),
          CAST(json_extract(value, '$.logical_start_minute') AS INTEGER),
          CAST(json_extract(value, '$.logical_end_minute') AS INTEGER),
          json_extract(value, '$.actual_start_instant'), json_extract(value, '$.actual_end_instant'),
          CAST(json_extract(value, '$.configuration_order') AS INTEGER)
        FROM json_each(?)`)
        .bind(appUserId, day.id, request.configuration_version_id, itemsJson),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at) VALUES (?, ?, 'EstablishInitialSectionConfiguration', ?, ?, 'success', ?, ?)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint, JSON.stringify(result), now),
    ]);
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "EstablishInitialSectionConfiguration", requestFingerprint);
    const established = await db.prepare("SELECT configuration_version_id FROM section_configuration_heads WHERE app_user_id = ?")
      .bind(appUserId).first();
    if (established) return reject("Initial Section configuration is already established");
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}
