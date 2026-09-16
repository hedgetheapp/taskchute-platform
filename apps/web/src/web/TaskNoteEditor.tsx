import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ProjectPrimaryDocument,
  TaskPrimaryDocument,
  UpdateProjectPrimaryDocumentRequest,
  UpdateTaskPrimaryDocumentRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { formatJsonRequestSize, serializeJsonRequestBody } from "../shared/request-size";
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
  maximizedTaskNoteWindowGeometry,
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
  taskId?: string;
  documentId: string;
  taskTitle?: string;
  documentKind?: "task_primary" | "project_primary";
  projectId?: string;
  projectTitle?: string;
  initialGeometry?: TaskNoteWindowGeometry;
  zIndex?: number;
  focusRequest?: number;
  restoreRequest?: number;
  outsideClickRequest?: number;
  onActivate?: () => void;
  onClose: () => void;
  onUnauthorized: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onUnresolvedChange: (unresolved: boolean) => void;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
  authEpoch?: number;
  mutationsBlocked?: boolean;
  realtimeRefresh?: { token: number; scopes?: Array<{ kind: string; document_ids?: string[] }> };
}

type PrimaryDocument = TaskPrimaryDocument | ProjectPrimaryDocument;
type PrimaryUpdateRequest = UpdateTaskPrimaryDocumentRequest | UpdateProjectPrimaryDocumentRequest;

function isResolvedUpdate(request: PrimaryUpdateRequest, document: PrimaryDocument, kind: "task_primary" | "project_primary"): boolean {
  return document.document_id === request.document_id
    && document.kind === kind
    && document.revision === request.expected_revision + 1
    && document.markdown_body === request.markdown_body;
}

