import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { setExecutionTimes } from "../worker/application/execution-correction";
import { uuidv7 } from "../src/shared/uuidv7";

const createdAt = "2026-08-28T05:00:00.000Z";
const now = "2026-08-28T12:00:00.000Z";

async function seedFixture(sectioned = true) {
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
      VALUES (?, ?, ?, ?, ?, 1, 'planned', NULL, NULL, ?)`)
      .bind(entryId, userId, taskId, dayId, sectioned ? sectionId : null, createdAt),
  ]);
  return { userId, dayId, sectionId, entryId };
}

async function operationCount(userId: string, commandType = "SetExecutionTimes") {
  return (await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = ?")
    .bind(userId, commandType).first<number>("count")) ?? -1;
}

describe.sequential("D-060 SetExecutionTimes", () => {
  it("creates and corrects actual facts without changing planned placement, then reloads the projection", async () => {
    const fixture = await seedFixture();
    const executionId = uuidv7();
    const request = {
      operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: executionId,
      expected_lifecycle_state: "planned" as const,
      started_at: "2026-08-28T06:00:00.312Z", ended_at: "2026-08-28T06:15:00.512Z",
      expected_started_at: null, expected_ended_at: null,
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
});
