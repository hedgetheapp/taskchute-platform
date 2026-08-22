import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  AddTaskToDayRequest,
  CreateProjectRequest,
  CurrentTaskChuteDayProjection,
  CompleteEntryRequest,
  ProjectSummary,
  ReorderEntriesRequest,
  StartEntryRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";

type AuthState = "loading" | "signed-out" | "signed-in";

function isAmbiguousOutcome(caught: unknown): boolean {
  return !(caught instanceof ApiClientError) || caught.code === "infrastructure_ambiguous";
}

function projectionContainsOperation(projection: CurrentTaskChuteDayProjection, operation: AddTaskToDayRequest): boolean {
  return projection.sections.some((section) =>
    section.entries.some((entry) => entry.id === operation.entry_id && entry.task.id === operation.task_id),
  );
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
    const formElement = event.currentTarget;
    const title = String(new FormData(formElement).get("title")).trim();
    const operation = projectOperation ?? { operation_id: uuidv7(), project_id: uuidv7(), title };
    if (!projectOperation) setProjectOperation(operation);
    setPending("project");
    setError(null);
    try {
      const created = await api.createProject(operation);
      setProject(created.project);
      setProjectOperation(null);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project作成に失敗しました");
      if (!isAmbiguousOutcome(caught)) setProjectOperation(null);
      if (!(caught instanceof ApiClientError) || caught.reconcile) {
        try {
          await reconcile();
        } catch {
          // Keep the original mutation outcome visible and preserve its logical identity.
        }
      }
    } finally {
      setPending(null);
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!day) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const operation = taskOperation ?? {
      operation_id: uuidv7(),
      task_id: uuidv7(),
      entry_id: uuidv7(),
      project_id: project?.id ?? null,
      title: String(form.get("title")).trim(),
      taskchute_day_id: day.taskchute_day.id,
      section_id: String(form.get("section_id")),
      expected_placement_revision: day.placement_revision,
    };
    if (!taskOperation) setTaskOperation(operation);
    setPending("task");
    setError(null);
    try {
      await api.addTask(operation);
      await reconcile();
      setTaskOperation(null);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task追加に失敗しました");
      const ambiguous = isAmbiguousOutcome(caught);
      if (!ambiguous) setTaskOperation(null);
      try {
        const projection = await reconcile();
        if (ambiguous && projection && projectionContainsOperation(projection, operation)) {
          setTaskOperation(null);
          setError(null);
          formElement.reset();
        }
      } catch {
        // Keep the original mutation outcome visible and preserve its logical identity.
      }
    } finally {
      setPending(null);
    }
  }

  async function logout() {
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
      setAuthState("signed-out");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログアウトに失敗しました");
    } finally {
      setPending(null);
    }
  }

  async function executeReorder(operation: ReorderEntriesRequest) {
    setPending("reorder"); setError(null);
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
        if (ambiguous && canonical?.join("\0") === operation.entry_ids.join("\0")) { setReorderOperation(null); setError(null); }
      } catch { /* preserve the logical operation */ }
    } finally { setPending(null); }
  }

  async function moveEntry(sectionId: string, entryId: string, delta: -1 | 1) {
    if (!day || reorderOperation || startOperation || completeOperation) return;
    const section = day.sections.find((candidate) => candidate.id === sectionId);
    if (!section) return;
    const ids = section.entries.map((entry) => entry.id);
    const from = ids.indexOf(entryId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    const operation = { operation_id: uuidv7(), taskchute_day_id: day.taskchute_day.id,
      section_id: sectionId, entry_ids: ids, expected_placement_revision: day.placement_revision };
    setReorderOperation(operation);
    await executeReorder(operation);
  }

  async function executeStart(operation: StartEntryRequest) {
    setPending("start"); setError(null);
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
        if (ambiguous && projection?.active_execution?.id === operation.execution_id) { setStartOperation(null); setError(null); }
      } catch { /* preserve the logical operation */ }
    } finally { setPending(null); }
  }

  async function start(entryId: string) {
    if (reorderOperation || startOperation || completeOperation) return;
    const operation = { operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7() };
    setStartOperation(operation);
    await executeStart(operation);
  }

  async function executeComplete(operation: CompleteEntryRequest) {
    setPending("complete"); setError(null);
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
          setCompleteOperation(null); setError(null);
        }
      } catch { /* preserve the logical operation */ }
    } finally { setPending(null); }
  }

  async function complete(entryId: string) {
    if (!day?.active_execution || day.active_execution.entry_id !== entryId || reorderOperation || startOperation || completeOperation) return;
    const operation = { operation_id: uuidv7(), entry_id: entryId, execution_id: day.active_execution.id };
    setCompleteOperation(operation);
    await executeComplete(operation);
  }

  const retainedLifecycleOperation = reorderOperation ?? startOperation ?? completeOperation;
  const unrelatedMutationDisabled = pending !== null || retainedLifecycleOperation !== null;

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

  return (
    <main className="shell">
      <header className="day-header">
        <div><p className="eyebrow">TaskChuteDay</p><h1>{day.taskchute_day.logical_date}</h1></div>
        <button className="secondary" onClick={() => void logout()} disabled={pending !== null}>
          {pending === "logout" ? "ログアウト中…" : "ログアウト"}
        </button>
      </header>
      <p className="interval">{day.taskchute_day.start_instant} — {day.taskchute_day.end_instant} · revision {day.placement_revision}</p>
      <div className="active-execution">
        <span>Active: {day.active_execution ? `${day.active_execution.entry_id}（${day.active_execution.started_at}から）` : "なし"}</span>
        {day.active_execution && (
          <button type="button" disabled={unrelatedMutationDisabled} onClick={() => void complete(day.active_execution!.entry_id)}>
            Complete active Execution
          </button>
        )}
      </div>
      {pending === "reorder" && <p role="status">並び替え・照合中…</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <section className="composer-grid">
        <form className="panel" onSubmit={createProject} aria-busy={pending === "project"}>
          <h2>Projectを作成</h2>
          <label>タイトル<input name="title" maxLength={200} required /></label>
          <button disabled={unrelatedMutationDisabled}>
            {pending === "project" ? "作成中…" : projectOperation ? "同じProject操作を再試行" : "Projectを作成"}
          </button>
          {projectOperation && pending !== "project" && (
            <button type="button" className="secondary" onClick={() => setProjectOperation(null)}>保留中のProject操作を破棄</button>
          )}
          {project && <p className="success">選択中: {project.title}</p>}
        </form>
        <form className="panel" onSubmit={addTask} aria-busy={pending === "task"}>
          <h2>Task + Entryを追加</h2>
          <label>Taskタイトル<input name="title" maxLength={300} required /></label>
          <label>Section<select name="section_id" required>{day.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label>
          <button disabled={unrelatedMutationDisabled}>
            {pending === "task" ? "追加・照合中…" : taskOperation ? "同じTask操作を再試行" : "現在日に追加"}
          </button>
          {taskOperation && pending !== "task" && (
            <button type="button" className="secondary" onClick={() => setTaskOperation(null)}>保留中のTask操作を破棄</button>
          )}
        </form>
      </section>

      <section className="board" aria-label="DayBoard">
        {day.sections.map((section) => (
          <article className="section" key={section.id}>
            <h2>{section.title}</h2>
            {section.entries.length === 0 ? <p className="empty">Entryなし</p> : (
              <ol>{section.entries.map((entry, index) => (
                <li key={entry.id} data-entry-id={entry.id}>
                  <span>{entry.task.title}</span>
                  <small>{entry.task.project?.title ?? "Projectなし"} · {entry.lifecycle_state}</small>
                  <div className="entry-actions">
                    <button type="button" className="secondary" aria-label={`${entry.task.title}を上へ`} disabled={unrelatedMutationDisabled || index === 0} onClick={() => void moveEntry(section.id, entry.id, -1)}>↑</button>
                    <button type="button" className="secondary" aria-label={`${entry.task.title}を下へ`} disabled={unrelatedMutationDisabled || index === section.entries.length - 1} onClick={() => void moveEntry(section.id, entry.id, 1)}>↓</button>
                    {entry.lifecycle_state === "planned" && <button type="button" disabled={unrelatedMutationDisabled || day.active_execution !== null} onClick={() => void start(entry.id)}>{pending === "start" && startOperation?.entry_id === entry.id ? "開始・照合中…" : "Start"}</button>}
                    {entry.lifecycle_state === "running" && day.active_execution?.entry_id === entry.id && <button type="button" disabled={unrelatedMutationDisabled} onClick={() => void complete(entry.id)}>{pending === "complete" ? "完了・照合中…" : "Complete"}</button>}
                  </div>
                </li>
              ))}</ol>
            )}
          </article>
        ))}
      </section>
      <footer>Next: {day.next_entry?.task.title ?? "なし"}</footer>
      {retainedLifecycleOperation && pending === null && (
        <section className="panel pending-intent" aria-label="結果未確定の操作">
          <p>結果未確定の操作があります。元の操作だけを再試行するか、client側の保留を破棄してください。</p>
          {reorderOperation && <button type="button" onClick={() => void executeReorder(reorderOperation)}>保留中のReorderを再試行</button>}
          {startOperation && <button type="button" onClick={() => void executeStart(startOperation)}>保留中のStartを再試行</button>}
          {completeOperation && <button type="button" onClick={() => void executeComplete(completeOperation)}>保留中のCompleteを再試行</button>}
          <button type="button" className="secondary" onClick={() => {
            setReorderOperation(null); setStartOperation(null); setCompleteOperation(null); setError(null);
          }}>保留中のclient操作を破棄</button>
        </section>
      )}
    </main>
  );
}
