import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { createRoutine, loadRoutineBoard, setRoutineEnabled, updateRoutine } from "../worker/application/routine-board";
import { setRoutineMode } from "../worker/application/routine-planning";

const now = "2026-09-01T12:00:00.000Z";

async function seed() {
  const userId = uuidv7();
  const sectionId = uuidv7();
  const versionId = uuidv7();
  const modeA = uuidv7();
  const modeB = uuidv7();
  const modeC = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)")
      .bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Focus', 0, ?)")
      .bind(sectionId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
      .bind(versionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Focus', 0, 1440, 0)`).bind(userId, versionId, sectionId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, versionId),
    ...[modeA, modeB, modeC].flatMap((modeId, index) => [
      env.APP_DB.prepare("INSERT INTO mode_definitions (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
        .bind(modeId, userId, `Mode ${String.fromCharCode(65 + index)}`, now),
      env.APP_DB.prepare("INSERT INTO mode_board_items (app_user_id, mode_id, board_position) VALUES (?, ?, ?)")
        .bind(userId, modeId, index + 1),
    ]),
  ]);
  await loadCurrentTaskChuteDay(env.APP_DB, userId, now);
  return { userId, sectionId, modeA, modeB, modeC };
}

async function establishRoutine(fixture: Awaited<ReturnType<typeof seed>>) {
  const createRequest = { operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
    title: "Routine Mode fixture", expected_board_revision: 0 };
  await createRoutine(env.APP_DB, fixture.userId, createRequest, now);
  await updateRoutine(env.APP_DB, fixture.userId, {
    operation_id: uuidv7(), routine_definition_id: createRequest.routine_definition_id,
    expected_settings_revision: 0, title: createRequest.title, project_id: null,
    schedule: { kind: "daily" }, default_section_id: fixture.sectionId, default_planned_start_minute: 600,
    default_estimate_seconds: 600, default_mode_id: fixture.modeA,
    start_logical_date: "2026-09-01", end_logical_date: null,
  }, now);
  await setRoutineEnabled(env.APP_DB, fixture.userId, {
    operation_id: uuidv7(), routine_definition_id: createRequest.routine_definition_id,
    enabled: true, expected_settings_revision: 1,
  }, now);
  const day = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
  const entry = day.sections.flatMap((section) => section.entries).find((candidate) => candidate.routine !== null);
  if (!entry) throw new Error("Routine entry was not materialized");
  return { ...fixture, routineDefinitionId: createRequest.routine_definition_id, entry };
}

describe.sequential("D-085 Routine Mode", () => {
  it("persists a Routine default, occurrence override, and definition propagation", async () => {
    const fixture = await establishRoutine(await seed());
    expect((await loadRoutineBoard(env.APP_DB, fixture.userId, now)).routines[0]).toMatchObject({
      default_mode_id: fixture.modeA,
      default_mode: { id: fixture.modeA, title: "Mode A", archived: false },
    });

    const occurrence = { operation_id: uuidv7(), entry_id: fixture.entry.id,
      taskchute_day_id: (await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now)).taskchute_day.id!, action: "occurrence" as const,
      mode_id: fixture.modeB };
    await expect(setRoutineMode(env.APP_DB, fixture.userId, occurrence, now)).resolves.toMatchObject({
      entry_id: fixture.entry.id, mode_id: fixture.modeB, mode_override_present: true,
    });
    const overridden = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    expect(overridden.sections.flatMap((section) => section.entries).find((entry) => entry.id === fixture.entry.id)?.mode)
      .toMatchObject({ id: fixture.modeB, title: "Mode B", source: "live" });

    const definition = { operation_id: uuidv7(), entry_id: fixture.entry.id,
      taskchute_day_id: occurrence.taskchute_day_id, action: "definition" as const,
      mode_id: fixture.modeC, expected_defaults_revision: fixture.entry.routine!.defaults_revision };
    await expect(setRoutineMode(env.APP_DB, fixture.userId, definition, now)).resolves.toMatchObject({
      entry_id: fixture.entry.id, mode_id: fixture.modeC, mode_override_present: false,
    });
    const finalDay = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    const finalEntry = finalDay.sections.flatMap((section) => section.entries).find((entry) => entry.id === fixture.entry.id);
    expect(finalEntry?.mode).toMatchObject({ id: fixture.modeC, title: "Mode C", source: "live" });
    expect(finalEntry?.routine).toMatchObject({ default_mode_id: fixture.modeC, mode_override_present: false });
    expect(await env.APP_DB.prepare(`SELECT mode_id FROM routine_definition_modes
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, fixture.routineDefinitionId).first())
      .toEqual({ mode_id: fixture.modeC });
    expect(await env.APP_DB.prepare(`SELECT mode_id FROM routine_occurrence_mode_overrides
      WHERE app_user_id = ? AND routine_occurrence_id = ?`).bind(fixture.userId, fixture.entry.routine!.routine_occurrence_id).first())
      .toBeNull();
  });

  it("replays the exact operation and does not permit a past/non-Routine entry", async () => {
    const fixture = await establishRoutine(await seed());
    const request = { operation_id: uuidv7(), entry_id: fixture.entry.id,
      taskchute_day_id: (await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now)).taskchute_day.id!, action: "occurrence" as const,
      mode_id: fixture.modeB };
    const first = await setRoutineMode(env.APP_DB, fixture.userId, request, now);
    expect(await setRoutineMode(env.APP_DB, fixture.userId, request, now)).toEqual(first);
    await expect(setRoutineMode(env.APP_DB, fixture.userId, { ...request, mode_id: fixture.modeC }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    const pastDay = uuidv7();
    const taskId = uuidv7(); const entryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO taskchute_days
        (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
         establishment_disambiguation, placement_revision, created_at)
        VALUES (?, ?, '2026-08-31', '2026-08-31T00:00:00Z', '2026-09-01T00:00:00Z', 'UTC', 0, 'compatible', 0, ?)`)
        .bind(pastDay, fixture.userId, now),
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Past', ?)").bind(taskId, fixture.userId, now),
      env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
        VALUES (?, ?, ?, ?, ?, 1, 'planned', ?)`)
        .bind(entryId, fixture.userId, taskId, pastDay, fixture.sectionId, now),
    ]);
    await expect(setRoutineMode(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7(), entry_id: entryId,
      taskchute_day_id: pastDay }, now)).rejects.toMatchObject({ code: "resource_conflict" });
  });
});
