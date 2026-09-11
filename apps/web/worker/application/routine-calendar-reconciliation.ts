import { createRoutineCalendarContext, isRoutineScheduleEligibleWithCalendar, routineScheduleFromSnapshot, type RoutineCalendarContext, type RoutineScheduleSnapshot } from "../../src/shared/routine-recurrence";
import type { EffectiveDayOverrideValue } from "../../src/shared/effective-day-calendar";
import { resolveTaskChuteDay } from "../domain/taskchute-day";
import { uuidv7 } from "../domain/uuidv7";

export interface CalendarPlannedOccurrenceRow {
  occurrence_id: string;
  entry_id: string;
  routine_definition_id: string;
  taskchute_day_id: string;
  logical_date: string;
  origin_taskchute_day_id: string;
  lifecycle_state: "planned";
  placement_revision: number;
  section_id: string | null;
  planned_start_minute: number | null;
  position: number;
  section_plan_override_present: number;
  estimate_override_present: number;
  mode_id: string | null;
  mode_override_present: number;
  suppression_reason: "schedule" | "period" | "paused" | "skip" | null;
  schedule_kind: RoutineScheduleSnapshot["schedule_kind"];
  start_logical_date: string;
  end_logical_date: string | null;
  interval_days: number | null;
  interval_weeks: number | null;
  interval_months: number | null;
  weekdays_mask: number | null;
  month_day: number | null;
  month_ordinal: number | null;
  month_weekday: number | null;
  suppressed: number;
}

interface CalendarTargetDay {
  taskchute_day_id: string;
  logical_date: string;
  establishment_boundary_minutes: number;
  placement_revision: number;
  section_context_json: string;
}

/** Source snapshot for every possible D-089 candidate on a target Day. */
export interface CalendarCandidateSnapshot {
  routine_definition_id: string;
  task_id: string;
  title: string;
  project_id: string | null;
  project_title: string | null;
  default_section_id: string | null;
  default_planned_start_minute: number | null;
  default_estimate_seconds: number | null;
  default_mode_id: string | null;
  materialization_order: number;
  settings_revision: number;
  defaults_revision: number;
  start_logical_date: string;
  end_logical_date: string | null;
  schedule_kind: RoutineScheduleSnapshot["schedule_kind"];
  interval_days: number | null;
  interval_weeks: number | null;
  interval_months: number | null;
  weekdays_mask: number | null;
  month_day: number | null;
  month_ordinal: number | null;
  month_weekday: number | null;
  taskchute_day_id: string;
  logical_date: string;
  placement_revision: number;
  establishment_boundary_minutes: number;
  section_context_json: string;
}

export interface CalendarMaterializationPlan {
  routine_definition_id: string;
  taskchute_day_id: string;
  routine_occurrence_id: string;
  entry_id: string;
  task_id: string;
  title: string;
  project_id: string | null;
  project_title: string | null;
  section_id: string | null;
  planned_start_minute: number | null;
  estimate_seconds: number | null;
  position: number;
  mode_id: string | null;
}

export interface CalendarReconciliationPlan {
  fromDate: string;
  changedLogicalDate: string;
  rows: CalendarPlannedOccurrenceRow[];
  targetDays: CalendarTargetDay[];
  candidates: CalendarCandidateSnapshot[];
  suppressIds: string[];
  unsuppressIds: string[];
  materializations: CalendarMaterializationPlan[];
  changedDays: Array<{ taskchute_day_id: string; placement_revision: number }>;
}

export async function readRoutineCalendarOverrides(db: D1Database, appUserId: string): Promise<EffectiveDayOverrideValue[]> {
  const rows = await db.prepare(`SELECT logical_date, override_kind, reason, revision, updated_at
    FROM effective_day_overrides WHERE app_user_id = ? ORDER BY logical_date`).bind(appUserId).all<EffectiveDayOverrideValue>();
  return rows.results;
}

function sameMonth(left: string, right: string): boolean {
  return left.slice(0, 7) === right.slice(0, 7);
}

function affectedByOverride(row: { logical_date: string; schedule_kind: RoutineScheduleSnapshot["schedule_kind"] }, logicalDate: string): boolean {
  return row.logical_date === logicalDate
    || (row.schedule_kind === "monthly_last_workday" && sameMonth(row.logical_date, logicalDate));
}

function protectedOccurrence(row: CalendarPlannedOccurrenceRow): boolean {
  return row.taskchute_day_id !== row.origin_taskchute_day_id
    || row.suppression_reason === "skip"
    || row.suppression_reason === "paused"
    || row.section_plan_override_present === 1
    || row.estimate_override_present === 1
    // entry_modes is effective state and may be populated from a Routine default.
    || row.mode_override_present === 1;
}

