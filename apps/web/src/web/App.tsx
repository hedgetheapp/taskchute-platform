import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AddTaskToDayRequest,
  CompleteEntryRequest,
  CreateProjectRequest,
  CurrentTaskChuteDayProjection,
  EntryProjection,
  ProjectSummary,
  ReorderEntriesRequest,
  SectionProjection,
  StartEntryRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";

type AuthState = "loading" | "signed-out" | "signed-in";
type FocusTarget = { kind: "section" | "entry"; id: string };
type DraftTask = { sectionId: string; title: string };

function isAmbiguousOutcome(caught: unknown): boolean {
  return !(caught instanceof ApiClientError) || caught.code === "infrastructure_ambiguous";
}

function projectionContainsOperation(projection: CurrentTaskChuteDayProjection, operation: AddTaskToDayRequest): boolean {
  return projection.sections.some((section) =>
    section.entries.some((entry) => entry.id === operation.entry_id && entry.task.id === operation.task_id),
  );
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function focusKey(target: FocusTarget): string {
  return `${target.kind}:${target.id}`;
}

function executionLabel(entry: EntryProjection): string {
  if (entry.lifecycle_state === "planned") return `${entry.task.title}を開始`;
  if (entry.lifecycle_state === "running") return `${entry.task.title}を完了`;
  return `${entry.task.title}は完了済み`;
}

function canMoveEntry(section: SectionProjection, entryId: string, delta: -1 | 1): boolean {
  const from = section.entries.findIndex((entry) => entry.id === entryId);
  if (from < 0) return false;
  const entry = section.entries[from];
  const neighbor = section.entries[from + delta];
  return entry?.lifecycle_state === "planned" && neighbor?.lifecycle_state === "planned";
}

export function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [day, setDay] = useState<CurrentTaskChuteDayProjection | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [projectOperation, setProjectOperation] = useState<CreateProjectRequest | null>(null);
  const [taskOperation, setTaskOperation] = useState<AddTaskToDayRequest | null>(null);
  const [reorderOperation, setReorderOperation] = useState<ReorderEntriesRequest | null>(null);
  const [startOperation, setStartOperation] = useState<StartEntryRequest | null>(null);
  const [completeOperation, setCompleteOperation] = useState<CompleteEntryRequest | null>(null);
  const [pending, setPending] = useState<"login" | "project" | "task" | "reorder" | "start" | "complete" | "logout" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftTask, setDraftTask] = useState<DraftTask | null>(null);
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const draftCompositionRef = useRef(false);
  const retainedOperation = projectOperation ?? taskOperation ?? reorderOperation ?? startOperation ?? completeOperation;
  const mutationLocked = pending !== null || retainedOperation !== null;

  const reconcile = useCallback(async () => {
    try {
      const projection = await api.loadDay();
      setDay(projection);
      setAuthState("signed-in");
      return projection;
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        setDay(null);
        setAuthState("signed-out");
        return null;
      }
      throw caught;
    }
  }, []);

  useEffect(() => {
    void reconcile().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "読み込みに失敗しました");
      setAuthState("signed-out");
    });
  }, [reconcile]);

  useEffect(() => {
    if (draftTask) draftInputRef.current?.focus();
  }, [draftTask?.sectionId]);

  useEffect(() => {
    if (!pendingFocusKey || !day) return;
    const target = document.querySelector<HTMLElement>(`[data-focus-key="${pendingFocusKey}"]`);
    if (target) {
      target.focus();
      setPendingFocusKey(null);
    }
  }, [day, pendingFocusKey, showCompleted]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("login");
    setError(null);
    try {
      await api.login(String(form.get("email")), String(form.get("password")));
      await reconcile();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインに失敗しました");
    } finally {
      setPending(null);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationLocked) return;
    const title = String(new FormData(event.currentTarget).get("title")).trim();
    const operation = { operation_id: uuidv7(), project_id: uuidv7(), title };
    setProjectOperation(operation);
    await executeCreateProject(operation);
  }

  async function executeCreateProject(operation: CreateProjectRequest) {
    setPending("project");
    setError(null);
    try {
      const created = await api.createProject(operation);
      setProject(created.project);
      setProjectOperation(null);
      document.querySelector<HTMLFormElement>(".project-form")?.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project作成に失敗しました");
      if (!isAmbiguousOutcome(caught)) setProjectOperation(null);
      if (!(caught instanceof ApiClientError) || caught.reconcile) {
        try { await reconcile(); } catch { /* Preserve the original mutation outcome. */ }
      }
    } finally {
      setPending(null);
    }
  }

  async function executeAddTask(operation: AddTaskToDayRequest) {
    setPending("task");
    setError(null);
    try {
      await api.addTask(operation);
      await reconcile();
      setTaskOperation(null);
      setDraftTask(null);
      setPendingFocusKey(focusKey({ kind: "entry", id: operation.entry_id }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task追加に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setTaskOperation(null);
      try {
        const projection = await reconcile();
        if (ambiguous && projection && projectionContainsOperation(projection, operation)) {
          setTaskOperation(null);
          setDraftTask(null);
          setError(null);
          setPendingFocusKey(focusKey({ kind: "entry", id: operation.entry_id }));
        }
      } catch {
        // Keep the original mutation outcome visible and preserve its logical identity.
      }
    } finally {
      setPending(null);
    }
  }

  async function commitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!day || !draftTask || mutationLocked) return;
    const title = draftTask.title.trim();
    if (!title) return;
    const operation: AddTaskToDayRequest = {
      operation_id: uuidv7(),
      task_id: uuidv7(),
      entry_id: uuidv7(),
      project_id: null,
      title,
      taskchute_day_id: day.taskchute_day.id,
      section_id: draftTask.sectionId,
      expected_placement_revision: day.placement_revision,
    };
    setTaskOperation(operation);
    await executeAddTask(operation);
  }

  async function logout() {
    if (mutationLocked) return;
    setPending("logout");
    setError(null);
    try {
      await api.logout();
      setDay(null);
      setProject(null);
      setProjectOperation(null);
      setTaskOperation(null);
      setReorderOperation(null);
      setStartOperation(null);
      setCompleteOperation(null);
      setDraftTask(null);
      setAuthState("signed-out");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログアウトに失敗しました");
    } finally {
      setPending(null);
    }
  }

  async function executeReorder(operation: ReorderEntriesRequest) {
    setPending("reorder");
    setError(null);
    try {
      await api.reorderEntries(operation);
      await reconcile();
      setReorderOperation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "並び替えに失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setReorderOperation(null);
      try {
        const projection = await reconcile();
        const canonical = projection?.sections.find((candidate) => candidate.id === operation.section_id)?.entries.map((entry) => entry.id);
        if (ambiguous && canonical?.join("\0") === operation.entry_ids.join("\0")) {
          setReorderOperation(null);
          setError(null);
        }
      } catch { /* Preserve the logical operation. */ }
    } finally {
      setPending(null);
    }
  }

  async function moveEntry(sectionId: string, entryId: string, delta: -1 | 1) {
    if (!day || mutationLocked) return;
    const section = day.sections.find((candidate) => candidate.id === sectionId);
    if (!section || !canMoveEntry(section, entryId, delta)) return;
    const ids = section.entries.map((candidate) => candidate.id);
    const from = ids.indexOf(entryId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    const operation: ReorderEntriesRequest = {
      operation_id: uuidv7(),
      taskchute_day_id: day.taskchute_day.id,
      section_id: sectionId,
      entry_ids: ids,
      expected_placement_revision: day.placement_revision,
    };
    setPendingFocusKey(focusKey({ kind: "entry", id: entryId }));
    setReorderOperation(operation);
    await executeReorder(operation);
  }

  async function executeStart(operation: StartEntryRequest) {
    setPending("start");
    setError(null);
    try {
      await api.startEntry(operation);
      await reconcile();
      setStartOperation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "開始に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setStartOperation(null);
      try {
        const projection = await reconcile();
        if (ambiguous && projection?.active_execution?.id === operation.execution_id) {
          setStartOperation(null);
          setError(null);
        }
      } catch { /* Preserve the logical operation. */ }
    } finally {
      setPending(null);
    }
  }

  async function start(entryId: string) {
    if (mutationLocked) return;
    const operation = { operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7() };
    setStartOperation(operation);
    await executeStart(operation);
  }

  async function executeComplete(operation: CompleteEntryRequest) {
    setPending("complete");
    setError(null);
    try {
      await api.completeEntry(operation);
      await reconcile();
      setCompleteOperation(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "完了に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setCompleteOperation(null);
      try {
        const projection = await reconcile();
        const canonical = projection?.sections.flatMap((section) => section.entries).find((entry) => entry.id === operation.entry_id);
        if (ambiguous && (canonical?.lifecycle_state === "completed" || projection?.active_execution === null)) {
          setCompleteOperation(null);
          setError(null);
        }
      } catch { /* Preserve the logical operation. */ }
    } finally {
      setPending(null);
    }
  }

  async function complete(entryId: string) {
    if (!day?.active_execution || day.active_execution.entry_id !== entryId || mutationLocked) return;
    const operation = { operation_id: uuidv7(), entry_id: entryId, execution_id: day.active_execution.id };
    setCompleteOperation(operation);
    await executeComplete(operation);
  }

  if (authState === "loading") return <main className="shell"><p>Server canonical stateを読み込み中…</p></main>;
  if (authState === "signed-out") {
    return (
      <main className="shell auth-shell">
        <section className="panel">
          <p className="eyebrow">TaskChute Platform</p>
          <h1>ログイン</h1>
          <form onSubmit={login} aria-busy={pending === "login"}>
            <label>メール<input name="email" type="email" autoComplete="username" required /></label>
            <label>パスワード<input name="password" type="password" autoComplete="current-password" required /></label>
            <button disabled={pending !== null}>{pending === "login" ? "ログイン中…" : "ログイン"}</button>
          </form>
          {error && <p role="alert" className="error">{error}</p>}
        </section>
      </main>
    );
  }
  if (!day) return null;

  const currentDay = day;
  const allEntries = currentDay.sections.flatMap((section) => section.entries);
  const activeEntry = currentDay.active_execution ? allEntries.find((entry) => entry.id === currentDay.active_execution?.entry_id) : null;

  function focusSurface(element: HTMLElement) {
    element.focus();
  }

  function openDraft(sectionId: string) {
    if (mutationLocked) return;
    if (draftTask?.title.trim()) {
      draftInputRef.current?.focus();
      return;
    }
    setDraftTask({ sectionId, title: "" });
  }

  function handleDraftKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    const composing = event.nativeEvent.isComposing || draftCompositionRef.current;
    if (event.key === "Enter") {
      event.preventDefault();
      if (!composing) event.currentTarget.form?.requestSubmit();
      return;
    }
    if (composing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDraftTask(null);
      const sectionId = draftTask?.sectionId;
      if (sectionId) setPendingFocusKey(focusKey({ kind: "section", id: sectionId }));
    }
  }

  function handleDayKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || isTextEditingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-day-focus-target]"));
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-day-focus-target]") : null;
    const activeIndex = targets.findIndex((target) => target.dataset.focusKey === activeElement?.dataset.focusKey);

    if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const entryId = activeElement?.dataset.entryId;
      if (!entryId) return;
      const section = currentDay.sections.find((candidate) => candidate.entries.some((entry) => entry.id === entryId));
      const delta = event.key === "ArrowUp" ? -1 : 1;
      if (!section || !canMoveEntry(section, entryId, delta)) return;
      event.preventDefault();
      void moveEntry(section.id, entryId, delta);
      return;
    }

    if (key === "j" || event.key === "ArrowDown" || key === "k" || event.key === "ArrowUp") {
      if (targets.length === 0) return;
      event.preventDefault();
      const delta = key === "j" || event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = activeIndex < 0 ? (delta > 0 ? 0 : targets.length - 1) : Math.max(0, Math.min(targets.length - 1, activeIndex + delta));
      targets[nextIndex]?.focus();
    }
  }

  return (
    <main className="shell day-shell" onKeyDown={handleDayKeyDown}>
      <header className="day-header">
        <div>
          <p className="eyebrow">TaskChuteDay</p>
          <h1>{day.taskchute_day.logical_date}</h1>
          <p className="interval">{day.taskchute_day.start_instant} — {day.taskchute_day.end_instant}</p>
        </div>
        <div className="header-actions">
          <details className="project-tools">
            <summary>Project作成</summary>
            <form className="project-form" onSubmit={createProject} aria-busy={pending === "project"}>
              <label>タイトル<input name="title" maxLength={200} required /></label>
              <button disabled={mutationLocked}>
                {pending === "project" ? "作成中…" : "作成"}
              </button>
              {project && <p className="success">作成済み: {project.title}</p>}
            </form>
          </details>
          <button className="secondary" onClick={() => void logout()} disabled={mutationLocked}>
            {pending === "logout" ? "ログアウト中…" : "ログアウト"}
          </button>
        </div>
      </header>

      <div className="day-toolbar" aria-label="Day controls">
        <span>{allEntries.length} tasks</span>
        <span>revision {day.placement_revision}</span>
        <label className="completed-toggle">
          <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
          実行済みを表示
        </label>
      </div>

      {pending === "reorder" && <p role="status">並び替え・照合中…</p>}
      {pending === "task" && <p role="status">Taskを追加・照合中…</p>}
      {pending === "start" && <p role="status">開始・照合中…</p>}
      {pending === "complete" && <p role="status">完了・照合中…</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <section className="day-surface" aria-label="DayBoard">
        <div className="table-heading" aria-hidden="true">
          <span>実行</span><span>Task</span><span>Project</span><span>状態</span><span>並び替え</span>
        </div>
        {day.sections.map((section) => {
          const visibleEntries = showCompleted ? section.entries : section.entries.filter((entry) => entry.lifecycle_state !== "completed");
          const completedCount = section.entries.filter((entry) => entry.lifecycle_state === "completed").length;
          const sectionTarget: FocusTarget = { kind: "section", id: section.id };
          return (
            <div className="section-group" key={section.id}>
              <div
                className="section-summary"
                tabIndex={0}
                data-day-focus-target
                data-focus-key={focusKey(sectionTarget)}
                onClick={(event) => focusSurface(event.currentTarget)}
              >
                <div><strong>{section.title}</strong><span>{completedCount}/{section.entries.length} 実行済み</span></div>
                <button type="button" className="add-task-button" aria-label={`${section.title}にTaskを追加`} title={`${section.title}にTaskを追加`} disabled={mutationLocked} onClick={(event) => { event.stopPropagation(); openDraft(section.id); }}>＋</button>
              </div>

              {draftTask?.sectionId === section.id && (
                <form className="task-row draft-row" aria-label={`${section.title}の新規Task`} onSubmit={commitDraft}>
                  <span className="execution-control is-draft" aria-hidden="true">○</span>
                  <label className="draft-name"><span className="sr-only">Task名</span><input ref={draftInputRef} name="title" maxLength={300} value={draftTask.title} placeholder="Task名を入力…" aria-label={`${section.title}のTask名`} disabled={pending === "task" || taskOperation !== null} onChange={(event) => setDraftTask({ ...draftTask, title: event.target.value })} onCompositionStart={() => { draftCompositionRef.current = true; }} onCompositionEnd={() => { draftCompositionRef.current = false; }} onKeyDown={handleDraftKeyDown} onBlur={(event) => {
                    if (!draftTask.title.trim() && !event.currentTarget.form?.contains(event.relatedTarget as Node | null)) setDraftTask(null);
                  }} /></label>
                  <span className="muted">—</span><span className="muted">未確定</span><span className="muted">Enterで追加</span>
                </form>
              )}

              {visibleEntries.map((entry) => {
                const entryTarget: FocusTarget = { kind: "entry", id: entry.id };
                const isRunning = entry.lifecycle_state === "running";
                const canComplete = isRunning && day.active_execution?.entry_id === entry.id;
                const canMoveUp = canMoveEntry(section, entry.id, -1);
                const canMoveDown = canMoveEntry(section, entry.id, 1);
                return (
                  <div className={`task-row state-${entry.lifecycle_state}`} key={entry.id} tabIndex={0} data-entry-id={entry.id} data-day-focus-target data-focus-key={focusKey(entryTarget)} onClick={(event) => {
                    if (event.target === event.currentTarget || (event.target as HTMLElement).closest(".task-main")) focusSurface(event.currentTarget);
                  }}>
                    {entry.lifecycle_state === "completed" ? (
                      <span className="execution-control completed" aria-label={executionLabel(entry)} title={executionLabel(entry)}>✓</span>
                    ) : (
                      <button type="button" className={`execution-control ${isRunning ? "running" : "planned"}`} aria-label={executionLabel(entry)} title={executionLabel(entry)} disabled={mutationLocked || (entry.lifecycle_state === "planned" ? day.active_execution !== null : !canComplete)} onClick={() => {
                        if (entry.lifecycle_state === "planned") void start(entry.id);
                        else if (canComplete) void complete(entry.id);
                      }}>{isRunning ? "■" : "▶"}</button>
                    )}
                    <div className="task-main"><strong>{entry.task.title}</strong>{day.next_entry?.id === entry.id && <span className="next-label">Next</span>}</div>
                    <span className="project-name">{entry.task.project?.title ?? "—"}</span>
                    <span className="lifecycle-label">{entry.lifecycle_state === "planned" ? "未実行" : entry.lifecycle_state === "running" ? "実行中" : "完了"}</span>
                    <div className="reorder-controls">
                      <button type="button" className="icon-button" aria-label={`${entry.task.title}を上へ`} title="上へ" disabled={mutationLocked || !canMoveUp} onClick={() => void moveEntry(section.id, entry.id, -1)}>↑</button>
                      <button type="button" className="icon-button" aria-label={`${entry.task.title}を下へ`} title="下へ" disabled={mutationLocked || !canMoveDown} onClick={() => void moveEntry(section.id, entry.id, 1)}>↓</button>
                    </div>
                  </div>
                );
              })}
              {visibleEntries.length === 0 && draftTask?.sectionId !== section.id && <p className="empty-row">表示するTaskはありません</p>}
            </div>
          );
        })}
      </section>

      {retainedOperation && pending === null && (
        <section className="panel pending-intent" aria-label="結果未確定の操作">
          <p>結果未確定の操作があります。元の操作だけを再試行するか、client側の保留を破棄してください。</p>
          {projectOperation && <button type="button" onClick={() => void executeCreateProject(projectOperation)}>保留中のProject作成を再試行</button>}
          {taskOperation && <button type="button" onClick={() => void executeAddTask(taskOperation)}>保留中のTask追加を再試行</button>}
          {reorderOperation && <button type="button" onClick={() => void executeReorder(reorderOperation)}>保留中のReorderを再試行</button>}
          {startOperation && <button type="button" onClick={() => void executeStart(startOperation)}>保留中のStartを再試行</button>}
          {completeOperation && <button type="button" onClick={() => void executeComplete(completeOperation)}>保留中のCompleteを再試行</button>}
          <button type="button" className="secondary" onClick={() => {
            setProjectOperation(null); setTaskOperation(null); setReorderOperation(null); setStartOperation(null); setCompleteOperation(null); setError(null);
          }}>保留中のclient操作を破棄</button>
        </section>
      )}

      {day.active_execution && (
        <aside className="floating-runner" aria-label="実行中のTask">
          <div><span className="runner-state">実行中</span><strong>{activeEntry?.task.title ?? "別日の実行中Task"}</strong><small>{day.active_execution.started_at} から</small></div>
          <button type="button" aria-label="実行中のTaskを完了" disabled={mutationLocked} onClick={() => void complete(day.active_execution!.entry_id)}>完了</button>
        </aside>
      )}
    </main>
  );
}
