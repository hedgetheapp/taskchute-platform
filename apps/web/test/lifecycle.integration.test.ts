import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { completeEntry, startEntry } from "../worker/application/entry-lifecycle";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { reorderEntries } from "../worker/application/reorder-entries";
import { uuidv7 } from "../src/shared/uuidv7";

const userId = uuidv7();
const otherUserId = uuidv7();
const dayId = uuidv7();
const sectionId = uuidv7();
const entryIds = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()];
const taskIds = entryIds.map(() => uuidv7());

async function revision(): Promise<number> {
  const value = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?").bind(dayId).first<number>("placement_revision");
  if (value === null) throw new Error("missing fixture day");
  return value;
}

function failingMutationBatch(db: D1Database): D1Database {
  let batches = 0;
  return new Proxy(db, {
    get(target, property) {
      if (property === "batch") return async (statements: D1PreparedStatement[]) => {
        batches += 1;
        if (batches === 2) throw new Error("injected unknown D1 failure");
        return target.batch(statements);
      };
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

beforeAll(async () => {
  const now = "2026-08-22T00:00:00.000Z";
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUserId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Lifecycle', 0, ?)").bind(sectionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
       establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-22', '2026-08-22T00:00:00.000Z', '2026-08-23T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, title, context_order) VALUES (?, ?, ?, 'Lifecycle', 0)`)
      .bind(userId, dayId, sectionId),
    ...taskIds.map((taskId, index) => env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(taskId, userId, `Lifecycle task ${index + 1}`, now)),
    ...entryIds.map((entryId, index) => env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)`)
      .bind(entryId, userId, taskIds[index], dayId, sectionId, index + 1, now)),
  ]);
});

