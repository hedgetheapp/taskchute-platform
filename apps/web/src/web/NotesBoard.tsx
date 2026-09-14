import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateStandaloneDocumentRequest,
  DeleteStandaloneDocumentRequest,
  ProjectPrimaryDocument,
  ProjectPrimaryDocumentSummary,
  SetStandaloneDocumentArchivedRequest,
  StandaloneDocument,
  StandaloneDocumentSummary,
  UpdateProjectPrimaryDocumentRequest,
  UpdateDocumentRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { formatJsonRequestSize, serializeJsonRequestBody } from "../shared/request-size";
import { api, ApiClientError } from "./api";
import { NoteMarkdownEditor } from "./NoteMarkdownEditor";
import { documentPermalink } from "./task-note-open-mode";
import { useOutsideClick } from "./ui-helpers";

export const NOTE_AUTOSAVE_DEBOUNCE_MS = 1000;
type DocumentRequest = CreateStandaloneDocumentRequest | UpdateDocumentRequest;
type LifecycleRequest = SetStandaloneDocumentArchivedRequest | DeleteStandaloneDocumentRequest;
type MutationRequest = DocumentRequest | LifecycleRequest;

export interface NotesBoardProps {
  onUnauthorized: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onUnresolvedChange?: (unresolved: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<boolean>) | null) => void;
  initialDocumentId?: string | null;
  onOpenProjectNote?: (projectId: string, projectTitle: string) => void;
  floatingProjectIds?: string[];
  authEpoch?: number;
  mutationsBlocked?: boolean;
}

function isUpdateRequest(request: DocumentRequest): request is UpdateDocumentRequest {
  return "expected_revision" in request;
}

function isDocumentRequest(request: MutationRequest): request is DocumentRequest {
  return "markdown_body" in request;
}

function isLifecycleRequest(request: MutationRequest): request is LifecycleRequest {
  return !isDocumentRequest(request);
}

function isArchiveRequest(request: LifecycleRequest): request is SetStandaloneDocumentArchivedRequest {
  return "archived" in request;
}

function documentSummaryTitle(document: StandaloneDocumentSummary): string {
  return document.title || "（無題）";
}

function isAmbiguousResolution(request: DocumentRequest, canonical: StandaloneDocument): boolean {
  if (canonical.document_id !== request.document_id || canonical.kind !== "standalone") return false;
  if (canonical.title !== request.title || canonical.markdown_body !== request.markdown_body) return false;
  return isUpdateRequest(request) ? canonical.revision === request.expected_revision + 1 : canonical.revision === 0;
}

interface ProjectPrimaryInlineEditorProps {
  candidate: ProjectPrimaryDocumentSummary;
  onUnauthorized: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onUnresolvedChange: (unresolved: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
  authEpoch?: number;
  mutationsBlocked?: boolean;
}

function isProjectUpdateResolved(request: UpdateProjectPrimaryDocumentRequest, canonical: ProjectPrimaryDocument): boolean {
  return canonical.document_id === request.document_id
    && canonical.kind === "project_primary"
    && canonical.project_id === request.project_id
    && canonical.revision === request.expected_revision + 1
    && canonical.markdown_body === request.markdown_body;
}

function ProjectPrimaryInlineEditor({ candidate, onUnauthorized, onDirtyChange, onUnresolvedChange, onSavingChange, onRegisterFlush, authEpoch = 0, mutationsBlocked = false }: ProjectPrimaryInlineEditorProps) {
  const [document, setDocument] = useState<ProjectPrimaryDocument | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [baselineBody, setBaselineBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadWarning, setPayloadWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [latestCanonical, setLatestCanonical] = useState<ProjectPrimaryDocument | null>(null);
  const [unresolvedRequest, setUnresolvedRequest] = useState<UpdateProjectPrimaryDocumentRequest | null>(null);
  const documentRef = useRef<ProjectPrimaryDocument | null>(null);
  const draftRef = useRef("");
  const baselineRef = useRef("");
  const unresolvedRef = useRef<UpdateProjectPrimaryDocumentRequest | null>(null);
  const mutationsBlockedRef = useRef(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const dirty = draftBody !== baselineBody;
  const unresolved = unresolvedRequest !== null;

  documentRef.current = document;
  draftRef.current = draftBody;
  baselineRef.current = baselineBody;
  unresolvedRef.current = unresolvedRequest;
  mutationsBlockedRef.current = mutationsBlocked;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onUnresolvedChange(unresolved); }, [onUnresolvedChange, unresolved]);
  useEffect(() => { onSavingChange(saving); }, [onSavingChange, saving]);

  const applyCanonical = useCallback((loaded: ProjectPrimaryDocument) => {
    documentRef.current = loaded;
    draftRef.current = loaded.markdown_body;
    baselineRef.current = loaded.markdown_body;
    setDocument(loaded); setDraftBody(loaded.markdown_body); setBaselineBody(loaded.markdown_body);
  }, []);

  const loadCanonical = useCallback(async () => {
    setLoading(true); setError(null); setLatestCanonical(null);
    try {
      applyCanonical(await api.loadProjectPrimaryDocumentById(candidate.document_id));
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : "Project Noteの読み込みに失敗しました");
    } finally { setLoading(false); }
  }, [applyCanonical, candidate.document_id, onUnauthorized]);

