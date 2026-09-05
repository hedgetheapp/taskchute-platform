import type {
  CurrentTaskChuteDayProjection,
  EstablishedTaskChuteDayProjection,
  EntryProjection,
  ExecutionProjection,
  SectionProjection,
} from "../../src/shared/contracts";
import { canonicalizeEntryOrder } from "../../src/shared/planned-entry-order";
import {
  isLogicalDate,
  resolveSectionIntervals,
  resolveTaskChuteDay,
  resolveTaskChuteDayForLogicalDate,
} from "../domain/taskchute-day";
import { uuidv7 } from "../domain/uuidv7";
import { ensureCurrentDayRoutineEntries } from "./routine";

export interface SettingsRow {
  timezone: string;
  day_boundary_minutes: number;
}

export interface DayRow {
  id: string;
  logical_date: string;
  start_instant: string;
  end_instant: string;
  establishment_timezone: string;
  establishment_boundary_minutes: number;
  placement_revision: number;
}

interface SectionRow {
  id: string;
  title: string;
  logical_start_minute: number | null;
  logical_end_minute: number | null;
  actual_start_instant: string | null;
  actual_end_instant: string | null;
  context_order: number;
}

export interface DaySectionContextRow {
  section_id: string;
  configuration_version_id: string | null;
  title: string;
  logical_start_minute: number | null;
  logical_end_minute: number | null;
  actual_start_instant: string | null;
  actual_end_instant: string | null;
  context_order: number;
}

interface EntryRow {
  entry_id: string;
  section_id: string | null;
  position: number;
  lifecycle_state: "planned" | "running" | "completed";
  task_id: string;
  task_title: string;
  project_id: string | null;
  project_title: string | null;
  estimate_seconds: number | null;
  planned_start_minute: number | null;
  routine_occurrence_id: string | null;
  routine_definition_id: string | null;
  routine_end_logical_date: string | null;
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  section_plan_override_present: number | null;
  default_estimate_seconds: number | null;
  estimate_override_present: number | null;
  defaults_revision: number | null;
  execution_first_started_at: string | null;
  execution_last_ended_at: string | null;
  execution_completed_duration_seconds: number | null;
  execution_active_started_at: string | null;
  execution_single_id: string | null;
  execution_active_id: string | null;
}

interface ExecutionRow {
  id: string;
  entry_id: string;
  entry_estimate_seconds: number | null;
  started_at: string;
  ended_at: string | null;
}

function persistenceRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid persistence row");
  return value as Record<string, unknown>;
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") throw new Error(`Invalid persistence row: ${field}`);
  return value;
}

function requiredNumber(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== "number") throw new Error(`Invalid persistence row: ${field}`);
  return value;
}

function toSectionRow(value: unknown): SectionRow {
  const row = persistenceRecord(value);
  const optionalNumber = (field: string) => row[field] === null ? null : requiredNumber(row, field);
  const optionalString = (field: string) => row[field] === null ? null : requiredString(row, field);
  return { id: requiredString(row, "id"), title: requiredString(row, "title"),
    logical_start_minute: optionalNumber("logical_start_minute"), logical_end_minute: optionalNumber("logical_end_minute"),
    actual_start_instant: optionalString("actual_start_instant"), actual_end_instant: optionalString("actual_end_instant"),
    context_order: requiredNumber(row, "context_order") };
}

