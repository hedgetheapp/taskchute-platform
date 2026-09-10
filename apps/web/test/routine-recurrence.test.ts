import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import type { RoutineScheduleInput } from "../src/shared/contracts";
import { isRoutineScheduleEligible } from "../src/shared/routine-recurrence";

function eligible(schedule: RoutineScheduleInput, date: string, start = "2024-01-01", end: string | null = "2026-12-31") {
  return isRoutineScheduleEligible({ schedule, startLogicalDate: start, endLogicalDate: end, candidateLogicalDate: date });
}

function legacyEligible(schedule: Extract<RoutineScheduleInput, { kind: "daily" | "every_n_days" | "weekly" }>, date: string,
  start: string, end: string | null): boolean {
  if (date < start || (end !== null && date > end)) return false;
  const startDay = Math.floor(Date.parse(`${start}T00:00:00Z`) / 86_400_000);
  const target = new Date(`${date}T00:00:00Z`);
  const targetDay = Math.floor(target.valueOf() / 86_400_000);
  if (schedule.kind === "daily") return true;
  if (schedule.kind === "every_n_days") return (targetDay - startDay) % schedule.interval_days === 0;
  return schedule.weekdays.includes(target.getUTCDay());
}

function dates(start: string, end: string): string[] {
  const result: string[] = [];
  for (let date = Temporal.PlainDate.from(start); Temporal.PlainDate.compare(date, Temporal.PlainDate.from(end)) <= 0; date = date.add({ days: 1 })) {
    result.push(date.toString());
  }
  return result;
}

