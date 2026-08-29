import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { addTaskToDay } from "../worker/application/add-task-to-day";
import { startEntry } from "../worker/application/entry-lifecycle";
import { moveEntry, setEntryEstimate } from "../worker/application/entry-planning";
import { loadCurrentTaskChuteDay, materializeCurrentDay } from "../worker/application/load-current-day";
import { reorderEntries } from "../worker/application/reorder-entries";
import { establishInitialSectionConfiguration } from "../worker/application/section-configuration";
import { uuidv7 } from "../src/shared/uuidv7";

const userId = uuidv7();
const sectionId = uuidv7();
const entryIds = [uuidv7(), uuidv7()];
const taskIds = [uuidv7(), uuidv7()];
let dayId = "";

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Whole day', 0, ?)").bind(sectionId, userId, now),
  ]);
  dayId = (await materializeCurrentDay(env.APP_DB, userId, now)).id;
});

describe.sequential("Dogfood Day B1", () => {
  it("keeps migrated/legacy context times unknown and exposes the initial configuration gate", async () => {
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId);
    expect(projection.section_configuration_required).toBe(true);
    expect(projection.sections[0]).toMatchObject({ id: sectionId, title: "Whole day", logical_start_minute: null, actual_start_instant: null });
  });

  it("adds and reorders nullable-placement Entries with operation replay", async () => {
    let revision = 0;
    for (const [index, entryId] of entryIds.entries()) {
      const request = { operation_id: uuidv7(), task_id: taskIds[index]!, entry_id: entryId!, project_id: null,
        title: `Unsectioned ${index + 1}`, taskchute_day_id: dayId, section_id: null, expected_placement_revision: revision };
      const result = await addTaskToDay(env.APP_DB, userId, request);
      expect(await addTaskToDay(env.APP_DB, userId, request)).toEqual(result);
      revision = result.placement_revision;
    }
    const reorder = { operation_id: uuidv7(), taskchute_day_id: dayId, section_id: null,
      entry_ids: [entryIds[1]!, entryIds[0]!], expected_placement_revision: revision };
    expect((await reorderEntries(env.APP_DB, userId, reorder)).placement_revision).toBe(3);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, userId)).unsectioned_entries.map((entry) => entry.id)).toEqual(reorder.entry_ids);
  });

  it("rejects unsectioned Start without timed context and leaves lifecycle/placement untouched", async () => {
    await expect(startEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryIds[0]!, execution_id: uuidv7(),
      expected_placement_revision: 3 }))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, section_id FROM entries WHERE id = ?").bind(entryIds[0]).first())
      .toMatchObject({ lifecycle_state: "planned", section_id: null });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE entry_id = ?").bind(entryIds[0]).first<number>("count")).toBe(0);
  });

  it("establishes a complete version and freezes actual Day context", async () => {
    const request = { operation_id: uuidv7(), configuration_version_id: uuidv7(), taskchute_day_id: dayId,
      items: [{ section_id: sectionId, logical_start_minute: 0, logical_end_minute: 1440 }] };
    const first = await establishInitialSectionConfiguration(env.APP_DB, userId, request);
    expect(await establishInitialSectionConfiguration(env.APP_DB, userId, request)).toEqual(first);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId);
    expect(projection.section_configuration_required).toBe(false);
    expect(projection.sections[0]?.actual_start_instant).toBe(projection.taskchute_day.start_instant);
    expect(projection.sections[0]?.actual_end_instant).toBe(projection.taskchute_day.end_instant);
  });

  it("persists planned Entry estimate, sums it, replays, and does not bump placement revision", async () => {
    const before = (await loadCurrentTaskChuteDay(env.APP_DB, userId)).placement_revision;
    const request = { operation_id: uuidv7(), entry_id: entryIds[0]!, estimate_seconds: 900 };
    expect(await setEntryEstimate(env.APP_DB, userId, request)).toEqual({ entry_id: entryIds[0], estimate_seconds: 900 });
    expect(await setEntryEstimate(env.APP_DB, userId, request)).toEqual({ entry_id: entryIds[0], estimate_seconds: 900 });
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId);
    expect(projection.placement_revision).toBe(before);
    expect(projection.unsectioned_entries.find((entry) => entry.id === entryIds[0])?.estimate_seconds).toBe(900);
    await expect(env.APP_DB.prepare("UPDATE entries SET estimate_seconds = 0 WHERE id = ?").bind(entryIds[0]).run()).rejects.toThrow();
  });

  it("moves planned Entry null -> Section -> null with revision conflict protection", async () => {
    const before = (await loadCurrentTaskChuteDay(env.APP_DB, userId)).placement_revision;
    await expect(moveEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryIds[1]!, taskchute_day_id: dayId,
      section_id: sectionId, expected_placement_revision: before - 1 })).rejects.toMatchObject({ code: "revision_conflict" });
    const into = await moveEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryIds[1]!, taskchute_day_id: dayId,
      section_id: sectionId, expected_placement_revision: before });
    const out = await moveEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryIds[1]!, taskchute_day_id: dayId,
      section_id: null, expected_placement_revision: into.placement_revision });
    expect(out.placement_revision).toBe(before + 2);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, userId)).unsectioned_entries.some((entry) => entry.id === entryIds[1])).toBe(true);
  });

  it("atomically places and starts an unsectioned Entry, then replays without a second revision or Execution", async () => {
    const before = (await loadCurrentTaskChuteDay(env.APP_DB, userId)).placement_revision;
    const request = { operation_id: uuidv7(), entry_id: entryIds[0]!, execution_id: uuidv7(),
      expected_placement_revision: before };
    const first = await startEntry(env.APP_DB, userId, request);
    expect(first).toMatchObject({ section_id: sectionId, placement_revision: before + 1, lifecycle_state: "running" });
    expect(await startEntry(env.APP_DB, userId, request)).toEqual(first);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId);
    expect(projection.placement_revision).toBe(before + 1);
    expect(projection.active_execution?.id).toBe(request.execution_id);
    expect(projection.sections[0]?.entries.find((entry) => entry.id === entryIds[0])?.lifecycle_state).toBe("running");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE entry_id = ?").bind(entryIds[0]).first<number>("count")).toBe(1);
    await expect(moveEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: entryIds[0]!, taskchute_day_id: dayId,
      section_id: null, expected_placement_revision: projection.placement_revision })).rejects.toMatchObject({ code: "resource_conflict" });
  });

  it("keeps foreign keys valid and nullable Section FK authoritative", async () => {
    expect((await env.APP_DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    await expect(env.APP_DB.prepare("UPDATE entries SET section_id = ? WHERE id = ?").bind(uuidv7(), entryIds[1]).run()).rejects.toThrow();
  });
});
