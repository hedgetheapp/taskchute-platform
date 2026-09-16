import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectPrimaryDocument, TaskPrimaryDocument } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => {
  class MockApiClientError extends Error {
    constructor(message: string, readonly status: number, readonly reconcile: boolean, readonly code: string) {
      super(message);
    }
  }
  return {
    loadTaskPrimaryDocumentById: vi.fn(),
    updateTaskPrimaryDocument: vi.fn(),
    loadProjectPrimaryDocumentById: vi.fn(),
    updateProjectPrimaryDocument: vi.fn(),
    ApiClientError: MockApiClientError,
  };
});

vi.mock("../../src/web/api", () => ({ api: mocks, ApiClientError: mocks.ApiClientError }));

import { ApiClientError } from "../../src/web/api";
import { TaskNoteEditor } from "../../src/web/TaskNoteEditor";
import { TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY } from "../../src/web/task-note-window-geometry";

const documentId = "0199d101-0000-7000-8000-000000000001";
const taskId = "0199d101-0000-7000-8000-000000000002";

function primary(markdownBody: string, revision = 0): TaskPrimaryDocument {
  return {
    document_id: documentId, kind: "task_primary", task_id: taskId, markdown_body: markdownBody,
    revision, created_at: "2026-09-13T00:00:00.000Z", updated_at: "2026-09-13T00:00:00.000Z",
  };
}

function ambiguousError(): Error {
  return new ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous");
}

function missingError(): Error {
  return new ApiClientError("missing", 404, true, "resource_not_found");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function dispatchPointer(element: HTMLElement, type: string, values: { clientX?: number; clientY?: number; pointerId?: number; button?: number }): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: values.clientX ?? 0 },
    clientY: { value: values.clientY ?? 0 },
    pointerId: { value: values.pointerId ?? 1 },
    button: { value: values.button ?? 0 },
  });
  fireEvent(element, event);
}

