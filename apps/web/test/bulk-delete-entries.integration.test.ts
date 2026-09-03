import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { bulkDeleteEntries, isBulkDeleteEntriesRequest } from "../worker/application/bulk-delete-entries";
import { loadTaskChuteDayByLogicalDate } from "../worker/application/load-current-day";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-09-02T12:00:00.000Z";

async function seed() {
  const userId = uuidv7();
  const dayId = uuidv7();
  const sectionId = uuidv7();
  const configurationVersionId = uuidv7();
  const ordinaryTaskId = uuidv7();
  const ordinaryEntryId = uuidv7();
  const secondTaskId = uuidv7();
  const secondEntryId = uuidv7();
  const routineTaskId = uuidv7();
  const routineDefinitionId = uuidv7();
  const routineOccurrenceId = uuidv7();
  const routineEntryId = uuidv7();
  const runningTaskId = uuidv7();
  const runningEntryId = uuidv7();
  const completedTaskId = uuidv7();
  const completedEntryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Bulk', 0, ?)").bind(sectionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(configurationVersionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_items (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order) VALUES (?, ?, ?, 'Bulk', 0, 1440, 0)")
      .bind(userId, configurationVersionId, sectionId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days (id, app_user_id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-02', '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts (app_user_id, taskchute_day_id, section_id,
      configuration_version_id, title, logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Bulk', 0, 1440, '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z', 0)`)
      .bind(userId, dayId, sectionId, configurationVersionId),
    ...[
      [ordinaryTaskId, "Ordinary one"], [secondTaskId, "Ordinary two"], [routineTaskId, "Routine one"],
      [runningTaskId, "Running one"], [completedTaskId, "Completed one"],
    ].map(([id, title]) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, userId, title, now)),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 1, 'planned', 600, 60, ?)`)
      .bind(ordinaryEntryId, userId, ordinaryTaskId, dayId, sectionId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 2, 'planned', 600, 60, ?)`)
      .bind(secondEntryId, userId, secondTaskId, dayId, sectionId, now),
    env.APP_DB.prepare(`INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type, start_logical_date,
      end_logical_date, default_section_id, default_estimate_seconds, default_planned_start_minute, materialization_order,
      defaults_revision, created_at) VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, ?, 600, 60, 1, 0, ?)`)
      .bind(routineDefinitionId, userId, routineTaskId, sectionId, now),
    env.APP_DB.prepare("INSERT INTO routine_schedules (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask) VALUES (?, ?, 'daily', NULL, NULL)")
      .bind(userId, routineDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_board_items (app_user_id, routine_definition_id, board_position, settings_revision) VALUES (?, ?, 1, 0)")
      .bind(userId, routineDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(routineOccurrenceId, userId, routineDefinitionId, dayId, now),
    env.APP_DB.prepare("INSERT INTO routine_occurrence_task_snapshots (app_user_id, routine_occurrence_id, task_title, project_id, project_title) VALUES (?, ?, 'Routine one', NULL, NULL)")
      .bind(userId, routineOccurrenceId),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
      VALUES (?, ?, ?, ?, ?, 3, 'planned', 600, 60, ?, ?)`)
      .bind(routineEntryId, userId, routineTaskId, dayId, sectionId, now, routineOccurrenceId),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 4, 'running', 600, 60, ?)`)
      .bind(runningEntryId, userId, runningTaskId, dayId, sectionId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 5, 'completed', 600, 60, ?)`)
      .bind(completedEntryId, userId, completedTaskId, dayId, sectionId, now),
  ]);
  return { userId, dayId, ordinaryTaskId, ordinaryEntryId, secondEntryId, routineDefinitionId, routineOccurrenceId,
    routineEntryId, runningEntryId, completedEntryId };
}

function requestFor(fixture: Awaited<ReturnType<typeof seed>>, entryIds: string[], revision = 0) {
  return { operation_id: uuidv7(), taskchute_day_id: fixture.dayId, entry_ids: entryIds,
    expected_placement_revision: revision };
}

async function state(fixture: Awaited<ReturnType<typeof seed>>) {
  return {
    entries: (await env.APP_DB.prepare("SELECT id, lifecycle_state, routine_occurrence_id FROM entries WHERE app_user_id = ? ORDER BY id")
      .bind(fixture.userId).all()).results,
    tasks: (await env.APP_DB.prepare("SELECT id FROM tasks WHERE app_user_id = ? ORDER BY id").bind(fixture.userId).all()).results,
    suppressions: (await env.APP_DB.prepare("SELECT * FROM routine_occurrence_suppressions WHERE app_user_id = ? ORDER BY routine_occurrence_id")
      .bind(fixture.userId).all()).results,
    revision: (await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId)
      .first<number>("placement_revision")) ?? -1,
    operations: (await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")) ?? -1,
  };
}

describe.sequential("BulkDeleteEntries", () => {
  it("removes ordinary Entries and skips Routine Entries atomically, preserving identity and replaying once", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, [fixture.ordinaryEntryId, fixture.routineEntryId]);
    const first = await bulkDeleteEntries(env.APP_DB, fixture.userId, request, now);
    expect(first).toEqual({ taskchute_day_id: fixture.dayId, deleted_entry_ids: [fixture.ordinaryEntryId],
      skipped_routine_entry_ids: [fixture.routineEntryId], placement_revision: 1 });
    expect(await bulkDeleteEntries(env.APP_DB, fixture.userId, request, now)).toEqual(first);
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE id = ?").bind(fixture.ordinaryEntryId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT id FROM tasks WHERE id = ?").bind(fixture.ordinaryTaskId).first()).toEqual({ id: fixture.ordinaryTaskId });
    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id FROM entries WHERE id = ?").bind(fixture.routineEntryId)
      .first()).toEqual({ routine_occurrence_id: fixture.routineOccurrenceId });
    expect(await env.APP_DB.prepare("SELECT reason FROM routine_occurrence_suppressions WHERE routine_occurrence_id = ?")
      .bind(fixture.routineOccurrenceId).first()).toEqual({ reason: "skip" });
    expect(await env.APP_DB.prepare("SELECT id FROM routine_definitions WHERE id = ?").bind(fixture.routineDefinitionId).first())
      .toEqual({ id: fixture.routineDefinitionId });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId)
      .first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = 'BulkDeleteEntries'")
      .bind(fixture.userId).first<number>("count")).toBe(1);
    const projection = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-09-02", now);
    expect([...projection.unsectioned_entries, ...projection.sections.flatMap((section) => section.entries)]
      .some((entry) => entry.id === fixture.routineEntryId || entry.id === fixture.ordinaryEntryId)).toBe(false);
  });

  it.each(["running", "completed"] as const)("rejects a %s target without partial mutation", async (stateName) => {
    const fixture = await seed();
    const entryId = stateName === "running" ? fixture.runningEntryId : fixture.completedEntryId;
    const before = await state(fixture);
    await expect(bulkDeleteEntries(env.APP_DB, fixture.userId, requestFor(fixture, [fixture.ordinaryEntryId, entryId]), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const after = await state(fixture);
    expect(after.entries).toEqual(before.entries);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.suppressions).toEqual(before.suppressions);
    expect(after.revision).toBe(before.revision);
    expect(after.operations).toBe(before.operations + 1);
  });

  it("rejects missing, cross-owner, stale, and operation misuse without applying effects", async () => {
    const fixture = await seed();
    const before = await state(fixture);
    await expect(bulkDeleteEntries(env.APP_DB, fixture.userId, requestFor(fixture, [uuidv7()]), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect((await state(fixture)).revision).toBe(before.revision);

    const otherUser = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUser, now).run();
    await expect(bulkDeleteEntries(env.APP_DB, otherUser, requestFor(fixture, [fixture.ordinaryEntryId]), now))
      .rejects.toMatchObject({ code: "resource_not_found" });
    const successful = requestFor(fixture, [fixture.ordinaryEntryId]);
    await bulkDeleteEntries(env.APP_DB, fixture.userId, successful, now);
    await expect(bulkDeleteEntries(env.APP_DB, fixture.userId, { ...successful, entry_ids: [fixture.secondEntryId] }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    await expect(bulkDeleteEntries(env.APP_DB, fixture.userId, requestFor(fixture, [fixture.secondEntryId], 0), now))
      .rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("rejects duplicate IDs at the request boundary and execution-history anomalies", async () => {
    const fixture = await seed();
    const duplicate = requestFor(fixture, [fixture.ordinaryEntryId, fixture.ordinaryEntryId]);
    expect(isBulkDeleteEntriesRequest(duplicate)).toBe(false);
    const executionId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(executionId, fixture.userId, fixture.ordinaryEntryId, now, now, now).run();
    const before = await state(fixture);
    await expect(bulkDeleteEntries(env.APP_DB, fixture.userId, requestFor(fixture, [fixture.ordinaryEntryId]), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await state(fixture)).toMatchObject({ revision: before.revision, suppressions: before.suppressions });
  });

  it("rolls back an injected failure and retries the exact operation without a second revision", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, [fixture.ordinaryEntryId, fixture.routineEntryId]);
    await env.APP_DB.prepare(`CREATE TRIGGER fail_bulk_delete BEFORE INSERT ON routine_occurrence_suppressions
      WHEN NEW.routine_occurrence_id = '${fixture.routineOccurrenceId}' BEGIN SELECT RAISE(ABORT, 'injected bulk failure'); END`).run();
    const before = await state(fixture);
    await expect(bulkDeleteEntries(env.APP_DB, fixture.userId, request, now)).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await state(fixture)).toEqual(before);
    await env.APP_DB.prepare("DROP TRIGGER fail_bulk_delete").run();
    await expect(bulkDeleteEntries(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({ placement_revision: 1 });
    expect(await bulkDeleteEntries(env.APP_DB, fixture.userId, request, now)).toMatchObject({ placement_revision: 1 });
  });
});
