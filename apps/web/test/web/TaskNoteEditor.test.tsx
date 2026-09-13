import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskPrimaryDocument } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => {
  class MockApiClientError extends Error {
    constructor(message: string, readonly status: number, readonly reconcile: boolean, readonly code: string) {
      super(message);
    }
  }
  return {
    loadTaskPrimaryDocumentById: vi.fn(),
    updateTaskPrimaryDocument: vi.fn(),
    ApiClientError: MockApiClientError,
  };
});

vi.mock("../../src/web/api", () => ({ api: mocks, ApiClientError: mocks.ApiClientError }));

import { ApiClientError } from "../../src/web/api";
import { TaskNoteEditor } from "../../src/web/TaskNoteEditor";

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

describe("TaskNoteEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadTaskPrimaryDocumentById.mockResolvedValue(primary("before"));
    mocks.updateTaskPrimaryDocument.mockResolvedValue({ document: primary("after", 1) });
  });

  function renderEditor() {
    return render(<TaskNoteEditor
      taskId={taskId} documentId={documentId} taskTitle="Task A"
      onClose={vi.fn()} onUnauthorized={vi.fn()} onDirtyChange={vi.fn()}
      onUnresolvedChange={vi.fn()} onRegisterFlush={vi.fn()} onOpenNewTab={vi.fn()}
    />);
  }

  it("saves body through the same explicit, Ctrl+S, and Cmd+S path", async () => {
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

  it("copies the shared Document permalink", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderEditor();
    await screen.findByRole("textbox", { name: "Markdown本文" });
    fireEvent.click(screen.getByRole("button", { name: "リンクをコピー" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/?view=note&document=")));
    expect(writeText.mock.calls[0]![0]).not.toContain("task=");
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
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
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
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
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
