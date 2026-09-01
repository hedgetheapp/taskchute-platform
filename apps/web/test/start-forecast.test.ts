import { describe, expect, it } from "vitest";
import type { CurrentTaskChuteDayProjection, EntryProjection, SectionProjection } from "../src/shared/contracts";
import { advanceProjectionClock, calculateStartForecast, formatStartForecast } from "../src/shared/start-forecast";

const logicalDate = "2026-08-22";
const now = "2026-08-22T09:00:00Z";

function entry(id: string, estimate: number | null, state: EntryProjection["lifecycle_state"] = "planned"): EntryProjection {
  return { id, section_id: "section-a", position: Number(id.replace(/\D/g, "")) || 1, lifecycle_state: state,
    estimate_seconds: estimate, planned_start_minute: 1200, routine: null,
    task: { id: `task-${id}`, title: id, project: null } };
}

function section(id: string, entries: EntryProjection[], timed = true): SectionProjection {
  return { id, title: id, logical_start_minute: timed ? 300 : null, logical_end_minute: timed ? 900 : null,
    actual_start_instant: timed ? "2026-08-22T05:00:00Z" : null,
    actual_end_instant: timed ? "2026-08-22T15:00:00Z" : null,
    estimate_total_seconds: entries.reduce((sum, item) => sum + (item.estimate_seconds ?? 0), 0), entries };
}

function projection(overrides: Partial<CurrentTaskChuteDayProjection> = {}): CurrentTaskChuteDayProjection {
  const first = entry("entry-1", 600);
  const second = entry("entry-2", 1200);
  return {
    projection_generated_at: now,
    establishment_state: "established", is_current: true, planning_enabled: true, placement_revision: 0,
    section_configuration_required: false,
    taskchute_day: { id: "day", logical_date: logicalDate, start_instant: "2026-08-22T05:00:00Z",
      end_instant: "2026-08-23T05:00:00Z", establishment_timezone: "UTC", establishment_boundary_minutes: 300 },
    sections: [section("section-a", [first, second])], unsectioned_entries: [], active_execution: null,
    next_entry: first, ...overrides,
  } as CurrentTaskChuteDayProjection;
}

describe("Start Forecast v0.1", () => {
  it("forecasts current planned work from now without treating planned start as a barrier", () => {
    const result = calculateStartForecast(projection(), now);
    expect(result).toEqual({ "entry-1": now, "entry-2": "2026-08-22T09:10:00Z" });
  });

  it("adds zero for a null estimate and continues across Section boundaries", () => {
    const first = entry("entry-1", null);
    const second = { ...entry("entry-2", 600), section_id: "section-b" };
    const result = calculateStartForecast(projection({
      sections: [section("section-a", [first]), section("section-b", [second])],
    }), now);
    expect(result).toEqual({ "entry-1": now, "entry-2": now });
  });

  it("excludes Sectionなし, untimed legacy Sections, completed rows, and running self", () => {
    const planned = entry("entry-1", 600);
    const completed = entry("entry-2", 1200, "completed");
    const running = entry("entry-3", 900, "running");
    const unsectioned = { ...entry("entry-4", 3600), section_id: null };
    const untimed = { ...entry("entry-5", 3600), section_id: "legacy" };
    const result = calculateStartForecast(projection({
      sections: [section("section-a", [completed, running, planned]), section("legacy", [untimed], false)],
      unsectioned_entries: [unsectioned],
      active_execution: { id: "execution", entry_id: running.id, entry_estimate_seconds: 900,
        started_at: "2026-08-22T08:55:00Z", ended_at: null },
    }), now);
    expect(result).toEqual({ "entry-1": "2026-08-22T09:10:00Z" });
  });

  it("uses active estimate even when its Entry is outside the displayed Day", () => {
    const result = calculateStartForecast(projection({
      active_execution: { id: "execution", entry_id: "other-day-entry", entry_estimate_seconds: 1800,
        started_at: "2026-08-22T08:50:00Z", ended_at: null },
    }), now);
    expect(result["entry-1"]).toBe("2026-08-22T09:20:00Z");
  });

  it("keeps over-estimate and null-estimate running work at effective now", () => {
    const base = projection();
    expect(calculateStartForecast({ ...base, active_execution: { id: "execution", entry_id: "outside",
      entry_estimate_seconds: 300, started_at: "2026-08-22T08:00:00Z", ended_at: null } }, now)["entry-1"]).toBe(now);
    expect(calculateStartForecast({ ...base, active_execution: { id: "execution", entry_id: "outside",
      entry_estimate_seconds: null, started_at: "2026-08-22T08:00:00Z", ended_at: null } }, now)["entry-1"]).toBe(now);
  });

  it("uses Day start for established future work and does not clamp beyond Day end", () => {
    const long = entry("entry-1", 26 * 60 * 60);
    const tail = entry("entry-2", 60);
    const future = projection({ is_current: false, planning_enabled: true, sections: [section("section-a", [long, tail])] });
    const result = calculateStartForecast(future, now);
    expect(result["entry-1"]).toBe("2026-08-22T05:00:00Z");
    expect(result["entry-2"]).toBe("2026-08-23T07:00:00Z");
    expect(formatStartForecast(result["entry-2"], logicalDate, "UTC")).toBe("31:00");
  });

  it("returns no forecast for established past and record-none past", () => {
    expect(calculateStartForecast(projection({ is_current: false, planning_enabled: false }), now)).toEqual({});
    expect(calculateStartForecast({ ...projection({ is_current: false, planning_enabled: false }),
      establishment_state: "past_record_none",
      taskchute_day: { id: null, logical_date: "2026-08-21", start_instant: null, end_instant: null,
        establishment_timezone: null, establishment_boundary_minutes: null }, sections: [] }, now)).toEqual({});
  });

  it("formats same-day and post-midnight instants at minute resolution", () => {
    expect(formatStartForecast("2026-08-22T09:45:59Z", logicalDate, "UTC")).toBe("09:45");
    expect(formatStartForecast("2026-08-23T03:15:59Z", logicalDate, "UTC")).toBe("27:15");
    expect(formatStartForecast(undefined, logicalDate, "UTC")).toBe("—");
  });

  it("advances the server clock anchor without negative elapsed time", () => {
    expect(advanceProjectionClock(now, 61_234)).toBe("2026-08-22T09:01:01.234Z");
    expect(advanceProjectionClock(now, -1)).toBe(now);
  });
});
