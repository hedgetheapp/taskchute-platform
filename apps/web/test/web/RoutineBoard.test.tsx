import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineBoardProjection } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => ({
  loadRoutines: vi.fn(), loadProjects: vi.fn(), createRoutine: vi.fn(), setRoutineEnabled: vi.fn(),
  updateRoutine: vi.fn(), reorderRoutines: vi.fn(), deleteRoutine: vi.fn(),
}));

vi.mock("../../src/web/api", async () => {
  const actual = await vi.importActual<typeof import("../../src/web/api")>("../../src/web/api");
  return { ...actual, api: mocks };
});

import { RoutineBoard } from "../../src/web/RoutineBoard";
import { ApiClientError } from "../../src/web/api";

const routineId = "019d0000-0000-7000-8000-000000000001";
const secondId = "019d0000-0000-7000-8000-000000000002";
const projectId = "019d0000-0000-7000-8000-000000000003";
const sectionId = "019d0000-0000-7000-8000-000000000004";

let board: RoutineBoardProjection;

function routineRow(title: string): HTMLElement {
  return screen.getByLabelText(`${title}のRoutine名`).closest('[role="row"]') as HTMLElement;
}

function dragData() {
  return { effectAllowed: "", dropEffect: "", setData: vi.fn() };
}

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
  mocks.deleteRoutine.mockResolvedValue({ routine_definition_id: routineId, board_revision: 3 });
});

