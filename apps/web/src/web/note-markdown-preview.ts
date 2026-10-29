export type NoteMarkdownPreviewLineKind =
  | "source"
  | "heading"
  | "setext-heading"
  | "setext-underline"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "quote"
  | "horizontal-rule";

export type NoteMarkdownPreviewSegmentKind = "text" | "bold" | "link" | "list-marker" | "task-marker";

export interface NoteMarkdownPreviewSegment {
  kind: NoteMarkdownPreviewSegmentKind;
  text: string;
}

export interface NoteMarkdownPreviewLine {
  index: number;
  sourceStart: number;
  sourceEnd: number;
  sourceText: string;
  kind: NoteMarkdownPreviewLineKind;
  active: boolean;
  sourceFallback: boolean;
  segments: NoteMarkdownPreviewSegment[];
  displayText: string;
}

export interface NoteMarkdownPreviewSelection {
  start: number;
  end: number;
}

export interface ParsedNoteMarkdownPreview {
  sourceLength: number;
  lines: NoteMarkdownPreviewLine[];
  activeLines: NoteMarkdownPreviewLine[];
}

interface SourceLine {
  start: number;
  end: number;
  text: string;
}

type Fence = { character: "`" | "~"; length: number } | null;

const uuidV7 = "[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const noteRoute = new RegExp(`^/\\?view=note&document=${uuidV7}$`, "i");
const dailyRoute = /^\/\?view=daily&date=(\d{4}-\d{2}-\d{2})$/;
const thematicBreak = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const setextUnderline = /^ {0,3}(?:=+|-{3,})[ \t]*$/;

function splitSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  while (true) {
    const newline = source.indexOf("\n", start);
    if (newline < 0) {
      lines.push({ start, end: source.length, text: source.slice(start) });
      return lines;
    }
    const end = newline > start && source[newline - 1] === "\r" ? newline - 1 : newline;
    lines.push({ start, end, text: source.slice(start, end) });
    start = newline + 1;
    if (start === source.length) {
      lines.push({ start, end: start, text: "" });
      return lines;
    }
  }
}

function activeLineRange(lines: NoteMarkdownPreviewLine[], selection: NoteMarkdownPreviewSelection, sourceLength: number): [number, number] {
  const first = Math.max(0, Math.min(selection.start, sourceLength));
  const last = Math.max(0, Math.min(selection.end, sourceLength));
  const start = Math.min(first, last);
  const end = Math.max(first, last);
  const endAnchor = end > start ? end - 1 : start;
  const lineAt = (offset: number) => {
    let low = 0;
    let high = lines.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (lines[middle]!.sourceStart <= offset) low = middle + 1;
      else high = middle;
    }
    return Math.max(0, low - 1);
  };
  return [lineAt(start), lineAt(endAnchor)];
}

export function isSafeMarkdownPreviewDestination(destination: string): boolean {
  if (!destination || /[\s\u0000-\u001f]/.test(destination) || destination.startsWith("//")) return false;
  if (noteRoute.test(destination)) return true;
  const dailyMatch = dailyRoute.exec(destination);
  if (dailyMatch) {
    const date = dailyMatch[1]!;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }
  try {
    const parsed = new URL(destination);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname) &&
      !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function segment(
  kind: NoteMarkdownPreviewSegmentKind,
  text: string,
): NoteMarkdownPreviewSegment {
  return { kind, text };
}

function sourceSegment(kind: "text" | "bold", source: string, start: number, end: number): NoteMarkdownPreviewSegment {
  return segment(kind, source.slice(start, end));
}

function markerSegment(kind: "list-marker" | "task-marker", text: string): NoteMarkdownPreviewSegment {
  return segment(kind, text);
}

function unescapeLinkLabel(label: string): string {
  let text = "";
  for (let index = 0; index < label.length;) {
    const escaped = label[index] === "\\" && index + 1 < label.length && "\\[]".includes(label[index + 1]!);
    const width = escaped ? 2 : 1;
    text += label[index + (escaped ? 1 : 0)];
    index += width;
  }
  return text;
}

function closingUnescapedBracket(source: string, start: number): number {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") { index += 1; continue; }
    if (source[index] === "]") return index;
  }
  return -1;
}

