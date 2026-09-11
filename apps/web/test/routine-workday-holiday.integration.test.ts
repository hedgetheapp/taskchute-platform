import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { UpsertEffectiveDayOverrideRequest } from "../src/shared/contracts";
import { uuidv7 } from "../src/shared/uuidv7";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { ensureCurrentDayRoutineEntries } from "../worker/application/routine";
import { createRoutine, setRoutineEnabled, updateRoutine } from "../worker/application/routine-board";
import {
  upsertEffectiveDayOverride,
  type EffectiveDayOverrideMutationHooks,
} from "../worker/application/effective-day-calendar";

const now = "2026-09-01T12:00:00.000Z";

async function seedFixture(enable = true) {
  const userId = uuidv7();
  const sectionId = uuidv7();
  const versionId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)")
      .bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'D089', 0, ?)")
      .bind(sectionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(versionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'D089', 0, 1440, 0)`).bind(userId, versionId, sectionId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, versionId),
  ]);
  const day = await loadCurrentTaskChuteDay(env.APP_DB, userId, now);
  const created = await createRoutine(env.APP_DB, userId, {
    operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(), title: "D089 calendar Routine", expected_board_revision: 0,
  }, now);
  const updateRequest = {
    operation_id: uuidv7(), routine_definition_id: created.routine_definition_id, expected_settings_revision: 0,
    title: "D089 calendar Routine", project_id: null, schedule: { kind: "workday" as const },
    default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
    start_logical_date: day.taskchute_day.logical_date, end_logical_date: null,
  };
  await updateRoutine(env.APP_DB, userId, updateRequest, now);
  if (enable) {
    await setRoutineEnabled(env.APP_DB, userId, {
      operation_id: uuidv7(), routine_definition_id: created.routine_definition_id, enabled: true, expected_settings_revision: 1,
    }, now);
  }
  return { userId, day, routineId: created.routine_definition_id };
}

function overrideRequest(logicalDate: string, kind: "workday" | "holiday", expectedRevision: number | null): UpsertEffectiveDayOverrideRequest {
  return { operation_id: uuidv7(), logical_date: logicalDate, override_kind: kind, reason: "D089 test", expected_revision: expectedRevision };
}

function gate(): { entered: Promise<void>; release: () => void; hooks: EffectiveDayOverrideMutationHooks } {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  return { entered, release, hooks: { beforeMutation: async () => { enter(); await released; } } };
}

describe.sequential("D-089 workday / holiday Routine recurrence", () => {
  it("materializes once, suppresses on a holiday override, and restores on reset", async () => {
    const fixture = await seedFixture();
    const count = await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, fixture.routineId).first<number>("count");
    expect(count).toBe(1);
    const occurrenceId = await env.APP_DB.prepare(`SELECT id FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, fixture.routineId).first<string>("id");

    const changed = await upsertEffectiveDayOverride(env.APP_DB, fixture.userId,
      overrideRequest(fixture.day.taskchute_day.logical_date, "holiday", null), now);
    expect(changed.classification.effective).toBe("holiday");
    expect(await env.APP_DB.prepare(`SELECT reason FROM routine_occurrence_suppressions
      WHERE app_user_id = ? AND routine_occurrence_id = ?`).bind(fixture.userId, occurrenceId).first<string>("reason"))
      .toBe("schedule");

    await upsertEffectiveDayOverride(env.APP_DB, fixture.userId,
      overrideRequest(fixture.day.taskchute_day.logical_date, "workday", 0), now);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrence_suppressions
      WHERE app_user_id = ? AND routine_occurrence_id = ?`).bind(fixture.userId, occurrenceId).first<number>("count"))
      .toBe(0);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, fixture.routineId).first<number>("count"))
      .toBe(1);
  });

  it("rejects an old materialization plan when an override wins first", async () => {
    const fixture = await seedFixture(false);
    await env.APP_DB.prepare(`UPDATE routine_pause_intervals SET resumed_logical_date = ?
      WHERE app_user_id = ? AND routine_definition_id = ? AND resumed_logical_date IS NULL`)
      .bind(fixture.day.taskchute_day.logical_date, fixture.userId, fixture.routineId).run();
    const held = gate();
    const ensure = ensureCurrentDayRoutineEntries(env.APP_DB, fixture.userId, {
      id: fixture.day.taskchute_day.id, logical_date: fixture.day.taskchute_day.logical_date,
      establishment_boundary_minutes: fixture.day.taskchute_day.establishment_boundary_minutes,
      placement_revision: 0,
    }, now, true, held.hooks);
    await held.entered;
    await upsertEffectiveDayOverride(env.APP_DB, fixture.userId,
      overrideRequest(fixture.day.taskchute_day.logical_date, "holiday", null), now);
    held.release();
    await ensure;
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, fixture.routineId).first<number>("count"))
      .toBe(0);
  });

  it("does not commit UpdateRoutine from a stale calendar snapshot", async () => {
    const fixture = await seedFixture();
    const request = {
      operation_id: uuidv7(), routine_definition_id: fixture.routineId, expected_settings_revision: 2,
      title: "D089 calendar Routine", project_id: null, schedule: { kind: "holiday" as const },
      default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
      start_logical_date: fixture.day.taskchute_day.logical_date, end_logical_date: null,
    };
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    const update = updateRoutine(env.APP_DB, fixture.userId, request, now, {
      beforeMutation: async () => { entered(); await released; },
    });
    await enteredPromise;
    await upsertEffectiveDayOverride(env.APP_DB, fixture.userId,
      overrideRequest(fixture.day.taskchute_day.logical_date, "holiday", null), now);
    release();
    await expect(update).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare(`SELECT schedule_kind FROM routine_schedules
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, fixture.routineId).first<string>("schedule_kind"))
      .toBe("workday");
  });

  it("keeps a moved monthly-last-workday occurrence protected", async () => {
    const fixture = await seedFixture();
    await updateRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: fixture.routineId, expected_settings_revision: 2,
      title: "D089 calendar Routine", project_id: null, schedule: { kind: "monthly_last_workday" },
      default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
      start_logical_date: fixture.day.taskchute_day.logical_date, end_logical_date: null,
    }, now);
    const movedDayId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-30', '2026-09-29T00:00:00.000Z', '2026-09-30T00:00:00.000Z',
        'UTC', 0, 'compatible', 0, ?)`).bind(movedDayId, fixture.userId, now).run();
    const occurrenceId = await env.APP_DB.prepare(`SELECT id FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, fixture.routineId).first<string>("id");
    await env.APP_DB.prepare(`UPDATE entries SET taskchute_day_id = ?
      WHERE app_user_id = ? AND routine_occurrence_id = ?`).bind(movedDayId, fixture.userId, occurrenceId).run();
    expect(await env.APP_DB.prepare(`SELECT reason FROM routine_occurrence_suppressions
      WHERE app_user_id = ? AND routine_occurrence_id = ?`).bind(fixture.userId, occurrenceId).first<string>("reason"))
      .toBe("schedule");

    await upsertEffectiveDayOverride(env.APP_DB, fixture.userId,
      overrideRequest("2026-09-30", "holiday", null), now);
    expect(await env.APP_DB.prepare(`SELECT taskchute_day_id FROM entries
      WHERE app_user_id = ? AND routine_occurrence_id = ?`).bind(fixture.userId, occurrenceId).first<string>("taskchute_day_id"))
      .toBe(movedDayId);
    expect(await env.APP_DB.prepare(`SELECT reason FROM routine_occurrence_suppressions
      WHERE app_user_id = ? AND routine_occurrence_id = ?`).bind(fixture.userId, occurrenceId).first<string>("reason"))
      .toBe("schedule");
  });

  it("rejects a stale month-set override plan when another month override wins", async () => {
    const fixture = await seedFixture(false);
    await updateRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: fixture.routineId, expected_settings_revision: 1,
      title: "D089 calendar Routine", project_id: null, schedule: { kind: "monthly_last_workday" },
      default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
      start_logical_date: fixture.day.taskchute_day.logical_date, end_logical_date: null,
    }, now);
    const first = overrideRequest("2026-09-30", "holiday", null);
    const held = gate();
    const stale = upsertEffectiveDayOverride(env.APP_DB, fixture.userId, first, now, held.hooks);
    await held.entered;
    await upsertEffectiveDayOverride(env.APP_DB, fixture.userId,
      overrideRequest("2026-09-29", "holiday", null), now);
    held.release();
    await expect(stale).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM effective_day_overrides
      WHERE app_user_id = ? AND logical_date LIKE '2026-09-%'`).bind(fixture.userId).first<number>("count"))
      .toBe(1);
    expect(await env.APP_DB.prepare(`SELECT logical_date FROM effective_day_overrides
      WHERE app_user_id = ?`).bind(fixture.userId).first<string>("logical_date"))
      .toBe("2026-09-29");
  });
});
