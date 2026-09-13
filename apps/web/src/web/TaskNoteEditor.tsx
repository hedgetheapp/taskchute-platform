import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskPrimaryDocument, UpdateTaskPrimaryDocumentRequest } from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";
import { NoteMarkdownEditor } from "./NoteMarkdownEditor";
import { NoteIcon } from "./NoteIcon";
import { documentPermalink } from "./task-note-open-mode";
import {
  TASK_NOTE_WINDOW_COMPACT_HEIGHT,
  TASK_NOTE_WINDOW_COMPACT_WIDTH,
  TASK_NOTE_WINDOW_MIN_HEIGHT,
  TASK_NOTE_WINDOW_MIN_WIDTH,
  clampTaskNoteMinimizedPosition,
  clampTaskNoteWindowGeometry,
  isTaskNoteWindowMobile,
  moveTaskNoteMinimizedPosition,
  moveTaskNoteWindowGeometry,
  persistTaskNoteWindowGeometry,
  readTaskNoteWindowGeometry,
  resizeTaskNoteWindowByKey,
  resizeTaskNoteWindowGeometry,
  type TaskNoteWindowGeometry,
  type TaskNoteWindowResizeDirection,
} from "./task-note-window-geometry";

const TASK_NOTE_AUTOSAVE_MS = 1000;

export interface TaskNoteEditorProps {
  taskId: string;
  documentId: string;
  taskTitle: string;
  onClose: () => void;
  onUnauthorized: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onUnresolvedChange: (unresolved: boolean) => void;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
  onOpenNewTab: () => void;
}

function isResolvedUpdate(request: UpdateTaskPrimaryDocumentRequest, document: TaskPrimaryDocument): boolean {
  return document.document_id === request.document_id
    && document.kind === "task_primary"
    && document.revision === request.expected_revision + 1
    && document.markdown_body === request.markdown_body;
}

