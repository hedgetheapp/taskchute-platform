import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { createRoutine } from "../worker/application/routine-board";
import { isRevertEntryStartRequest, isSetExecutionTimesRequest, revertEntryStart, setExecutionTimes } from "../worker/application/execution-correction";
import { uuidv7 } from "../src/shared/uuidv7";

const createdAt = "2026-08-28T05:00:00.000Z";
const now = "2026-08-28T12:00:00.000Z";

async function seedFixture(sectioned = true, plannedStartMinute: number | null = null) {
  const userId = uuidv7();
  const dayId = uuidv7();
  const configurationVersionId = uuidv7();
  const sectionId = uuidv7();
  const daySectionId = uuidv7();
  const nightSectionId = uuidv7();
  const taskId = uuidv7();
  const entryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, createdAt),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 300, ?)")
      .bind(userId, createdAt),
    env.APP_DB.prepare(`INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
      VALUES (?, ?, 'Morning', 0, ?), (?, ?, 'Day', 1, ?), (?, ?, 'Night', 2, ?)`)
      .bind(sectionId, userId, createdAt, daySectionId, userId, createdAt, nightSectionId, userId, createdAt),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 300, ?)")
      .bind(configurationVersionId, userId, createdAt),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Morning', 300, 540, 0), (?, ?, ?, 'Day', 540, 1200, 1), (?, ?, ?, 'Night', 1200, 1740, 2)`)
      .bind(userId, configurationVersionId, sectionId, userId, configurationVersionId, daySectionId,
        userId, configurationVersionId, nightSectionId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-28', '2026-08-28T05:00:00.000Z', '2026-08-29T05:00:00.000Z', 'UTC', 300, 'compatible', 0, ?)`)
      .bind(dayId, userId, createdAt),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Morning', 300, 540, '2026-08-28T05:00:00.000Z', '2026-08-28T09:00:00.000Z', 0)`)
      .bind(userId, dayId, sectionId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Day', 540, 1200, '2026-08-28T09:00:00.000Z', '2026-08-29T00:00:00.000Z', 1)`)
      .bind(userId, dayId, daySectionId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Night', 1200, 1740, '2026-08-29T00:00:00.000Z', '2026-08-29T05:00:00.000Z', 2)`)
      .bind(userId, dayId, nightSectionId, configurationVersionId),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Execution correction', ?)")
      .bind(taskId, userId, createdAt),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'planned', NULL, ?, ?)`)
      .bind(entryId, userId, taskId, dayId, sectioned ? sectionId : null, plannedStartMinute, createdAt),
  ]);
  return { userId, dayId, sectionId, daySectionId, entryId };
}

async function operationCount(userId: string, commandType = "SetExecutionTimes") {
  return (await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = ?")
    .bind(userId, commandType).first<number>("count")) ?? -1;
}

async function addExecution(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  startedAt: string,
  endedAt: string | null,
  dayId = fixture.dayId,
) {
  const taskId = uuidv7();
  const entryId = uuidv7();
  const executionId = uuidv7();
  const nextPosition = (await env.APP_DB.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS position
    FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
    .bind(fixture.userId, dayId, fixture.sectionId).first<number>("position")) ?? 1;
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Blocker', ?)")
      .bind(taskId, fixture.userId, createdAt),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`)
      .bind(entryId, fixture.userId, taskId, dayId, fixture.sectionId, nextPosition, endedAt === null ? "running" : "completed", createdAt),
    env.APP_DB.prepare(`INSERT INTO executions
      (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(executionId, fixture.userId, entryId, startedAt, endedAt, createdAt, endedAt === null ? null : "completed"),
  ]);
  return { taskId, entryId, executionId };
}

async function addOtherDay(fixture: Awaited<ReturnType<typeof seedFixture>>) {
  const otherDayId = uuidv7();
  await env.APP_DB.prepare(`INSERT INTO taskchute_days
    (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
     establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
    VALUES (?, ?, '2026-08-27', '2026-08-27T05:00:00.000Z', '2026-08-28T05:00:00.000Z', 'UTC', 300, 'compatible', 0, ?)`)
    .bind(otherDayId, fixture.userId, createdAt).run();
  return otherDayId;
}

async function makeLifecycleEntry(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  lifecycle: "running" | "completed",
  startedAt: string,
  endedAt: string | null,
) {
  const executionId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("UPDATE entries SET lifecycle_state = ? WHERE app_user_id = ? AND id = ?")
      .bind(lifecycle, fixture.userId, fixture.entryId),
    env.APP_DB.prepare(`INSERT INTO executions
      (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(executionId, fixture.userId, fixture.entryId, startedAt, endedAt, createdAt,
        endedAt === null ? null : "completed"),
  ]);
  return executionId;
}

describe.sequential("D-156 Android lifecycle correction", () => {
  it("accepts only the legacy Running rollback shape or a complete Completed rollback snapshot", () => {
    const legacy = {
      operation_id: uuidv7(), entry_id: uuidv7(), execution_id: uuidv7(),
      expected_started_at: "2026-08-28T06:00:00.000Z",
    };
    expect(isRevertEntryStartRequest(legacy)).toBe(true);
    expect(isRevertEntryStartRequest({
      ...legacy, expected_lifecycle_state: "completed", expected_ended_at: "2026-08-28T06:30:00.000Z",
    })).toBe(true);
    expect(isRevertEntryStartRequest({ ...legacy, expected_lifecycle_state: "completed" })).toBe(false);
    expect(isRevertEntryStartRequest({ ...legacy, expected_ended_at: "2026-08-28T06:30:00.000Z" })).toBe(false);
    expect(isRevertEntryStartRequest({
      ...legacy, expected_lifecycle_state: "running", expected_ended_at: null,
    })).toBe(false);
    expect(isRevertEntryStartRequest({
      ...legacy, expected_lifecycle_state: "completed", expected_ended_at: null,
    })).toBe(false);
  });

  it("directly rolls one ordinary Completed Execution back to Planned atomically and replays exactly", async () => {
    const fixture = await seedFixture(true, 360);
    const executionId = await makeLifecycleEntry(fixture, "completed",
      "2026-08-28T06:00:00.123Z", "2026-08-28T06:30:00.456Z");
    const unrelated = await addExecution(fixture, "2026-08-28T07:00:00.000Z", "2026-08-28T07:15:00.000Z");
    await env.APP_DB.prepare("UPDATE entries SET estimate_seconds = 900 WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.entryId).run();
    const beforeEntry = await env.APP_DB.prepare(`SELECT task_id, taskchute_day_id, section_id, position, lifecycle_state,
        estimate_seconds, planned_start_minute, routine_occurrence_id
      FROM entries WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, fixture.entryId).first<Record<string, unknown>>();
    const beforeTask = await env.APP_DB.prepare(`SELECT title, project_id FROM tasks WHERE app_user_id = ? AND id = (
      SELECT task_id FROM entries WHERE app_user_id = ? AND id = ?)`)
      .bind(fixture.userId, fixture.userId, fixture.entryId).first();
    const beforeRevision = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.dayId).first();
    const beforeUnrelated = await env.APP_DB.prepare("SELECT id, entry_id, started_at, ended_at, terminal_outcome FROM executions WHERE id = ?")
      .bind(unrelated.executionId).first();
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "completed" as const,
      expected_started_at: "2026-08-28T06:00:00.123Z",
      expected_ended_at: "2026-08-28T06:30:00.456Z",
    };

    const result = await revertEntryStart(env.APP_DB, fixture.userId, request, now);
    expect(result).toMatchObject({ lifecycle_state: "planned", execution_id: executionId,
      section_id: fixture.sectionId, planned_start_minute: 360, position: 1, placement_revision: 0 });
    expect(await revertEntryStart(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    await expect(revertEntryStart(env.APP_DB, fixture.userId,
      { ...request, expected_ended_at: "2026-08-28T06:31:00.000Z" }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare(`SELECT task_id, taskchute_day_id, section_id, position, lifecycle_state,
        estimate_seconds, planned_start_minute, routine_occurrence_id
      FROM entries WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, fixture.entryId).first()).toEqual({
      ...beforeEntry, lifecycle_state: "planned",
    });
    expect(await env.APP_DB.prepare(`SELECT title, project_id FROM tasks WHERE app_user_id = ? AND id = (
      SELECT task_id FROM entries WHERE app_user_id = ? AND id = ?)`)
      .bind(fixture.userId, fixture.userId, fixture.entryId).first())
      .toEqual(beforeTask);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.dayId).first()).toEqual(beforeRevision);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT id, entry_id, started_at, ended_at, terminal_outcome FROM executions WHERE id = ?")
      .bind(unrelated.executionId).first()).toEqual(beforeUnrelated);
    expect(await operationCount(fixture.userId, "RevertEntryStart")).toBe(1);
  });

  it("directly rolls a Routine-derived Completed occurrence back without changing occurrence or defaults", async () => {
    const fixture = await seedFixture();
    const routineDefinitionId = uuidv7();
    const routineOccurrenceId = uuidv7();
    const routine = await createRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: routineDefinitionId,
      title: "Completed routine rollback", expected_board_revision: 0,
    }, now);
    const routineEntryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id,
         section_plan_override_present, section_override_id, planned_start_override_minute,
         estimate_override_present, estimate_override_seconds, created_at)
        VALUES (?, ?, ?, ?, 1, ?, 360, 1, 900, ?)`)
        .bind(routineOccurrenceId, fixture.userId, routineDefinitionId, fixture.dayId, fixture.sectionId, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrence_task_snapshots
        (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
        VALUES (?, ?, 'Completed routine rollback', NULL, NULL)`)
        .bind(fixture.userId, routineOccurrenceId),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
        VALUES (?, ?, ?, ?, ?, 2, 'planned', 900, 360, ?, ?)`)
        .bind(routineEntryId, fixture.userId, routine.task_id, fixture.dayId, fixture.sectionId, createdAt, routineOccurrenceId),
    ]);
    const executionId = await makeLifecycleEntry({ ...fixture, entryId: routineEntryId }, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    const beforeOccurrence = await env.APP_DB.prepare(`SELECT section_plan_override_present, section_override_id,
        planned_start_override_minute, estimate_override_present, estimate_override_seconds
      FROM routine_occurrences WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, routineOccurrenceId).first();
    const beforeDefaults = await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute, default_estimate_seconds
      FROM routine_definitions WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, routineDefinitionId).first();

    await revertEntryStart(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: routineEntryId, execution_id: executionId,
      expected_lifecycle_state: "completed", expected_started_at: "2026-08-28T06:00:00.000Z",
      expected_ended_at: "2026-08-28T06:30:00.000Z",
    }, now);

    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id, lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, routineEntryId).first()).toEqual({
      routine_occurrence_id: routineOccurrenceId, lifecycle_state: "planned",
    });
    expect(await env.APP_DB.prepare(`SELECT section_plan_override_present, section_override_id,
        planned_start_override_minute, estimate_override_present, estimate_override_seconds
      FROM routine_occurrences WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, routineOccurrenceId).first())
      .toEqual(beforeOccurrence);
    expect(await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute, default_estimate_seconds
      FROM routine_definitions WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, routineDefinitionId).first())
      .toEqual(beforeDefaults);
  });

  it("rejects stale, wrong-owner, interrupted, multi-segment and wrong-lifecycle Completed rollback without partial writes", async () => {
    const completedRequest = (fixture: Awaited<ReturnType<typeof seedFixture>>, executionId: string, operationId = uuidv7()) => ({
      operation_id: operationId, entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "completed" as const,
      expected_started_at: "2026-08-28T06:00:00.000Z",
      expected_ended_at: "2026-08-28T06:30:00.000Z",
    });

    const staleStart = await seedFixture();
    const staleStartExecution = await makeLifecycleEntry(staleStart, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await expect(revertEntryStart(env.APP_DB, staleStart.userId,
      { ...completedRequest(staleStart, staleStartExecution), expected_started_at: "2026-08-28T06:01:00.000Z" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });

    const staleEnd = await seedFixture();
    const staleEndExecution = await makeLifecycleEntry(staleEnd, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await expect(revertEntryStart(env.APP_DB, staleEnd.userId,
      { ...completedRequest(staleEnd, staleEndExecution), expected_ended_at: "2026-08-28T06:31:00.000Z" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });

    const wrongOwner = await seedFixture();
    const ownedExecution = await makeLifecycleEntry(wrongOwner, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    const otherOwner = await seedFixture();
    await expect(revertEntryStart(env.APP_DB, otherOwner.userId,
      { ...completedRequest(wrongOwner, ownedExecution, uuidv7()) }, now))
      .rejects.toMatchObject({ code: "resource_not_found" });

    const wrongLifecycle = await seedFixture();
    const wrongLifecycleExecution = await makeLifecycleEntry(wrongLifecycle, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running' WHERE app_user_id = ? AND id = ?")
      .bind(wrongLifecycle.userId, wrongLifecycle.entryId).run();
    await expect(revertEntryStart(env.APP_DB, wrongLifecycle.userId,
      completedRequest(wrongLifecycle, wrongLifecycleExecution), now)).rejects.toMatchObject({ code: "resource_conflict" });

    const wrongExecution = await seedFixture();
    const wrongExecutionId = await makeLifecycleEntry(wrongExecution, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    const unrelatedExecution = await addExecution(wrongExecution, "2026-08-28T07:00:00.000Z", "2026-08-28T07:15:00.000Z");
    await expect(revertEntryStart(env.APP_DB, wrongExecution.userId,
      completedRequest(wrongExecution, unrelatedExecution.executionId), now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(wrongExecution.userId, wrongExecution.entryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT ended_at FROM executions WHERE app_user_id = ? AND id = ?")
      .bind(wrongExecution.userId, wrongExecutionId).first()).toEqual({ ended_at: "2026-08-28T06:30:00.000Z" });

    const interrupted = await seedFixture();
    const interruptedExecution = await makeLifecycleEntry(interrupted, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await env.APP_DB.prepare("UPDATE executions SET terminal_outcome = 'interrupted' WHERE app_user_id = ? AND id = ?")
      .bind(interrupted.userId, interruptedExecution).run();
    await expect(revertEntryStart(env.APP_DB, interrupted.userId,
      completedRequest(interrupted, interruptedExecution), now)).rejects.toMatchObject({ code: "resource_conflict" });

    const multi = await seedFixture();
    const firstExecution = await makeLifecycleEntry(multi, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    const secondExecution = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO executions
      (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
      VALUES (?, ?, ?, '2026-08-28T07:00:00.000Z', '2026-08-28T07:15:00.000Z', ?, 'completed')`)
      .bind(secondExecution, multi.userId, multi.entryId, createdAt).run();
    await expect(revertEntryStart(env.APP_DB, multi.userId,
      completedRequest(multi, firstExecution), now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(multi.userId, multi.entryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE app_user_id = ? AND entry_id = ? ORDER BY id")
      .bind(multi.userId, multi.entryId).all()).toMatchObject({ results: [{ id: firstExecution }, { id: secondExecution }] });

    const continuation = await seedFixture();
    const continuationExecution = await makeLifecycleEntry(continuation, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    const chainSibling = await addExecution(continuation, "2026-08-28T07:00:00.000Z", "2026-08-28T07:15:00.000Z");
    await env.APP_DB.prepare("UPDATE entries SET continuation_chain_id = ? WHERE app_user_id = ? AND id = ?")
      .bind(continuation.entryId, continuation.userId, chainSibling.entryId).run();
    await expect(revertEntryStart(env.APP_DB, continuation.userId,
      completedRequest(continuation, continuationExecution), now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(continuation.userId, continuation.entryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(continuation.userId, continuation.entryId).first<number>("count")).toBe(1);
  });

  it("reverts only the current active Execution, preserves placement, replays exactly, and rejects operation misuse", async () => {
    const fixture = await seedFixture(true, 360);
    const executionId = await makeLifecycleEntry(fixture, "running", "2026-08-28T06:00:00.000Z", null);
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_started_at: "2026-08-28T06:00:00.000Z",
    };
    expect(isRevertEntryStartRequest(request)).toBe(true);
    const before = await env.APP_DB.prepare(`SELECT e.section_id, e.planned_start_minute, e.position, d.placement_revision
      FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      WHERE e.id = ?`).bind(fixture.entryId).first();

    const result = await revertEntryStart(env.APP_DB, fixture.userId, request, now);
    expect(result).toMatchObject({ lifecycle_state: "planned", execution_id: executionId,
      section_id: fixture.sectionId, planned_start_minute: 360, position: 1, placement_revision: 0 });
    expect(await revertEntryStart(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    await expect(revertEntryStart(env.APP_DB, fixture.userId,
      { ...request, expected_started_at: "2026-08-28T06:01:00.000Z" }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "planned" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, executionId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT e.section_id, e.planned_start_minute, e.position, d.placement_revision
      FROM entries e JOIN taskchute_days d ON d.app_user_id = e.app_user_id AND d.id = e.taskchute_day_id
      WHERE e.id = ?`).bind(fixture.entryId).first()).toEqual(before);
    expect(await operationCount(fixture.userId, "RevertEntryStart")).toBe(1);
  });

  it("preserves earlier valid execution history when reverting the later active segment", async () => {
    const fixture = await seedFixture();
    const olderExecutionId = uuidv7();
    const activeExecutionId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO executions
        (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
        VALUES (?, ?, ?, '2026-08-28T05:30:00.000Z', '2026-08-28T05:45:00.000Z', ?, 'completed'),
               (?, ?, ?, '2026-08-28T06:00:00.000Z', NULL, ?, NULL)`)
        .bind(olderExecutionId, fixture.userId, fixture.entryId, createdAt,
          activeExecutionId, fixture.userId, fixture.entryId, createdAt),
      env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running' WHERE id = ?").bind(fixture.entryId),
    ]);
    const result = await revertEntryStart(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: activeExecutionId,
      expected_started_at: "2026-08-28T06:00:00.000Z",
    }, now);
    expect(result.lifecycle_state).toBe("planned");
    expect(await env.APP_DB.prepare(`SELECT id, started_at, ended_at, terminal_outcome FROM executions
      WHERE app_user_id = ? AND entry_id = ?`).bind(fixture.userId, fixture.entryId).all())
      .toMatchObject({ results: [{ id: olderExecutionId, started_at: "2026-08-28T05:30:00.000Z",
        ended_at: "2026-08-28T05:45:00.000Z", terminal_outcome: "completed" }] });
  });

  it("supports a Routine-derived current-Day rollback without changing its occurrence or definition", async () => {
    const fixture = await seedFixture();
    const routineDefinitionId = uuidv7();
    const routineOccurrenceId = uuidv7();
    const routine = await createRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: routineDefinitionId,
      title: "Routine rollback", expected_board_revision: 0,
    }, now);
    const routineEntryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(routineOccurrenceId, fixture.userId, routineDefinitionId, fixture.dayId, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrence_task_snapshots
        (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
        VALUES (?, ?, 'Routine rollback', NULL, NULL)`).bind(fixture.userId, routineOccurrenceId),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
        VALUES (?, ?, ?, ?, ?, 2, 'planned', 900, 360, ?, ?)`)
        .bind(routineEntryId, fixture.userId, routine.task_id, fixture.dayId, fixture.sectionId, createdAt, routineOccurrenceId),
    ]);
    const routineFixture = { ...fixture, entryId: routineEntryId };
    const executionId = await makeLifecycleEntry(routineFixture, "running", "2026-08-28T06:00:00.000Z", null);
    const before = await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute, default_estimate_seconds
      FROM routine_definitions WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, routineDefinitionId).first();
    await revertEntryStart(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: routineEntryId, execution_id: executionId,
      expected_started_at: "2026-08-28T06:00:00.000Z",
    }, now);
    expect(await env.APP_DB.prepare(`SELECT routine_occurrence_id, lifecycle_state FROM entries WHERE id = ?`)
      .bind(routineEntryId).first()).toEqual({ routine_occurrence_id: routineOccurrenceId, lifecycle_state: "planned" });
    expect(await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute, default_estimate_seconds
      FROM routine_definitions WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, routineDefinitionId).first()).toEqual(before);
  });

  it("rejects stale and wrong-owner rollback while allowing safe rollback on an established past Day", async () => {
    const fixture = await seedFixture();
    const executionId = await makeLifecycleEntry(fixture, "running", "2026-08-28T06:00:00.000Z", null);
    const base = { operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_started_at: "2026-08-28T06:00:00.000Z" };
    await expect(revertEntryStart(env.APP_DB, fixture.userId,
      { ...base, expected_started_at: "2026-08-28T06:01:00.000Z" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const other = await seedFixture();
    await expect(revertEntryStart(env.APP_DB, other.userId, { ...base, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "resource_not_found" });
    await expect(revertEntryStart(env.APP_DB, fixture.userId,
      { ...base, operation_id: uuidv7(), execution_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "resource_not_found" });

    const pastDayId = await addOtherDay(fixture);
    await env.APP_DB.batch([
      env.APP_DB.prepare("UPDATE entries SET taskchute_day_id = ? WHERE id = ?").bind(pastDayId, fixture.entryId),
      env.APP_DB.prepare("UPDATE executions SET started_at = '2026-08-27T06:00:00.000Z' WHERE id = ?").bind(executionId),
    ]);
    await expect(revertEntryStart(env.APP_DB, fixture.userId, {
      ...base, operation_id: uuidv7(), expected_started_at: "2026-08-27T06:00:00.000Z",
    }, now)).resolves.toMatchObject({ lifecycle_state: "planned", execution_id: executionId });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "planned" });
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE id = ?")
      .bind(executionId).first()).toBeNull();
  });

  it("reopens the same completed Execution, preserves start and placement, clears terminal state, and replays", async () => {
    const fixture = await seedFixture(true, 360);
    const executionId = await makeLifecycleEntry(fixture, "completed",
      "2026-08-28T06:00:00.123Z", "2026-08-28T06:30:00.000Z");
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "completed" as const,
      started_at: "2026-08-28T06:00:00.123Z", ended_at: null,
      expected_started_at: "2026-08-28T06:00:00.123Z", expected_ended_at: "2026-08-28T06:30:00.000Z",
    };
    const result = await setExecutionTimes(env.APP_DB, fixture.userId, request, now);
    expect(result).toMatchObject({ lifecycle_state: "running", execution: { id: executionId,
      started_at: "2026-08-28T06:00:00.123Z", ended_at: null }, placement_revision: 0 });
    expect(await setExecutionTimes(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, { ...request, started_at: "2026-08-28T06:01:00.000Z" }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "running" });
    expect(await env.APP_DB.prepare("SELECT id, started_at, ended_at, terminal_outcome FROM executions WHERE id = ?")
      .bind(executionId).first()).toEqual({ id: executionId, started_at: request.started_at, ended_at: null, terminal_outcome: null });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(0);
  });

  it("rejects a later overlapping Execution but permits exact earlier adjacency", async () => {
    // The canonical one-active-Execution-per-user index makes a second open Execution
    // unrepresentable; exercise the same overlap predicate with a later completed segment.
    const fixture = await seedFixture();
    const executionId = await makeLifecycleEntry(fixture, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await addExecution(fixture, "2026-08-28T06:30:00.000Z", "2026-08-28T07:00:00.000Z");
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "completed", started_at: "2026-08-28T06:00:00.000Z", ended_at: null,
      expected_started_at: "2026-08-28T06:00:00.000Z", expected_ended_at: "2026-08-28T06:30:00.000Z",
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT ended_at, terminal_outcome FROM executions WHERE id = ?")
      .bind(executionId).first()).toEqual({ ended_at: "2026-08-28T06:30:00.000Z", terminal_outcome: "completed" });

    const adjacent = await seedFixture();
    await addExecution(adjacent, "2026-08-28T05:30:00.000Z", "2026-08-28T06:00:00.000Z");
    const adjacentExecutionId = await makeLifecycleEntry(adjacent, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await expect(setExecutionTimes(env.APP_DB, adjacent.userId, {
      operation_id: uuidv7(), entry_id: adjacent.entryId, execution_id: adjacentExecutionId,
      expected_lifecycle_state: "completed", started_at: "2026-08-28T06:00:00.000Z", ended_at: null,
      expected_started_at: "2026-08-28T06:00:00.000Z", expected_ended_at: "2026-08-28T06:30:00.000Z",
    }, now)).resolves.toMatchObject({ lifecycle_state: "running" });
  });

  it("rejects reopen while another Entry is active", async () => {
    const fixture = await seedFixture();
    const executionId = await makeLifecycleEntry(fixture, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await addExecution(fixture, "2026-08-28T07:00:00.000Z", null);
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "completed", started_at: "2026-08-28T06:00:00.000Z", ended_at: null,
      expected_started_at: "2026-08-28T06:00:00.000Z", expected_ended_at: "2026-08-28T06:30:00.000Z",
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT ended_at, terminal_outcome FROM executions WHERE id = ?")
      .bind(executionId).first()).toEqual({ ended_at: "2026-08-28T06:30:00.000Z", terminal_outcome: "completed" });
  });

  it("reopens a Routine-derived occurrence without changing occurrence overrides or Routine defaults", async () => {
    const fixture = await seedFixture();
    const routineDefinitionId = uuidv7();
    const routineOccurrenceId = uuidv7();
    const routine = await createRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: routineDefinitionId,
      title: "Routine reopen", expected_board_revision: 0,
    }, now);
    const routineEntryId = uuidv7();
    const executionId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id,
         section_plan_override_present, section_override_id, planned_start_override_minute,
         estimate_override_present, estimate_override_seconds, created_at)
        VALUES (?, ?, ?, ?, 1, ?, 360, 1, 1200, ?)`)
        .bind(routineOccurrenceId, fixture.userId, routineDefinitionId, fixture.dayId, fixture.sectionId, createdAt),
      env.APP_DB.prepare(`INSERT INTO routine_occurrence_task_snapshots
        (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
        VALUES (?, ?, 'Routine reopen', NULL, NULL)`).bind(fixture.userId, routineOccurrenceId),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
        VALUES (?, ?, ?, ?, ?, 2, 'completed', 1200, 360, ?, ?)`)
        .bind(routineEntryId, fixture.userId, routine.task_id, fixture.dayId, fixture.sectionId, createdAt, routineOccurrenceId),
      env.APP_DB.prepare(`INSERT INTO executions
        (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
        VALUES (?, ?, ?, '2026-08-28T06:00:00.000Z', '2026-08-28T06:20:00.000Z', ?, 'completed')`)
        .bind(executionId, fixture.userId, routineEntryId, createdAt),
    ]);
    const occurrenceBefore = await env.APP_DB.prepare(`SELECT section_plan_override_present, section_override_id,
        planned_start_override_minute, estimate_override_present, estimate_override_seconds
      FROM routine_occurrences WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, routineOccurrenceId).first();
    const definitionBefore = await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute,
        default_estimate_seconds FROM routine_definitions WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, routineDefinitionId).first();

    const result = await setExecutionTimes(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: routineEntryId, execution_id: executionId,
      expected_lifecycle_state: "completed", started_at: "2026-08-28T06:00:00.000Z", ended_at: null,
      expected_started_at: "2026-08-28T06:00:00.000Z", expected_ended_at: "2026-08-28T06:20:00.000Z",
    }, now);
    expect(result).toMatchObject({ lifecycle_state: "running", execution: { id: executionId, ended_at: null } });
    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id, lifecycle_state, section_id, planned_start_minute, estimate_seconds FROM entries WHERE id = ?")
      .bind(routineEntryId).first()).toEqual({ routine_occurrence_id: routineOccurrenceId, lifecycle_state: "running",
        section_id: fixture.sectionId, planned_start_minute: 360, estimate_seconds: 1200 });
    expect(await env.APP_DB.prepare(`SELECT section_plan_override_present, section_override_id,
        planned_start_override_minute, estimate_override_present, estimate_override_seconds
      FROM routine_occurrences WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, routineOccurrenceId).first()).toEqual(occurrenceBefore);
    expect(await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute,
        default_estimate_seconds FROM routine_definitions WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, routineDefinitionId).first()).toEqual(definitionBefore);
  });

  it("reopens the same completed Execution on an established past Day and never reopens an interrupted terminal", async () => {
    const fixture = await seedFixture();
    const pastDayId = await addOtherDay(fixture);
    const executionId = await makeLifecycleEntry(fixture, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await env.APP_DB.prepare("UPDATE entries SET taskchute_day_id = ? WHERE id = ?").bind(pastDayId, fixture.entryId).run();
    await env.APP_DB.prepare("UPDATE executions SET started_at = '2026-08-27T06:00:00.000Z', ended_at = '2026-08-27T06:30:00.000Z' WHERE id = ?")
      .bind(executionId).run();
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "completed" as const, started_at: "2026-08-27T06:00:00.000Z", ended_at: null,
      expected_started_at: "2026-08-27T06:00:00.000Z", expected_ended_at: "2026-08-27T06:30:00.000Z",
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now))
      .resolves.toMatchObject({ lifecycle_state: "running", execution: { id: executionId, ended_at: null } });
    await env.APP_DB.batch([
      env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'completed' WHERE id = ?").bind(fixture.entryId),
      env.APP_DB.prepare("UPDATE executions SET ended_at = '2026-08-27T06:30:00.000Z', terminal_outcome = 'interrupted' WHERE id = ?").bind(executionId),
    ]);
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7(), ended_at: null }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT ended_at, terminal_outcome FROM executions WHERE id = ?")
      .bind(executionId).first()).toEqual({ ended_at: "2026-08-27T06:30:00.000Z", terminal_outcome: "interrupted" });
  });

  it("keeps current-Day reopening bound to the Day's established timezone and boundary", async () => {
    const fixture = await seedFixture();
    const executionId = await makeLifecycleEntry(fixture, "completed",
      "2026-08-28T06:00:00.000Z", "2026-08-28T06:30:00.000Z");
    await env.APP_DB.prepare("UPDATE user_settings SET day_boundary_minutes = 360 WHERE app_user_id = ?")
      .bind(fixture.userId).run();

    await expect(setExecutionTimes(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "completed", started_at: "2026-08-28T06:00:00.000Z", ended_at: null,
      expected_started_at: "2026-08-28T06:00:00.000Z", expected_ended_at: "2026-08-28T06:30:00.000Z",
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });

    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.entryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT ended_at FROM executions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, executionId).first()).toEqual({ ended_at: "2026-08-28T06:30:00.000Z" });
  });
});

