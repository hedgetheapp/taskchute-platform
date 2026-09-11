import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useState } from "react";
import type {
  CreateStandaloneDocumentRequest,
  StandaloneDocument,
  StandaloneDocumentSummary,
  UpdateDocumentRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";

type DocumentRequest = CreateStandaloneDocumentRequest | UpdateDocumentRequest;

export interface NotesBoardProps {
  onUnauthorized: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onUnresolvedChange?: (unresolved: boolean) => void;
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
  return isUpdateRequest(request)
    ? canonical.revision === request.expected_revision + 1
    : canonical.revision === 0;
}

export function NotesBoard({ onUnauthorized, onDirtyChange, onUnresolvedChange }: NotesBoardProps) {
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [latestCanonical, setLatestCanonical] = useState<StandaloneDocument | null>(null);
  const [retryRequest, setRetryRequest] = useState<DocumentRequest | null>(null);
  const [ambiguousRequest, setAmbiguousRequest] = useState<DocumentRequest | null>(null);

  const dirty = draftTitle !== baselineTitle || draftBody !== baselineBody;
  const unresolved = ambiguousRequest !== null;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onUnresolvedChange?.(unresolved);
  }, [onUnresolvedChange, unresolved]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty && !unresolved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, unresolved]);

  const handleUnauthorized = useCallback(() => {
    onUnauthorized();
  }, [onUnauthorized]);

  const refreshList = useCallback(async () => {
    try {
      const projection = await api.loadDocuments();
      setDocuments(projection.documents);
      return projection.documents;
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) handleUnauthorized();
      else setError(caught instanceof Error ? caught.message : "ノート一覧の読み込みに失敗しました");
      return null;
    }
  }, [handleUnauthorized]);

  const openCanonicalDocument = useCallback(async (documentId: string) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    setLatestCanonical(null);
    try {
      const loaded = await api.loadDocument(documentId);
      setDocument(loaded);
      setMode("existing");
      setSelectedId(loaded.document_id);
      setDraftTitle(loaded.title);
      setDraftBody(loaded.markdown_body);
      setBaselineTitle(loaded.title);
      setBaselineBody(loaded.markdown_body);
      setRetryRequest(null);
      setAmbiguousRequest(null);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) handleUnauthorized();
      else setError(caught instanceof Error ? caught.message : "ノートの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await refreshList();
      if (cancelled || !list) {
        if (!cancelled) setLoading(false);
        return;
      }
      const first = list[0];
      if (first) await openCanonicalDocument(first.document_id);
      else setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [openCanonicalDocument, refreshList]);

  function confirmDiscardIfDirty(): boolean {
    if (unresolved) {
      setError("保存結果が未確定のため、元の操作を解決するまで移動できません。");
      return false;
    }
    return !dirty || window.confirm("未保存の変更があります。破棄して移動しますか？");
  }

  function startNewDocument(): void {
    if (!confirmDiscardIfDirty()) return;
    setDocument(null);
    setMode("new");
    setSelectedId(null);
    setDraftTitle("");
    setDraftBody("");
    setBaselineTitle("");
    setBaselineBody("");
    setError(null);
    setNotice(null);
    setLatestCanonical(null);
    setRetryRequest(null);
    setAmbiguousRequest(null);
  }

  function selectDocument(documentId: string): void {
    if (documentId === selectedId && mode === "existing") return;
    if (!confirmDiscardIfDirty()) return;
    void openCanonicalDocument(documentId);
  }

  const save = useCallback(async () => {
    if (saving || mode === "empty") return;
    setError(null);
    setNotice(null);
    let request = retryRequest;
    if (!request) {
      const title = draftTitle.trim();
      if (!title) {
        setError("タイトルを入力してください");
        return;
      }
      request = mode === "new"
        ? {
          operation_id: uuidv7(), document_id: uuidv7(), title, markdown_body: draftBody,
        }
        : {
          operation_id: uuidv7(), document_id: selectedId!, expected_revision: document!.revision,
          title, markdown_body: draftBody,
        };
      setRetryRequest(request);
    }
    setSaving(true);
    try {
      const result = isUpdateRequest(request)
        ? await api.updateDocument(request)
        : await api.createStandaloneDocument(request);
      const saved = result.document;
      setDocument(saved);
      setMode("existing");
      setSelectedId(saved.document_id);
      setDraftTitle(saved.title);
      setDraftBody(saved.markdown_body);
      setBaselineTitle(saved.title);
      setBaselineBody(saved.markdown_body);
      setRetryRequest(null);
      setAmbiguousRequest(null);
      setLatestCanonical(null);
      setNotice("保存しました。");
      await refreshList();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        handleUnauthorized();
      } else if (caught instanceof ApiClientError && caught.code === "revision_conflict") {
        setRetryRequest(null);
        setAmbiguousRequest(null);
        setError("他の変更があるため保存できませんでした。ローカルの未保存内容は保持しています。");
        if (request && isUpdateRequest(request)) {
          try {
            setLatestCanonical(await api.loadDocument(request.document_id));
          } catch (reloadError) {
            if (reloadError instanceof ApiClientError && reloadError.status === 401) handleUnauthorized();
          }
        }
      } else if (caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous") {
        setAmbiguousRequest(request);
        setError("保存結果が未確定です。元の操作をそのまま再試行してください。");
        try {
          const canonical = await api.loadDocument(request.document_id);
          if (isAmbiguousResolution(request, canonical)) {
            setDocument(canonical);
            setMode("existing");
            setSelectedId(canonical.document_id);
            setDraftTitle(canonical.title);
            setDraftBody(canonical.markdown_body);
            setBaselineTitle(canonical.title);
            setBaselineBody(canonical.markdown_body);
            setRetryRequest(null);
            setAmbiguousRequest(null);
            setLatestCanonical(null);
            setError(null);
            setNotice("保存結果を確認しました。");
            await refreshList();
          } else {
            setLatestCanonical(canonical);
          }
        } catch (reconcileError) {
          if (reconcileError instanceof ApiClientError && reconcileError.status === 401) handleUnauthorized();
        }
      } else {
        setRetryRequest(null);
        setError(caught instanceof Error ? caught.message : "ノートの保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  }, [document, draftBody, draftTitle, handleUnauthorized, mode, refreshList, retryRequest, saving, selectedId]);

  function updateDraftTitle(value: string): void {
    if (unresolved) return;
    setDraftTitle(value);
    setRetryRequest(null);
    setNotice(null);
  }

  function updateDraftBody(value: string): void {
    if (unresolved) return;
    setDraftBody(value);
    setRetryRequest(null);
    setNotice(null);
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void {
    if (event.key.toLowerCase() !== "s" || (!event.ctrlKey && !event.metaKey) || event.repeat) return;
    event.preventDefault();
    void save();
  }

  const editorAvailable = mode !== "empty";
  return (
    <main className="shell notes-shell">
      <header className="notes-header">
        <div>
          <p className="eyebrow">Notes</p>
          <h1>ノート</h1>
        </div>
        <button type="button" onClick={startNewDocument}>＋ 新規ノート</button>
      </header>
      <div className="notes-board">
        <aside className="notes-list" aria-label="ノート一覧">
          <h2>ノート一覧</h2>
          {loading && <p className="muted">読み込み中…</p>}
          {!loading && documents.length === 0 && <p className="muted">ノートはまだありません。</p>}
          <div className="notes-list-items">
            {documents.map((candidate) => (
              <button type="button" key={candidate.document_id}
                className={candidate.document_id === selectedId ? "active" : ""}
                onClick={() => selectDocument(candidate.document_id)}>
                {documentSummaryTitle(candidate)}
              </button>
            ))}
          </div>
        </aside>
        <section className="notes-editor" aria-label="ノートエディタ">
          {!editorAvailable && !loading && (
            <div className="notes-empty"><h2>ノートを選択</h2><p>既存のノートを開くか、新規ノートを作成してください。</p></div>
          )}
          {editorAvailable && (
            <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
              <div className="notes-editor-heading">
                <div>
                  <p className="eyebrow">Markdown source</p>
                  <h2>{mode === "new" ? "新規ノート" : "ノートを編集"}</h2>
                </div>
                <button type="submit" disabled={saving || unresolved}>{saving ? "保存中…" : "保存"}</button>
              </div>
              <label className="notes-title-field">タイトル
                <input aria-label="ノートタイトル" value={draftTitle} maxLength={200}
                  disabled={unresolved}
                  onChange={(event) => updateDraftTitle(event.target.value)} onKeyDown={handleEditorKeyDown} />
              </label>
              <label className="notes-body-field">Markdown本文
                <textarea aria-label="Markdown本文" value={draftBody} disabled={unresolved}
                  onChange={(event) => updateDraftBody(event.target.value)}
                  onKeyDown={handleEditorKeyDown} rows={18} />
              </label>
              {notice && <p className="success" role="status">{notice}</p>}
              {error && <p className="error" role="alert">{error}</p>}
              {retryRequest && <button type="button" className="secondary" disabled={saving} onClick={() => void save()}>同じ内容で再試行</button>}
              {latestCanonical && <details className="notes-conflict" open>
                <summary>最新のServer内容を確認</summary>
                <p>タイトル: {latestCanonical.title}</p>
                <pre>{latestCanonical.markdown_body}</pre>
              </details>}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