export function TaskNoteEditor({
  taskId, documentId, taskTitle, onClose, onUnauthorized, onDirtyChange, onUnresolvedChange, onRegisterFlush, onOpenNewTab,
}: TaskNoteEditorProps) {
  const [document, setDocument] = useState<TaskPrimaryDocument | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [baselineBody, setBaselineBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unresolvedRequest, setUnresolvedRequest] = useState<UpdateTaskPrimaryDocumentRequest | null>(null);
  const [preferredGeometry, setPreferredGeometry] = useState<TaskNoteWindowGeometry>(() => readTaskNoteWindowGeometry(window.innerWidth, window.innerHeight));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [isMoving, setIsMoving] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const documentRef = useRef<TaskPrimaryDocument | null>(null);
  const draftRef = useRef("");
  const baselineRef = useRef("");
  const unresolvedRef = useRef<UpdateTaskPrimaryDocumentRequest | null>(null);
  const savingRef = useRef(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const preferredGeometryRef = useRef(preferredGeometry);
  const windowRef = useRef<HTMLElement | null>(null);
  const titleBarRef = useRef<HTMLElement | null>(null);
  const minimizedRestoreRef = useRef<HTMLButtonElement | null>(null);
  const dragGestureRef = useRef<{ pointerId: number; startX: number; startY: number; startGeometry: TaskNoteWindowGeometry; minimized: boolean } | null>(null);
  const resizeGestureRef = useRef<{ pointerId: number; startX: number; startY: number; startGeometry: TaskNoteWindowGeometry; direction: TaskNoteWindowResizeDirection } | null>(null);

  const dirty = draftBody !== baselineBody;
  const unresolved = unresolvedRequest !== null;
  documentRef.current = document;
  draftRef.current = draftBody;
  baselineRef.current = baselineBody;
  unresolvedRef.current = unresolvedRequest;
  savingRef.current = saving;
  preferredGeometryRef.current = preferredGeometry;

  const mobilePeek = isTaskNoteWindowMobile(viewportWidth);
  const renderedGeometry = clampTaskNoteWindowGeometry(preferredGeometry, viewportWidth, viewportHeight);
  const minimizedPosition = clampTaskNoteMinimizedPosition(preferredGeometry, viewportWidth, viewportHeight);
  const compactWidth = Math.min(TASK_NOTE_WINDOW_COMPACT_WIDTH, Math.max(1, viewportWidth - 32));

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const applyGeometry = useCallback((geometry: TaskNoteWindowGeometry, persist = false) => {
    preferredGeometryRef.current = geometry;
    setPreferredGeometry(geometry);
    if (persist) persistTaskNoteWindowGeometry(geometry);
  }, []);

  function isDragExcludedTarget(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [role='button'], [data-task-note-no-drag]"));
  }

  function handleDragPointerDown(event: React.PointerEvent<HTMLElement>): void {
    if (mobilePeek || event.button !== 0 || isDragExcludedTarget(event.target)) return;
    event.preventDefault();
    dragGestureRef.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      startGeometry: isMinimized ? { ...preferredGeometry } : renderedGeometry,
      minimized: isMinimized,
    };
    setIsMoving(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleDragPointerMove(event: React.PointerEvent<HTMLElement>): void {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.minimized) {
      const position = moveTaskNoteMinimizedPosition(gesture.startGeometry, viewportWidth, viewportHeight, deltaX, deltaY, compactWidth, TASK_NOTE_WINDOW_COMPACT_HEIGHT);
      applyGeometry({ ...preferredGeometryRef.current, ...position });
    } else {
      applyGeometry(moveTaskNoteWindowGeometry(gesture.startGeometry, viewportWidth, viewportHeight, deltaX, deltaY));
    }
  }

  function handleDragPointerEnd(event: React.PointerEvent<HTMLElement>): void {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragGestureRef.current = null;
    setIsMoving(false);
    persistTaskNoteWindowGeometry(preferredGeometryRef.current);
  }

  function handleWindowKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (mobilePeek || !event.altKey || event.ctrlKey || event.metaKey) return;
    if (!(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")) return;
    event.preventDefault();
    const step = event.shiftKey ? 80 : 24;
    const deltaX = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const deltaY = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    applyGeometry(moveTaskNoteWindowGeometry(preferredGeometryRef.current, viewportWidth, viewportHeight, deltaX, deltaY), true);
  }

  function handleResizePointerDown(direction: TaskNoteWindowResizeDirection, event: React.PointerEvent<HTMLDivElement>): void {
    if (mobilePeek || event.button !== 0) return;
    event.preventDefault();
    resizeGestureRef.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      startGeometry: renderedGeometry, direction,
    };
    setIsResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    applyGeometry(resizeTaskNoteWindowGeometry(gesture.startGeometry, viewportWidth, viewportHeight, gesture.direction,
      event.clientX - gesture.startX, event.clientY - gesture.startY));
  }

  function handleResizePointerEnd(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    resizeGestureRef.current = null;
    setIsResizing(false);
    persistTaskNoteWindowGeometry(preferredGeometryRef.current);
  }

  function handleResizeKeyDown(direction: TaskNoteWindowResizeDirection, event: React.KeyboardEvent<HTMLDivElement>): void {
    if (mobilePeek) return;
    const next = resizeTaskNoteWindowByKey(preferredGeometryRef.current, viewportWidth, viewportHeight, direction, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    applyGeometry(next, true);
  }

  function minimize(): void {
    const active = globalThis.document.activeElement;
    const focusInside = Boolean(windowRef.current?.contains(active));
    setIsMinimized(true);
    if (focusInside) window.requestAnimationFrame(() => minimizedRestoreRef.current?.focus());
  }

  function restore(): void {
    setIsMinimized(false);
    window.requestAnimationFrame(() => titleBarRef.current?.focus());
  }

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onUnresolvedChange(unresolved); }, [onUnresolvedChange, unresolved]);

  const loadCanonical = useCallback(async () => {
    setLoading(true);
    try {
      const canonical = await api.loadTaskPrimaryDocumentById(documentId);
      setDocument(canonical); documentRef.current = canonical;
      setDraftBody(canonical.markdown_body); draftRef.current = canonical.markdown_body;
      setBaselineBody(canonical.markdown_body); baselineRef.current = canonical.markdown_body;
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : "Task Noteの読み込みに失敗しました");
    } finally { setLoading(false); }
  }, [documentId, onUnauthorized]);

  useEffect(() => { void loadCanonical(); }, [loadCanonical]);

  const applySaved = useCallback((saved: TaskPrimaryDocument, request: UpdateTaskPrimaryDocumentRequest) => {
    const bodyStillSent = draftRef.current === request.markdown_body;
    setDocument(saved); documentRef.current = saved;
    setBaselineBody(saved.markdown_body); baselineRef.current = saved.markdown_body;
    if (bodyStillSent) { setDraftBody(saved.markdown_body); draftRef.current = saved.markdown_body; }
  }, []);

  const send = useCallback(async (request: UpdateTaskPrimaryDocumentRequest): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;
    const promise = (async () => {
      setSaving(true); savingRef.current = true; setError(null); setNotice(null);
      try {
        const result = await api.updateTaskPrimaryDocument(request);
        applySaved(result.document, request);
        setUnresolvedRequest(null); unresolvedRef.current = null; setNotice("保存しました。");
        return true;
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) { onUnauthorized(); return false; }
        if (caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous") {
          setUnresolvedRequest(request); unresolvedRef.current = request;
          setError("保存結果が未確定です。元の操作をそのまま再試行してください。");
          try {
            const canonical = await api.loadTaskPrimaryDocumentById(request.document_id);
            if (isResolvedUpdate(request, canonical)) {
              applySaved(canonical, request); setUnresolvedRequest(null); unresolvedRef.current = null;
              setError(null); setNotice("保存結果を確認しました。"); return true;
            }
          } catch (reconcileError) {
            if (reconcileError instanceof ApiClientError && reconcileError.status === 401) onUnauthorized();
          }
          return false;
        }
        setError(caught instanceof Error ? caught.message : "Task Noteの保存に失敗しました");
        return false;
      } finally {
        setSaving(false); savingRef.current = false; inFlightRef.current = null;
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [applySaved, onUnauthorized]);

  const save = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (unresolvedRef.current) return send(unresolvedRef.current);
    const current = documentRef.current;
    if (!current || draftRef.current === baselineRef.current) return true;
    const request: UpdateTaskPrimaryDocumentRequest = {
      operation_id: uuidv7(), task_id: taskId, document_id: documentId,
      expected_revision: current.revision, markdown_body: draftRef.current,
    };
    return send(request);
  }, [documentId, send, taskId]);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<boolean> => {
    if (unresolvedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    return saveRef.current();
  }, []);
  flushRef.current = flush;

  useEffect(() => {
    onRegisterFlush(() => flushRef.current());
    return () => onRegisterFlush(null);
  }, [onRegisterFlush]);

  useEffect(() => () => {
    dragGestureRef.current = null;
    resizeGestureRef.current = null;
  }, []);

  useEffect(() => {
    if (!dirty || loading || unresolved || saving || !document) return;
    const timer = window.setTimeout(() => { void saveRef.current(); }, TASK_NOTE_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, document, loading, saving, unresolved]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving && !unresolved) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving, unresolved]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey) && !event.repeat) {
      event.preventDefault(); void saveRef.current();
    }
  }

  const saveStatus = unresolved ? "保存結果未確定" : saving ? "保存中…" : dirty ? "未保存" : "保存済み";
  const resizeDirections: TaskNoteWindowResizeDirection[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const resizeLabels: Record<TaskNoteWindowResizeDirection, string> = {
    n: "上端でノートウィンドウの高さを変更", s: "下端でノートウィンドウの高さを変更",
    e: "右端でノートウィンドウの幅を変更", w: "左端でノートウィンドウの幅を変更",
    ne: "右上隅でノートウィンドウのサイズを変更", nw: "左上隅でノートウィンドウのサイズを変更",
    se: "右下隅でノートウィンドウのサイズを変更", sw: "左下隅でノートウィンドウのサイズを変更",
  };
  const renderResizeHandle = (direction: TaskNoteWindowResizeDirection) => {
    const edge = direction.length === 1;
    return <div key={direction} className={`task-note-window-resize-handle is-${direction}`} role={edge ? "separator" : undefined}
      aria-hidden={edge ? undefined : true} aria-orientation={edge ? (direction === "n" || direction === "s" ? "horizontal" : "vertical") : undefined}
      aria-label={edge ? resizeLabels[direction] : undefined}
      aria-valuemin={edge ? (direction === "n" || direction === "s" ? TASK_NOTE_WINDOW_MIN_HEIGHT : TASK_NOTE_WINDOW_MIN_WIDTH) : undefined}
      aria-valuemax={edge ? (direction === "n" || direction === "s" ? Math.max(TASK_NOTE_WINDOW_MIN_HEIGHT, viewportHeight - 32) : Math.max(TASK_NOTE_WINDOW_MIN_WIDTH, viewportWidth - 32)) : undefined}
      aria-valuenow={edge ? (direction === "n" || direction === "s" ? renderedGeometry.height : renderedGeometry.width) : undefined}
      tabIndex={edge ? 0 : undefined}
      onKeyDown={edge ? (event) => handleResizeKeyDown(direction, event) : undefined}
      onPointerDown={(event) => handleResizePointerDown(direction, event)}
      onPointerMove={handleResizePointerMove}
      onPointerUp={handleResizePointerEnd}
      onPointerCancel={handleResizePointerEnd} />;
  };

  return <aside
    ref={windowRef}
    className={`task-note-peek${isMoving ? " is-moving" : ""}${isResizing ? " is-resizing" : ""}${isMinimized ? " is-minimized" : ""}`}
    aria-label={`${taskTitle}のノート`}
    data-task-note-editor={isMinimized ? undefined : "true"}
    data-task-note-minimized={isMinimized ? "true" : undefined}
    data-task-note-peek-width={mobilePeek ? "full" : renderedGeometry.width}
    data-task-note-window-geometry={mobilePeek ? "mobile" : `${renderedGeometry.x},${renderedGeometry.y},${renderedGeometry.width},${renderedGeometry.height}`}
    style={mobilePeek ? undefined : isMinimized
      ? { left: `${minimizedPosition.x}px`, top: `${minimizedPosition.y}px`, width: `${compactWidth}px`, height: `${TASK_NOTE_WINDOW_COMPACT_HEIGHT}px` }
      : { left: `${renderedGeometry.x}px`, top: `${renderedGeometry.y}px`, width: `${renderedGeometry.width}px`, height: `${renderedGeometry.height}px` }}
  >
    <div className="task-note-peek-expanded" hidden={isMinimized}>
      {!mobilePeek && resizeDirections.map(renderResizeHandle)}
      <header ref={titleBarRef} className="task-note-peek-header" tabIndex={0} aria-label="ノートウィンドウを移動"
        onKeyDown={handleWindowKeyDown} onPointerDown={handleDragPointerDown} onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerEnd} onPointerCancel={handleDragPointerEnd}>
        <div><p className="eyebrow">Task Note</p><h2>{taskTitle}</h2><span className="task-note-window-status">{saveStatus}</span></div>
        <div className="task-note-peek-actions">
          <button type="button" className="secondary" onClick={() => {
          const write = navigator.clipboard?.writeText(`${window.location.origin}${documentPermalink(documentId)}`);
          if (!write) {
            setNotice("リンクのコピーに失敗しました。");
            return;
          }
          void write.then(() => setNotice("リンクをコピーしました。"))
            .catch(() => setNotice("リンクのコピーに失敗しました。"));
          }}>リンクをコピー</button>
          <button type="button" className="secondary" onClick={onOpenNewTab}>新しいタブ</button>
          <button type="button" className="secondary" aria-label="ノートを最小化" onClick={minimize}>—</button>
          <button type="button" className="secondary" aria-label="Task Noteを閉じる" onClick={onClose}>閉じる</button>
        </div>
      </header>
      {loading ? <p className="muted">読み込み中…</p> : <div className="task-note-peek-content">
        <p className="task-note-authority">現在のTaskタイトルを表示しています。</p>
        <NoteMarkdownEditor
          value={draftBody}
          disabled={unresolved}
          onChange={(value) => { setDraftBody(value); draftRef.current = value; setNotice(null); }}
          onKeyDown={handleKeyDown}
          className="task-note-markdown-field"
        />
        <div className="task-note-peek-footer"><span className="notes-save-status" role="status">{saveStatus}</span><button type="button" disabled={saving || unresolved || !dirty} onClick={() => void saveRef.current()}>保存</button></div>
        {unresolved && <button type="button" className="secondary" disabled={saving} onClick={() => void saveRef.current()}>同じ内容で再試行</button>}
        {notice && <p className="success" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>}
    </div>
    <div className="task-note-peek-minimized-bar" hidden={!isMinimized} tabIndex={0} aria-label="最小化したノートを移動"
      onKeyDown={handleWindowKeyDown} onPointerDown={handleDragPointerDown} onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerEnd} onPointerCancel={handleDragPointerEnd}>
      <NoteIcon /><strong>{taskTitle}</strong><span className="task-note-window-status">{saveStatus}</span>
      <div className="task-note-peek-actions">
        <button ref={minimizedRestoreRef} type="button" className="secondary" aria-label="ノートを元のサイズに戻す" onClick={restore}>元に戻す</button>
        <button type="button" className="secondary" aria-label="Task Noteを閉じる" onClick={onClose}>閉じる</button>
      </div>
    </div>
  </aside>;
}
