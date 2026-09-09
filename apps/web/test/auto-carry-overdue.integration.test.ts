import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { autoCarryCurrentDay, loadAutoCarryOverduePlannedSetting, setAutoCarryOverduePlanned } from "../worker/application/auto-carry-overdue";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { uuidv7 } from "../src/shared/uuidv7";

const userId = uuidv7();
const dayId = uuidv7();
const configurationVersionId = uuidv7();
const sectionIds = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
const ordinaryEntryIds = [uuidv7(), uuidv7()];
const routineEntryId = uuidv7();
const targetEntryIds = [uuidv7(), uuidv7(), uuidv7()];
const taskIds = [...ordinaryEntryIds, routineEntryId, ...targetEntryIds].map(() => uuidv7());
const routineDefinitionId = uuidv7();
const routineOccurrenceId = uuidv7();
const createdAt = "2026-08-22T00:00:00.000Z";
const nowInstant = "2026-08-22T07:00:00.000Z";

beforeAll(async () => {
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, createdAt),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, createdAt),
    ...sectionIds.map((sectionId, index) => env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(sectionId, userId, `D082 Section ${index + 1}`, index, createdAt)),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(configurationVersionId, userId, createdAt),
    ...sectionIds.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, configurationVersionId, sectionId, `D082 Section ${index + 1}`, index === 0 ? 0 : [180, 360, 720][index - 1], [180, 360, 720, 1440][index], index)),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-22', '2026-08-22T00:00:00.000Z', '2026-08-23T00:00:00.000Z', 'UTC', 0, 'compatible', 5, ?)`)
      .bind(dayId, userId, createdAt),
    ...sectionIds.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute,
       logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, dayId, sectionId, configurationVersionId, `D082 Section ${index + 1}`,
        index === 0 ? 0 : [180, 360, 720][index - 1], [180, 360, 720, 1440][index],
        `2026-08-22T${String(index === 0 ? 0 : [3, 6, 12][index - 1]).padStart(2, "0")}:00:00.000Z`,
        index === 3 ? "2026-08-23T00:00:00.000Z" : `2026-08-22T${String([3, 6, 12, 24][index]).padStart(2, "0")}:00:00.000Z`, index)),
    ...taskIds.map((taskId, index) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(taskId, userId, `D082 task ${index + 1}`, createdAt)),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'planned', 60, ?), (?, ?, ?, ?, ?, 1, 'planned', 240, ?)`)
      .bind(ordinaryEntryIds[0], userId, taskIds[0], dayId, sectionIds[0], createdAt,
        ordinaryEntryIds[1], userId, taskIds[1], dayId, sectionIds[1], createdAt),
    env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, default_section_id,
       default_planned_start_minute, materialization_order, created_at)
      VALUES (?, ?, ?, 'daily', '2026-08-22', ?, 240, 1, ?)`)
      .bind(routineDefinitionId, userId, taskIds[2], sectionIds[1], createdAt),
    env.APP_DB.prepare("INSERT INTO routine_schedules (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask) VALUES (?, ?, 'daily', NULL, NULL)")
      .bind(userId, routineDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_board_items (app_user_id, routine_definition_id, board_position, settings_revision) VALUES (?, ?, 1, 0)")
      .bind(userId, routineDefinitionId),
    env.APP_DB.prepare(`INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(routineOccurrenceId, userId, routineDefinitionId, dayId, createdAt),
    env.APP_DB.prepare("INSERT INTO routine_occurrence_task_snapshots (app_user_id, routine_occurrence_id, task_title, project_id, project_title) VALUES (?, ?, ?, NULL, NULL)")
      .bind(userId, routineOccurrenceId, "D082 routine task"),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, routine_occurrence_id, created_at)
      VALUES (?, ?, ?, ?, ?, 2, 'planned', 240, ?, ?)`)
      .bind(routineEntryId, userId, taskIds[2], dayId, sectionIds[1], routineOccurrenceId, createdAt),
    ...targetEntryIds.map((entryId, index) => env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?)`)
      .bind(entryId, userId, taskIds[index + 3], dayId, sectionIds[2], index + 1,
        index === 0 ? null : 420 + (index - 1) * 60, createdAt)),
  ]);
});

describe.sequential("D-082 auto-carry overdue planned", () => {
  it("updates the account setting with CAS and exact replay", async () => {
    const initial = await loadAutoCarryOverduePlannedSetting(env.APP_DB, userId);
    expect(initial.auto_carry_overdue_planned).toBe(false);
    const request = { operation_id: uuidv7(), enabled: true, expected_updated_at: initial.updated_at };
    const result = await setAutoCarryOverduePlanned(env.APP_DB, userId, request, "2026-08-22T07:00:01.000Z");
    expect(result.auto_carry_overdue_planned).toBe(true);
    expect(await setAutoCarryOverduePlanned(env.APP_DB, userId, request, "2026-08-22T07:00:02.000Z")).toEqual(result);
    await expect(setAutoCarryOverduePlanned(env.APP_DB, userId, { ...request, enabled: false }, "2026-08-22T07:00:03.000Z"))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    await expect(setAutoCarryOverduePlanned(env.APP_DB, userId, {
      operation_id: uuidv7(),
      enabled: false,
      expected_updated_at: initial.updated_at,
    }, "2026-08-22T07:00:04.000Z")).rejects.toMatchObject({ code: "revision_conflict" });
  });

  it("carries ordinary and Routine-derived overdue entries once, preserving order and updating the Routine override", async () => {
    const before = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(dayId).first<number>("placement_revision");
    expect(before).toBe(5);
    const result = await autoCarryCurrentDay(env.APP_DB, userId,
      { id: dayId, logical_date: "2026-08-22", placement_revision: before! }, nowInstant);
    expect(result?.carried_entry_ids).toEqual([ordinaryEntryIds[0], ordinaryEntryIds[1], routineEntryId]);
    expect(result?.placement_revision).toBe(6);
    const rows = await env.APP_DB.prepare(`SELECT id, section_id, planned_start_minute, position FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY section_id, position, id`).bind(userId, dayId).all<{ id: string; section_id: string; planned_start_minute: number | null; position: number }>();
    const carried = rows.results.filter((row) => [ordinaryEntryIds[0], ordinaryEntryIds[1], routineEntryId, ...targetEntryIds].includes(row.id));
    expect(carried.filter((row) => row.section_id === sectionIds[2]).map((row) => row.id)).toEqual([
      targetEntryIds[0], ordinaryEntryIds[0], ordinaryEntryIds[1], routineEntryId, targetEntryIds[1], targetEntryIds[2],
    ]);
    expect(carried.filter((row) => row.section_id === sectionIds[2]).map((row) => row.planned_start_minute)).toEqual([null, 360, 360, 360, 420, 480]);
    expect(await env.APP_DB.prepare("SELECT section_plan_override_present, section_override_id, planned_start_override_minute FROM routine_occurrences WHERE id = ?")
      .bind(routineOccurrenceId).first()).toEqual({ section_plan_override_present: 1, section_override_id: sectionIds[2], planned_start_override_minute: 360 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(dayId).first<number>("placement_revision")).toBe(6);
    expect(await autoCarryCurrentDay(env.APP_DB, userId, { id: dayId, logical_date: "2026-08-22", placement_revision: 6 }, nowInstant)).toEqual(result);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId, nowInstant);
    expect(projection.sections.find((section) => section.id === sectionIds[2])?.entries.map((entry) => entry.id)).toEqual([
      targetEntryIds[0], ordinaryEntryIds[0], ordinaryEntryIds[1], routineEntryId, targetEntryIds[1], targetEntryIds[2],
    ]);
  });
});
