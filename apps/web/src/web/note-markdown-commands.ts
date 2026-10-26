import type { InternalDocumentLinkCandidate } from "../shared/contracts";

export type MarkdownSelectionDirection = "forward" | "backward" | "none";

export interface MarkdownSelection {
  start: number;
  end: number;
  direction?: MarkdownSelectionDirection;
}

export interface MarkdownEditResult {
  text: string;
  selection: MarkdownSelection;
}

export type MarkdownCommand =
  | { kind: "bold" }
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 }
  | { kind: "bullet" | "checkbox" | "quote" | "link" | "horizontal-rule" | "ordered-list" | "indent" | "outdent" }
  | { kind: "move-line"; direction: "up" | "down" };

interface SourceLine {
  start: number;
  text: string;
  lineEnding: string;
}

interface LineEdit {
  text: string;
  map: (offset: number) => number;
}

const orderedListPrefix = /^(\d{1,9}[.)])[ \t]+/;
const bulletListPrefix = /^[-+*][ \t]+/;
const taskCheckboxPrefix = /^\[([ xX])\][ \t]+/;
const thematicBreakPattern = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const hyphenThematicBreakPattern = /^ {0,3}(?:-\s*){3,}$/;
const atxHeadingPrefix = /^(#{1,6})(\s+)/;

function sourceLines(source: string): SourceLine[] {
  if (!source) return [{ start: 0, text: "", lineEnding: "" }];
  const result: SourceLine[] = [];
  let start = 0;
  while (start <= source.length) {
    const newline = source.indexOf("\n", start);
    if (newline < 0) {
      result.push({ start, text: source.slice(start), lineEnding: "" });
      break;
    }
    const textEnd = newline > start && source[newline - 1] === "\r" ? newline - 1 : newline;
    result.push({ start, text: source.slice(start, textEnd), lineEnding: source.slice(textEnd, newline + 1) });
    start = newline + 1;
  }
  return result;
}

function normalizedRange(selection: MarkdownSelection, length: number): MarkdownSelection {
  const start = Math.max(0, Math.min(selection.start, length));
  const end = Math.max(0, Math.min(selection.end, length));
  return { start: Math.min(start, end), end: Math.max(start, end), direction: selection.direction ?? "none" };
}

function lastIndexWhere<T>(values: T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index -= 1) if (predicate(values[index]!)) return index;
  return -1;
}

function withMappedSelection(
  text: string,
  original: MarkdownSelection,
  map: (offset: number) => number,
): MarkdownEditResult {
  const left = Math.max(0, Math.min(map(original.start), text.length));
  const right = Math.max(0, Math.min(map(original.end), text.length));
  return {
    text,
    selection: { start: Math.min(left, right), end: Math.max(left, right), direction: original.direction ?? "none" },
  };
}

function touchedLineIndexes(lines: SourceLine[], selection: MarkdownSelection): Set<number> {
  if (!lines.length) return new Set();
  const startLine = Math.max(0, lastIndexWhere(lines, (line) => selection.start >= line.start));
  const endAnchor = selection.end > selection.start ? Math.max(selection.start, selection.end - 1) : selection.start;
  const endLine = Math.max(startLine, lastIndexWhere(lines, (line) => endAnchor >= line.start));
  return new Set(Array.from({ length: endLine - startLine + 1 }, (_, offset) => startLine + offset));
}

function buildLineEditResult(source: string, selection: MarkdownSelection, lines: SourceLine[], edits: LineEdit[]): MarkdownEditResult {
  const text = edits.map((edit, index) => edit.text + lines[index]!.lineEnding).join("");
  const starts: number[] = [];
  let outputStart = 0;
  edits.forEach((edit, index) => {
    starts[index] = outputStart;
    outputStart += edit.text.length + lines[index]!.lineEnding.length;
  });
  const mapPosition = (position: number) => {
    const bounded = Math.max(0, Math.min(position, source.length));
    const lineIndex = Math.max(0, lastIndexWhere(lines, (line) => bounded >= line.start));
    const line = lines[lineIndex]!;
    const local = Math.max(0, Math.min(bounded - line.start, line.text.length));
    return starts[lineIndex]! + edits[lineIndex]!.map(local);
  };
  return withMappedSelection(text, selection, mapPosition);
}