async function currentLogicalDate(db: D1Database, appUserId: string, nowInstant: string, fallback: string): Promise<string> {
  const settings = await db.prepare("SELECT timezone, day_boundary_minutes FROM user_settings WHERE app_user_id = ?")
    .bind(appUserId).first<{ timezone: string; day_boundary_minutes: number }>();
  if (!settings) return fallback;
  return resolveTaskChuteDay(nowInstant, { timezone: settings.timezone, boundaryMinutes: settings.day_boundary_minutes }).logicalDate;
}

async function readPlannedCalendarOccurrences(db: D1Database, appUserId: string, fromDate: string): Promise<CalendarPlannedOccurrenceRow[]> {
  const rows = await db.prepare(`SELECT o.id AS occurrence_id, e.id AS entry_id, o.routine_definition_id,
      e.taskchute_day_id, d.logical_date, o.origin_taskchute_day_id, e.lifecycle_state,
      d.placement_revision, e.section_id, e.planned_start_minute, e.position,
      o.section_plan_override_present, o.estimate_override_present, em.mode_id,
      CASE WHEN om.routine_occurrence_id IS NULL THEN 0 ELSE 1 END AS mode_override_present,
      x.reason AS suppression_reason,
      s.schedule_kind, r.start_logical_date, r.end_logical_date,
      s.interval_days, s.interval_weeks, s.interval_months, s.weekdays_mask,
      s.month_day, s.month_ordinal, s.month_weekday,
      CASE WHEN x.routine_occurrence_id IS NULL THEN 0 ELSE 1 END AS suppressed
    FROM routine_occurrences o
    JOIN routine_definitions r ON r.app_user_id = o.app_user_id AND r.id = o.routine_definition_id
    JOIN routine_schedules s ON s.app_user_id = r.app_user_id AND s.routine_definition_id = r.id
    JOIN entries e ON e.app_user_id = o.app_user_id AND e.routine_occurrence_id = o.id
    JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
    LEFT JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
    LEFT JOIN routine_occurrence_mode_overrides om
      ON om.app_user_id = o.app_user_id AND om.routine_occurrence_id = o.id
    LEFT JOIN routine_occurrence_suppressions x
      ON x.app_user_id = o.app_user_id AND x.routine_occurrence_id = o.id
    WHERE o.app_user_id = ? AND e.lifecycle_state = 'planned' AND d.logical_date >= ?
      AND s.schedule_kind IN ('workday', 'holiday', 'official_holiday', 'monthly_last_workday')
    ORDER BY d.logical_date, o.id`).bind(appUserId, fromDate).all<CalendarPlannedOccurrenceRow>();
  return rows.results;
}

