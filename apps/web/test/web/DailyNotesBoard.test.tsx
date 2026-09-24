import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadDay: vi.fn(),
  loadDailyPrimaryDocuments: vi.fn(),
  loadDailyPrimaryDocument: vi.fn(),
  ensureDailyPrimaryDocument: vi.fn(),
  updateDailyPrimaryDocument: vi.fn(),
}));

vi.mock("../../src/web/api", async () => {
  const actual = await vi.importActual<typeof import("../../src/web/api")>("../../src/web/api");
  return { ...actual, api: mocks };
});

import { DailyNotesBoard } from "../../src/web/DailyNotesBoard";

const summaries = [
  { taskchute_day_id: "day-24", logical_date: "2026-09-24", document_id: "doc-24" },
  { taskchute_day_id: "day-23", logical_date: "2026-09-23", document_id: "doc-23" },
];

function day(id: string, logicalDate: string) {
  return {
    establishment_state: "established",
    projection_generated_at: "2026-09-24T00:00:00Z",
    is_current: true,
    planning_enabled: true,
    placement_revision: 1,
    section_configuration_required: false,
    sections: [],
    unsectioned_entries: [],
    active_execution: null,
    next_entry: null,
    taskchute_day: {
      id,
      logical_date: logicalDate,
      start_instant: `${logicalDate}T00:00:00Z`,
      end_instant: `${logicalDate}T23:59:59Z`,
      establishment_timezone: "Asia/Tokyo",
      establishment_boundary_minutes: 0,
    },
  };
}

function document(documentId: string, dayId: string, logicalDate: string) {
  return {
    document_id: documentId,
    kind: "daily_primary",
    taskchute_day_id: dayId,
    logical_date: logicalDate,
    markdown_body: "# Daily",
    revision: 1,
    created_at: "2026-09-24T00:00:00Z",
    updated_at: "2026-09-24T00:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadDay.mockImplementation(async (logicalDate?: string) => logicalDate === "2026-09-23" ? day("day-23", "2026-09-23") : day("day-24", "2026-09-24"));
  mocks.loadDailyPrimaryDocuments.mockResolvedValue({ days: summaries });
  mocks.loadDailyPrimaryDocument.mockImplementation(async (documentId: string) => documentId === "doc-23" ? document("doc-23", "day-23", "2026-09-23") : document("doc-24", "day-24", "2026-09-24"));
});

describe("DailyNotesBoard corrective UI", () => {
  it("uses the established-day date list and has no editor heading previous/next buttons", async () => {
    render(
      <DailyNotesBoard
        onUnauthorized={vi.fn()}
        onDirtyChange={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: "2026-09-24" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2026-09-23" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "前の日" })).toBeNull();
    expect(screen.queryByRole("button", { name: "次の日" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "2026-09-23" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledWith("2026-09-23"));
    expect(await screen.findByRole("heading", { name: "2026-09-23" })).toBeTruthy();
  });
});
