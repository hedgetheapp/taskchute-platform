import type {
  CurrentTaskChuteDayProjection,
  EntryProjection,
  SectionProjection,
} from "../../src/shared/contracts";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { uuidv7 } from "../domain/uuidv7";

interface SettingsRow {
  timezone: string;
  day_boundary_minutes: number;
}

interface DayRow {
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
  sort_order: number;
}

interface EntryRow {
  entry_id: string;
  section_id: string;
  position: number;
  lifecycle_state: "planned" | "running" | "completed";
  task_id: string;
  task_title: string;
  project_id: string | null;
  project_title: string | null;
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
  return { id: requiredString(row, "id"), title: requiredString(row, "title"), sort_order: requiredNumber(row, "sort_order") };
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
    section_id: requiredString(row, "section_id"),
    position: requiredNumber(row, "position"),
    lifecycle_state: lifecycle,
    task_id: requiredString(row, "task_id"),
    task_title: requiredString(row, "task_title"),
    project_id: projectId,
    project_title: projectTitle,
  };
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
  if (existing) return existing;

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
  return converged;
}

export async function loadCurrentTaskChuteDay(
  db: D1Database,
  appUserId: string,
  nowInstant = new Date().toISOString(),
): Promise<CurrentTaskChuteDayProjection> {
  const day = await materializeCurrentDay(db, appUserId, nowInstant);
  const [sectionResult, entryResult] = await db.batch([
    db.prepare("SELECT id, title, sort_order FROM sections WHERE app_user_id = ? ORDER BY sort_order, id").bind(appUserId),
    db
      .prepare(
        `SELECT e.id AS entry_id, e.section_id, e.position, e.lifecycle_state,
                t.id AS task_id, t.title AS task_title,
                p.id AS project_id, p.title AS project_title
           FROM entries e
           JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
           LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
          WHERE e.app_user_id = ? AND e.taskchute_day_id = ?
          ORDER BY e.section_id, e.position, e.id`,
      )
      .bind(appUserId, day.id),
  ]);
  const entryRows = entryResult.results.map(toEntryRow);
  const entriesBySection = new Map<string, EntryProjection[]>();
  for (const row of entryRows) {
    const entry: EntryProjection = {
      id: row.entry_id,
      section_id: row.section_id,
      position: row.position,
      lifecycle_state: row.lifecycle_state,
      task: {
        id: row.task_id,
        title: row.task_title,
        project:
          row.project_id && row.project_title ? { id: row.project_id, title: row.project_title } : null,
      },
    };
    const collection = entriesBySection.get(row.section_id) ?? [];
    collection.push(entry);
    entriesBySection.set(row.section_id, collection);
  }
  const sections: SectionProjection[] = sectionResult.results.map(toSectionRow).map((section) => ({
    ...section,
    entries: entriesBySection.get(section.id) ?? [],
  }));
  const nextEntry = sections.flatMap((section) => section.entries).find((entry) => entry.lifecycle_state === "planned") ?? null;
  return {
    taskchute_day: {
      id: day.id,
      logical_date: day.logical_date,
      start_instant: day.start_instant,
      end_instant: day.end_instant,
      establishment_timezone: day.establishment_timezone,
      establishment_boundary_minutes: day.establishment_boundary_minutes,
    },
    placement_revision: day.placement_revision,
    sections,
    active_execution: null,
    next_entry: nextEntry,
  };
}
