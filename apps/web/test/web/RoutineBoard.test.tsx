import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineBoardProjection } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => ({
  loadRoutines: vi.fn(), loadProjects: vi.fn(), createRoutine: vi.fn(), setRoutineEnabled: vi.fn(),
  updateRoutine: vi.fn(), reorderRoutines: vi.fn(),
}));

vi.mock("../../src/web/api", async () => {
  const actual = await vi.importActual<typeof import("../../src/web/api")>("../../src/web/api");
  return { ...actual, api: mocks };
});

import { RoutineBoard } from "../../src/web/RoutineBoard";

const routineId = "019d0000-0000-7000-8000-000000000001";
const secondId = "019d0000-0000-7000-8000-000000000002";
const projectId = "019d0000-0000-7000-8000-000000000003";
const sectionId = "019d0000-0000-7000-8000-000000000004";

let board: RoutineBoardProjection;

beforeEach(() => {
  vi.clearAllMocks();
  board = {
    board_revision: 2,
    current_logical_date: "2026-09-01",
    sections: [{ id: sectionId, title: "Day", logical_start_minute: 300, logical_end_minute: 1740 }],
    routines: [
      { routine_definition_id: routineId, task_id: "019d0000-0000-7000-8000-000000000011",
        title: "Active Routine", project: null, enabled: true, schedule: { kind: "daily" },
        default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
        start_logical_date: "2026-09-01", end_logical_date: null, board_position: 1, settings_revision: 3 },
      { routine_definition_id: secondId, task_id: "019d0000-0000-7000-8000-000000000012",
        title: "Ended Routine", project: { id: projectId, title: "Work" }, enabled: false,
        schedule: { kind: "every_n_days", interval_days: 2 }, default_section_id: sectionId,
        default_planned_start_minute: 600, default_estimate_seconds: 1200,
        start_logical_date: "2026-08-01", end_logical_date: "2026-08-31", board_position: 2,
        settings_revision: 4 },
    ],
  };
  mocks.loadRoutines.mockImplementation(async () => structuredClone(board));
  mocks.loadProjects.mockResolvedValue({ projects: [{ id: projectId, title: "Work" }] });
  mocks.createRoutine.mockResolvedValue({});
  mocks.setRoutineEnabled.mockResolvedValue({});
  mocks.updateRoutine.mockResolvedValue({});
  mocks.reorderRoutines.mockResolvedValue({});
});