describe("TaskNoteEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.loadTaskPrimaryDocumentById.mockResolvedValue(primary("before"));
    mocks.updateTaskPrimaryDocument.mockResolvedValue({ document: primary("after", 1) });
    mocks.loadProjectPrimaryDocumentById.mockResolvedValue(projectPrimary("before"));
    mocks.updateProjectPrimaryDocument.mockResolvedValue({ document: projectPrimary("after", 1) });
  });

  function projectPrimary(markdownBody: string, revision = 0): ProjectPrimaryDocument {
    return {
      document_id: documentId, kind: "project_primary", project_id: taskId, project_title: "Project A",
      markdown_body: markdownBody, revision, created_at: "2026-09-13T00:00:00.000Z", updated_at: "2026-09-13T00:00:00.000Z",
    };
  }

  function renderEditor() {
    return render(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={vi.fn()} onUnauthorized={vi.fn()} onDirtyChange={vi.fn()}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
  }

  it("saves body through the Ctrl+S and Cmd+S path", async () => {
    renderEditor();
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.change(body, { target: { value: "after" } });
    fireEvent.keyDown(body, { key: "s", ctrlKey: true });
    fireEvent.keyDown(body, { key: "s", metaKey: true, repeat: true });
    await waitFor(() => expect(mocks.updateTaskPrimaryDocument).toHaveBeenCalledTimes(1));
    expect(mocks.updateTaskPrimaryDocument.mock.calls[0]![0]).toMatchObject({
      task_id: taskId, document_id: documentId, expected_revision: 0, markdown_body: "after",
    });
    expect(mocks.updateTaskPrimaryDocument.mock.calls[0]![0].operation_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("preserves a dirty Task Primary draft and reports an authenticated 401", async () => {
    const onUnauthorized = vi.fn();
    mocks.updateTaskPrimaryDocument.mockRejectedValueOnce(new mocks.ApiClientError("expired", 401, false, "unauthenticated"));
    render(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={vi.fn()} onUnauthorized={onUnauthorized} onDirtyChange={vi.fn()}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.change(body, { target: { value: "local draft" } });
    fireEvent.keyDown(body, { key: "s", ctrlKey: true });
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue("local draft")).toBeTruthy();
    expect(mocks.updateTaskPrimaryDocument).toHaveBeenCalledTimes(1);
  });

  it("keeps Task Primary text typed while realtime canonical reload is pending", async () => {
    const refresh = deferred<TaskPrimaryDocument>();
    mocks.loadTaskPrimaryDocumentById.mockResolvedValue(primary("before"));
    const onUnauthorized = vi.fn();
    const onDirtyChange = vi.fn();
    const view = render(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={vi.fn()} onUnauthorized={onUnauthorized} onDirtyChange={onDirtyChange}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    const initialLoads = mocks.loadTaskPrimaryDocumentById.mock.calls.length;
    mocks.loadTaskPrimaryDocumentById.mockReturnValueOnce(refresh.promise);
    view.rerender(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={vi.fn()} onUnauthorized={onUnauthorized} onDirtyChange={onDirtyChange}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
      realtimeRefresh={{ token: 1, scopes: [{ kind: "documents", document_ids: [documentId] }] }}
    />);
    await waitFor(() => expect(mocks.loadTaskPrimaryDocumentById.mock.calls.length).toBeGreaterThan(initialLoads));
    fireEvent.change(body, { target: { value: "before + local typing" } });
    await act(async () => { refresh.resolve(primary("before")); await refresh.promise; });
    expect(body).toHaveProperty("value", "before + local typing");
  });

  it("keeps Task Primary deletions while realtime canonical reload is pending", async () => {
    const refresh = deferred<TaskPrimaryDocument>();
    mocks.loadTaskPrimaryDocumentById.mockResolvedValue(primary("abcdef"));
    const onUnauthorized = vi.fn();
    const onDirtyChange = vi.fn();
    const view = render(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={vi.fn()} onUnauthorized={onUnauthorized} onDirtyChange={onDirtyChange}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    const initialLoads = mocks.loadTaskPrimaryDocumentById.mock.calls.length;
    mocks.loadTaskPrimaryDocumentById.mockReturnValueOnce(refresh.promise);
    view.rerender(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={vi.fn()} onUnauthorized={onUnauthorized} onDirtyChange={onDirtyChange}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
      realtimeRefresh={{ token: 1, scopes: [{ kind: "documents", document_ids: [documentId] }] }}
    />);
    await waitFor(() => expect(mocks.loadTaskPrimaryDocumentById.mock.calls.length).toBeGreaterThan(initialLoads));
    fireEvent.change(body, { target: { value: "abc" } });
    await act(async () => { refresh.resolve(primary("abcdef")); await refresh.promise; });
    expect(body).toHaveProperty("value", "abc");
  });

  it("keeps Project Primary text typed while realtime canonical reload is pending", async () => {
    const refresh = deferred<ProjectPrimaryDocument>();
    mocks.loadProjectPrimaryDocumentById.mockResolvedValue(projectPrimary("before"));
    const onUnauthorized = vi.fn();
    const onDirtyChange = vi.fn();
    const view = render(<TaskNoteEditor
      documentKind="project_primary" projectId={taskId} projectTitle="Project A" taskId={taskId} documentId={documentId}
      onClose={vi.fn()} onUnauthorized={onUnauthorized} onDirtyChange={onDirtyChange}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    const initialLoads = mocks.loadProjectPrimaryDocumentById.mock.calls.length;
    mocks.loadProjectPrimaryDocumentById.mockReturnValueOnce(refresh.promise);
    view.rerender(<TaskNoteEditor
      documentKind="project_primary" projectId={taskId} projectTitle="Project A" taskId={taskId} documentId={documentId}
      onClose={vi.fn()} onUnauthorized={onUnauthorized} onDirtyChange={onDirtyChange}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
      realtimeRefresh={{ token: 1, scopes: [{ kind: "documents", document_ids: [documentId] }] }}
    />);
    await waitFor(() => expect(mocks.loadProjectPrimaryDocumentById.mock.calls.length).toBeGreaterThan(initialLoads));
    fireEvent.change(body, { target: { value: "before + project local typing" } });
    await act(async () => { refresh.resolve(projectPrimary("before")); await refresh.promise; });
    expect(body).toHaveProperty("value", "before + project local typing");
  });

  it("uses the same memory-preserving path for a Project Primary floating editor", async () => {
    const onUnauthorized = vi.fn();
    mocks.updateProjectPrimaryDocument.mockRejectedValueOnce(new mocks.ApiClientError("expired", 401, false, "unauthenticated"));
    render(<TaskNoteEditor
      documentKind="project_primary" projectId={taskId} projectTitle="Project A" taskId={taskId} documentId={documentId}
      onClose={vi.fn()} onUnauthorized={onUnauthorized} onDirtyChange={vi.fn()}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.change(body, { target: { value: "project draft" } });
    fireEvent.keyDown(body, { key: "s", metaKey: true });
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue("project draft")).toBeTruthy();
  });

  it("blocks an over-limit Task Primary payload before calling the Worker", async () => {
    renderEditor();
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.change(body, { target: { value: "日😀\\n".repeat(22000) } });
    fireEvent.keyDown(body, { key: "s", ctrlKey: true });
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("大きすぎます");
    expect(mocks.updateTaskPrimaryDocument).not.toHaveBeenCalled();
  });

  it("copies the shared Document permalink", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.click(screen.getByRole("button", { name: "リンクをコピー" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/?view=note&document=")));
    expect(writeText.mock.calls[0]![0]).not.toContain("task=");
  });

  it("keeps normal save controls and status out of the expanded chrome", async () => {
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.queryByText("保存済み")).toBeNull();
    expect(screen.queryByText("未保存")).toBeNull();
    expect(screen.queryByText("保存中…")).toBeNull();
    expect(screen.getByRole("button", { name: "ノートを閉じる" })).toBeTruthy();
    expect(document.querySelectorAll(".task-note-peek-footer")).toHaveLength(0);
  });

  it("renders compact desktop window controls in the approved order", async () => {
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    const controls = Array.from(document.querySelectorAll<HTMLButtonElement>(".task-note-window-controls button"));
    expect(controls.map((control) => control.getAttribute("aria-label"))).toEqual([
      "ノートを最小化", "ノートを最大化", "ノートを閉じる",
    ]);
    expect(controls.map((control) => control.textContent)).toEqual(["-", "", "×"]);
    expect(screen.queryByText("閉じる")).toBeNull();
    expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新しいタブ" })).toBeTruthy();
  });

  it("maximizes transiently without changing preferred geometry and restores it", async () => {
    localStorage.setItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY, JSON.stringify({
      version: 1, x: 400, y: 40, width: 420, height: 500,
    }));
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    const peek = document.querySelector<HTMLElement>(".task-note-peek")!;
    const stored = localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY);

    fireEvent.click(screen.getByRole("button", { name: "ノートを最大化" }));
    expect(peek.dataset.taskNoteWindowState).toBe("maximized");
    expect(peek.dataset.taskNoteWindowGeometry).toBe(`16,16,${window.innerWidth - 32},${window.innerHeight - 32}`);
    expect(document.querySelectorAll(".task-note-window-resize-handle")).toHaveLength(0);
    expect(localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY)).toBe(stored);
    expect(screen.getByRole("button", { name: "ノートを元のサイズに戻す" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ノートを元のサイズに戻す" }));
    expect(peek.dataset.taskNoteWindowState).toBe("windowed");
    expect(peek.dataset.taskNoteWindowGeometry).toBe("400,40,420,500");
    expect(localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY)).toBe(stored);
    expect(document.querySelectorAll(".task-note-window-resize-handle")).toHaveLength(8);
  });

  it("tracks viewport-safe bounds while maximized and ignores geometry input", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    localStorage.setItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY, JSON.stringify({
      version: 1, x: 400, y: 40, width: 420, height: 500,
    }));
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    const peek = document.querySelector<HTMLElement>(".task-note-peek")!;
    const header = screen.getByRole("banner", { name: "ノートウィンドウを移動" });
    const stored = localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY);
    fireEvent.click(screen.getByRole("button", { name: "ノートを最大化" }));

    dispatchPointer(header, "pointerdown", { clientX: 700, clientY: 100 });
    dispatchPointer(header, "pointermove", { clientX: 900, clientY: 300 });
    dispatchPointer(header, "pointerup", { clientX: 900, clientY: 300 });
    fireEvent.keyDown(header, { key: "ArrowRight", altKey: true });
    expect(peek.dataset.taskNoteWindowGeometry).toBe(`16,16,${window.innerWidth - 32},${window.innerHeight - 32}`);
    expect(localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY)).toBe(stored);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(peek.dataset.taskNoteWindowGeometry).toBe("16,16,1168,868"));
    expect(localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY)).toBe(stored);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    fireEvent(window, new Event("resize"));
  });

  it("renders the shared Markdown source editor and resizes the peek without saving", async () => {
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    expect(document.querySelector("[data-note-markdown-editor='true']")).toBeTruthy();
    const peek = document.querySelector<HTMLElement>(".task-note-peek");
    const handle = screen.getByRole("separator", { name: "左端でノートウィンドウの幅を変更" });
    expect(peek?.dataset.taskNotePeekWidth).toBe("420");

    dispatchPointer(handle, "pointerdown", { button: 0, clientX: 800 });
    dispatchPointer(handle, "pointermove", { clientX: 700 });
    expect(peek?.dataset.taskNotePeekWidth).toBe("520");
    dispatchPointer(handle, "pointerup", { clientX: 700 });
    expect(JSON.parse(localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY)!)).toMatchObject({
      version: 1, width: 520, x: 488, y: 16, height: 736,
    });
    expect(mocks.updateTaskPrimaryDocument).not.toHaveBeenCalled();

    const { unmount } = renderEditor();
    await screen.findAllByRole("textbox", { name: "Markdown本文" });
    expect(document.querySelector<HTMLElement>(".task-note-peek")?.dataset.taskNotePeekWidth).toBe("520");
    unmount();
  });

  it("supports keyboard resize steps and keeps line-number preference shared", async () => {
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    const peek = document.querySelector<HTMLElement>(".task-note-peek");
    const handle = screen.getByRole("separator", { name: "左端でノートウィンドウの幅を変更" });
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(peek?.dataset.taskNotePeekWidth).toBe("444");
    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(peek?.dataset.taskNotePeekWidth).toBe("364");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(peek?.dataset.taskNotePeekWidth).toBe("360");
    fireEvent.keyDown(handle, { key: "End" });
    expect(peek?.dataset.taskNotePeekWidth).toBe("992");
    const lineNumberToggle = screen.getByRole("checkbox", { name: "行番号を表示" });
    fireEvent.click(lineNumberToggle);
    expect(lineNumberToggle).toHaveProperty("checked", false);
    expect(mocks.updateTaskPrimaryDocument).not.toHaveBeenCalled();
  });

  it("moves from a blank title bar, persists the rect, and ignores action buttons", async () => {
    localStorage.setItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY, JSON.stringify({
      version: 1, geometry: { x: 400, y: 40, width: 420, height: 500 },
    }));
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    const peek = document.querySelector<HTMLElement>(".task-note-peek")!;
    const header = screen.getByRole("banner", { name: "ノートウィンドウを移動" });
    dispatchPointer(header, "pointerdown", { clientX: 700, clientY: 100 });
    dispatchPointer(header, "pointermove", { clientX: 600, clientY: 180 });
    expect(peek.style.left).toBe("300px");
    expect(peek.style.top).toBe("120px");
    dispatchPointer(header, "pointerup", { clientX: 600, clientY: 180 });
    expect(JSON.parse(localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY)!)).toMatchObject({
      x: 300, y: 120, width: 420, height: 500,
    });

    const copy = screen.getByRole("button", { name: "リンクをコピー" });
    dispatchPointer(copy, "pointerdown", { clientX: 800, clientY: 180 });
    dispatchPointer(header, "pointermove", { clientX: 900, clientY: 280 });
    expect(peek.style.left).toBe("300px");
    expect(peek.style.top).toBe("120px");
    expect(mocks.updateTaskPrimaryDocument).not.toHaveBeenCalled();
  });

  it("exposes all eight resize directions and cancels a pointer resize safely", async () => {
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    expect(document.querySelectorAll(".task-note-window-resize-handle")).toHaveLength(8);
    const east = document.querySelector<HTMLElement>(".task-note-window-resize-handle.is-w")!;
    const peek = document.querySelector<HTMLElement>(".task-note-peek")!;
    dispatchPointer(east, "pointerdown", { clientX: 600, clientY: 400 });
    dispatchPointer(east, "pointermove", { clientX: 520, clientY: 400 });
    expect(peek.style.width).toBe("500px");
    dispatchPointer(east, "pointercancel", { clientX: 520, clientY: 400 });
    expect(JSON.parse(localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY)!)).toMatchObject({ width: 500 });
    expect(mocks.updateTaskPrimaryDocument).not.toHaveBeenCalled();
  });

  it("minimizes without saving, moves the compact bar, and restores the expanded rect", async () => {
    const { unmount } = renderEditor();
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    const peek = document.querySelector<HTMLElement>(".task-note-peek")!;
    body.focus();
    const expanded = { left: peek.style.left, top: peek.style.top, width: peek.style.width, height: peek.style.height };
    fireEvent.click(screen.getByRole("button", { name: "ノートを最小化" }));
    expect(peek.dataset.taskNoteMinimized).toBe("true");
    expect(peek.querySelector(".task-note-peek-expanded")?.hasAttribute("hidden")).toBe(true);
    const bar = document.querySelector<HTMLElement>(".task-note-peek-minimized-bar")!;
    await waitFor(() => expect(document.activeElement).toBe(bar));
    expect(mocks.updateTaskPrimaryDocument).not.toHaveBeenCalled();

    expect(bar.getAttribute("aria-label")).toBe("Task Aのノートを開く");
    expect(bar.querySelector(".task-note-peek-minimized-title")?.textContent).toBe("Task A");
    expect(bar.querySelectorAll("svg.task-note-icon")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "リンクをコピー" })).toBeNull();
    expect(screen.queryByRole("button", { name: "新しいタブ" })).toBeNull();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ノートを元のサイズに戻す" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ノートを開く" })).toBeNull();
    expect(screen.getByRole("button", { name: "ノートを閉じる" }).textContent).toBe("×");
    expect(document.querySelector(".task-note-peek-expanded")?.hasAttribute("hidden")).toBe(true);
    dispatchPointer(bar, "pointerdown", { clientX: 600, clientY: 100 });
    dispatchPointer(bar, "pointermove", { clientX: 680, clientY: 160 });
    dispatchPointer(bar, "pointerup", { clientX: 680, clientY: 160 });
    expect(peek.style.width).toBe("320px");
    expect(JSON.parse(localStorage.getItem(TASK_NOTE_WINDOW_GEOMETRY_STORAGE_KEY)!)).toMatchObject({ width: 420, height: 736 });

    fireEvent.click(bar);
    expect(peek.dataset.taskNoteMinimized).toBe("true");
    fireEvent.keyDown(bar, { key: "Enter" });
    await waitFor(() => expect(peek.dataset.taskNoteMinimized).toBeUndefined());
    expect(peek.style.width).toBe(expanded.width);
    expect(peek.style.height).toBe(expanded.height);
    unmount();
  });

  it("opens expanded again on a new mount instead of persisting minimized state", async () => {
    const first = renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.click(screen.getByRole("button", { name: "ノートを最小化" }));
    expect(document.querySelector("[data-task-note-minimized='true']")).not.toBeNull();
    first.unmount();
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    expect(document.querySelector("[data-task-note-minimized='true']")).toBeNull();
    expect((screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("minimizes on an outside desktop pointerdown without stealing the underlying click", async () => {
    renderEditor();
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    const outside = document.createElement("button");
    outside.type = "button";
    outside.textContent = "Today";
    const outsideClick = vi.fn();
    outside.addEventListener("click", outsideClick);
    document.body.appendChild(outside);
    body.focus();

    fireEvent.pointerDown(outside);
    fireEvent.click(outside);

    expect(outsideClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-task-note-minimized='true']")).not.toBeNull();
    expect(document.activeElement).not.toBe(body);
    expect(mocks.updateTaskPrimaryDocument).not.toHaveBeenCalled();
    outside.remove();
  });

  it("restores from a compact-surface click while keeping close separate", async () => {
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.click(screen.getByRole("button", { name: "ノートを最小化" }));
    const bar = document.querySelector<HTMLElement>(".task-note-peek-minimized-bar")!;
    fireEvent.click(bar);
    await waitFor(() => expect(document.querySelector("[data-task-note-minimized='true']")).toBeNull());
    expect(screen.getByRole("button", { name: "ノートを最小化" })).toBeTruthy();
  });

  it("restores from the minimized title area with Enter and Space", async () => {
    renderEditor();
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    body.focus();
    fireEvent.click(screen.getByRole("button", { name: "ノートを最小化" }));
    const bar = document.querySelector<HTMLElement>(".task-note-peek-minimized-bar")!;
    const title = document.querySelector<HTMLElement>(".task-note-peek-minimized-title")!;
    await waitFor(() => expect(document.activeElement).toBe(bar));

    fireEvent.keyDown(bar, { key: "Enter" });
    await waitFor(() => expect(document.querySelector("[data-task-note-minimized='true']")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "ノートを最小化" }));
    const minimizedAgain = document.querySelector<HTMLElement>(".task-note-peek-minimized-bar")!;
    fireEvent.click(title);
    await waitFor(() => expect(document.querySelector("[data-task-note-minimized='true']")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "ノートを最小化" }));
    const minimizedForSpace = document.querySelector<HTMLElement>(".task-note-peek-minimized-bar")!;
    expect(minimizedAgain).toBe(minimizedForSpace);
    fireEvent.keyDown(minimizedForSpace, { key: " " });
    await waitFor(() => expect(document.querySelector("[data-task-note-minimized='true']")).toBeNull());
  });

  it("closes from the minimized close control without restoring", async () => {
    const onClose = vi.fn();
    render(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={onClose} onUnauthorized={vi.fn()} onDirtyChange={vi.fn()}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
    await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.click(screen.getByRole("button", { name: "ノートを最小化" }));
    const close = screen.getByRole("button", { name: "ノートを閉じる" });
    fireEvent.keyDown(close, { key: "Enter" });
    fireEvent.keyDown(close, { key: " " });
    expect(document.querySelector("[data-task-note-minimized='true']")).not.toBeNull();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-task-note-minimized='true']")).not.toBeNull();
  });

  it("keeps a long task title in a flexible minimized title element", async () => {
    render(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="A very long Task Note title that should truncate safely"
      onClose={vi.fn()} onUnauthorized={vi.fn()} onDirtyChange={vi.fn()}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
    await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.click(screen.getByRole("button", { name: "ノートを最小化" }));
    const title = document.querySelector<HTMLElement>(".task-note-peek-minimized-title")!;
    expect(title.textContent).toBe("A very long Task Note title that should truncate safely");
    expect(title.title).toBe(title.textContent);
    expect(screen.getByRole("button", { name: "ノートを閉じる" }).textContent).toBe("×");
  });

  it("keeps the Task Note Markdown-only without a preview surface", async () => {
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    expect(screen.queryByText("プレビュー")).toBeNull();
    expect(document.querySelector("[data-note-preview], .note-preview")).toBeNull();
  });

  it("reconciles an ambiguous update by exact document identity", async () => {
    mocks.updateTaskPrimaryDocument.mockRejectedValueOnce(ambiguousError());
    mocks.loadTaskPrimaryDocumentById.mockResolvedValueOnce(primary("before"))
      .mockResolvedValueOnce(primary("after", 1));
    const unresolved = vi.fn();
    render(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={vi.fn()} onUnauthorized={vi.fn()} onDirtyChange={vi.fn()}
      onUnresolvedChange={unresolved} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.change(body, { target: { value: "after" } });
    fireEvent.keyDown(body, { key: "s", ctrlKey: true });
    await screen.findByText("保存結果を確認しました。");
    expect(mocks.loadTaskPrimaryDocumentById).toHaveBeenLastCalledWith(documentId);
    expect(screen.queryByRole("button", { name: "同じ内容で再試行" })).toBeNull();
    expect(unresolved).toHaveBeenLastCalledWith(false);
  });

  it("retains the exact update while ambiguous and retries it without replacement", async () => {
    mocks.updateTaskPrimaryDocument.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ document: primary("after", 1) });
    mocks.loadTaskPrimaryDocumentById.mockResolvedValueOnce(primary("before")).mockRejectedValueOnce(missingError());
    renderEditor();
    const body = await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.change(body, { target: { value: "after" } });
    fireEvent.keyDown(body, { key: "s", ctrlKey: true });
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const firstRequest = { ...mocks.updateTaskPrimaryDocument.mock.calls[0]![0] };
    expect(body).toHaveProperty("disabled", true);
    fireEvent.change(body, { target: { value: "replacement" } });
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.updateTaskPrimaryDocument).toHaveBeenCalledTimes(2));
    expect(mocks.updateTaskPrimaryDocument.mock.calls[1]![0]).toEqual(firstRequest);
    await waitFor(() => expect(body).not.toHaveProperty("disabled", true));
  });
});
