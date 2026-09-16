import { useCallback, useEffect, useState } from "react";

export const NOTE_LINE_NUMBERING_STORAGE_KEY = "taskchute.notes.line-numbering.v1";
const NOTE_LINE_NUMBERING_ENVELOPE_VERSION = 1;

type NoteLineNumberingListener = () => void;
const lineNumberingListeners = new Set<NoteLineNumberingListener>();

export function readNoteLineNumberingPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(NOTE_LINE_NUMBERING_STORAGE_KEY);
    if (raw === null) return true;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return true;
    const envelope = parsed as { version?: unknown; enabled?: unknown };
    return envelope.version === NOTE_LINE_NUMBERING_ENVELOPE_VERSION && typeof envelope.enabled === "boolean"
      ? envelope.enabled
      : true;
  } catch {
    return true;
  }
}

export function persistNoteLineNumberingPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(NOTE_LINE_NUMBERING_STORAGE_KEY, JSON.stringify({
      version: NOTE_LINE_NUMBERING_ENVELOPE_VERSION,
      enabled,
    }));
  } catch {
    // Browser storage is an optional preference; callers retain the in-memory value.
  }
  lineNumberingListeners.forEach((listener) => listener());
}

export function useNoteLineNumberingPreference(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const sync = () => setEnabled(readNoteLineNumberingPreference());
    sync();
    lineNumberingListeners.add(sync);
    window.addEventListener("storage", sync);
    return () => {
      lineNumberingListeners.delete(sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setPreference = useCallback((next: boolean) => {
    setEnabled(next);
    persistNoteLineNumberingPreference(next);
  }, []);

  return [enabled, setPreference];
}

export interface NoteMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  disabled?: boolean;
  className?: string;
  rows?: number;
}

export function NoteMarkdownEditor({
  value, onChange, onKeyDown, disabled = false, className = "", rows = 18,
}: NoteMarkdownEditorProps) {
  const [lineNumbersEnabled, setLineNumbersEnabled] = useNoteLineNumberingPreference();
  const lineCount = Math.max(1, value.split("\n").length);
  const classes = ["note-markdown-field", className].filter(Boolean).join(" ");

  return (
    <div className={classes} data-note-markdown-editor="true">
      <div className="note-markdown-editor">
        <div className={`notes-line-numbers${lineNumbersEnabled ? " is-visible" : " is-hidden"}`} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
        <textarea
          aria-label="Markdown本文"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={rows}
          onScroll={(event) => {
            const gutter = event.currentTarget.previousElementSibling;
            if (gutter instanceof HTMLElement) gutter.scrollTop = event.currentTarget.scrollTop;
          }}
        />
      </div>
      <label className="notes-line-number-toggle">
        <input type="checkbox" checked={lineNumbersEnabled} onChange={(event) => setLineNumbersEnabled(event.target.checked)} />
        行番号を表示
      </label>
    </div>
  );
}
