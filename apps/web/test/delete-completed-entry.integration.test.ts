import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { deleteCompletedEntry, isDeleteCompletedEntryRequest } from "../worker/application/delete-completed-entry";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-09-02T12:00:00.000Z";

async function seed(options: { dayDate?: string } = {}) {
  const dayDate = options.dayDate ?? "2026-09-02";
  const userId = uuidv7();
  const dayId = uuidv7();
  const sectionId = uuidv7();
  const configurationVersionId = uuidv7();
  const projectId = uuidv7();
  const ordinaryTaskId = uuidv7();
  const routineTaskId = uuidv7();
  const otherTaskId = uuidv7();
  const plannedTaskId = uuidv7();
  const runningTaskId = uuidv7();
  const ordinaryEntryId = uuidv7();
  const routineEntryId = uuidv7();
  const otherEntryId = uuidv7();
  const plannedEntryId = uuidv7();
  const runningEntryId = uuidv7();
  const routineDefinitionId = uuidv7();
  const routineOccurrenceId = uuidv7();
  const ordinaryExecutionIds = [uuidv7(), uuidv7()];
  const routineExecutionId = uuidv7();
  const otherExecutionId = uuidv7();
  const runningExecutionId = uuidv7();
  const snapshotAt = `${dayDate}T05:00:00.000Z`;
  const nextDate = dayDate === "2026-09-01" ? "2026-09-02" : dayDate === "2026-09-03" ? "2026-09-04" : "2026-09-03";

  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'Keep Project', ?)").bind(projectId, userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Day', 0, ?)").bind(sectionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)").bind(configurationVersionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_items (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order) VALUES (?, ?, ?, 'Day', 0, 1440, 0)").bind(userId, configurationVersionId, sectionId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)").bind(userId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days (id, app_user_id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, ?, ?, ?, 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, dayDate, `${dayDate}T00:00:00.000Z`, `${nextDate}T00:00:00.000Z`, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts (app_user_id, taskchute_day_id, section_id,
      configuration_version_id, title, logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Day', 0, 1440, ?, ?, 0)`)
      .bind(userId, dayId, sectionId, configurationVersionId, `${dayDate}T00:00:00.000Z`, `${nextDate}T00:00:00.000Z`),
    ...[
      [ordinaryTaskId, "Ordinary completed"], [routineTaskId, "Routine completed"], [otherTaskId, "Unrelated completed"],
      [plannedTaskId, "Planned"], [runningTaskId, "Running"],
    ].map(([id, title]) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, userId, id === ordinaryTaskId ? projectId : null, title, now)),
    env.APP_DB.prepare(`INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type, start_logical_date,
      end_logical_date, default_section_id, default_estimate_seconds, default_planned_start_minute, materialization_order,
      defaults_revision, created_at) VALUES (?, ?, ?, 'daily', ?, NULL, ?, 600, 60, 1, 0, ?)`)
      .bind(routineDefinitionId, userId, routineTaskId, dayDate, sectionId, now),
    env.APP_DB.prepare("INSERT INTO routine_schedules (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask) VALUES (?, ?, 'daily', NULL, NULL)").bind(userId, routineDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_board_items (app_user_id, routine_definition_id, board_position, settings_revision) VALUES (?, ?, 1, 0)").bind(userId, routineDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(routineOccurrenceId, userId, routineDefinitionId, dayId, now),
    env.APP_DB.prepare("INSERT INTO routine_occurrence_task_snapshots (app_user_id, routine_occurrence_id, task_title, project_id, project_title) VALUES (?, ?, 'Routine completed', NULL, NULL)").bind(userId, routineOccurrenceId),
    ...[
      [ordinaryEntryId, ordinaryTaskId, 1, "completed", null], [routineEntryId, routineTaskId, 2, "completed", routineOccurrenceId],
      [otherEntryId, otherTaskId, 3, "completed", null], [plannedEntryId, plannedTaskId, 4, "planned", null], [runningEntryId, runningTaskId, 5, "running", null],
    ].map(([id, taskId, position, lifecycle, occurrenceId]) => env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 600, 60, ?, ?)`)
      .bind(id, userId, taskId, dayId, sectionId, position, lifecycle, now, occurrenceId)),
    ...[
      [ordinaryExecutionIds[0], ordinaryEntryId, `${dayDate}T05:00:00.000Z`, `${dayDate}T05:10:00.000Z`],
      [ordinaryExecutionIds[1], ordinaryEntryId, `${dayDate}T06:00:00.000Z`, `${dayDate}T06:20:00.000Z`],
      [routineExecutionId, routineEntryId, `${dayDate}T07:00:00.000Z`, `${dayDate}T07:30:00.000Z`],
      [otherExecutionId, otherEntryId, `${dayDate}T08:00:00.000Z`, `${dayDate}T08:10:00.000Z`],
      [runningExecutionId, runningEntryId, `${dayDate}T09:00:00.000Z`, null],
    ].map(([id, entryId, startedAt, endedAt]) => env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, userId, entryId, startedAt, endedAt, endedAt ?? startedAt)),
    env.APP_DB.prepare("INSERT INTO entry_project_snapshots (app_user_id, entry_id, project_id, project_title, captured_at) VALUES (?, ?, ?, 'Keep Project', ?)").bind(userId, ordinaryEntryId, projectId, snapshotAt),
    env.APP_DB.prepare("INSERT INTO lifecycle_command_guards (app_user_id, operation_id, entry_id, execution_id, command_type) VALUES (?, ?, ?, ?, 'CompleteEntry')").bind(userId, uuidv7(), ordinaryEntryId, ordinaryExecutionIds[1]),
  ]);
  return { userId, dayId, projectId, ordinaryTaskId, ordinaryEntryId, routineTaskId, routineDefinitionId, routineOccurrenceId,
    routineEntryId, otherEntryId, plannedEntryId, runningEntryId, ordinaryExecutionIds, routineExecutionId, otherExecutionId };
}

function requestFor(fixture: Awaited<ReturnType<typeof seed>>, entryId: string, revision = 0) {
  return { operation_id: uuidv7(), taskchute_day_id: fixture.dayId, entry_id: entryId, expected_placement_revision: revision };
}

describe.sequential("DeleteCompletedEntry", () => {
  it("deletes ordinary Entry plus all Executions atomically, preserves identity, increments once, and replays", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, fixture.ordinaryEntryId);
    expect(isDeleteCompletedEntryRequest(request)).toBe(true);
    const first = await deleteCompletedEntry(env.APP_DB, fixture.userId, request, now);
    expect(first).toEqual({ entry_id: fixture.ordinaryEntryId, deleted_execution_ids: [...fixture.ordinaryExecutionIds].sort(), taskchute_day_id: fixture.dayId, placement_revision: 1 });
    expect(await deleteCompletedEntry(env.APP_DB, fixture.userId, request, now)).toEqual(first);
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE id = ?").bind(fixture.ordinaryEntryId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE entry_id = ?").bind(fixture.ordinaryEntryId).all()).toMatchObject({ results: [] });
    expect(await env.APP_DB.prepare("SELECT id FROM tasks WHERE id = ?").bind(fixture.ordinaryTaskId).first()).toEqual({ id: fixture.ordinaryTaskId });
    expect(await env.APP_DB.prepare("SELECT id FROM projects WHERE id = ?").bind(fixture.projectId).first()).toEqual({ id: fixture.projectId });
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE id = ?").bind(fixture.otherEntryId).first()).toEqual({ id: fixture.otherEntryId });
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE id = ?").bind(fixture.otherExecutionId).first()).toEqual({ id: fixture.otherExecutionId });
    expect(await env.APP_DB.prepare("SELECT entry_id FROM entry_project_snapshots WHERE entry_id = ?").bind(fixture.ordinaryEntryId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT command_type FROM operations WHERE operation_id = ?").bind(request.operation_id).first()).toEqual({ command_type: "DeleteCompletedEntry" });
    expect(await env.APP_DB.prepare("PRAGMA quick_check").first()).toEqual({ quick_check: "ok" });
    expect(await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).toMatchObject({ results: [] });
  });

  it("deletes a completed Routine Entry but retains occurrence identity and does not rematerialize", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, fixture.routineEntryId);
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({ placement_revision: 1 });
    expect(await env.APP_DB.prepare("SELECT id FROM routine_definitions WHERE id = ?").bind(fixture.routineDefinitionId).first()).toEqual({ id: fixture.routineDefinitionId });
    expect(await env.APP_DB.prepare("SELECT id FROM routine_occurrences WHERE id = ?").bind(fixture.routineOccurrenceId).first()).toEqual({ id: fixture.routineOccurrenceId });
    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id FROM routine_occurrence_task_snapshots WHERE routine_occurrence_id = ?").bind(fixture.routineOccurrenceId).first()).toEqual({ routine_occurrence_id: fixture.routineOccurrenceId });
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE routine_occurrence_id = ?").bind(fixture.routineOccurrenceId).first()).toBeNull();
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    expect([...projection.unsectioned_entries, ...projection.sections.flatMap((section) => section.entries)].some((entry) => entry.id === fixture.routineEntryId)).toBe(false);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE routine_occurrence_id = ?").bind(fixture.routineOccurrenceId).first("count")).toBe(0);
  });

  it.each(["planned", "running"] as const)("rejects %s and keeps all state", async (state) => {
    const fixture = await seed();
    const entryId = state === "planned" ? fixture.plannedEntryId : fixture.runningEntryId;
    const before = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first("placement_revision");
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, requestFor(fixture, entryId), now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE id = ?").bind(entryId).first()).toEqual({ id: entryId });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first("placement_revision")).toEqual(before);
  });

  it("rejects stale, past, future, owner mismatch, active anomaly and operation misuse", async () => {
    const fixture = await seed();
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, requestFor(fixture, fixture.ordinaryEntryId, 1), now)).rejects.toMatchObject({ code: "revision_conflict" });
    const past = await seed({ dayDate: "2026-09-01" });
    await expect(deleteCompletedEntry(env.APP_DB, past.userId, requestFor(past, past.ordinaryEntryId), now)).rejects.toMatchObject({ code: "resource_conflict" });
    const future = await seed({ dayDate: "2026-09-03" });
    await expect(deleteCompletedEntry(env.APP_DB, future.userId, requestFor(future, future.ordinaryEntryId), now)).rejects.toMatchObject({ code: "resource_conflict" });
    const otherUser = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUser, now).run();
    await expect(deleteCompletedEntry(env.APP_DB, otherUser, requestFor(fixture, fixture.ordinaryEntryId), now)).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, requestFor(fixture, fixture.runningEntryId), now)).rejects.toMatchObject({ code: "resource_conflict" });
    const active = await seed();
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'completed' WHERE id = ?").bind(active.runningEntryId).run();
    await expect(deleteCompletedEntry(env.APP_DB, active.userId, requestFor(active, active.runningEntryId), now)).rejects.toMatchObject({ code: "resource_conflict" });
    const successRequest = requestFor(fixture, fixture.ordinaryEntryId);
    await deleteCompletedEntry(env.APP_DB, fixture.userId, successRequest, now);
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, { ...successRequest, entry_id: fixture.otherEntryId }, now)).rejects.toMatchObject({ code: "operation_id_misuse" });
  });

  it("rolls back injected failure and exact retry does not double increment", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, fixture.ordinaryEntryId);
    await env.APP_DB.prepare(`CREATE TRIGGER fail_delete_completed BEFORE DELETE ON entries
      WHEN OLD.id = '${fixture.ordinaryEntryId}' BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END`).run();
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, request, now)).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE id = ?").bind(fixture.ordinaryEntryId).first()).toEqual({ id: fixture.ordinaryEntryId });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE entry_id = ?").bind(fixture.ordinaryEntryId).first("count")).toBe(2);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first("placement_revision")).toBe(0);
    await env.APP_DB.prepare("DROP TRIGGER fail_delete_completed").run();
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({ placement_revision: 1 });
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({ placement_revision: 1 });
  });

  it("converges concurrent distinct deletes to one winner and one conflict", async () => {
    const fixture = await seed();
    const first = requestFor(fixture, fixture.ordinaryEntryId);
    const second = requestFor(fixture, fixture.ordinaryEntryId);
    const outcomes = await Promise.allSettled([
      deleteCompletedEntry(env.APP_DB, fixture.userId, first, now),
      deleteCompletedEntry(env.APP_DB, fixture.userId, second, now),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({ reason: expect.objectContaining({ code: expect.stringMatching(/revision_conflict|resource_conflict/) }) });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first("placement_revision")).toBe(1);
  });
});
