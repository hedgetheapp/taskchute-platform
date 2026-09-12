import { Temporal } from "@js-temporal/polyfill";
import { useEffect, useRef, useState, type RefObject } from "react";

/** Close a temporary surface without swallowing the event that opened it. */
export function useOutsideClick(
  enabled: boolean,
  isInside: (target: EventTarget | null) => boolean,
  onOutside: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!isInside(event.target)) onOutside();
    };
    document.addEventListener("mousedown", handleOutside, true);
    document.addEventListener("touchstart", handleOutside, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside, true);
      document.removeEventListener("touchstart", handleOutside, true);
    };
  }, [enabled, isInside, onOutside]);
}

export type LogicalDateValue = string | null;

/** Parse strict Gregorian YYYY-MM-DD or YYYYMMDD without Date rollover. */
export function normalizeLogicalDateInput(value: string, allowBlank = false): LogicalDateValue | undefined {
  const raw = value.trim();
  if (!raw) return allowBlank ? null : undefined;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const match = compact ?? dashed;
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" }).toString();
  } catch {
    return undefined;
  }
}

interface LogicalDateInputProps {
  label: string;
  value: string | null;
  allowBlank?: boolean;
  disabled?: boolean;
  commitOnValidChange?: boolean;
  onCommit: (value: string | null) => void;
  onInvalid?: () => void;
}

/** Text + native calendar input sharing one strict logical-date draft. */
export function LogicalDateInput({ label, value, allowBlank = false, disabled = false, commitOnValidChange = false, onCommit, onInvalid }: LogicalDateInputProps) {
  const [draft, setDraft] = useState(value ?? "");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastCommittedRef = useRef<string | null | undefined>(undefined);

  useEffect(() => setDraft(value ?? ""), [value]);
  useOutsideClick(calendarOpen, (target) => rootRef.current?.contains(target as Node) ?? false, () => setCalendarOpen(false));

  function commit(raw: string): void {
    const normalized = normalizeLogicalDateInput(raw, allowBlank);
    if (normalized === undefined) {
      onInvalid?.();
      return;
    }
    setDraft(normalized ?? "");
    setCalendarOpen(false);
    if (lastCommittedRef.current === normalized) return;
    lastCommittedRef.current = normalized;
    onCommit(normalized);
  }

  return <div className="logical-date-input" ref={rootRef}>
    <input type="text" inputMode="numeric" aria-label={label} value={draft} disabled={disabled}
      placeholder={allowBlank ? "終了なし" : "YYYYMMDD"}
      onChange={(event) => {
        setDraft(event.target.value);
        if (commitOnValidChange && normalizeLogicalDateInput(event.target.value, allowBlank) !== undefined) commit(event.target.value);
      }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
        commit(event.currentTarget.value);
      }} />
    <button type="button" className="secondary logical-date-calendar-trigger" aria-label={`${label}をカレンダーで選択`}
      aria-expanded={calendarOpen} disabled={disabled} onClick={() => setCalendarOpen((open) => !open)}>▣</button>
    {calendarOpen && <div className="logical-date-calendar" role="dialog" aria-label={`${label}カレンダー`}>
      <input type="date" aria-label={`${label}のカレンダー`} value={normalizeLogicalDateInput(draft, true) ?? ""}
        onChange={(event) => commit(event.target.value)} />
    </div>}
  </div>;
}

export function logicalDateInside(ref: RefObject<HTMLElement | null>, target: EventTarget | null): boolean {
  return ref.current?.contains(target as Node) ?? false;
}
