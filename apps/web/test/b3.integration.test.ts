import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { loadCurrentTaskChuteDay } from "../worker/application/load-current-day";
import { setEntryPlannedStart } from "../worker/application/planned-start";
import { loadSectionConfiguration, updateSectionConfiguration } from "../worker/application/section-configuration";
import { uuidv7 } from "../src/shared/uuidv7";

const now = "2026-08-29T12:00:00.000Z";

async function seedB3() {
  const userId = uuidv7();
  const dayId = uuidv7();
  const versionId = uuidv7();
  const sections = [uuidv7(), uuidv7(), uuidv7()];
  const ranges = [[300, 540], [540, 1200], [1200, 1740]] as const;
  const titles = ["Morning", "Day", "Night"];
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 300, ?)")
      .bind(userId, now),
    ...sections.map((id, index) => env.APP_DB.prepare(
      "INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, userId, titles[index], index, now)),
    env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 300, ?)")
      .bind(versionId, userId, now),
    ...sections.map((id, index) => env.APP_DB.prepare(`INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, versionId, id, titles[index], ranges[index]![0], ranges[index]![1], index)),
    env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
      .bind(userId, versionId),
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-29', '2026-08-29T05:00:00.000Z', '2026-08-30T05:00:00.000Z',
       'UTC', 300, 'compatible', 9, ?)`).bind(dayId, userId, now),
    ...sections.map((id, index) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
       logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(userId, dayId, id, versionId, titles[index], ranges[index]![0], ranges[index]![1],
        ["2026-08-29T05:00:00.000Z", "2026-08-29T09:00:00.000Z", "2026-08-30T00:00:00.000Z"][index],
        ["2026-08-29T09:00:00.000Z", "2026-08-30T00:00:00.000Z", "2026-08-30T05:00:00.000Z"][index], index)),
  ]);
  const taskId = uuidv7();
  const entryId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Planned B3', ?)")
      .bind(taskId, userId, now),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, ?, 1, 'planned', 900, 600, ?)`)
      .bind(entryId, userId, taskId, dayId, sections[1], now),
  ]);
  return { userId, dayId, versionId, sections, entryId };
}

describe.sequential("Dogfood Day B3 Section Settings Lifecycle", () => {
  it("projects the head, appends a version, freezes the current Day, and applies the latest head to the next Day", async () => {
    const fixture = await seedB3();
    expect(await loadSectionConfiguration(env.APP_DB, fixture.userId)).toMatchObject({
      configuration_version_id: fixture.versionId, day_boundary_minutes: 300,
      items: [{ title: "Morning" }, { title: "Day" }, { title: "Night" }],
    });
    const addedId = uuidv7();
    const versionB = uuidv7();
    const requestB = {
      operation_id: uuidv7(), configuration_version_id: versionB,
      expected_configuration_version_id: fixture.versionId,
      items: [
        { section_id: fixture.sections[0]!, title: "Focus", logical_start_minute: 300, logical_end_minute: 600 },
        { section_id: addedId, title: "Lunch", logical_start_minute: 600, logical_end_minute: 780 },
        { section_id: fixture.sections[2]!, title: "Evening", logical_start_minute: 780, logical_end_minute: 1740 },
      ],
    };
    expect(await updateSectionConfiguration(env.APP_DB, fixture.userId, requestB))
      .toEqual({ configuration_version_id: versionB });
    expect(await updateSectionConfiguration(env.APP_DB, fixture.userId, requestB))
      .toEqual({ configuration_version_id: versionB });

    const canonical = await loadSectionConfiguration(env.APP_DB, fixture.userId);
    expect(canonical.items).toEqual(requestB.items);
    expect(await env.APP_DB.prepare(`SELECT title, logical_start_minute, logical_end_minute
      FROM taskchute_day_section_contexts WHERE taskchute_day_id = ? ORDER BY context_order`)
      .bind(fixture.dayId).all()).toMatchObject({ results: [
        { title: "Morning", logical_start_minute: 300, logical_end_minute: 540 },
        { title: "Day", logical_start_minute: 540, logical_end_minute: 1200 },
        { title: "Night", logical_start_minute: 1200, logical_end_minute: 1740 },
      ] });
    expect(await env.APP_DB.prepare("SELECT section_id, planned_start_minute FROM entries WHERE id = ?")
      .bind(fixture.entryId).first()).toEqual({ section_id: fixture.sections[1], planned_start_minute: 600 });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(fixture.dayId).first<number>("placement_revision")).toBe(9);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM sections WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(4);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM section_configuration_versions WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(2);

    const versionC = uuidv7();
    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: versionC, expected_configuration_version_id: versionB,
      items: requestB.items.map((item, index) => index === 0 ? { ...item, title: "Deep Focus" } : item),
    });
    const nextDayId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-30', '2026-08-30T05:00:00Z', '2026-08-31T05:00:00Z',
       'UTC', 300, 'compatible', 0, ?)`).bind(nextDayId, fixture.userId, now).run();
    const nextDay = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-30T12:00:00.000Z");
    expect(nextDay.sections.map((section) => section.title)).toEqual(["Deep Focus", "Lunch", "Evening"]);
    expect(await env.APP_DB.prepare(`SELECT DISTINCT configuration_version_id FROM taskchute_day_section_contexts
      WHERE taskchute_day_id = ?`).bind(nextDayId).all()).toMatchObject({ results: [{ configuration_version_id: versionC }] });

    const nextTaskId = uuidv7();
    const nextEntryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Next Day B2', ?)")
        .bind(nextTaskId, fixture.userId, now),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, planned_start_minute, created_at) VALUES (?, ?, ?, ?, NULL, 1, 'planned', NULL, NULL, ?)`)
        .bind(nextEntryId, fixture.userId, nextTaskId, nextDayId, now),
    ]);
    const planned = await setEntryPlannedStart(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), entry_id: nextEntryId, taskchute_day_id: nextDayId,
      planned_start_minute: 700, expected_placement_revision: 0,
    });
    expect(planned).toMatchObject({ entry_id: nextEntryId, section_id: addedId,
      planned_start_minute: 700, position: 1, placement_revision: 1 });
    const nextCanonical = await loadCurrentTaskChuteDay(env.APP_DB, fixture.userId, "2026-08-30T12:00:00.000Z");
    expect(nextCanonical.sections.find((section) => section.id === addedId)?.entries.map((entry) => entry.id))
      .toEqual([nextEntryId]);
    expect(nextCanonical.placement_revision).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM entries
      WHERE taskchute_day_id = ? AND section_id IS NULL AND planned_start_minute IS NOT NULL`)
      .bind(nextDayId).first<number>("count")).toBe(0);

    const versionD = uuidv7();
    const currentC = await loadSectionConfiguration(env.APP_DB, fixture.userId);
    await updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: versionD, expected_configuration_version_id: versionC,
      items: [currentC.items[0]!, { ...currentC.items[1]!, logical_end_minute: 1740 }],
    });
    expect((await loadSectionConfiguration(env.APP_DB, fixture.userId)).items).toMatchObject([
      { title: "Deep Focus", logical_start_minute: 300, logical_end_minute: 600 },
      { title: "Lunch", logical_start_minute: 600, logical_end_minute: 1740 },
    ]);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM sections WHERE app_user_id = ? AND id = ?")
      .bind(fixture.userId, fixture.sections[2]).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM section_configuration_items
      WHERE app_user_id = ? AND configuration_version_id = ?`)
      .bind(fixture.userId, versionC).first<number>("count")).toBe(3);
  });

  it("rejects gaps, empty titles, duplicate IDs, inactive restoration, stale heads, and operation misuse without partial writes", async () => {
    const fixture = await seedB3();
    const baseItems = (await loadSectionConfiguration(env.APP_DB, fixture.userId)).items;
    const invalidItems = [
      baseItems.map((item, index) => index === 1 ? { ...item, logical_start_minute: 541 } : item),
      baseItems.map((item, index) => index === 1 ? { ...item, logical_start_minute: 539 } : item),
      baseItems.map((item, index) => index === 1 ? { ...item, logical_end_minute: item.logical_start_minute } : item),
      baseItems.map((item, index) => index === 0 ? { ...item, logical_start_minute: 299 } : item),
      baseItems.map((item, index) => index === 2 ? { ...item, logical_end_minute: 1741 } : item),
      baseItems.map((item, index) => index === 1 ? { ...item, title: "   " } : item),
      [baseItems[0]!, { ...baseItems[1]!, section_id: baseItems[0]!.section_id }, baseItems[2]!],
    ];
    for (const items of invalidItems) {
      await expect(updateSectionConfiguration(env.APP_DB, fixture.userId, {
        operation_id: uuidv7(), configuration_version_id: uuidv7(),
        expected_configuration_version_id: fixture.versionId, items,
      })).rejects.toMatchObject({ code: "resource_conflict" });
      expect((await loadSectionConfiguration(env.APP_DB, fixture.userId)).configuration_version_id).toBe(fixture.versionId);
      expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM section_configuration_versions WHERE app_user_id = ?")
        .bind(fixture.userId).first<number>("count")).toBe(1);
      expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM section_configuration_items WHERE app_user_id = ?")
        .bind(fixture.userId).first<number>("count")).toBe(3);
      expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM sections WHERE app_user_id = ?")
        .bind(fixture.userId).first<number>("count")).toBe(3);
      expect((await env.APP_DB.prepare("SELECT title FROM sections WHERE app_user_id = ? ORDER BY sort_order")
        .bind(fixture.userId).all()).results).toEqual([{ title: "Morning" }, { title: "Day" }, { title: "Night" }]);
    }
    const other = await seedB3();
    await expect(updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(),
      expected_configuration_version_id: fixture.versionId,
      items: baseItems.map((item, index) => index === 0 ? { ...item, section_id: other.sections[0]! } : item),
    })).rejects.toMatchObject({ code: "resource_conflict" });
    const versionB = uuidv7();
    const operationId = uuidv7();
    const request = { operation_id: operationId, configuration_version_id: versionB,
      expected_configuration_version_id: fixture.versionId, items: baseItems.slice(0, 2).map((item, index) => ({
        ...item, logical_end_minute: index === 1 ? 1740 : item.logical_end_minute,
      })) };
    await updateSectionConfiguration(env.APP_DB, fixture.userId, request);
    await expect(updateSectionConfiguration(env.APP_DB, fixture.userId, { ...request, configuration_version_id: uuidv7() }))
      .rejects.toMatchObject({ code: "operation_id_misuse" });
    await expect(updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(), expected_configuration_version_id: fixture.versionId,
      items: request.items,
    })).rejects.toMatchObject({ code: "revision_conflict" });
    await expect(updateSectionConfiguration(env.APP_DB, fixture.userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(), expected_configuration_version_id: versionB,
      items: baseItems,
    })).rejects.toMatchObject({ code: "resource_conflict" });
    expect((await loadSectionConfiguration(env.APP_DB, fixture.userId)).configuration_version_id).toBe(versionB);
  });

  it("allows exactly one concurrent head transition", async () => {
    const fixture = await seedB3();
    const items = (await loadSectionConfiguration(env.APP_DB, fixture.userId)).items;
    const requests = ["A", "B"].map((suffix) => ({ operation_id: uuidv7(), configuration_version_id: uuidv7(),
      expected_configuration_version_id: fixture.versionId,
      items: items.map((item, index) => index === 0 ? { ...item, title: `Morning ${suffix}` } : item) }));
    const settled = await Promise.allSettled(requests.map((request) =>
      updateSectionConfiguration(env.APP_DB, fixture.userId, request)));
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM section_configuration_versions WHERE app_user_id = ?")
      .bind(fixture.userId).first<number>("count")).toBe(2);
  });
});
