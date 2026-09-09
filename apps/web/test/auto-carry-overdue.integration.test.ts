import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { autoCarryCurrentDay, loadAutoCarryOverduePlannedSetting, setAutoCarryOverduePlanned } from "../worker/application/auto-carry-overdue";
import { moveEntry } from "../worker/application/entry-planning";
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

async function createCorrectiveRoutineFixture() {
  const fixtureUserId = uuidv7();
  const fixtureDayId = uuidv7();
  const originDayId = uuidv7();
  const configurationId = uuidv7();
  const fixtureSections = [uuidv7(), uuidv7(), uuidv7()];
  const ordinaryTaskId = uuidv7();
  const sameRoutineTaskId = uuidv7();
  const movedRoutineTaskId = uuidv7();
  const ordinaryEntryId = uuidv7();
  const sameRoutineEntryId = uuidv7();
  const movedRoutineEntryId = uuidv7();
  const sameDefinitionId = uuidv7();
  const movedDefinitionId = uuidv7();
  const sameOccurrenceId = uuidv7();
  const movedOccurrenceId = uuidv7();
  const created = "2026-08-23T00:00:00.000Z";
  const fixtureNow = "2026-08-23T07:00:00.000Z";
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(fixtureUserId, created),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at, auto_carry_overdue_planned) VALUES (?, 'UTC', 0, ?, 1)")
      .bind(fixtureUserId, created),
    ...fixtureSections.map((sectionId, index) => env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(sectionId, fixtureUserId, `D082 corrective Section ${index + 1}`, index, created)),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(configurationId, fixtureUserId, created),
    ...fixtureSections.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(fixtureUserId, configurationId, sectionId, `D082 corrective Section ${index + 1}`,
        index * 360, (index + 1) * 360, index)),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(fixtureUserId, configurationId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-23', '2026-08-23T00:00:00.000Z', '2026-08-24T00:00:00.000Z', 'UTC', 0, 'compatible', 12, ?)`)
      .bind(fixtureDayId, fixtureUserId, created),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-22', '2026-08-22T00:00:00.000Z', '2026-08-23T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(originDayId, fixtureUserId, created),
    ...fixtureSections.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute,
       logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(fixtureUserId, fixtureDayId, sectionId, configurationId, `D082 corrective Section ${index + 1}`,
        index * 360, (index + 1) * 360,
        `2026-08-23T${String(index * 6).padStart(2, "0")}:00:00.000Z`,
        index === 2 ? "2026-08-24T00:00:00.000Z" : `2026-08-23T${String((index + 1) * 6).padStart(2, "0")}:00:00.000Z`, index)),
    ...[ordinaryTaskId, sameRoutineTaskId, movedRoutineTaskId]
      .map((taskId, index) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
        .bind(taskId, fixtureUserId, `D082 corrective task ${index + 1}`, created)),
    env.APP_DB.prepare("INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type, start_logical_date, default_section_id, default_planned_start_minute, materialization_order, created_at) VALUES (?, ?, ?, 'daily', '2026-08-23', ?, 120, 1, ?)")
      .bind(sameDefinitionId, fixtureUserId, sameRoutineTaskId, fixtureSections[0], created),
    env.APP_DB.prepare("INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type, start_logical_date, default_section_id, default_planned_start_minute, materialization_order, created_at) VALUES (?, ?, ?, 'daily', '2026-08-23', ?, 120, 2, ?)")
      .bind(movedDefinitionId, fixtureUserId, movedRoutineTaskId, fixtureSections[0], created),
    env.APP_DB.prepare("INSERT INTO routine_schedules (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask) VALUES (?, ?, 'daily', NULL, NULL)")
      .bind(fixtureUserId, sameDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_schedules (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask) VALUES (?, ?, 'daily', NULL, NULL)")
      .bind(fixtureUserId, movedDefinitionId),
    env.APP_DB.prepare("INSERT INTO routine_board_items (app_user_id, routine_definition_id, board_position, settings_revision) VALUES (?, ?, ?, 0)")
      .bind(fixtureUserId, sameDefinitionId, 1),
    env.APP_DB.prepare("INSERT INTO routine_board_items (app_user_id, routine_definition_id, board_position, settings_revision) VALUES (?, ?, ?, 0)")
      .bind(fixtureUserId, movedDefinitionId, 2),
    env.APP_DB.prepare("INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(sameOccurrenceId, fixtureUserId, sameDefinitionId, fixtureDayId, created),
    env.APP_DB.prepare("INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(movedOccurrenceId, fixtureUserId, movedDefinitionId, originDayId, created),
    env.APP_DB.prepare("INSERT INTO routine_occurrence_task_snapshots (app_user_id, routine_occurrence_id, task_title, project_id, project_title) VALUES (?, ?, ?, NULL, NULL)")
      .bind(fixtureUserId, sameOccurrenceId, "D082 same-origin routine"),
    env.APP_DB.prepare("INSERT INTO routine_occurrence_task_snapshots (app_user_id, routine_occurrence_id, task_title, project_id, project_title) VALUES (?, ?, ?, NULL, NULL)")
      .bind(fixtureUserId, movedOccurrenceId, "D082 moved routine"),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'planned', 120, ?)`)
      .bind(ordinaryEntryId, fixtureUserId, ordinaryTaskId, fixtureDayId, fixtureSections[0], created),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, routine_occurrence_id, created_at)
      VALUES (?, ?, ?, ?, ?, 2, 'planned', 120, ?, ?)`)
      .bind(sameRoutineEntryId, fixtureUserId, sameRoutineTaskId, fixtureDayId, fixtureSections[0], sameOccurrenceId, created),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, routine_occurrence_id, created_at)
      VALUES (?, ?, ?, ?, ?, 3, 'planned', 120, ?, ?)`)
      .bind(movedRoutineEntryId, fixtureUserId, movedRoutineTaskId, fixtureDayId, fixtureSections[0], movedOccurrenceId, created),
  ]);
  return { fixtureUserId, fixtureDayId, originDayId, fixtureSections, ordinaryEntryId, sameRoutineEntryId,
    movedRoutineEntryId, sameOccurrenceId, movedOccurrenceId, fixtureNow };
}

async function createZeroCandidateFixture() {
  const fixtureUserId = uuidv7();
  const fixtureDayId = uuidv7();
  const configurationId = uuidv7();
  const fixtureSections = [uuidv7(), uuidv7()];
  const taskId = uuidv7();
  const entryId = uuidv7();
  const created = "2026-08-24T00:00:00.000Z";
  const fixtureNow = "2026-08-24T07:00:00.000Z";
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(fixtureUserId, created),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at, auto_carry_overdue_planned) VALUES (?, 'UTC', 0, ?, 1)")
      .bind(fixtureUserId, created),
    ...fixtureSections.map((sectionId, index) => env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(sectionId, fixtureUserId, `D082 zero Section ${index + 1}`, index, created)),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(configurationId, fixtureUserId, created),
    ...fixtureSections.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(fixtureUserId, configurationId, sectionId, `D082 zero Section ${index + 1}`, index * 360, (index + 1) * 360, index)),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(fixtureUserId, configurationId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-24', '2026-08-24T00:00:00.000Z', '2026-08-25T00:00:00.000Z', 'UTC', 0, 'compatible', 9, ?)`)
      .bind(fixtureDayId, fixtureUserId, created),
    ...fixtureSections.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute,
       logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(fixtureUserId, fixtureDayId, sectionId, configurationId, `D082 zero Section ${index + 1}`,
        index * 360, (index + 1) * 360,
        `2026-08-24T${String(index * 6).padStart(2, "0")}:00:00.000Z`,
        `2026-08-24T${String((index + 1) * 6).padStart(2, "0")}:00:00.000Z`, index)),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'D082 zero checkpoint task', ?)")
      .bind(taskId, fixtureUserId, created),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'planned', 360, ?)`)
      .bind(entryId, fixtureUserId, taskId, fixtureDayId, fixtureSections[1], created),
  ]);
  return { fixtureUserId, fixtureDayId, fixtureSections, entryId, fixtureNow };
}

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

  it("excludes cross-Day moved Routine entries without blocking ordinary and same-origin carry", async () => {
    const fixture = await createCorrectiveRoutineFixture();
    const result = await autoCarryCurrentDay(env.APP_DB, fixture.fixtureUserId, {
      id: fixture.fixtureDayId, logical_date: "2026-08-23", placement_revision: 12,
    }, fixture.fixtureNow);
    expect(result?.carried_entry_ids).toEqual([fixture.ordinaryEntryId, fixture.sameRoutineEntryId]);
    expect(result?.placement_revision).toBe(13);
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute, position FROM entries WHERE id = ?")
      .bind(fixture.movedRoutineEntryId).first()).toEqual({
      section_id: fixture.fixtureSections[0], planned_start_minute: 120, position: 3,
    });
    expect(await env.APP_DB.prepare("SELECT section_plan_override_present, section_override_id, planned_start_override_minute FROM routine_occurrences WHERE id = ?")
      .bind(fixture.movedOccurrenceId).first()).toEqual({
      section_plan_override_present: 0, section_override_id: null, planned_start_override_minute: null,
    });
    expect(await env.APP_DB.prepare("SELECT section_plan_override_present, section_override_id, planned_start_override_minute FROM routine_occurrences WHERE id = ?")
      .bind(fixture.sameOccurrenceId).first()).toEqual({
      section_plan_override_present: 1, section_override_id: fixture.fixtureSections[1], planned_start_override_minute: 360,
    });
    await expect(loadCurrentTaskChuteDay(env.APP_DB, fixture.fixtureUserId, fixture.fixtureNow)).resolves.toBeDefined();
  });

  it("checkpoints a zero-candidate boundary with exact replay and no placement increment", async () => {
    const fixture = await createZeroCandidateFixture();
    await env.APP_DB.prepare("UPDATE taskchute_days SET placement_revision = 10 WHERE id = ?")
      .bind(fixture.fixtureDayId).run();
    const staleRead = { id: fixture.fixtureDayId, logical_date: "2026-08-24", placement_revision: 9 };
    const result = await autoCarryCurrentDay(env.APP_DB, fixture.fixtureUserId, staleRead, fixture.fixtureNow);
    expect(result).toEqual({
      taskchute_day_id: fixture.fixtureDayId,
      current_section_id: fixture.fixtureSections[1],
      carried_entry_ids: [],
      placement_revision: 10,
    });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.fixtureDayId).first<number>("placement_revision")).toBe(10);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = 'AutoCarryOverduePlanned'")
      .bind(fixture.fixtureUserId).first<number>("count")).toBe(1);
    expect(await autoCarryCurrentDay(env.APP_DB, fixture.fixtureUserId, {
      ...staleRead, placement_revision: 10,
    }, fixture.fixtureNow)).toEqual(result);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = 'AutoCarryOverduePlanned'")
      .bind(fixture.fixtureUserId).first<number>("count")).toBe(1);
  });

  it("does not bounce a post-checkpoint manual move back into the current Section", async () => {
    const fixture = await createZeroCandidateFixture();
    const checkpoint = await autoCarryCurrentDay(env.APP_DB, fixture.fixtureUserId, {
      id: fixture.fixtureDayId, logical_date: "2026-08-24", placement_revision: 9,
    }, fixture.fixtureNow);
    expect(checkpoint?.carried_entry_ids).toEqual([]);
    const moved = await moveEntry(env.APP_DB, fixture.fixtureUserId, {
      operation_id: uuidv7(), entry_id: fixture.entryId, taskchute_day_id: fixture.fixtureDayId,
      section_id: fixture.fixtureSections[0], expected_placement_revision: 9,
    });
    expect(moved.section_id).toBe(fixture.fixtureSections[0]);
    const replay = await autoCarryCurrentDay(env.APP_DB, fixture.fixtureUserId, {
      id: fixture.fixtureDayId, logical_date: "2026-08-24", placement_revision: 10,
    }, fixture.fixtureNow);
    expect(replay).toEqual(checkpoint);
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ section_id: fixture.fixtureSections[0], planned_start_minute: 0 });
  });
});