describe("Routine Board", () => {
  it("renders the canonical columns, active/ended tabs, and title/project search", async () => {
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    const table = await screen.findByRole("table", { name: "Routine Board" });
    for (const heading of ["有効", "タスク名", "繰り返し", "開始予定", "見積", "プロジェクト", "セクション", "開始日", "終了日"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(`^${heading}`) })).toBeTruthy();
    }
    expect(within(table).queryByText("移動")).toBeNull();
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

  it("requires explicit save/cancel for recurrence and edits the inclusive period in separate cells", async () => {
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    fireEvent.click(screen.getByRole("button", { name: "毎日" }));
    const dialog = screen.getByRole("dialog", { name: "Active Routineの繰り返し" });
    fireEvent.change(within(dialog).getByLabelText("繰り返し"), { target: { value: "weekly" } });
    fireEvent.click(within(dialog).getByLabelText("水"));
    expect(mocks.updateRoutine).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "毎日" }));
    const next = screen.getByRole("dialog");
    fireEvent.change(within(next).getByLabelText("繰り返し"), { target: { value: "weekly" } });
    fireEvent.click(within(next).getByLabelText("水"));
    fireEvent.click(within(next).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updateRoutine).toHaveBeenCalledWith(expect.objectContaining({ schedule: { kind: "weekly", weekdays: [1, 3] } })));

    const end = screen.getByLabelText("Active Routineの終了日");
    fireEvent.change(end, { target: { value: "2026-09-30" } });
    fireEvent.blur(end);
    await waitFor(() => expect(mocks.updateRoutine).toHaveBeenCalledWith(expect.objectContaining({ end_logical_date: "2026-09-30" })));
  });

  it("toggles and reorders from task/non-task row surfaces without keyboard reorder", async () => {
    board.routines[1]!.end_logical_date = null;
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    fireEvent.click(screen.getByRole("checkbox", { name: "Active Routineの有効" }));
    await waitFor(() => expect(mocks.setRoutineEnabled).toHaveBeenCalledWith(expect.objectContaining({
      routine_definition_id: routineId, enabled: false, expected_settings_revision: 3,
    })));
    const source = routineRow("Active Routine");
    const target = routineRow("Ended Routine");
    fireEvent.dragStart(within(source).getAllByRole("cell")[1]!, { dataTransfer: dragData() });
    fireEvent.drop(target, { dataTransfer: dragData() });
    fireEvent.dragEnd(source, { dataTransfer: dragData() });
    await waitFor(() => expect(mocks.reorderRoutines).toHaveBeenCalledWith(expect.objectContaining({
      routine_definition_ids: [secondId, routineId], expected_board_revision: 2,
    })));
    expect(screen.queryByRole("button", { name: "Active Routineを並び替え" })).toBeNull();
    fireEvent.keyDown(source, { key: "ArrowDown" });
    expect(mocks.reorderRoutines).toHaveBeenCalledTimes(1);
  });

  it("does not start a Routine row drag from interactive descendants and keeps actions outside the Task cell", async () => {
    board.routines[1]!.end_logical_date = null;
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    const table = await screen.findByRole("table", { name: "Routine Board" });
    const source = routineRow("Active Routine");
    const target = routineRow("Ended Routine");
    const taskCell = within(source).getAllByRole("cell")[1]!;
    const action = within(source).getByRole("button", { name: "Active Routineのメニュー" });
    expect(taskCell.contains(action)).toBe(false);
    expect(source.lastElementChild?.className).toContain("routine-row-actions");

    const blockedTargets: HTMLElement[] = [
      within(taskCell).getByLabelText("Active RoutineのRoutine名"),
      within(source).getByRole("checkbox", { name: "Active Routineの有効" }),
      within(source).getByRole("combobox", { name: "Active RoutineのProject" }),
      within(source).getByRole("combobox", { name: "Active RoutineのSection" }),
      within(source).getByRole("button", { name: "毎日" }),
      action,
    ];
    for (const blockedTarget of blockedTargets) {
      mocks.reorderRoutines.mockClear();
      fireEvent.dragStart(blockedTarget, { dataTransfer: dragData() });
      fireEvent.drop(target, { dataTransfer: dragData() });
      fireEvent.dragEnd(blockedTarget, { dataTransfer: dragData() });
      expect(mocks.reorderRoutines).not.toHaveBeenCalled();
    }

    for (const heading of ["有効", "タスク名", "繰り返し", "開始予定", "見積", "プロジェクト", "セクション", "開始日", "終了日"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(`^${heading}`) })).toBeTruthy();
    }
    expect(within(table).getAllByRole("columnheader")).toHaveLength(9);
    const resize = within(table).getByRole("button", { name: "タスク名の幅を変更" });
    fireEvent.dragStart(resize, { dataTransfer: dragData() });
    fireEvent.drop(target, { dataTransfer: dragData() });
    expect(mocks.reorderRoutines).not.toHaveBeenCalled();
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

  it("deletes a Routine only after the centered confirmation and sends the expected revisions", async () => {
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    fireEvent.click(screen.getByRole("button", { name: "Active Routineのメニュー" }));
    const menu = screen.getByRole("menu", { name: "Active Routineの操作" });
    expect(within(menu).getByRole("menuitem", { name: "削除" })).toBeTruthy();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "削除" }));
    const dialog = screen.getByRole("dialog", { name: "Routine削除確認" });
    expect(within(dialog).getByText("ルーティンを削除しますか？")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(mocks.deleteRoutine).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Active Routineのメニュー" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Active Routineの操作" })).getByRole("menuitem", { name: "削除" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Routine削除確認" })).getByRole("button", { name: "削除" }));
    await waitFor(() => expect(mocks.deleteRoutine).toHaveBeenCalledWith({
      operation_id: expect.any(String), routine_definition_id: routineId,
      expected_settings_revision: 3, expected_board_revision: 2,
    }));
    expect(screen.getByText("Routineを削除しました")).toBeTruthy();
  });

  it("restores Help focus to the row or toolbar origin and restores delete cancel focus", async () => {
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    const row = routineRow("Active Routine");
    row.focus();
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Routine Boardショートカット" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(row));

    const help = screen.getByRole("button", { name: "?" });
    fireEvent.click(help);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Routine Boardショートカット" })).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(document.activeElement).toBe(help));

    const action = screen.getByRole("button", { name: "Active Routineのメニュー" });
    fireEvent.click(action);
    fireEvent.click(within(screen.getByRole("menu", { name: "Active Routineの操作" })).getByRole("menuitem", { name: "削除" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Routine削除確認" })).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(document.activeElement).toBe(action));

    fireEvent.click(action);
    fireEvent.click(within(screen.getByRole("menu", { name: "Active Routineの操作" })).getByRole("menuitem", { name: "削除" }));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(action));

    fireEvent.click(action);
    fireEvent.click(within(screen.getByRole("menu", { name: "Active Routineの操作" })).getByRole("menuitem", { name: "削除" }));
    const backdrop = screen.getByRole("dialog", { name: "Routine削除確認" }).parentElement!;
    fireEvent.mouseDown(backdrop);
    await waitFor(() => expect(document.activeElement).toBe(action));
  });

  it("moves delete focus to the next visible row when the origin row is removed", async () => {
    board.routines[1]!.end_logical_date = null;
    const afterDelete = structuredClone(board);
    afterDelete.routines = afterDelete.routines.filter((routine) => routine.routine_definition_id !== routineId);
    mocks.loadRoutines.mockReset();
    mocks.loadRoutines.mockResolvedValueOnce(structuredClone(board)).mockResolvedValue(afterDelete);
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    const action = screen.getByRole("button", { name: "Active Routineのメニュー" });
    fireEvent.click(action);
    fireEvent.click(within(screen.getByRole("menu", { name: "Active Routineの操作" })).getByRole("menuitem", { name: "削除" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Routine削除確認" })).getByRole("button", { name: "削除" }));
    await waitFor(() => expect(screen.queryByDisplayValue("Active Routine")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ended Routineのメニュー" })));
  });

  it("restores delete focus after a failed delete and keeps the retry path available", async () => {
    mocks.deleteRoutine.mockRejectedValueOnce(new ApiClientError("delete conflict", 503, true, "infrastructure_ambiguous"));
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    await screen.findByDisplayValue("Active Routine");
    const action = screen.getByRole("button", { name: "Active Routineのメニュー" });
    fireEvent.click(action);
    fireEvent.click(within(screen.getByRole("menu", { name: "Active Routineの操作" })).getByRole("menuitem", { name: "削除" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Routine削除確認" })).getByRole("button", { name: "削除" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("delete conflict"));
    expect(document.activeElement).toBe(action);
    expect(screen.getByRole("button", { name: "削除を再試行" })).toBeTruthy();
  });

  it("persists column resize and supports no-focus J/K navigation and the limited help shortcuts", async () => {
    localStorage.clear();
    board.routines[1]!.end_logical_date = null;
    render(<RoutineBoard onUnauthorized={vi.fn()} />);
    const table = await screen.findByRole("table", { name: "Routine Board" });
    const resize = within(table).getByRole("button", { name: "タスク名の幅を変更" });
    const down = new Event("pointerdown", { bubbles: true });
    Object.defineProperty(down, "clientX", { value: 100 });
    resize.dispatchEvent(down);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const move = new Event("pointermove");
    Object.defineProperty(move, "clientX", { value: 180 });
    document.dispatchEvent(move);
    document.dispatchEvent(new Event("pointerup"));
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem("taskchute.web.routine-columns.v1")!);
      expect(persisted.widths.task).toBe(400);
    });

    fireEvent.keyDown(window, { key: "j" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByDisplayValue("Active Routine").closest("[role=row]")));
    fireEvent.keyDown(window, { key: "k" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByDisplayValue("Active Routine").closest("[role=row]")));
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Routine Boardショートカット" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "x" });
    expect(mocks.deleteRoutine).not.toHaveBeenCalled();
  });
});
