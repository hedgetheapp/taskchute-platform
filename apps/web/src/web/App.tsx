import {
  DragEvent as ReactDragEvent,
  Fragment,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Temporal } from "@js-temporal/polyfill";
import type {
  AddTaskToDayRequest,
  DuplicateEntryRequest,
  BulkDeleteEntriesRequest,
  BulkMoveEntriesToDayRequest,
  BulkMoveEntriesToSectionRequest,
  BulkMoveEntriesToSectionOccurrenceRequest,
  BulkMoveEntriesToSectionScopedRequest,
  BulkRoutineSectionScopeInput,
  BulkSetEntriesEstimateScopedRequest,
  BulkEstimateScopeInput,
  CompleteEntryRequest,
  CreateProjectRequest,
  CurrentTaskChuteDayProjection,
  EntryProjection,
  EstablishInitialSectionConfigurationRequest,
  MoveEntryRequest,
  ProjectSummary,
  ReorderEntriesRequest,
  SectionProjection,
  StartEntryRequest,
  SetExecutionTimesRequest,
  UpdateTaskMetadataRequest,
  SetEntryEstimateRequest,
  SetEntryPlannedStartRequest,
  SectionConfigurationProjection,
  UpdateSectionConfigurationRequest,
  ConvertEntryToRoutineRequest,
  EndRoutineRequest,
  SetRoutineEstimateRequest,
  SetRoutineSectionPlanRequest,
} from "../shared/contracts";
import { isSamePlannedStartCohort } from "../shared/planned-entry-order";
import { advanceProjectionClock, calculateStartForecast, formatStartForecast } from "../shared/start-forecast";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";
import {
  DAY_COLUMN_DEFINITIONS,
  actualDurationSeconds,
  clampDayColumnWidth,
  clampTaskColumnWidth,
  dayTableStyle,
  formatActualDuration,
  formatActualTime,
  persistDayColumnPreference,
  readPersistedDayColumnPreference,
  resetDayColumnPreference,
  reorderDayColumns,
  setDayColumnVisibility,
  showAllDayColumns,
  visibleDayColumnOrder,
  type DayColumnKey,
  type DayColumnPreference,
  type DayTableResizeLayout,
} from "./day-columns";
import { RoutineBoard } from "./RoutineBoard";
import { ProjectBoard } from "./ProjectBoard";

export { DAY_COLUMNS_STORAGE_KEY } from "./day-columns";

type AuthState = "loading" | "signed-out" | "signed-in";
type AppView = "today" | "routines" | "settings";
type SettingsDestination = "section" | "project";
type FocusTarget = { kind: "section" | "entry"; id: string };
type DraftTask = { sectionId: string | null; title: string };
type DragEdge = "before" | "after";
type EntryDragState = {
  entryId: string;
  sectionId: string | null;
  targetEntryId: string | null;
  edge: DragEdge | null;
  targetSectionKey: string | null;
};
type MouseDragState = { entryId: string; sectionId: string | null; startX: number; startY: number; active: boolean };
type ColumnDragState = { sourceKey: DayColumnKey; targetKey: DayColumnKey | null; edge: DragEdge | null };
type ColumnResizeState = {
  key: DayColumnKey | "task";
  startX: number;
  startWidth: number;
  startTaskWidth: number;
  startTableWidth: number;
};
type InlineEditorAction = { key: string; action: "none" | "commit" | "cancel" };
type MutationScope = readonly string[];
type ActiveMutation = { token: string; scope: MutationScope; label: string };
type RoutineCandidate =
  | { entryId: string; unit: "estimate"; estimateSeconds: number | null }
  | { entryId: string; unit: "section-plan"; sectionId: string | null; plannedStartMinute: number | null };
type BulkRoutineScopeChoice = "occurrence" | "definition";
type BulkRoutineScopeDraft = {
  entryId: string;
  title: string;
  routineDefinitionId: string;
  expectedDefaultsRevision: number;
  scope: BulkRoutineScopeChoice | null;
};
type BulkEstimateConfirmation = {
  entryIds: string[];
  ordinaryCount: number;
  routineCount: number;
  estimateMinutes: string;
  routineScopes: BulkRoutineScopeDraft[];
};
type BulkDateMoveConfirmation = {
  entryIds: string[];
  targetLogicalDate: string;
  fallbackEntryIds: string[];
  preview: CurrentTaskChuteDayProjection | null;
  previewLoading: boolean;
  fallbackAcknowledged: boolean;
};
type ExecutionTimesDraft = {
  entryId: string;
  activeField: "start" | "end";
  executionId: string | null;
  executionOptions: Array<{ id: string; started_at: string; ended_at: string | null }>;
  expectedLifecycleState: SetExecutionTimesRequest["expected_lifecycle_state"];
  expectedStartedAt: string | null;
  expectedEndedAt: string | null;
  startedLocal: string;
  endedLocal: string;
};
type TaskMetadataDraft = {
  entryId: string;
  taskId: string;
  expectedTitle: string;
  expectedProjectId: string | null;
  title: string;
  projectId: string | null;
};
/**
 * Collapse state is a presentation-only preference. Keep it in a versioned
 * browser-local envelope so a future preference shape can be introduced
 * without interpreting an old value as current state.
 */
export const DAY_SECTION_COLLAPSE_STORAGE_KEY = "taskchute.web.day-section-collapse.v1";
const DAY_SECTION_COLLAPSE_STORAGE_VERSION = 1;
export const SIDEBAR_STORAGE_KEY = "taskchute.web.sidebar.v1";
const SIDEBAR_STORAGE_VERSION = 1;
const UNSECTIONED_SECTION_KEY = "unsectioned";
type CollapsedSectionsByDay = Record<string, Record<string, true>>;
type PersistedDaySectionCollapse = {
  version: 1;
  days: Record<string, string[]>;
};
type PersistedSidebarPreference = {
  version: 1;
  open: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalLogicalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

function readPersistedSidebarOpen(): boolean {
  if (typeof window === "undefined") return true;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  } catch {
    return true;
  }
  if (raw === null) return true;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== SIDEBAR_STORAGE_VERSION || typeof parsed.open !== "boolean") return true;
    return parsed.open;
  } catch {
    return true;
  }
}

function persistSidebarOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  const value: PersistedSidebarPreference = { version: SIDEBAR_STORAGE_VERSION, open };
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable or full; navigation remains usable in memory.
  }
}

function readPersistedCollapsedSections(): CollapsedSectionsByDay {
  if (typeof window === "undefined") return {};
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DAY_SECTION_COLLAPSE_STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw === null) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== DAY_SECTION_COLLAPSE_STORAGE_VERSION || !isRecord(parsed.days)) return {};
    const restored: CollapsedSectionsByDay = {};
    for (const [logicalDate, rawSectionKeys] of Object.entries(parsed.days)) {
      if (!isCanonicalLogicalDate(logicalDate) || !Array.isArray(rawSectionKeys)) continue;
      const sectionKeys = rawSectionKeys.filter(
        (sectionKey): sectionKey is string => typeof sectionKey === "string" && sectionKey.length > 0,
      );
      if (sectionKeys.length === 0) continue;
      restored[logicalDate] = Object.fromEntries(
        [...new Set(sectionKeys)].map((sectionKey) => [sectionKey, true]),
      );
    }
    return restored;
  } catch {
    return {};
  }
}

