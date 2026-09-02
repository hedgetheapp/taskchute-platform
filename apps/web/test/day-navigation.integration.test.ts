import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { addTaskToDay } from "../worker/application/add-task-to-day";
import { moveEntry, setEntryEstimate } from "../worker/application/entry-planning";
import { loadTaskChuteDayByLogicalDate } from "../worker/application/load-current-day";
import { setEntryPlannedStart } from "../worker/application/planned-start";
import { reorderEntries } from "../worker/application/reorder-entries";
import { updateSectionConfiguration } from "../worker/application/section-configuration";

const now = "2026-08-29T12:00:00.000Z";

async function seedNavigationUser() {
  const userId = uuidv7();
  const versionId = uuidv7();
  const sections = [uuidv7(), uuidv7()];
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 300, ?)")
      .bind(userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Morning', 0, ?)")
      .bind(sections[0], userId, now),
    env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Evening', 1, ?)")
      .bind(sections[1], userId, now),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 300, ?)")
      .bind(versionId, userId, now),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Morning', 300, 720, 0)`).bind(userId, versionId, sections[0]),
    env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, 'Evening', 720, 1740, 1)`).bind(userId, versionId, sections[1]),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, versionId),
  ]);
  return { userId, sections, versionId };
}

async function counts(userId: string) {
  const tables = ["taskchute_days", "taskchute_day_section_contexts", "tasks", "entries", "routine_occurrences", "operations"];
  return Object.fromEntries(await Promise.all(tables.map(async (table) => [table,
    await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE app_user_id = ?`).bind(userId).first<number>("count")])));
}

function futureRequest(sectionId: string | null, logicalDate = "2026-08-31") {
  return {
    operation_id: uuidv7(), task_id: uuidv7(), entry_id: uuidv7(), project_id: null,
    title: "Future task", taskchute_day_id: uuidv7(), logical_date: logicalDate,
    section_id: sectionId, expected_placement_revision: 0,
  };
}

