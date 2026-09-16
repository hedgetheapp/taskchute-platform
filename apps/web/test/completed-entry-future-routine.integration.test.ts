import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { addTaskToDay } from "../worker/application/add-task-to-day";
import { completeEntry, startEntry } from "../worker/application/entry-lifecycle";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { createFutureRoutineFromCompletedEntry,
  isCreateFutureRoutineFromCompletedEntryRequest } from "../worker/application/completed-entry-future-routine";
import { setEntryEstimate } from "../worker/application/entry-planning";
import { createRoutine } from "../worker/application/routine-board";
import { deleteCompletedEntry } from "../worker/application/delete-completed-entry";

const currentDayInstant = "2026-09-01T12:00:00.000Z";

async function seedCompletedEntry() {
  const userId = uuidv7();
  const sectionId = uuidv7();
  const sectionConfigurationId = uuidv7();
  const sourceProjectId = uuidv7();
  const taskProjectIdAfterStart = uuidv7();
  const modeId = uuidv7();
  const taskId = uuidv7();
  const entryId = uuidv7();
  const now = currentDayInstant;

  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare(`INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at)
      VALUES (?, 'UTC', 0, ?)`).bind(userId, now),
    env.APP_DB.prepare(`INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
      VALUES (?, ?, 'Morning', 0, ?)`).bind(sectionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_versions
      (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)`).bind(sectionConfigurationId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute,
       logical_end_minute, configuration_order) VALUES (?, ?, ?, 'Morning', 0, 1440, 0)`)
      .bind(userId, sectionConfigurationId, sectionId),
    env.APP_DB.prepare(`INSERT INTO section_configuration_heads (app_user_id, configuration_version_id)
      VALUES (?, ?)`).bind(userId, sectionConfigurationId),
    env.APP_DB.prepare(`INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'Snapshot project', ?)`)
      .bind(sourceProjectId, userId, now),
    env.APP_DB.prepare(`INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'Later task project', ?)`)
      .bind(taskProjectIdAfterStart, userId, now),
    env.APP_DB.prepare(`INSERT INTO mode_definitions (id, app_user_id, title, created_at)
      VALUES (?, ?, 'Snapshot mode', ?)`).bind(modeId, userId, now),
    env.APP_DB.prepare(`INSERT INTO mode_board_items (app_user_id, mode_id, board_position, settings_revision)
      VALUES (?, ?, 1, 0)`).bind(userId, modeId),
  ]);

  const day = await loadCurrentTaskChuteDay(env.APP_DB, userId, now);
  await addTaskToDay(env.APP_DB, userId, {
    operation_id: uuidv7(), task_id: taskId, entry_id: entryId, project_id: sourceProjectId,
    mode_id: modeId, title: "Historical task title", taskchute_day_id: day.taskchute_day.id,
    logical_date: day.taskchute_day.logical_date, section_id: sectionId,
    expected_placement_revision: day.placement_revision,
  }, now);
  await setEntryEstimate(env.APP_DB, userId, {
    operation_id: uuidv7(), entry_id: entryId, estimate_seconds: 1800,
  });
  const start = await startEntry(env.APP_DB, userId, {
    operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7(),
  }, now);
  const completed = await completeEntry(env.APP_DB, userId, {
    operation_id: uuidv7(), entry_id: entryId, execution_id: start.execution.id,
  });

  // D-116A permits correcting the shared Task Project after execution; the Entry snapshot remains authoritative.
  await env.APP_DB.prepare("UPDATE tasks SET project_id = ? WHERE app_user_id = ? AND id = ?")
    .bind(taskProjectIdAfterStart, userId, taskId).run();

  return { userId, sectionId, sourceProjectId, taskProjectIdAfterStart, modeId, taskId, entryId,
    executionId: start.execution.id, completedExecutionEndedAt: completed.execution.ended_at,
    dayId: day.taskchute_day.id };
}

function requestFor(fixture: { entryId: string }, expectedBoardRevision = 0) {
  return { operation_id: uuidv7(), source_entry_id: fixture.entryId, task_id: uuidv7(),
    routine_definition_id: uuidv7(), expected_board_revision: expectedBoardRevision };
}

async function scalar(sql: string, ...bindings: unknown[]) {
  const row = await env.APP_DB.prepare(sql).bind(...bindings).first<{ value: number }>();
  return row?.value ?? 0;
}