describe.sequential("ordering and lifecycle increment", () => {
  it("reorders stable Entry IDs, increments once, replays, and updates Next", async () => {
    const request = { operation_id: uuidv7(), taskchute_day_id: dayId, section_id: sectionId,
      entry_ids: [entryIds[2], entryIds[0], entryIds[1], ...entryIds.slice(3)], expected_placement_revision: 0 };
    const first = await reorderEntries(env.APP_DB, userId, request);
    expect(await reorderEntries(env.APP_DB, userId, request)).toEqual(first);
    expect(first.placement_revision).toBe(1);
    await expect(reorderEntries(env.APP_DB, userId, { ...request, entry_ids: [...request.entry_ids].reverse() }))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    const rows = await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(userId, dayId, sectionId).all<{ id: string }>();
    expect(rows.results.map((row) => row.id)).toEqual(request.entry_ids);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-22T12:00:00.000Z")).next_entry?.id).toBe(entryIds[2]);
  });

  it("allows exactly one conflicting same-revision reorder and stores the winner's order", async () => {
    const expected = await revision();
    const current = (await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(userId, dayId, sectionId).all<{ id: string }>()).results.map((row) => row.id);
    const swapped = current.slice();
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    const candidates = [current.slice().reverse(), swapped];
    const settled = await Promise.allSettled(candidates.map((entry_ids) => reorderEntries(env.APP_DB, userId, {
      operation_id: uuidv7(), taskchute_day_id: dayId, section_id: sectionId, entry_ids, expected_placement_revision: expected,
    })));
    const winner = settled.find((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof reorderEntries>>> => item.status === "fulfilled");
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")).toHaveLength(1);
    const stored = (await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(userId, dayId, sectionId).all<{ id: string }>()).results.map((row) => row.id);
    expect(stored).toEqual(winner?.value.entry_ids);
    expect(await revision()).toBe(expected + 1);
  });

  it("rolls back an injected reorder failure and leaves no operation result", async () => {
    const expected = await revision();
    const before = (await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(userId, dayId, sectionId).all<{ id: string }>()).results.map((row) => row.id);
    const operation_id = uuidv7();
    await expect(reorderEntries(failingMutationBatch(env.APP_DB), userId, { operation_id, taskchute_day_id: dayId, section_id: sectionId,
      entry_ids: before.slice().reverse(), expected_placement_revision: expected })).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await revision()).toBe(expected);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(userId, operation_id).first<number>("count")).toBe(0);
  });

  it("replays an explicit stale Reorder conflict and rejects cross-owner Reorder without mutation", async () => {
    const currentRevision = await revision();
    const current = (await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(userId, dayId, sectionId).all<{ id: string }>()).results.map((row) => row.id);
    const stale = { operation_id: uuidv7(), taskchute_day_id: dayId, section_id: sectionId,
      entry_ids: current.slice().reverse(), expected_placement_revision: currentRevision - 1 };
    await expect(reorderEntries(env.APP_DB, userId, stale)).rejects.toMatchObject({ code: "revision_conflict" });
    await expect(reorderEntries(env.APP_DB, userId, stale)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT outcome_kind FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(userId, stale.operation_id).first<string>("outcome_kind")).toBe("revision_conflict");
    const crossOwner = { ...stale, operation_id: uuidv7(), expected_placement_revision: currentRevision };
    await expect(reorderEntries(env.APP_DB, otherUserId, crossOwner)).rejects.toMatchObject({ status: 404 });
    expect(await revision()).toBe(currentRevision);
    expect((await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(userId, dayId, sectionId).all<{ id: string }>()).results.map((row) => row.id)).toEqual(current);
  });

  it("reorders 64 Entries with a constant eight-statement mutation batch", async () => {
    const largeSectionId = uuidv7();
    const now = "2026-08-22T01:00:00.000Z";
    const largeEntries = Array.from({ length: 64 }, () => ({ taskId: uuidv7(), entryId: uuidv7() }));
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Large', 1, ?)")
        .bind(largeSectionId, userId, now),
      env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
        (app_user_id, taskchute_day_id, section_id, title, context_order) VALUES (?, ?, ?, 'Large', 1)`)
        .bind(userId, dayId, largeSectionId),
      ...largeEntries.flatMap(({ taskId, entryId }, index) => [
        env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
          .bind(taskId, userId, `Large task ${index + 1}`, now),
        env.APP_DB.prepare(`INSERT INTO entries
          (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)`)
          .bind(entryId, userId, taskId, dayId, largeSectionId, index + 1, now),
      ]),
    ]);
    const requested = largeEntries.map((item) => item.entryId).reverse();
    let batchCalls = 0;
    let mutationStatementCount = 0;
    const countingDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          batchCalls += 1;
          if (batchCalls === 2) mutationStatementCount = statements.length;
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const expectedRevision = await revision();
    const result = await reorderEntries(countingDb, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: largeSectionId, entry_ids: requested, expected_placement_revision: expectedRevision });
    expect(mutationStatementCount).toBe(8);
    expect(result.placement_revision).toBe(expectedRevision + 1);
    expect((await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(userId, dayId, largeSectionId).all<{ id: string }>()).results.map((row) => row.id)).toEqual(requested);
    expect(new Set(requested)).toEqual(new Set(largeEntries.map((item) => item.entryId)));
  });

  it("starts an explicit non-Next Entry without changing placement revision", async () => {
    const before = await revision();
    const next = (await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-22T12:00:00.000Z")).next_entry?.id;
    const entryId = entryIds.find((id) => id !== next)!;
    const request = { operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7() };
    const result = await startEntry(env.APP_DB, userId, request);
    expect(await startEntry(env.APP_DB, userId, request)).toEqual(result);
    await expect(startEntry(env.APP_DB, userId, { ...request, entry_id: entryIds.find((id) => id !== entryId)! }))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(result.execution.entry_id).toBe(entryId);
    expect(await revision()).toBe(before);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-22T12:00:00.000Z");
    expect(projection.active_execution?.id).toBe(request.execution_id);
    expect(projection.next_entry?.id).toBe(next);
  });

  it("enforces one active Execution in both command behavior and the database", async () => {
    await expect(startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryIds[0], execution_id: uuidv7() }))
      .rejects.toMatchObject({ status: 409, code: "resource_conflict" });
    await expect(env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, created_at)
      VALUES (?, ?, ?, ?, ?)` ).bind(uuidv7(), userId, entryIds[0], new Date().toISOString(), new Date().toISOString()).run()).rejects.toBeTruthy();
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND ended_at IS NULL")
      .bind(userId).first<number>("count")).toBe(1);
  });

  it("completes once, clears active state, preserves ended_at on replay, and keeps revision", async () => {
    const active = await env.APP_DB.prepare("SELECT id, entry_id FROM executions WHERE app_user_id = ? AND ended_at IS NULL").bind(userId).first<{ id: string; entry_id: string }>();
    if (!active) throw new Error("missing active fixture");
    const before = await revision();
    const request = { operation_id: uuidv7(), entry_id: active.entry_id, execution_id: active.id };
    const first = await completeEntry(env.APP_DB, userId, request);
    const replay = await completeEntry(env.APP_DB, userId, request);
    expect(replay).toEqual(first);
    await expect(completeEntry(env.APP_DB, userId, { ...request, execution_id: uuidv7() }))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(first.execution.ended_at).not.toBeNull();
    expect(await env.APP_DB.prepare("SELECT ended_at FROM executions WHERE id = ?").bind(active.id).first<string>("ended_at")).toBe(first.execution.ended_at);
    expect(await revision()).toBe(before);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-22T12:00:00.000Z")).active_execution).toBeNull();
    await expect(completeEntry(env.APP_DB, userId, { ...request, operation_id: uuidv7() }))
      .rejects.toMatchObject({ status: 409, code: "resource_conflict" });
    await expect(startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: request.entry_id, execution_id: uuidv7() }))
      .rejects.toMatchObject({ status: 409, code: "resource_conflict" });
  });

  it("converges synchronized same-operation Starts to one Execution and exact replay", async () => {
    const plannedEntry = await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND lifecycle_state = 'planned' ORDER BY position LIMIT 1")
      .bind(userId).first<string>("id");
    if (!plannedEntry) throw new Error("missing planned fixture");
    const request = { operation_id: uuidv7(), entry_id: plannedEntry, execution_id: uuidv7() };
    const [left, right] = await Promise.all([startEntry(env.APP_DB, userId, request), startEntry(env.APP_DB, userId, request)]);
    expect(left).toEqual(right);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE id = ?").bind(request.execution_id).first<number>("count")).toBe(1);
    await completeEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: request.entry_id, execution_id: request.execution_id });
  });

  it("keeps injected Start and Complete failures ambiguous and atomic", async () => {
    const plannedEntry = await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND lifecycle_state = 'planned' ORDER BY id LIMIT 1")
      .bind(userId).first<string>("id");
    if (!plannedEntry) throw new Error("missing planned fixture");
    const startRequest = { operation_id: uuidv7(), entry_id: plannedEntry, execution_id: uuidv7() };
    await expect(startEntry(failingMutationBatch(env.APP_DB), userId, startRequest)).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?").bind(startRequest.entry_id).first<string>("lifecycle_state")).toBe("planned");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE id = ?").bind(startRequest.execution_id).first<number>("count")).toBe(0);
    await startEntry(env.APP_DB, userId, startRequest);
    const completeRequest = { operation_id: uuidv7(), entry_id: startRequest.entry_id, execution_id: startRequest.execution_id };
    await expect(completeEntry(failingMutationBatch(env.APP_DB), userId, completeRequest)).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT ended_at FROM executions WHERE id = ?").bind(startRequest.execution_id).first<string | null>("ended_at")).toBeNull();
    await completeEntry(env.APP_DB, userId, completeRequest);
  });

  it("allows exactly one synchronized competing Start and converges same-operation Complete", async () => {
    const planned = (await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND lifecycle_state = 'planned' ORDER BY position LIMIT 2")
      .bind(userId).all<{ id: string }>()).results;
    expect(planned).toHaveLength(2);
    const starts = planned.map((row) => ({ operation_id: uuidv7(), entry_id: row.id, execution_id: uuidv7() }));
    const settled = await Promise.allSettled(starts.map((request) => startEntry(env.APP_DB, userId, request)));
    expect(settled.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((item) => item.status === "rejected")).toHaveLength(1);
    const winner = settled.find((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof startEntry>>> => item.status === "fulfilled")!.value;
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND ended_at IS NULL")
      .bind(userId).first<number>("count")).toBe(1);
    const completeRequest = { operation_id: uuidv7(), entry_id: winner.entry_id, execution_id: winner.execution.id };
    const completions = await Promise.all([completeEntry(env.APP_DB, userId, completeRequest), completeEntry(env.APP_DB, userId, completeRequest)]);
    expect(completions[0]).toEqual(completions[1]);
    expect(completions[0].execution.ended_at).not.toBeNull();
  });

  it("advances Next when the current Next starts and keeps the following Next after completion", async () => {
    const before = await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-22T12:00:00.000Z");
    const planned = before.sections.flatMap((section) => section.entries).filter((entry) => entry.lifecycle_state === "planned");
    expect(planned.length).toBeGreaterThanOrEqual(2);
    expect(before.next_entry?.id).toBe(planned[0].id);
    const executionId = uuidv7();
    await startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: planned[0].id, execution_id: executionId });
    const running = await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-22T12:00:00.000Z");
    expect(running.next_entry?.id).toBe(planned[1].id);
    await completeEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: planned[0].id, execution_id: executionId });
    const completed = await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-22T12:00:00.000Z");
    expect(completed.next_entry?.id).toBe(planned[1].id);
  });

  it("keeps one active Execution across the TaskChuteDay boundary and completes it from its stable identity", async () => {
    const priorDayEntry = await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND lifecycle_state = 'planned' ORDER BY position LIMIT 1")
      .bind(userId, dayId).first<string>("id");
    if (!priorDayEntry) throw new Error("missing prior-day planned Entry");
    const executionId = uuidv7();
    const started = await startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: priorDayEntry, execution_id: executionId });
    const nextDayInitial = await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-23T12:00:00.000Z");
    expect(nextDayInitial.taskchute_day.id).not.toBe(dayId);
    const nextTaskId = uuidv7();
    const nextEntryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Next-day planned', ?)")
        .bind(nextTaskId, userId, "2026-08-23T12:00:00.000Z"),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
        VALUES (?, ?, ?, ?, ?, 1, 'planned', ?)`)
        .bind(nextEntryId, userId, nextTaskId, nextDayInitial.taskchute_day.id, sectionId, "2026-08-23T12:00:00.000Z"),
    ]);
    const acrossBoundary = await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-23T12:00:00.000Z");
    expect(acrossBoundary.active_execution).toMatchObject({ ...started.execution, entry_estimate_seconds: null });
    expect(acrossBoundary.sections.flatMap((section) => section.entries).some((entry) => entry.id === priorDayEntry)).toBe(false);
    expect(acrossBoundary.next_entry?.id).toBe(nextEntryId);
    const executionCount = await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ?")
      .bind(userId).first<number>("count");
    const completed = await completeEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: priorDayEntry, execution_id: executionId });
    expect(completed.execution.started_at).toBe(started.execution.started_at);
    expect(completed.execution.ended_at).not.toBeNull();
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ?")
      .bind(userId).first<number>("count")).toBe(executionCount);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, userId, "2026-08-23T12:00:00.000Z")).next_entry?.id).toBe(nextEntryId);
  });

  it("rejects cross-owner lifecycle access and leaves transient guards empty", async () => {
    await expect(startEntry(env.APP_DB, otherUserId, { operation_id: uuidv7(), entry_id: entryIds[3], execution_id: uuidv7() }))
      .rejects.toMatchObject({ status: 404 });
    const historical = await env.APP_DB.prepare("SELECT id, entry_id FROM executions WHERE app_user_id = ? LIMIT 1")
      .bind(userId).first<{ id: string; entry_id: string }>();
    if (!historical) throw new Error("missing historical execution");
    await expect(completeEntry(env.APP_DB, otherUserId, { operation_id: uuidv7(), entry_id: historical.entry_id, execution_id: historical.id }))
      .rejects.toMatchObject({ status: 404 });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM lifecycle_command_guards").first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM placement_command_guards").first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM transaction_assertions").first<number>("count")).toBe(0);
    expect((await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).results).toHaveLength(0);
  });
});
