import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { completeEntry, startEntry } from "../worker/application/entry-lifecycle";
import { createMode, loadModeBoard, reorderModes, setEntryMode, updateMode } from "../worker/application/mode-management";
import { deleteCompletedEntry } from "../worker/application/delete-completed-entry";

const now = "2026-09-05T12:00:00.000Z";

async function seed() {
  const userId = uuidv7(); const sectionId = uuidv7(); const dayId = uuidv7(); const taskId = uuidv7(); const entryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Focus', 0, ?)").bind(sectionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
       establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-05', '2026-09-05T00:00:00Z', '2026-09-06T00:00:00Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
    env.APP_DB.prepare("INSERT INTO taskchute_day_section_contexts (app_user_id, taskchute_day_id, section_id, title, context_order) VALUES (?, ?, ?, 'Focus', 0)")
      .bind(userId, dayId, sectionId),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Mode task', ?)").bind(taskId, userId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'planned', ?)`)
      .bind(entryId, userId, taskId, dayId, sectionId, now),
  ]);
  return { userId, dayId, entryId };
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
});
