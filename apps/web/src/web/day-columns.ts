import { Temporal } from "@js-temporal/polyfill";
import type { CSSProperties } from "react";
import type { ExecutionSummaryProjection } from "../shared/contracts";

export const DAY_COLUMNS_STORAGE_KEY = "taskchute.web.day-columns.v2";
export const DAY_COLUMNS_V1_STORAGE_KEY = "taskchute.web.day-columns.v1";
export const DAY_COLUMNS_STORAGE_VERSION = 2 as const;

export type DayColumnKey =
  | "project"
  | "section"
  | "routine"
  | "estimate"
  | "plannedStart"
  | "forecast"
  | "actualStart"
  | "actualEnd"
  | "actualDuration";

export interface DayColumnDefinition {
  key: DayColumnKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  cellClassName: string;
  resizable: true;
  reorderable: true;
}

export const DAY_COLUMN_DEFINITIONS: readonly DayColumnDefinition[] = [
  { key: "project", label: "Project", defaultWidth: 150, minWidth: 100, maxWidth: 340, cellClassName: "project-name", resizable: true, reorderable: true },
  { key: "section", label: "Section", defaultWidth: 130, minWidth: 110, maxWidth: 280, cellClassName: "section-cell", resizable: true, reorderable: true },
  { key: "routine", label: "Routine", defaultWidth: 82, minWidth: 72, maxWidth: 180, cellClassName: "routine-cell", resizable: true, reorderable: true },
  { key: "estimate", label: "見積", defaultWidth: 90, minWidth: 72, maxWidth: 180, cellClassName: "estimate-cell", resizable: true, reorderable: true },
  { key: "plannedStart", label: "開始予定", defaultWidth: 102, minWidth: 90, maxWidth: 190, cellClassName: "planned-start-cell", resizable: true, reorderable: true },
  { key: "forecast", label: "開始見込", defaultWidth: 102, minWidth: 90, maxWidth: 190, cellClassName: "forecast-cell", resizable: true, reorderable: true },
  { key: "actualStart", label: "開始", defaultWidth: 86, minWidth: 76, maxWidth: 170, cellClassName: "actual-start-cell", resizable: true, reorderable: true },
  { key: "actualEnd", label: "終了", defaultWidth: 86, minWidth: 76, maxWidth: 170, cellClassName: "actual-end-cell", resizable: true, reorderable: true },
  { key: "actualDuration", label: "実績", defaultWidth: 96, minWidth: 76, maxWidth: 190, cellClassName: "actual-duration-cell", resizable: true, reorderable: true },
];

export const DEFAULT_DAY_COLUMN_ORDER: readonly DayColumnKey[] = DAY_COLUMN_DEFINITIONS.map(({ key }) => key);

export type DayColumnWidths = Record<DayColumnKey, number>;

export interface DayColumnPreference {
  version: typeof DAY_COLUMNS_STORAGE_VERSION;
  order: DayColumnKey[];
  widths: DayColumnWidths;
  hidden: DayColumnKey[];
}

const definitionByKey = new Map(DAY_COLUMN_DEFINITIONS.map((definition) => [definition.key, definition]));

export function clampDayColumnWidth(key: DayColumnKey, value: number): number {
  const definition = definitionByKey.get(key)!;
  if (!Number.isFinite(value)) return definition.defaultWidth;
  return Math.round(Math.max(definition.minWidth, Math.min(definition.maxWidth, value)));
}

