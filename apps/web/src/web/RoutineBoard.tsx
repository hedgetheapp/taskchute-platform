import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type {
  DeleteRoutineRequest,
  ProjectSummary,
  RoutineBoardItemProjection,
  RoutineBoardProjection,
  RoutineScheduleInput,
  UpdateRoutineRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";
import {
  clampRoutineColumnWidth,
  readPersistedRoutineColumnPreference,
  reorderRoutineColumns,
  resetRoutineColumnPreference,
  ROUTINE_COLUMN_DEFINITIONS,
  routineTableStyle,
  type RoutineColumnKey,
  type RoutineColumnPreference,
} from "./routine-columns";

interface RoutineBoardProps { onUnauthorized: () => void; }
interface ScheduleDraft { schedule: RoutineScheduleInput; }
interface ResizeState { key: RoutineColumnKey; startX: number; startWidth: number; }

function minuteText(value: number | null): string {
  if (value === null) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function parseMinute(value: string): number | null | undefined {
  if (value.trim() === "") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 47 && minute <= 59 ? hour * 60 + minute : undefined;
}

function scheduleText(schedule: RoutineScheduleInput): string {
  if (schedule.kind === "daily") return "毎日";
  if (schedule.kind === "every_n_days") return `${schedule.interval_days}日ごと`;
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  return schedule.weekdays.map((day) => labels[day]).join("・");
}

function isFormElement(element: Element | null): boolean {
  return element instanceof HTMLElement
    && (element.matches("input, select, textarea, [contenteditable='true']") || element.closest("[contenteditable='true']") !== null);
}

export function RoutineBoard({ onUnauthorized }: RoutineBoardProps) {
  const [board, setBoard] = useState<RoutineBoardProjection | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"active" | "ended">("active");
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, ScheduleDraft>>({});
  const [draggingRoutineId, setDraggingRoutineId] = useState<string | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<RoutineColumnKey | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [preference, setPreference] = useState<RoutineColumnPreference>(() => readPersistedRoutineColumnPreference());
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [focusedRoutineId, setFocusedRoutineId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoutineBoardItemProjection | null>(null);
  const [deleteOperation, setDeleteOperation] = useState<DeleteRoutineRequest | null>(null);
  const [canonicalEpoch, setCanonicalEpoch] = useState(0);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const modalRef = useRef<HTMLDivElement | null>(null);
  const modalTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem("taskchute.web.routine-columns.v1", JSON.stringify(preference)); } catch { /* memory state remains usable */ }
  }, [preference]);

  const reload = useCallback(async () => {
    try {
      const [nextBoard, nextProjects] = await Promise.all([api.loadRoutines(), api.loadProjects()]);
      setBoard(nextBoard);
      setProjects(nextProjects.projects);
      setCanonicalEpoch((value) => value + 1);
      setFocusedRoutineId((current) => current && nextBoard.routines.some((routine) => routine.routine_definition_id === current) ? current : null);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : "Routine Boardの読み込みに失敗しました");
    }
  }, [onUnauthorized]);

  useEffect(() => { void reload(); }, [reload]);

  const visible = useMemo(() => {
    if (!board) return [];
    const lowered = query.trim().toLocaleLowerCase();
    return board.routines.filter((routine) => {
      const ended = routine.end_logical_date !== null && routine.end_logical_date < board.current_logical_date;
      return (tab === "ended" ? ended : !ended)
        && (!lowered || `${routine.title} ${routine.project?.title ?? ""}`.toLocaleLowerCase().includes(lowered));
    });
  }, [board, query, tab]);

  useEffect(() => {
    if (resize === null) return;
    const onMove = (event: PointerEvent) => {
      const nextWidth = clampRoutineColumnWidth(resize.key, resize.startWidth + event.clientX - resize.startX);
      setPreference((current) => ({ ...current, widths: { ...current.widths, [resize.key]: nextWidth } }));
    };
    const onUp = () => setResize(null);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => { document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
  }, [resize]);

  useEffect(() => {
    if (!helpOpen && deleteTarget === null) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDialog = () => modalRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (deleteTarget !== null) setDeleteTarget(null); else setHelpOpen(false);
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]!; const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(focusDialog, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      if (!helpOpen && deleteTarget === null) (modalTriggerRef.current ?? previous)?.focus();
    };
  }, [helpOpen, deleteTarget]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isFormElement(document.activeElement)) return;
      if (helpOpen || deleteTarget !== null) return;
      if (event.key === "Escape") {
        if (Object.keys(scheduleDrafts).length > 0) { event.preventDefault(); setScheduleDrafts({}); }
        else if (newDraft) { event.preventDefault(); setNewDraft(false); }
        else if (openMenuId !== null) { event.preventDefault(); setOpenMenuId(null); }
        return;
      }
      if (event.key === "?") { event.preventDefault(); setHelpOpen(true); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key.toLowerCase() !== "j" && event.key.toLowerCase() !== "k") return;
      const down = event.key === "ArrowDown" || event.key.toLowerCase() === "j";
      if (visible.length === 0) return;
      event.preventDefault();
      const currentIndex = focusedRoutineId === null ? -1 : visible.findIndex((routine) => routine.routine_definition_id === focusedRoutineId);
      const nextIndex = currentIndex < 0 ? (down ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, currentIndex + (down ? 1 : -1)));
      const nextId = visible[nextIndex]!.routine_definition_id;
      setFocusedRoutineId(nextId);
      window.setTimeout(() => rowRefs.current[nextId]?.focus(), 0);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, focusedRoutineId, helpOpen, newDraft, openMenuId, scheduleDrafts, visible]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setPending(true); setError(null); setNotice(null);
    try { await action(); await reload(); setNotice(success); }
    catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else { setError(caught instanceof Error ? caught.message : "Routineの保存に失敗しました"); await reload(); }
    } finally { setPending(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!board || pending) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    await mutate(() => api.createRoutine({ operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(), title,
      expected_board_revision: board.board_revision }), "OFFのRoutineを追加しました");
    setNewDraft(false);
  }

  async function toggle(routine: RoutineBoardItemProjection) {
    await mutate(() => api.setRoutineEnabled({ operation_id: uuidv7(), routine_definition_id: routine.routine_definition_id,
      enabled: !routine.enabled, expected_settings_revision: routine.settings_revision }),
    routine.enabled ? "Routineを停止しました" : "Routineを再開しました");
  }

  function updateRequest(routine: RoutineBoardItemProjection, patch: Partial<UpdateRoutineRequest>): UpdateRoutineRequest {
    return { operation_id: uuidv7(), routine_definition_id: routine.routine_definition_id,
      expected_settings_revision: routine.settings_revision, title: routine.title, project_id: routine.project?.id ?? null,
      schedule: routine.schedule, default_section_id: routine.default_section_id, default_planned_start_minute: routine.default_planned_start_minute,
      default_estimate_seconds: routine.default_estimate_seconds, start_logical_date: routine.start_logical_date,
      end_logical_date: routine.end_logical_date, ...patch };
  }

  async function save(routine: RoutineBoardItemProjection, patch: Partial<UpdateRoutineRequest>, message = "Routineを更新しました") {
    await mutate(() => api.updateRoutine(updateRequest(routine, patch)), message);
  }

  async function saveSection(routine: RoutineBoardItemProjection, sectionId: string | null) {
    const section = board?.sections.find((item) => item.id === sectionId);
    await save(routine, { default_section_id: section?.id ?? null, default_planned_start_minute: section?.logical_start_minute ?? null });
  }

  async function saveStart(routine: RoutineBoardItemProjection, raw: string) {
    const value = parseMinute(raw);
    if (value === undefined) { setError("開始予定はHH:mm形式で入力してください"); return; }
    if (value === null) { await save(routine, { default_section_id: null, default_planned_start_minute: null }); return; }
    const section = board?.sections.find((item) => item.logical_start_minute <= value && value < item.logical_end_minute);
    if (!section) { setError("開始予定に対応するSectionがありません"); return; }
    await save(routine, { default_section_id: section.id, default_planned_start_minute: value });
  }

  async function saveDate(routine: RoutineBoardItemProjection, key: "start_logical_date" | "end_logical_date", value: string) {
    const start = key === "start_logical_date" ? value : routine.start_logical_date;
    const end = key === "end_logical_date" ? (value || null) : routine.end_logical_date;
    if (!start || (end !== null && end < start)) { setError("開始日と終了日の順序が正しくありません"); return; }
    await save(routine, { start_logical_date: start, end_logical_date: end }, "Routineの期間を更新しました");
  }

  async function moveRoutine(sourceId: string, targetId: string) {
    if (!board || sourceId === targetId || pending) return;
    const ids = board.routines.map((item) => item.routine_definition_id);
    const from = ids.indexOf(sourceId); const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    setDraggingRoutineId(null);
    await mutate(() => api.reorderRoutines({ operation_id: uuidv7(), routine_definition_ids: ids,
      expected_board_revision: board.board_revision }), "Routineの順序を更新しました");
  }

  async function moveByKeyboard(sourceId: string, direction: -1 | 1) {
    if (!board) return;
    const index = board.routines.findIndex((item) => item.routine_definition_id === sourceId);
    const target = board.routines[index + direction];
    if (index < 0 || !target) return;
    await moveRoutine(sourceId, target.routine_definition_id);
  }

  function openSchedule(routine: RoutineBoardItemProjection) {
    setScheduleDrafts((current) => ({ ...current, [routine.routine_definition_id]: { schedule: routine.schedule } }));
  }

  async function saveSchedule(routine: RoutineBoardItemProjection) {
    const draft = scheduleDrafts[routine.routine_definition_id];
    if (!draft) return;
    await save(routine, { schedule: draft.schedule }, "繰り返しを更新しました");
    setScheduleDrafts((current) => { const next = { ...current }; delete next[routine.routine_definition_id]; return next; });
  }

  async function executeDelete(request: DeleteRoutineRequest) {
    setPending(true); setError(null); setNotice(null); setDeleteOperation(request);
    try {
      await api.deleteRoutine(request);
      await reload();
      setDeleteOperation(null); setDeleteTarget(null); setNotice("Routineを削除しました");
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else {
        if (!(caught instanceof ApiClientError && caught.reconcile)) setDeleteOperation(null);
        setDeleteTarget(null);
        setError(caught instanceof Error ? caught.message : "Routineの削除に失敗しました");
        await reload();
      }
    } finally { setPending(false); }
  }

  function confirmDelete() {
    if (!board || !deleteTarget || pending) return;
    void executeDelete({ operation_id: uuidv7(), routine_definition_id: deleteTarget.routine_definition_id,
      expected_settings_revision: deleteTarget.settings_revision, expected_board_revision: board.board_revision });
  }

  function dropColumn(target: RoutineColumnKey, event: DragEvent) {
    event.preventDefault();
    if (!draggingColumn || draggingColumn === target) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
    setPreference((current) => ({ ...current, order: reorderRoutineColumns(current.order, draggingColumn, target, edge) }));
    setDraggingColumn(null);
  }

  function renderCell(routine: RoutineBoardItemProjection, key: RoutineColumnKey) {
    const scheduleDraft = scheduleDrafts[routine.routine_definition_id];
    switch (key) {
      case "enabled": return <div role="cell" className="routine-cell routine-enabled-cell"><label className="routine-enabled-control">
        <input type="checkbox" checked={routine.enabled} disabled={pending} aria-label={`${routine.title}の有効`} onChange={() => void toggle(routine)} />
        <span>{routine.enabled ? "有効" : "停止"}</span></label></div>;
      case "task": return <div role="cell" className="routine-cell routine-task-cell">
        <button type="button" className="routine-drag" draggable disabled={pending} aria-label={`${routine.title}を並び替え`}
          onDragStart={() => setDraggingRoutineId(routine.routine_definition_id)} onDragEnd={() => setDraggingRoutineId(null)}
          onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault(); void moveByKeyboard(routine.routine_definition_id, event.key === "ArrowUp" ? -1 : 1);
          } }}>⋮⋮</button>
        <input key={`${canonicalEpoch}-${routine.routine_definition_id}-title`} aria-label={`${routine.title}のRoutine名`} defaultValue={routine.title}
          maxLength={300} disabled={pending} onKeyDown={(event) => { if (event.key === "Escape") {
            event.currentTarget.value = routine.title; event.currentTarget.blur();
          } }} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== routine.title) void save(routine, { title: value }); }} />
        <button type="button" className="routine-overflow" aria-label={`${routine.title}のメニュー`} aria-expanded={openMenuId === routine.routine_definition_id} disabled={pending}
          onClick={(event) => { modalTriggerRef.current = event.currentTarget; setOpenMenuId((current) => current === routine.routine_definition_id ? null : routine.routine_definition_id); }}>…</button>
        {openMenuId === routine.routine_definition_id && <div className="routine-overflow-menu" role="menu" aria-label={`${routine.title}の操作`}>
          <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); setDeleteTarget(routine); }}>削除</button>
        </div>}
      </div>;
      case "schedule": return <div role="cell" className="routine-cell routine-schedule-cell"><button type="button" className="secondary"
        onClick={() => openSchedule(routine)} disabled={pending}>{scheduleText(routine.schedule)}</button>
        {scheduleDraft && <div className="routine-popover" role="dialog" aria-label={`${routine.title}の繰り返し`}>
          <label>繰り返し<select value={scheduleDraft.schedule.kind} onChange={(event) => {
            const kind = event.target.value; const schedule: RoutineScheduleInput = kind === "daily" ? { kind: "daily" }
              : kind === "every_n_days" ? { kind: "every_n_days", interval_days: 2 } : { kind: "weekly", weekdays: [1] };
            setScheduleDrafts((current) => ({ ...current, [routine.routine_definition_id]: { schedule } }));
          }}><option value="daily">毎日</option><option value="every_n_days">N日ごと</option><option value="weekly">曜日指定</option></select></label>
          {scheduleDraft.schedule.kind === "every_n_days" && <label>日数<input type="number" min={2} max={365}
            value={scheduleDraft.schedule.interval_days} onChange={(event) => setScheduleDrafts((current) => ({
              ...current, [routine.routine_definition_id]: { schedule: { kind: "every_n_days", interval_days: Number(event.target.value) } },
            }))} /></label>}
          {scheduleDraft.schedule.kind === "weekly" && <fieldset><legend>曜日</legend>{["日", "月", "火", "水", "木", "金", "土"].map((label, day) =>
            <label key={label}><input type="checkbox" checked={scheduleDraft.schedule.kind === "weekly"
              && scheduleDraft.schedule.weekdays.includes(day)} onChange={(event) => {
                const schedule = scheduleDraft.schedule; if (schedule.kind !== "weekly") return;
                const days = event.target.checked ? [...schedule.weekdays, day].sort() : schedule.weekdays.filter((item) => item !== day);
                if (days.length) setScheduleDrafts((current) => ({ ...current, [routine.routine_definition_id]: { schedule: { kind: "weekly", weekdays: days } } }));
              }} />{label}</label>)} </fieldset>}
          <div><button type="button" disabled={pending} onClick={() => void saveSchedule(routine)}>保存</button>
            <button type="button" className="secondary" onClick={() => setScheduleDrafts((current) => { const next = { ...current }; delete next[routine.routine_definition_id]; return next; })}>キャンセル</button></div>
        </div>}
      </div>;
      case "plannedStart": return <div role="cell" className="routine-cell"><input aria-label={`${routine.title}の開始予定`} key={`${canonicalEpoch}-${routine.routine_definition_id}-start`}
        defaultValue={minuteText(routine.default_planned_start_minute)} disabled={pending} placeholder="—"
        onBlur={(event) => { if (event.target.value !== minuteText(routine.default_planned_start_minute)) void saveStart(routine, event.target.value); }} /></div>;
      case "estimate": return <div role="cell" className="routine-cell"><input aria-label={`${routine.title}の見積`} type="number" min={1}
        key={`${canonicalEpoch}-${routine.routine_definition_id}-estimate`} defaultValue={routine.default_estimate_seconds === null ? "" : String(routine.default_estimate_seconds / 60)}
        disabled={pending} placeholder="—" onBlur={(event) => { const minutes = event.target.value === "" ? null : Number(event.target.value);
          if (minutes !== null && (!Number.isSafeInteger(minutes) || minutes <= 0)) { setError("見積は1分以上の整数で入力してください"); return; }
          const seconds = minutes === null ? null : minutes * 60; if (seconds !== routine.default_estimate_seconds) void save(routine, { default_estimate_seconds: seconds }); }} /></div>;
      case "project": return <div role="cell" className="routine-cell"><select aria-label={`${routine.title}のProject`} value={routine.project?.id ?? ""} disabled={pending}
        onChange={(event) => void save(routine, { project_id: event.target.value || null })}><option value="">Projectなし</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></div>;
      case "section": return <div role="cell" className="routine-cell"><select aria-label={`${routine.title}のSection`} value={routine.default_section_id ?? ""} disabled={pending}
        onChange={(event) => void saveSection(routine, event.target.value || null)}><option value="">Sectionなし</option>
        {board?.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></div>;
      case "startDate": return <div role="cell" className="routine-cell"><input aria-label={`${routine.title}の開始日`} type="date" key={`${canonicalEpoch}-${routine.routine_definition_id}-start-date`}
        defaultValue={routine.start_logical_date} disabled={pending} onBlur={(event) => void saveDate(routine, "start_logical_date", event.target.value)} /></div>;
      case "endDate": return <div role="cell" className="routine-cell"><input aria-label={`${routine.title}の終了日`} type="date" key={`${canonicalEpoch}-${routine.routine_definition_id}-end-date`}
        defaultValue={routine.end_logical_date ?? ""} disabled={pending} placeholder="終了なし" onBlur={(event) => void saveDate(routine, "end_logical_date", event.target.value)} /></div>;
    }
  }

  if (!board) return <main className="shell routine-shell"><p role="status">Routine Boardを読み込み中…</p></main>;

  return <main className="shell routine-shell">
    <header className="routine-board-header"><div><p className="eyebrow">Routine</p><h1>ルーティン</h1></div>
      <button type="button" disabled={pending || newDraft} onClick={() => setNewDraft(true)}>＋ ルーティンを追加</button></header>
    <div className="routine-board-toolbar">
      <label>検索<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Routine / Project" /></label>
      <div role="tablist" aria-label="Routine表示"><button type="button" role="tab" aria-selected={tab === "active"} onClick={() => setTab("active")}>使用中</button>
        <button type="button" role="tab" aria-selected={tab === "ended"} onClick={() => setTab("ended")}>期間終了</button></div>
      <div className="routine-board-actions"><button type="button" className="secondary" onClick={() => setPreference(resetRoutineColumnPreference())}>列を初期化</button>
        <button type="button" className="secondary" onClick={(event) => { modalTriggerRef.current = event.currentTarget; setHelpOpen(true); }}>?</button></div>
    </div>
    {pending && <div className="transient-status" role="status">保存・照合中…</div>}
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {deleteOperation && <div className="transient-status routine-delete-retry" role="status">削除結果を照合できませんでした。<button type="button" onClick={() => void executeDelete(deleteOperation)}>削除を再試行</button></div>}
    <div className="routine-board" role="table" aria-label="Routine Board" style={routineTableStyle(preference)}>
      <div className="routine-board-scroll"><div className="routine-board-grid">
        <div className="routine-board-row routine-board-columns" role="row">
          {preference.order.map((key) => { const definition = ROUTINE_COLUMN_DEFINITIONS.find((item) => item.key === key)!; return <div role="columnheader" key={key}
            className="routine-column-header" draggable onDragStart={(event) => { if ((event.target as HTMLElement).closest("button")) { event.preventDefault(); return; }
              setDraggingColumn(key); event.dataTransfer?.setData("text/plain", key); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropColumn(key, event)}>
            <span>{definition.label}</span><button type="button" className="routine-column-resize" aria-label={`${definition.label}の幅を変更`} onPointerDown={(event) => {
              event.preventDefault(); event.stopPropagation(); setResize({ key, startX: event.clientX, startWidth: preference.widths[key] });
            }} /></div>; })}
        </div>
        {newDraft && <form className="routine-board-row routine-new-row" onSubmit={create}>
          {preference.order.map((key) => <div role="cell" key={key}>{key === "enabled" ? <span>停止</span> : key === "task" ? <>
            <input name="title" aria-label="新しいRoutine名" autoFocus maxLength={300} required onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setNewDraft(false); } }} />
            <button type="submit">追加</button><button type="button" className="secondary" onClick={() => setNewDraft(false)}>キャンセル</button></>
            : key === "schedule" ? <span>毎日</span> : key === "endDate" ? <span>終了なし</span> : <span>—</span>}</div>)}
        </form>}
        {visible.map((routine) => <div className={`routine-board-row ${focusedRoutineId === routine.routine_definition_id ? "is-focused" : ""}`} role="row"
          key={routine.routine_definition_id} tabIndex={focusedRoutineId === routine.routine_definition_id ? 0 : -1} ref={(element) => { rowRefs.current[routine.routine_definition_id] = element; }}
          onFocus={() => setFocusedRoutineId(routine.routine_definition_id)} onDragOver={(event) => event.preventDefault()}
          onDrop={() => draggingRoutineId && void moveRoutine(draggingRoutineId, routine.routine_definition_id)}>
          {preference.order.map((key) => <span key={key}>{renderCell(routine, key)}</span>)}
        </div>)}
        {visible.length === 0 && !newDraft && <p className="muted routine-empty">該当するRoutineはありません。</p>}
      </div></div>
    </div>
    {helpOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
      <div ref={modalRef} className="modal-dialog routine-help-modal" role="dialog" aria-modal="true" aria-label="Routine Boardショートカット" tabIndex={-1}>
        <h2>Routine Boardショートカット</h2><ul><li><kbd>J</kbd> / <kbd>↓</kbd> 次のRoutine</li><li><kbd>K</kbd> / <kbd>↑</kbd> 前のRoutine</li><li><kbd>?</kbd> ヘルプを開く</li><li><kbd>Esc</kbd> 閉じる</li></ul>
        <button type="button" onClick={() => setHelpOpen(false)}>閉じる</button>
      </div>
    </div>}
    {deleteTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
      <div ref={modalRef} className="modal-dialog" role="dialog" aria-modal="true" aria-label="Routine削除確認" tabIndex={-1}>
        <h2>ルーティンを削除しますか？</h2><p>今後の自動生成を停止します。すでに作成されたTaskと過去の実行履歴は削除されません。</p>
        <div className="modal-actions"><button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>キャンセル</button><button type="button" className="destructive" onClick={confirmDelete}>削除</button></div>
      </div>
    </div>}
  </main>;
}