function failingMutationBatch(db: D1Database): D1Database {
  return new Proxy(db, {
    get(target, property) {
      if (property === "batch") return async () => { throw new Error("injected D1 batch failure"); };
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe.sequential("CreateFutureRoutineFromCompletedEntry", () => {
  it("copies the completed Entry snapshot into one future Routine without mutating source history", async () => {
    const fixture = await seedCompletedEntry();
    const request = requestFor(fixture);
    const result = await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, request, currentDayInstant);

    expect(result).toMatchObject({ source_entry_id: fixture.entryId, task_id: request.task_id,
      routine_definition_id: request.routine_definition_id, board_position: 1, board_revision: 1,
      settings_revision: 0, start_logical_date: "2026-09-02", source_was_already_converted: false });
    expect(await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, request, currentDayInstant)).toEqual(result);
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId,
      { ...request, routine_definition_id: uuidv7() }, currentDayInstant)).rejects.toMatchObject({ code: "operation_id_misuse" });

    expect(await env.APP_DB.prepare(`SELECT t.title, t.project_id, r.default_section_id,
        r.default_planned_start_minute, r.default_estimate_seconds, r.start_logical_date, r.end_logical_date,
        s.schedule_kind, rdm.mode_id
      FROM routine_definitions r JOIN tasks t ON t.app_user_id = r.app_user_id AND t.id = r.task_id
      JOIN routine_schedules s ON s.app_user_id = r.app_user_id AND s.routine_definition_id = r.id
      LEFT JOIN routine_definition_modes rdm ON rdm.app_user_id = r.app_user_id
        AND rdm.routine_definition_id = r.id
      WHERE r.app_user_id = ? AND r.id = ?`).bind(fixture.userId, request.routine_definition_id).first())
      .toMatchObject({ title: "Historical task title", project_id: fixture.sourceProjectId,
        default_section_id: fixture.sectionId, default_planned_start_minute: 0,
        default_estimate_seconds: 1800, start_logical_date: "2026-09-02", end_logical_date: null,
        schedule_kind: "daily", mode_id: fixture.modeId });
    expect(fixture.taskProjectIdAfterStart).not.toBe(fixture.sourceProjectId);

    expect(await env.APP_DB.prepare(`SELECT lifecycle_state, routine_occurrence_id, section_id,
        planned_start_minute, estimate_seconds FROM entries WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, fixture.entryId).first()).toMatchObject({ lifecycle_state: "completed",
        routine_occurrence_id: null, section_id: fixture.sectionId, planned_start_minute: 0, estimate_seconds: 1800 });
    expect(await env.APP_DB.prepare("SELECT title, project_id FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.taskId).first()).toMatchObject({ title: "Historical task title",
        project_id: fixture.taskProjectIdAfterStart });
    expect(await env.APP_DB.prepare(`SELECT project_id, project_title FROM entry_project_snapshots
      WHERE app_user_id = ? AND entry_id = ?`).bind(fixture.userId, fixture.entryId).first())
      .toMatchObject({ project_id: fixture.sourceProjectId, project_title: "Snapshot project" });
    expect(await env.APP_DB.prepare(`SELECT mode_id, mode_title FROM entry_mode_snapshots
      WHERE app_user_id = ? AND entry_id = ?`).bind(fixture.userId, fixture.entryId).first())
      .toMatchObject({ mode_id: fixture.modeId, mode_title: "Snapshot mode" });
    expect(await env.APP_DB.prepare("SELECT ended_at, terminal_outcome FROM executions WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.executionId).first()).toMatchObject({ ended_at: fixture.completedExecutionEndedAt,
        terminal_outcome: "completed" });
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_occurrences WHERE app_user_id = ? AND routine_definition_id = ?",
      fixture.userId, request.routine_definition_id)).toBe(0);
    expect(await scalar("SELECT COUNT(*) AS value FROM entries WHERE app_user_id = ? AND routine_occurrence_id IN (SELECT id FROM routine_occurrences WHERE routine_definition_id = ?)",
      fixture.userId, request.routine_definition_id)).toBe(0);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, currentDayInstant))
      .sections.flatMap((section) => section.entries).find((entry) => entry.id === fixture.entryId))
      .toMatchObject({ lifecycle_state: "completed", routine: null,
        future_routine_definition_id: request.routine_definition_id });

    const nextDay = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-09-02T12:00:00.000Z");
    expect(nextDay.sections.flatMap((section) => section.entries).filter((entry) =>
      entry.routine?.routine_definition_id === request.routine_definition_id)).toHaveLength(1);
    await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-09-02T12:00:00.000Z");
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_occurrences WHERE app_user_id = ? AND routine_definition_id = ?",
      fixture.userId, request.routine_definition_id)).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_pause_intervals
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, request.routine_definition_id)
      .first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM routine_definition_archives
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(fixture.userId, request.routine_definition_id)
      .first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("board_revision")).toBe(1);

    const placementRevision = await env.APP_DB.prepare(`SELECT placement_revision FROM taskchute_days
      WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, fixture.dayId).first<number>("placement_revision");
    if (placementRevision === null) throw new Error("Source TaskChuteDay is missing");
    const deleteRequest = {
      operation_id: uuidv7(), taskchute_day_id: fixture.dayId, entry_id: fixture.entryId,
      expected_placement_revision: placementRevision,
    };
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, deleteRequest, currentDayInstant))
      .rejects.toMatchObject({ code: "resource_conflict", message: expect.stringContaining("future Routine") });
    await expect(deleteCompletedEntry(env.APP_DB, fixture.userId, deleteRequest, currentDayInstant))
      .rejects.toMatchObject({ code: "resource_conflict", message: expect.stringContaining("future Routine") });
    expect(await env.APP_DB.prepare(`SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, fixture.entryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await scalar("SELECT COUNT(*) AS value FROM executions WHERE app_user_id = ? AND entry_id = ?",
      fixture.userId, fixture.entryId)).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT placement_revision FROM taskchute_days
      WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, fixture.dayId).first<number>("placement_revision"))
      .toBe(placementRevision);
  });

  it("converges deterministic concurrent conversions of one source Entry", async () => {
    const fixture = await seedCompletedEntry();
    const left = requestFor(fixture);
    const right = requestFor(fixture);
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const hooks = { beforeMutation: async () => {
      arrived += 1;
      if (arrived === 2) release();
      await gate;
    } };

    const [leftResult, rightResult] = await Promise.all([
      createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, left, currentDayInstant, hooks),
      createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, right, currentDayInstant, hooks),
    ]);
    expect(new Set([leftResult.routine_definition_id, rightResult.routine_definition_id]).size).toBe(1);
    expect(leftResult.source_entry_id).toBe(fixture.entryId);
    expect(rightResult.source_entry_id).toBe(fixture.entryId);
    expect(await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, left, currentDayInstant)).toEqual(leftResult);
    expect(await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, right, currentDayInstant)).toEqual(rightResult);
    expect(await scalar("SELECT COUNT(*) AS value FROM completed_entry_future_routines WHERE app_user_id = ? AND source_entry_id = ?",
      fixture.userId, fixture.entryId)).toBe(1);
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ?", fixture.userId)).toBe(1);
  });

  it("returns the existing linked Routine for a later operation before checking stale board revision", async () => {
    const fixture = await seedCompletedEntry();
    const first = requestFor(fixture, 0);
    const created = await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, first, currentDayInstant);
    const second = requestFor(fixture, 0);
    const replayed = await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, second, currentDayInstant);
    expect(replayed).toMatchObject({ routine_definition_id: created.routine_definition_id,
      task_id: created.task_id, source_was_already_converted: true });
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ?", fixture.userId)).toBe(1);
  });

  it("copies Section and planned start only when the current Section configuration still contains them", async () => {
    const fixture = await seedCompletedEntry();
    const otherSectionId = uuidv7();
    const nextConfigurationId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
        VALUES (?, ?, 'Afternoon', 1, ?)`).bind(otherSectionId, fixture.userId, currentDayInstant),
      env.APP_DB.prepare(`INSERT INTO section_configuration_versions
        (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)`)
        .bind(nextConfigurationId, fixture.userId, currentDayInstant),
      env.APP_DB.prepare(`INSERT INTO section_configuration_items
        (app_user_id, configuration_version_id, section_id, title, logical_start_minute,
         logical_end_minute, configuration_order) VALUES (?, ?, ?, 'Afternoon', 0, 1440, 0)`)
        .bind(fixture.userId, nextConfigurationId, otherSectionId),
      env.APP_DB.prepare(`UPDATE section_configuration_heads SET configuration_version_id = ? WHERE app_user_id = ?`)
        .bind(nextConfigurationId, fixture.userId),
    ]);

    const request = requestFor(fixture);
    await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, request, currentDayInstant);
    expect(await env.APP_DB.prepare(`SELECT default_section_id, default_planned_start_minute
      FROM routine_definitions WHERE app_user_id = ? AND id = ?`).bind(fixture.userId, request.routine_definition_id).first())
      .toMatchObject({ default_section_id: null, default_planned_start_minute: null });
  });

  it("preserves an explicitly cleared historical Project instead of falling back to the shared Task Project", async () => {
    const fixture = await seedCompletedEntry();
    await env.APP_DB.prepare(`UPDATE entry_project_snapshots SET project_id = NULL, project_title = NULL
      WHERE app_user_id = ? AND entry_id = ?`).bind(fixture.userId, fixture.entryId).run();
    const request = requestFor(fixture);
    await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, request, currentDayInstant);
    expect(await env.APP_DB.prepare(`SELECT project_id FROM tasks WHERE app_user_id = ? AND id = ?`)
      .bind(fixture.userId, request.task_id).first<string | null>("project_id")).toBeNull();
  });

  it("uses no Routine default Mode when the completed Entry has no historical Mode", async () => {
    const fixture = await seedCompletedEntry();
    await env.APP_DB.batch([
      env.APP_DB.prepare("DELETE FROM entry_mode_snapshots WHERE app_user_id = ? AND entry_id = ?")
        .bind(fixture.userId, fixture.entryId),
      env.APP_DB.prepare("DELETE FROM entry_modes WHERE app_user_id = ? AND entry_id = ?")
        .bind(fixture.userId, fixture.entryId),
    ]);
    const request = requestFor(fixture);
    await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, request, currentDayInstant);
    expect(await scalar(`SELECT COUNT(*) AS value FROM routine_definition_modes
      WHERE app_user_id = ? AND routine_definition_id = ?`, fixture.userId, request.routine_definition_id)).toBe(0);
  });

  it("returns a revision conflict when the Routine Board moved before the request", async () => {
    const fixture = await seedCompletedEntry();
    await env.APP_DB.prepare("UPDATE routine_board_heads SET board_revision = 1 WHERE app_user_id = ?")
      .bind(fixture.userId).run();
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId,
      requestFor(fixture, 0), currentDayInstant)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ?", fixture.userId)).toBe(0);
  });

  it("keeps a failed D1 batch atomic and exact retry creates one Routine", async () => {
    const fixture = await seedCompletedEntry();
    const request = requestFor(fixture);
    await expect(createFutureRoutineFromCompletedEntry(failingMutationBatch(env.APP_DB), fixture.userId,
      request, currentDayInstant)).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await scalar("SELECT COUNT(*) AS value FROM tasks WHERE app_user_id = ? AND id = ?",
      fixture.userId, request.task_id)).toBe(0);
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ?", fixture.userId)).toBe(0);
    await createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, request, currentDayInstant);
    expect(await scalar("SELECT COUNT(*) AS value FROM completed_entry_future_routines WHERE app_user_id = ? AND source_entry_id = ?",
      fixture.userId, fixture.entryId)).toBe(1);
  });

  it("does not commit from a stale source snapshot changed at the mutation boundary", async () => {
    const fixture = await seedCompletedEntry();
    const request = requestFor(fixture);
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, request, currentDayInstant, {
      beforeMutation: async () => {
        await env.APP_DB.prepare(`UPDATE entry_mode_snapshots SET mode_title = 'Corrected snapshot'
          WHERE app_user_id = ? AND entry_id = ?`).bind(fixture.userId, fixture.entryId).run();
      },
    })).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ?", fixture.userId)).toBe(0);
  });

  it("rejects conversion if the current logical Day settings change at the mutation boundary", async () => {
    const fixture = await seedCompletedEntry();
    const request = requestFor(fixture);
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId, request, currentDayInstant, {
      beforeMutation: async () => {
        await env.APP_DB.prepare(`UPDATE user_settings SET day_boundary_minutes = 780, updated_at = ?
          WHERE app_user_id = ?`).bind(currentDayInstant, fixture.userId).run();
      },
    })).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await scalar("SELECT COUNT(*) AS value FROM completed_entry_future_routines WHERE app_user_id = ?",
      fixture.userId)).toBe(0);
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ?", fixture.userId)).toBe(0);
  });

  it("rejects a missing historical Project snapshot without creating any Routine", async () => {
    const fixture = await seedCompletedEntry();
    await env.APP_DB.prepare("DELETE FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?")
      .bind(fixture.userId, fixture.entryId).run();
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId,
      requestFor(fixture), currentDayInstant)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await scalar("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ?", fixture.userId)).toBe(0);
  });

  it("rejects archived snapshot Project or Mode references", async () => {
    const projectFixture = await seedCompletedEntry();
    await env.APP_DB.prepare(`INSERT INTO project_archives (app_user_id, project_id, archived_at) VALUES (?, ?, ?)`)
      .bind(projectFixture.userId, projectFixture.sourceProjectId, currentDayInstant).run();
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, projectFixture.userId,
      requestFor(projectFixture), currentDayInstant)).rejects.toMatchObject({ code: "resource_conflict" });

    const modeFixture = await seedCompletedEntry();
    await env.APP_DB.prepare(`INSERT INTO mode_archives (app_user_id, mode_id, archived_at) VALUES (?, ?, ?)`)
      .bind(modeFixture.userId, modeFixture.modeId, currentDayInstant).run();
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, modeFixture.userId,
      requestFor(modeFixture), currentDayInstant)).rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("fails closed when the completed Entry is not on the current logical Day", async () => {
    const fixture = await seedCompletedEntry();
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId,
      requestFor(fixture), "2026-09-02T12:00:00.000Z")).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await scalar("SELECT COUNT(*) AS value FROM completed_entry_future_routines WHERE app_user_id = ?",
      fixture.userId)).toBe(0);
  });

  it.each(["planned", "running"] as const)("rejects a %s source Entry", async (lifecycleState) => {
    const fixture = await seedCompletedEntry();
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = ? WHERE app_user_id = ? AND id = ?")
      .bind(lifecycleState, fixture.userId, fixture.entryId).run();
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId,
      requestFor(fixture), currentDayInstant)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await scalar("SELECT COUNT(*) AS value FROM completed_entry_future_routines WHERE app_user_id = ?",
      fixture.userId)).toBe(0);
  });

  it("rejects a Routine-derived completed Entry without altering its occurrence identity", async () => {
    const fixture = await seedCompletedEntry();
    const createdRoutine = await createRoutine(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), task_id: uuidv7(), routine_definition_id: uuidv7(),
      title: "Existing Routine", expected_board_revision: 0,
    }, currentDayInstant);
    const occurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_occurrences
        (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(occurrenceId, fixture.userId,
        createdRoutine.routine_definition_id, fixture.dayId, currentDayInstant),
      env.APP_DB.prepare("UPDATE entries SET routine_occurrence_id = ? WHERE app_user_id = ? AND id = ?")
        .bind(occurrenceId, fixture.userId, fixture.entryId),
    ]);
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId,
      requestFor(fixture, createdRoutine.board_revision), currentDayInstant)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id, lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.entryId).first()).toMatchObject({
      routine_occurrence_id: occurrenceId, lifecycle_state: "completed",
    });
  });

  it("does not resolve an Entry through a different owner or accept a missing source", async () => {
    const fixture = await seedCompletedEntry();
    const otherUserId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUserId, currentDayInstant),
      env.APP_DB.prepare(`INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at)
        VALUES (?, 'UTC', 0, ?)`).bind(otherUserId, currentDayInstant),
    ]);
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, otherUserId,
      requestFor(fixture), currentDayInstant)).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(createFutureRoutineFromCompletedEntry(env.APP_DB, fixture.userId,
      requestFor({ entryId: uuidv7() }), currentDayInstant)).rejects.toMatchObject({ code: "resource_not_found" });
  });

  it("accepts only the minimal client request and rejects client-supplied copy semantics", () => {
    const request = requestFor({ entryId: uuidv7() });
    expect(isCreateFutureRoutineFromCompletedEntryRequest(request)).toBe(true);
    expect(isCreateFutureRoutineFromCompletedEntryRequest({ ...request, title: "client title" })).toBe(false);
    expect(isCreateFutureRoutineFromCompletedEntryRequest({ ...request, project_id: uuidv7() })).toBe(false);
  });
});
