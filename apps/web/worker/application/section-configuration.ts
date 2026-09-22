import type {
  EstablishInitialSectionConfigurationRequest,
  EstablishInitialSectionConfigurationResult,
  SectionConfigurationProjection,
  UpdateSectionConfigurationRequest,
  UpdateSectionConfigurationResult,
} from "../../src/shared/contracts";
import { canonicalizeEntryOrder } from "../../src/shared/planned-entry-order";
import { resolveSectionIntervals, resolveTaskChuteDay, validateSectionConfiguration } from "../domain/taskchute-day";
import { isUuidV7 } from "../domain/uuidv7";
import { persistRejection, readOperation, replayOperation } from "../persistence/operations";
import { HttpError } from "./errors";
import { fingerprint, REQUEST_FINGERPRINT_VERSION } from "./fingerprint";

type SectionReconciliationPlan = {
  affectedDayIdsJson: string;
  dayPlansJson: string;
  contextPlansJson: string;
  entryPlansJson: string;
  entrySnapshotsJson: string;
  shiftOffset: number;
};

type ReconciliationDay = {
  id: string; logical_date: string; start_instant: string; end_instant: string;
  establishment_timezone: string; establishment_boundary_minutes: number; placement_revision: number;
};

type ReconciliationContext = {
  taskchute_day_id: string; section_id: string; configuration_version_id: string | null; title: string;
  logical_start_minute: number | null; logical_end_minute: number | null;
  actual_start_instant: string | null; actual_end_instant: string | null; context_order: number;
};

type ReconciliationEntry = {
  id: string; taskchute_day_id: string; section_id: string | null; position: number;
  lifecycle_state: "planned" | "running" | "completed"; planned_start_minute: number | null;
  first_started_at: string | null;
};

