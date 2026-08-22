import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentTaskChuteDayProjection } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  loadDay: vi.fn(),
  createProject: vi.fn(),
  addTask: vi.fn(),
  reorderEntries: vi.fn(),
  startEntry: vi.fn(),
  completeEntry: vi.fn(),
}));

vi.mock("../../src/web/api", async () => {
  const actual = await vi.importActual<typeof import("../../src/web/api")>("../../src/web/api");
  return { ...actual, api: mocks };
});

import { App } from "../../src/web/App";
import { ApiClientError } from "../../src/web/api";

const emptyDay: CurrentTaskChuteDayProjection = {
  taskchute_day: {
    id: "019c0000-0000-7000-8000-000000000001",
    logical_date: "2026-08-22",
    start_instant: "2026-08-22T04:00:00Z",
    end_instant: "2026-08-23T04:00:00Z",
    establishment_timezone: "UTC",
    establishment_boundary_minutes: 240,
  },
  placement_revision: 0,
  sections: [{ id: "019c0000-0000-7000-8000-000000000002", title: "Morning", sort_order: 0, entries: [] }],
  active_execution: null,
  next_entry: null,
};

const populatedDay: CurrentTaskChuteDayProjection = {
  ...emptyDay,
  placement_revision: 1,
  sections: [{
    ...emptyDay.sections[0],
    entries: [{
      id: "019c0000-0000-7000-8000-000000000003",
      section_id: emptyDay.sections[0].id,
      position: 1,
      lifecycle_state: "planned",
      task: { id: "019c0000-0000-7000-8000-000000000004", title: "Canonical task", project: null },
    }],
  }],
  next_entry: {
    id: "019c0000-0000-7000-8000-000000000003",
    section_id: emptyDay.sections[0].id,
    position: 1,
    lifecycle_state: "planned",
    task: { id: "019c0000-0000-7000-8000-000000000004", title: "Canonical task", project: null },
  },
};

const runningDay: CurrentTaskChuteDayProjection = {
  ...populatedDay,
  active_execution: {
    id: "019c0000-0000-7000-8000-000000000005",
    entry_id: populatedDay.sections[0].entries[0].id,
    started_at: "2026-08-22T12:00:00.000Z",
    ended_at: null,
  },
  sections: [{ ...populatedDay.sections[0], entries: [{ ...populatedDay.sections[0].entries[0], lifecycle_state: "running" }] }],
  next_entry: null,
};

const completedDay: CurrentTaskChuteDayProjection = {
  ...runningDay,
  active_execution: null,
  sections: [{ ...runningDay.sections[0], entries: [{ ...runningDay.sections[0].entries[0], lifecycle_state: "completed" }] }],
};

const secondEntry = {
  ...populatedDay.sections[0].entries[0],
  id: "019c0000-0000-7000-8000-000000000006",
  task: { ...populatedDay.sections[0].entries[0].task, id: "019c0000-0000-7000-8000-000000000007", title: "Second task" },
  position: 2,
};

