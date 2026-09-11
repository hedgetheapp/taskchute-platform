import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StandaloneDocument } from "../../src/shared/contracts";

const mocks = vi.hoisted(() => {
  class MockApiClientError extends Error {
    constructor(message: string, readonly status: number, readonly reconcile: boolean, readonly code: string) {
      super(message);
    }
  }
  return {
    loadDocuments: vi.fn(),
    loadDocument: vi.fn(),
    createStandaloneDocument: vi.fn(),
    updateDocument: vi.fn(),
    ApiClientError: MockApiClientError,
  };
});

vi.mock("../../src/web/api", () => ({ api: mocks, ApiClientError: mocks.ApiClientError }));

import { NotesBoard } from "../../src/web/NotesBoard";

function note(id: string, title: string, body: string, revision = 0): StandaloneDocument {
  return {
    document_id: id, kind: "standalone", title, markdown_body: body, revision,
    created_at: "2026-09-11T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z",
  };
}

describe("NotesBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadDocuments.mockResolvedValue({ documents: [] });
  });

  it("opens a memory-only draft, creates on explicit Save, then updates", async () => {
    const created = note("0199d090-0000-7000-8000-000000000001", "Created", "# body", 0);
    mocks.createStandaloneDocument.mockResolvedValue({ document: created });
    mocks.updateDocument.mockResolvedValue({ document: { ...created, title: "Updated", revision: 1 } });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "＋ 新規ノート" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規ノート" }));
    expect(mocks.createStandaloneDocument).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Created" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "# body" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.createStandaloneDocument).toHaveBeenCalledTimes(1));
    expect(mocks.updateDocument).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(1));
    expect(mocks.updateDocument.mock.calls[0]![0]).toMatchObject({ document_id: created.document_id, expected_revision: 0, title: "Updated" });
  });

  it("uses the same save path for Ctrl+S and prevents duplicate key-repeat dispatch", async () => {
    const created = note("0199d090-0000-7000-8000-000000000002", "Keyboard", "body");
    mocks.createStandaloneDocument.mockResolvedValue({ document: created });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Keyboard" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "body" } });
    const body = screen.getByLabelText("Markdown本文");
    fireEvent.keyDown(body, { key: "s", ctrlKey: true });
    fireEvent.keyDown(body, { key: "s", ctrlKey: true, repeat: true });
    await waitFor(() => expect(mocks.createStandaloneDocument).toHaveBeenCalledTimes(1));
    mocks.updateDocument.mockResolvedValue({ document: { ...created, title: "Keyboard updated", revision: 1 } });
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Keyboard updated" } });
    fireEvent.keyDown(screen.getByLabelText("ノートタイトル"), { key: "s", metaKey: true });
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(1));
  });

  it("does not discard a dirty draft when switching notes is canceled", async () => {
    const first = note("0199d090-0000-7000-8000-000000000003", "First", "one");
    const second = note("0199d090-0000-7000-8000-000000000004", "Second", "two");
    mocks.loadDocuments.mockResolvedValue({ documents: [first, second] });
    mocks.loadDocument.mockResolvedValue(first);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("First")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Local draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(confirm).toHaveBeenCalled();
    expect(mocks.loadDocument).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Local draft")).toBeTruthy();
    confirm.mockRestore();
  });

  it("preserves the local draft after a revision conflict and exposes canonical state", async () => {
    const current = note("0199d090-0000-7000-8000-000000000005", "Server", "server", 2);
    mocks.loadDocuments.mockResolvedValue({ documents: [current] });
    mocks.loadDocument.mockResolvedValue(current);
    mocks.updateDocument.mockRejectedValue(new mocks.ApiClientError("stale", 409, true, "revision_conflict"));
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Server")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Local" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("他の変更"));
    expect(screen.getByDisplayValue("Local")).toBeTruthy();
    expect(screen.getByText("最新のServer内容を確認")).toBeTruthy();
  });

  it("registers beforeunload only as a dirty-draft guard", async () => {
    const unload = vi.fn();
    window.addEventListener("beforeunload", unload);
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Dirty" } });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    window.removeEventListener("beforeunload", unload);
  });
});
