import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  bulkMoveEntriesToSection,
  isBulkMoveEntriesToSectionRequest,
} from "../worker/application/bulk-move-entries-to-section";
import {
  bulkMoveEntriesToSectionOccurrence,
  isBulkMoveEntriesToSectionOccurrenceRequest,
} from "../worker/application/bulk-move-entries-to-section-occurrence";
import { loadTaskChuteDayByLogicalDate } from "../worker/application/load-current-day";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-09-02T12:00:00.000Z";

function instantForMinute(minute: number): string {
  if (minute === 1440) return "2026-09-03T00:00:00.000Z";
  return `2026-09-02T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00.000Z`;
}

async function seed() {
  const userId = uuidv7();
  const otherUserId = uuidv7();
  const dayId = uuidv7();
  const configurationVersionId = uuidv7();
  const sectionA = uuidv7();
  const sectionB = uuidv7();
  const sectionC = uuidv7();
  const ordinaryTaskIds = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const ordinaryEntryIds = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  const routineTaskId = uuidv7();
  const routineDefinitionId = uuidv7();
  const routineOccurrenceId = uuidv7();
  const routineEntryId = uuidv7();
  const runningEntryId = uuidv7();
  const completedEntryId = uuidv7();
  const otherDayId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?), (?, ?)")
      .bind(userId, now, otherUserId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?), (?, 'UTC', 0, ?)")
      .bind(userId, now, otherUserId, now),
    ...[
      [sectionA, "Alpha", 0], [sectionB, "Beta", 1], [sectionC, "Gamma", 2],
    ].map(([id, title, sortOrder]) => env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, userId, title, sortOrder, now)),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(configurationVersionId, userId, now),
    ...[
      [sectionA, "Alpha", 0, 480], [sectionB, "Beta", 1, 720], [sectionC, "Gamma", 2, 1440],
    ].map(([id, title, order, end]) => env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, configurationVersionId, id, title, Number(order) === 0 ? 0 : Number(order) === 1 ? 480 : 720, end, order)),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days (id, app_user_id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-02', '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?),
      (?, ?, '2026-09-01', '2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now, otherDayId, otherUserId, now),
    ...[
      [sectionA, "Alpha", 0, 0, 480], [sectionB, "Beta", 1, 480, 720], [sectionC, "Gamma", 2, 720, 1440],
    ].map(([id, title, order, start, end]) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, dayId, id, configurationVersionId, title, start, end, instantForMinute(Number(start)), instantForMinute(Number(end)), order)),
    ...[
      ...ordinaryTaskIds.map((id, index) => [id, `Ordinary ${index + 1}`]),
      [routineTaskId, "Routine task"],
    ].map(([id, title]) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, userId, title, now)),
    env.APP_DB.prepare(`INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type, start_logical_date,
      end_logical_date, default_section_id, default_estimate_seconds, default_planned_start_minute, materialization_order,
      defaults_revision, created_at) VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, ?, 600, 0, 1, 0, ?)`)
      .bind(routineDefinitionId, userId, routineTaskId, sectionA, now),
    env.APP_DB.prepare("INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(routineOccurrenceId, userId, routineDefinitionId, dayId, now),
    ...[
      [ordinaryEntryIds[0], ordinaryTaskIds[0], sectionA, 1, 60],
      [ordinaryEntryIds[1], ordinaryTaskIds[1], sectionA, 2, 60],
      [ordinaryEntryIds[2], ordinaryTaskIds[2], sectionB, 1, 600],
      [ordinaryEntryIds[3], ordinaryTaskIds[3], sectionB, 2, 480],
      [ordinaryEntryIds[4], ordinaryTaskIds[4], sectionC, 1, 720],
      [ordinaryEntryIds[5], ordinaryTaskIds[5], null, 1, null],
      [routineEntryId, routineTaskId, sectionA, 3, 60, routineOccurrenceId],
      [runningEntryId, ordinaryTaskIds[6], sectionA, 4, 60, null, "running"],
      [completedEntryId, ordinaryTaskIds[6], sectionA, 5, 60, null, "completed"],
    ].map(([entryId, taskId, sectionId, position, plannedStart, routineId, lifecycle = "planned"]) => env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, planned_start_minute, created_at, routine_occurrence_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 600, ?, ?, ?)`)
      .bind(entryId, userId, taskId, dayId, sectionId, position, lifecycle, plannedStart, now, routineId ?? null)),
  ]);
  return { userId, otherUserId, dayId, sectionA, sectionB, sectionC, ordinaryTaskIds, ordinaryEntryIds, routineDefinitionId, routineOccurrenceId, routineEntryId, runningEntryId, completedEntryId };
}

function requestFor(fixture: Awaited<ReturnType<typeof seed>>, entryIds: string[], sectionId: string | null, revision = 0) {
  return {
    operation_id: uuidv7(), taskchute_day_id: fixture.dayId, entry_ids: entryIds, section_id: sectionId,
    expected_placement_revision: revision,
  };
}

describe.sequential("BulkMoveEntriesToSection", () => {
  it("validates the request and moves ordinary Entries in canonical display order with D-043 sync and replay", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, [fixture.ordinaryEntryIds[1]!, fixture.ordinaryEntryIds[0]!], fixture.sectionB);
    expect(isBulkMoveEntriesToSectionRequest({ ...request, user_id: fixture.userId })).toBe(false);
    expect(isBulkMoveEntriesToSectionRequest({ ...request, entry_ids: [request.entry_ids[0], request.entry_ids[0]] })).toBe(false);
    expect(isBulkMoveEntriesToSectionRequest({ ...request, expected_placement_revision: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(isBulkMoveEntriesToSectionRequest({ ...request, section_id: "not-a-uuid" })).toBe(false);

    const result = await bulkMoveEntriesToSection(env.APP_DB, fixture.userId, request, now);
    expect(result).toEqual({ taskchute_day_id: fixture.dayId, entry_ids: request.entry_ids,
      changed_entry_ids: request.entry_ids, section_id: fixture.sectionB, planned_start_minute: 480, placement_revision: 1 });
    expect(await bulkMoveEntriesToSection(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    expect(await env.APP_DB.prepare("SELECT section_id, position, planned_start_minute FROM entries WHERE app_user_id = ? AND id IN (?, ?) ORDER BY position")
      .bind(fixture.userId, fixture.ordinaryEntryIds[0], fixture.ordinaryEntryIds[1]).all()).toEqual({
        results: [
          { section_id: fixture.sectionB, position: 3, planned_start_minute: 480 },
          { section_id: fixture.sectionB, position: 4, planned_start_minute: 480 },
        ],
        success: true,
        meta: expect.any(Object),
      });
    expect(await env.APP_DB.prepare("SELECT task_id FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.ordinaryEntryIds[0]).first()).toEqual({ task_id: fixture.ordinaryTaskIds[0] });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.dayId).first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ? AND command_type = 'BulkMoveEntriesToSection'")
      .bind(fixture.userId, request.operation_id).first<number>("count")).toBe(1);
    await expect(bulkMoveEntriesToSection(env.APP_DB, fixture.userId, { ...request, section_id: fixture.sectionC }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
  });

  it("syncs same-Section starts without position churn, handles Sectionなし, and leaves no-op revision unchanged", async () => {
    const fixture = await seed();
    const sameSection = requestFor(fixture, [fixture.ordinaryEntryIds[2]!], fixture.sectionB);
    const synced = await bulkMoveEntriesToSection(env.APP_DB, fixture.userId, sameSection, now);
    expect(synced.changed_entry_ids).toEqual([fixture.ordinaryEntryIds[2]]);
    expect(synced.placement_revision).toBe(1);
    expect(await env.APP_DB.prepare("SELECT section_id, position, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.ordinaryEntryIds[2]).first()).toEqual({ section_id: fixture.sectionB, position: 1, planned_start_minute: 480 });

    const unsectioned = requestFor(fixture, [fixture.ordinaryEntryIds[0]!], null, 1);
    const cleared = await bulkMoveEntriesToSection(env.APP_DB, fixture.userId, unsectioned, now);
    expect(cleared).toMatchObject({ section_id: null, planned_start_minute: null, placement_revision: 2 });
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.ordinaryEntryIds[0]).first()).toEqual({ section_id: null, planned_start_minute: null });

    const noOp = requestFor(fixture, [fixture.ordinaryEntryIds[0]!], null, 2);
    const noOpResult = await bulkMoveEntriesToSection(env.APP_DB, fixture.userId, noOp, now);
    expect(noOpResult.changed_entry_ids).toEqual([]);
    expect(noOpResult.placement_revision).toBe(2);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(2);
  });

  it("rejects Routine, running, completed, stale, cross-owner, and cross-Day targets without mutation", async () => {
    const fixture = await seed();
    for (const entryId of [fixture.routineEntryId, fixture.runningEntryId, fixture.completedEntryId]) {
      const before = await env.APP_DB.prepare("SELECT section_id, position, planned_start_minute FROM entries WHERE id = ?").bind(entryId).first();
      await expect(bulkMoveEntriesToSection(env.APP_DB, fixture.userId, requestFor(fixture, [entryId], fixture.sectionB), now))
        .rejects.toMatchObject({ code: "resource_conflict" });
      expect(await env.APP_DB.prepare("SELECT section_id, position, planned_start_minute FROM entries WHERE id = ?").bind(entryId).first()).toEqual(before);
    }
    await expect(bulkMoveEntriesToSection(env.APP_DB, fixture.otherUserId, requestFor(fixture, [fixture.ordinaryEntryIds[0]!], fixture.sectionB), now))
      .rejects.toMatchObject({ code: "resource_not_found" });
    await expect(bulkMoveEntriesToSection(env.APP_DB, fixture.userId, requestFor(fixture, [uuidv7()], fixture.sectionB), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    await expect(bulkMoveEntriesToSection(env.APP_DB, fixture.userId, requestFor(fixture, [fixture.ordinaryEntryIds[0]!], fixture.sectionB, 99), now))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first<number>("placement_revision")).toBe(0);
  });

  it("rolls back an injected failure and retries the exact operation once", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, [fixture.ordinaryEntryIds[0]!, fixture.ordinaryEntryIds[1]!], fixture.sectionB);
    await env.APP_DB.prepare(`CREATE TRIGGER fail_bulk_section BEFORE UPDATE OF section_id ON entries
      WHEN NEW.id = '${fixture.ordinaryEntryIds[0]}' BEGIN SELECT RAISE(ABORT, 'injected bulk section failure'); END`).run();
    await expect(bulkMoveEntriesToSection(env.APP_DB, fixture.userId, request, now)).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT section_id, position FROM entries WHERE app_user_id = ? AND id IN (?, ?) ORDER BY position")
      .bind(fixture.userId, fixture.ordinaryEntryIds[0], fixture.ordinaryEntryIds[1]).all()).toMatchObject({ results: [
        { section_id: fixture.sectionA, position: 1 }, { section_id: fixture.sectionA, position: 2 },
      ] });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first<number>("placement_revision")).toBe(0);
    await env.APP_DB.prepare("DROP TRIGGER fail_bulk_section").run();
    const result = await bulkMoveEntriesToSection(env.APP_DB, fixture.userId, request, now);
    expect(result.placement_revision).toBe(1);
    expect(await bulkMoveEntriesToSection(env.APP_DB, fixture.userId, request, now)).toEqual(result);
  });

  it("reconciles the persisted projection after a Section change", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, [fixture.ordinaryEntryIds[0]!], fixture.sectionC);
    await bulkMoveEntriesToSection(env.APP_DB, fixture.userId, request, now);
    const projection = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-09-02", now);
    const entry = projection.sections.find((section) => section.id === fixture.sectionC)?.entries.find((candidate) => candidate.id === fixture.ordinaryEntryIds[0]);
    expect(entry).toMatchObject({ id: fixture.ordinaryEntryIds[0], section_id: fixture.sectionC, planned_start_minute: 720 });
    expect(projection.placement_revision).toBe(1);
    expect(projection.sections.find((section) => section.id === fixture.sectionA)?.entries.some((candidate) => candidate.id === fixture.routineEntryId)).toBe(true);
  });

  it("moves mixed ordinary and Routine Entries in display order, persists only the current occurrence override, and replays", async () => {
    const fixture = await seed();
    const request = { ...requestFor(fixture, [fixture.routineEntryId, fixture.ordinaryEntryIds[1]!], fixture.sectionB),
      operation_id: uuidv7() };
    expect(isBulkMoveEntriesToSectionOccurrenceRequest({ ...request, user_id: fixture.userId })).toBe(false);
    expect(isBulkMoveEntriesToSectionOccurrenceRequest({ ...request, entry_ids: [request.entry_ids[0], request.entry_ids[0]] })).toBe(false);
    const routineDefaultsBefore = await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute, defaults_revision
      FROM routine_definitions WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, await env.APP_DB.prepare(
      "SELECT routine_definition_id FROM routine_occurrences WHERE id = ?").bind(fixture.routineOccurrenceId).first<string>("routine_definition_id")).first();

    const result = await bulkMoveEntriesToSectionOccurrence(env.APP_DB, fixture.userId, request, now);
    expect(result).toEqual({ taskchute_day_id: fixture.dayId, entry_ids: request.entry_ids,
      changed_entry_ids: request.entry_ids, routine_override_changed_entry_ids: [fixture.routineEntryId],
      section_id: fixture.sectionB, planned_start_minute: 480, placement_revision: 1 });
    expect(await env.APP_DB.prepare(`SELECT id, section_id, position, planned_start_minute
      FROM entries WHERE app_user_id = ? AND id IN (?, ?) ORDER BY position`)
      .bind(fixture.userId, fixture.ordinaryEntryIds[1], fixture.routineEntryId).all()).toMatchObject({ results: [
        { id: fixture.ordinaryEntryIds[1], section_id: fixture.sectionB, position: 3, planned_start_minute: 480 },
        { id: fixture.routineEntryId, section_id: fixture.sectionB, position: 4, planned_start_minute: 480 },
      ] });
    expect(await env.APP_DB.prepare(`SELECT section_plan_override_present, section_override_id, planned_start_override_minute
      FROM routine_occurrences WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, fixture.routineOccurrenceId).first()).toEqual({
      section_plan_override_present: 1, section_override_id: fixture.sectionB, planned_start_override_minute: 480,
    });
    expect(await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute, defaults_revision
      FROM routine_definitions WHERE app_user_id = ? AND id = (SELECT routine_definition_id FROM routine_occurrences WHERE id = ?)`)
      .bind(fixture.userId, fixture.routineOccurrenceId).first()).toEqual(routineDefaultsBefore);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT command_type, outcome_kind FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(fixture.userId, request.operation_id).first()).toEqual({ command_type: "BulkMoveEntriesToSectionOccurrence", outcome_kind: "success" });
    expect(await bulkMoveEntriesToSectionOccurrence(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    const projection = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-09-02", now);
    expect(projection.sections.find((section) => section.id === fixture.sectionB)?.entries.map((entry) => entry.id))
      .toContain(fixture.routineEntryId);
  });

  it("supports Sectionなし, override-only changes, and rejects a suppressed or non-current Routine occurrence atomically", async () => {
    const fixture = await seed();
    await env.APP_DB.prepare("UPDATE entries SET planned_start_minute = 0 WHERE id = ?").bind(fixture.routineEntryId).run();
    const overrideOnly = requestFor(fixture, [fixture.routineEntryId], fixture.sectionA);
    const overrideOnlyResult = await bulkMoveEntriesToSectionOccurrence(env.APP_DB, fixture.userId, overrideOnly, now);
    expect(overrideOnlyResult).toMatchObject({ changed_entry_ids: [], routine_override_changed_entry_ids: [fixture.routineEntryId], placement_revision: 0 });
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?").bind(fixture.routineEntryId).first())
      .toEqual({ section_id: fixture.sectionA, planned_start_minute: 0 });
    expect(await env.APP_DB.prepare("SELECT section_plan_override_present, section_override_id, planned_start_override_minute FROM routine_occurrences WHERE id = ?")
      .bind(fixture.routineOccurrenceId).first()).toEqual({ section_plan_override_present: 1, section_override_id: fixture.sectionA, planned_start_override_minute: 0 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first<number>("placement_revision")).toBe(0);

    const sectionless = requestFor(fixture, [fixture.routineEntryId, fixture.ordinaryEntryIds[0]!], null);
    const sectionlessResult = await bulkMoveEntriesToSectionOccurrence(env.APP_DB, fixture.userId, sectionless, now);
    expect(sectionlessResult).toMatchObject({ section_id: null, planned_start_minute: null, placement_revision: 1 });
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id IN (?, ?) ORDER BY id")
      .bind(fixture.routineEntryId, fixture.ordinaryEntryIds[0]).all()).toMatchObject({ results: [
        { section_id: null, planned_start_minute: null }, { section_id: null, planned_start_minute: null },
      ] });
    expect(await env.APP_DB.prepare("SELECT section_plan_override_present, section_override_id, planned_start_override_minute FROM routine_occurrences WHERE id = ?")
      .bind(fixture.routineOccurrenceId).first()).toEqual({ section_plan_override_present: 1, section_override_id: null, planned_start_override_minute: null });

    const suppressedFixture = await seed();
    await env.APP_DB.prepare("INSERT INTO routine_occurrence_suppressions (app_user_id, routine_occurrence_id, suppressed_at, reason) VALUES (?, ?, ?, 'skip')")
      .bind(suppressedFixture.userId, suppressedFixture.routineOccurrenceId, now).run();
    await expect(bulkMoveEntriesToSectionOccurrence(env.APP_DB, suppressedFixture.userId,
      requestFor(suppressedFixture, [suppressedFixture.routineEntryId], suppressedFixture.sectionB), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(suppressedFixture.routineEntryId).first()).toEqual({ section_id: suppressedFixture.sectionA, planned_start_minute: 60 });

    const nonCurrentFixture = await seed();
    await env.APP_DB.prepare("UPDATE taskchute_days SET logical_date = '2026-09-01' WHERE id = ?").bind(nonCurrentFixture.dayId).run();
    await expect(bulkMoveEntriesToSectionOccurrence(env.APP_DB, nonCurrentFixture.userId,
      requestFor(nonCurrentFixture, [nonCurrentFixture.routineEntryId], nonCurrentFixture.sectionB), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(nonCurrentFixture.dayId).first<number>("placement_revision")).toBe(0);
  });

  it("rolls back mixed Entry and occurrence writes together and retries the exact operation", async () => {
    const fixture = await seed();
    const request = requestFor(fixture, [fixture.routineEntryId, fixture.ordinaryEntryIds[0]!], fixture.sectionB);
    await env.APP_DB.prepare(`CREATE TRIGGER fail_bulk_section_occurrence BEFORE UPDATE OF section_id ON entries
      WHEN NEW.id = '${fixture.ordinaryEntryIds[0]}' BEGIN SELECT RAISE(ABORT, 'injected bulk section occurrence failure'); END`).run();
    await expect(bulkMoveEntriesToSectionOccurrence(env.APP_DB, fixture.userId, request, now))
      .rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT section_id, position, planned_start_minute FROM entries WHERE app_user_id = ? AND id IN (?, ?) ORDER BY id")
      .bind(fixture.userId, fixture.routineEntryId, fixture.ordinaryEntryIds[0]).all()).toMatchObject({ results: [
        { section_id: fixture.sectionA, planned_start_minute: 60 }, { section_id: fixture.sectionA, planned_start_minute: 60 },
      ] });
    expect(await env.APP_DB.prepare("SELECT section_plan_override_present, section_override_id, planned_start_override_minute FROM routine_occurrences WHERE id = ?")
      .bind(fixture.routineOccurrenceId).first()).toEqual({ section_plan_override_present: 0, section_override_id: null, planned_start_override_minute: null });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first<number>("placement_revision")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(fixture.userId, request.operation_id).first<number>("count")).toBe(0);
    await env.APP_DB.prepare("DROP TRIGGER fail_bulk_section_occurrence").run();
    const result = await bulkMoveEntriesToSectionOccurrence(env.APP_DB, fixture.userId, request, now);
    expect(result.placement_revision).toBe(1);
    expect(await bulkMoveEntriesToSectionOccurrence(env.APP_DB, fixture.userId, request, now)).toEqual(result);
  });
});