  useEffect(() => {
    setUnresolvedRequest(null); unresolvedRef.current = null;
    void loadCanonical();
  }, [candidate.document_id, loadCanonical]);

  useEffect(() => {
    if (authEpoch === 0) return;
    void (async () => {
      try {
        const canonical = await api.loadProjectPrimaryDocumentById(candidate.document_id);
        const localDraft = draftRef.current;
        const localDirty = localDraft !== baselineRef.current;
        documentRef.current = canonical;
        setDocument(canonical);
        baselineRef.current = canonical.markdown_body;
        setBaselineBody(canonical.markdown_body);
        if (!localDirty) {
          draftRef.current = canonical.markdown_body;
          setDraftBody(canonical.markdown_body);
        } else if (canonical.markdown_body !== localDraft) {
          setLatestCanonical(canonical);
          setError("再認証後にServer側の変更を確認しました。ローカルの未保存内容は保持しています。");
        }
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      }
    })();
  }, [authEpoch, candidate.document_id, onUnauthorized]);

  const applySaved = useCallback((saved: ProjectPrimaryDocument, request: UpdateProjectPrimaryDocumentRequest) => {
    const bodyStillSent = draftRef.current === request.markdown_body;
    documentRef.current = saved;
    baselineRef.current = saved.markdown_body;
    setDocument(saved); setBaselineBody(saved.markdown_body);
    if (bodyStillSent) { draftRef.current = saved.markdown_body; setDraftBody(saved.markdown_body); }
  }, []);

