import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { createStandaloneDocument } from "../worker/application/documents";
import { ensureDailyPrimaryDocument, loadDailyPrimaryDocumentByDate } from "../worker/application/daily-primary-documents";
import { searchInternalDocumentLinks, internalDocumentSearchScanLimit } from "../worker/application/internal-document-links";
import { ensureProjectPrimaryDocument } from "../worker/application/project-primary-documents";
import { ensureTaskPrimaryDocument } from "../worker/application/task-primary-documents";

const now = "2026-10-26T08:00:00.000Z";
let ownerId = "";
let otherOwnerId = "";
let taskId = "";
let projectId = "";
let dayId = "";

beforeEach(async () => {
  ownerId = uuidv7();
  otherOwnerId = uuidv7();
  taskId = uuidv7();
  projectId = uuidv7();
  dayId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(ownerId, now),
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherOwnerId, now),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, NULL, ?, ?)")
      .bind(taskId, ownerId, "Atlas Task", now),
    env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(projectId, ownerId, "Atlas Project", now),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-10-26', '2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, ownerId, now),
  ]);
});

async function standalone(owner: string, title: string, body = "private body") {
  return createStandaloneDocument(env.APP_DB, owner, {
    operation_id: uuidv7(), document_id: uuidv7(), title, markdown_body: body,
  }, now);
}

