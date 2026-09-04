import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { revertEntryStart, setExecutionTimes } from "../worker/application/execution-correction";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { startEntry } from "../worker/application/entry-lifecycle";
import { uuidv7 } from "../src/shared/uuidv7";

const userId = uuidv7();
const otherUserId = uuidv7();
const dayId = uuidv7();
const morningId = uuidv7();
const afternoonId = uuidv7();
const configurationVersionId = uuidv7();
const entries = Array.from({ length: 12 }, () => uuidv7());
const tasks = entries.map(() => uuidv7());
const now = "2026-08-22T23:00:00.000Z";

async function row<T>(sql: string, ...bindings: unknown[]): Promise<T | null> {
  return env.APP_DB.prepare(sql).bind(...bindings).first<T>();
}

async function executionCount(entryId: string): Promise<number> {
  return (await row<{ count: number }>("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND entry_id = ?", userId, entryId))?.count ?? 0;
}

beforeAll(async () => {
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUserId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(otherUserId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Morning', 0, ?)").bind(morningId, userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Afternoon', 1, ?)").bind(afternoonId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)").bind(configurationVersionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_items (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order) VALUES (?, ?, ?, 'Morning', 0, 720, 0)").bind(userId, configurationVersionId, morningId),
    env.APP_DB.prepare("INSERT INTO section_configuration_items (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order) VALUES (?, ?, ?, 'Afternoon', 720, 1440, 1)").bind(userId, configurationVersionId, afternoonId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)").bind(userId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-22', '2026-08-22T00:00:00.000Z', '2026-08-23T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Morning', 0, 720, '2026-08-22T00:00:00.000Z', '2026-08-22T12:00:00.000Z', 0)`)
      .bind(userId, dayId, morningId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Afternoon', 720, 1440, '2026-08-22T12:00:00.000Z', '2026-08-23T00:00:00.000Z', 1)`)
      .bind(userId, dayId, afternoonId, configurationVersionId),
    ...tasks.map((taskId, index) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(taskId, userId, `Correction task ${index + 1}`, now)),
    ...entries.map((entryId, index) => env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)`)
      .bind(entryId, userId, tasks[index], dayId, morningId, index + 1, now)),
  ]);
});

describe.sequential("D-057 Execution Correction", () => {
  it("creates manual actuals, derives the projection, and keeps Routine facts out of scope", async () => {
    const request = {
      operation_id: uuidv7(), entry_id: entries[0]!, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-22T09:00:00Z", ended_at: "2026-08-22T09:30:00Z", expected_started_at: null, expected_ended_at: null,
    };
    const result = await setExecutionTimes(env.APP_DB, userId, request, now);
    expect(result).toMatchObject({ entry_id: entries[0], lifecycle_state: "completed", section_id: morningId, placement_revision: 0 });
    expect(result.execution).toEqual({ id: request.execution_id, entry_id: entries[0], started_at: "2026-08-22T09:00:00.000Z", ended_at: "2026-08-22T09:30:00.000Z" });
    expect(await setExecutionTimes(env.APP_DB, userId, request, now)).toEqual(result);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId, now);
    expect(projection.sections[0]!.entries.find((entry) => entry.id === entries[0])?.execution_summary).toMatchObject({
      first_started_at: "2026-08-22T09:00:00.000Z", last_ended_at: "2026-08-22T09:30:00.000Z", completed_duration_seconds: 1800,
      single_execution_id: request.execution_id,
    });
  });

  it("reverts only the current active Start and preserves placement, planned start, revision, and history", async () => {
    const entryId = entries[1]!;
    await env.APP_DB.prepare("UPDATE entries SET planned_start_minute = 90 WHERE app_user_id = ? AND id = ?").bind(userId, entryId).run();
    const before = await row<{ section_id: string; planned_start_minute: number; position: number }>(
      "SELECT section_id, planned_start_minute, position FROM entries WHERE id = ?", entryId);
    const revisionBefore = (await row<{ placement_revision: number }>("SELECT placement_revision FROM taskchute_days WHERE id = ?", dayId))!.placement_revision;
    const started = await startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7() }, "2026-08-22T10:00:00.000Z");
    const request = { operation_id: uuidv7(), entry_id: entryId, execution_id: started.execution.id, expected_started_at: started.execution.started_at };
    const result = await revertEntryStart(env.APP_DB, userId, request);
    expect(result).toMatchObject({ entry_id: entryId, lifecycle_state: "planned", section_id: before!.section_id,
      planned_start_minute: before!.planned_start_minute, position: before!.position, placement_revision: revisionBefore });
    expect(await executionCount(entryId)).toBe(0);
    expect(await row<{ lifecycle_state: string; section_id: string; planned_start_minute: number; position: number }>(
      "SELECT lifecycle_state, section_id, planned_start_minute, position FROM entries WHERE id = ?", entryId)).toEqual({
        lifecycle_state: "planned", ...before,
      });
    expect((await row<{ placement_revision: number }>("SELECT placement_revision FROM taskchute_days WHERE id = ?", dayId))!.placement_revision).toBe(revisionBefore);
    expect(await revertEntryStart(env.APP_DB, userId, request)).toEqual(result);
    await expect(revertEntryStart(env.APP_DB, userId, { ...request, expected_started_at: "2026-08-22T10:01:00Z" })).rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await row<{ command_type: string; outcome_kind: string }>("SELECT command_type, outcome_kind FROM operations WHERE app_user_id = ? AND operation_id = ?", userId, request.operation_id))
      .toEqual({ command_type: "RevertEntryStart", outcome_kind: "success" });
  });

  it("supports running and completed correction without reopening a completed Entry", async () => {
    const runningId = entries[2]!;
    const running = await startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: runningId, execution_id: uuidv7() }, "2026-08-22T11:00:00.000Z");
    const correction = { operation_id: uuidv7(), entry_id: runningId, execution_id: running.execution.id,
      expected_lifecycle_state: "running" as const, started_at: "2026-08-22T11:15:00Z", ended_at: null,
      expected_started_at: running.execution.started_at, expected_ended_at: null };
    expect((await setExecutionTimes(env.APP_DB, userId, correction, now)).lifecycle_state).toBe("running");
    const completed = { ...correction, operation_id: uuidv7(), expected_started_at: correction.started_at,
      started_at: "2026-08-22T11:15:00Z", ended_at: "2026-08-22T11:45:00Z" };
    expect((await setExecutionTimes(env.APP_DB, userId, completed, now)).lifecycle_state).toBe("completed");
    const reopen = { ...completed, operation_id: uuidv7(), expected_lifecycle_state: "completed" as const, expected_ended_at: completed.ended_at, ended_at: null };
    await expect(setExecutionTimes(env.APP_DB, userId, reopen, now)).rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("places a Sectionless manual actual into the exact frozen Section and bumps revision once", async () => {
    const entryId = entries[3]!;
    await env.APP_DB.prepare("UPDATE entries SET section_id = NULL, position = 1 WHERE app_user_id = ? AND id = ?").bind(userId, entryId).run();
    const before = (await row<{ placement_revision: number }>("SELECT placement_revision FROM taskchute_days WHERE id = ?", dayId))!.placement_revision;
    const request = { operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-22T14:00:00Z", ended_at: "2026-08-22T14:15:00Z", expected_started_at: null, expected_ended_at: null,
      expected_placement_revision: before };
    const result = await setExecutionTimes(env.APP_DB, userId, request, now);
    expect(result).toMatchObject({ section_id: afternoonId, planned_start_minute: null, placement_revision: before + 1 });
    expect(await row<{ section_id: string | null; planned_start_minute: number | null }>("SELECT section_id, planned_start_minute FROM entries WHERE id = ?", entryId))
      .toEqual({ section_id: afternoonId, planned_start_minute: null });
    expect(await setExecutionTimes(env.APP_DB, userId, request, now)).toEqual(result);
    const staleEntryId = entries[9]!;
    await env.APP_DB.prepare("UPDATE entries SET section_id = NULL, position = 2 WHERE app_user_id = ? AND id = ?").bind(userId, staleEntryId).run();
    await expect(setExecutionTimes(env.APP_DB, userId, { ...request, operation_id: uuidv7(), entry_id: staleEntryId, execution_id: uuidv7(),
      started_at: "2026-08-22T14:30:00Z", ended_at: "2026-08-22T14:45:00Z", expected_placement_revision: before }, now))
      .rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("rejects future/out-of-Day actuals and enforces adjacent-but-not-overlapping user-global intervals atomically", async () => {
    const baseline = { operation_id: uuidv7(), entry_id: entries[4]!, execution_id: uuidv7(), expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-22T15:00:00Z", ended_at: "2026-08-22T16:00:00Z", expected_started_at: null, expected_ended_at: null };
    await setExecutionTimes(env.APP_DB, userId, baseline, now);
    await expect(setExecutionTimes(env.APP_DB, userId, { ...baseline, operation_id: uuidv7(), entry_id: entries[5]!, execution_id: uuidv7(),
      started_at: "2026-08-22T15:30:00Z", ended_at: "2026-08-22T16:30:00Z" }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const adjacent = { ...baseline, operation_id: uuidv7(), entry_id: entries[5]!, execution_id: uuidv7(),
      started_at: "2026-08-22T16:00:00Z", ended_at: "2026-08-22T17:00:00Z" };
    await setExecutionTimes(env.APP_DB, userId, adjacent, now);
    await expect(setExecutionTimes(env.APP_DB, userId, { ...baseline, operation_id: uuidv7(), entry_id: entries[6]!, execution_id: uuidv7(),
      started_at: "2026-08-22T23:01:00Z", ended_at: "2026-08-22T23:02:00Z" }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    await expect(setExecutionTimes(env.APP_DB, userId, { ...baseline, operation_id: uuidv7(), entry_id: entries[6]!, execution_id: uuidv7(),
      started_at: "2026-08-21T23:00:00Z", ended_at: "2026-08-21T23:01:00Z" }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const concurrent = [entries[7]!, entries[8]!].map((entryId) => ({ ...baseline, operation_id: uuidv7(), entry_id: entryId,
      execution_id: uuidv7(), started_at: "2026-08-22T18:00:00Z", ended_at: "2026-08-22T19:00:00Z" }));
    const settled = await Promise.allSettled(concurrent.map((request) => setExecutionTimes(env.APP_DB, userId, request, now)));
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect((await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND started_at = '2026-08-22T18:00:00.000Z'").bind(userId).first<{ count: number }>())!.count).toBe(1);
  });
});