function toEntryRow(value: unknown): EntryRow {
  const row = persistenceRecord(value);
  const lifecycle = requiredString(row, "lifecycle_state");
  if (lifecycle !== "planned" && lifecycle !== "running" && lifecycle !== "completed") {
    throw new Error("Invalid persistence row: lifecycle_state");
  }
  const projectId = row.project_id;
  const projectTitle = row.project_title;
  if (projectId !== null && typeof projectId !== "string") throw new Error("Invalid persistence row: project_id");
  if (projectTitle !== null && typeof projectTitle !== "string") throw new Error("Invalid persistence row: project_title");
  return {
    entry_id: requiredString(row, "entry_id"),
    section_id: row.section_id === null ? null : requiredString(row, "section_id"),
    position: requiredNumber(row, "position"),
    lifecycle_state: lifecycle,
    task_id: requiredString(row, "task_id"),
    task_title: requiredString(row, "task_title"),
    project_id: projectId,
    project_title: projectTitle,
    estimate_seconds: row.estimate_seconds === null ? null : requiredNumber(row, "estimate_seconds"),
    planned_start_minute: row.planned_start_minute === null ? null : requiredNumber(row, "planned_start_minute"),
    routine_occurrence_id: row.routine_occurrence_id === null ? null : requiredString(row, "routine_occurrence_id"),
    routine_definition_id: row.routine_definition_id === null ? null : requiredString(row, "routine_definition_id"),
    routine_end_logical_date: row.routine_end_logical_date === null ? null : requiredString(row, "routine_end_logical_date"),
    default_section_id: row.default_section_id === null ? null : requiredString(row, "default_section_id"),
    default_planned_start_minute: row.default_planned_start_minute === null ? null : requiredNumber(row, "default_planned_start_minute"),
    section_plan_override_present: row.section_plan_override_present === null ? null : requiredNumber(row, "section_plan_override_present"),
    default_estimate_seconds: row.default_estimate_seconds === null ? null : requiredNumber(row, "default_estimate_seconds"),
    estimate_override_present: row.estimate_override_present === null ? null : requiredNumber(row, "estimate_override_present"),
    defaults_revision: row.defaults_revision === null ? null : requiredNumber(row, "defaults_revision"),
    execution_first_started_at: row.execution_first_started_at === null ? null : requiredString(row, "execution_first_started_at"),
    execution_last_ended_at: row.execution_last_ended_at === null ? null : requiredString(row, "execution_last_ended_at"),
    execution_completed_duration_seconds: row.execution_completed_duration_seconds === null ? null : requiredNumber(row, "execution_completed_duration_seconds"),
    execution_active_started_at: row.execution_active_started_at === null ? null : requiredString(row, "execution_active_started_at"),
    execution_single_id: row.execution_single_id === null ? null : requiredString(row, "execution_single_id"),
    execution_active_id: row.execution_active_id === null ? null : requiredString(row, "execution_active_id"),
  };
}

export async function readDaySectionContexts(db: D1Database, appUserId: string, dayId: string): Promise<DaySectionContextRow[]> {
  const result = await db.prepare(`SELECT section_id, configuration_version_id, title, logical_start_minute,
    logical_end_minute, actual_start_instant, actual_end_instant, context_order
    FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ?
    ORDER BY context_order, section_id`).bind(appUserId, dayId).all<DaySectionContextRow>();
  return result.results;
}

export async function expectedLegacyContexts(db: D1Database, appUserId: string): Promise<DaySectionContextRow[]> {
  const result = await db.prepare(`SELECT id AS section_id, NULL AS configuration_version_id, title,
    NULL AS logical_start_minute, NULL AS logical_end_minute, NULL AS actual_start_instant,
    NULL AS actual_end_instant, sort_order AS context_order FROM sections
    WHERE app_user_id = ? ORDER BY sort_order, id`).bind(appUserId).all<DaySectionContextRow>();
  return result.results;
}

export async function configuredDefinitionContexts(
  db: D1Database,
  appUserId: string,
  versionId: string,
): Promise<DaySectionContextRow[]> {
  const items = await db.prepare(`SELECT section_id, title, logical_start_minute, logical_end_minute, configuration_order
    FROM section_configuration_items WHERE app_user_id = ? AND configuration_version_id = ? ORDER BY configuration_order`)
    .bind(appUserId, versionId).all<{ section_id: string; title: string; logical_start_minute: number; logical_end_minute: number; configuration_order: number }>();
  return items.results.map((item) => ({
    section_id: item.section_id,
    configuration_version_id: versionId,
    title: item.title,
    logical_start_minute: item.logical_start_minute,
    logical_end_minute: item.logical_end_minute,
    actual_start_instant: null,
    actual_end_instant: null,
    context_order: item.configuration_order,
  }));
}

