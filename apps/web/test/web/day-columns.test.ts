import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DAY_COLUMNS_V1_STORAGE_KEY,
  DAY_COLUMNS_V3_STORAGE_KEY,
  DAY_COLUMNS_STORAGE_KEY,
  DAY_COLUMNS_STORAGE_VERSION,
  DEFAULT_DAY_COLUMN_ORDER,
  actualDurationSeconds,
  buildDayTableGridTemplate,
  calculateDayTableMinWidth,
  clampDayColumnWidth,
  clampTaskColumnWidth,
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

const webStyles = readFileSync("src/web/styles.css", "utf8");

describe("Day Table column preference", () => {
  it("defaults every current column to visible and migrates the v1 envelope", () => {
    const preference = normalizeDayColumnPreference({
      version: 1,
      order: ["section", "project"],
      widths: { project: 220 },
    });
    expect(preference.version).toBe(4);
    expect(preference.hidden).toEqual([]);
    expect(preference.order.slice(0, 3)).toEqual(["section", "project", "mode"]);
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
    expect(readPersistedDayColumnPreference()).toMatchObject({ version: DAY_COLUMNS_STORAGE_VERSION, hidden: [], widths: { project: 220 } });
    expect(readPersistedDayColumnPreference().order.slice(0, 3)).toEqual(["routine", "project", "mode"]);

    window.localStorage.setItem(DAY_COLUMNS_STORAGE_KEY, JSON.stringify({
      version: 2, order: ["actualDuration"], widths: { actualDuration: 140 }, hidden: ["project", "project", "unknown"],
    }));
    expect(readPersistedDayColumnPreference()).toMatchObject({ hidden: ["project"], widths: { actualDuration: 140 } });
  });

  it("discovers v3 preferences and inserts the D-101 Note column after Section", () => {
    window.localStorage.removeItem(DAY_COLUMNS_STORAGE_KEY);
    window.localStorage.removeItem(DAY_COLUMNS_V1_STORAGE_KEY);
    window.localStorage.removeItem("taskchute.web.day-columns.v2");
    window.localStorage.setItem(DAY_COLUMNS_V3_STORAGE_KEY, JSON.stringify({
      version: 3,
      order: ["section", "project", "mode", "routine", "estimate"],
      widths: { project: 230, section: 145 },
      hidden: ["routine"],
      taskWidth: 410,
    }));
    const preference = readPersistedDayColumnPreference();
    expect(preference.version).toBe(DAY_COLUMNS_STORAGE_VERSION);
    expect(preference.order.slice(0, 5)).toEqual(["section", "note", "project", "mode", "routine"]);
    expect(preference.widths.project).toBe(230);
    expect(preference.widths.section).toBe(145);
    expect(preference.hidden).toEqual(["routine"]);
    expect(preference.taskWidth).toBe(410);
    expect(preference.order.filter((key) => key === "mode")).toHaveLength(1);
  });

  it("keeps full order and widths while resolving visible tracks", () => {
    const preference = setDayColumnVisibility(defaultDayColumnPreference(), "project", false);
    const resized = { ...preference, widths: { ...preference.widths, project: 220 } };
    expect(resized.order.slice(0, 2)).toEqual(["project", "mode"]);
    expect(visibleDayColumnOrder(resized).slice(0, 2)).toEqual(["mode", "section"]);
    expect(buildDayTableGridTemplate(resized)).not.toContain("220px");
    expect(calculateDayTableMinWidth(resized)).toBe(calculateDayTableMinWidth(defaultDayColumnPreference()) - 150);
    const shown = setDayColumnVisibility(resized, "project", true);
    expect(visibleDayColumnOrder(shown).slice(0, 2)).toEqual(["project", "mode"]);
    expect(buildDayTableGridTemplate(shown)).toContain("220px");
  });

  it("shows all without resetting order/width and resets the complete preference", () => {
    const customized = setDayColumnVisibility({
      ...defaultDayColumnPreference(),
      order: reorderDayColumns(DEFAULT_DAY_COLUMN_ORDER, "project", "routine", "before"),
      widths: { ...defaultDayColumnPreference().widths, project: 220 },
    }, "project", false);
    const shown = showAllDayColumns(customized);
    expect(shown.order.slice(0, 4)).toEqual(["mode", "section", "note", "project"]);
    expect(shown.widths.project).toBe(220);
    expect(shown.hidden).toEqual([]);
    expect(resetDayColumnPreference()).toEqual(defaultDayColumnPreference());
  });

  it("reorders only the customizable region and clamps width/grid tracks", () => {
    const preference = defaultDayColumnPreference();
    const order = reorderDayColumns(preference.order, "project", "routine", "before");
    expect(order.slice(0, 4)).toEqual(["mode", "section", "note", "project"]);
    expect(clampDayColumnWidth("project", 1)).toBe(100);
    expect(clampDayColumnWidth("project", 9999)).toBe(340);
    const resized = { ...preference, order, widths: { ...preference.widths, project: 200 } };
    expect(buildDayTableGridTemplate(resized)).toContain("minmax(180px, 1fr) 112px 130px 60px 200px 82px");
    expect(calculateDayTableMinWidth(resized)).toBeGreaterThan(1200);
  });

  it("normalizes legacy Task widths to the 180px minimum while preserving the default and maximum", () => {
    expect(clampTaskColumnWidth(1)).toBe(180);
    expect(clampTaskColumnWidth(640)).toBe(640);
    expect(clampTaskColumnWidth(9999)).toBe(640);
    expect(defaultDayColumnPreference().taskWidth).toBe(280);
    expect(normalizeDayColumnPreference({ version: DAY_COLUMNS_STORAGE_VERSION, taskWidth: 120 }).taskWidth).toBe(180);
    expect(calculateDayTableMinWidth(defaultDayColumnPreference(), 180))
      .toBe(calculateDayTableMinWidth(defaultDayColumnPreference(), 280) - 100);
  });
});

describe("Today metadata cell layout", () => {
  it("keeps Project and Mode labels/selectors on one truncated line", () => {
    expect(webStyles).toMatch(/\.task-main strong,\s*\.project-name\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
    expect(webStyles).toMatch(/\.project-title\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
    expect(webStyles).toMatch(/\.mode-cell\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
    expect(webStyles).toMatch(/\.project-selector\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
    expect(webStyles).toMatch(/\.mode-selector\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
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