const twoPlannedDay: CurrentTaskChuteDayProjection = {
  ...populatedDay,
  sections: [{ ...populatedDay.sections[0], entries: [populatedDay.sections[0].entries[0], secondEntry] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logout.mockResolvedValue({});
  mocks.createProject.mockResolvedValue({ project: { id: "project", title: "Project" }, replayed: false });
  mocks.reorderEntries.mockResolvedValue({});
  mocks.startEntry.mockResolvedValue({});
  mocks.completeEntry.mockResolvedValue({});
});

describe("DayBoard web behavior", () => {
  it("restores Server-canonical state on initial browser load", async () => {
    mocks.loadDay.mockResolvedValue(populatedDay);
    render(<App />);
    expect(await screen.findByText("Canonical task")).toBeTruthy();
    expect(screen.getByText("Next: Canonical task")).toBeTruthy();
  });

  it("shows pending state and replaces it with a freshly loaded canonical projection", async () => {
    let resolveMutation: (() => void) | undefined;
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockResolvedValueOnce(populatedDay);
    mocks.addTask.mockImplementation(() => new Promise<void>((resolve) => { resolveMutation = resolve; }));
    render(<App />);
    await screen.findByText("Entryなし");
    fireEvent.change(screen.getByLabelText("Taskタイトル"), { target: { value: "Client draft" } });
    fireEvent.click(screen.getByRole("button", { name: "現在日に追加" }));
    expect((await screen.findByRole("button", { name: "追加・照合中…" }) as HTMLButtonElement).disabled).toBe(true);
    resolveMutation?.();
    expect(await screen.findByText("Canonical task")).toBeTruthy();
    expect(mocks.loadDay).toHaveBeenCalledTimes(2);
  });

  it("reconciles after conflict and never displays a false-success draft", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.addTask.mockRejectedValue(new ApiClientError("revision conflict", 409, true, "revision_conflict"));
    render(<App />);
    await screen.findByText("Entryなし");
    fireEvent.change(screen.getByLabelText("Taskタイトル"), { target: { value: "False success" } });
    fireEvent.click(screen.getByRole("button", { name: "現在日に追加" }));
    expect((await screen.findByRole("alert")).textContent).toContain("revision conflict");
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("False success")).toBeNull();
    expect(screen.getByText("Entryなし")).toBeTruthy();
  });

  it("retries an ambiguous CreateProject with the exact same operation and entity IDs", async () => {
    mocks.loadDay.mockResolvedValue(emptyDay);
    mocks.createProject
      .mockRejectedValueOnce(new TypeError("lost response"))
      .mockResolvedValueOnce({ project: { id: "created", title: "Canonical Project" } });
    render(<App />);
    await screen.findByText("Entryなし");
    fireEvent.change(screen.getByLabelText("タイトル"), { target: { value: "  Canonical Project  " } });
    fireEvent.click(screen.getByRole("button", { name: "Projectを作成" }));
    expect(await screen.findByRole("button", { name: "同じProject操作を再試行" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("タイトル"), { target: { value: "Changed draft" } });
    fireEvent.click(screen.getByRole("button", { name: "同じProject操作を再試行" }));
    await screen.findByText("選択中: Canonical Project");
    expect(mocks.createProject).toHaveBeenCalledTimes(2);
    expect(mocks.createProject.mock.calls[1][0]).toEqual(mocks.createProject.mock.calls[0][0]);
    expect(mocks.createProject.mock.calls[0][0].title).toBe("Canonical Project");
  });

  it("retries an ambiguous AddTaskToDay with the exact same operation, Task, and Entry IDs", async () => {
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockResolvedValueOnce(emptyDay).mockResolvedValueOnce(populatedDay);
    mocks.addTask
      .mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"))
      .mockResolvedValueOnce({});
    render(<App />);
    await screen.findByText("Entryなし");
    fireEvent.change(screen.getByLabelText("Taskタイトル"), { target: { value: "Retry me" } });
    fireEvent.click(screen.getByRole("button", { name: "現在日に追加" }));
    expect(await screen.findByRole("button", { name: "同じTask操作を再試行" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "同じTask操作を再試行" }));
    expect(await screen.findByText("Canonical task")).toBeTruthy();
    expect(mocks.addTask).toHaveBeenCalledTimes(2);
    expect(mocks.addTask.mock.calls[1][0]).toEqual(mocks.addTask.mock.calls[0][0]);
  });

  it("starts a new logical operation after a deterministic revision conflict", async () => {
    const revisionOne = { ...emptyDay, placement_revision: 1 };
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockResolvedValueOnce(revisionOne).mockResolvedValueOnce(populatedDay);
    mocks.addTask
      .mockRejectedValueOnce(new ApiClientError("revision conflict", 409, true, "revision_conflict"))
      .mockResolvedValueOnce({});
    render(<App />);
    await screen.findByText("Entryなし");
    fireEvent.change(screen.getByLabelText("Taskタイトル"), { target: { value: "Conflict then decide" } });
    fireEvent.click(screen.getByRole("button", { name: "現在日に追加" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "現在日に追加" }));
    await screen.findByText("Canonical task");
    const first = mocks.addTask.mock.calls[0][0];
    const second = mocks.addTask.mock.calls[1][0];
    expect(second.operation_id).not.toBe(first.operation_id);
    expect(second.expected_placement_revision).toBe(1);
  });

  it("settles a lost-response AddTaskToDay from canonical state without a duplicate client action", async () => {
    mocks.loadDay.mockResolvedValueOnce(emptyDay).mockImplementationOnce(async () => {
      const operation = mocks.addTask.mock.calls[0][0];
      const reflected = {
        ...populatedDay,
        sections: [{
          ...populatedDay.sections[0],
          entries: [{
            ...populatedDay.sections[0].entries[0],
            id: operation.entry_id,
            task: { ...populatedDay.sections[0].entries[0].task, id: operation.task_id, title: operation.title },
          }],
        }],
      };
      return reflected;
    });
    mocks.addTask.mockRejectedValueOnce(new TypeError("response lost after commit"));
    render(<App />);
    await screen.findByText("Entryなし");
    fireEvent.change(screen.getByLabelText("Taskタイトル"), { target: { value: "Committed once" } });
    fireEvent.click(screen.getByRole("button", { name: "現在日に追加" }));
    expect(await screen.findByText("Committed once")).toBeTruthy();
    expect(mocks.addTask).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByText("Committed once")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "同じTask操作を再試行" })).toBeNull();
  });

  it("shows Start pending feedback and reconciles to running canonical state", async () => {
    let resolveStart: (() => void) | undefined;
    mocks.loadDay.mockResolvedValueOnce(populatedDay).mockResolvedValueOnce(runningDay);
    mocks.startEntry.mockImplementation(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    render(<App />);
    await screen.findByRole("button", { name: "Start" });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByRole("button", { name: "開始・照合中…" })).toBeTruthy();
    resolveStart?.();
    expect(await screen.findByRole("button", { name: "Complete" })).toBeTruthy();
    expect(screen.getByText(/Active:/).textContent).toContain(runningDay.active_execution?.entry_id);
  });

  it("completes without a full-page reload and restores completed state from canonical Query", async () => {
    mocks.loadDay.mockResolvedValueOnce(runningDay).mockResolvedValueOnce(completedDay);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await waitFor(() => expect(mocks.completeEntry).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/completed/)).toBeTruthy();
    expect(screen.getByText("Active: なし")).toBeTruthy();
  });

  it("settles an ambiguous Reorder from canonical order and preserves stable Entry IDs", async () => {
    const second = { ...populatedDay.sections[0].entries[0], id: "019c0000-0000-7000-8000-000000000006",
      task: { ...populatedDay.sections[0].entries[0].task, id: "019c0000-0000-7000-8000-000000000007", title: "Second task" }, position: 2 };
    const twoEntries = { ...populatedDay, sections: [{ ...populatedDay.sections[0], entries: [populatedDay.sections[0].entries[0], second] }] };
    const reordered = { ...twoEntries, placement_revision: 2, sections: [{ ...twoEntries.sections[0], entries: [
      { ...second, position: 1 }, { ...populatedDay.sections[0].entries[0], position: 2 },
    ] }] };
    mocks.loadDay.mockResolvedValueOnce(twoEntries).mockResolvedValueOnce(reordered);
    mocks.reorderEntries.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous"));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを下へ" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    expect(mocks.reorderEntries.mock.calls[0][0].entry_ids).toEqual([second.id, populatedDay.sections[0].entries[0].id]);
    expect(screen.queryByText("結果未確定の操作があります。同じ操作ボタンでもう一度照合してください。")).toBeNull();
  });

  it("restores running and completed lifecycle states on browser load", async () => {
    mocks.loadDay.mockResolvedValueOnce(runningDay);
    const view = render(<App />);
    expect(await screen.findByText(/running/)).toBeTruthy();
    view.unmount();
    mocks.loadDay.mockResolvedValueOnce(completedDay);
    render(<App />);
    expect(await screen.findByText(/completed/)).toBeTruthy();
  });

  it("offers cross-day active Execution completion even when its Entry is absent from the current board", async () => {
    const crossDay = { ...emptyDay, active_execution: runningDay.active_execution };
    mocks.loadDay.mockResolvedValueOnce(crossDay).mockResolvedValueOnce(emptyDay);
    render(<App />);
    expect(await screen.findByText("Entryなし")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Complete active Execution" }));
    await waitFor(() => expect(mocks.completeEntry).toHaveBeenCalledTimes(1));
    expect(mocks.completeEntry.mock.calls[0][0]).toMatchObject({
      entry_id: runningDay.active_execution?.entry_id,
      execution_id: runningDay.active_execution?.id,
    });
    expect(await screen.findByText("Active: なし")).toBeTruthy();
  });

  it("retries only the exact ambiguous Start and disables unrelated Entry actions", async () => {
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(runningDay);
    mocks.startEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    const starts = await screen.findAllByRole("button", { name: "Start" });
    fireEvent.click(starts[0]);
    const retry = await screen.findByRole("button", { name: "保留中のStartを再試行" });
    expect((screen.getAllByRole("button", { name: "Start" })[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[1]);
    expect(mocks.startEntry).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.startEntry).toHaveBeenCalledTimes(2));
    expect(mocks.startEntry.mock.calls[1][0]).toEqual(mocks.startEntry.mock.calls[0][0]);
  });

  it("discards an ambiguous Start client intent before creating fresh IDs for another Entry", async () => {
    const runningSecond = { ...runningDay, active_execution: { ...runningDay.active_execution!, entry_id: secondEntry.id },
      sections: [{ ...twoPlannedDay.sections[0], entries: [twoPlannedDay.sections[0].entries[0], { ...secondEntry, lifecycle_state: "running" as const }] }] };
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(runningSecond);
    mocks.startEntry.mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Start" }))[0]);
    await screen.findByRole("button", { name: "保留中のStartを再試行" });
    fireEvent.click(screen.getByRole("button", { name: "保留中のclient操作を破棄" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Start" })[1]);
    await waitFor(() => expect(mocks.startEntry).toHaveBeenCalledTimes(2));
    const first = mocks.startEntry.mock.calls[0][0];
    const second = mocks.startEntry.mock.calls[1][0];
    expect(second.entry_id).toBe(secondEntry.id);
    expect(second.operation_id).not.toBe(first.operation_id);
    expect(second.execution_id).not.toBe(first.execution_id);
  });

  it("retries an ambiguous Reorder explicitly and never reuses it from a different arrow", async () => {
    const reordered = { ...twoPlannedDay, placement_revision: 2, sections: [{ ...twoPlannedDay.sections[0], entries: [
      { ...secondEntry, position: 1 }, { ...twoPlannedDay.sections[0].entries[0], position: 2 },
    ] }] };
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(reordered);
    mocks.reorderEntries.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを下へ" }));
    const retry = await screen.findByRole("button", { name: "保留中のReorderを再試行" });
    const unrelated = screen.getByRole("button", { name: "Second taskを上へ" }) as HTMLButtonElement;
    expect(unrelated.disabled).toBe(true);
    fireEvent.click(unrelated);
    expect(mocks.reorderEntries).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(2));
    expect(mocks.reorderEntries.mock.calls[1][0]).toEqual(mocks.reorderEntries.mock.calls[0][0]);
  });

  it("discards an ambiguous Reorder before accepting a fresh move with current revision", async () => {
    const reconciled = { ...twoPlannedDay, placement_revision: 4 };
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(reconciled).mockResolvedValueOnce(reconciled);
    mocks.reorderEntries.mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを下へ" }));
    await screen.findByRole("button", { name: "保留中のReorderを再試行" });
    fireEvent.click(screen.getByRole("button", { name: "保留中のclient操作を破棄" }));
    fireEvent.click(screen.getByRole("button", { name: "Second taskを上へ" }));
    await waitFor(() => expect(mocks.reorderEntries).toHaveBeenCalledTimes(2));
    expect(mocks.reorderEntries.mock.calls[1][0].operation_id).not.toBe(mocks.reorderEntries.mock.calls[0][0].operation_id);
    expect(mocks.reorderEntries.mock.calls[1][0].expected_placement_revision).toBe(4);
  });

  it("retries an ambiguous Complete with exact identity and discard performs no Domain mutation", async () => {
    mocks.loadDay.mockResolvedValue(runningDay);
    mocks.completeEntry.mockRejectedValueOnce(new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous")).mockResolvedValueOnce({});
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Complete active Execution" }));
    const retry = await screen.findByRole("button", { name: "保留中のCompleteを再試行" });
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.completeEntry).toHaveBeenCalledTimes(2));
    expect(mocks.completeEntry.mock.calls[1][0]).toEqual(mocks.completeEntry.mock.calls[0][0]);

    mocks.completeEntry.mockRejectedValueOnce(new TypeError("another lost response"));
    fireEvent.click(screen.getByRole("button", { name: "Complete active Execution" }));
    await screen.findByRole("button", { name: "保留中のCompleteを再試行" });
    const callsBeforeDiscard = mocks.completeEntry.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "保留中のclient操作を破棄" }));
    expect(mocks.completeEntry).toHaveBeenCalledTimes(callsBeforeDiscard);
  });

  it("reconciles deterministic Reorder and Start conflicts without false-success UI", async () => {
    const canonicalWinner = { ...twoPlannedDay, placement_revision: 2, sections: [{ ...twoPlannedDay.sections[0], entries: [
      { ...secondEntry, position: 1 }, { ...twoPlannedDay.sections[0].entries[0], position: 2 },
    ] }] };
    mocks.loadDay.mockResolvedValueOnce(twoPlannedDay).mockResolvedValueOnce(canonicalWinner);
    mocks.reorderEntries.mockRejectedValueOnce(new ApiClientError("revision conflict", 409, true, "revision_conflict"));
    const view = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Canonical taskを下へ" }));
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    const listItems = screen.getAllByRole("listitem");
    expect(listItems[0].getAttribute("data-entry-id")).toBe(secondEntry.id);
    expect(screen.queryByRole("button", { name: "保留中のReorderを再試行" })).toBeNull();
    view.unmount();

    vi.clearAllMocks();
    mocks.loadDay.mockResolvedValue(twoPlannedDay);
    mocks.startEntry.mockRejectedValueOnce(new ApiClientError("active conflict", 409, true, "resource_conflict"));
    render(<App />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Start" }))[0]);
    await waitFor(() => expect(mocks.loadDay).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Active: なし")).toBeTruthy();
    expect(screen.queryByText(/running/)).toBeNull();
    expect(screen.queryByRole("button", { name: "保留中のStartを再試行" })).toBeNull();
  });
});
