import { Temporal as PolyfillTemporal } from "@js-temporal/polyfill";

export interface TaskChuteDaySettings {
  timezone: string;
  boundaryMinutes: number;
}

export interface ResolvedTaskChuteDay {
  logicalDate: string;
  startInstant: string;
  endInstant: string;
  timezone: string;
  boundaryMinutes: number;
  disambiguation: "compatible";
}

interface TemporalPlainDate {
  year: number;
  month: number;
  day: number;
  subtract(duration: { days: number }): TemporalPlainDate;
  add(duration: { days: number }): TemporalPlainDate;
  toString(): string;
}

interface TemporalZonedDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  toPlainDate(): TemporalPlainDate;
  toInstant(): { toString(): string };
}

interface TemporalInstant {
  toZonedDateTimeISO(timezone: string): TemporalZonedDateTime;
}

interface TemporalNamespace {
  Instant: {
    from(value: string): TemporalInstant;
    compare(left: string, right: string): -1 | 0 | 1;
  };
  ZonedDateTime: {
    from(
      fields: { timeZone: string; year: number; month: number; day: number; hour: number; minute: number },
      options: { disambiguation: "compatible" },
    ): TemporalZonedDateTime;
  };
}

export function isLogicalDate(value: string): boolean {
  try {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && PolyfillTemporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

function temporal(): TemporalNamespace {
  const namespace = (globalThis as typeof globalThis & { Temporal?: TemporalNamespace }).Temporal;
  return namespace ?? PolyfillTemporal;
}

function resolveBoundaryInstant(date: TemporalPlainDate, settings: TaskChuteDaySettings): string {
  const hour = Math.floor(settings.boundaryMinutes / 60);
  const minute = settings.boundaryMinutes % 60;
  return temporal()
    .ZonedDateTime.from(
      { timeZone: settings.timezone, year: date.year, month: date.month, day: date.day, hour, minute },
      { disambiguation: "compatible" },
    )
    .toInstant()
    .toString();
}

export function resolveLogicalMinuteInstant(
  logicalDate: string,
  timezone: string,
  logicalMinute: number,
): string {
  if (!Number.isInteger(logicalMinute) || logicalMinute < 0 || logicalMinute > 2879) {
    throw new Error("Invalid extended logical minute");
  }
  const date = PolyfillTemporal.PlainDate.from(logicalDate).add({ days: Math.floor(logicalMinute / 1440) });
  const minuteOfDay = logicalMinute % 1440;
  return temporal()
    .ZonedDateTime.from(
      {
        timeZone: timezone,
        year: date.year,
        month: date.month,
        day: date.day,
        hour: Math.floor(minuteOfDay / 60),
        minute: minuteOfDay % 60,
      },
      { disambiguation: "compatible" },
    )
    .toInstant()
    .toString();
}

export function resolveSectionIntervals(
  day: Pick<ResolvedTaskChuteDay, "logicalDate" | "timezone" | "startInstant" | "endInstant">,
  ranges: Array<{ logicalStartMinute: number; logicalEndMinute: number }>,
): Array<{ actualStartInstant: string; actualEndInstant: string }> {
  const intervals = ranges.map((range) => ({
    actualStartInstant: resolveLogicalMinuteInstant(day.logicalDate, day.timezone, range.logicalStartMinute),
    actualEndInstant: resolveLogicalMinuteInstant(day.logicalDate, day.timezone, range.logicalEndMinute),
  }));
  for (const [index, interval] of intervals.entries()) {
    if (temporal().Instant.compare(interval.actualStartInstant, interval.actualEndInstant) >= 0) {
      throw new Error("Section configuration resolves to a non-positive actual interval");
    }
    if (index > 0 && intervals[index - 1]?.actualEndInstant !== interval.actualStartInstant) {
      throw new Error("Section actual intervals are not adjacent");
    }
  }
  if (intervals[0]?.actualStartInstant !== day.startInstant || intervals.at(-1)?.actualEndInstant !== day.endInstant) {
    throw new Error("Section actual intervals do not match the TaskChuteDay interval");
  }
  return intervals;
}

export function validateSectionConfiguration(
  boundaryMinutes: number,
  ranges: Array<{ logicalStartMinute: number; logicalEndMinute: number }>,
): boolean {
  if (ranges.length === 0 || ranges[0]?.logicalStartMinute !== boundaryMinutes || ranges.at(-1)?.logicalEndMinute !== boundaryMinutes + 1440) {
    return false;
  }
  return ranges.every((range, index) =>
    Number.isInteger(range.logicalStartMinute)
    && Number.isInteger(range.logicalEndMinute)
    && range.logicalStartMinute < range.logicalEndMinute
    && (index === 0 || ranges[index - 1]?.logicalEndMinute === range.logicalStartMinute));
}

export function resolveTaskChuteDay(nowInstant: string, settings: TaskChuteDaySettings): ResolvedTaskChuteDay {
  if (!Number.isInteger(settings.boundaryMinutes) || settings.boundaryMinutes < 0 || settings.boundaryMinutes > 1439) {
    throw new Error("Invalid TaskChuteDay boundary");
  }
  const namespace = temporal();
  const now = namespace.Instant.from(nowInstant);
  const zonedNow = now.toZonedDateTimeISO(settings.timezone);
  const localDate = zonedNow.toPlainDate();
  const localDateBoundary = resolveBoundaryInstant(localDate, settings);
  const logicalDate = namespace.Instant.compare(nowInstant, localDateBoundary) < 0 ? localDate.subtract({ days: 1 }) : localDate;
  const nextDate = logicalDate.add({ days: 1 });
  return {
    logicalDate: logicalDate.toString(),
    startInstant: resolveBoundaryInstant(logicalDate, settings),
    endInstant: resolveBoundaryInstant(nextDate, settings),
    timezone: settings.timezone,
    boundaryMinutes: settings.boundaryMinutes,
    disambiguation: "compatible",
  };
}

export function resolveTaskChuteDayForLogicalDate(
  logicalDate: string,
  settings: TaskChuteDaySettings,
): ResolvedTaskChuteDay {
  if (!isLogicalDate(logicalDate)) throw new Error("Invalid logical date");
  if (!Number.isInteger(settings.boundaryMinutes) || settings.boundaryMinutes < 0 || settings.boundaryMinutes > 1439) {
    throw new Error("Invalid TaskChuteDay boundary");
  }
  const date = PolyfillTemporal.PlainDate.from(logicalDate);
  return {
    logicalDate,
    startInstant: resolveBoundaryInstant(date, settings),
    endInstant: resolveBoundaryInstant(date.add({ days: 1 }), settings),
    timezone: settings.timezone,
    boundaryMinutes: settings.boundaryMinutes,
    disambiguation: "compatible",
  };
}
