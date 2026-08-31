import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { convertEntryToRoutine } from "../worker/application/routine";
import { setRoutineEstimate, setRoutineSectionPlan } from "../worker/application/routine-planning";

const now = "2026-08-29T12:00:00.000Z";

async function seedRoutine() {
  const userId = uuidv7();
  const sections = [uuidv7(), uuidv7()];
  const versionId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 300, ?)")
      .bind(userId, now),
    ...sections.map((id, index) => env.APP_DB.prepare(
      "INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, userId, index === 0 ? "Morning" : "Day", index, now)),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 300, ?)")
      .bind(versionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Morning', 300, 540, 0)`).bind(userId, versionId, sections[0]),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Day', 540, 1740, 1)`).bind(userId, versionId, sections[1]),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, versionId),
  ]);
  const day = await loadCurrentTaskChuteDay(env.APP_DB, userId, now);
  const taskId = uuidv7();
  const entryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'R2A fixture', ?)")
      .bind(taskId, userId, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'planned', 900, 300, ?)`)
      .bind(entryId, userId, taskId, day.taskchute_day.id, sections[0], now),
  ]);
  const conversion = {
    operation_id: uuidv7(), routine_definition_id: uuidv7(), routine_occurrence_id: uuidv7(),
    entry_id: entryId, taskchute_day_id: day.taskchute_day.id, end_logical_date: null,
  };
  await convertEntryToRoutine(env.APP_DB, userId, conversion, now);
  return { userId, sections, versionId, dayId: day.taskchute_day.id, taskId, entryId,
    definitionId: conversion.routine_definition_id, occurrenceId: conversion.routine_occurrence_id };
}

async function insertDay(userId: string, versionId: string, sections: string[], logicalDate: string) {
  const dayId = uuidv7();
  const start = `${logicalDate}T05:00:00.000Z`;
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  await env.APP_DB.batch([
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, ?, ?, ?, 'UTC', 300, 'compatible', 0, ?)`)
      .bind(dayId, userId, logicalDate, start, next.toISOString(), now),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
       logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Morning', 300, 540, ?, ?, 0)`)
      .bind(userId, dayId, sections[0], versionId, start, `${logicalDate}T09:00:00.000Z`),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
       logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Day', 540, 1740, ?, ?, 1)`)
      .bind(userId, dayId, sections[1], versionId, `${logicalDate}T09:00:00.000Z`, next.toISOString()),
  ]);
  return dayId;
}

async function insertOccurrence(input: {
  userId: string; definitionId: string; taskId: string; dayId: string; sectionId: string;
  estimate: number | null; plannedStart: number; lifecycle?: "planned" | "completed";
  estimateOverride?: number | null; sectionOverride?: { sectionId: string | null; plannedStart: number | null };
}) {
  const occurrenceId = uuidv7();
  const entryId = uuidv7();
  const estimatePresent = "estimateOverride" in input ? 1 : 0;
  const sectionPresent = input.sectionOverride ? 1 : 0;
  await env.APP_DB.batch([
    env.APP_DB.prepare(`INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id,
       section_plan_override_present, section_override_id, planned_start_override_minute,
       estimate_override_present, estimate_override_seconds, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(occurrenceId, input.userId, input.definitionId, input.dayId,
        sectionPresent, input.sectionOverride?.sectionId ?? null, input.sectionOverride?.plannedStart ?? null,
        estimatePresent, input.estimateOverride ?? null, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, routine_occurrence_id, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`)
      .bind(entryId, input.userId, input.taskId, input.dayId, input.sectionId,
        input.lifecycle ?? "planned", input.estimate, input.plannedStart, occurrenceId, now),
  ]);
  return { occurrenceId, entryId };
}

