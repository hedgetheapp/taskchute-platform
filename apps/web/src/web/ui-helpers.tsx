import { Temporal } from "@js-temporal/polyfill";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

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

function calendarMonthDates(logicalDate: string): string[] {
  const monthStart = Temporal.PlainDate.from(logicalDate).with({ day: 1 });
  const gridStart = monthStart.subtract({ days: monthStart.dayOfWeek - 1 });
  return Array.from({ length: 42 }, (_, index) => gridStart.add({ days: index }).toString());
}

export function formatLogicalDateLabel(logicalDate: string): string {
  const date = Temporal.PlainDate.from(logicalDate);
  return `${date.year}年${date.month}月${date.day}日（${["月", "火", "水", "木", "金", "土", "日"][date.dayOfWeek - 1]}）`;
}

function formatCalendarMonth(logicalDate: string): string {
  const date = Temporal.PlainDate.from(logicalDate);
  return `${date.year}年${date.month}月`;
}

export interface CalendarPopoverProps {
  value: string;
  selectedDate?: string | null;
  todayDate?: string | null;
  ariaLabel?: string;
  className?: string;
  insideRef?: RefObject<HTMLElement | null>;
  autoFocusDate?: boolean;
  onSelect: (logicalDate: string) => void | Promise<void>;
  onClose: () => void;
}