function isEscapedAt(source: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function closingBoldDelimiter(source: string, start: number): number {
  let candidate = source.indexOf("**", start);
  while (candidate >= 0) {
    if (!isEscapedAt(source, candidate)) return candidate;
    candidate = source.indexOf("**", candidate + 2);
  }
  return -1;
}

function closingLinkDestinationParen(source: string, openParen: number): number {
  let depth = 1;
  for (let index = openParen + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") return -1;
    if (character === "(") {
      depth += 1;
      if (depth > 8) return -1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function inlineSegments(source: string): NoteMarkdownPreviewSegment[] {
  if (!source || source.includes("`") || /[<>]/.test(source) || source.includes("\\*") || /\*{3,}/.test(source)) {
    return source.length ? [sourceSegment("text", source, 0, source.length)] : [];
  }
  const segments: NoteMarkdownPreviewSegment[] = [];
  let plainStart = 0;
  let cursor = 0;
  const flushPlain = (end: number) => {
    if (end > plainStart) segments.push(sourceSegment("text", source, plainStart, end));
  };

  while (cursor < source.length) {
    if (source.startsWith("**", cursor) && !isEscapedAt(source, cursor)) {
      const close = closingBoldDelimiter(source, cursor + 2);
      if (close > cursor + 2) {
        flushPlain(cursor);
        segments.push(sourceSegment("bold", source, cursor + 2, close));
        cursor = close + 2;
        plainStart = cursor;
        continue;
      }
    }

    const isImageLabel = cursor > 0 && source[cursor - 1] === "!" && !isEscapedAt(source, cursor - 1);
    if (source[cursor] === "[" && !isEscapedAt(source, cursor) && !isImageLabel) {
      const labelEnd = closingUnescapedBracket(source, cursor);
      if (labelEnd > cursor + 1 && source[labelEnd + 1] === "(") {
        const destinationEnd = closingLinkDestinationParen(source, labelEnd + 1);
        const destination = destinationEnd > labelEnd + 2 ? source.slice(labelEnd + 2, destinationEnd) : "";
        if (destinationEnd >= 0 && !destination.includes("\\") && isSafeMarkdownPreviewDestination(destination)) {
          flushPlain(cursor);
          const label = source.slice(cursor + 1, labelEnd);
          segments.push(segment("link", unescapeLinkLabel(label)));
          cursor = destinationEnd + 1;
          plainStart = cursor;
          continue;
        }
      }
    }
    cursor += 1;
  }
  flushPlain(source.length);
  return segments;
}

function isSetextHeadingText(text: string): boolean {
  const indent = text.match(/^[ \t]*/)?.[0].length ?? 0;
  const content = text.slice(indent);
  if (indent >= 4 || !content.trim() || thematicBreak.test(text)) return false;
  if (/^#{1,6}[ \t]+/.test(content) || content.startsWith(">") || /^(?:[-+*]|\d{1,9}[.)])[ \t]+/.test(content)) return false;
  if (/^(?:```|~~~)/.test(content)) return false;
  return true;
}

function lineSegments(
  line: SourceLine,
  contentStart = line.start,
  contentEnd = line.end,
  marker?: { kind: "list-marker" | "task-marker"; text: string; indentEnd?: number },
): NoteMarkdownPreviewSegment[] {
  const result: NoteMarkdownPreviewSegment[] = [];
  if (marker?.indentEnd !== undefined && marker.indentEnd > line.start) {
    result.push(sourceSegment("text", line.text, 0, marker.indentEnd - line.start));
  }
  if (marker) result.push(markerSegment(marker.kind, marker.text));
  if (contentEnd > contentStart) result.push(...inlineSegments(line.text.slice(contentStart - line.start, contentEnd - line.start)));
  return result;
}

function buildLine(
  line: SourceLine,
  index: number,
  active: boolean,
  kind: NoteMarkdownPreviewLineKind,
  segments: NoteMarkdownPreviewSegment[],
  sourceFallback = false,
): NoteMarkdownPreviewLine {
  const displayText = segments.map((item) => item.text).join("");
  return {
    index,
    sourceStart: line.start,
    sourceEnd: line.end,
    sourceText: line.text,
    kind,
    active,
    sourceFallback,
    segments,
    displayText,
  };
}

function sourceLine(line: SourceLine, index: number, active: boolean): NoteMarkdownPreviewLine {
  const segments = line.text.length ? [sourceSegment("text", line.text, 0, line.text.length)] : [];
  return buildLine(line, index, active, "source", segments);
}

function renderedLine(
  line: SourceLine,
  index: number,
  active: boolean,
  kind: NoteMarkdownPreviewLineKind,
  segments: NoteMarkdownPreviewSegment[],
): NoteMarkdownPreviewLine {
  if (active) return sourceLine(line, index, true);
  return buildLine(line, index, false, kind, segments);
}

export function parseNoteMarkdownPreviewSource(source: string): ParsedNoteMarkdownPreview {
  const lines = splitSourceLines(source);
  let fence: Fence = null;

  const previewLines = lines.map((line, index) => {
    const followsSetextUnderline = index + 1 < lines.length && setextUnderline.test(lines[index + 1]!.text) && isSetextHeadingText(line.text);
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line.text);
    if (fence) {
      const closes = new RegExp(`^ {0,3}${fence.character === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`).test(line.text);
      const result = sourceLine(line, index, false);
      if (closes) fence = null;
      return result;
    }
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      fence = { character: marker[0] as "`" | "~", length: marker.length };
      return sourceLine(line, index, false);
    }

    if (index > 0 && setextUnderline.test(line.text) && isSetextHeadingText(lines[index - 1]!.text)) {
      return renderedLine(line, index, false, "setext-underline", []);
    }
    if (followsSetextUnderline) {
      return renderedLine(line, index, false, "setext-heading", inlineSegments(line.text));
    }
    if (thematicBreak.test(line.text)) return renderedLine(line, index, false, "horizontal-rule", []);

    const heading = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?$/.exec(line.text);
    if (heading) {
      const prefix = /^ {0,3}#{1,6}[ \t]+/.exec(line.text)?.[0] ?? "";
      const trailing = /[ \t]+#+[ \t]*$/.exec(line.text.slice(prefix.length));
      const bodyEnd = trailing ? line.start + line.text.length - trailing[0].length : line.end;
      const segments = inlineSegments(line.text.slice(prefix.length, bodyEnd - line.start));
      return renderedLine(line, index, false, "heading", segments);
    }

    const quote = /^([ \t]{0,3}(?:>[ \t]?)+)(.*)$/.exec(line.text);
    if (quote) {
      return renderedLine(line, index, false, "quote", inlineSegments(quote[2]!));
    }

    const task = /^([ \t]{0,3})([-+*])[ \t]+\[([ xX])\][ \t]+(.*)$/.exec(line.text);
    if (task) {
      const indentEnd = line.start + task[1]!.length;
      const contentStart = line.start + task[0].length - task[4]!.length;
      const markerText = task[3]!.toLowerCase() === " " ? "☐ " : "☑ ";
      const segments = lineSegments(line, contentStart, line.end, {
        kind: "task-marker", text: markerText, indentEnd,
      });
      return renderedLine(line, index, false, "task-list", segments);
    }

    const bullet = /^([ \t]{0,3})([-+*])[ \t]+(.*)$/.exec(line.text);
    if (bullet) {
      const indentEnd = line.start + bullet[1]!.length;
      const contentStart = line.start + bullet[0].length - bullet[3]!.length;
      const segments = lineSegments(line, contentStart, line.end, {
        kind: "list-marker", text: "• ", indentEnd,
      });
      return renderedLine(line, index, false, "bullet-list", segments);
    }

    const ordered = /^([ \t]{0,3})(\d{1,9}[.)])[ \t]+(.*)$/.exec(line.text);
    if (ordered) {
      const indentEnd = line.start + ordered[1]!.length;
      const contentStart = line.start + ordered[0].length - ordered[3]!.length;
      const segments = lineSegments(line, contentStart, line.end, {
        kind: "list-marker", text: `${ordered[2]!} `, indentEnd,
      });
      return renderedLine(line, index, false, "ordered-list", segments);
    }

    if (/[<`|]/.test(line.text) || /!\[[^\]]*\]\(/.test(line.text)) return sourceLine(line, index, false);
    return renderedLine(line, index, false, "source", inlineSegments(line.text));
  });

  return {
    sourceLength: source.length,
    lines: previewLines,
    activeLines: lines.map((line, index) => sourceLine(line, index, true)),
  };
}

export function projectNoteMarkdownPreviewSelection(
  parsed: ParsedNoteMarkdownPreview,
  selection: NoteMarkdownPreviewSelection,
): NoteMarkdownPreviewLine[] {
  const [activeStart, activeEnd] = activeLineRange(parsed.lines, selection, parsed.sourceLength);
  const projected = parsed.lines.slice();
  for (let index = activeStart; index <= activeEnd; index += 1) {
    projected[index] = parsed.activeLines[index]!;
  }
  return projected;
}

export function createNoteMarkdownPreviewLines(
  source: string,
  selection: NoteMarkdownPreviewSelection,
): NoteMarkdownPreviewLine[] {
  return projectNoteMarkdownPreviewSelection(parseNoteMarkdownPreviewSource(source), selection);
}
