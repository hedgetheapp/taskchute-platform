import { Temporal } from "@js-temporal/polyfill";
import type { CurrentTaskChuteDayProjection, EntryProjection } from "./contracts";

export type StartForecastByEntryId = Readonly<Record<string, string>>;

function instantMilliseconds(value: string): number {
  return Number(Temporal.Instant.from(value).epochMilliseconds);
}

function instantFromMilliseconds(value: number): string {
  return Temporal.Instant.fromEpochMilliseconds(Math.trunc(value)).toString();
}

function forecastQueue(day: CurrentTaskChuteDayProjection): EntryProjection[] {
  return day.sections
    .filter((section) => section.logical_start_minute !== null && section.logical_end_minute !== null)
    .flatMap((section) => section.entries)
    .filter((entry) => entry.lifecycle_state === "planned");
}

export function calculateStartForecast(
  day: CurrentTaskChuteDayProjection,
  effectiveNowInstant: string,
): StartForecastByEntryId {
  if (day.establishment_state === "past_record_none" || (!day.is_current && !day.planning_enabled)) return {};

  let cursorMilliseconds: number;
  if (day.is_current) {
    cursorMilliseconds = instantMilliseconds(effectiveNowInstant);
    const active = day.active_execution;
    if (active?.entry_estimate_seconds !== null && active?.entry_estimate_seconds !== undefined) {
      const elapsedMilliseconds = Math.max(cursorMilliseconds - instantMilliseconds(active.started_at), 0);
      const remainingMilliseconds = Math.max(active.entry_estimate_seconds * 1000 - elapsedMilliseconds, 0);
      cursorMilliseconds += remainingMilliseconds;
    }
  } else {
    const startInstant = day.taskchute_day.start_instant;
    if (!startInstant) return {};
    cursorMilliseconds = instantMilliseconds(startInstant);
  }

  const result: Record<string, string> = {};
  for (const entry of forecastQueue(day)) {
    result[entry.id] = instantFromMilliseconds(cursorMilliseconds);
    cursorMilliseconds += (entry.estimate_seconds ?? 0) * 1000;
  }
  return result;
}

export function formatStartForecast(
  forecastInstant: string | undefined,
  logicalDate: string,
  timezone: string | null,
): string {
  if (!forecastInstant || !timezone) return "—";
  const zoned = Temporal.Instant.from(forecastInstant).toZonedDateTimeISO(timezone);
  const dayOffset = zoned.toPlainDate().since(Temporal.PlainDate.from(logicalDate), { largestUnit: "day" }).days;
  const logicalMinute = dayOffset * 1440 + zoned.hour * 60 + zoned.minute;
  const sign = logicalMinute < 0 ? "-" : "";
  const absolute = Math.abs(logicalMinute);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function advanceProjectionClock(serverInstant: string, elapsedMilliseconds: number): string {
  return instantFromMilliseconds(instantMilliseconds(serverInstant) + Math.max(elapsedMilliseconds, 0));
}
