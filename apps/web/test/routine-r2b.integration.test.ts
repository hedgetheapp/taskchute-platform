import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { loadCurrentTaskChuteDay, loadTaskChuteDayByLogicalDate } from "../worker/application/load-current-day";
import { completeEntry, startEntry } from "../worker/application/entry-lifecycle";
import { convertEntryToRoutine, ensureCurrentDayRoutineEntries } from "../worker/application/routine";
import {
  createRoutine,
  deleteRoutine,
  isCreateRoutineRequest,
  isUpdateRoutineRequest,
  loadRoutineBoard,
  reorderRoutines,
  setRoutineEnabled,
  updateRoutine,
} from "../worker/application/routine-board";

const now = "2026-09-01T12:00:00.000Z";

async function seedUser() {
  const userId = uuidv7();
  const sectionId = uuidv7();
  const versionId = uuidv7();
  const projectId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare(`INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at)
      VALUES (?, 'UTC', 0, ?)`).bind(userId, now),
    env.APP_DB.prepare(`INSERT INTO projects (id, app_user_id, title, created_at)
      VALUES (?, ?, 'Board project', ?)`).bind(projectId, userId, now),
    env.APP_DB.prepare(`INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
      VALUES (?, ?, 'Day', 0, ?)`).bind(sectionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_versions
      (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)`)
      .bind(versionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute,
       logical_end_minute, configuration_order) VALUES (?, ?, ?, 'Day', 0, 1440, 0)`)
      .bind(userId, versionId, sectionId),
    env.APP_DB.prepare(`INSERT INTO section_configuration_heads (app_user_id, configuration_version_id)
      VALUES (?, ?)`).bind(userId, versionId),
  ]);
  const day = await loadCurrentTaskChuteDay(env.APP_DB, userId, now);
  return { userId, sectionId, projectId, day };
}

async function createOff(userId: string, title = "Board Routine", expectedBoardRevision = 0) {
  const request = { operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
    title, expected_board_revision: expectedBoardRevision };
  const result = await createRoutine(env.APP_DB, userId, request, now);
  return { request, result };
}

