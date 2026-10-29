import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  createNoteMarkdownPreviewLines,
  isSafeMarkdownPreviewDestination,
  parseNoteMarkdownPreviewSource,
  projectNoteMarkdownPreviewSelection,
} from "../../src/web/note-markdown-preview";
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

function mockPreviewGeometry(overflowingLineIndexes: Set<number>) {
  const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, right: left + width, bottom: top + height, width, height,
    toJSON: () => ({}),
  } as DOMRect);
  const getBoundingClientRectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const row = this.closest<HTMLElement>(".note-markdown-preview-line");
    const lineIndex = Number(row?.dataset.lineIndex ?? -1);
    const top = Math.max(0, lineIndex) * 24;
    if (this.classList.contains("note-markdown-preview-layout")) return rect(0, top, 240, 24);
    if (this.classList.contains("note-markdown-preview-rendered")) return rect(8, top, 224, 24);
    return rect(0, top, 240, 24);
  });
  const getClientRectsSpy = vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    const row = this.closest<HTMLElement>(".note-markdown-preview-line");
    const lineIndex = Number(row?.dataset.lineIndex ?? -1);
    const top = Math.max(0, lineIndex) * 24;
    const rects = overflowingLineIndexes.has(lineIndex)
      ? [rect(8, top, 40, 18), rect(8, top + 20, 40, 18)]
      : [rect(8, top, 40, 18)];
    return rects as unknown as DOMRectList;
  });
  return { getBoundingClientRectSpy, getClientRectsSpy };
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

  it("builds safe inline preview rows while preserving source, active rows, Setext headings, and markers", () => {
    const source = [
      "---",
      "**bold**",
      "## Heading",
      "- [x] done",
      "> quote",
      "1. item",
      "[A \\[note\\]](/?view=note&document=0199d187-0000-7000-8000-000000000001)",
      "Title",
      "---",
    ].join("\n");
    const lines = createNoteMarkdownPreviewLines(source, { start: source.indexOf("bold"), end: source.indexOf("bold") });

    expect(lines.map((line) => line.kind)).toEqual([
      "horizontal-rule", "source", "heading", "task-list", "quote", "ordered-list", "source", "setext-heading", "setext-underline",
    ]);
    expect(lines[0]?.displayText).toBe("");
    expect(lines[1]).toMatchObject({ active: true, displayText: "**bold**" });
    expect(lines[2]).toMatchObject({ sourceFallback: false, displayText: "Heading" });
    expect(lines[3]).toMatchObject({ sourceFallback: false, displayText: "☑ done" });
    expect(lines[4]).toMatchObject({ sourceFallback: false, displayText: "quote" });
    expect(lines[5]).toMatchObject({ sourceFallback: false, displayText: "1. item" });
    expect(lines[6]?.displayText).toBe("A [note]");
    expect(lines[7]?.displayText).toBe("Title");
    expect(lines[8]?.displayText).toBe("");
    expect(source).toContain("**bold**");
  });

  it("keeps raw/unsupported Markdown visible and preserves source boundaries over LF/CRLF", () => {
    const link = "[A \\[note\\]](/?view=note&document=0199d187-0000-7000-8000-000000000001)";
    const malicious = "[bad](javascript:alert(1)) <img src=x onerror=alert(1)>";
    const source = `first\r\n${link}\r\n${malicious}\n\n`;
    const lines = createNoteMarkdownPreviewLines(source, { start: 0, end: 0 });
    const linkLine = lines[1]!;

    expect(lines).toHaveLength(5);
    expect(lines.map((line) => line.sourceStart)).toEqual([0, 7, 7 + link.length + 2, 7 + link.length + 2 + malicious.length + 1, source.length]);
    expect(linkLine.displayText).toBe("A [note]");
    expect(lines[2]?.displayText).toBe(malicious);
    expect(lines[3]?.sourceText).toBe("");
    expect(lines[4]?.sourceText).toBe("");
    expect(createNoteMarkdownPreviewLines("```md\n**raw**\n```", { start: 0, end: 0 })[1]?.displayText).toBe("**raw**");
  });

  it("activates every selection-touched row, including reverse ranges and a terminal blank row", () => {
    const source = "first\r\nsecond\nthird\n";
    const reversed = createNoteMarkdownPreviewLines(source, { start: 19, end: 8 });
    expect(reversed.map((line) => line.active)).toEqual([false, true, true, false]);
    const atTerminalBlank = createNoteMarkdownPreviewLines(source, { start: source.length, end: source.length });
    expect(atTerminalBlank.map((line) => line.active)).toEqual([false, false, false, true]);
  });

  it("preserves nesting and keeps unsupported images, tables, and malformed syntax raw", () => {
    const source = ["  - nested", "10. numbered", "![image](https://example.com/image.png)", "| cell | **bold** |", "**unclosed"].join("\n");
    const lines = createNoteMarkdownPreviewLines(source, { start: source.length, end: source.length });
    expect(lines[0]).toMatchObject({ sourceFallback: false, displayText: "  • nested" });
    expect(lines[1]?.displayText).toBe("10. numbered");
    expect(lines[2]?.kind).toBe("source");
    expect(lines[2]?.displayText).toBe("![image](https://example.com/image.png)");
    expect(lines[3]?.displayText).toBe("| cell | **bold** |");
    expect(lines[4]?.displayText).toBe("**unclosed");
  });

  it("keeps escaped and adjacent bold delimiter runs raw instead of stripping source characters", () => {
    for (const source of ["**a\\** b**", "**first****second**", "**unclosed"]) {
      const line = createNoteMarkdownPreviewLines(`before\n${source}`, { start: 0, end: 0 })[1]!;
      expect(line.displayText).toBe(source);
      expect(line.segments.every((segment) => segment.kind === "text")).toBe(true);
    }
    expect(createNoteMarkdownPreviewLines("before\n**plain bold**", { start: 0, end: 0 })[1]?.displayText).toBe("plain bold");
  });

  it("parses balanced link destination parentheses and leaves malformed links raw", () => {
    const nested = "[hi](https://a.com/path(with(nested)))";
    const malformed = "[hi](https://a.com/path(with)";
    expect(createNoteMarkdownPreviewLines(`before\n${nested}`, { start: 0, end: 0 })[1]?.displayText).toBe("hi");
    expect(createNoteMarkdownPreviewLines(`before\n${malformed}`, { start: 0, end: 0 })[1]?.displayText).toBe(malformed);
  });

  it("keeps inactive Markdown styled by default until a browser measures overflow", () => {
    // JSDOM has no layout engine. The browser-measurement component test below covers row-local fallback.
    const fixtures = [
      "## **長い日本語の見出し with ASCII words that may wrap after bold styling**",
      "> 引用文の日本語と ASCII words mixed together with enough text to wrap",
      "**長い太字の日本語と ASCII words mixed together with enough text to wrap**",
    ];
    for (const source of fixtures) {
      const line = createNoteMarkdownPreviewLines(`before\n${source}`, { start: 0, end: 0 })[1]!;
      expect(line.sourceFallback).toBe(false);
      expect(line.displayText).not.toBe(source);
    }
  });

  it("projects caret changes from a cached parse and reuses unchanged rows in a large note", () => {
    const source = Array.from({ length: 2_000 }, (_, index) => `row ${index} with **bold** and https://example.com`).join("\n");
    const parsed = parseNoteMarkdownPreviewSource(source);
    const first = projectNoteMarkdownPreviewSelection(parsed, { start: 0, end: 0 });
    const laterOffset = source.indexOf("row 1000");
    const moved = projectNoteMarkdownPreviewSelection(parsed, { start: laterOffset, end: laterOffset });

    expect(moved[1]).toBe(first[1]);
    expect(moved[1_999]).toBe(first[1_999]);
    expect(moved[0]?.active).toBe(false);
    expect(moved[1_000]?.active).toBe(true);
    expect(parsed.lines[0]?.sourceFallback).toBe(false);
  });

  it("allows only HTTP(S) and exact valid D-186 internal preview destinations", () => {
    expect(isSafeMarkdownPreviewDestination("https://example.com/path")).toBe(true);
    expect(isSafeMarkdownPreviewDestination("/?view=note&document=0199d187-0000-7000-8000-000000000001")).toBe(true);
    expect(isSafeMarkdownPreviewDestination("/?view=daily&date=2026-10-27")).toBe(true);
    for (const destination of [
      "javascript:alert(1)", "data:text/html,x", "file:///tmp/a", "//example.com/x",
      "/?view=note&document=not-a-uuid", "/?view=daily&date=2026-02-30", "https://user:pass@example.com",
    ]) expect(isSafeMarkdownPreviewDestination(destination)).toBe(false);
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

  it("renders preview through escaped, non-interactive nodes without changing source or firing save callbacks", () => {
    const source = "## Heading\n**bold**\n- [ ] task\n<script>alert(1)</script>\n[unsafe](javascript:alert(1))";
    const onChange = vi.fn();
    const { container } = render(<NoteMarkdownEditor value={source} onChange={onChange} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    const preview = container.querySelector(".note-markdown-preview-scroll") as HTMLElement;
    const rows = Array.from(container.querySelectorAll(".note-markdown-preview-line"));

    expect(textarea.value).toBe(source);
    expect(preview.getAttribute("aria-hidden")).toBe("true");
    expect(rows[0]?.className).toContain("is-active");
    expect(rows[0]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("## Heading");
    expect(rows[1]?.className).toContain("is-source-fallback");
    expect(rows[1]?.querySelector(".note-markdown-preview-rendered:not(.note-markdown-preview-measurement)")?.textContent).toBe("**bold**");
    expect(rows[2]?.className).toContain("is-source-fallback");
    expect(rows[2]?.querySelector(".note-markdown-preview-rendered:not(.note-markdown-preview-measurement)")?.textContent).toBe("- [ ] task");
    expect(rows[3]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("<script>alert(1)</script>");
    expect(preview.querySelector("script, a, button, input")).toBeNull();
    expect(rows[4]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("[unsafe](javascript:alert(1))");
    expect(onChange).not.toHaveBeenCalled();

    const selectionEnd = source.indexOf("task") + 2;
    textarea.focus();
    textarea.setSelectionRange(3, selectionEnd, "backward");
    fireEvent.select(textarea);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionDirection).toBe("backward");
    expect(rows.slice(0, 3).every((row) => row.className.includes("is-active"))).toBe(true);
    expect(rows[3]?.className).not.toContain("is-active");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("falls back only overflowing inactive rows and restores styled preview after resize", async () => {
    const overflowingLines = new Set([1]);
    mockPreviewGeometry(overflowingLines);
    const source = "active\n## **overflowing heading**\n**fits**";
    const onChange = vi.fn();
    const { container } = render(<NoteMarkdownEditor value={source} onChange={onChange} />);
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".note-markdown-preview-line"));

    await waitFor(() => expect(rows[1]?.className).toContain("is-source-fallback"));
    expect(rows[1]?.querySelector(".note-markdown-preview-measurement")?.textContent).toBe("overflowing heading");
    expect(rows[2]?.className).not.toContain("is-source-fallback");
    expect(rows[2]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("fits");
    expect(onChange).not.toHaveBeenCalled();

    overflowingLines.clear();
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(rows[1]?.className).not.toContain("is-source-fallback"));
    expect(rows[1]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("overflowing heading");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("records preview geometry reads for same-row and changed-row caret moves across 500 rows", () => {
    const rowCount = 500;
    const geometry = mockPreviewGeometry(new Set());
    const source = Array.from({ length: rowCount }, (_, index) => `row ${index} with **bold** text`).join("\n");
    render(<NoteMarkdownEditor value={source} onChange={() => {}} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    const initialRectReads = geometry.getBoundingClientRectSpy.mock.calls.length;
    const initialClientRectReads = geometry.getClientRectsSpy.mock.calls.length;

    textarea.setSelectionRange(1, 1);
    fireEvent.select(textarea);
    const afterSameRowRectReads = geometry.getBoundingClientRectSpy.mock.calls.length;
    const afterSameRowClientRectReads = geometry.getClientRectsSpy.mock.calls.length;

    const changedRowOffset = source.indexOf("row 250");
    textarea.setSelectionRange(changedRowOffset, changedRowOffset);
    fireEvent.select(textarea);
    const finalRectReads = geometry.getBoundingClientRectSpy.mock.calls.length;
    const finalClientRectReads = geometry.getClientRectsSpy.mock.calls.length;

    expect(initialRectReads).toBeGreaterThan(rowCount);
    expect(afterSameRowRectReads - initialRectReads).toBe(0);
    expect(afterSameRowClientRectReads - initialClientRectReads).toBe(0);
    expect(finalRectReads - afterSameRowRectReads).toBeGreaterThan(0);
    expect(finalClientRectReads - afterSameRowClientRectReads).toBeGreaterThan(0);
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

  it("keeps inactive preview visible during IME composition and discards cancelled provisional text", async () => {
    mockPreviewGeometry(new Set());
    const source = "**inactive**\n**active**";
    const onChange = vi.fn();
    const { container } = render(<NoteMarkdownEditor value={source} onChange={onChange} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    const activeOffset = source.indexOf("active") + 2;
    textarea.setSelectionRange(activeOffset, activeOffset);
    fireEvent.select(textarea);

    fireEvent.compositionStart(textarea);
    const provisional = "**inactive**\n**activeかな**";
    fireEvent.change(textarea, { target: { value: provisional } });
    textarea.setSelectionRange(provisional.length - 2, provisional.length - 2);
    fireEvent.select(textarea);
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".note-markdown-preview-line"));
    expect(textarea.closest(".note-markdown-editor")?.className).toContain("is-composing");
    expect(textarea.value).toBe(provisional);
    expect(rows[0]?.className).not.toContain("is-active");
    expect(rows[0]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("inactive");
    expect(rows[1]?.className).toContain("is-active");
    expect(rows[1]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("**activeかな**");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: source } });
    textarea.setSelectionRange(activeOffset, activeOffset);
    fireEvent.select(textarea);
    fireEvent.compositionEnd(textarea);
    await waitFor(() => expect(textarea.closest(".note-markdown-editor")?.className).not.toContain("is-composing"));
    expect(textarea.value).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps an IME draft when the parent echoes the preceding edit during composition", async () => {
    mockPreviewGeometry(new Set());
    const prefix = "**inactive**\n";
    const sourceA = prefix + "old";
    const sourceB = prefix + "[[ab";
    const sourceC = prefix + "[[abcかな";
    const onChange = vi.fn();
    const onUnresolved = vi.fn();
    const props = { onChange, onUnresolvedInternalLinkChange: onUnresolved, documentSessionKey: "ime-parent-echo-race" };
    const { container, rerender } = render(<NoteMarkdownEditor value={sourceA} {...props} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, { target: { value: sourceB } });
      textarea.setSelectionRange(sourceB.length, sourceB.length);
      fireEvent.select(textarea);
      fireEvent.compositionStart(textarea);
      fireEvent.change(textarea, { target: { value: sourceC } });
      textarea.setSelectionRange(sourceC.length, sourceC.length);
      fireEvent.select(textarea);
    });
    expect(onChange).toHaveBeenNthCalledWith(1, sourceB, true);
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(<NoteMarkdownEditor value={sourceB} {...props} />);
    await waitFor(() => expect(textarea.value).toBe(sourceC));
    expect(textarea.closest(".note-markdown-editor")?.className).toContain("is-composing");
    expect(textarea.selectionStart).toBe(sourceC.length);
    expect(textarea.selectionEnd).toBe(sourceC.length);
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".note-markdown-preview-line"));
    expect(rows[0]?.className).not.toContain("is-active");
    expect(rows[0]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("inactive");
    expect(rows[1]?.className).toContain("is-active");
    expect(rows[1]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("[[abcかな");
    expect(onUnresolved.mock.calls.map(([value]) => value)).toEqual([true]);

    fireEvent.compositionEnd(textarea);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenNthCalledWith(2, sourceC, true);
    expect(onUnresolved.mock.calls.map(([value]) => value)).toEqual([true, true]);
    expect(textarea.selectionStart).toBe(sourceC.length);
    expect(textarea.selectionEnd).toBe(sourceC.length);

    rerender(<NoteMarkdownEditor value={sourceC} {...props} />);
    await waitFor(() => expect(textarea.value).toBe(sourceC));
    expect(textarea.selectionStart).toBe(sourceC.length);
    expect(textarea.selectionEnd).toBe(sourceC.length);
    expect(textarea.closest(".note-markdown-editor")?.className).not.toContain("is-composing");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("keeps finalized IME text when an earlier parent echo arrives before the final echo", async () => {
    mockPreviewGeometry(new Set());
    const prefix = "**inactive**\n";
    const sourceA = prefix + "old";
    const sourceB = prefix + "[[ab";
    const sourceC = prefix + "[[abcかな";
    const onChange = vi.fn();
    const onUnresolved = vi.fn();
    const props = { onChange, onUnresolvedInternalLinkChange: onUnresolved, documentSessionKey: "ime-post-composition-stale-echo" };
    const { container, rerender } = render(<NoteMarkdownEditor value={sourceA} {...props} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, { target: { value: sourceB } });
      textarea.setSelectionRange(sourceB.length, sourceB.length);
      fireEvent.select(textarea);
      fireEvent.compositionStart(textarea);
      fireEvent.change(textarea, { target: { value: sourceC } });
      textarea.setSelectionRange(sourceC.length, sourceC.length);
      fireEvent.select(textarea);
    });
    expect(onChange).toHaveBeenNthCalledWith(1, sourceB, true);

    fireEvent.compositionEnd(textarea);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenNthCalledWith(2, sourceC, true);
    expect(textarea.selectionStart).toBe(sourceC.length);
    expect(textarea.selectionEnd).toBe(sourceC.length);

    rerender(<NoteMarkdownEditor value={sourceB} {...props} />);
    await waitFor(() => expect(textarea.value).toBe(sourceC));
    expect(textarea.selectionStart).toBe(sourceC.length);
    expect(textarea.selectionEnd).toBe(sourceC.length);
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".note-markdown-preview-line"));
    expect(rows[0]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("inactive");
    expect(rows[1]?.querySelector(".note-markdown-preview-rendered")?.textContent).toBe("[[abcかな");
    expect(onUnresolved.mock.calls.map(([value]) => value)).toEqual([true, true]);
    expect(onChange).toHaveBeenCalledTimes(2);

    rerender(<NoteMarkdownEditor value={sourceC} {...props} />);
    await waitFor(() => expect(textarea.value).toBe(sourceC));
    expect(textarea.selectionStart).toBe(sourceC.length);
    expect(textarea.selectionEnd).toBe(sourceC.length);
    expect(onUnresolved.mock.calls.map(([value]) => value)).toEqual([true, true]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("drops a cancelled IME draft after the delayed parent echo without saving it", async () => {
    const sourceA = "**inactive**\nold";
    const sourceB = "**inactive**\nB";
    const sourceC = "**inactive**\nBかな";
    const onChange = vi.fn();
    const props = { onChange, documentSessionKey: "ime-parent-echo-cancel" };
    const { rerender } = render(<NoteMarkdownEditor value={sourceA} {...props} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, { target: { value: sourceB } });
      textarea.setSelectionRange(sourceB.length, sourceB.length);
      fireEvent.select(textarea);
      fireEvent.compositionStart(textarea);
      fireEvent.change(textarea, { target: { value: sourceC } });
      textarea.setSelectionRange(sourceC.length, sourceC.length);
      fireEvent.select(textarea);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenNthCalledWith(1, sourceB, false);

    act(() => {
      fireEvent.change(textarea, { target: { value: sourceB } });
      textarea.setSelectionRange(sourceB.length, sourceB.length);
      fireEvent.select(textarea);
    });
    fireEvent.compositionEnd(textarea);
    await waitFor(() => expect(textarea.closest(".note-markdown-editor")?.className).not.toContain("is-composing"));
    expect(textarea.value).toBe(sourceB);

    rerender(<NoteMarkdownEditor value={sourceB} {...props} />);
    await waitFor(() => expect(textarea.value).toBe(sourceB));

    expect(textarea.value).toBe(sourceB);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith(sourceC, expect.anything());
  });

  it("does not mistake a different external source for the delayed self echo", async () => {
    const onChange = vi.fn();
    const props = { onChange, documentSessionKey: "ime-external-update" };
    const { rerender } = render(<NoteMarkdownEditor value="A" {...props} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, { target: { value: "B" } });
      fireEvent.compositionStart(textarea);
      fireEvent.change(textarea, { target: { value: "Bかな" } });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenNthCalledWith(1, "B", false);

    rerender(<NoteMarkdownEditor value="external source" {...props} />);
    await waitFor(() => expect(textarea.value).toBe("external source"));
    expect(textarea.closest(".note-markdown-editor")?.className).not.toContain("is-composing");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith("Bかな", false);
  });

  it("keeps a different external update authoritative after an older echo was ignored", async () => {
    const sourceA = "A";
    const sourceB = "B";
    const sourceC = "Bかな";
    const onChange = vi.fn();
    const props = { onChange, documentSessionKey: "ime-post-composition-external-update" };
    const { rerender } = render(<NoteMarkdownEditor value={sourceA} {...props} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, { target: { value: sourceB } });
      fireEvent.compositionStart(textarea);
      fireEvent.change(textarea, { target: { value: sourceC } });
    });
    fireEvent.compositionEnd(textarea);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenNthCalledWith(2, sourceC, false);

    rerender(<NoteMarkdownEditor value={sourceB} {...props} />);
    await waitFor(() => expect(textarea.value).toBe(sourceC));

    rerender(<NoteMarkdownEditor value="external source" {...props} />);
    await waitFor(() => expect(textarea.value).toBe("external source"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("cancels pending composition finalization when the document session changes", async () => {
    const onChange = vi.fn();
    const firstProps = { onChange, documentSessionKey: "ime-session-before" };
    const { rerender } = render(<NoteMarkdownEditor value="A" {...firstProps} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, { target: { value: "B" } });
      fireEvent.compositionStart(textarea);
      fireEvent.change(textarea, { target: { value: "Bかな" } });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenNthCalledWith(1, "B", false);

    fireEvent.compositionEnd(textarea);
    rerender(<NoteMarkdownEditor value="new document" onChange={onChange} documentSessionKey="ime-session-after" />);
    await waitFor(() => expect(textarea.value).toBe("new document"));
    expect(textarea.closest(".note-markdown-editor")?.className).not.toContain("is-composing");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not search during IME composition and reports search authentication errors separately", async () => {
    const search = vi.spyOn(api, "searchInternalDocumentLinks").mockRejectedValue(new ApiClientError("expired", 401, false, "unauthenticated"));
    const onSearchUnauthorized = vi.fn();
    const onChange = vi.fn();
    render(<NoteMarkdownEditor value="" onChange={onChange} onSearchUnauthorized={onSearchUnauthorized} />);
    const textarea = screen.getByRole("textbox", { name: "Markdown本文" }) as HTMLTextAreaElement;
    fireEvent.compositionStart(textarea);
    expect(textarea.closest(".note-markdown-editor")?.className).toContain("is-composing");
    fireEvent.change(textarea, { target: { value: "[[かな" } });
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    expect(search).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.compositionEnd(textarea);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith("[[かな", true);
    expect(textarea.closest(".note-markdown-editor")?.className).not.toContain("is-composing");
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
    expect(document.querySelectorAll(".note-markdown-preview-grid")).toHaveLength(2);
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
