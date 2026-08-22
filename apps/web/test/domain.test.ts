import { describe, expect, it } from "vitest";
import { resolveTaskChuteDay } from "../worker/domain/taskchute-day";
import { isUuidV7, uuidv7 } from "../src/shared/uuidv7";
import { fingerprint } from "../worker/application/fingerprint";

describe("identity", () => {
  it("generates UUIDv7 but treats the value as opaque", () => {
    const laterTimestampId = uuidv7(2_000);
    const earlierTimestampId = uuidv7(1_000);
    expect(isUuidV7(laterTimestampId)).toBe(true);
    expect(isUuidV7(earlierTimestampId)).toBe(true);
    expect(new Set([laterTimestampId, earlierTimestampId]).size).toBe(2);
  });
});

describe("operation fingerprint", () => {
  it("is independent of semantic object property insertion order", async () => {
    const first = { z: 1, nested: { beta: true, alpha: "value" }, a: [3, 2, 1] };
    const second = { a: [3, 2, 1], nested: { alpha: "value", beta: true }, z: 1 };
    expect(await fingerprint(first)).toBe(await fingerprint(second));
  });
});

describe("TaskChuteDay", () => {
  it("maps a pre-boundary instant to the previous non-midnight logical day", () => {
    const day = resolveTaskChuteDay("2026-08-22T18:00:00Z", { timezone: "Asia/Tokyo", boundaryMinutes: 240 });
    expect(day.logicalDate).toBe("2026-08-22");
    expect(day.startInstant).toBe("2026-08-21T19:00:00Z");
    expect(day.endInstant).toBe("2026-08-22T19:00:00Z");
  });

  it("uses compatible semantics for a nonexistent spring-forward boundary", () => {
    const day = resolveTaskChuteDay("2026-03-08T12:00:00Z", {
      timezone: "America/New_York",
      boundaryMinutes: 150,
    });
    expect(day.logicalDate).toBe("2026-03-08");
    expect(day.startInstant).toBe("2026-03-08T07:30:00Z");
    expect(day.endInstant).toBe("2026-03-09T06:30:00Z");
  });

  it("keeps the previous logical day until the compatible shifted spring boundary instant", () => {
    const before = resolveTaskChuteDay("2026-03-08T07:00:00Z", {
      timezone: "America/New_York",
      boundaryMinutes: 150,
    });
    expect(before.logicalDate).toBe("2026-03-07");
    expect(before.startInstant).toBe("2026-03-07T07:30:00Z");
    expect(before.endInstant).toBe("2026-03-08T07:30:00Z");

    const atBoundary = resolveTaskChuteDay("2026-03-08T07:30:00Z", {
      timezone: "America/New_York",
      boundaryMinutes: 150,
    });
    expect(atBoundary.logicalDate).toBe("2026-03-08");
    expect(atBoundary.startInstant).toBe(before.endInstant);
  });

  it("uses the earlier occurrence for an ambiguous fall-back boundary", () => {
    const day = resolveTaskChuteDay("2026-11-01T12:00:00Z", {
      timezone: "America/New_York",
      boundaryMinutes: 90,
    });
    expect(day.startInstant).toBe("2026-11-01T05:30:00Z");
    expect(day.endInstant).toBe("2026-11-02T06:30:00Z");
  });

  it("classifies both sides of an ambiguous boundary by its compatible instant", () => {
    const before = resolveTaskChuteDay("2026-11-01T05:15:00Z", {
      timezone: "America/New_York",
      boundaryMinutes: 90,
    });
    const betweenRepeatedWallTimes = resolveTaskChuteDay("2026-11-01T06:15:00Z", {
      timezone: "America/New_York",
      boundaryMinutes: 90,
    });
    expect(before.logicalDate).toBe("2026-10-31");
    expect(before.endInstant).toBe("2026-11-01T05:30:00Z");
    expect(betweenRepeatedWallTimes.logicalDate).toBe("2026-11-01");
    expect(betweenRepeatedWallTimes.startInstant).toBe(before.endInstant);
  });

  it.each([
    ["normal", "2026-08-22T18:00:00Z", "Asia/Tokyo", 240],
    ["spring before shifted boundary", "2026-03-08T07:00:00Z", "America/New_York", 150],
    ["spring after shifted boundary", "2026-03-08T07:45:00Z", "America/New_York", 150],
    ["fall before compatible boundary", "2026-11-01T05:15:00Z", "America/New_York", 90],
    ["fall repeated wall time", "2026-11-01T06:15:00Z", "America/New_York", 90],
  ])("returns an interval containing now for %s", (_label, now, timezone, boundaryMinutes) => {
    const day = resolveTaskChuteDay(now, { timezone, boundaryMinutes });
    expect(Date.parse(day.startInstant)).toBeLessThanOrEqual(Date.parse(now));
    expect(Date.parse(now)).toBeLessThan(Date.parse(day.endInstant));
  });

  it("derives adjacent boundaries independently without a gap or 24h assumption", () => {
    const first = resolveTaskChuteDay("2026-03-08T12:00:00Z", { timezone: "America/New_York", boundaryMinutes: 150 });
    const second = resolveTaskChuteDay("2026-03-09T12:00:00Z", { timezone: "America/New_York", boundaryMinutes: 150 });
    expect(first.endInstant).toBe(second.startInstant);
    expect(Date.parse(first.endInstant) - Date.parse(first.startInstant)).toBe(23 * 60 * 60 * 1000);
  });

  it("depends on explicit IANA timezone rather than the process timezone", () => {
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Honolulu";
    const first = resolveTaskChuteDay("2026-08-22T18:00:00Z", { timezone: "Asia/Tokyo", boundaryMinutes: 240 });
    process.env.TZ = "Europe/London";
    const second = resolveTaskChuteDay("2026-08-22T18:00:00Z", { timezone: "Asia/Tokyo", boundaryMinutes: 240 });
    process.env.TZ = original;
    expect(second).toEqual(first);
  });
});
