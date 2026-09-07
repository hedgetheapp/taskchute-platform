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
  return element instanceof HTMLElement
    && (element.matches("input, select, textarea, [contenteditable='true']")
      || element.closest("[contenteditable='true']") !== null);
}

function isShortcutOwner(element: Element | null): boolean {
  return isFormElement(element)
    || Boolean(element instanceof Element && element.closest("[role='dialog'], [role='menu']"));
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element && (target instanceof HTMLElement && target.isContentEditable
    || Boolean(target.closest("button, a, input, select, textarea, label, [contenteditable], [role='dialog'], [role='menu']")));
}

function connected(element: HTMLElement | null): HTMLElement | null {
  return element?.isConnected ? element : null;
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryOperation, setRetryOperation] = useState<RetryOperation | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const addRef = useRef<HTMLButtonElement | null>(null);
  const helpRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const helpOriginRef = useRef<HTMLElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const renameCanceledRef = useRef(false);

  function showNotice(message: string) {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, 2500);
  }

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!board) return;
    setFocusedId((current) => current && board.modes.some((mode) => mode.id === current) ? current : null);
  }, [board]);

  useEffect(() => {
    if (!helpOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (helpOriginRef.current === null) helpOriginRef.current = connected(previous) ?? connected(helpRef.current);
    const timer = window.setTimeout(() => modalRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setHelpOpen(false); return; }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]!; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      const origin = connected(helpOriginRef.current);
      (origin ?? connected(helpRef.current) ?? connected(addRef.current) ?? connected(previous))?.focus();
      helpOriginRef.current = null;
    };
  }, [helpOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!board || pending || event.isComposing || helpOpen) return;
      if (event.key === "Escape") {
        if (openMenuId !== null) {
          event.preventDefault();
          const trigger = connected(actionRefs.current[openMenuId]);
          setOpenMenuId(null);
          window.setTimeout(() => trigger?.focus(), 0);
        } else if (draft) { event.preventDefault(); setDraft(false); setDraftTitle(""); }
        else if (editingId !== null) { event.preventDefault(); renameCanceledRef.current = true; setEditingId(null); }
        return;
      }
      if (isShortcutOwner(document.activeElement) || openMenuId !== null) return;
      if (event.key === "?") {
        event.preventDefault();
        helpOriginRef.current = connected(document.activeElement instanceof HTMLElement ? document.activeElement : null) ?? connected(helpRef.current);
        setHelpOpen(true);
        return;
      }
      if (!["j", "J", "k", "K", "ArrowDown", "ArrowUp"].includes(event.key) || board.modes.length === 0) return;
      event.preventDefault();
      const index = board.modes.findIndex((item) => item.id === focusedId);
      const down = event.key === "j" || event.key === "J" || event.key === "ArrowDown";
      const next = board.modes[Math.max(0, Math.min(board.modes.length - 1, index < 0 ? (down ? 0 : board.modes.length - 1) : index + (down ? 1 : -1)))];
      if (next) { setFocusedId(next.id); rowRefs.current[next.id]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [board, draft, editingId, focusedId, helpOpen, openMenuId, pending]);

  async function reload() {
    const next = await onReload();
    if (next) onBoardChange(next);
    return next;
  }

  async function run(action: () => Promise<unknown>, retry: RetryOperation, successMessage: string,
    errorLabel: string, converged: (next: ModeBoardProjection) => boolean) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true); setError(null); setNotice(null);
    try {
      await action();
      await reload();
      setRetryOperation(null); setDraft(false); setDraftTitle(""); setEditingId(null); setOpenMenuId(null);
      showNotice(successMessage);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else {
        const next = await reload();
        if (next && converged(next)) {
          setRetryOperation(null); setError(null); setDraft(false); setDraftTitle(""); setEditingId(null); setOpenMenuId(null);
          showNotice(successMessage);
        } else {
          setRetryOperation(caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous" ? retry : null);
          setError(caught instanceof Error ? caught.message : `${errorLabel}に失敗しました`);
          if (retry.kind === "rename") setEditingId(null);
          setOpenMenuId(null);
        }
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function create(retryRequest?: CreateModeRequest) {
    const title = draftTitle.trim();
    if (!retryRequest && !title) return;
    const request: CreateModeRequest = retryRequest ?? { operation_id: uuidv7(), mode_id: uuidv7(), title };
    void run(() => api.createMode(request), { kind: "create", request }, "Modeを作成しました", "Mode作成",
      (next) => next.modes.some((mode) => mode.id === request.mode_id && mode.title === request.title));
  }

  function rename(mode: ModeBoardItemProjection, retryRequest?: UpdateModeRequest) {
    if (!retryRequest && renameCanceledRef.current) { renameCanceledRef.current = false; return; }
    const title = editingTitle.trim();
    if (!retryRequest && (!title || title === mode.title)) { setEditingId(null); return; }
    const request: UpdateModeRequest = retryRequest ?? { operation_id: uuidv7(), mode_id: mode.id,
      expected_settings_revision: mode.settings_revision, expected_title: mode.title, title };
    void run(() => api.updateMode(request), { kind: "rename", request }, "Mode名を更新しました", "Mode名更新",
      (next) => next.modes.some((item) => item.id === request.mode_id && item.title === request.title));
  }

  function executeReorder(request: ReorderModesRequest) {
    void run(() => api.reorderModes(request), { kind: "reorder", request }, "Modeの順序を更新しました", "Mode順序更新",
      (next) => next.modes.map((mode) => mode.id).join("\0") === request.mode_ids.join("\0"));
  }

  function reorder(sourceId: string, targetId: string, after: boolean) {
    if (!board || sourceId === targetId || pendingRef.current) return;
    const ids = board.modes.map((mode) => mode.id);
    const source = ids.indexOf(sourceId); const target = ids.indexOf(targetId);
    if (source < 0 || target < 0) return;
    ids.splice(source, 1);
    ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, sourceId);
    setDraggingId(null); setDragOverId(null);
    if (ids.every((id, index) => id === board.modes[index]?.id)) return;
    executeReorder({ operation_id: uuidv7(), mode_ids: ids, expected_board_revision: board.board_revision });
  }

  function startRename(mode: ModeBoardItemProjection) {
    renameCanceledRef.current = false;
    setOpenMenuId(null);
    setEditingId(mode.id);
    setEditingTitle(mode.title);
  }

  function retryPendingOperation() {
    if (!retryOperation || pendingRef.current || !board) return;
    switch (retryOperation.kind) {
      case "create": create(retryOperation.request); break;
      case "rename": {
        const mode = board.modes.find((item) => item.id === retryOperation.request.mode_id);
        if (mode) rename(mode, retryOperation.request);
        break;
      }
      case "reorder": executeReorder(retryOperation.request); break;
    }
  }

  const retryLabel = retryOperation?.kind === "create" ? "保留中のMode作成を再試行" : "保留中のMode操作を再試行";

  if (!board) return <section className="project-board" aria-label="Mode設定"><p role="status">Mode設定を読み込み中…</p></section>;
  return <section className="mode-board project-board" aria-label="Mode設定">
    <header className="project-board-header"><div><h2>Mode</h2><p>Taskの再利用可能な分類を管理します。</p></div>
      <button ref={addRef} type="button" disabled={pending || draft} onClick={() => setDraft(true)}>＋ Modeを追加</button></header>
    <div className="project-board-toolbar mode-board-toolbar">
      <button ref={helpRef} type="button" className="secondary" onClick={(event) => { helpOriginRef.current = event.currentTarget; setHelpOpen(true); }}>?</button>
    </div>
    {(notice || error || retryOperation) && <div className="project-notification-stack" aria-live="polite">
      {notice && <div className="project-notification project-notification-success success" role="status" aria-live="polite" aria-atomic="true">{notice}</div>}
      {error && <div className="project-notification project-notification-error error" role="alert">{error}</div>}
      {retryOperation && <div className="project-notification project-notification-retry error" role="status">
        操作結果を照合できませんでした。<button type="button" onClick={retryPendingOperation}>{retryLabel}</button>
      </div>}
    </div>}
    <div className="project-board-table mode-board-table" role="table" aria-label="Mode一覧">
      <div className="project-board-row project-board-heading" role="row"><span role="columnheader">Mode名</span><span aria-hidden="true" /></div>
      {draft && <form className="project-board-row project-board-draft" role="row" onSubmit={(event) => { event.preventDefault(); create(); }}>
        <span><input autoFocus maxLength={200} aria-label="新しいMode名" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setDraft(false); setDraftTitle(""); } }} /></span>
        <span className="project-board-actions"><button type="submit" disabled={pending}>追加</button><button type="button" className="secondary" onClick={() => { setDraft(false); setDraftTitle(""); }}>キャンセル</button></span>
      </form>}
      {board.modes.map((mode, index) => <div key={mode.id} ref={(element) => { rowRefs.current[mode.id] = element; }}
        className={`project-board-row mode-board-row${focusedId === mode.id ? " is-focused" : ""}${draggingId === mode.id ? " is-dragging" : ""}${dragOverId === mode.id ? " is-drop-target" : ""}`}
        role="row" tabIndex={focusedId === mode.id || focusedId === null && index === 0 ? 0 : -1} draggable={!pending}
        onFocus={() => setFocusedId(mode.id)} onDragStart={(event) => { if (isInteractiveDragTarget(event.target)) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", mode.id); setDraggingId(mode.id); }}
        onDragOver={(event) => { if (!draggingId || draggingId === mode.id) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverId(mode.id); }}
        onDrop={(event) => { event.preventDefault(); const source = draggingId ?? event.dataTransfer.getData("text/plain"); const rect = event.currentTarget.getBoundingClientRect(); reorder(source, mode.id, event.clientY > rect.top + rect.height / 2); }}
        onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}>
        <span role="cell" className="project-board-name">{editingId === mode.id ? <input autoFocus maxLength={200} value={editingTitle} aria-label={`${mode.title}の名前`} onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => rename(mode)} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); rename(mode); } else if (event.key === "Escape") { event.preventDefault(); renameCanceledRef.current = true; setEditingId(null); } }} /> : <button type="button" className="project-name-button mode-title-button" onClick={() => startRename(mode)}>{mode.title}</button>}</span>
        <span role="cell" className="project-board-actions"><button ref={(element) => { actionRefs.current[mode.id] = element; }} type="button" className="project-overflow" aria-label={`${mode.title}のメニュー`} aria-expanded={openMenuId === mode.id} disabled={pending} onClick={() => setOpenMenuId((current) => current === mode.id ? null : mode.id)}>…</button>
          {openMenuId === mode.id && <span className="project-overflow-menu" role="menu"><button type="button" role="menuitem" onClick={() => startRename(mode)}>名前変更</button></span>}</span>
      </div>)}
      {board.modes.length === 0 && !draft && <p className="muted project-empty">Modeはまだありません。</p>}
    </div>
    {helpOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}><div ref={modalRef} className="modal-dialog project-help-modal" role="dialog" aria-modal="true" aria-label="Mode設定ショートカット" tabIndex={-1}><h2>Mode設定ショートカット</h2><ul><li><kbd>J</kbd> / <kbd>↓</kbd> 次のMode</li><li><kbd>K</kbd> / <kbd>↑</kbd> 前のMode</li><li><kbd>?</kbd> ヘルプ</li><li><kbd>Esc</kbd> 閉じる・キャンセル</li></ul><button type="button" onClick={() => setHelpOpen(false)}>閉じる</button></div></div>}
  </section>;
}
