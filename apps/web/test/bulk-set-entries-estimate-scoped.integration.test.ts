import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  bulkSetEntriesEstimateScoped,
  isBulkSetEntriesEstimateScopedRequest,
} from "../worker/application/bulk-set-entries-estimate-scoped";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-09-02T12:00:00.000Z";

async function seed() {
  const userId = uuidv7();
  const currentDayId = uuidv7();
  const futureDayId = uuidv7();
  const protectedOriginDayId = uuidv7();
  const ordinaryTaskId = uuidv7();
  const routineATaskId = uuidv7();
  const routineBTaskId = uuidv7();
  const ordinaryEntryId = uuidv7();
  const routineAEntryId = uuidv7();
  const routineBEntryId = uuidv7();
  const futureOrdinaryEntryId = uuidv7();
  const futureBEntryId = uuidv7();
  const protectedBEntryId = uuidv7();
  const definitionAId = uuidv7();
  const definitionBId = uuidv7();
  const occurrenceAId = uuidv7();
  const occurrenceBId = uuidv7();
  const futureOccurrenceBId = uuidv7();
  const protectedOccurrenceBId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    ...[
      [currentDayId, "2026-09-02", "2026-09-03", 11],
      [futureDayId, "2026-09-03", "2026-09-04", 17],
      [protectedOriginDayId, "2026-09-01", "2026-09-02", 3],
    ].map(([id, date, nextDate, revision]) => env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
       establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, ?, ?, ?, 'UTC', 0, 'compatible', ?, ?)`).bind(
      id, userId, date, `${date}T00:00:00.000Z`, `${nextDate}T00:00:00.000Z`, revision, now,
    )),
    ...[
      [ordinaryTaskId, "Ordinary"], [routineATaskId, "Routine A"], [routineBTaskId, "Routine B"],
    ].map(([id, title]) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)").bind(id, userId, title, now)),
    env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date, default_section_id,
       default_estimate_seconds, default_planned_start_minute, materialization_order, defaults_revision, created_at)
      VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, NULL, 600, NULL, 1, 0, ?)`)
      .bind(definitionAId, userId, routineATaskId, now),
    env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date, default_section_id,
       default_estimate_seconds, default_planned_start_minute, materialization_order, defaults_revision, created_at)
      VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, NULL, 600, NULL, 2, 0, ?)`)
      .bind(definitionBId, userId, routineBTaskId, now),
    ...[
      [occurrenceAId, definitionAId, currentDayId], [occurrenceBId, definitionBId, currentDayId],
      [futureOccurrenceBId, definitionBId, futureDayId], [protectedOccurrenceBId, definitionBId, protectedOriginDayId],
    ].map(([id, definitionId, originDayId]) => env.APP_DB.prepare(`INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, userId, definitionId, originDayId, now)),
    env.APP_DB.prepare(`UPDATE routine_occurrences SET estimate_override_present = 1, estimate_override_seconds = 900 WHERE id = ?`)
      .bind(occurrenceBId),
    env.APP_DB.prepare(`UPDATE routine_occurrences SET estimate_override_present = 1, estimate_override_seconds = 777 WHERE id = ?`)
      .bind(protectedOccurrenceBId),
    ...[
      [ordinaryEntryId, ordinaryTaskId, currentDayId, 1, 600, null],
      [routineAEntryId, routineATaskId, currentDayId, 2, 600, occurrenceAId],
      [routineBEntryId, routineBTaskId, currentDayId, 3, 900, occurrenceBId],
      [futureOrdinaryEntryId, ordinaryTaskId, futureDayId, 3, 600, null],
      [futureBEntryId, routineBTaskId, futureDayId, 1, 600, futureOccurrenceBId],
      [protectedBEntryId, routineBTaskId, futureDayId, 2, 777, protectedOccurrenceBId],
    ].map(([id, taskId, dayId, position, estimate, occurrenceId]) => env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
      VALUES (?, ?, ?, ?, NULL, ?, 'planned', ?, NULL, ?, ?)`)
      .bind(id, userId, taskId, dayId, position, estimate, now, occurrenceId)),
  ]);
  return {
    userId, currentDayId, futureDayId, ordinaryEntryId, routineAEntryId, routineBEntryId,
    futureOrdinaryEntryId, futureBEntryId, protectedBEntryId, definitionAId, definitionBId, occurrenceAId, occurrenceBId,
    futureOccurrenceBId, protectedOccurrenceBId,
  };
}

function requestFor(fixture: Awaited<ReturnType<typeof seed>>, estimateSeconds: number | null = 1800) {
  return {
    operation_id: uuidv7(), taskchute_day_id: fixture.currentDayId,
    entry_ids: [fixture.ordinaryEntryId, fixture.routineAEntryId, fixture.routineBEntryId],
    estimate_seconds: estimateSeconds,
    routine_scopes: [
      { entry_id: fixture.routineAEntryId, scope: "occurrence" as const },
      { entry_id: fixture.routineBEntryId, scope: "definition" as const, expected_defaults_revision: 0 },
    ],
  };
}

describe.sequential("BulkSetEntriesEstimateScoped", () => {
  it("atomically applies a mixed positive estimate, propagates one definition, preserves overrides, and replays", async () => {
    const fixture = await seed();
    const request = requestFor(fixture);
    expect(isBulkSetEntriesEstimateScopedRequest({ ...request, user_id: fixture.userId })).toBe(false);
    expect(isBulkSetEntriesEstimateScopedRequest({ ...request, routine_scopes: [] })).toBe(true);
    const result = await bulkSetEntriesEstimateScoped(env.APP_DB, fixture.userId, request, now);
    expect(result).toEqual({
      taskchute_day_id: fixture.currentDayId,
      entry_ids: request.entry_ids,
      estimate_seconds: 1800,
      changed_entry_ids: [fixture.ordinaryEntryId, fixture.routineAEntryId, fixture.routineBEntryId],
      propagated_entry_ids: [fixture.futureBEntryId],
      routine_override_changed_entry_ids: [fixture.routineAEntryId, fixture.routineBEntryId],
      definition_changed_routine_definition_ids: [fixture.definitionBId],
      defaults_revisions: [{ routine_definition_id: fixture.definitionBId, defaults_revision: 1 }],
    });
    expect(await env.APP_DB.prepare(`SELECT id, estimate_seconds FROM entries WHERE id IN (?, ?, ?, ?) ORDER BY id`)
      .bind(fixture.ordinaryEntryId, fixture.routineAEntryId, fixture.routineBEntryId, fixture.futureBEntryId).all())
      .toMatchObject({ results: expect.arrayContaining([
        { id: fixture.ordinaryEntryId, estimate_seconds: 1800 },
        { id: fixture.routineAEntryId, estimate_seconds: 1800 },
        { id: fixture.routineBEntryId, estimate_seconds: 1800 },
        { id: fixture.futureBEntryId, estimate_seconds: 1800 },
      ]) });
    expect(await env.APP_DB.prepare("SELECT estimate_seconds FROM entries WHERE id = ?").bind(fixture.protectedBEntryId).first())
      .toEqual({ estimate_seconds: 777 });
    expect(await env.APP_DB.prepare("SELECT estimate_override_present, estimate_override_seconds FROM routine_occurrences WHERE id IN (?, ?) ORDER BY id")
      .bind(fixture.occurrenceAId, fixture.occurrenceBId).all()).toMatchObject({ results: expect.arrayContaining([
      { estimate_override_present: 0, estimate_override_seconds: null },
      { estimate_override_present: 1, estimate_override_seconds: 1800 },
    ]) });
    expect(await env.APP_DB.prepare("SELECT default_estimate_seconds, defaults_revision FROM routine_definitions WHERE id = ?")
      .bind(fixture.definitionBId).first()).toEqual({ default_estimate_seconds: 1800, defaults_revision: 1 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id IN (?, ?) ORDER BY logical_date")
      .bind(fixture.currentDayId, fixture.futureDayId).all()).toMatchObject({ results: [
      { placement_revision: 11 }, { placement_revision: 17 },
    ] });
    expect(await env.APP_DB.prepare("SELECT command_type FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(fixture.userId, request.operation_id).first()).toEqual({ command_type: "BulkSetEntriesEstimateScoped" });
    expect(await bulkSetEntriesEstimateScoped(env.APP_DB, fixture.userId, {
      ...request, entry_ids: [...request.entry_ids].reverse(), routine_scopes: [...request.routine_scopes].reverse(),
    }, now)).toEqual(result);
  });

  it("supports explicit NULL for ordinary, occurrence, and definition scopes", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, null);
    const result = await bulkSetEntriesEstimateScoped(env.APP_DB, fixture.userId, request, now);
    expect(result.estimate_seconds).toBeNull();
    expect(result.propagated_entry_ids).toEqual([fixture.futureBEntryId]);
    expect(await env.APP_DB.prepare("SELECT id, estimate_seconds FROM entries WHERE id IN (?, ?, ?, ?) ORDER BY id")
      .bind(fixture.ordinaryEntryId, fixture.routineAEntryId, fixture.routineBEntryId, fixture.futureBEntryId).all())
      .toMatchObject({ results: expect.arrayContaining([
        { id: fixture.ordinaryEntryId, estimate_seconds: null }, { id: fixture.routineAEntryId, estimate_seconds: null },
        { id: fixture.routineBEntryId, estimate_seconds: null }, { id: fixture.futureBEntryId, estimate_seconds: null },
      ]) });
    expect(await env.APP_DB.prepare("SELECT default_estimate_seconds FROM routine_definitions WHERE id = ?")
      .bind(fixture.definitionBId).first()).toEqual({ default_estimate_seconds: null });
    expect(await env.APP_DB.prepare("SELECT estimate_override_present, estimate_override_seconds FROM routine_occurrences WHERE id = ?")
      .bind(fixture.occurrenceAId).first()).toEqual({ estimate_override_present: 1, estimate_override_seconds: null });
  });

  it("allows ordinary-only changes on an established future Day without a placement revision", async () => {
    const fixture = await seed();
    const request = {
      operation_id: uuidv7(),
      taskchute_day_id: fixture.futureDayId,
      entry_ids: [fixture.futureOrdinaryEntryId],
      estimate_seconds: 1200,
      routine_scopes: [],
    };
    const result = await bulkSetEntriesEstimateScoped(env.APP_DB, fixture.userId, request, now);
    expect(result).toMatchObject({
      taskchute_day_id: fixture.futureDayId,
      entry_ids: [fixture.futureOrdinaryEntryId],
      changed_entry_ids: [fixture.futureOrdinaryEntryId],
      propagated_entry_ids: [],
      definition_changed_routine_definition_ids: [],
      defaults_revisions: [],
    });
    expect(await env.APP_DB.prepare("SELECT estimate_seconds FROM entries WHERE id = ?")
      .bind(fixture.futureOrdinaryEntryId).first()).toEqual({ estimate_seconds: 1200 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.futureDayId).first()).toEqual({ placement_revision: 17 });
  });

  it("rejects incomplete scopes, mixed scope for one definition, and stale defaults without partial writes", async () => {
    const fixture = await seed();
    const request = requestFor(fixture);
    await expect(bulkSetEntriesEstimateScoped(env.APP_DB, fixture.userId, {
      ...request, operation_id: uuidv7(), routine_scopes: [{ entry_id: fixture.routineAEntryId, scope: "occurrence" }],
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    await expect(bulkSetEntriesEstimateScoped(env.APP_DB, fixture.userId, {
      ...request, operation_id: uuidv7(), routine_scopes: [
        { entry_id: fixture.routineAEntryId, scope: "occurrence" },
        { entry_id: fixture.ordinaryEntryId, scope: "occurrence" },
      ],
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT estimate_seconds FROM entries WHERE id IN (?, ?, ?) ORDER BY id")
      .bind(fixture.ordinaryEntryId, fixture.routineAEntryId, fixture.routineBEntryId).all()).toMatchObject({ results: expect.arrayContaining([
        { estimate_seconds: 600 }, { estimate_seconds: 900 },
      ]) });
    await env.APP_DB.prepare("UPDATE routine_definitions SET defaults_revision = 1 WHERE id = ?").bind(fixture.definitionBId).run();
    await expect(bulkSetEntriesEstimateScoped(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT estimate_seconds FROM entries WHERE id = ?").bind(fixture.futureBEntryId).first())
      .toEqual({ estimate_seconds: 600 });
  });
});
