import { describe, expect, it } from "vitest";
import { reviewDateMetricRange } from "../../worker/application/review-date-metrics";

describe("Review Date metric period range", () => {
  it("uses canonical left-closed, right-open month and year boundaries", () => {
    expect(reviewDateMetricRange("monthly", "2024-02-01")).toMatchObject({
      startLogicalDate: "2024-02-01",
      endLogicalDateExclusive: "2024-03-01",
    });
    expect(reviewDateMetricRange("yearly", "2024-01-01")).toMatchObject({
      startLogicalDate: "2024-01-01",
      endLogicalDateExclusive: "2025-01-01",
    });
  });

  it("rejects a noncanonical anchor or an invalid calendar date", () => {
    expect(reviewDateMetricRange("monthly", "2024-02-02")).toBeNull();
    expect(reviewDateMetricRange("monthly", "2023-02-31")).toBeNull();
    expect(reviewDateMetricRange("yearly", "2024-02-01")).toBeNull();
    expect(reviewDateMetricRange("weekly", "2024-02-01")).toBeNull();
  });

  it("keeps the last representable year bounded by canonical four-digit dates", () => {
    expect(reviewDateMetricRange("yearly", "9999-01-01")?.endLogicalDateExclusive).toBeNull();
    expect(reviewDateMetricRange("monthly", "9999-12-01")?.endLogicalDateExclusive).toBeNull();
  });
});

