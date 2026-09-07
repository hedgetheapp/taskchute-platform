import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { updateTaskMetadata } from "../worker/application/task-metadata";
import { uuidv7 } from "../src/shared/uuidv7";

const createdAt = "2026-09-05T00:00:00.000Z";
const now = "2026-09-05T12:00:00.000Z";

async function seed() {
  const userId = uuidv7(); const dayId = uuidv7(); const sectionId = uuidv7();
  const taskId = uuidv7(); const entryId = uuidv7(); const projectId = uuidv7(); const nextProjectId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, createdAt),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, createdAt),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Today', 0, ?)").bind(sectionId, userId, createdAt),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-05', '2026-09-05T00:00:00.000Z', '2026-09-06T00:00:00.000Z', 'UTC', 0, 'compatible', 7, ?)`)
      .bind(dayId, userId, createdAt),
    env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'Old project', ?), (?, ?, 'New project', ?)")
      .bind(projectId, userId, createdAt, nextProjectId, userId, createdAt),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, ?, 'Before', ?)")
      .bind(taskId, userId, projectId, createdAt),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'planned', ?)`)
      .bind(entryId, userId, taskId, dayId, sectionId, createdAt),
  ]);
  return { userId, dayId, taskId, entryId, projectId, nextProjectId };
}