  const send = useCallback(async (request: UpdateProjectPrimaryDocumentRequest): Promise<boolean> => {
    if (mutationsBlockedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    const promise = (async () => {
      setSaving(true); setError(null); setNotice(null);
      try {
        const result = await api.updateProjectPrimaryDocument(request);
        applySaved(result.document, request);
        setUnresolvedRequest(null); unresolvedRef.current = null; setLatestCanonical(null);
        return true;
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) { onUnauthorized(); return false; }
        if (caught instanceof ApiClientError && caught.code === "revision_conflict") {
          setError("他の変更があるため保存できませんでした。ローカルの未保存内容は保持しています。");
          try { setLatestCanonical(await api.loadProjectPrimaryDocumentById(request.document_id)); } catch { /* Preserve the local draft. */ }
          return false;
        }
        if (caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous") {
          setUnresolvedRequest(request); unresolvedRef.current = request;
          setError("保存結果が未確定です。元の操作をそのまま再試行してください。");
          try {
            const canonical = await api.loadProjectPrimaryDocumentById(request.document_id);
            if (isProjectUpdateResolved(request, canonical)) {
              applySaved(canonical, request); setUnresolvedRequest(null); unresolvedRef.current = null;
              setLatestCanonical(null); setError(null); setNotice("保存結果を確認しました。");
              return true;
            }
            setLatestCanonical(canonical);
          } catch (reconcileError) {
            if (reconcileError instanceof ApiClientError && reconcileError.status === 401) onUnauthorized();
          }
          return false;
        }
        setError(caught instanceof Error ? caught.message : "Project Noteの保存に失敗しました");
        return false;
      } finally {
        setSaving(false); inFlightRef.current = null;
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [applySaved, onUnauthorized]);

  const save = useCallback(async (): Promise<boolean> => {
    if (mutationsBlockedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    if (unresolvedRef.current) return send(unresolvedRef.current);
    const current = documentRef.current;
    if (!current || draftRef.current === baselineRef.current) return true;
    const request: UpdateProjectPrimaryDocumentRequest = { operation_id: uuidv7(), project_id: candidate.project_id, document_id: current.document_id,
      expected_revision: current.revision, markdown_body: draftRef.current };
    const serialized = serializeJsonRequestBody(request);
    if (serialized.overLimit) {
      setPayloadWarning(null);
      setError(`ノートの保存データが大きすぎます（${formatJsonRequestSize(serialized.byteLength)}）。内容を短くしてください。`);
      return false;
    }
    setPayloadWarning(serialized.warning ? `保存データが上限に近づいています（${formatJsonRequestSize(serialized.byteLength)}）。` : null);
    return send(request);
  }, [candidate.project_id, send]);
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
    if (!dirty || loading || unresolved || saving || mutationsBlocked || !document) return;
    const timer = window.setTimeout(() => { void saveRef.current(); }, NOTE_AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, document, loading, mutationsBlocked, saving, unresolved]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key.toLowerCase() !== "s" || (!event.ctrlKey && !event.metaKey) || event.repeat) return;
    event.preventDefault(); void saveRef.current();
  }

  return <form className="notes-project-primary-editor" onSubmit={(event) => { event.preventDefault(); void saveRef.current(); }}>
    {loading ? <p className="muted">読み込み中…</p> : <>
      <div className="notes-editor-heading"><div><p className="eyebrow">Project Note</p><h2>{candidate.project_title}</h2></div></div>
      <p className="notes-project-authority">現在のProjectタイトルを表示しています。タイトルはProject設定から変更できます。</p>
      <NoteMarkdownEditor value={draftBody} disabled={unresolved || mutationsBlocked}
        onChange={(value) => { if (mutationsBlocked || unresolved) return; setDraftBody(value); draftRef.current = value; setNotice(null); }}
        onKeyDown={handleKeyDown} />
      <p className="notes-save-status" role="status" aria-live="polite"><span>{unresolved ? "保存結果未確定" : dirty || saving ? "未保存" : "保存済み"}</span>{saving && <span>（保存中）</span>}</p>
      {payloadWarning && <p className="notes-payload-warning" role="status">{payloadWarning}</p>}
      {unresolved && <button type="button" className="secondary" disabled={saving} onClick={() => void saveRef.current()}>同じ内容で再試行</button>}
      {notice && <p className="success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {latestCanonical && <details className="notes-conflict" open><summary>最新のServer内容を確認</summary><pre>{latestCanonical.markdown_body}</pre></details>}
    </>}
  </form>;
}

export function NotesBoard({ onUnauthorized, onDirtyChange, onUnresolvedChange, onSavingChange, onRegisterFlush, initialDocumentId, onOpenProjectNote, floatingProjectIds = [], authEpoch = 0, mutationsBlocked = false }: NotesBoardProps) {
  const [documents, setDocuments] = useState<StandaloneDocumentSummary[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<ProjectPrimaryDocumentSummary[]>([]);
  const [document, setDocument] = useState<StandaloneDocument | null>(null);
  const [mode, setMode] = useState<"empty" | "new" | "existing" | "project">("empty");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [baselineTitle, setBaselineTitle] = useState("");
  const [baselineBody, setBaselineBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inFlightRequest, setInFlightRequest] = useState<MutationRequest | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [noteKind, setNoteKind] = useState<"all" | "standalone" | "project">("all");
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payloadWarning, setPayloadWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [latestCanonical, setLatestCanonical] = useState<StandaloneDocument | null>(null);
  const [retryRequest, setRetryRequest] = useState<MutationRequest | null>(null);
  const [ambiguousRequest, setAmbiguousRequest] = useState<MutationRequest | null>(null);
  const [projectInlineCandidate, setProjectInlineCandidate] = useState<ProjectPrimaryDocumentSummary | null>(null);
  const [projectDirty, setProjectDirty] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectUnresolved, setProjectUnresolved] = useState(false);
  const [floatingProjectId, setFloatingProjectId] = useState<string | null>(null);

  const documentRef = useRef(document);
  const modeRef = useRef(mode);
  const selectedIdRef = useRef(selectedId);
  const draftRef = useRef({ title: draftTitle, body: draftBody });
  const baselineRef = useRef({ title: baselineTitle, body: baselineBody });
  const retryRequestRef = useRef<MutationRequest | null>(retryRequest);
  const ambiguousRequestRef = useRef<MutationRequest | null>(ambiguousRequest);
  const savingRef = useRef(saving);
  const showArchivedRef = useRef(showArchived);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const saveActionRef = useRef<() => Promise<boolean>>(async () => false);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const projectFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const projectDirtyRef = useRef(false);
  const projectUnresolvedRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const mutationsBlockedRef = useRef(false);

  documentRef.current = document;
  modeRef.current = mode;
  selectedIdRef.current = selectedId;
  draftRef.current = { title: draftTitle, body: draftBody };
  baselineRef.current = { title: baselineTitle, body: baselineBody };
  retryRequestRef.current = retryRequest;
  ambiguousRequestRef.current = ambiguousRequest;
  savingRef.current = saving;
  showArchivedRef.current = showArchived;
  projectDirtyRef.current = projectDirty;
  projectUnresolvedRef.current = projectUnresolved;
  mutationsBlockedRef.current = mutationsBlocked;

  const standaloneDirty = draftTitle !== baselineTitle || draftBody !== baselineBody;
  const dirty = mode === "project" ? projectDirty : standaloneDirty;
  const unresolved = mode === "project" ? projectUnresolved : ambiguousRequest !== null;
  const inFlightDocumentRequest = inFlightRequest !== null && isDocumentRequest(inFlightRequest) ? inFlightRequest : null;
  const followUpPending = inFlightDocumentRequest !== null
    && (draftTitle.trim() !== inFlightDocumentRequest.title || draftBody !== inFlightDocumentRequest.markdown_body);
  const pendingSaveCount = unresolved ? 0 : inFlightDocumentRequest ? 1 + (followUpPending ? 1 : 0) : dirty ? 1 : 0;
  const saveStatus = unresolved ? "保存結果未確定" : dirty ? "未保存" : "保存済み";

  function currentDirty(): boolean {
    return draftRef.current.title !== baselineRef.current.title || draftRef.current.body !== baselineRef.current.body;
  }

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onUnresolvedChange?.(unresolved); }, [onUnresolvedChange, unresolved]);
  useEffect(() => { onSavingChange?.(mode === "project" ? projectSaving : saving); }, [mode, onSavingChange, projectSaving, saving]);

  useOutsideClick(actionId !== null, (target) => target instanceof Element
    && Boolean(target.closest(".notes-row-menu, .notes-row-actions")), () => setActionId(null));

  useEffect(() => {
    if (actionId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setActionId(null);
    };
    window.document.addEventListener("keydown", onKeyDown);
    return () => window.document.removeEventListener("keydown", onKeyDown);
  }, [actionId]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving && !unresolved && !projectSaving && !projectUnresolved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, projectSaving, projectUnresolved, saving, unresolved]);

  const handleUnauthorized = useCallback(() => onUnauthorized(), [onUnauthorized]);

  const refreshList = useCallback(async (archived = showArchivedRef.current): Promise<StandaloneDocumentSummary[] | null> => {
    try {
      const projection = await api.loadDocuments({ archived });
      setDocuments(projection.documents);
      setProjectDocuments(projection.project_documents ?? []);
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

  const openCanonicalDocument = useCallback(async (documentId: string): Promise<StandaloneDocument | null> => {
    setLoading(true); setError(null); setNotice(null); setLatestCanonical(null);
    setProjectInlineCandidate(null); setFloatingProjectId(null); projectFlushRef.current = null;
    try {
      const loaded = await api.loadDocument(documentId);
      setEditorFromCanonical(loaded);
      retryRequestRef.current = null; ambiguousRequestRef.current = null;
      setRetryRequest(null); setAmbiguousRequest(null);
      return loaded;
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) handleUnauthorized();
      else setError(caught instanceof Error ? caught.message : "ノートの読み込みに失敗しました");
      return null;
    } finally { setLoading(false); }
  }, [handleUnauthorized, setEditorFromCanonical]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await refreshList(showArchived);
      if (cancelled) return;
      if (initialDocumentId) {
        const loaded = await openCanonicalDocument(initialDocumentId);
        if (loaded?.archived_at && !showArchived) setShowArchived(true);
        if (loaded) return;
      }
      const first = initialDocumentId ? null : list?.[0];
      if (first) await openCanonicalDocument(first.document_id);
      else {
        documentRef.current = null; selectedIdRef.current = null; modeRef.current = "empty";
        setDocument(null); setSelectedId(null); setMode("empty"); setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialDocumentId, openCanonicalDocument, refreshList, showArchived]);

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

  useEffect(() => {
    if (authEpoch === 0 || modeRef.current === "project") return;
    const ambiguous = ambiguousRequestRef.current;
    void (async () => {
      try {
        if (ambiguous && isDocumentRequest(ambiguous)) {
          const canonical = await api.loadDocument(ambiguous.document_id);
          if (isAmbiguousResolution(ambiguous, canonical)) {
            applySavedDocument(canonical, ambiguous);
            ambiguousRequestRef.current = null; retryRequestRef.current = null;
            setAmbiguousRequest(null); setRetryRequest(null); setLatestCanonical(null); setError(null);
            await refreshList(showArchivedRef.current);
          } else setLatestCanonical(canonical);
          return;
        }
        if (!selectedIdRef.current || modeRef.current !== "existing") return;
        const canonical = await api.loadDocument(selectedIdRef.current);
        const localDraft = draftRef.current;
        const localDirty = currentDirty();
        documentRef.current = canonical;
        setDocument(canonical);
        baselineRef.current = { title: canonical.title, body: canonical.markdown_body };
        setBaselineTitle(canonical.title); setBaselineBody(canonical.markdown_body);
        if (!localDirty) {
          draftRef.current = { title: canonical.title, body: canonical.markdown_body };
          setDraftTitle(canonical.title); setDraftBody(canonical.markdown_body);
        } else if (localDraft.title !== canonical.title || localDraft.body !== canonical.markdown_body) {
          setLatestCanonical(canonical);
          setError("再認証後にServer側の変更を確認しました。ローカルの未保存内容は保持しています。");
        }
        await refreshList(showArchivedRef.current);
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) handleUnauthorized();
        else setError(caught instanceof Error ? caught.message : "再認証後のNote確認に失敗しました");
      }
    })();
  }, [applySavedDocument, authEpoch, handleUnauthorized, refreshList]);

  const reconcileLifecycleProjection = useCallback(async (request: LifecycleRequest, canonical?: StandaloneDocument): Promise<void> => {
    const list = await refreshList(showArchivedRef.current);
    if (!list?.some((item) => item.document_id === request.document_id)) {
      const next = list?.[0];
      if (next) await openCanonicalDocument(next.document_id);
      else {
        documentRef.current = null; modeRef.current = "empty"; selectedIdRef.current = null;
        setDocument(null); setMode("empty"); setSelectedId(null);
      }
    } else if (selectedIdRef.current === request.document_id && canonical) {
      setEditorFromCanonical(canonical);
    }
  }, [openCanonicalDocument, refreshList, setEditorFromCanonical]);

  const sendRequest = useCallback(async (request: DocumentRequest): Promise<boolean> => {
    if (mutationsBlockedRef.current) return false;
    const serialized = serializeJsonRequestBody(request);
    if (serialized.overLimit) {
      setError(`ノートの保存データが大きすぎます（${formatJsonRequestSize(serialized.byteLength)}）。内容を短くしてください。`);
      return false;
    }
    setPayloadWarning(serialized.warning ? `保存データが上限に近づいています（${formatJsonRequestSize(serialized.byteLength)}）。` : null);
    if (inFlightRef.current) return inFlightRef.current;
    const promise = (async () => {
      setSaving(true); savingRef.current = true; setError(null); setNotice(null);
      setInFlightRequest(request);
      try {
        const result = isUpdateRequest(request) ? await api.updateDocument(request) : await api.createStandaloneDocument(request);
        applySavedDocument(result.document, request);
        retryRequestRef.current = null; ambiguousRequestRef.current = null;
        setRetryRequest(null); setAmbiguousRequest(null); setLatestCanonical(null);
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
        if (currentDirty() && !ambiguousRequestRef.current && !mutationsBlockedRef.current) scheduleAutosave();
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [applySavedDocument, handleUnauthorized, refreshList, scheduleAutosave]);

  const sendLifecycleRequest = useCallback(async (request: LifecycleRequest): Promise<boolean> => {
    if (mutationsBlockedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    const promise = (async () => {
      setSaving(true); savingRef.current = true; setError(null); setNotice(null);
      setInFlightRequest(request);
      try {
        let canonical: StandaloneDocument | undefined;
        if (isArchiveRequest(request)) {
          canonical = (await api.setStandaloneDocumentArchived(request)).document;
        } else {
          await api.deleteStandaloneDocument(request);
        }
        await reconcileLifecycleProjection(request, canonical);
        retryRequestRef.current = null; ambiguousRequestRef.current = null;
        setRetryRequest(null); setAmbiguousRequest(null); setLatestCanonical(null);
        setNotice(isArchiveRequest(request) ? (request.archived ? "アーカイブしました。" : "通常のノートに戻しました。") : "削除しました。");
        return true;
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) {
          handleUnauthorized();
        } else if (caught instanceof ApiClientError && caught.code === "revision_conflict") {
          retryRequestRef.current = null; ambiguousRequestRef.current = null;
          setRetryRequest(null); setAmbiguousRequest(null);
          setError("他の変更があるため操作できませんでした。最新のノート状態を確認してください。");
          try { setLatestCanonical(await api.loadDocument(request.document_id)); }
          catch (reloadError) { if (reloadError instanceof ApiClientError && reloadError.status === 401) handleUnauthorized(); }
        } else if (caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous") {
          ambiguousRequestRef.current = request; retryRequestRef.current = request;
          setAmbiguousRequest(request); setRetryRequest(request);
          setError("保存結果が未確定です。元の操作をそのまま再試行してください。");
          try { setLatestCanonical(await api.loadDocument(request.document_id)); }
          catch (reconcileError) { if (reconcileError instanceof ApiClientError && reconcileError.status === 401) handleUnauthorized(); }
        } else {
          retryRequestRef.current = null; ambiguousRequestRef.current = null;
          setRetryRequest(null); setAmbiguousRequest(null);
          setError(caught instanceof Error ? caught.message : "ノートのライフサイクル操作に失敗しました");
        }
        return false;
      } finally {
        setSaving(false); savingRef.current = false; inFlightRef.current = null; setInFlightRequest(null);
        if (currentDirty() && !ambiguousRequestRef.current && !mutationsBlockedRef.current) scheduleAutosave();
      }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [handleUnauthorized, reconcileLifecycleProjection, scheduleAutosave]);

  const save = useCallback(async (): Promise<boolean> => {
    if (mutationsBlockedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    const retry = retryRequestRef.current;
    if (ambiguousRequestRef.current && !retry) return false;
    if (retry && isLifecycleRequest(retry)) return sendLifecycleRequest(retry);
    if (modeRef.current === "empty" || showArchivedRef.current) return false;
    if (!retry && !currentDirty()) return true;
    const request = retry ?? (modeRef.current === "new"
      ? { operation_id: uuidv7(), document_id: uuidv7(), title: draftRef.current.title.trim(), markdown_body: draftRef.current.body }
      : { operation_id: uuidv7(), document_id: selectedIdRef.current!, expected_revision: documentRef.current!.revision,
        title: draftRef.current.title.trim(), markdown_body: draftRef.current.body });
    if (!request.title) { setError("タイトルを入力してください"); return false; }
    retryRequestRef.current = request; setRetryRequest(request);
    return sendRequest(request);
  }, [sendLifecycleRequest, sendRequest]);

  saveActionRef.current = save;

  const flush = useCallback(async (): Promise<boolean> => {
    if (modeRef.current === "project") {
      if (projectUnresolvedRef.current) return false;
      return projectFlushRef.current ? projectFlushRef.current() : !projectDirtyRef.current;
    }
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
    if (standaloneDirty && mode === "existing" && !unresolved && !showArchived) scheduleAutosave();
    return () => { if (debounceRef.current !== null) { window.clearTimeout(debounceRef.current); debounceRef.current = null; } };
  }, [mode, scheduleAutosave, showArchived, standaloneDirty, unresolved]);

  async function prepareLocalTransition(): Promise<boolean> {
    if (mutationsBlockedRef.current) {
      setError("再認証が必要なため、このNoteを離れられません。");
      return false;
    }
    if (unresolved || !(await flush())) {
      if (unresolved) setError("保存結果が未確定のため、元の操作を解決するまで移動できません。");
      return false;
    }
    return true;
  }

  async function startNewDocument(): Promise<void> {
    if (mutationsBlockedRef.current) return;
    if (showArchived || !(await prepareLocalTransition())) return;
    setProjectInlineCandidate(null); setFloatingProjectId(null); projectFlushRef.current = null;
    documentRef.current = null; modeRef.current = "new"; selectedIdRef.current = null;
    draftRef.current = { title: "notitle", body: "" }; baselineRef.current = { title: "notitle", body: "" };
    setDocument(null); setMode("new"); setSelectedId(null); setDraftTitle("notitle"); setDraftBody("");
    setBaselineTitle("notitle"); setBaselineBody(""); setError(null); setNotice(null); setLatestCanonical(null);
    const request: CreateStandaloneDocumentRequest = { operation_id: uuidv7(), document_id: uuidv7(), title: "notitle", markdown_body: "" };
    retryRequestRef.current = request; setRetryRequest(request);
    void sendRequest(request);
  }

  async function selectDocument(documentId: string): Promise<void> {
    if (mutationsBlockedRef.current) return;
    if (documentId === selectedIdRef.current && modeRef.current === "existing") return;
    if (!(await prepareLocalTransition())) return;
    await openCanonicalDocument(documentId);
  }

  async function selectProjectDocument(candidate: ProjectPrimaryDocumentSummary): Promise<void> {
    if (mutationsBlockedRef.current) return;
    if (!(await prepareLocalTransition())) return;
    setSelectedId(candidate.document_id);
    setError(null); setNotice(null); setLatestCanonical(null);
    if (floatingProjectIds.includes(candidate.project_id) && onOpenProjectNote) {
      setProjectInlineCandidate(null); setFloatingProjectId(candidate.project_id); setMode("empty"); modeRef.current = "empty";
      projectFlushRef.current = null; setProjectDirty(false); setProjectUnresolved(false);
      onOpenProjectNote(candidate.project_id, candidate.project_title);
      return;
    }
    setFloatingProjectId(null); setProjectInlineCandidate(candidate); setMode("project"); modeRef.current = "project";
    setDocument(null); setDraftTitle(""); setDraftBody(""); setBaselineTitle(""); setBaselineBody("");
    setRetryRequest(null); setAmbiguousRequest(null); retryRequestRef.current = null; ambiguousRequestRef.current = null;
  }

  async function changeArchiveView(archived: boolean): Promise<void> {
    if (mutationsBlockedRef.current) return;
    if (archived === showArchived || !(await prepareLocalTransition())) return;
    setShowArchived(archived); setActionId(null); setError(null); setNotice(null);
  }

  async function lifecycleDocument(candidate: StandaloneDocumentSummary, archived: boolean): Promise<void> {
    setActionId(null);
    if (mutationsBlockedRef.current) return;
    if (ambiguousRequestRef.current) {
      setError("保存結果が未確定のため、元の操作を解決するまで別の操作はできません。");
      return;
    }
    if (candidate.document_id === selectedIdRef.current && !(await prepareLocalTransition())) return;
    if (candidate.document_id !== selectedIdRef.current && !(await prepareLocalTransition())) return;
    let current: StandaloneDocument;
    try { current = candidate.document_id === documentRef.current?.document_id && documentRef.current ? documentRef.current : await api.loadDocument(candidate.document_id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ノートの読み込みに失敗しました"); return; }
    const request: SetStandaloneDocumentArchivedRequest = {
      operation_id: uuidv7(), document_id: current.document_id, expected_revision: current.revision, archived,
    };
    retryRequestRef.current = request; setRetryRequest(request);
    await sendLifecycleRequest(request);
  }

  async function deleteDocument(candidate: StandaloneDocumentSummary): Promise<void> {
    setActionId(null);
    if (mutationsBlockedRef.current) return;
    if (ambiguousRequestRef.current) {
      setError("保存結果が未確定のため、元の操作を解決するまで別の操作はできません。");
      return;
    }
    if (!window.confirm("このノートを完全に削除しますか？この操作は元に戻せません。")) return;
    if (!(await prepareLocalTransition())) return;
    let current: StandaloneDocument;
    try { current = candidate.document_id === documentRef.current?.document_id && documentRef.current ? documentRef.current : await api.loadDocument(candidate.document_id); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ノートの読み込みに失敗しました"); return; }
    const request: DeleteStandaloneDocumentRequest = { operation_id: uuidv7(), document_id: current.document_id, expected_revision: current.revision };
    retryRequestRef.current = request; setRetryRequest(request);
    await sendLifecycleRequest(request);
  }

  function updateDraftTitle(value: string): void {
    if (mutationsBlockedRef.current || unresolved || showArchived || document?.archived_at) return;
    setDraftTitle(value); draftRef.current.title = value; setNotice(null);
  }

  function updateDraftBody(value: string): void {
    if (mutationsBlockedRef.current || unresolved || showArchived || document?.archived_at) return;
    setDraftBody(value); draftRef.current.body = value; setNotice(null);
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void {
    if (event.key.toLowerCase() !== "s" || (!event.ctrlKey && !event.metaKey) || event.repeat) return;
    event.preventDefault(); void saveActionRef.current();
  }

  async function copyDocumentLink(documentId: string): Promise<void> {
    const write = navigator.clipboard?.writeText(`${window.location.origin}${documentPermalink(documentId)}`);
    if (!write) {
      setNotice("リンクのコピーに失敗しました。");
      return;
    }
    try {
      await write;
      setNotice("リンクをコピーしました。");
    } catch {
      setNotice("リンクのコピーに失敗しました。");
    }
  }

  const editorAvailable = mode !== "empty" && mode !== "project";
  const archivedReadOnly = document?.archived_at != null;
  const visibleStandaloneDocuments = noteKind === "project" ? [] : documents;
  const visibleProjectDocuments = showArchived || noteKind === "standalone" ? [] : projectDocuments;
  const mergedDocuments = [
    ...visibleStandaloneDocuments.map((candidate) => ({ kind: "standalone" as const, candidate })),
    ...visibleProjectDocuments.map((candidate) => ({ kind: "project" as const, candidate })),
  ].sort((left, right) => right.candidate.updated_at.localeCompare(left.candidate.updated_at)
    || right.candidate.document_id.localeCompare(left.candidate.document_id));
  return (
    <main className="shell notes-shell">
      {loading && <div className="transient-status notes-loading-status" role="status" aria-live="polite">ノートを読み込み中…</div>}
      {notice && <div className="transient-status notes-action-status" role="status">{notice}</div>}
      <header className="notes-header">
        <div><p className="eyebrow">Notes</p><h1>{showArchived ? "アーカイブ" : "ノート"}</h1></div>
        {!showArchived && <button type="button" disabled={mutationsBlocked} onClick={() => void startNewDocument()}>＋ 新規ノート</button>}
      </header>
      <div className="notes-board">
        <aside className="notes-list" aria-label={showArchived ? "アーカイブ一覧" : "ノート一覧"}>
          <div className="notes-list-heading"><h2>{showArchived ? "アーカイブ" : "ノート一覧"}</h2>
            <button type="button" className="secondary notes-archive-toggle" disabled={mutationsBlocked} onClick={() => void changeArchiveView(!showArchived)}>
              {showArchived ? "通常のノートに戻る" : "アーカイブ"}
            </button>
          </div>
          {!showArchived && <label className="notes-kind-filter">ノート種別<select aria-label="ノート種別" value={noteKind} onChange={(event) => setNoteKind(event.target.value as "all" | "standalone" | "project")}>
            <option value="all">すべて</option><option value="standalone">通常ノート</option><option value="project">プロジェクトノート</option>
          </select></label>}
          {!loading && mergedDocuments.length === 0 && <p className="muted">{showArchived ? "アーカイブはありません。" : "ノートはまだありません。"}</p>}
          <div className="notes-list-items">
            {mergedDocuments.map(({ kind, candidate }) => kind === "project" ? (
              <div className="notes-list-item project-note-list-item" key={candidate.document_id}>
                <button type="button" className={`project-note-list-button${candidate.document_id === selectedId ? " active" : ""}`} onClick={() => void selectProjectDocument(candidate)}>
                  <span className="notes-kind-badge">PROJECT NOTE</span>{candidate.project_title}{candidate.project_archived ? "（アーカイブ）" : ""}
                </button>
              </div>
            ) : (
              <div className="notes-list-item" key={candidate.document_id}>
                <button type="button" className={candidate.document_id === selectedId ? "active" : ""}
                  onClick={() => void selectDocument(candidate.document_id)}>{documentSummaryTitle(candidate)}</button>
                <button type="button" className="notes-row-actions" aria-label={`${documentSummaryTitle(candidate)}の操作`}
                  onClick={() => setActionId(actionId === candidate.document_id ? null : candidate.document_id)}>…</button>
                {actionId === candidate.document_id && <div className="notes-row-menu" role="menu" aria-label={`${documentSummaryTitle(candidate)}の操作`}>
                  <button type="button" role="menuitem" onClick={() => void lifecycleDocument(candidate, !showArchived)}>{showArchived ? "復元" : "アーカイブ"}</button>
                  <button type="button" role="menuitem" className="destructive-action" onClick={() => void deleteDocument(candidate)}>削除</button>
                </div>}
              </div>
            ))}
          </div>
        </aside>
        <section className="notes-editor" aria-label="ノートエディタ">
          {!editorAvailable && mode !== "project" && !loading && <div className="notes-empty"><h2>{initialDocumentId && error ? "ノートを開けません" : showArchived ? "アーカイブを選択" : "ノートを選択"}</h2><p>{initialDocumentId && error ? "指定されたノートは利用できません。" : "既存のノートを開くか、新規ノートを作成してください。"}</p>{error && <p className="error" role="alert">{error}</p>}</div>}
          {floatingProjectId && mode === "empty" && <div className="notes-empty"><h2>Project Note</h2><p>このプロジェクトノートはフローティングウィンドウで開いています。</p></div>}
          {mode === "project" && projectInlineCandidate && <ProjectPrimaryInlineEditor candidate={projectInlineCandidate}
            onUnauthorized={onUnauthorized} onDirtyChange={setProjectDirty} onUnresolvedChange={setProjectUnresolved}
            onSavingChange={setProjectSaving} onRegisterFlush={(flush) => { projectFlushRef.current = flush; }}
            authEpoch={authEpoch} mutationsBlocked={mutationsBlocked} />}
          {editorAvailable && <form onSubmit={(event) => { event.preventDefault(); void saveActionRef.current(); }}>
            <div className="notes-editor-heading"><div><p className="eyebrow">Markdown source</p><h2>{mode === "new" ? "新規ノート" : "ノートを編集"}</h2></div>
              {document && mode === "existing" && <button type="button" className="secondary" onClick={() => void copyDocumentLink(document.document_id)}>リンクをコピー</button>}
              <button type="submit" disabled={saving || unresolved || archivedReadOnly || mutationsBlocked}>{saving ? "保存中…" : "保存"}</button></div>
            <label className="notes-title-field">タイトル<input aria-label="ノートタイトル" value={draftTitle} maxLength={200}
              disabled={unresolved || archivedReadOnly || mutationsBlocked} onChange={(event) => updateDraftTitle(event.target.value)} onKeyDown={handleEditorKeyDown} /></label>
            <NoteMarkdownEditor
              value={draftBody}
              disabled={unresolved || archivedReadOnly || mutationsBlocked}
              onChange={updateDraftBody}
              onKeyDown={handleEditorKeyDown}
            />
            <p className="notes-save-status" role="status" aria-live="polite">
              <span>{saveStatus}</span>{pendingSaveCount > 0 && <span>（<span>保存中 {pendingSaveCount}件</span>）</span>}
            </p>
            {payloadWarning && <p className="notes-payload-warning" role="status">{payloadWarning}</p>}
            {error && <p className="error" role="alert">{error}</p>}
            {retryRequest && <button type="button" className="secondary" disabled={saving} onClick={() => void saveActionRef.current()}>同じ内容で再試行</button>}
            {latestCanonical && <details className="notes-conflict" open><summary>最新のServer内容を確認</summary><p>タイトル: {latestCanonical.title}</p><pre>{latestCanonical.markdown_body}</pre></details>}
          </form>}
        </section>
      </div>
    </main>
  );
}
