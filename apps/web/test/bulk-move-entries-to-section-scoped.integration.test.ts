import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  bulkMoveEntriesToSectionScoped,
  isBulkMoveEntriesToSectionScopedRequest,
} from "../worker/application/bulk-move-entries-to-section-scoped";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-09-02T12:00:00.000Z";

async function seed() {
  const userId = uuidv7();
  const dayId = uuidv7();
  const futureDayId = uuidv7();
  const originDayIds = [uuidv7(), uuidv7(), uuidv7()];
  const sections = [uuidv7(), uuidv7(), uuidv7()];
  const [ordinaryTaskId, aTaskId, bTaskId, cTaskId] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const [ordinaryEntryId, aEntryId, bEntryId, cEntryId] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const [aDefinitionId, bDefinitionId, cDefinitionId] = [uuidv7(), uuidv7(), uuidv7()];
  const [aOccurrenceId, bOccurrenceId, cOccurrenceId] = [uuidv7(), uuidv7(), uuidv7()];
  const [bFutureOccurrenceId, cFutureOccurrenceId, cProtectedOccurrenceId] = [uuidv7(), uuidv7(), uuidv7()];
  const [bFutureEntryId, cFutureEntryId, cProtectedEntryId] = [uuidv7(), uuidv7(), uuidv7()];
  const configurationVersionId = uuidv7();
  const sectionNames = ["Alpha", "Beta", "Gamma"];
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    ...sections.map((id, index) => env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, userId, sectionNames[index], index, now)),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(configurationVersionId, userId, now),
    ...sections.map((id, index) => env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, configurationVersionId, id, sectionNames[index], index * 480, (index + 1) * 480, index)),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)").bind(userId, configurationVersionId),
    ...[
      [dayId, "2026-09-02", "2026-09-03", 0], [futureDayId, "2026-09-03", "2026-09-04", 4],
      [originDayIds[0], "2026-09-04", "2026-09-05", 0], [originDayIds[1], "2026-09-05", "2026-09-06", 0], [originDayIds[2], "2026-09-06", "2026-09-07", 0],
    ].map(([id, date, nextDate, revision]) => env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
       establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, ?, ?, ?, 'UTC', 0, 'compatible', ?, ?)`)
      .bind(id, userId, date, `${date}T00:00:00.000Z`, `${nextDate}T00:00:00.000Z`, revision, now)),
    ...[dayId, futureDayId].flatMap((targetDayId) => sections.map((id, index) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`)
      .bind(userId, targetDayId, id, configurationVersionId, sectionNames[index], index * 480, (index + 1) * 480, index))),
    ...[[ordinaryTaskId, "Ordinary"], [aTaskId, "Routine A"], [bTaskId, "Routine B"], [cTaskId, "Routine C"]]
      .map(([id, title]) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)").bind(id, userId, title, now)),
    ...[
      [aDefinitionId, aTaskId, 1], [bDefinitionId, bTaskId, 2], [cDefinitionId, cTaskId, 3],
    ].map(([id, taskId, order]) => env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date, default_section_id,
       default_estimate_seconds, default_planned_start_minute, materialization_order, defaults_revision, created_at)
      VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, ?, 600, 0, ?, 0, ?)`)
      .bind(id, userId, taskId, sections[0], order, now)),
    ...[
      [aOccurrenceId, aDefinitionId, dayId], [bOccurrenceId, bDefinitionId, dayId], [cOccurrenceId, cDefinitionId, dayId],
      [bFutureOccurrenceId, bDefinitionId, originDayIds[0]], [cFutureOccurrenceId, cDefinitionId, originDayIds[1]], [cProtectedOccurrenceId, cDefinitionId, originDayIds[2]],
    ].map(([id, definitionId, originDayId]) => env.APP_DB.prepare(`INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, userId, definitionId, originDayId, now)),
    env.APP_DB.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 1,
      section_override_id = ?, planned_start_override_minute = 0 WHERE id = ?`).bind(sections[0], bOccurrenceId),
    env.APP_DB.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 1,
      section_override_id = ?, planned_start_override_minute = 480 WHERE id = ?`).bind(sections[1], cOccurrenceId),
    env.APP_DB.prepare(`UPDATE routine_occurrences SET section_plan_override_present = 1,
      section_override_id = ?, planned_start_override_minute = 480 WHERE id = ?`).bind(sections[1], cProtectedOccurrenceId),
    ...[
      [ordinaryEntryId, ordinaryTaskId, dayId, sections[0], 1, 0, null], [aEntryId, aTaskId, dayId, sections[0], 2, 0, aOccurrenceId],
      [bEntryId, bTaskId, dayId, sections[0], 3, 0, bOccurrenceId], [cEntryId, cTaskId, dayId, sections[1], 1, 480, cOccurrenceId],
      [bFutureEntryId, bTaskId, futureDayId, sections[0], 1, 0, bFutureOccurrenceId],
      [cFutureEntryId, cTaskId, futureDayId, sections[0], 2, 0, cFutureOccurrenceId],
      [cProtectedEntryId, cTaskId, futureDayId, sections[0], 3, 0, cProtectedOccurrenceId],
    ].map(([id, taskId, targetDayId, sectionId, position, plannedStart, occurrenceId]) => env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds,
       planned_start_minute, created_at, routine_occurrence_id) VALUES (?, ?, ?, ?, ?, ?, 'planned', 600, ?, ?, ?)`)
      .bind(id, userId, taskId, targetDayId, sectionId, position, plannedStart, now, occurrenceId)),
  ]);
  return {
    userId, dayId, futureDayId, sections, ordinaryEntryId, aEntryId, bEntryId, cEntryId,
    aDefinitionId, bDefinitionId, cDefinitionId, aOccurrenceId, bOccurrenceId, cOccurrenceId,
    bFutureEntryId, cFutureEntryId, cProtectedEntryId, cProtectedOccurrenceId,
  };
}

function requestFor(fixture: Awaited<ReturnType<typeof seed>>) {
  return {
    operation_id: uuidv7(), taskchute_day_id: fixture.dayId,
    entry_ids: [fixture.ordinaryEntryId, fixture.aEntryId, fixture.bEntryId, fixture.cEntryId],
    section_id: fixture.sections[2],
    routine_scopes: [
      { entry_id: fixture.aEntryId, scope: "occurrence" as const },
      { entry_id: fixture.bEntryId, scope: "definition" as const, expected_defaults_revision: 0 },
      { entry_id: fixture.cEntryId, scope: "definition" as const, expected_defaults_revision: 0 },
    ],
    expected_placement_revision: 0,
  };
}

describe.sequential("BulkMoveEntriesToSectionScoped", () => {
  it("atomically applies per-Routine occurrence/definition scopes with multi-definition propagation", async () => {
    const fixture = await seed();
    const request = requestFor(fixture);
    expect(isBulkMoveEntriesToSectionScopedRequest({ ...request, user_id: fixture.userId })).toBe(false);
    expect(isBulkMoveEntriesToSectionScopedRequest({ ...request, routine_scopes: request.routine_scopes.slice(0, 2) })).toBe(true);
    expect(isBulkMoveEntriesToSectionScopedRequest({ ...request, routine_scopes: [
      ...request.routine_scopes, { entry_id: fixture.ordinaryEntryId, scope: "occurrence" as const },
    ] })).toBe(true);
    const result = await bulkMoveEntriesToSectionScoped(env.APP_DB, fixture.userId, request, now);
    expect(result).toMatchObject({
      changed_entry_ids: [fixture.ordinaryEntryId, fixture.aEntryId, fixture.bEntryId, fixture.cEntryId],
      propagated_entry_ids: [fixture.bFutureEntryId, fixture.cFutureEntryId],
      routine_override_changed_entry_ids: [fixture.aEntryId, fixture.bEntryId, fixture.cEntryId],
      definition_changed_routine_definition_ids: [fixture.bDefinitionId, fixture.cDefinitionId].sort(),
      placement_revision: 1,
      defaults_revisions: [
        { routine_definition_id: fixture.bDefinitionId, defaults_revision: 1 },
        { routine_definition_id: fixture.cDefinitionId, defaults_revision: 1 },
      ].sort((left, right) => left.routine_definition_id.localeCompare(right.routine_definition_id)),
    });
    expect(result.affected_day_revisions).toEqual([
      { taskchute_day_id: fixture.dayId, placement_revision: 1 },
      { taskchute_day_id: fixture.futureDayId, placement_revision: 5 },
    ].sort((left, right) => left.taskchute_day_id.localeCompare(right.taskchute_day_id)));
    expect(await env.APP_DB.prepare(`SELECT id, section_id, planned_start_minute, position FROM entries
      WHERE app_user_id = ? AND id IN (?, ?, ?, ?) ORDER BY position`).bind(fixture.userId,
      fixture.ordinaryEntryId, fixture.aEntryId, fixture.bEntryId, fixture.cEntryId).all()).toMatchObject({ results: [
      { id: fixture.ordinaryEntryId, section_id: fixture.sections[2], planned_start_minute: 960, position: 1 },
      { id: fixture.aEntryId, section_id: fixture.sections[2], planned_start_minute: 960, position: 2 },
      { id: fixture.bEntryId, section_id: fixture.sections[2], planned_start_minute: 960, position: 3 },
      { id: fixture.cEntryId, section_id: fixture.sections[2], planned_start_minute: 960, position: 4 },
    ] });
    expect(await env.APP_DB.prepare(`SELECT id, section_id, planned_start_minute, position FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY position`).bind(fixture.userId, fixture.futureDayId).all()).toMatchObject({ results: [
      { id: fixture.bFutureEntryId, section_id: fixture.sections[2], planned_start_minute: 960, position: 1 },
      { id: fixture.cFutureEntryId, section_id: fixture.sections[2], planned_start_minute: 960, position: 2 },
      { id: fixture.cProtectedEntryId, section_id: fixture.sections[0], planned_start_minute: 0, position: 3 },
    ] });
    expect(await env.APP_DB.prepare(`SELECT section_plan_override_present, section_override_id, planned_start_override_minute
      FROM routine_occurrences WHERE id IN (?, ?, ?) ORDER BY CASE id WHEN ? THEN 0 WHEN ? THEN 1 WHEN ? THEN 2 END`)
      .bind(fixture.aOccurrenceId, fixture.bOccurrenceId, fixture.cOccurrenceId,
        fixture.aOccurrenceId, fixture.bOccurrenceId, fixture.cOccurrenceId).all()).toMatchObject({ results: [
      { section_plan_override_present: 1, section_override_id: fixture.sections[2], planned_start_override_minute: 960 },
      { section_plan_override_present: 0, section_override_id: null, planned_start_override_minute: null },
      { section_plan_override_present: 0, section_override_id: null, planned_start_override_minute: null },
    ] });
    expect(await env.APP_DB.prepare("SELECT section_plan_override_present, section_override_id, planned_start_override_minute FROM routine_occurrences WHERE id = ?")
      .bind(fixture.cProtectedOccurrenceId).first()).toEqual({ section_plan_override_present: 1, section_override_id: fixture.sections[1], planned_start_override_minute: 480 });
    expect(await env.APP_DB.prepare("SELECT defaults_revision FROM routine_definitions WHERE id = ?").bind(fixture.aDefinitionId).first<number>("defaults_revision")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT defaults_revision, default_section_id, default_planned_start_minute FROM routine_definitions WHERE id IN (?, ?) ORDER BY CASE id WHEN ? THEN 0 WHEN ? THEN 1 END")
      .bind(fixture.bDefinitionId, fixture.cDefinitionId, fixture.bDefinitionId, fixture.cDefinitionId).all()).toMatchObject({ results: [
      { defaults_revision: 1, default_section_id: fixture.sections[2], default_planned_start_minute: 960 },
      { defaults_revision: 1, default_section_id: fixture.sections[2], default_planned_start_minute: 960 },
    ] });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ? AND command_type = 'BulkMoveEntriesToSectionScoped'")
      .bind(fixture.userId, request.operation_id).first<number>("count")).toBe(1);
    expect(await bulkMoveEntriesToSectionScoped(env.APP_DB, fixture.userId, { ...request, entry_ids: [...request.entry_ids].reverse(), routine_scopes: [...request.routine_scopes].reverse() }, now)).toEqual(result);
  });

  it("rejects missing/ordinary/duplicate coverage and stale defaults without partial writes", async () => {
    const fixture = await seed();
    const request = requestFor(fixture);
    await expect(bulkMoveEntriesToSectionScoped(env.APP_DB, fixture.userId, { ...request, routine_scopes: request.routine_scopes.slice(0, 2), operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await expect(bulkMoveEntriesToSectionScoped(env.APP_DB, fixture.userId, { ...request, routine_scopes: [
      ...request.routine_scopes, { entry_id: fixture.ordinaryEntryId, scope: "occurrence" as const },
    ], operation_id: uuidv7() }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const duplicateEntryId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
      SELECT ?, app_user_id, task_id, taskchute_day_id, ?, 4, lifecycle_state,
        estimate_seconds, planned_start_minute, created_at, routine_occurrence_id
      FROM entries WHERE app_user_id = ? AND id = ?`)
      .bind(duplicateEntryId, fixture.sections[0], fixture.userId, fixture.bEntryId).run();
    await expect(bulkMoveEntriesToSectionScoped(env.APP_DB, fixture.userId, { ...request,
      entry_ids: [...request.entry_ids, duplicateEntryId],
      routine_scopes: [
        { entry_id: fixture.aEntryId, scope: "occurrence" as const },
        { entry_id: fixture.bEntryId, scope: "occurrence" as const },
        { entry_id: fixture.cEntryId, scope: "definition" as const, expected_defaults_revision: 0 },
        { entry_id: duplicateEntryId, scope: "definition" as const, expected_defaults_revision: 0 },
      ],
      operation_id: uuidv7(),
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first<number>("placement_revision")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT defaults_revision FROM routine_definitions WHERE id IN (?, ?) ORDER BY id").bind(fixture.bDefinitionId, fixture.cDefinitionId).all()).toMatchObject({ results: [
      { defaults_revision: 0 }, { defaults_revision: 0 },
    ] });
    await env.APP_DB.prepare("UPDATE routine_definitions SET defaults_revision = 1 WHERE id = ?").bind(fixture.bDefinitionId).run();
    await expect(bulkMoveEntriesToSectionScoped(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND section_id = ?")
      .bind(fixture.userId, fixture.sections[2]).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT defaults_revision FROM routine_definitions WHERE id = ?").bind(fixture.cDefinitionId).first<number>("defaults_revision")).toBe(0);
  });
});