async function seedEstablishedFuture() {
  const fixture = await seed();
  const futureDayId = uuidv7();
  const futureEntryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-06', '2026-09-06T00:00:00.000Z', '2026-09-07T00:00:00.000Z', 'UTC', 0, 'compatible', 11, ?)`)
      .bind(futureDayId, fixture.userId, createdAt),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, 2, 'planned', 900, 360, ?)`)
      .bind(futureEntryId, fixture.userId, fixture.taskId, futureDayId, (await env.APP_DB.prepare(
        "SELECT id FROM sections WHERE app_user_id = ? ORDER BY sort_order LIMIT 1",
      ).bind(fixture.userId).first<{ id: string }>())!.id, createdAt),
  ]);
  return { ...fixture, futureDayId, futureEntryId };
}

describe.sequential("D-060 UpdateTaskMetadata", () => {
  it("updates title and Project by owner-scoped CAS, preserves placement, and replays once", async () => {
    const fixture = await seed();
    const request = { operation_id: uuidv7(), entry_id: fixture.entryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId,
      title: "After", project_id: fixture.nextProjectId };
    const result = await updateTaskMetadata(env.APP_DB, fixture.userId, request, now);
    expect(result).toEqual({ entry_id: fixture.entryId, task_id: fixture.taskId, title: "After",
      project: { id: fixture.nextProjectId, title: "New project" } });
    expect(await updateTaskMetadata(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    expect(await env.APP_DB.prepare("SELECT title, project_id FROM tasks WHERE id = ?").bind(fixture.taskId).first())
      .toEqual({ title: "After", project_id: fixture.nextProjectId });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first<number>("placement_revision"))
      .toBe(7);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = 'UpdateTaskMetadata'")
      .bind(fixture.userId).first<number>("count")).toBe(1);

    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7(),
      expected_title: "Before" }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...request, title: "Other" }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare("SELECT title, project_id FROM tasks WHERE id = ?").bind(fixture.taskId).first())
      .toEqual({ title: "After", project_id: fixture.nextProjectId });
  });

  it("rejects a missing owner Project and non-eligible Routine/cross-owner access without changing Task data", async () => {
    const fixture = await seed();
    const missingProject = { operation_id: uuidv7(), entry_id: fixture.entryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId, title: "After", project_id: uuidv7() };
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, missingProject, now)).rejects.toMatchObject({ code: "resource_not_found" });

    const routineId = uuidv7(); const occurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, materialization_order, created_at)
        VALUES (?, ?, ?, 'daily', '2026-09-05', 1, ?)`)
        .bind(routineId, fixture.userId, fixture.taskId, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(occurrenceId, fixture.userId, routineId, fixture.dayId, createdAt),
      env.APP_DB.prepare("UPDATE entries SET routine_occurrence_id = ? WHERE id = ?").bind(occurrenceId, fixture.entryId),
    ]);
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...missingProject, operation_id: uuidv7(), project_id: null }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const otherUserId = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUserId, createdAt).run();
    await expect(updateTaskMetadata(env.APP_DB, otherUserId, { ...missingProject, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "resource_not_found" });
    expect(await env.APP_DB.prepare("SELECT title, project_id FROM tasks WHERE id = ?").bind(fixture.taskId).first())
      .toEqual({ title: "Before", project_id: fixture.projectId });
  });

  it("allows established future Project set and clear without changing Task/Entry placement", async () => {
    const fixture = await seedEstablishedFuture();
    const setRequest = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId, title: "Before", project_id: fixture.nextProjectId };
    const before = await env.APP_DB.prepare(`SELECT e.taskchute_day_id, e.section_id, e.position, e.lifecycle_state,
        e.estimate_seconds, e.planned_start_minute, d.placement_revision
      FROM entries e JOIN taskchute_days d ON d.id = e.taskchute_day_id WHERE e.id = ?`).bind(fixture.futureEntryId).first();

    const assigned = await updateTaskMetadata(env.APP_DB, fixture.userId, setRequest, now);
    expect(assigned).toEqual({ entry_id: fixture.futureEntryId, task_id: fixture.taskId, title: "Before",
      project: { id: fixture.nextProjectId, title: "New project" } });
    expect(await updateTaskMetadata(env.APP_DB, fixture.userId, setRequest, now)).toEqual(assigned);
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE id = ?").bind(fixture.taskId).first())
      .toEqual({ project_id: fixture.nextProjectId });
    expect(await env.APP_DB.prepare(`SELECT e.taskchute_day_id, e.section_id, e.position, e.lifecycle_state,
        e.estimate_seconds, e.planned_start_minute, d.placement_revision
      FROM entries e JOIN taskchute_days d ON d.id = e.taskchute_day_id WHERE e.id = ?`).bind(fixture.futureEntryId).first())
      .toEqual(before);

    const clearRequest = { ...setRequest, operation_id: uuidv7(), expected_project_id: fixture.nextProjectId, project_id: null };
    expect(await updateTaskMetadata(env.APP_DB, fixture.userId, clearRequest, now)).toEqual({
      entry_id: fixture.futureEntryId, task_id: fixture.taskId, title: "Before", project: null,
    });
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE id = ?").bind(fixture.taskId).first())
      .toEqual({ project_id: null });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = 'UpdateTaskMetadata'")
      .bind(fixture.userId).first<number>("count")).toBe(2);
  });

  it("protects future title, archived assignment, Routine, lifecycle, and past boundaries", async () => {
    const fixture = await seedEstablishedFuture();
    const base = { entry_id: fixture.futureEntryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId, title: "Before" };
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), project_id: fixture.nextProjectId, title: "Renamed" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), project_id: fixture.nextProjectId, expected_title: "Other" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });

    await env.APP_DB.prepare("INSERT INTO project_archives (app_user_id, project_id, archived_at) VALUES (?, ?, ?)")
      .bind(fixture.userId, fixture.nextProjectId, now).run();
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), project_id: fixture.nextProjectId }, now))
      .rejects.toMatchObject({ code: "resource_not_found" });

    const routineId = uuidv7(); const occurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, materialization_order, created_at)
        VALUES (?, ?, ?, 'daily', '2026-09-06', 1, ?)`).bind(routineId, fixture.userId, fixture.taskId, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(occurrenceId, fixture.userId, routineId, fixture.futureDayId, createdAt),
      env.APP_DB.prepare("UPDATE entries SET routine_occurrence_id = ? WHERE id = ?").bind(occurrenceId, fixture.futureEntryId),
    ]);
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), project_id: null }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });

    await env.APP_DB.prepare("UPDATE entries SET routine_occurrence_id = NULL, lifecycle_state = 'running' WHERE id = ?")
      .bind(fixture.futureEntryId).run();
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), project_id: null }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'completed' WHERE id = ?").bind(fixture.futureEntryId).run();
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), project_id: null }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'planned' WHERE id = ?").bind(fixture.futureEntryId).run();
    await env.APP_DB.prepare("UPDATE taskchute_days SET logical_date = '2026-09-04' WHERE id = ?").bind(fixture.futureDayId).run();
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), project_id: null }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("rejects a stale future target moved to another Day without changing metadata", async () => {
    const fixture = await seedEstablishedFuture();
    const otherDayId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-07', '2026-09-07T00:00:00.000Z', '2026-09-08T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(otherDayId, fixture.userId, createdAt).run();
    const request = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId, title: "Before", project_id: fixture.nextProjectId };
    const originalBatch = env.APP_DB.batch.bind(env.APP_DB);
    const moved = new Proxy(env.APP_DB, {
      get(target, property, receiver) {
        if (property === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            await env.APP_DB.prepare("UPDATE entries SET taskchute_day_id = ? WHERE id = ?")
              .bind(otherDayId, fixture.futureEntryId).run();
            return originalBatch(statements);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    await expect(updateTaskMetadata(moved, fixture.userId, request, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE id = ?").bind(fixture.taskId).first())
      .toEqual({ project_id: fixture.projectId });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(fixture.userId, request.operation_id).first<number>("count")).toBe(1);
  });
});
