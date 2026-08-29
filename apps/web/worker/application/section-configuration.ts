import type {
  EstablishInitialSectionConfigurationRequest,
  EstablishInitialSectionConfigurationResult,
  SectionConfigurationProjection,
  UpdateSectionConfigurationRequest,
  UpdateSectionConfigurationResult,
} from "../../src/shared/contracts";
import { resolveSectionIntervals, validateSectionConfiguration } from "../domain/taskchute-day";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

export function isUpdateSectionConfigurationRequest(
  value: unknown,
): value is UpdateSectionConfigurationRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return !('user_id' in body)
    && typeof body.operation_id === "string" && isUuidV7(body.operation_id)
    && typeof body.configuration_version_id === "string" && isUuidV7(body.configuration_version_id)
    && typeof body.expected_configuration_version_id === "string" && isUuidV7(body.expected_configuration_version_id)
    && body.configuration_version_id !== body.expected_configuration_version_id
    && Array.isArray(body.items) && body.items.length > 0
    && body.items.every((item) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.section_id === "string" && isUuidV7(candidate.section_id)
        && typeof candidate.title === "string"
        && Number.isInteger(candidate.logical_start_minute)
        && Number.isInteger(candidate.logical_end_minute);
    });
}

export async function loadSectionConfiguration(
  db: D1Database,
  appUserId: string,
): Promise<SectionConfigurationProjection> {
  const [head, items] = await db.batch([
    db.prepare(`SELECT h.configuration_version_id, v.day_boundary_minutes
      FROM section_configuration_heads h
      JOIN section_configuration_versions v
        ON v.app_user_id = h.app_user_id AND v.id = h.configuration_version_id
      WHERE h.app_user_id = ?`).bind(appUserId),
    db.prepare(`SELECT i.section_id, i.title, i.logical_start_minute, i.logical_end_minute
      FROM section_configuration_heads h
      JOIN section_configuration_items i
        ON i.app_user_id = h.app_user_id AND i.configuration_version_id = h.configuration_version_id
      WHERE h.app_user_id = ? ORDER BY i.configuration_order`).bind(appUserId),
  ]);
  const current = head.results[0] as {
    configuration_version_id: string; day_boundary_minutes: number;
  } | undefined;
  if (!current) throw new HttpError(404, "resource_not_found", "Section configuration is not established");
  return {
    ...current,
    items: items.results as SectionConfigurationProjection["items"],
  };
}

