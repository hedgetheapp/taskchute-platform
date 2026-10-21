import { describe, expect, it } from "vitest";
import { canonicalizeEntryOrder, canonicalizeQuickInterruptDisplayOrder, isSamePlannedStartCohort } from "../src/shared/planned-entry-order";

type Entry = {
  id: string;
  lifecycle_state: "planned" | "running" | "completed";
  planned_start_minute: number | null;
  position: number;
  first_started_at: string | null;
  quick_interrupt_target_entry_id?: string | null;
};

function entry(
  id: string,
  lifecycle_state: Entry["lifecycle_state"],
  position: number,
  first_started_at: string | null = null,
  quick_interrupt_target_entry_id?: string,
): Entry {
  return { id, lifecycle_state, planned_start_minute: null, position, first_started_at, quick_interrupt_target_entry_id };
}

describe("D-181 Quick Interrupt display order", () => {
  it.each(["running", "completed"] as const)("places Planned C after visible %s B without changing other relative order", (targetState) => {
    const base = canonicalizeEntryOrder([
      entry("p2", "planned", 2),
      entry("b", targetState, 3, "2026-10-21T10:00:00.000Z"),
      entry("p1", "planned", 1),
      entry("h-after", "completed", 4, "2026-10-21T10:30:00.000Z"),
      entry("c", "planned", 5, null, "b"),
    ]);

    expect(base.map(({ id }) => id)).toEqual(["b", "h-after", "p1", "p2", "c"]);
    expect(canonicalizeQuickInterruptDisplayOrder(base).map(({ id }) => id))
      .toEqual(["b", "c", "h-after", "p1", "p2"]);
  });

  it("returns C to the ordinary Planned group when B is hidden", () => {
    const base = [
      entry("b", "completed", 3, "2026-10-21T10:00:00.000Z"),
      entry("h-after", "completed", 4, "2026-10-21T10:30:00.000Z"),
      entry("p1", "planned", 1),
      entry("c", "planned", 5, null, "b"),
    ];
    const visible = base.filter((item) => item.lifecycle_state !== "completed");

    expect(canonicalizeQuickInterruptDisplayOrder(visible).map(({ id }) => id)).toEqual(["p1", "c"]);
  });

  it("keeps a started continuation in ordinary history order", () => {
    const base = canonicalizeEntryOrder([
      entry("b", "completed", 3, "2026-10-21T10:00:00.000Z"),
      entry("c", "running", 5, "2026-10-21T10:40:00.000Z", "b"),
      entry("h-between", "completed", 4, "2026-10-21T10:20:00.000Z"),
      entry("p", "planned", 6),
    ]);
    expect(canonicalizeQuickInterruptDisplayOrder(base).map(({ id }) => id))
      .toEqual(["b", "h-between", "c", "p"]);
  });

  it("keeps repeated Quick pairs independent and ordinary D-073 cohorts unchanged", () => {
    const base = [
      entry("b1", "completed", 1, "2026-10-21T10:00:00.000Z"),
      entry("b2", "running", 2, "2026-10-21T10:30:00.000Z"),
      entry("ordinary-planned", "planned", 3),
      entry("c1", "planned", 4, null, "b1"),
      entry("c2", "planned", 5, null, "b2"),
    ];
    expect(canonicalizeQuickInterruptDisplayOrder(base).map(({ id }) => id))
      .toEqual(["b1", "c1", "b2", "c2", "ordinary-planned"]);
    expect(isSamePlannedStartCohort(base[2], base[3])).toBe(true);

    const ordinaryOnly = [entry("ordinary-a", "completed", 1, "2026-10-21T10:00:00.000Z"),
      entry("ordinary-b", "planned", 2), entry("ordinary-c", "planned", 3)];
    expect(canonicalizeQuickInterruptDisplayOrder(ordinaryOnly)).toEqual(ordinaryOnly);
  });

  it("projects the same order the display helper computes", () => {
    const entries = [entry("b", "running", 2, "2026-10-21T10:00:00.000Z"), entry("p", "planned", 1),
      entry("c", "planned", 3, null, "b")];
    expect(canonicalizeQuickInterruptDisplayOrder(canonicalizeEntryOrder(entries)).map(({ id }) => id))
      .toEqual(["b", "c", "p"]);
  });
});
