import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskPrimaryDocument, UpdateTaskPrimaryDocumentRequest } from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";
import { NoteMarkdownEditor } from "./NoteMarkdownEditor";
import { documentPermalink } from "./task-note-open-mode";
import {
  clampTaskNotePeekWidth,
  isTaskNotePeekMobile,
  maxTaskNotePeekWidth,
  persistTaskNotePeekWidth,
  readTaskNotePeekWidth,
  resizeTaskNotePeekWidth,
} from "./task-note-peek-width";

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
  const [preferredPeekWidth, setPreferredPeekWidth] = useState(() => readTaskNotePeekWidth());
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [isResizing, setIsResizing] = useState(false);
  const documentRef = useRef<TaskPrimaryDocument | null>(null);
  const draftRef = useRef("");
  const baselineRef = useRef("");
  const unresolvedRef = useRef<UpdateTaskPrimaryDocumentRequest | null>(null);
  const savingRef = useRef(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const preferredPeekWidthRef = useRef(preferredPeekWidth);
  const resizeGestureRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const dirty = draftBody !== baselineBody;
  const unresolved = unresolvedRequest !== null;
  documentRef.current = document;
  draftRef.current = draftBody;
  baselineRef.current = baselineBody;
  unresolvedRef.current = unresolvedRequest;
  savingRef.current = saving;
  preferredPeekWidthRef.current = preferredPeekWidth;

  const mobilePeek = isTaskNotePeekMobile(viewportWidth);
  const renderedPeekWidth = clampTaskNotePeekWidth(preferredPeekWidth, viewportWidth);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const applyPeekWidth = useCallback((width: number, persist = false) => {
    preferredPeekWidthRef.current = width;
    setPreferredPeekWidth(width);
    if (persist) persistTaskNotePeekWidth(width);
  }, []);

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (mobilePeek || event.button !== 0) return;
    event.preventDefault();
    resizeGestureRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: renderedPeekWidth };
    setIsResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    applyPeekWidth(clampTaskNotePeekWidth(gesture.startWidth + gesture.startX - event.clientX, viewportWidth));
  }

  function handleResizePointerEnd(event: React.PointerEvent<HTMLDivElement>): void {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    resizeGestureRef.current = null;
    setIsResizing(false);
    persistTaskNotePeekWidth(preferredPeekWidthRef.current);
  }

  function handleResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const next = resizeTaskNotePeekWidth(renderedPeekWidth, viewportWidth, event.key, event.shiftKey);
    if (next === null || mobilePeek) return;
    event.preventDefault();
    applyPeekWidth(next, true);
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

  return <aside
    className={`task-note-peek${isResizing ? " is-resizing" : ""}`}
    aria-label={`${taskTitle}のノート`}
    data-task-note-editor="true"
    data-task-note-peek-width={mobilePeek ? "full" : renderedPeekWidth}
    style={mobilePeek ? undefined : { width: `${renderedPeekWidth}px` }}
  >
    {!mobilePeek && <div
      className="task-note-peek-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="ノートパネルの幅を変更"
      aria-valuemin={360}
      aria-valuemax={maxTaskNotePeekWidth(viewportWidth)}
      aria-valuenow={renderedPeekWidth}
      tabIndex={0}
      onKeyDown={handleResizeKeyDown}
      onPointerDown={handleResizePointerDown}
      onPointerMove={handleResizePointerMove}
      onPointerUp={handleResizePointerEnd}
      onPointerCancel={handleResizePointerEnd}
    />}
    <header className="task-note-peek-header">
      <div><p className="eyebrow">Task Note</p><h2>{taskTitle}</h2></div>
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
        <button type="button" className="secondary" aria-label="Task Noteを閉じる" onClick={onClose}>閉じる</button>
      </div>
    </header>
    {loading ? <p className="muted">読み込み中…</p> : <div className="task-note-peek-content">
      <p className="task-note-authority">TaskタイトルはDayのTask情報を表示しています。</p>
      <NoteMarkdownEditor
        value={draftBody}
        disabled={unresolved}
        onChange={(value) => { setDraftBody(value); draftRef.current = value; setNotice(null); }}
        onKeyDown={handleKeyDown}
        className="task-note-markdown-field"
      />
      <div className="task-note-peek-footer"><span className="notes-save-status" role="status">{unresolved ? "保存結果未確定" : saving ? "保存中…" : dirty ? "未保存" : "保存済み"}</span><button type="button" disabled={saving || unresolved || !dirty} onClick={() => void saveRef.current()}>保存</button></div>
      {unresolved && <button type="button" className="secondary" disabled={saving} onClick={() => void saveRef.current()}>同じ内容で再試行</button>}
      {notice && <p className="success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>}
  </aside>;
}