function editSelectedLines(
  source: string,
  selection: MarkdownSelection,
  transform: (line: string, index: number) => LineEdit,
): MarkdownEditResult {
  const range = normalizedRange(selection, source.length);
  const lines = sourceLines(source);
  const touched = touchedLineIndexes(lines, range);
  const edits = lines.map((line, index) => touched.has(index) ? transform(line.text, index) : { text: line.text, map: (offset: number) => offset });
  return buildLineEditResult(source, selection, lines, edits);
}

function editToggleLines(
  source: string,
  selection: MarkdownSelection,
  hasPrefix: (line: string) => boolean,
  transform: (line: string, allHavePrefix: boolean) => LineEdit,
): MarkdownEditResult {
  const range = normalizedRange(selection, source.length);
  const lines = sourceLines(source);
  const touched = touchedLineIndexes(lines, range);
  const allHavePrefix = [...touched].every((index) => hasPrefix(lines[index]!.text));
  const edits = lines.map((line, index) => touched.has(index)
    ? transform(line.text, allHavePrefix)
    : { text: line.text, map: (offset: number) => offset });
  return buildLineEditResult(source, selection, lines, edits);
}

function listIndentUnit(line: string): number {
  const body = line.replace(/^[ \t]*/, "");
  return (orderedListPrefix.exec(body)?.[1]?.length ?? (bulletListPrefix.test(body) ? 2 : 2)) +
    (orderedListPrefix.test(body) ? 1 : 0);
}

