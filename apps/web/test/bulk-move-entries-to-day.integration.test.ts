import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  bulkMoveEntriesToDay,
  isBulkMoveEntriesToDayRequest,
} from "../worker/application/bulk-move-entries-to-day";
import { loadTaskChuteDayByLogicalDate } from "../worker/application/load-current-day";
import { updateRoutine } from "../worker/application/routine-board";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-09-04T12:00:00.000Z";

function instantFor(date: string, minute: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + minute * 60_000).toISOString();
}

async function seed() {
  const userId = uuidv7();
  const sourceDayId = uuidv7();
  const currentDayId = uuidv7();
  const futureDayId = uuidv7();
  const configurationVersionId = uuidv7();
  const targetConfigurationVersionId = uuidv7();
  const sectionA = uuidv7();
  const sectionB = uuidv7();
  const ordinaryTaskIds = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const ordinaryEntryIds = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const routineTaskId = uuidv7();
  const routineDefinitionId = uuidv7();
  const routineOccurrenceId = uuidv7();
  const routineEntryId = uuidv7();
  const targetEntryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Alpha', 0, ?), (?, ?, 'Beta', 1, ?)")
      .bind(sectionA, userId, now, sectionB, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(configurationVersionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(targetConfigurationVersionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Alpha', 0, 600, 0), (?, ?, ?, 'Beta', 600, 1440, 1)`)
      .bind(userId, configurationVersionId, sectionA, userId, configurationVersionId, sectionB),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Alpha', 0, 720, 0), (?, ?, ?, 'Beta', 720, 1440, 1)`)
      .bind(userId, targetConfigurationVersionId, sectionA, userId, targetConfigurationVersionId, sectionB),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, targetConfigurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days (id, app_user_id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-03', '2026-09-03T00:00:00.000Z', '2026-09-04T00:00:00.000Z', 'UTC', 0, 'compatible', 7, ?),
        (?, ?, '2026-09-04', '2026-09-04T00:00:00.000Z', '2026-09-05T00:00:00.000Z', 'UTC', 0, 'compatible', 3, ?),
        (?, ?, '2026-09-30', '2026-09-30T00:00:00.000Z', '2026-10-01T00:00:00.000Z', 'UTC', 0, 'compatible', 2, ?)`)
      .bind(sourceDayId, userId, now, currentDayId, userId, now, futureDayId, userId, now),
    ...[
      [sourceDayId, "2026-09-03", sectionA, 120, 600, 0], [sourceDayId, "2026-09-03", sectionB, 600, 1440, 1],
      [currentDayId, "2026-09-04", sectionA, 0, 720, 0], [currentDayId, "2026-09-04", sectionB, 720, 1440, 1],
      [futureDayId, "2026-09-30", sectionB, 0, 1440, 0],
    ].map(([dayId, date, sectionId, start, end, order]) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, dayId, sectionId, dayId === currentDayId ? targetConfigurationVersionId : configurationVersionId, sectionId === sectionA ? "Alpha" : "Beta", start, end,
        instantFor(String(date), Number(start)), instantFor(String(date), Number(end)), order)),
    ...ordinaryTaskIds.map((taskId, index) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(taskId, userId, `Ordinary ${index}`, now)),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Routine', ?)").bind(routineTaskId, userId, now),
    env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date, default_section_id,
       default_estimate_seconds, default_planned_start_minute, materialization_order, defaults_revision, created_at)
      VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, ?, 900, 120, 1, 0, ?)`)
      .bind(routineDefinitionId, userId, routineTaskId, sectionA, now),
    env.APP_DB.prepare("INSERT INTO routine_schedules (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask) VALUES (?, ?, 'daily', NULL, NULL)")
      .bind(userId, routineDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_board_items (app_user_id, routine_definition_id, board_position, settings_revision) VALUES (?, ?, 1, 0)")
      .bind(userId, routineDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, section_plan_override_present, section_override_id, planned_start_override_minute, estimate_override_present, created_at) VALUES (?, ?, ?, ?, 1, ?, 120, 0, ?)")
      .bind(routineOccurrenceId, userId, routineDefinitionId, sourceDayId, sectionA, now),
    env.APP_DB.prepare("INSERT INTO routine_occurrence_task_snapshots (app_user_id, routine_occurrence_id, task_title, project_id, project_title) VALUES (?, ?, 'Routine', NULL, NULL)")
      .bind(userId, routineOccurrenceId),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, ?, 'planned', 600, ?, ?),
      (?, ?, ?, ?, ?, ?, 'planned', 600, ?, ?), (?, ?, ?, ?, ?, ?, 'planned', 600, ?, ?),
      (?, ?, ?, ?, NULL, 1, 'planned', 600, NULL, ?)`)
      .bind(ordinaryEntryIds[0], userId, ordinaryTaskIds[0], sourceDayId, sectionA, 1, 120, now,
        ordinaryEntryIds[1], userId, ordinaryTaskIds[1], sourceDayId, sectionB, 1, 600, now,
        ordinaryEntryIds[2], userId, ordinaryTaskIds[2], sourceDayId, sectionA, 2, 240, now,
        ordinaryEntryIds[3], userId, ordinaryTaskIds[3], sourceDayId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
      VALUES (?, ?, ?, ?, ?, 3, 'planned', 900, 120, ?, ?)`)
      .bind(routineEntryId, userId, routineTaskId, sourceDayId, sectionA, now, routineOccurrenceId),
    env.APP_DB.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Target task', ?)`)
      .bind(uuidv7(), userId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 5, 'planned', 300, 300, ?)`)
      .bind(targetEntryId, userId, ordinaryTaskIds[0], currentDayId, sectionA, now),
  ]);
  return { userId, sourceDayId, currentDayId, futureDayId, sectionA, sectionB, ordinaryEntryIds, routineEntryId,
    routineDefinitionId, routineOccurrenceId, targetEntryId, targetConfigurationVersionId };
}

function requestFor(fixture: Awaited<ReturnType<typeof seed>>, target: string, entryIds: string[], revision: number, operationId = uuidv7()) {
  return { operation_id: operationId, source_taskchute_day_id: fixture.sourceDayId, entry_ids: entryIds,
    target_logical_date: target, expected_source_placement_revision: revision, allow_section_fallback: false };
}

describe.sequential("BulkMoveEntriesToDay", () => {
  it("moves mixed past-source entries atomically, uses target starts, preserves Routine identity, and replays semantically", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, "2026-09-04", [fixture.routineEntryId, fixture.ordinaryEntryIds[1]!, fixture.ordinaryEntryIds[0]!, fixture.ordinaryEntryIds[3]!], 7);
    const first = await bulkMoveEntriesToDay(env.APP_DB, fixture.userId, request, now);
    expect(first).toEqual({ source_taskchute_day_id: fixture.sourceDayId, target_taskchute_day_id: fixture.currentDayId,
      target_logical_date: "2026-09-04", moved_entry_ids: [...request.entry_ids].sort(), fallback_entry_ids: [],
      source_placement_revision: 8, target_placement_revision: 4 });
    expect(await bulkMoveEntriesToDay(env.APP_DB, fixture.userId, { ...request, entry_ids: [...request.entry_ids].reverse() }, now)).toEqual(first);
    expect(await env.APP_DB.prepare("SELECT taskchute_day_id, section_id, planned_start_minute, position FROM entries WHERE id = ?")
      .bind(fixture.routineEntryId).first()).toEqual({ taskchute_day_id: fixture.currentDayId, section_id: fixture.sectionA, planned_start_minute: 0, position: 7 });
    expect(await env.APP_DB.prepare("SELECT origin_taskchute_day_id, section_override_id, planned_start_override_minute FROM routine_occurrences WHERE id = ?")
      .bind(fixture.routineOccurrenceId).first()).toEqual({ origin_taskchute_day_id: fixture.sourceDayId, section_override_id: fixture.sectionA, planned_start_override_minute: 0 });
    expect((await env.APP_DB.prepare("SELECT id FROM entries WHERE taskchute_day_id = ? AND id IN (SELECT value FROM json_each(?))")
      .bind(fixture.sourceDayId, JSON.stringify(request.entry_ids)).all()).results).toEqual([]);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = 'BulkMoveEntriesToDay'")
      .bind(fixture.userId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT position FROM entries WHERE id = ?").bind(fixture.targetEntryId).first<number>("position")).toBe(5);
    const current = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-09-04", now);
    expect([...current.unsectioned_entries, ...current.sections.flatMap((section) => section.entries)]
      .map((entry) => entry.id)).toEqual(expect.arrayContaining(request.entry_ids));
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND routine_occurrence_id = ?")
      .bind(fixture.userId, fixture.routineOccurrenceId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT defaults_revision FROM routine_definitions WHERE id = ?")
      .bind(fixture.routineDefinitionId).first<number>("defaults_revision")).toBe(0);
    await updateRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: fixture.routineDefinitionId, expected_settings_revision: 0,
      title: "Routine", project_id: null, schedule: { kind: "weekly", weekdays: [1] },
      default_section_id: fixture.sectionA, default_planned_start_minute: 120, default_estimate_seconds: 900,
      start_logical_date: "2026-09-01", end_logical_date: "2026-09-30",
    }, now);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrence_suppressions WHERE app_user_id = ? AND routine_occurrence_id = ?")
      .bind(fixture.userId, fixture.routineOccurrenceId).first<number>("count")).toBe(0);
  });

  it("establishes a future month/year target only inside the successful move and ends at revision one", async () => {
    const fixture = await seed();
    const entryId = fixture.ordinaryEntryIds[0]!;
    expect(await env.APP_DB.prepare("SELECT id FROM taskchute_days WHERE app_user_id = ? AND logical_date = '2027-01-01'")
      .bind(fixture.userId).first()).toBeNull();
    const request = requestFor(fixture, "2027-01-01", [entryId], 7);
    const result = await bulkMoveEntriesToDay(env.APP_DB, fixture.userId, request, now);
    expect(result.target_logical_date).toBe("2027-01-01");
    expect(result.target_placement_revision).toBe(1);
    expect(await env.APP_DB.prepare("SELECT id, placement_revision FROM taskchute_days WHERE app_user_id = ? AND logical_date = '2027-01-01'")
      .bind(fixture.userId).first()).toEqual({ id: result.target_taskchute_day_id, placement_revision: 1 });
    expect(await env.APP_DB.prepare("SELECT taskchute_day_id, section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(entryId).first()).toEqual({ taskchute_day_id: result.target_taskchute_day_id, section_id: fixture.sectionA, planned_start_minute: 0 });
  });

  it("uses each moved Routine Entry Day's frozen Section start during default propagation", async () => {
    const fixture = await seed();
    const targetDayId = uuidv7();
    const inheritedTaskId = uuidv7();
    const inheritedDefinitionId = uuidv7();
    const inheritedOccurrenceId = uuidv7();
    const inheritedEntryId = uuidv7();
    const overrideTaskId = uuidv7();
    const overrideDefinitionId = uuidv7();
    const overrideOccurrenceId = uuidv7();
    const overrideEntryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO taskchute_days
        (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
         establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
        VALUES (?, ?, '2026-10-01', '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z',
          'UTC', 0, 'compatible', 2, ?)`)
        .bind(targetDayId, fixture.userId, now),
      env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
        (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
         logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
        VALUES (?, ?, ?, ?, 'Beta', 900, 1440, '2026-10-01T15:00:00.000Z', '2026-10-02T00:00:00.000Z', 0)`)
        .bind(fixture.userId, targetDayId, fixture.sectionB, fixture.targetConfigurationVersionId),
      env.APP_DB.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Inherited moved Routine', ?),
        (?, ?, 'Override moved Routine', ?)`)
        .bind(inheritedTaskId, fixture.userId, now, overrideTaskId, fixture.userId, now),
      ...[
        [inheritedDefinitionId, inheritedTaskId, 2], [overrideDefinitionId, overrideTaskId, 3],
      ].map(([definitionId, taskId, materializationOrder]) => env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute,
         materialization_order, defaults_revision, created_at)
        VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, ?, 900, 960, ?, 0, ?)`)
        .bind(definitionId, fixture.userId, taskId, fixture.sectionB, materializationOrder, now)),
      env.APP_DB.prepare(`INSERT INTO routine_schedules
        (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask)
        VALUES (?, ?, 'daily', NULL, NULL), (?, ?, 'daily', NULL, NULL)`)
        .bind(fixture.userId, inheritedDefinitionId, fixture.userId, overrideDefinitionId),
      env.APP_DB.prepare(`INSERT INTO routine_board_items
        (app_user_id, routine_definition_id, board_position, settings_revision)
        VALUES (?, ?, 10, 0), (?, ?, 11, 0)`)
        .bind(fixture.userId, inheritedDefinitionId, fixture.userId, overrideDefinitionId),
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id,
         section_plan_override_present, section_override_id, planned_start_override_minute,
         estimate_override_present, created_at)
        VALUES (?, ?, ?, ?, 0, NULL, NULL, 0, ?), (?, ?, ?, ?, 1, ?, 600, 0, ?)`)
        .bind(inheritedOccurrenceId, fixture.userId, inheritedDefinitionId, fixture.sourceDayId, now,
          overrideOccurrenceId, fixture.userId, overrideDefinitionId, fixture.sourceDayId, fixture.sectionB, now),
      env.APP_DB.prepare(`INSERT INTO routine_occurrence_task_snapshots
        (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
        VALUES (?, ?, 'Inherited moved Routine', NULL, NULL), (?, ?, 'Override moved Routine', NULL, NULL)`)
        .bind(fixture.userId, inheritedOccurrenceId, fixture.userId, overrideOccurrenceId),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
        VALUES (?, ?, ?, ?, ?, 2, 'planned', 900, 600, ?, ?),
          (?, ?, ?, ?, ?, 3, 'planned', 900, 600, ?, ?)`)
        .bind(inheritedEntryId, fixture.userId, inheritedTaskId, fixture.sourceDayId, fixture.sectionB, now, inheritedOccurrenceId,
          overrideEntryId, fixture.userId, overrideTaskId, fixture.sourceDayId, fixture.sectionB, now, overrideOccurrenceId),
    ]);

    const moved = await bulkMoveEntriesToDay(env.APP_DB, fixture.userId,
      requestFor(fixture, "2026-10-01", [inheritedEntryId, overrideEntryId], 7), now);
    expect(moved).toMatchObject({ target_taskchute_day_id: targetDayId, source_placement_revision: 8,
      target_placement_revision: 3, fallback_entry_ids: [] });
    const movedEntries = (await env.APP_DB.prepare(`SELECT taskchute_day_id, section_id, planned_start_minute, position
      FROM entries WHERE id IN (?, ?)`).bind(inheritedEntryId, overrideEntryId).all()).results;
    expect(movedEntries).toHaveLength(2);
    expect(movedEntries).toEqual(expect.arrayContaining([
      { taskchute_day_id: targetDayId, section_id: fixture.sectionB, planned_start_minute: 900, position: 1 },
      { taskchute_day_id: targetDayId, section_id: fixture.sectionB, planned_start_minute: 900, position: 2 },
    ]));
    const movedOccurrences = (await env.APP_DB.prepare(`SELECT section_plan_override_present, section_override_id,
      planned_start_override_minute FROM routine_occurrences WHERE id IN (?, ?)`)
      .bind(inheritedOccurrenceId, overrideOccurrenceId).all()).results;
    expect(movedOccurrences).toHaveLength(2);
    expect(movedOccurrences).toEqual(expect.arrayContaining([
      { section_plan_override_present: 0, section_override_id: null, planned_start_override_minute: null },
      { section_plan_override_present: 1, section_override_id: fixture.sectionB, planned_start_override_minute: 900 },
    ]));

    await env.APP_DB.prepare("UPDATE entries SET planned_start_minute = 960 WHERE id = ?").bind(inheritedEntryId).run();
    await expect(updateRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: inheritedDefinitionId, expected_settings_revision: 0,
      title: "Inherited moved Routine", project_id: null, schedule: { kind: "weekly", weekdays: [1] },
      default_section_id: fixture.sectionB, default_planned_start_minute: 960, default_estimate_seconds: 900,
      start_logical_date: "2026-09-01", end_logical_date: "2026-10-31",
    }, now)).resolves.toEqual({ routine_definition_id: inheritedDefinitionId, settings_revision: 1 });
    expect(await env.APP_DB.prepare("SELECT default_planned_start_minute FROM routine_definitions WHERE id = ?")
      .bind(inheritedDefinitionId).first()).toEqual({ default_planned_start_minute: 960 });
    expect(await env.APP_DB.prepare("SELECT taskchute_day_id, section_id, planned_start_minute, position FROM entries WHERE id = ?")
      .bind(inheritedEntryId).first()).toEqual({ taskchute_day_id: targetDayId, section_id: fixture.sectionB, planned_start_minute: 900, position: 1 });
    expect(await env.APP_DB.prepare("SELECT taskchute_day_id, section_id, planned_start_minute, position FROM entries WHERE id = ?")
      .bind(overrideEntryId).first()).toEqual({ taskchute_day_id: targetDayId, section_id: fixture.sectionB, planned_start_minute: 900, position: 2 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(targetDayId).first()).toEqual({ placement_revision: 4 });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrence_suppressions WHERE routine_occurrence_id = ?")
      .bind(inheritedOccurrenceId).first<number>("count")).toBe(0);

    await expect(updateRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: inheritedDefinitionId, expected_settings_revision: 1,
      title: "Inherited moved Routine", project_id: null, schedule: { kind: "daily" },
      default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: 900,
      start_logical_date: "2026-09-01", end_logical_date: "2026-10-31",
    }, now)).resolves.toEqual({ routine_definition_id: inheritedDefinitionId, settings_revision: 2 });
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(inheritedEntryId).first()).toEqual({ section_id: null, planned_start_minute: null });

    const missingTaskId = uuidv7();
    const missingDefinitionId = uuidv7();
    const missingOccurrenceId = uuidv7();
    const missingEntryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Missing Section Routine', ?)")
        .bind(missingTaskId, fixture.userId, now),
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute,
         materialization_order, defaults_revision, created_at)
        VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, ?, 900, 120, 20, 0, ?)`)
        .bind(missingDefinitionId, fixture.userId, missingTaskId, fixture.sectionA, now),
      env.APP_DB.prepare(`INSERT INTO routine_schedules
        (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask)
        VALUES (?, ?, 'daily', NULL, NULL)`)
        .bind(fixture.userId, missingDefinitionId),
      env.APP_DB.prepare(`INSERT INTO routine_board_items
        (app_user_id, routine_definition_id, board_position, settings_revision)
        VALUES (?, ?, 20, 0)`)
        .bind(fixture.userId, missingDefinitionId),
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id,
         section_plan_override_present, section_override_id, planned_start_override_minute,
         estimate_override_present, created_at)
        VALUES (?, ?, ?, ?, 0, NULL, NULL, 0, ?)`)
        .bind(missingOccurrenceId, fixture.userId, missingDefinitionId, fixture.sourceDayId, now),
      env.APP_DB.prepare(`INSERT INTO routine_occurrence_task_snapshots
        (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
        VALUES (?, ?, 'Missing Section Routine', NULL, NULL)`)
        .bind(fixture.userId, missingOccurrenceId),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
        VALUES (?, ?, ?, ?, ?, 4, 'planned', 900, 120, ?, ?)`)
        .bind(missingEntryId, fixture.userId, missingTaskId, fixture.sourceDayId, fixture.sectionA, now, missingOccurrenceId),
    ]);
    const missingMove = await bulkMoveEntriesToDay(env.APP_DB, fixture.userId,
      { ...requestFor(fixture, "2026-09-30", [missingEntryId], 8), allow_section_fallback: true }, now);
    expect(missingMove.fallback_entry_ids).toEqual([missingEntryId]);
    await expect(updateRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: missingDefinitionId, expected_settings_revision: 0,
      title: "Missing Section Routine", project_id: null, schedule: { kind: "daily" },
      default_section_id: fixture.sectionA, default_planned_start_minute: 120, default_estimate_seconds: 900,
      start_logical_date: "2026-09-01", end_logical_date: "2026-10-31",
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT settings_revision FROM routine_board_items WHERE routine_definition_id = ?")
      .bind(missingDefinitionId).first()).toEqual({ settings_revision: 0 });
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(missingEntryId).first()).toEqual({ section_id: null, planned_start_minute: null });
  });

  it("requires fallback acknowledgement and applies it per affected Entry", async () => {
    const fixture = await seed();
    const first = requestFor(fixture, "2026-09-30", [fixture.ordinaryEntryIds[0]!], 7);
    await expect(bulkMoveEntriesToDay(env.APP_DB, fixture.userId, first, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT taskchute_day_id, placement_revision FROM entries JOIN taskchute_days ON taskchute_days.id = entries.taskchute_day_id WHERE entries.id = ?")
      .bind(fixture.ordinaryEntryIds[0]).first()).toEqual({ taskchute_day_id: fixture.sourceDayId, placement_revision: 7 });
    const acknowledged = { ...first, operation_id: uuidv7(), allow_section_fallback: true };
    const result = await bulkMoveEntriesToDay(env.APP_DB, fixture.userId, acknowledged, now);
    expect(result.fallback_entry_ids).toEqual([fixture.ordinaryEntryIds[0]!]);
    expect(await env.APP_DB.prepare("SELECT taskchute_day_id, section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.ordinaryEntryIds[0]).first()).toEqual({ taskchute_day_id: fixture.futureDayId, section_id: null, planned_start_minute: null });
  });

  it("rejects invalid dates, past/same targets, duplicate IDs, and spoofed user authority", async () => {
    const fixture = await seed();
    const valid = requestFor(fixture, "2026-09-04", [fixture.ordinaryEntryIds[0]!], 7);
    expect(isBulkMoveEntriesToDayRequest({ ...valid, entry_ids: [valid.entry_ids[0], valid.entry_ids[0]] })).toBe(false);
    expect(isBulkMoveEntriesToDayRequest({ ...valid, target_logical_date: "2026-02-30" })).toBe(false);
    expect(isBulkMoveEntriesToDayRequest({ ...valid, user_id: fixture.userId })).toBe(false);
    await expect(bulkMoveEntriesToDay(env.APP_DB, fixture.userId, { ...valid, operation_id: uuidv7(), target_logical_date: "2026-09-03" }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await expect(bulkMoveEntriesToDay(env.APP_DB, fixture.userId, { ...valid, operation_id: uuidv7(), target_logical_date: "2026-09-04", entry_ids: [fixture.ordinaryEntryIds[0]!, fixture.ordinaryEntryIds[0]!] } as never, now))
      .rejects.toThrow();
  });
});
