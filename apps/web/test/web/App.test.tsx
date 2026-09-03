import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentTaskChuteDayProjection, EntryProjection } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => ({
  login: vi.fn(), logout: vi.fn(), loadDay: vi.fn(), loadProjects: vi.fn(), createProject: vi.fn(), addTask: vi.fn(), duplicateEntry: vi.fn(), bulkDeleteEntries: vi.fn(), bulkMoveEntriesToSection: vi.fn(), bulkMoveEntriesToSectionOccurrence: vi.fn(), bulkMoveEntriesToSectionScoped: vi.fn(), bulkSetEntriesEstimateScoped: vi.fn(),
  reorderEntries: vi.fn(), startEntry: vi.fn(), completeEntry: vi.fn(),
  establishInitialSectionConfiguration: vi.fn(), moveEntry: vi.fn(), setEntryEstimate: vi.fn(),
  setEntryPlannedStart: vi.fn(),
  convertEntryToRoutine: vi.fn(), endRoutine: vi.fn(), setRoutineEstimate: vi.fn(), setRoutineSectionPlan: vi.fn(),
  loadRoutines: vi.fn(), createRoutine: vi.fn(), setRoutineEnabled: vi.fn(), updateRoutine: vi.fn(), reorderRoutines: vi.fn(),
  loadSectionConfiguration: vi.fn(), updateSectionConfiguration: vi.fn(),
}));

vi.mock("../../src/web/api", async () => {
  const actual = await vi.importActual<typeof import("../../src/web/api")>("../../src/web/api");
  return { ...actual, api: mocks };
});

import { App, DAY_COLUMNS_STORAGE_KEY, DAY_SECTION_COLLAPSE_STORAGE_KEY, SIDEBAR_STORAGE_KEY } from "../../src/web/App";
import { ApiClientError } from "../../src/web/api";

const morningId = "019c0000-0000-7000-8000-000000000002";
const eveningId = "019c0000-0000-7000-8000-000000000008";
const firstEntry: EntryProjection = {
  id: "019c0000-0000-7000-8000-000000000003",
  section_id: morningId,
  position: 1,
  lifecycle_state: "planned",
  estimate_seconds: null,
      planned_start_minute: null,
      routine: null,
  task: { id: "019c0000-0000-7000-8000-000000000004", title: "Canonical task", project: null },
};
const secondEntry: EntryProjection = {
  id: "019c0000-0000-7000-8000-000000000006",
  section_id: morningId,
  position: 2,
  lifecycle_state: "planned",
  estimate_seconds: null,
      planned_start_minute: null,
      routine: null,
  task: { id: "019c0000-0000-7000-8000-000000000007", title: "Second task", project: null },
};
const thirdEntry: EntryProjection = {
  id: "019c0000-0000-7000-8000-000000000009",
  section_id: morningId,
  position: 3,
  lifecycle_state: "planned",
  estimate_seconds: null,
      planned_start_minute: null,
      routine: null,
  task: { id: "019c0000-0000-7000-8000-000000000010", title: "Third task", project: null },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function dragDataTransfer() {
  const values = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "none",
    setData: vi.fn((type: string, value: string) => values.set(type, value)),
    getData: vi.fn((type: string) => values.get(type) ?? ""),
  };
}

function setDragRowBounds(row: HTMLElement) {
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, width: 600, height: 100, top: 0, right: 600, bottom: 100, left: 0,
    toJSON: () => ({}),
  });
}

function dragEntry(handle: HTMLElement, targetRow: HTMLElement, clientY: number) {
  const dataTransfer = dragDataTransfer();
  setDragRowBounds(targetRow);
  fireEvent.dragStart(handle, { dataTransfer });
  const dragOver = createEvent.dragOver(targetRow, { dataTransfer });
  Object.defineProperty(dragOver, "clientY", { value: clientY });
  fireEvent(targetRow, dragOver);
  const drop = createEvent.drop(targetRow, { dataTransfer });
  Object.defineProperty(drop, "clientY", { value: clientY });
  fireEvent(targetRow, drop);
  fireEvent.dragEnd(handle, { dataTransfer });
  return dataTransfer;
}

function setColumnBounds(column: HTMLElement, left: number, width: number) {
  vi.spyOn(column, "getBoundingClientRect").mockReturnValue({
    x: left, y: 0, width, height: 34, top: 0, right: left + width, bottom: 34, left,
    toJSON: () => ({}),
  });
}

function sectionSummary(title: string): HTMLElement {
  const summary = screen.getAllByText(title)
    .map((element) => element.closest<HTMLElement>(".section-summary"))
    .find((element): element is HTMLElement => element !== null);
  if (!summary) throw new Error(`Section summary not found: ${title}`);
  return summary;
}

const emptyDay: CurrentTaskChuteDayProjection = {
  projection_generated_at: "2026-08-22T12:00:00.000Z",
  establishment_state: "established",
  is_current: true,
  planning_enabled: true,
  taskchute_day: {
    id: "019c0000-0000-7000-8000-000000000001",
    logical_date: "2026-08-22",
    start_instant: "2026-08-22T04:00:00Z",
    end_instant: "2026-08-23T04:00:00Z",
    establishment_timezone: "UTC",
    establishment_boundary_minutes: 240,
  },
  placement_revision: 0,
  section_configuration_required: false,
  sections: [
    { id: morningId, title: "Morning", logical_start_minute: 240, logical_end_minute: 720,
      actual_start_instant: "2026-08-22T04:00:00Z", actual_end_instant: "2026-08-22T12:00:00Z", estimate_total_seconds: 0, entries: [] },
    { id: eveningId, title: "Evening", logical_start_minute: 720, logical_end_minute: 1680,
      actual_start_instant: "2026-08-22T12:00:00Z", actual_end_instant: "2026-08-23T04:00:00Z", estimate_total_seconds: 0, entries: [] },
  ],
  unsectioned_entries: [],
  active_execution: null,
  next_entry: null,
};

const populatedDay: CurrentTaskChuteDayProjection = {
  ...emptyDay,
  placement_revision: 1,
  sections: [
    { ...emptyDay.sections[0], entries: [firstEntry] },
    emptyDay.sections[1],
  ],
  next_entry: firstEntry,
};

const twoPlannedDay: CurrentTaskChuteDayProjection = {
  ...populatedDay,
  sections: [{ ...populatedDay.sections[0], entries: [firstEntry, secondEntry] }, emptyDay.sections[1]],
};

const runningDay: CurrentTaskChuteDayProjection = {
  ...populatedDay,
  active_execution: {
    id: "019c0000-0000-7000-8000-000000000005",
    entry_id: firstEntry.id,
    entry_estimate_seconds: null,
    started_at: "2026-08-22T12:00:00.000Z",
    ended_at: null,
  },
  sections: [{ ...populatedDay.sections[0], entries: [{ ...firstEntry, lifecycle_state: "running" }] }, emptyDay.sections[1]],
  next_entry: null,
};

const completedDay: CurrentTaskChuteDayProjection = {
  ...runningDay,
  active_execution: null,
  sections: [{ ...runningDay.sections[0], entries: [{ ...firstEntry, lifecycle_state: "completed" }] }, emptyDay.sections[1]],
};

const unsectionedDay: CurrentTaskChuteDayProjection = {
  ...twoPlannedDay,
  sections: [emptyDay.sections[0], emptyDay.sections[1]],
  unsectioned_entries: [{ ...firstEntry, section_id: null }],
  next_entry: { ...firstEntry, section_id: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.logout.mockResolvedValue({});
  mocks.loadProjects.mockResolvedValue({ projects: [{ id: "existing-project", title: "Existing Project" }] });
  mocks.createProject.mockResolvedValue({ project: { id: "project", title: "Project" } });
  mocks.addTask.mockResolvedValue({});
  mocks.duplicateEntry.mockResolvedValue({});
  mocks.bulkDeleteEntries.mockResolvedValue({});
  mocks.bulkMoveEntriesToSection.mockResolvedValue({});
  mocks.bulkMoveEntriesToSectionScoped.mockResolvedValue({});
  mocks.bulkSetEntriesEstimateScoped.mockResolvedValue({});
  mocks.reorderEntries.mockResolvedValue({});
  mocks.startEntry.mockResolvedValue({});
  mocks.completeEntry.mockResolvedValue({});
  mocks.establishInitialSectionConfiguration.mockResolvedValue({});
  mocks.moveEntry.mockResolvedValue({});
  mocks.setEntryEstimate.mockResolvedValue({});
  mocks.setEntryPlannedStart.mockResolvedValue({});
  mocks.convertEntryToRoutine.mockResolvedValue({});
  mocks.endRoutine.mockResolvedValue({});
  mocks.setRoutineEstimate.mockResolvedValue({});
  mocks.setRoutineSectionPlan.mockResolvedValue({});
  mocks.loadRoutines.mockResolvedValue({ board_revision: 0, current_logical_date: "2026-08-22", sections: [], routines: [] });
  mocks.createRoutine.mockResolvedValue({});
  mocks.setRoutineEnabled.mockResolvedValue({});
  mocks.updateRoutine.mockResolvedValue({});
  mocks.reorderRoutines.mockResolvedValue({});
  mocks.loadSectionConfiguration.mockResolvedValue({
    configuration_version_id: "019c0000-0000-7000-8000-000000000020",
    day_boundary_minutes: 240,
    items: [
      { section_id: morningId, title: "Morning", logical_start_minute: 240, logical_end_minute: 720 },
      { section_id: eveningId, title: "Evening", logical_start_minute: 720, logical_end_minute: 1680 },
    ],
  });
  mocks.updateSectionConfiguration.mockResolvedValue({ configuration_version_id: "new-version" });
});

async function openSectionSettings() {
  fireEvent.click(await screen.findByRole("button", { name: "設定" }));
  return screen.findByRole("region", { name: "Section設定" });
}

async function openProjectSettings() {
  fireEvent.click(await screen.findByRole("button", { name: "設定" }));
  await screen.findByRole("region", { name: "Section設定" });
  fireEvent.click(screen.getByRole("button", { name: "Project" }));
  return screen.findByRole("region", { name: "Project設定" });
}