export async function updateSectionConfiguration(
  db: D1Database,
  appUserId: string,
  request: UpdateSectionConfigurationRequest,
  nowInstant = new Date().toISOString(),
): Promise<UpdateSectionConfigurationResult> {
  const requestFingerprint = await fingerprint(request);
  const prior = await readOperation(db, appUserId, request.operation_id);
  if (prior) return replayOperation(prior, "UpdateSectionConfiguration", requestFingerprint);
  const reject = (message: string) => persistRejection<UpdateSectionConfigurationResult>(db, {
    appUserId, operationId: request.operation_id, commandType: "UpdateSectionConfiguration",
    requestFingerprint, outcomeKind: "domain_rejection", result: { code: "resource_conflict", message },
  });
  const conflict = () => persistRejection<UpdateSectionConfigurationResult>(db, {
    appUserId, operationId: request.operation_id, commandType: "UpdateSectionConfiguration",
    requestFingerprint, outcomeKind: "revision_conflict",
    result: { code: "revision_conflict", message: "The Section configuration version is stale" },
  });
  const candidateItemsJson = JSON.stringify(request.items);
  const [headResult, versionsResult, sectionsResult, activeResult] = await db.batch([
    db.prepare(`SELECT h.configuration_version_id, v.day_boundary_minutes
      FROM section_configuration_heads h JOIN section_configuration_versions v
        ON v.app_user_id = h.app_user_id AND v.id = h.configuration_version_id
      WHERE h.app_user_id = ?`).bind(appUserId),
    db.prepare("SELECT id FROM section_configuration_versions WHERE id = ?").bind(request.configuration_version_id),
    db.prepare(`SELECT id, app_user_id FROM sections WHERE id IN (
      SELECT json_extract(value, '$.section_id') FROM json_each(?))`).bind(candidateItemsJson),
    db.prepare(`SELECT i.section_id FROM section_configuration_heads h
      JOIN section_configuration_items i
        ON i.app_user_id = h.app_user_id AND i.configuration_version_id = h.configuration_version_id
      WHERE h.app_user_id = ?`).bind(appUserId),
  ]);
  const head = headResult.results[0] as {
    configuration_version_id: string; day_boundary_minutes: number;
  } | undefined;
  if (!head) return reject("Section configuration is not established");
  if (head.configuration_version_id !== request.expected_configuration_version_id) return conflict();
  if (versionsResult.results.length > 0) return reject("configuration_version_id already exists");
  if (new Set(request.items.map((item) => item.section_id)).size !== request.items.length) {
    return reject("Each Section must appear exactly once");
  }
  const normalizedItems = request.items.map((item) => ({ ...item, title: item.title.trim() }));
  if (normalizedItems.some((item) => item.title.length < 1 || item.title.length > 100)) {
    return reject("Section titles must contain 1 to 100 characters after trimming");
  }
  if (!validateSectionConfiguration(head.day_boundary_minutes, normalizedItems.map((item) => ({
    logicalStartMinute: item.logical_start_minute,
    logicalEndMinute: item.logical_end_minute,
  })))) return reject("Section ranges must cover the whole TaskChuteDay without gaps or overlaps");
  const candidateSections = sectionsResult.results as Array<{ id: string; app_user_id: string }>;
  if (candidateSections.some((row) => row.app_user_id !== appUserId)) {
    return reject("A Section identity is unavailable");
  }
  const allIds = new Set(candidateSections.map((row) => row.id));
  const activeIds = new Set((activeResult.results as Array<{ section_id: string }>).map((row) => row.section_id));
  if (normalizedItems.some((item) => allIds.has(item.section_id) && !activeIds.has(item.section_id))) {
    return reject("An inactive stable Section cannot be restored");
  }

  const itemsJson = JSON.stringify(normalizedItems.map((item, configurationOrder) => ({
    ...item, configuration_order: configurationOrder,
  })));
  const newSectionsJson = JSON.stringify(normalizedItems.filter((item) => !allIds.has(item.section_id)));
  const result = { configuration_version_id: request.configuration_version_id };
  const assertionId = `${request.operation_id}:section-configuration`;
  try {
    await db.batch([
      db.prepare(`INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
        SELECT json_extract(j.value, '$.section_id'), ?, json_extract(j.value, '$.title'),
          (SELECT COALESCE(MAX(sort_order), -1) FROM sections WHERE app_user_id = ?) + CAST(j.key AS INTEGER) + 1, ?
        FROM json_each(?) j
        WHERE EXISTS (SELECT 1 FROM section_configuration_heads
          WHERE app_user_id = ? AND configuration_version_id = ?)`)
        .bind(appUserId, appUserId, nowInstant, newSectionsJson, appUserId, request.expected_configuration_version_id),
      db.prepare(`UPDATE sections SET title = (
          SELECT json_extract(j.value, '$.title') FROM json_each(?) j
          WHERE json_extract(j.value, '$.section_id') = sections.id
        ) WHERE app_user_id = ? AND id IN (
          SELECT json_extract(j.value, '$.section_id') FROM json_each(?) j
        ) AND EXISTS (SELECT 1 FROM section_configuration_heads
          WHERE app_user_id = ? AND configuration_version_id = ?)`)
        .bind(itemsJson, appUserId, itemsJson, appUserId, request.expected_configuration_version_id),
      db.prepare(`INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM section_configuration_heads
          WHERE app_user_id = ? AND configuration_version_id = ?)`)
        .bind(request.configuration_version_id, appUserId, head.day_boundary_minutes, nowInstant,
          appUserId, request.expected_configuration_version_id),
      db.prepare(`INSERT INTO section_configuration_items
        (app_user_id, configuration_version_id, section_id, title,
         logical_start_minute, logical_end_minute, configuration_order)
        SELECT ?, ?, json_extract(value, '$.section_id'), json_extract(value, '$.title'),
          CAST(json_extract(value, '$.logical_start_minute') AS INTEGER),
          CAST(json_extract(value, '$.logical_end_minute') AS INTEGER),
          CAST(json_extract(value, '$.configuration_order') AS INTEGER)
        FROM json_each(?) WHERE EXISTS (SELECT 1 FROM section_configuration_heads
          WHERE app_user_id = ? AND configuration_version_id = ?)`)
        .bind(appUserId, request.configuration_version_id, itemsJson,
          appUserId, request.expected_configuration_version_id),
      db.prepare(`UPDATE section_configuration_heads SET configuration_version_id = ?
        WHERE app_user_id = ? AND configuration_version_id = ?`)
        .bind(request.configuration_version_id, appUserId, request.expected_configuration_version_id),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, CASE WHEN
          (SELECT configuration_version_id FROM section_configuration_heads WHERE app_user_id = ?) = ?
          AND (SELECT COUNT(*) FROM section_configuration_items
            WHERE app_user_id = ? AND configuration_version_id = ?) = ?
          THEN 1 ELSE 0 END`)
        .bind(appUserId, assertionId, appUserId, request.configuration_version_id,
          appUserId, request.configuration_version_id, normalizedItems.length),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'UpdateSectionConfiguration', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, assertionId),
    ]);
    return result;
  } catch {
    const committed = await readOperation(db, appUserId, request.operation_id);
    if (committed) return replayOperation(committed, "UpdateSectionConfiguration", requestFingerprint);
    const current = await db.prepare("SELECT configuration_version_id FROM section_configuration_heads WHERE app_user_id = ?")
      .bind(appUserId).first<{ configuration_version_id: string }>();
    if (current?.configuration_version_id !== request.expected_configuration_version_id) return conflict();
    throw new HttpError(503, "infrastructure_ambiguous", "The outcome is unknown; reload canonical state and retry", true);
  }
}

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
