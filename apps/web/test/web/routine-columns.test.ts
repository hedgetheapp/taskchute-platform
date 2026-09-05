import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultRoutineColumnPreference,
  normalizeRoutineColumnPreference,
  persistRoutineColumnPreference,
  readPersistedRoutineColumnPreference,
  reorderRoutineColumns,
  ROUTINE_COLUMNS_STORAGE_KEY,
} from "../../src/web/routine-columns";

describe("Routine Board column preference", () => {
  beforeEach(() => localStorage.clear());

  it("falls back from malformed storage and completes a partial order safely", () => {
    localStorage.setItem(ROUTINE_COLUMNS_STORAGE_KEY, "not-json");
    expect(readPersistedRoutineColumnPreference()).toEqual(defaultRoutineColumnPreference());
    const normalized = normalizeRoutineColumnPreference({ version: 1, order: ["task", "task", "unknown"], widths: { task: 10 } });
    expect(normalized.order.slice(0, 2)).toEqual(["task", "enabled"]);
    expect(normalized.widths.task).toBe(220);
  });

  it("reorders columns, clamps widths, and persists a reloadable preference", () => {
    const defaults = defaultRoutineColumnPreference();
    const order = reorderRoutineColumns(defaults.order, "task", "schedule", "after");
    const preference = normalizeRoutineColumnPreference({ ...defaults, order, widths: { ...defaults.widths, task: 480 } });
    persistRoutineColumnPreference(preference);
    expect(readPersistedRoutineColumnPreference().order.slice(0, 4)).toEqual(["enabled", "schedule", "task", "plannedStart"]);
    expect(readPersistedRoutineColumnPreference().widths.task).toBe(480);
  });
});
