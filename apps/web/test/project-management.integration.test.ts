import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { deleteProject, loadProjectBoard, reorderProjects, setProjectArchived, updateProject } from "../worker/application/project-management";
import { loadProjects } from "../worker/application/load-projects";

const now = "2026-09-05T12:00:00.000Z";

async function seed() {
  const userId = uuidv7();
  const sectionId = uuidv7();
  const dayId = uuidv7();
  const projectId = uuidv7();
  const secondProjectId = uuidv7();
  const taskId = uuidv7();
  const entryId = uuidv7();
  const executionId = uuidv7();
  const routineId = uuidv7();
  const occurrenceId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Today', 0, ?)")
      .bind(sectionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-05', '2026-09-05T00:00:00.000Z', '2026-09-06T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
    env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'Alpha', ?), (?, ?, 'Beta', ?)")
      .bind(projectId, userId, now, secondProjectId, userId, now),
    env.APP_DB.prepare("INSERT INTO project_board_items (app_user_id, project_id, board_position, settings_revision) VALUES (?, ?, 1, 0), (?, ?, 2, 0)")
      .bind(userId, projectId, userId, secondProjectId),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, ?, 'Historical task', ?)")
      .bind(taskId, userId, projectId, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'completed', ?)`)
      .bind(entryId, userId, taskId, dayId, sectionId, now),
    env.APP_DB.prepare("INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(executionId, userId, entryId, "2026-09-05T10:00:00.000Z", "2026-09-05T10:10:00.000Z", now),
    env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, default_section_id,
       default_planned_start_minute, materialization_order, created_at) VALUES (?, ?, ?, 'daily', '2026-09-05', ?, 240, 1, ?)`)
      .bind(routineId, userId, taskId, sectionId, now),
    env.APP_DB.prepare("INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(occurrenceId, userId, routineId, dayId, now),
    env.APP_DB.prepare(`INSERT INTO routine_occurrence_task_snapshots
      (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
      VALUES (?, ?, 'Historical task', ?, 'Alpha')`)
      .bind(userId, occurrenceId, projectId),
  ]);
  return { userId, projectId, secondProjectId, taskId, entryId, executionId, occurrenceId };
}

describe.sequential("D-065 Project management", () => {
  it("orders Projects, supports rename/archive/restore with revisions and replay", async () => {
    const fixture = await seed();
    const initial = await loadProjectBoard(env.APP_DB, fixture.userId);
    expect(initial.projects.map((project) => project.id)).toEqual([fixture.projectId, fixture.secondProjectId]);
    const rename = {
      operation_id: uuidv7(), project_id: fixture.projectId, expected_settings_revision: 0,
      expected_title: "Alpha", title: "Alpha renamed",
    };
    const renamed = await updateProject(env.APP_DB, fixture.userId, rename, now);
    expect(renamed).toEqual({ project: { id: fixture.projectId, title: "Alpha renamed" }, settings_revision: 1 });
    expect(await updateProject(env.APP_DB, fixture.userId, rename, now)).toEqual(renamed);

    const archive = { operation_id: uuidv7(), project_id: fixture.projectId, archived: true, expected_settings_revision: 1 };
    expect(await setProjectArchived(env.APP_DB, fixture.userId, archive, now)).toEqual({
      project_id: fixture.projectId, archived: true, settings_revision: 2,
    });
    expect((await loadProjectBoard(env.APP_DB, fixture.userId)).projects[0]).toMatchObject({ archived: true, settings_revision: 2 });
    expect(await loadProjects(env.APP_DB, fixture.userId)).toEqual({ projects: [{ id: fixture.secondProjectId, title: "Beta" }] });
    const restore = { operation_id: uuidv7(), project_id: fixture.projectId, archived: false, expected_settings_revision: 2 };
    expect(await setProjectArchived(env.APP_DB, fixture.userId, restore, now)).toMatchObject({ archived: false, settings_revision: 3 });
    expect((await loadProjects(env.APP_DB, fixture.userId)).projects.map((project) => project.id)).toEqual([fixture.projectId, fixture.secondProjectId]);
  });

  it("reorders with a board CAS and rejects stale order", async () => {
    const fixture = await seed();
    const request = { operation_id: uuidv7(), project_ids: [fixture.secondProjectId, fixture.projectId], expected_board_revision: 0 };
    expect(await reorderProjects(env.APP_DB, fixture.userId, request, now)).toEqual({
      project_ids: request.project_ids, board_revision: 1,
    });
    expect((await loadProjectBoard(env.APP_DB, fixture.userId)).projects.map((project) => project.id)).toEqual(request.project_ids);
    expect(await reorderProjects(env.APP_DB, fixture.userId, request, now)).toEqual({
      project_ids: request.project_ids, board_revision: 1,
    });
    await expect(reorderProjects(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("hard-deletes only the Project, unassigns Tasks, preserves historical Routine and Execution facts, and replays", async () => {
    const fixture = await seed();
    const request = { operation_id: uuidv7(), project_id: fixture.projectId,
      expected_settings_revision: 0, expected_board_revision: 0 };
    const result = await deleteProject(env.APP_DB, fixture.userId, request, now);
    expect(result).toEqual({ project_id: fixture.projectId, board_revision: 1, unassigned_task_count: 1 });
    expect(await deleteProject(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    expect(await env.APP_DB.prepare("SELECT id FROM projects WHERE id = ?").bind(fixture.projectId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE id = ?").bind(fixture.taskId).first()).toEqual({ project_id: null });
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE id = ?").bind(fixture.entryId).first()).toEqual({ id: fixture.entryId });
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE id = ?").bind(fixture.executionId).first()).toEqual({ id: fixture.executionId });
    expect(await env.APP_DB.prepare("SELECT project_id, project_title FROM routine_occurrence_task_snapshots WHERE routine_occurrence_id = ?")
      .bind(fixture.occurrenceId).first()).toEqual({ project_id: fixture.projectId, project_title: "Alpha" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE operation_id = ?").bind(request.operation_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("PRAGMA quick_check").first()).toEqual({ quick_check: "ok" });
    expect((await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
