import { describe, expect, it } from "vitest";
import {
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
  reorderDayColumns,
} from "../../src/web/day-columns";

describe("Day Table column preference", () => {
  it("repairs duplicate, unknown, and missing order keys while preserving the stable default set", () => {
    const preference = normalizeDayColumnPreference({
      version: DAY_COLUMNS_STORAGE_VERSION,
      order: ["routine", "unknown", "routine", "actualEnd"],
      widths: { routine: 20, actualEnd: 9999, unknown: 20 },
    });
    expect(preference.order).toEqual(["routine", "actualEnd", ...DEFAULT_DAY_COLUMN_ORDER.filter((key) => !["routine", "actualEnd"].includes(key))]);
    expect(preference.widths.routine).toBe(72);
    expect(preference.widths.actualEnd).toBe(170);
    expect(normalizeDayColumnPreference({ version: 99, order: ["routine"] })).toEqual(defaultDayColumnPreference());
    expect(normalizeDayColumnPreference("malformed")).toEqual(defaultDayColumnPreference());
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
