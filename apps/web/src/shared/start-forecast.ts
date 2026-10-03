import { Temporal } from "@js-temporal/polyfill";
import type { CurrentTaskChuteDayProjection, EntryProjection, SectionProjection } from "./contracts";

export interface EntryStartForecast {
  startInstant: string;
  endInstant: string | null;
  fixedStart: boolean;
  conflictSeconds: number;
  sectionId: string;
}

export interface SectionForecastWarning {
  overlapSeconds: number;
  overflowSeconds: number;
}

export interface StartForecastResult {
  byEntryId: Readonly<Record<string, EntryStartForecast>>;
  bySectionId: Readonly<Record<string, SectionForecastWarning>>;
}

function instantMilliseconds(value: string): number {
  return Number(Temporal.Instant.from(value).epochMilliseconds);
}

function instantFromMilliseconds(value: number): string {
  return Temporal.Instant.fromEpochMilliseconds(Math.trunc(value)).toString();
}

function forecastSections(day: CurrentTaskChuteDayProjection): SectionProjection[] {
  return day.sections.filter((section) => section.logical_start_minute !== null && section.logical_end_minute !== null);
}

function forecastQueue(day: CurrentTaskChuteDayProjection): Array<{ section: SectionProjection; entry: EntryProjection }> {
  return forecastSections(day).flatMap((section) => section.entries
    .filter((entry) => entry.lifecycle_state === "planned")
    .map((entry) => ({ section, entry })));
}

function logicalMinuteInstant(logicalDate: string, timezone: string, minute: number): string | null {
  if (!Number.isSafeInteger(minute) || minute < 0 || minute > 2880) return null;
  try {
    const date = Temporal.PlainDate.from(logicalDate).add({ days: Math.floor(minute / 1440) });
    return Temporal.ZonedDateTime.from({
      timeZone: timezone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: Math.floor((minute % 1440) / 60),
      minute: minute % 60,
      second: 0,
    }).toInstant().toString();
  } catch {
    return null;
  }
}

function positiveSecondsCeiling(milliseconds: number): number {
  const positive = Math.max(milliseconds, 0);
  return positive === 0 ? 0 : Math.ceil(positive / 1000);
}

export function conflictMinutesCeiling(seconds: number): number {
  return seconds <= 0 ? 0 : Math.ceil(seconds / 60);
}