describe("Routine Board", () => {
  it("renders the canonical columns, active/ended tabs, and title/project search", async () => {
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    const table = await screen.findByRole("table", { name: "Routine Board" });
    for (const heading of ["ON/OFF", "移動", "Routine", "Project", "繰り返し", "Section", "開始予定", "見積", "期間"]) {
      expect(within(table).getByText(heading)).toBeTruthy();
    }
    expect(screen.getByDisplayValue("Active Routine")).toBeTruthy();
    expect(screen.queryByDisplayValue("Ended Routine")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "期間終了" }));
    expect(screen.getByDisplayValue("Ended Routine")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "work" } });
    expect(screen.getByDisplayValue("Ended Routine")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getByText("該当するRoutineはありません。")).toBeTruthy();
  });

  it("keeps a new blank row local until its name is committed and creates it OFF", async () => {
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    fireEvent.click(screen.getByRole("button", { name: "＋ ルーティンを追加" }));
    expect(screen.getByLabelText("新しいRoutine名")).toBeTruthy();
    expect(mocks.createRoutine).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("新しいRoutine名"), { target: { value: "Draft Routine" } });
    fireEvent.submit(screen.getByLabelText("新しいRoutine名").closest("form")!);
    await waitFor(() => expect(mocks.createRoutine).toHaveBeenCalledWith(expect.objectContaining({
      title: "Draft Routine", expected_board_revision: 2,
    })));
  });

  it("uses inline save for name/project/Section/start/estimate and keeps Section+start synchronized", async () => {
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    const title = await screen.findByLabelText("Active RoutineのRoutine名");
    fireEvent.change(title, { target: { value: "Renamed" } });
    fireEvent.blur(title);
    await waitFor(() => expect(mocks.updateRoutine).toHaveBeenCalledWith(expect.objectContaining({ title: "Renamed" })));

    fireEvent.change(screen.getByLabelText("Active RoutineのProject"), { target: { value: projectId } });
    await waitFor(() => expect(mocks.updateRoutine).toHaveBeenCalledWith(expect.objectContaining({ project_id: projectId })));
    fireEvent.change(screen.getByLabelText("Active RoutineのSection"), { target: { value: sectionId } });
    await waitFor(() => expect(mocks.updateRoutine).toHaveBeenCalledWith(expect.objectContaining({
      default_section_id: sectionId, default_planned_start_minute: 300,
    })));
    const start = screen.getByLabelText("Active Routineの開始予定");
    fireEvent.change(start, { target: { value: "10:00" } }); fireEvent.blur(start);
    await waitFor(() => expect(mocks.updateRoutine).toHaveBeenCalledWith(expect.objectContaining({
      default_section_id: sectionId, default_planned_start_minute: 600,
    })));
    const estimate = screen.getByLabelText("Active Routineの見積");
    fireEvent.change(estimate, { target: { value: "25" } }); fireEvent.blur(estimate);
    await waitFor(() => expect(mocks.updateRoutine).toHaveBeenCalledWith(expect.objectContaining({
      default_estimate_seconds: 1500,
    })));
  });

  it("requires explicit save/cancel for recurrence and inclusive period", async () => {
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    fireEvent.click(screen.getByRole("button", { name: "毎日" }));
    const dialog = screen.getByRole("dialog", { name: "Active Routineの繰り返しと期間" });
    fireEvent.change(within(dialog).getByLabelText("繰り返し"), { target: { value: "weekly" } });
    fireEvent.click(within(dialog).getByLabelText("水"));
    fireEvent.change(within(dialog).getByLabelText("終了日"), { target: { value: "2026-09-30" } });
    expect(mocks.updateRoutine).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "毎日" }));
    const next = screen.getByRole("dialog");
    fireEvent.change(within(next).getByLabelText("終了日"), { target: { value: "2026-09-30" } });
    fireEvent.click(within(next).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updateRoutine).toHaveBeenCalledWith(expect.objectContaining({
      end_logical_date: "2026-09-30",
    })));
  });

  it("toggles and reorders through explicit command APIs", async () => {
    board.routines[1]!.end_logical_date = null;
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    fireEvent.click(screen.getByRole("button", { name: "ON" }));
    await waitFor(() => expect(mocks.setRoutineEnabled).toHaveBeenCalledWith(expect.objectContaining({
      routine_definition_id: routineId, enabled: false, expected_settings_revision: 3,
    })));
    const handle = screen.getByRole("button", { name: "Active Routineを並び替え" });
    fireEvent.dragStart(handle);
    fireEvent.drop(screen.getByDisplayValue("Ended Routine").closest("[role=row]")!);
    fireEvent.dragEnd(handle);
    await waitFor(() => expect(mocks.reorderRoutines).toHaveBeenCalledWith(expect.objectContaining({
      routine_definition_ids: [secondId, routineId], expected_board_revision: 2,
    })));
    fireEvent.keyDown(screen.getByRole("button", { name: "Active Routineを並び替え" }), { key: "ArrowDown" });
    await waitFor(() => expect(mocks.reorderRoutines).toHaveBeenCalledTimes(2));
  });

  it("resets uncontrolled inline text to server canonical state after a rejected mutation", async () => {
    mocks.updateRoutine.mockRejectedValueOnce(new Error("revision conflict"));
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    const title = await screen.findByLabelText("Active RoutineのRoutine名");
    fireEvent.change(title, { target: { value: "Stale local title" } });
    fireEvent.blur(title);
    await waitFor(() => expect(mocks.loadRoutines).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("Active RoutineのRoutine名") as HTMLInputElement).value).toBe("Active Routine");
    expect(screen.getByRole("alert").textContent).toContain("revision conflict");
  });
});
