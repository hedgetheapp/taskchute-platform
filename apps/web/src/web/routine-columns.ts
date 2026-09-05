import type { CSSProperties } from "react";

export const ROUTINE_COLUMNS_STORAGE_KEY = "taskchute.web.routine-columns.v1";
export const ROUTINE_COLUMNS_STORAGE_VERSION = 1 as const;

export type RoutineColumnKey =
  | "enabled"
  | "task"
  | "schedule"
  | "plannedStart"
  | "estimate"
  | "project"
  | "section"
  | "startDate"
  | "endDate";

export interface RoutineColumnDefinition {
  key: RoutineColumnKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export const ROUTINE_COLUMN_DEFINITIONS: readonly RoutineColumnDefinition[] = [
  { key: "enabled", label: "有効", defaultWidth: 72, minWidth: 64, maxWidth: 120 },
  { key: "task", label: "タスク名", defaultWidth: 320, minWidth: 220, maxWidth: 640 },
  { key: "schedule", label: "繰り返し", defaultWidth: 150, minWidth: 120, maxWidth: 300 },
  { key: "plannedStart", label: "開始予定", defaultWidth: 120, minWidth: 96, maxWidth: 220 },
  { key: "estimate", label: "見積", defaultWidth: 96, minWidth: 80, maxWidth: 180 },
  { key: "project", label: "プロジェクト", defaultWidth: 180, minWidth: 130, maxWidth: 340 },
  { key: "section", label: "セクション", defaultWidth: 160, minWidth: 130, maxWidth: 320 },
  { key: "startDate", label: "開始日", defaultWidth: 150, minWidth: 132, maxWidth: 220 },
  { key: "endDate", label: "終了日", defaultWidth: 150, minWidth: 132, maxWidth: 220 },
];

export const DEFAULT_ROUTINE_COLUMN_ORDER: readonly RoutineColumnKey[] = ROUTINE_COLUMN_DEFINITIONS.map(({ key }) => key);
export type RoutineColumnWidths = Record<RoutineColumnKey, number>;
export interface RoutineColumnPreference {
  version: typeof ROUTINE_COLUMNS_STORAGE_VERSION;
  order: RoutineColumnKey[];
  widths: RoutineColumnWidths;
}

const definitionByKey = new Map(ROUTINE_COLUMN_DEFINITIONS.map((definition) => [definition.key, definition]));

export function clampRoutineColumnWidth(key: RoutineColumnKey, value: number): number {
  const definition = definitionByKey.get(key)!;
  if (!Number.isFinite(value)) return definition.defaultWidth;
  return Math.round(Math.max(definition.minWidth, Math.min(definition.maxWidth, value)));
}

export function defaultRoutineColumnPreference(): RoutineColumnPreference {
  return {
    version: ROUTINE_COLUMNS_STORAGE_VERSION,
    order: [...DEFAULT_ROUTINE_COLUMN_ORDER],
    widths: Object.fromEntries(ROUTINE_COLUMN_DEFINITIONS.map(({ key, defaultWidth }) => [key, defaultWidth])) as RoutineColumnWidths,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeRoutineColumnPreference(value: unknown): RoutineColumnPreference {
  const fallback = defaultRoutineColumnPreference();
  if (!isRecord(value) || value.version !== ROUTINE_COLUMNS_STORAGE_VERSION) return fallback;
  const known = new Set<RoutineColumnKey>(DEFAULT_ROUTINE_COLUMN_ORDER);
  const order: RoutineColumnKey[] = [];
  if (Array.isArray(value.order)) {
    for (const key of value.order) {
      if (typeof key === "string" && known.has(key as RoutineColumnKey) && !order.includes(key as RoutineColumnKey)) {
        order.push(key as RoutineColumnKey);
      }
    }
  }
  for (const key of DEFAULT_ROUTINE_COLUMN_ORDER) if (!order.includes(key)) order.push(key);
  const widths = { ...fallback.widths };
  if (isRecord(value.widths)) {
    for (const key of DEFAULT_ROUTINE_COLUMN_ORDER) {
      const width = value.widths[key];
      if (typeof width === "number" && Number.isFinite(width)) widths[key] = clampRoutineColumnWidth(key, width);
    }
  }
  return { version: ROUTINE_COLUMNS_STORAGE_VERSION, order, widths };
}

export function readPersistedRoutineColumnPreference(): RoutineColumnPreference {
  if (typeof window === "undefined") return defaultRoutineColumnPreference();
  try {
    const raw = window.localStorage.getItem(ROUTINE_COLUMNS_STORAGE_KEY);
    return raw === null ? defaultRoutineColumnPreference() : normalizeRoutineColumnPreference(JSON.parse(raw));
  } catch {
    return defaultRoutineColumnPreference();
  }
}

export function persistRoutineColumnPreference(preference: RoutineColumnPreference): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ROUTINE_COLUMNS_STORAGE_KEY, JSON.stringify(preference)); } catch { /* memory state remains usable */ }
}

export function reorderRoutineColumns(order: readonly RoutineColumnKey[], source: RoutineColumnKey,
  target: RoutineColumnKey, edge: "before" | "after"): RoutineColumnKey[] {
  if (source === target) return [...order];
  const without = order.filter((key) => key !== source);
  const index = without.indexOf(target);
  if (index < 0) return [...order];
  without.splice(index + (edge === "after" ? 1 : 0), 0, source);
  return without;
}

export function buildRoutineTableGridTemplate(preference: RoutineColumnPreference): string {
  return preference.order.map((key) => `${preference.widths[key]}px`).join(" ");
}

export function routineTableStyle(preference: RoutineColumnPreference): CSSProperties {
  return { "--routine-table-grid-template-columns": buildRoutineTableGridTemplate(preference) } as CSSProperties;
}

export function resetRoutineColumnPreference(): RoutineColumnPreference {
  return defaultRoutineColumnPreference();
}