describe("D-086 routine recurrence evaluator", () => {
  it("preserves the legacy daily, N-day, and weekday-mask semantics over leap years", () => {
    const schedules: Array<Extract<RoutineScheduleInput, { kind: "daily" | "every_n_days" | "weekly" }>> = [
      { kind: "daily" }, { kind: "every_n_days", interval_days: 2 }, { kind: "every_n_days", interval_days: 3 },
      { kind: "every_n_days", interval_days: 7 }, { kind: "every_n_days", interval_days: 30 }, { kind: "every_n_days", interval_days: 365 },
      ...[1, 2, 4, 8, 16, 32, 64].map((mask) => ({ kind: "weekly" as const,
        weekdays: [0, 1, 2, 3, 4, 5, 6].filter((day) => (mask & (1 << day)) !== 0) })),
    ];
    for (const schedule of schedules) {
      for (const date of dates("2023-01-01", "2025-12-31")) {
        expect(eligible(schedule, date, "2023-01-15", "2025-12-15")).toBe(
          legacyEligible(schedule, date, "2023-01-15", "2025-12-15"),
        );
      }
    }
  });

  it("anchors N-week schedules to the Monday-start calendar week", () => {
    const schedule = { kind: "every_n_weeks" as const, interval_weeks: 2, weekdays: [1, 3, 5] };
    const start = "2026-10-01";
    const expected: Array<[string, boolean]> = [
      ["2026-09-28", false], ["2026-09-30", false], ["2026-10-01", false],
      ["2026-10-02", true], ["2026-10-05", false], ["2026-10-07", false],
      ["2026-10-09", false], ["2026-10-12", true], ["2026-10-14", true],
      ["2026-10-16", true],
    ];
    for (const [date, result] of expected) expect(eligible(schedule, date, start)).toBe(result);
  });

  it("honors the start-day lower bound for every start weekday", () => {
    const cases: Array<[string, string, string, boolean]> = [
      ["2026-09-28", "2026-09-28", "2026-09-28", true],
      ["2026-09-29", "2026-09-28", "2026-09-30", true],
      ["2026-09-30", "2026-09-28", "2026-10-02", true],
      ["2026-10-01", "2026-09-28", "2026-10-02", true],
      ["2026-10-02", "2026-09-28", "2026-10-04", true],
      ["2026-10-03", "2026-09-28", "2026-10-04", true],
      ["2026-10-04", "2026-09-28", "2026-10-04", true],
    ];
    for (const [start, , candidate, result] of cases) {
      const weekday = Temporal.PlainDate.from(candidate).dayOfWeek % 7;
      expect(eligible({ kind: "every_n_weeks", interval_weeks: 2, weekdays: [weekday] }, candidate, start)).toBe(result);
    }
    expect(eligible({ kind: "every_n_weeks", interval_weeks: 2, weekdays: [1] }, "2026-09-28", "2026-09-29")).toBe(false);
  });

  it("repeats active N-week phases across month and year boundaries", () => {
    const twoWeeks = { kind: "every_n_weeks" as const, interval_weeks: 2, weekdays: [1] };
    expect(eligible(twoWeeks, "2026-01-05", "2026-01-07")).toBe(false);
    expect(eligible(twoWeeks, "2026-01-12", "2026-01-07")).toBe(false);
    expect(eligible(twoWeeks, "2026-01-19", "2026-01-07")).toBe(true);

    const threeWeeks = { kind: "every_n_weeks" as const, interval_weeks: 3, weekdays: [3] };
    expect(eligible(threeWeeks, "2026-01-07", "2026-01-07")).toBe(true);
    expect(eligible(threeWeeks, "2026-01-28", "2026-01-07")).toBe(true);
    expect(eligible(threeWeeks, "2026-02-18", "2026-01-07")).toBe(true);
    expect(eligible(threeWeeks, "2026-02-11", "2026-01-07")).toBe(false);

    const yearBoundary = { kind: "every_n_weeks" as const, interval_weeks: 2, weekdays: [5] };
    expect(eligible(yearBoundary, "2027-01-01", "2026-12-31", null)).toBe(true);
    expect(eligible(yearBoundary, "2027-01-09", "2026-12-31", null)).toBe(false);
    expect(eligible(yearBoundary, "2027-01-15", "2026-12-31", null)).toBe(true);
  });

  it("keeps N-week end dates inclusive", () => {
    const schedule = { kind: "every_n_weeks" as const, interval_weeks: 2, weekdays: [5] };
    expect(eligible(schedule, "2026-10-02", "2026-10-01", "2026-10-02")).toBe(true);
    expect(eligible(schedule, "2026-10-16", "2026-10-01", "2026-10-15")).toBe(false);
  });

  it("supports exact monthly day and month-end rules without clamping", () => {
    expect(eligible({ kind: "monthly_day", day_of_month: 1 }, "2024-02-01")).toBe(true);
    expect(eligible({ kind: "monthly_day", day_of_month: 29 }, "2024-02-29")).toBe(true);
    expect(eligible({ kind: "monthly_day", day_of_month: 29 }, "2023-02-28")).toBe(false);
    expect(eligible({ kind: "monthly_day", day_of_month: 31 }, "2024-04-30")).toBe(false);
    expect(eligible({ kind: "monthly_last_day" }, "2024-02-29")).toBe(true);
    expect(eligible({ kind: "monthly_last_day" }, "2024-04-30")).toBe(true);
    expect(eligible({ kind: "monthly_last_day" }, "2024-05-30")).toBe(false);
  });

  it("supports Nth and final weekday rules, including missing fifth weekdays", () => {
    expect(eligible({ kind: "monthly_nth_weekday", ordinal: 1, weekday: 1 }, "2024-01-01")).toBe(true);
    expect(eligible({ kind: "monthly_nth_weekday", ordinal: 2, weekday: 1 }, "2024-01-08")).toBe(true);
    expect(eligible({ kind: "monthly_nth_weekday", ordinal: 5, weekday: 4 }, "2024-02-29")).toBe(true);
    expect(eligible({ kind: "monthly_nth_weekday", ordinal: 5, weekday: 1 }, "2024-02-26")).toBe(false);
    expect(eligible({ kind: "monthly_last_weekday", weekday: 5 }, "2024-03-29")).toBe(true);
    expect(eligible({ kind: "monthly_last_weekday", weekday: 5 }, "2024-03-22")).toBe(false);
  });

  it("uses month phase zero for N-month schedules across the year boundary", () => {
    const day = { kind: "every_n_months_day" as const, interval_months: 3, day_of_month: 10 };
    expect(eligible(day, "2024-01-10", "2024-01-20")).toBe(false);
    expect(eligible(day, "2024-04-10", "2024-01-20")).toBe(true);
    expect(eligible(day, "2024-07-10", "2024-01-20")).toBe(true);
    expect(eligible(day, "2025-01-10", "2024-01-20")).toBe(true);
    expect(eligible(day, "2024-02-10", "2024-01-20")).toBe(false);
    expect(eligible({ kind: "every_n_months_last_day", interval_months: 2 }, "2024-03-31", "2024-01-01")).toBe(true);
    expect(eligible({ kind: "every_n_months_last_day", interval_months: 2 }, "2024-04-30", "2024-01-01")).toBe(false);
  });

  it("honors inclusive period bounds and rejects invalid civil dates", () => {
    expect(eligible({ kind: "daily" }, "2024-01-01", "2024-01-01", "2024-01-01")).toBe(true);
    expect(eligible({ kind: "daily" }, "2024-01-02", "2024-01-01", "2024-01-01")).toBe(false);
    expect(eligible({ kind: "monthly_day", day_of_month: 1 }, "2024-02-30")).toBe(false);
  });
});