describe.sequential("Day Navigation v0.1", () => {
  it("reads future preview repeatedly without materializing Day, context, Routine, Task, or Entry", async () => {
    const fixture = await seedNavigationUser();
    const routineTaskId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Eligible daily Routine', ?)")
        .bind(routineTaskId, fixture.userId, now),
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute, materialization_order, created_at)
        VALUES (?, ?, ?, 'daily', '2026-08-29', NULL, ?, 900, 360, 1, ?)`)
        .bind(uuidv7(), fixture.userId, routineTaskId, fixture.sections[0], now),
    ]);
    const before = await counts(fixture.userId);
    const first = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-31", now);
    const second = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-31", now);
    expect(first).toMatchObject({ establishment_state: "future_preview", is_current: false,
      projection_generated_at: now,
      taskchute_day: { id: null, logical_date: "2026-08-31" }, placement_revision: 0 });
    expect(first.sections.map((section) => section.title)).toEqual(["Morning", "Evening"]);
    expect(second).toEqual(first);
    expect(await counts(fixture.userId)).toEqual(before);
  });

  it("keeps an unestablished future preview fresh when the effective Section configuration changes", async () => {
    const fixture = await seedNavigationUser();
    const first = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-31", now);
    expect(first.establishment_state).toBe("future_preview");
    expect(first.sections.map((section) => [section.title, section.logical_start_minute, section.logical_end_minute]))
      .toEqual([["Morning", 300, 720], ["Evening", 720, 1740]]);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_day_section_contexts WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);

    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(),
      expected_configuration_version_id: fixture.versionId,
      items: [
        { section_id: fixture.sections[0]!, title: "Focus", logical_start_minute: 300, logical_end_minute: 900 },
        { section_id: fixture.sections[1]!, title: "Night", logical_start_minute: 900, logical_end_minute: 1740 },
      ],
    });
    const second = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-31", now);
    expect(second.establishment_state).toBe("future_preview");
    expect(second.sections.map((section) => [section.title, section.logical_start_minute, section.logical_end_minute]))
      .toEqual([["Focus", 300, 900], ["Night", 900, 1740]]);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_day_section_contexts WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
  });

  it("shows an unestablished past date as an empty read-only historical gap without writes", async () => {
    const fixture = await seedNavigationUser();
    const before = await counts(fixture.userId);
    const first = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-28", now);
    expect(first).toMatchObject({ establishment_state: "past_record_none", is_current: false,
      taskchute_day: { id: null, logical_date: "2026-08-28", start_instant: null }, sections: [] });
    expect(await counts(fixture.userId)).toEqual(before);
    const second = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-28", now);
    expect(second).toEqual(first);
    expect(await counts(fixture.userId)).toEqual(before);
    await expect(addTaskToDay(env.APP_DB, fixture.userId, futureRequest(null, "2026-08-28"), now))
      .rejects.toMatchObject({ code: "resource_conflict", reconcile: false });
    expect(await counts(fixture.userId)).toEqual(before);
  });

  it("does not fabricate historical context for an unestablished past date after Section configuration changes", async () => {
    const fixture = await seedNavigationUser();
    const first = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-28", now);
    expect(first).toMatchObject({
      projection_generated_at: now,
      establishment_state: "past_record_none",
      is_current: false,
      planning_enabled: false,
      taskchute_day: {
        id: null,
        logical_date: "2026-08-28",
        start_instant: null,
        end_instant: null,
        establishment_timezone: null,
        establishment_boundary_minutes: null,
      },
      sections: [],
      unsectioned_entries: [],
      active_execution: null,
    });
    const beforeConfigurationChange = await counts(fixture.userId);

    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(),
      expected_configuration_version_id: fixture.versionId,
      items: [
        { section_id: fixture.sections[0]!, title: "Focus", logical_start_minute: 300, logical_end_minute: 900 },
        { section_id: fixture.sections[1]!, title: "Night", logical_start_minute: 900, logical_end_minute: 1740 },
      ],
    });
    const afterConfigurationChange = await counts(fixture.userId);
    expect(afterConfigurationChange).toEqual({ ...beforeConfigurationChange,
      operations: (beforeConfigurationChange.operations ?? 0) + 1 });

    const second = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, "2026-08-28", now);
    expect(second).toEqual(first);
    expect(await counts(fixture.userId)).toEqual(afterConfigurationChange);
  });

  it("returns an established past Day from frozen history without Section rewrite or Routine backfill", async () => {
    const fixture = await seedNavigationUser();
    const request = futureRequest(fixture.sections[0]!);
    await addTaskToDay(env.APP_DB, fixture.userId, request, now);
    const frozenBefore = await env.APP_DB.prepare(`SELECT section_id, title, logical_start_minute, logical_end_minute
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
      .bind(fixture.userId, request.taskchute_day_id).all();
    const routineTaskId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Past backfill guard', ?)")
        .bind(routineTaskId, fixture.userId, now),
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute, materialization_order, created_at)
        VALUES (?, ?, ?, 'daily', '2026-08-30', NULL, ?, NULL, 300, 1, ?)`)
        .bind(uuidv7(), fixture.userId, routineTaskId, fixture.sections[0], now),
    ]);
    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(),
      expected_configuration_version_id: fixture.versionId,
      items: [
        { section_id: fixture.sections[0]!, title: "Focus", logical_start_minute: 300, logical_end_minute: 900 },
        { section_id: fixture.sections[1]!, title: "Night", logical_start_minute: 900, logical_end_minute: 1740 },
      ],
    });

    const laterNow = "2026-09-02T12:00:00.000Z";
    const past = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, request.logical_date, laterNow);
    expect(past).toMatchObject({ establishment_state: "established", is_current: false, planning_enabled: false,
      taskchute_day: { id: request.taskchute_day_id, logical_date: request.logical_date }, active_execution: null });
    expect(past.sections.map((section) => section.title)).toEqual(["Morning", "Evening"]);
    const frozenAfter = await env.APP_DB.prepare(`SELECT section_id, title, logical_start_minute, logical_end_minute
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
      .bind(fixture.userId, request.taskchute_day_id).all();
    expect(frozenAfter.results).toEqual(frozenBefore.results);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
  });

  it("atomically establishes a future Day and adds its first Task using the current configuration", async () => {
    const fixture = await seedNavigationUser();
    const request = futureRequest(fixture.sections[0]!);
    const result = await addTaskToDay(env.APP_DB, fixture.userId, request, now);
    expect(result).toMatchObject({ taskchute_day_id: request.taskchute_day_id, entry_id: request.entry_id,
      section_id: fixture.sections[0], position: 1, placement_revision: 1 });
    const projection = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, request.logical_date, now);
    expect(projection).toMatchObject({ establishment_state: "established", is_current: false,
      projection_generated_at: now, taskchute_day: { id: request.taskchute_day_id }, placement_revision: 1 });
    expect(projection.sections[0]?.entries[0]?.id).toBe(request.entry_id);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ?`).bind(fixture.userId, request.taskchute_day_id).first<number>("count")).toBe(2);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
  });

  it("does not leave an establishment-only Day after deterministic rejection or injected batch failure", async () => {
    const fixture = await seedNavigationUser();
    const rejected = futureRequest(uuidv7());
    await expect(addTaskToDay(env.APP_DB, fixture.userId, rejected, now)).rejects.toMatchObject({ code: "resource_not_found" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);

    const failed = futureRequest(fixture.sections[0]!);
    const failing = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          if (statements.length > 3) throw new Error("injected future establishment failure");
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(addTaskToDay(failing, fixture.userId, failed, now)).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
  });

  it("converges concurrent equivalent first mutations and exact retry to one Day and one revision increment", async () => {
    const fixture = await seedNavigationUser();
    const request = futureRequest(fixture.sections[0]!);
    const results = await Promise.all([
      addTaskToDay(env.APP_DB, fixture.userId, request, now),
      addTaskToDay(env.APP_DB, fixture.userId, request, now),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(await addTaskToDay(env.APP_DB, fixture.userId, request, now)).toEqual(results[0]);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(1);
  });

  it("keeps established future Day planning available without enabling execution or Routine materialization", async () => {
    const fixture = await seedNavigationUser();
    const first = futureRequest(fixture.sections[0]!);
    await addTaskToDay(env.APP_DB, fixture.userId, first, now);
    const second = { ...futureRequest(fixture.sections[0]!), taskchute_day_id: first.taskchute_day_id,
      title: "Second future task", expected_placement_revision: 1 };
    const secondResult = await addTaskToDay(env.APP_DB, fixture.userId, second, now);
    expect(secondResult).toMatchObject({ taskchute_day_id: first.taskchute_day_id, position: 2, placement_revision: 2 });
    expect(await addTaskToDay(env.APP_DB, fixture.userId, second, now)).toEqual(secondResult);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?")
      .bind(fixture.userId, first.logical_date).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?")
      .bind(fixture.userId, first.taskchute_day_id).first<number>("count")).toBe(2);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ?")
      .bind(fixture.userId, first.taskchute_day_id).first<number>("count")).toBe(2);
    await reorderEntries(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), taskchute_day_id: first.taskchute_day_id, section_id: fixture.sections[0]!,
      entry_ids: [second.entry_id, first.entry_id], expected_placement_revision: 2,
    });
    await setEntryEstimate(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: first.entry_id, estimate_seconds: 1800,
    });
    await setEntryPlannedStart(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: first.entry_id, taskchute_day_id: first.taskchute_day_id,
      planned_start_minute: 780, expected_placement_revision: 3,
    });
    await moveEntry(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: second.entry_id, taskchute_day_id: first.taskchute_day_id,
      section_id: fixture.sections[1]!, expected_placement_revision: 4,
    });
    const projection = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, first.logical_date, now);
    expect(projection.is_current).toBe(false);
    expect(projection.active_execution).toBeNull();
    expect(new Set(projection.sections[1]!.entries.map((entry) => entry.id))).toEqual(new Set([first.entry_id, second.entry_id]));
    expect(projection.sections[1]!.entries.find((entry) => entry.id === first.entry_id))
      .toMatchObject({ estimate_seconds: 1800, planned_start_minute: 780 });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM routine_occurrences WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(0);
  });

  it("keeps established future Section context frozen after a later configuration change", async () => {
    const fixture = await seedNavigationUser();
    const request = futureRequest(fixture.sections[0]!);
    await addTaskToDay(env.APP_DB, fixture.userId, request, now);
    const before = await env.APP_DB.prepare(`SELECT title, logical_start_minute, logical_end_minute
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
      .bind(fixture.userId, request.taskchute_day_id).all();
    const head = await env.APP_DB.prepare("SELECT configuration_version_id FROM section_configuration_heads WHERE app_user_id = ?")
      .bind(fixture.userId).first<string>("configuration_version_id");
    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(), expected_configuration_version_id: head!,
      items: [
        { section_id: fixture.sections[0]!, title: "Focus", logical_start_minute: 300, logical_end_minute: 900 },
        { section_id: fixture.sections[1]!, title: "Night", logical_start_minute: 900, logical_end_minute: 1740 },
      ],
    });
    const after = await env.APP_DB.prepare(`SELECT title, logical_start_minute, logical_end_minute
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
      .bind(fixture.userId, request.taskchute_day_id).all();
    expect(after.results).toEqual(before.results);
    const followUp = { ...futureRequest(fixture.sections[0]!, request.logical_date),
      taskchute_day_id: request.taskchute_day_id, title: "Frozen-context follow-up", expected_placement_revision: 1 };
    expect(await addTaskToDay(env.APP_DB, fixture.userId, followUp, now)).toMatchObject({
      taskchute_day_id: request.taskchute_day_id, section_id: fixture.sections[0], placement_revision: 2,
    });
    const projection = await loadTaskChuteDayByLogicalDate(env.APP_DB, fixture.userId, request.logical_date, now);
    expect(projection.sections.map((section) => section.title)).toEqual(["Morning", "Evening"]);
    expect(projection.sections[0]?.entries.map((entry) => entry.id)).toEqual([request.entry_id, followUp.entry_id]);
    expect((await env.APP_DB.prepare(`SELECT title, logical_start_minute, logical_end_minute
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
      .bind(fixture.userId, request.taskchute_day_id).all()).results).toEqual(before.results);
  });

  it("rejects a stale follow-up Add without partial state and replays a successful follow-up exactly", async () => {
    const fixture = await seedNavigationUser();
    const first = futureRequest(fixture.sections[0]!);
    await addTaskToDay(env.APP_DB, fixture.userId, first, now);
    const stale = { ...futureRequest(fixture.sections[0]!, first.logical_date), taskchute_day_id: first.taskchute_day_id,
      title: "Stale follow-up", expected_placement_revision: 0 };
    await expect(addTaskToDay(env.APP_DB, fixture.userId, stale, now)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, first.taskchute_day_id).first<number>("placement_revision")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, stale.task_id).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, stale.entry_id).first<number>("count")).toBe(0);

    const successful = { ...futureRequest(fixture.sections[0]!, first.logical_date), taskchute_day_id: first.taskchute_day_id,
      title: "Successful follow-up", expected_placement_revision: 1 };
    const result = await addTaskToDay(env.APP_DB, fixture.userId, successful, now);
    expect(await addTaskToDay(env.APP_DB, fixture.userId, successful, now)).toEqual(result);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, first.taskchute_day_id).first<number>("placement_revision")).toBe(2);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?")
      .bind(fixture.userId, first.taskchute_day_id).first<number>("count")).toBe(2);
  });

  it("allows exactly one of two concurrent established-future follow-up Adds at the same revision", async () => {
    const fixture = await seedNavigationUser();
    const first = futureRequest(fixture.sections[0]!);
    await addTaskToDay(env.APP_DB, fixture.userId, first, now);
    const candidates = ["Concurrent A", "Concurrent B"].map((title) => ({
      ...futureRequest(fixture.sections[0]!, first.logical_date), taskchute_day_id: first.taskchute_day_id,
      title, expected_placement_revision: 1,
    }));
    const settled = await Promise.allSettled(candidates.map((request) => addTaskToDay(env.APP_DB, fixture.userId, request, now)));
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(settled.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected", reason: { code: "revision_conflict" },
    });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, first.taskchute_day_id).first<number>("placement_revision")).toBe(2);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?")
      .bind(fixture.userId, first.taskchute_day_id).first<number>("count")).toBe(2);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ? AND logical_date = ?")
      .bind(fixture.userId, first.logical_date).first<number>("count")).toBe(1);
  });

  it("keeps arbitrary-date reads owner-scoped", async () => {
    const owner = await seedNavigationUser();
    const other = await seedNavigationUser();
    const request = futureRequest(owner.sections[0]!);
    await addTaskToDay(env.APP_DB, owner.userId, request, now);
    const otherProjection = await loadTaskChuteDayByLogicalDate(env.APP_DB, other.userId, request.logical_date, now);
    expect(otherProjection.establishment_state).toBe("future_preview");
    expect(otherProjection.taskchute_day.id).toBeNull();
    expect(otherProjection.sections.flatMap((section) => section.entries)).toEqual([]);
  });

  it("rejects cross-owner Section, Project, and Day authority without attacker planning writes", async () => {
    const owner = await seedNavigationUser();
    const attacker = await seedNavigationUser();
    const ownerProjectId = uuidv7();
    await env.APP_DB.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, 'Owner Project', ?)")
      .bind(ownerProjectId, owner.userId, now).run();
    const ownerDay = futureRequest(owner.sections[0]!);
    await addTaskToDay(env.APP_DB, owner.userId, ownerDay, now);

    const attackerPlanningCounts = async () => ({
      days: await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ?")
        .bind(attacker.userId).first<number>("count"),
      contexts: await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_day_section_contexts WHERE app_user_id = ?")
        .bind(attacker.userId).first<number>("count"),
      tasks: await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE app_user_id = ?")
        .bind(attacker.userId).first<number>("count"),
      entries: await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM entries WHERE app_user_id = ?")
        .bind(attacker.userId).first<number>("count"),
    });
    const before = await attackerPlanningCounts();
    await expect(addTaskToDay(env.APP_DB, attacker.userId, futureRequest(owner.sections[0]!), now))
      .rejects.toMatchObject({ code: "resource_not_found" });
    await expect(addTaskToDay(env.APP_DB, attacker.userId, {
      ...futureRequest(attacker.sections[0]!), project_id: ownerProjectId,
    }, now)).rejects.toMatchObject({ code: "resource_not_found" });
    await expect(addTaskToDay(env.APP_DB, attacker.userId, {
      ...futureRequest(attacker.sections[0]!), taskchute_day_id: ownerDay.taskchute_day_id,
    }, now)).rejects.toMatchObject({ code: "infrastructure_ambiguous" });
    expect(await attackerPlanningCounts()).toEqual(before);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM taskchute_days WHERE app_user_id = ? AND id = ?")
      .bind(owner.userId, ownerDay.taskchute_day_id).first<number>("count")).toBe(1);
  });
});
