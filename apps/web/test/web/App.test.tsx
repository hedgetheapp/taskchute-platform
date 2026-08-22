import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentTaskChuteDayProjection } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  loadDay: vi.fn(),
  createProject: vi.fn(),
  addTask: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logout.mockResolvedValue({});
  mocks.createProject.mockResolvedValue({ project: { id: "project", title: "Project" }, replayed: false });
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
});
