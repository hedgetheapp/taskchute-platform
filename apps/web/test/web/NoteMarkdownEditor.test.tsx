import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { NoteIcon } from "../../src/web/NoteIcon";
import {
  NoteMarkdownEditor,
  NOTE_LINE_NUMBERING_STORAGE_KEY,
  readNoteLineNumberingPreference,
} from "../../src/web/NoteMarkdownEditor";
import {
  clampTaskNotePeekWidth,
  defaultTaskNotePeekWidth,
  maxTaskNotePeekWidth,
  readTaskNotePeekWidth,
  resizeTaskNotePeekWidth,
  TASK_NOTE_PEEK_MIN_WIDTH,
  TASK_NOTE_PEEK_WIDTH_STORAGE_KEY,
} from "../../src/web/task-note-peek-width";

describe("NoteMarkdownEditor and shared Note UI helpers", () => {
  beforeEach(() => localStorage.clear());

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