describe("Dogfood Day shell", () => {
  it("shows a concise accessible status while loading the canonical Day", () => {
    const request = deferred<CurrentTaskChuteDayProjection>();
    mocks.loadDay.mockReturnValue(request.promise);
    render(<App />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("読み込み中…");
    expect(screen.queryByText(/Server canonical state/)).toBeNull();
  });

  it("closes and reopens the authenticated Sidebar while releasing its layout track", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    await screen.findByRole("region", { name: "DayBoard" });

    const layout = document.querySelector<HTMLElement>(".app-layout")!;
    expect(layout.dataset.sidebarState).toBe("open");
    expect(screen.getByRole("button", { name: "サイドバーを閉じる" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "サイドバーを閉じる" }));
    expect(layout.dataset.sidebarState).toBe("closed");
    expect(layout.classList.contains("sidebar-closed")).toBe(true);
    expect(screen.queryByRole("button", { name: "サイドバーを閉じる" })).toBeNull();
    expect(screen.getByRole("button", { name: "サイドバーを開く" })).toBeTruthy();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? "null")).toEqual({ version: 1, open: false }));

    fireEvent.click(screen.getByRole("button", { name: "サイドバーを開く" }));
    expect(layout.dataset.sidebarState).toBe("open");
    expect(screen.getByRole("button", { name: "サイドバーを閉じる" })).toBeTruthy();
  });

  it("shares the closed preference across Today, Routine, and Settings views", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    await screen.findByRole("region", { name: "DayBoard" });

    fireEvent.click(screen.getByRole("button", { name: "サイドバーを閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "サイドバーを開く" }));
    fireEvent.click(screen.getByRole("button", { name: "ルーティン" }));
    await screen.findByRole("heading", { name: "ルーティン" });
    fireEvent.click(screen.getByRole("button", { name: "サイドバーを閉じる" }));
    expect(screen.getByRole("button", { name: "サイドバーを開く" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "サイドバーを開く" }));
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    await screen.findByRole("heading", { name: "設定" });
    fireEvent.click(screen.getByRole("button", { name: "サイドバーを閉じる" }));
    expect(screen.getByRole("button", { name: "サイドバーを開く" })).toBeTruthy();
    expect(document.querySelector(".primary-sidebar")).toBeNull();
  });

  it("restores a closed Sidebar after remount and safely falls back to open for malformed storage", async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ version: 1, open: false }));
    mocks.loadDay.mockResolvedValue(populatedDay);
    const firstRender = render(<App />);
    await screen.findByRole("region", { name: "DayBoard" });
    expect(screen.getByRole("button", { name: "サイドバーを開く" })).toBeTruthy();
    firstRender.unmount();

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "{not-json");
    render(<App />);
    await screen.findByRole("region", { name: "DayBoard" });
    expect(screen.getByRole("button", { name: "サイドバーを閉じる" })).toBeTruthy();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? "null")).toEqual({ version: 1, open: true }));
  });

  it("keeps authenticated navigation usable when Sidebar storage access fails", async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    try {
      mocks.loadDay.mockResolvedValue(populatedDay);
      render(<App />);
      await screen.findByRole("region", { name: "DayBoard" });
      expect(screen.getByRole("button", { name: "サイドバーを閉じる" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "サイドバーを閉じる" }));
      expect(screen.getByRole("button", { name: "サイドバーを開く" })).toBeTruthy();
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });

  it("renders the logical Day as one surface with current Sections, Entries, and empty Sections", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    const dayBoard = await screen.findByRole("region", { name: "DayBoard" });
    expect(dayBoard).toBeTruthy();
    expect(screen.getByRole("button", { name: "2026年8月22日（土）、日付を選択" })).toBeTruthy();
    expect(screen.getAllByText("Morning")[0]).toBeTruthy();
    expect(screen.getByText("Canonical task")).toBeTruthy();
    expect(screen.getAllByText("Evening")[0]).toBeTruthy();
    expect(screen.getAllByText("表示するTaskはありません")).toHaveLength(1);

    const heading = dayBoard.querySelector<HTMLElement>(".table-heading")!;
    const headingCells = Array.from(heading.children) as HTMLElement[];
    expect(headingCells.filter((cell) => !cell.classList.contains("bulk-slot")).map((cell) => cell.textContent)).toEqual([
      "実行", "Task", "Project", "Section", "Routine", "見積", "開始予定", "開始見込", "開始", "終了", "実績",
    ]);
    expect(headingCells[0]?.classList.contains("bulk-slot")).toBe(true);
    expect(heading.querySelectorAll(":scope > .bulk-slot")).toHaveLength(1);
    expect(headingCells[0]?.getAttribute("tabindex")).toBeNull();
    expect((headingCells[0]?.querySelector("input") as HTMLInputElement)?.checked).toBe(false);
    const taskRow = dayBoard.querySelector<HTMLElement>("[data-entry-id]")!;
    expect(taskRow.firstElementChild?.classList.contains("bulk-slot")).toBe(true);
    expect(taskRow.querySelectorAll(":scope > .bulk-slot")).toHaveLength(1);
    expect(taskRow.children[1]?.classList.contains("execution-cell")).toBe(true);
    expect(taskRow.children[2]?.classList.contains("task-main")).toBe(true);
    expect(taskRow.children).toHaveLength(headingCells.length);
    expect(heading.textContent).not.toContain("状態");
    expect(heading.textContent).not.toContain("並び替え");
    expect(dayBoard.querySelector(".lifecycle-label")).toBeNull();
    expect(screen.getByRole("button", { name: "Canonical taskを開始" })).toBeTruthy();
    expect(screen.queryByText("1 tasks")).toBeNull();
    expect(screen.queryByText("revision 1")).toBeNull();
    expect(screen.queryByText(
      `${populatedDay.taskchute_day.start_instant} — ${populatedDay.taskchute_day.end_instant}`,
    )).toBeNull();
    expect(document.querySelector(".interval")).toBeNull();
    expect(screen.getByRole("button", { name: "＋ Taskを追加" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "実行済みを表示" })).toBeTruthy();
  });

  it("renders read-only forecast from the server anchor without using planned start as a barrier", async () => {
    const forecastDay: CurrentTaskChuteDayProjection = {
      ...twoPlannedDay,
      projection_generated_at: "2026-08-22T09:00:30.000Z",
      sections: [{ ...twoPlannedDay.sections[0], entries: [
        { ...firstEntry, estimate_seconds: 600, planned_start_minute: 1200 },
        { ...secondEntry, estimate_seconds: 300, planned_start_minute: null },
      ] }, twoPlannedDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(forecastDay);
    render(<App />);
    expect((await screen.findByLabelText("Canonical taskの開始見込")).textContent).toBe("09:00");
    expect(screen.getByLabelText("Second taskの開始見込").textContent).toBe("09:10");
    expect(screen.getByRole("button", { name: "Canonical taskの開始予定" }).textContent).toBe("20:00");
    expect(screen.queryByText(/警告|遅延/)).toBeNull();
    expect(screen.queryByRole("textbox", { name: /開始見込/ })).toBeNull();
  });

  it("advances the local forecast clock without polling and cleans the timer on unmount", async () => {
    let tick: (() => void) | null = null;
    const performanceSpy = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation((handler) => {
      tick = handler as () => void;
      return 42 as unknown as ReturnType<typeof window.setInterval>;
    });
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    mocks.loadDay.mockResolvedValue(populatedDay);
    const rendered = render(<App />);
    expect((await screen.findByLabelText("Canonical taskの開始見込")).textContent).toBe("12:00");
    expect(mocks.loadDay).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 15_000);
    performanceSpy.mockReturnValue(62_000);
    await act(async () => { tick?.(); });
    expect(screen.getByLabelText("Canonical taskの開始見込").textContent).toBe("12:01");
    expect(mocks.loadDay).toHaveBeenCalledTimes(1);
    rendered.unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(42);
    performanceSpy.mockRestore();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it("navigates with previous, next, Today, and Shift+Arrow without mutating", async () => {
    mocks.loadDay.mockImplementation(async (logicalDate?: string) => logicalDate ? {
      ...emptyDay,
      establishment_state: logicalDate > "2026-08-22" ? "future_preview" as const : "established" as const,
      is_current: logicalDate === "2026-08-22",
      taskchute_day: { ...emptyDay.taskchute_day, id: logicalDate > "2026-08-22" ? null : emptyDay.taskchute_day.id,
        logical_date: logicalDate },
    } : emptyDay);
    render(<App />);
    const navigation = await screen.findByLabelText("日付ナビゲーション");
    expect((within(navigation).getByRole("button", { name: "今日" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "前の日" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith("2026-08-21"));
    fireEvent.click(within(navigation).getByRole("button", { name: "今日" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith(undefined));
    fireEvent.click(screen.getByRole("button", { name: "次の日" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith("2026-08-23"));
    fireEvent.keyDown(screen.getByRole("main"), { key: "ArrowLeft", shiftKey: true });
    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith("2026-08-22"));

    fireEvent.click(screen.getByRole("button", { name: "＋ Taskを追加" }));
    const taskInput = screen.getByRole("textbox", { name: "SectionなしのTask名" });
    const callsBeforeEditingShortcut = mocks.loadDay.mock.calls.length;
    fireEvent.keyDown(taskInput, { key: "ArrowRight", shiftKey: true });
    expect(mocks.loadDay).toHaveBeenCalledTimes(callsBeforeEditingShortcut);
    expect(mocks.addTask).not.toHaveBeenCalled();
  });

  it("operates the custom calendar month grid by pointer and keyboard without leaking global shortcuts", async () => {
    mocks.loadDay.mockImplementation(async (logicalDate?: string) => logicalDate ? {
      ...emptyDay, is_current: logicalDate === "2026-08-22",
      establishment_state: logicalDate > "2026-08-22" ? "future_preview" as const : "established" as const,
      taskchute_day: { ...emptyDay.taskchute_day, id: logicalDate > "2026-08-22" ? null : emptyDay.taskchute_day.id,
        logical_date: logicalDate },
    } : emptyDay);
    render(<App />);
    let trigger = await screen.findByRole("button", { name: "2026年8月22日（土）、日付を選択" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "2026年8月のカレンダー" })).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label")).toContain("2026年8月22日（土）");

    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement?.getAttribute("aria-label")).toContain("2026年8月21日（金）");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement?.getAttribute("aria-label")).toContain("2026年8月15日（土）");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "PageUp" });
    expect(screen.getByRole("dialog", { name: "2026年7月のカレンダー" })).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label")).toContain("2026年7月22日（水）");
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    expect(screen.getByRole("dialog", { name: "2026年8月のカレンダー" })).toBeTruthy();

    const callsBeforeCalendarShift = mocks.loadDay.mock.calls.length;
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight", shiftKey: true });
    expect(mocks.loadDay).toHaveBeenCalledTimes(callsBeforeCalendarShift);
    expect(document.activeElement?.getAttribute("aria-label")).toContain("2026年8月23日（日）");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith("2026-08-23"));
    trigger = screen.getByRole("button", { name: "2026年8月23日（日）、日付を選択" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("gridcell", { name: "2026年8月24日（月）" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith("2026-08-24"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops a selected non-current Day across explicit logout and reloads the canonical current Day after login", async () => {
    mocks.loadDay.mockImplementation(async (logicalDate?: string) => logicalDate ? {
      ...emptyDay,
      establishment_state: "future_preview" as const,
      is_current: false,
      taskchute_day: { ...emptyDay.taskchute_day, id: null, logical_date: logicalDate },
    } : emptyDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "次の日" }));
    await screen.findByRole("button", { name: "2026年8月23日（日）、日付を選択" });

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    const login = await screen.findByRole("button", { name: "ログイン" });
    fireEvent.change(screen.getByRole("textbox", { name: "メール" }), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "password" } });
    fireEvent.submit(login.closest("form")!);

    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith(undefined));
    const trigger = await screen.findByRole("button", { name: "2026年8月22日（土）、日付を選択" });
    fireEvent.click(trigger);
    const current = document.querySelector('[role="gridcell"][aria-current="date"]');
    expect(current?.getAttribute("data-calendar-date")).toBe("2026-08-22");
    expect(current?.getAttribute("aria-selected")).toBe("true");
  });

  it("drops a selected non-current Day when reconciliation gets 401 and reloads current after login", async () => {
    mocks.loadDay.mockImplementation(async (logicalDate?: string) => logicalDate ? {
      ...emptyDay,
      establishment_state: "future_preview" as const,
      is_current: false,
      taskchute_day: { ...emptyDay.taskchute_day, id: null, logical_date: logicalDate },
    } : emptyDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "次の日" }));
    await screen.findByRole("button", { name: "2026年8月23日（日）、日付を選択" });
    mocks.loadDay.mockRejectedValueOnce(new ApiClientError("expired", 401, false, "unauthenticated"));
    fireEvent.click(screen.getByRole("button", { name: "MorningにTaskを追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "MorningのTask名" }), { target: { value: "Expired session" } });
    fireEvent.submit(screen.getByRole("form", { name: "Morningの新規Task" }));

    const login = await screen.findByRole("button", { name: "ログイン" });
    fireEvent.change(screen.getByRole("textbox", { name: "メール" }), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "password" } });
    fireEvent.submit(login.closest("form")!);

    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith(undefined));
    expect(await screen.findByRole("button", { name: "2026年8月22日（土）、日付を選択" })).toBeTruthy();
  });

  it("establishes a future preview only through its first successful Task addition", async () => {
    const future: CurrentTaskChuteDayProjection = {
      ...emptyDay,
      establishment_state: "future_preview",
      is_current: false,
      taskchute_day: { ...emptyDay.taskchute_day, id: null, logical_date: "2026-08-23" },
    };
    const established = { ...emptyDay, is_current: false,
      taskchute_day: { ...emptyDay.taskchute_day, logical_date: "2026-08-23" } };
    mocks.loadDay.mockResolvedValueOnce(future).mockResolvedValueOnce(established);
    render(<App />);
    expect(await screen.findByText(/未来日のプレビュー/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "MorningにTaskを追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "MorningのTask名" }), { target: { value: "Plan tomorrow" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "MorningのTask名" }), { key: "ArrowRight", shiftKey: true });
    expect(mocks.loadDay).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByRole("form", { name: "Morningの新規Task" }));
    await waitFor(() => expect(mocks.addTask).toHaveBeenCalledTimes(1));
    expect(mocks.addTask.mock.calls[0][0]).toMatchObject({
      logical_date: "2026-08-23", expected_placement_revision: 0, section_id: morningId,
    });
    expect(mocks.addTask.mock.calls[0][0].taskchute_day_id).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(mocks.loadDay).toHaveBeenLastCalledWith("2026-08-23"));
  });

  it("renders a past historical gap empty and read-only, and hides non-current execution actions", async () => {
    const past: CurrentTaskChuteDayProjection = {
      ...emptyDay,
      establishment_state: "past_record_none",
      is_current: false,
      planning_enabled: false,
      taskchute_day: { id: null, logical_date: "2026-08-20", start_instant: null, end_instant: null,
        establishment_timezone: null, establishment_boundary_minutes: null },
      sections: [],
    };
    mocks.loadDay.mockResolvedValueOnce(past);
    render(<App />);
    expect(await screen.findByText(/記録のない過去日/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "＋ Taskを追加" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /を開始$/ })).toBeNull();
    expect(mocks.addTask).not.toHaveBeenCalled();
  });

  it("keeps established future planning controls while disabling Start and current-Day Routine actions", async () => {
    const futureEstablished: CurrentTaskChuteDayProjection = {
      ...populatedDay,
      is_current: false,
      taskchute_day: { ...populatedDay.taskchute_day, logical_date: "2026-08-23" },
    };
    mocks.loadDay.mockResolvedValue(futureEstablished);
    render(<App />);
    const start = await screen.findByRole("button", { name: "Canonical taskを開始" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect(screen.getByRole("combobox", { name: "Canonical taskのSection" }).hasAttribute("disabled")).toBe(false);
    expect((screen.getByRole("button", { name: "Canonical taskの見積" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Canonical taskの開始予定" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Routine化" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "MorningにTaskを追加" }));
    fireEvent.change(screen.getByRole("textbox", { name: "MorningのTask名" }), { target: { value: "Follow-up future task" } });
    fireEvent.submit(screen.getByRole("form", { name: "Morningの新規Task" }));
    await waitFor(() => expect(mocks.addTask).toHaveBeenCalledTimes(1));
    expect(mocks.addTask.mock.calls[0][0]).toMatchObject({
      taskchute_day_id: futureEstablished.taskchute_day.id,
      logical_date: "2026-08-23",
      expected_placement_revision: 1,
      section_id: morningId,
    });
  });

  it("opens a focused inline draft from the selected Section plus", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "EveningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "EveningのTask名" });
    expect(document.activeElement).toBe(input);
    const draftRow = input.closest(".draft-row")!;
    expect(draftRow.children).toHaveLength(12);
    expect(draftRow.firstElementChild?.classList.contains("bulk-slot")).toBe(true);
    expect(draftRow.querySelectorAll(":scope > .bulk-slot")).toHaveLength(1);
    expect(screen.queryByRole("textbox", { name: "MorningのTask名" })).toBeNull();
    expect(screen.getAllByText("表示するTaskはありません")).toHaveLength(1);
  });

  it("removes an empty draft with Escape or outside click without mutation", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "MorningにTaskを追加" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "MorningのTask名" }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "MorningのTask名" })).toBeNull();
    expect(mocks.addTask).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "EveningにTaskを追加" }));
    fireEvent.blur(screen.getByRole("textbox", { name: "EveningのTask名" }), { relatedTarget: document.body });
    expect(screen.queryByRole("textbox", { name: "EveningのTask名" })).toBeNull();
    expect(mocks.addTask).not.toHaveBeenCalled();
  });

  it("commits a valid draft exactly once from a non-composing Enter and reconciles canonical state", async () => {
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockResolvedValueOnce(populatedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "EveningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "EveningのTask名" });
    fireEvent.change(input, { target: { value: "  Added in evening  " } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 229, isComposing: false });
    await waitFor(() => expect(mocks.addTask).toHaveBeenCalledTimes(1));
    expect(mocks.addTask.mock.calls[0][0]).toMatchObject({ title: "Added in evening", section_id: eveningId, project_id: null });
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("textbox", { name: "EveningのTask名" })).toBeNull();
    expect(mocks.addTask).toHaveBeenCalledTimes(1);
  });

  it("shows Task reconciliation in one dedicated floating status without an in-flow status paragraph", async () => {
    const request = deferred<unknown>();
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.addTask.mockReturnValue(request.promise);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "MorningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "MorningのTask名" });
    fireEvent.change(input, { target: { value: "Pending task" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Taskを追加・照合中…");
    expect(status.tagName).toBe("DIV");
    expect(status.classList.contains("transient-status")).toBe(true);
    expect(document.querySelector("p.transient-status")).toBeNull();
    expect(screen.getByRole("region", { name: "DayBoard" })).toBeTruthy();

    request.resolve({});
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("does not submit an empty draft with Enter", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "MorningにTaskを追加" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "MorningのTask名" }), { key: "Enter", code: "Enter" });
    expect(mocks.addTask).not.toHaveBeenCalled();
  });

  it("does not submit the draft with the Enter that confirms Japanese IME composition", async () => {
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockResolvedValueOnce(populatedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "MorningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "MorningのTask名" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "日本語タスク" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
    expect(mocks.addTask).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("日本語タスク")).toBeTruthy();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.addTask).toHaveBeenCalledTimes(1));
  });

  it("traverses visible Section and Row focus with J/K and arrow keys", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    render(<App />);
    const summary = (await screen.findByRole("button", { name: "MorningにTaskを追加" }))
      .closest<HTMLElement>(".section-summary")!;
    summary.focus();
    expect((document.activeElement as HTMLElement).dataset.focusKey).toBe(`section:${morningId}`);
    fireEvent.keyDown(summary, { key: "j" });
    expect((document.activeElement as HTMLElement).dataset.focusKey).toBe(`entry:${firstEntry.id}`);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect((document.activeElement as HTMLElement).dataset.entryId).toBe(secondEntry.id);
    fireEvent.keyDown(document.activeElement!, { key: "k" });
    expect((document.activeElement as HTMLElement).dataset.entryId).toBe(firstEntry.id);
  });

  it("collapses and expands one Section by pointer without changing other Sections or canonical order", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    render(<App />);
    const collapse = await screen.findByRole("button", { name: "Morningを折りたたむ" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(collapse);
    expect(screen.queryByText("Canonical task")).toBeNull();
    expect(screen.queryByText("Second task")).toBeNull();
    expect(screen.getAllByText("Evening")[0]).toBeTruthy();
    const expand = screen.getByRole("button", { name: "Morningを展開" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(Array.from(document.querySelectorAll("[data-entry-id]")).map((row) => row.getAttribute("data-entry-id")))
      .toEqual([firstEntry.id, secondEntry.id]);
  });

  it("restores collapse state after a browser reload using logical Day and stable Section identity", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    const firstRender = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Morningを折りたたむ" }));
    expect(screen.queryByText("Canonical task")).toBeNull();

    const persisted = JSON.parse(window.localStorage.getItem(DAY_SECTION_COLLAPSE_STORAGE_KEY) ?? "null") as {
      version: number; days: Record<string, string[]>;
    };
    expect(persisted).toEqual({ version: 1, days: { "2026-08-22": [morningId] } });

    firstRender.unmount();
    render(<App />);
    expect((await screen.findByRole("button", { name: "Morningを展開" })).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Canonical task")).toBeNull();
    expect(screen.getByText("Evening")).toBeTruthy();
  });

  it("restores an expanded Section after re-expanding it and reloading", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    const firstRender = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Morningを折りたたむ" }));
    fireEvent.click(screen.getByRole("button", { name: "Morningを展開" }));
    expect(screen.getByRole("button", { name: "Morningを折りたたむ" }).getAttribute("aria-expanded")).toBe("true");

    firstRender.unmount();
    render(<App />);
    expect((await screen.findByRole("button", { name: "Morningを折りたたむ" })).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Canonical task")).toBeTruthy();
  });

  it("keeps each logical Day preference across a remount", async () => {
    mocks.loadDay.mockImplementation(async (logicalDate?: string) => ({
      ...twoPlannedDay,
      is_current: logicalDate === undefined || logicalDate === "2026-08-22",
      taskchute_day: { ...twoPlannedDay.taskchute_day, logical_date: logicalDate ?? "2026-08-22" },
    }));
    const firstRender = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Morningを折りたたむ" }));
    fireEvent.click(screen.getByRole("button", { name: "次の日" }));
    await screen.findByRole("button", { name: "2026年8月23日（日）、日付を選択" });
    fireEvent.click(screen.getByRole("button", { name: "Morningを折りたたむ" }));
    firstRender.unmount();

    render(<App />);
    expect((await screen.findByRole("button", { name: "Morningを展開" })).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "次の日" }));
    await screen.findByRole("button", { name: "2026年8月23日（日）、日付を選択" });
    expect((await screen.findByRole("button", { name: "Morningを展開" })).getAttribute("aria-expanded")).toBe("false");
  });

  it("persists Sectionなし with its absence sentinel independently from normal Sections", async () => {
    mocks.loadDay.mockResolvedValue(unsectionedDay);
    const firstRender = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Sectionなしを折りたたむ" }));
    expect(screen.queryByText("Canonical task")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(DAY_SECTION_COLLAPSE_STORAGE_KEY) ?? "null")).toEqual({
      version: 1, days: { "2026-08-22": ["unsectioned"] },
    });

    firstRender.unmount();
    render(<App />);
    expect((await screen.findByRole("button", { name: "Sectionなしを展開" })).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Canonical task")).toBeNull();
  });

  it("ignores malformed collapse storage and rewrites it to a valid empty envelope", async () => {
    window.localStorage.setItem(DAY_SECTION_COLLAPSE_STORAGE_KEY, "{not-json");
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    render(<App />);
    expect(await screen.findByText("Canonical task")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(DAY_SECTION_COLLAPSE_STORAGE_KEY) ?? "null")).toEqual({ version: 1, days: {} });
  });

  it("drops stale Section keys while retaining a valid stable Section key", async () => {
    window.localStorage.setItem(DAY_SECTION_COLLAPSE_STORAGE_KEY, JSON.stringify({
      version: 1,
      days: { "2026-08-22": ["stale-section-id", morningId], "not-a-date": [eveningId] },
    }));
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    render(<App />);
    expect(await screen.findByRole("button", { name: "Morningを展開" })).toBeTruthy();
    expect(screen.queryByText("Canonical task")).toBeNull();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(DAY_SECTION_COLLAPSE_STORAGE_KEY) ?? "null")).toEqual({
      version: 1, days: { "2026-08-22": [morningId] },
    }));
  });

  it("toggles a focused Section summary with Enter and Space without nested-button double toggles", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    const summary = (await screen.findByRole("button", { name: "Morningを折りたたむ" })).closest<HTMLElement>(".section-summary")!;
    summary.focus();
    fireEvent.keyDown(summary, { key: "Enter" });
    expect(screen.queryByText("Canonical task")).toBeNull();
    fireEvent.keyDown(summary, { key: " " });
    expect(screen.getByText("Canonical task")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Morningを折りたたむ" }));
    expect(screen.queryByText("Canonical task")).toBeNull();
  });

  it("expands a collapsed Section for Add Task and protects a non-empty draft from collapse", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Morningを折りたたむ" }));
    expect(screen.queryAllByText("表示するTaskはありません")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "MorningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "MorningのTask名" });
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("button", { name: "Morningを折りたたむ" }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(input, { target: { value: "Keep visible" } });
    fireEvent.click(screen.getByRole("button", { name: "Morningを折りたたむ" }));
    expect(screen.getByDisplayValue("Keep visible")).toBeTruthy();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Morningを折りたたむ" }));
    expect(screen.queryByRole("textbox", { name: "MorningのTask名" })).toBeNull();
    expect(screen.getByRole("button", { name: "Morningを展開" })).toBeTruthy();
    expect(mocks.addTask).not.toHaveBeenCalled();
  });

  it("isolates collapse state by logical Day and restores it when navigating back in-session", async () => {
    mocks.loadDay.mockImplementation(async (logicalDate?: string) => ({
      ...populatedDay,
      is_current: logicalDate === undefined || logicalDate === "2026-08-22",
      taskchute_day: { ...populatedDay.taskchute_day, logical_date: logicalDate ?? "2026-08-22" },
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Morningを折りたたむ" }));
    expect(screen.queryByText("Canonical task")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "次の日" }));
    await screen.findByRole("button", { name: "2026年8月23日（日）、日付を選択" });
    expect(screen.getByText("Canonical task")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Morningを折りたたむ" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "前の日" }));
    await screen.findByRole("button", { name: "2026年8月22日（土）、日付を選択" });
    expect(screen.queryByText("Canonical task")).toBeNull();
    expect(screen.getByRole("button", { name: "Morningを展開" })).toBeTruthy();
  });

  it("keeps completed visibility orthogonal to Section collapse", async () => {
    const mixedDay = { ...twoPlannedDay, sections: [{ ...twoPlannedDay.sections[0], entries: [
      firstEntry, { ...secondEntry, lifecycle_state: "completed" as const },
    ] }, emptyDay.sections[1]] };
    mocks.loadDay.mockResolvedValue(mixedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Morningを折りたたむ" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "実行済みを表示" }));
    fireEvent.click(screen.getByRole("button", { name: "Morningを展開" }));
    expect(screen.getByText("Canonical task")).toBeTruthy();
    expect(screen.queryByText("Second task")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "実行済みを表示" }));
    expect(screen.getByText("Second task")).toBeTruthy();
  });

  it("does not run global navigation while editing text or during IME composition", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "EveningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "EveningのTask名" });
    fireEvent.keyDown(input, { key: "j" });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Escape" });
    const summary = screen.getByRole("button", { name: "MorningにTaskを追加" }).closest<HTMLElement>(".section-summary")!;
    summary.focus();
    fireEvent.keyDown(summary, { key: "j", isComposing: true });
    expect(document.activeElement).toBe(summary);
  });

  it("starts through the existing operation path and reconciles running state", async () => {
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(runningDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを開始" }));
    await waitFor(() => expect(mocks.startEntry).toHaveBeenCalledTimes(1));
    expect(mocks.startEntry.mock.calls[0][0].entry_id).toBe(firstEntry.id);
    expect(mocks.startEntry.mock.calls[0][0]).not.toHaveProperty("expected_placement_revision");
    expect(await screen.findByRole("button", { name: "Canonical taskを完了" })).toBeTruthy();
  });

  it("starts and completes a focused Entry with S through the existing lifecycle paths", async () => {
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(runningDay).mockResolvedValueOnce(completedDay);
    render(<App />);
    let row = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    row.focus();
    fireEvent.keyDown(row, { key: "s", code: "KeyS" });
    await waitFor(() => expect(mocks.startEntry).toHaveBeenCalledTimes(1));
    expect(mocks.startEntry.mock.calls[0][0].entry_id).toBe(firstEntry.id);
    row = (await screen.findByRole("button", { name: "Canonical taskを完了" })).closest<HTMLElement>("[data-entry-id]")!;
    row.focus();
    fireEvent.keyDown(row, { key: "S", code: "KeyS", shiftKey: true });
    await waitFor(() => expect(mocks.completeEntry).toHaveBeenCalledTimes(1));
    expect(mocks.completeEntry.mock.calls[0][0]).toMatchObject({ entry_id: firstEntry.id, execution_id: runningDay.active_execution?.id });
    expect(await screen.findByLabelText("Canonical taskは完了済み")).toBeTruthy();
  });

  it("does not run the S lifecycle shortcut for completed/non-current rows or unsafe key events", async () => {
    mocks.loadDay.mockResolvedValue(completedDay);
    const completedView = render(<App />);
    let row = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    row.focus();
    fireEvent.keyDown(row, { key: "s" });
    expect(mocks.startEntry).not.toHaveBeenCalled();
    expect(mocks.completeEntry).not.toHaveBeenCalled();
    completedView.unmount();

    const futureDay = { ...populatedDay, is_current: false,
      taskchute_day: { ...populatedDay.taskchute_day, logical_date: "2026-08-23" } };
    mocks.loadDay.mockResolvedValue(futureDay);
    const futureView = render(<App />);
    row = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    row.focus();
    fireEvent.keyDown(row, { key: "s" });
    expect(mocks.startEntry).not.toHaveBeenCalled();
    futureView.unmount();

    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    row = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    row.focus();
    fireEvent.keyDown(row, { key: "s", repeat: true });
    fireEvent.keyDown(row, { key: "s", ctrlKey: true });
    fireEvent.keyDown(row, { key: "s", altKey: true });
    fireEvent.keyDown(row, { key: "s", metaKey: true });
    fireEvent.keyDown(row, { key: "s", isComposing: true });
    expect(mocks.startEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "EveningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "EveningのTask名" });
    fireEvent.keyDown(input, { key: "s" });
    expect(mocks.startEntry).not.toHaveBeenCalled();
  });

  it("completes from the Row and runner through the canonical lifecycle path", async () => {
    mocks.loadDay.mockResolvedValueOnce(runningDay).mockResolvedValueOnce(completedDay);
    render(<App />);
    expect(await screen.findByRole("complementary", { name: "実行中のTask" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Canonical taskを完了" }));
    await waitFor(() => expect(mocks.completeEntry).toHaveBeenCalledTimes(1));
    expect(mocks.completeEntry.mock.calls[0][0]).toMatchObject({ entry_id: firstEntry.id, execution_id: runningDay.active_execution?.id });
    expect(await screen.findByLabelText("Canonical taskは完了済み")).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "実行中のTask" })).toBeNull();
  });

  it("reorders a focused planned Entry with Shift+Arrow and current placement revision", async () => {
    const reordered = {
      ...twoPlannedDay,
      placement_revision: 2,
      sections: [{ ...twoPlannedDay.sections[0], entries: [{ ...secondEntry, position: 1 }, { ...firstEntry, position: 2 }] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(reordered);
    render(<App />);
    const row = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    row.focus();
    fireEvent.keyDown(row, { key: "ArrowDown", shiftKey: true });
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(1));
    expect(mocks.reorderEntries.mock.calls[0][0]).toMatchObject({
      section_id: morningId,
      entry_ids: [secondEntry.id, firstEntry.id],
      expected_placement_revision: 1,
    });
  });

  it("removes pointer reorder arrows while retaining keyboard reorder and duplicate action", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    render(<App />);
    const handle = (await screen.findAllByTitle("ドラッグして並び替え"))[0]!;
    expect(handle.closest(".task-main")).toBeTruthy();
    expect(handle.closest<HTMLElement>("[data-entry-id]")?.getAttribute("draggable")).toBe("true");
    expect(screen.queryByRole("button", { name: "Canonical taskを上へ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Canonical taskを下へ" })).toBeNull();
    expect(screen.getByRole("button", { name: "Canonical taskを複製" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "並び替え" })).toBeNull();
  });

  it("drags a NULL-start Entry multiple positions after a target through one canonical Reorder", async () => {
    const threeEntries = { ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry, secondEntry, thirdEntry] }, emptyDay.sections[1]],
    };
    const reordered = { ...threeEntries, placement_revision: 2,
      sections: [{ ...threeEntries.sections[0], entries: [{ ...secondEntry, position: 1 }, { ...thirdEntry, position: 2 }, { ...firstEntry, position: 3 }] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValueOnce(threeEntries).mockResolvedValueOnce(reordered);
    render(<App />);
    const handles = await screen.findAllByTitle("ドラッグして並び替え");
    const target = screen.getByText("Third task").closest<HTMLElement>("[data-entry-id]")!;
    setDragRowBounds(target);
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(handles[0]!, { dataTransfer });
    const dragOver = createEvent.dragOver(target, { dataTransfer });
    Object.defineProperty(dragOver, "clientY", { value: 75 });
    fireEvent(target, dragOver);
    expect(target.classList.contains("drop-after")).toBe(true);
    const drop = createEvent.drop(target, { dataTransfer });
    Object.defineProperty(drop, "clientY", { value: 75 });
    fireEvent(target, drop);
    fireEvent.dragEnd(handles[0]!, { dataTransfer });
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(1));
    expect(mocks.reorderEntries.mock.calls[0][0]).toMatchObject({
      section_id: morningId,
      entry_ids: [secondEntry.id, thirdEntry.id, firstEntry.id],
      expected_placement_revision: 1,
    });
    await waitFor(() => expect(Array.from(document.querySelectorAll("[data-entry-id]")).map((row) => row.getAttribute("data-entry-id"))).toEqual([secondEntry.id, thirdEntry.id, firstEntry.id]));
    expect(document.activeElement?.getAttribute("data-entry-id")).toBe(firstEntry.id);
  });

  it("supports the actual mouse gesture path with a transient insertion indicator", async () => {
    const threeEntries = { ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry, secondEntry, thirdEntry] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(threeEntries);
    render(<App />);
    const handle = (await screen.findAllByTitle("ドラッグして並び替え"))[0]!;
    const target = screen.getByText("Third task").closest<HTMLElement>("[data-entry-id]")!;
    setDragRowBounds(target);
    fireEvent.mouseDown(handle, { button: 0 });
    fireEvent.mouseMove(target, { buttons: 1, clientY: 75 });
    expect(target.classList.contains("drop-after")).toBe(true);
    fireEvent.mouseUp(target, { button: 0, clientY: 75 });
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(1));
    expect(mocks.reorderEntries.mock.calls[0][0].entry_ids).toEqual([secondEntry.id, thirdEntry.id, firstEntry.id]);
    expect(target.classList.contains("drop-after")).toBe(false);
  });

  it("uses upper-half before placement for an equal non-null planned-start cohort", async () => {
    const timedFirst = { ...firstEntry, planned_start_minute: 600 };
    const timedSecond = { ...secondEntry, planned_start_minute: 600 };
    const timedThird = { ...thirdEntry, planned_start_minute: 600 };
    const timedDay = { ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [timedFirst, timedSecond, timedThird] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(timedDay);
    render(<App />);
    const handles = await screen.findAllByTitle("ドラッグして並び替え");
    const target = screen.getByText("Canonical task").closest<HTMLElement>("[data-entry-id]")!;
    dragEntry(handles[2]!, target, 25);
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(1));
    expect(mocks.reorderEntries.mock.calls[0][0].entry_ids).toEqual([thirdEntry.id, firstEntry.id, secondEntry.id]);
  });

  it.each([
    ["different planned-start minute", { ...secondEntry, planned_start_minute: 660 }],
    ["NULL versus non-null planned start", { ...secondEntry, planned_start_minute: 600 }],
  ])("rejects D&D for %s", async (_label, invalidTarget) => {
    const source = _label === "different planned-start minute" ? { ...firstEntry, planned_start_minute: 600 } : firstEntry;
    const day = { ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [source, invalidTarget] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(day);
    render(<App />);
    const handle = (await screen.findAllByTitle("ドラッグして並び替え"))[0]!;
    const target = screen.getByText("Second task").closest<HTMLElement>("[data-entry-id]")!;
    dragEntry(handle, target, 75);
    expect(target.classList.contains("drop-after")).toBe(false);
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("rejects cross-Section and no-op drops", async () => {
    const eveningEntry = { ...secondEntry, section_id: eveningId };
    const day = { ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry] }, { ...emptyDay.sections[1], entries: [eveningEntry] }],
    };
    mocks.loadDay.mockResolvedValue(day);
    render(<App />);
    const handles = await screen.findAllByTitle("ドラッグして並び替え");
    const sourceRow = screen.getByText("Canonical task").closest<HTMLElement>("[data-entry-id]")!;
    const crossSectionRow = screen.getByText("Second task").closest<HTMLElement>("[data-entry-id]")!;
    dragEntry(handles[0]!, crossSectionRow, 75);
    dragEntry(handles[0]!, sourceRow, 25);
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("does not cross an intervening canonical cohort even when source and target match", async () => {
    const timedMiddle = { ...secondEntry, planned_start_minute: 600 };
    const day = { ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry, timedMiddle, thirdEntry] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(day);
    render(<App />);
    const handle = (await screen.findAllByTitle("ドラッグして並び替え"))[0]!;
    const target = screen.getByText("Third task").closest<HTMLElement>("[data-entry-id]")!;
    dragEntry(handle, target, 75);
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("moves an ordinary Entry to a different Section through one MoveEntry and reconciles the append landing", async () => {
    const targetEntry = { ...secondEntry, section_id: eveningId, planned_start_minute: 720 };
    const movedEntry = { ...firstEntry, section_id: eveningId, planned_start_minute: 720 };
    const movedDay = {
      ...twoPlannedDay,
      placement_revision: 2,
      sections: [{ ...emptyDay.sections[0], entries: [] }, { ...emptyDay.sections[1], entries: [targetEntry, movedEntry] }],
      next_entry: targetEntry,
    };
    mocks.loadDay.mockResolvedValueOnce({
      ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry] }, { ...emptyDay.sections[1], entries: [targetEntry] }],
    }).mockResolvedValueOnce(movedDay);
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    const targetSummary = sectionSummary("Evening");
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(targetSummary, { dataTransfer });
    expect(targetSummary.dataset.dropTarget).toBe("valid");
    const targetGroup = targetSummary.parentElement!;
    expect(targetGroup.querySelector(".section-drop-placeholder")).toBeTruthy();
    fireEvent.drop(targetSummary, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });

    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    expect(mocks.moveEntry.mock.calls[0][0]).toMatchObject({
      entry_id: firstEntry.id,
      taskchute_day_id: twoPlannedDay.taskchute_day.id,
      section_id: eveningId,
      expected_placement_revision: twoPlannedDay.placement_revision,
    });
    expect(mocks.moveEntry.mock.calls[0][0].operation_id).toMatch(/[0-9a-f-]{36}/);
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Canonical taskの開始予定" }).textContent).toContain("12:00"));
    expect(screen.getByText("Canonical task").closest("[data-section-id]")?.getAttribute("data-section-id")).toBe(eveningId);
    expect(document.activeElement?.getAttribute("data-entry-id")).toBe(firstEntry.id);
  });

  it("moves an ordinary Sectionなし Entry to a real Section and previews an empty append target", async () => {
    const movedEntry = { ...firstEntry, section_id: morningId, planned_start_minute: 240 };
    const movedDay = {
      ...unsectionedDay,
      placement_revision: 2,
      sections: [{ ...emptyDay.sections[0], entries: [movedEntry] }, emptyDay.sections[1]],
      unsectioned_entries: [],
      next_entry: movedEntry,
    };
    mocks.loadDay.mockResolvedValueOnce(unsectionedDay).mockResolvedValueOnce(movedDay);
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    const targetSummary = sectionSummary("Morning");
    const sourceSummary = sectionSummary("Sectionなし");
    expect(sourceSummary).toBeTruthy();
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(targetSummary, { dataTransfer });
    expect(targetSummary.parentElement?.querySelector(".section-drop-placeholder")).toBeTruthy();
    fireEvent.drop(targetSummary, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    expect(mocks.moveEntry.mock.calls[0][0]).toMatchObject({ section_id: morningId, expected_placement_revision: 1 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Canonical taskの開始予定" }).textContent).toContain("04:00"));
  });

  it("moves an ordinary real-Section Entry to the visible Sectionなし summary with a null planned start", async () => {
    const unsectionedEntry = { ...secondEntry, section_id: null, planned_start_minute: null };
    const sourceDay = {
      ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry] }, emptyDay.sections[1]],
      unsectioned_entries: [unsectionedEntry],
      next_entry: firstEntry,
    };
    const movedEntry = { ...firstEntry, section_id: null, planned_start_minute: null };
    const movedDay = {
      ...sourceDay,
      placement_revision: 2,
      sections: [emptyDay.sections[0], emptyDay.sections[1]],
      unsectioned_entries: [unsectionedEntry, movedEntry],
      next_entry: unsectionedEntry,
    };
    mocks.loadDay.mockResolvedValueOnce(sourceDay).mockResolvedValueOnce(movedDay);
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    const targetSummary = sectionSummary("Sectionなし");
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(targetSummary, { dataTransfer });
    fireEvent.drop(targetSummary, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    expect(mocks.moveEntry.mock.calls[0][0]).toMatchObject({ section_id: null, expected_placement_revision: 1 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Canonical taskの開始予定" }).textContent).toContain("—"));
    expect(screen.getByText("Canonical task").closest("[data-section-id]")?.getAttribute("data-section-id")).toBe("");
  });

  it("treats dropping on the source Section summary as a no-op", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    const sourceSummary = sectionSummary("Morning");
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(sourceSummary, { dataTransfer });
    expect(sourceSummary.dataset.dropTarget).toBeUndefined();
    fireEvent.drop(sourceSummary, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    expect(mocks.moveEntry).not.toHaveBeenCalled();
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("shows no valid target or write for same-Section and Routine cross-Section drops", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000040",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000041",
      end_logical_date: null, can_end: true, default_section_id: morningId,
      default_planned_start_minute: null, section_plan_override_present: false,
      default_estimate_seconds: null, estimate_override_present: false, defaults_revision: 0,
    } };
    const routineDay = { ...twoPlannedDay, sections: [{ ...twoPlannedDay.sections[0], entries: [routineEntry] }, emptyDay.sections[1]] };
    mocks.loadDay.mockResolvedValue(routineDay);
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    const sourceSummary = sectionSummary("Morning");
    const targetSummary = sectionSummary("Evening");
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(sourceSummary, { dataTransfer });
    expect(sourceSummary.dataset.dropTarget).toBeUndefined();
    fireEvent.drop(sourceSummary, { dataTransfer });
    fireEvent.dragOver(targetSummary, { dataTransfer });
    expect(targetSummary.dataset.dropTarget).toBeUndefined();
    fireEvent.drop(targetSummary, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    expect(mocks.moveEntry).not.toHaveBeenCalled();
  });

  it("starts from the Task title with a threshold, ignores interactive descendants, and clears the floating state", async () => {
    const moved = { ...firstEntry, section_id: eveningId, planned_start_minute: 720 };
    const movedDay = { ...twoPlannedDay, placement_revision: 2,
      sections: [{ ...emptyDay.sections[0], entries: [] }, { ...emptyDay.sections[1], entries: [moved] }], next_entry: moved };
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(movedDay);
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    const title = screen.getByText("Canonical task");
    const targetSummary = sectionSummary("Evening");
    const select = screen.getByRole("combobox", { name: "Canonical taskのSection" });
    fireEvent.mouseDown(select, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(targetSummary, { buttons: 1, clientX: 20, clientY: 20 });
    fireEvent.mouseUp(targetSummary, { button: 0, clientX: 20, clientY: 20 });
    expect(mocks.moveEntry).not.toHaveBeenCalled();

    fireEvent.mouseDown(title, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(title, { buttons: 1, clientX: 1, clientY: 1 });
    expect(source.classList.contains("is-dragging")).toBe(false);
    fireEvent.mouseUp(title, { button: 0, clientX: 1, clientY: 1 });
    expect(mocks.moveEntry).not.toHaveBeenCalled();

    fireEvent.mouseDown(title, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(targetSummary, { buttons: 1, clientX: 20, clientY: 20 });
    expect(source.classList.contains("is-dragging")).toBe(true);
    expect(targetSummary.dataset.dropTarget).toBe("valid");
    fireEvent.mouseUp(targetSummary, { button: 0, clientX: 20, clientY: 20 });
    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    expect(source.classList.contains("is-dragging")).toBe(false);
  });

  it("keeps a collapsed target collapsed and focuses its summary after a cross-Section move", async () => {
    window.localStorage.setItem(DAY_SECTION_COLLAPSE_STORAGE_KEY, JSON.stringify({ version: 1, days: { [twoPlannedDay.taskchute_day.logical_date]: [eveningId] } }));
    const moved = { ...firstEntry, section_id: eveningId, planned_start_minute: 720 };
    const movedDay = { ...twoPlannedDay, placement_revision: 2,
      sections: [{ ...emptyDay.sections[0], entries: [] }, { ...emptyDay.sections[1], entries: [moved] }], next_entry: moved };
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(movedDay);
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    const targetSummary = sectionSummary("Evening");
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(targetSummary, { dataTransfer });
    expect(targetSummary.classList.contains("drop-target-collapsed")).toBe(true);
    expect(targetSummary.parentElement?.querySelector(".section-drop-cue")?.textContent).toBe("このSectionへ移動");
    fireEvent.drop(targetSummary, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole("button", { name: "Eveningを展開" }) as HTMLButtonElement).getAttribute("aria-expanded")).toBe("false"));
    expect(screen.queryByText("Canonical task")).toBeNull();
    expect(document.activeElement?.getAttribute("data-focus-key")).toBe(`section:${eveningId}`);
  });

  it("blocks a second cross-Section drag while MoveEntry is pending", async () => {
    const request = deferred<unknown>();
    mocks.loadDay.mockResolvedValue(populatedDay);
    mocks.moveEntry.mockReturnValue(request.promise);
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    const targetSummary = sectionSummary("Evening");
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(targetSummary, { dataTransfer });
    fireEvent.drop(targetSummary, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    expect(source.getAttribute("draggable")).toBe("false");
    fireEvent.dragStart(source, { dataTransfer: dragDataTransfer() });
    expect(mocks.moveEntry).toHaveBeenCalledTimes(1);
    request.resolve({});
    await waitFor(() => expect(screen.queryByText("Section移動・照合中…")).toBeNull());
  });

  it("does not expose a drag handle for running, completed, or read-only Entries", async () => {
    const readOnlyDay = { ...twoPlannedDay, is_current: false, planning_enabled: false };
    mocks.loadDay.mockResolvedValueOnce(runningDay);
    const view = render(<App />);
    await screen.findByRole("button", { name: "Canonical taskを完了" });
    expect(screen.queryByTitle("ドラッグして並び替え")).toBeNull();
    view.unmount();
    mocks.loadDay.mockResolvedValueOnce(completedDay);
    const completedView = render(<App />);
    await screen.findByLabelText("Canonical taskは完了済み");
    expect(screen.queryByTitle("ドラッグして並び替え")).toBeNull();
    completedView.unmount();
    mocks.loadDay.mockResolvedValueOnce(readOnlyDay);
    render(<App />);
    await screen.findByRole("button", { name: "Canonical taskを開始" });
    expect(screen.queryByTitle("ドラッグして並び替え")).toBeNull();
  });

  it("blocks a new drag reorder while another mutation is pending", async () => {
    const request = deferred<unknown>();
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.reorderEntries.mockReturnValue(request.promise);
    render(<App />);
    const handles = await screen.findAllByTitle("ドラッグして並び替え");
    const target = screen.getByText("Second task").closest<HTMLElement>("[data-entry-id]")!;
    dragEntry(handles[0]!, target, 75);
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(1));
    const handle = screen.getAllByTitle("ドラッグして並び替え")[1]!;
    expect(handle.closest<HTMLElement>("[data-entry-id]")?.getAttribute("draggable")).toBe("false");
    const source = screen.getByText("Canonical task").closest<HTMLElement>("[data-entry-id]")!;
    dragEntry(handle, source, 25);
    expect(mocks.reorderEntries).toHaveBeenCalledTimes(1);
    request.resolve({});
    await waitFor(() => expect(screen.queryByText("並び替え・照合中…")).toBeNull());
  });

  it("shows placement reconciliation in the shared floating status", async () => {
    const request = deferred<unknown>();
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.reorderEntries.mockReturnValue(request.promise);
    render(<App />);
    const handles = await screen.findAllByTitle("ドラッグして並び替え");
    const target = screen.getByText("Second task").closest<HTMLElement>("[data-entry-id]")!;
    dragEntry(handles[0]!, target, 75);

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("並び替え・照合中…");
    expect(status.classList.contains("transient-status")).toBe(true);

    request.resolve({});
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("does not reorder planned A across a hidden completed canonical neighbor", async () => {
    const day = {
      ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry, { ...secondEntry, lifecycle_state: "completed" as const }] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(day);
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "実行済みを表示" }));
    const row = screen.getByText("Canonical task").closest<HTMLElement>("[data-entry-id]")!;
    fireEvent.keyDown(row, { key: "ArrowDown", shiftKey: true });
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("does not reorder planned B upward across a hidden completed canonical neighbor", async () => {
    const day = {
      ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [{ ...firstEntry, lifecycle_state: "completed" as const }, secondEntry] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(day);
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "実行済みを表示" }));
    const row = screen.getByText("Second task").closest<HTMLElement>("[data-entry-id]")!;
    fireEvent.keyDown(row, { key: "ArrowUp", shiftKey: true });
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("does not reorder visible planned C across hidden completed B by pointer or keyboard", async () => {
    const day = {
      ...twoPlannedDay,
      sections: [{
        ...twoPlannedDay.sections[0],
        entries: [firstEntry, { ...secondEntry, lifecycle_state: "completed" as const }, thirdEntry],
      }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(day);
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "実行済みを表示" }));
    const row = screen.getByText("Third task").closest<HTMLElement>("[data-entry-id]")!;
    fireEvent.keyDown(row, { key: "ArrowUp", shiftKey: true });
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("does not swap a planned Entry with an adjacent running Entry", async () => {
    const day = {
      ...twoPlannedDay,
      sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry, { ...secondEntry, lifecycle_state: "running" as const }] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValue(day);
    render(<App />);
    const row = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    fireEvent.keyDown(row, { key: "ArrowDown", shiftKey: true });
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("retains an ambiguous AddTask operation for exact retry and blocks unrelated actions", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.addTask.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "MorningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "MorningのTask名" });
    fireEvent.change(input, { target: { value: "Retry me" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    const retry = await screen.findByRole("button", { name: "保留中のTask追加を再試行" });
    const unrelated = screen.getByRole("button", { name: "EveningにTaskを追加" }) as HTMLButtonElement;
    expect(unrelated.disabled).toBe(true);
    fireEvent.click(unrelated);
    expect(mocks.addTask).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.addTask).toHaveBeenCalledTimes(2));
    expect(mocks.addTask.mock.calls[1][0]).toEqual(mocks.addTask.mock.calls[0][0]);
  });

  it("settles a lost AddTask response from canonical state without a duplicate action", async () => {
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockImplementationOnce(async () => {
      const operation = mocks.addTask.mock.calls[0][0];
      return {
        ...populatedDay,
        sections: [{
          ...populatedDay.sections[0],
          entries: [{ ...firstEntry, id: operation.entry_id, task: { ...firstEntry.task, id: operation.task_id, title: operation.title } }],
        }, emptyDay.sections[1]],
      };
    });
    mocks.addTask.mockRejectedValueOnce(new TypeError("response lost after commit"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "MorningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "MorningのTask名" });
    fireEvent.change(input, { target: { value: "Committed once" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(await screen.findByText("Committed once")).toBeTruthy();
    expect(mocks.addTask).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "保留中のTask追加を再試行" })).toBeNull();
  });

  it("uses a fresh AddTask identity and reconciled revision after deterministic conflict", async () => {
    const revisionOne = { ...emptyDay, placement_revision: 1 };
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockResolvedValueOnce(revisionOne).mockResolvedValueOnce(populatedDay);
    mocks.addTask.mockRejectedValueOnce(new ApiClientError("revision conflict", 409, true, "revision_conflict")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "MorningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "MorningのTask名" });
    fireEvent.change(input, { target: { value: "Conflict then retry" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "MorningのTask名" }), { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.addTask).toHaveBeenCalledTimes(2));
    const first = mocks.addTask.mock.calls[0][0];
    const second = mocks.addTask.mock.calls[1][0];
    expect(second.operation_id).not.toBe(first.operation_id);
    expect(second.expected_placement_revision).toBe(1);
  });

  it("retries only the exact ambiguous Start and never replays it from another Row", async () => {
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(runningDay);
    mocks.startEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを開始" }));
    const retry = await screen.findByRole("button", { name: "保留中のStartを再試行" });
    const unrelated = screen.getByRole("button", { name: "Second taskを開始" }) as HTMLButtonElement;
    expect(unrelated.disabled).toBe(true);
    fireEvent.click(unrelated);
    expect(mocks.startEntry).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.startEntry).toHaveBeenCalledTimes(2));
    expect(mocks.startEntry.mock.calls[1][0]).toEqual(mocks.startEntry.mock.calls[0][0]);
  });

  it("keeps a non-empty draft but blocks its submit while an ambiguous Start is retained", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.startEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "EveningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "EveningのTask名" });
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Canonical taskを開始" }));
    await screen.findByRole("button", { name: "保留中のStartを再試行" });
    expect(screen.getByDisplayValue("Keep this draft")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(mocks.addTask).not.toHaveBeenCalled();
  });

  it("keeps a non-empty draft but blocks its Enter submit while another mutation is pending", async () => {
    const request = deferred<unknown>();
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.startEntry.mockReturnValue(request.promise);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "EveningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "EveningのTask名" });
    fireEvent.change(input, { target: { value: "Keep pending draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Canonical taskを開始" }));
    await waitFor(() => expect(mocks.startEntry).toHaveBeenCalledTimes(1));
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("開始・照合中…");
    expect(status.classList.contains("transient-status")).toBe(true);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(mocks.addTask).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Keep pending draft")).toBeTruthy();
    request.resolve({});
    await waitFor(() => expect(screen.queryByText("開始・照合中…")).toBeNull());
  });

  it("discards ambiguous Start without mutation and then creates fresh Start identities", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.startEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを開始" }));
    const discard = await screen.findByRole("button", { name: "保留中のclient操作を破棄" });
    const retained = mocks.startEntry.mock.calls[0][0];
    fireEvent.click(discard);
    expect(mocks.startEntry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Second taskを開始" }));
    await waitFor(() => expect(mocks.startEntry).toHaveBeenCalledTimes(2));
    const fresh = mocks.startEntry.mock.calls[1][0];
    expect(fresh.operation_id).not.toBe(retained.operation_id);
    expect(fresh.execution_id).not.toBe(retained.execution_id);
    expect(fresh.entry_id).toBe(secondEntry.id);
  });

  it("retries only the exact ambiguous Reorder and disables a different move", async () => {
    const reordered = {
      ...twoPlannedDay,
      placement_revision: 2,
      sections: [{ ...twoPlannedDay.sections[0], entries: [{ ...secondEntry, position: 1 }, { ...firstEntry, position: 2 }] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(reordered);
    mocks.reorderEntries.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    source.focus();
    fireEvent.keyDown(source, { key: "ArrowDown", shiftKey: true });
    const retry = await screen.findByRole("button", { name: "保留中のReorderを再試行" });
    const unrelated = screen.getByText("Second task").closest<HTMLElement>("[data-entry-id]")!;
    unrelated.focus();
    fireEvent.keyDown(unrelated, { key: "ArrowUp", shiftKey: true });
    expect(mocks.reorderEntries).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(2));
    expect(mocks.reorderEntries.mock.calls[1][0]).toEqual(mocks.reorderEntries.mock.calls[0][0]);
  });

  it("keeps a non-empty draft but blocks its submit while an ambiguous Reorder is retained", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.reorderEntries.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "EveningにTaskを追加" }));
    const input = screen.getByRole("textbox", { name: "EveningのTask名" });
    fireEvent.change(input, { target: { value: "Keep reorder draft" } });
    const source = screen.getByText("Canonical task").closest<HTMLElement>("[data-entry-id]")!;
    source.focus();
    fireEvent.keyDown(source, { key: "ArrowDown", shiftKey: true });
    await screen.findByRole("button", { name: "保留中のReorderを再試行" });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(mocks.addTask).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Keep reorder draft")).toBeTruthy();
  });

  it("discards ambiguous Reorder and uses a fresh operation with reconciled revision", async () => {
    const revisionSeven = { ...twoPlannedDay, placement_revision: 7 };
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValue(revisionSeven);
    mocks.reorderEntries.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    source.focus();
    fireEvent.keyDown(source, { key: "ArrowDown", shiftKey: true });
    const discard = await screen.findByRole("button", { name: "保留中のclient操作を破棄" });
    const retained = mocks.reorderEntries.mock.calls[0][0];
    fireEvent.click(discard);
    expect(mocks.reorderEntries).toHaveBeenCalledTimes(1);
    const second = screen.getByText("Second task").closest<HTMLElement>("[data-entry-id]")!;
    second.focus();
    fireEvent.keyDown(second, { key: "ArrowUp", shiftKey: true });
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(2));
    const fresh = mocks.reorderEntries.mock.calls[1][0];
    expect(fresh.operation_id).not.toBe(retained.operation_id);
    expect(fresh.expected_placement_revision).toBe(7);
  });

  it("retries the exact ambiguous Complete identity", async () => {
    mocks.loadDay.mockResolvedValue(runningDay);
    mocks.completeEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "実行中のTaskを完了" }));
    const retry = await screen.findByRole("button", { name: "保留中のCompleteを再試行" });
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.completeEntry).toHaveBeenCalledTimes(2));
    expect(mocks.completeEntry.mock.calls[1][0]).toEqual(mocks.completeEntry.mock.calls[0][0]);
  });

  it("discards ambiguous Complete without mutation and unlocks unrelated controls", async () => {
    mocks.loadDay.mockResolvedValue(runningDay);
    mocks.completeEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "実行中のTaskを完了" }));
    const discard = await screen.findByRole("button", { name: "保留中のclient操作を破棄" });
    expect((screen.getByRole("button", { name: "EveningにTaskを追加" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(discard);
    expect(mocks.completeEntry).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "EveningにTaskを追加" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reconciles deterministic Reorder and Start conflicts without false-success UI", async () => {
    const canonicalWinner = {
      ...twoPlannedDay,
      placement_revision: 2,
      sections: [{ ...twoPlannedDay.sections[0], entries: [{ ...secondEntry, position: 1 }, { ...firstEntry, position: 2 }] }, emptyDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(canonicalWinner);
    mocks.reorderEntries.mockRejectedValueOnce(new ApiClientError("revision conflict", 409, true, "revision_conflict"));
    const view = render(<App />);
    const source = (await screen.findByText("Canonical task")).closest<HTMLElement>("[data-entry-id]")!;
    source.focus();
    fireEvent.keyDown(source, { key: "ArrowDown", shiftKey: true });
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    expect(Array.from(document.querySelectorAll("[data-entry-id]")).map((row) => row.getAttribute("data-entry-id"))).toEqual([secondEntry.id, firstEntry.id]);
    expect(screen.queryByRole("button", { name: "保留中のReorderを再試行" })).toBeNull();
    view.unmount();

    vi.clearAllMocks();
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.startEntry.mockRejectedValueOnce(new ApiClientError("active conflict", 409, true, "resource_conflict"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを開始" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("complementary", { name: "実行中のTask" })).toBeNull();
    expect(screen.queryByRole("button", { name: "保留中のStartを再試行" })).toBeNull();
  });

  it("can complete a cross-Day active Execution from the runner without inventing a Task title", async () => {
    const crossDay = { ...emptyDay, active_execution: runningDay.active_execution };
    mocks.loadDay.mockResolvedValueOnce(crossDay).mockResolvedValueOnce(emptyDay);
    render(<App />);
    const runner = await screen.findByRole("complementary", { name: "実行中のTask" });
    expect(runner.textContent).toContain("別日の実行中Task");
    fireEvent.click(screen.getByRole("button", { name: "実行中のTaskを完了" }));
    await waitFor(() => expect(mocks.completeEntry).toHaveBeenCalledTimes(1));
    expect(mocks.completeEntry.mock.calls[0][0]).toMatchObject({
      entry_id: runningDay.active_execution?.entry_id,
      execution_id: runningDay.active_execution?.id,
    });
    expect(screen.queryByRole("complementary", { name: "実行中のTask" })).toBeNull();
  });

  it("shows the floating runner only for an active Execution and resolves its Task title", async () => {
    mocks.loadDay.mockResolvedValueOnce(populatedDay);
    const view = render(<App />);
    await screen.findByText("Canonical task");
    expect(screen.queryByRole("complementary", { name: "実行中のTask" })).toBeNull();
    view.unmount();

    mocks.loadDay.mockResolvedValueOnce(runningDay);
    render(<App />);
    const runner = await screen.findByRole("complementary", { name: "実行中のTask" });
    expect(runner.textContent).toContain("Canonical task");
    expect(runner.textContent).toContain("実行中");
  });

  it("hides completed Rows client-side while keeping their Section visible", async () => {
    mocks.loadDay.mockResolvedValue(completedDay);
    render(<App />);
    expect(await screen.findByText("Canonical task")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "実行済みを表示" }));
    expect(screen.queryByText("Canonical task")).toBeNull();
    expect(screen.getAllByText("Morning")[0]).toBeTruthy();
    expect(screen.getByText(/1\/1 実行済み/)).toBeTruthy();
  });

  it("lists and creates Projects in dedicated Settings while keeping DayBoard controls focused", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    await screen.findByRole("region", { name: "DayBoard" });
    expect(screen.queryByText("Project作成")).toBeNull();
    expect(screen.queryByRole("button", { name: "Section設定" })).toBeNull();
    const settings = await openProjectSettings();
    expect(settings.textContent).toContain("Existing Project");
    expect(settings.textContent).toContain("rename・delete・archive・並び替えは現在未対応");
    expect(screen.queryByRole("region", { name: "DayBoard" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Project名" }), { target: { value: "Project" } });
    fireEvent.click(screen.getByRole("button", { name: "Projectを作成" }));
    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("作成済み: Project")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "今日" }));
    expect(await screen.findByRole("region", { name: "DayBoard" })).toBeTruthy();
  });

  it("blocks concurrent Project primary submits while the first request is pending", async () => {
    const request = deferred<{ project: { id: string; title: string } }>();
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.createProject.mockReturnValue(request.promise);
    render(<App />);
    await openProjectSettings();
    const input = screen.getByRole("textbox", { name: "Project名" });
    fireEvent.change(input, { target: { value: "One request" } });
    const form = input.closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "作成中…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(form);
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    request.resolve({ project: { id: "project", title: "One request" } });
    await screen.findByText("作成済み: One request");
  });

  it("retries an ambiguous Project with the exact original identity and semantic title", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.createProject.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({ project: { id: "project", title: "Original title" } });
    render(<App />);
    await openProjectSettings();
    const input = screen.getByRole("textbox", { name: "Project名" });
    fireEvent.change(input, { target: { value: "Original title" } });
    fireEvent.submit(input.closest("form")!);
    const retry = await screen.findByRole("button", { name: "保留中のProject作成を再試行" });
    const original = mocks.createProject.mock.calls[0][0];
    fireEvent.change(input, { target: { value: "Changed form text" } });
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.createProject).toHaveBeenCalledTimes(2));
    expect(mocks.createProject.mock.calls[1][0]).toEqual(original);
    expect(original).toMatchObject({ title: "Original title" });
  });

  it("creates the first Sectionなし Task from the Day toolbar", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ Taskを追加" }));
    const input = screen.getByRole("textbox", { name: "SectionなしのTask名" });
    fireEvent.change(input, { target: { value: "Unsectioned task" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.addTask).toHaveBeenCalledTimes(1));
    expect(mocks.addTask.mock.calls[0][0]).toMatchObject({ title: "Unsectioned task", section_id: null });
  });

  it("normalizes zero estimate minutes to null before sending the operation", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの見積" }));
    const input = screen.getByRole("textbox", { name: "Canonical taskの見積（分）" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.setEntryEstimate).toHaveBeenCalledTimes(1));
    expect(mocks.setEntryEstimate.mock.calls[0][0]).toMatchObject({ entry_id: firstEntry.id, estimate_seconds: null });
  });

  it("retains only the exact ambiguous estimate operation and blocks unrelated Start", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    mocks.setEntryEstimate.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの見積" }));
    const input = screen.getByRole("textbox", { name: "Canonical taskの見積（分）" });
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    const retry = await screen.findByRole("button", { name: "保留中の見積保存を再試行" });
    expect((screen.getByRole("button", { name: "Canonical taskを開始" }) as HTMLButtonElement).disabled).toBe(true);
    const original = mocks.setEntryEstimate.mock.calls[0][0];
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.setEntryEstimate).toHaveBeenCalledTimes(2));
    expect(mocks.setEntryEstimate.mock.calls[1][0]).toEqual(original);
  });

  it("moves a planned Entry directly to Sectionなし with the current placement revision", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Canonical taskのSection" }), { target: { value: "" } });
    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    expect(mocks.moveEntry.mock.calls[0][0]).toMatchObject({ entry_id: firstEntry.id, section_id: null, expected_placement_revision: 1 });
  });

  it("edits an extended planned start and reconciles the Entry into its canonical Section", async () => {
    const moved = {
      ...populatedDay,
      placement_revision: 2,
      sections: [emptyDay.sections[0], {
        ...emptyDay.sections[1],
        entries: [{ ...firstEntry, section_id: eveningId, position: 1, planned_start_minute: 1620 }],
      }],
      next_entry: { ...firstEntry, section_id: eveningId, position: 1, planned_start_minute: 1620 },
    };
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(moved);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの開始予定" }));
    const input = screen.getByRole("textbox", { name: "Canonical taskの開始予定" });
    fireEvent.change(input, { target: { value: "27:00" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.setEntryPlannedStart).toHaveBeenCalledTimes(1));
    expect(mocks.setEntryPlannedStart.mock.calls[0][0]).toMatchObject({
      entry_id: firstEntry.id,
      taskchute_day_id: emptyDay.taskchute_day.id,
      planned_start_minute: 1620,
      expected_placement_revision: 1,
    });
    expect((await screen.findByRole("button", { name: "Canonical taskの開始予定" })).textContent).toContain("27:00");
    expect(screen.getByText("Canonical task").closest(".section-group")?.textContent ?? "").toContain("Evening");
  });

  it("rejects the exclusive Day end before sending a planned-start command", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの開始予定" }));
    const input = screen.getByRole("textbox", { name: "Canonical taskの開始予定" });
    fireEvent.change(input, { target: { value: "28:00" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toContain("28:00 未満");
    expect(mocks.setEntryPlannedStart).not.toHaveBeenCalled();
  });

  it("clears planned start without changing its Section and reflects explicit Move clearing", async () => {
    const timed = { ...firstEntry, planned_start_minute: 600 };
    const timedDay = { ...populatedDay, sections: [{ ...emptyDay.sections[0], entries: [timed] }, emptyDay.sections[1]], next_entry: timed };
    const clearedDay = { ...timedDay, placement_revision: 2,
      sections: [{ ...emptyDay.sections[0], entries: [firstEntry] }, emptyDay.sections[1]], next_entry: firstEntry };
    const movedDay = { ...clearedDay, placement_revision: 3,
      sections: [emptyDay.sections[0], { ...emptyDay.sections[1], entries: [{ ...firstEntry, section_id: eveningId }] }],
      next_entry: { ...firstEntry, section_id: eveningId } };
    mocks.loadDay.mockResolvedValueOnce(timedDay).mockResolvedValueOnce(clearedDay).mockResolvedValueOnce(movedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの開始予定" }));
    const plannedInput = screen.getByRole("textbox", { name: "Canonical taskの開始予定" });
    fireEvent.change(plannedInput, { target: { value: "" } });
    fireEvent.keyDown(plannedInput, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(mocks.setEntryPlannedStart).toHaveBeenCalledTimes(1));
    expect(mocks.setEntryPlannedStart.mock.calls[0][0].planned_start_minute).toBeNull();
    expect((screen.getByRole("combobox", { name: "Canonical taskのSection" }) as unknown as HTMLSelectElement).value).toBe(morningId);
    fireEvent.change(screen.getByRole("combobox", { name: "Canonical taskのSection" }), { target: { value: eveningId } });
    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Canonical taskのSection" }) as unknown as HTMLSelectElement).value).toBe(eveningId));
    expect(screen.getByRole("button", { name: "Canonical taskの開始予定" }).textContent).toContain("—");
  });

  it("closes an open planned-start editor and shows the canonical clear after explicit Section move", async () => {
    const timed = { ...firstEntry, planned_start_minute: 600 };
    const timedDay = { ...populatedDay,
      sections: [{ ...emptyDay.sections[0], entries: [timed] }, emptyDay.sections[1]], next_entry: timed };
    const moved = { ...firstEntry, section_id: eveningId, planned_start_minute: null };
    const movedDay = { ...timedDay, placement_revision: 2,
      sections: [emptyDay.sections[0], { ...emptyDay.sections[1], entries: [moved] }], next_entry: moved };
    mocks.loadDay.mockResolvedValueOnce(timedDay).mockResolvedValueOnce(movedDay);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの開始予定" }));
    expect((screen.getByRole("textbox", { name: "Canonical taskの開始予定" }) as unknown as HTMLInputElement).value).toBe("10:00");
    fireEvent.change(screen.getByRole("combobox", { name: "Canonical taskのSection" }), { target: { value: eveningId } });

    await waitFor(() => expect(mocks.moveEntry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole("combobox", { name: "Canonical taskのSection" }) as unknown as HTMLSelectElement).value)
      .toBe(eveningId));
    expect(screen.queryByRole("textbox", { name: "Canonical taskの開始予定" })).toBeNull();
    expect(screen.getByRole("button", { name: "Canonical taskの開始予定" }).textContent).toContain("—");
  });

  it("allows reorder only inside the same planned-start cohort", async () => {
    const nullEntry = firstEntry;
    const timedA = { ...secondEntry, planned_start_minute: 600 };
    const timedB = { ...thirdEntry, planned_start_minute: 600 };
    const day = { ...twoPlannedDay, sections: [{ ...emptyDay.sections[0], entries: [nullEntry, timedA, timedB] }, emptyDay.sections[1]] };
    mocks.loadDay.mockResolvedValue(day);
    render(<App />);
    await screen.findByText("Second task");
    expect(screen.queryByRole("button", { name: "Canonical taskを下へ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Second taskを下へ" })).toBeNull();
    const row = screen.getByText("Second task").closest<HTMLElement>("[data-entry-id]")!;
    fireEvent.keyDown(row, { key: "ArrowUp", shiftKey: true });
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
  });

  it("does not expose editable planned-start controls for running or completed Entries", async () => {
    mocks.loadDay.mockResolvedValueOnce(runningDay);
    const runningView = render(<App />);
    expect((await screen.findByRole("button", { name: "Canonical taskの開始予定" }) as HTMLButtonElement).disabled).toBe(true);
    runningView.unmount();
    mocks.loadDay.mockResolvedValueOnce(completedDay);
    render(<App />);
    expect((await screen.findByRole("button", { name: "Canonical taskの開始予定" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("retains and exactly retries an ambiguous planned-start operation", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    mocks.setEntryPlannedStart.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"))
      .mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの開始予定" }));
    const input = screen.getByRole("textbox", { name: "Canonical taskの開始予定" });
    fireEvent.change(input, { target: { value: "10:00" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    const retry = await screen.findByRole("button", { name: "保留中の開始予定保存を再試行" });
    expect((screen.getByRole("button", { name: "Canonical taskを開始" }) as HTMLButtonElement).disabled).toBe(true);
    const original = mocks.setEntryPlannedStart.mock.calls[0][0];
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.setEntryPlannedStart).toHaveBeenCalledTimes(2));
    expect(mocks.setEntryPlannedStart.mock.calls[1][0]).toEqual(original);
  });

  it("settles a lost planned-start response from canonical state without resending", async () => {
    const committedEntry = { ...firstEntry, planned_start_minute: 600 };
    const committedDay = { ...populatedDay, placement_revision: 2,
      sections: [{ ...emptyDay.sections[0], entries: [committedEntry] }, emptyDay.sections[1]], next_entry: committedEntry };
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(committedDay);
    mocks.setEntryPlannedStart.mockRejectedValueOnce(new TypeError("response lost after commit"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの開始予定" }));
    const input = screen.getByRole("textbox", { name: "Canonical taskの開始予定" });
    fireEvent.change(input, { target: { value: "10:00" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "保留中の開始予定保存を再試行" })).toBeNull());
    expect((await screen.findByRole("button", { name: "Canonical taskの開始予定" })).textContent).toContain("10:00");
    expect(mocks.setEntryPlannedStart).toHaveBeenCalledTimes(1);
  });

  it("renders canonical planned-start order and values on initial reload", async () => {
    const timed = { ...secondEntry, planned_start_minute: 600 };
    const reloaded = { ...twoPlannedDay,
      sections: [{ ...emptyDay.sections[0], entries: [firstEntry, timed] }, emptyDay.sections[1]], next_entry: firstEntry };
    mocks.loadDay.mockResolvedValue(reloaded);
    render(<App />);
    await screen.findByText("Canonical task");
    expect(Array.from(document.querySelectorAll("[data-entry-id]")).map((row) => row.getAttribute("data-entry-id")))
      .toEqual([firstEntry.id, secondEntry.id]);
    expect(screen.getByRole("button", { name: "Canonical taskの開始予定" }).textContent).toContain("—");
    expect(screen.getByRole("button", { name: "Second taskの開始予定" }).textContent).toContain("10:00");
  });

  it("submits only explicitly entered initial Section ranges", async () => {
    const legacyDay = { ...emptyDay, section_configuration_required: true,
      sections: emptyDay.sections.map((section) => ({ ...section, logical_start_minute: null, logical_end_minute: null,
        actual_start_instant: null, actual_end_instant: null })) };
    mocks.loadDay.mockResolvedValue(legacyDay);
    render(<App />);
    const gate = await screen.findByRole("region", { name: "初期Section時間帯設定" });
    const inputs = gate.querySelectorAll<HTMLInputElement>("input");
    ["04:00", "12:00", "12:00", "28:00"].forEach((value, index) => fireEvent.change(inputs[index]!, { target: { value } }));
    fireEvent.click(screen.getByRole("button", { name: "この時間帯で確定" }));
    await waitFor(() => expect(mocks.establishInitialSectionConfiguration).toHaveBeenCalledTimes(1));
    expect(mocks.establishInitialSectionConfiguration.mock.calls[0][0].items).toEqual([
      { section_id: morningId, logical_start_minute: 240, logical_end_minute: 720 },
      { section_id: eveningId, logical_start_minute: 720, logical_end_minute: 1680 },
    ]);
  });

  it("edits and saves a gapless next-Day Section configuration without changing the current Day", async () => {
    const saved = {
      configuration_version_id: "019c0000-0000-7000-8000-000000000099",
      day_boundary_minutes: 240,
      items: [
        { section_id: morningId, title: "Focus", logical_start_minute: 240, logical_end_minute: 780 },
        { section_id: eveningId, title: "Evening", logical_start_minute: 780, logical_end_minute: 1680 },
      ],
    };
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.loadSectionConfiguration
      .mockResolvedValueOnce({ configuration_version_id: "019c0000-0000-7000-8000-000000000020",
        day_boundary_minutes: 240, items: [
          { section_id: morningId, title: "Morning", logical_start_minute: 240, logical_end_minute: 720 },
          { section_id: eveningId, title: "Evening", logical_start_minute: 720, logical_end_minute: 1680 },
        ] })
      .mockResolvedValueOnce(saved);
    render(<App />);
    const settingsRegion = await openSectionSettings();
    expect(settingsRegion.textContent).toContain("次に確立されるTaskChuteDayから反映");
    expect(settingsRegion.textContent).not.toMatch(/Icon|Accent/);
    fireEvent.change(screen.getByRole("textbox", { name: "Morningの終了" }), { target: { value: "13:00" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Section 1の名前" }), { target: { value: " Focus " } });
    expect((screen.getByRole("textbox", { name: "Eveningの開始" }) as HTMLInputElement).value).toBe("13:00");
    fireEvent.click(screen.getByRole("button", { name: "次のDay用に保存" }));
    await waitFor(() => expect(mocks.updateSectionConfiguration).toHaveBeenCalledTimes(1));
    expect(mocks.updateSectionConfiguration.mock.calls[0][0]).toMatchObject({
      expected_configuration_version_id: "019c0000-0000-7000-8000-000000000020",
      items: saved.items,
    });
    await waitFor(() => expect(screen.getByRole("region", { name: "Section設定" })).toBeTruthy());
    expect((screen.getByRole("textbox", { name: "Section 1の名前" }) as HTMLInputElement).value).toBe("Focus");
    expect(screen.getByRole("status").textContent).toContain("保存しました。次のTaskChuteDayから反映されます。");
    expect(mocks.loadDay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "今日" }));
    expect(screen.getAllByText("Morning").length).toBeGreaterThan(0);
  });

  it("adds by deterministic midpoint, deletes with absorption, and cancels without a server mutation", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    await openSectionSettings();
    fireEvent.click(screen.getAllByRole("button", { name: "この後に追加" })[0]!);
    expect(screen.getAllByLabelText(/Section \d+の名前/)).toHaveLength(3);
    expect((screen.getByRole("textbox", { name: "新しいSectionの開始" }) as HTMLInputElement).value).toBe("08:00");
    expect((screen.getByRole("textbox", { name: "新しいSectionの終了" }) as HTMLInputElement).value).toBe("12:00");
    fireEvent.click(screen.getAllByRole("button", { name: "削除" })[1]!);
    expect(screen.getAllByLabelText(/Section \d+の名前/)).toHaveLength(2);
    expect((screen.getByRole("textbox", { name: "Eveningの開始" }) as HTMLInputElement).value).toBe("08:00");
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("region", { name: "Section設定" })).toBeNull();
    expect(mocks.updateSectionConfiguration).not.toHaveBeenCalled();
  });

  it("preserves an unsaved Section draft across Project and Today navigation without reloading canonical configuration", async () => {
    const future = { ...emptyDay, establishment_state: "future_preview" as const, is_current: false,
      taskchute_day: { ...emptyDay.taskchute_day, id: null, logical_date: "2026-08-23" } };
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockResolvedValueOnce(future).mockResolvedValueOnce(emptyDay);
    render(<App />);
    await screen.findByRole("region", { name: "DayBoard" });
    fireEvent.click(screen.getByRole("button", { name: "次の日" }));
    await screen.findByRole("button", { name: "2026年8月23日（日）、日付を選択" });
    await openSectionSettings();
    expect(mocks.loadSectionConfiguration).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole("textbox", { name: "Section 1の名前" }), { target: { value: "Unsaved Focus" } });
    fireEvent.click(screen.getByRole("button", { name: "Project" }));
    await screen.findByRole("region", { name: "Project設定" });
    fireEvent.click(screen.getByRole("button", { name: "Section" }));
    expect((await screen.findByRole("textbox", { name: "Section 1の名前" }) as HTMLInputElement).value).toBe("Unsaved Focus");
    expect(mocks.loadSectionConfiguration).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "今日" }));
    await screen.findByRole("button", { name: "2026年8月22日（土）、日付を選択" });
    expect(mocks.loadDay).toHaveBeenLastCalledWith(undefined);
    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    expect((await screen.findByRole("textbox", { name: "Section 1の名前" }) as HTMLInputElement).value).toBe("Unsaved Focus");
    fireEvent.click(screen.getByRole("button", { name: "Section" }));
    expect((screen.getByRole("textbox", { name: "Section 1の名前" }) as HTMLInputElement).value).toBe("Unsaved Focus");
    expect(mocks.loadSectionConfiguration).toHaveBeenCalledTimes(1);
    expect(mocks.updateSectionConfiguration).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("region", { name: "Section設定" })).toBeNull();
  });

  it("discards an unsaved Section draft only on explicit Cancel and reloads canonical configuration on return", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    await openSectionSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "Section 1の名前" }), { target: { value: "Discard me" } });
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("region", { name: "Section設定" })).toBeNull();
    expect(mocks.updateSectionConfiguration).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Section" }));
    expect((await screen.findByRole("textbox", { name: "Section 1の名前" }) as HTMLInputElement).value).toBe("Morning");
    expect(mocks.loadSectionConfiguration).toHaveBeenCalledTimes(2);
    expect(mocks.updateSectionConfiguration).not.toHaveBeenCalled();
  });

  it("retains and retries the exact Section Settings operation after an ambiguous outcome", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.updateSectionConfiguration
      .mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"))
      .mockResolvedValueOnce({ configuration_version_id: "new-version" });
    render(<App />);
    await openSectionSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "Section 1の名前" }), { target: { value: "Focus" } });
    fireEvent.click(screen.getByRole("button", { name: "次のDay用に保存" }));
    const retry = await screen.findByRole("button", { name: "保留中の次Day Section設定を再試行" });
    const original = mocks.updateSectionConfiguration.mock.calls[0][0];
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.updateSectionConfiguration).toHaveBeenCalledTimes(2));
    expect(mocks.updateSectionConfiguration.mock.calls[1][0]).toEqual(original);
  });

  it("keeps malformed visible boundary text authoritative and enables Save only after a valid extended-time edit", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    await openSectionSettings();
    const morningEnd = screen.getByRole("textbox", { name: "Morningの終了" });
    fireEvent.change(morningEnd, { target: { value: "13:xx" } });
    expect((screen.getByRole("textbox", { name: "Morningの終了" }) as HTMLInputElement).value).toBe("13:xx");
    expect((screen.getByRole("textbox", { name: "Eveningの開始" }) as HTMLInputElement).value).toBe("13:xx");
    const save = screen.getByRole("button", { name: "次のDay用に保存" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getAllByRole("button", { name: "この後に追加" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByRole("button", { name: "削除" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(save);
    expect(mocks.updateSectionConfiguration).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "Morningの終了" }), { target: { value: "24:30" } });
    expect((screen.getByRole("textbox", { name: "Eveningの開始" }) as HTMLInputElement).value).toBe("24:30");
    expect((screen.getByRole("button", { name: "次のDay用に保存" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getAllByRole("button", { name: "この後に追加" })[0] as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "次のDay用に保存" }));
    await waitFor(() => expect(mocks.updateSectionConfiguration).toHaveBeenCalledTimes(1));
    expect(mocks.updateSectionConfiguration.mock.calls[0][0].items).toMatchObject([
      { section_id: morningId, logical_start_minute: 240, logical_end_minute: 1470 },
      { section_id: eveningId, logical_start_minute: 1470, logical_end_minute: 1680 },
    ]);
  });

  it("deletes the last Section by absorbing its interval into the previous Section and saves a gapless draft", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    await openSectionSettings();
    fireEvent.click(screen.getAllByRole("button", { name: "削除" })[1]!);
    expect(screen.getAllByLabelText(/Section \d+の名前/)).toHaveLength(1);
    expect((screen.getByRole("textbox", { name: "Morningの終了" }) as HTMLInputElement).value).toBe("28:00");
    expect((screen.getByRole("button", { name: "削除" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "次のDay用に保存" }));
    await waitFor(() => expect(mocks.updateSectionConfiguration).toHaveBeenCalledTimes(1));
    expect(mocks.updateSectionConfiguration.mock.calls[0][0].items).toEqual([
      { section_id: morningId, title: "Morning", logical_start_minute: 240, logical_end_minute: 1680 },
    ]);
  });

  it("refreshes a stale draft after revision conflict and bases a later explicit edit on the new canonical version", async () => {
    const versionA = "019c0000-0000-7000-8000-000000000020";
    const versionB = "019c0000-0000-7000-8000-000000000021";
    const versionC = "019c0000-0000-7000-8000-000000000022";
    const configurationA = { configuration_version_id: versionA, day_boundary_minutes: 240, items: [
      { section_id: morningId, title: "Morning", logical_start_minute: 240, logical_end_minute: 720 },
      { section_id: eveningId, title: "Evening", logical_start_minute: 720, logical_end_minute: 1680 },
    ] };
    const configurationB = { configuration_version_id: versionB, day_boundary_minutes: 240, items: [
      { section_id: morningId, title: "Concurrent Morning", logical_start_minute: 240, logical_end_minute: 800 },
      { section_id: eveningId, title: "Concurrent Evening", logical_start_minute: 800, logical_end_minute: 1680 },
    ] };
    const configurationC = { ...configurationB, configuration_version_id: versionC, items: [
      configurationB.items[0], { ...configurationB.items[1], title: "Reviewed Evening" },
    ] };
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.loadSectionConfiguration.mockResolvedValueOnce(configurationA)
      .mockResolvedValueOnce(configurationB).mockResolvedValueOnce(configurationC);
    mocks.updateSectionConfiguration
      .mockRejectedValueOnce(new ApiClientError("stale", 409, true, "revision_conflict"))
      .mockResolvedValueOnce({ configuration_version_id: versionC });
    render(<App />);
    await openSectionSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "Section 1の名前" }), { target: { value: "Stale A edit" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Stale A editの終了" }), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "次のDay用に保存" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent)
      .toContain("別の場所で更新されたため、最新内容を読み込み直しました"));
    expect(screen.getByRole("region", { name: "Section設定" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Section 1の名前" }) as HTMLInputElement).value).toBe("Concurrent Morning");
    expect((screen.getByRole("textbox", { name: "Concurrent Morningの終了" }) as HTMLInputElement).value).toBe("13:20");
    expect((screen.getByRole("textbox", { name: "Section 2の名前" }) as HTMLInputElement).value).toBe("Concurrent Evening");
    expect(screen.queryByText("保存しました。次のTaskChuteDayから反映されます。")).toBeNull();
    expect(screen.queryByRole("button", { name: "保留中の次Day Section設定を再試行" })).toBeNull();
    expect(mocks.updateSectionConfiguration).toHaveBeenCalledTimes(1);
    const staleRequest = mocks.updateSectionConfiguration.mock.calls[0][0];

    fireEvent.change(screen.getByRole("textbox", { name: "Section 2の名前" }), { target: { value: "Reviewed Evening" } });
    fireEvent.click(screen.getByRole("button", { name: "次のDay用に保存" }));
    await waitFor(() => expect(mocks.updateSectionConfiguration).toHaveBeenCalledTimes(2));
    const refreshedRequest = mocks.updateSectionConfiguration.mock.calls[1][0];
    expect(refreshedRequest.expected_configuration_version_id).toBe(versionB);
    expect(refreshedRequest.operation_id).not.toBe(staleRequest.operation_id);
    expect(refreshedRequest.configuration_version_id).not.toBe(staleRequest.configuration_version_id);
    expect(refreshedRequest.items).toEqual([
      { section_id: morningId, title: "Concurrent Morning", logical_start_minute: 240, logical_end_minute: 800 },
      { section_id: eveningId, title: "Reviewed Evening", logical_start_minute: 800, logical_end_minute: 1680 },
    ]);
  });

  it("shows Routine reconciliation in the shared floating status", async () => {
    const request = deferred<unknown>();
    mocks.loadDay.mockResolvedValue(populatedDay);
    mocks.convertEntryToRoutine.mockReturnValue(request.promise);
    render(<App />);
    const openRoutine = await screen.findByRole("button", { name: "Routine化" });
    expect(openRoutine.closest(".routine-cell")).toBeTruthy();
    expect(openRoutine.closest(".task-main")).toBeNull();
    fireEvent.click(openRoutine);
    fireEvent.click(screen.getByRole("button", { name: "Routine化" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Routine化・照合中…");
    expect(status.tagName).toBe("DIV");
    expect(status.classList.contains("transient-status")).toBe(true);

    request.resolve({});
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("converts a planned Entry to a no-end Routine, shows the canonical indicator, and ends it", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, estimate_seconds: 900, planned_start_minute: 600, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000030",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000031",
      end_logical_date: null, can_end: true, default_section_id: firstEntry.section_id,
      default_planned_start_minute: 600, section_plan_override_present: false,
      default_estimate_seconds: 900, estimate_override_present: false, defaults_revision: 0,
    } };
    const sameStartSecond: EntryProjection = { ...secondEntry, planned_start_minute: 600 };
    const routineDay: CurrentTaskChuteDayProjection = {
      ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [routineEntry, sameStartSecond] }, populatedDay.sections[1]],
      next_entry: routineEntry,
    };
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(routineDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Routine化" }));
    expect(screen.getByLabelText("終了日（空欄は終了なし）")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Routine化" }));
    await waitFor(() => expect(mocks.convertEntryToRoutine).toHaveBeenCalledTimes(1));
    expect(mocks.convertEntryToRoutine.mock.calls[0][0]).toMatchObject({
      entry_id: firstEntry.id, taskchute_day_id: emptyDay.taskchute_day.id, end_logical_date: null,
    });
    await waitFor(() => expect(document.querySelector(".routine-badge")).toBeTruthy());
    const routineBadge = document.querySelector<HTMLElement>(".routine-badge")!;
    expect(routineBadge.closest(".routine-cell")).toBeTruthy();
    expect(routineBadge.closest(".task-main")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Canonical taskのSection" })).toHaveProperty("disabled", false);
    const plannedStart = screen.getByRole("button", { name: "Canonical taskの開始予定" }) as HTMLButtonElement;
    expect(plannedStart.disabled).toBe(false);
    expect(plannedStart.textContent).toBe("10:00");
    const estimate = screen.getByRole("button", { name: "Canonical taskの見積" }) as HTMLButtonElement;
    expect(estimate.disabled).toBe(false);
    expect(estimate.textContent).toBe("15分");
    expect((screen.getByRole("button", { name: "Canonical taskを開始" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Routineを終了" })).toBeNull();
    expect(screen.getAllByText("Routine").length).toBeGreaterThan(0);
    expect(mocks.endRoutine).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Routineを終了" })).toBeNull();
  });

  it("sends the controlled inclusive end date when converting an Entry to a Routine", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-00000000003a",
      routine_occurrence_id: "019c0000-0000-7000-8000-00000000003b",
      end_logical_date: "2026-08-31", can_end: true, default_section_id: firstEntry.section_id,
      default_planned_start_minute: firstEntry.planned_start_minute, section_plan_override_present: false,
      default_estimate_seconds: firstEntry.estimate_seconds, estimate_override_present: false, defaults_revision: 0,
    } };
    const routineDay: CurrentTaskChuteDayProjection = {
      ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [routineEntry, secondEntry] }, populatedDay.sections[1]],
      next_entry: routineEntry,
    };
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(routineDay);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Routine化" }));
    const endDate = screen.getByLabelText("終了日（空欄は終了なし）") as HTMLInputElement;
    fireEvent.change(endDate, { target: { value: "2026-08-31" } });
    expect(endDate.value).toBe("2026-08-31");
    fireEvent.click(screen.getByRole("button", { name: "Routine化" }));

    await waitFor(() => expect(mocks.convertEntryToRoutine).toHaveBeenCalledTimes(1));
    expect(mocks.convertEntryToRoutine.mock.calls[0][0]).toMatchObject({
      entry_id: firstEntry.id,
      taskchute_day_id: emptyDay.taskchute_day.id,
      end_logical_date: "2026-08-31",
    });
    expect(mocks.convertEntryToRoutine).toHaveBeenCalledTimes(1);
  });

  it("prevents a stale estimate editor from committing after Routine conversion", async () => {
    const editableEntry: EntryProjection = { ...firstEntry, estimate_seconds: 900, planned_start_minute: 600 };
    const editableDay: CurrentTaskChuteDayProjection = {
      ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [editableEntry] }, populatedDay.sections[1]],
      next_entry: editableEntry,
    };
    const routineEntry: EntryProjection = { ...editableEntry, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000034",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000035",
      end_logical_date: null, can_end: true, default_section_id: editableEntry.section_id,
      default_planned_start_minute: 600, section_plan_override_present: false,
      default_estimate_seconds: 900, estimate_override_present: false, defaults_revision: 0,
    } };
    const routineDay: CurrentTaskChuteDayProjection = {
      ...editableDay,
      sections: [{ ...editableDay.sections[0], entries: [routineEntry] }, editableDay.sections[1]],
      next_entry: routineEntry,
    };
    mocks.loadDay.mockResolvedValueOnce(editableDay).mockResolvedValueOnce(routineDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの見積" }));
    const staleEditor = screen.getByRole("textbox", { name: "Canonical taskの見積（分）" });
    fireEvent.click(screen.getByRole("button", { name: "Routine化" }));
    fireEvent.click(screen.getByRole("button", { name: "Routine化" }));
    await waitFor(() => expect(document.querySelector(".routine-badge")).toBeTruthy());
    expect(screen.queryByRole("textbox", { name: "Canonical taskの見積（分）" })).toBeNull();
    expect((screen.getByRole("button", { name: "Canonical taskの見積" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(staleEditor, { key: "Enter" });
    expect(mocks.setEntryEstimate).not.toHaveBeenCalled();
  });

  it("prevents a stale planned-start editor from committing after Routine conversion", async () => {
    const editableEntry: EntryProjection = { ...firstEntry, estimate_seconds: 900, planned_start_minute: 600 };
    const editableDay: CurrentTaskChuteDayProjection = {
      ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [editableEntry] }, populatedDay.sections[1]],
      next_entry: editableEntry,
    };
    const routineEntry: EntryProjection = { ...editableEntry, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000038",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000039",
      end_logical_date: null, can_end: true, default_section_id: editableEntry.section_id,
      default_planned_start_minute: 600, section_plan_override_present: false,
      default_estimate_seconds: 900, estimate_override_present: false, defaults_revision: 0,
    } };
    const routineDay: CurrentTaskChuteDayProjection = {
      ...editableDay,
      sections: [{ ...editableDay.sections[0], entries: [routineEntry] }, editableDay.sections[1]],
      next_entry: routineEntry,
    };
    mocks.loadDay.mockResolvedValueOnce(editableDay).mockResolvedValueOnce(routineDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの開始予定" }));
    const staleEditor = screen.getByRole("textbox", { name: "Canonical taskの開始予定" });
    fireEvent.click(screen.getByRole("button", { name: "Routine化" }));
    fireEvent.click(screen.getByRole("button", { name: "Routine化" }));
    await waitFor(() => expect(document.querySelector(".routine-badge")).toBeTruthy());
    expect(screen.queryByRole("textbox", { name: "Canonical taskの開始予定" })).toBeNull();
    expect((screen.getByRole("button", { name: "Canonical taskの開始予定" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(staleEditor, { key: "Enter" });
    expect(mocks.setEntryPlannedStart).not.toHaveBeenCalled();
  });

  it("focuses a local Routine estimate candidate and dismisses it with Escape, outside click, or Cancel", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, estimate_seconds: 900, planned_start_minute: 300, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000040",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000041",
      end_logical_date: null, can_end: true, default_section_id: morningId,
      default_planned_start_minute: 300, section_plan_override_present: false,
      default_estimate_seconds: 900, estimate_override_present: false, defaults_revision: 4,
    } };
    const routineDay = { ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [routineEntry] }, populatedDay.sections[1]],
      next_entry: routineEntry };
    mocks.loadDay.mockResolvedValue(routineDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskの見積" }));
    const input = screen.getByRole("textbox", { name: "Canonical taskの見積（分）" });
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const choice = await screen.findByRole("group", { name: "Canonical taskの見積反映先" });
    expect(choice.textContent).toContain("25分");
    expect(mocks.setRoutineEstimate).not.toHaveBeenCalled();
    const occurrenceChoice = within(choice).getByRole("button", { name: "今回だけ" });
    await waitFor(() => expect(document.activeElement).toBe(occurrenceChoice));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Canonical taskの見積反映先" })).toBeNull();
    expect(mocks.setRoutineEstimate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Canonical taskの見積" }));
    const secondInput = screen.getByRole("textbox", { name: "Canonical taskの見積（分）" });
    fireEvent.change(secondInput, { target: { value: "30" } });
    fireEvent.keyDown(secondInput, { key: "Enter" });
    const secondChoice = await screen.findByRole("group", { name: "Canonical taskの見積反映先" });
    fireEvent.click(document.body);
    expect(screen.queryByRole("group", { name: "Canonical taskの見積反映先" })).toBeNull();
    expect(mocks.setRoutineEstimate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Canonical taskの見積" }));
    const thirdInput = screen.getByRole("textbox", { name: "Canonical taskの見積（分）" });
    fireEvent.change(thirdInput, { target: { value: "35" } });
    fireEvent.keyDown(thirdInput, { key: "Enter" });
    const thirdChoice = await screen.findByRole("group", { name: "Canonical taskの見積反映先" });
    fireEvent.click(within(thirdChoice).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("group", { name: "Canonical taskの見積反映先" })).toBeNull();
    expect(mocks.setRoutineEstimate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Canonical taskの見積" }));
    const finalInput = screen.getByRole("textbox", { name: "Canonical taskの見積（分）" });
    fireEvent.change(finalInput, { target: { value: "30" } });
    fireEvent.keyDown(finalInput, { key: "Enter" });
    const finalChoice = await screen.findByRole("group", { name: "Canonical taskの見積反映先" });
    fireEvent.click(within(finalChoice).getByRole("button", { name: "ルーティンに反映" }));
    await waitFor(() => expect(mocks.setRoutineEstimate).toHaveBeenCalledTimes(1));
    expect(mocks.setRoutineEstimate.mock.calls[0][0]).toMatchObject({
      entry_id: routineEntry.id, taskchute_day_id: routineDay.taskchute_day.id,
      action: "definition", estimate_seconds: 1800, expected_defaults_revision: 4,
    });
  });

  it("creates a synchronized Routine Section candidate without writing and sends the selected occurrence scope", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, estimate_seconds: 900, planned_start_minute: 300, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000042",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000043",
      end_logical_date: null, can_end: true, default_section_id: morningId,
      default_planned_start_minute: 300, section_plan_override_present: false,
      default_estimate_seconds: 900, estimate_override_present: false, defaults_revision: 2,
    } };
    const routineDay = { ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [routineEntry] }, populatedDay.sections[1]],
      next_entry: routineEntry };
    mocks.loadDay.mockResolvedValue(routineDay);
    const request = deferred<unknown>();
    mocks.setRoutineSectionPlan.mockReturnValue(request.promise);
    render(<App />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Canonical taskのSection" }),
      { target: { value: eveningId } });
    const choice = await screen.findByRole("group", { name: "Canonical taskのSection・開始予定反映先" });
    expect(choice.textContent).toContain("Evening / 12:00");
    expect(mocks.setRoutineSectionPlan).not.toHaveBeenCalled();
    fireEvent.click(within(choice).getByRole("button", { name: "今回だけ" }));
    await waitFor(() => expect(mocks.setRoutineSectionPlan).toHaveBeenCalledTimes(1));
    expect(mocks.setRoutineSectionPlan.mock.calls[0][0]).toMatchObject({
      entry_id: routineEntry.id, action: "occurrence", section_id: eveningId,
      planned_start_minute: 720, expected_placement_revision: routineDay.placement_revision,
    });
    expect((within(choice).getByRole("button", { name: "今回だけ" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("Routine設定を保存・照合中…");
    request.resolve({});
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows estimate reset only in the overridden unit editor and retains the exact ambiguous operation for retry", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, estimate_seconds: null, planned_start_minute: 300, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000044",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000045",
      end_logical_date: null, can_end: true, default_section_id: morningId,
      default_planned_start_minute: 300, section_plan_override_present: false,
      default_estimate_seconds: 900, estimate_override_present: true, defaults_revision: 1,
    } };
    const routineDay = { ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [routineEntry] }, populatedDay.sections[1]],
      next_entry: routineEntry };
    mocks.loadDay.mockResolvedValue(routineDay);
    mocks.setRoutineEstimate.mockRejectedValueOnce(new TypeError("response lost before outcome")).mockResolvedValueOnce({});
    render(<App />);
    await screen.findByRole("button", { name: "Canonical taskの見積" });
    expect(screen.queryByRole("button", { name: "Canonical taskの見積をルーティンの設定に戻す" })).toBeNull();
    expect(screen.queryByText("Override")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Canonical taskの見積" }));
    const reset = screen.getByRole("button", { name: "Canonical taskの見積をルーティンの設定に戻す" });
    fireEvent.click(reset);
    const retry = await screen.findByRole("button", { name: "保留中のRoutine見積を再試行" });
    const original = mocks.setRoutineEstimate.mock.calls[0][0];
    expect(original).toMatchObject({ entry_id: routineEntry.id, action: "reset" });
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.setRoutineEstimate).toHaveBeenCalledTimes(2));
    expect(mocks.setRoutineEstimate.mock.calls[1][0]).toEqual(original);
  });

  it("shows Section-plan reset only in the overridden unit editor and sends reset exactly once", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, estimate_seconds: 900, planned_start_minute: 300, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000046",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000047",
      end_logical_date: null, can_end: true, default_section_id: eveningId,
      default_planned_start_minute: 720, section_plan_override_present: true,
      default_estimate_seconds: 900, estimate_override_present: false, defaults_revision: 3,
    } };
    const routineDay = { ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [routineEntry] }, populatedDay.sections[1]],
      next_entry: routineEntry };
    mocks.loadDay.mockResolvedValue(routineDay);
    render(<App />);
    await screen.findByRole("button", { name: "Canonical taskの開始予定" });
    expect(screen.queryByRole("button", { name: "Canonical taskのSection・開始予定をルーティンの設定に戻す" })).toBeNull();
    expect(screen.queryByText("Override")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Canonical taskの開始予定" }));
    fireEvent.click(screen.getByRole("button", { name: "Canonical taskのSection・開始予定をルーティンの設定に戻す" }));
    await waitFor(() => expect(mocks.setRoutineSectionPlan).toHaveBeenCalledTimes(1));
    expect(mocks.setRoutineSectionPlan.mock.calls[0][0]).toMatchObject({
      entry_id: routineEntry.id, taskchute_day_id: routineDay.taskchute_day.id,
      action: "reset", expected_placement_revision: routineDay.placement_revision,
    });
  });

  it("retains only the exact ambiguous Routine conversion for retry and reconciles after commit", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000032",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000033",
      end_logical_date: "2026-08-31", can_end: true, default_section_id: firstEntry.section_id,
      default_planned_start_minute: firstEntry.planned_start_minute, section_plan_override_present: false,
      default_estimate_seconds: firstEntry.estimate_seconds, estimate_override_present: false, defaults_revision: 0,
    } };
    const routineDay: CurrentTaskChuteDayProjection = {
      ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [routineEntry] }, populatedDay.sections[1]],
      next_entry: routineEntry,
    };
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(routineDay);
    mocks.convertEntryToRoutine.mockRejectedValueOnce(new TypeError("response lost before outcome"))
      .mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Routine化" }));
    fireEvent.change(screen.getByLabelText("終了日（空欄は終了なし）"), { target: { value: "2026-08-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Routine化" }));
    const retry = await screen.findByRole("button", { name: "保留中のRoutine化を再試行" });
    const original = mocks.convertEntryToRoutine.mock.calls[0][0];
    expect((screen.getByRole("button", { name: "MorningにTaskを追加" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.convertEntryToRoutine).toHaveBeenCalledTimes(2));
    expect(mocks.convertEntryToRoutine.mock.calls[1][0]).toEqual(original);
    await waitFor(() => expect(document.querySelector(".routine-badge")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "保留中のRoutine化を再試行" })).toBeNull();
  });

  it("does not expose the legacy Routine end command in the Day Table", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000036",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000037",
      end_logical_date: null, can_end: true, default_section_id: firstEntry.section_id,
      default_planned_start_minute: firstEntry.planned_start_minute, section_plan_override_present: false,
      default_estimate_seconds: firstEntry.estimate_seconds, estimate_override_present: false, defaults_revision: 0,
    } };
    const routineDay: CurrentTaskChuteDayProjection = {
      ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [routineEntry] }, populatedDay.sections[1]],
      next_entry: routineEntry,
    };
    mocks.loadDay.mockResolvedValueOnce(routineDay);
    render(<App />);
    await screen.findByText("Canonical task");
    expect(screen.queryByRole("button", { name: "Routineを終了" })).toBeNull();
    expect(screen.queryByRole("button", { name: "保留中のRoutine終了を再試行" })).toBeNull();
    expect(mocks.endRoutine).not.toHaveBeenCalled();
  });

  it("duplicates a planned Entry through the retained-operation path", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを複製" }));
    await waitFor(() => expect(mocks.duplicateEntry).toHaveBeenCalledTimes(1));
    expect(mocks.duplicateEntry.mock.calls[0][0]).toMatchObject({
      source_entry_id: firstEntry.id, taskchute_day_id: populatedDay.taskchute_day.id,
      expected_placement_revision: populatedDay.placement_revision,
    });
    expect(screen.queryByRole("button", { name: "Canonical taskを複製" })).toBeTruthy();
  });

  it("shows Duplicate reconciliation in the dedicated floating status while preserving DayBoard", async () => {
    const request = deferred<unknown>();
    mocks.loadDay.mockResolvedValue(populatedDay);
    mocks.duplicateEntry.mockReturnValue(request.promise);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを複製" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe("Taskを複製・照合中…");
    expect(status.tagName).toBe("DIV");
    expect(status.classList.contains("transient-status")).toBe(true);
    expect(document.querySelector("p.transient-status")).toBeNull();
    expect(screen.getByRole("region", { name: "DayBoard" })).toBeTruthy();

    request.resolve({});
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("retains only the exact ambiguous Duplicate operation and blocks unrelated actions", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.duplicateEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"))
      .mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを複製" }));
    const retry = await screen.findByRole("button", { name: "保留中のTask複製を再試行" });
    expect((screen.getByRole("button", { name: "Second taskを複製" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.duplicateEntry).toHaveBeenCalledTimes(2));
    expect(mocks.duplicateEntry.mock.calls[1][0]).toEqual(mocks.duplicateEntry.mock.calls[0][0]);
  });

  it("drops an ambiguous Duplicate operation when reconciliation expires the session", async () => {
    mocks.loadDay.mockResolvedValueOnce(populatedDay)
      .mockRejectedValueOnce(new ApiClientError("expired", 401, false, "unauthenticated"))
      .mockResolvedValueOnce(populatedDay);
    mocks.duplicateEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを複製" }));

    const login = await screen.findByRole("button", { name: "ログイン" });
    fireEvent.change(screen.getByRole("textbox", { name: "メール" }), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("パスワード"), { target: { value: "password" } });
    fireEvent.submit(login.closest("form")!);

    await screen.findByRole("button", { name: "Canonical taskを複製" });
    expect(screen.queryByRole("button", { name: "保留中のTask複製を再試行" })).toBeNull();
  });

  it("settles an ambiguous Duplicate from canonical state and focuses the new row", async () => {
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockImplementationOnce(async () => {
      const operation = mocks.duplicateEntry.mock.calls[0][0];
      return {
        ...populatedDay,
        placement_revision: populatedDay.placement_revision + 1,
        sections: [{
          ...populatedDay.sections[0],
          entries: [firstEntry, { ...firstEntry, id: operation.new_entry_id, position: firstEntry.position + 1,
            task: { ...firstEntry.task, id: operation.new_task_id } }],
        }, emptyDay.sections[1]],
      };
    });
    mocks.duplicateEntry.mockRejectedValueOnce(new TypeError("response lost after commit"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを複製" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    const operation = mocks.duplicateEntry.mock.calls[0][0];
    await waitFor(() => expect((document.activeElement as HTMLElement).dataset.focusKey).toBe(`entry:${operation.new_entry_id}`));
    expect(screen.queryByRole("button", { name: "保留中のTask複製を再試行" })).toBeNull();
    expect(mocks.duplicateEntry).toHaveBeenCalledTimes(1);
  });

  it("clears a deterministically rejected Duplicate and keeps non-planned actions disabled", async () => {
    mocks.loadDay.mockResolvedValue(completedDay);
    const completed = render(<App />);
    expect((await screen.findByRole("button", { name: "Canonical taskを複製" }) as HTMLButtonElement).disabled).toBe(true);
    completed.unmount();

    mocks.loadDay.mockResolvedValue(populatedDay);
    mocks.duplicateEntry.mockRejectedValueOnce(new ApiClientError("conflict", 409, true, "resource_conflict"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを複製" }));
    await waitFor(() => expect(mocks.duplicateEntry).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "保留中のTask複製を再試行" })).toBeNull();
  });

  it("reorders customizable columns, persists the order, and never calls a mutation API", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    const rendered = render(<App />);
    const dayBoard = await screen.findByRole("region", { name: "DayBoard" });
    const projectHeader = dayBoard.querySelector<HTMLElement>('[data-day-column-header="project"]')!;
    const routineHeader = dayBoard.querySelector<HTMLElement>('[data-day-column-header="routine"]')!;
    setColumnBounds(projectHeader, 0, 150);
    setColumnBounds(routineHeader, 150, 82);
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(projectHeader, { dataTransfer });
    const dragOver = createEvent.dragOver(routineHeader, { dataTransfer });
    Object.defineProperty(dragOver, "clientX", { value: 160 });
    fireEvent(routineHeader, dragOver);
    const drop = createEvent.drop(routineHeader, { dataTransfer });
    Object.defineProperty(drop, "clientX", { value: 160 });
    fireEvent(routineHeader, drop);
    fireEvent.dragEnd(projectHeader, { dataTransfer });

    const headingKeys = () => Array.from(dayBoard.querySelectorAll<HTMLElement>("[data-day-column-header]"))
      .map((header) => header.dataset.dayColumnHeader);
    await waitFor(() => expect(headingKeys().slice(0, 3)).toEqual(["section", "project", "routine"]));
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
    expect(mocks.setEntryEstimate).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(DAY_COLUMNS_STORAGE_KEY)!).order.slice(0, 3))
      .toEqual(["section", "project", "routine"]);

    rendered.unmount();
    render(<App />);
    const reloadedBoard = await screen.findByRole("region", { name: "DayBoard" });
    expect(Array.from(reloadedBoard.querySelectorAll<HTMLElement>("[data-day-column-header]"))
      .map((header) => header.dataset.dayColumnHeader).slice(0, 3)).toEqual(["section", "project", "routine"]);
  });

  it("resizes and auto-fits a data column through the shared table track and local preference", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    const dayBoard = await screen.findByRole("region", { name: "DayBoard" });
    const projectHandle = screen.getByRole("button", { name: "Project列の幅を変更" });
    fireEvent.mouseDown(projectHandle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 210 });
    fireEvent.mouseUp(window);
    await waitFor(() => expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).toContain("260px"));
    expect(JSON.parse(window.localStorage.getItem(DAY_COLUMNS_STORAGE_KEY)!).widths.project).toBe(260);

    const projectCell = dayBoard.querySelector<HTMLElement>('[data-day-column-cell="project"]')!;
    Object.defineProperty(projectCell, "scrollWidth", { configurable: true, value: 500 });
    fireEvent.doubleClick(projectHandle);
    await waitFor(() => expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).toContain("340px"));
    expect(JSON.parse(window.localStorage.getItem(DAY_COLUMNS_STORAGE_KEY)!).widths.project).toBe(340);

    Object.defineProperty(projectCell, "scrollWidth", { configurable: true, value: 10 });
    fireEvent.doubleClick(projectHandle);
    await waitFor(() => expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).toContain("100px"));
    expect(JSON.parse(window.localStorage.getItem(DAY_COLUMNS_STORAGE_KEY)!).widths.project).toBe(100);
  });

  it("opens the accessible Columns menu, hides data cells immediately, and restores focus on Escape", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    const dayBoard = await screen.findByRole("region", { name: "DayBoard" });
    const trigger = screen.getByRole("button", { name: "表示列" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    const menu = screen.getByRole("dialog", { name: "表示列" });
    expect(menu.querySelectorAll('input[type="checkbox"]')).toHaveLength(9);
    expect(within(menu).getByText("表示する列")).toBeTruthy();
    expect(within(menu).getByRole("checkbox", { name: "Project" })).toBeTruthy();
    expect(screen.queryByText("Mode")).toBeNull();
    expect(screen.queryByText("Note")).toBeNull();

    const projectCheckbox = within(menu).getByRole("checkbox", { name: "Project" }) as HTMLInputElement;
    fireEvent.click(projectCheckbox);
    expect(projectCheckbox.checked).toBe(false);
    expect(dayBoard.querySelector('[data-day-column-header="project"]')).toBeNull();
    expect(dayBoard.querySelector('[data-day-column-cell="project"]')).toBeNull();
    expect(screen.getByText("Canonical task")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "表示列" })).toBeTruthy();
    expect(mocks.reorderEntries).not.toHaveBeenCalled();
    expect(mocks.setEntryEstimate).not.toHaveBeenCalled();

    fireEvent.click(projectCheckbox);
    expect(dayBoard.querySelector('[data-day-column-header="project"]')).toBeTruthy();
    fireEvent.keyDown(projectCheckbox, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "表示列" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves custom order and width across hide/show, Show all, and reload", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    const rendered = render(<App />);
    const dayBoard = await screen.findByRole("region", { name: "DayBoard" });
    const projectHandle = screen.getByRole("button", { name: "Project列の幅を変更" });
    fireEvent.mouseDown(projectHandle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 170 });
    fireEvent.mouseUp(window);
    await waitFor(() => expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).toContain("220px"));

    const projectHeader = dayBoard.querySelector<HTMLElement>('[data-day-column-header="project"]')!;
    const routineHeader = dayBoard.querySelector<HTMLElement>('[data-day-column-header="routine"]')!;
    setColumnBounds(projectHeader, 0, 150);
    setColumnBounds(routineHeader, 150, 82);
    const dataTransfer = dragDataTransfer();
    fireEvent.dragStart(projectHeader, { dataTransfer });
    const dragOver = createEvent.dragOver(routineHeader, { dataTransfer });
    Object.defineProperty(dragOver, "clientX", { value: 160 });
    fireEvent(routineHeader, dragOver);
    const drop = createEvent.drop(routineHeader, { dataTransfer });
    Object.defineProperty(drop, "clientX", { value: 160 });
    fireEvent(routineHeader, drop);
    fireEvent.dragEnd(projectHeader, { dataTransfer });
    await waitFor(() => expect(Array.from(dayBoard.querySelectorAll<HTMLElement>("[data-day-column-header]"))
      .map((header) => header.dataset.dayColumnHeader).slice(0, 3)).toEqual(["section", "project", "routine"]));

    const trigger = screen.getByRole("button", { name: "表示列" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("dialog", { name: "表示列" });
    const projectCheckbox = within(menu).getByRole("checkbox", { name: "Project" }) as HTMLInputElement;
    fireEvent.click(projectCheckbox);
    expect(dayBoard.querySelector('[data-day-column-header="project"]')).toBeNull();
    expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).not.toContain("220px");
    fireEvent.click(projectCheckbox);
    await waitFor(() => expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).toContain("220px"));
    expect(Array.from(dayBoard.querySelectorAll<HTMLElement>("[data-day-column-header]"))
      .map((header) => header.dataset.dayColumnHeader).slice(0, 3)).toEqual(["section", "project", "routine"]);

    fireEvent.click(within(menu).getByRole("checkbox", { name: "Routine" }));
    fireEvent.click(within(menu).getByRole("button", { name: "すべて表示" }));
    await waitFor(() => expect((within(menu).getByRole("checkbox", { name: "Routine" }) as HTMLInputElement).checked).toBe(true));
    expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).toContain("220px");

    rendered.unmount();
    render(<App />);
    const reloadedBoard = await screen.findByRole("region", { name: "DayBoard" });
    expect(Array.from(reloadedBoard.querySelectorAll<HTMLElement>("[data-day-column-header]"))
      .map((header) => header.dataset.dayColumnHeader).slice(0, 3)).toEqual(["section", "project", "routine"]);
    expect(reloadedBoard.style.getPropertyValue("--day-table-grid-template-columns")).toContain("220px");
  });

  it("resets only Day column presentation and keeps fixed slots usable when all data columns are hidden", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    const dayBoard = await screen.findByRole("region", { name: "DayBoard" });
    const projectHandle = screen.getByRole("button", { name: "Project列の幅を変更" });
    fireEvent.mouseDown(projectHandle, { button: 0, clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 170 });
    fireEvent.mouseUp(window);
    const trigger = screen.getByRole("button", { name: "表示列" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("dialog", { name: "表示列" });
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Project" }));
    fireEvent.click(within(menu).getByRole("button", { name: "初期状態に戻す" }));
    await waitFor(() => expect((within(menu).getByRole("checkbox", { name: "Project" }) as HTMLInputElement).checked).toBe(true));
    expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).toContain("150px");
    expect(dayBoard.style.getPropertyValue("--day-table-grid-template-columns")).not.toContain("220px");

    for (const label of ["Project", "Section", "Routine", "見積", "開始予定", "開始見込", "開始", "終了", "実績"]) {
      const checkbox = within(menu).getByRole("checkbox", { name: label }) as HTMLInputElement;
      if (checkbox.checked) fireEvent.click(checkbox);
    }
    expect(dayBoard.querySelectorAll("[data-day-column-header]")).toHaveLength(0);
    const heading = dayBoard.querySelector<HTMLElement>(".table-heading")!;
    const taskRow = dayBoard.querySelector<HTMLElement>("[data-entry-id]")!;
    expect(heading.querySelector(":scope > .bulk-slot")).toBeTruthy();
    expect(heading.textContent).toContain("実行");
    expect(heading.textContent).toContain("Task");
    expect(taskRow.children).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Canonical taskを開始" })).toBeTruthy();
  });

  it("closes the Columns popover from outside click or trigger re-click and keeps draft alignment", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    render(<App />);
    const dayBoard = await screen.findByRole("region", { name: "DayBoard" });
    const trigger = await screen.findByRole("button", { name: "表示列" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "表示列" })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "表示列" })).toBeNull();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "表示列" })).toBeNull();

    fireEvent.click(trigger);
    const menu = screen.getByRole("dialog", { name: "表示列" });
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Project" }));
    fireEvent.click(screen.getByRole("button", { name: "MorningにTaskを追加" }));
    const draftRow = screen.getByRole("textbox", { name: "MorningのTask名" }).closest<HTMLElement>(".draft-row")!;
    expect(draftRow.querySelector('[data-day-column-cell="project"]')).toBeNull();
    expect(draftRow.children).toHaveLength(dayBoard.querySelector<HTMLElement>(".table-heading")!.children.length);
  });

  it("uses compact Routine icons and projects read-only actual facts with logical extended time", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000050",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000051",
      end_logical_date: null, can_end: true, default_section_id: firstEntry.section_id,
      default_planned_start_minute: firstEntry.planned_start_minute, section_plan_override_present: false,
      default_estimate_seconds: firstEntry.estimate_seconds, estimate_override_present: false, defaults_revision: 0,
    } };
    const actualDay: CurrentTaskChuteDayProjection = {
      ...populatedDay,
      sections: [{ ...populatedDay.sections[0], entries: [{ ...firstEntry, lifecycle_state: "completed", execution_summary: {
        first_started_at: "2026-08-22T23:40:00.000Z", last_ended_at: "2026-08-23T01:10:00.000Z",
        completed_duration_seconds: 5_400, active_started_at: null,
      } }, { ...secondEntry, execution_summary: {
        first_started_at: null, last_ended_at: null, completed_duration_seconds: 0, active_started_at: null,
      } }] }, populatedDay.sections[1]],
    };
    mocks.loadDay.mockResolvedValueOnce(actualDay);
    const actualRendered = render(<App />);
    expect((await screen.findByLabelText("Canonical taskの開始")).textContent).toBe("23:40");
    expect(screen.getByLabelText("Canonical taskの終了").textContent).toBe("25:10");
    expect(screen.getByLabelText("Canonical taskの実績").textContent).toBe("1時間30分");
    expect(screen.getByLabelText("Second taskの開始").textContent).toBe("—");
    expect(screen.getByLabelText("Second taskの終了").textContent).toBe("—");
    expect(screen.getByLabelText("Second taskの実績").textContent).toBe("—");

    actualRendered.unmount();
    const activeRoutineDay = { ...actualDay, sections: [{ ...actualDay.sections[0], entries: [routineEntry] }, actualDay.sections[1]] };
    mocks.loadDay.mockReset();
    mocks.loadDay.mockResolvedValue(activeRoutineDay);
    const rerendered = render(<App />);
    expect(await screen.findByLabelText("Canonical taskはルーティン")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Routine化" })).toBeNull();
    rerendered.unmount();
  });

  it("selects eligible Entry IDs without starting, editing, or dragging the row", async () => {
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    render(<App />);
    const checkbox = await screen.findByRole("checkbox", { name: "「Canonical task」を選択" });
    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("1件選択中")).toBeTruthy();
    expect(mocks.startEntry).not.toHaveBeenCalled();
    expect(mocks.duplicateEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "選択解除" }));
    expect(screen.queryByText("1件選択中")).toBeNull();
  });

  it("renders Routine selection and excludes running, completed, and read-only rows", async () => {
    const routineEntry: EntryProjection = { ...firstEntry, task: { ...firstEntry.task, title: "Routine task" }, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000050",
      routine_occurrence_id: "019c0000-0000-7000-8000-000000000051",
      end_logical_date: null, can_end: true, default_section_id: firstEntry.section_id,
      default_planned_start_minute: firstEntry.planned_start_minute, section_plan_override_present: false,
      default_estimate_seconds: firstEntry.estimate_seconds, estimate_override_present: false, defaults_revision: 0,
    } };
    mocks.loadDay.mockResolvedValue({ ...populatedDay, sections: [{ ...populatedDay.sections[0], entries: [routineEntry] }, populatedDay.sections[1]] });
    render(<App />);
    expect(await screen.findByRole("checkbox", { name: "「Routine task」を選択" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "すべての未実行Taskを選択" })).toBeTruthy();

    const cases = [
      { projection: runningDay, label: "Canonical taskは選択不可（未実行の計画Taskではありません）" },
      { projection: completedDay, label: "Canonical taskは選択不可（未実行の計画Taskではありません）" },
      { projection: { ...populatedDay, planning_enabled: false }, label: "Canonical taskは選択不可（未実行の計画Taskではありません）" },
    ];
    for (const item of cases) {
      cleanup();
      mocks.loadDay.mockReset();
      mocks.loadDay.mockResolvedValue(item.projection);
      render(<App />);
      expect((await screen.findByRole("checkbox", { name: item.label }) as HTMLInputElement).disabled).toBe(true);
      expect(screen.queryByRole("checkbox", { name: "すべての未実行Taskを選択" })).toBeNull();
    }
  });

  it("selects all eligible Entries across Sections, reports indeterminate state, and preserves selection through collapse and columns", async () => {
    const multiSectionDay = { ...twoPlannedDay, sections: [
      { ...twoPlannedDay.sections[0], entries: [firstEntry] },
      { ...twoPlannedDay.sections[1], entries: [secondEntry] },
    ] };
    mocks.loadDay.mockResolvedValue(multiSectionDay);
    render(<App />);
    const header = await screen.findByRole("checkbox", { name: "すべての未実行Taskを選択" }) as HTMLInputElement;
    const first = screen.getByRole("checkbox", { name: "「Canonical task」を選択" });
    fireEvent.click(first);
    await waitFor(() => expect(header.indeterminate).toBe(true));
    fireEvent.click(header);
    expect((screen.getByRole("checkbox", { name: "「Canonical task」を選択" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "「Second task」を選択" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("2件選択中")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Morningを折りたたむ" }));
    expect(screen.getByText("2件選択中")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "表示列" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "表示列" })).getByRole("checkbox", { name: "Project" }));
    expect(screen.getByText("2件選択中")).toBeTruthy();
  });

  it("changes selected ordinary Entries through one Section command, keeps selection, and offers Sectionなし", async () => {
    const multiSectionDay = { ...twoPlannedDay, sections: [
      { ...twoPlannedDay.sections[0], entries: [firstEntry] },
      { ...twoPlannedDay.sections[1], entries: [secondEntry] },
    ] };
    mocks.loadDay.mockResolvedValue(multiSectionDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "「Canonical task」を選択" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "「Second task」を選択" }));
    const trigger = screen.getByRole("button", { name: "Section変更" });
    expect((trigger as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(trigger);
    const picker = await screen.findByRole("dialog", { name: "変更先Section" });
    expect(within(picker).getByRole("button", { name: "Sectionなし" })).toBeTruthy();
    fireEvent.click(within(picker).getByRole("button", { name: "Evening" }));
    await waitFor(() => expect(mocks.bulkMoveEntriesToSection).toHaveBeenCalledTimes(1));
    expect(mocks.bulkMoveEntriesToSection.mock.calls[0][0]).toMatchObject({
      taskchute_day_id: emptyDay.taskchute_day.id,
      entry_ids: [firstEntry.id, secondEntry.id],
      section_id: eveningId,
      expected_placement_revision: twoPlannedDay.placement_revision,
    });
    expect(screen.getByText("2件選択中")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "変更先Section" })).toBeNull();
  });

  it("requires per-Routine scope selection, supports fill-and-override, and sends one scoped command", async () => {
    const routineEntry: EntryProjection = { ...secondEntry, task: { ...secondEntry.task, title: "Routine task" }, routine: {
      routine_definition_id: "019c0000-0000-7000-0000-000000000050", routine_occurrence_id: "019c0000-0000-7000-0000-000000000051",
      end_logical_date: null, can_end: true, default_section_id: secondEntry.section_id,
      default_planned_start_minute: secondEntry.planned_start_minute, section_plan_override_present: false,
      default_estimate_seconds: secondEntry.estimate_seconds, estimate_override_present: false, defaults_revision: 0,
    } };
    mocks.loadDay.mockResolvedValue({ ...twoPlannedDay, sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry, routineEntry] }, twoPlannedDay.sections[1]] });
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "「Canonical task」を選択" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "「Routine task」を選択" }));
    const sectionButton = screen.getByRole("button", { name: "Section変更" }) as HTMLButtonElement;
    expect(sectionButton.disabled).toBe(false);
    expect(sectionButton.getAttribute("aria-describedby")).toBe("bulk-section-routine-hint");
    expect((screen.getByRole("button", { name: "削除" }) as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.bulkMoveEntriesToSection).not.toHaveBeenCalled();
    fireEvent.click(sectionButton);
    const picker = await screen.findByRole("dialog", { name: "変更先Section" });
    fireEvent.click(within(picker).getByRole("button", { name: "Evening" }));
    const confirmation = await screen.findByRole("dialog", { name: "RoutineごとのSection変更" });
    expect(confirmation.textContent).toContain("Routine Taskごとにscopeを選択してください。未選択のまま確定することはできません。");
    expect(confirmation.textContent).toContain("未選択");
    expect((within(confirmation).getByRole("button", { name: "Section変更を確定" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.bulkMoveEntriesToSectionScoped).not.toHaveBeenCalled();
    expect(mocks.bulkMoveEntriesToSectionOccurrence).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog", { name: "RoutineごとのSection変更" })).toBeNull();
    expect(screen.getByText("2件選択中")).toBeTruthy();
    fireEvent.click(sectionButton);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "変更先Section" })).getByRole("button", { name: "Evening" }));
    const scopedConfirmation = await screen.findByRole("dialog", { name: "RoutineごとのSection変更" });
    fireEvent.click(within(scopedConfirmation).getByRole("button", { name: "すべてルーティンに反映" }));
    const routineScopeGroup = within(scopedConfirmation).getByRole("group", { name: "Routine taskのscope" });
    expect(within(routineScopeGroup).getByRole("button", { name: "ルーティンに反映" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(routineScopeGroup).getByRole("button", { name: "今回だけ" }));
    expect((within(scopedConfirmation).getByRole("button", { name: "Section変更を確定" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(scopedConfirmation).getByRole("button", { name: "Section変更を確定" }));
    await waitFor(() => expect(mocks.bulkMoveEntriesToSectionScoped).toHaveBeenCalledTimes(1));
    expect(mocks.bulkMoveEntriesToSectionScoped.mock.calls[0][0]).toMatchObject({
      taskchute_day_id: emptyDay.taskchute_day.id,
      entry_ids: [firstEntry.id, routineEntry.id],
      section_id: eveningId,
      expected_placement_revision: twoPlannedDay.placement_revision,
      routine_scopes: [{ entry_id: routineEntry.id, scope: "occurrence" }],
    });
    expect(mocks.bulkMoveEntriesToSectionOccurrence).not.toHaveBeenCalled();
    expect(screen.getByText("2件選択中")).toBeTruthy();
  });

  it("requires confirmation, keeps cancel side-effect free, and sends one mixed bulk command", async () => {
    const routineEntry: EntryProjection = { ...secondEntry, task: { ...secondEntry.task, title: "Routine task" }, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000050", routine_occurrence_id: "019c0000-0000-7000-8000-000000000051",
      end_logical_date: null, can_end: true, default_section_id: secondEntry.section_id,
      default_planned_start_minute: secondEntry.planned_start_minute, section_plan_override_present: false,
      default_estimate_seconds: secondEntry.estimate_seconds, estimate_override_present: false, defaults_revision: 0,
    } };
    mocks.loadDay.mockResolvedValue({ ...twoPlannedDay, sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry, routineEntry] }, twoPlannedDay.sections[1]] });
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "「Canonical task」を選択" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "「Routine task」を選択" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect((await screen.findByRole("dialog", { name: "選択したTaskを削除" })).textContent).toContain("通常Task 1件はこの日から削除し、Routine Task 1件はこの日のみスキップします。");
    expect(mocks.bulkDeleteEntries).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog", { name: "選択したTaskを削除" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    const confirmation = screen.getByRole("dialog", { name: "選択したTaskを削除" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "削除" }));
    await waitFor(() => expect(mocks.bulkDeleteEntries).toHaveBeenCalledTimes(1));
    expect(mocks.bulkDeleteEntries.mock.calls[0][0]).toMatchObject({ taskchute_day_id: emptyDay.taskchute_day.id,
      entry_ids: [firstEntry.id, routineEntry.id], expected_placement_revision: twoPlannedDay.placement_revision });
    expect(screen.queryByText("2件選択中")).toBeNull();
  });

  it("opens Bulk estimate confirmation without writing, then sends one ordinary command and keeps selection", async () => {
    const multiSectionDay = { ...twoPlannedDay, sections: [
      { ...twoPlannedDay.sections[0], entries: [firstEntry] },
      { ...twoPlannedDay.sections[1], entries: [secondEntry] },
    ] };
    mocks.loadDay.mockResolvedValue(multiSectionDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "「Canonical task」を選択" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "「Second task」を選択" }));
    fireEvent.click(screen.getByRole("button", { name: "見積変更" }));
    const confirmation = await screen.findByRole("dialog", { name: "選択したTaskの見積変更" });
    expect(mocks.bulkSetEntriesEstimateScoped).not.toHaveBeenCalled();
    const input = within(confirmation).getByRole("spinbutton", { name: "共通見積（分）" });
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.click(within(confirmation).getByRole("button", { name: "見積変更を確定" }));
    await waitFor(() => expect(mocks.bulkSetEntriesEstimateScoped).toHaveBeenCalledTimes(1));
    expect(mocks.bulkSetEntriesEstimateScoped.mock.calls[0][0]).toMatchObject({
      taskchute_day_id: emptyDay.taskchute_day.id,
      entry_ids: [firstEntry.id, secondEntry.id],
      estimate_seconds: 1800,
      routine_scopes: [],
    });
    expect(mocks.bulkSetEntriesEstimateScoped.mock.calls[0][1]).toBeUndefined();
    expect(screen.getByText("2件選択中")).toBeTruthy();
  });

  it("requires per-Routine estimate scope selection and supports NULL plus fill-all", async () => {
    const routineEntry: EntryProjection = { ...secondEntry, task: { ...secondEntry.task, title: "Routine estimate task" }, routine: {
      routine_definition_id: "019c0000-0000-7000-8000-000000000050", routine_occurrence_id: "019c0000-0000-7000-8000-000000000051",
      end_logical_date: null, can_end: true, default_section_id: secondEntry.section_id,
      default_planned_start_minute: secondEntry.planned_start_minute, section_plan_override_present: false,
      default_estimate_seconds: 900, estimate_override_present: false, defaults_revision: 3,
    } };
    mocks.loadDay.mockResolvedValue({ ...twoPlannedDay, sections: [{ ...twoPlannedDay.sections[0], entries: [firstEntry, routineEntry] }, twoPlannedDay.sections[1]] });
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "「Canonical task」を選択" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "「Routine estimate task」を選択" }));
    fireEvent.click(screen.getByRole("button", { name: "見積変更" }));
    const confirmation = await screen.findByRole("dialog", { name: "選択したTaskの見積変更" });
    expect((within(confirmation).getByRole("button", { name: "見積変更を確定" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(confirmation).getByRole("button", { name: "すべてルーティンに反映" }));
    expect(within(within(confirmation).getByRole("group", { name: "Routine estimate taskの見積scope" }))
      .getByRole("button", { name: "ルーティンに反映" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(confirmation).getByRole("button", { name: "見積変更を確定" }));
    await waitFor(() => expect(mocks.bulkSetEntriesEstimateScoped).toHaveBeenCalledTimes(1));
    expect(mocks.bulkSetEntriesEstimateScoped.mock.calls[0][0]).toMatchObject({
      estimate_seconds: null,
      routine_scopes: [{ entry_id: routineEntry.id, scope: "definition", expected_defaults_revision: 3 }],
    });
    expect(screen.getByText("2件選択中")).toBeTruthy();
  });

  it("clears selection on Day navigation", async () => {
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(emptyDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "「Canonical task」を選択" }));
    expect(screen.getByText("1件選択中")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "次の日" }));
    await waitFor(() => expect(screen.queryByText("1件選択中")).toBeNull());
  });
});
