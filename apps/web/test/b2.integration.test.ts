import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { startEntry } from "../worker/application/entry-lifecycle";
import { moveEntry } from "../worker/application/entry-planning";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { setEntryPlannedStart } from "../worker/application/planned-start";
import { reorderEntries } from "../worker/application/reorder-entries";
import { uuidv7 } from "../src/shared/uuidv7";

const createdAt = "2026-08-28T05:00:00.000Z";

async function seedTimedDay(revision = 0) {
  const userId = uuidv7();
  const dayId = uuidv7();
  const configurationVersionId = uuidv7();
  const sectionIds = [uuidv7(), uuidv7(), uuidv7()];
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, createdAt),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 300, ?)")
      .bind(userId, createdAt),
    ...sectionIds.map((id, index) => env.APP_DB.prepare(
      "INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, userId, `Section ${index + 1}`, index, createdAt)),
    env.APP_DB.prepare(`INSERT INTO section_configuration_versions
      (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 300, ?)`)
      .bind(configurationVersionId, userId, createdAt),
    ...sectionIds.map((id, index) => env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute,
       logical_end_minute, configuration_order) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, configurationVersionId, id, ["Morning", "Day", "Night"][index],
        [300, 540, 1200][index], [540, 1200, 1740][index], index)),
    env.APP_DB.prepare(`INSERT INTO section_configuration_heads
      (app_user_id, configuration_version_id) VALUES (?, ?)`).bind(userId, configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-28', '2026-08-28T05:00:00.000Z', '2026-08-29T05:00:00.000Z',
        'UTC', 300, 'compatible', ?, ?)`).bind(dayId, userId, revision, createdAt),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order) VALUES (?, ?, ?, ?, 'Morning', 300, 540,
       '2026-08-28T05:00:00.000Z', '2026-08-28T09:00:00.000Z', 0)`)
      .bind(userId, dayId, sectionIds[0], configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order) VALUES (?, ?, ?, ?, 'Day', 540, 1200,
       '2026-08-28T09:00:00.000Z', '2026-08-29T00:00:00.000Z', 1)`)
      .bind(userId, dayId, sectionIds[1], configurationVersionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order) VALUES (?, ?, ?, ?, 'Night', 1200, 1740,
       '2026-08-29T00:00:00.000Z', '2026-08-29T05:00:00.000Z', 2)`)
      .bind(userId, dayId, sectionIds[2], configurationVersionId),
  ]);
  return { userId, dayId, sectionIds };
}

async function addEntry(userId: string, dayId: string, sectionId: string | null, position: number,
  lifecycleState: "planned" | "running" | "completed" = "planned", plannedStartMinute: number | null = null) {
  const taskId = uuidv7();
  const entryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(taskId, userId, `B2 ${entryId}`, createdAt),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
      .bind(entryId, userId, taskId, dayId, sectionId, position, lifecycleState, plannedStartMinute, createdAt),
  ]);
  return entryId;
}

async function revision(dayId: string) {
  return env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
    .bind(dayId).first<number>("placement_revision");
}

