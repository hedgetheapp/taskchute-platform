import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  AddTaskToDayRequest,
  CreateProjectRequest,
  CurrentTaskChuteDayProjection,
  ProjectSummary,
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
  const [pending, setPending] = useState<"login" | "project" | "task" | "logout" | null>(null);
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
      setAuthState("signed-out");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログアウトに失敗しました");
    } finally {
      setPending(null);
    }
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

  return (
    <main className="shell">
      <header className="day-header">
        <div><p className="eyebrow">TaskChuteDay</p><h1>{day.taskchute_day.logical_date}</h1></div>
        <button className="secondary" onClick={() => void logout()} disabled={pending !== null}>
          {pending === "logout" ? "ログアウト中…" : "ログアウト"}
        </button>
      </header>
      <p className="interval">{day.taskchute_day.start_instant} — {day.taskchute_day.end_instant} · revision {day.placement_revision}</p>
      {error && <p role="alert" className="error">{error}</p>}

      <section className="composer-grid">
        <form className="panel" onSubmit={createProject} aria-busy={pending === "project"}>
          <h2>Projectを作成</h2>
          <label>タイトル<input name="title" maxLength={200} required /></label>
          <button disabled={pending !== null}>
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
          <button disabled={pending !== null}>
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
              <ol>{section.entries.map((entry) => (
                <li key={entry.id} data-entry-id={entry.id}>
                  <span>{entry.task.title}</span>
                  <small>{entry.task.project?.title ?? "Projectなし"} · {entry.lifecycle_state}</small>
                </li>
              ))}</ol>
            )}
          </article>
        ))}
      </section>
      <footer>Next: {day.next_entry?.task.title ?? "なし"}</footer>
    </main>
  );
}
