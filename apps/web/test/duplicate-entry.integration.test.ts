import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { duplicateEntry } from "../worker/application/duplicate-entry";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-09-02T12:00:00.000Z";

async function seed() {
  const userId = uuidv7(); const dayId = uuidv7(); const sectionId = uuidv7(); const projectId = uuidv7();
  const taskId = uuidv7(); const entryId = uuidv7(); const nextTaskId = uuidv7(); const nextEntryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'S', 0, ?)").bind(sectionId, userId, now),
    env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'P', ?)").bind(projectId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_days (id, app_user_id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-09-02', '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts (app_user_id, taskchute_day_id, section_id,
      configuration_version_id, title, logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, NULL, 'S', 0, 1440, '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z', 0)`)
      .bind(userId, dayId, sectionId),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, ?, 'Copy me', ?)")
      .bind(taskId, userId, projectId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 3, 'planned', 900, 60, ?)`)
      .bind(entryId, userId, taskId, dayId, sectionId, now),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'After', ?)").bind(nextTaskId, userId, now),
    env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 4, 'planned', 600, 60, ?)`)
      .bind(nextEntryId, userId, nextTaskId, dayId, sectionId, now),
  ]);
  return { userId, dayId, sectionId, projectId, entryId };
}

function requestFor(fixture: Awaited<ReturnType<typeof seed>>, revision = 0) {
  return { operation_id: uuidv7(), source_entry_id: fixture.entryId, new_task_id: uuidv7(), new_entry_id: uuidv7(),
    taskchute_day_id: fixture.dayId, expected_placement_revision: revision };
}

async function mutationCounts(fixture: Awaited<ReturnType<typeof seed>>) {
  return {
    tasks: (await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE app_user_id = ?").bind(fixture.userId).first<number>("count")) ?? -1,
    entries: (await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ?").bind(fixture.userId).first<number>("count")) ?? -1,
    operations: (await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ?").bind(fixture.userId).first<number>("count")) ?? -1,
    revision: (await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId).first<number>("placement_revision")) ?? -1,
  };
}

function mutateBeforeCommandBatch(db: D1Database, mutate: () => Promise<unknown>): D1Database {
  let batches = 0;
  return new Proxy(db, {
    get(target, property) {
      if (property === "batch") return async (statements: D1PreparedStatement[]) => {
        batches += 1;
        if (batches === 2) await mutate();
        return target.batch(statements);
      };
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe.sequential("DuplicateEntry first slice", () => {
  it("copies planned canonical state immediately after the source and replays exactly once", async () => {
    const fixture = await seed();
    const otherTaskIds = [uuidv7(), uuidv7()];
    const otherEntryIds = [uuidv7(), uuidv7()];
    await env.APP_DB.batch([
      ...otherTaskIds.map((id, index) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, fixture.userId, `Trailing ${index}`, now)),
      env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
        lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 5, 'planned', 300, 120, ?)`)
        .bind(otherEntryIds[0], fixture.userId, otherTaskIds[0], fixture.dayId, fixture.sectionId, now),
      env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
        lifecycle_state, estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 6, 'completed', 300, 180, ?)`)
        .bind(otherEntryIds[1], fixture.userId, otherTaskIds[1], fixture.dayId, fixture.sectionId, now),
    ]);
    const request = requestFor(fixture);
    const first = await duplicateEntry(env.APP_DB, fixture.userId, request, now);
    expect(first).toMatchObject({ task_id: request.new_task_id, entry_id: request.new_entry_id, section_id: fixture.sectionId,
      position: 4, placement_revision: 1 });
    expect(await duplicateEntry(env.APP_DB, fixture.userId, request, now)).toEqual(first);
    expect(await env.APP_DB.prepare("SELECT title, project_id FROM tasks WHERE id = ?").bind(request.new_task_id).first())
      .toEqual({ title: "Copy me", project_id: fixture.projectId });
    expect((await env.APP_DB.prepare("SELECT id, position, estimate_seconds, planned_start_minute, routine_occurrence_id FROM entries WHERE taskchute_day_id = ? ORDER BY position")
      .bind(fixture.dayId).all()).results).toEqual([
      { id: fixture.entryId, position: 3, estimate_seconds: 900, planned_start_minute: 60, routine_occurrence_id: null },
      { id: request.new_entry_id, position: 4, estimate_seconds: 900, planned_start_minute: 60, routine_occurrence_id: null },
      expect.objectContaining({ position: 5 }),
      expect.objectContaining({ position: 6, planned_start_minute: 120 }),
      expect.objectContaining({ position: 7, planned_start_minute: 180 }),
    ]);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId)
      .first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND command_type = 'DuplicateEntry'")
      .bind(fixture.userId).first<number>("count")).toBe(1);
  });

  it("rejects stale and misuse without partial copy", async () => {
    const fixture = await seed();
    const request = requestFor(fixture);
    await duplicateEntry(env.APP_DB, fixture.userId, request, now);
    await expect(duplicateEntry(env.APP_DB, fixture.userId, { ...request, new_entry_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    await expect(duplicateEntry(env.APP_DB, fixture.userId, { ...request, operation_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE taskchute_day_id = ?").bind(fixture.dayId).first<number>("count")).toBe(3);
  });

  it("duplicates a Routine-derived source as an ordinary Entry without changing the source relation", async () => {
    const fixture = await seed();
    const routineId = uuidv7(); const occurrenceId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type, start_logical_date,
        default_section_id, default_estimate_seconds, default_planned_start_minute, materialization_order, defaults_revision, created_at)
        VALUES (?, ?, (SELECT task_id FROM entries WHERE id = ?), 'daily', '2026-09-02', ?, 900, 60,
          (SELECT COALESCE(MAX(materialization_order), 0) + 1 FROM routine_definitions WHERE app_user_id = ?), 0, ?)`)
        .bind(routineId, fixture.userId, fixture.entryId, fixture.sectionId, fixture.userId, now),
      env.APP_DB.prepare(`INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(occurrenceId, fixture.userId, routineId, fixture.dayId, now),
      env.APP_DB.prepare("UPDATE entries SET routine_occurrence_id = ? WHERE id = ?").bind(occurrenceId, fixture.entryId),
    ]);
    const request = requestFor(fixture);
    await duplicateEntry(env.APP_DB, fixture.userId, request, now);
    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id FROM entries WHERE id = ?").bind(fixture.entryId)
      .first<string>("routine_occurrence_id")).toBe(occurrenceId);
    expect(await env.APP_DB.prepare("SELECT routine_occurrence_id FROM entries WHERE id = ?").bind(request.new_entry_id)
      .first<string | null>("routine_occurrence_id")).toBeNull();
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE id = ?").bind(occurrenceId)
      .first<number>("count")).toBe(1);
  });

  it("allows an established future Day and rejects a logical-past Day without partial writes", async () => {
    const future = await seed();
    await env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-09-04',
      start_instant = '2026-09-04T00:00:00.000Z', end_instant = '2026-09-05T00:00:00.000Z' WHERE id = ?`)
      .bind(future.dayId).run();
    await duplicateEntry(env.APP_DB, future.userId, requestFor(future), now);

    const past = await seed();
    await env.APP_DB.prepare(`UPDATE taskchute_days SET logical_date = '2026-09-01',
      start_instant = '2026-09-01T00:00:00.000Z', end_instant = '2026-09-04T00:00:00.000Z' WHERE id = ?`)
      .bind(past.dayId).run();
    const before = await mutationCounts(past);
    await expect(duplicateEntry(env.APP_DB, past.userId, requestFor(past), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await mutationCounts(past)).toEqual({ ...before, operations: before.operations + 1 });
  });

  it("duplicates a Sectionなし source with no planned start immediately after the source", async () => {
    const fixture = await seed();
    await env.APP_DB.batch([
      env.APP_DB.prepare("UPDATE entries SET section_id = NULL, planned_start_minute = NULL WHERE taskchute_day_id = ?")
        .bind(fixture.dayId),
    ]);
    const request = requestFor(fixture);
    await expect(duplicateEntry(env.APP_DB, fixture.userId, request, now)).resolves.toMatchObject({
      section_id: null, position: 4, placement_revision: 1,
    });
    expect((await env.APP_DB.prepare(`SELECT id, section_id, planned_start_minute, position FROM entries
      WHERE taskchute_day_id = ? AND section_id IS NULL ORDER BY position`).bind(fixture.dayId).all()).results).toEqual([
      { id: fixture.entryId, section_id: null, planned_start_minute: null, position: 3 },
      { id: request.new_entry_id, section_id: null, planned_start_minute: null, position: 4 },
      expect.objectContaining({ section_id: null, planned_start_minute: null, position: 5 }),
    ]);
  });

  it.each(["running", "completed"] as const)("rejects a %s source without partial copy", async (state) => {
    const fixture = await seed();
    await env.APP_DB.prepare("UPDATE entries SET lifecycle_state = ? WHERE id = ?").bind(state, fixture.entryId).run();
    const before = await mutationCounts(fixture);
    await expect(duplicateEntry(env.APP_DB, fixture.userId, requestFor(fixture), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await mutationCounts(fixture)).toEqual({ ...before, operations: before.operations + 1 });
  });

  it("rejects cross-owner access and global identity collisions", async () => {
    const fixture = await seed(); const otherUserId = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUserId, now).run();
    await expect(duplicateEntry(env.APP_DB, otherUserId, requestFor(fixture), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const collidingTaskId = uuidv7();
    await env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Other owner', ?)")
      .bind(collidingTaskId, otherUserId, now).run();
    await expect(duplicateEntry(env.APP_DB, fixture.userId, { ...requestFor(fixture), new_task_id: collidingTaskId }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const entryCollision = requestFor(fixture); const before = await mutationCounts(fixture);
    await expect(duplicateEntry(env.APP_DB, fixture.userId, { ...entryCollision, new_entry_id: fixture.entryId }, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await mutationCounts(fixture)).toEqual({ ...before, operations: before.operations + 1 });
  });

  it("rejects invalid D-043 source state and mutation-time source changes", async () => {
    const invalid = await seed();
    await env.APP_DB.prepare("UPDATE entries SET planned_start_minute = 1440 WHERE id = ?").bind(invalid.entryId).run();
    await expect(duplicateEntry(env.APP_DB, invalid.userId, requestFor(invalid), now))
      .rejects.toMatchObject({ code: "resource_conflict" });

    const raced = await seed(); const request = requestFor(raced); const before = await mutationCounts(raced);
    const db = mutateBeforeCommandBatch(env.APP_DB, () => env.APP_DB.prepare("UPDATE entries SET lifecycle_state = 'running' WHERE id = ?")
      .bind(raced.entryId).run());
    await expect(duplicateEntry(db, raced.userId, request, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await mutationCounts(raced)).toEqual({ ...before, operations: before.operations + 1 });
  });

  it("rolls back an injected command failure and retries the exact operation", async () => {
    const fixture = await seed(); const request = requestFor(fixture); const before = await mutationCounts(fixture);
    await env.APP_DB.prepare(`CREATE TRIGGER fail_duplicate_entry BEFORE INSERT ON entries
      WHEN NEW.id = '${request.new_entry_id}' BEGIN SELECT RAISE(ABORT, 'injected Duplicate failure'); END`).run();
    await expect(duplicateEntry(env.APP_DB, fixture.userId, request, now))
      .rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await mutationCounts(fixture)).toEqual(before);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = ?").bind(request.new_task_id)
      .first<number>("count")).toBe(0);
    await env.APP_DB.prepare("DROP TRIGGER fail_duplicate_entry").run();
    expect(await duplicateEntry(env.APP_DB, fixture.userId, request, now)).toMatchObject({ placement_revision: 1 });
  });

  it("allows exactly one distinct concurrent Duplicate at the same revision", async () => {
    const fixture = await seed(); const candidates = [requestFor(fixture), requestFor(fixture)];
    const settled = await Promise.allSettled(candidates.map((request) => duplicateEntry(env.APP_DB, fixture.userId, request, now)));
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(fixture.dayId)
      .first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE taskchute_day_id = ?").bind(fixture.dayId)
      .first<number>("count")).toBe(3);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM placement_command_guards WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM transaction_assertions WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
  });
});
