import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { completeEntry, startEntry } from "../worker/application/entry-lifecycle";
import { createMode, deleteMode, loadModeBoard, reorderModes, setEntryMode, setModeArchived, updateMode } from "../worker/application/mode-management";
import { deleteCompletedEntry } from "../worker/application/delete-completed-entry";

const now = "2026-09-05T12:00:00.000Z";

async function seed() {
  const userId = uuidv7(); const sectionId = uuidv7(); const dayId = uuidv7(); const taskId = uuidv7(); const entryId = uuidv7();
  const configurationVersionId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Focus', 0, ?)").bind(sectionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(configurationVersionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Focus', 0, 1440, 0)`).bind(userId, configurationVersionId, sectionId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
       establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-05', '2026-09-05T00:00:00Z', '2026-09-06T00:00:00Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Focus', 0, 1440, '2026-09-05T00:00:00Z', '2026-09-06T00:00:00Z', 0)`)
      .bind(userId, dayId, sectionId, configurationVersionId),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Mode task', ?)").bind(taskId, userId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'planned', ?)`)
      .bind(entryId, userId, taskId, dayId, sectionId, now),
  ]);
  return { userId, dayId, sectionId, taskId, entryId };
}

async function seedEstablishedFuture() {
  const fixture = await seed();
  const futureDayId = uuidv7(); const futureEntryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
       establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-06', '2026-09-06T00:00:00Z', '2026-09-07T00:00:00Z', 'UTC', 0, 'compatible', 4, ?)`)
      .bind(futureDayId, fixture.userId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
      estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 1, 'planned', 900, 360, ?)`)
      .bind(futureEntryId, fixture.userId, fixture.taskId, futureDayId, fixture.sectionId, now),
  ]);
  return { ...fixture, futureDayId, futureEntryId };
}

async function seedMode(userId: string, title: string): Promise<string> {
  const modeId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO mode_definitions (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(modeId, userId, title, now),
    env.APP_DB.prepare("INSERT INTO mode_board_items (app_user_id, mode_id, board_position) VALUES (?, ?, (SELECT COALESCE(MAX(board_position), 0) + 1 FROM mode_board_items WHERE app_user_id = ?))")
      .bind(userId, modeId, userId),
  ]);
  return modeId;
}

describe.sequential("D-068 Mode management", () => {
  it("creates, renames, reorders, assigns, and snapshots a Mode", async () => {
    const fixture = await seed();
    const firstId = uuidv7(); const secondId = uuidv7();
    const first = await createMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), mode_id: firstId, title: "Focus" }, now);
    const second = await createMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), mode_id: secondId, title: "Focus" }, now);
    expect(first.board_revision).toBe(1); expect(second.board_revision).toBe(2);
    expect((await loadModeBoard(env.APP_DB, fixture.userId)).modes.map((mode) => mode.id)).toEqual([firstId, secondId]);
    expect(await reorderModes(env.APP_DB, fixture.userId, { operation_id: uuidv7(), mode_ids: [secondId, firstId], expected_board_revision: 2 }, now))
      .toEqual({ mode_ids: [secondId, firstId], board_revision: 3 });
    const renamed = await updateMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), mode_id: firstId,
      expected_settings_revision: 0, expected_title: "Focus", title: "Deep work" }, now);
    expect(renamed).toEqual({ mode: { id: firstId, title: "Deep work" }, settings_revision: 1 });
    const assigned = { operation_id: uuidv7(), entry_id: fixture.entryId, expected_mode_id: null, mode_id: firstId };
    expect(await setEntryMode(env.APP_DB, fixture.userId, assigned, now)).toMatchObject({ mode_id: firstId, mode_title: "Deep work" });
    expect(await setEntryMode(env.APP_DB, fixture.userId, assigned, now)).toMatchObject({ mode_id: firstId });
    expect((await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now)).sections[0]?.entries[0]?.mode)
      .toEqual({ id: firstId, title: "Deep work", source: "live" });

    const started = await startEntry(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7() }, now);
    const running = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    expect(running.sections[0]?.entries[0]?.mode).toEqual({ id: firstId, title: "Deep work", source: "snapshot" });
    await updateMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), mode_id: firstId,
      expected_settings_revision: 1, expected_title: "Deep work", title: "Renamed later" }, now);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now)).sections[0]?.entries[0]?.mode)
      .toEqual({ id: firstId, title: "Deep work", source: "snapshot" });
    await completeEntry(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: started.execution.id });
    expect(await env.APP_DB.prepare("SELECT mode_id, mode_title FROM entry_mode_snapshots WHERE entry_id = ?").bind(fixture.entryId).first())
      .toEqual({ mode_id: firstId, mode_title: "Deep work" });
    await deleteCompletedEntry(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), taskchute_day_id: fixture.dayId, entry_id: fixture.entryId, expected_placement_revision: 0,
    }, now);
    expect(await env.APP_DB.prepare("SELECT entry_id FROM entry_modes WHERE entry_id = ?").bind(fixture.entryId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT entry_id FROM entry_mode_snapshots WHERE entry_id = ?").bind(fixture.entryId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT id FROM mode_definitions WHERE id = ?").bind(firstId).first()).toEqual({ id: firstId });
    expect(await env.APP_DB.prepare("PRAGMA quick_check").first()).toEqual({ quick_check: "ok" });
    expect((await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("sets, replaces, clears, and replays Mode on an established future ordinary Entry without placement changes", async () => {
    const fixture = await seedEstablishedFuture();
    const firstId = await seedMode(fixture.userId, "Focus");
    const secondId = await seedMode(fixture.userId, "Light");
    const before = await env.APP_DB.prepare(`SELECT e.task_id, e.taskchute_day_id, e.section_id, e.position, e.lifecycle_state,
        e.estimate_seconds, e.planned_start_minute, d.logical_date, d.placement_revision
      FROM entries e JOIN taskchute_days d ON d.id = e.taskchute_day_id WHERE e.id = ?`).bind(fixture.futureEntryId).first();

    const setRequest = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, expected_mode_id: null, mode_id: firstId };
    const setResult = await setEntryMode(env.APP_DB, fixture.userId, setRequest, now);
    expect(setResult).toMatchObject({ entry_id: fixture.futureEntryId, mode_id: firstId, mode_title: "Focus" });
    expect(await setEntryMode(env.APP_DB, fixture.userId, setRequest, now)).toEqual(setResult);

    const replaceRequest = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, expected_mode_id: firstId, mode_id: secondId };
    expect(await setEntryMode(env.APP_DB, fixture.userId, replaceRequest, now)).toMatchObject({ mode_id: secondId, mode_title: "Light" });
    const clearRequest = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, expected_mode_id: secondId, mode_id: null };
    expect(await setEntryMode(env.APP_DB, fixture.userId, clearRequest, now)).toEqual({ entry_id: fixture.futureEntryId, mode_id: null, mode_title: null });
    expect(await env.APP_DB.prepare("SELECT mode_id FROM entry_modes WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.futureEntryId).first()).toBeNull();
    expect(await env.APP_DB.prepare(`SELECT e.task_id, e.taskchute_day_id, e.section_id, e.position, e.lifecycle_state,
        e.estimate_seconds, e.planned_start_minute, d.logical_date, d.placement_revision
      FROM entries e JOIN taskchute_days d ON d.id = e.taskchute_day_id WHERE e.id = ?`).bind(fixture.futureEntryId).first()).toEqual(before);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = 'SetEntryMode'")
      .bind(fixture.userId).first<number>("count")).toBe(3);
  });

  it("preserves no-op authority and rejects stale, misuse, missing, cross-owner, and protected future Mode targets", async () => {
    const fixture = await seedEstablishedFuture();
    const firstId = await seedMode(fixture.userId, "Focus");
    const secondId = await seedMode(fixture.userId, "Light");
    const setRequest = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, expected_mode_id: null, mode_id: firstId };
    await setEntryMode(env.APP_DB, fixture.userId, setRequest, now);
    const noOp = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, expected_mode_id: firstId, mode_id: firstId };
    expect(await setEntryMode(env.APP_DB, fixture.userId, noOp, now)).toMatchObject({ mode_id: firstId });
    await expect(setEntryMode(env.APP_DB, fixture.userId, { ...noOp, operation_id: uuidv7(), expected_mode_id: null, mode_id: secondId }, now))
      .rejects.toMatchObject({ code: "revision_conflict" });
    await expect(setEntryMode(env.APP_DB, fixture.userId, { ...noOp, mode_id: null }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    await expect(setEntryMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.futureEntryId,
      expected_mode_id: firstId, mode_id: uuidv7() }, now)).rejects.toMatchObject({ code: "resource_not_found" });

    const otherUserId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUserId, now),
      env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(otherUserId, now),
    ]);
    await expect(setEntryMode(env.APP_DB, otherUserId, { operation_id: uuidv7(), entry_id: fixture.futureEntryId,
      expected_mode_id: firstId, mode_id: null }, now)).rejects.toMatchObject({ code: "resource_not_found" });

    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running' WHERE id = ?").bind(fixture.futureEntryId).run();
    await expect(setEntryMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.futureEntryId,
      expected_mode_id: firstId, mode_id: null }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const routineDefinitionId = uuidv7();
    const routineOccurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, default_section_id,
         default_planned_start_minute, materialization_order, defaults_revision, created_at) VALUES (?, ?, ?, 'daily', '2026-09-01', ?, 0, 1, 0, ?)`)
        .bind(routineDefinitionId, fixture.userId, fixture.taskId, fixture.sectionId, now),
      env.APP_DB.prepare("INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(routineOccurrenceId, fixture.userId, routineDefinitionId, fixture.futureDayId, now),
    ]);
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'planned', routine_occurrence_id = ? WHERE id = ?")
      .bind(routineOccurrenceId, fixture.futureEntryId).run();
    await expect(setEntryMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.futureEntryId,
      expected_mode_id: firstId, mode_id: null }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    await env.APP_DB.prepare("UPDATE entries SET routine_occurrence_id = NULL WHERE id = ?").bind(fixture.futureEntryId).run();
    await env.APP_DB.prepare("UPDATE taskchute_days SET logical_date = '2026-09-04' WHERE id = ?").bind(fixture.futureDayId).run();
    await expect(setEntryMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.futureEntryId,
      expected_mode_id: firstId, mode_id: null }, now)).rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("rejects a concurrent Day move, lifecycle change, or relation change without partial Mode mutation", async () => {
    const fixture = await seedEstablishedFuture();
    const modeId = await seedMode(fixture.userId, "Focus");
    const otherDayId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
       establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-07', '2026-09-07T00:00:00Z', '2026-09-08T00:00:00Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(otherDayId, fixture.userId, now).run();
    const request = { operation_id: uuidv7(), entry_id: fixture.futureEntryId, expected_mode_id: null, mode_id: modeId };
    const originalBatch = env.APP_DB.batch.bind(env.APP_DB);
    const moved = new Proxy(env.APP_DB, { get(target, property, receiver) {
      if (property === "batch") return async (statements: D1PreparedStatement[]) => {
        await env.APP_DB.prepare("UPDATE entries SET taskchute_day_id = ? WHERE id = ?").bind(otherDayId, fixture.futureEntryId).run();
        return originalBatch(statements);
      };
      return Reflect.get(target, property, receiver);
    } });
    await expect(setEntryMode(moved, fixture.userId, request, now)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT mode_id FROM entry_modes WHERE entry_id = ?").bind(fixture.futureEntryId).first()).toBeNull();

    await env.APP_DB.prepare("UPDATE entries SET taskchute_day_id = ?, lifecycle_state = 'planned' WHERE id = ?").bind(fixture.futureDayId, fixture.futureEntryId).run();
    const lifecycle = new Proxy(env.APP_DB, { get(target, property, receiver) {
      if (property === "batch") return async (statements: D1PreparedStatement[]) => {
        await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running' WHERE id = ?").bind(fixture.futureEntryId).run();
        return originalBatch(statements);
      };
      return Reflect.get(target, property, receiver);
    } });
    await expect(setEntryMode(lifecycle, fixture.userId, { ...request, operation_id: uuidv7() }, now)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT mode_id FROM entry_modes WHERE entry_id = ?").bind(fixture.futureEntryId).first()).toBeNull();

    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'planned' WHERE id = ?").bind(fixture.futureEntryId).run();
    await env.APP_DB.prepare("INSERT INTO entry_modes (app_user_id, entry_id, mode_id) VALUES (?, ?, ?)")
      .bind(fixture.userId, fixture.futureEntryId, modeId).run();
    await expect(setEntryMode(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT mode_id FROM entry_modes WHERE entry_id = ?").bind(fixture.futureEntryId).first()).toEqual({ mode_id: modeId });
    expect(await env.APP_DB.prepare("PRAGMA quick_check").first()).toEqual({ quick_check: "ok" });
    expect((await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("archives/restores and deletes live Mode state while retaining historical snapshot", async () => {
    const fixture = await seed();
    const modeId = await seedMode(fixture.userId, "Disposable");
    const createBoard = await loadModeBoard(env.APP_DB, fixture.userId);
    expect(createBoard.modes[0]).toMatchObject({ id: modeId, archived: false, settings_revision: 0 });
    await setEntryMode(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.entryId, expected_mode_id: null, mode_id: modeId }, now);
    const started = await startEntry(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: uuidv7() }, now);
    await completeEntry(env.APP_DB, fixture.userId, { operation_id: uuidv7(), entry_id: fixture.entryId, execution_id: started.execution.id });
    const archive = await setModeArchived(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), mode_id: modeId, archived: true, expected_settings_revision: 0,
    }, now);
    expect(archive).toEqual({ mode_id: modeId, archived: true, settings_revision: 1 });
    expect((await loadModeBoard(env.APP_DB, fixture.userId)).modes[0]?.archived).toBe(true);
    const restore = await setModeArchived(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), mode_id: modeId, archived: false, expected_settings_revision: 1,
    }, now);
    expect(restore).toEqual({ mode_id: modeId, archived: false, settings_revision: 2 });
    expect((await loadModeBoard(env.APP_DB, fixture.userId)).modes[0]?.archived).toBe(false);
    const archiveAgain = await setModeArchived(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), mode_id: modeId, archived: true, expected_settings_revision: 2,
    }, now);
    expect(archiveAgain).toEqual({ mode_id: modeId, archived: true, settings_revision: 3 });
    const deleted = await deleteMode(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), mode_id: modeId, expected_settings_revision: 3, expected_board_revision: 0,
    }, now);
    expect(deleted).toEqual({ mode_id: modeId, board_revision: 1, cleared_entry_count: 1 });
    expect(await env.APP_DB.prepare("SELECT id FROM mode_definitions WHERE id = ?").bind(modeId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT mode_id FROM entry_modes WHERE entry_id = ?").bind(fixture.entryId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT mode_id, mode_title FROM entry_mode_snapshots WHERE entry_id = ?")
      .bind(fixture.entryId).first()).toEqual({ mode_id: modeId, mode_title: "Disposable" });
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE entry_id = ?").bind(fixture.entryId).first()).not.toBeNull();
    expect(await env.APP_DB.prepare("PRAGMA quick_check").first()).toEqual({ quick_check: "ok" });
    expect((await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