function leadingWhitespaceLength(line: string): number {
  return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

function listPrefixEnd(line: string, leadingLength: number): number {
  const body = line.slice(leadingLength);
  const prefix = orderedListPrefix.exec(body) ?? bulletListPrefix.exec(body);
  return leadingLength + (prefix?.[0].length ?? 0);
}

function mayBeSetextHeadingText(line: string): boolean {
  const indentationLength = leadingWhitespaceLength(line);
  if (indentationLength >= 4) return false;
  const content = line.slice(indentationLength);
  if (!content.trim() || thematicBreakPattern.test(line)) return false;
  if (/^#{1,6}[ \t]+/.test(content) || content.startsWith(">") || /^(?:[-+*]|\d{1,9}[.)])[ \t]+/.test(content)) return false;
  if (content.startsWith("```") || content.startsWith("~~~")) return false;
  return true;
}

function horizontalRule(source: string, selection: MarkdownSelection): MarkdownEditResult {
  const lines = sourceLines(source);
  const caret = Math.max(0, Math.min(selection.end, source.length));
  const lineIndex = Math.max(0, lastIndexWhere(lines, (line) => caret >= line.start));
  const line = lines[lineIndex]!;
  const previousLine = lines[lineIndex - 1];
  const existingSetextUnderline = Boolean(previousLine && hyphenThematicBreakPattern.test(line.text) && mayBeSetextHeadingText(previousLine.text));
  const separator = line.lineEnding || [...lines.slice(0, lineIndex)].reverse().find((item) => item.lineEnding.length > 0)?.lineEnding || "\n";
  const insertionPoint = existingSetextUnderline ? line.start + line.text.length + line.lineEnding.length : line.start;
  const needsLeadingBlank = existingSetextUnderline
    ? !line.lineEnding || (insertionPoint === source.length && source.endsWith("\n"))
    : Boolean(previousLine && mayBeSetextHeadingText(previousLine.text));
  const needsTrailingSeparator = existingSetextUnderline
    ? insertionPoint < source.length
    : line.text.length > 0 || line.lineEnding.length > 0 || (line.start === source.length && source.endsWith("\n"));
  const inserted = `${needsLeadingBlank ? separator : ""}---${needsTrailingSeparator ? separator : ""}`;
  const text = source.slice(0, insertionPoint) + inserted + source.slice(insertionPoint);
  const map = (offset: number) => offset >= insertionPoint ? offset + inserted.length : offset;
  return withMappedSelection(text, selection, map);
}

function moveLine(source: string, selection: MarkdownSelection, direction: "up" | "down"): MarkdownEditResult {
  const lines = sourceLines(source);
  const touched = [...touchedLineIndexes(lines, normalizedRange(selection, source.length))].sort((a, b) => a - b);
  const first = touched[0];
  if (first === undefined) return { text: source, selection };
  const last = touched[touched.length - 1]!;
  const adjacent = direction === "up" ? first - 1 : last + 1;
  if (adjacent < 0 || adjacent >= lines.length) return { text: source, selection };

  const order = lines.map((_, index) => index);
  if (direction === "up") {
    const adjacentAndBlock = order.splice(first - 1, last - first + 2);
    order.splice(first - 1, 0, ...adjacentAndBlock.slice(1), adjacentAndBlock[0]!);
  } else {
    const after = order.splice(last + 1, 1)[0]!;
    order.splice(first, 0, after);
  }
  const outputStarts = new Array<number>(lines.length);
  const oldToNew = new Array<number>(lines.length);
  let text = "";
  order.forEach((originalIndex, outputIndex) => {
    outputStarts[outputIndex] = text.length;
    oldToNew[originalIndex] = outputIndex;
    text += lines[originalIndex]!.text + lines[outputIndex]!.lineEnding;
  });
  const map = (offset: number) => {
    const bounded = Math.max(0, Math.min(offset, source.length));
    const originalIndex = Math.max(0, lastIndexWhere(lines, (line) => bounded >= line.start));
    const original = lines[originalIndex]!;
    const local = Math.max(0, Math.min(bounded - original.start, original.text.length));
    return outputStarts[oldToNew[originalIndex]!]! + local;
  };
  return withMappedSelection(text, selection, map);
}

export function applyMarkdownCommand(source: string, selection: MarkdownSelection, command: MarkdownCommand): MarkdownEditResult {
  const range = normalizedRange(selection, source.length);
  switch (command.kind) {
    case "bold": {
      if (range.start === range.end) {
        const text = source.slice(0, range.start) + "****" + source.slice(range.start);
        return { text, selection: { ...range, start: range.start + 2, end: range.start + 2 } };
      }
      const wrapped = range.start >= 2 && source.slice(range.start - 2, range.start) === "**" && source.slice(range.end, range.end + 2) === "**";
      if (wrapped) {
        const text = source.slice(0, range.start - 2) + source.slice(range.start, range.end) + source.slice(range.end + 2);
        return { text, selection: { start: range.start - 2, end: range.end - 2, direction: selection.direction ?? "none" } };
      }
      const text = source.slice(0, range.start) + "**" + source.slice(range.start, range.end) + "**" + source.slice(range.end);
      return { text, selection: { start: range.start + 2, end: range.end + 2, direction: selection.direction ?? "none" } };
    }
    case "heading":
      return editToggleLines(source, selection, (line) => atxHeadingPrefix.test(line), (line) => {
        const existing = atxHeadingPrefix.exec(line);
        if (!existing) {
          const prefix = `${"#".repeat(command.level)} `;
          return { text: prefix + line, map: (offset) => offset + prefix.length };
        }
        const replacement = `${"#".repeat(command.level)}${existing[2]}`;
        const body = line.slice(existing[0].length);
        return { text: replacement + body, map: (offset) => offset < existing[1]!.length ? Math.min(offset, command.level) : offset + replacement.length - existing[0].length };
      });
    case "bullet":
      return editToggleLines(source, selection, (line) => line.startsWith("- "), (line, all) => {
        if (all) return { text: line.slice(2), map: (offset) => Math.max(0, offset - 2) };
        if (line.startsWith("- ")) return { text: line, map: (offset) => offset };
        return { text: `- ${line}`, map: (offset) => offset + 2 };
      });
    case "checkbox":
      return editToggleLines(source, selection, (line) => line.startsWith("- ["), (line, all) => {
        const task = /^- \[([ xX])\] /.exec(line);
        if (all) return task
          ? { text: line.slice(task[0].length), map: (offset) => Math.max(0, offset - task[0].length) }
          : { text: line.slice(2), map: (offset) => Math.max(0, offset - 2) };
        if (task) return { text: line, map: (offset) => offset };
        if (line.startsWith("- ")) return { text: `- [ ] ${line.slice(2)}`, map: (offset) => offset + 4 };
        return { text: `- [ ] ${line}`, map: (offset) => offset + 6 };
      });
    case "quote":
      return editToggleLines(source, selection, (line) => line.startsWith("> "), (line, all) => {
        if (all) return { text: line.slice(2), map: (offset) => Math.max(0, offset - 2) };
        if (line.startsWith("> ")) return { text: line, map: (offset) => offset };
        return { text: `> ${line}`, map: (offset) => offset + 2 };
      });
    case "link": {
      const label = source.slice(range.start, range.end);
      const inserted = range.start === range.end ? "[](https://)" : `[${label}](https://)`;
      const text = source.slice(0, range.start) + inserted + source.slice(range.end);
      const urlStart = range.start + (range.start === range.end ? 3 : label.length + 3);
      return { text, selection: { start: urlStart, end: urlStart + "https://".length, direction: "forward" } };
    }
    case "horizontal-rule":
      return horizontalRule(source, selection);
    case "indent":
      return editSelectedLines(source, selection, (line) => {
        const unit = listIndentUnit(line);
        return { text: " ".repeat(unit) + line, map: (offset) => offset + unit };
      });
    case "outdent":
      return editSelectedLines(source, selection, (line) => {
        const leading = line.match(/^ */)?.[0].length ?? 0;
        const removed = Math.min(listIndentUnit(line), leading);
        return { text: line.slice(removed), map: (offset) => Math.max(0, offset - removed) };
      });
    case "ordered-list": {
      const lines = sourceLines(source);
      const touched = touchedLineIndexes(lines, range);
      const oneLine = range.start === range.end ? [...touched][0] : undefined;
      const line = oneLine === undefined ? undefined : lines[oneLine]!.text;
      const leading = line === undefined ? 0 : leadingWhitespaceLength(line);
      const selectedPrefix = line === undefined ? null : orderedListPrefix.exec(line.slice(leading));
      if (selectedPrefix && oneLine !== undefined && line !== undefined) {
        const contentStart = leading + selectedPrefix[0].length;
        const content = line.slice(contentStart);
        const prefix = /^- \[[ xX]\][ \t]+/.test(content) ? line.slice(0, leading) + "- " : line.slice(0, leading);
        return editSelectedLines(source, selection, (current, index) => index === oneLine
          ? { text: prefix + content, map: (offset) => offset <= contentStart ? prefix.length : prefix.length + offset - contentStart }
          : { text: current, map: (offset) => offset });
      }
      let number = 0;
      return editSelectedLines(source, selection, (current, index) => {
        if (!touched.has(index)) return { text: current, map: (offset) => offset };
        number += 1;
        const indent = leadingWhitespaceLength(current);
        const bodyStart = listPrefixEnd(current, indent);
        const prefix = `${current.slice(0, indent)}${number}. `;
        return { text: prefix + current.slice(bodyStart), map: (offset) => offset <= bodyStart ? prefix.length : prefix.length + offset - bodyStart };
      });
    }
    case "move-line":
      return moveLine(source, selection, command.direction);
  }
}

export interface InternalLinkQueryToken {
  start: number;
  endExclusive: number;
  query: string;
  hasClosingMarker: boolean;
}

export function activeInternalLinkQuery(source: string, selectionStart: number, selectionEnd: number): InternalLinkQueryToken | null {
  if (selectionStart !== selectionEnd) return null;
  const caret = Math.max(0, Math.min(selectionEnd, source.length));
  const lineStart = source.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const opening = source.lastIndexOf("[[", caret - 1);
  if (opening < lineStart) return null;
  const query = source.slice(opening + 2, caret);
  if (query.includes("]") || query.includes("\n") || query.length > 80) return null;
  return { start: opening, endExclusive: caret, query, hasClosingMarker: source.startsWith("]]", caret) };
}

export function insertInternalLinkTrigger(source: string, selection: MarkdownSelection): MarkdownEditResult | null {
  const range = normalizedRange(selection, source.length);
  const selected = source.slice(range.start, range.end);
  if (/[\r\n]/.test(selected)) return null;
  const inserted = `[[${selected}]]`;
  const caret = range.start + 2 + selected.length;
  return { text: source.slice(0, range.start) + inserted + source.slice(range.end), selection: { start: caret, end: caret, direction: "none" } };
}

export function internalMarkdownLink(candidate: InternalDocumentLinkCandidate): string | null {
  let destination: string;
  let label: string;
  if (candidate.kind === "daily_primary") {
    const date = candidate.logical_date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null;
    destination = `/?view=daily&date=${date}`;
    label = date;
  } else {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.document_id)) return null;
    destination = `/?view=note&document=${encodeURIComponent(candidate.document_id)}`;
    label = candidate.label.replace(/[\r\n]+/g, " ");
  }
  const escapedLabel = label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return `[${escapedLabel}](${destination})`;
}

