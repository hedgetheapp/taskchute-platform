import { Temporal } from "@js-temporal/polyfill";
import type { RoutineScheduleInput } from "./contracts";

/**
 * The persisted weekday numbering is deliberately Sunday=0..Saturday=6,
 * matching Date#getUTCDay and SQLite %w. This helper is the only recurrence
 * calendar authority used by the Web and Worker paths.
 */
export interface RoutineScheduleSnapshot {
  schedule_kind: RoutineScheduleInput["kind"];
  interval_days: number | null;
  interval_weeks: number | null;
  interval_months: number | null;
  weekdays_mask: number | null;
  month_day: number | null;
  month_ordinal: number | null;
  month_weekday: number | null;
}

const WEEKDAY_VALUES = new Set([0, 1, 2, 3, 4, 5, 6]);

function parseDate(value: string): Temporal.PlainDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  try {
    const date = Temporal.PlainDate.from(value);
    return date.toString() === value ? date : null;
  } catch {
    return null;
  }
}

function weekdayOf(date: Temporal.PlainDate): number {
  return date.dayOfWeek % 7;
}

function selectedWeekday(schedule: { weekdays: number[] }, date: Temporal.PlainDate): boolean {
  return schedule.weekdays.includes(weekdayOf(date));
}

function validWeekdays(weekdays: number[]): boolean {
  return weekdays.length > 0 && new Set(weekdays).size === weekdays.length
    && weekdays.every((weekday) => Number.isInteger(weekday) && WEEKDAY_VALUES.has(weekday));
}

function activeMonth(start: Temporal.PlainDate, candidate: Temporal.PlainDate, interval: number): boolean {
  const monthIndex = (candidate.year - start.year) * 12 + candidate.month - start.month;
  return monthIndex >= 0 && monthIndex % interval === 0;
}

/** Pure, deterministic eligibility over canonical YYYY-MM-DD civil dates. */
export function isRoutineScheduleEligible(input: {
  schedule: RoutineScheduleInput;
  startLogicalDate: string;
  endLogicalDate: string | null;
  candidateLogicalDate: string;
}): boolean {
  const start = parseDate(input.startLogicalDate);
  const candidate = parseDate(input.candidateLogicalDate);
  const end = input.endLogicalDate === null ? null : parseDate(input.endLogicalDate);
  if (!start || !candidate || (input.endLogicalDate !== null && !end)
    || Temporal.PlainDate.compare(candidate, start) < 0
    || (end !== null && Temporal.PlainDate.compare(candidate, end) > 0)) return false;

  const schedule = input.schedule;
  switch (schedule.kind) {
    case "daily":
      return true;
    case "every_n_days":
      if (!Number.isSafeInteger(schedule.interval_days) || schedule.interval_days < 2) return false;
      return candidate.since(start, { largestUnit: "day" }).days % schedule.interval_days === 0;
    case "weekly":
      return validWeekdays(schedule.weekdays) && selectedWeekday(schedule, candidate);
    case "every_n_weeks": {
      if (!Number.isSafeInteger(schedule.interval_weeks) || schedule.interval_weeks < 2
        || !validWeekdays(schedule.weekdays)) return false;
      const daysSinceStart = candidate.since(start, { largestUnit: "day" }).days;
      return Math.floor(daysSinceStart / 7) % schedule.interval_weeks === 0
        && selectedWeekday(schedule, candidate);
    }
    case "monthly_day":
      return Number.isSafeInteger(schedule.day_of_month) && schedule.day_of_month >= 1
        && schedule.day_of_month <= 31 && candidate.day === schedule.day_of_month;
    case "monthly_last_day":
      return candidate.day === candidate.daysInMonth;
    case "monthly_nth_weekday": {
      if (!Number.isSafeInteger(schedule.ordinal) || schedule.ordinal < 1 || schedule.ordinal > 5
        || !Number.isInteger(schedule.weekday) || !WEEKDAY_VALUES.has(schedule.weekday)) return false;
      return weekdayOf(candidate) === schedule.weekday
        && Math.floor((candidate.day - 1) / 7) + 1 === schedule.ordinal;
    }
    case "monthly_last_weekday":
      return Number.isInteger(schedule.weekday) && WEEKDAY_VALUES.has(schedule.weekday)
        && weekdayOf(candidate) === schedule.weekday
        && (candidate.day + 7 > candidate.daysInMonth);
    case "every_n_months_day":
      return Number.isSafeInteger(schedule.interval_months) && schedule.interval_months >= 2
        && Number.isSafeInteger(schedule.day_of_month) && schedule.day_of_month >= 1
        && schedule.day_of_month <= 31 && activeMonth(start, candidate, schedule.interval_months)
        && candidate.day === schedule.day_of_month;
    case "every_n_months_last_day":
      return Number.isSafeInteger(schedule.interval_months) && schedule.interval_months >= 2
        && activeMonth(start, candidate, schedule.interval_months)
        && candidate.day === candidate.daysInMonth;
  }
}

export function routineScheduleFromSnapshot(snapshot: RoutineScheduleSnapshot): RoutineScheduleInput {
  switch (snapshot.schedule_kind) {
    case "daily": return { kind: "daily" };
    case "every_n_days": return { kind: "every_n_days", interval_days: snapshot.interval_days! };
    case "weekly": return { kind: "weekly", weekdays: maskToWeekdays(snapshot.weekdays_mask!) };
    case "every_n_weeks": return { kind: "every_n_weeks", interval_weeks: snapshot.interval_weeks!, weekdays: maskToWeekdays(snapshot.weekdays_mask!) };
    case "monthly_day": return { kind: "monthly_day", day_of_month: snapshot.month_day! };
    case "monthly_last_day": return { kind: "monthly_last_day" };
    case "monthly_nth_weekday": return { kind: "monthly_nth_weekday", ordinal: snapshot.month_ordinal!, weekday: snapshot.month_weekday! };
    case "monthly_last_weekday": return { kind: "monthly_last_weekday", weekday: snapshot.month_weekday! };
    case "every_n_months_day": return { kind: "every_n_months_day", interval_months: snapshot.interval_months!, day_of_month: snapshot.month_day! };
    case "every_n_months_last_day": return { kind: "every_n_months_last_day", interval_months: snapshot.interval_months! };
  }
}

export function maskToWeekdays(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((day) => ((mask >> day) & 1) === 1);
}
