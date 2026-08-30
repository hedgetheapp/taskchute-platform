import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { moveEntry, setEntryEstimate } from "../worker/application/entry-planning";
import { startEntry } from "../worker/application/entry-lifecycle";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { setEntryPlannedStart } from "../worker/application/planned-start";
import { reorderEntries } from "../worker/application/reorder-entries";
import { convertEntryToRoutine, endRoutine, ensureCurrentDayRoutineEntries } from "../worker/application/routine";
import { updateSectionConfiguration } from "../worker/application/section-configuration";

const currentInstant = "2026-08-29T12:00:00.000Z";

async function seedR1User() {
  const userId = uuidv7();
  const sections = [uuidv7(), uuidv7()];
  const versionId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, currentInstant),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 300, ?)")
      .bind(userId, currentInstant),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Morning', 0, ?)")
      .bind(sections[0], userId, currentInstant),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Day', 1, ?)")
      .bind(sections[1], userId, currentInstant),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 300, ?)")
      .bind(versionId, userId, currentInstant),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Morning', 300, 540, 0)`).bind(userId, versionId, sections[0]),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Day', 540, 1740, 1)`).bind(userId, versionId, sections[1]),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, versionId),
  ]);
  const day = await loadCurrentTaskChuteDay(env.APP_DB, userId, currentInstant);
  return { userId, sections, versionId, day };
}

async function insertPlannedEntry(
  userId: string,
  dayId: string,
  sectionId: string | null,
  position: number,
  estimate: number | null,
  plannedStart: number | null,
  title: string,
) {
  const taskId = uuidv7();
  const entryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(taskId, userId, title, currentInstant),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, routine_occurrence_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, NULL, ?)`)
      .bind(entryId, userId, taskId, dayId, sectionId, position, estimate, plannedStart, currentInstant),
  ]);
  return { taskId, entryId };
}

function conversionRequest(entryId: string, dayId: string, endLogicalDate: string | null = null) {
  return {
    operation_id: uuidv7(), routine_definition_id: uuidv7(), routine_occurrence_id: uuidv7(),
    entry_id: entryId, taskchute_day_id: dayId, end_logical_date: endLogicalDate,
  };
}

async function insertEstablishedDay(
  userId: string,
  logicalDate: string,
  revision: number,
  versionId: string,
  sectionId: string,
) {
  const dayId = uuidv7();
  const start = `${logicalDate}T05:00:00.000Z`;
  const next = new Date(`${logicalDate}T05:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString();
  await env.APP_DB.batch([
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, ?, ?, ?, 'UTC', 300, 'compatible', ?, ?)`)
      .bind(dayId, userId, logicalDate, start, end, revision, currentInstant),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
       logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Morning', 300, 1740, ?, ?, 0)`)
      .bind(userId, dayId, sectionId, versionId, start, end),
  ]);
  return dayId;
}

