import { describe, expect, it } from "vitest";
import { classifyEffectiveDay } from "../src/shared/effective-day-calendar";
import { findJapaneseHoliday, JAPANESE_HOLIDAY_SOURCE, JAPANESE_HOLIDAYS } from "../src/shared/japanese-holidays";

describe("D-088 Japanese holiday snapshot", () => {
  it("is attributed, covered, non-empty, unique, and deterministically ordered", () => {
    expect(JAPANESE_HOLIDAYS.length).toBeGreaterThan(1000);
    expect(JAPANESE_HOLIDAY_SOURCE.page_url).toContain("cao.go.jp");
    expect(JAPANESE_HOLIDAY_SOURCE.csv_url).toContain("syukujitsu.csv");
    expect(JAPANESE_HOLIDAY_SOURCE.coverage_start).toBe("1955-01-01");
    expect(JAPANESE_HOLIDAY_SOURCE.coverage_end).toBe("2027-12-31");
    expect(JAPANESE_HOLIDAY_SOURCE.source_sha256).toMatch(/^[0-9a-f]{64}$/);
    const dates = JAPANESE_HOLIDAYS.map((entry) => entry.logical_date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toEqual([...dates].sort());
    expect(findJapaneseHoliday("2026-01-01")?.label).toBe("元日");
    expect(findJapaneseHoliday("2026-05-06")?.label).toBe("休日");
    expect(findJapaneseHoliday("2026-09-22")?.label).toBe("休日");
    expect(findJapaneseHoliday("2027-03-22")?.label).toBe("休日");
    expect(findJapaneseHoliday("2026-09-14")).toBeNull();
  });
});

describe("D-088 effective day classifier", () => {
  it("classifies covered weekdays, official holidays, weekends, and unknown coverage", () => {
    expect(classifyEffectiveDay({ logicalDate: "2026-09-14" })).toMatchObject({ base: "workday", effective: "workday", official_entry: null });
    expect(classifyEffectiveDay({ logicalDate: "2026-05-06" })).toMatchObject({ base: "holiday", effective: "holiday" });
    expect(classifyEffectiveDay({ logicalDate: "2026-09-12" })).toMatchObject({ base: "holiday", effective: "holiday" });
    expect(classifyEffectiveDay({ logicalDate: "2028-01-03" })).toMatchObject({ base: "unknown", effective: "unknown", official_entry: null });
    expect(classifyEffectiveDay({ logicalDate: "2028-01-01" })).toMatchObject({ base: "holiday", effective: "holiday" });
  });

  it("applies overrides after base classification while preserving the official fact", () => {
    expect(classifyEffectiveDay({ logicalDate: "2026-09-14", override: {
      logical_date: "2026-09-14", override_kind: "holiday", reason: "x", revision: 0, updated_at: "now",
    } })).toMatchObject({ base: "workday", effective: "holiday", override: { override_kind: "holiday" } });
    expect(classifyEffectiveDay({ logicalDate: "2026-09-12", override: {
      logical_date: "2026-09-12", override_kind: "workday", reason: null, revision: 0, updated_at: "now",
    } })).toMatchObject({ base: "holiday", effective: "workday" });
    const official = classifyEffectiveDay({ logicalDate: "2026-05-06", override: {
      logical_date: "2026-05-06", override_kind: "workday", reason: null, revision: 0, updated_at: "now",
    } });
    expect(official).toMatchObject({ base: "holiday", effective: "workday", official_entry: { label: "休日" } });
    expect(classifyEffectiveDay({ logicalDate: "2028-01-03", override: {
      logical_date: "2028-01-03", override_kind: "holiday", reason: null, revision: 0, updated_at: "now",
    } })).toMatchObject({ base: "unknown", effective: "holiday" });
  });

  it("rejects malformed and impossible civil dates", () => {
    expect(() => classifyEffectiveDay({ logicalDate: "2026-2-01" })).toThrow();
    expect(() => classifyEffectiveDay({ logicalDate: "2026-02-30" })).toThrow();
  });
});
