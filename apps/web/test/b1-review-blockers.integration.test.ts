import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addTaskToDay } from "../worker/application/add-task-to-day";
import { isStartEntryRequest, startEntry } from "../worker/application/entry-lifecycle";
import { moveEntry } from "../worker/application/entry-planning";
import { fingerprint } from "../worker/application/fingerprint";
import { loadCurrentTaskChuteDay, materializeCurrentDay } from "../worker/application/load-current-day";
import { reorderEntries } from "../worker/application/reorder-entries";
import {
  establishInitialSectionConfiguration,
  isEstablishInitialSectionConfigurationRequest,
} from "../worker/application/section-configuration";
import type { StartEntryResult } from "../src/shared/contracts";
import { uuidv7 } from "../src/shared/uuidv7";

async function seedUser(sectionCount = 2) {
  const userId = uuidv7();
  const sectionIds = Array.from({ length: sectionCount }, () => uuidv7());
  const now = "2026-08-28T12:00:00.000Z";
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, now),
    env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 0, ?)")
      .bind(userId, now),
    ...sectionIds.map((id, index) => env.APP_DB.prepare(
      "INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, userId, `Section ${index + 1}`, index, now)),
  ]);
  return { userId, sectionIds, now };
}

async function seedLegacyDay(userId: string, sectionIds: string[], now: string, revision = 0) {
  const dayId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare(`INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, ?, '2026-08-28', '2026-08-28T00:00:00.000Z', '2026-08-29T00:00:00.000Z',
        'UTC', 0, 'compatible', ?, ?)`).bind(dayId, userId, revision, now),
    ...sectionIds.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, title, context_order) VALUES (?, ?, ?, ?, ?)`)
      .bind(userId, dayId, sectionId, `Section ${index + 1}`, index)),
  ]);
  return dayId;
}

async function seedEntries(userId: string, dayId: string, sectionId: string | null, states: string[], startPosition = 1) {
  const rows = states.map((state, index) => ({ id: uuidv7(), taskId: uuidv7(), state, position: startPosition + index }));
  await env.APP_DB.batch(rows.flatMap((row, index) => [
    env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .bind(row.taskId, userId, `Blocker task ${index}`, "2026-08-28T12:00:00.000Z"),
    env.APP_DB.prepare(`INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(row.id, userId, row.taskId, dayId, sectionId, row.position, row.state, "2026-08-28T12:00:00.000Z"),
  ]));
  return rows;
}

async function setPositions(rows: Array<{ id: string }>, positions: number[]) {
  const cases = rows.map(() => "WHEN ? THEN ?").join(" ");
  const ids = rows.map(() => "?").join(", ");
  const bindings = rows.flatMap((row, index) => [row.id, positions[index]!]);
  await env.APP_DB.prepare(`UPDATE entries SET position = CASE id ${cases} END WHERE id IN (${ids})`)
    .bind(...bindings, ...rows.map((row) => row.id)).run();
}

