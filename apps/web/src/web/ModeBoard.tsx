import { useEffect, useRef, useState } from "react";
import type {
  CreateModeRequest, ModeBoardItemProjection, ModeBoardProjection,
  ReorderModesRequest, UpdateModeRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";

interface ModeBoardProps {
  board: ModeBoardProjection | null;
  onReload: () => Promise<ModeBoardProjection | null>;
  onBoardChange: (board: ModeBoardProjection) => void;
  onUnauthorized: () => void;
}

function isFormElement(element: Element | null): boolean {
  return element instanceof HTMLElement && Boolean(element.closest("input, textarea, select, button"));
}

type RetryOperation =
  | { kind: "create"; request: CreateModeRequest }
  | { kind: "rename"; request: UpdateModeRequest }
  | { kind: "reorder"; request: ReorderModesRequest };

export function ModeBoard({ board, onReload, onBoardChange, onUnauthorized }: ModeBoardProps) {
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryOperation, setRetryOperation] = useState<RetryOperation | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!board || pending || isFormElement(document.activeElement)) return;
      if (event.key === "Escape") {
        if (editingId) { event.preventDefault(); setEditingId(null); }
        else if (draft) { event.preventDefault(); setDraft(false); }
        return;
      }
      if (!["j", "J", "k", "K", "ArrowDown", "ArrowUp"].includes(event.key)) return;
      if (board.modes.length === 0) return;
      event.preventDefault();
      const index = board.modes.findIndex((item) => item.id === focusedId);
      const down = event.key === "j" || event.key === "J" || event.key === "ArrowDown";
      const next = board.modes[Math.max(0, Math.min(board.modes.length - 1, index < 0 ? (down ? 0 : board.modes.length - 1) : index + (down ? 1 : -1)))];
      if (next) { setFocusedId(next.id); rowRefs.current[next.id]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [board, draft, editingId, focusedId, pending]);

  async function reload() {
    const next = await onReload();
    if (next) onBoardChange(next);
    return next;
  }

  async function run(action: () => Promise<unknown>, retry: RetryOperation, successTitle: string,
    converged: (next: ModeBoardProjection) => boolean) {
    if (pending) return;
    setPending(true); setError(null);
    try { await action(); await reload(); setRetryOperation(null); setDraft(false); setEditingId(null); }
    catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else {
        const next = await reload();
        if (next && converged(next)) {
          setRetryOperation(null); setError(null); setDraft(false); setEditingId(null);
        } else {
          setRetryOperation(caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous" ? retry : null);
          setError(caught instanceof Error ? caught.message : `${successTitle}に失敗しました`);
        }
      }
    } finally { setPending(false); }
  }

  function create() {
    const title = draftTitle.trim();
    if (!title) return;
    const request: CreateModeRequest = { operation_id: uuidv7(), mode_id: uuidv7(), title };
    void run(() => api.createMode(request), { kind: "create", request }, "Mode作成",
      (next) => next.modes.some((mode) => mode.id === request.mode_id && mode.title === request.title));
    setDraftTitle("");
  }

  function rename(mode: ModeBoardItemProjection) {
    const title = editingTitle.trim();
    if (!title || title === mode.title) { setEditingId(null); return; }
    const request: UpdateModeRequest = { operation_id: uuidv7(), mode_id: mode.id,
      expected_settings_revision: mode.settings_revision, expected_title: mode.title, title };
    void run(() => api.updateMode(request), { kind: "rename", request }, "Mode名更新",
      (next) => next.modes.some((item) => item.id === request.mode_id && item.title === request.title));
  }

  function reorder(sourceId: string, targetId: string) {
    if (!board || sourceId === targetId || pending) return;
    const ids = board.modes.map((mode) => mode.id);
    const source = ids.indexOf(sourceId); const target = ids.indexOf(targetId);
    if (source < 0 || target < 0) return;
    ids.splice(source, 1); ids.splice(ids.indexOf(targetId) + (dragOverId === targetId ? 1 : 0), 0, sourceId);
    setDraggingId(null); setDragOverId(null);
    if (ids.every((id, index) => id === board.modes[index]?.id)) return;
    const request: ReorderModesRequest = { operation_id: uuidv7(), mode_ids: ids, expected_board_revision: board.board_revision };
    void run(() => api.reorderModes(request), { kind: "reorder", request }, "Mode順序更新",
      (next) => next.modes.map((mode) => mode.id).join("\0") === request.mode_ids.join("\0"));
  }

  function retryPendingOperation() {
    if (!retryOperation || pending || !board) return;
    switch (retryOperation.kind) {
      case "create":
        void run(() => api.createMode(retryOperation.request), retryOperation, "Mode作成",
          (next) => next.modes.some((mode) => mode.id === retryOperation.request.mode_id && mode.title === retryOperation.request.title));
        break;
      case "rename":
        void run(() => api.updateMode(retryOperation.request), retryOperation, "Mode名更新",
          (next) => next.modes.some((mode) => mode.id === retryOperation.request.mode_id && mode.title === retryOperation.request.title));
        break;
      case "reorder":
        void run(() => api.reorderModes(retryOperation.request), retryOperation, "Mode順序更新",
          (next) => next.modes.map((mode) => mode.id).join("\0") === retryOperation.request.mode_ids.join("\0"));
        break;
    }
  }

  if (!board) return <section className="mode-board" aria-label="Mode設定"><p role="status">Mode設定を読み込み中…</p></section>;
  return <section className="mode-board project-board" aria-label="Mode設定">
    <header className="project-board-header"><div><h2>Mode</h2><p>Taskの再利用可能な分類を管理します。</p></div>
      <button type="button" disabled={pending || draft} onClick={() => setDraft(true)}>＋ Modeを追加</button></header>
    {(error || retryOperation) && <div className="project-notification-stack">
      {error && <div className="project-notification project-notification-error error" role="alert">{error}</div>}
      {retryOperation && <div className="project-notification project-notification-retry error" role="status">
        操作結果を照合できませんでした。<button type="button" onClick={retryPendingOperation}>保留中のMode操作を再試行</button>
      </div>}
    </div>}
    <div className="project-board-table mode-board-table" role="table" aria-label="Mode一覧">
      <div className="project-board-row project-board-heading" role="row"><span role="columnheader">Mode名</span><span role="columnheader">順序</span></div>
      {draft && <form className="project-board-row project-board-draft" onSubmit={(event) => { event.preventDefault(); create(); }}>
        <span><input autoFocus maxLength={200} aria-label="新しいMode名" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></span>
        <span className="project-board-actions"><button type="submit" disabled={pending}>追加</button><button type="button" className="secondary" onClick={() => setDraft(false)}>キャンセル</button></span>
      </form>}
      {board.modes.map((mode) => <div key={mode.id} ref={(element) => { rowRefs.current[mode.id] = element; }}
        className={`project-board-row mode-board-row${focusedId === mode.id ? " is-focused" : ""}${draggingId === mode.id ? " is-dragging" : ""}${dragOverId === mode.id ? " is-drag-over" : ""}`}
        role="row" tabIndex={focusedId === mode.id ? 0 : -1} draggable={!pending}
        onFocus={() => setFocusedId(mode.id)} onDragStart={(event) => { if ((event.target as HTMLElement).closest("button,input")) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", mode.id); setDraggingId(mode.id); }}
        onDragOver={(event) => { if (draggingId && draggingId !== mode.id) { event.preventDefault(); setDragOverId(mode.id); } }}
        onDrop={(event) => { event.preventDefault(); const source = draggingId ?? event.dataTransfer.getData("text/plain"); if (source) reorder(source, mode.id); }}
        onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}>
        <span role="cell">{editingId === mode.id ? <input autoFocus maxLength={200} value={editingTitle} aria-label={`${mode.title}の名前`} onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => rename(mode)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); rename(mode); } if (event.key === "Escape") { event.preventDefault(); setEditingId(null); } }} /> : <button type="button" className="mode-title-button" onClick={() => { setEditingId(mode.id); setEditingTitle(mode.title); }}>{mode.title}</button>}</span>
        <span role="cell" className="project-board-actions"><span>{mode.board_position}</span><button type="button" className="secondary" onClick={() => { setEditingId(mode.id); setEditingTitle(mode.title); }}>名前変更</button></span>
      </div>)}
      {board.modes.length === 0 && !draft && <p className="project-board-empty">Modeはまだありません。</p>}
    </div>
  </section>;
}