export function TaskNoteEditor({
  taskId = "", documentId, taskTitle = "Task Note", documentKind = "task_primary", projectId, projectTitle, initialGeometry, zIndex = 12, focusRequest = 0, restoreRequest = 0,
  outsideClickRequest = 0, onActivate, onClose, onUnauthorized, onDirtyChange, onUnresolvedChange, onRegisterFlush,
  authEpoch = 0, mutationsBlocked = false, realtimeRefresh,
}: TaskNoteEditorProps) {
  const isProjectPrimary = documentKind === "project_primary";
  const primaryId = isProjectPrimary ? projectId ?? taskId : taskId;
  const primaryTitle = isProjectPrimary ? projectTitle ?? "Project Note" : taskTitle;
  const primaryLabel = isProjectPrimary ? "Project Note" : "Task Note";
  const [document, setDocument] = useState<PrimaryDocument | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [baselineBody, setBaselineBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payloadWarning, setPayloadWarning] = useState<string | null>(null);
  const [unresolvedRequest, setUnresolvedRequest] = useState<PrimaryUpdateRequest | null>(null);
  const [preferredGeometry, setPreferredGeometry] = useState<TaskNoteWindowGeometry>(() => initialGeometry
    ?? readTaskNoteWindowGeometry(window.innerWidth, window.innerHeight));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [isMoving, setIsMoving] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const documentRef = useRef<PrimaryDocument | null>(null);
  const draftRef = useRef("");
  const baselineRef = useRef("");
  const unresolvedRef = useRef<PrimaryUpdateRequest | null>(null);
  const savingRef = useRef(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const preferredGeometryRef = useRef(preferredGeometry);
  const windowRef = useRef<HTMLElement | null>(null);
  const titleBarRef = useRef<HTMLElement | null>(null);
  const minimizedBarRef = useRef<HTMLDivElement | null>(null);
  const dragGestureRef = useRef<{ pointerId: number; startX: number; startY: number; startGeometry: TaskNoteWindowGeometry; minimized: boolean; moved: boolean } | null>(null);
  const suppressMinimizedClickRef = useRef(false);
  const resizeGestureRef = useRef<{ pointerId: number; startX: number; startY: number; startGeometry: TaskNoteWindowGeometry; direction: TaskNoteWindowResizeDirection } | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onUnresolvedChangeRef = useRef(onUnresolvedChange);
  const onRegisterFlushRef = useRef(onRegisterFlush);
  const handledOutsideClickRequestRef = useRef(0);
  const mutationsBlockedRef = useRef(false);
  const deferredRealtimeRefreshRef = useRef(false);
  // Guard canonical refetches that started before a newer local edit.
  const editGenerationRef = useRef(0);
  const canonicalLoadTokenRef = useRef(0);

  const dirty = draftBody !== baselineBody;
  const unresolved = unresolvedRequest !== null;
  documentRef.current = document;
  draftRef.current = draftBody;
  baselineRef.current = baselineBody;
  unresolvedRef.current = unresolvedRequest;
  savingRef.current = saving;
  preferredGeometryRef.current = preferredGeometry;
  onDirtyChangeRef.current = onDirtyChange;
  onUnresolvedChangeRef.current = onUnresolvedChange;
  onRegisterFlushRef.current = onRegisterFlush;
  mutationsBlockedRef.current = mutationsBlocked;

  const mobilePeek = isTaskNoteWindowMobile(viewportWidth);
  const renderedGeometry = !mobilePeek && isMaximized
    ? maximizedTaskNoteWindowGeometry(viewportWidth, viewportHeight)
    : clampTaskNoteWindowGeometry(preferredGeometry, viewportWidth, viewportHeight);
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
    if (mobilePeek || isMaximized || event.button !== 0 || isDragExcludedTarget(event.target)) return;
    event.preventDefault();
    suppressMinimizedClickRef.current = false;
    dragGestureRef.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      startGeometry: isMinimized ? { ...preferredGeometry } : renderedGeometry,
      minimized: isMinimized, moved: false,
    };
    setIsMoving(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleDragPointerMove(event: React.PointerEvent<HTMLElement>): void {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || isMaximized) return;
    event.preventDefault();
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) < 4) return;
    gesture.moved = true;
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
    suppressMinimizedClickRef.current = gesture.minimized && gesture.moved;
  }

  function handleMinimizedBarClick(event: React.MouseEvent<HTMLElement>): void {
    if (isDragExcludedTarget(event.target)) {
      suppressMinimizedClickRef.current = false;
      return;
    }
    if (suppressMinimizedClickRef.current) {
      suppressMinimizedClickRef.current = false;
      return;
    }
    restore();
  }

  function handleMinimizedBarKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (isDragExcludedTarget(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    restore();
  }

  function handleWindowKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (mobilePeek || isMaximized || !event.altKey || event.ctrlKey || event.metaKey) return;
    if (!(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")) return;
    event.preventDefault();
    const step = event.shiftKey ? 80 : 24;
    const deltaX = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const deltaY = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    applyGeometry(moveTaskNoteWindowGeometry(preferredGeometryRef.current, viewportWidth, viewportHeight, deltaX, deltaY), true);
  }

  function handleResizePointerDown(direction: TaskNoteWindowResizeDirection, event: React.PointerEvent<HTMLDivElement>): void {
    if (mobilePeek || isMaximized || event.button !== 0) return;
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
    if (!gesture || gesture.pointerId !== event.pointerId || isMaximized) return;
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
    if (mobilePeek || isMaximized) return;
    const next = resizeTaskNoteWindowByKey(preferredGeometryRef.current, viewportWidth, viewportHeight, direction, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    applyGeometry(next, true);
  }

  function minimize(options: { focusCompactControl?: boolean } = {}): void {
    const active = globalThis.document.activeElement;
    const focusInside = Boolean(windowRef.current?.contains(active));
    setIsMinimized(true);
    if (focusInside && options.focusCompactControl !== false) window.requestAnimationFrame(() => minimizedBarRef.current?.focus());
    if (focusInside && options.focusCompactControl === false && active instanceof HTMLElement) active.blur();
  }

  function restore(): void {
    setIsMinimized(false);
    window.requestAnimationFrame(() => titleBarRef.current?.focus());
  }

  useEffect(() => {
    if (restoreRequest === 0) return;
    setIsMinimized(false);
    window.requestAnimationFrame(() => titleBarRef.current?.focus());
  }, [restoreRequest]);

  useEffect(() => {
    if (focusRequest === 0) return;
    window.requestAnimationFrame(() => (isMinimized ? minimizedBarRef.current : titleBarRef.current)?.focus());
  }, [focusRequest, isMinimized]);

  useEffect(() => {
    if (outsideClickRequest === 0 || handledOutsideClickRequestRef.current === outsideClickRequest || mobilePeek) return;
    handledOutsideClickRequestRef.current = outsideClickRequest;
    if (isMinimized) return;
    minimize({ focusCompactControl: false });
  }, [outsideClickRequest, mobilePeek]);

  function toggleMaximized(): void {
    if (mobilePeek) return;
    setIsMaximized((current) => !current);
  }

  function renderWindowControlIcon(kind: "minimize" | "maximize" | "restore" | "close") {
    if (kind === "minimize") return <span aria-hidden="true" className="task-note-window-control-glyph">-</span>;
    if (kind === "close") return <span aria-hidden="true" className="task-note-window-control-glyph">×</span>;
    if (kind === "maximize") {
      return <svg aria-hidden="true" className="task-note-window-control-icon" viewBox="0 0 16 16">
        <rect x="3.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>;
    }
    return <svg aria-hidden="true" className="task-note-window-control-icon" viewBox="0 0 16 16">
      <rect x="5.5" y="2.5" width="7.5" height="7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="5.5" width="7.5" height="7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>;
  }

  useEffect(() => { onDirtyChangeRef.current(dirty); }, [dirty]);
  useEffect(() => { onUnresolvedChangeRef.current(unresolved); }, [unresolved]);

  const loadCanonical = useCallback(async (options: { protectLocalEdits?: boolean } = {}) => {
    const loadToken = ++canonicalLoadTokenRef.current;
    const editGeneration = editGenerationRef.current;
    setLoading(true);
    try {
      const canonical = isProjectPrimary
        ? await api.loadProjectPrimaryDocumentById(documentId)
        : await api.loadTaskPrimaryDocumentById(documentId);
      if (loadToken !== canonicalLoadTokenRef.current) return;
      if (options.protectLocalEdits && (editGenerationRef.current !== editGeneration || draftRef.current !== baselineRef.current)) {
        if (canonical.markdown_body !== baselineRef.current) {
          setError("Server側の変更を確認しました。ローカルの未保存内容は保持しています。");
        }
        return;
      }
      setDocument(canonical); documentRef.current = canonical;
      setDraftBody(canonical.markdown_body); draftRef.current = canonical.markdown_body;
      setBaselineBody(canonical.markdown_body); baselineRef.current = canonical.markdown_body;
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : `${primaryLabel}の読み込みに失敗しました`);
    } finally { if (loadToken === canonicalLoadTokenRef.current) setLoading(false); }
  }, [documentId, isProjectPrimary, onUnauthorized, primaryLabel]);

  useEffect(() => { void loadCanonical(); }, [loadCanonical]);

  useEffect(() => {
    if (authEpoch === 0) return;
    void (async () => {
      try {
        const loadToken = ++canonicalLoadTokenRef.current;
        const editGeneration = editGenerationRef.current;
        const canonical = isProjectPrimary
          ? await api.loadProjectPrimaryDocumentById(documentId)
          : await api.loadTaskPrimaryDocumentById(documentId);
        const localDraft = draftRef.current;
        const localDirty = localDraft !== baselineRef.current;
        if (loadToken !== canonicalLoadTokenRef.current) return;
        if (editGenerationRef.current !== editGeneration || localDirty) {
          if (canonical.markdown_body !== localDraft) {
            setError("再認証後にServer側の変更を確認しました。ローカルの未保存内容は保持しています。");
          }
        } else {
          documentRef.current = canonical;
          setDocument(canonical);
          baselineRef.current = canonical.markdown_body;
          setBaselineBody(canonical.markdown_body);
          draftRef.current = canonical.markdown_body;
          setDraftBody(canonical.markdown_body);
        }
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
        else setError(caught instanceof Error ? caught.message : `${primaryLabel}の再読み込みに失敗しました`);
      }
    })();
  }, [authEpoch, documentId, isProjectPrimary, onUnauthorized, primaryLabel]);

  useEffect(() => {
    const documentScope = realtimeRefresh?.scopes?.find((scope) => scope.kind === "documents");
    if (!realtimeRefresh?.token || !documentScope
      || (documentScope.document_ids && !documentScope.document_ids.includes(documentId))) return;
    if (dirty || unresolved || saving || mutationsBlocked) {
      deferredRealtimeRefreshRef.current = true;
      return;
    }
    deferredRealtimeRefreshRef.current = false;
    void loadCanonical({ protectLocalEdits: true });
  }, [dirty, loadCanonical, mutationsBlocked, realtimeRefresh?.token, saving, unresolved]);

  useEffect(() => {
    if (dirty || unresolved || saving || mutationsBlocked || !deferredRealtimeRefreshRef.current) return;
    deferredRealtimeRefreshRef.current = false;
    void loadCanonical({ protectLocalEdits: true });
  }, [dirty, loadCanonical, mutationsBlocked, saving, unresolved]);

  const applySaved = useCallback((saved: PrimaryDocument, request: PrimaryUpdateRequest) => {
    const bodyStillSent = draftRef.current === request.markdown_body;
    setDocument(saved); documentRef.current = saved;
    setBaselineBody(saved.markdown_body); baselineRef.current = saved.markdown_body;
    if (bodyStillSent) { setDraftBody(saved.markdown_body); draftRef.current = saved.markdown_body; }
  }, []);

  const send = useCallback(async (request: PrimaryUpdateRequest): Promise<boolean> => {
    if (mutationsBlockedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    const promise = (async () => {
      setSaving(true); savingRef.current = true; setError(null); setNotice(null);
      try {
        const result = isProjectPrimary
          ? await api.updateProjectPrimaryDocument(request as UpdateProjectPrimaryDocumentRequest)
          : await api.updateTaskPrimaryDocument(request as UpdateTaskPrimaryDocumentRequest);
        applySaved(result.document, request);
        setUnresolvedRequest(null); unresolvedRef.current = null; setNotice(null);
        return true;
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) { onUnauthorized(); return false; }
        if (caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous") {
          setUnresolvedRequest(request); unresolvedRef.current = request;
          setError("保存結果が未確定です。元の操作をそのまま再試行してください。");
          try {
            const canonical = isProjectPrimary
              ? await api.loadProjectPrimaryDocumentById(request.document_id)
              : await api.loadTaskPrimaryDocumentById(request.document_id);
            if (isResolvedUpdate(request, canonical, documentKind)) {
              applySaved(canonical, request); setUnresolvedRequest(null); unresolvedRef.current = null;
              setError(null); setNotice("保存結果を確認しました。"); return true;
            }
          } catch (reconcileError) {
            if (reconcileError instanceof ApiClientError && reconcileError.status === 401) onUnauthorized();
          }
          return false;
        }
        setError(caught instanceof Error ? caught.message : `${primaryLabel}の保存に失敗しました`);
        return false;
      } finally {
        setSaving(false); savingRef.current = false; inFlightRef.current = null;
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [applySaved, documentKind, isProjectPrimary, onUnauthorized, primaryLabel]);

  const save = useCallback(async (): Promise<boolean> => {
    if (mutationsBlockedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    if (unresolvedRef.current) return send(unresolvedRef.current);
    const current = documentRef.current;
    if (!current || draftRef.current === baselineRef.current) return true;
    const request: PrimaryUpdateRequest = isProjectPrimary
      ? { operation_id: uuidv7(), project_id: primaryId, document_id: documentId,
        expected_revision: current.revision, markdown_body: draftRef.current }
      : { operation_id: uuidv7(), task_id: primaryId, document_id: documentId,
        expected_revision: current.revision, markdown_body: draftRef.current };
    const serialized = serializeJsonRequestBody(request);
    if (serialized.overLimit) {
      setPayloadWarning(null);
      setError(`ノートの保存データが大きすぎます（${formatJsonRequestSize(serialized.byteLength)}）。内容を短くしてください。`);
      return false;
    }
    setPayloadWarning(serialized.warning ? `保存データが上限に近づいています（${formatJsonRequestSize(serialized.byteLength)}）。` : null);
    return send(request);
  }, [documentId, isProjectPrimary, primaryId, send]);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<boolean> => {
    if (unresolvedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    return saveRef.current();
  }, []);
  flushRef.current = flush;

  useEffect(() => {
    onRegisterFlushRef.current(() => flushRef.current());
    return () => onRegisterFlushRef.current(null);
  }, []);

  useEffect(() => () => {
    dragGestureRef.current = null;
    resizeGestureRef.current = null;
  }, []);

  useEffect(() => {
    if (!dirty || loading || unresolved || saving || mutationsBlocked || !document) return;
    const timer = window.setTimeout(() => { void saveRef.current(); }, TASK_NOTE_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, document, loading, mutationsBlocked, saving, unresolved]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving && !unresolved) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving, unresolved, onActivate]);

  useEffect(() => {
    // App owns outside-click behavior when multiple Task Note windows are
    // mounted. Keep the single-editor fallback for direct consumers/tests.
    if (onActivate || mobilePeek || isMinimized) return;
    const onPointerDown = (event: PointerEvent) => {
      if (windowRef.current?.contains(event.target as Node | null)) return;
      minimize({ focusCompactControl: false });
    };
    globalThis.document.addEventListener("pointerdown", onPointerDown, true);
    return () => globalThis.document.removeEventListener("pointerdown", onPointerDown, true);
  }, [isMinimized, mobilePeek, onActivate]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey) && !event.repeat) {
      event.preventDefault(); void saveRef.current();
    }
  }

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
    aria-label={`${primaryTitle}のノート`}
    data-primary-document-kind={documentKind}
    data-task-note-task-id={taskId}
    data-task-note-document-id={documentId}
    data-task-note-editor={isMinimized ? undefined : "true"}
    data-task-note-minimized={isMinimized ? "true" : undefined}
    data-task-note-peek-width={mobilePeek ? "full" : renderedGeometry.width}
    data-task-note-window-state={isMaximized && !mobilePeek ? "maximized" : "windowed"}
    data-task-note-window-geometry={mobilePeek ? "mobile" : `${renderedGeometry.x},${renderedGeometry.y},${renderedGeometry.width},${renderedGeometry.height}`}
    onPointerDownCapture={onActivate}
    onFocusCapture={onActivate}
    style={mobilePeek ? { zIndex } : isMinimized
      ? { zIndex, left: `${minimizedPosition.x}px`, top: `${minimizedPosition.y}px`, width: `${compactWidth}px`, height: `${TASK_NOTE_WINDOW_COMPACT_HEIGHT}px` }
      : { zIndex, left: `${renderedGeometry.x}px`, top: `${renderedGeometry.y}px`, width: `${renderedGeometry.width}px`, height: `${renderedGeometry.height}px` }}
  >
    <div className="task-note-peek-expanded" hidden={isMinimized}>
      {!mobilePeek && !isMaximized && resizeDirections.map(renderResizeHandle)}
      <header ref={titleBarRef} className="task-note-peek-header" tabIndex={0} aria-label="ノートウィンドウを移動"
        onKeyDown={handleWindowKeyDown} onPointerDown={handleDragPointerDown} onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerEnd} onPointerCancel={handleDragPointerEnd}>
        <div><p className="eyebrow">{primaryLabel}</p><h2>{primaryTitle}</h2></div>
        <div className="task-note-peek-actions">
          <button type="button" className="task-note-copy-link" aria-label="ノートへのリンクをコピー" title="ノートへのリンクをコピー" onClick={() => {
          const write = navigator.clipboard?.writeText(`${window.location.origin}${documentPermalink(documentId)}`);
          if (!write) {
            setNotice("リンクのコピーに失敗しました。");
            return;
          }
          void write.then(() => setNotice("リンクをコピーしました。"))
            .catch(() => setNotice("リンクのコピーに失敗しました。"));
          }}>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7.25 6.25V4.75A1.5 1.5 0 0 1 8.75 3.25h6.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-1.5M11.25 6.75h-6.5a1.5 1.5 0 0 0-1.5 1.5v8.5a1.5 1.5 0 0 0 1.5 1.5h6.5a1.5 1.5 0 0 0 1.5-1.5v-8.5a1.5 1.5 0 0 0-1.5-1.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="task-note-window-controls" aria-label="ノートウィンドウ操作">
            <button type="button" className="task-note-window-control" aria-label="ノートを最小化" title="ノートを最小化" onClick={() => minimize()}>
              {renderWindowControlIcon("minimize")}
            </button>
            {!mobilePeek && <button type="button" className="task-note-window-control" aria-label={isMaximized ? "ノートを元のサイズに戻す" : "ノートを最大化"} title={isMaximized ? "ノートを元のサイズに戻す" : "ノートを最大化"} onClick={toggleMaximized}>
              {renderWindowControlIcon(isMaximized ? "restore" : "maximize")}
            </button>}
            <button type="button" className="task-note-window-control is-close" aria-label="ノートを閉じる" title="ノートを閉じる" onClick={onClose}>
              {renderWindowControlIcon("close")}
            </button>
          </div>
        </div>
      </header>
      {loading ? <p className="muted">読み込み中…</p> : <div className="task-note-peek-content">
        <NoteMarkdownEditor
          value={draftBody}
          disabled={unresolved || mutationsBlocked}
          onChange={(value) => { if (mutationsBlocked || unresolved) return; editGenerationRef.current += 1; setDraftBody(value); draftRef.current = value; setNotice(null); }}
          onKeyDown={handleKeyDown}
          className="task-note-markdown-field"
        />
        {payloadWarning && <p className="notes-payload-warning" role="status">{payloadWarning}</p>}
        {unresolved && <p className="notes-save-status" role="status" aria-live="polite"><span>保存結果未確定</span>
          <button type="button" className="notes-inline-retry" aria-label="同じ内容で再試行" disabled={saving} onClick={() => void saveRef.current()}>再試行</button>
        </p>}
        {notice && <p className="success" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>}
    </div>
    <div ref={minimizedBarRef} className="task-note-peek-minimized-bar" hidden={!isMinimized} tabIndex={0} aria-label={`${primaryTitle}のノートを開く`}
      onKeyDown={(event) => { handleMinimizedBarKeyDown(event); handleWindowKeyDown(event); }} onPointerDown={handleDragPointerDown} onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerEnd} onPointerCancel={handleDragPointerEnd} onClick={handleMinimizedBarClick}>
      <div className="task-note-peek-minimized-main">
        <NoteIcon />
        <span className="task-note-peek-minimized-title" title={primaryTitle}>{primaryTitle}</span>
      </div>
      <div className="task-note-peek-actions">
        <button type="button" className="secondary" aria-label="ノートを閉じる" title="ノートを閉じる" onClick={onClose}>×</button>
      </div>
    </div>
  </aside>;
}