describe.sequential("Dogfood Day B1 source-review blockers", () => {
  it("keeps historical Entries fixed and prevents planned Entries crossing them in Section and null groups", async () => {
    const { userId, sectionIds, now } = await seedUser(1);
    const dayId = await seedLegacyDay(userId, sectionIds, now);
    const real = await seedEntries(userId, dayId, sectionIds[0]!, ["planned", "planned", "completed", "planned", "planned"]);
    const none = await seedEntries(userId, dayId, null, ["planned", "planned", "running", "planned", "planned"]);

    const realSwap = [real[1]!.id, real[0]!.id, real[2]!.id, real[3]!.id, real[4]!.id];
    expect((await reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: sectionIds[0]!, entry_ids: realSwap, expected_placement_revision: 0 })).placement_revision).toBe(1);
    const crossing = [real[1]!.id, real[3]!.id, real[2]!.id, real[0]!.id, real[4]!.id];
    await expect(reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: sectionIds[0]!, entry_ids: crossing, expected_placement_revision: 1 }))
      .rejects.toMatchObject({ code: "resource_conflict" });

    const nullSwap = [none[0]!.id, none[1]!.id, none[2]!.id, none[4]!.id, none[3]!.id];
    expect((await reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: null, entry_ids: nullSwap, expected_placement_revision: 1 })).placement_revision).toBe(2);
    const before = (await env.APP_DB.prepare(`SELECT id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
      AND section_id IS NULL ORDER BY position, id`).bind(userId, dayId).all()).results;
    await expect(reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: null, entry_ids: [none[0]!.id, none[3]!.id, none[2]!.id, none[1]!.id, none[4]!.id],
      expected_placement_revision: 2 })).rejects.toMatchObject({ code: "resource_conflict" });
    await expect(reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: null, entry_ids: nullSwap, expected_placement_revision: 1 }))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect((await env.APP_DB.prepare(`SELECT id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
      AND section_id IS NULL ORDER BY position, id`).bind(userId, dayId).all()).results).toEqual(before);
  });

  it("preserves gapped planned slots and historical numeric positions for Section and null groups", async () => {
    const { userId, sectionIds, now } = await seedUser(1);
    const dayId = await seedLegacyDay(userId, sectionIds, now);
    const sectioned = await seedEntries(userId, dayId, sectionIds[0]!, ["planned", "planned", "completed", "planned", "planned"]);
    const unsectioned = await seedEntries(userId, dayId, null, ["planned", "planned", "running", "planned", "planned"]);
    await setPositions(sectioned, [10, 20, 30, 50, 70]);
    await setPositions(unsectioned, [10, 20, 30, 50, 70]);

    const sectionRequest = { operation_id: uuidv7(), taskchute_day_id: dayId, section_id: sectionIds[0]!,
      entry_ids: [sectioned[1]!.id, sectioned[0]!.id, sectioned[2]!.id, sectioned[4]!.id, sectioned[3]!.id],
      expected_placement_revision: 0 };
    const sectionResult = await reorderEntries(env.APP_DB, userId, sectionRequest);
    expect(await reorderEntries(env.APP_DB, userId, sectionRequest)).toEqual(sectionResult);
    expect((await env.APP_DB.prepare(`SELECT id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
      AND section_id = ? ORDER BY position`).bind(userId, dayId, sectionIds[0]).all()).results).toEqual([
      { id: sectioned[1]!.id, position: 10 }, { id: sectioned[0]!.id, position: 20 },
      { id: sectioned[2]!.id, position: 30 }, { id: sectioned[4]!.id, position: 50 },
      { id: sectioned[3]!.id, position: 70 },
    ]);

    const nullRequest = { operation_id: uuidv7(), taskchute_day_id: dayId, section_id: null,
      entry_ids: [unsectioned[1]!.id, unsectioned[0]!.id, unsectioned[2]!.id, unsectioned[4]!.id, unsectioned[3]!.id],
      expected_placement_revision: 1 };
    expect((await reorderEntries(env.APP_DB, userId, nullRequest)).placement_revision).toBe(2);
    const after = (await env.APP_DB.prepare(`SELECT id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
      AND section_id IS NULL ORDER BY position`).bind(userId, dayId).all()).results;
    expect(after).toEqual([
      { id: unsectioned[1]!.id, position: 10 }, { id: unsectioned[0]!.id, position: 20 },
      { id: unsectioned[2]!.id, position: 30 }, { id: unsectioned[4]!.id, position: 50 },
      { id: unsectioned[3]!.id, position: 70 },
    ]);
    await expect(reorderEntries(env.APP_DB, userId, { ...nullRequest, operation_id: uuidv7(), expected_placement_revision: 1 }))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect((await env.APP_DB.prepare(`SELECT id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
      AND section_id IS NULL ORDER BY position`).bind(userId, dayId).all()).results).toEqual(after);
  });

  it("rejects mutation-time lifecycle races without position, revision, or successful operation writes", async () => {
    const sectioned = await seedUser(1);
    const sectionedDay = await seedLegacyDay(sectioned.userId, sectioned.sectionIds, sectioned.now);
    const sectionedRows = await seedEntries(sectioned.userId, sectionedDay, sectioned.sectionIds[0]!, ["planned", "planned"]);
    await setPositions(sectionedRows, [10, 20]);
    const sectionOperation = uuidv7();
    let sectionBatches = 0;
    const sectionRaceDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          sectionBatches += 1;
          if (sectionBatches === 2) await startEntry(target, sectioned.userId, {
            operation_id: uuidv7(), entry_id: sectionedRows[1]!.id, execution_id: uuidv7(),
          });
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(reorderEntries(sectionRaceDb, sectioned.userId, { operation_id: sectionOperation,
      taskchute_day_id: sectionedDay, section_id: sectioned.sectionIds[0]!,
      entry_ids: [sectionedRows[1]!.id, sectionedRows[0]!.id], expected_placement_revision: 0 }))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect((await env.APP_DB.prepare("SELECT id, position, lifecycle_state FROM entries WHERE id IN (?, ?) ORDER BY position")
      .bind(sectionedRows[0]!.id, sectionedRows[1]!.id).all()).results).toEqual([
      { id: sectionedRows[0]!.id, position: 10, lifecycle_state: "planned" },
      { id: sectionedRows[1]!.id, position: 20, lifecycle_state: "running" },
    ]);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(sectionedDay).first<number>("placement_revision")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM operations
      WHERE app_user_id = ? AND operation_id = ? AND outcome_kind = 'success'`)
      .bind(sectioned.userId, sectionOperation).first<number>("count")).toBe(0);

    const unsectioned = await seedUser(1);
    const unsectionedDay = await seedLegacyDay(unsectioned.userId, unsectioned.sectionIds, unsectioned.now);
    const unsectionedRows = await seedEntries(unsectioned.userId, unsectionedDay, null, ["planned", "planned"]);
    await setPositions(unsectionedRows, [10, 20]);
    let nullBatches = 0;
    const nullRaceDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          nullBatches += 1;
          if (nullBatches === 2) await target.prepare("UPDATE entries SET lifecycle_state = 'completed' WHERE id = ?")
            .bind(unsectionedRows[1]!.id).run();
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(reorderEntries(nullRaceDb, unsectioned.userId, { operation_id: uuidv7(),
      taskchute_day_id: unsectionedDay, section_id: null,
      entry_ids: [unsectionedRows[1]!.id, unsectionedRows[0]!.id], expected_placement_revision: 0 }))
      .rejects.toMatchObject({ code: "resource_conflict" });
    expect((await env.APP_DB.prepare("SELECT id, position, lifecycle_state FROM entries WHERE id IN (?, ?) ORDER BY position")
      .bind(unsectionedRows[0]!.id, unsectionedRows[1]!.id).all()).results).toEqual([
      { id: unsectionedRows[0]!.id, position: 10, lifecycle_state: "planned" },
      { id: unsectionedRows[1]!.id, position: 20, lifecycle_state: "completed" },
    ]);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(unsectionedDay).first<number>("placement_revision")).toBe(0);
  });

  it("converges configured and legacy Day context materialization under concurrent loads", async () => {
    for (const configured of [true, false]) {
      const { userId, sectionIds, now } = await seedUser(2);
      if (configured) {
        const versionId = uuidv7();
        await env.APP_DB.batch([
          env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 0, ?)")
            .bind(versionId, userId, now),
          ...sectionIds.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO section_configuration_items
            (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(userId, versionId, sectionId, `Section ${index + 1}`, index * 720, (index + 1) * 720, index)),
          env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
            .bind(userId, versionId),
        ]);
      }
      const projections = await Promise.all(Array.from({ length: 6 }, () =>
        loadCurrentTaskChuteDay(env.APP_DB, userId, now)));
      expect(new Set(projections.map((projection) => projection.taskchute_day.id)).size).toBe(1);
      expect(projections.every((projection) => projection.sections.length === 2)).toBe(true);
      const dayId = projections[0]!.taskchute_day.id;
      const contexts = await env.APP_DB.prepare(`SELECT section_id, configuration_version_id FROM taskchute_day_section_contexts
        WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`).bind(userId, dayId).all();
      expect(contexts.results).toHaveLength(2);
      expect(new Set(contexts.results.map((row) => (row as { section_id: string }).section_id)).size).toBe(2);
      expect(contexts.results.every((row) => configured
        ? (row as { configuration_version_id: string | null }).configuration_version_id !== null
        : (row as { configuration_version_id: string | null }).configuration_version_id === null)).toBe(true);
    }
  });

  it("keeps an established legacy Day context authoritative after current Section rename and reorder", async () => {
    const { userId, sectionIds, now } = await seedUser(2);
    const day = await materializeCurrentDay(env.APP_DB, userId, now);
    const before = (await env.APP_DB.prepare(`SELECT section_id, configuration_version_id, title,
      logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
      .bind(userId, day.id).all()).results;
    await env.APP_DB.batch([
      env.APP_DB.prepare("UPDATE sections SET sort_order = sort_order + 10 WHERE app_user_id = ?").bind(userId),
      env.APP_DB.prepare(`UPDATE sections SET title = CASE id WHEN ? THEN 'Current second' ELSE 'Current first' END,
        sort_order = CASE id WHEN ? THEN 1 ELSE 0 END WHERE app_user_id = ?`)
        .bind(sectionIds[0], sectionIds[0], userId),
    ]);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId, now);
    expect(projection.sections.map((section) => ({ id: section.id, title: section.title }))).toEqual([
      { id: sectionIds[0], title: "Section 1" }, { id: sectionIds[1], title: "Section 2" },
    ]);
    expect((await env.APP_DB.prepare(`SELECT section_id, configuration_version_id, title,
      logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order
      FROM taskchute_day_section_contexts WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`)
      .bind(userId, day.id).all()).results).toEqual(before);
  });

  it("uses configured stored actual intervals as authority while rejecting internal interval corruption", async () => {
    const { userId, sectionIds, now } = await seedUser(2);
    const day = await materializeCurrentDay(env.APP_DB, userId, now);
    await establishInitialSectionConfiguration(env.APP_DB, userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(), taskchute_day_id: day.id,
      items: [
        { section_id: sectionIds[0]!, logical_start_minute: 0, logical_end_minute: 720 },
        { section_id: sectionIds[1]!, logical_start_minute: 720, logical_end_minute: 1440 },
      ],
    }, now);
    const storedBoundary = "2026-08-28T13:00:00.000Z";
    await env.APP_DB.batch([
      env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts SET actual_end_instant = ?
        WHERE app_user_id = ? AND taskchute_day_id = ? AND context_order = 0`).bind(storedBoundary, userId, day.id),
      env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts SET actual_start_instant = ?
        WHERE app_user_id = ? AND taskchute_day_id = ? AND context_order = 1`).bind(storedBoundary, userId, day.id),
    ]);
    const projection = await loadCurrentTaskChuteDay(env.APP_DB, userId, now);
    expect(projection.sections[0]?.actual_end_instant).toBe(storedBoundary);
    expect(projection.sections[1]?.actual_start_instant).toBe(storedBoundary);

    await env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts SET actual_start_instant = '2026-08-28T13:30:00.000Z'
      WHERE app_user_id = ? AND taskchute_day_id = ? AND context_order = 1`).bind(userId, day.id).run();
    await expect(loadCurrentTaskChuteDay(env.APP_DB, userId, now)).rejects.toThrow("actual intervals are inconsistent");
    await env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts SET actual_start_instant = ?
      WHERE app_user_id = ? AND taskchute_day_id = ? AND context_order = 1`).bind(storedBoundary, userId, day.id).run();
    await env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts SET actual_start_instant = '2026-08-28T00:30:00.000Z'
      WHERE app_user_id = ? AND taskchute_day_id = ? AND context_order = 0`).bind(userId, day.id).run();
    await expect(loadCurrentTaskChuteDay(env.APP_DB, userId, now)).rejects.toThrow("actual intervals are inconsistent");
  });

  it("allows initial Section configuration only for the current unknown Day and replays after its boundary", async () => {
    const { userId, sectionIds, now } = await seedUser(2);
    const currentDay = await materializeCurrentDay(env.APP_DB, userId, now);
    const historicalDay = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO taskchute_days
        (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
         establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
        VALUES (?, ?, '2026-08-27', '2026-08-27T00:00:00.000Z', '2026-08-28T00:00:00.000Z',
          'UTC', 0, 'compatible', 0, ?)`).bind(historicalDay, userId, now),
      ...sectionIds.map((sectionId, index) => env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
        (app_user_id, taskchute_day_id, section_id, title, context_order) VALUES (?, ?, ?, ?, ?)`)
        .bind(userId, historicalDay, sectionId, `Historical ${index + 1}`, index)),
    ]);
    const historicalBefore = (await env.APP_DB.prepare(`SELECT * FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`).bind(userId, historicalDay).all()).results;
    const items = sectionIds.map((sectionId, index) => ({
      section_id: sectionId, logical_start_minute: index * 720, logical_end_minute: (index + 1) * 720,
    }));
    await expect(establishInitialSectionConfiguration(env.APP_DB, userId, {
      operation_id: uuidv7(), configuration_version_id: uuidv7(), taskchute_day_id: historicalDay, items,
    }, now)).rejects.toMatchObject({ code: "resource_conflict" });
    expect((await env.APP_DB.prepare(`SELECT * FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY context_order`).bind(userId, historicalDay).all()).results)
      .toEqual(historicalBefore);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM section_configuration_versions WHERE app_user_id = ?")
      .bind(userId).first<number>("count")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM section_configuration_heads WHERE app_user_id = ?")
      .bind(userId).first<number>("count")).toBe(0);

    const request = { operation_id: uuidv7(), configuration_version_id: uuidv7(),
      taskchute_day_id: currentDay.id, items };
    const first = await establishInitialSectionConfiguration(env.APP_DB, userId, request, now);
    expect(await establishInitialSectionConfiguration(env.APP_DB, userId, request, "2026-08-29T12:00:00.000Z"))
      .toEqual(first);
  });

  it("materializes and configures 60 Sections with bounded D1 statement counts", async () => {
    const { userId, sectionIds, now } = await seedUser(60);
    const materializationBatchSizes: number[] = [];
    const materializationDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          materializationBatchSizes.push(statements.length);
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const day = await materializeCurrentDay(materializationDb, userId, now);
    expect(materializationBatchSizes).toEqual([1]);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ?`).bind(userId, day.id).first<number>("count")).toBe(60);

    const configurationBatchSizes: number[] = [];
    const configurationDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          configurationBatchSizes.push(statements.length);
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const request = {
      operation_id: uuidv7(), configuration_version_id: uuidv7(), taskchute_day_id: day.id,
      items: sectionIds.map((sectionId, index) => ({
        section_id: sectionId, logical_start_minute: index * 24, logical_end_minute: (index + 1) * 24,
      })),
    };
    expect(isEstablishInitialSectionConfigurationRequest(request)).toBe(true);
    expect(await establishInitialSectionConfiguration(configurationDb, userId, request)).toEqual({
      configuration_version_id: request.configuration_version_id, taskchute_day_id: day.id,
    });
    expect(configurationBatchSizes).toEqual([4, 6]);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM section_configuration_items WHERE app_user_id = ?")
      .bind(userId).first<number>("count")).toBe(60);
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ? AND configuration_version_id = ?`)
      .bind(userId, day.id, request.configuration_version_id).first<number>("count")).toBe(60);
    expect((await loadCurrentTaskChuteDay(env.APP_DB, userId, now)).sections).toHaveLength(60);
  });

  it("accepts an established partial legacy snapshot and does not report success after a new insertion failure", async () => {
    const partial = await seedUser(2);
    const partialDay = await seedLegacyDay(partial.userId, [partial.sectionIds[0]!], partial.now);
    const partialProjection = await loadCurrentTaskChuteDay(env.APP_DB, partial.userId, partial.now);
    expect(partialProjection.sections.map((section) => section.id)).toEqual([partial.sectionIds[0]]);

    const failed = await seedUser(2);
    const failedDay = await seedLegacyDay(failed.userId, [], failed.now);
    const failingDb = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async () => { throw new Error("injected context batch failure"); };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(loadCurrentTaskChuteDay(failingDb, failed.userId, failed.now)).rejects.toThrow("injected context batch failure");
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM taskchute_day_section_contexts
      WHERE app_user_id = ? AND taskchute_day_id = ?`).bind(failed.userId, failedDay).first<number>("count")).toBe(0);
    expect(partialDay).not.toBe(failedDay);
  });

  it("moves without renumbering the old group and leaves stale attempts byte-for-byte unchanged", async () => {
    const { userId, sectionIds, now } = await seedUser(2);
    const dayId = await seedLegacyDay(userId, sectionIds, now);
    const source = await seedEntries(userId, dayId, sectionIds[0]!, ["planned", "planned", "planned"], 10);
    await env.APP_DB.prepare("UPDATE entries SET position = position * 10 - 90 WHERE app_user_id = ? AND taskchute_day_id = ? AND section_id = ?")
      .bind(userId, dayId, sectionIds[0]).run();
    await seedEntries(userId, dayId, sectionIds[1]!, ["completed"], 5);
    const request = { operation_id: uuidv7(), entry_id: source[1]!.id, taskchute_day_id: dayId,
      section_id: sectionIds[1]!, expected_placement_revision: 0 };
    const moved = await moveEntry(env.APP_DB, userId, request);
    expect(await moveEntry(env.APP_DB, userId, request)).toEqual(moved);
    expect(moved).toMatchObject({ position: 6, placement_revision: 1 });
    expect((await env.APP_DB.prepare(`SELECT id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ?
      AND section_id = ? ORDER BY position`).bind(userId, dayId, sectionIds[0]).all()).results)
      .toEqual([{ id: source[0]!.id, position: 10 }, { id: source[2]!.id, position: 30 }]);
    const before = (await env.APP_DB.prepare("SELECT id, section_id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY id")
      .bind(userId, dayId).all()).results;
    await expect(moveEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: source[0]!.id,
      taskchute_day_id: dayId, section_id: sectionIds[1]!, expected_placement_revision: 0 }))
      .rejects.toMatchObject({ code: "revision_conflict" });
    expect((await env.APP_DB.prepare("SELECT id, section_id, position FROM entries WHERE app_user_id = ? AND taskchute_day_id = ? ORDER BY id")
      .bind(userId, dayId).all()).results).toEqual(before);
  });

  it("validates real Sections against the Day context and never drops an out-of-context Entry from projection", async () => {
    const { userId, sectionIds, now } = await seedUser(3);
    const dayId = await seedLegacyDay(userId, sectionIds.slice(0, 2), now);
    const valid = { operation_id: uuidv7(), task_id: uuidv7(), entry_id: uuidv7(), project_id: null,
      title: "Valid context", taskchute_day_id: dayId, section_id: sectionIds[0]!, expected_placement_revision: 0 };
    expect((await addTaskToDay(env.APP_DB, userId, valid)).placement_revision).toBe(1);
    const absent = { ...valid, operation_id: uuidv7(), task_id: uuidv7(), entry_id: uuidv7(), title: "Absent context",
      section_id: sectionIds[2]!, expected_placement_revision: 1 };
    await expect(addTaskToDay(env.APP_DB, userId, absent)).rejects.toMatchObject({ code: "resource_not_found" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE id = ? OR id = ?")
      .bind(absent.task_id, absent.entry_id).first<number>("count")).toBe(0);
    await expect(moveEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: valid.entry_id,
      taskchute_day_id: dayId, section_id: sectionIds[2]!, expected_placement_revision: 1 }))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const other = await seedUser(1);
    await expect(moveEntry(env.APP_DB, userId, { operation_id: uuidv7(), entry_id: valid.entry_id,
      taskchute_day_id: dayId, section_id: other.sectionIds[0]!, expected_placement_revision: 1 }))
      .rejects.toMatchObject({ code: "resource_conflict" });
    const corruptTask = uuidv7();
    const corruptEntry = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Corrupt context', ?)")
        .bind(corruptTask, userId, now),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at)
        VALUES (?, ?, ?, ?, ?, 1, 'planned', ?)`)
        .bind(corruptEntry, userId, corruptTask, dayId, sectionIds[2], now),
    ]);
    await expect(reorderEntries(env.APP_DB, userId, { operation_id: uuidv7(), taskchute_day_id: dayId,
      section_id: sectionIds[2]!, entry_ids: [corruptEntry], expected_placement_revision: 1 }))
      .rejects.toMatchObject({ code: "resource_not_found" });
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(dayId).first<number>("placement_revision")).toBe(1);
    await expect(loadCurrentTaskChuteDay(env.APP_DB, userId, now)).rejects.toThrow();
  });

  it("makes unsectioned Start placement-atomic while sectioned Start remains lifecycle-only", async () => {
    const unsectioned = await seedUser(1);
    const dayId = await seedLegacyDay(unsectioned.userId, unsectioned.sectionIds, unsectioned.now);
    await env.APP_DB.prepare(`UPDATE taskchute_day_section_contexts SET logical_start_minute = 0, logical_end_minute = 1440,
      actual_start_instant = '2026-08-28T00:00:00.000Z', actual_end_instant = '2026-08-29T00:00:00.000Z'
      WHERE app_user_id = ? AND taskchute_day_id = ?`).bind(unsectioned.userId, dayId).run();
    const [entry] = await seedEntries(unsectioned.userId, dayId, null, ["planned"]);
    await expect(startEntry(env.APP_DB, unsectioned.userId, { operation_id: uuidv7(), entry_id: entry!.id,
      execution_id: uuidv7() })).rejects.toMatchObject({ code: "resource_conflict" });
    const stale = { operation_id: uuidv7(), entry_id: entry!.id, execution_id: uuidv7(), expected_placement_revision: 1 };
    await expect(startEntry(env.APP_DB, unsectioned.userId, stale)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT lifecycle_state, section_id FROM entries WHERE id = ?").bind(entry!.id).first())
      .toMatchObject({ lifecycle_state: "planned", section_id: null });

    const raced = { operation_id: uuidv7(), entry_id: entry!.id, execution_id: uuidv7(), expected_placement_revision: 0 };
    let batches = 0;
    const interleaved = new Proxy(env.APP_DB, {
      get(target, property) {
        if (property === "batch") return async (statements: D1PreparedStatement[]) => {
          batches += 1;
          if (batches === 2) await target.prepare("UPDATE taskchute_days SET placement_revision = 1 WHERE id = ?").bind(dayId).run();
          return target.batch(statements);
        };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(startEntry(interleaved, unsectioned.userId, raced)).rejects.toMatchObject({ code: "revision_conflict" });
    await expect(startEntry(env.APP_DB, unsectioned.userId, raced)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE entry_id = ?").bind(entry!.id).first<number>("count")).toBe(0);
    const fresh = { operation_id: uuidv7(), entry_id: entry!.id, execution_id: uuidv7(), expected_placement_revision: 1 };
    const started = await startEntry(env.APP_DB, unsectioned.userId, fresh);
    expect(started.placement_revision).toBe(2);
    expect(await startEntry(env.APP_DB, unsectioned.userId, fresh)).toEqual(started);

    const sectioned = await seedUser(1);
    const sectionedDay = await seedLegacyDay(sectioned.userId, sectioned.sectionIds, sectioned.now, 7);
    const [sectionedEntry] = await seedEntries(sectioned.userId, sectionedDay, sectioned.sectionIds[0]!, ["planned"]);
    const nonCanonicalOperation = uuidv7();
    await expect(startEntry(env.APP_DB, sectioned.userId, { operation_id: nonCanonicalOperation,
      entry_id: sectionedEntry!.id, execution_id: uuidv7(), expected_placement_revision: 7 }))
      .rejects.toMatchObject({ status: 400, code: "malformed_request" });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(sectioned.userId, nonCanonicalOperation).first<number>("count")).toBe(0);
    const lifecycleOnly = await startEntry(env.APP_DB, sectioned.userId, { operation_id: uuidv7(),
      entry_id: sectionedEntry!.id, execution_id: uuidv7() });
    expect(lifecycleOnly.placement_revision).toBeNull();
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(sectionedDay).first<number>("placement_revision")).toBe(7);
  });

  it("replays a pre-B1 sectioned Start operation with its legacy request and result shape", async () => {
    const { userId, sectionIds, now } = await seedUser(1);
    const dayId = await seedLegacyDay(userId, sectionIds, now, 7);
    const [entry] = await seedEntries(userId, dayId, sectionIds[0]!, ["running"]);
    const legacyRequest = { operation_id: uuidv7(), entry_id: entry!.id, execution_id: uuidv7() };
    const legacyResult: StartEntryResult = { entry_id: entry!.id, lifecycle_state: "running", execution: {
      id: legacyRequest.execution_id, entry_id: entry!.id, started_at: now, ended_at: null,
    } };
    expect(isStartEntryRequest(legacyRequest)).toBe(true);
    expect(isStartEntryRequest({ ...legacyRequest, expected_placement_revision: null })).toBe(false);
    expect("expected_placement_revision" in legacyRequest).toBe(false);
    const legacyFingerprint = await fingerprint(legacyRequest);
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
        VALUES (?, ?, ?, ?, NULL, ?)`).bind(legacyRequest.execution_id, userId, entry!.id, now, now),
      env.APP_DB.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
         outcome_kind, result_json, created_at) VALUES (?, ?, 'StartEntry', 1, ?, 'success', ?, ?)`)
        .bind(userId, legacyRequest.operation_id, legacyFingerprint, JSON.stringify(legacyResult), now),
    ]);
    expect(await startEntry(env.APP_DB, userId, legacyRequest)).toEqual(legacyResult);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS count FROM executions WHERE entry_id = ?")
      .bind(entry!.id).first<number>("count")).toBe(1);
    expect(await env.APP_DB.prepare("SELECT placement_revision FROM taskchute_days WHERE id = ?")
      .bind(dayId).first<number>("placement_revision")).toBe(7);
  });
});
