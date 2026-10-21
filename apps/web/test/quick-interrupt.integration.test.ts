import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { completeEntry } from "../worker/application/entry-lifecycle";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { quickInterruptEntry } from "../worker/application/quick-interrupt-entry";
import { updateTaskMetadata } from "../worker/application/task-metadata";
import { uuidv7 } from "../src/shared/uuidv7";
import type { QuickInterruptEntryRequest } from "../src/shared/contracts";

const now = "2026-08-22T10:15:30.000Z";

async function fixture() {
  const userId = uuidv7();
  const dayId = uuidv7();
  const morningId = uuidv7();
  const eveningId = uuidv7();
  const configId = uuidv7();
  const modeId = uuidv7();
  const sourceTaskId = uuidv7();
  const neighborTaskId = uuidv7();
  const sourceEntryId = uuidv7();
  const neighborEntryId = uuidv7();
  const sourceExecutionId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Morning', 0, ?)").bind(morningId, userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Evening', 1, ?)").bind(eveningId, userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)").bind(configId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Morning', 0, 720, 0), (?, ?, ?, 'Evening', 720, 1440, 1)`)
      .bind(userId, configId, morningId, userId, configId, eveningId),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)").bind(userId, configId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
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
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Neighbor', ?)").bind(neighborTaskId, userId, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, created_at, planned_start_minute)
      VALUES (?, ?, ?, ?, ?, 1, 'running', 7200, ?, 600)`)
      .bind(sourceEntryId, userId, sourceTaskId, dayId, morningId, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at, planned_start_minute)
      VALUES (?, ?, ?, ?, ?, 2, 'planned', ?, 615)`)
      .bind(neighborEntryId, userId, neighborTaskId, dayId, morningId, now),
    env.APP_DB.prepare("INSERT INTO entry_modes (app_user_id, entry_id, mode_id) VALUES (?, ?, ?)").bind(userId, sourceEntryId, modeId),
    env.APP_DB.prepare(`INSERT INTO entry_task_snapshots (app_user_id, entry_id, task_id, task_title, captured_at)
      VALUES (?, ?, ?, 'Source snapshot', ?)`)
      .bind(userId, sourceEntryId, sourceTaskId, now),
    env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
      VALUES (?, ?, ?, '2026-08-22T09:00:00.000Z', NULL, ?, NULL)`)
      .bind(sourceExecutionId, userId, sourceEntryId, now),
  ]);
  return { userId, dayId, morningId, eveningId, modeId, sourceTaskId, sourceEntryId,
    neighborEntryId, sourceExecutionId, sourceStartedAt: "2026-08-22T09:00:00.000Z" };
}

function quickRequest(ids: Awaited<ReturnType<typeof fixture>>, revision = 0): QuickInterruptEntryRequest {
  return {
    operation_id: uuidv7(), taskchute_day_id: ids.dayId, source_entry_id: ids.sourceEntryId,
    active_execution_id: ids.sourceExecutionId, quick_task_id: uuidv7(), target_entry_id: uuidv7(),
    target_execution_id: uuidv7(), continuation_entry_id: uuidv7(), expected_placement_revision: revision,
  };
}

describe.sequential("D-181 QuickInterruptEntry", () => {
  it("atomically creates a metadata-free Quick Task, preserves source chain, and replays exactly", async () => {
    const ids = await fixture();
    const request = quickRequest(ids);
    const result = await quickInterruptEntry(env.APP_DB, ids.userId, request, now);
    expect(result).toMatchObject({
      taskchute_day_id: ids.dayId,
      source_entry_id: ids.sourceEntryId,
      quick_task_id: request.quick_task_id,
      target_entry_id: request.target_entry_id,
      target_execution_id: request.target_execution_id,
      continuation_entry_id: request.continuation_entry_id,
      quick_interrupt_origin: "quick_interrupt",
      section_id: ids.morningId,
      placement_revision: 1,
      interruption_instant: now,
      continuation: {
        entry_id: request.continuation_entry_id,
        task_id: ids.sourceTaskId,
        section_id: ids.morningId,
        position: 4,
        planned_start_minute: null,
        estimate_seconds: 2670,
      },
      source_execution: { id: ids.sourceExecutionId, entry_id: ids.sourceEntryId, outcome: "interrupted" },
      target_execution: { id: request.target_execution_id, entry_id: request.target_entry_id, ended_at: null },
    });

    expect(await quickInterruptEntry(env.APP_DB, ids.userId, request, now)).toEqual(result);
    await expect(quickInterruptEntry(env.APP_DB, ids.userId, { ...request, quick_task_id: uuidv7() }, now))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare("SELECT title, project_id, quick_interrupt_origin FROM tasks WHERE id = ?")
      .bind(request.quick_task_id).first()).toEqual({ title: "（割込）", project_id: null, quick_interrupt_origin: "quick_interrupt" });
    expect(await env.APP_DB.prepare(`SELECT lifecycle_state, section_id, estimate_seconds, planned_start_minute,
        start_reminder_offset_minutes, notify_on_estimate_overrun FROM entries WHERE id = ?`)
      .bind(request.target_entry_id).first()).toEqual({
      lifecycle_state: "running", section_id: ids.morningId, estimate_seconds: null, planned_start_minute: null,
      start_reminder_offset_minutes: null, notify_on_estimate_overrun: 0,
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entry_modes WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, request.target_entry_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT project_id, project_title FROM entry_project_snapshots WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, request.target_entry_id).first()).toEqual({ project_id: null, project_title: null });
    expect(await env.APP_DB.prepare("SELECT task_title FROM entry_task_snapshots WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, request.target_entry_id).first<string>("task_title")).toBe("（割込）");
    expect(await env.APP_DB.prepare("SELECT mode_id FROM entry_modes WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, request.continuation_entry_id).first<string>("mode_id")).toBe(ids.modeId);
    expect(await env.APP_DB.prepare(`SELECT continuation_chain_id, continuation_parent_entry_id FROM entries WHERE id = ?`)
      .bind(request.continuation_entry_id).first()).toEqual({
      continuation_chain_id: (await env.APP_DB.prepare("SELECT continuation_chain_id FROM entries WHERE id = ?")
        .bind(ids.sourceEntryId).first<string>("continuation_chain_id")),
      continuation_parent_entry_id: ids.sourceEntryId,
    });
    expect(await env.APP_DB.prepare("SELECT terminal_outcome, ended_at FROM executions WHERE id = ?")
      .bind(ids.sourceExecutionId).first()).toEqual({ terminal_outcome: "interrupted", ended_at: now });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(ids.sourceEntryId).first<string>("lifecycle_state")).toBe("completed");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND ended_at IS NULL")
      .bind(ids.userId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT target_entry_id, continuation_entry_id FROM quick_interrupt_entry_pairs
      WHERE app_user_id = ?`).bind(ids.userId).all()).toMatchObject({ results: [{
      target_entry_id: request.target_entry_id, continuation_entry_id: request.continuation_entry_id,
    }] });

    const projection = await loadCurrentTaskChuteDay(env.APP_DB, ids.userId, now);
    const section = projection.sections.find((candidate) => candidate.id === ids.morningId);
    const entries = section?.entries ?? [];
    expect(entries.slice(0, 4).map((entry) => entry.id)).toEqual([
      ids.sourceEntryId, request.target_entry_id, request.continuation_entry_id, ids.neighborEntryId,
    ]);
    expect(section?.display_entry_order?.slice(0, 4)).toEqual([
      ids.sourceEntryId, request.target_entry_id, request.continuation_entry_id, ids.neighborEntryId,
    ]);
    expect(entries.find((entry) => entry.id === request.continuation_entry_id))
      .toMatchObject({ quick_interrupt_target_entry_id: request.target_entry_id, lifecycle_state: "planned" });
    expect(entries.find((entry) => entry.id === request.target_entry_id)).toMatchObject({
      task: { title: "（割込）" }, lifecycle_state: "running", quick_interrupt_origin: true,
    });

    const renamed = await updateTaskMetadata(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), entry_id: request.target_entry_id, task_id: request.quick_task_id,
      expected_title: "（割込）", expected_project_id: null, title: "Phone call", project_id: null,
    }, now);
    expect(renamed.title).toBe("Phone call");
    const renamedProjection = await loadCurrentTaskChuteDay(env.APP_DB, ids.userId, now);
    expect(renamedProjection.sections.flatMap((section) => section.entries).find((entry) => entry.id === request.target_entry_id))
      .toMatchObject({ task: { title: "Phone call" }, quick_interrupt_origin: true });
    expect(renamedProjection.sections.find((candidate) => candidate.id === ids.morningId)?.display_entry_order)
      .toContain(request.continuation_entry_id);
    expect(await env.APP_DB.prepare("SELECT quick_interrupt_origin FROM tasks WHERE id = ?")
      .bind(request.quick_task_id).first<string>("quick_interrupt_origin")).toBe("quick_interrupt");
    expect(await env.APP_DB.prepare("SELECT task_title FROM entry_task_snapshots WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, request.target_entry_id).first<string>("task_title")).toBe("（割込）");

    await completeEntry(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), entry_id: request.target_entry_id, execution_id: request.target_execution_id,
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND ended_at IS NULL")
      .bind(ids.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(request.continuation_entry_id).first<string>("lifecycle_state")).toBe("planned");
    expect(await env.APP_DB.prepare("SELECT title, quick_interrupt_origin FROM tasks WHERE id = ?")
      .bind(request.quick_task_id).first()).toEqual({ title: "Phone call", quick_interrupt_origin: "quick_interrupt" });
    const completedProjection = await loadCurrentTaskChuteDay(env.APP_DB, ids.userId, now);
    const completedDisplayOrder = completedProjection.sections.find((candidate) => candidate.id === ids.morningId)?.display_entry_order ?? [];
    expect(completedDisplayOrder.indexOf(request.continuation_entry_id))
      .toBe(completedDisplayOrder.indexOf(request.target_entry_id) + 1);
  });

  it("supports repeated Quick Interrupts with separate chains and newest-first planned continuations", async () => {
    const ids = await fixture();
    const first = quickRequest(ids);
    const firstResult = await quickInterruptEntry(env.APP_DB, ids.userId, first, now);
    const second: QuickInterruptEntryRequest = {
      ...quickRequest(ids, 1), source_entry_id: first.target_entry_id,
      active_execution_id: first.target_execution_id,
    };
    const secondResult = await quickInterruptEntry(env.APP_DB, ids.userId, second, "2026-08-22T10:30:00.000Z");
    expect(secondResult.continuation).toMatchObject({ task_id: first.quick_task_id, planned_start_minute: null });
    const planned = await env.APP_DB.prepare(`SELECT id, task_id, continuation_chain_id, continuation_parent_entry_id, position
      FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ? AND lifecycle_state = 'planned'
      ORDER BY planned_start_minute IS NOT NULL, planned_start_minute, position`)
      .bind(ids.userId, ids.dayId, ids.morningId).all<{ id: string; task_id: string; continuation_chain_id: string; continuation_parent_entry_id: string | null; position: number }>();
    expect(planned.results.slice(0, 2).map((entry) => entry.id)).toEqual([
      secondResult.continuation_entry_id, firstResult.continuation_entry_id,
    ]);
    const firstChain = await env.APP_DB.prepare("SELECT continuation_chain_id FROM entries WHERE id = ?")
      .bind(firstResult.continuation_entry_id).first<string>("continuation_chain_id");
    const secondChain = await env.APP_DB.prepare("SELECT continuation_chain_id FROM entries WHERE id = ?")
      .bind(secondResult.continuation_entry_id).first<string>("continuation_chain_id");
    expect(firstChain).not.toBe(secondChain);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND ended_at IS NULL")
      .bind(ids.userId).first<number>("count")).toBe(1);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, ids.userId, "2026-08-22T10:30:00.000Z");
    const section = projection.sections.find((candidate) => candidate.id === ids.morningId)!;
    expect(section.entries.map((entry) => entry.id)).toEqual([
      ids.sourceEntryId, first.target_entry_id, second.target_entry_id,
      second.continuation_entry_id, first.continuation_entry_id, ids.neighborEntryId,
    ]);
    expect(section.display_entry_order).toEqual([
      ids.sourceEntryId, first.target_entry_id, first.continuation_entry_id,
      second.target_entry_id, second.continuation_entry_id, ids.neighborEntryId,
    ]);
    expect(section.entries.find((entry) => entry.id === first.continuation_entry_id)?.quick_interrupt_target_entry_id)
      .toBe(first.target_entry_id);
    expect(section.entries.find((entry) => entry.id === second.continuation_entry_id)?.quick_interrupt_target_entry_id)
      .toBe(second.target_entry_id);
  });

  it("converges concurrent exact retries to one Quick Task and rejects stale, duplicate, ambiguous, and cross-owner inputs", async () => {
    const ids = await fixture();
    const staleRevision = quickRequest(ids, 99);
    await expect(quickInterruptEntry(env.APP_DB, ids.userId, staleRevision, now)).rejects.toMatchObject({ code: "revision_conflict" });
    const staleExecution = { ...quickRequest(ids), active_execution_id: uuidv7() };
    await expect(quickInterruptEntry(env.APP_DB, ids.userId, staleExecution, now)).rejects.toMatchObject({ code: "resource_conflict" });
    const duplicateIds = await fixture();
    const duplicateTaskId = { ...quickRequest(duplicateIds), quick_task_id: duplicateIds.sourceTaskId };
    await expect(quickInterruptEntry(env.APP_DB, duplicateIds.userId, duplicateTaskId, now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const otherUser = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUser, now).run();
    await expect(quickInterruptEntry(env.APP_DB, otherUser, quickRequest(ids), now))
      .rejects.toMatchObject({ code: "resource_not_found" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(ids.sourceEntryId).first<string>("lifecycle_state")).toBe("running");

    const request = quickRequest(ids);
    const [left, right] = await Promise.all([
      quickInterruptEntry(env.APP_DB, ids.userId, request, now),
      quickInterruptEntry(env.APP_DB, ids.userId, request, now),
    ]);
    expect(left).toEqual(right);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = ?")
      .bind(request.quick_task_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM quick_interrupt_entry_pairs
      WHERE app_user_id = ? AND target_entry_id = ? AND continuation_entry_id = ?`)
      .bind(ids.userId, request.target_entry_id, request.continuation_entry_id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(ids.sourceEntryId).first<string>("lifecycle_state")).toBe("completed");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND ended_at IS NULL")
      .bind(ids.userId).first<number>("count")).toBe(1);
  });

  it("fails closed on ambiguous current Sections and rolls back a mid-batch failure", async () => {
    const ambiguous = await fixture();
    await env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts SET actual_start_instant = '2026-08-22T10:00:00.000Z'
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
      .bind(ambiguous.userId, ambiguous.dayId, ambiguous.eveningId).run();
    await expect(quickInterruptEntry(env.APP_DB, ambiguous.userId, quickRequest(ambiguous), now))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(ambiguous.sourceEntryId).first<string>("lifecycle_state")).toBe("running");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE app_user_id = ? AND quick_interrupt_origin IS NOT NULL")
      .bind(ambiguous.userId).first<number>("count")).toBe(0);

    const failing = await fixture();
    const request = quickRequest(failing);
    await env.APP_DB.prepare(`CREATE TRIGGER d181_injected_quick_interrupt_failure BEFORE INSERT ON entries
      WHEN NEW.id = '${request.continuation_entry_id}' BEGIN SELECT RAISE(ABORT, 'injected_failure'); END`).run();
    await expect(quickInterruptEntry(env.APP_DB, failing.userId, request, now))
      .rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE id = ?")
      .bind(failing.sourceEntryId).first<string>("lifecycle_state")).toBe("running");
    expect(await env.APP_DB.prepare("SELECT terminal_outcome, ended_at FROM executions WHERE id = ?")
      .bind(failing.sourceExecutionId).first()).toEqual({ terminal_outcome: null, ended_at: null });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(failing.dayId).first<number>("placement_revision")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = ?")
      .bind(request.quick_task_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM quick_interrupt_entry_pairs WHERE app_user_id = ?")
      .bind(failing.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE id IN (?, ?)")
      .bind(request.target_entry_id, request.continuation_entry_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(failing.userId, request.operation_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM quick_interrupt_command_guards WHERE app_user_id = ?")
      .bind(failing.userId).first<number>("count")).toBe(0);
  });
});
