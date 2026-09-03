import { describe, expect, it } from "vitest";
import {
  DAY_COLUMNS_V1_STORAGE_KEY,
  DAY_COLUMNS_STORAGE_KEY,
  DAY_COLUMNS_STORAGE_VERSION,
  DEFAULT_DAY_COLUMN_ORDER,
  actualDurationSeconds,
  buildDayTableGridTemplate,
  calculateDayTableMinWidth,
  clampDayColumnWidth,
  defaultDayColumnPreference,
  formatActualDuration,
  formatActualTime,
  normalizeDayColumnPreference,
  readPersistedDayColumnPreference,
  reorderDayColumns,
  resetDayColumnPreference,
  setDayColumnVisibility,
  showAllDayColumns,
  visibleDayColumnOrder,
} from "../../src/web/day-columns";

describe("Day Table column preference", () => {
  it("defaults every current column to visible and migrates the v1 envelope", () => {
    const preference = normalizeDayColumnPreference({
      version: 1,
      order: ["section", "project"],
      widths: { project: 220 },
    });
    expect(preference.version).toBe(2);
    expect(preference.hidden).toEqual([]);
    expect(preference.order.slice(0, 2)).toEqual(["section", "project"]);
    expect(preference.widths.project).toBe(220);
    expect(defaultDayColumnPreference().hidden).toEqual([]);
  });

  it("repairs duplicate, unknown, and missing order keys while preserving the stable default set", () => {
    const preference = normalizeDayColumnPreference({
      version: DAY_COLUMNS_STORAGE_VERSION,
      order: ["routine", "unknown", "routine", "actualEnd"],
      widths: { routine: 20, actualEnd: 9999, unknown: 20 },
      hidden: ["actualEnd", "unknown", "actualEnd"],
    });
    expect(preference.order).toEqual(["routine", "actualEnd", ...DEFAULT_DAY_COLUMN_ORDER.filter((key) => !["routine", "actualEnd"].includes(key))]);
    expect(preference.widths.routine).toBe(72);
    expect(preference.widths.actualEnd).toBe(170);
    expect(preference.hidden).toEqual(["actualEnd"]);
    expect(normalizeDayColumnPreference({ version: 99, order: ["routine"] })).toEqual(defaultDayColumnPreference());
    expect(normalizeDayColumnPreference("malformed")).toEqual(defaultDayColumnPreference());
  });

  it("reads v2 first and safely migrates the legacy browser-local key", () => {
    window.localStorage.setItem(DAY_COLUMNS_V1_STORAGE_KEY, JSON.stringify({
      version: 1, order: ["routine", "project"], widths: { project: 220 },
    }));
    expect(readPersistedDayColumnPreference()).toMatchObject({ version: 2, hidden: [], widths: { project: 220 } });
    expect(readPersistedDayColumnPreference().order.slice(0, 2)).toEqual(["routine", "project"]);

    window.localStorage.setItem(DAY_COLUMNS_STORAGE_KEY, JSON.stringify({
      version: 2, order: ["actualDuration"], widths: { actualDuration: 140 }, hidden: ["project", "project", "unknown"],
    }));
    expect(readPersistedDayColumnPreference()).toMatchObject({ hidden: ["project"], widths: { actualDuration: 140 } });
  });

  it("keeps full order and widths while resolving visible tracks", () => {
    const preference = setDayColumnVisibility(defaultDayColumnPreference(), "project", false);
    const resized = { ...preference, widths: { ...preference.widths, project: 220 } };
    expect(resized.order.slice(0, 2)).toEqual(["project", "section"]);
    expect(visibleDayColumnOrder(resized).slice(0, 2)).toEqual(["section", "routine"]);
    expect(buildDayTableGridTemplate(resized)).not.toContain("220px");
    expect(calculateDayTableMinWidth(resized)).toBe(calculateDayTableMinWidth(defaultDayColumnPreference()) - 150);
    const shown = setDayColumnVisibility(resized, "project", true);
    expect(visibleDayColumnOrder(shown).slice(0, 2)).toEqual(["project", "section"]);
    expect(buildDayTableGridTemplate(shown)).toContain("220px");
  });

  it("shows all without resetting order/width and resets the complete preference", () => {
    const customized = setDayColumnVisibility({
      ...defaultDayColumnPreference(),
      order: reorderDayColumns(DEFAULT_DAY_COLUMN_ORDER, "project", "routine", "before"),
      widths: { ...defaultDayColumnPreference().widths, project: 220 },
    }, "project", false);
    const shown = showAllDayColumns(customized);
    expect(shown.order.slice(0, 3)).toEqual(["section", "project", "routine"]);
    expect(shown.widths.project).toBe(220);
    expect(shown.hidden).toEqual([]);
    expect(resetDayColumnPreference()).toEqual(defaultDayColumnPreference());
  });

  it("reorders only the customizable region and clamps width/grid tracks", () => {
    const preference = defaultDayColumnPreference();
    const order = reorderDayColumns(preference.order, "project", "routine", "before");
    expect(order.slice(0, 3)).toEqual(["section", "project", "routine"]);
    expect(clampDayColumnWidth("project", 1)).toBe(100);
    expect(clampDayColumnWidth("project", 9999)).toBe(340);
    const resized = { ...preference, order, widths: { ...preference.widths, project: 200 } };
    expect(buildDayTableGridTemplate(resized)).toContain("minmax(280px, 1fr) 130px 200px 82px");
    expect(calculateDayTableMinWidth(resized)).toBeGreaterThan(1200);
  });
});

describe("Day Table actual presentation", () => {
  it("formats logical extended time and derived completed/active duration", () => {
    expect(formatActualTime("2026-08-23T01:10:00.000Z", "2026-08-22", "UTC")).toBe("25:10");
    expect(formatActualTime(null, "2026-08-22", "UTC")).toBe("—");
    const summary = {
      first_started_at: "2026-08-22T11:00:00.000Z",
      last_ended_at: null,
      completed_duration_seconds: 600,
      active_started_at: "2026-08-22T11:30:00.000Z",
    };
    expect(actualDurationSeconds(summary, "2026-08-22T12:00:00.000Z")).toBe(2400);
    expect(formatActualDuration(5_400)).toBe("1時間30分");
  });
});
