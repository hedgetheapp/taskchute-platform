import { createRoutineCalendarContext, isRoutineScheduleEligibleWithCalendar, routineScheduleFromSnapshot, type RoutineScheduleSnapshot } from "../../src/shared/routine-recurrence";
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
  rows: CalendarPlannedOccurrenceRow[];
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

function affectedByOverride(row: CalendarPlannedOccurrenceRow, logicalDate: string): boolean {
  return row.logical_date === logicalDate
    || (row.schedule_kind === "monthly_last_workday" && sameMonth(row.logical_date, logicalDate));
}

function protectedOccurrence(row: CalendarPlannedOccurrenceRow): boolean {
  return row.taskchute_day_id !== row.origin_taskchute_day_id
    || row.suppression_reason === "skip"
    || row.suppression_reason === "paused"
    || row.section_plan_override_present === 1
    || row.estimate_override_present === 1
    || row.mode_id !== null;
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
    LEFT JOIN routine_occurrence_suppressions x
      ON x.app_user_id = o.app_user_id AND x.routine_occurrence_id = o.id
    WHERE o.app_user_id = ? AND e.lifecycle_state = 'planned' AND d.logical_date >= ?
      AND s.schedule_kind IN ('workday', 'holiday', 'official_holiday', 'monthly_last_workday')
    ORDER BY d.logical_date, o.id`).bind(appUserId, fromDate).all<CalendarPlannedOccurrenceRow>();
  return rows.results;
}

export async function buildCalendarReconciliationPlan(
  db: D1Database,
  appUserId: string,
  changedLogicalDate: string,
  nowInstant: string,
  afterOverrides: readonly EffectiveDayOverrideValue[],
): Promise<CalendarReconciliationPlan> {
  const fromDate = await currentLogicalDate(db, appUserId, nowInstant, changedLogicalDate);
  const calendar = createRoutineCalendarContext(afterOverrides);
  const rows = await readPlannedCalendarOccurrences(db, appUserId, fromDate);
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

  const currentDay = await db.prepare(`SELECT d.id, d.logical_date, d.establishment_boundary_minutes, d.placement_revision
    FROM taskchute_days d WHERE d.app_user_id = ? AND d.logical_date = ?`)
    .bind(appUserId, fromDate).first<{ id: string; logical_date: string; establishment_boundary_minutes: number; placement_revision: number }>();
  const materializations: CalendarMaterializationPlan[] = [];
  if (currentDay && (currentDay.logical_date === changedLogicalDate || sameMonth(currentDay.logical_date, changedLogicalDate))) {
    const definitions = await db.prepare(`SELECT r.id AS routine_definition_id, r.task_id, t.title,
        p.id AS project_id, p.title AS project_title, r.default_section_id,
        r.default_planned_start_minute, r.default_estimate_seconds, r.start_logical_date,
        r.end_logical_date, rdm.mode_id, s.schedule_kind, s.interval_days, s.interval_weeks,
        s.interval_months, s.weekdays_mask, s.month_day, s.month_ordinal, s.month_weekday
      FROM routine_definitions r
      JOIN routine_schedules s ON s.app_user_id = r.app_user_id AND s.routine_definition_id = r.id
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
      .bind(appUserId, currentDay.logical_date, currentDay.logical_date, currentDay.logical_date, currentDay.logical_date, currentDay.id)
      .all<{
        routine_definition_id: string; task_id: string; title: string; project_id: string | null; project_title: string | null;
        default_section_id: string | null; default_planned_start_minute: number | null; default_estimate_seconds: number | null;
        start_logical_date: string; end_logical_date: string | null; mode_id: string | null;
        schedule_kind: RoutineScheduleSnapshot["schedule_kind"]; interval_days: number | null; interval_weeks: number | null;
        interval_months: number | null; weekdays_mask: number | null; month_day: number | null; month_ordinal: number | null; month_weekday: number | null;
      }>();
    const [contexts, positions] = await db.batch([
      db.prepare(`SELECT section_id, logical_start_minute, logical_end_minute
        FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
        .bind(appUserId, currentDay.id),
      db.prepare(`SELECT section_id, MAX(position) AS max_position FROM entries
        WHERE app_user_id = ? AND taskchute_day_id = ? GROUP BY section_id`).bind(appUserId, currentDay.id),
    ]);
    const contextRows = contexts.results as Array<{ section_id: string; logical_start_minute: number | null; logical_end_minute: number | null }>;
    const nextPosition = new Map<string, number>();
    for (const row of positions.results as Array<{ section_id: string | null; max_position: number }>) nextPosition.set(row.section_id ?? "", row.max_position + 1);
    for (const definition of definitions.results) {
      const schedule = routineScheduleFromSnapshot(definition);
      const currentDateIsAffected = currentDay.logical_date === changedLogicalDate
        || (schedule.kind === "monthly_last_workday" && sameMonth(currentDay.logical_date, changedLogicalDate));
      if (!currentDateIsAffected) continue;
      if (!isRoutineScheduleEligibleWithCalendar({ schedule, startLogicalDate: definition.start_logical_date,
        endLogicalDate: definition.end_logical_date, candidateLogicalDate: currentDay.logical_date, calendar })) continue;
      let sectionId: string | null = null;
      if (definition.default_planned_start_minute !== null) {
        const matches = contextRows.filter((item) => item.logical_start_minute !== null && item.logical_end_minute !== null
          && item.logical_start_minute <= definition.default_planned_start_minute!
          && definition.default_planned_start_minute! < item.logical_end_minute);
        if (definition.default_planned_start_minute < currentDay.establishment_boundary_minutes
          || definition.default_planned_start_minute >= currentDay.establishment_boundary_minutes + 1440
          || matches.length !== 1 || matches[0]!.section_id !== definition.default_section_id) continue;
        sectionId = matches[0]!.section_id;
      } else if (definition.default_section_id !== null) continue;
      const key = sectionId ?? "";
      const position = nextPosition.get(key) ?? 1;
      nextPosition.set(key, position + 1);
      materializations.push({ routine_definition_id: definition.routine_definition_id, taskchute_day_id: currentDay.id,
        routine_occurrence_id: uuidv7(), entry_id: uuidv7(),
        task_id: definition.task_id, title: definition.title, project_id: definition.project_id, project_title: definition.project_title,
        section_id: sectionId, planned_start_minute: definition.default_planned_start_minute,
        estimate_seconds: definition.default_estimate_seconds, position, mode_id: definition.mode_id });
      changedDays.set(currentDay.id, { taskchute_day_id: currentDay.id, placement_revision: currentDay.placement_revision });
    }
  }
  return { fromDate, rows, suppressIds, unsuppressIds, materializations, changedDays: [...changedDays.values()] };
}
