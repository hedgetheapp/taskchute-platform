import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteIcon } from "../../src/web/NoteIcon";
import { api, ApiClientError } from "../../src/web/api";
import {
  NoteMarkdownEditor,
  NOTE_LINE_NUMBERING_STORAGE_KEY,
  readNoteLineNumberingPreference,
} from "../../src/web/NoteMarkdownEditor";
import {
  activeInternalLinkQuery,
  applyMarkdownCommand,
  insertInternalLinkTrigger,
  internalMarkdownLink,
} from "../../src/web/note-markdown-commands";
import {
  clampTaskNotePeekWidth,
  defaultTaskNotePeekWidth,
  maxTaskNotePeekWidth,
  readTaskNotePeekWidth,
  resizeTaskNotePeekWidth,
  TASK_NOTE_PEEK_MIN_WIDTH,
  TASK_NOTE_PEEK_WIDTH_STORAGE_KEY,
} from "../../src/web/task-note-peek-width";

const noteCandidate = {
  document_id: "0199d187-0000-7000-8000-000000000001",
  kind: "standalone" as const,
  label: "A [note]",
  context: "Project A",
  archived: true,
  logical_date: null,
};

function ControlledEditor({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <NoteMarkdownEditor value={value} onChange={(next) => setValue(next)} documentSessionKey="controlled-note" />;
}

describe("NoteMarkdownEditor and shared Note UI helpers", () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  afterEach(() => vi.restoreAllMocks());

  it("applies formatting to raw source while preserving line endings and Setext boundaries", () => {
    const bold = applyMarkdownCommand("before text after", { start: 7, end: 11, direction: "backward" }, { kind: "bold" });
    expect(bold).toEqual({ text: "before **text** after", selection: { start: 9, end: 13, direction: "backward" } });
    const checklist = applyMarkdownCommand("one\r\ntwo", { start: 0, end: 8 }, { kind: "checkbox" });
    expect(checklist.text).toBe("- [ ] one\r\n- [ ] two");
    const rule = applyMarkdownCommand("Title\n---", { start: 9, end: 9 }, { kind: "horizontal-rule" });
    expect(rule.text).toBe("Title\n---\n---");
    const moved = applyMarkdownCommand("a\n\nb", { start: 4, end: 4 }, { kind: "move-line", direction: "up" });
    expect(moved.text).toBe("a\nb\n");
  });

  it("covers each remaining formatting command as a raw-source transformation", () => {
    expect(applyMarkdownCommand("title", { start: 0, end: 5 }, { kind: "heading", level: 3 }).text).toBe("### title");
    expect(applyMarkdownCommand("item", { start: 0, end: 4 }, { kind: "bullet" }).text).toBe("- item");
    expect(applyMarkdownCommand("item", { start: 0, end: 4 }, { kind: "checkbox" }).text).toBe("- [ ] item");
    expect(applyMarkdownCommand("quote", { start: 0, end: 5 }, { kind: "quote" }).text).toBe("> quote");
    expect(applyMarkdownCommand("label", { start: 0, end: 5 }, { kind: "link" })).toEqual({
      text: "[label](https://)", selection: { start: 8, end: 16, direction: "forward" },
    });
    expect(applyMarkdownCommand("", { start: 0, end: 0 }, { kind: "horizontal-rule" }).text).toBe("---");
    expect(applyMarkdownCommand("item", { start: 0, end: 4 }, { kind: "indent" }).text).toBe("  item");
    expect(applyMarkdownCommand("  item", { start: 0, end: 6 }, { kind: "outdent" }).text).toBe("item");
    expect(applyMarkdownCommand("one\ntwo", { start: 0, end: 7 }, { kind: "ordered-list" }).text).toBe("1. one\n2. two");
    expect(applyMarkdownCommand("one\ntwo", { start: 0, end: 0 }, { kind: "move-line", direction: "down" }).text).toBe("two\none");
  });

  it("inserts internal links with the D-186 stable routes and escapes labels", () => {
    expect(internalMarkdownLink(noteCandidate)).toBe("[A \\[note\\]](/?view=note&document=0199d187-0000-7000-8000-000000000001)");
    expect(internalMarkdownLink({ ...noteCandidate, kind: "task_primary" })).toContain("/?view=note&document=0199d187-0000-7000-8000-000000000001");
    expect(internalMarkdownLink({ ...noteCandidate, kind: "project_primary" })).toContain("/?view=note&document=0199d187-0000-7000-8000-000000000001");
    expect(internalMarkdownLink({ ...noteCandidate, kind: "daily_primary", logical_date: "2026-10-26" })).toBe("[2026-10-26](/?view=daily&date=2026-10-26)");
    expect(internalMarkdownLink({ ...noteCandidate, kind: "daily_primary", logical_date: "2026-02-30" })).toBeNull();
  });

  it("keeps textarea selection and focus when a toolbar command wraps selected source", () => {
    render(<ControlledEditor initialValue="hello" />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 5, "backward");
    fireEvent.select(textarea);
    const bold = screen.getByRole("button", { name: "太字" });
    fireEvent.mouseDown(bold);
    fireEvent.click(bold);
    return waitFor(() => {
      expect(textarea.value).toBe("**hello**");
      expect(textarea.selectionStart).toBe(2);
      expect(textarea.selectionEnd).toBe(7);
      expect(textarea.selectionDirection).toBe("backward");
      expect(document.activeElement).toBe(textarea);
    });
  });

  it("retains an unresolved toolbar marker while the parent has not echoed the changed source yet", async () => {
    function EditorWithPendingState() {
      const [pending, setPending] = useState(false);
      const [value, setValue] = useState("body");
      return <>
        <NoteMarkdownEditor value={value} onChange={(next) => { window.setTimeout(() => setValue(next), 0); }} onUnresolvedInternalLinkChange={setPending} />
        <output>{pending ? "pending" : "clear"}</output>
      </>;
    }
    render(<EditorWithPendingState />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.click(screen.getByRole("button", { name: "内部リンクを挿入" }));
    expect(await screen.findByText("pending")).toBeTruthy();
    await waitFor(() => expect(textarea.value).toBe("body[[]]"));
    expect(screen.getByText(/内部リンク候補を選択するか/)).toBeTruthy();
  });

  it("debounces candidate search, consumes only the matching closing marker, and keeps later source", async () => {
    vi.spyOn(api, "searchInternalDocumentLinks").mockResolvedValue({ candidates: [noteCandidate], next_cursor: null });
    render(<ControlledEditor initialValue="before " />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(7, 7);
    fireEvent.click(screen.getByRole("button", { name: "内部リンクを挿入" }));
    fireEvent.change(textarea, { target: { value: "before [[Atlas]] after ]]" } });
    textarea.setSelectionRange(14, 14);
    fireEvent.select(textarea);
    expect(await screen.findByRole("button", { name: /A \[note\]/ })).toBeTruthy();
    expect(api.searchInternalDocumentLinks).toHaveBeenCalledWith("Atlas", null, expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: /A \[note\]/ }));
    expect(textarea.value).toBe("before [A \\[note\\]](/?view=note&document=0199d187-0000-7000-8000-000000000001) after ]]");
  });

  it("does not search during IME composition and reports search authentication errors separately", async () => {
    const search = vi.spyOn(api, "searchInternalDocumentLinks").mockRejectedValue(new ApiClientError("expired", 401, false, "unauthenticated"));
    const onSearchUnauthorized = vi.fn();
    render(<NoteMarkdownEditor value="" onChange={() => {}} onSearchUnauthorized={onSearchUnauthorized} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: "[[かな" } });
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(search).not.toHaveBeenCalled();
    fireEvent.compositionEnd(textarea);
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("alert")).textContent).toContain("認証が切れています");
    expect(onSearchUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("cancels stale search results when the query changes", async () => {
    let resolveFirst!: (page: { candidates: typeof noteCandidate[]; next_cursor: string | null }) => void;
    const search = vi.spyOn(api, "searchInternalDocumentLinks").mockImplementation((query) => query === "A"
      ? new Promise((resolve) => { resolveFirst = resolve; })
      : Promise.resolve({ candidates: [{ ...noteCandidate, label: "Beta" }], next_cursor: null }));
    render(<ControlledEditor />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "[[A" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("A", null, expect.any(AbortSignal)));
    fireEvent.change(textarea, { target: { value: "[[B" } });
    await screen.findByRole("button", { name: /Beta/ });
    resolveFirst({ candidates: [noteCandidate], next_cursor: null });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(screen.queryByRole("button", { name: /A \[note\]/ })).toBeNull();
  });

  it("loads the next bounded candidate page without losing the active query", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...noteCandidate,
      document_id: `0199d187-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
      label: `Candidate ${index + 1}`,
    }));
    const search = vi.spyOn(api, "searchInternalDocumentLinks").mockImplementation((_query, cursor) => cursor
      ? Promise.resolve({ candidates: [{ ...noteCandidate, label: "Next page target" }], next_cursor: null })
      : Promise.resolve({ candidates: firstPage, next_cursor: "next-page" }));
    render(<ControlledEditor />);
    fireEvent.change(screen.getByRole("textbox", { name: "Markdown本文" }), { target: { value: "[[Atlas" } });
    expect(await screen.findByRole("button", { name: /^Candidate 1 通常ノート/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "さらに候補を表示" }));
    expect(await screen.findByRole("button", { name: /Next page target/ })).toBeTruthy();
    expect(search).toHaveBeenNthCalledWith(1, "Atlas", null, expect.any(AbortSignal));
    expect(search).toHaveBeenNthCalledWith(2, "Atlas", "next-page", expect.any(AbortSignal));
  });

  it("keeps a search 404 local to the candidate picker", async () => {
    vi.spyOn(api, "searchInternalDocumentLinks").mockRejectedValue(new ApiClientError("route missing", 404, false, "resource_not_found"));
    const onSearchUnauthorized = vi.fn();
    render(<NoteMarkdownEditor value="" onChange={() => {}} onSearchUnauthorized={onSearchUnauthorized} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Markdown本文" }), { target: { value: "[[Missing" } });
    expect((await screen.findByRole("alert")).textContent).toContain("内部リンク検索を利用できません");
    expect(onSearchUnauthorized).not.toHaveBeenCalled();
  });

  it("uses one line-number editor surface and synchronizes the browser-local preference", () => {
    render(<>
      <NoteMarkdownEditor value={"one\ntwo"} onChange={() => {}} />
      <NoteMarkdownEditor value="three" onChange={() => {}} />
    </>);
    expect(document.querySelectorAll("[data-note-markdown-editor='true']")).toHaveLength(2);
    expect(document.querySelectorAll(".notes-line-numbers")).toHaveLength(2);
    const toggles = screen.getAllByRole("checkbox", { name: "行番号を表示" });
    fireEvent.click(toggles[0]!);
    expect(toggles[0]).toHaveProperty("checked", false);
    expect(toggles[1]).toHaveProperty("checked", false);
    expect(JSON.parse(localStorage.getItem(NOTE_LINE_NUMBERING_STORAGE_KEY)!)).toEqual({ version: 1, enabled: false });
  });

  it("falls back safely for malformed line-number preference", () => {
    localStorage.setItem(NOTE_LINE_NUMBERING_STORAGE_KEY, "not-json");
    expect(readNoteLineNumberingPreference()).toBe(true);
    localStorage.setItem(NOTE_LINE_NUMBERING_STORAGE_KEY, JSON.stringify({ version: 99, enabled: false }));
    expect(readNoteLineNumberingPreference()).toBe(true);
  });

  it("uses the same Note/Document SVG geometry for absent and present states", () => {
    render(<>
      <button data-note-state="absent"><NoteIcon /></button>
      <button data-note-state="present"><NoteIcon /></button>
    </>);
    const icons = Array.from(document.querySelectorAll("svg.task-note-icon"));
    expect(icons).toHaveLength(2);
    expect(icons[0]!.outerHTML).toBe(icons[1]!.outerHTML);
    expect(document.querySelector("[data-note-state='absent']")).toBeTruthy();
    expect(document.querySelector("[data-note-state='present']")).toBeTruthy();
    expect(document.body.textContent).not.toContain("▱");
  });

  it("reads, clamps, and preserves preferred peek widths", () => {
    expect(defaultTaskNotePeekWidth(1000)).toBe(420);
    expect(defaultTaskNotePeekWidth(2000)).toBe(680);
    expect(clampTaskNotePeekWidth(900, 700)).toBe(668);
    expect(maxTaskNotePeekWidth(700)).toBe(668);
    localStorage.setItem(TASK_NOTE_PEEK_WIDTH_STORAGE_KEY, JSON.stringify({ version: 1, width: 900 }));
    expect(readTaskNotePeekWidth()).toBe(900);
    expect(clampTaskNotePeekWidth(readTaskNotePeekWidth(), 700)).toBe(668);
    expect(readTaskNotePeekWidth()).toBe(900);
    localStorage.setItem(TASK_NOTE_PEEK_WIDTH_STORAGE_KEY, "{bad");
    expect(readTaskNotePeekWidth()).toBe(defaultTaskNotePeekWidth(window.innerWidth));
    expect(clampTaskNotePeekWidth(-1, 1000)).toBe(defaultTaskNotePeekWidth(1000));
    expect(clampTaskNotePeekWidth(1, 1000)).toBe(TASK_NOTE_PEEK_MIN_WIDTH);
  });

  it("maps keyboard resize keys to bounded preferred widths", () => {
    expect(resizeTaskNotePeekWidth(500, 1200, "ArrowLeft")).toBe(524);
    expect(resizeTaskNotePeekWidth(500, 1200, "ArrowRight")).toBe(476);
    expect(resizeTaskNotePeekWidth(500, 1200, "ArrowLeft", true)).toBe(580);
    expect(resizeTaskNotePeekWidth(500, 1200, "ArrowRight", true)).toBe(420);
    expect(resizeTaskNotePeekWidth(500, 1200, "Home")).toBe(360);
    expect(resizeTaskNotePeekWidth(500, 1200, "End")).toBe(1168);
    expect(resizeTaskNotePeekWidth(500, 1200, "F")).toBeNull();
  });
});
