import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateProjectRequest,
  DeleteProjectRequest,
  ProjectBoardItemProjection,
  ProjectBoardProjection,
  UpdateProjectRequest,
} from "../shared/contracts";
import { uuidv7 } from "../shared/uuidv7";
import { api, ApiClientError } from "./api";

interface ProjectBoardProps {
  onUnauthorized: () => void;
  onProjectsChanged: (projects: Array<{ id: string; title: string }>) => void;
}

function isFormElement(element: Element | null): boolean {
  return element instanceof HTMLElement
    && (element.matches("input, select, textarea, [contenteditable='true']")
      || element.closest("[contenteditable='true']") !== null);
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element && (target instanceof HTMLElement && target.isContentEditable
    || Boolean(target.closest("button, a, input, select, textarea, label, [contenteditable], [role='dialog'], [role='menu']")));
}

function connected(element: HTMLElement | null): HTMLElement | null {
  return element?.isConnected ? element : null;
}

export function ProjectBoard({ onUnauthorized, onProjectsChanged }: ProjectBoardProps) {
  const [board, setBoard] = useState<ProjectBoardProjection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectBoardItemProjection | null>(null);
  const [deleteOperation, setDeleteOperation] = useState<DeleteProjectRequest | null>(null);
  const [createOperation, setCreateOperation] = useState<CreateProjectRequest | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const addRef = useRef<HTMLButtonElement | null>(null);
  const helpRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const modalOriginRef = useRef<HTMLElement | null>(null);
  const fallbackRef = useRef<HTMLElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextBoard, nextProjects] = await Promise.all([api.loadProjectBoard(), api.loadProjects()]);
      setBoard(nextBoard);
      onProjectsChanged(nextProjects.projects);
      setFocusedId((current) => current && nextBoard.projects.some((item) => item.id === current) ? current : null);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : "Project設定の読み込みに失敗しました");
    }
  }, [onProjectsChanged, onUnauthorized]);

  useEffect(() => { void reload(); }, [reload]);

  const visible = useMemo(() => {
    if (!board) return [];
    const lowered = query.trim().toLocaleLowerCase();
    return board.projects.filter((project) => project.archived === (tab === "archived")
      && (!lowered || project.title.toLocaleLowerCase().includes(lowered)));
  }, [board, query, tab]);

  useEffect(() => {
    if (!helpOpen && deleteTarget === null) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modalOriginRef.current === null) modalOriginRef.current = connected(previous) ?? connected(helpRef.current);
    const timer = window.setTimeout(() => modalRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (deleteTarget !== null) setDeleteTarget(null); else setHelpOpen(false);
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]!; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      if (helpOpen || deleteTarget !== null) {
        (connected(modalOriginRef.current) ?? connected(fallbackRef.current) ?? connected(helpRef.current) ?? connected(addRef.current))?.focus();
        modalOriginRef.current = null;
        fallbackRef.current = null;
      }
    };
  }, [deleteTarget, helpOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isFormElement(document.activeElement) || helpOpen || deleteTarget !== null || pending) return;
      if (event.key === "Escape") {
        if (openMenuId !== null) { event.preventDefault(); setOpenMenuId(null); }
        else if (draft) { event.preventDefault(); setDraft(false); }
        else if (editingId !== null) { event.preventDefault(); setEditingId(null); }
        return;
      }
      if (event.key === "?") { event.preventDefault(); setHelpOpen(true); return; }
      if (event.key !== "j" && event.key !== "J" && event.key !== "k" && event.key !== "K"
        && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (visible.length === 0) return;
      event.preventDefault();
      const current = visible.findIndex((item) => item.id === focusedId);
      const down = event.key === "j" || event.key === "J" || event.key === "ArrowDown";
      const nextIndex = current < 0 ? (down ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, current + (down ? 1 : -1)));
      const next = visible[nextIndex];
      if (!next) return;
      setFocusedId(next.id);
      rowRefs.current[next.id]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, draft, editingId, focusedId, helpOpen, openMenuId, pending, visible]);

  async function createProject(titleOrRequest: string | CreateProjectRequest) {
    const request: CreateProjectRequest = typeof titleOrRequest === "string"
      ? { operation_id: uuidv7(), project_id: uuidv7(), title: titleOrRequest.trim() }
      : titleOrRequest;
    if (!request.title || pending) return;
    setCreateOperation(request);
    setPending(true); setError(null); setNotice(null);
    try {
      await api.createProject(request);
      setCreateOperation(null); setDraft(false); await reload(); setNotice("Projectを作成しました");
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else {
        if (caught instanceof ApiClientError && caught.reconcile) setCreateOperation(request);
        setError(caught instanceof Error ? caught.message : "Projectの作成に失敗しました");
      }
    } finally { setPending(false); }
  }

  async function renameProject(project: ProjectBoardItemProjection) {
    const title = editingTitle.trim();
    if (!title || title === project.title || pending) { setEditingId(null); return; }
    const request: UpdateProjectRequest = { operation_id: uuidv7(), project_id: project.id,
      expected_settings_revision: project.settings_revision, expected_title: project.title, title };
    setPending(true); setError(null); setNotice(null);
    try { await api.updateProject(request); setEditingId(null); await reload(); setNotice("Project名を更新しました"); }
    catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : "Project名の更新に失敗しました");
    } finally { setPending(false); }
  }

  async function toggleArchive(project: ProjectBoardItemProjection) {
    if (!board || pending) return;
    setPending(true); setError(null); setNotice(null); setOpenMenuId(null);
    try {
      await api.setProjectArchived({ operation_id: uuidv7(), project_id: project.id,
        archived: !project.archived, expected_settings_revision: project.settings_revision });
      await reload(); setNotice(project.archived ? "Projectを復元しました" : "Projectをアーカイブしました");
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : "Projectの状態更新に失敗しました");
    } finally { setPending(false); }
  }

  async function executeDelete(request: DeleteProjectRequest) {
    if (!board || pending) return;
    setPending(true); setError(null); setNotice(null); setDeleteOperation(request);
    const index = visible.findIndex((project) => project.id === request.project_id);
    const fallback = visible[index + 1] ?? visible[index - 1];
    fallbackRef.current = connected(fallback ? actionRefs.current[fallback.id] : null) ?? connected(addRef.current);
    try {
      await api.deleteProject(request);
      setDeleteOperation(null); setDeleteTarget(null); await reload(); setNotice("Projectを削除しました");
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) onUnauthorized();
      else setError(caught instanceof Error ? caught.message : "Projectの削除に失敗しました");
    } finally { setPending(false); }
  }

  function reorder(sourceId: string, targetId: string, after: boolean) {
    if (!board || sourceId === targetId || pending) return;
    const visibleIds = visible.map((project) => project.id);
    const sourceIndex = visibleIds.indexOf(sourceId); const targetIndex = visibleIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    visibleIds.splice(sourceIndex, 1);
    const insertion = visibleIds.indexOf(targetId) + (after ? 1 : 0);
    visibleIds.splice(insertion, 0, sourceId);
    const reorderedVisible = [...visibleIds];
    const visibleSet = new Set(reorderedVisible); let cursor = 0;
    const projectIds = board.projects.map((project) => visibleSet.has(project.id) ? reorderedVisible[cursor++]! : project.id);
    if (projectIds.every((id, index) => id === board.projects[index]?.id)) return;
    setDraggingId(null); setDragOverId(null); setPending(true); setError(null); setNotice(null);
    void api.reorderProjects({ operation_id: uuidv7(), project_ids: projectIds, expected_board_revision: board.board_revision })
      .then(async () => { await reload(); setNotice("Projectの順序を更新しました"); })
      .catch((caught) => { setError(caught instanceof Error ? caught.message : "Projectの順序更新に失敗しました"); })
      .finally(() => setPending(false));
  }

  if (!board) return <main className="shell settings-project-shell"><p role="status">Project設定を読み込み中…</p></main>;

  return <section className="project-board" aria-label="Project設定">
    <header className="project-board-header"><div><h2>プロジェクト</h2><p>TaskとRoutineで使うProjectを管理します。</p></div>
      <button ref={addRef} type="button" disabled={pending || draft} onClick={() => { setDraft(true); setTab("active"); }}>＋ プロジェクトを追加</button></header>
    <div className="project-board-toolbar">
      <label>検索<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="プロジェクト名" /></label>
      <div role="tablist" aria-label="Project表示">
        <button type="button" role="tab" aria-selected={tab === "active"} onClick={() => setTab("active")}>使用中</button>
        <button type="button" role="tab" aria-selected={tab === "archived"} onClick={() => setTab("archived")}>アーカイブ</button>
      </div>
      <button ref={helpRef} type="button" className="secondary" onClick={() => setHelpOpen(true)}>?</button>
    </div>
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {createOperation && <p className="error project-create-retry" role="status">作成結果を照合できませんでした。<button type="button" onClick={() => void createProject(createOperation)}>保留中のProject作成を再試行</button></p>}
    {deleteOperation && <p className="error project-delete-retry" role="status">削除結果を照合できませんでした。<button type="button" onClick={() => void executeDelete(deleteOperation)}>削除を再試行</button></p>}
    <div className="project-board-table" role="table" aria-label="Project一覧">
      <div className="project-board-row project-board-heading" role="row"><span role="columnheader">プロジェクト名</span><span aria-hidden="true" /></div>
      {draft && tab === "active" && <form className="project-board-row project-board-draft" role="row" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("title"); if (input instanceof HTMLInputElement) void createProject(input.value); }}>
        <span><input name="title" aria-label="新しいプロジェクト名" autoFocus maxLength={200} /></span><span className="project-board-actions"><button type="submit" disabled={pending}>追加</button><button type="button" className="secondary" onClick={() => setDraft(false)}>キャンセル</button></span>
      </form>}
      {visible.map((project) => <div className={`project-board-row${focusedId === project.id ? " is-focused" : ""}${draggingId === project.id ? " is-dragging" : ""}${dragOverId === project.id ? " is-drop-target" : ""}`} role="row" tabIndex={focusedId === project.id || focusedId === null && visible[0]?.id === project.id ? 0 : -1}
        key={project.id} ref={(element) => { rowRefs.current[project.id] = element; }} onFocus={() => setFocusedId(project.id)} draggable={!pending}
        onDragStart={(event) => { if (isInteractiveDragTarget(event.target)) { event.preventDefault(); return; } setDraggingId(project.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", project.id); }}
        onDragEnd={() => { setDraggingId(null); setDragOverId(null); }} onDragOver={(event) => { if (!draggingId || draggingId === project.id) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverId(project.id); }}
        onDrop={(event) => { event.preventDefault(); const source = draggingId ?? event.dataTransfer.getData("text/plain"); const rect = event.currentTarget.getBoundingClientRect(); reorder(source, project.id, event.clientY > rect.top + rect.height / 2); }}>
        <span className="project-board-name">{editingId === project.id ? <input autoFocus aria-label={`${project.title}の名前`} value={editingTitle} maxLength={200} onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => void renameProject(project)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void renameProject(project); } else if (event.key === "Escape") { event.preventDefault(); setEditingId(null); } }} /> : <button type="button" className="project-name-button" onClick={() => { setEditingId(project.id); setEditingTitle(project.title); }}>{project.title}</button>}</span>
        <span className="project-board-actions"><button ref={(element) => { actionRefs.current[project.id] = element; }} type="button" className="project-overflow" aria-label={`${project.title}のメニュー`} aria-expanded={openMenuId === project.id} disabled={pending} onClick={() => setOpenMenuId((current) => current === project.id ? null : project.id)}>…</button>
          {openMenuId === project.id && <span className="project-overflow-menu" role="menu"><button type="button" role="menuitem" onClick={() => void toggleArchive(project)}>{project.archived ? "復元" : "アーカイブ"}</button><button type="button" role="menuitem" className="destructive-action" onClick={() => { setOpenMenuId(null); setDeleteTarget(project); }}>削除</button></span>}</span>
      </div>)}
      {visible.length === 0 && !draft && <p className="muted project-empty">該当するProjectはありません。</p>}
    </div>
    {helpOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}><div ref={modalRef} className="modal-dialog project-help-modal" role="dialog" aria-modal="true" aria-label="Project設定ショートカット" tabIndex={-1}><h2>Project設定ショートカット</h2><ul><li><kbd>J</kbd> / <kbd>↓</kbd> 次のProject</li><li><kbd>K</kbd> / <kbd>↑</kbd> 前のProject</li><li><kbd>?</kbd> ヘルプ</li><li><kbd>Esc</kbd> 閉じる・キャンセル</li></ul><button type="button" onClick={() => setHelpOpen(false)}>閉じる</button></div></div>}
    {deleteTarget && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}><div ref={modalRef} className="modal-dialog" role="dialog" aria-modal="true" aria-label="Project削除確認" tabIndex={-1}><h2>プロジェクトを削除しますか？</h2><p>このプロジェクトは完全に削除され、元に戻せません。このプロジェクトが設定されているTaskは「Projectなし」になります。過去の実行履歴に保存されたProject情報は残ります。</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>キャンセル</button><button type="button" className="destructive" disabled={pending} onClick={() => void executeDelete({ operation_id: uuidv7(), project_id: deleteTarget.id, expected_settings_revision: deleteTarget.settings_revision, expected_board_revision: board.board_revision })}>削除</button></div></div></div>}
  </section>;
}