export async function expectedConfiguredContexts(
  db: D1Database,
  appUserId: string,
  day: DayRow,
  versionId: string,
): Promise<DaySectionContextRow[]> {
  const expected = await configuredDefinitionContexts(db, appUserId, versionId);
  const intervals = resolveSectionIntervals({ logicalDate: day.logical_date, timezone: day.establishment_timezone,
    startInstant: day.start_instant, endInstant: day.end_instant }, expected.map((item) => ({
      logicalStartMinute: item.logical_start_minute!, logicalEndMinute: item.logical_end_minute!,
    })));
  return expected.map((item, index) => ({ ...item,
    actual_start_instant: intervals[index]?.actualStartInstant ?? null,
    actual_end_instant: intervals[index]?.actualEndInstant ?? null,
  }));
}

function assertMaterializedContext(actual: DaySectionContextRow[], expected: DaySectionContextRow[]): void {
  const fields: Array<keyof DaySectionContextRow> = ["section_id", "configuration_version_id", "title",
    "logical_start_minute", "logical_end_minute", "context_order"];
  if (actual.length !== expected.length || actual.some((row, index) => {
    const expectedRow = expected[index];
    return !expectedRow || fields.some((field) => row[field] !== expectedRow[field]);
  })) throw new Error("TaskChuteDay Section context is incomplete or inconsistent");
}

export function assertEstablishedContext(day: DayRow, context: DaySectionContextRow[]): void {
  const versionIds = new Set(context.map((row) => row.configuration_version_id));
  if (versionIds.size !== 1) throw new Error("TaskChuteDay Section context mixes configuration versions");
  const versionId = context[0]?.configuration_version_id ?? null;
  if (versionId === null) {
    if (context.some((row) => row.logical_start_minute !== null || row.logical_end_minute !== null
      || row.actual_start_instant !== null || row.actual_end_instant !== null)) {
      throw new Error("Legacy TaskChuteDay Section context must keep time ranges unknown");
    }
    return;
  }
  if (context.some((row) => row.logical_start_minute === null || row.logical_end_minute === null
    || row.actual_start_instant === null || row.actual_end_instant === null)) {
    throw new Error("Configured TaskChuteDay Section context has missing intervals");
  }
  if (context[0]?.actual_start_instant !== day.start_instant
    || context.at(-1)?.actual_end_instant !== day.end_instant
    || context.some((row, index) => {
      const start = Date.parse(row.actual_start_instant!);
      const end = Date.parse(row.actual_end_instant!);
      const next = context[index + 1];
      return !Number.isFinite(start) || !Number.isFinite(end) || start >= end
        || (next !== undefined && row.actual_end_instant !== next.actual_start_instant);
    })) throw new Error("Configured TaskChuteDay Section context actual intervals are inconsistent");
}