async function buildSectionReconciliationPlan(
  db: D1Database,
  appUserId: string,
  configurationVersionId: string,
  normalizedItems: UpdateSectionConfigurationRequest["items"],
  nowInstant: string,
): Promise<SectionReconciliationPlan> {
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  if (!settings) throw new Error("User Day settings are unavailable");
  const currentLogicalDate = resolveTaskChuteDay(nowInstant, {
    timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes,
  }).logicalDate;
  const days = (await db.prepare(`SELECT d.id, d.logical_date, d.start_instant, d.end_instant,
      d.establishment_timezone, d.establishment_boundary_minutes, d.placement_revision
    FROM taskchute_days d
    WHERE d.app_user_id = ? AND d.logical_date >= ?
      AND EXISTS (SELECT 1 FROM taskchute_day_section_contexts c
        WHERE c.app_user_id = d.app_user_id AND c.taskchute_day_id = d.id
          AND c.configuration_version_id IS NOT NULL)
    ORDER BY d.logical_date, d.id`).bind(appUserId, currentLogicalDate).all<ReconciliationDay>()).results;
  const affectedDayIdsJson = JSON.stringify(days.map((day) => day.id));
  const [contextResult, entryResult] = days.length === 0
    ? [{ results: [] as ReconciliationContext[] }, { results: [] as ReconciliationEntry[] }]
    : await db.batch([
      db.prepare(`SELECT taskchute_day_id, section_id, configuration_version_id, title,
          logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order
        FROM taskchute_day_section_contexts
        WHERE app_user_id = ? AND taskchute_day_id IN (SELECT value FROM json_each(?))
        ORDER BY taskchute_day_id, context_order, section_id`).bind(appUserId, affectedDayIdsJson),
      db.prepare(`SELECT e.id, e.taskchute_day_id, e.section_id, e.position, e.lifecycle_state,
          e.planned_start_minute,
          (SELECT MIN(x.started_at) FROM executions x
            WHERE x.app_user_id = e.app_user_id AND x.entry_id = e.id) AS first_started_at
        FROM entries e
        WHERE e.app_user_id = ? AND e.taskchute_day_id IN (SELECT value FROM json_each(?))
        ORDER BY e.taskchute_day_id, e.section_id, e.position, e.id`).bind(appUserId, affectedDayIdsJson),
    ]);
  const contexts = contextResult.results as ReconciliationContext[];
  const entries = entryResult.results as ReconciliationEntry[];
  const newSectionIds = new Set(normalizedItems.map((item) => item.section_id));
  const contextsByDay = new Map<string, ReconciliationContext[]>();
  const entriesByDay = new Map<string, ReconciliationEntry[]>();
  for (const context of contexts) contextsByDay.set(context.taskchute_day_id,
    [...(contextsByDay.get(context.taskchute_day_id) ?? []), context]);
  for (const entry of entries) entriesByDay.set(entry.taskchute_day_id,
    [...(entriesByDay.get(entry.taskchute_day_id) ?? []), entry]);
  const newSectionAt = (plannedStartMinute: number): string | null => {
    return normalizedItems.find((item) => item.logical_start_minute <= plannedStartMinute
      && plannedStartMinute < item.logical_end_minute)?.section_id ?? null;
  };
  const absorptionTarget = (oldSectionId: string, oldDayContexts: ReconciliationContext[]): string | null => {
    const oldIndex = oldDayContexts.findIndex((context) => context.section_id === oldSectionId);
    if (oldIndex < 0) return null;
    for (let index = oldIndex + 1; index < oldDayContexts.length; index += 1) {
      if (newSectionIds.has(oldDayContexts[index]!.section_id)) return oldDayContexts[index]!.section_id;
    }
    for (let index = oldIndex - 1; index >= 0; index -= 1) {
      if (newSectionIds.has(oldDayContexts[index]!.section_id)) return oldDayContexts[index]!.section_id;
    }
    return null;
  };
  const contextPlans: Array<Record<string, unknown>> = [];
  const entryPlans: Array<Record<string, unknown>> = [];
  for (const day of days) {
    const oldDayContexts = contextsByDay.get(day.id) ?? [];
    if (oldDayContexts.length === 0) throw new Error("An affected TaskChuteDay has no Section context");
    let intervals: Array<{ actualStartInstant: string; actualEndInstant: string }>;
    try {
      intervals = resolveSectionIntervals({ logicalDate: day.logical_date, timezone: day.establishment_timezone,
        startInstant: day.start_instant, endInstant: day.end_instant }, normalizedItems.map((item) => ({
          logicalStartMinute: item.logical_start_minute, logicalEndMinute: item.logical_end_minute,
        })));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Section interval resolution failed");
    }
    normalizedItems.forEach((item, index) => contextPlans.push({
      taskchute_day_id: day.id, section_id: item.section_id, configuration_version_id: configurationVersionId,
      title: item.title, logical_start_minute: item.logical_start_minute, logical_end_minute: item.logical_end_minute,
      actual_start_instant: intervals[index]!.actualStartInstant, actual_end_instant: intervals[index]!.actualEndInstant,
      context_order: index,
    }));
    const oldOrder = new Map(oldDayContexts.map((context) => [context.section_id, context.context_order]));
    const mapped = (entriesByDay.get(day.id) ?? []).map((entry) => {
      let targetSection = entry.section_id;
      if (entry.lifecycle_state === "planned") {
        targetSection = entry.planned_start_minute === null ? null : newSectionAt(entry.planned_start_minute);
        if (entry.planned_start_minute !== null && targetSection === null) {
          throw new Error("A planned Entry has no Section in the new configuration");
        }
      } else if (entry.section_id !== null && !newSectionIds.has(entry.section_id)) {
        targetSection = absorptionTarget(entry.section_id, oldDayContexts);
        if (targetSection === null) throw new Error("An execution Entry has no adjacent Section absorption target");
      }
      return { ...entry, targetSection,
        orderRank: (oldOrder.get(entry.section_id ?? "") ?? -1) * 1_000_000 + entry.position };
    });
    const bySection = new Map<string, typeof mapped>();
    for (const entry of mapped) bySection.set(entry.targetSection ?? "",
      [...(bySection.get(entry.targetSection ?? "") ?? []), entry]);
    for (const [sectionKey, sectionEntries] of bySection) {
      const ordered = canonicalizeEntryOrder(sectionEntries.map((entry) => ({ ...entry, position: entry.orderRank })));
      ordered.forEach((entry, index) => entryPlans.push({
        id: entry.id, taskchute_day_id: day.id, section_id: sectionKey === "" ? null : sectionKey,
        position: index + 1, lifecycle_state: entry.lifecycle_state, planned_start_minute: entry.planned_start_minute,
      }));
    }
  }
  return {
    affectedDayIdsJson,
    dayPlansJson: JSON.stringify(days.map((day) => ({ taskchute_day_id: day.id, placement_revision: day.placement_revision }))),
    contextPlansJson: JSON.stringify(contextPlans),
    entryPlansJson: JSON.stringify(entryPlans),
    entrySnapshotsJson: JSON.stringify(entries),
    shiftOffset: Math.max(0, ...entries.map((entry) => entry.position)) + entries.length + 1,
  };
}
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

  let reconciliation: SectionReconciliationPlan;
  try {
    reconciliation = await buildSectionReconciliationPlan(db, appUserId, request.configuration_version_id, normalizedItems, nowInstant);
  } catch (error) {
    return reject(error instanceof Error ? error.message : "Section reconciliation plan failed");
  }
  const itemsJson = JSON.stringify(normalizedItems.map((item, configurationOrder) => ({
    ...item, configuration_order: configurationOrder,
  })));
  const newSectionsJson = JSON.stringify(normalizedItems.filter((item) => !allIds.has(item.section_id)));
  const result = { configuration_version_id: request.configuration_version_id };
  const assertionId = `${request.operation_id}:section-configuration`;
  const gateId = `${assertionId}:gate`;
  try {
    await db.batch([
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        SELECT ?, ?, 1
        WHERE EXISTS (SELECT 1 FROM section_configuration_heads
          WHERE app_user_id = ? AND configuration_version_id = ?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) day
            LEFT JOIN taskchute_days d ON d.app_user_id = ? AND d.id = json_extract(day.value, '$.taskchute_day_id')
            WHERE d.id IS NULL OR d.placement_revision <> CAST(json_extract(day.value, '$.placement_revision') AS INTEGER))
          AND NOT EXISTS (SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = json_extract(snapshot.value, '$.taskchute_day_id')
              AND e.id = json_extract(snapshot.value, '$.id')
            WHERE e.id IS NULL OR e.section_id IS NOT json_extract(snapshot.value, '$.section_id')
              OR e.position <> CAST(json_extract(snapshot.value, '$.position') AS INTEGER)
              OR e.lifecycle_state <> json_extract(snapshot.value, '$.lifecycle_state')
              OR e.planned_start_minute IS NOT json_extract(snapshot.value, '$.planned_start_minute'))`)
        .bind(appUserId, gateId, appUserId, request.expected_configuration_version_id,
          reconciliation.dayPlansJson, appUserId, reconciliation.entrySnapshotsJson, appUserId),
      db.prepare(`INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
        SELECT json_extract(j.value, '$.section_id'), ?, json_extract(j.value, '$.title'),
          (SELECT COALESCE(MAX(sort_order), -1) FROM sections WHERE app_user_id = ?) + CAST(j.key AS INTEGER) + 1, ?
        FROM json_each(?) j
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, appUserId, nowInstant, newSectionsJson, appUserId, gateId),
      db.prepare(`UPDATE sections SET title = (
          SELECT json_extract(j.value, '$.title') FROM json_each(?) j
          WHERE json_extract(j.value, '$.section_id') = sections.id
        ) WHERE app_user_id = ? AND id IN (
          SELECT json_extract(j.value, '$.section_id') FROM json_each(?) j
        ) AND EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(itemsJson, appUserId, itemsJson, appUserId, gateId),
      db.prepare(`INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(request.configuration_version_id, appUserId, head.day_boundary_minutes, nowInstant, appUserId, gateId),
      db.prepare(`INSERT INTO section_configuration_items
        (app_user_id, configuration_version_id, section_id, title,
         logical_start_minute, logical_end_minute, configuration_order)
        SELECT ?, ?, json_extract(value, '$.section_id'), json_extract(value, '$.title'),
          CAST(json_extract(value, '$.logical_start_minute') AS INTEGER),
          CAST(json_extract(value, '$.logical_end_minute') AS INTEGER),
          CAST(json_extract(value, '$.configuration_order') AS INTEGER)
        FROM json_each(?)
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.configuration_version_id, itemsJson, appUserId, gateId),
      db.prepare(`UPDATE section_configuration_heads SET configuration_version_id = ?
        WHERE app_user_id = ? AND configuration_version_id = ?
          AND EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(request.configuration_version_id, appUserId, request.expected_configuration_version_id, appUserId, gateId),
      db.prepare(`UPDATE entries SET position = position + ?
        WHERE app_user_id = ? AND taskchute_day_id IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(reconciliation.shiftOffset, appUserId, reconciliation.affectedDayIdsJson, appUserId, gateId),
      db.prepare(`WITH plans(id, taskchute_day_id, section_id, position, planned_start_minute) AS (
          SELECT json_extract(value, '$.id'), json_extract(value, '$.taskchute_day_id'),
            json_extract(value, '$.section_id'), CAST(json_extract(value, '$.position') AS INTEGER),
            json_extract(value, '$.planned_start_minute') FROM json_each(?)
        ) UPDATE entries SET section_id = (SELECT section_id FROM plans WHERE plans.id = entries.id),
          position = (SELECT position FROM plans WHERE plans.id = entries.id),
          planned_start_minute = (SELECT planned_start_minute FROM plans WHERE plans.id = entries.id)
        WHERE app_user_id = ? AND id IN (SELECT id FROM plans)
          AND EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(reconciliation.entryPlansJson, appUserId, appUserId, gateId),
      db.prepare(`DELETE FROM taskchute_day_section_contexts
        WHERE app_user_id = ? AND taskchute_day_id IN (SELECT value FROM json_each(?))
          AND EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, reconciliation.affectedDayIdsJson, appUserId, gateId),
      db.prepare(`INSERT INTO taskchute_day_section_contexts
        (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
         logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
        SELECT ?, json_extract(value, '$.taskchute_day_id'), json_extract(value, '$.section_id'),
          json_extract(value, '$.configuration_version_id'), json_extract(value, '$.title'),
          CAST(json_extract(value, '$.logical_start_minute') AS INTEGER),
          CAST(json_extract(value, '$.logical_end_minute') AS INTEGER),
          json_extract(value, '$.actual_start_instant'), json_extract(value, '$.actual_end_instant'),
          CAST(json_extract(value, '$.context_order') AS INTEGER)
        FROM json_each(?)
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, reconciliation.contextPlansJson, appUserId, gateId),
      db.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id IN (SELECT json_extract(value, '$.taskchute_day_id') FROM json_each(?))
          AND EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, reconciliation.dayPlansJson, appUserId, gateId),
      db.prepare(`INSERT INTO transaction_assertions (app_user_id, id, ok)
        VALUES (?, ?, CASE WHEN
          EXISTS (SELECT 1 FROM section_configuration_heads
            WHERE app_user_id = ? AND configuration_version_id = ?)
          AND (SELECT COUNT(*) FROM section_configuration_items
            WHERE app_user_id = ? AND configuration_version_id = ?) = ?
          AND NOT EXISTS (SELECT 1 FROM json_each(?) day
            LEFT JOIN taskchute_days d ON d.app_user_id = ? AND d.id = json_extract(day.value, '$.taskchute_day_id')
            WHERE d.id IS NULL OR d.placement_revision <> CAST(json_extract(day.value, '$.placement_revision') AS INTEGER) + 1)
          AND (SELECT COUNT(*) FROM taskchute_day_section_contexts
            WHERE app_user_id = ? AND taskchute_day_id IN (SELECT json_extract(value, '$.taskchute_day_id') FROM json_each(?)))
            = json_array_length(?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) context
            LEFT JOIN taskchute_day_section_contexts c
              ON c.app_user_id = ? AND c.taskchute_day_id = json_extract(context.value, '$.taskchute_day_id')
              AND c.section_id = json_extract(context.value, '$.section_id')
            WHERE c.section_id IS NULL OR c.configuration_version_id IS NOT json_extract(context.value, '$.configuration_version_id')
              OR c.title IS NOT json_extract(context.value, '$.title')
              OR c.logical_start_minute IS NOT json_extract(context.value, '$.logical_start_minute')
              OR c.logical_end_minute IS NOT json_extract(context.value, '$.logical_end_minute')
              OR c.actual_start_instant IS NOT json_extract(context.value, '$.actual_start_instant')
              OR c.actual_end_instant IS NOT json_extract(context.value, '$.actual_end_instant')
              OR c.context_order <> CAST(json_extract(context.value, '$.context_order') AS INTEGER))
          AND (SELECT COUNT(*) FROM entries WHERE app_user_id = ?
            AND taskchute_day_id IN (SELECT value FROM json_each(?)))
            = json_array_length(?)
          AND NOT EXISTS (SELECT 1 FROM json_each(?) plan
            LEFT JOIN entries e ON e.app_user_id = ? AND e.taskchute_day_id = json_extract(plan.value, '$.taskchute_day_id')
              AND e.id = json_extract(plan.value, '$.id')
            WHERE e.id IS NULL OR e.section_id IS NOT json_extract(plan.value, '$.section_id')
              OR e.position <> CAST(json_extract(plan.value, '$.position') AS INTEGER)
              OR e.planned_start_minute IS NOT json_extract(plan.value, '$.planned_start_minute'))
          THEN 1 ELSE 0 END)`)
        .bind(appUserId, assertionId, appUserId, request.configuration_version_id,
          appUserId, request.configuration_version_id, normalizedItems.length,
          reconciliation.dayPlansJson, appUserId,
          appUserId, reconciliation.contextPlansJson, reconciliation.contextPlansJson,
          reconciliation.contextPlansJson, appUserId,
          appUserId, reconciliation.affectedDayIdsJson, reconciliation.entryPlansJson,
          reconciliation.entryPlansJson, appUserId),
      db.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at)
        SELECT ?, ?, 'UpdateSectionConfiguration', ?, ?, 'success', ?, ?
        WHERE EXISTS (SELECT 1 FROM transaction_assertions WHERE app_user_id = ? AND id = ? AND ok = 1)`)
        .bind(appUserId, request.operation_id, REQUEST_FINGERPRINT_VERSION, requestFingerprint,
          JSON.stringify(result), nowInstant, appUserId, assertionId),
      db.prepare("DELETE FROM transaction_assertions WHERE app_user_id = ? AND id IN (?, ?)")
        .bind(appUserId, gateId, assertionId),
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
