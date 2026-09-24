import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DailyPrimaryDocument,
  DailyPrimaryDocumentSummary,
  EnsureDailyPrimaryDocumentRequest,
  UpdateDailyPrimaryDocumentRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { formatJsonRequestSize, serializeJsonRequestBody } from "../shared/request-size";
import { api, ApiClientError } from "./api";
import { NoteMarkdownEditor } from "./NoteMarkdownEditor";

const AUTOSAVE_MS = 1000;

interface DailyNotesBoardProps {
  onUnauthorized: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onUnresolvedChange?: (unresolved: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onRegisterFlush?: (flush: (() => Promise<boolean>) | null) => void;
  onExit: (kind: "all" | "standalone" | "project") => void;
  mutationsBlocked?: boolean;
  authEpoch?: number;
}

function messageFor(caught: unknown): string {
  return caught instanceof Error ? caught.message : "デイリーノートの読み込みに失敗しました";
}

export function DailyNotesBoard({ onUnauthorized, onDirtyChange, onUnresolvedChange, onSavingChange, onRegisterFlush, onExit, mutationsBlocked = false, authEpoch = 0 }: DailyNotesBoardProps) {
  const [days, setDays] = useState<DailyPrimaryDocumentSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [document, setDocument] = useState<DailyPrimaryDocument | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [baselineBody, setBaselineBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unresolvedRequest, setUnresolvedRequest] = useState<UpdateDailyPrimaryDocumentRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const documentRef = useRef<DailyPrimaryDocument | null>(null);
  const draftRef = useRef("");
  const baselineRef = useRef("");
  const unresolvedRef = useRef<UpdateDailyPrimaryDocumentRequest | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const mutationsBlockedRef = useRef(mutationsBlocked);
  const debounceRef = useRef<number | null>(null);
  const dirty = draftBody !== baselineBody;
  const unresolved = unresolvedRequest !== null;

  documentRef.current = document;
  draftRef.current = draftBody;
  baselineRef.current = baselineBody;
  unresolvedRef.current = unresolvedRequest;
  mutationsBlockedRef.current = mutationsBlocked;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onUnresolvedChange?.(unresolved); }, [onUnresolvedChange, unresolved]);
  useEffect(() => { onSavingChange?.(saving); }, [onSavingChange, saving]);

  const adopt = useCallback((loaded: DailyPrimaryDocument) => {
    documentRef.current = loaded; draftRef.current = loaded.markdown_body; baselineRef.current = loaded.markdown_body;
    setDocument(loaded); setDraftBody(loaded.markdown_body); setBaselineBody(loaded.markdown_body);
  }, []);

  const loadDate = useCallback(async (logicalDate?: string): Promise<boolean> => {
    setLoading(true); setError(null); setNotice(null);
    try {
      const day = await api.loadDay(logicalDate);
      if (!day.taskchute_day.id) throw new Error("確立済みの日が利用できません");
      const projection = await api.loadDailyPrimaryDocuments();
      setDays(projection.days);
      const summary = projection.days.find((candidate) => candidate.taskchute_day_id === day.taskchute_day.id);
      let loaded: DailyPrimaryDocument;
      if (summary?.document_id) {
        loaded = await api.loadDailyPrimaryDocument(summary.document_id);
      } else {
        const request: EnsureDailyPrimaryDocumentRequest = { operation_id: uuidv7(), taskchute_day_id: day.taskchute_day.id, document_id: uuidv7() };
        loaded = (await api.ensureDailyPrimaryDocument(request)).document;
        setDays((current) => current.map((candidate) => candidate.taskchute_day_id === day.taskchute_day.id ? { ...candidate, document_id: loaded.document_id } : candidate));
      }
      setSelectedDate(day.taskchute_day.logical_date); adopt(loaded); setUnresolvedRequest(null); unresolvedRef.current = null;
      return true;
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(messageFor(caught));
      return false;
    } finally { setLoading(false); }
  }, [adopt, onUnauthorized]);

  useEffect(() => { void loadDate(); }, [loadDate]);
  useEffect(() => {
    if (authEpoch === 0 || dirty || saving || unresolved) return;
    void loadDate(selectedDate ?? undefined);
  }, [authEpoch, dirty, loadDate, saving, selectedDate, unresolved]);

  const send = useCallback(async (request: UpdateDailyPrimaryDocumentRequest): Promise<boolean> => {
    if (mutationsBlockedRef.current) return false;
    if (inFlightRef.current) return inFlightRef.current;
    const serialized = serializeJsonRequestBody(request);
    if (serialized.overLimit) { setError(`デイリーノートの保存データが大きすぎます（${formatJsonRequestSize(serialized.byteLength)}）。`); return false; }
    const promise = (async () => {
      setSaving(true); setError(null);
      try {
        const saved = (await api.updateDailyPrimaryDocument(request)).document;
        const bodyStillSent = draftRef.current === request.markdown_body;
        documentRef.current = saved; setDocument(saved); baselineRef.current = saved.markdown_body; setBaselineBody(saved.markdown_body);
        if (bodyStillSent) { draftRef.current = saved.markdown_body; setDraftBody(saved.markdown_body); }
        setUnresolvedRequest(null); unresolvedRef.current = null; setNotice("保存しました。");
        return true;
      } catch (caught) {
        if (caught instanceof ApiClientError && caught.status === 401) { onUnauthorized(); return false; }
        if (caught instanceof ApiClientError && caught.code === "revision_conflict") { setError("他の変更があるため保存できませんでした。内容を確認してください。"); return false; }
        if (caught instanceof ApiClientError && caught.code === "infrastructure_ambiguous") { setUnresolvedRequest(request); unresolvedRef.current = request; setError("保存結果が未確定です。元の操作をそのまま再試行してください。"); return false; }
        setError(messageFor(caught)); return false;
      } finally { setSaving(false); inFlightRef.current = null; }
    })();
    inFlightRef.current = promise;
    return promise;
  }, [onUnauthorized]);

  const save = useCallback(async (): Promise<boolean> => {
    if (mutationsBlockedRef.current || inFlightRef.current) return inFlightRef.current ?? false;
    const retry = unresolvedRef.current;
    if (retry) return send(retry);
    const current = documentRef.current;
    if (!current || draftRef.current === baselineRef.current) return true;
    return send({ operation_id: uuidv7(), taskchute_day_id: current.taskchute_day_id, document_id: current.document_id, expected_revision: current.revision, markdown_body: draftRef.current });
  }, [send]);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<boolean> => {
    if (unresolvedRef.current) return false;
    if (debounceRef.current !== null) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
    return saveRef.current();
  }, []);
  flushRef.current = flush;
  useEffect(() => { onRegisterFlush?.(() => flushRef.current()); return () => onRegisterFlush?.(null); }, [onRegisterFlush]);
  useEffect(() => {
    if (!dirty || loading || unresolved || saving || mutationsBlocked || !document) return;
    debounceRef.current = window.setTimeout(() => { debounceRef.current = null; void saveRef.current(); }, AUTOSAVE_MS);
    return () => { if (debounceRef.current !== null) window.clearTimeout(debounceRef.current); };
  }, [dirty, document, loading, mutationsBlocked, saving, unresolved]);

  async function selectDate(date: string): Promise<void> {
    if (date === selectedDate || !(await flush())) return;
    await loadDate(date);
  }

  async function exit(kind: "all" | "standalone" | "project"): Promise<void> {
    if (await flush()) onExit(kind);
  }


  return <main className="shell notes-shell daily-notes-shell">
    {notice && <div className="transient-status notes-action-status" role="status">{notice}</div>}
    <header className="notes-header"><div><p className="eyebrow">Daily</p><h1>デイリーノート</h1></div>
      <label className="notes-kind-filter">ノート種別<select aria-label="ノート種別" value="daily" onChange={(event) => { const value = event.target.value; if (value === "all" || value === "standalone" || value === "project") void exit(value); }}>
        <option value="all">すべて</option><option value="standalone">通常ノート</option><option value="project">プロジェクトノート</option><option value="daily">デイリーノート</option>
      </select></label>
    </header>
    <div className="notes-board">
      <aside className="notes-list" aria-label="デイリーノートの日付一覧"><div className="notes-list-heading"><h2>日付</h2></div>
        {!loading && days.length === 0 && <p className="muted">確立済みの日はありません。</p>}
        <div className="notes-list-items">{days.map((day) => <div className="notes-list-item" key={day.taskchute_day_id}><button type="button" className={day.logical_date === selectedDate ? "active" : ""} onClick={() => void selectDate(day.logical_date)}>{day.logical_date}</button></div>)}</div>
      </aside>
      <section className="notes-editor" aria-label="デイリーノートエディタ">
        <div className="notes-editor-heading"><div><p className="eyebrow">Daily Note</p><h2>{selectedDate ?? "デイリーノート"}</h2></div></div>
        {loading ? <p className="muted">読み込み中…</p> : document ? <>
          <NoteMarkdownEditor value={draftBody} disabled={unresolved || mutationsBlocked} onChange={(value) => { draftRef.current = value; setDraftBody(value); setNotice(null); }} />
          <p className="notes-save-status" role="status" aria-live="polite">{unresolved ? "保存結果未確定" : saving ? "保存中" : dirty ? "未保存" : "保存済み"}{unresolvedRequest && <button type="button" className="notes-inline-retry" onClick={() => void saveRef.current()} disabled={saving}>再試行</button>}</p>
          {error && <p className="error" role="alert">{error}</p>}
        </> : <p className="muted">{error ?? "デイリーノートを選択してください。"}</p>}
      </section>
    </div>
  </main>;
}
