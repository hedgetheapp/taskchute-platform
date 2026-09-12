import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StandaloneDocument, StandaloneDocumentSummary } from "../../src/shared/contracts";

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
    setStandaloneDocumentArchived: vi.fn(),
    deleteStandaloneDocument: vi.fn(),
    ApiClientError: MockApiClientError,
  };
});

vi.mock("../../src/web/api", () => ({ api: mocks, ApiClientError: mocks.ApiClientError }));

import { NotesBoard } from "../../src/web/NotesBoard";

function note(id: string, title: string, body: string, revision = 0, archived_at: string | null = null): StandaloneDocument {
  return {
    document_id: id, kind: "standalone", title, markdown_body: body, revision, archived_at,
    created_at: "2026-09-11T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z",
  };
}

function summary(document: StandaloneDocument): StandaloneDocumentSummary {
  return {
    document_id: document.document_id, kind: "standalone", title: document.title, revision: document.revision,
    archived_at: document.archived_at, created_at: document.created_at, updated_at: document.updated_at,
  };
}

function ambiguousError(): Error {
  return new mocks.ApiClientError("ambiguous", 503, true, "infrastructure_ambiguous");
}

function missingError(): Error {
  return new mocks.ApiClientError("missing", 404, true, "resource_not_found");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe("NotesBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadDocuments.mockResolvedValue({ documents: [] });
    mocks.createStandaloneDocument.mockResolvedValue({ document: note("0199d090-0000-7000-8000-000000000001", "notitle", "") });
    mocks.updateDocument.mockResolvedValue({ document: note("0199d090-0000-7000-8000-000000000001", "notitle", "", 1) });
    mocks.setStandaloneDocumentArchived.mockResolvedValue({ document: note("0199d090-0000-7000-8000-000000000001", "notitle", "", 1, "2026-09-12T00:00:00.000Z") });
    mocks.deleteStandaloneDocument.mockResolvedValue({ document_id: "0199d090-0000-7000-8000-000000000001", deleted: true });
  });

  it("creates immediately with the reserved notitle request, then explicit Save updates", async () => {
    const created = note("0199d090-0000-7000-8000-000000000001", "notitle", "", 0);
    mocks.createStandaloneDocument.mockResolvedValue({ document: created });
    mocks.updateDocument.mockResolvedValue({ document: note(created.document_id, "Created", "# body", 1) });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    await waitFor(() => expect(mocks.createStandaloneDocument).toHaveBeenCalledTimes(1));
    expect(mocks.createStandaloneDocument.mock.calls[0]![0]).toMatchObject({ title: "notitle", markdown_body: "" });
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Created" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "# body" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(1));
    expect(mocks.updateDocument.mock.calls[0]![0]).toMatchObject({
      document_id: created.document_id, expected_revision: 0, title: "Created", markdown_body: "# body",
    });
  });

  it("autosaves an existing Note after the debounce without blocking editing", async () => {
    const current = note("0199d090-0000-7000-8000-000000000002", "Before", "body", 3);
    mocks.loadDocuments.mockResolvedValue({ documents: [summary(current)] });
    mocks.loadDocument.mockResolvedValue(current);
    const saved = note(current.document_id, "After", "body", 4);
    mocks.updateDocument.mockResolvedValue({ document: saved });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} onSavingChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Before")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "After" } });
    expect(screen.getByDisplayValue("After")).toBeTruthy();
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(1), { timeout: 2500 });
    expect(mocks.updateDocument.mock.calls[0]![0]).toMatchObject({ expected_revision: 3, title: "After" });
  });

  it("reports logical saves once and bounds a sent request plus one follow-up intent", async () => {
    const current = note("0199d090-0000-7000-8000-00000000000b", "Before", "body", 0);
    const response = deferred<{ document: StandaloneDocument }>();
    mocks.loadDocuments.mockResolvedValue({ documents: [summary(current)] });
    mocks.loadDocument.mockResolvedValue(current);
    mocks.updateDocument.mockReturnValueOnce(response.promise).mockResolvedValue({ document: note(current.document_id, "Title", "new body", 1) });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Before")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Title" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByText("保存中 1件");
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "new body" } });
    await screen.findByText("保存中 2件");
    response.resolve({ document: note(current.document_id, "Title", "body", 1) });
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(2), { timeout: 2500 });
  });

  it("uses the same save path for Ctrl+S/Cmd+S and ignores key repeat", async () => {
    const current = note("0199d090-0000-7000-8000-000000000003", "Before", "body", 0);
    mocks.loadDocuments.mockResolvedValue({ documents: [summary(current)] });
    mocks.loadDocument.mockResolvedValue(current);
    mocks.updateDocument.mockResolvedValue({ document: note(current.document_id, "Keyboard", "body", 1) });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Before")).toBeTruthy());
    const title = screen.getByLabelText("ノートタイトル");
    fireEvent.change(title, { target: { value: "Keyboard" } });
    fireEvent.keyDown(title, { key: "s", ctrlKey: true });
    fireEvent.keyDown(title, { key: "s", ctrlKey: true, repeat: true });
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(1));
    expect(mocks.updateDocument.mock.calls[0]![0]).toMatchObject({ title: "Keyboard", expected_revision: 0 });
  });

  it("flushes a dirty draft before switching Notes", async () => {
    const first = note("0199d090-0000-7000-8000-000000000004", "First", "one");
    const second = note("0199d090-0000-7000-8000-000000000005", "Second", "two");
    mocks.loadDocuments.mockResolvedValue({ documents: [summary(first), summary(second)] });
    mocks.loadDocument.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    mocks.updateDocument.mockResolvedValue({ document: note(first.document_id, "Local draft", "one", 1) });
    const confirm = vi.spyOn(window, "confirm");
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("First")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Local draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    await waitFor(() => expect(screen.getByDisplayValue("Second")).toBeTruthy());
    expect(mocks.updateDocument).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("preserves the local draft after a revision conflict and exposes canonical state", async () => {
    const current = note("0199d090-0000-7000-8000-000000000006", "Server", "server", 2);
    mocks.loadDocuments.mockResolvedValue({ documents: [summary(current)] });
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
    mocks.loadDocument.mockImplementation(async (documentId: string) => note(documentId, "notitle", "", 0));
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    await waitFor(() => expect(screen.getByText("保存結果を確認しました。")).toBeTruthy());
    const request = mocks.createStandaloneDocument.mock.calls[0]![0];
    expect(mocks.loadDocument).toHaveBeenCalledWith(request.document_id);
    expect(screen.queryByRole("button", { name: "同じ内容で再試行" })).toBeNull();
    expect(screen.getByLabelText("ノートタイトル")).not.toHaveProperty("disabled", true);
  });

  it("retains an ambiguous Create and retries the exact request when identity is absent", async () => {
    mocks.createStandaloneDocument.mockRejectedValue(ambiguousError());
    mocks.loadDocument.mockRejectedValue(missingError());
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const firstRequest = { ...mocks.createStandaloneDocument.mock.calls[0]![0] };
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.createStandaloneDocument).toHaveBeenCalledTimes(2));
    expect(mocks.createStandaloneDocument.mock.calls[1]![0]).toEqual(firstRequest);
  });

  it("blocks edits and navigation after an ambiguous Create without clearing the exact retry", async () => {
    mocks.createStandaloneDocument.mockRejectedValue(ambiguousError());
    mocks.loadDocument.mockRejectedValue(missingError());
    const onUnresolvedChange = vi.fn();
    const onRegisterFlush = vi.fn();
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} onUnresolvedChange={onUnresolvedChange} onRegisterFlush={onRegisterFlush} />);
    fireEvent.click(await screen.findByRole("button", { name: "＋ 新規ノート" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const firstRequest = { ...mocks.createStandaloneDocument.mock.calls[0]![0] };
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Changed" } });
    expect(screen.getByDisplayValue("notitle")).toBeTruthy();
    expect(screen.getByLabelText("ノートタイトル")).toHaveProperty("disabled", true);
    expect(onUnresolvedChange).toHaveBeenLastCalledWith(true);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const flush = onRegisterFlush.mock.calls.at(-1)?.[0] as (() => Promise<boolean>) | undefined;
    expect(await flush?.()).toBe(false);
    expect(mocks.createStandaloneDocument.mock.calls[0]![0]).toEqual(firstRequest);
  });

  it("reuses the exact ambiguous Update operation and restores editing after retry", async () => {
    const current = note("0199d090-0000-7000-8000-000000000007", "Before", "before", 2);
    const saved = note(current.document_id, "After", "after", 3);
    mocks.loadDocuments.mockResolvedValue({ documents: [summary(current)] });
    mocks.loadDocument.mockResolvedValueOnce(current).mockRejectedValueOnce(missingError());
    mocks.updateDocument.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ document: saved });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Before")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "After" } });
    fireEvent.change(screen.getByLabelText("Markdown本文"), { target: { value: "after" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const firstRequest = { ...mocks.updateDocument.mock.calls[0]![0] };
    expect(screen.getByLabelText("ノートタイトル")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.updateDocument).toHaveBeenCalledTimes(2));
    expect(mocks.updateDocument.mock.calls[1]![0]).toEqual(firstRequest);
    await waitFor(() => expect(screen.getByLabelText("ノートタイトル")).not.toHaveProperty("disabled", true));
  });

  it("keeps beforeunload protection active for an unresolved save", async () => {
    const current = note("0199d090-0000-7000-8000-000000000008", "Clean", "body", 1);
    mocks.loadDocuments.mockResolvedValue({ documents: [summary(current)] });
    mocks.loadDocument.mockResolvedValueOnce(current).mockRejectedValueOnce(missingError());
    mocks.updateDocument.mockRejectedValue(ambiguousError());
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Clean")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("ノートタイトル"), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("retains an ambiguous archive request and retries the exact operation", async () => {
    const active = note("0199d090-0000-7000-8000-00000000000c", "Archive me", "body", 2);
    const archived = note(active.document_id, active.title, active.markdown_body, 3, "2026-09-12T01:00:00.000Z");
    mocks.loadDocuments.mockImplementation(async ({ archived: showArchived = false } = {}) => ({
      documents: showArchived ? [summary(archived)] : (mocks.setStandaloneDocumentArchived.mock.calls.length >= 2 ? [] : [summary(active)]),
    }));
    mocks.loadDocument.mockResolvedValueOnce(active).mockRejectedValueOnce(missingError());
    mocks.setStandaloneDocumentArchived.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ document: archived });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Archive me")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Archive meの操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "アーカイブ" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const firstRequest = { ...mocks.setStandaloneDocumentArchived.mock.calls[0]![0] };
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.setStandaloneDocumentArchived).toHaveBeenCalledTimes(2));
    expect(mocks.setStandaloneDocumentArchived.mock.calls[1]![0]).toEqual(firstRequest);
    await waitFor(() => expect(screen.getByText("ノートを選択")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "同じ内容で再試行" })).toBeNull();
  });

  it("retains an ambiguous restore request and retries the exact operation", async () => {
    const active = note("0199d090-0000-7000-8000-00000000000d", "Active note", "body", 0);
    const archived = note("0199d090-0000-7000-8000-00000000000e", "Restore me", "body", 2, "2026-09-12T01:00:00.000Z");
    mocks.loadDocuments.mockImplementation(async ({ archived: showArchived = false } = {}) => ({
      documents: showArchived ? (mocks.setStandaloneDocumentArchived.mock.calls.length >= 2 ? [] : [summary(archived)]) : [summary(active)],
    }));
    mocks.loadDocument.mockImplementation(async (id: string) => id === archived.document_id ? archived : active);
    mocks.setStandaloneDocumentArchived.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ document: note(archived.document_id, archived.title, archived.markdown_body, 3, null) });
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Active note")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "アーカイブ" }));
    await waitFor(() => expect(screen.getByDisplayValue("Restore me")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Restore meの操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "復元" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const firstRequest = { ...mocks.setStandaloneDocumentArchived.mock.calls[0]![0] };
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.setStandaloneDocumentArchived).toHaveBeenCalledTimes(2));
    expect(mocks.setStandaloneDocumentArchived.mock.calls[1]![0]).toEqual(firstRequest);
    await waitFor(() => expect(screen.getByText("アーカイブを選択")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "同じ内容で再試行" })).toBeNull();
  });

  it("retains an ambiguous delete request when the exact Document is gone and retries it", async () => {
    const active = note("0199d090-0000-7000-8000-00000000000f", "Delete me", "body", 1);
    mocks.loadDocuments.mockImplementation(async () => ({
      documents: mocks.deleteStandaloneDocument.mock.calls.length >= 2 ? [] : [summary(active)],
    }));
    mocks.loadDocument.mockResolvedValueOnce(active).mockRejectedValueOnce(missingError());
    mocks.deleteStandaloneDocument.mockRejectedValueOnce(ambiguousError()).mockResolvedValueOnce({ document_id: active.document_id, deleted: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Delete me")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Delete meの操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "削除" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    const firstRequest = { ...mocks.deleteStandaloneDocument.mock.calls[0]![0] };
    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再試行" }));
    await waitFor(() => expect(mocks.deleteStandaloneDocument).toHaveBeenCalledTimes(2));
    expect(mocks.deleteStandaloneDocument.mock.calls[1]![0]).toEqual(firstRequest);
    await waitFor(() => expect(screen.getByText("ノートを選択")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "同じ内容で再試行" })).toBeNull();
    vi.restoreAllMocks();
  });

  it("blocks a replacement lifecycle operation while an ambiguous request is unresolved", async () => {
    const active = note("0199d090-0000-7000-8000-000000000010", "Blocked lifecycle", "body", 0);
    mocks.loadDocuments.mockResolvedValue({ documents: [summary(active)] });
    mocks.loadDocument.mockResolvedValueOnce(active).mockRejectedValueOnce(missingError());
    mocks.setStandaloneDocumentArchived.mockRejectedValue(ambiguousError());
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Blocked lifecycle")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Blocked lifecycleの操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "アーカイブ" }));
    await screen.findByRole("button", { name: "同じ内容で再試行" });
    fireEvent.click(screen.getByRole("button", { name: "Blocked lifecycleの操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "アーカイブ" }));
    expect(mocks.setStandaloneDocumentArchived).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("未確定");
  });

  it("supports archive view, archive/restore, and explicit irreversible delete", async () => {
    const active = note("0199d090-0000-7000-8000-000000000009", "Active", "body", 0);
    const archived = note("0199d090-0000-7000-8000-00000000000a", "Archived", "body", 2, "2026-09-11T00:00:00.000Z");
    mocks.loadDocuments.mockImplementation(({ archived: showArchived = false } = {}) => ({ documents: showArchived ? [summary(archived)] : [summary(active)] }));
    mocks.loadDocument.mockImplementation(async (id: string) => id === archived.document_id ? archived : active);
    mocks.setStandaloneDocumentArchived.mockResolvedValue({ document: note(active.document_id, "Active", "body", 1, "2026-09-12T00:00:00.000Z") });
    mocks.deleteStandaloneDocument.mockResolvedValue({ document_id: archived.document_id, deleted: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NotesBoard onUnauthorized={vi.fn()} onDirtyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByDisplayValue("Active")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Activeの操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "アーカイブ" }));
    await waitFor(() => expect(mocks.setStandaloneDocumentArchived).toHaveBeenCalledWith(expect.objectContaining({ document_id: active.document_id, archived: true })));
    fireEvent.click(screen.getByRole("button", { name: "アーカイブ" }));
    await waitFor(() => expect(screen.getByDisplayValue("Archived")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Archivedの操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "削除" }));
    await waitFor(() => expect(mocks.deleteStandaloneDocument).toHaveBeenCalledWith(expect.objectContaining({ document_id: archived.document_id })));
  });
});