async function readTargetDays(db: D1Database, appUserId: string, fromDate: string, changedLogicalDate: string): Promise<CalendarTargetDay[]> {
  const days = await db.prepare(`SELECT id AS taskchute_day_id, logical_date,
      establishment_boundary_minutes, placement_revision
    FROM taskchute_days
    WHERE app_user_id = ? AND logical_date >= ?
      AND (logical_date = ? OR substr(logical_date, 1, 7) = substr(?, 1, 7))
    ORDER BY logical_date, id`).bind(appUserId, fromDate, changedLogicalDate, changedLogicalDate)
    .all<Omit<CalendarTargetDay, "section_context_json">>();
  return Promise.all(days.results.map(async (day) => {
    const contexts = await db.prepare(`SELECT section_id, logical_start_minute, logical_end_minute
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
      .bind(appUserId, day.taskchute_day_id).all<{ section_id: string; logical_start_minute: number | null; logical_end_minute: number | null }>();
    return { ...day, section_context_json: JSON.stringify(contexts.results) };
  }));
}

interface CalendarDefinitionRow extends CalendarCandidateSnapshot {}

async function readCalendarCandidates(db: D1Database, appUserId: string, day: CalendarTargetDay): Promise<CalendarDefinitionRow[]> {
  const rows = await db.prepare(`SELECT r.id AS routine_definition_id, r.task_id, t.title,
      p.id AS project_id, p.title AS project_title, r.default_section_id,
      r.default_planned_start_minute, r.default_estimate_seconds, rdm.mode_id AS default_mode_id,
      r.materialization_order, b.settings_revision, r.defaults_revision,
      r.start_logical_date, r.end_logical_date,
      s.schedule_kind, s.interval_days, s.interval_weeks, s.interval_months,
      s.weekdays_mask, s.month_day, s.month_ordinal, s.month_weekday
    FROM routine_definitions r
    JOIN routine_schedules s ON s.app_user_id = r.app_user_id AND s.routine_definition_id = r.id
    JOIN routine_board_items b ON b.app_user_id = r.app_user_id AND b.routine_definition_id = r.id
    JOIN tasks t ON t.app_user_id = r.app_user_id AND t.id = r.task_id
    LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
    LEFT JOIN routine_definition_modes rdm
      ON rdm.app_user_id = r.app_user_id AND rdm.routine_definition_id = r.id
    WHERE r.app_user_id = ? AND s.schedule_kind IN ('workday', 'holiday', 'official_holiday', 'monthly_last_workday')
      AND r.start_logical_date <= ? AND (r.end_logical_date IS NULL OR r.end_logical_date >= ?)
      AND NOT EXISTS (SELECT 1 FROM routine_definition_archives a
        WHERE a.app_user_id = r.app_user_id AND a.routine_definition_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM routine_pause_intervals pi WHERE pi.app_user_id = r.app_user_id
        AND pi.routine_definition_id = r.id AND pi.paused_logical_date <= ?
        AND (pi.resumed_logical_date IS NULL OR ? < pi.resumed_logical_date))
      AND NOT EXISTS (SELECT 1 FROM routine_occurrences o WHERE o.app_user_id = r.app_user_id
        AND o.routine_definition_id = r.id AND o.origin_taskchute_day_id = ?)
    ORDER BY r.materialization_order, r.id`)
    .bind(appUserId, day.logical_date, day.logical_date, day.logical_date, day.logical_date, day.taskchute_day_id)
    .all<Omit<CalendarDefinitionRow, "taskchute_day_id" | "logical_date" | "placement_revision" | "establishment_boundary_minutes" | "section_context_json">>();
  return rows.results.map((row) => ({ ...row, taskchute_day_id: day.taskchute_day_id, logical_date: day.logical_date,
    placement_revision: day.placement_revision, establishment_boundary_minutes: day.establishment_boundary_minutes,
    section_context_json: day.section_context_json }));
}

function sectionForCandidate(candidate: CalendarCandidateSnapshot): string | null | undefined {
  if (candidate.default_planned_start_minute === null) {
    return candidate.default_section_id === null ? null : undefined;
  }
  if (candidate.default_planned_start_minute < candidate.establishment_boundary_minutes
    || candidate.default_planned_start_minute >= candidate.establishment_boundary_minutes + 1440) return undefined;
  const contexts = JSON.parse(candidate.section_context_json) as Array<{
    section_id: string; logical_start_minute: number | null; logical_end_minute: number | null;
  }>;
  const matches = contexts.filter((context) => context.logical_start_minute !== null && context.logical_end_minute !== null
    && context.logical_start_minute <= candidate.default_planned_start_minute!
    && candidate.default_planned_start_minute! < context.logical_end_minute);
  if (matches.length !== 1 || matches[0]!.section_id !== candidate.default_section_id) return undefined;
  return matches[0]!.section_id;
}

function beforeEligibility(candidate: CalendarCandidateSnapshot, beforeCalendar: RoutineCalendarContext | null): boolean | null {
  if (!beforeCalendar) return null;
  return isRoutineScheduleEligibleWithCalendar({
    schedule: routineScheduleFromSnapshot(candidate), startLogicalDate: candidate.start_logical_date,
    endLogicalDate: candidate.end_logical_date, candidateLogicalDate: candidate.logical_date, calendar: beforeCalendar,
  });
}

export async function buildCalendarReconciliationPlan(
  db: D1Database,
  appUserId: string,
  changedLogicalDate: string,
  nowInstant: string,
  afterOverrides: readonly EffectiveDayOverrideValue[],
  beforeOverrides: readonly EffectiveDayOverrideValue[] | null = null,
): Promise<CalendarReconciliationPlan> {
  const fromDate = await currentLogicalDate(db, appUserId, nowInstant, changedLogicalDate);
  const calendar = createRoutineCalendarContext(afterOverrides);
  const beforeCalendar = beforeOverrides ? createRoutineCalendarContext(beforeOverrides) : null;
  const rows = await readPlannedCalendarOccurrences(db, appUserId, fromDate);
  const targetDays = await readTargetDays(db, appUserId, fromDate, changedLogicalDate);
  const suppressIds: string[] = [];
  const unsuppressIds: string[] = [];
  const changedDays = new Map<string, { taskchute_day_id: string; placement_revision: number }>();
  for (const row of rows) {
    if (!affectedByOverride(row, changedLogicalDate) || protectedOccurrence(row)) continue;
    const schedule = routineScheduleFromSnapshot(row);
    const eligible = isRoutineScheduleEligibleWithCalendar({
      schedule, startLogicalDate: row.start_logical_date, endLogicalDate: row.end_logical_date,
      candidateLogicalDate: row.logical_date, calendar,
    });
    if (!eligible && row.suppressed === 0) suppressIds.push(row.occurrence_id);
    if (eligible && row.suppressed === 1 && (row.suppression_reason === "schedule" || row.suppression_reason === "period")) {
      unsuppressIds.push(row.occurrence_id);
    }
    if ((!eligible && row.suppressed === 0) || (eligible && row.suppressed === 1
      && (row.suppression_reason === "schedule" || row.suppression_reason === "period"))) {
      changedDays.set(row.taskchute_day_id, { taskchute_day_id: row.taskchute_day_id, placement_revision: row.placement_revision });
    }
  }

  const candidates = (await Promise.all(targetDays.map((day) => readCalendarCandidates(db, appUserId, day)))).flat();
  const materializations: CalendarMaterializationPlan[] = [];
  for (const day of targetDays) {
    const positions = await db.prepare(`SELECT section_id, MAX(position) AS max_position FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? GROUP BY section_id`).bind(appUserId, day.taskchute_day_id)
      .all<{ section_id: string | null; max_position: number }>();
    const nextPosition = new Map<string, number>();
    for (const row of positions.results) nextPosition.set(row.section_id ?? "", row.max_position + 1);
    for (const candidate of candidates.filter((item) => item.taskchute_day_id === day.taskchute_day_id)) {
      const schedule = routineScheduleFromSnapshot(candidate);
      const eligible = affectedByOverride(candidate, changedLogicalDate)
        && isRoutineScheduleEligibleWithCalendar({ schedule, startLogicalDate: candidate.start_logical_date,
          endLogicalDate: candidate.end_logical_date, candidateLogicalDate: candidate.logical_date, calendar });
      if (!eligible) continue;
      // An override cannot change an official holiday's eligibility. Normal
      // Day ensure remains the authority for an already-eligible date.
      if (schedule.kind === "official_holiday" && beforeEligibility(candidate, beforeCalendar)
        === isRoutineScheduleEligibleWithCalendar({ schedule, startLogicalDate: candidate.start_logical_date,
          endLogicalDate: candidate.end_logical_date, candidateLogicalDate: candidate.logical_date, calendar })) continue;
      const sectionId = sectionForCandidate(candidate);
      if (sectionId === undefined) continue;
      const key = sectionId ?? "";
      const position = nextPosition.get(key) ?? 1;
      nextPosition.set(key, position + 1);
      materializations.push({ routine_definition_id: candidate.routine_definition_id, taskchute_day_id: day.taskchute_day_id,
        routine_occurrence_id: uuidv7(), entry_id: uuidv7(), task_id: candidate.task_id, title: candidate.title,
        project_id: candidate.project_id, project_title: candidate.project_title, section_id: sectionId,
        planned_start_minute: candidate.default_planned_start_minute, estimate_seconds: candidate.default_estimate_seconds,
        position, mode_id: candidate.default_mode_id });
      changedDays.set(day.taskchute_day_id, { taskchute_day_id: day.taskchute_day_id, placement_revision: day.placement_revision });
    }
  }
  return { fromDate, changedLogicalDate, rows, targetDays, candidates, suppressIds, unsuppressIds, materializations,
    changedDays: [...changedDays.values()] };
}

/**
 * The assertion table intentionally rejects ok=0, so a failed source guard is
 * surfaced as a batch error. Re-read the complete source snapshot to
 * distinguish deterministic drift from an infrastructure-ambiguous outcome.
 */
export async function calendarPlanSourcesMatchCurrent(
  db: D1Database,
  appUserId: string,
  plan: CalendarReconciliationPlan,
): Promise<boolean> {
  const [rows, targetDays] = await Promise.all([
    readPlannedCalendarOccurrences(db, appUserId, plan.fromDate),
    readTargetDays(db, appUserId, plan.fromDate, plan.changedLogicalDate),
  ]);
  if (JSON.stringify(rows) !== JSON.stringify(plan.rows) || JSON.stringify(targetDays) !== JSON.stringify(plan.targetDays)) return false;
  const candidates = (await Promise.all(targetDays.map((day) => readCalendarCandidates(db, appUserId, day)))).flat();
  return JSON.stringify(candidates) === JSON.stringify(plan.candidates);
}