describe.sequential("Routine R2A current-Day overrides", () => {
  it("persists explicit occurrence values and NULLs, replays, resets from current defaults, and projects override state", async () => {
    const fixture = await seedRoutine();
    const estimateOperation = uuidv7();
    const estimateRequest = { operation_id: estimateOperation, entry_id: fixture.entryId,
      taskchute_day_id: fixture.dayId, action: "occurrence" as const, estimate_seconds: null };
    expect(await setRoutineEstimate(env.APP_DB, fixture.userId, estimateRequest, now)).toMatchObject({
      estimate_seconds: null, estimate_override_present: true, defaults_revision: 0,
    });
    expect(await setRoutineEstimate(env.APP_DB, fixture.userId, estimateRequest, now)).toMatchObject({ estimate_seconds: null });
    await expect(setRoutineEstimate(env.APP_DB, fixture.userId,
      { ...estimateRequest, estimate_seconds: 1200 }, now)).rejects.toMatchObject({ code: "operation_id_misuse" });

    await setRoutineEstimate(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId, action: "reset",
    }, now);
    expect(await env.APP_DB.prepare(`SELECT e.estimate_seconds, ro.estimate_override_present,
      ro.estimate_override_seconds FROM entries e JOIN routine_occurrences ro ON ro.id = e.routine_occurrence_id
      WHERE e.id = ?`).bind(fixture.entryId).first()).toEqual({
      estimate_seconds: 900, estimate_override_present: 0, estimate_override_seconds: null,
    });

    const sectionResult = await setRoutineSectionPlan(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "occurrence", section_id: fixture.sections[1]!, planned_start_minute: 600,
      expected_placement_revision: 0,
    }, now);
    expect(sectionResult).toMatchObject({ section_id: fixture.sections[1], planned_start_minute: 600,
      section_plan_override_present: true, placement_revision: 1 });
    await setRoutineSectionPlan(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "reset", expected_placement_revision: 1,
    }, now);
    expect(await setRoutineSectionPlan(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "occurrence", section_id: null, planned_start_minute: null, expected_placement_revision: 2,
    }, now)).toMatchObject({ section_id: null, planned_start_minute: null,
      section_plan_override_present: true, placement_revision: 3 });
    await setRoutineSectionPlan(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "reset", expected_placement_revision: 3,
    }, now);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    const projected = projection.sections.flatMap((section) => section.entries)
      .find((entry) => entry.id === fixture.entryId)!;
    expect(projected).toMatchObject({ section_id: fixture.sections[0], planned_start_minute: 300,
      estimate_seconds: 900, routine: { estimate_override_present: false,
        section_plan_override_present: false, defaults_revision: 0 } });
  });

  it("propagates definition defaults only to eligible non-overridden occurrences and protects history", async () => {
    const fixture = await seedRoutine();
    const futureDay = await insertDay(fixture.userId, fixture.versionId, fixture.sections, "2026-08-30");
    const overriddenDay = await insertDay(fixture.userId, fixture.versionId, fixture.sections, "2026-08-31");
    const historicalDay = await insertDay(fixture.userId, fixture.versionId, fixture.sections, "2026-09-01");
    const inheriting = await insertOccurrence({ userId: fixture.userId, definitionId: fixture.definitionId,
      taskId: fixture.taskId, dayId: futureDay, sectionId: fixture.sections[0]!, estimate: 900, plannedStart: 300 });
    const overridden = await insertOccurrence({ userId: fixture.userId, definitionId: fixture.definitionId,
      taskId: fixture.taskId, dayId: overriddenDay, sectionId: fixture.sections[0]!, estimate: 111, plannedStart: 300,
      estimateOverride: 111, sectionOverride: { sectionId: fixture.sections[0]!, plannedStart: 300 } });
    const historical = await insertOccurrence({ userId: fixture.userId, definitionId: fixture.definitionId,
      taskId: fixture.taskId, dayId: historicalDay, sectionId: fixture.sections[0]!, estimate: 900, plannedStart: 300,
      lifecycle: "completed" });
    const countsBefore = await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count");

    const estimateRequest = { operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "definition" as const, estimate_seconds: 1200, expected_defaults_revision: 0 };
    expect(await setRoutineEstimate(env.APP_DB, fixture.userId, estimateRequest, now)).toMatchObject({
      estimate_seconds: 1200, defaults_revision: 1, estimate_override_present: false,
    });
    expect(await setRoutineEstimate(env.APP_DB, fixture.userId, estimateRequest, now)).toMatchObject({ defaults_revision: 1 });
    await expect(setRoutineEstimate(env.APP_DB, fixture.userId, { ...estimateRequest,
      operation_id: uuidv7(), estimate_seconds: 1500 }, now)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT id, estimate_seconds FROM entries WHERE id IN (?, ?, ?, ?) ORDER BY id")
      .bind(fixture.entryId, inheriting.entryId, overridden.entryId, historical.entryId).all()).toMatchObject({
      results: expect.arrayContaining([
        { id: fixture.entryId, estimate_seconds: 1200 },
        { id: inheriting.entryId, estimate_seconds: 1200 },
        { id: overridden.entryId, estimate_seconds: 111 },
        { id: historical.entryId, estimate_seconds: 900 },
      ]),
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(countsBefore);

    const sectionRequest = { operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "definition" as const, section_id: fixture.sections[1]!, planned_start_minute: 600,
      expected_placement_revision: 0, expected_defaults_revision: 1 };
    expect(await setRoutineSectionPlan(env.APP_DB, fixture.userId, sectionRequest, now)).toMatchObject({
      section_id: fixture.sections[1], planned_start_minute: 600, defaults_revision: 2, placement_revision: 1,
    });
    expect(await env.APP_DB.prepare("SELECT id, section_id, planned_start_minute FROM entries WHERE id IN (?, ?, ?, ?) ORDER BY id")
      .bind(fixture.entryId, inheriting.entryId, overridden.entryId, historical.entryId).all()).toMatchObject({
      results: expect.arrayContaining([
        { id: fixture.entryId, section_id: fixture.sections[1], planned_start_minute: 600 },
        { id: inheriting.entryId, section_id: fixture.sections[1], planned_start_minute: 600 },
        { id: overridden.entryId, section_id: fixture.sections[0], planned_start_minute: 300 },
        { id: historical.entryId, section_id: fixture.sections[0], planned_start_minute: 300 },
      ]),
    });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(futureDay).first<number>("placement_revision")).toBe(1);
  });

  it("rolls back a definition update on injected propagation failure and retries the exact operation", async () => {
    const fixture = await seedRoutine();
    const request = { operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "definition" as const, estimate_seconds: 1800, expected_defaults_revision: 0 };
    await env.APP_DB.prepare(`CREATE TRIGGER fail_r2a_estimate BEFORE UPDATE OF estimate_seconds ON entries
      WHEN NEW.id = '${fixture.entryId}' BEGIN SELECT RAISE(ABORT, 'injected R2A failure'); END`).run();
    await expect(setRoutineEstimate(env.APP_DB, fixture.userId, request, now))
      .rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT default_estimate_seconds, defaults_revision FROM routine_definitions WHERE id = ?")
      .bind(fixture.definitionId).first()).toEqual({ default_estimate_seconds: 900, defaults_revision: 0 });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(fixture.userId, request.operation_id).first<number>("count")).toBe(0);
    await env.APP_DB.prepare("DROP TRIGGER fail_r2a_estimate").run();
    expect(await setRoutineEstimate(env.APP_DB, fixture.userId, request, now)).toMatchObject({
      estimate_seconds: 1800, defaults_revision: 1,
    });
  });

  it("rejects invalid cross-Day propagation and non-current or protected scopes without writes", async () => {
    const fixture = await seedRoutine();
    const futureDay = await insertDay(fixture.userId, fixture.versionId, fixture.sections, "2026-08-30");
    const future = await insertOccurrence({ userId: fixture.userId, definitionId: fixture.definitionId,
      taskId: fixture.taskId, dayId: futureDay, sectionId: fixture.sections[0]!, estimate: 900, plannedStart: 300 });
    await env.APP_DB.prepare(`DELETE FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
      .bind(fixture.userId, futureDay, fixture.sections[1]).run();
    const before = await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute,
      defaults_revision FROM routine_definitions WHERE id = ?`).bind(fixture.definitionId).first();
    await expect(setRoutineSectionPlan(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "definition", section_id: fixture.sections[1]!, planned_start_minute: 600,
      expected_placement_revision: 0, expected_defaults_revision: 0,
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute,
      defaults_revision FROM routine_definitions WHERE id = ?`).bind(fixture.definitionId).first()).toEqual(before);
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(future.entryId).first()).toEqual({ section_id: fixture.sections[0], planned_start_minute: 300 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id IN (?, ?) ORDER BY id")
      .bind(fixture.dayId, futureDay).all()).toMatchObject({ results: [{ placement_revision: 0 }, { placement_revision: 0 }] });

    await expect(setRoutineEstimate(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: future.entryId, taskchute_day_id: futureDay,
      action: "occurrence", estimate_seconds: 600,
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'completed' WHERE id = ?").bind(fixture.entryId).run();
    await expect(setRoutineEstimate(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.dayId,
      action: "occurrence", estimate_seconds: 600,
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT estimate_seconds FROM entries WHERE id IN (?, ?) ORDER BY id")
      .bind(fixture.entryId, future.entryId).all()).toMatchObject({
      results: [{ estimate_seconds: 900 }, { estimate_seconds: 900 }],
    });
  });
});