export function calculateStartForecast(
  day: CurrentTaskChuteDayProjection,
  effectiveNowInstant: string,
): StartForecastResult {
  if (day.establishment_state === "past_record_none" || (!day.is_current && !day.planning_enabled)) {
    return { byEntryId: {}, bySectionId: {} };
  }

  let cursorMilliseconds: number;
  if (day.is_current) {
    cursorMilliseconds = instantMilliseconds(effectiveNowInstant);
  } else {
    const startInstant = day.taskchute_day.start_instant;
    if (!startInstant) return { byEntryId: {}, bySectionId: {} };
    cursorMilliseconds = instantMilliseconds(startInstant);
  }

  const nowMilliseconds = instantMilliseconds(effectiveNowInstant);
  let activeForecastEndMilliseconds: number | null = null;
  const active = day.active_execution;
  if (day.is_current && active?.entry_estimate_seconds !== null && active?.entry_estimate_seconds !== undefined) {
    const elapsedMilliseconds = Math.max(nowMilliseconds - instantMilliseconds(active.started_at), 0);
    const remainingMilliseconds = Math.max(active.entry_estimate_seconds * 1000 - elapsedMilliseconds, 0);
    cursorMilliseconds += remainingMilliseconds;
    activeForecastEndMilliseconds = cursorMilliseconds;
  }

  const byEntryId: Record<string, EntryStartForecast> = {};
  const bySectionId: Record<string, SectionForecastWarning> = {};
  const timezone = day.taskchute_day.establishment_timezone;
  const logicalDate = day.taskchute_day.logical_date;

  for (const section of forecastSections(day)) {
    const sectionStart = section.logical_start_minute;
    const sectionEnd = section.logical_end_minute;
    if (sectionStart === null || sectionEnd === null || !Number.isSafeInteger(sectionStart)
      || !Number.isSafeInteger(sectionEnd) || sectionStart < 0 || sectionEnd <= sectionStart || sectionEnd > 2880) continue;

    const projectedEnds: number[] = [];
    if (activeForecastEndMilliseconds !== null && active
      && section.entries.some((entry) => entry.id === active.entry_id)) {
      projectedEnds.push(activeForecastEndMilliseconds);
    }
    let maximumOverlapSeconds = 0;

    for (const entry of section.entries) {
      if (entry.lifecycle_state !== "planned") continue;
      const plannedMinute = entry.planned_start_minute;
      const anchorInstant = entry.start_reminder_offset_minutes != null
        && Number.isSafeInteger(plannedMinute) && plannedMinute !== null && plannedMinute >= 0 && plannedMinute <= 2879
        && timezone
        ? logicalMinuteInstant(logicalDate, timezone, plannedMinute)
        : null;
      const fixedStart = anchorInstant !== null;
      const startMilliseconds = fixedStart ? instantMilliseconds(anchorInstant) : cursorMilliseconds;
      const conflictSeconds = fixedStart
        ? positiveSecondsCeiling(cursorMilliseconds - startMilliseconds)
        : 0;
      const estimateSeconds = entry.estimate_seconds;
      const validEstimateSeconds = Number.isSafeInteger(estimateSeconds) && estimateSeconds !== null && estimateSeconds >= 0
        ? estimateSeconds
        : null;
      const endMilliseconds = validEstimateSeconds === null ? null : startMilliseconds + validEstimateSeconds * 1000;

      byEntryId[entry.id] = {
        startInstant: instantFromMilliseconds(startMilliseconds),
        endInstant: endMilliseconds === null ? null : instantFromMilliseconds(endMilliseconds),
        fixedStart,
        conflictSeconds,
        sectionId: section.id,
      };
      if (conflictSeconds > maximumOverlapSeconds) maximumOverlapSeconds = conflictSeconds;
      if (endMilliseconds !== null) projectedEnds.push(endMilliseconds);
      // D-145 resumes from the fixed anchor when its estimate is absent; no hidden time is added.
      cursorMilliseconds = endMilliseconds ?? startMilliseconds;
    }

    const sectionEndInstant = timezone ? logicalMinuteInstant(logicalDate, timezone, sectionEnd) : null;
    const lastProjectedEnd = projectedEnds.length > 0 ? Math.max(...projectedEnds) : null;
    const overflowSeconds = sectionEndInstant && lastProjectedEnd !== null
      ? positiveSecondsCeiling(lastProjectedEnd - instantMilliseconds(sectionEndInstant))
      : 0;
    if (maximumOverlapSeconds > 0 || overflowSeconds > 0) {
      bySectionId[section.id] = { overlapSeconds: maximumOverlapSeconds, overflowSeconds };
    }
  }

  return { byEntryId, bySectionId };
}

export function formatStartForecast(
  forecastInstant: string | undefined,
  logicalDate: string,
  timezone: string | null,
): string {
  if (!forecastInstant || !timezone) return "—";
  try {
    const zoned = Temporal.Instant.from(forecastInstant).toZonedDateTimeISO(timezone);
    const dayOffset = zoned.toPlainDate().since(Temporal.PlainDate.from(logicalDate), { largestUnit: "day" }).days;
    const logicalMinute = dayOffset * 1440 + zoned.hour * 60 + zoned.minute;
    const sign = logicalMinute < 0 ? "-" : "";
    const absolute = Math.abs(logicalMinute);
    return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

export function advanceProjectionClock(serverInstant: string, elapsedMilliseconds: number): string {
  return instantFromMilliseconds(instantMilliseconds(serverInstant) + Math.max(elapsedMilliseconds, 0));
}