describe.sequential("Dogfood Day B2 planned start", () => {
  it("uses extended wall-clock boundaries, derives Section placement, clears, and replays exactly once", async () => {
    const { userId, dayId, sectionIds } = await seedTimedDay();
    const entryId = await addEntry(userId, dayId, null, 1);
    const firstRequest = { operation_id: uuidv7(), entry_id: entryId, taskchute_day_id: dayId,
      planned_start_minute: 300, expected_placement_revision: 0 };
    const first = await setEntryPlannedStart(env.APP_DB, userId, firstRequest);
    expect(first).toEqual({ entry_id: entryId, section_id: sectionIds[0], planned_start_minute: 300,
      position: 1, placement_revision: 1 });
    expect(await setEntryPlannedStart(env.APP_DB, userId, firstRequest)).toEqual(first);
    expect(await revision(dayId)).toBe(1);

    const boundary = await setEntryPlannedStart(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryId,
      taskchute_day_id: dayId, planned_start_minute: 540, expected_placement_revision: 1 });
    expect(boundary).toMatchObject({ section_id: sectionIds[1], planned_start_minute: 540, placement_revision: 2 });
    expect(await addEntry(userId, dayId, sectionIds[2]!, 7)).toBeTruthy();
    const late = await setEntryPlannedStart(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryId,
      taskchute_day_id: dayId, planned_start_minute: 1620, expected_placement_revision: 2 });
    expect(late).toMatchObject({ section_id: sectionIds[2], position: 8, placement_revision: 3 });

    for (const invalid of [0, 1740]) {
      await expect(setEntryPlannedStart(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryId,
        taskchute_day_id: dayId, planned_start_minute: invalid, expected_placement_revision: 3 }))
        .rejects.toMatchObject({ code: "resource_conflict" });
      expect(await revision(dayId)).toBe(3);
    }
    const clear = await setEntryPlannedStart(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryId,
      taskchute_day_id: dayId, planned_start_minute: null, expected_placement_revision: 3 });
    expect(clear).toMatchObject({ section_id: null, position: 1, planned_start_minute: null, placement_revision: 4 });
  });

  it("retains same-Section position, rejects unknown context, ineligible lifecycle, owner, stale, and operation misuse", async () => {
    const { userId, dayId, sectionIds } = await seedTimedDay();
    const entryId = await addEntry(userId, dayId, sectionIds[0]!, 11);
    const operationId = uuidv7();
    const request = { operation_id: operationId, entry_id: entryId, taskchute_day_id: dayId,
      planned_start_minute: 420, expected_placement_revision: 0 };
    expect(await setEntryPlannedStart(env.APP_DB, userId, request)).toMatchObject({ position: 11, placement_revision: 1 });
    await expect(setEntryPlannedStart(env.APP_DB, userId, { ...request, planned_start_minute: 421 }))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    await expect(setEntryPlannedStart(env.APP_DB, userId, { ...request, operation_id: uuidv7(), expected_placement_revision: 0 }))
      .rejects.toMatchObject({ code: "revision_conflict" });

    const running = await addEntry(userId, dayId, sectionIds[0]!, 12, "running");
    const completed = await addEntry(userId, dayId, sectionIds[0]!, 13, "completed");
    for (const candidate of [running, completed]) {
      await expect(setEntryPlannedStart(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: candidate,
        taskchute_day_id: dayId, planned_start_minute: 400, expected_placement_revision: 1 }))
        .rejects.toMatchObject({ code: "resource_conflict" });
    }
    const other = await seedTimedDay();
    await expect(setEntryPlannedStart(env.APP_DB, other.userId, { operation_id: uuidv7(), entry_id: entryId,
      taskchute_day_id: dayId, planned_start_minute: 400, expected_placement_revision: 1 }))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await revision(dayId)).toBe(1);

    const legacy = await seedTimedDay();
    await env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts SET configuration_version_id = NULL, logical_start_minute = NULL,
      logical_end_minute = NULL, actual_start_instant = NULL, actual_end_instant = NULL
      WHERE app_user_id = ? AND taskchute_day_id = ?`).bind(legacy.userId, legacy.dayId).run();
    const legacyEntry = await addEntry(legacy.userId, legacy.dayId, legacy.sectionIds[0]!, 1);
    await expect(setEntryPlannedStart(env.APP_DB, legacy.userId, { operation_id: uuidv7(), entry_id: legacyEntry,
      taskchute_day_id: legacy.dayId, planned_start_minute: 400, expected_placement_revision: 0 }))
      .rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("projects canonical planned segments without moving historical barriers and reloads persisted values", async () => {
    const { userId, dayId, sectionIds } = await seedTimedDay();
    const ids = [
      await addEntry(userId, dayId, sectionIds[0]!, 10, "planned", 480),
      await addEntry(userId, dayId, sectionIds[0]!, 20, "planned", null),
      await addEntry(userId, dayId, sectionIds[0]!, 30, "completed", null),
      await addEntry(userId, dayId, sectionIds[0]!, 40, "planned", 450),
      await addEntry(userId, dayId, sectionIds[0]!, 50, "planned", null),
      await addEntry(userId, dayId, sectionIds[0]!, 60, "planned", 450),
    ];
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-28T12:00:00.000Z");
    expect(projection.sections[0]?.entries.map((entry) => entry.id)).toEqual([
      ids[1], ids[0], ids[2], ids[4], ids[3], ids[5],
    ]);
    expect(projection.sections[0]?.entries.map((entry) => entry.planned_start_minute)).toEqual([null, 480, null, null, 450, 450]);
    expect(projection.next_entry?.id).toBe(ids[1]);
  });

  it("allows only same-cohort set-based reorder and rejects cohort, history, and stale crossings without partial effects", async () => {
    const { userId, dayId, sectionIds } = await seedTimedDay();
    const nullA = await addEntry(userId, dayId, sectionIds[0]!, 10);
    const nullB = await addEntry(userId, dayId, sectionIds[0]!, 20);
    const historical = await addEntry(userId, dayId, sectionIds[0]!, 30, "completed");
    const same = await Promise.all(Array.from({ length: 48 }, (_, index) =>
      addEntry(userId, dayId, sectionIds[0]!, 40 + index, "planned", 480)));
    const initial = (await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-28T12:00:00.000Z"))
      .sections[0]!.entries.map((entry) => entry.id);
    const nullSwap = [...initial];
    [nullSwap[0], nullSwap[1]] = [nullSwap[1]!, nullSwap[0]!];
    expect((await reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: sectionIds[0]!, entry_ids: nullSwap, expected_placement_revision: 0 })).placement_revision).toBe(1);
    const sameSwap = [...nullSwap];
    [sameSwap[3], sameSwap[4]] = [sameSwap[4]!, sameSwap[3]!];
    expect((await reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: sectionIds[0]!, entry_ids: sameSwap, expected_placement_revision: 1 })).placement_revision).toBe(2);
    expect(same).toHaveLength(48);

    const before = await env.APP_DB.prepare("SELECT id, position FROM entries WHERE taskchute_day_id = ? ORDER BY position")
      .bind(dayId).all();
    const badCohort = [...sameSwap];
    [badCohort[1], badCohort[3]] = [badCohort[3]!, badCohort[1]!];
    const badHistory = [...sameSwap];
    [badHistory[2], badHistory[3]] = [badHistory[3]!, badHistory[2]!];
    for (const [ids, rev] of [[badCohort, 2], [badHistory, 2], [sameSwap, 1]] as const) {
      await expect(reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
        section_id: sectionIds[0]!, entry_ids: ids, expected_placement_revision: rev })).rejects.toBeTruthy();
      expect((await env.APP_DB.prepare("SELECT id, position FROM entries WHERE taskchute_day_id = ? ORDER BY position")
        .bind(dayId).all()).results).toEqual(before.results);
    }
    expect(historical).toBeTruthy();
  });

  it("synchronizes planned start in MoveEntry atomically, replays it, and starts a timed Entry early without placement revision", async () => {
    const { userId, dayId, sectionIds } = await seedTimedDay();
    const entryId = await addEntry(userId, dayId, sectionIds[0]!, 3, "planned", 500);
    const moveRequest = { operation_id: uuidv7(), entry_id: entryId, taskchute_day_id: dayId,
      section_id: sectionIds[1]!, expected_placement_revision: 0 };
    const moved = await moveEntry(env.APP_DB, userId, moveRequest);
    expect(moved.placement_revision).toBe(1);
    expect(await moveEntry(env.APP_DB, userId, moveRequest)).toEqual(moved);
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(entryId).first()).toEqual({ section_id: sectionIds[1], planned_start_minute: 540 });
    await expect(moveEntry(env.APP_DB, userId, { ...moveRequest, operation_id: uuidv7(), section_id: sectionIds[2]!,
      expected_placement_revision: 0 })).rejects.toMatchObject({ code: "revision_conflict" });

    const earlyEntry = await addEntry(userId, dayId, sectionIds[2]!, 1, "planned", 1620);
    const result = await startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: earlyEntry, execution_id: uuidv7() });
    expect(result).toMatchObject({ lifecycle_state: "running" });
    expect(await revision(dayId)).toBe(1);

    const sectionlessFixture = await seedTimedDay();
    const sectionless = await addEntry(sectionlessFixture.userId, sectionlessFixture.dayId, null, 1);
    const sectionlessStart = await startEntry(env.APP_DB, sectionlessFixture.userId, {
      operation_id: uuidv7(), entry_id: sectionless, execution_id: uuidv7(), expected_placement_revision: 0,
    }, "2026-08-28T06:00:00.000Z");
    expect(sectionlessStart).toMatchObject({ section_id: sectionlessFixture.sectionIds[0], placement_revision: 1 });
    expect(await env.APP_DB.prepare("SELECT planned_start_minute FROM entries WHERE id = ?")
      .bind(sectionless).first<number | null>("planned_start_minute")).toBeNull();
  });

  it("converges concurrent losers and leaves an intentionally ambiguous failure safely retryable", async () => {
    const race = await seedTimedDay();
    const raceEntry = await addEntry(race.userId, race.dayId, null, 1);
    const candidates = [360, 600].map((plannedStartMinute) => ({ operation_id: uuidv7(), entry_id: raceEntry,
      taskchute_day_id: race.dayId, planned_start_minute: plannedStartMinute, expected_placement_revision: 0 }));
    const settled = await Promise.allSettled(candidates.map((request) =>
      setEntryPlannedStart(env.APP_DB, race.userId, request)));
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await revision(race.dayId)).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ?
      AND operation_id IN (?, ?) AND outcome_kind = 'success'`).bind(race.userId,
      candidates[0]!.operation_id, candidates[1]!.operation_id).first<number>("count")).toBe(1);

    const ambiguous = await seedTimedDay();
    const ambiguousEntry = await addEntry(ambiguous.userId, ambiguous.dayId, null, 1);
    const request = { operation_id: uuidv7(), entry_id: ambiguousEntry, taskchute_day_id: ambiguous.dayId,
      planned_start_minute: 360, expected_placement_revision: 0 };
    let batches = 0;
    const failingDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          batches += 1;
          if (batches === 2) throw new Error("intentional pre-commit transport failure");
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(setEntryPlannedStart(failingDb, ambiguous.userId, request))
      .rejects.toMatchObject({ status: 503, code: "infrastructure_ambiguous", reconcile: true });
    expect(await revision(ambiguous.dayId)).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ambiguous.userId, request.operation_id).first<number>("count")).toBe(0);
    expect(await setEntryPlannedStart(env.APP_DB, ambiguous.userId, request)).toMatchObject({ placement_revision: 1 });
  });

  it("detects Section-less/non-null persistence corruption at projection and Start boundaries", async () => {
    const { userId, dayId } = await seedTimedDay();
    const entryId = await addEntry(userId, dayId, null, 1);
    await env.APP_DB.prepare("PRAGMA ignore_check_constraints = ON").run();
    await env.APP_DB.prepare("UPDATE entries SET planned_start_minute = 400 WHERE id = ?").bind(entryId).run();
    await env.APP_DB.prepare("PRAGMA ignore_check_constraints = OFF").run();
    await expect(loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-28T12:00:00.000Z")).rejects.toThrow(
      "Section-less Entry cannot have a planned start",
    );
    await expect(startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7(),
      expected_placement_revision: 0 })).rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("projects completed and active Execution intervals into deterministic Entry summaries", async () => {
    const { userId, dayId, sectionIds } = await seedTimedDay();
    const completed = await addEntry(userId, dayId, sectionIds[0]!, 1, "completed");
    const running = await addEntry(userId, dayId, sectionIds[0]!, 2, "running");
    const planned = await addEntry(userId, dayId, sectionIds[0]!, 3, "planned");
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
        VALUES (?, ?, ?, '2026-08-28T06:00:00.000Z', '2026-08-28T06:10:00.000Z', ?)`)
        .bind(uuidv7(), userId, completed, createdAt),
      env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
        VALUES (?, ?, ?, '2026-08-28T08:00:00.000Z', '2026-08-28T08:15:00.000Z', ?)`)
        .bind(uuidv7(), userId, completed, createdAt),
      env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
        VALUES (?, ?, ?, '2026-08-28T11:30:00.000Z', NULL, ?)`)
        .bind(uuidv7(), userId, running, createdAt),
    ]);

    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-28T12:00:00.000Z");
    const entries = projection.sections[0]!.entries;
    expect(entries.find((entry) => entry.id === completed)?.execution_summary).toEqual({
      first_started_at: "2026-08-28T06:00:00.000Z",
      last_ended_at: "2026-08-28T08:15:00.000Z",
      completed_duration_seconds: 1_500,
      active_started_at: null,
    });
    expect(entries.find((entry) => entry.id === running)?.execution_summary).toEqual({
      first_started_at: "2026-08-28T11:30:00.000Z",
      last_ended_at: null,
      completed_duration_seconds: 0,
      active_started_at: "2026-08-28T11:30:00.000Z",
    });
    expect(entries.find((entry) => entry.id === planned)?.execution_summary).toEqual({
      first_started_at: null, last_ended_at: null, completed_duration_seconds: 0, active_started_at: null,
    });
    expect(projection.active_execution?.entry_id).toBe(running);
  });
});
