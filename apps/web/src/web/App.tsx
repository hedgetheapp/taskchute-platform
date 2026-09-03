import {
  DragEvent as ReactDragEvent,
  Fragment,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
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
  BulkMoveEntriesToSectionRequest,
  BulkMoveEntriesToSectionOccurrenceRequest,
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
} from "./day-columns";
import { RoutineBoard } from "./RoutineBoard";

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
type ColumnResizeState = { key: DayColumnKey; startX: number; startWidth: number };
type RoutineCandidate =
  | { entryId: string; unit: "estimate"; estimateSeconds: number | null }
  | { entryId: string; unit: "section-plan"; sectionId: string | null; plannedStartMinute: number | null };

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
    && projection.planning_enabled
    && entry.lifecycle_state === "planned";
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("button, a, input, select, textarea, [contenteditable]"));
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

function formatEstimate(seconds: number | null): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ""}` : `${minutes}分`;
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
    case "bulk-section": return "選択したTaskのSectionを変更・照合中…";
    case "start": return "開始・照合中…";
    case "complete": return "完了・照合中…";
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
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "invalid";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const logicalMinute = hours * 60 + minutes;
  return minutes <= 59 && Number.isSafeInteger(logicalMinute)
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
  const [bulkSectionOperation, setBulkSectionOperation] = useState<BulkMoveEntriesToSectionRequest | null>(null);
  const [bulkSectionOccurrenceOperation, setBulkSectionOccurrenceOperation] = useState<BulkMoveEntriesToSectionOccurrenceRequest | null>(null);
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
  } | null>(null);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [reorderOperation, setReorderOperation] = useState<ReorderEntriesRequest | null>(null);
  const [startOperation, setStartOperation] = useState<StartEntryRequest | null>(null);
  const [completeOperation, setCompleteOperation] = useState<CompleteEntryRequest | null>(null);
  const [configurationOperation, setConfigurationOperation] = useState<EstablishInitialSectionConfigurationRequest | null>(null);
  const [sectionMoveOperation, setSectionMoveOperation] = useState<MoveEntryRequest | null>(null);
  const [estimateOperation, setEstimateOperation] = useState<SetEntryEstimateRequest | null>(null);
  const [plannedStartOperation, setPlannedStartOperation] = useState<PlannedStartOperation | null>(null);
  const [sectionSettingsOperation, setSectionSettingsOperation] = useState<UpdateSectionConfigurationRequest | null>(null);
  const [routineConversionOperation, setRoutineConversionOperation] = useState<ConvertEntryToRoutineRequest | null>(null);
  const [routineEndOperation, setRoutineEndOperation] = useState<EndRoutineRequest | null>(null);
  const [routineEstimateOperation, setRoutineEstimateOperation] = useState<SetRoutineEstimateRequest | null>(null);
  const [routineSectionPlanOperation, setRoutineSectionPlanOperation] = useState<SetRoutineSectionPlanRequest | null>(null);
  const [, setSectionSettings] = useState<SectionConfigurationProjection | null>(null);
  const [sectionSettingsDraft, setSectionSettingsDraft] = useState<SectionSettingsDraft | null>(null);
  const [sectionSettingsNotice, setSectionSettingsNotice] = useState<string | null>(null);
  const [editingEstimate, setEditingEstimate] = useState<{ entryId: string; minutes: string } | null>(null);
  const [editingPlannedStart, setEditingPlannedStart] = useState<{ entryId: string; value: string } | null>(null);
  const [routineDraft, setRoutineDraft] = useState<{ entryId: string; endDate: string } | null>(null);
  const [routineCandidate, setRoutineCandidate] = useState<RoutineCandidate | null>(null);
  const [pending, setPending] = useState<"login" | "project" | "project-settings" | "day-navigation" | "task" | "duplicate" | "bulk-delete" | "bulk-section" | "bulk-section-occurrence" | "reorder" | "start" | "complete" | "configuration" | "section-settings" | "move" | "estimate" | "planned-start" | "routine-convert" | "routine-end" | "routine-edit" | "logout" | null>(null);
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
  const [entryDrag, setEntryDrag] = useState<EntryDragState | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarFocusedDate, setCalendarFocusedDate] = useState<string | null>(null);
  const [currentLogicalDate, setCurrentLogicalDate] = useState<string | null>(null);
  const [forecastNowInstant, setForecastNowInstant] = useState<string | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const draftCompositionRef = useRef(false);
  const selectedLogicalDateRef = useRef<string | null>(null);
  const mouseDragRef = useRef<MouseDragState | null>(null);
  const calendarTriggerRef = useRef<HTMLButtonElement | null>(null);
  const calendarGridRef = useRef<HTMLDivElement | null>(null);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const columnsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bulkHeaderRef = useRef<HTMLInputElement | null>(null);
  const bulkDeleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bulkConfirmationRef = useRef<HTMLDivElement | null>(null);
  const bulkSectionConfirmationRef = useRef<HTMLDivElement | null>(null);
  const bulkSectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const bulkSectionPickerRef = useRef<HTMLDivElement | null>(null);
  const routineScopeChoiceRef = useRef<HTMLSpanElement | null>(null);
  const forecastClockRef = useRef<{ serverInstant: string; monotonicMilliseconds: number } | null>(null);
  const retainedOperation = projectOperation ?? taskOperation ?? duplicateOperation ?? bulkDeleteOperation ?? bulkSectionOperation ?? bulkSectionOccurrenceOperation ?? reorderOperation ?? startOperation ?? completeOperation
    ?? configurationOperation ?? sectionSettingsOperation ?? sectionMoveOperation ?? estimateOperation ?? plannedStartOperation
    ?? routineConversionOperation ?? routineEndOperation ?? routineEstimateOperation ?? routineSectionPlanOperation;
  const mutationLocked = pending !== null || retainedOperation !== null || bulkConfirmation !== null || bulkSectionConfirmation !== null;

  const transitionToSignedOut = useCallback(() => {
    selectedLogicalDateRef.current = null;
    setCurrentLogicalDate(null);
    setCalendarOpen(false);
    setCalendarFocusedDate(null);
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
    setBulkSectionOperation(null);
    setBulkSectionOccurrenceOperation(null);
    setBulkSectionPickerOpen(false);
    setBulkConfirmation(null);
    setBulkSectionConfirmation(null);
    setSelectedEntryIds([]);
    setReorderOperation(null);
    setStartOperation(null);
    setCompleteOperation(null);
    setConfigurationOperation(null);
    setSectionMoveOperation(null);
    setEstimateOperation(null);
    setPlannedStartOperation(null);
    setSectionSettingsOperation(null);
    setSectionSettings(null);
    setSectionSettingsDraft(null);
    setSectionSettingsNotice(null);
    setRoutineConversionOperation(null);
    setRoutineEndOperation(null);
    setRoutineEstimateOperation(null);
    setRoutineSectionPlanOperation(null);
    setRoutineDraft(null);
    setRoutineCandidate(null);
    setDraftTask(null);
    setEditingEstimate(null);
    setEditingPlannedStart(null);
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
    try {
      const projection = await api.loadDay(logicalDate ?? undefined);
      setDay(projection);
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
    setPending("day-navigation");
    setError(null);
    setDraftTask(null);
    setSelectedEntryIds([]);
    setBulkConfirmation(null);
    setBulkSectionConfirmation(null);
    setBulkSectionPickerOpen(false);
    setEditingEstimate(null);
    setEditingPlannedStart(null);
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
    if (!columnResize) return;
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const delta = event.clientX - columnResize.startX;
      setDayColumnPreference((current) => ({
        ...current,
        widths: { ...current.widths, [columnResize.key]: clampDayColumnWidth(columnResize.key, columnResize.startWidth + delta) },
      }));
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
    if (!bulkConfirmation) return;
    bulkConfirmationRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setBulkConfirmation(null);
      requestAnimationFrame(() => bulkDeleteTriggerRef.current?.focus());
    };
    document.addEventListener("keydown", dismissOnEscape);
    return () => document.removeEventListener("keydown", dismissOnEscape);
  }, [bulkConfirmation]);

  useEffect(() => {
    if (!bulkSectionConfirmation) return;
    bulkSectionConfirmationRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setBulkSectionConfirmation(null);
      requestAnimationFrame(() => bulkSectionTriggerRef.current?.focus());
    };
    const dismissOnOutsideMouseDown = (event: globalThis.MouseEvent) => {
      if (bulkSectionConfirmationRef.current?.contains(event.target as Node)) return;
      setBulkSectionConfirmation(null);
      requestAnimationFrame(() => bulkSectionTriggerRef.current?.focus());
    };
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("mousedown", dismissOnOutsideMouseDown);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("mousedown", dismissOnOutsideMouseDown);
    };
  }, [bulkSectionConfirmation]);

  useEffect(() => {
    if (!bulkSectionPickerOpen) return;
    bulkSectionPickerRef.current?.querySelector<HTMLButtonElement>("#bulk-section-picker button")?.focus();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setBulkSectionPickerOpen(false);
      requestAnimationFrame(() => bulkSectionTriggerRef.current?.focus());
    };
    const dismissOnOutsideMouseDown = (event: globalThis.MouseEvent) => {
      if (bulkSectionPickerRef.current?.contains(event.target as Node) || bulkSectionTriggerRef.current?.contains(event.target as Node)) return;
      setBulkSectionPickerOpen(false);
      requestAnimationFrame(() => bulkSectionTriggerRef.current?.focus());
    };
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("mousedown", dismissOnOutsideMouseDown);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("mousedown", dismissOnOutsideMouseDown);
    };
  }, [bulkSectionPickerOpen]);

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
    if (!routineCandidate) return;
    routineScopeChoiceRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setRoutineCandidate(null);
    };
    const dismissOnOutsideClick = (event: MouseEvent) => {
      const choice = routineScopeChoiceRef.current;
      if (choice && event.target instanceof Node && !choice.contains(event.target)) setRoutineCandidate(null);
    };
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("click", dismissOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("click", dismissOnOutsideClick);
    };
  }, [routineCandidate]);

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
      case "PageUp": nextDate = Temporal.PlainDate.from(calendarFocusedDate).subtract({ months: 1 }).toString(); break;
      case "PageDown": nextDate = Temporal.PlainDate.from(calendarFocusedDate).add({ months: 1 }).toString(); break;
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
      setPending(null);
    }
  }

  async function executeDuplicate(operation: DuplicateEntryRequest) {
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
      setPending(null);
    }
  }

  async function executeBulkDelete(operation: BulkDeleteEntriesRequest) {
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
      setPending(null);
    }
  }

  async function executeBulkSectionChange(operation: BulkMoveEntriesToSectionRequest) {
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
      setPending(null);
    }
  }

  async function executeBulkSectionOccurrenceChange(operation: BulkMoveEntriesToSectionOccurrenceRequest) {
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
    if (!day || mutationLocked) return;
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

  function confirmBulkDelete() {
    if (!day?.taskchute_day.id || !bulkConfirmation || pending !== null || bulkDeleteOperation !== null) return;
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
    if (!day || mutationLocked || selectedBulkEntries.length === 0
      || selectedBulkEntries.length !== selectedEntryIds.length
      || (selectedBulkEntries.some((entry) => entry.routine !== null) && !day.is_current)) return;
    setError(null);
    setBulkSectionPickerOpen(true);
  }

  function chooseBulkSection(sectionId: string | null) {
    if (!day?.taskchute_day.id || mutationLocked || selectedBulkEntries.length === 0
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

  function confirmBulkSectionOccurrenceChange() {
    if (!day?.taskchute_day.id || !bulkSectionConfirmation || pending !== null
      || bulkSectionOccurrenceOperation !== null) return;
    const operation: BulkMoveEntriesToSectionOccurrenceRequest = {
      operation_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id,
      entry_ids: bulkSectionConfirmation.entryIds,
      section_id: bulkSectionConfirmation.sectionId,
      expected_placement_revision: day.placement_revision,
    };
    setBulkSectionOccurrenceOperation(operation);
    void executeBulkSectionOccurrenceChange(operation);
  }

  function duplicate(entry: EntryProjection) {
    if (!day?.taskchute_day.id || !day.planning_enabled || entry.lifecycle_state !== "planned" || mutationLocked) return;
    const operation: DuplicateEntryRequest = {
      operation_id: uuidv7(), source_entry_id: entry.id, new_task_id: uuidv7(), new_entry_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id, expected_placement_revision: day.placement_revision,
    };
    setDuplicateOperation(operation);
    void executeDuplicate(operation);
  }

  async function commitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!day || !draftTask || mutationLocked || !day.planning_enabled) return;
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
      setPending(null);
    }
  }

  async function reorderSectionEntries(sectionId: string | null, entryIds: string[], focusEntryId: string) {
    if (!day?.taskchute_day.id || !day.planning_enabled || mutationLocked) return;
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
    if (!day?.taskchute_day.id || !day.planning_enabled || mutationLocked) return;
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
    if (!entryDrag || entryDrag.sectionId !== sectionId || !day?.taskchute_day.id || !day.planning_enabled || mutationLocked) return null;
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
      || mutationLocked || entry.lifecycle_state !== "planned") return;
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
      ? buildDraggedEntryOrder(entries, drag.sectionId, drag.entryId, targetEntryId, edge)
      : null;
    mouseDragRef.current = null;
    setEntryDrag(null);
    if (order) void reorderSectionEntries(drag.sectionId, order, drag.entryId);
  }

  function startEntryDrag(event: ReactDragEvent<HTMLElement>, sectionId: string | null, entry: EntryProjection) {
    if (isInteractiveDragTarget(event.target) || !day?.taskchute_day.id || !day.planning_enabled || mutationLocked || entry.lifecycle_state !== "planned") {
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
      setPending(null);
    }
  }

  async function start(entryId: string) {
    if (!day || !day.is_current || mutationLocked) return;
    const entry = [...day.unsectioned_entries, ...day.sections.flatMap((section) => section.entries)]
      .find((candidate) => candidate.id === entryId);
    if (!entry) return;
    const operation: StartEntryRequest = { operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7(),
      ...(entry.section_id === null ? { expected_placement_revision: day.placement_revision } : {}) };
    setStartOperation(operation);
    await executeStart(operation);
  }

  async function executeComplete(operation: CompleteEntryRequest) {
    setPending("complete");
    setError(null);
    try {
      await api.completeEntry(operation);
      await reconcile();
      setCompleteOperation(null);
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
    } finally {
      setPending(null);
    }
  }

  async function complete(entryId: string) {
    if (!day?.active_execution || day.active_execution.entry_id !== entryId || mutationLocked) return;
    const operation = { operation_id: uuidv7(), entry_id: entryId, execution_id: day.active_execution.id };
    setCompleteOperation(operation);
    await executeComplete(operation);
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
    } finally { setPending(null); }
  }

  async function moveEntryToSection(entryId: string, sectionId: string | null) {
    const entry = [...(day?.unsectioned_entries ?? []), ...(day?.sections.flatMap((section) => section.entries) ?? [])]
      .find((candidate) => candidate.id === entryId);
    if (!entry || !day?.taskchute_day.id || !day.planning_enabled || mutationLocked || entry.lifecycle_state !== "planned" || entry.routine !== null
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
    setPending("estimate"); setError(null);
    try { await api.setEntryEstimate(operation); await reconcile(); setEstimateOperation(null); setEditingEstimate(null); }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : "見積の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setEstimateOperation(null);
      try { const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.entry_id);
        if (ambiguous && canonical?.estimate_seconds === operation.estimate_seconds) {
          setEstimateOperation(null); setEditingEstimate(null); setError(null);
        }
      } catch { /* Preserve retained operation. */ }
    } finally { setPending(null); }
  }

  async function commitEstimate(entryId: string) {
    const canonical = day ? [...day.unsectioned_entries, ...day.sections.flatMap((section) => section.entries)]
      .find((entry) => entry.id === entryId) : undefined;
    if (!day?.planning_enabled || mutationLocked || editingEstimate?.entryId !== entryId || !canonical) return;
    const raw = editingEstimate.minutes.trim();
    const minutes = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(minutes) || minutes < 0 || !Number.isSafeInteger(minutes * 60)) {
      setError("見積は0以上の整数（分）で入力してください"); return;
    }
    const estimateSeconds = minutes === 0 ? null : minutes * 60;
    if (canonical.routine) {
      setRoutineCandidate({ entryId, unit: "estimate", estimateSeconds });
      setEditingEstimate(null);
      return;
    }
    const operation: SetEntryEstimateRequest = { operation_id: uuidv7(), entry_id: entryId, estimate_seconds: estimateSeconds };
    setEstimateOperation(operation); await executeEstimate(operation);
  }

  async function executePlannedStart(operation: PlannedStartOperation) {
    setPending("planned-start"); setError(null);
    try {
      await api.setEntryPlannedStart(operation.request);
      await reconcile();
      setPlannedStartOperation(null);
      setEditingPlannedStart(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "開始予定の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setPlannedStartOperation(null);
      try {
        const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.request.entry_id);
        if (ambiguous && canonical?.planned_start_minute === operation.request.planned_start_minute
          && canonical.section_id === operation.expectedSectionId
          && projection?.placement_revision === operation.request.expected_placement_revision + 1) {
          setPlannedStartOperation(null); setEditingPlannedStart(null); setError(null);
        }
      } catch { /* Preserve retained operation. */ }
    } finally { setPending(null); }
  }

  async function commitPlannedStart(entry: EntryProjection) {
    const canonical = day ? [...day.unsectioned_entries, ...day.sections.flatMap((section) => section.entries)]
      .find((candidate) => candidate.id === entry.id) : undefined;
    if (!day?.taskchute_day.id || !day.planning_enabled || day.taskchute_day.establishment_boundary_minutes === null
      || mutationLocked || editingPlannedStart?.entryId !== entry.id || !canonical) return;
    const plannedStartMinute = parsePlannedStart(
      editingPlannedStart.value,
      day.taskchute_day.establishment_boundary_minutes,
    );
    if (plannedStartMinute === "invalid") {
      const boundary = day.taskchute_day.establishment_boundary_minutes;
      setError(`開始予定は ${formatLogicalMinute(boundary)} 以上 ${formatLogicalMinute(boundary + 1440)} 未満のHH:mmで入力してください`);
      return;
    }
    const expectedSectionId = plannedStartMinute === null ? null
      : day.sections.find((section) => section.logical_start_minute !== null && section.logical_end_minute !== null
        && section.logical_start_minute <= plannedStartMinute && plannedStartMinute < section.logical_end_minute)?.id;
    if (expectedSectionId === undefined) {
      setError("開始予定を含む確定済みSection時間帯がありません");
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
    setPlannedStartOperation(operation);
    await executePlannedStart(operation);
  }

  function changeRoutineSectionCandidate(entry: EntryProjection, sectionId: string | null) {
    if (!entry.routine || !day?.is_current || !day.planning_enabled || entry.lifecycle_state !== "planned" || mutationLocked) return;
    const plannedStartMinute = sectionId === null ? null
      : day.sections.find((section) => section.id === sectionId)?.logical_start_minute;
    if (plannedStartMinute === undefined || (sectionId !== null && plannedStartMinute === null)) {
      setError("選択したSectionの確定済み開始時刻がありません");
      return;
    }
    setRoutineCandidate({ entryId: entry.id, unit: "section-plan", sectionId, plannedStartMinute });
  }

  async function executeRoutineEstimate(operation: SetRoutineEstimateRequest) {
    setPending("routine-edit"); setError(null);
    try {
      await api.setRoutineEstimate(operation);
      await reconcile();
      setRoutineEstimateOperation(null); setRoutineCandidate(null); setEditingEstimate(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Routine見積の保存に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) { setRoutineEstimateOperation(null); setRoutineCandidate(null); }
      try {
        const projection = await reconcile();
        const canonical = [...(projection?.unsectioned_entries ?? []), ...(projection?.sections.flatMap((section) => section.entries) ?? [])]
          .find((entry) => entry.id === operation.entry_id);
        const expected = operation.action === "reset" ? canonical?.routine?.default_estimate_seconds : operation.estimate_seconds;
        const override = operation.action === "occurrence";
        if (ambiguous && canonical?.estimate_seconds === expected && canonical?.routine?.estimate_override_present === override) {
          setRoutineEstimateOperation(null); setRoutineCandidate(null); setError(null);
        }
      } catch { /* Preserve exact retained operation. */ }
    } finally { setPending(null); }
  }

  async function executeRoutineSectionPlan(operation: SetRoutineSectionPlanRequest) {
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
    } finally { setPending(null); }
  }

  async function commitRoutineCandidate(entry: EntryProjection, action: "occurrence" | "definition") {
    if (!day?.taskchute_day.id || !entry.routine || routineCandidate?.entryId !== entry.id || mutationLocked) return;
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
    if (!day?.taskchute_day.id || !entry.routine || mutationLocked) return;
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
    } finally { setPending(null); }
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
    } finally { setPending(null); }
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
  const transientStatus = transientStatusText(pending);
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

  function handleDayKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || isTextEditingTarget(event.target)) return;
    if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      void navigateToDay(shiftLogicalDate(currentDay.taskchute_day.logical_date, event.key === "ArrowLeft" ? -1 : 1));
      return;
    }
    const key = event.key.toLowerCase();
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-day-focus-target]"));
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-day-focus-target]") : null;
    const activeIndex = targets.findIndex((target) => target.dataset.focusKey === activeElement?.dataset.focusKey);

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
      if (targets.length === 0) return;
      event.preventDefault();
      const delta = key === "j" || event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = activeIndex < 0 ? (delta > 0 ? 0 : targets.length - 1) : Math.max(0, Math.min(targets.length - 1, activeIndex + delta));
      targets[nextIndex]?.focus();
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
      setDayColumnPreference((current) => ({ ...current, order: reorderDayColumns(current.order, sourceKey, targetKey, edge) }));
    }
    setColumnDrag(null);
  }

  function startColumnResize(event: ReactMouseEvent<HTMLButtonElement>, key: DayColumnKey) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setColumnResize({ key, startX: event.clientX, startWidth: dayColumnPreference.widths[key] });
  }

  function autoFitColumn(event: ReactMouseEvent<HTMLButtonElement>, key: DayColumnKey) {
    event.preventDefault();
    event.stopPropagation();
    const definition = columnDefinition(key);
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
    return entry.execution_summary;
  }

  function actualDurationFor(entry: EntryProjection): string {
    const seconds = actualDurationSeconds(
      actualSummaryFor(entry),
      forecastNowInstant ?? currentDay.projection_generated_at,
      currentDay.is_current,
    );
    return formatActualDuration(seconds);
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
          <div className="routine-editor">
            <label>終了日（空欄は終了なし）<input type="date" min={currentDay.taskchute_day.logical_date}
              value={routineDraft.endDate} onChange={(event) => setRoutineDraft({ entryId: entry.id, endDate: event.target.value })} /></label>
            <button type="button" disabled={mutationLocked} onClick={() => void commitRoutineConversion(entry)}>Routine化</button>
            <button type="button" className="secondary" disabled={mutationLocked} onClick={() => setRoutineDraft(null)}>Cancel</button>
          </div>
        ) : routineActionAvailable ? (
          <button type="button" className="routine-action routine-icon routine-muted" aria-label="Routine化" title={`${entry.task.title}をRoutine化`} disabled={mutationLocked}
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

  function renderEntryColumn(entry: EntryProjection, key: DayColumnKey) {
    const summary = actualSummaryFor(entry);
    switch (key) {
      case "project":
        return <span className="project-name" data-day-column-cell={key}>{entry.task.project?.title ?? "—"}</span>;
      case "section":
        return <select className="section-cell" data-day-column-cell={key} aria-label={`${entry.task.title}のSection`} value={entry.section_id ?? ""}
          disabled={mutationLocked || !currentDay.planning_enabled || entry.lifecycle_state !== "planned"
            || (entry.routine !== null && !currentDay.is_current)}
          onClick={(event) => event.stopPropagation()} onChange={(event) => entry.routine
            ? changeRoutineSectionCandidate(entry, event.target.value || null)
            : void changeSection(entry, event.target.value || null)}>
          <option value="">Sectionなし</option>
          {currentDay.sections.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.title}</option>)}
        </select>;
      case "routine":
        return routineCell(entry);
      case "estimate":
        return <span className="estimate-cell" data-day-column-cell={key}>
          {editingEstimate?.entryId === entry.id ? <>
            <input autoFocus aria-label={`${entry.task.title}の見積（分）`} inputMode="numeric" value={editingEstimate.minutes}
              onChange={(event) => setEditingEstimate({ entryId: entry.id, minutes: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitEstimate(entry.id); }
                else if (event.key === "Escape") { event.preventDefault(); setEditingEstimate(null); } }} />
            {entry.routine?.estimate_override_present && (
              <button type="button" className="routine-reset" aria-label={`${entry.task.title}の見積をルーティンの設定に戻す`}
                disabled={mutationLocked} onClick={() => void resetRoutineUnit(entry, "estimate")}>ルーティンの設定に戻す</button>
            )}
          </>
            : <button type="button" className="estimate-button" aria-label={`${entry.task.title}の見積`} disabled={mutationLocked || !currentDay.planning_enabled || entry.lifecycle_state !== "planned" || (entry.routine !== null && !currentDay.is_current)}
              onClick={() => setEditingEstimate({ entryId: entry.id, minutes: entry.estimate_seconds ? String(entry.estimate_seconds / 60) : "" })}>{formatEstimate(entry.estimate_seconds)}</button>}
          {entry.routine && routineCandidate?.entryId === entry.id && routineCandidate.unit === "estimate" && (
            <span ref={routineScopeChoiceRef} className="routine-scope-choice" role="group" aria-label={`${entry.task.title}の見積反映先`}>
              <span>{formatEstimate(routineCandidate.estimateSeconds)}</span>
              <button type="button" disabled={mutationLocked} onClick={() => void commitRoutineCandidate(entry, "occurrence")}>今回だけ</button>
              <button type="button" disabled={mutationLocked} onClick={() => void commitRoutineCandidate(entry, "definition")}>ルーティンに反映</button>
              <button type="button" className="secondary" disabled={mutationLocked} onClick={() => setRoutineCandidate(null)}>キャンセル</button>
            </span>
          )}
        </span>;
      case "plannedStart":
        return <span className="planned-start-cell" data-day-column-cell={key}>
          {editingPlannedStart?.entryId === entry.id ? <>
            <input autoFocus aria-label={`${entry.task.title}の開始予定`} value={editingPlannedStart.value} placeholder="HH:mm" inputMode="numeric"
              onChange={(event) => setEditingPlannedStart({ entryId: entry.id, value: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commitPlannedStart(entry); }
                else if (event.key === "Escape") { event.preventDefault(); setEditingPlannedStart(null); } }} />
            {entry.routine?.section_plan_override_present && (
              <button type="button" className="routine-reset" aria-label={`${entry.task.title}のSection・開始予定をルーティンの設定に戻す`}
                disabled={mutationLocked} onClick={() => void resetRoutineUnit(entry, "section-plan")}>ルーティンの設定に戻す</button>
            )}
          </>
            : <button type="button" className="planned-start-button" aria-label={`${entry.task.title}の開始予定`}
              disabled={mutationLocked || !currentDay.planning_enabled || entry.lifecycle_state !== "planned" || (entry.routine !== null && !currentDay.is_current)}
              onClick={() => setEditingPlannedStart({ entryId: entry.id,
                value: entry.planned_start_minute === null ? "" : formatLogicalMinute(entry.planned_start_minute) })}>
              {entry.planned_start_minute === null ? "—" : formatLogicalMinute(entry.planned_start_minute)}
            </button>}
          {entry.routine && routineCandidate?.entryId === entry.id && routineCandidate.unit === "section-plan" && (
            <span ref={routineScopeChoiceRef} className="routine-scope-choice" role="group" aria-label={`${entry.task.title}のSection・開始予定反映先`}>
              <span>{routineCandidate.sectionId === null ? "Sectionなし / —"
                : `${currentDay.sections.find((candidate) => candidate.id === routineCandidate.sectionId)?.title ?? "Section"} / ${formatLogicalMinute(routineCandidate.plannedStartMinute)}`}</span>
              <button type="button" disabled={mutationLocked} onClick={() => void commitRoutineCandidate(entry, "occurrence")}>今回だけ</button>
              <button type="button" disabled={mutationLocked} onClick={() => void commitRoutineCandidate(entry, "definition")}>ルーティンに反映</button>
              <button type="button" className="secondary" disabled={mutationLocked} onClick={() => setRoutineCandidate(null)}>キャンセル</button>
            </span>
          )}
        </span>;
      case "forecast":
        return <span className="forecast-cell" data-day-column-cell={key} aria-label={`${entry.task.title}の開始見込`}>
          {formatStartForecast(forecastByEntryId[entry.id], currentDay.taskchute_day.logical_date, currentDay.taskchute_day.establishment_timezone)}
        </span>;
      case "actualStart":
        return <span className="actual-start-cell actual-time-cell" data-day-column-cell={key} aria-label={`${entry.task.title}の開始`}>
          {formatActualTime(summary?.first_started_at ?? null, currentDay.taskchute_day.logical_date, currentDay.taskchute_day.establishment_timezone)}
        </span>;
      case "actualEnd":
        return <span className="actual-end-cell actual-time-cell" data-day-column-cell={key} aria-label={`${entry.task.title}の終了`}>
          {summary?.active_started_at ? "—" : formatActualTime(summary?.last_ended_at ?? null, currentDay.taskchute_day.logical_date, currentDay.taskchute_day.establishment_timezone)}
        </span>;
      case "actualDuration":
        return <span className="actual-duration-cell actual-duration" data-day-column-cell={key} aria-label={`${entry.task.title}の実績`}>
          {actualDurationFor(entry)}
        </span>;
    }
  }

  function renderDraftColumn(section: { title: string }, key: DayColumnKey) {
    if (key === "section") return <span className="section-cell" data-day-column-cell={key}>{section.title}</span>;
    const definition = columnDefinition(key);
    return <span className={`${definition.cellClassName} muted`} data-day-column-cell={key}>—</span>;
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
                <section aria-label="Project設定">
                  <div className="settings-section-heading">
                    <div><h2>Project</h2><p>Projectの一覧と新規作成を管理します。</p></div>
                  </div>
                  <form className="settings-project-form" onSubmit={createProject} aria-busy={pending === "project"}>
                    <label>Project名<input name="title" maxLength={200} required /></label>
                    <button disabled={mutationLocked}>{pending === "project" ? "作成中…" : "Projectを作成"}</button>
                  </form>
                  {project && <p className="success">作成済み: {project.title}</p>}
                  <div className="project-list" aria-label="Project一覧">
                    {projects.map((candidate) => <div className="project-list-item" key={candidate.id}>{candidate.title}</div>)}
                    {projects.length === 0 && pending !== "project-settings" && <p className="muted">Projectはまだありません。</p>}
                  </div>
                  <p className="settings-capability-note">rename・delete・archive・並び替えは現在未対応です。</p>
                </section>
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
          <main className="shell day-shell" onKeyDown={handleDayKeyDown}>
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
                  <div className="calendar-popover" role="dialog" aria-modal="false"
                    aria-label={`${formatCalendarMonth(calendarFocusedDate)}のカレンダー`}
                    onKeyDown={handleCalendarKeyDown}>
                    <div className="calendar-month-heading" aria-live="polite">{formatCalendarMonth(calendarFocusedDate)}</div>
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
                    <p className="sr-only">矢印キーで日付、PageUpとPageDownで月を移動し、Enterで選択、Escapeで閉じます。</p>
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

      <div className="day-toolbar" aria-label="Day controls">
        <button type="button" className="secondary"
          disabled={mutationLocked || !day.planning_enabled || day.section_configuration_required}
          onClick={() => openDraft(null)}>＋ Taskを追加</button>
        {selectedBulkEntries.length > 0 && (
          <div className="bulk-selection-toolbar" aria-label="選択中のTask">
            <span role="status" aria-live="polite">{selectedBulkEntries.length}件選択中</span>
            <div className="bulk-section-menu" ref={bulkSectionPickerRef}>
              <button ref={bulkSectionTriggerRef} type="button" className="secondary" disabled={mutationLocked || selectedBulkEntries.length !== selectedEntryIds.length || (selectedBulkEntries.some((entry) => entry.routine !== null) && !day.is_current)}
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
                <div id="bulk-section-picker" className="bulk-section-picker" role="dialog" aria-label="変更先Section" tabIndex={-1}>
                  <p className="bulk-section-picker-title">変更先Section{selectedBulkEntries.some((entry) => entry.routine !== null) ? "（Routineは今回だけ）" : ""}</p>
                  <div className="bulk-section-options">
                    {currentDay.sections.map((section) => (
                      <button type="button" key={section.id} onClick={() => chooseBulkSection(section.id)}>{section.title}</button>
                    ))}
                    <button type="button" className="secondary" onClick={() => chooseBulkSection(null)}>Sectionなし</button>
                  </div>
                  <button type="button" className="secondary bulk-section-cancel" onClick={() => closeBulkSectionPicker(true)}>キャンセル</button>
                </div>
              )}
            </div>
            <button ref={bulkDeleteTriggerRef} type="button" disabled={mutationLocked} onClick={openBulkConfirmation}>削除</button>
            <button type="button" className="secondary" disabled={mutationLocked} onClick={clearBulkSelection}>選択解除</button>
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
                      onChange={(event) => setDayColumnPreference((current) => setDayColumnVisibility(current, definition.key, event.target.checked))} />
                    <span>{definition.label}</span>
                  </label>
                ))}
              </div>
              <div className="columns-actions">
                <button type="button" className="secondary" onClick={() => setDayColumnPreference((current) => showAllDayColumns(current))}>すべて表示</button>
                <button type="button" className="secondary" onClick={() => setDayColumnPreference(resetDayColumnPreference)}>初期状態に戻す</button>
              </div>
            </div>
          )}
        </div>
        <label className="completed-toggle">
          <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
          実行済みを表示
        </label>
      </div>

      {bulkSectionConfirmation && (
        <div className="bulk-confirmation panel" ref={bulkSectionConfirmationRef} role="dialog" aria-modal="true" aria-labelledby="bulk-section-confirmation-title" tabIndex={-1}>
          <h2 id="bulk-section-confirmation-title">Sectionを一括変更</h2>
          <p>
            {bulkSectionConfirmation.entryIds.length}件を
            {bulkSectionConfirmation.sectionId === null
              ? "Sectionなし"
              : `${currentDay.sections.find((section) => section.id === bulkSectionConfirmation.sectionId)?.title ?? "選択したSection"}`}
            に変更します。
          </p>
          <ul>
            <li>Routine Task {bulkSectionConfirmation.routineCount}件を含む選択です。</li>
            <li>現在のOccurrenceだけを「今回だけ」変更します。</li>
            <li>Routine設定・デフォルト・将来の日・他のOccurrenceは変更しません。</li>
          </ul>
          <div className="bulk-confirmation-actions">
            <button type="button" className="secondary" onClick={() => {
              setBulkSectionConfirmation(null);
              requestAnimationFrame(() => bulkSectionTriggerRef.current?.focus());
            }}>キャンセル</button>
            <button type="button" onClick={confirmBulkSectionOccurrenceChange}>今回だけ変更</button>
          </div>
        </div>
      )}

      {bulkConfirmation && (
        <div className="bulk-confirmation panel" ref={bulkConfirmationRef} role="dialog" aria-modal="true" aria-labelledby="bulk-confirmation-title" tabIndex={-1}>
          <h2 id="bulk-confirmation-title">選択したTaskを削除</h2>
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
            <button type="button" onClick={confirmBulkDelete}>削除</button>
          </div>
        </div>
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

      <section className="day-surface" aria-label="DayBoard" style={dayTableStyle(dayColumnPreference)}>
        <div className="table-heading">
          <span className="bulk-slot">
            {eligibleBulkEntries.length > 0 ? (
              <input ref={bulkHeaderRef} type="checkbox" checked={allEligibleBulkSelected} aria-label="すべての未実行Taskを選択"
                disabled={mutationLocked} onChange={toggleAllBulkEntries} />
            ) : <span className="bulk-placeholder" aria-hidden="true" />}
          </span><span className="execution-heading">実行</span><span className="task-heading">Task</span>
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
                onClick={(event) => focusSurface(event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  toggleSection(section.id);
                }}
              >
                <div className="section-summary-content"><strong>{section.title}</strong><span>{section.id === null ? "時間帯なし" : `${formatLogicalMinute(section.logical_start_minute)}–${formatLogicalMinute(section.logical_end_minute)}`} · {completedCount}/{section.entries.length} 実行済み · 見積 {formatEstimate(section.estimate_total_seconds)}</span></div>
                <div className="section-summary-actions">
                  <button type="button" className="section-collapse-button" aria-label={`${section.title}を${sectionCollapsed ? "展開" : "折りたたむ"}`}
                    aria-expanded={!sectionCollapsed} title={sectionCollapsed ? "展開" : "折りたたむ"}
                    onClick={(event) => { event.stopPropagation(); toggleSection(section.id); }}>{sectionCollapsed ? "▸" : "▾"}</button>
                  <button type="button" className="add-task-button" aria-label={`${section.title}にTaskを追加`} title={`${section.title}にTaskを追加`}
                    disabled={mutationLocked || !day.planning_enabled || day.section_configuration_required}
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
                </form>
              )}

              {!sectionCollapsed && visibleEntries.map((entry) => {
                const entryTarget: FocusTarget = { kind: "entry", id: entry.id };
                const isRunning = entry.lifecycle_state === "running";
                const canComplete = isRunning && day.active_execution?.entry_id === entry.id;
                const canDrag = day.planning_enabled && Boolean(day.taskchute_day.id) && entry.lifecycle_state === "planned";
                return (
                  <div className={`task-row state-${entry.lifecycle_state}${selectedEntryIds.includes(entry.id) ? " is-selected" : ""}${entryDrag?.entryId === entry.id ? " is-dragging" : ""}${entryDrag?.targetEntryId === entry.id && entryDrag.edge ? ` drop-${entryDrag.edge}` : ""}`} key={entry.id} tabIndex={0} aria-selected={selectedEntryIds.includes(entry.id)} draggable={canDrag && !mutationLocked}
                    data-entry-id={entry.id} data-section-id={section.id ?? ""} data-day-focus-target data-focus-key={focusKey(entryTarget)}
                    onMouseDown={(event) => startEntryMouseDrag(event, section.id, entry)}
                    onMouseMove={(event) => updateEntryMouseTarget(event, section.id, entry.id)}
                    onMouseUp={(event) => finishEntryMouseDrag(event, section.id, entry.id)}
                    onDragStart={(event) => startEntryDrag(event, section.id, entry)}
                    onDragEnd={() => { mouseDragRef.current = null; setEntryDrag(null); }}
                    onDragOver={(event) => updateEntryDropTarget(event, section.id, entry.id)}
                    onDrop={(event) => dropEntry(event, section.id, entry.id)}
                    onDragLeave={(event) => {
                      if (entryDrag?.targetEntryId === entry.id && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setEntryDrag((current) => current ? { ...current, targetEntryId: null, edge: null, targetSectionKey: null } : null);
                      }
                    }}
                    onClick={(event) => {
                    if (event.target === event.currentTarget || (event.target as HTMLElement).closest(".task-main")) focusSurface(event.currentTarget);
                  }}>
                    <span className="bulk-slot">
                      <input type="checkbox" checked={selectedEntryIds.includes(entry.id)}
                        disabled={!isBulkSelectableProjectionEntry(currentDay, entry) || mutationLocked}
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
                        <button type="button" className={`execution-control ${isRunning ? "running" : "planned"}`} aria-label={executionLabel(entry)} title={executionLabel(entry)} disabled={!day.is_current || mutationLocked || (entry.lifecycle_state === "planned" ? day.active_execution !== null : !canComplete)} onClick={() => {
                          if (entry.lifecycle_state === "planned") void start(entry.id);
                          else if (canComplete) void complete(entry.id);
                        }}>{isRunning ? "■" : "▶"}</button>
                      )}
                    </span>
                    <div className="task-main">
                      <div className="task-identity">
                        {entry.lifecycle_state === "planned" && day.planning_enabled && day.taskchute_day.id ? (
                          <span className="task-drag-handle" aria-hidden="true" title="ドラッグして並び替え"
                            onClick={(event) => event.stopPropagation()}>⠿</span>
                        ) : null}
                        <strong>{entry.task.title}</strong>{day.next_entry?.id === entry.id && <span className="next-label">Next</span>}
                      </div>
                      <div className="task-actions" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="icon-button" aria-label={`${entry.task.title}を複製`} title="Task名を複製"
                          disabled={mutationLocked || !day.planning_enabled || entry.lifecycle_state !== "planned"}
                          onClick={(event) => { event.stopPropagation(); duplicate(entry); }}>⧉</button>
                      </div>
                    </div>
                    {resolvedColumnDefinitions.map((definition) => <Fragment key={definition.key}>{renderEntryColumn(entry, definition.key)}</Fragment>)}
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
          {bulkSectionOperation && <button type="button" onClick={() => void executeBulkSectionChange(bulkSectionOperation)}>保留中のBulk Section変更を再試行</button>}
          {bulkSectionOccurrenceOperation && <button type="button" onClick={() => void executeBulkSectionOccurrenceChange(bulkSectionOccurrenceOperation)}>保留中のRoutine含むBulk Section変更を再試行</button>}
          {reorderOperation && <button type="button" onClick={() => void executeReorder(reorderOperation)}>保留中のReorderを再試行</button>}
          {startOperation && <button type="button" onClick={() => void executeStart(startOperation)}>保留中のStartを再試行</button>}
          {completeOperation && <button type="button" onClick={() => void executeComplete(completeOperation)}>保留中のCompleteを再試行</button>}
          {configurationOperation && <button type="button" onClick={() => void executeConfiguration(configurationOperation)}>保留中のSection設定を再試行</button>}
          {sectionSettingsOperation && <button type="button" onClick={() => void executeSectionSettings(sectionSettingsOperation)}>保留中の次Day Section設定を再試行</button>}
          {sectionMoveOperation && <button type="button" onClick={() => void executeSectionMove(sectionMoveOperation)}>保留中のSection移動を再試行</button>}
          {estimateOperation && <button type="button" onClick={() => void executeEstimate(estimateOperation)}>保留中の見積保存を再試行</button>}
          {plannedStartOperation && <button type="button" onClick={() => void executePlannedStart(plannedStartOperation)}>保留中の開始予定保存を再試行</button>}
          {routineConversionOperation && <button type="button" onClick={() => void executeRoutineConversion(routineConversionOperation)}>保留中のRoutine化を再試行</button>}
          {routineEndOperation && <button type="button" onClick={() => void executeRoutineEnd(routineEndOperation)}>保留中のRoutine終了を再試行</button>}
          {routineEstimateOperation && <button type="button" onClick={() => void executeRoutineEstimate(routineEstimateOperation)}>保留中のRoutine見積を再試行</button>}
          {routineSectionPlanOperation && <button type="button" onClick={() => void executeRoutineSectionPlan(routineSectionPlanOperation)}>保留中のRoutine配置を再試行</button>}
          <button type="button" className="secondary" onClick={() => {
            setProjectOperation(null); setTaskOperation(null); setDuplicateOperation(null); setBulkDeleteOperation(null); setBulkSectionOperation(null); setBulkSectionOccurrenceOperation(null); setBulkSectionPickerOpen(false); setBulkConfirmation(null); setBulkSectionConfirmation(null); setSelectedEntryIds([]); setReorderOperation(null); setStartOperation(null); setCompleteOperation(null);
            setConfigurationOperation(null); setSectionSettingsOperation(null); setSectionMoveOperation(null); setEstimateOperation(null); setPlannedStartOperation(null);
            setRoutineConversionOperation(null); setRoutineEndOperation(null); setRoutineEstimateOperation(null);
            setRoutineSectionPlanOperation(null); setRoutineCandidate(null); setError(null);
          }}>保留中のclient操作を破棄</button>
        </section>
      )}

      {day.active_execution && (
        <aside className="floating-runner" aria-label="実行中のTask">
          <div><span className="runner-state">実行中</span><strong>{activeEntry?.task.title ?? "別日の実行中Task"}</strong><small>{day.active_execution.started_at} から</small></div>
          <button type="button" aria-label="実行中のTaskを完了" disabled={mutationLocked} onClick={() => void complete(day.active_execution!.entry_id)}>完了</button>
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
