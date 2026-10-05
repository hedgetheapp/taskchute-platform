import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { setEntryEstimate } from "../worker/application/entry-planning";
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

async function seedCompletedSharedEntries() {
  const fixture = await seed();
  const secondEntryId = uuidv7();
  const executionId = uuidv7();
  const capturedAt = "2026-09-05T08:00:00.000Z";
  await env.APP_DB.batch([
    env.APP_DB.prepare(`UPDATE entries SET lifecycle_state = 'completed' WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, fixture.entryId),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
      VALUES (?, ?, ?, ?, ?, 2, 'planned', ?)`)
      .bind(secondEntryId, fixture.userId, fixture.taskId, fixture.dayId,
        (await env.APP_DB.prepare("SELECT id FROM sections WHERE app_user_id = ? ORDER BY sort_order LIMIT 1")
          .bind(fixture.userId).first<{ id: string }>())!.id, createdAt),
    env.APP_DB.prepare(`INSERT INTO executions
      (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
      VALUES (?, ?, ?, ?, ?, ?, 'completed')`)
      .bind(executionId, fixture.userId, fixture.entryId, capturedAt, "2026-09-05T08:20:00.000Z", capturedAt),
    env.APP_DB.prepare(`INSERT INTO entry_task_snapshots (app_user_id, entry_id, task_id, task_title, captured_at)
      VALUES (?, ?, ?, 'Before', ?)`)
      .bind(fixture.userId, fixture.entryId, fixture.taskId, capturedAt),
    env.APP_DB.prepare(`INSERT INTO entry_project_snapshots (app_user_id, entry_id, project_id, project_title, captured_at)
      VALUES (?, ?, ?, 'Old project', ?)`)
      .bind(fixture.userId, fixture.entryId, fixture.projectId, capturedAt),
  ]);
  return { ...fixture, secondEntryId, executionId, capturedAt };
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

  it("updates Project for a current running ordinary Entry without changing its Task title or placement", async () => {
    const fixture = await seed();
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running' WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.entryId).run();
    const before = await env.APP_DB.prepare(`SELECT taskchute_day_id, section_id, position, lifecycle_state,
        estimate_seconds, planned_start_minute FROM entries WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, fixture.entryId).first();
    const request = { operation_id: uuidv7(), entry_id: fixture.entryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId, title: "Before", project_id: fixture.nextProjectId };

    const changed = await updateTaskMetadata(env.APP_DB, fixture.userId, request, now);
    expect(changed).toEqual({ entry_id: fixture.entryId, task_id: fixture.taskId, title: "Before",
      project: { id: fixture.nextProjectId, title: "New project" } });
    expect(await updateTaskMetadata(env.APP_DB, fixture.userId, request, now)).toEqual(changed);
    expect(await env.APP_DB.prepare("SELECT title, project_id FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first()).toEqual({ title: "Before", project_id: fixture.nextProjectId });
    expect(await env.APP_DB.prepare(`SELECT taskchute_day_id, section_id, position, lifecycle_state,
        estimate_seconds, planned_start_minute FROM entries WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, fixture.entryId).first()).toEqual(before);
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7(), title: "Renamed" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("corrects an isolated past Planned Task without widening the Task-level edit to siblings", async () => {
    const fixture = await seed();
    await env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-09-04',
      start_instant = '2026-09-04T00:00:00.000Z', end_instant = '2026-09-05T00:00:00.000Z' WHERE id = ?`)
      .bind(fixture.dayId).run();
    const request = { operation_id: uuidv7(), entry_id: fixture.entryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId,
      title: "Past correction", project_id: fixture.nextProjectId };
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, request, now)).resolves.toEqual({
      entry_id: fixture.entryId, task_id: fixture.taskId, title: "Past correction",
      project: { id: fixture.nextProjectId, title: "New project" },
    });
    expect(await env.APP_DB.prepare("SELECT title, project_id FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first()).toEqual({ title: "Past correction", project_id: fixture.nextProjectId });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(7);

    const shared = await seed();
    const otherDayId = uuidv7();
    const otherEntryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-09-04',
        start_instant = '2026-09-04T00:00:00.000Z', end_instant = '2026-09-05T00:00:00.000Z' WHERE id = ?`).bind(shared.dayId),
      env.APP_DB.prepare(`INSERT INTO taskchute_days
        (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
         establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
        VALUES (?, ?, '2026-09-06', '2026-09-06T00:00:00.000Z', '2026-09-07T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
        .bind(otherDayId, shared.userId, createdAt),
      env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
        VALUES (?, ?, ?, ?, (SELECT section_id FROM entries WHERE id = ?), 2, 'planned', ?)`)
        .bind(otherEntryId, shared.userId, shared.taskId, otherDayId, shared.entryId, createdAt),
    ]);
    await expect(updateTaskMetadata(env.APP_DB, shared.userId, { ...request, operation_id: uuidv7(),
      entry_id: shared.entryId, task_id: shared.taskId }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT title, project_id FROM tasks WHERE id = ?").bind(shared.taskId).first())
      .toEqual({ title: "Before", project_id: shared.projectId });
  });

  it("allows estimate correction for a past Running Entry without changing its Execution", async () => {
    const fixture = await seed();
    const executionId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-09-04',
        start_instant = '2026-09-04T00:00:00.000Z', end_instant = '2026-09-05T00:00:00.000Z'
        WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, fixture.dayId),
      env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running', estimate_seconds = 600 WHERE app_user_id = ? AND id = ?")
        .bind(fixture.userId, fixture.entryId),
      env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
        VALUES (?, ?, ?, '2026-09-04T08:00:00.000Z', NULL, '2026-09-04T08:00:00.000Z')`)
        .bind(executionId, fixture.userId, fixture.entryId),
    ]);

    await expect(setEntryEstimate(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, estimate_seconds: 1_200,
    })).resolves.toEqual({ entry_id: fixture.entryId, estimate_seconds: 1_200 });
    expect(await env.APP_DB.prepare("SELECT estimate_seconds, lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.entryId).first()).toEqual({ estimate_seconds: 1_200, lifecycle_state: "running" });
    expect(await env.APP_DB.prepare("SELECT id, started_at, ended_at FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).first()).toEqual({
      id: executionId, started_at: "2026-09-04T08:00:00.000Z", ended_at: null,
    });
  });

  it("corrects a past Running Entry Project through its Entry snapshot without changing shared Task metadata", async () => {
    const fixture = await seedCompletedSharedEntries();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-09-04',
        start_instant = '2026-09-04T00:00:00.000Z', end_instant = '2026-09-05T00:00:00.000Z' WHERE id = ?`).bind(fixture.dayId),
      env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running' WHERE id = ?").bind(fixture.entryId),
      env.APP_DB.prepare("UPDATE executions SET ended_at = NULL, terminal_outcome = NULL WHERE id = ?").bind(fixture.executionId),
    ]);
    const request = { operation_id: uuidv7(), entry_id: fixture.entryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId,
      title: "Before", project_id: fixture.nextProjectId };
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({
      title: "Before", project: { id: fixture.nextProjectId, title: "New project" },
    });
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE id = ?").bind(fixture.taskId).first())
      .toEqual({ project_id: fixture.projectId });
    expect(await env.APP_DB.prepare("SELECT project_id, project_title FROM entry_project_snapshots WHERE entry_id = ?")
      .bind(fixture.entryId).first()).toEqual({ project_id: fixture.nextProjectId, project_title: "New project" });
    expect(await env.APP_DB.prepare("SELECT project_id FROM entry_project_snapshots WHERE entry_id = ?")
      .bind(fixture.entryId).first()).not.toEqual(await env.APP_DB.prepare("SELECT project_id FROM entry_project_snapshots WHERE entry_id = ?")
      .bind(fixture.secondEntryId).first());
  });

  it("corrects a past Routine Project on its occurrence snapshot without changing the Task", async () => {
    const fixture = await seed();
    const routineDefinitionId = uuidv7();
    const routineOccurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-09-04',
        start_instant = '2026-09-04T00:00:00.000Z', end_instant = '2026-09-05T00:00:00.000Z' WHERE id = ?`)
        .bind(fixture.dayId),
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, default_section_id,
         default_planned_start_minute, default_estimate_seconds, materialization_order, defaults_revision, created_at)
        VALUES (?, ?, ?, 'daily', '2026-09-04',
          (SELECT section_id FROM entries WHERE app_user_id = ? AND id = ?), 60, 600, 1, 0, ?)`)
        .bind(routineDefinitionId, fixture.userId, fixture.taskId, fixture.userId, fixture.entryId, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(routineOccurrenceId, fixture.userId, routineDefinitionId, fixture.dayId, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrence_task_snapshots
        (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
        VALUES (?, ?, 'Before', ?, 'Old project')`)
        .bind(fixture.userId, routineOccurrenceId, fixture.projectId),
      env.APP_DB.prepare("UPDATE entries SET routine_occurrence_id = ? WHERE app_user_id = ? AND id = ?")
        .bind(routineOccurrenceId, fixture.userId, fixture.entryId),
    ]);
    const request = { operation_id: uuidv7(), entry_id: fixture.entryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId, title: "Before", project_id: fixture.nextProjectId };

    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, request, now)).resolves.toEqual({
      entry_id: fixture.entryId, task_id: fixture.taskId, title: "Before",
      project: { id: fixture.nextProjectId, title: "New project" },
    });
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first()).toEqual({ project_id: fixture.projectId });
    expect(await env.APP_DB.prepare("SELECT project_id, project_title, task_title FROM routine_occurrence_task_snapshots WHERE app_user_id = ? AND routine_occurrence_id = ?")
      .bind(fixture.userId, routineOccurrenceId).first()).toEqual({
        project_id: fixture.nextProjectId, project_title: "New project", task_title: "Before",
      });
  });

  it("updates reminder intent with Entry CAS, preserves placement, and replays once", async () => {
    const fixture = await seed();
    await env.APP_DB.prepare(`UPDATE entries SET planned_start_minute = 600, estimate_seconds = 900 WHERE id = ?`)
      .bind(fixture.entryId).run();
    const beforeRevision = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision");
    const request = { operation_id: uuidv7(), entry_id: fixture.entryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId, title: "Before", project_id: fixture.projectId,
      start_reminder_offset_minutes: 5, notify_on_estimate_overrun: true };
    const updated = await updateTaskMetadata(env.APP_DB, fixture.userId, request, now);
    expect(await updateTaskMetadata(env.APP_DB, fixture.userId, request, now)).toEqual(updated);
    expect(await env.APP_DB.prepare(`SELECT start_reminder_offset_minutes, notify_on_estimate_overrun FROM entries WHERE id = ?`)
      .bind(fixture.entryId).first()).toEqual({ start_reminder_offset_minutes: 5, notify_on_estimate_overrun: 1 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toEqual(beforeRevision);
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7(),
      start_reminder_offset_minutes: 15, expected_title: "stale" }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const disabled = { ...request, operation_id: uuidv7(), start_reminder_offset_minutes: null,
      notify_on_estimate_overrun: false };
    await updateTaskMetadata(env.APP_DB, fixture.userId, disabled, now);
    expect(await env.APP_DB.prepare(`SELECT start_reminder_offset_minutes, notify_on_estimate_overrun FROM entries WHERE id = ?`)
      .bind(fixture.entryId).first()).toEqual({ start_reminder_offset_minutes: null, notify_on_estimate_overrun: 0 });
  });

  it("supports a future Routine occurrence reminder without changing its Definition and rejects invalid states", async () => {
    const fixture = await seedEstablishedFuture();
    const routineId = uuidv7(); const occurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, default_section_id,
         default_planned_start_minute, default_estimate_seconds, materialization_order, defaults_revision, created_at)
        VALUES (?, ?, ?, 'daily', '2026-09-06', ?, 360, 1200, 1, 0, ?)`)
        .bind(routineId, fixture.userId, fixture.taskId,
          (await env.APP_DB.prepare("SELECT id FROM sections WHERE app_user_id = ? ORDER BY sort_order LIMIT 1")
            .bind(fixture.userId).first<{id:string}>())!.id, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(occurrenceId, fixture.userId, routineId, fixture.futureDayId, createdAt),
      env.APP_DB.prepare("UPDATE entries SET routine_occurrence_id = ?, planned_start_minute = 360, estimate_seconds = 1200 WHERE id = ?")
        .bind(occurrenceId, fixture.futureEntryId),
    ]);
    const request = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, task_id: fixture.taskId,
      expected_title: "Before", expected_project_id: fixture.projectId, title: "Before", project_id: fixture.projectId,
      start_reminder_offset_minutes: 15 };
    await updateTaskMetadata(env.APP_DB, fixture.userId, request, now);
    expect(await env.APP_DB.prepare("SELECT start_reminder_offset_minutes FROM entries WHERE id = ?")
      .bind(fixture.futureEntryId).first()).toEqual({ start_reminder_offset_minutes: 15 });
    expect(await env.APP_DB.prepare("SELECT default_planned_start_minute, default_estimate_seconds FROM routine_definitions WHERE id = ?")
      .bind(routineId).first()).toEqual({ default_planned_start_minute: 360, default_estimate_seconds: 1200 });
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7(),
      start_reminder_offset_minutes: 5, title: "Changed" }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    await env.APP_DB.prepare("UPDATE entries SET estimate_seconds = NULL WHERE id = ?").bind(fixture.futureEntryId).run();
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7(),
      start_reminder_offset_minutes: null, notify_on_estimate_overrun: true }, now)).rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("allows only overrun reminder mutation for ordinary and Routine Running Entries", async () => {
    const ordinary = await seed();
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running', estimate_seconds = 900 WHERE id = ?")
      .bind(ordinary.entryId).run();
    const runningRequest = { operation_id: uuidv7(), entry_id: ordinary.entryId, task_id: ordinary.taskId,
      expected_title: "Before", expected_project_id: ordinary.projectId, title: "Before", project_id: ordinary.projectId,
      notify_on_estimate_overrun: true };
    await updateTaskMetadata(env.APP_DB, ordinary.userId, runningRequest, now);
    expect(await env.APP_DB.prepare("SELECT notify_on_estimate_overrun, start_reminder_offset_minutes FROM entries WHERE id = ?")
      .bind(ordinary.entryId).first()).toEqual({ notify_on_estimate_overrun: 1, start_reminder_offset_minutes: null });
    await expect(updateTaskMetadata(env.APP_DB, ordinary.userId, { ...runningRequest, operation_id: uuidv7(),
      start_reminder_offset_minutes: 5 }, now)).rejects.toMatchObject({ code: "resource_conflict" });

    const routine = await seed();
    const routineId = uuidv7(); const occurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, default_estimate_seconds,
         materialization_order, defaults_revision, created_at)
        VALUES (?, ?, ?, 'daily', '2026-09-05', 900, 1, 0, ?)`)
        .bind(routineId, routine.userId, routine.taskId, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(occurrenceId, routine.userId, routineId, routine.dayId, createdAt),
      env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running', estimate_seconds = 600, routine_occurrence_id = ? WHERE id = ?")
        .bind(occurrenceId, routine.entryId),
    ]);
    const routineRequest = { operation_id: uuidv7(), entry_id: routine.entryId, task_id: routine.taskId,
      expected_title: "Before", expected_project_id: routine.projectId, title: "Before", project_id: routine.projectId,
      notify_on_estimate_overrun: true };
    await updateTaskMetadata(env.APP_DB, routine.userId, routineRequest, now);
    expect(await env.APP_DB.prepare("SELECT default_estimate_seconds FROM routine_definitions WHERE id = ?")
      .bind(routineId).first()).toEqual({ default_estimate_seconds: 900 });
    expect(await env.APP_DB.prepare("SELECT estimate_seconds, notify_on_estimate_overrun, lifecycle_state FROM entries WHERE id = ?")
      .bind(routine.entryId).first()).toEqual({ estimate_seconds: 600, notify_on_estimate_overrun: 1, lifecycle_state: "running" });
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

  it("corrects only a completed Entry historical Project when its Task is shared", async () => {
    const fixture = await seedCompletedSharedEntries();
    await env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-09-04',
      start_instant = '2026-09-04T00:00:00.000Z', end_instant = '2026-09-05T00:00:00.000Z' WHERE id = ?`)
      .bind(fixture.dayId).run();
    const taskBefore = await env.APP_DB.prepare("SELECT id, title, project_id, created_at FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first();
    const entryBefore = await env.APP_DB.prepare(`SELECT e.id, e.task_id, e.taskchute_day_id, e.section_id, e.position,
        e.lifecycle_state, e.estimate_seconds, e.planned_start_minute, d.placement_revision
      FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(fixture.userId, fixture.entryId).first();
    const request = { operation_id: uuidv7(), entry_id: fixture.entryId, task_id: fixture.taskId,
      expected_title: "Before", title: "Before", expected_project_id: fixture.projectId, project_id: fixture.nextProjectId };

    const changed = await updateTaskMetadata(env.APP_DB, fixture.userId, request, now);
    expect(changed).toEqual({ entry_id: fixture.entryId, task_id: fixture.taskId, title: "Before",
      project: { id: fixture.nextProjectId, title: "New project" } });
    expect(await updateTaskMetadata(env.APP_DB, fixture.userId, request, now)).toEqual(changed);
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...request, project_id: null }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare(`SELECT project_id, project_title, captured_at FROM entry_project_snapshots
      WHERE app_user_id = ? AND entry_id = ?`).bind(fixture.userId, fixture.entryId).first())
      .toEqual({ project_id: fixture.nextProjectId, project_title: "New project", captured_at: fixture.capturedAt });
    expect(await env.APP_DB.prepare("SELECT id, title, project_id, created_at FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first()).toEqual(taskBefore);
    expect(await env.APP_DB.prepare("SELECT entry_id FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.secondEntryId).first()).toBeNull();
    expect(await env.APP_DB.prepare(`SELECT e.id, e.task_id, e.taskchute_day_id, e.section_id, e.position,
        e.lifecycle_state, e.estimate_seconds, e.planned_start_minute, d.placement_revision
      FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(fixture.userId, fixture.entryId).first()).toEqual(entryBefore);
    expect(await env.APP_DB.prepare(`SELECT eps.project_id, eps.project_title FROM entry_project_snapshots eps
      WHERE eps.app_user_id = ? AND eps.entry_id = ?`).bind(fixture.userId, fixture.entryId).first())
      .toEqual({ project_id: fixture.nextProjectId, project_title: "New project" });
    expect(await env.APP_DB.prepare(`SELECT t.project_id, t.title FROM entries e JOIN tasks t
      ON t.app_user_id = e.app_user_id AND t.id = e.task_id WHERE e.app_user_id = ? AND e.id = ?`)
      .bind(fixture.userId, fixture.secondEntryId).first()).toEqual({ project_id: fixture.projectId, title: "Before" });

    const clear = { ...request, operation_id: uuidv7(), expected_project_id: fixture.nextProjectId, project_id: null };
    expect(await updateTaskMetadata(env.APP_DB, fixture.userId, clear, now)).toEqual({
      entry_id: fixture.entryId, task_id: fixture.taskId, title: "Before", project: null,
    });
    expect(await env.APP_DB.prepare("SELECT project_id, project_title, captured_at FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).first()).toEqual({ project_id: null, project_title: null, captured_at: fixture.capturedAt });
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first()).toEqual({ project_id: fixture.projectId });

    const assignFromNone = { ...clear, operation_id: uuidv7(), expected_project_id: null, project_id: fixture.nextProjectId };
    await updateTaskMetadata(env.APP_DB, fixture.userId, assignFromNone, now);
    expect(await env.APP_DB.prepare("SELECT project_id, project_title, captured_at FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).first()).toEqual({ project_id: fixture.nextProjectId, project_title: "New project", captured_at: fixture.capturedAt });
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first()).toEqual({ project_id: fixture.projectId });
  });

  it("fails closed for stale completed Project snapshot, title mutation, missing snapshot, and ineligible rows", async () => {
    const fixture = await seedCompletedSharedEntries();
    const base = { entry_id: fixture.entryId, task_id: fixture.taskId, expected_title: "Before", title: "Before",
      expected_project_id: fixture.projectId, project_id: fixture.nextProjectId };
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), expected_project_id: null }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7(), title: "Renamed" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await env.APP_DB.prepare("DELETE FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).run();
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await env.APP_DB.prepare(`INSERT INTO entry_project_snapshots
      (app_user_id, entry_id, project_id, project_title, captured_at) VALUES (?, ?, ?, 'Old project', ?)`)
      .bind(fixture.userId, fixture.entryId, fixture.projectId, fixture.capturedAt).run();
    await env.APP_DB.prepare("UPDATE taskchute_days SET logical_date = '2026-09-06' WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.dayId).run();
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running' WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.entryId).run();
    await expect(updateTaskMetadata(env.APP_DB, fixture.userId, { ...base, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first()).toEqual({ project_id: fixture.projectId });
  });
});
