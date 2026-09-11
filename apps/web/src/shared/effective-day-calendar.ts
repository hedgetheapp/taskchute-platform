import { Temporal } from "@js-temporal/polyfill";
import { findJapaneseHoliday, JAPANESE_HOLIDAY_SOURCE, type JapaneseHolidayEntry } from "./japanese-holidays";

export type EffectiveDayKind = "workday" | "holiday" | "unknown";
export type EffectiveDayOverrideKind = "workday" | "holiday";

export interface EffectiveDayOverrideValue {
  logical_date: string;
  override_kind: EffectiveDayOverrideKind;
  reason: string | null;
  revision: number;
  updated_at: string;
}

export interface EffectiveDayClassification {
  logical_date: string;
  base: EffectiveDayKind;
  effective: EffectiveDayKind;
  official_entry: JapaneseHolidayEntry | null;
  override: EffectiveDayOverrideValue | null;
}

export interface EffectiveDayCoverage {
  start: string;
  end: string;
}

export function assertLogicalDate(logicalDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logicalDate)) throw new Error("Invalid logical date");
  try {
    const parsed = Temporal.PlainDate.from(logicalDate);
    if (parsed.toString() !== logicalDate) throw new Error("Invalid logical date");
  } catch {
    throw new Error("Invalid logical date");
  }
}

export function classifyEffectiveDay(input: {
  logicalDate: string;
  override?: EffectiveDayOverrideValue | null;
}): EffectiveDayClassification {
  assertLogicalDate(input.logicalDate);
  const date = Temporal.PlainDate.from(input.logicalDate);
  const officialEntry = findJapaneseHoliday(input.logicalDate);
  const covered = input.logicalDate >= JAPANESE_HOLIDAY_SOURCE.coverage_start
    && input.logicalDate <= JAPANESE_HOLIDAY_SOURCE.coverage_end;
  const base: EffectiveDayKind = date.dayOfWeek >= 6
    ? "holiday"
    : officialEntry !== null
      ? "holiday"
      : covered ? "workday" : "unknown";
  const override = input.override ?? null;
  return {
    logical_date: input.logicalDate,
    base,
    effective: override?.override_kind ?? base,
    official_entry: officialEntry,
    override,
  };
}

export function effectiveDayCoverage(): EffectiveDayCoverage {
  return { start: JAPANESE_HOLIDAY_SOURCE.coverage_start, end: JAPANESE_HOLIDAY_SOURCE.coverage_end };
}
