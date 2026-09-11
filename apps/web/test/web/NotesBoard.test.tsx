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

function ambiguousError(): Error {
  return new mocks.ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous");
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

  it("reconciles an ambiguous Create by fetching the exact document identity", async () => {
    mocks.createStandaloneDocument.mockRejectedValue(ambiguousError());
    mocks.loadDocument.mockImplementation(async (documentId: string) => note(documentId, "Committed", "# committed"));
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Committed" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "# committed" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByDisplayValue("Committed")).toBeTruthy());
    expect(mocks.createStandaloneDocument).toHaveBeenCalledTimes(1);
    const request = mocks.createStandaloneDocument.mock.calls[0]![0];
    expect(mocks.loadDocument).toHaveBeenCalledWith(request.document_id);
    expect(screen.queryByRole("button", { name: "同じ内容で再試行" })).toBeNull();
    expect(screen.getByLabelText("ノートタイトル")).not.toHaveProperty("disabled", true);
  });

  it("retains an ambiguous Create request when the exact document is not found and retries exactly", async () => {
    mocks.createStandaloneDocument.mockRejectedValue(ambiguousError());
    mocks.loadDocument.mockRejectedValue(new mocks.ApiClientError("missing", 404, true, "resource_not_found"));
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Retry Create" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "body" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "同じ内容で再試行" })).toBeTruthy());
    const firstRequest = { ...mocks.createStandaloneDocument.mock.calls[0]![0] };
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.createStandaloneDocument).toHaveBeenCalledTimes(2));
    expect(mocks.createStandaloneDocument.mock.calls[1]![0]).toEqual(firstRequest);
  });

  it("blocks edits after an ambiguous Create without clearing the exact retry", async () => {
    mocks.createStandaloneDocument.mockRejectedValue(ambiguousError());
    mocks.loadDocument.mockRejectedValue(new mocks.ApiClientError("missing", 404, true, "resource_not_found"));
    const onUnresolvedChange = vi.fn();
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} onUnresolvedChange={onUnresolvedChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Frozen" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "original" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "同じ内容で再試行" })).toBeTruthy());
    await waitFor(() => expect(onUnresolvedChange).toHaveBeenLastCalledWith(true));
    const firstRequest = { ...mocks.createStandaloneDocument.mock.calls[0]![0] };
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Changed" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "changed" } });
    expect(screen.getByDisplayValue("Frozen")).toBeTruthy();
    expect(screen.getByDisplayValue("original")).toBeTruthy();
    expect(mocks.createStandaloneDocument).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規ノート" }));
    expect(screen.getByDisplayValue("Frozen")).toBeTruthy();
    expect(mocks.createStandaloneDocument.mock.calls[0]![0]).toEqual(firstRequest);
  });

  it("reconciles an ambiguous Update when the exact revision and payload are canonical", async () => {
    const current = note("0199d090-0000-7000-8000-000000000006", "Before", "before", 0);
    const saved = note(current.document_id, "After", "after", 1);
    mocks.loadDocuments.mockResolvedValue({ documents: [current] });
    mocks.loadDocument.mockResolvedValueOnce(current).mockResolvedValueOnce(saved);
    mocks.updateDocument.mockRejectedValue(ambiguousError());
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Before")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "After" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "after" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByDisplayValue("After")).toBeTruthy());
    expect(mocks.updateDocument).toHaveBeenCalledTimes(1);
    expect(mocks.loadDocument).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "同じ内容で再試行" })).toBeNull();
    expect(screen.getByLabelText("ノートタイトル")).not.toHaveProperty("disabled", true);
  });

  it("retains an ambiguous Update and reuses its exact operation after unresolved reconciliation", async () => {
    const current = note("0199d090-0000-7000-8000-000000000007", "Before", "before", 2);
    mocks.loadDocuments.mockResolvedValue({ documents: [current] });
    mocks.loadDocument.mockResolvedValueOnce(current).mockRejectedValue(new mocks.ApiClientError("missing", 404, true, "resource_not_found"));
    mocks.updateDocument.mockRejectedValue(ambiguousError());
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Before")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "After" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "after" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "同じ内容で再試行" })).toBeTruthy());
    expect(screen.getByLabelText("ノートタイトル")).toHaveProperty("disabled", true);
    const firstRequest = { ...mocks.updateDocument.mock.calls[0]![0] };
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Wrong" } });
    expect(screen.getByDisplayValue("After")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(2));
    expect(mocks.updateDocument.mock.calls[1]![0]).toEqual(firstRequest);
  });

  it("keeps navigation and beforeunload protection active while an ambiguous save is unresolved", async () => {
    mocks.createStandaloneDocument.mockRejectedValue(ambiguousError());
    mocks.loadDocument.mockRejectedValue(new mocks.ApiClientError("missing", 404, true, "resource_not_found"));
    const onUnresolvedChange = vi.fn();
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} onUnresolvedChange={onUnresolvedChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Protected" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "同じ内容で再試行" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "＋ 新規ノート" }));
    expect(screen.getByDisplayValue("Protected")).toBeTruthy();
    expect(onUnresolvedChange).toHaveBeenLastCalledWith(true);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("restores normal editing after an ambiguous save is resolved", async () => {
    mocks.createStandaloneDocument.mockRejectedValueOnce(ambiguousError());
    mocks.loadDocument.mockImplementation(async (documentId: string) => note(documentId, "Resolved", "body", 0));
    const resolved = note("0199d090-0000-7000-8000-000000000008", "Resolved", "body", 0);
    mocks.updateDocument.mockResolvedValue({ document: { ...resolved, title: "Edited", revision: 1 } });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Resolved" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "body" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByDisplayValue("Resolved")).toBeTruthy());
    expect(screen.getByLabelText("ノートタイトル")).not.toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Edited" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(1));
    expect(mocks.updateDocument.mock.calls[0]![0]).toMatchObject({ title: "Edited", expected_revision: 0 });
  });

  it("protects a clean existing Note after an ambiguous Update", async () => {
    const current = note("0199d090-0000-7000-8000-000000000009", "Clean", "body", 4);
    mocks.loadDocuments.mockResolvedValue({ documents: [current] });
    mocks.loadDocument.mockResolvedValueOnce(current).mockRejectedValueOnce(new mocks.ApiClientError("missing", 404, true, "resource_not_found"));
    mocks.updateDocument.mockRejectedValue(ambiguousError());
    const onDirtyChange = vi.fn();
    const onUnresolvedChange = vi.fn();
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={onDirtyChange} onUnresolvedChange={onUnresolvedChange} />);
    await waitFor(() => expect(screen.getByDisplayValue("Clean")).toBeTruthy());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "同じ内容で再試行" })).toBeTruthy());
    await waitFor(() => expect(onUnresolvedChange).toHaveBeenLastCalledWith(true));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByLabelText("ノートタイトル")).toHaveProperty("disabled", true);
  });

  it("keeps the beforeunload guard active for a clean unresolved Update", async () => {
    const current = note("0199d090-0000-7000-8000-00000000000a", "Clean unload", "body", 1);
    mocks.loadDocuments.mockResolvedValue({ documents: [current] });
    mocks.loadDocument.mockResolvedValueOnce(current).mockRejectedValueOnce(new mocks.ApiClientError("missing", 404, true, "resource_not_found"));
    mocks.updateDocument.mockRejectedValue(ambiguousError());
    const onDirtyChange = vi.fn();
    const onUnresolvedChange = vi.fn();
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={onDirtyChange} onUnresolvedChange={onUnresolvedChange} />);
    await waitFor(() => expect(screen.getByDisplayValue("Clean unload")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "同じ内容で再試行" })).toBeTruthy());
    await waitFor(() => expect(onUnresolvedChange).toHaveBeenLastCalledWith(true));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("restores normal editing after exact retry resolves a clean ambiguous Update", async () => {
    const current = note("0199d090-0000-7000-8000-00000000000b", "Retry clean", "body", 2);
    const resolved = note(current.document_id, current.title, current.markdown_body, 3);
    mocks.loadDocuments.mockResolvedValue({ documents: [current] });
    mocks.loadDocument.mockResolvedValueOnce(current).mockRejectedValueOnce(new mocks.ApiClientError("missing", 404, true, "resource_not_found"));
    mocks.updateDocument.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ document: resolved });
    const onUnresolvedChange = vi.fn();
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} onUnresolvedChange={onUnresolvedChange} />);
    await waitFor(() => expect(screen.getByDisplayValue("Retry clean")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const firstRequest = { ...mocks.updateDocument.mock.calls[0]![0] };
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onUnresolvedChange).toHaveBeenLastCalledWith(false));
    expect(mocks.updateDocument.mock.calls[1]![0]).toEqual(firstRequest);
    expect(screen.getByLabelText("ノートタイトル")).not.toHaveProperty("disabled", true);
  });

  it("clears the clean-draft barrier when exact canonical reconciliation proves the Update", async () => {
    const current = note("0199d090-0000-7000-8000-00000000000c", "Canonical clean", "body", 6);
    const resolved = note(current.document_id, current.title, current.markdown_body, 7);
    mocks.loadDocuments.mockResolvedValue({ documents: [current] });
    mocks.loadDocument.mockResolvedValueOnce(current).mockResolvedValueOnce(resolved);
    mocks.updateDocument.mockRejectedValue(ambiguousError());
    const onUnresolvedChange = vi.fn();
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} onUnresolvedChange={onUnresolvedChange} />);
    await waitFor(() => expect(screen.getByDisplayValue("Canonical clean")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onUnresolvedChange).toHaveBeenLastCalledWith(false));
    expect(screen.queryByRole("button", { name: "同じ内容で再試行" })).toBeNull();
    expect(screen.getByLabelText("ノートタイトル")).not.toHaveProperty("disabled", true);
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
