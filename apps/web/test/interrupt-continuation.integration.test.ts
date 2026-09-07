import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { interruptEntry } from "../worker/application/interrupt-entry";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-08-22T10:15:30.000Z";

async function fixture(targetMinute: number, targetSection: "morning" | "evening") {
  const userId = uuidv7();
  const dayId = uuidv7();
  const morningId = uuidv7();
  const eveningId = uuidv7();
  const configId = uuidv7();
  const modeId = uuidv7();
  const sourceTaskId = uuidv7();
  const targetTaskId = uuidv7();
  const sourceEntryId = uuidv7();
  const targetEntryId = uuidv7();
  const neighborEntryId = uuidv7();
  const sourceExecutionId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Morning', 0, ?)").bind(morningId, userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Evening', 1, ?)").bind(eveningId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)`)
      .bind(configId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Morning', 0, 720, 0), (?, ?, ?, 'Evening', 720, 1440, 1)`)
      .bind(userId, configId, morningId, userId, configId, eveningId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)").bind(userId, configId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone, establishment_boundary_minutes,
       establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-22', '2026-08-22T00:00:00.000Z', '2026-08-23T00:00:00.000Z', 'UTC', 0, 'compatible', 0, ?)`)
      .bind(dayId, userId, now),
    env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
       actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, 'Morning', 0, 720, '2026-08-22T00:00:00.000Z', '2026-08-22T12:00:00.000Z', 0),
             (?, ?, ?, ?, 'Evening', 720, 1440, '2026-08-22T12:00:00.000Z', '2026-08-23T00:00:00.000Z', 1)`)
      .bind(userId, dayId, morningId, configId, userId, dayId, eveningId, configId),
    env.APP_DB.prepare("INSERT INTO mode_definitions (id, app_user_id, title, created_at) VALUES (?, ?, 'Focused', ?)").bind(modeId, userId, now),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Source title', ?)").bind(sourceTaskId, userId, now),
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Target title', ?)").bind(targetTaskId, userId, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'running', 7200, 600, ?)`)
      .bind(sourceEntryId, userId, sourceTaskId, dayId, morningId, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, 2, 'planned', ?, ?)`)
      .bind(targetEntryId, userId, targetTaskId, dayId, targetSection === "morning" ? morningId : eveningId, targetMinute, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, planned_start_minute, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'planned', 615, ?)`)
      .bind(neighborEntryId, userId, targetTaskId, dayId, morningId, targetSection === "morning" ? 3 : 2, now),
    env.APP_DB.prepare("INSERT INTO entry_modes (app_user_id, entry_id, mode_id) VALUES (?, ?, ?)").bind(userId, sourceEntryId, modeId),
    env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
      VALUES (?, ?, ?, '2026-08-22T09:00:00.000Z', NULL, ?)`)
      .bind(sourceExecutionId, userId, sourceEntryId, now),
  ]);
  return { userId, dayId, morningId, eveningId, sourceEntryId, targetEntryId, neighborEntryId, sourceExecutionId, targetMinute };
}

function interruptRequest(ids: Awaited<ReturnType<typeof fixture>>) {
  return {
    operation_id: uuidv7(),
    taskchute_day_id: ids.dayId,
    source_entry_id: ids.sourceEntryId,
    active_execution_id: ids.sourceExecutionId,
    target_entry_id: ids.targetEntryId,
    target_execution_id: uuidv7(),
    continuation_entry_id: uuidv7(),
    expected_placement_revision: 0,
  };
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

describe.sequential("D-073 InterruptEntry / Continuation v0.1", () => {
  it("atomically interrupts A, starts B, and places a same-minute continuation directly after B", async () => {
    const fixture = await fixtureForTest(615, "morning");
    const request = interruptRequest(fixture);
    const result = await interruptEntry(env.APP_DB, fixture.userId, request, now);
    expect(result.continuation.planned_start_minute).toBe(615);
    expect(result.continuation.position).toBe(3);
    expect(result.continuation.estimate_seconds).toBe(2670);
    expect(await interruptEntry(env.APP_DB, fixture.userId, request, now)).toEqual(result);
    await expect(interruptEntry(env.APP_DB, fixture.userId, { ...request, target_execution_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?").bind(fixture.sourceEntryId).first<string>("lifecycle_state")).toBe("completed");
    expect(await env.APP_DB.prepare("SELECT terminal_outcome FROM executions WHERE id = ?").bind(fixture.sourceExecutionId).first<string>("terminal_outcome")).toBe("interrupted");
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?").bind(fixture.targetEntryId).first<string>("lifecycle_state")).toBe("running");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND ended_at IS NULL").bind(fixture.userId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT mode_id FROM entry_modes WHERE app_user_id = ? AND entry_id = ?").bind(fixture.userId, result.continuation_entry_id).first<string>("mode_id")).toBeTruthy();
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entry_task_snapshots WHERE app_user_id = ? AND entry_id = ?").bind(fixture.userId, fixture.sourceEntryId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT task_title FROM entry_task_snapshots WHERE app_user_id = ? AND entry_id = ?").bind(fixture.userId, fixture.targetEntryId).first<string>("task_title")).toBe("Target title");
    const rows = await env.APP_DB.prepare("SELECT id, position, planned_start_minute, lifecycle_state FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(fixture.userId, fixture.dayId, fixture.morningId).all<{ id: string; position: number; planned_start_minute: number | null; lifecycle_state: string }>();
    expect(rows.results.map((row) => row.id)).toEqual([fixture.sourceEntryId, fixture.targetEntryId, result.continuation_entry_id, fixture.neighborEntryId]);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, now);
    const source = projection.sections.flatMap((section) => section.entries).find((entry) => entry.id === fixture.sourceEntryId);
    expect(source?.execution_summary?.last_outcome).toBe("interrupted");
    expect(projection.active_execution?.entry_id).toBe(fixture.targetEntryId);
  });

  it("keeps a different-minute B in place and appends continuation to its interruption cohort", async () => {
    const fixture = await fixtureForTest(900, "evening");
    const request = interruptRequest(fixture);
    const result = await interruptEntry(env.APP_DB, fixture.userId, request, now);
    expect(result.continuation.position).toBe(3);
    expect(await env.APP_DB.prepare("SELECT position, planned_start_minute, section_id FROM entries WHERE id = ?").bind(fixture.targetEntryId)
      .first<{ position: number; planned_start_minute: number; section_id: string }>()).toMatchObject({ position: 2, planned_start_minute: 900, section_id: fixture.eveningId });
    const morning = await env.APP_DB.prepare("SELECT id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? ORDER BY position")
      .bind(fixture.userId, fixture.dayId, fixture.morningId).all<{ id: string; position: number }>();
    expect(morning.results.map((row) => row.id)).toEqual([fixture.sourceEntryId, fixture.neighborEntryId, result.continuation_entry_id]);
  });

  it("rejects stale placement or active identity without writing lifecycle facts", async () => {
    const fixture = await fixtureForTest(615, "morning");
    const request = { ...interruptRequest(fixture), expected_placement_revision: 1 };
    await expect(interruptEntry(env.APP_DB, fixture.userId, request, now)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id IN (?, ?) ORDER BY id").bind(fixture.sourceEntryId, fixture.targetEntryId).all<{ lifecycle_state: string }>()
      .then((result) => result.results.every((row) => row.lifecycle_state === "running" || row.lifecycle_state === "planned"))).toBe(true);
    const staleActive = { ...interruptRequest(fixture), active_execution_id: uuidv7() };
    await expect(interruptEntry(env.APP_DB, fixture.userId, staleActive, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND ended_at IS NULL").bind(fixture.userId).first<number>("count")).toBe(1);
  });

  it("keeps an injected D1 failure ambiguous and leaves no partial Interrupt", async () => {
    const fixture = await fixtureForTest(615, "morning");
    const request = interruptRequest(fixture);
    await expect(interruptEntry(failingMutationBatch(env.APP_DB), fixture.userId, request, now))
      .rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?").bind(fixture.sourceEntryId).first<string>("lifecycle_state")).toBe("running");
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?").bind(fixture.targetEntryId).first<string>("lifecycle_state")).toBe("planned");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND id = ?").bind(fixture.userId, request.target_execution_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND id = ?").bind(fixture.userId, request.continuation_entry_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?").bind(fixture.userId, request.operation_id).first<number>("count")).toBe(0);
  });
});

async function fixtureForTest(targetMinute: number, targetSection: "morning" | "evening") {
  return fixture(targetMinute, targetSection);
}
