import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateStandaloneDocumentRequest,
  DeleteStandaloneDocumentRequest,
  SetStandaloneDocumentArchivedRequest,
  StandaloneDocument,
  StandaloneDocumentSummary,
  UpdateDocumentRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";

export const NOTE_AUTOSAVE_DEBOUNCE_MS = 1000;
type DocumentRequest = CreateStandaloneDocumentRequest | UpdateDocumentRequest;

export interface NotesBoardProps {
  onUnauthorized: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onUnresolvedChange?: (unresolved: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<boolean>) | null) => void;
}

function isUpdateRequest(request: DocumentRequest): request is UpdateDocumentRequest {
  return "expected_revision" in request;
}

function documentSummaryTitle(document: StandaloneDocumentSummary): string {
  return document.title || "（無題）";
}

function isAmbiguousResolution(request: DocumentRequest, canonical: StandaloneDocument): boolean {
  if (canonical.document_id !== request.document_id || canonical.kind !== "standalone") return false;
  if (canonical.title !== request.title || canonical.markdown_body !== request.markdown_body) return false;
  return isUpdateRequest(request) ? canonical.revision === request.expected_revision + 1 : canonical.revision === 0;
}

export function NotesBoard({ onUnauthorized, onDirtyChange, onUnresolvedChange, onSavingChange, onRegisterFlush }: NotesBoardProps) {
  const [documents, setDocuments] = useState<StandaloneDocumentSummary[]>([]);
  const [document, setDocument] = useState<StandaloneDocument | null>(null);
  const [mode, setMode] = useState<"empty" | "new" | "existing">("empty");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [baselineTitle, setBaselineTitle] = useState("");
  const [baselineBody, setBaselineBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inFlightRequest, setInFlightRequest] = useState<DocumentRequest | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [latestCanonical, setLatestCanonical] = useState<StandaloneDocument | null>(null);
  const [retryRequest, setRetryRequest] = useState<DocumentRequest | null>(null);
  const [ambiguousRequest, setAmbiguousRequest] = useState<DocumentRequest | null>(null);

  const documentRef = useRef(document);
  const modeRef = useRef(mode);
  const selectedIdRef = useRef(selectedId);
  const draftRef = useRef({ title: draftTitle, body: draftBody });
  const baselineRef = useRef({ title: baselineTitle, body: baselineBody });
  const retryRequestRef = useRef<DocumentRequest | null>(retryRequest);
  const ambiguousRequestRef = useRef<DocumentRequest | null>(ambiguousRequest);
  const savingRef = useRef(saving);
  const showArchivedRef = useRef(showArchived);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const saveActionRef = useRef<() => Promise<boolean>>(async () => false);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const debounceRef = useRef<number | null>(null);

  documentRef.current = document;
  modeRef.current = mode;
  selectedIdRef.current = selectedId;
  draftRef.current = { title: draftTitle, body: draftBody };
  baselineRef.current = { title: baselineTitle, body: baselineBody };
  retryRequestRef.current = retryRequest;
  ambiguousRequestRef.current = ambiguousRequest;
  savingRef.current = saving;
  showArchivedRef.current = showArchived;

  const dirty = draftTitle !== baselineTitle || draftBody !== baselineBody;
  const unresolved = ambiguousRequest !== null;
  const followUpPending = inFlightRequest !== null
    && (draftTitle.trim() !== inFlightRequest.title || draftBody !== inFlightRequest.markdown_body);
  const pendingSaveCount = unresolved ? 0 : inFlightRequest ? 1 + (followUpPending ? 1 : 0) : dirty ? 1 : 0;

  function currentDirty(): boolean {
    return draftRef.current.title !== baselineRef.current.title || draftRef.current.body !== baselineRef.current.body;
  }

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onUnresolvedChange?.(unresolved); }, [onUnresolvedChange, unresolved]);
  useEffect(() => { onSavingChange?.(saving); }, [onSavingChange, saving]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving && !unresolved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving, unresolved]);

  const handleUnauthorized = useCallback(() => onUnauthorized(), [onUnauthorized]);

  const refreshList = useCallback(async (archived = showArchivedRef.current): Promise<StandaloneDocumentSummary[] | null> => {
    try {
      const projection = await api.loadDocuments({ archived });
      setDocuments(projection.documents);
      return projection.documents;
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) handleUnauthorized();
      else setError(caught instanceof Error ? caught.message : "ノート一覧の読み込みに失敗しました");
      return null;
    }
  }, [handleUnauthorized]);

  const setEditorFromCanonical = useCallback((loaded: StandaloneDocument) => {
    documentRef.current = loaded;
    modeRef.current = "existing";
    selectedIdRef.current = loaded.document_id;
    draftRef.current = { title: loaded.title, body: loaded.markdown_body };
    baselineRef.current = { title: loaded.title, body: loaded.markdown_body };
    setDocument(loaded); setMode("existing"); setSelectedId(loaded.document_id);
    setDraftTitle(loaded.title); setDraftBody(loaded.markdown_body);
    setBaselineTitle(loaded.title); setBaselineBody(loaded.markdown_body);
  }, []);

  const openCanonicalDocument = useCallback(async (documentId: string): Promise<boolean> => {
    setLoading(true); setError(null); setNotice(null); setLatestCanonical(null);
    try {
      const loaded = await api.loadDocument(documentId);
      setEditorFromCanonical(loaded);
      retryRequestRef.current = null; ambiguousRequestRef.current = null;
      setRetryRequest(null); setAmbiguousRequest(null);
      return true;
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) handleUnauthorized();
      else setError(caught instanceof Error ? caught.message : "ノートの読み込みに失敗しました");
      return false;
    } finally { setLoading(false); }
  }, [handleUnauthorized, setEditorFromCanonical]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await refreshList(showArchived);
      if (cancelled) return;
      const first = list?.[0];
      if (first) await openCanonicalDocument(first.document_id);
      else {
        documentRef.current = null; selectedIdRef.current = null; modeRef.current = "empty";
        setDocument(null); setSelectedId(null); setMode("empty"); setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openCanonicalDocument, refreshList, showArchived]);

  const scheduleAutosave = useCallback(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    if (showArchivedRef.current || modeRef.current !== "existing" || ambiguousRequestRef.current || !currentDirty()) return;
    debounceRef.current = window.setTimeout(() => { debounceRef.current = null; void saveActionRef.current(); }, NOTE_AUTOSAVE_DEBOUNCE_MS);
  }, []);

  const applySavedDocument = useCallback((saved: StandaloneDocument, request: DocumentRequest) => {
    const local = draftRef.current;
    const titleStillSent = local.title.trim() === request.title;
    const bodyStillSent = local.body === request.markdown_body;
    const nextDraft = {
      title: titleStillSent ? saved.title : local.title,
      body: bodyStillSent ? saved.markdown_body : local.body,
    };
    documentRef.current = saved; modeRef.current = "existing"; selectedIdRef.current = saved.document_id;
    baselineRef.current = { title: saved.title, body: saved.markdown_body };
    draftRef.current = nextDraft;
    setDocument(saved); setMode("existing"); setSelectedId(saved.document_id);
    setBaselineTitle(saved.title); setBaselineBody(saved.markdown_body);
    setDraftTitle(nextDraft.title); setDraftBody(nextDraft.body);
  }, []);

  const sendRequest = useCallback(async (request: DocumentRequest): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;
    const promise = (async () => {
      setSaving(true); savingRef.current = true; setError(null); setNotice(null);
      setInFlightRequest(request);
      try {
        const result = isUpdateRequest(request) ? await api.updateDocument(request) : await api.createStandaloneDocument(request);
        applySavedDocument(result.document, request);
        retryRequestRef.current = null; ambiguousRequestRef.current = null;
        setRetryRequest(null); setAmbiguousRequest(null); setLatestCanonical(null); setNotice("保存しました。");
        await refreshList(showArchivedRef.current);
        return true;
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) {
          handleUnauthorized();
        } else if (caught instanceof ApiClientError && caught.code === "revision_conflict") {
          retryRequestRef.current = null; setRetryRequest(null);
          setError("他の変更があるため保存できませんでした。ローカルの未保存内容は保持しています。");
          if (isUpdateRequest(request)) {
            try { setLatestCanonical(await api.loadDocument(request.document_id)); }
            catch (reloadError) { if (reloadError instanceof ApiClientError && reloadError.status === 401) handleUnauthorized(); }
          }
        } else if (caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous") {
          ambiguousRequestRef.current = request; retryRequestRef.current = request;
          setAmbiguousRequest(request); setRetryRequest(request);
          setError("保存結果が未確定です。元の操作をそのまま再試行してください。");
          try {
            const canonical = await api.loadDocument(request.document_id);
            if (isAmbiguousResolution(request, canonical)) {
              applySavedDocument(canonical, request);
              ambiguousRequestRef.current = null; retryRequestRef.current = null;
              setAmbiguousRequest(null); setRetryRequest(null); setLatestCanonical(null); setError(null); setNotice("保存結果を確認しました。");
              await refreshList(showArchivedRef.current);
            } else setLatestCanonical(canonical);
          } catch (reconcileError) {
            if (reconcileError instanceof ApiClientError && reconcileError.status === 401) handleUnauthorized();
          }
        } else {
          retryRequestRef.current = null; setRetryRequest(null);
          setError(caught instanceof Error ? caught.message : "ノートの保存に失敗しました");
        }
        return false;
      } finally {
        setSaving(false); savingRef.current = false; inFlightRef.current = null; setInFlightRequest(null);
        if (currentDirty() && !ambiguousRequestRef.current) scheduleAutosave();
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [applySavedDocument, handleUnauthorized, refreshList, scheduleAutosave]);

  const save = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;
    const retry = retryRequestRef.current;
    if (ambiguousRequestRef.current && !retry) return false;
    if (modeRef.current === "empty" || showArchivedRef.current) return false;
    if (!retry && !currentDirty()) return true;
    const request = retry ?? (modeRef.current === "new"
      ? { operation_id: uuidv7(), document_id: uuidv7(), title: draftRef.current.title.trim(), markdown_body: draftRef.current.body }
      : { operation_id: uuidv7(), document_id: selectedIdRef.current!, expected_revision: documentRef.current!.revision,
        title: draftRef.current.title.trim(), markdown_body: draftRef.current.body });
    if (!request.title) { setError("タイトルを入力してください"); return false; }
    retryRequestRef.current = request; setRetryRequest(request);
    return sendRequest(request);
  }, [sendRequest]);

  saveActionRef.current = save;

  const flush = useCallback(async (): Promise<boolean> => {
    if (modeRef.current === "empty" || showArchivedRef.current) return true;
    if (ambiguousRequestRef.current) return false;
    if (debounceRef.current !== null) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
    while (true) {
      const ok = await saveActionRef.current();
      if (!ok) return false;
      if (ambiguousRequestRef.current) return false;
      if (!currentDirty() && !inFlightRef.current && !savingRef.current) return true;
    }
  }, []);

  flushRef.current = flush;
  useEffect(() => {
    onRegisterFlush?.(() => flushRef.current());
    return () => onRegisterFlush?.(null);
  }, [onRegisterFlush]);

  useEffect(() => {
    if (dirty && mode === "existing" && !unresolved && !showArchived) scheduleAutosave();
    return () => { if (debounceRef.current !== null) { window.clearTimeout(debounceRef.current); debounceRef.current = null; } };
  }, [dirty, mode, scheduleAutosave, showArchived, unresolved]);

  async function prepareLocalTransition(): Promise<boolean> {
    if (unresolved || !(await flush())) {
      if (unresolved) setError("保存結果が未確定のため、元の操作を解決するまで移動できません。");
      return false;
    }
    return true;
  }

  async function startNewDocument(): Promise<void> {
    if (showArchived || !(await prepareLocalTransition())) return;
    documentRef.current = null; modeRef.current = "new"; selectedIdRef.current = null;
    draftRef.current = { title: "notitle", body: "" }; baselineRef.current = { title: "notitle", body: "" };
    setDocument(null); setMode("new"); setSelectedId(null); setDraftTitle("notitle"); setDraftBody("");
    setBaselineTitle("notitle"); setBaselineBody(""); setError(null); setNotice(null); setLatestCanonical(null);
    const request: CreateStandaloneDocumentRequest = { operation_id: uuidv7(), document_id: uuidv7(), title: "notitle", markdown_body: "" };
    retryRequestRef.current = request; setRetryRequest(request);
    void sendRequest(request);
  }

  async function selectDocument(documentId: string): Promise<void> {
    if (documentId === selectedIdRef.current && modeRef.current === "existing") return;
    if (!(await prepareLocalTransition())) return;
    await openCanonicalDocument(documentId);
  }

  async function changeArchiveView(archived: boolean): Promise<void> {
    if (archived === showArchived || !(await prepareLocalTransition())) return;
    setShowArchived(archived); setActionId(null); setError(null); setNotice(null);
  }

  async function lifecycleDocument(candidate: StandaloneDocumentSummary, archived: boolean): Promise<void> {
    setActionId(null);
    if (candidate.document_id === selectedIdRef.current && !(await prepareLocalTransition())) return;
    if (candidate.document_id !== selectedIdRef.current && !(await prepareLocalTransition())) return;
    let current: StandaloneDocument;
    try { current = candidate.document_id === documentRef.current?.document_id && documentRef.current ? documentRef.current : await api.loadDocument(candidate.document_id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ノートの読み込みに失敗しました"); return; }
    const request: SetStandaloneDocumentArchivedRequest = {
      operation_id: uuidv7(), document_id: current.document_id, expected_revision: current.revision, archived,
    };
    try {
      const result = await api.setStandaloneDocumentArchived(request);
      const list = await refreshList(showArchivedRef.current);
      setNotice(archived ? "アーカイブしました。" : "通常のノートに戻しました。");
      if (!list?.some((item) => item.document_id === current.document_id)) {
        const next = list?.[0];
        if (next) await openCanonicalDocument(next.document_id);
        else { documentRef.current = null; modeRef.current = "empty"; selectedIdRef.current = null; setDocument(null); setMode("empty"); setSelectedId(null); }
      } else if (selectedIdRef.current === current.document_id) setEditorFromCanonical(result.document);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) handleUnauthorized();
      else setError(caught instanceof Error ? caught.message : "アーカイブ状態の保存に失敗しました");
    }
  }

  async function deleteDocument(candidate: StandaloneDocumentSummary): Promise<void> {
    setActionId(null);
    if (!window.confirm("このノートを完全に削除しますか？この操作は元に戻せません。")) return;
    if (!(await prepareLocalTransition())) return;
    let current: StandaloneDocument;
    try { current = candidate.document_id === documentRef.current?.document_id && documentRef.current ? documentRef.current : await api.loadDocument(candidate.document_id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ノートの読み込みに失敗しました"); return; }
    const request: DeleteStandaloneDocumentRequest = { operation_id: uuidv7(), document_id: current.document_id, expected_revision: current.revision };
    try {
      await api.deleteStandaloneDocument(request);
      const list = await refreshList(showArchivedRef.current);
      setNotice("削除しました。");
      if (selectedIdRef.current === current.document_id) {
        const next = list?.[0];
        if (next) await openCanonicalDocument(next.document_id);
        else { documentRef.current = null; modeRef.current = "empty"; selectedIdRef.current = null; setDocument(null); setMode("empty"); setSelectedId(null); }
      }
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) handleUnauthorized();
      else setError(caught instanceof Error ? caught.message : "ノートの削除に失敗しました");
    }
  }

  function updateDraftTitle(value: string): void {
    if (unresolved || showArchived || document?.archived_at) return;
    setDraftTitle(value); draftRef.current.title = value; setNotice(null);
  }

  function updateDraftBody(value: string): void {
    if (unresolved || showArchived || document?.archived_at) return;
    setDraftBody(value); draftRef.current.body = value; setNotice(null);
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void {
    if (event.key.toLowerCase() !== "s" || (!event.ctrlKey && !event.metaKey) || event.repeat) return;
    event.preventDefault(); void saveActionRef.current();
  }

  const editorAvailable = mode !== "empty";
  const archivedReadOnly = document?.archived_at != null;
  return (
    <main className="shell notes-shell">
      <header className="notes-header">
        <div><p className="eyebrow">Notes</p><h1>{showArchived ? "アーカイブ" : "ノート"}</h1></div>
        {!showArchived && <button type="button" onClick={() => void startNewDocument()}>＋ 新規ノート</button>}
      </header>
      <div className="notes-board">
        <aside className="notes-list" aria-label={showArchived ? "アーカイブ一覧" : "ノート一覧"}>
          <div className="notes-list-heading"><h2>{showArchived ? "アーカイブ" : "ノート一覧"}</h2>
            <button type="button" className="secondary notes-archive-toggle" onClick={() => void changeArchiveView(!showArchived)}>
              {showArchived ? "通常のノートに戻る" : "アーカイブ"}
            </button>
          </div>
          {loading && <p className="muted">読み込み中…</p>}
          {!loading && documents.length === 0 && <p className="muted">{showArchived ? "アーカイブはありません。" : "ノートはまだありません。"}</p>}
          <div className="notes-list-items">
            {documents.map((candidate) => (
              <div className="notes-list-item" key={candidate.document_id}>
                <button type="button" className={candidate.document_id === selectedId ? "active" : ""}
                  onClick={() => void selectDocument(candidate.document_id)}>{documentSummaryTitle(candidate)}</button>
                <button type="button" className="notes-row-actions" aria-label={`${documentSummaryTitle(candidate)}の操作`}
                  onClick={() => setActionId(actionId === candidate.document_id ? null : candidate.document_id)}>…</button>
                {actionId === candidate.document_id && <div className="notes-row-menu" role="menu" aria-label={`${documentSummaryTitle(candidate)}の操作`}>
                  <button type="button" role="menuitem" onClick={() => void lifecycleDocument(candidate, !showArchived)}>{showArchived ? "復元" : "アーカイブ"}</button>
                  <button type="button" role="menuitem" onClick={() => void deleteDocument(candidate)}>削除</button>
                </div>}
              </div>
            ))}
          </div>
        </aside>
        <section className="notes-editor" aria-label="ノートエディタ">
          {!editorAvailable && !loading && <div className="notes-empty"><h2>{showArchived ? "アーカイブを選択" : "ノートを選択"}</h2><p>既存のノートを開くか、新規ノートを作成してください。</p></div>}
          {editorAvailable && <form onSubmit={(event) => { event.preventDefault(); void saveActionRef.current(); }}>
            <div className="notes-editor-heading"><div><p className="eyebrow">Markdown source</p><h2>{mode === "new" ? "新規ノート" : "ノートを編集"}</h2></div>
              <button type="submit" disabled={saving || unresolved || archivedReadOnly}>{saving ? "保存中…" : "保存"}</button></div>
            <label className="notes-title-field">タイトル<input aria-label="ノートタイトル" value={draftTitle} maxLength={200}
              disabled={unresolved || archivedReadOnly} onChange={(event) => updateDraftTitle(event.target.value)} onKeyDown={handleEditorKeyDown} /></label>
            <label className="notes-body-field">Markdown本文<textarea aria-label="Markdown本文" value={draftBody}
              disabled={unresolved || archivedReadOnly} onChange={(event) => updateDraftBody(event.target.value)} onKeyDown={handleEditorKeyDown} rows={18} /></label>
            {dirty && !unresolved && <p className="muted" role="status">未保存</p>}
            {pendingSaveCount > 0 && <p className="muted" role="status">保存中 {pendingSaveCount}件</p>}
            {notice && <p className="success" role="status">{notice}</p>}
            {error && <p className="error" role="alert">{error}</p>}
            {retryRequest && <button type="button" className="secondary" disabled={saving} onClick={() => void saveActionRef.current()}>同じ内容で再試行</button>}
            {latestCanonical && <details className="notes-conflict" open><summary>最新のServer内容を確認</summary><p>タイトル: {latestCanonical.title}</p><pre>{latestCanonical.markdown_body}</pre></details>}
          </form>}
        </section>
      </div>
    </main>
  );
}