describe.sequential("Routine R2B Board", () => {
  it("creates a local-style blank commit atomically as OFF without materializing an occurrence", async () => {
    const fixture = await seedUser();
    const { request, result } = await createOff(fixture.userId);
    expect(result).toMatchObject({ task_id: request.task_id, routine_definition_id: request.routine_definition_id,
      board_position: 1, board_revision: 1, settings_revision: 0 });
    expect(await createRoutine(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    await expect(createRoutine(env.APP_DB, fixture.userId, { ...request, title: "misuse" }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
    const board = await loadRoutineBoard(env.APP_DB, fixture.userId, now);
    expect(board.routines).toEqual([expect.objectContaining({ title: "Board Routine", enabled: false,
      schedule: { kind: "daily" }, project: null })]);
  });

  it("persists optional create defaults atomically and preserves legacy null defaults", async () => {
    const fixture = await seedUser();
    const request = {
      operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
      title: "Morning review", expected_board_revision: 0,
      default_section_id: fixture.sectionId, default_planned_start_minute: 570,
      default_estimate_seconds: 1500,
    };
    const result = await createRoutine(env.APP_DB, fixture.userId, request, now);
    expect(result.board_revision).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute,
      default_estimate_seconds FROM routine_definitions WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, request.routine_definition_id).first())
      .toEqual({ default_section_id: fixture.sectionId, default_planned_start_minute: 570, default_estimate_seconds: 1500 });
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, request.routine_definition_id)
      .first<number>("count")).toBe(0);
    expect(await createRoutine(env.APP_DB, fixture.userId, request, now)).toEqual(result);

    const legacy = await createOff(fixture.userId, "Legacy title", 1);
    expect(await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute,
      default_estimate_seconds FROM routine_definitions WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, legacy.request.routine_definition_id).first())
      .toEqual({ default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null });
  });

  it("creates the full Android parity payload atomically and replays without duplication", async () => {
    const fixture = await seedUser();
    const modeId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO mode_definitions (id, app_user_id, title, created_at) VALUES (?, ?, 'Focus', ?)").bind(modeId, fixture.userId, now),
      env.APP_DB.prepare("INSERT INTO mode_board_items (app_user_id, mode_id, board_position) VALUES (?, ?, 1)").bind(fixture.userId, modeId),
    ]);
    const request = {
      operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
      title: "Full parity routine", expected_board_revision: 0,
      project_id: fixture.projectId, default_mode_id: modeId,
      schedule: { kind: "weekly" as const, weekdays: [1, 3] },
      start_logical_date: "2026-09-02", end_logical_date: "2026-09-30",
      default_section_id: fixture.sectionId, default_planned_start_minute: 570,
      default_estimate_seconds: 1500,
    };
    expect(isCreateRoutineRequest(request)).toBe(true);
    const result = await createRoutine(env.APP_DB, fixture.userId, request, now);
    expect(result.board_revision).toBe(1);
    expect(await env.APP_DB.prepare("SELECT project_id FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, request.task_id).first<string>("project_id")).toBe(fixture.projectId);
    expect(await env.APP_DB.prepare(`SELECT start_logical_date, end_logical_date, default_section_id,
      default_planned_start_minute, default_estimate_seconds FROM routine_definitions WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, request.routine_definition_id).first()).toEqual({
        start_logical_date: "2026-09-02", end_logical_date: "2026-09-30", default_section_id: fixture.sectionId,
        default_planned_start_minute: 570, default_estimate_seconds: 1500,
      });
    expect(await env.APP_DB.prepare(`SELECT schedule_kind, weekdays_mask FROM routine_schedules WHERE app_user_id = ? AND routine_definition_id = ?`)
      .bind(fixture.userId, request.routine_definition_id).first()).toEqual({ schedule_kind: "weekly", weekdays_mask: 10 });
    expect(await env.APP_DB.prepare("SELECT mode_id FROM routine_definition_modes WHERE app_user_id = ? AND routine_definition_id = ?")
      .bind(fixture.userId, request.routine_definition_id).first<string>("mode_id")).toBe(modeId);
    expect(await createRoutine(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_definitions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, request.routine_definition_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("board_revision")).toBe(1);
  });
  it("rejects malformed or unavailable create defaults without partial writes", async () => {
    const fixture = await seedUser();
    const base = { operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
      title: "Invalid defaults", expected_board_revision: 0 };
    expect(isCreateRoutineRequest(base)).toBe(true);
    expect(isCreateRoutineRequest({ ...base, default_section_id: fixture.sectionId })).toBe(false);
    expect(isCreateRoutineRequest({ ...base, default_planned_start_minute: 570 })).toBe(false);
    expect(isCreateRoutineRequest({ ...base, default_section_id: fixture.sectionId,
      default_planned_start_minute: 570, default_estimate_seconds: 0 })).toBe(false);

    const unavailable = { ...base, default_section_id: uuidv7(), default_planned_start_minute: 570,
      default_estimate_seconds: 1500 };
    await expect(createRoutine(env.APP_DB, fixture.userId, unavailable, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("board_revision")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, unavailable.task_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_definitions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, unavailable.routine_definition_id).first<number>("count")).toBe(0);
  });
  it("keeps materialization order independent from board slots", async () => {
    const fixture = await seedUser();
    const first = await createOff(fixture.userId, "Board Routine");
    const detachedTaskId = uuidv7();
    const detachedRoutineId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, NULL, ?, ?)")
        .bind(detachedTaskId, fixture.userId, "Detached routine", now),
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute,
         materialization_order, defaults_revision, created_at)
        VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, NULL, NULL, NULL, 2, 0, ?)`)
        .bind(detachedRoutineId, fixture.userId, detachedTaskId, now),
    ]);
    const created = await createRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
      title: "After detached routine", expected_board_revision: first.result.board_revision,
    }, now);
    expect(await env.APP_DB.prepare("SELECT materialization_order FROM routine_definitions WHERE id = ?")
      .bind(created.routine_definition_id).first<number>("materialization_order")).toBe(3);
  });

  it("does not materialize an old eligible plan after UpdateRoutine wins the race", async () => {
    const fixture = await seedUser();
    const created = await createOff(fixture.userId, "Race one");
    await env.APP_DB.prepare(`UPDATE routine_pause_intervals SET resumed_logical_date = ?
      WHERE app_user_id = ? AND routine_definition_id = ? AND resumed_logical_date IS NULL`)
      .bind("2026-09-01", fixture.userId, created.result.routine_definition_id).run();
    const request = {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      expected_settings_revision: 0, title: "Race one updated", project_id: null,
      schedule: { kind: "monthly_day" as const, day_of_month: 31 },
      default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
      start_logical_date: "2026-09-01", end_logical_date: null,
    };
    let updateResult: Awaited<ReturnType<typeof updateRoutine>> | undefined;
    await ensureCurrentDayRoutineEntries(env.APP_DB, fixture.userId, {
      id: fixture.day.taskchute_day.id, logical_date: fixture.day.taskchute_day.logical_date,
      establishment_boundary_minutes: fixture.day.taskchute_day.establishment_boundary_minutes,
      placement_revision: 0,
    }, now, true, {
      beforeMutation: async () => {
        updateResult = await updateRoutine(env.APP_DB, fixture.userId, request, now);
      },
    });
    expect(updateResult).toEqual({ routine_definition_id: created.result.routine_definition_id, settings_revision: 1 });
    expect(await env.APP_DB.prepare(`SELECT schedule_kind FROM routine_schedules
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, created.result.routine_definition_id)
      .first<string>("schedule_kind")).toBe("monthly_day");
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, created.result.routine_definition_id)
      .first<number>("count")).toBe(0);
  });

  it("rejects an incomplete UpdateRoutine occurrence snapshot and converges on exact retry", async () => {
    const fixture = await seedUser();
    const created = await createOff(fixture.userId, "Race two");
    await env.APP_DB.prepare(`UPDATE routine_pause_intervals SET resumed_logical_date = ?
      WHERE app_user_id = ? AND routine_definition_id = ? AND resumed_logical_date IS NULL`)
      .bind("2026-09-01", fixture.userId, created.result.routine_definition_id).run();
    const request = {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      expected_settings_revision: 0, title: "Race two updated", project_id: null,
      schedule: { kind: "monthly_day" as const, day_of_month: 31 },
      default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
      start_logical_date: "2026-09-01", end_logical_date: null,
    };
    let materializedOccurrenceId: string | null | undefined;
    await expect(updateRoutine(env.APP_DB, fixture.userId, request, now, {
      beforeMutation: async () => {
        await ensureCurrentDayRoutineEntries(env.APP_DB, fixture.userId, {
          id: fixture.day.taskchute_day.id, logical_date: fixture.day.taskchute_day.logical_date,
          establishment_boundary_minutes: fixture.day.taskchute_day.establishment_boundary_minutes,
          placement_revision: 0,
        }, now);
        materializedOccurrenceId = await env.APP_DB.prepare(`SELECT id FROM routine_occurrences
          WHERE app_user_id = ? AND routine_definition_id = ? AND origin_taskchute_day_id = ?`)
          .bind(fixture.userId, created.result.routine_definition_id, fixture.day.taskchute_day.id)
          .first<string>("id");
      },
    })).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(materializedOccurrenceId).toEqual(expect.any(String));
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM operations
      WHERE app_user_id = ? AND operation_id = ? AND command_type = 'UpdateRoutine'`)
      .bind(fixture.userId, request.operation_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT schedule_kind FROM routine_schedules
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, created.result.routine_definition_id)
      .first<string>("schedule_kind")).toBe("daily");

    await expect(updateRoutine(env.APP_DB, fixture.userId, request, now)).resolves.toEqual({
      routine_definition_id: created.result.routine_definition_id, settings_revision: 1,
    });
    expect(await env.APP_DB.prepare(`SELECT schedule_kind FROM routine_schedules
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, created.result.routine_definition_id)
      .first<string>("schedule_kind")).toBe("monthly_day");
    expect(await env.APP_DB.prepare(`SELECT id FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ? AND origin_taskchute_day_id = ?`)
      .bind(fixture.userId, created.result.routine_definition_id, fixture.day.taskchute_day.id)
      .first<string>("id")).toBe(materializedOccurrenceId);
    expect(await env.APP_DB.prepare(`SELECT reason FROM routine_occurrence_suppressions
      WHERE app_user_id = ? AND routine_occurrence_id = ?`).bind(fixture.userId, materializedOccurrenceId)
      .first<string>("reason")).toBe("schedule");
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ? AND origin_taskchute_day_id = ?`)
      .bind(fixture.userId, created.result.routine_definition_id, fixture.day.taskchute_day.id)
      .first<number>("count")).toBe(1);
  });

  it("accepts only exact approved UpdateRoutine schedule shapes", () => {
    const base = {
      operation_id: uuidv7(), routine_definition_id: uuidv7(), expected_settings_revision: 0,
      title: "Exact shape", project_id: null, schedule: { kind: "daily" as const },
      default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
      start_logical_date: "2026-09-01", end_logical_date: null,
    };
    expect(isUpdateRoutineRequest(base)).toBe(true);
    expect(isUpdateRoutineRequest({ ...base, schedule: { kind: "monthly_day", day_of_month: 31 } })).toBe(true);
    for (const kind of ["workday", "holiday", "official_holiday", "monthly_last_workday"] as const) {
      expect(isUpdateRoutineRequest({ ...base, schedule: { kind } })).toBe(true);
    }
    for (const schedule of [
      { kind: "monthly_day", day_of_month: 31, interval_months: 2 },
      { kind: "monthly_last_day", interval_months: 2 },
      { kind: "weekly", weekdays: [1], interval_weeks: 2 },
      { kind: "daily", weekdays: [1] },
      { kind: "every_n_months_last_day", interval_months: 2, day_of_month: 1 },
      { kind: "weekly", weekdays: [1, 1] },
    ]) {
      expect(isUpdateRoutineRequest({ ...base, schedule })).toBe(false);
    }
  });

  it("rejects a captured planned occurrence when its placement drifts", async () => {
    const fixture = await seedUser();
    const created = await createOff(fixture.userId, "Placement drift");
    await setRoutineEnabled(env.APP_DB, fixture.userId, { operation_id: uuidv7(),
      routine_definition_id: created.result.routine_definition_id, enabled: true,
      expected_settings_revision: 0 }, now);
    const entryId = await env.APP_DB.prepare(`SELECT e.id FROM entries e JOIN routine_occurrences o
      ON o.app_user_id = e.app_user_id AND o.id = e.routine_occurrence_id
      WHERE e.app_user_id = ? AND o.routine_definition_id = ?`)
      .bind(fixture.userId, created.result.routine_definition_id).first<string>("id");
    const request = {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      expected_settings_revision: 1, title: "Should not commit", project_id: null,
      schedule: { kind: "daily" as const },
      default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
      start_logical_date: "2026-09-01", end_logical_date: null,
    };
    await expect(updateRoutine(env.APP_DB, fixture.userId, request, now, {
      beforeMutation: async () => {
        await env.APP_DB.prepare("UPDATE entries SET position = position + 1 WHERE app_user_id = ? AND id = ?")
          .bind(fixture.userId, entryId).run();
      },
    })).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare(`SELECT title FROM tasks WHERE app_user_id = ? AND id = (
      SELECT task_id FROM entries WHERE app_user_id = ? AND id = ?)`)
      .bind(fixture.userId, fixture.userId, entryId).first<string>("title")).toBe("Placement drift");
    expect(await env.APP_DB.prepare(`SELECT settings_revision FROM routine_board_items
      WHERE app_user_id = ? AND routine_definition_id = ?`)
      .bind(fixture.userId, created.result.routine_definition_id).first<number>("settings_revision")).toBe(1);
  });

  it("keeps Task -> Routine at 0..1 and owner-scopes Board reads and writes", async () => {
    const first = await seedUser();
    const second = await seedUser();
    const created = await createOff(first.userId, "First owner");
    expect((await loadRoutineBoard(env.APP_DB, second.userId, now)).routines).toEqual([]);
    await expect(setRoutineEnabled(env.APP_DB, second.userId, {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      enabled: true, expected_settings_revision: 0,
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const duplicate = await env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute,
       materialization_order, defaults_revision, created_at)
      VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, NULL, NULL, NULL, 99, 0, ?)`)
      .bind(uuidv7(), first.userId, created.request.task_id, now).run().then(() => true, () => false);
    expect(duplicate).toBe(false);
  });

  it("toggles OFF/ON with pause history and materializes eligible current Day exactly once", async () => {
    const fixture = await seedUser();
    const created = await createOff(fixture.userId);
    const enabled = await setRoutineEnabled(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      enabled: true, expected_settings_revision: 0,
    }, now);
    expect(enabled).toMatchObject({ enabled: true, settings_revision: 1 });
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId,
      created.result.routine_definition_id).first<number>("count")).toBe(1);
    await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId,
      created.result.routine_definition_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT task_title FROM routine_occurrence_task_snapshots
      WHERE app_user_id = ?`).bind(fixture.userId).first<string>("task_title")).toBe("Board Routine");
    const disabled = await setRoutineEnabled(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      enabled: false, expected_settings_revision: 1,
    }, now);
    expect(disabled).toMatchObject({ enabled: false, settings_revision: 2 });
    expect(await env.APP_DB.prepare(`SELECT paused_logical_date, resumed_logical_date
      FROM routine_pause_intervals WHERE app_user_id = ? AND routine_definition_id = ? ORDER BY created_at`)
      .bind(fixture.userId, created.result.routine_definition_id).all()).toMatchObject({ results: expect.arrayContaining([
        { paused_logical_date: "2026-09-01", resumed_logical_date: "2026-09-01" },
        { paused_logical_date: "2026-09-01", resumed_logical_date: null },
      ]) });
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM entries e
      JOIN routine_occurrences o ON o.app_user_id = e.app_user_id AND o.id = e.routine_occurrence_id
      WHERE e.app_user_id = ? AND o.routine_definition_id = ?`)
      .bind(fixture.userId, created.result.routine_definition_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId,
      created.result.routine_definition_id).first<number>("count")).toBe(0);
    await expect(updateRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      expected_settings_revision: 2, title: "Paused Routine", project_id: null,
      schedule: { kind: "daily" }, default_section_id: null, default_planned_start_minute: null,
      default_estimate_seconds: null, start_logical_date: "2026-09-01", end_logical_date: null,
    }, now)).resolves.toMatchObject({ settings_revision: 3 });
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrence_suppressions
      WHERE app_user_id = ? AND routine_occurrence_id IN (SELECT id FROM routine_occurrences
        WHERE app_user_id = ? AND routine_definition_id = ?)`)
      .bind(fixture.userId, fixture.userId, created.result.routine_definition_id)
      .first<number>("count")).toBe(0);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now)).unsectioned_entries)
      .toHaveLength(0);
    const resumed = await setRoutineEnabled(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      enabled: true, expected_settings_revision: 3,
    }, now);
    expect(resumed).toMatchObject({ enabled: true, settings_revision: 4 });
    expect((await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now)).unsectioned_entries)
      .toHaveLength(1);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId,
      created.result.routine_definition_id).first<number>("count")).toBe(1);
  });

  it("disables planned, running, and completed Routine children at the current-Day boundary", async () => {
    const fixture = await seedUser();
    const planned = await createOff(fixture.userId, "Planned child", 0);
    const running = await createOff(fixture.userId, "Running child", 1);
    const completed = await createOff(fixture.userId, "Completed child", 2);
    for (const routine of [planned, running, completed]) {
      await setRoutineEnabled(env.APP_DB, fixture.userId, {
        operation_id: uuidv7(), routine_definition_id: routine.result.routine_definition_id,
        enabled: true, expected_settings_revision: 0,
      }, now);
    }
    const entryFor = async (routineDefinitionId: string) => env.APP_DB.prepare(`SELECT e.id
      FROM entries e JOIN routine_occurrences o ON o.app_user_id = e.app_user_id
        AND o.id = e.routine_occurrence_id
      WHERE e.app_user_id = ? AND o.routine_definition_id = ?`).bind(fixture.userId, routineDefinitionId)
      .first<string>("id");
    const completedEntryId = await entryFor(completed.result.routine_definition_id);
    if (!completedEntryId) throw new Error("missing completed Routine entry");
    const currentPlacementRevision = async () => env.APP_DB.prepare(
      "SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.day.taskchute_day.id).first<number>("placement_revision").then((row) => row ?? 0);
    const completedExecution = await startEntry(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: completedEntryId, execution_id: uuidv7(),
      expected_placement_revision: await currentPlacementRevision(),
    }, now);
    await completeEntry(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: completedEntryId, execution_id: completedExecution.execution.id,
    });
    const runningEntryId = await entryFor(running.result.routine_definition_id);
    if (!runningEntryId) throw new Error("missing running Routine entry");
    await startEntry(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: runningEntryId, execution_id: uuidv7(),
      expected_placement_revision: await currentPlacementRevision(),
    }, now);

    for (const routine of [planned, running, completed]) {
      await expect(setRoutineEnabled(env.APP_DB, fixture.userId, {
        operation_id: uuidv7(), routine_definition_id: routine.result.routine_definition_id,
        enabled: false, expected_settings_revision: 1,
      }, now)).resolves.toMatchObject({ enabled: false, settings_revision: 2 });
      expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM entries e
        JOIN routine_occurrences o ON o.app_user_id = e.app_user_id AND o.id = e.routine_occurrence_id
        WHERE e.app_user_id = ? AND o.routine_definition_id = ?`)
        .bind(fixture.userId, routine.result.routine_definition_id).first<number>("count")).toBe(0);
      expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
        WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId,
        routine.result.routine_definition_id).first<number>("count")).toBe(0);
    }
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
  });

  it("updates Task authority, recurrence/defaults, occurrence snapshot, and rejects stale revisions", async () => {
    const fixture = await seedUser();
    const created = await createOff(fixture.userId);
    await setRoutineEnabled(env.APP_DB, fixture.userId, { operation_id: uuidv7(),
      routine_definition_id: created.result.routine_definition_id, enabled: true,
      expected_settings_revision: 0 }, now);
    const request = { operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      expected_settings_revision: 1, title: "Renamed Routine", project_id: fixture.projectId,
      schedule: { kind: "weekly" as const, weekdays: [1, 3, 5] },
      default_section_id: fixture.sectionId, default_planned_start_minute: 600,
      default_estimate_seconds: 1500, start_logical_date: "2026-09-01", end_logical_date: "2026-09-30" };
    expect(await updateRoutine(env.APP_DB, fixture.userId, request, now)).toEqual({
      routine_definition_id: created.result.routine_definition_id, settings_revision: 2,
    });
    expect(await updateRoutine(env.APP_DB, fixture.userId, request, now)).toMatchObject({ settings_revision: 2 });
    await expect(updateRoutine(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7(),
      title: "stale" }, now)).rejects.toMatchObject({ code: "revision_conflict" });
    const board = await loadRoutineBoard(env.APP_DB, fixture.userId, now);
    expect(board.routines[0]).toMatchObject({ title: "Renamed Routine",
      project: { id: fixture.projectId, title: "Board project" }, schedule: { kind: "weekly", weekdays: [1, 3, 5] },
      default_section_id: fixture.sectionId, default_planned_start_minute: 600,
      default_estimate_seconds: 1500, end_logical_date: "2026-09-30" });
    expect(await env.APP_DB.prepare(`SELECT task_title, project_id, project_title
      FROM routine_occurrence_task_snapshots WHERE app_user_id = ?`).bind(fixture.userId).first())
      .toEqual({ task_title: "Renamed Routine", project_id: fixture.projectId, project_title: "Board project" });
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrence_suppressions
      WHERE app_user_id = ?`).bind(fixture.userId).first<number>("count")).toBe(1);
    const suppressedProjection = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    expect(suppressedProjection.sections.flatMap((section) => section.entries)
      .concat(suppressedProjection.unsectioned_entries)).toEqual([]);

    const restore = { ...request, operation_id: uuidv7(), expected_settings_revision: 2,
      schedule: { kind: "daily" as const } };
    expect(await updateRoutine(env.APP_DB, fixture.userId, restore, now)).toMatchObject({ settings_revision: 3 });
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrence_suppressions
      WHERE app_user_id = ?`).bind(fixture.userId).first<number>("count")).toBe(0);
    const restoredProjection = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    expect(restoredProjection.sections.flatMap((section) => section.entries)
      .concat(restoredProjection.unsectioned_entries)).toHaveLength(1);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId,
      created.result.routine_definition_id).first<number>("count")).toBe(1);
  });

  it("keeps Board ordering independent with revision/replay/conflict protection", async () => {
    const fixture = await seedUser();
    const first = await createOff(fixture.userId, "First");
    const secondRequest = { operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
      title: "Second", expected_board_revision: 1 };
    await createRoutine(env.APP_DB, fixture.userId, secondRequest, now);
    const materializationBefore = await env.APP_DB.prepare(`SELECT id, materialization_order
      FROM routine_definitions WHERE app_user_id = ? ORDER BY materialization_order`)
      .bind(fixture.userId).all<{ id: string; materialization_order: number }>();
    const request = { operation_id: uuidv7(), routine_definition_ids: [secondRequest.routine_definition_id,
      first.request.routine_definition_id], expected_board_revision: 2 };
    expect(await reorderRoutines(env.APP_DB, fixture.userId, request, now)).toEqual({
      routine_definition_ids: request.routine_definition_ids, board_revision: 3,
    });
    expect(await reorderRoutines(env.APP_DB, fixture.userId, request, now)).toMatchObject({ board_revision: 3 });
    await expect(reorderRoutines(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect((await loadRoutineBoard(env.APP_DB, fixture.userId, now)).routines.map((item) => item.title))
      .toEqual(["Second", "First"]);
    expect((await env.APP_DB.prepare(`SELECT id, materialization_order FROM routine_definitions
      WHERE app_user_id = ? ORDER BY materialization_order`).bind(fixture.userId)
      .all<{ id: string; materialization_order: number }>()).results).toEqual(materializationBefore.results);
  });

  it("deletes current materialized Routine children, including completed executions", async () => {
    const fixture = await seedUser();
    const created = await createOff(fixture.userId, "Delete me");
    await updateRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      expected_settings_revision: 0, title: "Delete me", project_id: null, schedule: { kind: "daily" },
      default_section_id: fixture.sectionId, default_planned_start_minute: 300, default_estimate_seconds: 600,
      start_logical_date: "2026-09-01", end_logical_date: null,
    }, now);
    await setRoutineEnabled(env.APP_DB, fixture.userId, { operation_id: uuidv7(),
      routine_definition_id: created.result.routine_definition_id, enabled: true, expected_settings_revision: 1 }, now);
    const before = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    const entry = before.sections.flatMap((section) => section.entries).concat(before.unsectioned_entries)[0];
    if (!entry) throw new Error("missing materialized Routine entry");
    const started = await startEntry(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: entry.id, execution_id: uuidv7(),
    }, now);
    await completeEntry(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: entry.id, execution_id: started.execution.id,
    });
    const request = { operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      expected_settings_revision: 2, expected_board_revision: created.result.board_revision };
    const deleted = await deleteRoutine(env.APP_DB, fixture.userId, request, now);
    expect(deleted).toEqual({ routine_definition_id: request.routine_definition_id, board_revision: request.expected_board_revision + 1 });
    expect(await deleteRoutine(env.APP_DB, fixture.userId, request, now)).toEqual(deleted);
    await expect(deleteRoutine(env.APP_DB, fixture.userId, { ...request, expected_board_revision: 99 }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect((await loadRoutineBoard(env.APP_DB, fixture.userId, now)).routines).toEqual([]);
    const after = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    expect(after.sections.flatMap((section) => section.entries).concat(after.unsectioned_entries))
      .toEqual([]);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, entry.id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_definitions WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT command_type FROM operations
      WHERE app_user_id = ? AND operation_id = ?`).bind(fixture.userId, request.operation_id)
      .first<string>("command_type")).toBe("DeleteRoutine");
    await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
  });

  it("preserves Routine history before the server-resolved delete boundary", async () => {
    const fixture = await seedUser();
    const created = await createOff(fixture.userId, "Historical Routine");
    await setRoutineEnabled(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      enabled: true, expected_settings_revision: 0,
    }, now);
    const entry = await env.APP_DB.prepare(`SELECT e.id, e.routine_occurrence_id
      FROM entries e JOIN routine_occurrences o ON o.app_user_id = e.app_user_id
        AND o.id = e.routine_occurrence_id
      WHERE e.app_user_id = ? AND o.routine_definition_id = ?`)
      .bind(fixture.userId, created.result.routine_definition_id).first<{ id: string; routine_occurrence_id: string }>();
    if (!entry) throw new Error("missing historical Routine entry");
    await env.APP_DB.batch([
      env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-08-31',
        start_instant = '2026-08-31T00:00:00.000Z', end_instant = '2026-09-01T00:00:00.000Z'
        WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, fixture.day.taskchute_day.id),
      env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts
        SET actual_start_instant = '2026-08-31T00:00:00.000Z',
            actual_end_instant = '2026-09-01T00:00:00.000Z'
        WHERE app_user_id = ? AND taskchute_day_id = ?`)
        .bind(fixture.userId, fixture.day.taskchute_day.id),
    ]);
    const deleted = await deleteRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), routine_definition_id: created.result.routine_definition_id,
      expected_settings_revision: 1, expected_board_revision: created.result.board_revision,
    }, now);
    expect(deleted.board_revision).toBe(created.result.board_revision + 1);
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, entry.id).first<string>("lifecycle_state")).toBe("planned");
    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, entry.id).first<string>("routine_occurrence_id")).toBe(entry.routine_occurrence_id);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, entry.routine_occurrence_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_definition_archives WHERE app_user_id = ? AND routine_definition_id = ?")
      .bind(fixture.userId, created.result.routine_definition_id).first<number>("count")).toBe(1);
  });

  it("keeps an explicit historical no-Project snapshot when the current Task later gains a Project", async () => {
    const fixture = await seedUser();
    const created = await createOff(fixture.userId, "Historical title");
    await setRoutineEnabled(env.APP_DB, fixture.userId, { operation_id: uuidv7(),
      routine_definition_id: created.result.routine_definition_id, enabled: true,
      expected_settings_revision: 0 }, now);
    await env.APP_DB.batch([
      env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-08-31',
        start_instant = '2026-08-31T00:00:00.000Z', end_instant = '2026-09-01T00:00:00.000Z'
        WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, fixture.day.taskchute_day.id),
      env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts
        SET actual_start_instant = '2026-08-31T00:00:00.000Z',
            actual_end_instant = '2026-09-01T00:00:00.000Z'
        WHERE app_user_id = ? AND taskchute_day_id = ?`)
        .bind(fixture.userId, fixture.day.taskchute_day.id),
      env.APP_DB.prepare("UPDATE tasks SET title = 'Current title', project_id = ? WHERE app_user_id = ? AND id = ?")
        .bind(fixture.projectId, fixture.userId, created.request.task_id),
    ]);
    const historical = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-31", now);
    const entry = historical.sections.flatMap((section) => section.entries)
      .concat(historical.unsectioned_entries)[0]!;
    expect(entry.task).toEqual({ id: created.request.task_id, title: "Historical title", project: null, primary_document_id: null });
  });

  it("registers legacy Day conversion on the Board and preserves its occurrence identity", async () => {
    const fixture = await seedUser();
    const taskId = uuidv7(); const entryId = uuidv7(); const definitionId = uuidv7(); const occurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Converted', ?)")
        .bind(taskId, fixture.userId, now),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 1, 'planned', 600, 300, ?)`)
        .bind(entryId, fixture.userId, taskId, fixture.day.taskchute_day.id, fixture.sectionId, now),
    ]);
    await convertEntryToRoutine(env.APP_DB, fixture.userId, { operation_id: uuidv7(),
      routine_definition_id: definitionId, routine_occurrence_id: occurrenceId, entry_id: entryId,
      taskchute_day_id: fixture.day.taskchute_day.id, end_logical_date: null }, now);
    expect((await loadRoutineBoard(env.APP_DB, fixture.userId, now)).routines[0]).toMatchObject({
      routine_definition_id: definitionId, title: "Converted", enabled: true,
    });
    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id FROM routine_occurrence_task_snapshots WHERE app_user_id = ?")
      .bind(fixture.userId).first<string>("routine_occurrence_id")).toBe(occurrenceId);
  });

  it("materializes every D-086 recurrence family through the shared evaluator", async () => {
    const fixture = await seedUser();
    const schedules = [
      { kind: "every_n_weeks" as const, interval_weeks: 2, weekdays: [3] },
      { kind: "monthly_day" as const, day_of_month: 30 },
      { kind: "monthly_last_day" as const },
      { kind: "monthly_nth_weekday" as const, ordinal: 5, weekday: 3 },
      { kind: "monthly_last_weekday" as const, weekday: 3 },
      { kind: "every_n_months_day" as const, interval_months: 2, day_of_month: 30 },
      { kind: "every_n_months_last_day" as const, interval_months: 2 },
    ];
    let boardRevision = 0;
    for (const schedule of schedules) {
      const created = await createRoutine(env.APP_DB, fixture.userId, {
        operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
        title: `D086 ${schedule.kind}`, expected_board_revision: boardRevision,
      }, now);
      boardRevision += 1;
      await updateRoutine(env.APP_DB, fixture.userId, {
        operation_id: uuidv7(), routine_definition_id: created.routine_definition_id,
        expected_settings_revision: 0, title: `D086 ${schedule.kind}`, project_id: null, schedule,
        default_section_id: null, default_planned_start_minute: null, default_estimate_seconds: null,
        start_logical_date: "2026-09-30", end_logical_date: null,
      }, now);
      await setRoutineEnabled(env.APP_DB, fixture.userId, {
        operation_id: uuidv7(), routine_definition_id: created.routine_definition_id,
        enabled: true, expected_settings_revision: 1,
      }, now);
    }
    const later = "2026-09-30T12:00:00.000Z";
    await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, later);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?`)
      .bind(fixture.userId).first<number>("count")).toBe(schedules.length);
    await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, later);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?`)
      .bind(fixture.userId).first<number>("count")).toBe(schedules.length);
  });
});
