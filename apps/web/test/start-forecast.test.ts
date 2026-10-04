import { describe, expect, it } from "vitest";
import type { CurrentTaskChuteDayProjection, EntryProjection, SectionProjection } from "../src/shared/contracts";
import { advanceProjectionClock, calculateStartForecast, conflictMinutesCeiling, formatStartForecast } from "../src/shared/start-forecast";

const logicalDate = "2026-08-22";
const now = "2026-08-22T09:00:00Z";

function entry(
  id: string,
  estimate: number | null,
  state: EntryProjection["lifecycle_state"] = "planned",
  overrides: Partial<EntryProjection> = {},
): EntryProjection {
  return { id, section_id: "section-a", position: Number(id.replace(/\D/g, "")) || 1, lifecycle_state: state,
    estimate_seconds: estimate, planned_start_minute: 1200, start_reminder_offset_minutes: null, routine: null,
    task: { id: `task-${id}`, title: id, project: null }, ...overrides };
}

function section(id: string, entries: EntryProjection[], start = 0, end: number | null = 1440): SectionProjection {
  return { id, title: id, logical_start_minute: end === null ? null : start, logical_end_minute: end,
    actual_start_instant: end === null ? null : "2026-08-22T00:00:00Z",
    actual_end_instant: end === null ? null : "2026-08-23T00:00:00Z",
    estimate_total_seconds: entries.reduce((sum, item) => sum + (item.estimate_seconds ?? 0), 0), entries };
}

function projection(overrides: Partial<CurrentTaskChuteDayProjection> = {}): CurrentTaskChuteDayProjection {
  const first = entry("entry-1", 600);
  const second = entry("entry-2", 1200);
  return {
    projection_generated_at: now,
    establishment_state: "established", is_current: true, planning_enabled: true, placement_revision: 0,
    section_configuration_required: false,
    taskchute_day: { id: "day", logical_date: logicalDate, start_instant: "2026-08-22T00:00:00Z",
      end_instant: "2026-08-23T00:00:00Z", establishment_timezone: "UTC", establishment_boundary_minutes: 0 },
    sections: [section("section-a", [first, second])], unsectioned_entries: [], active_execution: null,
    next_entry: first, ...overrides,
  } as CurrentTaskChuteDayProjection;
}

function entryForecast(day: CurrentTaskChuteDayProjection, id: string) {
  return calculateStartForecast(day, now).byEntryId[id];
}