describe("D-186 internal Markdown link target search", () => {
  it("returns only materialized owner documents, active before labeled archived candidates, without bodies", async () => {
    expect((await searchInternalDocumentLinks(env.APP_DB, ownerId, "")).candidates).toEqual([]);
    const active = await standalone(ownerId, "Atlas active", "must not be returned");
    const archived = await standalone(ownerId, "Atlas archived");
    await env.APP_DB.prepare("UPDATE documents SET archived_at = ? WHERE app_user_id = ? AND document_id = ?")
      .bind(now, ownerId, archived.document.document_id).run();
    await standalone(otherOwnerId, "Atlas other owner");
    const task = await ensureTaskPrimaryDocument(env.APP_DB, ownerId, {
      operation_id: uuidv7(), task_id: taskId, document_id: uuidv7(),
    }, now);
    const project = await ensureProjectPrimaryDocument(env.APP_DB, ownerId, {
      operation_id: uuidv7(), project_id: projectId, document_id: uuidv7(),
    }, now);
    const activeProjectId = uuidv7();
    await env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(activeProjectId, ownerId, "Old Project Title", now).run();
    const activeProject = await ensureProjectPrimaryDocument(env.APP_DB, ownerId, {
      operation_id: uuidv7(), project_id: activeProjectId, document_id: uuidv7(),
    }, now);
    await env.APP_DB.prepare("UPDATE projects SET title = ? WHERE app_user_id = ? AND id = ?")
      .bind("Current Project Title", ownerId, activeProjectId).run();
    await env.APP_DB.prepare("UPDATE tasks SET title = ? WHERE app_user_id = ? AND id = ?")
      .bind("Current Task Title", ownerId, taskId).run();
    await env.APP_DB.prepare("INSERT INTO project_archives (app_user_id, project_id, archived_at) VALUES (?, ?, ?)")
      .bind(ownerId, projectId, now).run();
    const daily = await ensureDailyPrimaryDocument(env.APP_DB, ownerId, {
      operation_id: uuidv7(), taskchute_day_id: dayId, document_id: uuidv7(),
    }, now);

    const activePage = await searchInternalDocumentLinks(env.APP_DB, ownerId, "");
    expect(activePage.candidates.map((candidate) => candidate.document_id)).toEqual(expect.arrayContaining([
      active.document.document_id, task.document.document_id, daily.document.document_id, activeProject.document.document_id,
    ]));
    expect(activePage.candidates.find((candidate) => candidate.document_id === task.document.document_id)?.label).toBe("Current Task Title");
    expect(activePage.candidates.find((candidate) => candidate.document_id === activeProject.document.document_id)?.label).toBe("Current Project Title");
    expect(activePage.candidates.every((candidate) => !candidate.archived)).toBe(true);
    expect(activePage.candidates.some((candidate) => candidate.document_id === archived.document.document_id
      || candidate.document_id === project.document.document_id)).toBe(false);
    expect(activePage.candidates.every((candidate) => !("markdown_body" in candidate))).toBe(true);

    let cursor = activePage.next_cursor;
    const archivedIds: string[] = [];
    while (cursor) {
      const page = await searchInternalDocumentLinks(env.APP_DB, ownerId, "", cursor);
      archivedIds.push(...page.candidates.map((candidate) => candidate.document_id));
      cursor = page.next_cursor;
    }
    expect(archivedIds).toEqual(expect.arrayContaining([
      archived.document.document_id, project.document.document_id,
    ]));
    expect(archivedIds).not.toContain(active.document.document_id);
    expect(archivedIds).not.toContain(task.document.document_id);
    expect(archivedIds).not.toContain(daily.document.document_id);
    expect(JSON.stringify([...activePage.candidates, ...archivedIds])).not.toContain("must not be returned");
    expect((await searchInternalDocumentLinks(env.APP_DB, otherOwnerId, "")).candidates.map((item) => item.document_id))
      .not.toContain(active.document.document_id);
  });

  it("keyset-pages beyond 20 results without repeats and rejects a cursor bound to another query", async () => {
    const created = await Promise.all(Array.from({ length: 25 }, (_, index) => standalone(ownerId, `Pageable ${index}`)));
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await searchInternalDocumentLinks(env.APP_DB, ownerId, "Pageable", cursor ?? undefined);
      expect(page.candidates.length).toBeLessThanOrEqual(20);
      seen.push(...page.candidates.map((candidate) => candidate.document_id));
      cursor = page.next_cursor;
    } while (cursor);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen).toEqual(expect.arrayContaining(created.map((result) => result.document.document_id)));
    await expect(searchInternalDocumentLinks(env.APP_DB, ownerId, "Other", "not-a-valid-cursor"))
      .rejects.toMatchObject({ code: "malformed_request" });
    expect(internalDocumentSearchScanLimit).toBe(100);
  });

  it("daily date resolution is owner-scoped and does not ensure an unmaterialized note", async () => {
    const existing = await ensureDailyPrimaryDocument(env.APP_DB, ownerId, {
      operation_id: uuidv7(), taskchute_day_id: dayId, document_id: uuidv7(),
    }, now);
    await expect(loadDailyPrimaryDocumentByDate(env.APP_DB, ownerId, "2026-10-26"))
      .resolves.toEqual(existing.document);
    await expect(loadDailyPrimaryDocumentByDate(env.APP_DB, otherOwnerId, "2026-10-26"))
      .rejects.toMatchObject({ code: "resource_not_found" });
    const emptyDayId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-10-27', '2026-10-27T00:00:00.000Z', '2026-10-28T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(emptyDayId, ownerId, now).run();
    await expect(loadDailyPrimaryDocumentByDate(env.APP_DB, ownerId, "2026-10-27"))
      .rejects.toMatchObject({ code: "resource_not_found" });
    expect((await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM daily_primary_documents WHERE app_user_id = ? AND taskchute_day_id = ?")
      .bind(ownerId, emptyDayId).first<{ count: number }>())?.count).toBe(0);
  });

  it("uses the existing owner-ordered index for its bounded raw page", async () => {
    const plan = await env.APP_DB.prepare(`EXPLAIN QUERY PLAN
      WITH page AS MATERIALIZED (
        SELECT document_id, kind, title, updated_at, archived_at FROM documents WHERE app_user_id = ?
        ORDER BY updated_at DESC, document_id DESC LIMIT 101
      ) SELECT document_id FROM page ORDER BY updated_at DESC, document_id DESC`)
      .bind(ownerId).all<{ detail: string }>();
    expect(plan.results.map((row) => row.detail).join(" ")).toContain("documents_owner_updated_idx");
  });
});
