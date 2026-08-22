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
