import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { completeEntry, startEntry } from "../worker/application/entry-lifecycle";
import { deleteInterruptionEntry, isDeleteInterruptionEntryRequest } from "../worker/application/delete-interruption-entry";
import { interruptEntry } from "../worker/application/interrupt-entry";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { quickInterruptEntry } from "../worker/application/quick-interrupt-entry";
import { readContinuationChainEstimate } from "../worker/application/continuation-lineage";
import { loadReviewDateMetrics, reviewDateMetricRange } from "../worker/application/review-date-metrics";
import { updateTaskMetadata } from "../worker/application/task-metadata";
import worker from "../worker";
import { uuidv7 } from "../src/shared/uuidv7";
import type { QuickInterruptEntryRequest } from "../src/shared/contracts";

const now = "2026-08-22T10:15:30.000Z";

async function fixture(existingUserId?: string) {
  const userId = existingUserId ?? uuidv7();
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
    ...(existingUserId ? [] : [
      env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
      env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    ]),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Morning', ?, ?)")
      .bind(morningId, userId, existingUserId ? 1 : 0, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Evening', ?, ?)")
      .bind(eveningId, userId, existingUserId ? 2 : 1, now),
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

function interruptionDeleteRequest(ids: Awaited<ReturnType<typeof fixture>>, entryId: string, revision: number) {
  return {
    operation_id: uuidv7(), taskchute_day_id: ids.dayId, entry_id: entryId,
    expected_placement_revision: revision, confirmed: true as const,
  };
}

class AuthenticatedWorkerSession {
  private readonly cookies = new Map<string, string>();

  async post(path: string, body: object, headers: HeadersInit = {}): Promise<Response> {
    const requestHeaders = new Headers({ origin: "https://taskchute.test", "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) });
    if (this.cookies.size > 0) requestHeaders.set("cookie", Array.from(this.cookies.entries(), ([name, value]) => `${name}=${value}`).join("; "));
    const response = await worker.fetch(new Request(`https://taskchute.test${path}`, {
      method: "POST", headers: requestHeaders, body: JSON.stringify(body),
    }), env as Env);
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
    return response;
  }
}

async function authenticatedFixtureOwner(): Promise<{ userId: string; session: AuthenticatedWorkerSession }> {
  const session = new AuthenticatedWorkerSession();
  const email = `d182-${uuidv7()}@example.test`;
  const password = "fixture-password-1234";
  const bootstrap = await session.post("/api/internal/bootstrap", {
    email, password, name: "D-182 runtime fixture", timezone: "UTC", day_boundary_minutes: 0, sections: ["Fixture"],
  }, { "x-taskchute-bootstrap-token": "fixture-only-bootstrap-token" });
  if (!bootstrap.ok) throw new Error("D-182 test fixture bootstrap failed");
  const { app_user_id: userId } = await bootstrap.json() as { app_user_id: string };
  const signIn = await session.post("/api/auth/sign-in/email", { email, password });
  if (!signIn.ok) throw new Error("D-182 test fixture sign-in failed");
  return { userId, session };
}

async function makeMissingRootChain(
  ids: Awaited<ReturnType<typeof fixture>>,
  lifecycle: "running" | "completed" = "running",
): Promise<string> {
  const missingRootId = uuidv7();
  await env.APP_DB.prepare(`UPDATE entries
    SET lifecycle_state = ?, continuation_chain_id = ?, continuation_parent_entry_id = ?
    WHERE app_user_id = ? AND id = ?`)
    .bind(lifecycle, missingRootId, missingRootId, ids.userId, ids.sourceEntryId).run();
  if (lifecycle === "completed") {
    await env.APP_DB.prepare(`UPDATE executions SET ended_at = ?, terminal_outcome = 'interrupted'
      WHERE app_user_id = ? AND id = ?`)
      .bind("2026-08-22T10:00:00.000Z", ids.userId, ids.sourceExecutionId).run();
  }
  return missingRootId;
}

function stableDbRow(value: Record<string, unknown>): string {
  return JSON.stringify(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

async function ownerDomainSnapshot(appUserId: string): Promise<Record<string, string[]>> {
  const tableResult = await env.APP_DB.prepare(`SELECT name, sql FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all<{ name: string; sql: string | null }>();
  const snapshot: Record<string, string[]> = {};
  for (const { name, sql } of tableResult.results) {
    if (name === "operations") continue;
    if (!/\bapp_user_id\b/i.test(sql ?? "")) continue;
    const quotedName = `"${name.replaceAll('"', '""')}"`;
    const rows = await env.APP_DB.prepare(`SELECT * FROM ${quotedName} WHERE app_user_id = ?`)
      .bind(appUserId).all<Record<string, unknown>>();
    snapshot[name] = rows.results.map(stableDbRow).sort();
  }
  const account = await env.APP_DB.prepare("SELECT * FROM app_users WHERE id = ?")
    .bind(appUserId).first<Record<string, unknown>>();
  snapshot.app_users = account ? [stableDbRow(account)] : [];
  return snapshot;
}

async function ownerOperationsSnapshot(appUserId: string): Promise<string[]> {
  const rows = await env.APP_DB.prepare("SELECT * FROM operations WHERE app_user_id = ?")
    .bind(appUserId).all<Record<string, unknown>>();
  return rows.results.map(stableDbRow).sort();
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

describe.sequential("D-182 interruption hard delete", () => {
  it("persists and replays the orphan rejection through the authenticated Worker route", async () => {
    const owner = await authenticatedFixtureOwner();
    const ids = await fixture(owner.userId);
    await makeMissingRootChain(ids, "completed");
    const request = interruptionDeleteRequest(ids, ids.sourceEntryId, 0);
    const domainBefore = await ownerDomainSnapshot(ids.userId);
    const operationsBefore = await ownerOperationsSnapshot(ids.userId);
    const path = `/api/v1/entries/${ids.sourceEntryId}/delete-interruption`;

    const first = await owner.session.post(path, request);
    const firstBody = await first.json() as { error: { code: string } };
    expect(first.status).toBe(409);
    expect(firstBody.error.code).toBe("resource_conflict");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ids.userId, request.operation_id).first<number>("count")).toBe(1);
    expect((await ownerOperationsSnapshot(ids.userId)).filter((row) => !row.includes(request.operation_id)))
      .toEqual(operationsBefore);
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(domainBefore);

    const replay = await owner.session.post(path, request);
    expect(replay.status).toBe(first.status);
    expect(await replay.json()).toEqual(firstBody);
    const misuse = await owner.session.post(path, { ...request, expected_placement_revision: 1 });
    expect(misuse.status).toBe(409);
    expect(await misuse.json()).toMatchObject({ error: { code: "operation_id_misuse" } });
    const malformed = await owner.session.post(path, { ...request, operation_id: uuidv7(), extra: true });
    expect(malformed.status).toBe(400);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ids.userId, request.operation_id).first<number>("count")).toBe(1);
    expect((await ownerOperationsSnapshot(ids.userId)).filter((row) => !row.includes(request.operation_id)))
      .toEqual(operationsBefore);
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(domainBefore);
  });

  it("records one owner-scoped orphan rejection, replays it exactly, and rejects operation ID misuse without Domain writes", async () => {
    const ids = await fixture();
    await makeMissingRootChain(ids, "completed");
    const priorOperationId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      VALUES (?, ?, 'CompleteEntry', 1, 'prior-fingerprint', 'success', '{}', ?)`)
      .bind(ids.userId, priorOperationId, now).run();

    const request = interruptionDeleteRequest(ids, ids.sourceEntryId, 0);
    const domainBefore = await ownerDomainSnapshot(ids.userId);
    const operationsBefore = await ownerOperationsSnapshot(ids.userId);
    await expect(deleteInterruptionEntry(env.APP_DB, ids.userId, request, now))
      .rejects.toMatchObject({ status: 409, code: "resource_conflict" });

    const rejection = await env.APP_DB.prepare(`SELECT app_user_id, operation_id, command_type,
      request_fingerprint_version, request_fingerprint, outcome_kind, result_json
      FROM operations WHERE app_user_id = ? AND operation_id = ?`)
      .bind(ids.userId, request.operation_id).first<Record<string, unknown>>();
    expect(rejection).toMatchObject({
      app_user_id: ids.userId, operation_id: request.operation_id, command_type: "DeleteInterruptionEntry",
      request_fingerprint_version: 1, outcome_kind: "domain_rejection",
      result_json: JSON.stringify({ code: "resource_conflict", message: "The interruption chain has missing or inconsistent ancestry" }),
    });
    expect(typeof rejection?.request_fingerprint).toBe("string");
    expect((await ownerOperationsSnapshot(ids.userId)).filter((row) => !row.includes(request.operation_id)))
      .toEqual(operationsBefore);
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(domainBefore);

    await expect(deleteInterruptionEntry(env.APP_DB, ids.userId, request, now))
      .rejects.toMatchObject({ status: 409, code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ids.userId, request.operation_id).first<number>("count")).toBe(1);
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(domainBefore);

    await expect(deleteInterruptionEntry(env.APP_DB, ids.userId,
      { ...request, expected_placement_revision: 1 }, now))
      .rejects.toMatchObject({ status: 409, code: "operation_id_misuse" });
    const wrongCommand = { ...quickRequest(ids), operation_id: request.operation_id };
    await expect(quickInterruptEntry(env.APP_DB, ids.userId, wrongCommand, now))
      .rejects.toMatchObject({ status: 409, code: "operation_id_misuse" });
    expect((await ownerOperationsSnapshot(ids.userId)).filter((row) => !row.includes(request.operation_id)))
      .toEqual(operationsBefore);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ids.userId, request.operation_id).first<number>("count")).toBe(1);
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(domainBefore);
  });

  it("rejects normal and Quick Interrupt on a missing-root chain without changing Domain state", async () => {
    const normalIds = await fixture();
    await makeMissingRootChain(normalIds);
    const normalRequest = {
      operation_id: uuidv7(), taskchute_day_id: normalIds.dayId, source_entry_id: normalIds.sourceEntryId,
      active_execution_id: normalIds.sourceExecutionId, target_entry_id: normalIds.neighborEntryId,
      target_execution_id: uuidv7(), continuation_entry_id: uuidv7(), expected_placement_revision: 0,
    };
    const normalDomainBefore = await ownerDomainSnapshot(normalIds.userId);
    const normalOperationsBefore = await ownerOperationsSnapshot(normalIds.userId);
    await expect(interruptEntry(env.APP_DB, normalIds.userId, normalRequest, now))
      .rejects.toMatchObject({ status: 409, code: "resource_conflict" });
    expect((await ownerOperationsSnapshot(normalIds.userId)).filter((row) => !row.includes(normalRequest.operation_id)))
      .toEqual(normalOperationsBefore);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(normalIds.userId, normalRequest.operation_id).first<number>("count")).toBe(1);
    expect(await ownerDomainSnapshot(normalIds.userId)).toEqual(normalDomainBefore);

    const quickIds = await fixture();
    await makeMissingRootChain(quickIds);
    const quick = quickRequest(quickIds);
    const quickDomainBefore = await ownerDomainSnapshot(quickIds.userId);
    const quickOperationsBefore = await ownerOperationsSnapshot(quickIds.userId);
    await expect(quickInterruptEntry(env.APP_DB, quickIds.userId, quick, now))
      .rejects.toMatchObject({ status: 409, code: "resource_conflict" });
    expect((await ownerOperationsSnapshot(quickIds.userId)).filter((row) => !row.includes(quick.operation_id)))
      .toEqual(quickOperationsBefore);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(quickIds.userId, quick.operation_id).first<number>("count")).toBe(1);
    expect(await ownerDomainSnapshot(quickIds.userId)).toEqual(quickDomainBefore);
  });

  it("converges concurrent orphan rejections to one immutable ledger row", async () => {
    const ids = await fixture();
    await makeMissingRootChain(ids, "completed");
    const request = interruptionDeleteRequest(ids, ids.sourceEntryId, 0);
    const domainBefore = await ownerDomainSnapshot(ids.userId);
    const [left, right] = await Promise.all([
      deleteInterruptionEntry(env.APP_DB, ids.userId, request, now).then(() => null, (error: unknown) => error),
      deleteInterruptionEntry(env.APP_DB, ids.userId, request, now).then(() => null, (error: unknown) => error),
    ]);
    expect(left).toMatchObject({ status: 409, code: "resource_conflict" });
    expect(right).toMatchObject({ status: 409, code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ids.userId, request.operation_id).first<number>("count")).toBe(1);
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(domainBefore);
  });

  it("keeps owner isolation and rejects malformed and unauthenticated requests without protected writes", async () => {
    const ids = await fixture();
    await makeMissingRootChain(ids, "completed");
    const request = interruptionDeleteRequest(ids, ids.sourceEntryId, 0);
    const otherUserId = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUserId, now).run();
    const protectedDomainBefore = await ownerDomainSnapshot(ids.userId);
    const protectedOperationsBefore = await ownerOperationsSnapshot(ids.userId);

    await expect(deleteInterruptionEntry(env.APP_DB, otherUserId, request, now))
      .rejects.toMatchObject({ status: 404, code: "resource_not_found" });
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(protectedDomainBefore);
    expect(await ownerOperationsSnapshot(ids.userId)).toEqual(protectedOperationsBefore);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ids.userId, request.operation_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT app_user_id, outcome_kind FROM operations WHERE operation_id = ?")
      .bind(request.operation_id).first()).toEqual({ app_user_id: otherUserId, outcome_kind: "domain_rejection" });

    const unauthenticatedOperationId = uuidv7();
    const unauthenticated = await worker.fetch(new Request(
      `https://taskchute.test/api/v1/entries/${ids.sourceEntryId}/delete-interruption`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, operation_id: unauthenticatedOperationId }),
      }), env as Env);
    expect(unauthenticated.status).toBe(401);
    const malformedOperationId = uuidv7();
    expect(isDeleteInterruptionEntryRequest({ ...request, operation_id: malformedOperationId, extra: true })).toBe(false);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE operation_id IN (?, ?)")
      .bind(unauthenticatedOperationId, malformedOperationId).first<number>("count")).toBe(0);
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(protectedDomainBefore);
    expect(await ownerOperationsSnapshot(ids.userId)).toEqual(protectedOperationsBefore);
  });

  it("reports an ambiguous infrastructure failure when the rejection insert is aborted, without Domain writes", async () => {
    const ids = await fixture();
    await makeMissingRootChain(ids, "completed");
    const request = interruptionDeleteRequest(ids, ids.sourceEntryId, 0);
    const domainBefore = await ownerDomainSnapshot(ids.userId);
    await env.APP_DB.prepare(`CREATE TRIGGER d182_rejection_insert_failure BEFORE INSERT ON operations
      WHEN NEW.operation_id = '${request.operation_id}' BEGIN SELECT RAISE(ABORT, 'injected_rejection_failure'); END`).run();
    await expect(deleteInterruptionEntry(env.APP_DB, ids.userId, request, now))
      .rejects.toMatchObject({ status: 503, code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ids.userId, request.operation_id).first<number>("count")).toBe(0);
    expect(await ownerDomainSnapshot(ids.userId)).toEqual(domainBefore);
    await env.APP_DB.prepare("DROP TRIGGER d182_rejection_insert_failure").run();
  });

  it("deletes an interrupted root while preserving its continuation, baseline, and unrelated Quick pair", async () => {
    const ids = await fixture();
    const quick = quickRequest(ids);
    const created = await quickInterruptEntry(env.APP_DB, ids.userId, quick, now);
    const request = interruptionDeleteRequest(ids, ids.sourceEntryId, 1);
    expect(isDeleteInterruptionEntryRequest(request)).toBe(true);
    const result = await deleteInterruptionEntry(env.APP_DB, ids.userId, request, now);

    expect(result).toEqual({
      entry_id: ids.sourceEntryId, deleted_execution_ids: [ids.sourceExecutionId],
      taskchute_day_id: ids.dayId, placement_revision: 2,
    });
    expect(await deleteInterruptionEntry(env.APP_DB, ids.userId, request, now)).toEqual(result);
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.sourceEntryId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT id, task_id, continuation_parent_entry_id, estimate_seconds FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, created.continuation.entry_id).first()).toEqual({
      id: created.continuation.entry_id, task_id: ids.sourceTaskId,
      continuation_parent_entry_id: ids.sourceEntryId, estimate_seconds: created.continuation.estimate_seconds,
    });
    expect(await env.APP_DB.prepare("SELECT deleted_entry_id, continuation_chain_id, continuation_parent_entry_id, root_estimate_seconds FROM continuation_lineage_tombstones WHERE app_user_id = ?")
      .bind(ids.userId).first()).toEqual({
      deleted_entry_id: ids.sourceEntryId, continuation_chain_id: ids.sourceEntryId,
      continuation_parent_entry_id: null, root_estimate_seconds: 7200,
    });
    expect(await env.APP_DB.prepare("SELECT target_entry_id, continuation_entry_id FROM quick_interrupt_entry_pairs WHERE app_user_id = ?")
      .bind(ids.userId).first()).toEqual({ target_entry_id: quick.target_entry_id, continuation_entry_id: created.continuation.entry_id });
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, ids.sourceEntryId).first()).toBeNull();
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, quick.target_entry_id).first()).toEqual({ id: quick.target_execution_id });
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, ids.userId, now);
    const projectedIds = projection.sections.flatMap((section) => section.entries).map((entry) => entry.id);
    expect(projectedIds).toContain(created.continuation.entry_id);
    expect(projectedIds).not.toContain(ids.sourceEntryId);
    const estimate = await readContinuationChainEstimate(env.APP_DB, ids.userId, ids.sourceEntryId, now);
    expect(estimate).toEqual({ valid: true, baselineEstimateSeconds: 7200, cumulativeActualSeconds: 0 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.dayId).first<number>("placement_revision")).toBe(2);
  });

  it("removes deleted actuals from all Review periods and re-interrupts from the retained root baseline", async () => {
    const ids = await fixture();
    const firstInterrupt = {
      operation_id: uuidv7(), taskchute_day_id: ids.dayId, source_entry_id: ids.sourceEntryId,
      active_execution_id: ids.sourceExecutionId, target_entry_id: ids.neighborEntryId,
      target_execution_id: uuidv7(), continuation_entry_id: uuidv7(), expected_placement_revision: 0,
    };
    const first = await interruptEntry(env.APP_DB, ids.userId, firstInterrupt, "2026-08-22T09:30:00.000Z");
    await completeEntry(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), entry_id: ids.neighborEntryId, execution_id: first.target_execution.id,
    });

    const ranges = [
      reviewDateMetricRange("daily", "2026-08-22")!,
      reviewDateMetricRange("monthly", "2026-08-01")!,
      reviewDateMetricRange("yearly", "2026-01-01")!,
    ];
    const beforeReview = [];
    for (const range of ranges) {
      const metrics = await loadReviewDateMetrics(env.APP_DB, ids.userId, range);
      beforeReview.push(metrics);
      expect(metrics).toMatchObject({ established_day_count: 1, completed_count: 2, unexecuted_count: 1 });
    }
    expect(await env.APP_DB.prepare("SELECT unixepoch(ended_at) - unixepoch(started_at) AS seconds FROM executions WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.sourceExecutionId).first<number>("seconds")).toBe(1800);

    const deleted = await deleteInterruptionEntry(env.APP_DB, ids.userId,
      interruptionDeleteRequest(ids, ids.sourceEntryId, first.placement_revision), now);
    expect(deleted.deleted_execution_ids).toEqual([ids.sourceExecutionId]);
    for (const [index, range] of ranges.entries()) {
      const metrics = await loadReviewDateMetrics(env.APP_DB, ids.userId, range);
      expect(metrics).toMatchObject({ established_day_count: 1, completed_count: 1, unexecuted_count: 1,
        completed_actual_duration_seconds: beforeReview[index]!.completed_actual_duration_seconds - 1800 });
    }

    const continuationId = first.continuation.entry_id;
    await env.APP_DB.prepare("UPDATE entries SET estimate_seconds = 555 WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, continuationId).run();
    const targetTaskId = uuidv7();
    const targetEntryId = uuidv7();
    const targetPosition = await env.APP_DB.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS position FROM entries
      WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?`)
      .bind(ids.userId, ids.dayId, ids.morningId).first<number>("position");
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Follow-up target', ?)")
        .bind(targetTaskId, ids.userId, now),
      env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
        lifecycle_state, created_at, planned_start_minute) VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, 630)`)
        .bind(targetEntryId, ids.userId, targetTaskId, ids.dayId, ids.morningId, targetPosition, now),
    ]);

    const continuationExecutionId = uuidv7();
    await startEntry(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), entry_id: continuationId, execution_id: continuationExecutionId,
    }, "2026-08-22T10:16:00.000Z");
    const followup = await interruptEntry(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), taskchute_day_id: ids.dayId, source_entry_id: continuationId,
      active_execution_id: continuationExecutionId, target_entry_id: targetEntryId,
      target_execution_id: uuidv7(), continuation_entry_id: uuidv7(), expected_placement_revision: deleted.placement_revision,
    }, "2026-08-22T10:31:30.000Z");
    expect(followup.continuation.estimate_seconds).toBe(6270);
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, estimate_seconds FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, continuationId).first()).toEqual({ lifecycle_state: "completed", estimate_seconds: 555 });
    expect(await readContinuationChainEstimate(env.APP_DB, ids.userId, ids.sourceEntryId, "2026-08-22T10:31:30.000Z"))
      .toEqual({ valid: true, baselineEstimateSeconds: 7200, cumulativeActualSeconds: 930 });
  });

  it("Quick-interrupts a surviving continuation from a deleted root without counting deleted actuals", async () => {
    const ids = await fixture();
    const firstQuick = quickRequest(ids);
    const first = await quickInterruptEntry(env.APP_DB, ids.userId, firstQuick, now);
    const deleted = await deleteInterruptionEntry(env.APP_DB, ids.userId,
      interruptionDeleteRequest(ids, ids.sourceEntryId, first.placement_revision), now);

    await completeEntry(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), entry_id: firstQuick.target_entry_id, execution_id: firstQuick.target_execution_id,
    });
    const continuationId = first.continuation.entry_id;
    await env.APP_DB.prepare("UPDATE entries SET estimate_seconds = 555 WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, continuationId).run();
    const continuationExecutionId = uuidv7();
    await startEntry(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), entry_id: continuationId, execution_id: continuationExecutionId,
    }, "2026-08-22T10:16:00.000Z");

    const followup = await quickInterruptEntry(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), taskchute_day_id: ids.dayId, source_entry_id: continuationId,
      active_execution_id: continuationExecutionId, quick_task_id: uuidv7(), target_entry_id: uuidv7(),
      target_execution_id: uuidv7(), continuation_entry_id: uuidv7(),
      expected_placement_revision: deleted.placement_revision,
    }, "2026-08-22T10:31:30.000Z");
    expect(followup.continuation.estimate_seconds).toBe(6270);
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, estimate_seconds FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, continuationId).first()).toEqual({ lifecycle_state: "completed", estimate_seconds: 555 });
    expect(await readContinuationChainEstimate(env.APP_DB, ids.userId, ids.sourceEntryId, "2026-08-22T10:31:30.000Z"))
      .toEqual({ valid: true, baselineEstimateSeconds: 7200, cumulativeActualSeconds: 930 });
  });

  it("deleting either Quick pair endpoint cascades only the pair and preserves the other continuation survivor", async () => {
    const targetFixture = await fixture();
    const targetQuick = quickRequest(targetFixture);
    const targetCreated = await quickInterruptEntry(env.APP_DB, targetFixture.userId, targetQuick, now);
    const targetDelete = await deleteInterruptionEntry(env.APP_DB, targetFixture.userId,
      interruptionDeleteRequest(targetFixture, targetQuick.target_entry_id, 1), now);
    expect(targetDelete.deleted_execution_ids).toEqual([targetQuick.target_execution_id]);
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(targetFixture.userId, targetCreated.continuation.entry_id).first()).toEqual({ id: targetCreated.continuation.entry_id });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM quick_interrupt_entry_pairs WHERE app_user_id = ?")
      .bind(targetFixture.userId).first<number>("count")).toBe(0);

    const continuationFixture = await fixture();
    const continuationQuick = quickRequest(continuationFixture);
    const continuationCreated = await quickInterruptEntry(env.APP_DB, continuationFixture.userId, continuationQuick, now);
    await deleteInterruptionEntry(env.APP_DB, continuationFixture.userId,
      interruptionDeleteRequest(continuationFixture, continuationCreated.continuation.entry_id, 1), now);
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(continuationFixture.userId, continuationQuick.target_entry_id).first()).toEqual({ id: continuationQuick.target_entry_id });
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(continuationFixture.userId, continuationFixture.sourceEntryId).first()).toEqual({ id: continuationFixture.sourceEntryId });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM quick_interrupt_entry_pairs WHERE app_user_id = ?")
      .bind(continuationFixture.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM continuation_lineage_tombstones WHERE app_user_id = ?")
      .bind(continuationFixture.userId).first<number>("count")).toBe(0);
  });

  it("deletes a middle continuation while retaining its ancestry for multiple live descendants", async () => {
    const ids = await fixture();
    const quick = quickRequest(ids);
    const created = await quickInterruptEntry(env.APP_DB, ids.userId, quick, now);
    const firstTaskId = uuidv7();
    const firstEntryId = uuidv7();
    const secondTaskId = uuidv7();
    const secondEntryId = uuidv7();
    const chainId = (await env.APP_DB.prepare("SELECT continuation_chain_id FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.sourceEntryId).first<string>("continuation_chain_id"))!;
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'First descendant', ?)")
        .bind(firstTaskId, ids.userId, now),
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Second descendant', ?)")
        .bind(secondTaskId, ids.userId, now),
      env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
        lifecycle_state, estimate_seconds, created_at, continuation_chain_id, continuation_parent_entry_id)
        VALUES (?, ?, ?, ?, ?, 7, 'planned', 321, ?, ?, ?)`)
        .bind(firstEntryId, ids.userId, firstTaskId, ids.dayId, ids.morningId, now, chainId, created.continuation.entry_id),
      env.APP_DB.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
        lifecycle_state, estimate_seconds, created_at, continuation_chain_id, continuation_parent_entry_id)
        VALUES (?, ?, ?, ?, ?, 8, 'planned', 123, ?, ?, ?)`)
        .bind(secondEntryId, ids.userId, secondTaskId, ids.dayId, ids.morningId, now, chainId, firstEntryId),
    ]);

    await deleteInterruptionEntry(env.APP_DB, ids.userId,
      interruptionDeleteRequest(ids, created.continuation.entry_id, 1), now);
    expect(await env.APP_DB.prepare(`SELECT id, continuation_parent_entry_id, estimate_seconds FROM entries
      WHERE app_user_id = ? AND id IN (?, ?) ORDER BY CASE id WHEN ? THEN 0 ELSE 1 END`)
      .bind(ids.userId, firstEntryId, secondEntryId, firstEntryId).all()).toMatchObject({ results: [
      { id: firstEntryId, continuation_parent_entry_id: created.continuation.entry_id, estimate_seconds: 321 },
      { id: secondEntryId, continuation_parent_entry_id: firstEntryId, estimate_seconds: 123 },
    ] });
    expect(await env.APP_DB.prepare("SELECT deleted_entry_id, continuation_chain_id, continuation_parent_entry_id, root_estimate_seconds FROM continuation_lineage_tombstones WHERE app_user_id = ?")
      .bind(ids.userId).first()).toEqual({
      deleted_entry_id: created.continuation.entry_id, continuation_chain_id: chainId,
      continuation_parent_entry_id: ids.sourceEntryId, root_estimate_seconds: null,
    });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM quick_interrupt_entry_pairs WHERE app_user_id = ?")
      .bind(ids.userId).first<number>("count")).toBe(0);
    const estimate = await readContinuationChainEstimate(env.APP_DB, ids.userId, chainId, now);
    expect(estimate).toEqual({ valid: true, baselineEstimateSeconds: 7200, cumulativeActualSeconds: 4530 });
  });

  it("deletes a completed Quick target and only its own Execution", async () => {
    const ids = await fixture();
    const quick = quickRequest(ids);
    const created = await quickInterruptEntry(env.APP_DB, ids.userId, quick, now);
    await completeEntry(env.APP_DB, ids.userId, {
      operation_id: uuidv7(), entry_id: quick.target_entry_id, execution_id: quick.target_execution_id,
    });
    const revision = await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.dayId).first<number>("placement_revision");

    const result = await deleteInterruptionEntry(env.APP_DB, ids.userId,
      interruptionDeleteRequest(ids, quick.target_entry_id, revision ?? -1), now);
    expect(result.deleted_execution_ids).toEqual([quick.target_execution_id]);
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, ids.sourceEntryId).first()).toEqual({ id: ids.sourceExecutionId });
    expect(await env.APP_DB.prepare("SELECT id FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, created.continuation.entry_id).first()).toEqual({ id: created.continuation.entry_id });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM quick_interrupt_entry_pairs WHERE app_user_id = ?")
      .bind(ids.userId).first<number>("count")).toBe(0);
  });

  it("rejects unconfirmed and stale requests without mutating the Entry", async () => {
    const ids = await fixture();
    const quick = quickRequest(ids);
    await quickInterruptEntry(env.APP_DB, ids.userId, quick, now);
    const unconfirmed = { ...interruptionDeleteRequest(ids, quick.target_entry_id, 1), confirmed: false };
    expect(isDeleteInterruptionEntryRequest(unconfirmed)).toBe(false);
    await expect(deleteInterruptionEntry(env.APP_DB, ids.userId,
      interruptionDeleteRequest(ids, quick.target_entry_id, 0), now)).rejects.toMatchObject({ code: "revision_conflict" });
    const otherUserId = uuidv7();
    await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(otherUserId, now).run();
    await expect(deleteInterruptionEntry(env.APP_DB, otherUserId,
      interruptionDeleteRequest(ids, quick.target_entry_id, 1), now)).rejects.toMatchObject({ code: "resource_not_found" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, quick.target_entry_id).first()).toEqual({ lifecycle_state: "running" });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.dayId).first<number>("placement_revision")).toBe(1);
  });

  it("converges concurrent exact delete retries and rejects operation ID reuse", async () => {
    const ids = await fixture();
    const quick = quickRequest(ids);
    await quickInterruptEntry(env.APP_DB, ids.userId, quick, now);
    const request = interruptionDeleteRequest(ids, quick.target_entry_id, 1);
    const [left, right] = await Promise.all([
      deleteInterruptionEntry(env.APP_DB, ids.userId, request, now),
      deleteInterruptionEntry(env.APP_DB, ids.userId, request, now),
    ]);
    expect(left).toEqual(right);
    expect(await deleteInterruptionEntry(env.APP_DB, ids.userId, request, now)).toEqual(left);
    await expect(deleteInterruptionEntry(env.APP_DB, ids.userId,
      { ...request, entry_id: ids.sourceEntryId }, now)).rejects.toMatchObject({ code: "operation_id_misuse" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE app_user_id = ? AND entry_id = ?")
      .bind(ids.userId, quick.target_entry_id).first<number>("count")).toBe(0);
  });

  it("rolls back partial chain deletion after an injected D1 failure", async () => {
    const ids = await fixture();
    const quick = quickRequest(ids);
    await quickInterruptEntry(env.APP_DB, ids.userId, quick, now);
    const request = interruptionDeleteRequest(ids, ids.sourceEntryId, 1);
    await env.APP_DB.prepare(`CREATE TRIGGER d182_injected_delete_failure BEFORE DELETE ON entries
      WHEN OLD.id = '${ids.sourceEntryId}' BEGIN SELECT RAISE(ABORT, 'injected_failure'); END`).run();
    await expect(deleteInterruptionEntry(env.APP_DB, ids.userId, request, now))
      .rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.sourceEntryId).first()).toEqual({ lifecycle_state: "completed" });
    expect(await env.APP_DB.prepare("SELECT id FROM executions WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.sourceExecutionId).first()).toEqual({ id: ids.sourceExecutionId });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM continuation_lineage_tombstones WHERE app_user_id = ?")
      .bind(ids.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM interruption_delete_command_guards WHERE app_user_id = ?")
      .bind(ids.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(ids.userId, ids.dayId).first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(ids.userId, request.operation_id).first<number>("count")).toBe(0);
    await env.APP_DB.prepare("DROP TRIGGER d182_injected_delete_failure").run();
    expect(await deleteInterruptionEntry(env.APP_DB, ids.userId, request, now)).toMatchObject({
      entry_id: ids.sourceEntryId, placement_revision: 2,
    });
  });
});