/** Today-style, Monday-first logical-date calendar shared by all date surfaces. */
export function CalendarPopover({
  value,
  selectedDate = null,
  todayDate = null,
  ariaLabel = "カレンダー",
  className,
  insideRef,
  autoFocusDate = true,
  onSelect,
  onClose,
}: CalendarPopoverProps) {
  const [focusedDate, setFocusedDate] = useState(value);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setFocusedDate(value), [value]);
  useEffect(() => {
    if (!autoFocusDate) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-calendar-date="${focusedDate}"]`)?.focus();
  }, [autoFocusDate, focusedDate]);
  useOutsideClick(true, (target) => {
    const node = target as Node | null;
    return Boolean((node && popoverRef.current?.contains(node)) || (node && insideRef?.current?.contains(node)));
  }, onClose);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    let nextDate: string | null = null;
    switch (event.key) {
      case "ArrowLeft": nextDate = Temporal.PlainDate.from(focusedDate).subtract({ days: 1 }).toString(); break;
      case "ArrowRight": nextDate = Temporal.PlainDate.from(focusedDate).add({ days: 1 }).toString(); break;
      case "ArrowUp": nextDate = Temporal.PlainDate.from(focusedDate).subtract({ days: 7 }).toString(); break;
      case "ArrowDown": nextDate = Temporal.PlainDate.from(focusedDate).add({ days: 7 }).toString(); break;
      case "PageUp": nextDate = Temporal.PlainDate.from(focusedDate).subtract(event.shiftKey ? { years: 1 } : { months: 1 }).toString(); break;
      case "PageDown": nextDate = Temporal.PlainDate.from(focusedDate).add(event.shiftKey ? { years: 1 } : { months: 1 }).toString(); break;
      case "Enter":
        event.preventDefault(); event.stopPropagation();
        void onSelect(focusedDate);
        return;
      case "Escape":
        event.preventDefault(); event.stopPropagation();
        onClose();
        return;
      default: return;
    }
    event.preventDefault(); event.stopPropagation();
    setFocusedDate(nextDate);
  }

  const focusedMonth = Temporal.PlainDate.from(focusedDate);
  return <div className={["calendar-popover", className].filter(Boolean).join(" ")} ref={popoverRef} role="dialog"
    aria-modal="false" aria-label={`${formatCalendarMonth(focusedDate)}の${ariaLabel}`} onKeyDown={handleKeyDown}>
    <div className="calendar-month-toolbar">
      <button type="button" className="secondary calendar-nav-button" aria-label="前年"
        onClick={() => setFocusedDate(Temporal.PlainDate.from(focusedDate).subtract({ years: 1 }).toString())}>«</button>
      <button type="button" className="secondary calendar-nav-button" aria-label="前の月"
        onClick={() => setFocusedDate(Temporal.PlainDate.from(focusedDate).subtract({ months: 1 }).toString())}>‹</button>
      <div className="calendar-month-heading" aria-live="polite">{formatCalendarMonth(focusedDate)}</div>
      <button type="button" className="secondary calendar-nav-button" aria-label="次の月"
        onClick={() => setFocusedDate(Temporal.PlainDate.from(focusedDate).add({ months: 1 }).toString())}>›</button>
      <button type="button" className="secondary calendar-nav-button" aria-label="翌年"
        onClick={() => setFocusedDate(Temporal.PlainDate.from(focusedDate).add({ years: 1 }).toString())}>»</button>
    </div>
    <div className="calendar-grid" role="grid" aria-label="日付" ref={gridRef}>
      {["月", "火", "水", "木", "金", "土", "日"].map((weekday) => (
        <span className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</span>
      ))}
      {calendarMonthDates(focusedDate).map((logicalDate) => {
        const candidate = Temporal.PlainDate.from(logicalDate);
        const selected = logicalDate === selectedDate;
        const today = logicalDate === todayDate;
        const outsideMonth = candidate.month !== focusedMonth.month || candidate.year !== focusedMonth.year;
        const suffix = [selected ? "選択中" : "", today ? "今日" : "", outsideMonth ? "表示月外" : ""]
          .filter(Boolean).join("、");
        return <button type="button" role="gridcell" className={`calendar-day${outsideMonth ? " outside-month" : ""}`}
          key={logicalDate} data-calendar-date={logicalDate} tabIndex={logicalDate === focusedDate ? 0 : -1}
          aria-selected={selected} aria-current={today ? "date" : undefined}
          aria-label={`${formatLogicalDateLabel(logicalDate)}${suffix ? `、${suffix}` : ""}`}
          onClick={() => void onSelect(logicalDate)}>{candidate.day}</button>;
      })}
    </div>
    <p className="sr-only">矢印キーで日付、PageUpとPageDownで月、Shiftを併用すると年を移動し、Enterで選択、Escapeで閉じます。</p>
  </div>;
}

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
  todayDate?: string | null;
  allowBlank?: boolean;
  disabled?: boolean;
  commitOnValidChange?: boolean;
  onCommit: (value: string | null) => void;
  onInvalid?: () => void;
}

/** Text + Today-style calendar input sharing one strict logical-date draft. */
export function LogicalDateInput({ label, value, todayDate = null, allowBlank = false, disabled = false, commitOnValidChange = false, onCommit, onInvalid }: LogicalDateInputProps) {
  const [draft, setDraft] = useState(value ?? "");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastCommittedRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    setDraft(value ?? "");
    lastCommittedRef.current = normalizeLogicalDateInput(value ?? "", allowBlank);
  }, [allowBlank, value]);

  useOutsideClick(calendarOpen, (target) => rootRef.current?.contains(target as Node) ?? false, () => setCalendarOpen(false));

  function commit(raw: string): void {
    const normalized = normalizeLogicalDateInput(raw, allowBlank);
    if (normalized === undefined) {
      onInvalid?.();
      return;
    }
    setCalendarOpen(false);
    setDraft(normalized ?? "");
    if (lastCommittedRef.current === normalized) return;
    lastCommittedRef.current = normalized;
    onCommit(normalized);
  }

  function openCalendar(): void {
    if (!disabled) setCalendarOpen(true);
  }

  const calendarDate = normalizeLogicalDateInput(draft, true)
    ?? normalizeLogicalDateInput(value ?? "", true)
    ?? Temporal.Now.plainDateISO("Asia/Tokyo").toString();

  return <div className="logical-date-input" ref={rootRef} onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setCalendarOpen(false);
  }}>
    <input type="text" inputMode="numeric" aria-label={label} aria-haspopup="dialog" aria-expanded={calendarOpen} value={draft} disabled={disabled}
      placeholder={allowBlank ? "終了なし" : "YYYYMMDD"}
      onFocus={openCalendar} onClick={openCalendar}
      onChange={(event) => {
        setDraft(event.target.value);
        if (commitOnValidChange && normalizeLogicalDateInput(event.target.value, allowBlank) !== undefined) commit(event.target.value);
      }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
        commit(event.currentTarget.value);
      }} />
    {calendarOpen && <CalendarPopover value={calendarDate} selectedDate={normalizeLogicalDateInput(draft, true)}
      todayDate={todayDate} className="logical-date-calendar" ariaLabel={label} insideRef={rootRef} autoFocusDate={false}
      onSelect={(logicalDate) => commit(logicalDate)} onClose={() => setCalendarOpen(false)} />}
  </div>;
}

export function logicalDateInside(ref: RefObject<HTMLElement | null>, target: EventTarget | null): boolean {
  return ref.current?.contains(target as Node) ?? false;
}