describe("Start Forecast v0.1", () => {
  it("preserves ordinary accumulated forecast without using planned start as a barrier", () => {
    const result = calculateStartForecast(projection(), now);
    expect(result.byEntryId).toEqual({
      "entry-1": { startInstant: now, endInstant: "2026-08-22T09:10:00Z", fixedStart: false, conflictSeconds: 0, sectionId: "section-a" },
      "entry-2": { startInstant: "2026-08-22T09:10:00Z", endInstant: "2026-08-22T09:30:00Z", fixedStart: false, conflictSeconds: 0, sectionId: "section-a" },
    });
  });

  it("adds zero for null estimates and continues across timed Section boundaries", () => {
    const first = entry("entry-1", null);
    const second = { ...entry("entry-2", 600), section_id: "section-b" };
    const result = calculateStartForecast(projection({ sections: [section("section-a", [first]), section("section-b", [second])] }), now);
    expect(result.byEntryId["entry-1"].startInstant).toBe(now);
    expect(result.byEntryId["entry-2"].startInstant).toBe(now);
  });

  it("excludes Sectionless, untimed, completed, and running rows from planned forecast", () => {
    const planned = entry("entry-1", 600);
    const completed = entry("entry-2", 1200, "completed");
    const running = entry("entry-3", 900, "running");
    const unsectioned = { ...entry("entry-4", 3600), section_id: null };
    const untimed = { ...entry("entry-5", 3600), section_id: "legacy" };
    const result = calculateStartForecast(projection({
      sections: [section("section-a", [completed, running, planned]), section("legacy", [untimed], 0, null)],
      unsectioned_entries: [unsectioned],
      active_execution: { id: "execution", entry_id: running.id, entry_estimate_seconds: 900,
        started_at: "2026-08-22T08:55:00Z", ended_at: null },
    }), now);
    expect(result.byEntryId).toEqual({
      "entry-1": { startInstant: "2026-08-22T09:10:00Z", endInstant: "2026-08-22T09:20:00Z", fixedStart: false, conflictSeconds: 0, sectionId: "section-a" },
    });
    expect(result.bySectionId).toEqual({});
  });

  it("uses active remaining estimate even when its Entry is outside the displayed Day", () => {
    const result = calculateStartForecast(projection({
      active_execution: { id: "execution", entry_id: "other-day-entry", entry_estimate_seconds: 1800,
        started_at: "2026-08-22T08:50:00Z", ended_at: null },
    }), now);
    expect(result.byEntryId["entry-1"].startInstant).toBe("2026-08-22T09:20:00Z");
  });

  it("keeps over-estimate and null-estimate active work at effective now", () => {
    const base = projection();
    expect(calculateStartForecast({ ...base, active_execution: { id: "execution", entry_id: "outside",
      entry_estimate_seconds: 300, started_at: "2026-08-22T08:00:00Z", ended_at: null } }, now).byEntryId["entry-1"].startInstant).toBe(now);
    expect(calculateStartForecast({ ...base, active_execution: { id: "execution", entry_id: "outside",
      entry_estimate_seconds: null, started_at: "2026-08-22T08:00:00Z", ended_at: null } }, now).byEntryId["entry-1"].startInstant).toBe(now);
  });

  it("uses future Day start and permits extended wall-clock forecasts", () => {
    const long = entry("entry-1", 26 * 60 * 60);
    const tail = entry("entry-2", 60);
    const future = projection({ is_current: false, planning_enabled: true, sections: [section("section-a", [long, tail])] });
    const result = calculateStartForecast(future, now);
    expect(result.byEntryId["entry-1"].startInstant).toBe("2026-08-22T00:00:00Z");
    expect(result.byEntryId["entry-2"].startInstant).toBe("2026-08-23T02:00:00Z");
    expect(formatStartForecast(result.byEntryId["entry-2"].startInstant, logicalDate, "UTC")).toBe("26:00");
    expect(result.bySectionId["section-a"].overflowSeconds).toBe(7_260);
  });

  it("returns no planned forecast for past and record-none past", () => {
    expect(calculateStartForecast(projection({ is_current: false, planning_enabled: false }), now).byEntryId).toEqual({});
    expect(calculateStartForecast({ ...projection({ is_current: false, planning_enabled: false }),
      establishment_state: "past_record_none",
      taskchute_day: { id: null, logical_date: "2026-08-21", start_instant: null, end_instant: null,
        establishment_timezone: null, establishment_boundary_minutes: null }, sections: [] }, now).byEntryId).toEqual({});
  });

  it("formats same-day and post-midnight instants at minute resolution and handles invalid timezone", () => {
    expect(formatStartForecast("2026-08-22T09:45:59Z", logicalDate, "UTC")).toBe("09:45");
    expect(formatStartForecast("2026-08-23T03:15:59Z", logicalDate, "UTC")).toBe("27:15");
    expect(formatStartForecast(undefined, logicalDate, "UTC")).toBe("—");
    expect(formatStartForecast(now, logicalDate, "not-a-timezone")).toBe("—");
  });

  it("keeps a fixed 20:00 anchor when incoming work ends at 19:40, independent of reminder offset", () => {
    const incoming = entry("entry-1", 2_400);
    const fixed = entry("entry-2", 1_800, "planned", { planned_start_minute: 1_200, start_reminder_offset_minutes: 15 });
    const day = projection({ sections: [section("section-a", [incoming, fixed])] });
    const forecast = entryForecast(day, fixed.id);
    expect(forecast).toMatchObject({ startInstant: "2026-08-22T20:00:00Z", endInstant: "2026-08-22T20:30:00Z", fixedStart: true, conflictSeconds: 0 });
    const zeroOffset = entryForecast(projection({ sections: [section("section-a", [incoming, { ...fixed, start_reminder_offset_minutes: 0 }])] }), fixed.id);
    expect(zeroOffset?.startInstant).toBe(forecast?.startInstant);
    expect(zeroOffset?.endInstant).toBe(forecast?.endInstant);
  });

  it("keeps a late fixed anchor, reports exact overlap, and resets downstream cursor", () => {
    const incoming = entry("entry-1", 40_320);
    const fixed = entry("entry-2", 1_800, "planned", { planned_start_minute: 1_200, start_reminder_offset_minutes: 15 });
    const tail = entry("entry-3", 300, "planned", { planned_start_minute: null });
    const result = calculateStartForecast(projection({ sections: [section("section-a", [incoming, fixed, tail])] }), now);
    expect(result.byEntryId[fixed.id]).toMatchObject({ startInstant: "2026-08-22T20:00:00Z", conflictSeconds: 720 });
    expect(result.byEntryId[tail.id].startInstant).toBe("2026-08-22T20:30:00Z");
    expect(result.bySectionId["section-a"].overlapSeconds).toBe(720);
    expect(conflictMinutesCeiling(result.byEntryId[fixed.id].conflictSeconds)).toBe(12);
  });

  it("turning reminder off restores flexible accumulation", () => {
    const first = entry("entry-1", 40_320);
    const off = entry("entry-2", 600, "planned", { planned_start_minute: 1_200, start_reminder_offset_minutes: null });
    const result = entryForecast(projection({ sections: [section("section-a", [first, off])] }), off.id);
    expect(result).toMatchObject({ startInstant: "2026-08-22T20:12:00Z", fixedStart: false, conflictSeconds: 0 });
  });

  it("processes multiple fixed anchors in display order and aggregates the worst conflict, not the sum", () => {
    const incoming = entry("entry-1", 40_320);
    const first = entry("entry-2", 300, "planned", { planned_start_minute: 1_200, start_reminder_offset_minutes: 0 });
    const second = entry("entry-3", 300, "planned", { planned_start_minute: 1_195, start_reminder_offset_minutes: 60 });
    const result = calculateStartForecast(projection({ sections: [section("section-a", [incoming, first, second])] }), now);
    expect(result.byEntryId[first.id].conflictSeconds).toBe(720);
    expect(result.byEntryId[second.id].conflictSeconds).toBe(600);
    expect(result.bySectionId["section-a"].overlapSeconds).toBe(720);
  });

  it("resolves post-midnight anchors in the establishment timezone", () => {
    const incoming = entry("entry-1", 1_200);
    const fixed = entry("entry-2", 1_800, "planned", { planned_start_minute: 1_440, start_reminder_offset_minutes: 0 });
    const tokyo = projection({ projection_generated_at: "2026-08-22T14:40:00Z", sections: [section("section-a", [incoming, fixed])],
      taskchute_day: { id: "day", logical_date: logicalDate, start_instant: "2026-08-22T00:00:00Z",
        end_instant: "2026-08-23T00:00:00Z", establishment_timezone: "Asia/Tokyo", establishment_boundary_minutes: 0 } });
    const result = calculateStartForecast(tokyo, tokyo.projection_generated_at);
    expect(result.byEntryId[fixed.id]).toMatchObject({ startInstant: "2026-08-22T15:00:00Z", endInstant: "2026-08-22T15:30:00Z", fixedStart: true });
    expect(formatStartForecast(result.byEntryId[fixed.id].startInstant, logicalDate, "Asia/Tokyo")).toBe("24:00");
  });

  it("falls back to flexible forecast for malformed reminder markers", () => {
    const first = entry("entry-1", 600);
    const malformed = entry("entry-2", 300, "planned", { planned_start_minute: null, start_reminder_offset_minutes: 15 });
    const outOfRange = entry("entry-3", 300, "planned", { planned_start_minute: 2880, start_reminder_offset_minutes: 15 });
    const result = calculateStartForecast(projection({ sections: [section("section-a", [first, malformed, outOfRange])] }), now);
    expect(result.byEntryId[malformed.id]).toMatchObject({ startInstant: "2026-08-22T09:10:00Z", fixedStart: false, conflictSeconds: 0 });
    expect(result.byEntryId[outOfRange.id]).toMatchObject({ startInstant: "2026-08-22T09:15:00Z", fixedStart: false, conflictSeconds: 0 });
    const invalidZoneDay = projection({ taskchute_day: { id: "day", logical_date: logicalDate, start_instant: "2026-08-22T00:00:00Z",
      end_instant: "2026-08-23T00:00:00Z", establishment_timezone: "bad zone", establishment_boundary_minutes: 0 },
      sections: [section("section-a", [first, malformed])] });
    expect(() => calculateStartForecast(invalidZoneDay, now)).not.toThrow();
    expect(calculateStartForecast(invalidZoneDay, now).byEntryId[malformed.id].fixedStart).toBe(false);
  });

  it("derives Section overflow, combined warnings, and none for missing end or historical work", () => {
    const overflowOnly = calculateStartForecast(projection({ sections: [section("section-a", [entry("entry-1", 1_200)], 0, 550)] }), now);
    expect(overflowOnly.bySectionId["section-a"]).toEqual({ overlapSeconds: 0, overflowSeconds: 600 });

    const incoming = entry("entry-1", 40_320);
    const fixed = entry("entry-2", 1_800, "planned", { planned_start_minute: 1_200, start_reminder_offset_minutes: 0 });
    const completed = entry("entry-3", 3_600, "completed");
    const both = calculateStartForecast(projection({ sections: [section("section-a", [incoming, fixed, completed], 0, 1_215)] }), now);
    expect(both.bySectionId["section-a"]).toEqual({ overlapSeconds: 720, overflowSeconds: 900 });

    const noEnd = calculateStartForecast(projection({ sections: [section("section-a", [entry("entry-1", 36_000)], 0, null)] }), now);
    expect(noEnd.bySectionId).toEqual({});
  });

  it("compares Section overflow at the displayed logical-minute precision", () => {
    const cases = [
      [10_834, 0], // 12:00:34
      [10_859, 0], // 12:00:59
      [10_860, 60], // 12:01:00
      [10_919, 60], // 12:01:59
    ] as const;

    for (const [estimateSeconds, expectedOverflowSeconds] of cases) {
      const planned = entry("entry-1", estimateSeconds);
      const day = projection({ sections: [section("section-a", [planned], 0, 720)] });

      expect(calculateStartForecast(day, now).bySectionId["section-a"]?.overflowSeconds ?? 0)
        .toBe(expectedOverflowSeconds);
    }
  });

  it("does not invent overflow for Sectionless entries and rounds positive conflicts upward", () => {
    const fixed = entry("entry-1", 60, "planned", { section_id: null, planned_start_minute: 480, start_reminder_offset_minutes: 0 });
    const result = calculateStartForecast(projection({ unsectioned_entries: [fixed], sections: [] }), now);
    expect(result.byEntryId).toEqual({});
    expect(result.bySectionId).toEqual({});
    expect(conflictMinutesCeiling(1)).toBe(1);
    expect(conflictMinutesCeiling(60)).toBe(1);
    expect(conflictMinutesCeiling(61)).toBe(2);
  });

  it("advances the server clock anchor without negative elapsed time", () => {
    expect(advanceProjectionClock(now, 61_234)).toBe("2026-08-22T09:01:01.234Z");
    expect(advanceProjectionClock(now, -1)).toBe(now);
  });
});