async function ensureDaySectionContext(db: D1Database, appUserId: string, day: DayRow): Promise<void> {
  const existing = await readDaySectionContexts(db, appUserId, day.id);
  if (existing.length > 0) {
    assertEstablishedContext(day, existing);
    const versionId = existing[0]?.configuration_version_id ?? null;
    if (versionId !== null) {
      const expected = await configuredDefinitionContexts(db, appUserId, versionId);
      assertMaterializedContext(existing, expected);
    }
    return;
  }
  const version = await db.prepare(`SELECT v.id FROM section_configuration_heads h
    JOIN section_configuration_versions v ON v.app_user_id = h.app_user_id AND v.id = h.configuration_version_id
    WHERE h.app_user_id = ? AND v.day_boundary_minutes = ?`)
    .bind(appUserId, day.establishment_boundary_minutes).first<{ id: string }>();
  const expected = version
    ? await expectedConfiguredContexts(db, appUserId, day, version.id)
    : await expectedLegacyContexts(db, appUserId);
  if (expected.length > 0) {
    const expectedJson = JSON.stringify(expected);
    await db.batch([db.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute,
       logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      SELECT ?, ?, json_extract(value, '$.section_id'), json_extract(value, '$.configuration_version_id'),
        json_extract(value, '$.title'), json_extract(value, '$.logical_start_minute'),
        json_extract(value, '$.logical_end_minute'), json_extract(value, '$.actual_start_instant'),
        json_extract(value, '$.actual_end_instant'), CAST(json_extract(value, '$.context_order') AS INTEGER)
      FROM json_each(?) WHERE true
      ON CONFLICT (app_user_id, taskchute_day_id, section_id) DO NOTHING`)
      .bind(appUserId, day.id, expectedJson)]);
  }
  const materialized = await readDaySectionContexts(db, appUserId, day.id);
  assertMaterializedContext(materialized, expected);
  assertEstablishedContext(day, materialized);
}

export async function materializeCurrentDay(db: D1Database, appUserId: string, nowInstant: string): Promise<DayRow> {
  const settings = await db
    .prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId)
    .first<SettingsRow>();
  if (!settings) throw new Error("Provisioned user has no TaskChuteDay settings");
  const resolved = resolveTaskChuteDay(nowInstant, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  });
  const existing = await db
    .prepare(
      `SELECT id, logical_date, start_instant, end_instant, establishment_timezone,
              establishment_boundary_minutes, placement_revision
         FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?`,
    )
    .bind(appUserId, resolved.logicalDate)
    .first<DayRow>();
  if (existing) {
    await ensureDaySectionContext(db, appUserId, existing);
    return existing;
  }

  await db
    .prepare(
      `INSERT INTO taskchute_days
        (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
         establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'compatible', 0, ?)
       ON CONFLICT (app_user_id, logical_date) DO NOTHING`,
    )
    .bind(
      uuidv7(),
      appUserId,
      resolved.logicalDate,
      resolved.startInstant,
      resolved.endInstant,
      resolved.timezone,
      resolved.boundaryMinutes,
      nowInstant,
    )
    .run();
  const converged = await db
    .prepare(
      `SELECT id, logical_date, start_instant, end_instant, establishment_timezone,
              establishment_boundary_minutes, placement_revision
         FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?`,
    )
    .bind(appUserId, resolved.logicalDate)
    .first<DayRow>();
  if (!converged) throw new Error("TaskChuteDay materialization did not converge");
  await ensureDaySectionContext(db, appUserId, converged);
  return converged;
}

async function loadEstablishedProjection(
  db: D1Database,
  appUserId: string,
  day: DayRow,
  includeActiveExecution: boolean,
  planningEnabled: boolean,
  projectionGeneratedAt: string,
): Promise<EstablishedTaskChuteDayProjection> {
  const context = await readDaySectionContexts(db, appUserId, day.id);
  assertEstablishedContext(day, context);
  const [sectionResult, entryResult, executionResult, entryExecutionResult] = await db.batch([
    db.prepare(`SELECT section_id AS id, title, logical_start_minute, logical_end_minute,
      actual_start_instant, actual_end_instant, context_order
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order, section_id`)
      .bind(appUserId, day.id),
    db
      .prepare(
        `SELECT e.id AS entry_id, e.section_id, e.position, e.lifecycle_state, e.estimate_seconds, e.planned_start_minute,
                e.routine_occurrence_id, ro.routine_definition_id,
                rd.end_logical_date AS routine_end_logical_date,
                rd.default_section_id, rd.default_planned_start_minute, rd.default_estimate_seconds,
                rd.defaults_revision, ro.section_plan_override_present, ro.estimate_override_present,
                execution_summary.first_started_at AS execution_first_started_at,
                execution_summary.last_ended_at AS execution_last_ended_at,
                COALESCE(execution_summary.completed_duration_seconds, 0) AS execution_completed_duration_seconds,
                execution_summary.active_started_at AS execution_active_started_at,
                execution_summary.single_execution_id AS execution_single_id,
                execution_summary.active_execution_id AS execution_active_id,
                t.id AS task_id,
                CASE WHEN rs.routine_occurrence_id IS NOT NULL THEN rs.task_title ELSE t.title END AS task_title,
                CASE WHEN rs.routine_occurrence_id IS NOT NULL THEN rs.project_id
                     WHEN eps.entry_id IS NOT NULL THEN eps.project_id ELSE p.id END AS project_id,
                CASE WHEN rs.routine_occurrence_id IS NOT NULL THEN rs.project_title
                     WHEN eps.entry_id IS NOT NULL THEN eps.project_title ELSE p.title END AS project_title
           FROM entries e
           JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
           LEFT JOIN routine_occurrences ro ON ro.app_user_id = e.app_user_id AND ro.id = e.routine_occurrence_id
           LEFT JOIN routine_definitions rd ON rd.app_user_id = ro.app_user_id AND rd.id = ro.routine_definition_id
           LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
           LEFT JOIN routine_occurrence_task_snapshots rs
             ON rs.app_user_id = e.app_user_id AND rs.routine_occurrence_id = e.routine_occurrence_id
           LEFT JOIN entry_project_snapshots eps
             ON eps.app_user_id = e.app_user_id AND eps.entry_id = e.id
           LEFT JOIN (
             SELECT entry_id,
                    MIN(started_at) AS first_started_at,
                    MAX(CASE WHEN ended_at IS NOT NULL THEN ended_at END) AS last_ended_at,
                    SUM(CASE WHEN ended_at IS NOT NULL THEN unixepoch(ended_at) - unixepoch(started_at) ELSE 0 END)
                      AS completed_duration_seconds,
                    MAX(CASE WHEN ended_at IS NULL THEN started_at END) AS active_started_at,
                    CASE WHEN COUNT(*) = 1 THEN MIN(id) ELSE NULL END AS single_execution_id,
                    MAX(CASE WHEN ended_at IS NULL THEN id END) AS active_execution_id
               FROM executions
              WHERE app_user_id = ?
              GROUP BY entry_id
           ) execution_summary ON execution_summary.entry_id = e.id
          WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
            AND NOT EXISTS (SELECT 1 FROM routine_occurrence_suppressions x
              WHERE x.app_user_id = e.app_user_id AND x.routine_occurrence_id = e.routine_occurrence_id)
          ORDER BY e.section_id, e.position, e.id`,
      )
      .bind(appUserId, appUserId, day.id),
    includeActiveExecution
      ? db.prepare(`SELECT x.id, x.entry_id, e.estimate_seconds AS entry_estimate_seconds, x.started_at, x.ended_at
          FROM executions x JOIN entries e ON e.app_user_id = x.app_user_id AND e.id = x.entry_id
          WHERE x.app_user_id = ? AND x.ended_at IS NULL LIMIT 1`).bind(appUserId)
      : db.prepare(`SELECT NULL AS id, NULL AS entry_id, NULL AS entry_estimate_seconds,
          NULL AS started_at, NULL AS ended_at WHERE false`),
    db.prepare(`SELECT x.id, x.entry_id, x.started_at, x.ended_at
      FROM executions x JOIN entries e ON e.app_user_id = x.app_user_id AND e.id = x.entry_id
      WHERE x.app_user_id = ? AND e.taskchute_day_id = ? ORDER BY x.entry_id, x.started_at, x.id`)
      .bind(appUserId, day.id),
  ]);
  const executionsByEntryId = new Map<string, ExecutionProjection[]>();
  for (const value of entryExecutionResult.results) {
    const fact = value as { id: string; entry_id: string; started_at: string; ended_at: string | null };
    const list = executionsByEntryId.get(fact.entry_id) ?? [];
    list.push({ id: fact.id, entry_id: fact.entry_id, started_at: fact.started_at, ended_at: fact.ended_at });
    executionsByEntryId.set(fact.entry_id, list);
  }
  const entryRows = entryResult.results.map(toEntryRow);
  const entriesBySection = new Map<string, EntryProjection[]>();
  const unsectionedEntries: EntryProjection[] = [];
  for (const row of entryRows) {
    const executionSegments = executionsByEntryId.get(row.entry_id);
    const entry: EntryProjection = {
      id: row.entry_id,
      section_id: row.section_id,
      position: row.position,
      lifecycle_state: row.lifecycle_state,
      estimate_seconds: row.estimate_seconds,
      planned_start_minute: row.planned_start_minute,
      execution_summary: {
        first_started_at: row.execution_first_started_at,
        last_ended_at: row.execution_last_ended_at,
        completed_duration_seconds: row.execution_completed_duration_seconds ?? 0,
        active_started_at: row.execution_active_started_at,
        single_execution_id: row.execution_single_id,
        active_execution_id: row.execution_active_id,
        ...(executionSegments && executionSegments.length > 0 ? { executions: executionSegments } : {}),
      },
      routine: row.routine_occurrence_id && row.routine_definition_id ? {
        routine_definition_id: row.routine_definition_id,
        routine_occurrence_id: row.routine_occurrence_id,
        end_logical_date: row.routine_end_logical_date,
        can_end: row.routine_end_logical_date === null || row.routine_end_logical_date > day.logical_date,
        default_section_id: row.default_section_id,
        default_planned_start_minute: row.default_planned_start_minute,
        section_plan_override_present: row.section_plan_override_present === 1,
        default_estimate_seconds: row.default_estimate_seconds,
        estimate_override_present: row.estimate_override_present === 1,
        defaults_revision: row.defaults_revision!,
      } : null,
      task: {
        id: row.task_id,
        title: row.task_title,
        project:
          row.project_id && row.project_title ? { id: row.project_id, title: row.project_title } : null,
      },
    };
    if (row.section_id === null) {
      if (row.planned_start_minute !== null) throw new Error("Section-less Entry cannot have a planned start");
      unsectionedEntries.push(entry);
    }
    else {
      const collection = entriesBySection.get(row.section_id) ?? [];
      collection.push(entry);
      entriesBySection.set(row.section_id, collection);
    }
  }
  const sections: SectionProjection[] = sectionResult.results.map(toSectionRow).map((section) => ({
    id: section.id, title: section.title, logical_start_minute: section.logical_start_minute,
    logical_end_minute: section.logical_end_minute, actual_start_instant: section.actual_start_instant,
    actual_end_instant: section.actual_end_instant,
    estimate_total_seconds: (entriesBySection.get(section.id) ?? []).reduce((sum, entry) => sum + (entry.estimate_seconds ?? 0), 0),
    entries: canonicalizeEntryOrder(entriesBySection.get(section.id) ?? []),
  }));
  const projectedSectionIds = new Set(sections.map((section) => section.id));
  if ([...entriesBySection.keys()].some((sectionId) => !projectedSectionIds.has(sectionId))) {
    throw new Error("Entry references a Section outside its TaskChuteDay context");
  }
  const nextEntry = [...unsectionedEntries, ...sections.flatMap((section) => section.entries)]
    .find((entry) => entry.lifecycle_state === "planned") ?? null;
  const activeExecution = executionResult.results[0] as ExecutionRow | undefined;
  return {
    projection_generated_at: projectionGeneratedAt,
    establishment_state: "established",
    is_current: includeActiveExecution,
    planning_enabled: planningEnabled,
    taskchute_day: {
      id: day.id,
      logical_date: day.logical_date,
      start_instant: day.start_instant,
      end_instant: day.end_instant,
      establishment_timezone: day.establishment_timezone,
      establishment_boundary_minutes: day.establishment_boundary_minutes,
    },
    placement_revision: day.placement_revision,
    section_configuration_required: sections.length === 0 || sections.some((section) => section.logical_start_minute === null),
    sections,
    unsectioned_entries: unsectionedEntries,
    active_execution: activeExecution ? {
      id: activeExecution.id,
      entry_id: activeExecution.entry_id,
      entry_estimate_seconds: activeExecution.entry_estimate_seconds,
      started_at: activeExecution.started_at,
      ended_at: activeExecution.ended_at,
    } : null,
    next_entry: nextEntry,
  };
}

export interface FutureDayEstablishmentPlan {
  day: DayRow;
  configuration_version_id: string | null;
  contexts: DaySectionContextRow[];
  settings: SettingsRow;
}

export async function readFutureDayEstablishmentPlan(
  db: D1Database,
  appUserId: string,
  logicalDate: string,
  nowInstant = new Date().toISOString(),
): Promise<FutureDayEstablishmentPlan | null> {
  if (!isLogicalDate(logicalDate)) return null;
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<SettingsRow>();
  if (!settings) throw new Error("Provisioned user has no TaskChuteDay settings");
  const current = resolveTaskChuteDay(nowInstant, { timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes });
  if (logicalDate <= current.logicalDate) return null;
  const resolved = resolveTaskChuteDayForLogicalDate(logicalDate, {
    timezone: settings.timezone,
    boundaryMinutes: settings.day_boundary_minutes,
  });
  const day: DayRow = {
    id: "",
    logical_date: resolved.logicalDate,
    start_instant: resolved.startInstant,
    end_instant: resolved.endInstant,
    establishment_timezone: resolved.timezone,
    establishment_boundary_minutes: resolved.boundaryMinutes,
    placement_revision: 0,
  };
  const version = await db.prepare(`SELECT v.id FROM section_configuration_heads h
    JOIN section_configuration_versions v ON v.app_user_id = h.app_user_id AND v.id = h.configuration_version_id
    WHERE h.app_user_id = ? AND v.day_boundary_minutes = ?`)
    .bind(appUserId, settings.day_boundary_minutes).first<{ id: string }>();
  const contexts = version
    ? await expectedConfiguredContexts(db, appUserId, day, version.id)
    : await expectedLegacyContexts(db, appUserId);
  return { day, configuration_version_id: version?.id ?? null, contexts, settings };
}

function emptyProjection(
  state: "future_preview" | "past_record_none",
  logicalDate: string,
  day: DayRow | null,
  contexts: DaySectionContextRow[],
  projectionGeneratedAt: string,
): CurrentTaskChuteDayProjection {
  const sections: SectionProjection[] = contexts.map((section) => ({
    id: section.section_id,
    title: section.title,
    logical_start_minute: section.logical_start_minute,
    logical_end_minute: section.logical_end_minute,
    actual_start_instant: section.actual_start_instant,
    actual_end_instant: section.actual_end_instant,
    estimate_total_seconds: 0,
    entries: [],
  }));
  return {
    projection_generated_at: projectionGeneratedAt,
    establishment_state: state,
    is_current: false,
    planning_enabled: state === "future_preview",
    taskchute_day: {
      id: null,
      logical_date: logicalDate,
      start_instant: day?.start_instant ?? null,
      end_instant: day?.end_instant ?? null,
      establishment_timezone: day?.establishment_timezone ?? null,
      establishment_boundary_minutes: day?.establishment_boundary_minutes ?? null,
    },
    placement_revision: 0,
    section_configuration_required: state === "future_preview"
      && (sections.length === 0 || sections.some((section) => section.logical_start_minute === null)),
    sections,
    unsectioned_entries: [],
    active_execution: null,
    next_entry: null,
  };
}

export async function loadTaskChuteDayByLogicalDate(
  db: D1Database,
  appUserId: string,
  logicalDate: string,
  nowInstant = new Date().toISOString(),
): Promise<CurrentTaskChuteDayProjection> {
  if (!isLogicalDate(logicalDate)) throw new Error("Invalid logical date");
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<SettingsRow>();
  if (!settings) throw new Error("Provisioned user has no TaskChuteDay settings");
  const current = resolveTaskChuteDay(nowInstant, { timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes });
  if (logicalDate === current.logicalDate) return loadCurrentTaskChuteDay(db, appUserId, nowInstant);
  const existing = await db.prepare(`SELECT id, logical_date, start_instant, end_instant, establishment_timezone,
      establishment_boundary_minutes, placement_revision FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?`)
    .bind(appUserId, logicalDate).first<DayRow>();
  if (existing) return loadEstablishedProjection(db, appUserId, existing, false, logicalDate > current.logicalDate, nowInstant);
  if (logicalDate < current.logicalDate) return emptyProjection("past_record_none", logicalDate, null, [], nowInstant);
  const preview = await readFutureDayEstablishmentPlan(db, appUserId, logicalDate, nowInstant);
  if (!preview) throw new Error("Future TaskChuteDay preview could not be resolved");
  return emptyProjection("future_preview", logicalDate, preview.day, preview.contexts, nowInstant);
}

export async function loadCurrentTaskChuteDay(
  db: D1Database,
  appUserId: string,
  nowInstant = new Date().toISOString(),
): Promise<EstablishedTaskChuteDayProjection> {
  const materializedDay = await materializeCurrentDay(db, appUserId, nowInstant);
  await ensureCurrentDayRoutineEntries(db, appUserId, materializedDay, nowInstant);
  const day = await db.prepare(`SELECT id, logical_date, start_instant, end_instant, establishment_timezone,
      establishment_boundary_minutes, placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?`)
    .bind(appUserId, materializedDay.id).first<DayRow>();
  if (!day) throw new Error("TaskChuteDay disappeared after Routine materialization");
  return loadEstablishedProjection(db, appUserId, day, true, true, nowInstant);
}
