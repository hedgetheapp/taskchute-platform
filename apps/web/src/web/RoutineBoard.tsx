import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  ProjectSummary,
  RoutineBoardItemProjection,
  RoutineBoardProjection,
  RoutineScheduleInput,
  UpdateRoutineRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";

interface RoutineBoardProps {
  onUnauthorized: () => void;
}

interface ScheduleDraft {
  schedule: RoutineScheduleInput;
  start: string;
  end: string;
}

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [canonicalEpoch, setCanonicalEpoch] = useState(0);

  const reload = useCallback(async () => {
    try {
      const [nextBoard, nextProjects] = await Promise.all([api.loadRoutines(), api.loadProjects()]);
      setBoard(nextBoard);
      setProjects(nextProjects.projects);
      setCanonicalEpoch((value) => value + 1);
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

  async function mutate(action: () => Promise<unknown>, success: string) {
    setPending(true); setError(null); setNotice(null);
    try {
      await action();
      await reload();
      setNotice(success);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else {
        setError(caught instanceof Error ? caught.message : "Routineの保存に失敗しました");
        await reload();
      }
    } finally { setPending(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!board || pending) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    await mutate(() => api.createRoutine({ operation_id: uuidv7(), task_id: uuidv7(),
      routine_definition_id: uuidv7(), title, expected_board_revision: board.board_revision }),
    "OFFのRoutineを追加しました");
    setNewDraft(false);
  }

  async function toggle(routine: RoutineBoardItemProjection) {
    await mutate(() => api.setRoutineEnabled({ operation_id: uuidv7(),
      routine_definition_id: routine.routine_definition_id, enabled: !routine.enabled,
      expected_settings_revision: routine.settings_revision }),
    routine.enabled ? "Routineを停止しました" : "Routineを再開しました");
  }

  function updateRequest(routine: RoutineBoardItemProjection, patch: Partial<UpdateRoutineRequest>): UpdateRoutineRequest {
    return { operation_id: uuidv7(), routine_definition_id: routine.routine_definition_id,
      expected_settings_revision: routine.settings_revision, title: routine.title,
      project_id: routine.project?.id ?? null, schedule: routine.schedule,
      default_section_id: routine.default_section_id,
      default_planned_start_minute: routine.default_planned_start_minute,
      default_estimate_seconds: routine.default_estimate_seconds,
      start_logical_date: routine.start_logical_date, end_logical_date: routine.end_logical_date, ...patch };
  }

  async function save(routine: RoutineBoardItemProjection, patch: Partial<UpdateRoutineRequest>, message = "Routineを更新しました") {
    await mutate(() => api.updateRoutine(updateRequest(routine, patch)), message);
  }

  async function saveSection(routine: RoutineBoardItemProjection, sectionId: string | null) {
    const section = board?.sections.find((item) => item.id === sectionId);
    await save(routine, { default_section_id: section?.id ?? null,
      default_planned_start_minute: section?.logical_start_minute ?? null });
  }

  async function saveStart(routine: RoutineBoardItemProjection, raw: string) {
    const value = parseMinute(raw);
    if (value === undefined) { setError("開始予定はHH:mm形式で入力してください"); return; }
    if (value === null) { await save(routine, { default_section_id: null, default_planned_start_minute: null }); return; }
    const section = board?.sections.find((item) => item.logical_start_minute <= value && value < item.logical_end_minute);
    if (!section) { setError("開始予定に対応するSectionがありません"); return; }
    await save(routine, { default_section_id: section.id, default_planned_start_minute: value });
  }

  async function moveRoutine(sourceId: string, targetId: string) {
    if (!board || sourceId === targetId) return;
    const ids = board.routines.map((item) => item.routine_definition_id);
    const from = ids.indexOf(sourceId); const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    setDraggingId(null);
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
    setScheduleDrafts((current) => ({ ...current, [routine.routine_definition_id]: {
      schedule: routine.schedule, start: routine.start_logical_date, end: routine.end_logical_date ?? "",
    } }));
  }

  async function saveSchedule(routine: RoutineBoardItemProjection) {
    const draft = scheduleDrafts[routine.routine_definition_id];
    if (!draft) return;
    await save(routine, { schedule: draft.schedule, start_logical_date: draft.start,
      end_logical_date: draft.end || null }, "繰り返し・期間を更新しました");
    setScheduleDrafts((current) => { const next = { ...current }; delete next[routine.routine_definition_id]; return next; });
  }

  if (!board) return <main className="shell routine-shell"><p role="status">Routine Boardを読み込み中…</p></main>;

  return <main className="shell routine-shell">
    <header className="routine-board-header"><div><p className="eyebrow">Routine</p><h1>ルーティン</h1></div>
      <button type="button" disabled={pending || newDraft} onClick={() => setNewDraft(true)}>＋ ルーティンを追加</button></header>
    <div className="routine-board-toolbar">
      <label>検索<input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder="Routine / Project" /></label>
      <div role="tablist" aria-label="Routine表示"><button type="button" role="tab" aria-selected={tab === "active"}
        onClick={() => setTab("active")}>使用中</button><button type="button" role="tab" aria-selected={tab === "ended"}
        onClick={() => setTab("ended")}>期間終了</button></div>
    </div>
    {pending && <div className="transient-status" role="status">保存・照合中…</div>}
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="routine-board" role="table" aria-label="Routine Board">
      <div className="routine-board-row routine-board-columns" role="row">
        <span>ON/OFF</span><span>移動</span><span>Routine</span><span>Project</span><span>繰り返し</span>
        <span>Section</span><span>開始予定</span><span>見積</span><span>期間</span>
      </div>
      {newDraft && <form className="routine-board-row routine-new-row" onSubmit={create}>
        <span>OFF</span><span>⋮⋮</span><input name="title" aria-label="新しいRoutine名" autoFocus maxLength={300} required />
        <span>—</span><span>毎日</span><span>Sectionなし</span><span>—</span><span>—</span><span>終了なし</span>
        <span className="routine-new-actions"><button disabled={pending}>追加</button><button type="button" className="secondary"
          onClick={() => setNewDraft(false)}>キャンセル</button></span>
      </form>}
      {visible.map((routine) => {
        const scheduleDraft = scheduleDrafts[routine.routine_definition_id];
        return <div className="routine-board-row" role="row" key={routine.routine_definition_id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => draggingId && void moveRoutine(draggingId, routine.routine_definition_id)}>
          <button type="button" className={`routine-toggle ${routine.enabled ? "on" : "off"}`} disabled={pending}
            aria-pressed={routine.enabled} onClick={() => void toggle(routine)}>{routine.enabled ? "ON" : "OFF"}</button>
          <button type="button" className="routine-drag" draggable disabled={pending} aria-label={`${routine.title}を並び替え`}
            onDragStart={() => setDraggingId(routine.routine_definition_id)} onDragEnd={() => setDraggingId(null)}
            onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault(); void moveByKeyboard(routine.routine_definition_id, event.key === "ArrowUp" ? -1 : 1);
            } }}>⋮⋮</button>
          <input key={`${canonicalEpoch}-${routine.routine_definition_id}-title`} aria-label={`${routine.title}のRoutine名`}
            defaultValue={routine.title} maxLength={300} disabled={pending}
            onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== routine.title) void save(routine, { title: value }); }} />
          <select aria-label={`${routine.title}のProject`} value={routine.project?.id ?? ""} disabled={pending}
            onChange={(event) => void save(routine, { project_id: event.target.value || null })}>
            <option value="">Projectなし</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
          <div className="routine-schedule-cell"><button type="button" className="secondary" onClick={() => openSchedule(routine)}
            disabled={pending}>{scheduleText(routine.schedule)}</button>
            {scheduleDraft && <div className="routine-popover" role="dialog" aria-label={`${routine.title}の繰り返しと期間`}>
              <label>繰り返し<select value={scheduleDraft.schedule.kind} onChange={(event) => {
                const kind = event.target.value; const schedule: RoutineScheduleInput = kind === "daily" ? { kind: "daily" }
                  : kind === "every_n_days" ? { kind: "every_n_days", interval_days: 2 }
                  : { kind: "weekly", weekdays: [1] };
                setScheduleDrafts((current) => ({ ...current, [routine.routine_definition_id]: { ...scheduleDraft, schedule } }));
              }}><option value="daily">毎日</option><option value="every_n_days">N日ごと</option><option value="weekly">曜日指定</option></select></label>
              {scheduleDraft.schedule.kind === "every_n_days" && <label>日数<input type="number" min={2} max={365}
                value={scheduleDraft.schedule.interval_days} onChange={(event) => setScheduleDrafts((current) => ({ ...current,
                  [routine.routine_definition_id]: { ...scheduleDraft, schedule: { kind: "every_n_days", interval_days: Number(event.target.value) } } }))} /></label>}
              {scheduleDraft.schedule.kind === "weekly" && <fieldset><legend>曜日</legend>{["日", "月", "火", "水", "木", "金", "土"].map((label, day) =>
                <label key={label}><input type="checkbox" checked={scheduleDraft.schedule.kind === "weekly" && scheduleDraft.schedule.weekdays.includes(day)}
                  onChange={(event) => { if (scheduleDraft.schedule.kind !== "weekly") return;
                    const days = event.target.checked ? [...scheduleDraft.schedule.weekdays, day].sort() : scheduleDraft.schedule.weekdays.filter((item) => item !== day);
                    if (days.length) setScheduleDrafts((current) => ({ ...current, [routine.routine_definition_id]: { ...scheduleDraft,
                      schedule: { kind: "weekly", weekdays: days } } })); }} />{label}</label>)}</fieldset>}
              <label>開始日<input type="date" value={scheduleDraft.start} onChange={(event) => setScheduleDrafts((current) => ({ ...current,
                [routine.routine_definition_id]: { ...scheduleDraft, start: event.target.value } }))} /></label>
              <label>終了日<input type="date" value={scheduleDraft.end} onChange={(event) => setScheduleDrafts((current) => ({ ...current,
                [routine.routine_definition_id]: { ...scheduleDraft, end: event.target.value } }))} /></label>
              <div><button type="button" disabled={pending || !scheduleDraft.start || (scheduleDraft.end !== "" && scheduleDraft.end < scheduleDraft.start)}
                onClick={() => void saveSchedule(routine)}>保存</button><button type="button" className="secondary" onClick={() => setScheduleDrafts((current) => {
                  const next = { ...current }; delete next[routine.routine_definition_id]; return next; })}>キャンセル</button></div>
            </div>}
          </div>
          <select aria-label={`${routine.title}のSection`} value={routine.default_section_id ?? ""} disabled={pending}
            onChange={(event) => void saveSection(routine, event.target.value || null)}><option value="">Sectionなし</option>
            {board.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select>
          <input key={`${canonicalEpoch}-${routine.routine_definition_id}-start`} aria-label={`${routine.title}の開始予定`}
            defaultValue={minuteText(routine.default_planned_start_minute)} disabled={pending}
            placeholder="—" onBlur={(event) => { if (event.target.value !== minuteText(routine.default_planned_start_minute)) void saveStart(routine, event.target.value); }} />
          <input key={`${canonicalEpoch}-${routine.routine_definition_id}-estimate`} aria-label={`${routine.title}の見積`}
            type="number" min={1} disabled={pending}
            defaultValue={routine.default_estimate_seconds === null ? "" : String(routine.default_estimate_seconds / 60)} placeholder="—"
            onBlur={(event) => { const minutes = event.target.value === "" ? null : Number(event.target.value);
              if (minutes !== null && (!Number.isSafeInteger(minutes) || minutes <= 0)) {
                setError("見積は1分以上の整数で入力してください"); return;
              }
              const seconds = minutes === null ? null : minutes * 60;
              if (seconds !== routine.default_estimate_seconds) void save(routine, { default_estimate_seconds: seconds }); }} />
          <button type="button" className="secondary" onClick={() => openSchedule(routine)} disabled={pending}>
            {routine.end_logical_date ? `${routine.start_logical_date}〜${routine.end_logical_date}` : `${routine.start_logical_date}〜`}</button>
        </div>;
      })}
      {visible.length === 0 && !newDraft && <p className="muted routine-empty">該当するRoutineはありません。</p>}
    </div>
  </main>;
}