export function defaultDayColumnPreference(): DayColumnPreference {
  return {
    version: DAY_COLUMNS_STORAGE_VERSION,
    order: [...DEFAULT_DAY_COLUMN_ORDER],
    widths: Object.fromEntries(DAY_COLUMN_DEFINITIONS.map(({ key, defaultWidth }) => [key, defaultWidth])) as DayColumnWidths,
    hidden: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeDayColumnPreference(value: unknown): DayColumnPreference {
  const fallback = defaultDayColumnPreference();
  if (!isRecord(value) || (value.version !== 1 && value.version !== DAY_COLUMNS_STORAGE_VERSION)) return fallback;

  const knownKeys = new Set<DayColumnKey>(DEFAULT_DAY_COLUMN_ORDER);
  const order: DayColumnKey[] = [];
  if (Array.isArray(value.order)) {
    for (const key of value.order) {
      if (typeof key === "string" && knownKeys.has(key as DayColumnKey) && !order.includes(key as DayColumnKey)) {
        order.push(key as DayColumnKey);
      }
    }
  }
  for (const key of DEFAULT_DAY_COLUMN_ORDER) if (!order.includes(key)) order.push(key);

  const widths = { ...fallback.widths };
  if (isRecord(value.widths)) {
    for (const key of DEFAULT_DAY_COLUMN_ORDER) {
      const width = value.widths[key];
      if (typeof width === "number" && Number.isFinite(width)) widths[key] = clampDayColumnWidth(key, width);
    }
  }
  const hidden: DayColumnKey[] = [];
  if (value.version === DAY_COLUMNS_STORAGE_VERSION && Array.isArray(value.hidden)) {
    for (const key of value.hidden) {
      if (typeof key === "string" && knownKeys.has(key as DayColumnKey) && !hidden.includes(key as DayColumnKey)) {
        hidden.push(key as DayColumnKey);
      }
    }
  }
  return { version: DAY_COLUMNS_STORAGE_VERSION, order, widths, hidden };
}

export function readPersistedDayColumnPreference(): DayColumnPreference {
  if (typeof window === "undefined") return defaultDayColumnPreference();
  try {
    const raw = window.localStorage.getItem(DAY_COLUMNS_STORAGE_KEY);
    if (raw !== null) {
      try {
        return normalizeDayColumnPreference(JSON.parse(raw));
      } catch {
        return defaultDayColumnPreference();
      }
    }
    const legacyRaw = window.localStorage.getItem(DAY_COLUMNS_V1_STORAGE_KEY);
    if (legacyRaw === null) return defaultDayColumnPreference();
    try {
      return normalizeDayColumnPreference(JSON.parse(legacyRaw));
    } catch {
      return defaultDayColumnPreference();
    }
  } catch {
    return defaultDayColumnPreference();
  }
}

export function persistDayColumnPreference(preference: DayColumnPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAY_COLUMNS_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // localStorage may be unavailable or full; the in-memory preference remains usable.
  }
}

export function reorderDayColumns(order: readonly DayColumnKey[], sourceKey: DayColumnKey, targetKey: DayColumnKey, edge: "before" | "after"): DayColumnKey[] {
  if (sourceKey === targetKey) return [...order];
  const withoutSource = order.filter((key) => key !== sourceKey);
  const targetIndex = withoutSource.indexOf(targetKey);
  if (targetIndex < 0) return [...order];
  withoutSource.splice(targetIndex + (edge === "after" ? 1 : 0), 0, sourceKey);
  return withoutSource;
}

export function visibleDayColumnOrder(preference: DayColumnPreference): DayColumnKey[] {
  const hidden = new Set(preference.hidden);
  return preference.order.filter((key) => !hidden.has(key));
}

export function setDayColumnVisibility(preference: DayColumnPreference, key: DayColumnKey, visible: boolean): DayColumnPreference {
  const hidden = visible
    ? preference.hidden.filter((hiddenKey) => hiddenKey !== key)
    : preference.hidden.includes(key) ? [...preference.hidden] : [...preference.hidden, key];
  return { ...preference, hidden };
}

export function showAllDayColumns(preference: DayColumnPreference): DayColumnPreference {
  return { ...preference, hidden: [] };
}

export function resetDayColumnPreference(): DayColumnPreference {
  return defaultDayColumnPreference();
}

export type DayTableResizeLayout = {
  taskWidth: number;
  tableWidth: number;
};

export function buildDayTableGridTemplate(preference: DayColumnPreference, taskWidth?: number): string {
  const taskTrack = taskWidth === undefined ? "minmax(280px, 1fr)" : `${Math.max(280, Math.round(taskWidth))}px`;
  return ["32px", "52px", taskTrack, ...visibleDayColumnOrder(preference).map((key) => `${preference.widths[key]}px`), "40px"].join(" ");
}

export function calculateDayTableMinWidth(preference: DayColumnPreference, taskWidth = 280): number {
  return 32 + 52 + Math.max(280, Math.round(taskWidth)) + visibleDayColumnOrder(preference).reduce((sum, key) => sum + preference.widths[key], 0) + 40;
}

export function dayTableStyle(preference: DayColumnPreference, resizeLayout?: DayTableResizeLayout): CSSProperties {
  const taskWidth = resizeLayout?.taskWidth;
  const minimumWidth = calculateDayTableMinWidth(preference, taskWidth);
  return {
    "--day-table-grid-template-columns": buildDayTableGridTemplate(preference, taskWidth),
    "--day-table-min-width": `${Math.max(minimumWidth, resizeLayout?.tableWidth ?? 0)}px`,
  } as CSSProperties;
}

export function formatActualTime(instant: string | null, logicalDate: string, timezone: string | null): string {
  if (!instant || !timezone) return "—";
  try {
    const zoned = Temporal.Instant.from(instant).toZonedDateTimeISO(timezone);
    const dayOffset = zoned.toPlainDate().since(Temporal.PlainDate.from(logicalDate), { largestUnit: "day" }).days;
    const logicalMinute = dayOffset * 1440 + zoned.hour * 60 + zoned.minute;
    return `${String(Math.floor(logicalMinute / 60)).padStart(2, "0")}:${String(logicalMinute % 60).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

export function formatActualDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ""}`
    : `${minutes}分`;
}

export function actualDurationSeconds(summary: ExecutionSummaryProjection | undefined, displayInstant: string, includeActive = true): number | null {
  if (!summary) return null;
  const hasExecution = summary.first_started_at !== null || summary.last_ended_at !== null || summary.active_started_at !== null;
  if (!hasExecution) return null;
  let seconds = Math.max(0, summary.completed_duration_seconds);
  if (includeActive && summary.active_started_at) {
    const elapsed = Math.floor((Date.parse(displayInstant) - Date.parse(summary.active_started_at)) / 1000);
    if (Number.isFinite(elapsed)) seconds += Math.max(0, elapsed);
  }
  return seconds;
}