function persistCollapsedSections(collapsedSectionsByDay: CollapsedSectionsByDay): void {
  if (typeof window === "undefined") return;
  const days: Record<string, string[]> = {};
  for (const [logicalDate, sectionState] of Object.entries(collapsedSectionsByDay)) {
    const sectionKeys = Object.keys(sectionState).filter((sectionKey) => sectionState[sectionKey] === true);
    if (isCanonicalLogicalDate(logicalDate) && sectionKeys.length > 0) days[logicalDate] = sectionKeys;
  }
  const value: PersistedDaySectionCollapse = {
    version: DAY_SECTION_COLLAPSE_STORAGE_VERSION,
    days,
  };
  try {
    window.localStorage.setItem(DAY_SECTION_COLLAPSE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable or full; collapse interaction still works in memory.
  }
}

function isAmbiguousOutcome(caught: unknown): boolean {
  return !(caught instanceof ApiClientError) || caught.code === "infrastructure_ambiguous";
}

function projectionContainsOperation(projection: CurrentTaskChuteDayProjection, operation: AddTaskToDayRequest): boolean {
  return [...projection.unsectioned_entries, ...projection.sections.flatMap((section) => section.entries)].some(
    (entry) => entry.id === operation.entry_id && entry.task.id === operation.task_id,
  );
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function projectionEntries(projection: CurrentTaskChuteDayProjection): EntryProjection[] {
  return [...projection.unsectioned_entries, ...projection.sections.flatMap((section) => section.entries)];
}

function isBulkSelectableProjectionEntry(projection: CurrentTaskChuteDayProjection, entry: EntryProjection): boolean {
  return projection.establishment_state === "established"
    && projection.taskchute_day.id !== null
    && entry.lifecycle_state === "planned";
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (target instanceof HTMLElement && target.isContentEditable)
    || Boolean(target.closest("button, a, input, select, textarea, [contenteditable]"));
}

function focusKey(target: FocusTarget): string {
  return `${target.kind}:${target.id}`;
}

function executionLabel(entry: EntryProjection): string {
  if (entry.lifecycle_state === "planned") return `${entry.task.title}を開始`;
  if (entry.lifecycle_state === "running") return `${entry.task.title}を完了`;
  return `${entry.task.title}は完了済み`;
}

function canMoveEntry(entries: EntryProjection[], entryId: string, delta: -1 | 1): boolean {
  const from = entries.findIndex((entry) => entry.id === entryId);
  if (from < 0) return false;
  const entry = entries[from];
  const neighbor = entries[from + delta];
  return isSamePlannedStartCohort(entry, neighbor);
}

function buildDraggedEntryOrder(
  entries: EntryProjection[],
  sectionId: string | null,
  sourceEntryId: string,
  targetEntryId: string,
  edge: DragEdge,
): string[] | null {
  const source = entries.find((entry) => entry.id === sourceEntryId);
  const target = entries.find((entry) => entry.id === targetEntryId);
  if (!source || !target || source.id === target.id || source.section_id !== sectionId || target.section_id !== sectionId
    || !isSamePlannedStartCohort(source, target)) return null;
  const sourceIndex = entries.indexOf(source);
  const targetIndexInCanonical = entries.indexOf(target);
  const crossedEntries = entries.slice(Math.min(sourceIndex, targetIndexInCanonical), Math.max(sourceIndex, targetIndexInCanonical) + 1);
  if (!crossedEntries.every((entry) => isSamePlannedStartCohort(source, entry))) return null;
  const currentIds = entries.map((entry) => entry.id);
  const reorderedIds = currentIds.filter((id) => id !== sourceEntryId);
  const targetIndex = reorderedIds.indexOf(targetEntryId);
  if (targetIndex < 0) return null;
  reorderedIds.splice(targetIndex + (edge === "after" ? 1 : 0), 0, sourceEntryId);
  return reorderedIds.every((id, index) => id === currentIds[index]) ? null : reorderedIds;
}

function groupKey(sectionId: string | null): string { return sectionId ?? "unsectioned"; }

function shiftLogicalDate(logicalDate: string, days: number): string {
  return Temporal.PlainDate.from(logicalDate).add({ days }).toString();
}

function formatLogicalDateLabel(logicalDate: string): string {
  const date = Temporal.PlainDate.from(logicalDate);
  return `${date.year}年${date.month}月${date.day}日（${["月", "火", "水", "木", "金", "土", "日"][date.dayOfWeek - 1]}）`;
}

function calendarMonthDates(logicalDate: string): string[] {
  const monthStart = Temporal.PlainDate.from(logicalDate).with({ day: 1 });
  const gridStart = monthStart.subtract({ days: monthStart.dayOfWeek - 1 });
  return Array.from({ length: 42 }, (_, index) => gridStart.add({ days: index }).toString());
}

function formatCalendarMonth(logicalDate: string): string {
  const date = Temporal.PlainDate.from(logicalDate);
  return `${date.year}年${date.month}月`;
}

function formatLogicalMinute(value: number | null): string {
  if (value === null) return "時刻未設定";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function formatClockInputFromLogicalMinute(value: number | null): string {
  if (value === null) return "";
  const normalized = ((value % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

export function parseFourDigitClock(value: string): number | "invalid" {
  const trimmed = value.trim();
  if (!/^\d{4}$/.test(trimmed)) return "invalid";
  const hours = Number(trimmed.slice(0, 2));
  const minutes = Number(trimmed.slice(2, 4));
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : "invalid";
}

export function logicalMinuteFromClock(clockMinute: number, boundaryMinutes: number): number {
  const boundaryClock = ((boundaryMinutes % 1440) + 1440) % 1440;
  return clockMinute < boundaryClock ? clockMinute + 1440 : clockMinute;
}

export function formatActualClockInput(value: string | null, timezone: string): string {
  if (!value) return "";
  const local = Temporal.Instant.from(value).toZonedDateTimeISO(timezone);
  return `${String(local.hour).padStart(2, "0")}${String(local.minute).padStart(2, "0")}`;
}

function instantForClock(date: Temporal.PlainDate, clockMinute: number, timezone: string): string {
  return Temporal.PlainDateTime.from({ year: date.year, month: date.month, day: date.day,
    hour: Math.floor(clockMinute / 60), minute: clockMinute % 60, second: 0, millisecond: 0 })
    .toZonedDateTime(timezone).toInstant().toString({ smallestUnit: "millisecond" });
}

export function parseActualClockInput(value: string, timezone: string, logicalDate: string, boundaryMinutes: number,
  existingInstant: string | null, referenceStartInstant: string | null, field: string): string {
  const clockMinute = parseFourDigitClock(value);
  if (clockMinute === "invalid") throw new Error(`${field}は4桁のHHMMで入力してください`);
  try {
    const existingLocalDate = existingInstant
      ? Temporal.Instant.from(existingInstant).toZonedDateTimeISO(timezone).toPlainDate()
      : null;
    const referenceLocalDate = referenceStartInstant
      ? Temporal.Instant.from(referenceStartInstant).toZonedDateTimeISO(timezone).toPlainDate()
      : null;
    let date = existingLocalDate ?? referenceLocalDate;
    if (!date) {
      const logicalMinute = logicalMinuteFromClock(clockMinute, boundaryMinutes);
      date = Temporal.PlainDate.from(logicalDate).add({ days: Math.floor(logicalMinute / 1440) });
    }
    let candidate = instantForClock(date, clockMinute, timezone);
    if (!existingInstant && referenceStartInstant && Temporal.Instant.compare(candidate, referenceStartInstant) <= 0) {
      candidate = instantForClock(date.add({ days: 1 }), clockMinute, timezone);
    }
    return candidate;
  } catch {
    throw new Error(`${field}を正しい時刻で入力してください`);
  }
}

export function formatEstimate(seconds: number | null): string {
  if (!seconds) return "--分";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分`;
}

function EmptyValue({ label = "未設定", display = "—" }: { label?: string; display?: string }) {
  return <span className="empty-value" aria-label={label}>{display}</span>;
}

function renderEmptyValue(value: string, label?: string, placeholder = "—") {
  return value === placeholder ? <EmptyValue label={label} display={placeholder} /> : value;
}

function transientStatusText(pending: string | null): string | null {
  switch (pending) {
    case "project": return "Projectを作成・照合中…";
    case "project-settings": return "Project一覧を読み込み中…";
    case "section-settings": return "Section設定を読み込み・照合中…";
    case "reorder": return "並び替え・照合中…";
    case "task": return "Taskを追加・照合中…";
    case "duplicate": return "Taskを複製・照合中…";
    case "bulk-delete": return "選択したTaskを削除・照合中…";
    case "bulk-date-move": return "選択したTaskの日付を変更・照合中…";
    case "bulk-section": return "選択したTaskのSectionを変更・照合中…";
    case "bulk-estimate": return "選択したTaskの見積を変更・照合中…";
    case "start": return "開始・照合中…";
    case "complete": return "完了・照合中…";
    case "execution-times": return "実績時刻を保存・照合中…";
    case "task-metadata": return "Task情報を保存・照合中…";
    case "move": return "Section移動・照合中…";
    case "estimate": return "見積を保存・照合中…";
    case "planned-start": return "開始予定を保存・照合中…";
    case "routine-convert": return "Routine化・照合中…";
    case "routine-end": return "Routine終了・照合中…";
    case "routine-edit": return "Routine設定を保存・照合中…";
    case "day-navigation": return "日付を読み込み中…";
    default: return null;
  }
}

type ModalProps = {
  title: string;
  titleId: string;
  onClose: () => void;
  className?: string;
  id?: string;
  children: ReactNode;
};

function Modal({ title, titleId, onClose, className = "", id, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
    );
    (firstFocusable ?? modalRef.current)?.focus();
    return () => {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, []);

  useEffect(() => {
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const handleDocumentClick = (event: globalThis.MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", handleDocumentKeyDown);
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [onClose]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      modalRef.current?.focus();
      return;
    }
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusable[nextIndex]?.focus();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }} onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={modalRef} id={id} className={`modal panel ${className}`.trim()} role="dialog" aria-modal="true"
        aria-labelledby={titleId} tabIndex={-1} onKeyDown={handleKeyDown}>
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="secondary modal-close" aria-label="閉じる" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function parseLogicalTime(value: FormDataEntryValue | null): number | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 47 && minutes <= 59 ? hours * 60 + minutes : null;
}

function parsePlannedStart(value: string, boundaryMinutes: number): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const clockMinute = parseFourDigitClock(trimmed);
  if (clockMinute === "invalid") return "invalid";
  const logicalMinute = logicalMinuteFromClock(clockMinute, boundaryMinutes);
  return Number.isSafeInteger(logicalMinute)
    && logicalMinute >= boundaryMinutes && logicalMinute < boundaryMinutes + 1440
    ? logicalMinute : "invalid";
}

type PlannedStartOperation = {
  request: SetEntryPlannedStartRequest;
  expectedSectionId: string | null;
};

type SectionSettingsDraft = Omit<SectionConfigurationProjection, "items"> & {
  items: Array<Omit<SectionConfigurationProjection["items"][number], "logical_start_minute" | "logical_end_minute"> & {
    logical_start_text: string;
    logical_end_text: string;
  }>;
};

function sectionSettingsDraftFrom(configuration: SectionConfigurationProjection): SectionSettingsDraft {
  return {
    ...configuration,
    items: configuration.items.map(({ logical_start_minute, logical_end_minute, ...item }) => ({
      ...item,
      logical_start_text: formatLogicalMinute(logical_start_minute),
      logical_end_text: formatLogicalMinute(logical_end_minute),
    })),
  };
}

function parseSectionSettingsDraft(draft: SectionSettingsDraft | null): SectionConfigurationProjection | null {
  if (!draft || draft.items.length === 0) return null;
  const items = draft.items.map((item) => ({
    section_id: item.section_id,
    title: item.title.trim(),
    logical_start_minute: parseLogicalTime(item.logical_start_text),
    logical_end_minute: parseLogicalTime(item.logical_end_text),
  }));
  if (items.some((item) => item.logical_start_minute === null || item.logical_end_minute === null)) return null;
  const parsed = items as SectionConfigurationProjection["items"];
  const boundary = draft.day_boundary_minutes;
  if (parsed[0]?.logical_start_minute !== boundary
    || parsed[parsed.length - 1]?.logical_end_minute !== boundary + 1440
    || parsed.some((item, index) => item.title.length < 1 || item.title.length > 100
      || item.logical_start_minute >= item.logical_end_minute
      || (index > 0 && parsed[index - 1]?.logical_end_minute !== item.logical_start_minute))) return null;
  return { configuration_version_id: draft.configuration_version_id, day_boundary_minutes: boundary, items: parsed };
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [view, setView] = useState<AppView>("today");
  const [settingsDestination, setSettingsDestination] = useState<SettingsDestination>("section");
  const [day, setDay] = useState<CurrentTaskChuteDayProjection | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectOperation, setProjectOperation] = useState<CreateProjectRequest | null>(null);
  const [taskOperation, setTaskOperation] = useState<AddTaskToDayRequest | null>(null);
  const [duplicateOperation, setDuplicateOperation] = useState<DuplicateEntryRequest | null>(null);
  const [bulkDeleteOperation, setBulkDeleteOperation] = useState<BulkDeleteEntriesRequest | null>(null);
  const [bulkDateMoveOperation, setBulkDateMoveOperation] = useState<BulkMoveEntriesToDayRequest | null>(null);
  const [bulkSectionOperation, setBulkSectionOperation] = useState<BulkMoveEntriesToSectionRequest | null>(null);
  const [bulkSectionOccurrenceOperation, setBulkSectionOccurrenceOperation] = useState<BulkMoveEntriesToSectionOccurrenceRequest | null>(null);
  const [bulkSectionScopedOperation, setBulkSectionScopedOperation] = useState<BulkMoveEntriesToSectionScopedRequest | null>(null);
  const [bulkEstimateOperation, setBulkEstimateOperation] = useState<BulkSetEntriesEstimateScopedRequest | null>(null);
  const [bulkSectionPickerOpen, setBulkSectionPickerOpen] = useState(false);
  const [bulkConfirmation, setBulkConfirmation] = useState<{
    entryIds: string[];
    ordinaryCount: number;
    routineCount: number;
  } | null>(null);
  const [bulkSectionConfirmation, setBulkSectionConfirmation] = useState<{
    entryIds: string[];
    sectionId: string | null;
    ordinaryCount: number;
    routineCount: number;
    routineScopes: BulkRoutineScopeDraft[];
  } | null>(null);
  const [bulkEstimateConfirmation, setBulkEstimateConfirmation] = useState<BulkEstimateConfirmation | null>(null);
  const [bulkDateMoveConfirmation, setBulkDateMoveConfirmation] = useState<BulkDateMoveConfirmation | null>(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [reorderOperation, setReorderOperation] = useState<ReorderEntriesRequest | null>(null);
  const [startOperation, setStartOperation] = useState<StartEntryRequest | null>(null);
  const [completeOperation, setCompleteOperation] = useState<CompleteEntryRequest | null>(null);
  const [executionTimesOperation, setExecutionTimesOperation] = useState<SetExecutionTimesRequest | null>(null);
  const [taskMetadataOperation, setTaskMetadataOperation] = useState<UpdateTaskMetadataRequest | null>(null);
  const [retainedTaskMetadataOperations, setRetainedTaskMetadataOperations] = useState<UpdateTaskMetadataRequest[]>([]);
  const [configurationOperation, setConfigurationOperation] = useState<EstablishInitialSectionConfigurationRequest | null>(null);
  const [sectionMoveOperation, setSectionMoveOperation] = useState<MoveEntryRequest | null>(null);
  const [estimateOperation, setEstimateOperation] = useState<SetEntryEstimateRequest | null>(null);
  const [retainedEstimateOperations, setRetainedEstimateOperations] = useState<SetEntryEstimateRequest[]>([]);
  const [plannedStartOperation, setPlannedStartOperation] = useState<PlannedStartOperation | null>(null);
  const [sectionSettingsOperation, setSectionSettingsOperation] = useState<UpdateSectionConfigurationRequest | null>(null);
  const [routineConversionOperation, setRoutineConversionOperation] = useState<ConvertEntryToRoutineRequest | null>(null);
  const [routineEndOperation, setRoutineEndOperation] = useState<EndRoutineRequest | null>(null);
  const [routineEstimateOperation, setRoutineEstimateOperation] = useState<SetRoutineEstimateRequest | null>(null);
  const [retainedRoutineEstimateOperations, setRetainedRoutineEstimateOperations] = useState<SetRoutineEstimateRequest[]>([]);
  const [routineSectionPlanOperation, setRoutineSectionPlanOperation] = useState<SetRoutineSectionPlanRequest | null>(null);
  const [pendingTaskMetadataOverlays, setPendingTaskMetadataOverlays] = useState<Record<string, UpdateTaskMetadataRequest>>({});
  const [pendingEstimateOverlays, setPendingEstimateOverlays] = useState<Record<string, SetEntryEstimateRequest>>({});
  const [pendingPlannedStartOverlays, setPendingPlannedStartOverlays] = useState<Record<string, PlannedStartOperation>>({});
  const [pendingExecutionTimesOverlays, setPendingExecutionTimesOverlays] = useState<Record<string, SetExecutionTimesRequest>>({});
  const [overflowEntryId, setOverflowEntryId] = useState<string | null>(null);
  const [, setSectionSettings] = useState<SectionConfigurationProjection | null>(null);
  const [sectionSettingsDraft, setSectionSettingsDraft] = useState<SectionSettingsDraft | null>(null);
  const [sectionSettingsNotice, setSectionSettingsNotice] = useState<string | null>(null);
  const [editingEstimate, setEditingEstimate] = useState<{ entryId: string; minutes: string } | null>(null);
  const [editingPlannedStart, setEditingPlannedStart] = useState<{ entryId: string; value: string } | null>(null);
  const [executionTimesDraft, setExecutionTimesDraft] = useState<ExecutionTimesDraft | null>(null);
  const [taskMetadataDraft, setTaskMetadataDraft] = useState<TaskMetadataDraft | null>(null);
  const [executionEditorError, setExecutionEditorError] = useState<string | null>(null);
  const [routineDraft, setRoutineDraft] = useState<{ entryId: string; endDate: string } | null>(null);
  const [routineCandidate, setRoutineCandidate] = useState<RoutineCandidate | null>(null);
  const [pending, setPending] = useState<"login" | "project" | "project-settings" | "day-navigation" | "task" | "duplicate" | "bulk-delete" | "bulk-date-move" | "bulk-section" | "bulk-section-occurrence" | "bulk-section-scoped" | "bulk-estimate" | "reorder" | "start" | "complete" | "execution-times" | "task-metadata" | "configuration" | "section-settings" | "move" | "estimate" | "planned-start" | "routine-convert" | "routine-end" | "routine-edit" | "logout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftTask, setDraftTask] = useState<DraftTask | null>(null);
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const [collapsedSectionsByDay, setCollapsedSectionsByDay] = useState<CollapsedSectionsByDay>(readPersistedCollapsedSections);
  const [sidebarOpen, setSidebarOpen] = useState(readPersistedSidebarOpen);
  const [dayColumnPreference, setDayColumnPreference] = useState<DayColumnPreference>(readPersistedDayColumnPreference);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [columnDrag, setColumnDrag] = useState<ColumnDragState | null>(null);
  const [columnResize, setColumnResize] = useState<ColumnResizeState | null>(null);
  const [dayTableResizeLayout, setDayTableResizeLayout] = useState<DayTableResizeLayout | null>(null);
  const [entryDrag, setEntryDrag] = useState<EntryDragState | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarFocusedDate, setCalendarFocusedDate] = useState<string | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [currentLogicalDate, setCurrentLogicalDate] = useState<string | null>(null);
  const [forecastNowInstant, setForecastNowInstant] = useState<string | null>(null);
  const [pendingMutationCount, setPendingMutationCount] = useState(0);
  const [queuedMutationCount, setQueuedMutationCount] = useState(0);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const draftCompositionRef = useRef(false);
  const selectedLogicalDateRef = useRef<string | null>(null);
  const mouseDragRef = useRef<MouseDragState | null>(null);
  const calendarTriggerRef = useRef<HTMLButtonElement | null>(null);
  const calendarGridRef = useRef<HTMLDivElement | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement | null>(null);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const columnsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bulkHeaderRef = useRef<HTMLInputElement | null>(null);
  const bulkDeleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bulkDateMoveTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bulkSectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bulkEstimateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);
  const overflowMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const forecastClockRef = useRef<{ serverInstant: string; monotonicMilliseconds: number } | null>(null);
  const inlineEditorActionRef = useRef<InlineEditorAction | null>(null);
  const activeMutationsRef = useRef<ActiveMutation[]>([]);
  const reconcileSequenceRef = useRef(0);
  const queuedStartEntryRef = useRef<string | null>(null);
  const [queuedStartEntryId, setQueuedStartEntryId] = useState<string | null>(null);
  const drainingQueuedStartsRef = useRef(false);
  const retainedOperation = projectOperation ?? taskOperation ?? duplicateOperation ?? bulkDeleteOperation ?? bulkDateMoveOperation ?? bulkSectionOperation ?? bulkSectionOccurrenceOperation ?? bulkSectionScopedOperation ?? bulkEstimateOperation ?? reorderOperation ?? startOperation ?? completeOperation ?? executionTimesOperation ?? taskMetadataOperation ?? retainedTaskMetadataOperations[0] ?? retainedEstimateOperations[0]
    ?? configurationOperation ?? sectionSettingsOperation ?? sectionMoveOperation ?? estimateOperation ?? plannedStartOperation
    ?? routineConversionOperation ?? routineEndOperation ?? routineEstimateOperation ?? retainedRoutineEstimateOperations[0] ?? routineSectionPlanOperation;
  const globalPending = pending === "login" || pending === "project" || pending === "project-settings"
    || pending === "day-navigation" || pending === "configuration" || pending === "section-settings" || pending === "logout";
  const globalRetainedOperation = projectOperation !== null || configurationOperation !== null || sectionSettingsOperation !== null;
  const decisionModalOpen = shortcutHelpOpen || bulkSectionPickerOpen || bulkConfirmation !== null
    || bulkSectionConfirmation !== null || bulkEstimateConfirmation !== null || bulkDateMoveConfirmation !== null
    || routineDraft !== null || routineCandidate !== null;
  const mutationLocked = globalPending || globalRetainedOperation;

  function scopesConflict(left: MutationScope, right: MutationScope): boolean {
    return left.some((key) => right.includes(key));
  }

  function hasActiveMutationScope(scope: MutationScope): boolean {
    return activeMutationsRef.current.some((mutation) => scopesConflict(mutation.scope, scope));
  }

  function retainedMutationScopes(): MutationScope[] {
    const scopes: MutationScope[] = [];
    if (taskOperation) scopes.push(placementMutationScope(taskOperation.taskchute_day_id));
    if (duplicateOperation) scopes.push(placementMutationScope(duplicateOperation.taskchute_day_id));
    if (bulkDeleteOperation) scopes.push(placementMutationScope(bulkDeleteOperation.taskchute_day_id));
    if (bulkDateMoveOperation) scopes.push(placementMutationScope(bulkDateMoveOperation.source_taskchute_day_id));
    if (bulkSectionOperation) scopes.push(placementMutationScope(bulkSectionOperation.taskchute_day_id));
    if (bulkSectionOccurrenceOperation) scopes.push(placementMutationScope(bulkSectionOccurrenceOperation.taskchute_day_id));
    if (bulkSectionScopedOperation) scopes.push(placementMutationScope(bulkSectionScopedOperation.taskchute_day_id));
    if (bulkEstimateOperation) scopes.push(bulkEntryMutationScope(bulkEstimateOperation.entry_ids));
    if (reorderOperation) scopes.push(placementMutationScope(reorderOperation.taskchute_day_id));
    if (startOperation) scopes.push(executionMutationScope(startOperation.entry_id));
    if (completeOperation) scopes.push(executionMutationScope(completeOperation.entry_id));
    if (executionTimesOperation) scopes.push(executionMutationScope(executionTimesOperation.entry_id));
    if (taskMetadataOperation) scopes.push(entryMutationScope(taskMetadataOperation.entry_id, taskMetadataOperation.task_id));
    retainedTaskMetadataOperations.forEach((operation) => scopes.push(entryMutationScope(operation.entry_id, operation.task_id)));
    if (sectionMoveOperation) scopes.push(placementMutationScope(sectionMoveOperation.taskchute_day_id));
    if (estimateOperation) scopes.push(entryMutationScope(estimateOperation.entry_id));
    retainedEstimateOperations.forEach((operation) => scopes.push(entryMutationScope(operation.entry_id)));
    if (plannedStartOperation) scopes.push(placementMutationScope(plannedStartOperation.request.taskchute_day_id));
    if (routineConversionOperation) scopes.push(placementMutationScope(routineConversionOperation.taskchute_day_id));
    if (routineEndOperation) scopes.push([`routine:${routineEndOperation.routine_definition_id}`]);
    if (routineEstimateOperation) scopes.push(routineEstimateMutationScope(routineEstimateOperation));
    retainedRoutineEstimateOperations.forEach((operation) => scopes.push(routineEstimateMutationScope(operation)));
    if (routineSectionPlanOperation) scopes.push([...placementMutationScope(routineSectionPlanOperation.taskchute_day_id), `entry:${routineSectionPlanOperation.entry_id}`]);
    return scopes;
  }

  function isMutationScopeBusy(scope: MutationScope): boolean {
    return hasActiveMutationScope(scope) || retainedMutationScopes().some((retained) => scopesConflict(retained, scope));
  }

  function beginMutationScope(scope: MutationScope, label: string): string | null {
    if (hasActiveMutationScope(scope)) return null;
    const token = uuidv7();
    activeMutationsRef.current = [...activeMutationsRef.current, { token, scope, label }];
    setPendingMutationCount(activeMutationsRef.current.length);
    return token;
  }

  function endMutationScope(token: string): void {
    activeMutationsRef.current = activeMutationsRef.current.filter((mutation) => mutation.token !== token);
    setPendingMutationCount(activeMutationsRef.current.length);
  }

  function retainTaskMetadataOperation(operation: UpdateTaskMetadataRequest): void {
    setRetainedTaskMetadataOperations((current) => current.some((item) => item.operation_id === operation.operation_id)
      ? current : [...current, operation]);
  }

  function releaseTaskMetadataOperation(operationId: string): void {
    setRetainedTaskMetadataOperations((current) => current.filter((operation) => operation.operation_id !== operationId));
  }

  function clearTaskMetadataOperationIfCurrent(operationId: string): void {
    setTaskMetadataOperation((current) => current?.operation_id === operationId ? null : current);
  }

  function retainEstimateOperation(operation: SetEntryEstimateRequest): void {
    setRetainedEstimateOperations((current) => current.some((item) => item.operation_id === operation.operation_id)
      ? current : [...current, operation]);
  }

  function releaseEstimateOperation(operationId: string): void {
    setRetainedEstimateOperations((current) => current.filter((operation) => operation.operation_id !== operationId));
  }

  function clearEstimateOperationIfCurrent(operationId: string): void {
    setEstimateOperation((current) => current?.operation_id === operationId ? null : current);
  }

  function retainRoutineEstimateOperation(operation: SetRoutineEstimateRequest): void {
    setRetainedRoutineEstimateOperations((current) => current.some((item) => item.operation_id === operation.operation_id)
      ? current : [...current, operation]);
  }

  function releaseRoutineEstimateOperation(operationId: string): void {
    setRetainedRoutineEstimateOperations((current) => current.filter((operation) => operation.operation_id !== operationId));
  }

  function clearRoutineEstimateOperationIfCurrent(operationId: string): void {
    setRoutineEstimateOperation((current) => current?.operation_id === operationId ? null : current);
  }

  function setQueuedStartEntry(entryId: string | null): void {
    queuedStartEntryRef.current = entryId;
    setQueuedStartEntryId(entryId);
    setQueuedMutationCount(entryId ? 1 : 0);
  }

  function entryMutationScope(entryId: string, taskId?: string): MutationScope {
    return [`entry:${entryId}`, ...(taskId ? [`task:${taskId}`] : [])];
  }

  function executionMutationScope(entryId: string): MutationScope {
    return ["execution-lane", `entry:${entryId}`];
  }

  function placementMutationScope(taskchuteDayId = day?.taskchute_day.id ?? "selected-day"): MutationScope {
    return [`placement:${taskchuteDayId}`];
  }

  function routineMutationScope(entryId: string, routineDefinitionId?: string): MutationScope {
    return [`entry:${entryId}`, ...(routineDefinitionId ? [`routine:${routineDefinitionId}`] : [])];
  }

  function routineEstimateMutationScope(operation: SetRoutineEstimateRequest): MutationScope {
    return routineMutationScope(operation.entry_id, entryForId(day, operation.entry_id)?.routine?.routine_definition_id);
  }

  function bulkEntryMutationScope(entryIds: string[], routineDefinitionIds: string[] = []): MutationScope {
    return [...new Set([...entryIds.map((entryId) => `entry:${entryId}`), ...routineDefinitionIds.map((id) => `routine:${id}`)])];
  }

  function beginInlineEditor(key: string) {
    inlineEditorActionRef.current = { key, action: "none" };
  }

  function markInlineEditorAction(key: string, action: "commit" | "cancel") {
    inlineEditorActionRef.current = { key, action };
  }

  function shouldSkipInlineEditorBlur(key: string): boolean {
    const action = inlineEditorActionRef.current;
    if (!action || action.key !== key || action.action === "none") return false;
    inlineEditorActionRef.current = null;
    return true;
  }

  function handleInlineEditorEscape(key: string, close: () => void) {
    markInlineEditorAction(key, "cancel");
    close();
  }

  const transitionToSignedOut = useCallback(() => {
    selectedLogicalDateRef.current = null;
    setCurrentLogicalDate(null);
    setCalendarOpen(false);
    setCalendarFocusedDate(null);
    setShortcutHelpOpen(false);
    setDay(null);
    forecastClockRef.current = null;
    setForecastNowInstant(null);
    setView("today");
    setProject(null);
    setProjects([]);
    setProjectOperation(null);
    setTaskOperation(null);
    setDuplicateOperation(null);
    setBulkDeleteOperation(null);
    setBulkDateMoveOperation(null);
    setBulkSectionOperation(null);
    setBulkSectionOccurrenceOperation(null);
    setBulkSectionScopedOperation(null);
    setBulkEstimateOperation(null);
    setBulkSectionPickerOpen(false);
    setBulkConfirmation(null);
    setBulkSectionConfirmation(null);
    setBulkEstimateConfirmation(null);
    setBulkDateMoveConfirmation(null);
    setSelectedEntryIds([]);
    setReorderOperation(null);
    setStartOperation(null);
    setCompleteOperation(null);
    setExecutionTimesOperation(null);
    setTaskMetadataOperation(null);
    setRetainedTaskMetadataOperations([]);
    setOverflowEntryId(null);
    setConfigurationOperation(null);
    setSectionMoveOperation(null);
    setEstimateOperation(null);
    setRetainedEstimateOperations([]);
    setPlannedStartOperation(null);
    setSectionSettingsOperation(null);
    setSectionSettings(null);
    setSectionSettingsDraft(null);
    setSectionSettingsNotice(null);
    setRoutineConversionOperation(null);
    setRoutineEndOperation(null);
    setRoutineEstimateOperation(null);
    setRetainedRoutineEstimateOperations([]);
    setRoutineSectionPlanOperation(null);
    setRoutineDraft(null);
    setRoutineCandidate(null);
    setQueuedStartEntry(null);
    setDraftTask(null);
    setEditingEstimate(null);
    setEditingPlannedStart(null);
    setExecutionTimesDraft(null);
    setTaskMetadataDraft(null);
    setExecutionEditorError(null);
    setOverflowEntryId(null);
    setPendingFocusKey(null);
    // Keep browser-local presentation preferences across an auth transition;
    // the next authenticated Day projection prunes keys that are not valid
    // for that owner's stable Sections.
    setCollapsedSectionsByDay(readPersistedCollapsedSections());
    mouseDragRef.current = null;
    setEntryDrag(null);
    setAuthState("signed-out");
  }, []);

  const reconcile = useCallback(async (logicalDate = selectedLogicalDateRef.current) => {
    const requestSequence = ++reconcileSequenceRef.current;
    try {
      const projection = await api.loadDay(logicalDate ?? undefined);
      if (requestSequence !== reconcileSequenceRef.current) return projection;
      setDay(projection);
      setOverflowEntryId(null);
      selectedLogicalDateRef.current = projection.taskchute_day.logical_date;
      setSelectedEntryIds((current) => current.filter((id) => {
        const entry = projectionEntries(projection).find((candidate) => candidate.id === id);
        return entry ? isBulkSelectableProjectionEntry(projection, entry) : false;
      }));
      if (projection.is_current) setCurrentLogicalDate(projection.taskchute_day.logical_date);
      setAuthState("signed-in");
      return projection;
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        transitionToSignedOut();
        return null;
      }
      throw caught;
    }
  }, [transitionToSignedOut]);

  async function navigateToDay(logicalDate?: string) {
    if (pending !== null || retainedOperation !== null) return;
    setCalendarOpen(false);
    setShortcutHelpOpen(false);
    setOverflowEntryId(null);
    setPending("day-navigation");
    setError(null);
    setDraftTask(null);
    setSelectedEntryIds([]);
    setBulkConfirmation(null);
    setBulkDateMoveConfirmation(null);
    setBulkSectionConfirmation(null);
    setBulkSectionPickerOpen(false);
    setBulkSectionScopedOperation(null);
    setBulkEstimateConfirmation(null);
    setBulkEstimateOperation(null);
    setEditingEstimate(null);
    setEditingPlannedStart(null);
    setExecutionTimesDraft(null);
    setTaskMetadataDraft(null);
    setExecutionEditorError(null);
    setRoutineDraft(null);
    setRoutineCandidate(null);
    try {
      const projection = await api.loadDay(logicalDate);
      setDay(projection);
      selectedLogicalDateRef.current = projection.taskchute_day.logical_date;
      if (projection.is_current) setCurrentLogicalDate(projection.taskchute_day.logical_date);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) transitionToSignedOut();
      else setError(caught instanceof Error ? caught.message : "日付の読み込みに失敗しました");
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    void reconcile().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "読み込みに失敗しました");
      transitionToSignedOut();
    });
  }, [reconcile, transitionToSignedOut]);

  useEffect(() => {
    persistCollapsedSections(collapsedSectionsByDay);
  }, [collapsedSectionsByDay]);

  useEffect(() => {
    persistSidebarOpen(sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    persistDayColumnPreference(dayColumnPreference);
  }, [dayColumnPreference]);

  useEffect(() => {
    if (!columnsMenuOpen) return;
    const handleOutsideMouseDown = (event: globalThis.MouseEvent) => {
      if (!columnsMenuRef.current?.contains(event.target as Node)) setColumnsMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideMouseDown);
    return () => document.removeEventListener("mousedown", handleOutsideMouseDown);
  }, [columnsMenuOpen]);

  useEffect(() => {
    if (!overflowEntryId) return;
    overflowMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOverflowEntryId(null);
      requestAnimationFrame(() => overflowMenuTriggerRef.current?.focus());
    };
    const dismissOnOutsideMouseDown = (event: globalThis.MouseEvent) => {
      if (overflowMenuRef.current?.contains(event.target as Node) || overflowMenuTriggerRef.current?.contains(event.target as Node)) return;
      setOverflowEntryId(null);
    };
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("mousedown", dismissOnOutsideMouseDown);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("mousedown", dismissOnOutsideMouseDown);
    };
  }, [overflowEntryId]);

  useEffect(() => {
    if (!columnResize) return;
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const delta = event.clientX - columnResize.startX;
      const resizedWidth = columnResize.key === "task"
        ? clampTaskColumnWidth(columnResize.startWidth + delta)
        : clampDayColumnWidth(columnResize.key, columnResize.startWidth + delta);
      const effectiveDelta = resizedWidth - columnResize.startWidth;
      setDayColumnPreference((current) => columnResize.key === "task"
        ? { ...current, taskWidth: resizedWidth }
        : { ...current, widths: { ...current.widths, [columnResize.key]: resizedWidth } });
      setDayTableResizeLayout({
        taskWidth: columnResize.key === "task" ? resizedWidth : columnResize.startTaskWidth,
        tableWidth: columnResize.startTableWidth + effectiveDelta,
      });
    };
    const handleMouseUp = () => setColumnResize(null);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [columnResize]);

  useEffect(() => {
    if (!day) return;
    const logicalDate = day.taskchute_day.logical_date;
    const validSectionKeys = new Set([
      UNSECTIONED_SECTION_KEY,
      ...day.sections.map((section) => section.id),
    ]);
    setCollapsedSectionsByDay((current) => {
      const dayState = current[logicalDate];
      if (!dayState) return current;
      const retained = Object.fromEntries(
        Object.entries(dayState).filter(([sectionKey, collapsed]) => collapsed === true && validSectionKeys.has(sectionKey)),
      ) as Record<string, true>;
      const currentKeys = Object.keys(dayState);
      const retainedKeys = Object.keys(retained);
      if (currentKeys.length === retainedKeys.length && currentKeys.every((key) => retained[key] === true)) return current;
      const next = { ...current };
      if (retainedKeys.length > 0) next[logicalDate] = retained;
      else delete next[logicalDate];
      return next;
    });
  }, [day]);

  useEffect(() => {
    const eligibleCount = day
      ? projectionEntries(day).filter((entry) => isBulkSelectableProjectionEntry(day, entry)).length
      : 0;
    const selectedCount = day
      ? selectedEntryIds.filter((id) => projectionEntries(day).some((entry) => entry.id === id
        && isBulkSelectableProjectionEntry(day, entry))).length
      : 0;
    if (bulkHeaderRef.current) bulkHeaderRef.current.indeterminate = selectedCount > 0 && selectedCount < eligibleCount;
  }, [day, selectedEntryIds]);

  useEffect(() => {
    if (draftTask) draftInputRef.current?.focus();
  }, [draftTask?.sectionId]);

  useEffect(() => {
    if (!day) {
      forecastClockRef.current = null;
      setForecastNowInstant(null);
      return;
    }
    const anchor = { serverInstant: day.projection_generated_at, monotonicMilliseconds: performance.now() };
    forecastClockRef.current = anchor;
    setForecastNowInstant(anchor.serverInstant);
    if (!day.is_current) return;
    const timer = window.setInterval(() => {
      if (forecastClockRef.current !== anchor) return;
      setForecastNowInstant(advanceProjectionClock(anchor.serverInstant, performance.now() - anchor.monotonicMilliseconds));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [day]);

  useEffect(() => {
    if (!pendingFocusKey || !day) return;
    const target = document.querySelector<HTMLElement>(`[data-focus-key="${pendingFocusKey}"]`);
    if (target) {
      target.focus();
      setPendingFocusKey(null);
    }
  }, [day, pendingFocusKey, showCompleted]);

  useEffect(() => {
    if (!entryDrag || !day) return;
    const draggedEntry = [...day.unsectioned_entries, ...day.sections.flatMap((section) => section.entries)]
      .find((entry) => entry.id === entryDrag.entryId);
    if (!draggedEntry || draggedEntry.lifecycle_state !== "planned" || draggedEntry.section_id !== entryDrag.sectionId) {
      mouseDragRef.current = null;
      setEntryDrag(null);
    }
  }, [day, entryDrag?.entryId, entryDrag?.sectionId]);

  useEffect(() => {
    const clearMouseDrag = () => {
      if (!mouseDragRef.current) return;
      mouseDragRef.current = null;
      setEntryDrag(null);
    };
    window.addEventListener("mouseup", clearMouseDrag);
    return () => window.removeEventListener("mouseup", clearMouseDrag);
  }, []);

  useEffect(() => {
    if (!calendarOpen || !calendarFocusedDate) return;
    calendarGridRef.current?.querySelector<HTMLButtonElement>(`[data-calendar-date="${calendarFocusedDate}"]`)?.focus();
  }, [calendarOpen, calendarFocusedDate]);

  useEffect(() => {
    if (!calendarOpen) return;
    const dismissOnOutsideMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (calendarPopoverRef.current?.contains(target) || calendarTriggerRef.current?.contains(target)) return;
      closeCalendar();
    };
    document.addEventListener("mousedown", dismissOnOutsideMouseDown);
    return () => document.removeEventListener("mousedown", dismissOnOutsideMouseDown);
  }, [calendarOpen]);

  function openCalendar() {
    if (!day || mutationLocked) return;
    setCalendarFocusedDate(day.taskchute_day.logical_date);
    setCalendarOpen(true);
  }

  function closeCalendar() {
    setCalendarOpen(false);
    requestAnimationFrame(() => calendarTriggerRef.current?.focus());
  }

  async function selectCalendarDate(logicalDate: string) {
    setCalendarOpen(false);
    await navigateToDay(logicalDate);
    requestAnimationFrame(() => calendarTriggerRef.current?.focus());
  }

  function handleCalendarKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!calendarFocusedDate) return;
    let nextDate: string | null = null;
    switch (event.key) {
      case "ArrowLeft": nextDate = shiftLogicalDate(calendarFocusedDate, -1); break;
      case "ArrowRight": nextDate = shiftLogicalDate(calendarFocusedDate, 1); break;
      case "ArrowUp": nextDate = shiftLogicalDate(calendarFocusedDate, -7); break;
      case "ArrowDown": nextDate = shiftLogicalDate(calendarFocusedDate, 7); break;
      case "PageUp": nextDate = Temporal.PlainDate.from(calendarFocusedDate).subtract(event.shiftKey ? { years: 1 } : { months: 1 }).toString(); break;
      case "PageDown": nextDate = Temporal.PlainDate.from(calendarFocusedDate).add(event.shiftKey ? { years: 1 } : { months: 1 }).toString(); break;
      case "Enter":
        event.preventDefault(); event.stopPropagation();
        void selectCalendarDate(calendarFocusedDate);
        return;
      case "Escape":
        event.preventDefault(); event.stopPropagation(); closeCalendar();
        return;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    setCalendarFocusedDate(nextDate);
  }

  function shiftCalendarViewport(unit: "month" | "year", amount: number) {
    if (!calendarFocusedDate) return;
    setCalendarFocusedDate(Temporal.PlainDate.from(calendarFocusedDate).add(unit === "month" ? { months: amount } : { years: amount }).toString());
  }

  async function openTodayView() {
    if (mutationLocked) return;
    setView("today");
    await navigateToDay();
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("login");
    setError(null);
    try {
      await api.login(String(form.get("email")), String(form.get("password")));
      await reconcile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインに失敗しました");
    } finally {
      setPending(null);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationLocked) return;
    const title = String(new FormData(event.currentTarget).get("title")).trim();
    const operation = { operation_id: uuidv7(), project_id: uuidv7(), title };
    setProjectOperation(operation);
    await executeCreateProject(operation);
  }

  async function executeCreateProject(operation: CreateProjectRequest) {
    setPending("project");
    setError(null);
    try {
      const created = await api.createProject(operation);
      setProject(created.project);
      setProjects((current) => current.some((candidate) => candidate.id === created.project.id)
        ? current : [...current, created.project]);
      setProjectOperation(null);
      document.querySelector<HTMLFormElement>(".settings-project-form")?.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project作成に失敗しました");
      if (!isAmbiguousOutcome(caught)) setProjectOperation(null);
      if (!(caught instanceof ApiClientError) || caught.reconcile) {
        try {
          const projection = await api.loadProjects();
          setProjects(projection.projects);
          if (projection.projects.some((candidate) => candidate.id === operation.project_id)) {
            setProjectOperation(null);
            setProject(projection.projects.find((candidate) => candidate.id === operation.project_id) ?? null);
            setError(null);
          }
        } catch { /* Preserve the original mutation outcome. */ }
      }
    } finally {
      setPending(null);
    }
  }

  async function executeAddTask(operation: AddTaskToDayRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.taskchute_day_id), "Task追加");
    if (!mutationToken) return;
    setPending("task");
    setError(null);
    try {
      await api.addTask(operation);
      await reconcile();
      setTaskOperation(null);
      setDraftTask(null);
      setPendingFocusKey(focusKey({ kind: "entry", id: operation.entry_id }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task追加に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setTaskOperation(null);
      try {
        const projection = await reconcile();
        if (ambiguous && projection && projectionContainsOperation(projection, operation)) {
          setTaskOperation(null);
          setDraftTask(null);
          setError(null);
          setPendingFocusKey(focusKey({ kind: "entry", id: operation.entry_id }));
        }
      } catch {
        // Keep the original mutation outcome visible and preserve its logical identity.
      }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function executeDuplicate(operation: DuplicateEntryRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.taskchute_day_id), "Task複製");
    if (!mutationToken) return;
    setPending("duplicate");
    setError(null);
    try {
      await api.duplicateEntry(operation);
      await reconcile();
      setDuplicateOperation(null);
      setPendingFocusKey(focusKey({ kind: "entry", id: operation.new_entry_id }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task複製に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setDuplicateOperation(null);
      try {
        const projection = await reconcile();
        if (ambiguous && projection && [...projection.unsectioned_entries, ...projection.sections.flatMap((section) => section.entries)]
          .some((entry) => entry.id === operation.new_entry_id && entry.task.id === operation.new_task_id)) {
          setDuplicateOperation(null);
          setError(null);
          setPendingFocusKey(focusKey({ kind: "entry", id: operation.new_entry_id }));
        }
      } catch { /* Keep the exact logical operation for retry. */ }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function executeBulkDelete(operation: BulkDeleteEntriesRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.taskchute_day_id), "Bulk削除");
    if (!mutationToken) return;
    setPending("bulk-delete");
    setBulkConfirmation(null);
    setError(null);
    try {
      await api.bulkDeleteEntries(operation);
      const projection = await reconcile();
      setBulkDeleteOperation(null);
      setSelectedEntryIds([]);
      const focusGroup = projection?.unsectioned_entries.length
        ? groupKey(null)
        : projection?.sections[0] ? groupKey(projection.sections[0].id) : null;
      if (focusGroup) setPendingFocusKey(focusKey({ kind: "section", id: focusGroup }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "選択したTaskの削除に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setBulkDeleteOperation(null);
      try {
        const projection = await reconcile();
        const remaining = projection
          ? operation.entry_ids.some((id) => projectionEntries(projection).some((entry) => entry.id === id))
          : true;
        if (ambiguous && projection && !remaining) {
          setBulkDeleteOperation(null);
          setSelectedEntryIds([]);
          setError(null);
        } else if (caught instanceof ApiClientError && caught.code === "revision_conflict") {
          setBulkDeleteOperation(null);
          setError("Dayの内容が変わったため、選択状態を確認してから再度実行してください。");
        }
      } catch {
        // Preserve the exact logical operation for retry when reconciliation is unavailable.
      }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function executeBulkDateMove(operation: BulkMoveEntriesToDayRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.source_taskchute_day_id), "Bulk日付変更");
    if (!mutationToken) return;
    setPending("bulk-date-move");
    setBulkDateMoveConfirmation(null);
    setError(null);
    try {
      await api.bulkMoveEntriesToDay(operation);
      await reconcile(operation.target_logical_date);
      setBulkDateMoveOperation(null);
      setSelectedEntryIds([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "選択したTaskの日付変更に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setBulkDateMoveOperation(null);
      try {
        const projection = await reconcile(operation.target_logical_date);
        const converged = projection && operation.entry_ids.every((entryId) =>
          projectionEntries(projection).some((entry) => entry.id === entryId));
        if (ambiguous && converged) {
          setBulkDateMoveOperation(null);
          setSelectedEntryIds([]);
          setError(null);
        } else if (caught instanceof ApiClientError && caught.code === "revision_conflict") {
          setBulkDateMoveOperation(null);
          setError("Dayの内容が変わったため、日付変更の対象を確認してから再度実行してください。");
        }
      } catch {
        // Preserve the exact logical operation when reconciliation is unavailable.
      }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function executeBulkSectionChange(operation: BulkMoveEntriesToSectionRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.taskchute_day_id), "Bulk Section変更");
    if (!mutationToken) return;
    setPending("bulk-section");
    setBulkSectionPickerOpen(false);
    setError(null);
    try {
      await api.bulkMoveEntriesToSection(operation);
      await reconcile();
      setBulkSectionOperation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "選択したTaskのSection変更に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setBulkSectionOperation(null);
      try {
        const projection = await reconcile();
        const converged = projection && operation.entry_ids.every((id) => {
          const entry = projectionEntries(projection).find((candidate) => candidate.id === id);
          return entry?.routine === null && entry.section_id === operation.section_id
            && entry.planned_start_minute === (operation.section_id === null
              ? null
              : projection.sections.find((section) => section.id === operation.section_id)?.logical_start_minute);
        });
        if (ambiguous && converged) {
          setBulkSectionOperation(null);
          setError(null);
        } else if (caught instanceof ApiClientError && caught.code === "revision_conflict") {
          setBulkSectionOperation(null);
          setError("Dayの内容が変わったため、選択状態を確認してから再度実行してください。");
        }
      } catch {
        // Preserve the exact logical operation for retry when reconciliation is unavailable.
      }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function executeBulkSectionOccurrenceChange(operation: BulkMoveEntriesToSectionOccurrenceRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.taskchute_day_id), "Bulk Routine Section変更");
    if (!mutationToken) return;
    setPending("bulk-section-occurrence");
    setBulkSectionConfirmation(null);
    setBulkSectionPickerOpen(false);
    setError(null);
    try {
      await api.bulkMoveEntriesToSectionOccurrence(operation);
      await reconcile();
      setBulkSectionOccurrenceOperation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Routineを含む選択のSection変更に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setBulkSectionOccurrenceOperation(null);
      try {
        const projection = await reconcile();
        const targetPlannedStart = operation.section_id === null
          ? null
          : projection?.sections.find((section) => section.id === operation.section_id)?.logical_start_minute;
        const converged = projection && operation.entry_ids.every((id) => {
          const entry = projectionEntries(projection).find((candidate) => candidate.id === id);
          return entry?.section_id === operation.section_id
            && entry.planned_start_minute === targetPlannedStart
            && (entry.routine === null || entry.routine.section_plan_override_present);
        });
        if (ambiguous && converged) {
          setBulkSectionOccurrenceOperation(null);
          setError(null);
        } else if (caught instanceof ApiClientError && caught.code === "revision_conflict") {
          setBulkSectionOccurrenceOperation(null);
          setError("Dayの内容が変わったため、選択状態を確認してから再度実行してください。");
        }
      } catch {
        // Preserve the exact logical operation for retry when reconciliation is unavailable.
      }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function executeBulkSectionScopedChange(operation: BulkMoveEntriesToSectionScopedRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.taskchute_day_id), "RoutineごとのBulk Section変更");
    if (!mutationToken) return;
    setPending("bulk-section-scoped");
    setBulkSectionConfirmation(null);
    setBulkSectionPickerOpen(false);
    setError(null);
    try {
      await api.bulkMoveEntriesToSectionScoped(operation);
      await reconcile();
      setBulkSectionScopedOperation(null);
    } catch (caught) {
      setError(caught instanceof ApiClientError && caught.code === "revision_conflict"
        ? "Routine設定またはDayの内容が変わったため、scopeを確認してから再度実行してください。"
        : caught instanceof Error ? caught.message : "RoutineごとのSection変更に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setBulkSectionScopedOperation(null);
      try {
        const projection = await reconcile();
        const targetPlannedStart = operation.section_id === null
          ? null
          : projection?.sections.find((section) => section.id === operation.section_id)?.logical_start_minute;
        const converged = projection && operation.entry_ids.every((id) => {
          const entry = projectionEntries(projection).find((candidate) => candidate.id === id);
          return entry?.section_id === operation.section_id && entry.planned_start_minute === targetPlannedStart;
        });
        if (ambiguous && converged) {
          setBulkSectionScopedOperation(null);
          setError(null);
        }
      } catch {
        // Preserve the exact scoped operation for retry when reconciliation is unavailable.
      }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function executeBulkEstimateChange(operation: BulkSetEntriesEstimateScopedRequest) {
    const mutationToken = beginMutationScope(bulkEntryMutationScope(operation.entry_ids, operation.routine_scopes.map((scope) => {
      const entry = entryForId(day, scope.entry_id);
      return entry?.routine?.routine_definition_id ?? "";
    }).filter(Boolean)), "Bulk見積変更");
    if (!mutationToken) return;
    setPending("bulk-estimate");
    setBulkEstimateConfirmation(null);
    setError(null);
    try {
      await api.bulkSetEntriesEstimateScoped(operation, day?.is_current ? undefined : day?.taskchute_day.logical_date);
      await reconcile();
      setBulkEstimateOperation(null);
    } catch (caught) {
      setError(caught instanceof ApiClientError && caught.code === "revision_conflict"
        ? "Routine設定が変わったため、scopeを確認してから再度実行してください。"
        : caught instanceof Error ? caught.message : "選択したTaskの見積変更に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setBulkEstimateOperation(null);
      try {
        const projection = await reconcile();
        const converged = projection && operation.entry_ids.every((entryId) => {
          const entry = projectionEntries(projection).find((candidate) => candidate.id === entryId);
          return entry?.estimate_seconds === operation.estimate_seconds;
        }) && operation.routine_scopes.every((scope) => {
          const entry = projectionEntries(projection).find((candidate) => candidate.id === scope.entry_id);
          if (!entry?.routine) return false;
          return scope.scope === "occurrence"
            ? entry.routine.estimate_override_present && entry.estimate_seconds === operation.estimate_seconds
            : !entry.routine.estimate_override_present
              && entry.routine.default_estimate_seconds === operation.estimate_seconds;
        });
        if (ambiguous && converged) {
          setBulkEstimateOperation(null);
          setError(null);
        }
      } catch {
        // Preserve the exact logical operation for retry when reconciliation is unavailable.
      }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  function toggleBulkEntry(entry: EntryProjection) {
    if (!day || mutationLocked || !isBulkSelectableProjectionEntry(day, entry)) return;
    setSelectedEntryIds((current) => current.includes(entry.id)
      ? current.filter((id) => id !== entry.id)
      : [...current, entry.id]);
  }

  function clearBulkSelection() {
    if (mutationLocked) return;
    setSelectedEntryIds([]);
  }

  function toggleAllBulkEntries() {
    if (!day || mutationLocked) return;
    const eligibleIds = projectionEntries(day)
      .filter((entry) => isBulkSelectableProjectionEntry(day, entry))
      .map((entry) => entry.id);
    const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selectedEntryIds.includes(id));
    setSelectedEntryIds(allSelected ? [] : eligibleIds);
  }

  function openBulkConfirmation() {
    if (!day || mutationLocked || isMutationScopeBusy(placementMutationScope()) || !day.planning_enabled) return;
    const eligibleEntries = new Map(projectionEntries(day)
      .filter((entry) => isBulkSelectableProjectionEntry(day, entry))
      .map((entry) => [entry.id, entry]));
    const entryIds = selectedEntryIds.filter((id) => eligibleEntries.has(id));
    if (entryIds.length === 0) return;
    setBulkConfirmation({
      entryIds,
      ordinaryCount: entryIds.filter((id) => eligibleEntries.get(id)?.routine === null).length,
      routineCount: entryIds.filter((id) => eligibleEntries.get(id)?.routine !== null).length,
    });
  }

  function dateMoveFallbackIds(preview: CurrentTaskChuteDayProjection, entryIds: string[]): string[] {
    const availableSections = new Set(preview.sections
      .filter((section) => section.logical_start_minute !== null && section.logical_end_minute !== null)
      .map((section) => section.id));
    return entryIds.filter((entryId) => {
      const entry = projectionEntries(day!).find((candidate) => candidate.id === entryId);
      return entry?.section_id !== null && entry?.section_id !== undefined && !availableSections.has(entry.section_id);
    });
  }

  async function refreshDateMovePreview(targetLogicalDate: string, entryIds: string[]) {
    if (!day) return;
    setBulkDateMoveConfirmation((current) => current ? { ...current, targetLogicalDate } : current);
    const sourceDate = day.taskchute_day.logical_date;
    const minimumDate = currentLogicalDate ?? (day.is_current ? sourceDate : null);
    if (!isCanonicalLogicalDate(targetLogicalDate) || targetLogicalDate === sourceDate
      || (minimumDate !== null && targetLogicalDate < minimumDate)) {
    setBulkDateMoveConfirmation((current) => current
        ? { ...current, preview: null, fallbackEntryIds: [], previewLoading: false, fallbackAcknowledged: false } : current);
      setError(targetLogicalDate === sourceDate
        ? "日付変更先は現在のDayと異なる日付を指定してください"
        : "日付変更先には今日以降の正しい日付を指定してください");
      return;
    }
    setBulkDateMoveConfirmation((current) => current && current.targetLogicalDate === targetLogicalDate
      ? { ...current, preview: null, fallbackEntryIds: [], previewLoading: true, fallbackAcknowledged: false } : current);
    try {
      const preview = await api.loadDay(targetLogicalDate);
      setBulkDateMoveConfirmation((current) => current && current.targetLogicalDate === targetLogicalDate
        ? {
          ...current,
          preview,
          fallbackEntryIds: preview.establishment_state === "past_record_none" ? entryIds : dateMoveFallbackIds(preview, entryIds),
          previewLoading: false,
        } : current);
      if (preview.establishment_state === "past_record_none") setError("記録のない過去日は日付変更先にできません");
      else setError(null);
    } catch (caught) {
      setBulkDateMoveConfirmation((current) => current && current.targetLogicalDate === targetLogicalDate
        ? { ...current, preview: null, fallbackEntryIds: [], previewLoading: false, fallbackAcknowledged: false } : current);
      setError(caught instanceof Error ? caught.message : "日付変更先のプレビューに失敗しました");
    }
  }

  function openBulkDateMove(entryIds = selectedBulkEntries.map((entry) => entry.id)) {
    if (!day || mutationLocked || isMutationScopeBusy(placementMutationScope()) || entryIds.length === 0
      || !entryIds.every((entryId) => projectionEntries(day).some((entry) => entry.id === entryId
        && isBulkSelectableProjectionEntry(day, entry)))) return;
    const sourceDate = day.taskchute_day.logical_date;
    const targetDate = currentLogicalDate && sourceDate < currentLogicalDate
      ? currentLogicalDate : shiftLogicalDate(sourceDate, 1);
    setError(null);
    setBulkDateMoveConfirmation({ entryIds, targetLogicalDate: targetDate, fallbackEntryIds: [], preview: null, previewLoading: true, fallbackAcknowledged: false });
    void refreshDateMovePreview(targetDate, entryIds);
  }

  function confirmBulkDateMove() {
    if (!day?.taskchute_day.id || !bulkDateMoveConfirmation || bulkDateMoveConfirmation.preview === null
      || bulkDateMoveConfirmation.preview.establishment_state === "past_record_none"
      || bulkDateMoveConfirmation.previewLoading
      || (bulkDateMoveConfirmation.fallbackEntryIds.length > 0 && !bulkDateMoveConfirmation.fallbackAcknowledged)
      || isMutationScopeBusy(placementMutationScope()) || bulkDateMoveOperation !== null) return;
    const operation: BulkMoveEntriesToDayRequest = {
      operation_id: uuidv7(),
      source_taskchute_day_id: day.taskchute_day.id,
      entry_ids: bulkDateMoveConfirmation.entryIds,
      target_logical_date: bulkDateMoveConfirmation.targetLogicalDate,
      expected_source_placement_revision: day.placement_revision,
      allow_section_fallback: bulkDateMoveConfirmation.fallbackAcknowledged,
    };
    setBulkDateMoveOperation(operation);
    void executeBulkDateMove(operation);
  }

  function openSingleDelete(entry: EntryProjection) {
    if (!day?.planning_enabled || !isBulkSelectableProjectionEntry(day, entry) || mutationLocked
      || isMutationScopeBusy(placementMutationScope())) return;
    setSelectedEntryIds([entry.id]);
    setBulkConfirmation({ entryIds: [entry.id], ordinaryCount: entry.routine === null ? 1 : 0, routineCount: entry.routine === null ? 0 : 1 });
  }

  function confirmBulkDelete() {
    if (!day?.taskchute_day.id || !bulkConfirmation || isMutationScopeBusy(placementMutationScope()) || bulkDeleteOperation !== null) return;
    const operation: BulkDeleteEntriesRequest = {
      operation_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id,
      entry_ids: bulkConfirmation.entryIds,
      expected_placement_revision: day.placement_revision,
    };
    setBulkDeleteOperation(operation);
    void executeBulkDelete(operation);
  }

  function closeBulkSectionPicker(returnFocus = false) {
    setBulkSectionPickerOpen(false);
    if (returnFocus) requestAnimationFrame(() => bulkSectionTriggerRef.current?.focus());
  }

  function openBulkSectionPicker() {
    if (!day || !day.planning_enabled || mutationLocked || isMutationScopeBusy(placementMutationScope()) || selectedBulkEntries.length === 0
      || selectedBulkEntries.length !== selectedEntryIds.length
      || (selectedBulkEntries.some((entry) => entry.routine !== null) && !day.is_current)) return;
    setError(null);
    setBulkSectionPickerOpen(true);
  }

  function chooseBulkSection(sectionId: string | null) {
    if (!day?.taskchute_day.id || mutationLocked || isMutationScopeBusy(placementMutationScope()) || selectedBulkEntries.length === 0
      || selectedBulkEntries.length !== selectedEntryIds.length) return;
    const routineCount = selectedBulkEntries.filter((entry) => entry.routine !== null).length;
    if (routineCount > 0) {
      if (!day.is_current) return;
      setBulkSectionPickerOpen(false);
      setBulkSectionConfirmation({
        entryIds: selectedBulkEntries.map((entry) => entry.id),
        sectionId,
        ordinaryCount: selectedBulkEntries.length - routineCount,
        routineCount,
        routineScopes: selectedBulkEntries.filter((entry) => entry.routine !== null).map((entry) => ({
          entryId: entry.id,
          title: entry.task.title,
          routineDefinitionId: entry.routine!.routine_definition_id,
          expectedDefaultsRevision: entry.routine!.defaults_revision,
          scope: null,
        })),
      });
      return;
    }
    const operation: BulkMoveEntriesToSectionRequest = {
      operation_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id,
      entry_ids: selectedBulkEntries.map((entry) => entry.id),
      section_id: sectionId,
      expected_placement_revision: day.placement_revision,
    };
    setBulkSectionOperation(operation);
    void executeBulkSectionChange(operation);
  }

  function setBulkRoutineScope(entryId: string, scope: BulkRoutineScopeChoice) {
    setBulkSectionConfirmation((current) => {
      if (!current) return current;
      const target = current.routineScopes.find((item) => item.entryId === entryId);
      if (!target) return current;
      return {
        ...current,
        routineScopes: current.routineScopes.map((item) => item.routineDefinitionId === target.routineDefinitionId
          ? { ...item, scope }
          : item),
      };
    });
  }

  function fillBulkRoutineScopes(scope: BulkRoutineScopeChoice) {
    setBulkSectionConfirmation((current) => current
      ? { ...current, routineScopes: current.routineScopes.map((item) => ({ ...item, scope })) }
      : current);
  }

  function confirmBulkSectionScopedChange() {
    if (!day?.taskchute_day.id || !bulkSectionConfirmation || isMutationScopeBusy(placementMutationScope())
      || bulkSectionScopedOperation !== null
      || bulkSectionConfirmation.routineScopes.some((item) => item.scope === null)) return;
    const routineScopes: BulkRoutineSectionScopeInput[] = bulkSectionConfirmation.routineScopes.map((item) => {
      if (item.scope === "definition") return {
        entry_id: item.entryId, scope: item.scope, expected_defaults_revision: item.expectedDefaultsRevision,
      };
      return { entry_id: item.entryId, scope: "occurrence" };
    });
    const operation: BulkMoveEntriesToSectionScopedRequest = {
      operation_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id,
      entry_ids: bulkSectionConfirmation.entryIds,
      section_id: bulkSectionConfirmation.sectionId,
      routine_scopes: routineScopes,
      expected_placement_revision: day.placement_revision,
    };
    setBulkSectionScopedOperation(operation);
    void executeBulkSectionScopedChange(operation);
  }

  function openBulkEstimateConfirmation() {
    if (!day || !day.planning_enabled || mutationLocked || isMutationScopeBusy(bulkEntryMutationScope(selectedBulkEntries.map((entry) => entry.id))) || selectedBulkEntries.length === 0
      || selectedBulkEntries.length !== selectedEntryIds.length
      || (selectedBulkEntries.some((entry) => entry.routine !== null) && !day.is_current)) return;
    setError(null);
    setBulkEstimateConfirmation({
      entryIds: selectedBulkEntries.map((entry) => entry.id),
      ordinaryCount: selectedBulkEntries.filter((entry) => entry.routine === null).length,
      routineCount: selectedBulkEntries.filter((entry) => entry.routine !== null).length,
      estimateMinutes: "",
      routineScopes: selectedBulkEntries.filter((entry) => entry.routine !== null).map((entry) => ({
        entryId: entry.id,
        title: entry.task.title,
        routineDefinitionId: entry.routine!.routine_definition_id,
        expectedDefaultsRevision: entry.routine!.defaults_revision,
        scope: null,
      })),
    });
  }

  function setBulkEstimateScope(entryId: string, scope: BulkRoutineScopeChoice) {
    setBulkEstimateConfirmation((current) => current
      ? { ...current, routineScopes: current.routineScopes.map((item) => item.entryId === entryId ? { ...item, scope } : item) }
      : current);
  }

  function fillBulkEstimateScopes(scope: BulkRoutineScopeChoice) {
    setBulkEstimateConfirmation((current) => current
      ? { ...current, routineScopes: current.routineScopes.map((item) => ({ ...item, scope })) }
      : current);
  }

  function confirmBulkEstimateChange() {
    if (!day?.taskchute_day.id || !bulkEstimateConfirmation || isMutationScopeBusy(bulkEntryMutationScope(bulkEstimateConfirmation.entryIds)) || bulkEstimateOperation !== null
      || bulkEstimateConfirmation.routineScopes.some((item) => item.scope === null)) return;
    const trimmedMinutes = bulkEstimateConfirmation.estimateMinutes.trim();
    let estimateSeconds: number | null = null;
    if (trimmedMinutes !== "") {
      const minutes = Number(trimmedMinutes);
      if (!/^\d+$/.test(trimmedMinutes) || !Number.isSafeInteger(minutes) || minutes <= 0) {
        setError("見積は1以上の整数（分）で入力するか、空欄で見積なしにしてください");
        return;
      }
      estimateSeconds = minutes * 60;
    }
    const routineScopes: BulkEstimateScopeInput[] = bulkEstimateConfirmation.routineScopes.map((item) => item.scope === "definition"
      ? { entry_id: item.entryId, scope: "definition", expected_defaults_revision: item.expectedDefaultsRevision }
      : { entry_id: item.entryId, scope: "occurrence" });
    const operation: BulkSetEntriesEstimateScopedRequest = {
      operation_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id,
      entry_ids: bulkEstimateConfirmation.entryIds,
      estimate_seconds: estimateSeconds,
      routine_scopes: routineScopes,
    };
    setBulkEstimateOperation(operation);
    void executeBulkEstimateChange(operation);
  }

  function duplicate(entry: EntryProjection) {
    const eligibleCompleted = day?.is_current && entry.lifecycle_state === "completed";
    if (!day?.taskchute_day.id || !day.planning_enabled || (!eligibleCompleted && entry.lifecycle_state !== "planned") || mutationLocked
      || isMutationScopeBusy(placementMutationScope())) return;
    const operation: DuplicateEntryRequest = {
      operation_id: uuidv7(), source_entry_id: entry.id, new_task_id: uuidv7(), new_entry_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id, expected_placement_revision: day.placement_revision,
    };
    setDuplicateOperation(operation);
    void executeDuplicate(operation);
  }

  async function commitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!day || !draftTask || mutationLocked || isMutationScopeBusy(placementMutationScope()) || !day.planning_enabled) return;
    const title = draftTask.title.trim();
    if (!title) return;
    const targetingNonCurrentDay = !day.is_current;
    const targetDayId = day.taskchute_day.id ?? uuidv7();
    const operation: AddTaskToDayRequest = {
      operation_id: uuidv7(),
      task_id: uuidv7(),
      entry_id: uuidv7(),
      project_id: null,
      title,
      taskchute_day_id: targetDayId,
      ...(targetingNonCurrentDay ? { logical_date: day.taskchute_day.logical_date } : {}),
      section_id: draftTask.sectionId,
      expected_placement_revision: day.placement_revision,
    };
    setTaskOperation(operation);
    await executeAddTask(operation);
  }

  async function logout() {
    if (mutationLocked) return;
    setPending("logout");
    setError(null);
    try {
      await api.logout();
      transitionToSignedOut();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログアウトに失敗しました");
    } finally {
      setPending(null);
    }
  }

  async function executeReorder(operation: ReorderEntriesRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.taskchute_day_id), "並び替え");
    if (!mutationToken) return;
    setPending("reorder");
    setError(null);
    try {
      await api.reorderEntries(operation);
      await reconcile();
      setReorderOperation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "並び替えに失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setReorderOperation(null);
      try {
        const projection = await reconcile();
        const canonical = (operation.section_id === null ? projection?.unsectioned_entries
          : projection?.sections.find((candidate) => candidate.id === operation.section_id)?.entries)?.map((entry) => entry.id);
        if (ambiguous && canonical?.join("\0") === operation.entry_ids.join("\0")) {
          setReorderOperation(null);
          setError(null);
        }
      } catch { /* Preserve the logical operation. */ }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function reorderSectionEntries(sectionId: string | null, entryIds: string[], focusEntryId: string) {
    if (!day?.taskchute_day.id || !day.planning_enabled || mutationLocked || isMutationScopeBusy(placementMutationScope())) return;
    const entries = sectionId === null ? day.unsectioned_entries : day.sections.find((candidate) => candidate.id === sectionId)?.entries;
    const canonicalIds = entries?.map((entry) => entry.id);
    if (!entries || entryIds.length !== entries.length || new Set(entryIds).size !== entries.length
      || entryIds.some((id) => !canonicalIds?.includes(id)) || entryIds.every((id, index) => id === canonicalIds?.[index])) return;
    const operation: ReorderEntriesRequest = {
      operation_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id,
      section_id: sectionId,
      entry_ids: entryIds,
      expected_placement_revision: day.placement_revision,
    };
    setPendingFocusKey(focusKey({ kind: "entry", id: focusEntryId }));
    setReorderOperation(operation);
    await executeReorder(operation);
  }

  async function moveEntry(sectionId: string | null, entryId: string, delta: -1 | 1) {
    if (!day?.taskchute_day.id || !day.planning_enabled || mutationLocked || isMutationScopeBusy(placementMutationScope())) return;
    const entries = sectionId === null ? day.unsectioned_entries : day.sections.find((candidate) => candidate.id === sectionId)?.entries;
    if (!entries || !canMoveEntry(entries, entryId, delta)) return;
    const ids = entries.map((candidate) => candidate.id);
    const from = ids.indexOf(entryId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    await reorderSectionEntries(sectionId, ids, entryId);
  }

  function dragEdge(event: ReactDragEvent<HTMLElement>): DragEdge {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  function dragOrder(sectionId: string | null, targetEntryId: string, edge: DragEdge): string[] | null {
    if (!entryDrag || entryDrag.sectionId !== sectionId || !day?.taskchute_day.id || !day.planning_enabled || mutationLocked
      || isMutationScopeBusy(placementMutationScope())) return null;
    const entries = sectionId === null ? day.unsectioned_entries : day.sections.find((candidate) => candidate.id === sectionId)?.entries;
    return entries ? buildDraggedEntryOrder(entries, sectionId, entryDrag.entryId, targetEntryId, edge) : null;
  }

  function draggedEntry(drag: Pick<EntryDragState, "entryId" | "sectionId"> | null = entryDrag): EntryProjection | undefined {
    if (!drag || !day) return undefined;
    const entries = drag.sectionId === null ? day.unsectioned_entries : day.sections.find((section) => section.id === drag.sectionId)?.entries;
    return entries?.find((entry) => entry.id === drag.entryId);
  }

  function canDropOnSection(sectionId: string | null, drag: Pick<EntryDragState, "entryId" | "sectionId"> | null = entryDrag): boolean {
    const entry = draggedEntry(drag);
    if (!drag || !entry || !day?.taskchute_day.id || !day.planning_enabled || mutationLocked
      || isMutationScopeBusy(placementMutationScope())
      || entry.lifecycle_state !== "planned" || entry.routine !== null || entry.section_id === sectionId) return false;
    return sectionId === null || day.sections.some((section) => section.id === sectionId);
  }

  function activateMouseDrag(event: ReactMouseEvent<HTMLElement>): MouseDragState | null {
    const current = mouseDragRef.current;
    if (!current) return null;
    if (!current.active) {
      const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      if (moved < 4) return null;
      current.active = true;
      mouseDragRef.current = current;
      setEntryDrag({ entryId: current.entryId, sectionId: current.sectionId, targetEntryId: null, edge: null, targetSectionKey: null });
    }
    return current;
  }

  function startEntryMouseDrag(event: ReactMouseEvent<HTMLElement>, sectionId: string | null, entry: EntryProjection) {
    if (event.button !== 0 || isInteractiveDragTarget(event.target) || !day?.taskchute_day.id || !day.planning_enabled
      || mutationLocked || isMutationScopeBusy(placementMutationScope()) || entry.lifecycle_state !== "planned") return;
    mouseDragRef.current = { entryId: entry.id, sectionId, startX: event.clientX, startY: event.clientY, active: false };
  }

  function updateEntryMouseTarget(event: ReactMouseEvent<HTMLElement>, sectionId: string | null, targetEntryId: string) {
    if (isInteractiveDragTarget(event.target)) return;
    const drag = activateMouseDrag(event);
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const edge: DragEdge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    const entries = drag.sectionId === null ? day?.unsectioned_entries : day?.sections.find((candidate) => candidate.id === drag.sectionId)?.entries;
    const order = drag.sectionId === sectionId && entries
      ? buildDraggedEntryOrder(entries, drag.sectionId, drag.entryId, targetEntryId, edge)
      : null;
    setEntryDrag({ entryId: drag.entryId, sectionId: drag.sectionId, targetEntryId: order ? targetEntryId : null,
      edge: order ? edge : null, targetSectionKey: null });
  }

  function finishEntryMouseDrag(event: ReactMouseEvent<HTMLElement>, sectionId: string | null, targetEntryId: string) {
    if (isInteractiveDragTarget(event.target)) {
      mouseDragRef.current = null;
      setEntryDrag(null);
      return;
    }
    const drag = activateMouseDrag(event);
    if (!drag) {
      mouseDragRef.current = null;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const edge: DragEdge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    const entries = drag.sectionId === null ? day?.unsectioned_entries : day?.sections.find((candidate) => candidate.id === drag.sectionId)?.entries;
    const order = drag.sectionId === sectionId && entries && day?.taskchute_day.id && day.planning_enabled && !mutationLocked
      && !isMutationScopeBusy(placementMutationScope())
      ? buildDraggedEntryOrder(entries, drag.sectionId, drag.entryId, targetEntryId, edge)
      : null;
    mouseDragRef.current = null;
    setEntryDrag(null);
    if (order) void reorderSectionEntries(drag.sectionId, order, drag.entryId);
  }

  function startEntryDrag(event: ReactDragEvent<HTMLElement>, sectionId: string | null, entry: EntryProjection) {
    if (isInteractiveDragTarget(event.target) || !day?.taskchute_day.id || !day.planning_enabled || mutationLocked
      || isMutationScopeBusy(placementMutationScope()) || entry.lifecycle_state !== "planned") {
      event.preventDefault();
      return;
    }
    mouseDragRef.current = null;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
    setEntryDrag({ entryId: entry.id, sectionId, targetEntryId: null, edge: null, targetSectionKey: null });
  }

  function updateEntryDropTarget(event: ReactDragEvent<HTMLElement>, sectionId: string | null, targetEntryId: string) {
    const edge = dragEdge(event);
    if (!dragOrder(sectionId, targetEntryId, edge)) {
      if (entryDrag?.targetEntryId !== null || entryDrag?.targetSectionKey !== null) {
        setEntryDrag((current) => current ? { ...current, targetEntryId: null, edge: null, targetSectionKey: null } : null);
      }
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setEntryDrag((current) => current ? { ...current, targetEntryId, edge, targetSectionKey: null } : null);
  }

  function dropEntry(event: ReactDragEvent<HTMLElement>, sectionId: string | null, targetEntryId: string) {
    const edge = dragEdge(event);
    const ids = dragOrder(sectionId, targetEntryId, edge);
    const draggedEntryId = entryDrag?.entryId;
    setEntryDrag(null);
    if (!ids || !draggedEntryId) return;
    event.preventDefault();
    void reorderSectionEntries(sectionId, ids, draggedEntryId);
  }

  function updateSectionMouseTarget(event: ReactMouseEvent<HTMLElement>, sectionId: string | null) {
    const drag = activateMouseDrag(event);
    if (!drag) {
      mouseDragRef.current = null;
      return;
    }
    if (!canDropOnSection(sectionId, drag)) {
      setEntryDrag((current) => current ? { ...current, targetEntryId: null, edge: null, targetSectionKey: null } : null);
      return;
    }
    setEntryDrag({ entryId: drag.entryId, sectionId: drag.sectionId, targetEntryId: null, edge: null, targetSectionKey: groupKey(sectionId) });
  }

  function finishSectionMouseDrag(event: ReactMouseEvent<HTMLElement>, sectionId: string | null) {
    const drag = activateMouseDrag(event);
    if (!drag) {
      mouseDragRef.current = null;
      return;
    }
    const valid = canDropOnSection(sectionId, drag);
    mouseDragRef.current = null;
    setEntryDrag(null);
    if (valid) void moveEntryToSection(drag.entryId, sectionId);
  }

  function updateSectionDropTarget(event: ReactDragEvent<HTMLElement>, sectionId: string | null) {
    if (!canDropOnSection(sectionId)) {
      if (entryDrag?.targetSectionKey !== null) {
        setEntryDrag((current) => current ? { ...current, targetEntryId: null, edge: null, targetSectionKey: null } : null);
      }
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setEntryDrag((current) => current ? { ...current, targetEntryId: null, edge: null, targetSectionKey: groupKey(sectionId) } : null);
  }

  function dropSection(event: ReactDragEvent<HTMLElement>, sectionId: string | null) {
    if (!canDropOnSection(sectionId)) {
      setEntryDrag((current) => current ? { ...current, targetEntryId: null, edge: null, targetSectionKey: null } : null);
      return;
    }
    event.preventDefault();
    const draggedEntryId = entryDrag?.entryId;
    mouseDragRef.current = null;
    setEntryDrag(null);
    if (draggedEntryId) void moveEntryToSection(draggedEntryId, sectionId);
  }

  async function executeStart(operation: StartEntryRequest) {
    const mutationToken = beginMutationScope(executionMutationScope(operation.entry_id), "Start");
    if (!mutationToken) return;
    setPending("start");
    setError(null);
    try {
      await api.startEntry(operation);
      await reconcile();
      setStartOperation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "開始に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setStartOperation(null);
      try {
        const projection = await reconcile();
        if (ambiguous && projection?.active_execution?.id === operation.execution_id) {
          setStartOperation(null);
          setError(null);
        }
      } catch { /* Preserve the logical operation. */ }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  async function start(entryId: string) {
    if (!day || !day.is_current || mutationLocked) return;
    const entry = [...day.unsectioned_entries, ...day.sections.flatMap((section) => section.entries)]
      .find((candidate) => candidate.id === entryId);
    if (!entry || entry.lifecycle_state !== "planned") return;
    if (hasActiveMutationScope(["execution-lane"])) {
      if (completeOperation && queuedStartEntryRef.current === null) {
        setQueuedStartEntry(entryId);
        setError(null);
      }
      return;
    }
    if (isMutationScopeBusy(["execution-lane"]) || queuedStartEntryRef.current !== null) return;
    const operation: StartEntryRequest = { operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7(),
      ...(entry.section_id === null ? { expected_placement_revision: day.placement_revision } : {}) };
    setStartOperation(operation);
    await executeStart(operation);
  }

  async function drainQueuedStarts() {
    if (drainingQueuedStartsRef.current || queuedStartEntryRef.current === null) return;
    drainingQueuedStartsRef.current = true;
    try {
      const entryId = queuedStartEntryRef.current;
      setQueuedStartEntry(null);
      const projection = await reconcile();
      const entry = entryForId(projection, entryId);
      if (!projection || !entry || entry.lifecycle_state !== "planned" || projection.active_execution !== null) {
        setError("完了後に開始するTaskの前提条件が変わったため、キューを破棄しました。対象Taskを確認して再度開始してください。");
        return;
      }
      const operation: StartEntryRequest = { operation_id: uuidv7(), entry_id: entry.id, execution_id: uuidv7(),
        ...(entry.section_id === null ? { expected_placement_revision: projection.placement_revision } : {}) };
      setStartOperation(operation);
      await executeStart(operation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "キューに入ったStartの再開に失敗しました");
    } finally {
      drainingQueuedStartsRef.current = false;
    }
  }

  async function executeComplete(operation: CompleteEntryRequest) {
    const mutationToken = beginMutationScope(executionMutationScope(operation.entry_id), "Complete");
    if (!mutationToken) return;
    let completed = false;
    setPending("complete");
    setError(null);
    try {
      await api.completeEntry(operation);
      await reconcile();
      setCompleteOperation(null);
      completed = true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "完了に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setCompleteOperation(null);
      try {
        const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.entry_id);
        if (ambiguous && (canonical?.lifecycle_state === "completed" || projection?.active_execution === null)) {
          setCompleteOperation(null);
          setError(null);
        }
      } catch { /* Preserve the logical operation. */ }
      if (queuedStartEntryRef.current !== null) {
        setQueuedStartEntry(null);
        setError(ambiguous
          ? "Completeの結果が未確定のため、待機中のStartを破棄しました。Completeを再試行・確認後、対象Taskを明示的に開始してください。"
          : "Completeに失敗したため、待機中のStartを破棄しました。対象Taskを明示的に開始してください。");
      }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
      if (completed) void drainQueuedStarts();
    }
  }

  async function complete(entryId: string) {
    if (!day?.active_execution || day.active_execution.entry_id !== entryId || mutationLocked
      || isMutationScopeBusy(["execution-lane"])) return;
    const operation = { operation_id: uuidv7(), entry_id: entryId, execution_id: day.active_execution.id };
    setCompleteOperation(operation);
    await executeComplete(operation);
  }

  function entryForId(projection: CurrentTaskChuteDayProjection | null, entryId: string): EntryProjection | null {
    return projection ? projectionEntries(projection).find((entry) => entry.id === entryId) ?? null : null;
  }

  function canEditTaskMetadata(entry: EntryProjection): boolean {
    return Boolean(day?.is_current && day.taskchute_day.id && day.establishment_state === "established"
      && day.planning_enabled && entry.lifecycle_state === "planned" && entry.routine === null);
  }

  function openTaskMetadataEditor(entry: EntryProjection) {
    if (!canEditTaskMetadata(entry) || mutationLocked || isMutationScopeBusy(entryMutationScope(entry.id, entry.task.id))) return;
    beginInlineEditor(`task-metadata:${entry.id}`);
    setError(null);
    setTaskMetadataDraft({ entryId: entry.id, taskId: entry.task.id, expectedTitle: entry.task.title,
      expectedProjectId: entry.task.project?.id ?? null, title: entry.task.title, projectId: entry.task.project?.id ?? null });
    if (projects.length === 0) {
      void Promise.resolve(api.loadProjects()).then((projection) => {
        if (projection) setProjects(projection.projects);
      }).catch(() => { /* The current Project remains selectable; save will validate server-side. */ });
    }
  }

  async function executeTaskMetadata(operation: UpdateTaskMetadataRequest) {
    const mutationToken = beginMutationScope(entryMutationScope(operation.entry_id, operation.task_id), "Task情報保存");
    if (!mutationToken) return;
    setPending("task-metadata");
    setError(null);
    try {
      await api.updateTaskMetadata(operation);
      await reconcile();
      clearTaskMetadataOperationIfCurrent(operation.operation_id);
      releaseTaskMetadataOperation(operation.operation_id);
      setPendingTaskMetadataOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
        ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id))
        : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task情報の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (ambiguous) retainTaskMetadataOperation(operation);
      if (!ambiguous) {
        clearTaskMetadataOperationIfCurrent(operation.operation_id);
        releaseTaskMetadataOperation(operation.operation_id);
        setPendingTaskMetadataOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
          ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id))
          : current);
      }
      try {
        const projection = await reconcile();
        const canonical = entryForId(projection, operation.entry_id);
        if (ambiguous && canonical && canonical.task.id === operation.task_id
          && canonical.task.title === operation.title && (canonical.task.project?.id ?? null) === operation.project_id) {
          clearTaskMetadataOperationIfCurrent(operation.operation_id);
          releaseTaskMetadataOperation(operation.operation_id);
          setPendingTaskMetadataOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
            ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id))
            : current);
          setError(null);
        }
      } catch { /* Preserve the exact operation for retry when reconciliation is unavailable. */ }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  function commitTaskMetadata(entry: EntryProjection, nextProjectId = taskMetadataDraft?.projectId ?? null) {
    const draft = taskMetadataDraft;
    if (!day || !draft || draft.entryId !== entry.id || isMutationScopeBusy(entryMutationScope(entry.id, entry.task.id))) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Task名は空欄にできません");
      return;
    }
    if (title.length > 300) {
      setError("Task名は300文字以内で入力してください");
      return;
    }
    if (title === draft.expectedTitle && nextProjectId === draft.expectedProjectId) {
      setTaskMetadataDraft(null);
      setError(null);
      return;
    }
    const operation: UpdateTaskMetadataRequest = {
      operation_id: uuidv7(), entry_id: draft.entryId, task_id: draft.taskId,
      expected_title: draft.expectedTitle, expected_project_id: draft.expectedProjectId,
      title, project_id: nextProjectId,
    };
    setTaskMetadataDraft(null);
    setPendingTaskMetadataOverlays((current) => ({ ...current, [operation.entry_id]: operation }));
    setTaskMetadataOperation(operation);
    void executeTaskMetadata(operation);
  }

  function commitProjectMetadata(entry: EntryProjection, nextProjectId: string | null) {
    if (!day || !canEditTaskMetadata(entry) || isMutationScopeBusy(entryMutationScope(entry.id, entry.task.id))
      || (entry.task.project?.id ?? null) === nextProjectId) return;
    const operation: UpdateTaskMetadataRequest = {
      operation_id: uuidv7(), entry_id: entry.id, task_id: entry.task.id,
      expected_title: entry.task.title, expected_project_id: entry.task.project?.id ?? null,
      title: entry.task.title, project_id: nextProjectId,
    };
    setError(null);
    setPendingTaskMetadataOverlays((current) => ({ ...current, [operation.entry_id]: operation }));
    setTaskMetadataOperation(operation);
    void executeTaskMetadata(operation);
  }

  function canEditExecutionTimes(entry: EntryProjection): boolean {
    const summary = entry.execution_summary;
    if (!day?.taskchute_day.id || day.establishment_state !== "established") return false;
    if (entry.lifecycle_state === "planned") return true;
    if (entry.lifecycle_state === "running") {
      return (summary?.active_execution_id != null && summary.active_started_at != null)
        || (day.active_execution?.entry_id === entry.id && day.active_execution.started_at !== null);
    }
    return summary?.single_execution_id != null || (summary?.executions?.length ?? 0) > 0;
  }

  function hasCanonicalActualStart(entry: EntryProjection): boolean {
    const summary = entry.execution_summary;
    return Boolean(summary?.first_started_at
      ?? summary?.active_started_at
      ?? (day?.active_execution?.entry_id === entry.id ? day.active_execution.started_at : null));
  }

  function openExecutionTimesEditor(entry: EntryProjection, activeField: "start" | "end") {
    if (!day || !canEditExecutionTimes(entry) || mutationLocked || isMutationScopeBusy(executionMutationScope(entry.id))) return;
    const timezone = day.taskchute_day.establishment_timezone;
    if (!timezone) return;
    const summary = entry.execution_summary;
    if (activeField === "end" && (entry.lifecycle_state === "planned" || !hasCanonicalActualStart(entry))) return;
    const expectedLifecycleState = entry.lifecycle_state;
    const executionId: string | null = (entry.lifecycle_state === "planned"
      ? uuidv7() : entry.lifecycle_state === "running"
        ? summary?.active_execution_id ?? (day.active_execution?.entry_id === entry.id ? day.active_execution.id : null)
        : summary?.single_execution_id) ?? null;
    const executionOptions = summary?.executions && summary.executions.length > 0
      ? summary.executions
      : (entry.lifecycle_state === "running" && day.active_execution?.entry_id === entry.id
        ? [{ id: day.active_execution.id, entry_id: day.active_execution.entry_id,
            started_at: day.active_execution.started_at, ended_at: day.active_execution.ended_at }]
        : []);
    if (entry.lifecycle_state !== "planned" && !executionId) return;
    const selectedExecution = executionId ? executionOptions.find((candidate) => candidate.id === executionId) : undefined;
    const expectedStartedAt = entry.lifecycle_state === "planned"
      ? null : selectedExecution?.started_at ?? (entry.lifecycle_state === "running"
        ? summary?.active_started_at ?? (day.active_execution?.entry_id === entry.id ? day.active_execution.started_at : null) : null);
    const expectedEndedAt = entry.lifecycle_state === "completed" ? selectedExecution?.ended_at ?? null : null;
    setError(null);
    setExecutionEditorError(null);
    beginInlineEditor(`execution-times:${entry.id}`);
    setExecutionTimesDraft({ entryId: entry.id, activeField, executionId, expectedLifecycleState, expectedStartedAt, expectedEndedAt,
      startedLocal: formatActualClockInput(expectedStartedAt, timezone), endedLocal: formatActualClockInput(expectedEndedAt, timezone), executionOptions });
  }

  function selectExecutionForCorrection(executionId: string) {
    setExecutionTimesDraft((current) => {
      const timezone = day?.taskchute_day.establishment_timezone;
      if (!current || !timezone) return current;
      const selected = current.executionOptions.find((candidate) => candidate.id === executionId);
      if (!selected) return current;
      return { ...current, executionId, expectedStartedAt: selected.started_at, expectedEndedAt: selected.ended_at,
        startedLocal: formatActualClockInput(selected.started_at, timezone),
        endedLocal: formatActualClockInput(selected.ended_at, timezone) };
    });
  }

  async function executeExecutionTimes(operation: SetExecutionTimesRequest) {
    const mutationToken = beginMutationScope(executionMutationScope(operation.entry_id), "実績時刻保存");
    if (!mutationToken) return;
    setPending("execution-times");
    setError(null);
    try {
      await api.setExecutionTimes(operation);
      await reconcile();
      setExecutionTimesOperation(null);
      setPendingExecutionTimesOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
        ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id)) : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "実績時刻の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) {
        setExecutionTimesOperation(null);
        setPendingExecutionTimesOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
          ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id)) : current);
      }
      try {
        const projection = await reconcile();
        const canonical = entryForId(projection, operation.entry_id);
        const summary = canonical?.execution_summary;
        const expectedStarted = operation.expected_lifecycle_state === "running" ? summary?.active_started_at : summary?.first_started_at;
        if (ambiguous && canonical && canonical.lifecycle_state === (operation.ended_at === null ? "running" : "completed")
          && expectedStarted === operation.started_at
          && (operation.ended_at === null ? summary?.active_started_at !== null : summary?.last_ended_at === operation.ended_at)) {
          setExecutionTimesOperation(null);
          setPendingExecutionTimesOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
            ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id)) : current);
          setError(null);
        }
      } catch { /* Preserve the exact operation for retry. */ }
    } finally {
      endMutationScope(mutationToken);
      setPending(null);
    }
  }

  function commitExecutionTimes(entry: EntryProjection) {
    const draft = executionTimesDraft;
    if (!day || !draft || draft.entryId !== entry.id || isMutationScopeBusy(executionMutationScope(entry.id))) return;
    if (!draft.executionId) {
      setExecutionEditorError("補正対象のExecutionを選択してください");
      return;
    }
    const timezone = day.taskchute_day.establishment_timezone;
    if (!timezone) return;
    if (draft.expectedLifecycleState !== "planned"
      && draft.startedLocal === formatActualClockInput(draft.expectedStartedAt, timezone)
      && draft.endedLocal === formatActualClockInput(draft.expectedEndedAt, timezone)) {
      setExecutionTimesDraft(null);
      setExecutionEditorError(null);
      return;
    }
    let startedAt: string;
    let endedAt: string | null = null;
    try {
      const boundaryMinutes = day.taskchute_day.establishment_boundary_minutes;
      if (boundaryMinutes === null) throw new Error("確定済みDayの開始境界がありません");
      startedAt = parseActualClockInput(draft.startedLocal, timezone, day.taskchute_day.logical_date,
        boundaryMinutes, draft.expectedStartedAt, null, "開始時刻");
      if (draft.endedLocal.trim() !== "") {
        endedAt = parseActualClockInput(draft.endedLocal, timezone, day.taskchute_day.logical_date,
          boundaryMinutes, draft.expectedEndedAt, startedAt, "終了時刻");
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "実績時刻を正しく入力してください";
      setExecutionEditorError(message);
      return;
    }
    if (draft.expectedLifecycleState === "completed" && endedAt === null) {
      setExecutionEditorError("完了済みEntryの終了時刻は空にできません");
      return;
    }
    if (draft.expectedLifecycleState !== "planned"
      && startedAt === draft.expectedStartedAt && endedAt === draft.expectedEndedAt) {
      setExecutionTimesDraft(null);
      setExecutionEditorError(null);
      return;
    }
    const operation: SetExecutionTimesRequest = {
      operation_id: uuidv7(), entry_id: draft.entryId, execution_id: draft.executionId,
      expected_lifecycle_state: draft.expectedLifecycleState, started_at: startedAt, ended_at: endedAt,
      expected_started_at: draft.expectedStartedAt, expected_ended_at: draft.expectedEndedAt,
      ...(draft.expectedLifecycleState === "planned" && entry.section_id === null
        ? { expected_placement_revision: day.placement_revision } : {}),
    };
    setExecutionEditorError(null);
    setExecutionTimesDraft(null);
    setPendingExecutionTimesOverlays((current) => ({ ...current, [operation.entry_id]: operation }));
    setExecutionTimesOperation(operation);
    void executeExecutionTimes(operation);
  }

  async function executeConfiguration(operation: EstablishInitialSectionConfigurationRequest) {
    setPending("configuration"); setError(null);
    try { await api.establishInitialSectionConfiguration(operation); await reconcile(); setConfigurationOperation(null); }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : "Section時間帯の確定に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setConfigurationOperation(null);
      try { const projection = await reconcile(); if (ambiguous && projection && !projection.section_configuration_required) {
        setConfigurationOperation(null); setError(null);
      } } catch { /* Preserve retained operation. */ }
    } finally { setPending(null); }
  }

  async function submitConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!day?.taskchute_day.id || !day.is_current || mutationLocked) return;
    const form = new FormData(event.currentTarget);
    const items = day.sections.map((section) => ({
      section_id: section.id,
      logical_start_minute: parseLogicalTime(form.get(`start:${section.id}`)),
      logical_end_minute: parseLogicalTime(form.get(`end:${section.id}`)),
    }));
    if (items.some((item) => item.logical_start_minute === null || item.logical_end_minute === null)) {
      setError("各Sectionの時間を HH:mm で入力してください（24:00以降も利用できます）"); return;
    }
    const operation: EstablishInitialSectionConfigurationRequest = {
      operation_id: uuidv7(), configuration_version_id: uuidv7(), taskchute_day_id: day.taskchute_day.id,
      items: items as EstablishInitialSectionConfigurationRequest["items"],
    };
    setConfigurationOperation(operation); await executeConfiguration(operation);
  }

  async function openSectionSettings() {
    if (mutationLocked || day?.section_configuration_required) return;
    setPending("section-settings"); setError(null); setSectionSettingsNotice(null);
    try {
      const configuration = await api.loadSectionConfiguration();
      setSectionSettings(configuration);
      setSectionSettingsDraft(sectionSettingsDraftFrom(configuration));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Section設定の読み込みに失敗しました");
    } finally { setPending(null); }
  }

  async function openProjectSettings() {
    if (mutationLocked) return;
    setPending("project-settings"); setError(null);
    try {
      const projection = await api.loadProjects();
      setProjects(projection.projects);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project一覧の読み込みに失敗しました");
    } finally { setPending(null); }
  }

  async function openSettings(destination: SettingsDestination) {
    if (mutationLocked) return;
    setCalendarOpen(false);
    setView("settings");
    setSettingsDestination(destination);
    setProject(null);
    setSectionSettingsNotice(null);
    if (destination === "section") {
      if (sectionSettingsDraft === null) await openSectionSettings();
    } else await openProjectSettings();
  }

  function updateSectionBoundary(index: number, edge: "start" | "end", value: string) {
    if (!sectionSettingsDraft) return;
    const items = sectionSettingsDraft.items.map((item) => ({ ...item }));
    if (edge === "start") {
      items[index]!.logical_start_text = value;
      if (index > 0) items[index - 1]!.logical_end_text = value;
    } else {
      items[index]!.logical_end_text = value;
      if (index + 1 < items.length) items[index + 1]!.logical_start_text = value;
    }
    setSectionSettingsDraft({ ...sectionSettingsDraft, items });
  }

  function addSection(index: number) {
    if (!sectionSettingsDraft || mutationLocked) return;
    const parsed = parseSectionSettingsDraft(sectionSettingsDraft);
    if (!parsed) return;
    const items = parsed.items.map((item) => ({ ...item }));
    const target = items[index]!;
    const midpoint = Math.floor((target.logical_start_minute + target.logical_end_minute) / 2);
    if (midpoint <= target.logical_start_minute || midpoint >= target.logical_end_minute) {
      setError("この時間帯は分割できません"); return;
    }
    const previousEnd = target.logical_end_minute;
    target.logical_end_minute = midpoint;
    items.splice(index + 1, 0, {
      section_id: uuidv7(), title: "新しいSection",
      logical_start_minute: midpoint, logical_end_minute: previousEnd,
    });
    setSectionSettingsDraft(sectionSettingsDraftFrom({ ...parsed, items }));
  }

  function deleteSection(index: number) {
    if (!sectionSettingsDraft || sectionSettingsDraft.items.length <= 1 || mutationLocked) return;
    const parsed = parseSectionSettingsDraft(sectionSettingsDraft);
    if (!parsed) return;
    const items = parsed.items.map((item) => ({ ...item }));
    const removed = items[index]!;
    if (index + 1 < items.length) items[index + 1]!.logical_start_minute = removed.logical_start_minute;
    else items[index - 1]!.logical_end_minute = removed.logical_end_minute;
    items.splice(index, 1);
    setSectionSettingsDraft(sectionSettingsDraftFrom({ ...parsed, items }));
  }

  async function executeSectionSettings(operation: UpdateSectionConfigurationRequest) {
    setPending("section-settings"); setError(null);
    try {
      await api.updateSectionConfiguration(operation);
      const canonical = await api.loadSectionConfiguration();
      setSectionSettings(canonical); setSectionSettingsDraft(sectionSettingsDraftFrom(canonical)); setSectionSettingsOperation(null);
      setSectionSettingsNotice("保存しました。次のTaskChuteDayから反映されます。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Section設定の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      const revisionConflict = caught instanceof ApiClientError && caught.code === "revision_conflict";
      if (!ambiguous) setSectionSettingsOperation(null);
      try {
        const canonical = await api.loadSectionConfiguration();
        setSectionSettings(canonical);
        if (revisionConflict) {
          setSectionSettingsDraft(sectionSettingsDraftFrom(canonical));
          setSectionSettingsOperation(null);
          setSectionSettingsNotice(null);
          setError("Section設定が別の場所で更新されたため、最新内容を読み込み直しました。変更内容を確認して再編集してください。");
        } else if (ambiguous && canonical.configuration_version_id === operation.configuration_version_id) {
          setSectionSettingsDraft(sectionSettingsDraftFrom(canonical)); setSectionSettingsOperation(null); setError(null);
          setSectionSettingsNotice("保存しました。次のTaskChuteDayから反映されます。");
        }
      } catch { /* Preserve the original mutation outcome and operation identity. */ }
    } finally { setPending(null); }
  }

  async function saveSectionSettings() {
    const parsed = parseSectionSettingsDraft(sectionSettingsDraft);
    if (!parsed || mutationLocked) return;
    const operation: UpdateSectionConfigurationRequest = {
      operation_id: uuidv7(), configuration_version_id: uuidv7(),
      expected_configuration_version_id: parsed.configuration_version_id,
      items: parsed.items,
    };
    setSectionSettingsOperation(operation);
    await executeSectionSettings(operation);
  }

  async function executeSectionMove(operation: MoveEntryRequest) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.taskchute_day_id), "Section移動");
    if (!mutationToken) return;
    setPending("move"); setError(null);
    try {
      await api.moveEntry(operation);
      await reconcile();
      setSectionMoveOperation(null);
      const collapsed = collapsedSectionsByDay[day?.taskchute_day.logical_date ?? ""]?.[groupKey(operation.section_id)] === true;
      setPendingFocusKey(focusKey(collapsed ? { kind: "section", id: groupKey(operation.section_id) } : { kind: "entry", id: operation.entry_id }));
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : "Section移動に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setSectionMoveOperation(null);
      try { const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.entry_id);
        const expectedPlannedStart = operation.section_id === null ? null
          : projection?.sections.find((section) => section.id === operation.section_id)?.logical_start_minute;
        if (ambiguous && canonical?.section_id === operation.section_id
          && canonical.planned_start_minute === expectedPlannedStart
          && projection?.placement_revision === operation.expected_placement_revision + 1) {
          setSectionMoveOperation(null); setError(null);
          const collapsed = collapsedSectionsByDay[projection.taskchute_day.logical_date]?.[groupKey(operation.section_id)] === true;
          setPendingFocusKey(focusKey(collapsed ? { kind: "section", id: groupKey(operation.section_id) } : { kind: "entry", id: operation.entry_id }));
        }
      } catch { /* Preserve retained operation. */ }
    } finally { endMutationScope(mutationToken); setPending(null); }
  }

  async function moveEntryToSection(entryId: string, sectionId: string | null) {
    const entry = [...(day?.unsectioned_entries ?? []), ...(day?.sections.flatMap((section) => section.entries) ?? [])]
      .find((candidate) => candidate.id === entryId);
    if (!entry || !day?.taskchute_day.id || !day.planning_enabled || mutationLocked || isMutationScopeBusy(placementMutationScope())
      || entry.lifecycle_state !== "planned" || entry.routine !== null
      || entry.section_id === sectionId) return;
    setEditingPlannedStart((editing) => editing?.entryId === entry.id ? null : editing);
    const operation: MoveEntryRequest = { operation_id: uuidv7(), entry_id: entry.id,
      taskchute_day_id: day.taskchute_day.id, section_id: sectionId, expected_placement_revision: day.placement_revision };
    setSectionMoveOperation(operation); await executeSectionMove(operation);
  }

  async function changeSection(entry: EntryProjection, sectionId: string | null) {
    await moveEntryToSection(entry.id, sectionId);
  }

  async function executeEstimate(operation: SetEntryEstimateRequest) {
    const mutationToken = beginMutationScope(entryMutationScope(operation.entry_id), "見積保存");
    if (!mutationToken) return;
    setPending("estimate"); setError(null);
    try {
      await api.setEntryEstimate(operation); await reconcile();
      clearEstimateOperationIfCurrent(operation.operation_id);
      releaseEstimateOperation(operation.operation_id);
      setEditingEstimate((current) => current?.entryId === operation.entry_id ? null : current);
      setPendingEstimateOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
        ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id)) : current);
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : "見積の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (ambiguous) retainEstimateOperation(operation);
      if (!ambiguous) {
        clearEstimateOperationIfCurrent(operation.operation_id);
        releaseEstimateOperation(operation.operation_id);
        setEditingEstimate((current) => current?.entryId === operation.entry_id ? null : current);
        setPendingEstimateOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
          ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id)) : current);
      }
      try { const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.entry_id);
        if (ambiguous && canonical?.estimate_seconds === operation.estimate_seconds) {
          clearEstimateOperationIfCurrent(operation.operation_id);
          releaseEstimateOperation(operation.operation_id);
          setEditingEstimate((current) => current?.entryId === operation.entry_id ? null : current);
          setError(null);
          setPendingEstimateOverlays((current) => current[operation.entry_id]?.operation_id === operation.operation_id
            ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.entry_id)) : current);
        }
      } catch { /* Preserve retained operation. */ }
    } finally { endMutationScope(mutationToken); setPending(null); }
  }

  async function commitEstimate(entryId: string) {
    const canonical = day ? [...day.unsectioned_entries, ...day.sections.flatMap((section) => section.entries)]
      .find((entry) => entry.id === entryId) : undefined;
    if (!day?.planning_enabled || mutationLocked || isMutationScopeBusy(entryMutationScope(entryId))
      || editingEstimate?.entryId !== entryId || !canonical) return;
    const raw = editingEstimate.minutes.trim();
    const minutes = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(minutes) || minutes < 0 || !Number.isSafeInteger(minutes * 60)) {
      setError("見積は0以上の整数（分）で入力してください"); return;
    }
    const estimateSeconds = minutes === 0 ? null : minutes * 60;
    if (canonical.estimate_seconds === estimateSeconds) {
      setEditingEstimate(null);
      setError(null);
      return;
    }
    if (canonical.routine) {
      setRoutineCandidate({ entryId, unit: "estimate", estimateSeconds });
      setEditingEstimate(null);
      return;
    }
    const operation: SetEntryEstimateRequest = { operation_id: uuidv7(), entry_id: entryId, estimate_seconds: estimateSeconds };
    setPendingEstimateOverlays((current) => ({ ...current, [operation.entry_id]: operation }));
    setEstimateOperation(operation); await executeEstimate(operation);
  }

  async function executePlannedStart(operation: PlannedStartOperation) {
    const mutationToken = beginMutationScope(placementMutationScope(operation.request.taskchute_day_id), "開始予定保存");
    if (!mutationToken) return;
    setPending("planned-start"); setError(null);
    try {
      await api.setEntryPlannedStart(operation.request);
      await reconcile();
      setPlannedStartOperation(null);
      setEditingPlannedStart(null);
      setPendingPlannedStartOverlays((current) => current[operation.request.entry_id]?.request.operation_id === operation.request.operation_id
        ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.request.entry_id)) : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "開始予定の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) {
        setPlannedStartOperation(null);
        setPendingPlannedStartOverlays((current) => current[operation.request.entry_id]?.request.operation_id === operation.request.operation_id
          ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.request.entry_id)) : current);
      }
      try {
        const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.request.entry_id);
        if (ambiguous && canonical?.planned_start_minute === operation.request.planned_start_minute
          && canonical.section_id === operation.expectedSectionId
          && projection?.placement_revision === operation.request.expected_placement_revision + 1) {
          setPlannedStartOperation(null); setEditingPlannedStart(null); setError(null);
          setPendingPlannedStartOverlays((current) => current[operation.request.entry_id]?.request.operation_id === operation.request.operation_id
            ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== operation.request.entry_id)) : current);
        }
      } catch { /* Preserve retained operation. */ }
    } finally { endMutationScope(mutationToken); setPending(null); }
  }

  async function commitPlannedStart(entry: EntryProjection) {
    const canonical = day ? [...day.unsectioned_entries, ...day.sections.flatMap((section) => section.entries)]
      .find((candidate) => candidate.id === entry.id) : undefined;
    if (!day?.taskchute_day.id || !day.planning_enabled || day.taskchute_day.establishment_boundary_minutes === null
      || mutationLocked || isMutationScopeBusy(placementMutationScope())
      || editingPlannedStart?.entryId !== entry.id || !canonical) return;
    const plannedStartMinute = parsePlannedStart(
      editingPlannedStart.value,
      day.taskchute_day.establishment_boundary_minutes,
    );
    if (plannedStartMinute === "invalid") {
      const boundary = day.taskchute_day.establishment_boundary_minutes;
      setError(`開始予定は4桁のHHMMで入力してください（${formatLogicalMinute(boundary)} 以上 ${formatLogicalMinute(boundary + 1440)} 未満）`);
      return;
    }
    const expectedSectionId = plannedStartMinute === null ? null
      : day.sections.find((section) => section.logical_start_minute !== null && section.logical_end_minute !== null
        && section.logical_start_minute <= plannedStartMinute && plannedStartMinute < section.logical_end_minute)?.id;
    if (expectedSectionId === undefined) {
      setError("開始予定を含む確定済みSection時間帯がありません");
      return;
    }
    if (canonical.planned_start_minute === plannedStartMinute) {
      setEditingPlannedStart(null);
      setError(null);
      return;
    }
    if (canonical.routine) {
      setRoutineCandidate({ entryId: entry.id, unit: "section-plan", sectionId: expectedSectionId,
        plannedStartMinute });
      setEditingPlannedStart(null);
      return;
    }
    const operation: PlannedStartOperation = {
      request: { operation_id: uuidv7(), entry_id: entry.id, taskchute_day_id: day.taskchute_day.id,
        planned_start_minute: plannedStartMinute, expected_placement_revision: day.placement_revision },
      expectedSectionId,
    };
    setPendingPlannedStartOverlays((current) => ({ ...current, [operation.request.entry_id]: operation }));
    setPlannedStartOperation(operation);
    await executePlannedStart(operation);
  }

  function changeRoutineSectionCandidate(entry: EntryProjection, sectionId: string | null) {
    if (!entry.routine || !day?.is_current || !day.planning_enabled || entry.lifecycle_state !== "planned" || mutationLocked
      || isMutationScopeBusy(routineMutationScope(entry.id, entry.routine.routine_definition_id))) return;
    const plannedStartMinute = sectionId === null ? null
      : day.sections.find((section) => section.id === sectionId)?.logical_start_minute;
    if (plannedStartMinute === undefined || (sectionId !== null && plannedStartMinute === null)) {
      setError("選択したSectionの確定済み開始時刻がありません");
      return;
    }
    setRoutineCandidate({ entryId: entry.id, unit: "section-plan", sectionId, plannedStartMinute });
  }

  async function executeRoutineEstimate(operation: SetRoutineEstimateRequest) {
    const entry = entryForId(day, operation.entry_id);
    const mutationToken = beginMutationScope(routineMutationScope(operation.entry_id, entry?.routine?.routine_definition_id), "Routine見積保存");
    if (!mutationToken) return;
    setPending("routine-edit"); setError(null);
    try {
      await api.setRoutineEstimate(operation);
      await reconcile();
      clearRoutineEstimateOperationIfCurrent(operation.operation_id);
      releaseRoutineEstimateOperation(operation.operation_id);
      setRoutineCandidate((current) => current?.entryId === operation.entry_id ? null : current);
      setEditingEstimate((current) => current?.entryId === operation.entry_id ? null : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Routine見積の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (ambiguous) retainRoutineEstimateOperation(operation);
      if (!ambiguous) {
        clearRoutineEstimateOperationIfCurrent(operation.operation_id);
        releaseRoutineEstimateOperation(operation.operation_id);
        setRoutineCandidate((current) => current?.entryId === operation.entry_id ? null : current);
      }
      try {
        const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.entry_id);
        const expected = operation.action === "reset" ? canonical?.routine?.default_estimate_seconds : operation.estimate_seconds;
        const override = operation.action === "occurrence";
        if (ambiguous && canonical?.estimate_seconds === expected && canonical?.routine?.estimate_override_present === override) {
          clearRoutineEstimateOperationIfCurrent(operation.operation_id);
          releaseRoutineEstimateOperation(operation.operation_id);
          setRoutineCandidate((current) => current?.entryId === operation.entry_id ? null : current);
          setError(null);
        }
      } catch { /* Preserve exact retained operation. */ }
    } finally { endMutationScope(mutationToken); setPending(null); }
  }

  async function executeRoutineSectionPlan(operation: SetRoutineSectionPlanRequest) {
    const entry = entryForId(day, operation.entry_id);
    const mutationToken = beginMutationScope([...placementMutationScope(operation.taskchute_day_id), ...routineMutationScope(operation.entry_id, entry?.routine?.routine_definition_id)], "Routine配置保存");
    if (!mutationToken) return;
    setPending("routine-edit"); setError(null);
    try {
      await api.setRoutineSectionPlan(operation);
      await reconcile();
      setRoutineSectionPlanOperation(null); setRoutineCandidate(null); setEditingPlannedStart(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "RoutineのSection設定保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) { setRoutineSectionPlanOperation(null); setRoutineCandidate(null); }
      try {
        const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.entry_id);
        const expectedSection = operation.action === "reset" ? canonical?.routine?.default_section_id : operation.section_id;
        const expectedStart = operation.action === "reset" ? canonical?.routine?.default_planned_start_minute : operation.planned_start_minute;
        const override = operation.action === "occurrence";
        if (ambiguous && canonical?.section_id === expectedSection && canonical?.planned_start_minute === expectedStart
          && canonical?.routine?.section_plan_override_present === override) {
          setRoutineSectionPlanOperation(null); setRoutineCandidate(null); setError(null);
        }
      } catch { /* Preserve exact retained operation. */ }
    } finally { endMutationScope(mutationToken); setPending(null); }
  }

  async function commitRoutineCandidate(entry: EntryProjection, action: "occurrence" | "definition") {
    if (!day?.taskchute_day.id || !entry.routine || routineCandidate?.entryId !== entry.id || mutationLocked
      || isMutationScopeBusy(routineMutationScope(entry.id, entry.routine.routine_definition_id))) return;
    if (routineCandidate.unit === "estimate") {
      const operation: SetRoutineEstimateRequest = action === "occurrence"
        ? { operation_id: uuidv7(), entry_id: entry.id, taskchute_day_id: day.taskchute_day.id,
            action, estimate_seconds: routineCandidate.estimateSeconds }
        : { operation_id: uuidv7(), entry_id: entry.id, taskchute_day_id: day.taskchute_day.id,
            action, estimate_seconds: routineCandidate.estimateSeconds,
            expected_defaults_revision: entry.routine.defaults_revision };
      setRoutineEstimateOperation(operation);
      await executeRoutineEstimate(operation);
      return;
    }
    const operation: SetRoutineSectionPlanRequest = action === "occurrence"
      ? { operation_id: uuidv7(), entry_id: entry.id, taskchute_day_id: day.taskchute_day.id,
          action, section_id: routineCandidate.sectionId, planned_start_minute: routineCandidate.plannedStartMinute,
          expected_placement_revision: day.placement_revision }
      : { operation_id: uuidv7(), entry_id: entry.id, taskchute_day_id: day.taskchute_day.id,
          action, section_id: routineCandidate.sectionId, planned_start_minute: routineCandidate.plannedStartMinute,
          expected_placement_revision: day.placement_revision,
          expected_defaults_revision: entry.routine.defaults_revision };
    setRoutineSectionPlanOperation(operation);
    await executeRoutineSectionPlan(operation);
  }

  async function resetRoutineUnit(entry: EntryProjection, unit: "estimate" | "section-plan") {
    if (!day?.taskchute_day.id || !entry.routine || mutationLocked
      || isMutationScopeBusy(routineMutationScope(entry.id, entry.routine.routine_definition_id))) return;
    if (unit === "estimate") {
      const operation: SetRoutineEstimateRequest = { operation_id: uuidv7(), entry_id: entry.id,
        taskchute_day_id: day.taskchute_day.id, action: "reset" };
      setRoutineEstimateOperation(operation); await executeRoutineEstimate(operation);
      return;
    }
    const operation: SetRoutineSectionPlanRequest = { operation_id: uuidv7(), entry_id: entry.id,
      taskchute_day_id: day.taskchute_day.id, action: "reset", expected_placement_revision: day.placement_revision };
    setRoutineSectionPlanOperation(operation); await executeRoutineSectionPlan(operation);
  }

  async function executeRoutineConversion(operation: ConvertEntryToRoutineRequest) {
    const mutationToken = beginMutationScope([...placementMutationScope(operation.taskchute_day_id), `entry:${operation.entry_id}`, `routine:${operation.routine_definition_id}`], "Routine化");
    if (!mutationToken) return;
    setPending("routine-convert"); setError(null);
    try {
      await api.convertEntryToRoutine(operation);
      await reconcile();
      setRoutineConversionOperation(null); setRoutineDraft(null);
      setEditingEstimate((editing) => editing?.entryId === operation.entry_id ? null : editing);
      setEditingPlannedStart((editing) => editing?.entryId === operation.entry_id ? null : editing);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Routine化に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setRoutineConversionOperation(null);
      try {
        const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.entry_id);
        if (ambiguous && canonical?.routine?.routine_definition_id === operation.routine_definition_id) {
          setRoutineConversionOperation(null); setRoutineDraft(null); setError(null);
          setEditingEstimate((editing) => editing?.entryId === operation.entry_id ? null : editing);
          setEditingPlannedStart((editing) => editing?.entryId === operation.entry_id ? null : editing);
        }
      } catch { /* Preserve retained operation identity. */ }
    } finally { endMutationScope(mutationToken); setPending(null); }
  }

  async function commitRoutineConversion(entry: EntryProjection) {
    if (!day?.taskchute_day.id || !day.is_current || mutationLocked || routineDraft?.entryId !== entry.id || entry.routine !== null) return;
    const endLogicalDate = routineDraft.endDate.trim() || null;
    if (endLogicalDate !== null && endLogicalDate < day.taskchute_day.logical_date) {
      setError("Routine終了日は今日以降を指定してください");
      return;
    }
    const operation: ConvertEntryToRoutineRequest = {
      operation_id: uuidv7(), routine_definition_id: uuidv7(), routine_occurrence_id: uuidv7(),
      entry_id: entry.id, taskchute_day_id: day.taskchute_day.id, end_logical_date: endLogicalDate,
    };
    setRoutineConversionOperation(operation);
    await executeRoutineConversion(operation);
  }

  async function executeRoutineEnd(operation: EndRoutineRequest) {
    const mutationToken = beginMutationScope([`routine:${operation.routine_definition_id}`], "Routine終了");
    if (!mutationToken) return;
    setPending("routine-end"); setError(null);
    try {
      await api.endRoutine(operation);
      await reconcile();
      setRoutineEndOperation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Routine終了に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setRoutineEndOperation(null);
      try {
        const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.routine?.routine_definition_id === operation.routine_definition_id);
        if (ambiguous && canonical?.routine?.can_end === false) {
          setRoutineEndOperation(null); setError(null);
        }
      } catch { /* Preserve retained operation identity. */ }
    } finally { endMutationScope(mutationToken); setPending(null); }
  }

  if (authState === "loading") return <main className="shell"><p role="status">読み込み中…</p></main>;
  if (authState === "signed-out") {
    return (
      <main className="shell auth-shell">
        <section className="panel">
          <p className="eyebrow">TaskChute Platform</p>
          <h1>ログイン</h1>
          <form onSubmit={login} aria-busy={pending === "login"}>
            <label>メール<input name="email" type="email" autoComplete="username" required /></label>
            <label>パスワード<input name="password" type="password" autoComplete="current-password" required /></label>
            <button disabled={pending !== null}>{pending === "login" ? "ログイン中…" : "ログイン"}</button>
          </form>
          {error && <p role="alert" className="error">{error}</p>}
        </section>
      </main>
    );
  }
  if (!day) return null;

  const currentDay = day;
  const allEntries = projectionEntries(currentDay);
  const eligibleBulkEntries = allEntries.filter((entry) => isBulkSelectableProjectionEntry(currentDay, entry));
  const selectedBulkEntries = selectedEntryIds
    .map((id) => allEntries.find((entry) => entry.id === id))
    .filter((entry): entry is EntryProjection => entry !== undefined && isBulkSelectableProjectionEntry(currentDay, entry));
  const allEligibleBulkSelected = eligibleBulkEntries.length > 0 && selectedBulkEntries.length === eligibleBulkEntries.length;
  const bulkSelectionIndeterminate = selectedBulkEntries.length > 0 && !allEligibleBulkSelected;
  const activeEntry = currentDay.active_execution ? allEntries.find((entry) => entry.id === currentDay.active_execution?.entry_id) : null;
  const resolvedColumnDefinitions = visibleDayColumnOrder(dayColumnPreference)
    .map((key) => DAY_COLUMN_DEFINITIONS.find((definition) => definition.key === key)!).filter(Boolean);
  const forecastByEntryId = calculateStartForecast(
    currentDay,
    forecastNowInstant ?? currentDay.projection_generated_at,
  );
  const parsedSectionSettingsDraft = parseSectionSettingsDraft(sectionSettingsDraft);
  const transientStatus = pendingMutationCount + queuedMutationCount > 1
    ? `保存中…（${pendingMutationCount + queuedMutationCount}件）`
    : queuedMutationCount > 0
      ? "完了後のStartを待機中…"
      : pendingMutationCount > 0
        ? transientStatusText(pending) ?? "保存中…"
        : transientStatusText(pending);
  const groups = [
    ...(currentDay.unsectioned_entries.length > 0 || draftTask?.sectionId === null ? [{
      id: null, title: "Sectionなし", logical_start_minute: null, logical_end_minute: null,
      estimate_total_seconds: currentDay.unsectioned_entries.reduce((sum, entry) => sum + (entry.estimate_seconds ?? 0), 0),
      entries: currentDay.unsectioned_entries,
    }] : []),
    ...currentDay.sections,
  ];

  function focusSurface(element: HTMLElement) {
    element.focus();
  }

  function setSectionCollapsed(sectionId: string | null, collapsed: boolean) {
    const logicalDate = currentDay.taskchute_day.logical_date;
    const sectionKey = groupKey(sectionId);
    setCollapsedSectionsByDay((current) => {
      const dayState = { ...(current[logicalDate] ?? {}) };
      if (collapsed) dayState[sectionKey] = true;
      else delete dayState[sectionKey];
      const next = { ...current };
      if (Object.keys(dayState).length > 0) next[logicalDate] = dayState;
      else delete next[logicalDate];
      return next;
    });
  }

  function toggleSection(sectionId: string | null) {
    const sectionKey = groupKey(sectionId);
    const collapsed = collapsedSectionsByDay[currentDay.taskchute_day.logical_date]?.[sectionKey] === true;
    if (!collapsed && draftTask?.sectionId === sectionId) {
      if (draftTask.title.trim()) {
        draftInputRef.current?.focus();
        return;
      }
      setDraftTask(null);
    }
    setSectionCollapsed(sectionId, !collapsed);
  }

  function openDraft(sectionId: string | null) {
    if (mutationLocked || !day?.planning_enabled || day.section_configuration_required) return;
    if (draftTask?.title.trim()) {
      draftInputRef.current?.focus();
      return;
    }
    setSectionCollapsed(sectionId, false);
    setDraftTask({ sectionId, title: "" });
  }

  function handleDraftKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const composing = event.nativeEvent.isComposing || draftCompositionRef.current;
    if (event.key === "Enter") {
      event.preventDefault();
      if (!composing) event.currentTarget.form?.requestSubmit();
      return;
    }
    if (composing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDraftTask(null);
      const sectionId = draftTask?.sectionId;
      if (sectionId !== undefined) setPendingFocusKey(focusKey({ kind: "section", id: groupKey(sectionId) }));
    }
  }

  function rowTabStops(row: HTMLElement): HTMLElement[] {
    return Array.from(row.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]",
    )).filter((element) => element.tabIndex >= 0
      && !element.hasAttribute("aria-hidden")
      && !element.closest(".bulk-slot, .execution-cell")
      && !element.hasAttribute("data-tab-skip"));
  }

  function focusInlineTabDestination(row: HTMLElement, originCell: HTMLElement, backwards: boolean): void {
    const originIndex = Array.from(row.children).indexOf(originCell);
    requestAnimationFrame(() => {
      const currentRow = row.isConnected ? row : null;
      if (!currentRow) return;
      if (originCell.isConnected && originCell.querySelector("input[data-inline-navigation]")) return;
      const stops = rowTabStops(currentRow);
      const candidates = stops.filter((stop) => {
        const cell = stop.closest<HTMLElement>("[data-day-column-cell], .task-main");
        const cellIndex = cell ? Array.from(currentRow.children).indexOf(cell) : -1;
        return backwards ? cellIndex >= 0 && cellIndex < originIndex : cellIndex > originIndex;
      });
      const destination = backwards ? candidates.at(-1) : candidates[0];
      if (destination) {
        destination.focus();
        return;
      }
      const rows = Array.from(currentRow.closest<HTMLElement>(".day-surface")?.querySelectorAll<HTMLElement>("[data-entry-id]") ?? []);
      const rowIndex = rows.indexOf(currentRow);
      const adjacentRow = rows[rowIndex + (backwards ? -1 : 1)];
      if (!adjacentRow) return;
      const adjacentStops = rowTabStops(adjacentRow);
      (backwards ? adjacentStops.at(-1) : adjacentStops[0])?.focus();
    });
  }

  function handleTaskRowKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || event.nativeEvent.isComposing || decisionModalOpen) return;
    const row = event.currentTarget;
    const stops = rowTabStops(row);
    const target = event.target instanceof HTMLElement ? event.target : document.activeElement;
    const currentIndex = stops.findIndex((stop) => stop === target || stop.contains(target));
    if (currentIndex < 0) {
      const firstOrLast = event.shiftKey ? stops.at(-1) : stops[0];
      if (firstOrLast) {
        event.preventDefault();
        firstOrLast.focus();
      }
      return;
    }
    const nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < stops.length) {
      event.preventDefault();
      stops[nextIndex]?.focus();
      return;
    }
    const rows = Array.from(row.closest<HTMLElement>(".day-surface")?.querySelectorAll<HTMLElement>("[data-entry-id]") ?? []);
    const rowIndex = rows.indexOf(row);
    const adjacentRow = rows[rowIndex + (event.shiftKey ? -1 : 1)];
    if (adjacentRow) {
      const adjacentStops = rowTabStops(adjacentRow);
      const next = event.shiftKey ? adjacentStops.at(-1) : adjacentStops[0];
      if (next) {
        event.preventDefault();
        next.focus();
      }
      return;
    }
  }

  function handleDayKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || isTextEditingTarget(event.target)) return;
    if (decisionModalOpen) return;
    if (shortcutHelpOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setShortcutHelpOpen(false);
      }
      return;
    }
    if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      void navigateToDay(shiftLogicalDate(currentDay.taskchute_day.logical_date, event.key === "ArrowLeft" ? -1 : 1));
      return;
    }
    const key = event.key.toLowerCase();
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-day-focus-target]"));
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-day-focus-target]") : null;
    const activeIndex = targets.findIndex((target) => target.dataset.focusKey === activeElement?.dataset.focusKey);
    const activeEntry = activeElement?.dataset.entryId
      ? allEntries.find((entry) => entry.id === activeElement.dataset.entryId)
      : undefined;

    if (key === "?" && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      setShortcutHelpOpen(true);
      return;
    }

    if ((key === "n" || key === "e" || key === "d")
      && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && activeEntry) {
      event.preventDefault();
      if (key === "n") openDraft(activeEntry.section_id);
      else if (key === "e") openTaskMetadataEditor(activeEntry);
      else openSingleDelete(activeEntry);
      return;
    }

    if (key === "x" && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (activeEntry && isBulkSelectableProjectionEntry(currentDay, activeEntry)) {
        event.preventDefault();
        toggleBulkEntry(activeEntry);
      }
      return;
    }

    if (key === "s") {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || document.activeElement !== activeElement) return;
      const entryId = activeElement?.dataset.entryId;
      const entry = entryId ? allEntries.find((candidate) => candidate.id === entryId) : undefined;
      if (!entry || !currentDay.is_current || mutationLocked) return;
      if (entry.lifecycle_state === "planned" && currentDay.active_execution === null) {
        event.preventDefault();
        void start(entry.id);
      } else if (entry.lifecycle_state === "running" && currentDay.active_execution?.entry_id === entry.id) {
        event.preventDefault();
        void complete(entry.id);
      }
      return;
    }

    if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const entryId = activeElement?.dataset.entryId;
      if (!entryId) return;
      const section = currentDay.sections.find((candidate) => candidate.entries.some((entry) => entry.id === entryId));
      const sectionId = section?.id ?? (currentDay.unsectioned_entries.some((entry) => entry.id === entryId) ? null : undefined);
      const entries = sectionId === null ? currentDay.unsectioned_entries : section?.entries;
      const delta = event.key === "ArrowUp" ? -1 : 1;
      if (sectionId === undefined || !entries || !canMoveEntry(entries, entryId, delta)) return;
      event.preventDefault();
      void moveEntry(sectionId, entryId, delta);
      return;
    }

    if (key === "j" || event.key === "ArrowDown" || key === "k" || event.key === "ArrowUp") {
      const navigationTargets = activeElement ? targets : targets.filter((target) => target.dataset.entryId);
      if (navigationTargets.length === 0) return;
      event.preventDefault();
      const delta = key === "j" || event.key === "ArrowDown" ? 1 : -1;
      const navigationIndex = activeElement ? activeIndex : -1;
      const nextIndex = navigationIndex < 0
        ? (delta > 0 ? 0 : navigationTargets.length - 1)
        : Math.max(0, Math.min(navigationTargets.length - 1, navigationIndex + delta));
      navigationTargets[nextIndex]?.focus();
    }
  }

  function columnDefinition(key: DayColumnKey) {
    return DAY_COLUMN_DEFINITIONS.find((definition) => definition.key === key)!;
  }

  function closeColumnsMenu(returnFocus = false) {
    setColumnsMenuOpen(false);
    if (returnFocus) columnsTriggerRef.current?.focus();
  }

  function handleColumnsMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeColumnsMenu(true);
  }

  function columnDropEdge(event: ReactDragEvent<HTMLSpanElement>): DragEdge {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
  }

  function startColumnDrag(event: ReactDragEvent<HTMLSpanElement>, key: DayColumnKey) {
    if ((event.target as HTMLElement).closest(".column-resize-handle")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key);
    setDayTableResizeLayout(null);
    setColumnDrag({ sourceKey: key, targetKey: null, edge: null });
  }

  function updateColumnDropTarget(event: ReactDragEvent<HTMLSpanElement>, key: DayColumnKey) {
    if (!columnDrag || columnDrag.sourceKey === key) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setColumnDrag({ sourceKey: columnDrag.sourceKey, targetKey: key, edge: columnDropEdge(event) });
  }

  function dropColumn(event: ReactDragEvent<HTMLSpanElement>, targetKey: DayColumnKey) {
    event.preventDefault();
    const sourceKey = columnDrag?.sourceKey ?? event.dataTransfer.getData("text/plain") as DayColumnKey;
    if (sourceKey && sourceKey !== targetKey && dayColumnPreference.order.includes(sourceKey)) {
      const edge = columnDrag?.targetKey === targetKey && columnDrag.edge ? columnDrag.edge : columnDropEdge(event);
      setDayTableResizeLayout(null);
      setDayColumnPreference((current) => ({ ...current, order: reorderDayColumns(current.order, sourceKey, targetKey, edge) }));
    }
    setColumnDrag(null);
  }

  function startColumnResize(event: ReactMouseEvent<HTMLButtonElement>, key: DayColumnKey) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const heading = event.currentTarget.closest<HTMLElement>(".table-heading");
    const taskHeading = heading?.querySelector<HTMLElement>(".task-heading");
    const startTaskWidth = Math.max(280, taskHeading?.getBoundingClientRect().width || dayColumnPreference.taskWidth);
    const startTableWidth = Math.max(0, heading?.getBoundingClientRect().width ?? 0);
    setDayTableResizeLayout({ taskWidth: startTaskWidth, tableWidth: startTableWidth });
    setColumnResize({ key, startX: event.clientX, startWidth: dayColumnPreference.widths[key], startTaskWidth, startTableWidth });
  }

  function startTaskColumnResize(event: ReactMouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const heading = event.currentTarget.closest<HTMLElement>(".table-heading");
    const taskHeading = event.currentTarget.closest<HTMLElement>(".task-heading");
    const startTaskWidth = Math.max(280, taskHeading?.getBoundingClientRect().width || dayColumnPreference.taskWidth);
    const startTableWidth = Math.max(0, heading?.getBoundingClientRect().width ?? 0);
    setDayTableResizeLayout({ taskWidth: startTaskWidth, tableWidth: startTableWidth });
    setColumnResize({ key: "task", startX: event.clientX, startWidth: startTaskWidth, startTaskWidth, startTableWidth });
  }

  function autoFitColumn(event: ReactMouseEvent<HTMLButtonElement>, key: DayColumnKey) {
    event.preventDefault();
    event.stopPropagation();
    const definition = columnDefinition(key);
    setDayTableResizeLayout(null);
    const currentWidth = dayColumnPreference.widths[key];
    const elements = [
      ...Array.from(document.querySelectorAll<HTMLElement>(`[data-day-column-header="${key}"], [data-day-column-cell="${key}"]`)),
    ];
    const measured = elements.reduce((maximum, element) => {
      const textWidth = (element.textContent?.trim().length ?? 0) * 7.5;
      const labelWidth = element.querySelector<HTMLElement>(".column-heading-label")?.scrollWidth ?? 0;
      const overflowingContentWidth = element.scrollWidth > currentWidth ? element.scrollWidth : 0;
      return Math.max(maximum, labelWidth + 20, overflowingContentWidth, textWidth + 20);
    }, definition.minWidth);
    setDayColumnPreference((current) => ({
      ...current,
      widths: { ...current.widths, [key]: clampDayColumnWidth(key, measured) },
    }));
  }

  function actualSummaryFor(entry: EntryProjection) {
    const operation = pendingExecutionTimesOverlays[entry.id];
    if (!operation) return entry.execution_summary;
    const startedAt = operation.started_at;
    const endedAt = operation.ended_at;
    const completedDuration = endedAt === null ? entry.execution_summary?.completed_duration_seconds ?? 0
      : Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
    return {
      first_started_at: startedAt,
      last_ended_at: endedAt,
      completed_duration_seconds: completedDuration,
      active_started_at: endedAt === null ? startedAt : null,
      single_execution_id: operation.execution_id,
      active_execution_id: endedAt === null ? operation.execution_id : null,
      executions: entry.execution_summary?.executions,
    };
  }

  function actualDurationFor(entry: EntryProjection): string {
    const seconds = actualDurationSeconds(
      actualSummaryFor(entry),
      forecastNowInstant ?? currentDay.projection_generated_at,
      currentDay.is_current,
    );
    return seconds === null ? "--分" : formatActualDuration(seconds);
  }

  function routineCell(entry: EntryProjection) {
    const routineActionAvailable = currentDay.is_current
      && currentDay.taskchute_day.id !== null
      && currentDay.planning_enabled
      && entry.lifecycle_state === "planned"
      && entry.routine === null;
    const routineEditorOpen = routineDraft?.entryId === entry.id;
    return (
      <div className="routine-cell" data-day-column-cell="routine" onClick={(event) => event.stopPropagation()}>
        {entry.routine ? (
          <span className="routine-badge routine-icon routine-active" aria-label={`${entry.task.title}はルーティン`} title="ルーティン">
            <RoutineIcon /><span className="sr-only">Routine</span>
          </span>
        ) : routineEditorOpen ? (
          <span className="routine-editor-status" aria-live="polite">Routine設定中…</span>
        ) : routineActionAvailable ? (
          <button type="button" className="routine-action routine-icon routine-muted" aria-label="Routine化" title={`${entry.task.title}をRoutine化`} disabled={mutationLocked || isMutationScopeBusy(placementMutationScope())}
            onClick={(event) => { event.stopPropagation(); setRoutineDraft({ entryId: entry.id, endDate: "" }); }}>
            <RoutineIcon />
          </button>
        ) : (
          <span className="routine-icon routine-muted" aria-label={`${entry.task.title}のRoutine化は利用不可`} title="Routine化は利用不可">
            <RoutineIcon /><span className="sr-only">Routine</span>
          </span>
        )}
      </div>
    );
  }

  function executionTimeCell(entry: EntryProjection, field: "start" | "end") {
    const draft = executionTimesDraft?.entryId === entry.id ? executionTimesDraft : null;
    const editingThisField = draft?.activeField === field;
    const value = field === "start" ? draft?.startedLocal ?? "" : draft?.endedLocal ?? "";
    const summary = actualSummaryFor(entry);
    const displayed = field === "start"
      ? formatActualTime(summary?.first_started_at ?? null, currentDay.taskchute_day.logical_date, currentDay.taskchute_day.establishment_timezone)
      : summary?.active_started_at
        ? "実行中"
        : formatActualTime(summary?.last_ended_at ?? null, currentDay.taskchute_day.logical_date, currentDay.taskchute_day.establishment_timezone);
    const label = field === "start" ? `${entry.task.title}の開始` : `${entry.task.title}の終了`;
    const canEditField = canEditExecutionTimes(entry)
      && !(field === "end" && (entry.lifecycle_state === "planned" || !hasCanonicalActualStart(entry)));
    if (draft && editingThisField) {
      const inlineKey = `execution-times:${entry.id}`;
      return <span className="actual-time-editor" data-execution-editing={field} data-execution-entry={entry.id}
        onBlur={(event) => {
          const related = event.relatedTarget as HTMLElement | null;
          if (related?.dataset.executionEntry === entry.id) return;
          if (shouldSkipInlineEditorBlur(inlineKey)) return;
          markInlineEditorAction(inlineKey, "commit");
          commitExecutionTimes(entry);
        }}>
        {field === "start" && draft.executionOptions.length > 1 && (
          <select aria-label={`${entry.task.title}のExecution`} value={draft.executionId ?? ""} onChange={(event) => selectExecutionForCorrection(event.target.value)}>
            {draft.executionOptions.map((execution) => <option value={execution.id} key={execution.id}>{execution.started_at} → {execution.ended_at ?? "実行中"}</option>)}
          </select>
        )}
        <input autoFocus type="text" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder="HHMM"
          data-inline-navigation data-execution-entry={entry.id} value={value}
          aria-label={label} required={field === "start" || draft.expectedLifecycleState === "completed"}
          onChange={(event) => setExecutionTimesDraft((current) => current
            ? { ...current, [field === "start" ? "startedLocal" : "endedLocal"]: event.target.value } : current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab") {
              if (event.key === "Enter") event.preventDefault();
              else {
                event.preventDefault();
                const row = event.currentTarget.closest<HTMLElement>("[data-entry-id]");
                const cell = event.currentTarget.closest<HTMLElement>("[data-day-column-cell]");
                if (row && cell) focusInlineTabDestination(row, cell, event.shiftKey);
              }
              markInlineEditorAction(inlineKey, "commit");
              commitExecutionTimes(entry);
            } else if (event.key === "Escape") {
              event.preventDefault();
              handleInlineEditorEscape(inlineKey, () => { setExecutionTimesDraft(null); setExecutionEditorError(null); });
            }
          }} />
        {field === "end" && executionEditorError && <span className="inline-field-error" role="alert">{executionEditorError}</span>}
      </span>;
    }
    return <button type="button" className="actual-time-button" aria-label={label}
      disabled={!canEditField || mutationLocked || isMutationScopeBusy(executionMutationScope(entry.id))}
      onClick={() => openExecutionTimesEditor(entry, field)}>
      {displayed === "—" ? <EmptyValue display="--:--" label={field === "start" ? "実績開始なし" : "実績終了なし"} /> : displayed}
    </button>;
  }

  function renderEntryColumn(entry: EntryProjection, key: DayColumnKey) {
    const summary = actualSummaryFor(entry);
    switch (key) {
      case "project": {
        const metadataEditing = taskMetadataDraft?.entryId === entry.id;
        const metadataOverlay = pendingTaskMetadataOverlays[entry.id];
        const projectOptions: Array<ProjectSummary & { archived?: boolean }> = [...projects];
        if (entry.task.project && !projectOptions.some((candidate) => candidate.id === entry.task.project?.id)) {
          projectOptions.unshift({ ...entry.task.project, archived: true });
        }
        const projectId = metadataOverlay ? metadataOverlay.project_id : entry.task.project?.id ?? null;
        const projectTitle = projectId === null ? null : projectOptions.find((candidate) => candidate.id === projectId)?.title ?? entry.task.project?.title ?? null;
        return <span className="project-name" data-day-column-cell={key}>
          {metadataEditing ? <select className="project-selector" aria-label={`${entry.task.title}のProject`} value={taskMetadataDraft.projectId ?? ""}
            disabled={isMutationScopeBusy(entryMutationScope(entry.id, entry.task.id))}
            onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              const projectId = event.target.value || null;
              setTaskMetadataDraft((current) => current ? { ...current, projectId } : current);
              commitTaskMetadata(entry, projectId);
            }}>
            <option value="">Projectなし</option>
            {projectOptions.map((candidate) => <option value={candidate.id} key={candidate.id} disabled={candidate.archived === true}>{candidate.title}{candidate.archived ? "（アーカイブ）" : ""}</option>)}
          </select> : canEditTaskMetadata(entry) ? <select className="project-selector" aria-label={`${entry.task.title}のProject`} value={projectId ?? ""}
            disabled={isMutationScopeBusy(entryMutationScope(entry.id, entry.task.id))}
            onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
            onChange={(event) => commitProjectMetadata(entry, event.target.value || null)}>
            <option value="">Projectなし</option>
            {projectOptions.map((candidate) => <option value={candidate.id} key={candidate.id} disabled={candidate.archived === true}>{candidate.title}{candidate.archived ? "（アーカイブ）" : ""}</option>)}
          </select> : projectTitle ?? <EmptyValue label="Project未設定" />}
        </span>;
      }
      case "section":
        return <select className="section-cell" data-day-column-cell={key} aria-label={`${entry.task.title}のSection`} value={entry.section_id ?? ""}
          disabled={mutationLocked || isMutationScopeBusy(entry.routine ? routineMutationScope(entry.id, entry.routine.routine_definition_id) : placementMutationScope())
            || !currentDay.planning_enabled || entry.lifecycle_state !== "planned"
            || (entry.routine !== null && !currentDay.is_current)}
          onClick={(event) => event.stopPropagation()} onChange={(event) => entry.routine
            ? changeRoutineSectionCandidate(entry, event.target.value || null)
            : void changeSection(entry, event.target.value || null)}>
          <option value="">Sectionなし</option>
          {currentDay.sections.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.title}</option>)}
        </select>;
      case "routine":
        return routineCell(entry);
      case "estimate": {
        const estimateOverlay = pendingEstimateOverlays[entry.id];
        const estimateSeconds = estimateOverlay ? estimateOverlay.estimate_seconds : entry.estimate_seconds;
        return <span className="estimate-cell" data-day-column-cell={key}
          onBlur={(event) => {
            if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
            const inlineKey = `estimate:${entry.id}`;
            if (shouldSkipInlineEditorBlur(inlineKey)) return;
            markInlineEditorAction(inlineKey, "commit");
            void commitEstimate(entry.id);
          }}>
          {editingEstimate?.entryId === entry.id ? <>
            <input autoFocus aria-label={`${entry.task.title}の見積（分）`} inputMode="numeric" data-inline-navigation value={editingEstimate.minutes}
              onChange={(event) => setEditingEstimate({ entryId: entry.id, minutes: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Tab") {
                if (event.key === "Enter") event.preventDefault();
                else {
                  event.preventDefault();
                  const row = event.currentTarget.closest<HTMLElement>("[data-entry-id]");
                  const cell = event.currentTarget.closest<HTMLElement>("[data-day-column-cell]");
                  if (row && cell) focusInlineTabDestination(row, cell, event.shiftKey);
                }
                markInlineEditorAction(`estimate:${entry.id}`, "commit");
                void commitEstimate(entry.id);
              } else if (event.key === "Escape") {
                event.preventDefault();
                handleInlineEditorEscape(`estimate:${entry.id}`, () => { setEditingEstimate(null); setError(null); });
              } }} />
            {entry.routine?.estimate_override_present && (
              <button type="button" className="routine-reset" aria-label={`${entry.task.title}の見積をルーティンの設定に戻す`}
                disabled={mutationLocked || isMutationScopeBusy(routineMutationScope(entry.id, entry.routine?.routine_definition_id))} onClick={() => void resetRoutineUnit(entry, "estimate")}>ルーティンの設定に戻す</button>
            )}
          </>
            : <button type="button" className="estimate-button" aria-label={`${entry.task.title}の見積`} disabled={mutationLocked || isMutationScopeBusy(entry.routine ? routineMutationScope(entry.id, entry.routine.routine_definition_id) : entryMutationScope(entry.id)) || !currentDay.planning_enabled || entry.lifecycle_state !== "planned" || (entry.routine !== null && !currentDay.is_current)}
              onClick={() => { beginInlineEditor(`estimate:${entry.id}`); setEditingEstimate({ entryId: entry.id, minutes: estimateSeconds ? String(estimateSeconds / 60) : "" }); }}>{renderEmptyValue(formatEstimate(estimateSeconds), "見積なし", "--分")}</button>}
        </span>;
      }
      case "plannedStart": {
        const plannedStartOverlay = pendingPlannedStartOverlays[entry.id];
        const plannedStartMinute = plannedStartOverlay ? plannedStartOverlay.request.planned_start_minute : entry.planned_start_minute;
        return <span className="planned-start-cell" data-day-column-cell={key}
          onBlur={(event) => {
            if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
            const inlineKey = `planned-start:${entry.id}`;
            if (shouldSkipInlineEditorBlur(inlineKey)) return;
            markInlineEditorAction(inlineKey, "commit");
            void commitPlannedStart(entry);
          }}>
          {editingPlannedStart?.entryId === entry.id ? <>
            <input autoFocus aria-label={`${entry.task.title}の開始予定`} data-inline-navigation value={editingPlannedStart.value} placeholder="HHMM" inputMode="numeric" maxLength={4} pattern="[0-9]{4}"
              onChange={(event) => setEditingPlannedStart({ entryId: entry.id, value: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Tab") {
                if (event.key === "Enter") event.preventDefault();
                else {
                  event.preventDefault();
                  const row = event.currentTarget.closest<HTMLElement>("[data-entry-id]");
                  const cell = event.currentTarget.closest<HTMLElement>("[data-day-column-cell]");
                  if (row && cell) focusInlineTabDestination(row, cell, event.shiftKey);
                }
                markInlineEditorAction(`planned-start:${entry.id}`, "commit");
                void commitPlannedStart(entry);
              } else if (event.key === "Escape") {
                event.preventDefault();
                handleInlineEditorEscape(`planned-start:${entry.id}`, () => { setEditingPlannedStart(null); setError(null); });
              } }} />
            {entry.routine?.section_plan_override_present && (
              <button type="button" className="routine-reset" aria-label={`${entry.task.title}のSection・開始予定をルーティンの設定に戻す`}
                disabled={mutationLocked || isMutationScopeBusy(routineMutationScope(entry.id, entry.routine?.routine_definition_id))} onClick={() => void resetRoutineUnit(entry, "section-plan")}>ルーティンの設定に戻す</button>
            )}
          </>
            : <button type="button" className="planned-start-button" aria-label={`${entry.task.title}の開始予定`}
              disabled={mutationLocked || isMutationScopeBusy(entry.routine ? [...placementMutationScope(), ...routineMutationScope(entry.id, entry.routine.routine_definition_id)] : placementMutationScope()) || !currentDay.planning_enabled || entry.lifecycle_state !== "planned" || (entry.routine !== null && !currentDay.is_current)}
              onClick={() => { beginInlineEditor(`planned-start:${entry.id}`); setEditingPlannedStart({ entryId: entry.id,
                value: plannedStartMinute === null ? "" : formatClockInputFromLogicalMinute(plannedStartMinute) }); }}>
              {plannedStartMinute === null ? <EmptyValue display="--:--" label="開始予定なし" /> : formatLogicalMinute(plannedStartMinute)}
            </button>}
        </span>;
      }
      case "forecast":
        return <span className="forecast-cell" data-day-column-cell={key} aria-label={`${entry.task.title}の開始見込`}>
          {renderEmptyValue(formatStartForecast(forecastByEntryId[entry.id], currentDay.taskchute_day.logical_date, currentDay.taskchute_day.establishment_timezone), "開始見込なし")}
        </span>;
      case "actualStart":
        return <span className="actual-start-cell actual-time-cell" data-day-column-cell={key}>
          {executionTimeCell(entry, "start")}
        </span>;
      case "actualEnd":
        return <span className="actual-end-cell actual-time-cell" data-day-column-cell={key}>
          {executionTimeCell(entry, "end")}
        </span>;
      case "actualDuration":
        return <span className="actual-duration-cell actual-duration" data-day-column-cell={key} aria-label={`${entry.task.title}の実績`}>
          {renderEmptyValue(actualDurationFor(entry), "実績なし", "--分")}
        </span>;
    }
  }

  function renderDraftColumn(section: { title: string }, key: DayColumnKey) {
    if (key === "section") return <span className="section-cell" data-day-column-cell={key}>{section.title}</span>;
    const definition = columnDefinition(key);
    return <span className={`${definition.cellClassName} muted`} data-day-column-cell={key}><EmptyValue /></span>;
  }

  return (
    <div className={`app-layout${sidebarOpen ? "" : " sidebar-closed"}`} data-sidebar-state={sidebarOpen ? "open" : "closed"}>
      {sidebarOpen && <aside className="primary-sidebar">
        <div className="sidebar-header">
          <div className="product-mark">TaskChute</div>
          <button type="button" className="sidebar-toggle" aria-label="サイドバーを閉じる" title="サイドバーを閉じる"
            disabled={mutationLocked} onClick={() => setSidebarOpen(false)}>‹</button>
        </div>
        <nav aria-label="メインナビゲーション">
          <button type="button" className={view === "today" ? "active" : ""} aria-current={view === "today" ? "page" : undefined}
            disabled={mutationLocked} onClick={() => void openTodayView()}>今日</button>
          <button type="button" className={view === "routines" ? "active" : ""} aria-current={view === "routines" ? "page" : undefined}
            disabled={mutationLocked} onClick={() => { setCalendarOpen(false); setView("routines"); }}>ルーティン</button>
          <button type="button" className={view === "settings" ? "active" : ""} aria-current={view === "settings" ? "page" : undefined}
            disabled={mutationLocked || day.section_configuration_required} onClick={() => void openSettings("section")}>設定</button>
        </nav>
        <button className="sidebar-logout" onClick={() => void logout()} disabled={mutationLocked}>
          {pending === "logout" ? "ログアウト中…" : "ログアウト"}
        </button>
      </aside>
      }

      <div className="authenticated-content">
        {!sidebarOpen && <button type="button" className="sidebar-reopen" aria-label="サイドバーを開く" title="サイドバーを開く"
          onClick={() => setSidebarOpen(true)}>›</button>}
        {view === "routines" ? <RoutineBoard onUnauthorized={transitionToSignedOut} /> : view === "settings" ? (
          <main className="shell settings-shell">
          <header className="settings-header">
            <p className="eyebrow">Settings</p>
            <h1>設定</h1>
          </header>
          <div className="settings-layout">
            <nav className="settings-navigation" aria-label="設定ナビゲーション">
              <button type="button" className={settingsDestination === "section" ? "active" : ""}
                aria-current={settingsDestination === "section" ? "page" : undefined} disabled={mutationLocked}
                onClick={() => void openSettings("section")}>Section</button>
              <button type="button" className={settingsDestination === "project" ? "active" : ""}
                aria-current={settingsDestination === "project" ? "page" : undefined} disabled={mutationLocked}
                onClick={() => void openSettings("project")}>Project</button>
            </nav>

            <section className="settings-content" aria-label="設定内容">
              {transientStatus && <div className="transient-status" role="status" aria-live="polite" aria-atomic="true">{transientStatus}</div>}
              {sectionSettingsNotice && <p role="status" className="success">{sectionSettingsNotice}</p>}
              {error && <p role="alert" className="error">{error}</p>}

              {settingsDestination === "project" && (
                <ProjectBoard onUnauthorized={transitionToSignedOut} onProjectsChanged={setProjects} />
              )}

              {settingsDestination === "section" && !sectionSettingsDraft && pending !== "section-settings" && (
                <div className="settings-empty">
                  <h2>Section</h2>
                  <p>Section設定を編集するには、現在の設定を読み込んでください。</p>
                  <button type="button" className="secondary" disabled={mutationLocked} onClick={() => void openSectionSettings()}>再読み込み</button>
                </div>
              )}

              {settingsDestination === "section" && sectionSettingsDraft && (
                <section className="section-settings" aria-label="Section設定">
                  <div className="settings-section-heading"><div><h2>Section</h2><p>変更は次に確立されるTaskChuteDayから反映されます。現在のDayとTask配置は変わりません。</p></div></div>
                  <div className="section-settings-list">
                    {sectionSettingsDraft.items.map((item, index) => (
                      <div className="section-settings-row" key={item.section_id}>
                        <label>名前<input aria-label={`Section ${index + 1}の名前`} maxLength={100} value={item.title}
                          onChange={(event) => setSectionSettingsDraft({ ...sectionSettingsDraft,
                            items: sectionSettingsDraft.items.map((candidate, itemIndex) => itemIndex === index
                              ? { ...candidate, title: event.target.value } : candidate) })} /></label>
                        <label>開始<input aria-label={`${item.title}の開始`} value={item.logical_start_text}
                          disabled={index === 0} onChange={(event) => updateSectionBoundary(index, "start", event.target.value)} /></label>
                        <label>終了<input aria-label={`${item.title}の終了`} value={item.logical_end_text}
                          disabled={index === sectionSettingsDraft.items.length - 1}
                          onChange={(event) => updateSectionBoundary(index, "end", event.target.value)} /></label>
                        <button type="button" className="secondary" disabled={mutationLocked || !parsedSectionSettingsDraft}
                          onClick={() => addSection(index)}>この後に追加</button>
                        <button type="button" className="secondary"
                          disabled={mutationLocked || sectionSettingsDraft.items.length === 1 || !parsedSectionSettingsDraft}
                          onClick={() => deleteSection(index)}>削除</button>
                      </div>
                    ))}
                  </div>
                  <div className="section-settings-actions">
                    <button type="button" className="secondary" disabled={pending !== null}
                      onClick={() => { setSectionSettingsDraft(null); setError(null); }}>キャンセル</button>
                    <button type="button" disabled={mutationLocked || !parsedSectionSettingsDraft}
                      onClick={() => void saveSectionSettings()}>{pending === "section-settings" ? "保存・照合中…" : "次のDay用に保存"}</button>
                  </div>
                </section>
              )}
            </section>
          </div>

          {retainedOperation && pending === null && (
            <section className="panel pending-intent" aria-label="結果未確定の操作">
              <p>結果未確定の操作があります。元の操作だけを再試行するか、client側の保留を破棄してください。</p>
              {projectOperation && <button type="button" onClick={() => void executeCreateProject(projectOperation)}>保留中のProject作成を再試行</button>}
              {sectionSettingsOperation && <button type="button" onClick={() => void executeSectionSettings(sectionSettingsOperation)}>保留中の次Day Section設定を再試行</button>}
              <button type="button" className="secondary" onClick={() => {
                setProjectOperation(null); setSectionSettingsOperation(null); setError(null);
              }}>保留中のclient操作を破棄</button>
            </section>
          )}
          </main>
        ) : (
          <main className="shell day-shell" tabIndex={-1} onKeyDown={handleDayKeyDown}>
      <header className="day-header">
        <div>
          <p className="eyebrow">TaskChuteDay</p>
          <div className="day-navigation" aria-label="日付ナビゲーション">
            <button type="button" className="secondary" aria-label="前の日" disabled={mutationLocked}
              onClick={() => void navigateToDay(shiftLogicalDate(day.taskchute_day.logical_date, -1))}>‹</button>
            <div className="day-date-picker">
              <button type="button" className="day-date-trigger" ref={calendarTriggerRef}
                aria-label={`${formatLogicalDateLabel(day.taskchute_day.logical_date)}、日付を選択`}
                aria-haspopup="dialog" aria-expanded={calendarOpen} disabled={mutationLocked}
                onClick={() => calendarOpen ? closeCalendar() : openCalendar()}>
                {formatLogicalDateLabel(day.taskchute_day.logical_date)}
              </button>
              {calendarOpen && calendarFocusedDate && (() => {
                const focusedMonth = Temporal.PlainDate.from(calendarFocusedDate);
                return (
                  <div className="calendar-popover" ref={calendarPopoverRef} role="dialog" aria-modal="false"
                    aria-label={`${formatCalendarMonth(calendarFocusedDate)}のカレンダー`}
                    onKeyDown={handleCalendarKeyDown}>
                    <div className="calendar-month-toolbar">
                      <button type="button" className="secondary calendar-nav-button" aria-label="前年"
                        onClick={() => shiftCalendarViewport("year", -1)}>«</button>
                      <button type="button" className="secondary calendar-nav-button" aria-label="前の月"
                        onClick={() => shiftCalendarViewport("month", -1)}>‹</button>
                      <div className="calendar-month-heading" aria-live="polite">{formatCalendarMonth(calendarFocusedDate)}</div>
                      <button type="button" className="secondary calendar-nav-button" aria-label="次の月"
                        onClick={() => shiftCalendarViewport("month", 1)}>›</button>
                      <button type="button" className="secondary calendar-nav-button" aria-label="翌年"
                        onClick={() => shiftCalendarViewport("year", 1)}>»</button>
                    </div>
                    <div className="calendar-grid" role="grid" aria-label="日付" ref={calendarGridRef}>
                      {["月", "火", "水", "木", "金", "土", "日"].map((weekday) => (
                        <span className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</span>
                      ))}
                      {calendarMonthDates(calendarFocusedDate).map((logicalDate) => {
                        const candidate = Temporal.PlainDate.from(logicalDate);
                        const selected = logicalDate === day.taskchute_day.logical_date;
                        const today = logicalDate === currentLogicalDate;
                        const outsideMonth = candidate.month !== focusedMonth.month || candidate.year !== focusedMonth.year;
                        const suffix = [selected ? "選択中" : "", today ? "今日" : "", outsideMonth ? "表示月外" : ""]
                          .filter(Boolean).join("、");
                        return (
                          <button type="button" role="gridcell" className={`calendar-day${outsideMonth ? " outside-month" : ""}`}
                            key={logicalDate} data-calendar-date={logicalDate} tabIndex={logicalDate === calendarFocusedDate ? 0 : -1}
                            aria-selected={selected} aria-current={today ? "date" : undefined}
                            aria-label={`${formatLogicalDateLabel(logicalDate)}${suffix ? `、${suffix}` : ""}`}
                            onClick={() => void selectCalendarDate(logicalDate)}>{candidate.day}</button>
                        );
                      })}
                    </div>
                    <p className="sr-only">矢印キーで日付、PageUpとPageDownで月、Shiftを併用すると年を移動し、Enterで選択、Escapeで閉じます。</p>
                  </div>
                );
              })()}
            </div>
            <button type="button" className="secondary" aria-label="次の日" disabled={mutationLocked}
              onClick={() => void navigateToDay(shiftLogicalDate(day.taskchute_day.logical_date, 1))}>›</button>
            <button type="button" className="secondary" disabled={mutationLocked || day.is_current}
              onClick={() => void navigateToDay()}>今日</button>
          </div>
        </div>
      </header>

      {shortcutHelpOpen && (
        <Modal title="キーボードショートカット" titleId="shortcut-help-title" className="shortcut-help"
          onClose={() => setShortcutHelpOpen(false)}>
          <dl className="shortcut-help-list">
            <div><dt>↓ / J</dt><dd>次のvisible Taskへ移動</dd></div>
            <div><dt>↑ / K</dt><dd>前のvisible Taskへ移動</dd></div>
            <div><dt>S</dt><dd>Taskを開始 / 実行中Taskを完了</dd></div>
            <div><dt>N</dt><dd>現在のSectionにTaskを追加</dd></div>
            <div><dt>E</dt><dd>ordinary planned Taskの名前を編集</dd></div>
            <div><dt>D</dt><dd>single planned Taskの削除確認</dd></div>
            <div><dt>Shift + ← / →</dt><dd>前日 / 翌日へ移動</dd></div>
            <div><dt>Shift + ↑ / ↓</dt><dd>同じcohort内で並び替え</dd></div>
            <div><dt>?</dt><dd>このhelpを表示</dd></div>
            <div><dt>X</dt><dd>focused eligible Taskの選択を切り替え</dd></div>
            <div><dt>Esc</dt><dd>開いているeditor / menu / calendarを閉じる</dd></div>
          </dl>
        </Modal>
      )}

      {routineDraft && (() => {
        const entry = allEntries.find((candidate) => candidate.id === routineDraft.entryId);
        if (!entry) return null;
        return (
          <Modal title="Routine化" titleId="routine-conversion-title" className="routine-editor"
            onClose={() => setRoutineDraft(null)}>
            <p>{entry.task.title}をRoutineに変換します。</p>
            <label>終了日（空欄は終了なし）
              <input type="date" min={currentDay.taskchute_day.logical_date}
                value={routineDraft.endDate}
                onChange={(event) => setRoutineDraft({ entryId: entry.id, endDate: event.target.value })} />
            </label>
            <div className="bulk-confirmation-actions">
              <button type="button" className="secondary" onClick={() => setRoutineDraft(null)}>キャンセル</button>
              <button type="button" disabled={mutationLocked || isMutationScopeBusy(placementMutationScope())}
                onClick={() => void commitRoutineConversion(entry)}>Routine化</button>
            </div>
          </Modal>
        );
      })()}

      {routineCandidate && (() => {
        const entry = allEntries.find((candidate) => candidate.id === routineCandidate.entryId);
        if (!entry) return null;
        const value = routineCandidate.unit === "estimate"
          ? formatEstimate(routineCandidate.estimateSeconds)
          : routineCandidate.sectionId === null ? "Sectionなし / —"
            : `${currentDay.sections.find((section) => section.id === routineCandidate.sectionId)?.title ?? "Section"} / ${formatLogicalMinute(routineCandidate.plannedStartMinute)}`;
        return (
          <Modal title="Routine設定の反映先" titleId="routine-scope-choice-title" className="routine-scope-choice"
            onClose={() => setRoutineCandidate(null)}>
            <p>{entry.task.title} · {value}</p>
            <div role="group" aria-label={`${entry.task.title}の${routineCandidate.unit === "estimate" ? "見積" : "Section・開始予定"}反映先`} className="bulk-confirmation-actions">
              <span>{value}</span>
              <button type="button" disabled={mutationLocked || isMutationScopeBusy(routineMutationScope(entry.id, entry.routine?.routine_definition_id))} onClick={() => void commitRoutineCandidate(entry, "occurrence")}>今回だけ</button>
              <button type="button" disabled={mutationLocked || isMutationScopeBusy(routineMutationScope(entry.id, entry.routine?.routine_definition_id))} onClick={() => void commitRoutineCandidate(entry, "definition")}>ルーティンに反映</button>
              <button type="button" className="secondary" onClick={() => setRoutineCandidate(null)}>キャンセル</button>
            </div>
          </Modal>
        );
      })()}

      <div className="day-toolbar" aria-label="Day controls">
          <button type="button" className="secondary"
          disabled={mutationLocked || isMutationScopeBusy(placementMutationScope()) || !day.planning_enabled || day.section_configuration_required}
          onClick={() => openDraft(null)}>＋ Taskを追加</button>
        {selectedBulkEntries.length > 0 && (
          <div className="bulk-selection-toolbar" aria-label="選択中のTask">
            <span role="status" aria-live="polite">{selectedBulkEntries.length}件選択中</span>
            <button ref={bulkDateMoveTriggerRef} type="button" className="secondary" disabled={mutationLocked || isMutationScopeBusy(placementMutationScope()) || selectedBulkEntries.length !== selectedEntryIds.length}
              title="選択したTaskの日付を変更" onClick={() => openBulkDateMove()}>日付変更</button>
            {day.planning_enabled && <button ref={bulkEstimateTriggerRef} type="button" className="secondary"
              disabled={mutationLocked || isMutationScopeBusy(bulkEntryMutationScope(selectedBulkEntries.map((entry) => entry.id))) || selectedBulkEntries.length !== selectedEntryIds.length
                || (selectedBulkEntries.some((entry) => entry.routine !== null) && !day.is_current)}
              title={selectedBulkEntries.some((entry) => entry.routine !== null) && !day.is_current
                ? "Routine Taskを含む見積変更は今日だけ実行できます" : "選択したTaskの見積を変更"}
              onClick={openBulkEstimateConfirmation}>見積変更</button>}
            {day.planning_enabled && <div className="bulk-section-menu">
              <button ref={bulkSectionTriggerRef} type="button" className="secondary" disabled={mutationLocked || isMutationScopeBusy(placementMutationScope()) || selectedBulkEntries.length !== selectedEntryIds.length || (selectedBulkEntries.some((entry) => entry.routine !== null) && !day.is_current)}
                aria-label="Section変更" aria-expanded={bulkSectionPickerOpen} aria-controls="bulk-section-picker"
                aria-describedby={selectedBulkEntries.some((entry) => entry.routine !== null) ? "bulk-section-routine-hint" : undefined}
                title={selectedBulkEntries.some((entry) => entry.routine !== null)
                  ? "Routine Taskを含む選択は今回のOccurrenceだけ変更します"
                  : "選択したTaskのSectionを変更"}
                onClick={openBulkSectionPicker}>Section変更</button>
              {selectedBulkEntries.some((entry) => entry.routine !== null) && (
                <span id="bulk-section-routine-hint" className="sr-only">Routine Taskを含む選択では現在のOccurrenceだけを今回だけ変更します</span>
              )}
              {bulkSectionPickerOpen && (
                <Modal id="bulk-section-picker" title="変更先Section"
                  titleId="bulk-section-picker-title" className="bulk-section-picker" onClose={() => closeBulkSectionPicker(true)}>
                  <p className="bulk-section-picker-title">変更先Section{selectedBulkEntries.some((entry) => entry.routine !== null) ? "（Routineは今回だけ）" : ""}</p>
                  <div className="bulk-section-options">
                    {currentDay.sections.map((section) => (
                      <button type="button" key={section.id} onClick={() => chooseBulkSection(section.id)}>{section.title}</button>
                    ))}
                    <button type="button" className="secondary" onClick={() => chooseBulkSection(null)}>Sectionなし</button>
                  </div>
                  <button type="button" className="secondary bulk-section-cancel" onClick={() => closeBulkSectionPicker(true)}>キャンセル</button>
                </Modal>
              )}
            </div>}
            {day.planning_enabled && <button ref={bulkDeleteTriggerRef} type="button" className="destructive-action" disabled={mutationLocked || isMutationScopeBusy(placementMutationScope())} onClick={openBulkConfirmation}>削除</button>}
            <button type="button" className="secondary" disabled={mutationLocked || isMutationScopeBusy(placementMutationScope())} onClick={clearBulkSelection}>選択解除</button>
          </div>
        )}
        <div className="columns-menu" ref={columnsMenuRef}>
          <button type="button" className="secondary columns-trigger" ref={columnsTriggerRef}
            aria-label="表示列" aria-expanded={columnsMenuOpen} aria-controls="day-columns-menu"
            onClick={() => setColumnsMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !columnsMenuOpen) return;
              event.preventDefault();
              closeColumnsMenu(true);
            }}>列</button>
          {columnsMenuOpen && (
            <div id="day-columns-menu" className="columns-popover" role="dialog" aria-label="表示列" onKeyDown={handleColumnsMenuKeyDown}>
              <p id="day-columns-menu-title" className="columns-popover-title">表示する列</p>
              <div className="columns-options">
                {DAY_COLUMN_DEFINITIONS.map((definition) => (
                  <label className="columns-option" key={definition.key}>
                    <input type="checkbox" checked={!dayColumnPreference.hidden.includes(definition.key)}
                    onChange={(event) => { setDayTableResizeLayout(null); setDayColumnPreference((current) => setDayColumnVisibility(current, definition.key, event.target.checked)); }} />
                    <span>{definition.label}</span>
                  </label>
                ))}
              </div>
              <div className="columns-actions">
                <button type="button" className="secondary" onClick={() => { setDayTableResizeLayout(null); setDayColumnPreference((current) => showAllDayColumns(current)); }}>すべて表示</button>
                <button type="button" className="secondary" onClick={() => { setDayTableResizeLayout(null); setDayColumnPreference(resetDayColumnPreference); }}>初期状態に戻す</button>
              </div>
            </div>
          )}
        </div>
        <label className="completed-toggle">
          <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
          実行済みを表示
        </label>
      </div>

      {bulkDateMoveConfirmation && (
        <Modal title="Taskの日付を変更" titleId="bulk-date-move-title" className="bulk-confirmation bulk-date-move-confirmation"
          onClose={() => setBulkDateMoveConfirmation(null)}>
          <p>{bulkDateMoveConfirmation.entryIds.length}件を別のDayへ移動します。対象Dayのプレビューは読み取り専用です。</p>
          <label>変更先の日付
            <input type="date" value={bulkDateMoveConfirmation.targetLogicalDate}
              min={currentLogicalDate ?? undefined}
              onChange={(event) => {
                const target = event.target.value;
                void refreshDateMovePreview(target, bulkDateMoveConfirmation.entryIds);
              }} />
          </label>
          {bulkDateMoveConfirmation.previewLoading && <p role="status">変更先の配置を確認中…</p>}
          {bulkDateMoveConfirmation.preview?.establishment_state === "past_record_none" && (
            <p role="alert" className="error">記録のない過去日は変更先にできません。</p>
          )}
          {bulkDateMoveConfirmation.preview && bulkDateMoveConfirmation.preview.establishment_state !== "past_record_none" && (
            <>
              <p>変更先: {formatLogicalDateLabel(bulkDateMoveConfirmation.targetLogicalDate)}</p>
              <ul className="bulk-date-move-summary">
                {bulkDateMoveConfirmation.entryIds.map((entryId) => {
                  const entry = projectionEntries(day).find((candidate) => candidate.id === entryId);
                  const targetSection = entry?.section_id === null
                    ? null
                    : bulkDateMoveConfirmation.preview!.sections.find((section) => section.id === entry?.section_id);
                  return <li key={entryId}>{entry?.task.title ?? entryId} → {targetSection?.title ?? "Sectionなし"}{targetSection && `（${formatLogicalMinute(targetSection.logical_start_minute)}）`}</li>;
                })}
              </ul>
              {bulkDateMoveConfirmation.fallbackEntryIds.length > 0 && (
                <div className="bulk-date-move-fallback" role="alert">
                  <p>次のEntryは変更先に同じSectionがないため、Sectionなし・開始予定なしになります。</p>
                  <ul>{bulkDateMoveConfirmation.fallbackEntryIds.map((entryId) => <li key={entryId}>{projectionEntries(day).find((entry) => entry.id === entryId)?.task.title ?? entryId}</li>)}</ul>
                  <label><input type="checkbox" checked={bulkDateMoveConfirmation.fallbackAcknowledged}
                    onChange={(event) => setBulkDateMoveConfirmation((current) => current
                      ? { ...current, fallbackAcknowledged: event.target.checked } : current)} />この変更を了承する</label>
                </div>
              )}
            </>
          )}
          <div className="bulk-confirmation-actions">
            <button type="button" className="secondary" onClick={() => setBulkDateMoveConfirmation(null)}>キャンセル</button>
            <button type="button" disabled={bulkDateMoveConfirmation.previewLoading
              || bulkDateMoveConfirmation.preview === null
              || bulkDateMoveConfirmation.preview.establishment_state === "past_record_none"
              || (bulkDateMoveConfirmation.fallbackEntryIds.length > 0 && !bulkDateMoveConfirmation.fallbackAcknowledged)}
              onClick={confirmBulkDateMove}>日付変更を確定</button>
          </div>
        </Modal>
      )}

      {bulkSectionConfirmation && (
        <Modal title="RoutineごとのSection変更" titleId="bulk-section-confirmation-title" className="bulk-confirmation bulk-section-scoped-confirmation"
          onClose={() => setBulkSectionConfirmation(null)}>
          <p>
            {bulkSectionConfirmation.entryIds.length}件を
            {bulkSectionConfirmation.sectionId === null
              ? "Sectionなし"
              : `${currentDay.sections.find((section) => section.id === bulkSectionConfirmation.sectionId)?.title ?? "選択したSection"}`}
            に変更します。
          </p>
          {bulkSectionConfirmation.ordinaryCount > 0 && <p>通常Task {bulkSectionConfirmation.ordinaryCount}件は今日だけ変更します。</p>}
          <p id="bulk-section-scope-help">Routine Taskごとにscopeを選択してください。未選択のまま確定することはできません。</p>
          <div className="bulk-scope-fill-actions" aria-label="Routine scope一括入力">
            <button type="button" className="secondary" onClick={() => fillBulkRoutineScopes("occurrence")}>すべて今回だけ</button>
            <button type="button" className="secondary" onClick={() => fillBulkRoutineScopes("definition")}>すべてルーティンに反映</button>
          </div>
          <ul className="bulk-routine-scope-list" aria-describedby="bulk-section-scope-help">
            {bulkSectionConfirmation.routineScopes.map((item) => (
              <li key={item.entryId} className="bulk-routine-scope-row">
                <span className="bulk-routine-scope-identity"><strong>{item.title}</strong><small>Routine</small></span>
                <span role="group" aria-label={`${item.title}のscope`} className="bulk-routine-scope-controls">
                  <button type="button" aria-pressed={item.scope === "occurrence"} onClick={() => setBulkRoutineScope(item.entryId, "occurrence")}>今回だけ</button>
                  <button type="button" aria-pressed={item.scope === "definition"} onClick={() => setBulkRoutineScope(item.entryId, "definition")}>ルーティンに反映</button>
                </span>
                <span className={`bulk-routine-scope-value${item.scope === null ? " unselected" : ""}`}>
                  {item.scope === null ? "未選択" : item.scope === "occurrence" ? "今回だけ" : "ルーティンに反映"}
                </span>
              </li>
            ))}
          </ul>
          <div className="bulk-confirmation-actions">
            <button type="button" className="secondary" onClick={() => {
              setBulkSectionConfirmation(null);
              requestAnimationFrame(() => bulkSectionTriggerRef.current?.focus());
            }}>キャンセル</button>
            <button type="button"
              disabled={bulkSectionConfirmation.routineScopes.some((item) => item.scope === null)}
              title={bulkSectionConfirmation.routineScopes.some((item) => item.scope === null) ? "すべてのRoutine scopeを選択してください" : undefined}
              onClick={confirmBulkSectionScopedChange}>Section変更を確定</button>
          </div>
        </Modal>
      )}

      {bulkEstimateConfirmation && (
        <Modal title="選択したTaskの見積変更" titleId="bulk-estimate-confirmation-title" className="bulk-confirmation bulk-estimate-confirmation"
          onClose={() => setBulkEstimateConfirmation(null)}>
          <label className="bulk-estimate-input">共通見積（分）
            <input autoFocus type="number" min="1" step="1" inputMode="numeric" placeholder="空欄は見積なし"
              value={bulkEstimateConfirmation.estimateMinutes}
              onChange={(event) => setBulkEstimateConfirmation((current) => current
                ? { ...current, estimateMinutes: event.target.value } : current)} />
          </label>
          <p>正の整数を入力すると共通見積を設定します。空欄は明示的な「見積なし」です。</p>
          {bulkEstimateConfirmation.ordinaryCount > 0 && <p>通常Task {bulkEstimateConfirmation.ordinaryCount}件は表示中のDayだけ変更します。</p>}
          {bulkEstimateConfirmation.routineCount > 0 && <>
            <p id="bulk-estimate-scope-help">Routine Taskごとにscopeを選択してください。未選択のまま確定することはできません。</p>
            <div className="bulk-scope-fill-actions" aria-label="Routine見積scope一括入力">
              <button type="button" className="secondary" onClick={() => fillBulkEstimateScopes("occurrence")}>すべて今回だけ</button>
              <button type="button" className="secondary" onClick={() => fillBulkEstimateScopes("definition")}>すべてルーティンに反映</button>
            </div>
            <ul className="bulk-routine-scope-list" aria-describedby="bulk-estimate-scope-help">
              {bulkEstimateConfirmation.routineScopes.map((item) => (
                <li key={item.entryId} className="bulk-routine-scope-row">
                  <span className="bulk-routine-scope-identity"><strong>{item.title}</strong><small>Routine</small></span>
                  <span role="group" aria-label={`${item.title}の見積scope`} className="bulk-routine-scope-controls">
                    <button type="button" aria-pressed={item.scope === "occurrence"} onClick={() => setBulkEstimateScope(item.entryId, "occurrence")}>今回だけ</button>
                    <button type="button" aria-pressed={item.scope === "definition"} onClick={() => setBulkEstimateScope(item.entryId, "definition")}>ルーティンに反映</button>
                  </span>
                  <span className={`bulk-routine-scope-value${item.scope === null ? " unselected" : ""}`}>
                    {item.scope === null ? "未選択" : item.scope === "occurrence" ? "今回だけ" : "ルーティンに反映"}
                  </span>
                </li>
              ))}
            </ul>
          </>}
          <div className="bulk-confirmation-actions">
            <button type="button" className="secondary" onClick={() => {
              setBulkEstimateConfirmation(null);
              requestAnimationFrame(() => bulkEstimateTriggerRef.current?.focus());
            }}>キャンセル</button>
            <button type="button"
              disabled={bulkEstimateConfirmation.routineScopes.some((item) => item.scope === null)
                || (bulkEstimateConfirmation.estimateMinutes.trim() !== ""
                  && (!/^\d+$/.test(bulkEstimateConfirmation.estimateMinutes.trim())
                    || Number(bulkEstimateConfirmation.estimateMinutes) <= 0
                    || !Number.isSafeInteger(Number(bulkEstimateConfirmation.estimateMinutes))))}
              onClick={confirmBulkEstimateChange}>見積変更を確定</button>
          </div>
        </Modal>
      )}

      {bulkConfirmation && (
        <Modal title="選択したTaskを削除" titleId="bulk-confirmation-title" className="bulk-confirmation"
          onClose={() => setBulkConfirmation(null)}>
          <p>
            {bulkConfirmation.ordinaryCount > 0 && bulkConfirmation.routineCount > 0
              ? `${bulkConfirmation.entryIds.length}件の未実行Taskを処理します。通常Task ${bulkConfirmation.ordinaryCount}件はこの日から削除し、Routine Task ${bulkConfirmation.routineCount}件はこの日のみスキップします。`
              : bulkConfirmation.routineCount > 0
                ? `${bulkConfirmation.routineCount}件のRoutine Taskをこの日のみスキップします。`
                : `${bulkConfirmation.ordinaryCount}件の未実行Taskをこの日から削除します。`}
          </p>
          <div className="bulk-confirmation-actions">
            <button type="button" className="secondary" onClick={() => {
              setBulkConfirmation(null);
              requestAnimationFrame(() => bulkDeleteTriggerRef.current?.focus());
            }}>キャンセル</button>
            <button type="button" className="destructive-action" onClick={confirmBulkDelete}>削除</button>
          </div>
        </Modal>
      )}

      {transientStatus && (
        <div className="transient-status" role="status" aria-live="polite" aria-atomic="true">
          {transientStatus}
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}

      {day.establishment_state === "future_preview" && (
        <p className="day-state-notice">未来日のプレビューです。見るだけではDayは確定されません。最初のTask追加が成功した時に確定されます。</p>
      )}
      {day.establishment_state === "past_record_none" && (
        <p className="day-state-notice">記録のない過去日です。この日には確定済みのDayがないため、読み取り専用で表示しています。</p>
      )}

      {day.is_current && day.section_configuration_required && (
        <section className="panel configuration-gate" aria-label="初期Section時間帯設定">
          <h2>Section時間帯を確定</h2>
          <p>既存Sectionの時間を明示してください。全TaskChuteDayを隙間なく連続して覆う必要があります。</p>
          <form onSubmit={submitConfiguration}>
            {day.sections.map((section) => <div className="configuration-row" key={section.id}>
              <strong>{section.title}</strong>
              <label>開始 <input name={`start:${section.id}`} placeholder="04:00" pattern="[0-9]{1,2}:[0-9]{2}" required /></label>
              <span>—</span>
              <label>終了 <input name={`end:${section.id}`} placeholder="09:00" pattern="[0-9]{1,2}:[0-9]{2}" required /></label>
            </div>)}
            <button disabled={mutationLocked}>{pending === "configuration" ? "確定・照合中…" : "この時間帯で確定"}</button>
          </form>
        </section>
      )}

      <section className="day-surface" aria-label="DayBoard" style={dayTableStyle(dayColumnPreference, dayTableResizeLayout ?? undefined)}>
        <div className="table-heading">
          <span className="bulk-slot">
            {eligibleBulkEntries.length > 0 ? (
              <input ref={bulkHeaderRef} type="checkbox" tabIndex={-1} checked={allEligibleBulkSelected} aria-label="すべての未実行Taskを選択"
                disabled={mutationLocked} onChange={toggleAllBulkEntries} />
            ) : <span className="bulk-placeholder" aria-hidden="true" />}
          </span><span className="execution-heading">実行</span><span className="task-heading" data-task-column-header>
            <span className="column-heading-label">Task</span>
            <button type="button" className="column-resize-handle task-column-resize-handle" aria-label="Task列の幅を変更"
              title="Task列の幅を変更" onMouseDown={startTaskColumnResize} />
          </span>
          {resolvedColumnDefinitions.map((definition) => {
            const isDropTarget = columnDrag?.targetKey === definition.key && columnDrag.edge;
            return <span key={definition.key} className={`column-heading${columnDrag?.sourceKey === definition.key ? " is-column-dragging" : ""}${isDropTarget ? ` drop-${columnDrag.edge}` : ""}`}
              data-day-column-header={definition.key} draggable={definition.reorderable}
              onDragStart={(event) => startColumnDrag(event, definition.key)}
              onDragOver={(event) => updateColumnDropTarget(event, definition.key)}
              onDrop={(event) => dropColumn(event, definition.key)}
              onDragEnd={() => setColumnDrag(null)}>
              <span className="column-heading-label">{definition.label}</span>
              <button type="button" className="column-resize-handle" aria-label={`${definition.label}列の幅を変更`} title={`${definition.label}列の幅を変更。ダブルクリックで自動調整`}
                onMouseDown={(event) => startColumnResize(event, definition.key)}
                onDoubleClick={(event) => autoFitColumn(event, definition.key)} />
            </span>;
          })}
          <span className="row-actions-heading" aria-hidden="true" />
        </div>
        {groups.map((section) => {
          const visibleEntries = showCompleted ? section.entries : section.entries.filter((entry) => entry.lifecycle_state !== "completed");
          const completedCount = section.entries.filter((entry) => entry.lifecycle_state === "completed").length;
          const sectionTarget: FocusTarget = { kind: "section", id: groupKey(section.id) };
          const sectionCollapsed = collapsedSectionsByDay[currentDay.taskchute_day.logical_date]?.[groupKey(section.id)] === true;
          const sectionDropActive = entryDrag?.targetSectionKey === groupKey(section.id) && canDropOnSection(section.id);
          const sectionDropPlaceholder = sectionDropActive && !sectionCollapsed ? (
            <div className="section-drop-placeholder" aria-hidden="true"><span>ここに追加</span></div>
          ) : null;
          return (
            <div className="section-group" key={groupKey(section.id)}>
              <div
                className={`section-summary${sectionDropActive ? " drop-target" : ""}${sectionDropActive && sectionCollapsed ? " drop-target-collapsed" : ""}`}
                tabIndex={0}
                role="button"
                aria-expanded={!sectionCollapsed}
                aria-label={`${section.title}を${sectionCollapsed ? "展開" : "折りたたむ"}`}
                data-day-focus-target
                data-focus-key={focusKey(sectionTarget)}
                data-drop-target={sectionDropActive ? "valid" : undefined}
                onMouseMove={(event) => updateSectionMouseTarget(event, section.id)}
                onMouseUp={(event) => finishSectionMouseDrag(event, section.id)}
                onDragOver={(event) => updateSectionDropTarget(event, section.id)}
                onDrop={(event) => dropSection(event, section.id)}
                onDragLeave={(event) => {
                  if (entryDrag?.targetSectionKey === groupKey(section.id) && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setEntryDrag((current) => current ? { ...current, targetSectionKey: null } : null);
                  }
                }}
                onClick={(event) => {
                  if (isInteractiveDragTarget(event.target) || entryDrag || mouseDragRef.current) return;
                  focusSurface(event.currentTarget);
                  toggleSection(section.id);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  toggleSection(section.id);
                }}
              >
                <div className="section-summary-content"><strong>{section.title}</strong><span>{section.id === null ? "時間帯なし" : `${formatLogicalMinute(section.logical_start_minute)}–${formatLogicalMinute(section.logical_end_minute)}`} · {completedCount}/{section.entries.length} 実行済み · 見積 {formatEstimate(section.estimate_total_seconds)}</span></div>
                <div className="section-summary-actions">
                  <button type="button" className="add-task-button" aria-label={`${section.title}にTaskを追加`} title={`${section.title}にTaskを追加`}
                    disabled={mutationLocked || isMutationScopeBusy(placementMutationScope()) || !day.planning_enabled || day.section_configuration_required}
                    onClick={(event) => { event.stopPropagation(); openDraft(section.id); }}>＋</button>
                </div>
              </div>

              {sectionDropPlaceholder && visibleEntries.length === 0 && sectionDropPlaceholder}
              {sectionDropActive && sectionCollapsed && <div className="section-drop-cue" aria-hidden="true">このSectionへ移動</div>}

              {!sectionCollapsed && draftTask?.sectionId === section.id && (
                <form className="task-row draft-row" aria-label={`${section.title}の新規Task`} onSubmit={commitDraft}>
                  <span className="bulk-slot" aria-hidden="true" />
                  <span className="execution-cell" aria-hidden="true"><span className="execution-control is-draft">○</span></span>
                  <label className="draft-name"><span className="sr-only">Task名</span><input ref={draftInputRef} name="title" maxLength={300} value={draftTask.title} placeholder="Task名を入力…" aria-label={`${section.title}のTask名`} disabled={pending === "task" || taskOperation !== null} onChange={(event) => setDraftTask({ ...draftTask, title: event.target.value })} onCompositionStart={() => { draftCompositionRef.current = true; }} onCompositionEnd={() => { draftCompositionRef.current = false; }} onKeyDown={handleDraftKeyDown} onBlur={(event) => {
                    if (!draftTask.title.trim() && !event.currentTarget.form?.contains(event.relatedTarget as Node | null)) setDraftTask(null);
                  }} /></label>
                  {resolvedColumnDefinitions.map((definition) => <Fragment key={definition.key}>{renderDraftColumn(section, definition.key)}</Fragment>)}
                  <span className="row-actions-slot" aria-hidden="true" />
                </form>
              )}

              {!sectionCollapsed && visibleEntries.map((entry) => {
                const entryTarget: FocusTarget = { kind: "entry", id: entry.id };
                const isRunning = entry.lifecycle_state === "running";
                const canComplete = isRunning && day.active_execution?.entry_id === entry.id;
                const canDrag = day.planning_enabled && Boolean(day.taskchute_day.id) && entry.lifecycle_state === "planned";
                const canMoveDate = isBulkSelectableProjectionEntry(currentDay, entry);
                const canEditPlanning = day.planning_enabled && entry.lifecycle_state === "planned";
                const canDuplicate = day.is_current && Boolean(day.taskchute_day.id) && entry.lifecycle_state === "completed";
                const hasOverflowActions = canMoveDate || canEditPlanning || canDuplicate;
                return (
                  <div className={`task-row task-drag-surface state-${entry.lifecycle_state}${selectedEntryIds.includes(entry.id) ? " is-selected" : ""}${entryDrag?.entryId === entry.id ? " is-dragging" : ""}${entryDrag?.targetEntryId === entry.id && entryDrag.edge ? ` drop-${entryDrag.edge}` : ""}`} key={entry.id} tabIndex={0} aria-selected={selectedEntryIds.includes(entry.id)}
                    data-entry-id={entry.id} data-section-id={section.id ?? ""} data-day-focus-target data-focus-key={focusKey(entryTarget)}
                    draggable={canDrag && !mutationLocked && !isMutationScopeBusy(placementMutationScope())}
                    data-drag-surface="row" title={canDrag ? "ドラッグして並び替え" : undefined}
                    onMouseDown={(event) => startEntryMouseDrag(event, section.id, entry)}
                    onDragStart={(event) => startEntryDrag(event, section.id, entry)}
                    onMouseMove={(event) => updateEntryMouseTarget(event, section.id, entry.id)}
                    onMouseUp={(event) => finishEntryMouseDrag(event, section.id, entry.id)}
                    onDragEnd={() => { mouseDragRef.current = null; setEntryDrag(null); }}
                    onDragOver={(event) => updateEntryDropTarget(event, section.id, entry.id)}
                    onDrop={(event) => dropEntry(event, section.id, entry.id)}
                    onDragLeave={(event) => {
                      if (entryDrag?.targetEntryId === entry.id && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setEntryDrag((current) => current ? { ...current, targetEntryId: null, edge: null, targetSectionKey: null } : null);
                      }
                    }}
                    onClick={(event) => {
                    if (isInteractiveDragTarget(event.target) || entryDrag || mouseDragRef.current) return;
                    focusSurface(event.currentTarget);
                  }} onKeyDown={handleTaskRowKeyDown}>
                    <span className="bulk-slot">
                      <input type="checkbox" checked={selectedEntryIds.includes(entry.id)}
                        tabIndex={-1}
                        disabled={!isBulkSelectableProjectionEntry(currentDay, entry) || mutationLocked || isMutationScopeBusy(placementMutationScope())}
                        aria-label={isBulkSelectableProjectionEntry(currentDay, entry)
                          ? `「${entry.task.title}」を選択`
                          : `${entry.task.title}は選択不可（未実行の計画Taskではありません）`}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={() => toggleBulkEntry(entry)} />
                    </span>
                    <span className="execution-cell">
                      {entry.lifecycle_state === "completed" ? (
                        <span className="execution-control completed" aria-label={executionLabel(entry)} title={executionLabel(entry)}>✓</span>
                      ) : (
                        <button type="button" tabIndex={-1} className={`execution-control ${isRunning ? "running" : "planned"}`} aria-label={executionLabel(entry)} title={executionLabel(entry)} disabled={!day.is_current || mutationLocked || (isMutationScopeBusy(["execution-lane"]) && completeOperation === null) || (entry.lifecycle_state === "planned" ? (day.active_execution !== null && completeOperation === null) || queuedStartEntryId !== null : !canComplete)} onClick={() => {
                          if (entry.lifecycle_state === "planned") void start(entry.id);
                          else if (canComplete) void complete(entry.id);
                        }}>{isRunning ? "■" : "▶"}</button>
                      )}
                    </span>
                    <div className="task-main">
                      <div className="task-identity">
                        {(() => {
                          const metadataOverlay = pendingTaskMetadataOverlays[entry.id];
                          const displayedTitle = metadataOverlay?.title ?? entry.task.title;
                          return taskMetadataDraft?.entryId === entry.id ? (
                            <span className="task-metadata-editor"
                              onBlur={(event) => {
                                if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
                                const inlineKey = `task-metadata:${entry.id}`;
                                if (shouldSkipInlineEditorBlur(inlineKey)) return;
                                markInlineEditorAction(inlineKey, "commit");
                                commitTaskMetadata(entry);
                              }}>
                              <input autoFocus maxLength={300} data-inline-navigation aria-label={`${entry.task.title}のTask名`} value={taskMetadataDraft.title}
                                onChange={(event) => setTaskMetadataDraft((current) => current ? { ...current, title: event.target.value } : current)}
                                onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === "Tab") {
                                  if (event.key === "Enter") event.preventDefault();
                                  else {
                                    event.preventDefault();
                                    const row = event.currentTarget.closest<HTMLElement>("[data-entry-id]");
                                    const cell = event.currentTarget.closest<HTMLElement>(".task-main");
                                    if (row && cell) focusInlineTabDestination(row, cell, event.shiftKey);
                                  }
                                  markInlineEditorAction(`task-metadata:${entry.id}`, "commit");
                                    commitTaskMetadata(entry);
                                  } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    handleInlineEditorEscape(`task-metadata:${entry.id}`, () => { setTaskMetadataDraft(null); setError(null); });
                                  }
                                }} />
                              {error && <span className="inline-field-error" role="alert">{error}</span>}
                            </span>
                          ) : (
                            <span className={`task-title-display${canEditTaskMetadata(entry) ? " is-editable" : ""}`}
                              role={canEditTaskMetadata(entry) ? "button" : undefined} tabIndex={canEditTaskMetadata(entry) ? 0 : undefined}
                              aria-label={canEditTaskMetadata(entry) ? `${entry.task.title}を編集` : undefined}
                              onClick={(event) => { if (canEditTaskMetadata(entry)) { event.stopPropagation(); openTaskMetadataEditor(entry); } }}
                              onKeyDown={(event) => {
                                if (canEditTaskMetadata(entry) && (event.key === "Enter" || event.key === " ")) {
                                  event.preventDefault(); event.stopPropagation(); openTaskMetadataEditor(entry);
                                }
                              }}><strong>{displayedTitle}</strong></span>
                          );
                        })()}
                        {day.next_entry?.id === entry.id && <span className="next-label">Next</span>}
                      </div>
                    </div>
                    {resolvedColumnDefinitions.map((definition) => <Fragment key={definition.key}>{renderEntryColumn(entry, definition.key)}</Fragment>)}
                    {hasOverflowActions ? (
                      <div className="row-actions-slot" ref={overflowEntryId === entry.id ? overflowMenuRef : undefined}
                        onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}>
                        <button type="button" className="row-overflow-button" aria-haspopup="menu" aria-expanded={overflowEntryId === entry.id}
                          aria-label={`${entry.task.title}のその他の操作`} title="その他の操作" disabled={mutationLocked || isMutationScopeBusy(placementMutationScope())}
                          onClick={(event) => {
                            overflowMenuTriggerRef.current = event.currentTarget;
                            setOverflowEntryId((current) => current === entry.id ? null : entry.id);
                          }}>
                          …
                        </button>
                        {overflowEntryId === entry.id && (
                          <div className="row-overflow-menu" role="menu" aria-label={`${entry.task.title}の操作`}>
                            {canMoveDate && <button type="button" role="menuitem" onClick={() => {
                              setOverflowEntryId(null);
                              openBulkDateMove([entry.id]);
                            }}>日付変更</button>}
                            {(canEditPlanning || canDuplicate) && <button type="button" role="menuitem" onClick={() => {
                              setOverflowEntryId(null);
                              duplicate(entry);
                            }}>複製</button>}
                            {canEditPlanning && <button type="button" role="menuitem" onClick={() => {
                              setOverflowEntryId(null);
                              openSingleDelete(entry);
                            }} className="destructive-action">削除</button>}
                          </div>
                        )}
                      </div>
                    ) : <span className="row-actions-slot" aria-hidden="true" />}
                  </div>
                );
              })}
              {sectionDropPlaceholder && visibleEntries.length > 0 && sectionDropPlaceholder}
              {!sectionCollapsed && visibleEntries.length === 0 && draftTask?.sectionId !== section.id && <p className="empty-row"><span>表示するTaskはありません</span></p>}
            </div>
          );
        })}
      </section>

      {retainedOperation && pending === null && (
        <section className="panel pending-intent" aria-label="結果未確定の操作">
          <p>結果未確定の操作があります。元の操作だけを再試行するか、client側の保留を破棄してください。</p>
          {projectOperation && <button type="button" onClick={() => void executeCreateProject(projectOperation)}>保留中のProject作成を再試行</button>}
          {taskOperation && <button type="button" onClick={() => void executeAddTask(taskOperation)}>保留中のTask追加を再試行</button>}
          {duplicateOperation && <button type="button" onClick={() => void executeDuplicate(duplicateOperation)}>保留中のTask複製を再試行</button>}
          {bulkDeleteOperation && <button type="button" onClick={() => void executeBulkDelete(bulkDeleteOperation)}>保留中のBulk削除を再試行</button>}
          {bulkDateMoveOperation && <button type="button" onClick={() => void executeBulkDateMove(bulkDateMoveOperation)}>保留中の日付変更を再試行</button>}
           {bulkSectionOperation && <button type="button" onClick={() => void executeBulkSectionChange(bulkSectionOperation)}>保留中のBulk Section変更を再試行</button>}
           {bulkSectionOccurrenceOperation && <button type="button" onClick={() => void executeBulkSectionOccurrenceChange(bulkSectionOccurrenceOperation)}>保留中のRoutine含むBulk Section変更を再試行</button>}
           {bulkSectionScopedOperation && <button type="button" onClick={() => void executeBulkSectionScopedChange(bulkSectionScopedOperation)}>保留中のRoutineごとのBulk Section変更を再試行</button>}
          {bulkEstimateOperation && <button type="button" onClick={() => void executeBulkEstimateChange(bulkEstimateOperation)}>保留中のBulk見積変更を再試行</button>}
          {reorderOperation && <button type="button" onClick={() => void executeReorder(reorderOperation)}>保留中のReorderを再試行</button>}
          {startOperation && <button type="button" onClick={() => void executeStart(startOperation)}>保留中のStartを再試行</button>}
          {completeOperation && <button type="button" onClick={() => void executeComplete(completeOperation)}>保留中のCompleteを再試行</button>}
          {executionTimesOperation && <button type="button" onClick={() => void executeExecutionTimes(executionTimesOperation)}>保留中の実績時刻保存を再試行</button>}
          {taskMetadataOperation && <button type="button" onClick={() => void executeTaskMetadata(taskMetadataOperation)}>保留中のTask情報保存を再試行</button>}
          {retainedTaskMetadataOperations.filter((operation) => operation.operation_id !== taskMetadataOperation?.operation_id).map((operation) => (
            <button type="button" key={operation.operation_id} onClick={() => void executeTaskMetadata(operation)}>保留中のTask情報保存を再試行</button>
          ))}
          {configurationOperation && <button type="button" onClick={() => void executeConfiguration(configurationOperation)}>保留中のSection設定を再試行</button>}
          {sectionSettingsOperation && <button type="button" onClick={() => void executeSectionSettings(sectionSettingsOperation)}>保留中の次Day Section設定を再試行</button>}
          {sectionMoveOperation && <button type="button" onClick={() => void executeSectionMove(sectionMoveOperation)}>保留中のSection移動を再試行</button>}
          {estimateOperation && <button type="button" onClick={() => void executeEstimate(estimateOperation)}>保留中の見積保存を再試行</button>}
          {retainedEstimateOperations.filter((operation) => operation.operation_id !== estimateOperation?.operation_id).map((operation) => (
            <button type="button" key={operation.operation_id} onClick={() => void executeEstimate(operation)}>保留中の見積保存を再試行</button>
          ))}
          {plannedStartOperation && <button type="button" onClick={() => void executePlannedStart(plannedStartOperation)}>保留中の開始予定保存を再試行</button>}
          {routineConversionOperation && <button type="button" onClick={() => void executeRoutineConversion(routineConversionOperation)}>保留中のRoutine化を再試行</button>}
          {routineEndOperation && <button type="button" onClick={() => void executeRoutineEnd(routineEndOperation)}>保留中のRoutine終了を再試行</button>}
          {routineEstimateOperation && <button type="button" onClick={() => void executeRoutineEstimate(routineEstimateOperation)}>保留中のRoutine見積を再試行</button>}
          {retainedRoutineEstimateOperations.filter((operation) => operation.operation_id !== routineEstimateOperation?.operation_id).map((operation) => (
            <button type="button" key={operation.operation_id} onClick={() => void executeRoutineEstimate(operation)}>保留中のRoutine見積を再試行</button>
          ))}
          {routineSectionPlanOperation && <button type="button" onClick={() => void executeRoutineSectionPlan(routineSectionPlanOperation)}>保留中のRoutine配置を再試行</button>}
          <button type="button" className="secondary" onClick={() => {
             setProjectOperation(null); setTaskOperation(null); setDuplicateOperation(null); setBulkDeleteOperation(null); setBulkDateMoveOperation(null); setBulkSectionOperation(null); setBulkSectionOccurrenceOperation(null); setBulkSectionScopedOperation(null); setBulkEstimateOperation(null); setBulkSectionPickerOpen(false); setBulkConfirmation(null); setBulkSectionConfirmation(null); setBulkEstimateConfirmation(null); setBulkDateMoveConfirmation(null); setSelectedEntryIds([]); setReorderOperation(null); setStartOperation(null); setCompleteOperation(null); setExecutionTimesOperation(null); setTaskMetadataOperation(null);
            setRetainedTaskMetadataOperations([]); setPendingTaskMetadataOverlays({}); setPendingEstimateOverlays({}); setPendingPlannedStartOverlays({}); setPendingExecutionTimesOverlays({}); setRetainedEstimateOperations([]); setRetainedRoutineEstimateOperations([]);
            setQueuedStartEntry(null);
            setConfigurationOperation(null); setSectionSettingsOperation(null); setSectionMoveOperation(null); setEstimateOperation(null); setPlannedStartOperation(null);
            setRoutineConversionOperation(null); setRoutineEndOperation(null); setRoutineEstimateOperation(null);
            setRoutineSectionPlanOperation(null); setRoutineCandidate(null); setError(null);
          }}>保留中のclient操作を破棄</button>
        </section>
      )}

      {day.active_execution && (
        <aside className="floating-runner" aria-label="実行中のTask">
          <div><span className="runner-state">実行中</span><strong>{activeEntry?.task.title ?? "別日の実行中Task"}</strong><small>{day.active_execution.started_at} から</small></div>
          <button type="button" aria-label="実行中のTaskを完了" disabled={mutationLocked || isMutationScopeBusy(["execution-lane"])} onClick={() => void complete(day.active_execution!.entry_id)}>完了</button>
        </aside>
      )}
          </main>
        )}
      </div>
    </div>
  );
}

function RoutineIcon() {
  return (
    <svg className="routine-icon-svg" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6.2 5.2h7.1l-1.8-1.8 1.1-1.1L16.3 6l-3.7 3.7-1.1-1.1 1.8-1.8H6.2a3.2 3.2 0 0 0 0 6.4h1.5v1.6H6.2a4.8 4.8 0 1 1 0-9.6Zm7.6 9.6H6.7l1.8 1.8-1.1 1.1L3.7 14l3.7-3.7 1.1 1.1-1.8 1.8h4.9a3.2 3.2 0 0 0 0-6.4h-1.5V5.2h1.5a4.8 4.8 0 1 1 0 9.6Z" fill="currentColor" />
    </svg>
  );
}