describe.sequential("Minimal Routine R1", () => {
  it("converts an existing Entry without changing identity or planning values and replays exactly", async () => {
    const fixture = await seedR1User();
    const original = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 1, 900, 600, "Daily focus");
    const request = conversionRequest(original.entryId, fixture.day.taskchute_day.id, "2026-09-02");
    const result = await convertEntryToRoutine(env.APP_DB, fixture.userId, request, currentInstant);
    expect(result).toMatchObject({ entry_id: original.entryId, task_id: original.taskId,
      taskchute_day_id: fixture.day.taskchute_day.id, end_logical_date: "2026-09-02" });
    expect(await convertEntryToRoutine(env.APP_DB, fixture.userId, request, currentInstant)).toEqual(result);
    expect(await env.APP_DB.prepare(`SELECT e.id, e.task_id, e.section_id, e.estimate_seconds,
      e.planned_start_minute, e.routine_occurrence_id, r.default_section_id,
      r.default_estimate_seconds, r.default_planned_start_minute, r.start_logical_date, r.end_logical_date
      FROM entries e JOIN routine_occurrences o ON o.app_user_id = e.app_user_id AND o.id = e.routine_occurrence_id
      JOIN routine_definitions r ON r.app_user_id = o.app_user_id AND r.id = o.routine_definition_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(fixture.userId, original.entryId).first()).toMatchObject({
      id: original.entryId, task_id: original.taskId, section_id: fixture.sections[1], estimate_seconds: 900,
      planned_start_minute: 600, routine_occurrence_id: request.routine_occurrence_id,
      default_section_id: fixture.sections[1], default_estimate_seconds: 900,
      default_planned_start_minute: 600, start_logical_date: "2026-08-29", end_logical_date: "2026-09-02",
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.day.taskchute_day.id).first<number>("placement_revision")).toBe(0);
    await expect(convertEntryToRoutine(env.APP_DB, fixture.userId,
      { ...request, end_logical_date: null }, currentInstant)).rejects.toMatchObject({ code: "operation_id_misuse" });
    const projected = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, currentInstant);
    expect(projected.sections.flatMap((section) => section.entries)[0]?.routine).toMatchObject({
      routine_definition_id: request.routine_definition_id, routine_occurrence_id: request.routine_occurrence_id,
      end_logical_date: "2026-09-02", can_end: true,
    });
  });

  it("snapshots mutation-time estimate and placement defaults during conversion", async () => {
    const fixture = await seedR1User();
    const estimated = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 1, 300, null, "Estimate race");
    const estimateRequest = conversionRequest(estimated.entryId, fixture.day.taskchute_day.id);
    const updateEstimateRequest = {
      operation_id: uuidv7(), entry_id: estimated.entryId, estimate_seconds: 1200,
    };
    const estimateResult = await convertEntryToRoutine(env.APP_DB, fixture.userId, estimateRequest, currentInstant, {
      beforeMutation: async () => {
        await setEntryEstimate(env.APP_DB, fixture.userId, updateEstimateRequest);
      },
    });
    expect(await convertEntryToRoutine(env.APP_DB, fixture.userId, estimateRequest, currentInstant)).toEqual(estimateResult);
    expect(await setEntryEstimate(env.APP_DB, fixture.userId, updateEstimateRequest)).toEqual({
      entry_id: estimated.entryId, estimate_seconds: 1200,
    });
    expect(await env.APP_DB.prepare(`SELECT e.estimate_seconds, r.default_estimate_seconds
      FROM entries e JOIN routine_occurrences o ON o.app_user_id = e.app_user_id AND o.id = e.routine_occurrence_id
      JOIN routine_definitions r ON r.app_user_id = o.app_user_id AND r.id = o.routine_definition_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(fixture.userId, estimated.entryId).first())
      .toEqual({ estimate_seconds: 1200, default_estimate_seconds: 1200 });

    const moved = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 2, null, 600, "Placement race");
    const moveRequest = conversionRequest(moved.entryId, fixture.day.taskchute_day.id);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, moveRequest, currentInstant, {
      beforeMutation: async () => {
        await moveEntry(env.APP_DB, fixture.userId, {
          operation_id: uuidv7(), entry_id: moved.entryId, taskchute_day_id: fixture.day.taskchute_day.id,
          section_id: fixture.sections[0]!, expected_placement_revision: 0,
        });
      },
    });
    expect(await env.APP_DB.prepare(`SELECT e.section_id, e.planned_start_minute,
      r.default_section_id, r.default_planned_start_minute
      FROM entries e JOIN routine_occurrences o ON o.app_user_id = e.app_user_id AND o.id = e.routine_occurrence_id
      JOIN routine_definitions r ON r.app_user_id = o.app_user_id AND r.id = o.routine_definition_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(fixture.userId, moved.entryId).first()).toEqual({
      section_id: fixture.sections[0], planned_start_minute: null,
      default_section_id: fixture.sections[0], default_planned_start_minute: null,
    });

    const unsectioned = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      null, 1, 600, null, "Unsectioned routine");
    const unsectionedRequest = conversionRequest(unsectioned.entryId, fixture.day.taskchute_day.id);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, unsectionedRequest, currentInstant);
    expect(await env.APP_DB.prepare(`SELECT default_section_id FROM routine_definitions
      WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, unsectionedRequest.routine_definition_id)
      .first<string | null>("default_section_id")).toBeNull();
  });

  it("rejects Routine-derived planning mutations at mutation-time while allowing Reorder and Start", async () => {
    const fixture = await seedR1User();
    const routineEntry = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 1, 900, 600, "Read-only routine");
    const peerEntry = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 2, null, 600, "Reorder peer");
    const conversion = conversionRequest(routineEntry.entryId, fixture.day.taskchute_day.id);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, conversion, currentInstant);

    const estimateOperationId = uuidv7();
    await expect(setEntryEstimate(env.APP_DB, fixture.userId, {
      operation_id: estimateOperationId, entry_id: routineEntry.entryId, estimate_seconds: 1200,
    })).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare(`SELECT e.estimate_seconds, r.default_estimate_seconds
      FROM entries e JOIN routine_occurrences o ON o.app_user_id = e.app_user_id AND o.id = e.routine_occurrence_id
      JOIN routine_definitions r ON r.app_user_id = o.app_user_id AND r.id = o.routine_definition_id
      WHERE e.app_user_id = ? AND e.id = ?`).bind(fixture.userId, routineEntry.entryId).first()).toEqual({
      estimate_seconds: 900, default_estimate_seconds: 900,
    });

    const moveOperationId = uuidv7();
    await expect(moveEntry(env.APP_DB, fixture.userId, {
      operation_id: moveOperationId, entry_id: routineEntry.entryId,
      taskchute_day_id: fixture.day.taskchute_day.id, section_id: fixture.sections[0]!,
      expected_placement_revision: 0,
    })).rejects.toMatchObject({ code: "resource_conflict" });
    const plannedStartOperationId = uuidv7();
    await expect(setEntryPlannedStart(env.APP_DB, fixture.userId, {
      operation_id: plannedStartOperationId, entry_id: routineEntry.entryId,
      taskchute_day_id: fixture.day.taskchute_day.id, planned_start_minute: 480,
      expected_placement_revision: 0,
    })).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare(`SELECT section_id, planned_start_minute, position FROM entries
      WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, routineEntry.entryId).first()).toEqual({
      section_id: fixture.sections[1], planned_start_minute: 600, position: 1,
    });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.day.taskchute_day.id).first<number>("placement_revision")).toBe(0);
    expect((await env.APP_DB.prepare(`SELECT operation_id, outcome_kind FROM operations
      WHERE app_user_id = ? AND operation_id IN (?, ?, ?) ORDER BY operation_id`)
      .bind(fixture.userId, estimateOperationId, moveOperationId, plannedStartOperationId)
      .all<{ operation_id: string; outcome_kind: string }>()).results.map((row) => row.outcome_kind))
      .toEqual(["domain_rejection", "domain_rejection", "domain_rejection"]);

    const reordered = await reorderEntries(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), taskchute_day_id: fixture.day.taskchute_day.id,
      section_id: fixture.sections[1]!, entry_ids: [peerEntry.entryId, routineEntry.entryId],
      expected_placement_revision: 0,
    });
    expect(reordered.placement_revision).toBe(1);
    const started = await startEntry(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: routineEntry.entryId, execution_id: uuidv7(),
    }, currentInstant);
    expect(started).toMatchObject({ entry_id: routineEntry.entryId, lifecycle_state: "running" });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.day.taskchute_day.id).first<number>("placement_revision")).toBe(1);
  });

  it("rolls back an injected conversion failure and retries the exact operation once", async () => {
    const fixture = await seedR1User();
    const original = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 1, 900, 600, "Conversion rollback");
    const request = conversionRequest(original.entryId, fixture.day.taskchute_day.id);
    await env.APP_DB.prepare(`CREATE TRIGGER fail_routine_conversion BEFORE INSERT ON routine_occurrences
      WHEN NEW.id = '${request.routine_occurrence_id}'
      BEGIN SELECT RAISE(ABORT, 'injected conversion failure'); END`).run();
    await expect(convertEntryToRoutine(env.APP_DB, fixture.userId, request, currentInstant))
      .rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_definitions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, request.routine_definition_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, request.routine_occurrence_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT section_id, position, estimate_seconds, planned_start_minute,
      routine_occurrence_id FROM entries WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, original.entryId).first()).toEqual({
      section_id: fixture.sections[1], position: 1, estimate_seconds: 900,
      planned_start_minute: 600, routine_occurrence_id: null,
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(fixture.userId, request.operation_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_command_guards WHERE app_user_id = ? AND operation_id = ?")
      .bind(fixture.userId, request.operation_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM transaction_assertions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, `routine-convert:${request.operation_id}`).first<number>("count")).toBe(0);

    await env.APP_DB.prepare("DROP TRIGGER fail_routine_conversion").run();
    const retried = await convertEntryToRoutine(env.APP_DB, fixture.userId, request, currentInstant);
    expect(await convertEntryToRoutine(env.APP_DB, fixture.userId, request, currentInstant)).toEqual(retried);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_definitions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, request.routine_definition_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, request.routine_occurrence_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND id = ? AND routine_occurrence_id = ?")
      .bind(fixture.userId, original.entryId, request.routine_occurrence_id).first<number>("count")).toBe(1);
  });

  it("does not materialize a stale plan after the Routine ends", async () => {
    const fixture = await seedR1User();
    const original = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[0]!, 1, null, null, "Ending race");
    const request = conversionRequest(original.entryId, fixture.day.taskchute_day.id);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, request, currentInstant);
    const nextDayId = await insertEstablishedDay(fixture.userId, "2026-08-30", 9,
      fixture.versionId, fixture.sections[0]!);
    let ended = false;
    await ensureCurrentDayRoutineEntries(env.APP_DB, fixture.userId, {
      id: nextDayId, logical_date: "2026-08-30", establishment_boundary_minutes: 300, placement_revision: 9,
    }, "2026-08-30T12:00:00.000Z", true, {
      beforeMutation: async () => {
        ended = true;
        await endRoutine(env.APP_DB, fixture.userId, {
          operation_id: uuidv7(), routine_definition_id: request.routine_definition_id,
          taskchute_day_id: fixture.day.taskchute_day.id,
        }, currentInstant);
      },
    });
    expect(ended).toBe(true);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ? AND origin_taskchute_day_id = ?`)
      .bind(fixture.userId, request.routine_definition_id, nextDayId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? AND routine_occurrence_id IS NOT NULL`)
      .bind(fixture.userId, nextDayId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(nextDayId).first<number>("placement_revision")).toBe(9);
    await ensureCurrentDayRoutineEntries(env.APP_DB, fixture.userId, {
      id: nextDayId, logical_date: "2026-08-30", establishment_boundary_minutes: 300, placement_revision: 9,
    }, "2026-08-30T12:01:00.000Z");
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(nextDayId).first<number>("placement_revision")).toBe(9);
  });

  it("stable-appends same-minute Routine Entries by materialization order", async () => {
    const fixture = await seedR1User();
    const first = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[0]!, 1, null, 600, "Same minute first");
    const second = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[0]!, 2, null, 600, "Same minute second");
    const firstRequest = conversionRequest(first.entryId, fixture.day.taskchute_day.id);
    const secondRequest = conversionRequest(second.entryId, fixture.day.taskchute_day.id);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, firstRequest, currentInstant);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, secondRequest, currentInstant);
    const versionB = uuidv7();
    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: versionB,
      expected_configuration_version_id: fixture.versionId,
      items: [{ section_id: fixture.sections[0]!, title: "Morning", logical_start_minute: 300, logical_end_minute: 1740 }],
    });
    const nextDayId = await insertEstablishedDay(fixture.userId, "2026-08-30", 4,
      versionB, fixture.sections[0]!);
    const next = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-30T12:00:00.000Z");
    expect(next.placement_revision).toBe(5);
    expect(next.sections[0]?.entries.map((entry) => entry.routine?.routine_definition_id)).toEqual([
      firstRequest.routine_definition_id,
      secondRequest.routine_definition_id,
    ]);
    expect(next.sections[0]?.entries.map((entry) => entry.position)).toEqual([1, 2]);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND origin_taskchute_day_id = ?`).bind(fixture.userId, nextDayId)
      .first<number>("count")).toBe(2);
  });

  it("materializes daily defaults once, increments revision once, honors inclusive end, and ends without history loss", async () => {
    const fixture = await seedR1User();
    const timed = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 1, 1200, 600, "Timed routine");
    const missingSection = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 2, 300, null, "Fallback routine");
    const continuing = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[1]!, 3, 600, null, "Continuing routine");
    const timedRequest = conversionRequest(timed.entryId, fixture.day.taskchute_day.id);
    const fallbackRequest = conversionRequest(missingSection.entryId, fixture.day.taskchute_day.id, "2026-08-30");
    const continuingRequest = conversionRequest(continuing.entryId, fixture.day.taskchute_day.id);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, timedRequest, currentInstant);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, fallbackRequest, currentInstant);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, continuingRequest, currentInstant);

    const versionB = uuidv7();
    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: versionB,
      expected_configuration_version_id: fixture.versionId,
      items: [{ section_id: fixture.sections[0]!, title: "Morning", logical_start_minute: 300, logical_end_minute: 1740 }],
    });
    const nextDayId = await insertEstablishedDay(fixture.userId, "2026-08-30", 5, versionB, fixture.sections[0]!);
    const manualTimed = await insertPlannedEntry(fixture.userId, nextDayId, fixture.sections[0]!, 1, null, 600, "Manual timed");
    const manualUnsectioned = await insertPlannedEntry(fixture.userId, nextDayId, null, 1, null, null, "Manual no section");
    const next = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-30T12:00:00.000Z");
    expect(next.placement_revision).toBe(6);
    expect(next.sections[0]?.entries.map((entry) => entry.id)).toEqual([
      manualTimed.entryId,
      expect.any(String),
    ]);
    const generatedTimed = next.sections[0]?.entries.find((entry) => entry.routine?.routine_definition_id === timedRequest.routine_definition_id);
    expect(generatedTimed).toMatchObject({ task: { id: timed.taskId }, estimate_seconds: 1200,
      planned_start_minute: 600, section_id: fixture.sections[0], position: 2 });
    const generatedFallback = next.unsectioned_entries.find((entry) =>
      entry.routine?.routine_definition_id === fallbackRequest.routine_definition_id);
    expect(generatedFallback).toMatchObject({ task: { id: missingSection.taskId }, estimate_seconds: 300,
      planned_start_minute: null, section_id: null, position: 2 });
    expect(next.unsectioned_entries[0]?.id).toBe(manualUnsectioned.entryId);
    expect(next.unsectioned_entries.find((entry) => entry.routine?.routine_definition_id === continuingRequest.routine_definition_id))
      .toMatchObject({ task: { id: continuing.taskId }, estimate_seconds: 600,
        planned_start_minute: null, section_id: null, position: 3 });
    const repeated = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-30T12:01:00.000Z");
    expect(repeated.placement_revision).toBe(6);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND origin_taskchute_day_id = ?`).bind(fixture.userId, nextDayId).first<number>("count")).toBe(3);

    const endRequest = { operation_id: uuidv7(), routine_definition_id: timedRequest.routine_definition_id,
      taskchute_day_id: nextDayId };
    const ended = await endRoutine(env.APP_DB, fixture.userId, endRequest, "2026-08-30T12:02:00.000Z");
    expect(await endRoutine(env.APP_DB, fixture.userId, endRequest, "2026-08-30T12:02:00.000Z")).toEqual(ended);
    await expect(endRoutine(env.APP_DB, fixture.userId, {
      ...endRequest, routine_definition_id: continuingRequest.routine_definition_id,
    }, "2026-08-30T12:02:00.000Z")).rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare(`SELECT id, end_logical_date FROM routine_definitions
      WHERE app_user_id = ? AND id IN (?, ?) ORDER BY id`).bind(fixture.userId,
      timedRequest.routine_definition_id, continuingRequest.routine_definition_id).all()).toMatchObject({
      results: expect.arrayContaining([
        { id: timedRequest.routine_definition_id, end_logical_date: "2026-08-30" },
        { id: continuingRequest.routine_definition_id, end_logical_date: null },
      ]),
    });
    await expect(endRoutine(env.APP_DB, fixture.userId,
      { ...endRequest, operation_id: uuidv7() }, "2026-08-30T12:02:00.000Z"))
      .rejects.toMatchObject({ code: "resource_conflict" });

    const dayAfterId = await insertEstablishedDay(fixture.userId, "2026-08-31", 0, versionB, fixture.sections[0]!);
    const dayAfter = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-31T12:00:00.000Z");
    expect(dayAfter.taskchute_day.id).toBe(dayAfterId);
    expect(dayAfter.sections.flatMap((section) => section.entries)).toHaveLength(0);
    expect(dayAfter.unsectioned_entries).toHaveLength(1);
    expect(dayAfter.unsectioned_entries[0]).toMatchObject({ task: { id: continuing.taskId },
      estimate_seconds: 600, planned_start_minute: null, section_id: null });
    expect(dayAfter.placement_revision).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(7);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND routine_occurrence_id IS NOT NULL")
      .bind(fixture.userId).first<number>("count")).toBe(7);
  });

  it("converges concurrent loads and rolls back an injected materialization failure", async () => {
    const fixture = await seedR1User();
    const original = await insertPlannedEntry(fixture.userId, fixture.day.taskchute_day.id,
      fixture.sections[0]!, 1, null, null, "Concurrent routine");
    const request = conversionRequest(original.entryId, fixture.day.taskchute_day.id);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, request, currentInstant);
    const versionB = uuidv7();
    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: versionB,
      expected_configuration_version_id: fixture.versionId,
      items: [{ section_id: fixture.sections[0]!, title: "Morning", logical_start_minute: 300, logical_end_minute: 1740 }],
    });
    const nextDayId = await insertEstablishedDay(fixture.userId, "2026-08-30", 3, versionB, fixture.sections[0]!);
    await env.APP_DB.prepare(`CREATE TRIGGER fail_routine_entry BEFORE INSERT ON entries
      WHEN NEW.routine_occurrence_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'injected routine failure'); END`).run();
    await expect(loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-30T12:00:00.000Z")).rejects.toThrow();
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE origin_taskchute_day_id = ?")
      .bind(nextDayId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(nextDayId).first<number>("placement_revision")).toBe(3);
    await env.APP_DB.prepare("DROP TRIGGER fail_routine_entry").run();
    const loaded = await Promise.all([
      loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-30T12:00:00.000Z"),
      loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-30T12:00:00.000Z"),
    ]);
    expect(loaded[0].placement_revision).toBe(4);
    expect(loaded[1].placement_revision).toBe(4);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE origin_taskchute_day_id = ?")
      .bind(nextDayId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE taskchute_day_id = ? AND routine_occurrence_id IS NOT NULL")
      .bind(nextDayId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).toMatchObject({ results: [] });
  });
});