describe.sequential("D-060 SetExecutionTimes", () => {
  it("corrects a previous-Day completed end after the Day boundary with the same Entry and Execution", async () => {
    const fixture = await seedFixture();
    const executionId = uuidv7();
    const startedAt = "2026-08-28T22:00:00.000Z";
    const endedAt = "2026-08-29T08:00:00.000Z";
    const result = await setExecutionTimes(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "planned", started_at: startedAt, ended_at: endedAt,
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
      input_precision: "minute",
    }, "2026-08-29T12:00:00.000Z");
    expect(result).toMatchObject({ entry_id: fixture.entryId, lifecycle_state: "completed",
      execution: { id: executionId, started_at: startedAt, ended_at: endedAt } });
    expect(await env.APP_DB.prepare("SELECT taskchute_day_id, lifecycle_state FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ taskchute_day_id: fixture.dayId, lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT id, started_at, ended_at, terminal_outcome FROM executions WHERE entry_id = ?")
      .bind(fixture.entryId).first()).toEqual({ id: executionId, started_at: startedAt, ended_at: endedAt, terminal_outcome: "completed" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE entry_id = ?")
      .bind(fixture.entryId).first<number>("count")).toBe(1);
  });

  it("creates and corrects actual facts without changing planned placement, then reloads the projection", async () => {
    const fixture = await seedFixture();
    const executionId = uuidv7();
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:00:00.312Z", ended_at: "2026-08-28T06:15:00.512Z",
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
    };
    const first = await setExecutionTimes(env.APP_DB, fixture.userId, request, now);
    expect(first).toMatchObject({ entry_id: fixture.entryId, lifecycle_state: "completed",
      section_id: fixture.sectionId, planned_start_minute: null, position: 1, placement_revision: 0,
      execution: { id: executionId, started_at: request.started_at, ended_at: request.ended_at } });
    expect(await setExecutionTimes(env.APP_DB, fixture.userId, request, now)).toEqual(first);
    expect(await operationCount(fixture.userId)).toBe(1);
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "completed", section_id: fixture.sectionId, planned_start_minute: null });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(0);

    const correction = { ...request, operation_id: uuidv7(), expected_lifecycle_state: "completed" as const,
      expected_started_at: request.started_at, expected_ended_at: request.ended_at,
      started_at: "2026-08-28T06:05:00.312Z", ended_at: "2026-08-28T06:20:00.512Z" };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, correction, now)).resolves.toMatchObject({
      lifecycle_state: "completed", placement_revision: 0,
      execution: { started_at: correction.started_at, ended_at: correction.ended_at },
    });
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, { ...correction, operation_id: uuidv7(), ended_at: null }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    const projected = projection.sections[0]?.entries.find((entry) => entry.id === fixture.entryId);
    expect(projected).toMatchObject({ lifecycle_state: "completed", execution_summary: {
      first_started_at: correction.started_at, last_ended_at: correction.ended_at,
    } });
    expect(await operationCount(fixture.userId)).toBe(3);
  });

  it("moves a sectioned Planned Entry to the actual Running Section and preserves planned start", async () => {
    const fixture = await seedFixture(true, 480);
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(),
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T10:30:00.000Z", ended_at: null,
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
    };
    const started = await setExecutionTimes(env.APP_DB, fixture.userId, request, now);
    expect(started).toMatchObject({ lifecycle_state: "running", section_id: fixture.daySectionId,
      planned_start_minute: 480, placement_revision: 1 });
    expect(await setExecutionTimes(env.APP_DB, fixture.userId, request, now)).toEqual(started);
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "running", section_id: fixture.daySectionId, planned_start_minute: 480 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).first<number>("count")).toBe(1);
  });

  it("moves a sectioned Planned Entry to the actual Completed Section with canonical execution facts", async () => {
    const fixture = await seedFixture(true, 480);
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(),
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T10:30:00.000Z", ended_at: "2026-08-28T10:45:00.000Z",
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({
      lifecycle_state: "completed", section_id: fixture.daySectionId, planned_start_minute: 480, placement_revision: 1,
      execution: { started_at: request.started_at, ended_at: request.ended_at },
    });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "completed", section_id: fixture.daySectionId, planned_start_minute: 480 });
    expect(await env.APP_DB.prepare("SELECT started_at, ended_at FROM executions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, request.execution_id).first()).toEqual({ started_at: request.started_at, ended_at: request.ended_at });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(1);
  });

  it("keeps a same-Section Planned transition at the same placement revision", async () => {
    const fixture = await seedFixture(true, 480);
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(),
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:30:00.000Z", ended_at: null,
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({
      lifecycle_state: "running", section_id: fixture.sectionId, planned_start_minute: 480, placement_revision: 0,
    });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(0);
  });

  it("rejects a stale cross-Section placement revision without partial writes", async () => {
    const fixture = await seedFixture(true, 480);
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(),
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T10:30:00.000Z", ended_at: null,
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 1,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "planned", section_id: fixture.sectionId, planned_start_minute: 480 });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(0);
  });

  it("rejects an unresolved actual Section without partial writes", async () => {
    const fixture = await seedFixture(true, 480);
    await env.APP_DB.prepare("DELETE FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ?")
      .bind(fixture.userId, fixture.dayId).run();
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(),
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:30:00.000Z", ended_at: null,
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ lifecycle_state: "planned", section_id: fixture.sectionId, planned_start_minute: 480 });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(0);
  });
  it("resolves Sectionなし actual start with one placement revision and protects retry, overlap, future, and owner boundaries", async () => {
    const fixture = await seedFixture(false);
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(),
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:30:00.000Z", ended_at: null,
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
    };
    const started = await setExecutionTimes(env.APP_DB, fixture.userId, request, now);
    expect(started).toMatchObject({ lifecycle_state: "running", section_id: fixture.sectionId,
      planned_start_minute: null, position: 1, placement_revision: 1 });
    expect(await setExecutionTimes(env.APP_DB, fixture.userId, request, now)).toEqual(started);
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ section_id: fixture.sectionId, planned_start_minute: null });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(1);

    const completed = { operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: request.execution_id,
      expected_lifecycle_state: "running" as const, expected_started_at: request.started_at, expected_ended_at: null,
      started_at: "2026-08-28T06:35:00.000Z", ended_at: "2026-08-28T06:45:00.000Z" };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, completed, now)).resolves.toMatchObject({ lifecycle_state: "completed", placement_revision: 1 });

    const stale = { ...request, operation_id: uuidv7(), started_at: "2026-08-28T07:00:00.000Z" };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, stale, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const future = { ...request, operation_id: uuidv7(), started_at: "2026-08-28T12:01:00.000Z" };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, future, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const other = await seedFixture();
    await expect(setExecutionTimes(env.APP_DB, other.userId, { ...request, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "resource_not_found" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(1);
    expect(await operationCount(fixture.userId)).toBe(4);
  });

  it("snaps a minute-marked start to the maximum same-minute completed blocker and replays it", async () => {
    const fixture = await seedFixture(true);
    const blocker = await addExecution(fixture, "2026-08-28T05:50:00.000Z", "2026-08-28T06:16:01.000Z");
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(),
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:16:00.000Z", ended_at: "2026-08-28T06:30:00.000Z",
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
      input_precision: "minute" as const,
    };
    const result = await setExecutionTimes(env.APP_DB, fixture.userId, request, now);
    expect(result).toMatchObject({ lifecycle_state: "completed", placement_revision: 0,
      execution: { started_at: "2026-08-28T06:16:01.000Z", ended_at: request.ended_at } });
    expect(await setExecutionTimes(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    await expect(setExecutionTimes(env.APP_DB, fixture.userId,
      { ...request, ended_at: "2026-08-28T06:31:00.000Z" }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare("SELECT started_at, ended_at FROM executions WHERE id = ?")
      .bind(blocker.executionId).first()).toEqual({ started_at: "2026-08-28T05:50:00.000Z", ended_at: "2026-08-28T06:16:01.000Z" });
  });

  it("chooses the maximum eligible blocker end", async () => {
    const fixture = await seedFixture(true);
    await addExecution(fixture, "2026-08-28T05:40:00.000Z", "2026-08-28T06:16:01.000Z");
    await addExecution(fixture, "2026-08-28T05:50:00.000Z", "2026-08-28T06:16:02.000Z");
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:16:00.000Z", ended_at: "2026-08-28T06:30:00.000Z", expected_started_at: null,
      expected_ended_at: null, expected_placement_revision: 0, input_precision: "minute" as const,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({
      execution: { started_at: "2026-08-28T06:16:02.000Z" },
    });
  });

  it("applies minute adjacency to an existing execution correction while excluding that execution", async () => {
    const fixture = await seedFixture(true);
    const ownExecutionId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'completed' WHERE id = ?").bind(fixture.entryId),
      env.APP_DB.prepare(`INSERT INTO executions
        (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
        VALUES (?, ?, ?, '2026-08-28T06:00:00.000Z', '2026-08-28T06:10:00.000Z', ?, 'completed')`)
        .bind(ownExecutionId, fixture.userId, fixture.entryId, createdAt),
    ]);
    await addExecution(fixture, "2026-08-28T05:50:00.000Z", "2026-08-28T06:16:01.000Z");
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: ownExecutionId,
      expected_lifecycle_state: "completed" as const,
      started_at: "2026-08-28T06:16:00.000Z", ended_at: "2026-08-28T06:30:00.000Z",
      expected_started_at: "2026-08-28T06:00:00.000Z", expected_ended_at: "2026-08-28T06:10:00.000Z",
      input_precision: "minute" as const,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({
      lifecycle_state: "completed", execution: { id: ownExecutionId, started_at: "2026-08-28T06:16:01.000Z" },
    });
  });

  it("keeps exact callers unsnapped and rejects unknown or non-boundary precision", async () => {
    const fixture = await seedFixture(true);
    await addExecution(fixture, "2026-08-28T05:50:00.000Z", "2026-08-28T06:16:01.000Z");
    const exact = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:16:00.000Z", ended_at: "2026-08-28T06:30:00.000Z", expected_started_at: null,
      expected_ended_at: null, expected_placement_revision: 0,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, exact, now)).rejects.toMatchObject({ code: "resource_conflict" });
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, { ...exact, operation_id: uuidv7(), input_precision: "second" as never }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, { ...exact, operation_id: uuidv7(), started_at: "2026-08-28T06:16:00.500Z", input_precision: "minute" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(isSetExecutionTimesRequest({ ...exact, input_precision: "minute" })).toBe(true);
    expect(isSetExecutionTimesRequest(exact)).toBe(true);
    expect(isSetExecutionTimesRequest({ ...exact, input_precision: "second" })).toBe(false);
  });

  it("rejects active, next-minute, future-start, residual-overlap, end, and future-time cases", async () => {
    const cases = [
      { name: "active", blockerStart: "2026-08-28T05:50:00.000Z", blockerEnd: null, expected: "resource_conflict" },
      { name: "next-minute", blockerStart: "2026-08-28T05:50:00.000Z", blockerEnd: "2026-08-28T06:17:00.000Z", expected: "resource_conflict" },
      { name: "future-start", blockerStart: "2026-08-28T06:16:00.500Z", blockerEnd: "2026-08-28T06:16:30.000Z", expected: "resource_conflict" },
      { name: "end-before-effective", blockerStart: "2026-08-28T05:50:00.000Z", blockerEnd: "2026-08-28T06:16:01.000Z", end: "2026-08-28T06:16:00.500Z", expected: "resource_conflict" },
      { name: "future", blockerStart: "2026-08-28T05:50:00.000Z", blockerEnd: null, start: "2026-08-28T12:01:00.000Z", expected: "resource_conflict" },
    ];
    for (const testCase of cases) {
      const fixture = await seedFixture(true);
      await addExecution(fixture, testCase.blockerStart, testCase.blockerEnd);
      const request = {
        operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
        started_at: testCase.start ?? "2026-08-28T06:16:00.000Z", ended_at: testCase.end ?? "2026-08-28T06:30:00.000Z",
        expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0, input_precision: "minute" as const,
      };
      await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now), testCase.name)
        .rejects.toMatchObject({ code: testCase.expected });
      expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?").bind(fixture.entryId).first())
        .toEqual({ lifecycle_state: "planned" });
    }
  });

  it("allows zero-duration at the effective end and ignores blockers from another Day", async () => {
    const fixture = await seedFixture(true);
    const otherDayId = await addOtherDay(fixture);
    await addExecution(fixture, "2026-08-27T05:50:00.000Z", "2026-08-27T06:16:01.000Z", otherDayId);
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:16:00.000Z", ended_at: "2026-08-28T06:16:01.000Z", expected_started_at: null,
      expected_ended_at: null, expected_placement_revision: 0, input_precision: "minute" as const,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({
      lifecycle_state: "completed", execution: { started_at: request.started_at, ended_at: request.ended_at },
    });
  });

  it("keeps the final overlap guard after snapping and rejects the Day boundary", async () => {
    const fixture = await seedFixture(true);
    await addExecution(fixture, "2026-08-28T05:50:00.000Z", "2026-08-28T06:16:01.000Z");
    await addExecution(fixture, "2026-08-28T06:16:00.500Z", "2026-08-28T06:20:00.000Z");
    const residual = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:16:00.000Z", ended_at: "2026-08-28T06:30:00.000Z", expected_started_at: null,
      expected_ended_at: null, expected_placement_revision: 0, input_precision: "minute" as const,
    };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, residual, now)).rejects.toMatchObject({ code: "resource_conflict" });

    const boundary = { ...residual, operation_id: uuidv7(), started_at: "2026-08-29T05:00:00.000Z", ended_at: null };
    await expect(setExecutionTimes(env.APP_DB, fixture.userId, boundary, now)).rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("does not write when the blocker basis changes before the guarded batch", async () => {
    const fixture = await seedFixture(true);
    const blocker = await addExecution(fixture, "2026-08-28T05:50:00.000Z", "2026-08-28T06:16:01.000Z");
    let injected = false;
    const racingDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            if (!injected) {
              injected = true;
              await env.APP_DB.prepare("UPDATE executions SET ended_at = ? WHERE id = ?")
                .bind("2026-08-28T06:16:02.000Z", blocker.executionId).run();
            }
            return target.batch(statements);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as D1Database;
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:16:00.000Z", ended_at: "2026-08-28T06:30:00.000Z", expected_started_at: null,
      expected_ended_at: null, expected_placement_revision: 0, input_precision: "minute" as const,
    };
    await expect(setExecutionTimes(racingDb, fixture.userId, request, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?").bind(fixture.entryId).first())
      .toEqual({ lifecycle_state: "planned" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE entry_id = ?").bind(fixture.entryId).first<number>("count"))
      .toBe(0);
  });
});
