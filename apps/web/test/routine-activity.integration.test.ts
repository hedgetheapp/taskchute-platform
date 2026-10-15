import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/uuidv7";
import { loadReviewRoutineActivity, reviewDateMetricRange } from "../worker/application/review-date-metrics";

const now = "2026-10-14T02:00:00.000Z";
const D178_GATE_D_ROLLBACK_SENTINEL_TABLE = "d178_gate_d_rollback_sentinel_20261015";

async function seedOwner() {
  const appUserId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(appUserId, now),
    env.APP_DB.prepare(`INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at)
      VALUES (?, 'UTC', 0, ?)`)
      .bind(appUserId, now),
  ]);
  return appUserId;
}

async function seedTask(appUserId: string, title = "Routine activity fixture") {
  const taskId = uuidv7();
  await env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
    .bind(taskId, appUserId, title, now).run();
  return taskId;
}

async function insertLegacyRoutine(appUserId: string, taskId: string, createdAt = now) {
  const routineId = uuidv7();
  const materializationOrder = await env.APP_DB.prepare(`SELECT COALESCE(MAX(materialization_order), 0) + 1 AS value
    FROM routine_definitions WHERE app_user_id = ?`).bind(appUserId).first<number>("value");
  await env.APP_DB.prepare(`INSERT INTO routine_definitions
    (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
     default_section_id, default_estimate_seconds, default_planned_start_minute,
     materialization_order, created_at)
    VALUES (?, ?, ?, 'daily', '2026-10-14', NULL, NULL, NULL, NULL, ?, ?)`)
    .bind(routineId, appUserId, taskId, materializationOrder, createdAt).run();
  return routineId;
}

async function activateOwner(appUserId: string, startedAt = now, startedLogicalDate = "2026-10-14") {
  await env.APP_DB.prepare(`INSERT INTO routine_activity_coverage
    (app_user_id, started_at, started_logical_date) VALUES (?, ?, ?)`)
    .bind(appUserId, startedAt, startedLogicalDate).run();
}

describe.sequential("D-178 Routine activity coverage and DB guard", () => {
  it("keeps NULL-marker owners and legacy rows compatible, then rejects old writes atomically after activation", async () => {
    const appUserId = await seedOwner();
    const legacyTaskId = await seedTask(appUserId, "Legacy pre-marker task");
    const legacyRoutineId = await insertLegacyRoutine(appUserId, legacyTaskId, "2026-10-13T23:00:00.000Z");
    const deletableTaskId = await seedTask(appUserId, "Legacy Routine to delete");
    const deletableRoutineId = await insertLegacyRoutine(appUserId, deletableTaskId, "2026-10-13T23:15:00.000Z");
    expect(await env.APP_DB.prepare(`SELECT created_logical_date FROM routine_definitions
      WHERE app_user_id = ? AND id = ?`).bind(appUserId, legacyRoutineId).first())
      .toEqual({ created_logical_date: null });

    const archiveAt = "2026-10-13T23:30:00.000Z";
    await env.APP_DB.prepare(`INSERT INTO routine_definition_archives
      (app_user_id, routine_definition_id, archived_at) VALUES (?, ?, ?)`)
      .bind(appUserId, legacyRoutineId, archiveAt).run();
    expect(await env.APP_DB.prepare(`SELECT deleted_logical_date FROM routine_definition_archives
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(appUserId, legacyRoutineId).first())
      .toEqual({ deleted_logical_date: null });

    const activatedAt = "2026-10-14T02:00:00.000Z";
    await activateOwner(appUserId, activatedAt);

    const rejectedTaskId = uuidv7();
    const rejectedRoutineId = uuidv7();
    const rejectedCreateOperationId = uuidv7();
    await expect(env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, 'Old Worker', ?)`)
        .bind(rejectedTaskId, appUserId, activatedAt),
      // This is the exact old-Worker INSERT shape: created_logical_date omitted.
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute,
         materialization_order, created_at)
        VALUES (?, ?, ?, 'daily', '2026-10-14', NULL, NULL, NULL, NULL, 2, ?)`)
        .bind(rejectedRoutineId, appUserId, rejectedTaskId, activatedAt),
      env.APP_DB.prepare(`UPDATE routine_board_heads SET board_revision = board_revision + 1
        WHERE app_user_id = ?`).bind(appUserId),
      env.APP_DB.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version,
         request_fingerprint, outcome_kind, result_json, created_at)
        VALUES (?, ?, 'CreateRoutine', 1, 'fingerprint', 'success', '{}', ?)`)
        .bind(appUserId, rejectedCreateOperationId, activatedAt),
    ])).rejects.toThrow(/routine_activity_date_required/);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, rejectedTaskId).first<number>("value")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, rejectedRoutineId).first<number>("value")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(appUserId).first<number>("board_revision")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, rejectedCreateOperationId).first<number>("value")).toBe(0);

    const rejectedArchiveAt = "2026-10-14T03:00:00.000Z";
    await expect(env.APP_DB.batch([
      env.APP_DB.prepare("UPDATE tasks SET title = 'must roll back' WHERE app_user_id = ? AND id = ?")
        .bind(appUserId, legacyTaskId),
      env.APP_DB.prepare("UPDATE routine_board_heads SET board_revision = board_revision + 1 WHERE app_user_id = ?")
        .bind(appUserId),
      env.APP_DB.prepare(`INSERT INTO operations
        (app_user_id, operation_id, command_type, request_fingerprint_version,
         request_fingerprint, outcome_kind, result_json, created_at)
        VALUES (?, ?, 'DeleteRoutine', 1, 'fingerprint', 'success', '{}', ?)`)
        .bind(appUserId, uuidv7(), rejectedArchiveAt),
      env.APP_DB.prepare(`INSERT INTO routine_definition_archives
        (app_user_id, routine_definition_id, archived_at) VALUES (?, ?, ?)`)
        .bind(appUserId, deletableRoutineId, rejectedArchiveAt),
    ])).rejects.toThrow(/routine_activity_date_required/);
    expect(await env.APP_DB.prepare("SELECT title FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, legacyTaskId).first<string>("title")).toBe("Legacy pre-marker task");
    expect(await env.APP_DB.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(appUserId).first<number>("board_revision")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM operations WHERE app_user_id = ?")
      .bind(appUserId).first<number>("value")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT archived_at, deleted_logical_date FROM routine_definition_archives
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(appUserId, legacyRoutineId).first())
      .toEqual({ archived_at: archiveAt, deleted_logical_date: null });
    expect(await env.APP_DB.prepare(`SELECT COUNT(*) AS value FROM routine_definition_archives
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(appUserId, deletableRoutineId)
      .first<number>("value")).toBe(0);

    await expect(env.APP_DB.prepare(`UPDATE routine_activity_coverage SET started_at = ? WHERE app_user_id = ?`)
      .bind(activatedAt, appUserId).run())
      .rejects.toThrow(/routine_activity_marker_immutable/);
    await expect(env.APP_DB.prepare(`DELETE FROM routine_activity_coverage WHERE app_user_id = ?`)
      .bind(appUserId).run())
      .rejects.toThrow(/routine_activity_marker_immutable/);
    await expect(env.APP_DB.prepare(`INSERT OR REPLACE INTO routine_activity_coverage
      (app_user_id, started_at, started_logical_date) VALUES (?, ?, ?)`)
      .bind(appUserId, "2026-10-15T02:00:00.000Z", "2026-10-15").run())
      .rejects.toThrow(/routine_activity_marker_immutable/);

    const otherOwner = await seedOwner();
    const otherTaskId = await seedTask(otherOwner);
    await expect(insertLegacyRoutine(otherOwner, otherTaskId)).resolves.toBeTruthy();
  });

  it("rolls back a diagnostic batch when the expected owner guard does not reject", async () => {
    const appUserId = await seedOwner();
    const taskId = uuidv7();
    const routineId = uuidv7();
    const operationId = uuidv7();
    const boardBefore = await env.APP_DB.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(appUserId).first<number>("board_revision");
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM routine_activity_coverage WHERE app_user_id = ?")
      .bind(appUserId).first<number>("value")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .bind(D178_GATE_D_ROLLBACK_SENTINEL_TABLE).first<number>("value")).toBe(0);

    await expect(env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
        .bind(taskId, appUserId, "Rollback-only diagnostic", now),
      env.APP_DB.prepare("INSERT INTO routine_definitions " +
        "(id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date, " +
        "default_section_id, default_estimate_seconds, default_planned_start_minute, materialization_order, created_at) " +
        "VALUES (?, ?, ?, 'daily', '2026-10-14', NULL, NULL, NULL, NULL, " +
        "(SELECT COALESCE(MAX(materialization_order), 0) + 1 FROM routine_definitions WHERE app_user_id = ?), ?)")
        .bind(routineId, appUserId, taskId, appUserId, now),
      env.APP_DB.prepare("UPDATE routine_board_heads SET board_revision = board_revision + 1 WHERE app_user_id = ?")
        .bind(appUserId),
      env.APP_DB.prepare("INSERT INTO operations " +
        "(app_user_id, operation_id, command_type, request_fingerprint_version, " +
        "request_fingerprint, outcome_kind, result_json, created_at) " +
        "VALUES (?, ?, 'CreateRoutine', 1, 'rollback-diagnostic', 'success', '{}', ?)")
        .bind(appUserId, operationId, now),
      env.APP_DB.prepare("INSERT INTO " + D178_GATE_D_ROLLBACK_SENTINEL_TABLE + " (id) VALUES (1)"),
    ])).rejects.toThrow(new RegExp(D178_GATE_D_ROLLBACK_SENTINEL_TABLE));

    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM tasks WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, taskId).first<number>("value")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM routine_definitions WHERE app_user_id = ? AND id = ?")
      .bind(appUserId, routineId).first<number>("value")).toBe(0);
    expect(await env.APP_DB.prepare("SELECT board_revision FROM routine_board_heads WHERE app_user_id = ?")
      .bind(appUserId).first<number>("board_revision")).toBe(boardBefore);
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM operations WHERE app_user_id = ? AND operation_id = ?")
      .bind(appUserId, operationId).first<number>("value")).toBe(0);
  });

  it("reports unmeasured, partial, and complete counts without Days, backfill, or read side effects", async () => {
    const appUserId = await seedOwner();
    const taskId = await seedTask(appUserId);
    const legacyRoutineId = await insertLegacyRoutine(appUserId, taskId, "2026-10-14T01:00:00.000Z");
    const preActivationTaskId = await seedTask(appUserId, "Compatible Worker before activation");
    const preActivationRoutineId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare(`INSERT INTO routine_definitions
        (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
         default_section_id, default_estimate_seconds, default_planned_start_minute,
         materialization_order, created_at, created_logical_date)
        VALUES (?, ?, ?, 'daily', '2026-10-14', NULL, NULL, NULL, NULL, 2, ?, '2026-10-14')`)
        .bind(preActivationRoutineId, appUserId, preActivationTaskId, "2026-10-14T01:30:00.000Z"),
      env.APP_DB.prepare(`INSERT INTO routine_definition_archives
        (app_user_id, routine_definition_id, archived_at, deleted_logical_date)
        VALUES (?, ?, ?, '2026-10-14')`)
        .bind(appUserId, preActivationRoutineId, "2026-10-14T01:45:00.000Z"),
    ]);
    const unmeasured = await loadReviewRoutineActivity(env.APP_DB, appUserId,
      reviewDateMetricRange("daily", "2026-10-14")!);
    expect(unmeasured).toEqual({
      coverage_status: "UNMEASURED", created_count: null, deleted_count: null,
      coverage_started_at: null, coverage_started_logical_date: null,
    });

    const activatedAt = "2026-10-14T02:00:00.000Z";
    await activateOwner(appUserId, activatedAt);
    const currentTaskId = await seedTask(appUserId, "After activation");
    const currentRoutineId = uuidv7();
    await env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute,
       materialization_order, created_at, created_logical_date)
      VALUES (?, ?, ?, 'daily', '2026-10-15', NULL, NULL, NULL, NULL, 3, ?, '2026-10-14')`)
      .bind(currentRoutineId, appUserId, currentTaskId, "2026-10-14T03:00:00.000Z").run();
    await env.APP_DB.prepare(`INSERT INTO routine_definition_archives
      (app_user_id, routine_definition_id, archived_at, deleted_logical_date)
      VALUES (?, ?, ?, '2026-10-14')`)
      .bind(appUserId, currentRoutineId, "2026-10-14T04:00:00.000Z").run();
    await env.APP_DB.prepare(`UPDATE user_settings SET timezone = 'Asia/Tokyo', day_boundary_minutes = 240
      WHERE app_user_id = ?`).bind(appUserId).run();
    expect(await env.APP_DB.prepare(`SELECT created_logical_date FROM routine_definitions
      WHERE app_user_id = ? AND id = ?`).bind(appUserId, currentRoutineId).first<string>("created_logical_date"))
      .toBe("2026-10-14");
    await expect(env.APP_DB.prepare(`UPDATE routine_definitions SET created_logical_date = '2026-10-15'
      WHERE app_user_id = ? AND id = ?`).bind(appUserId, currentRoutineId).run())
      .rejects.toThrow(/routine_activity_date_immutable/);
    await expect(env.APP_DB.prepare(`UPDATE routine_definition_archives SET deleted_logical_date = '2026-10-15'
      WHERE app_user_id = ? AND routine_definition_id = ?`).bind(appUserId, currentRoutineId).run())
      .rejects.toThrow(/routine_activity_date_immutable/);

    const otherOwner = await seedOwner();
    await activateOwner(otherOwner, activatedAt);
    const otherTaskId = await seedTask(otherOwner, "Other owner");
    await env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute,
       materialization_order, created_at, created_logical_date)
      VALUES (?, ?, ?, 'daily', '2026-10-15', NULL, NULL, NULL, NULL, 1, ?, '2026-10-14')`)
      .bind(uuidv7(), otherOwner, otherTaskId, "2026-10-14T03:30:00.000Z").run();

    const priorDate = await loadReviewRoutineActivity(env.APP_DB, appUserId,
      reviewDateMetricRange("daily", "2026-10-13")!);
    expect(priorDate).toMatchObject({ coverage_status: "UNMEASURED", created_count: null, deleted_count: null });
    const dailyPartial = await loadReviewRoutineActivity(env.APP_DB, appUserId,
      reviewDateMetricRange("daily", "2026-10-14")!);
    expect(dailyPartial).toEqual({
      coverage_status: "PARTIAL", created_count: 1, deleted_count: 1,
      coverage_started_at: activatedAt, coverage_started_logical_date: "2026-10-14",
    });
    expect(await loadReviewRoutineActivity(env.APP_DB, otherOwner,
      reviewDateMetricRange("daily", "2026-10-14")!))
      .toMatchObject({ coverage_status: "PARTIAL", created_count: 1, deleted_count: 0 });
    const monthPartial = await loadReviewRoutineActivity(env.APP_DB, appUserId,
      reviewDateMetricRange("monthly", "2026-10-01")!);
    expect(monthPartial).toMatchObject({ coverage_status: "PARTIAL", created_count: 1, deleted_count: 1 });
    const fullyCoveredZero = await loadReviewRoutineActivity(env.APP_DB, appUserId,
      reviewDateMetricRange("monthly", "2026-11-01")!);
    expect(fullyCoveredZero).toMatchObject({ coverage_status: "COMPLETE", created_count: 0, deleted_count: 0 });
    const yearPartial = await loadReviewRoutineActivity(env.APP_DB, appUserId,
      reviewDateMetricRange("yearly", "2026-01-01")!);
    expect(yearPartial).toMatchObject({ coverage_status: "PARTIAL", created_count: 1, deleted_count: 1 });
    expect(await env.APP_DB.prepare("SELECT COUNT(*) AS value FROM taskchute_days WHERE app_user_id = ?")
      .bind(appUserId).first<number>("value")).toBe(0);
    expect(await env.APP_DB.prepare(`SELECT created_logical_date FROM routine_definitions
      WHERE app_user_id = ? AND id = ?`).bind(appUserId, legacyRoutineId).first())
      .toEqual({ created_logical_date: null });
  });

  it("does not mark the last representable year complete when its coverage slack is out of range", async () => {
    const appUserId = await seedOwner();
    await activateOwner(appUserId, "9999-12-31T23:59:59.000Z", "9999-12-31");
    const activity = await loadReviewRoutineActivity(env.APP_DB, appUserId,
      reviewDateMetricRange("yearly", "9999-01-01")!);
    expect(activity).toMatchObject({ coverage_status: "PARTIAL", created_count: 0, deleted_count: 0 });
  });

  it("uses the owner/date activity indexes for its bounded aggregate predicates", async () => {
    const createdPlan = await env.APP_DB.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*)
      FROM routine_definitions WHERE app_user_id = ? AND created_logical_date >= ?
        AND created_logical_date < ?`).bind("owner", "2026-10-01", "2026-11-01").all<{ detail: string }>();
    const deletedPlan = await env.APP_DB.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*)
      FROM routine_definition_archives WHERE app_user_id = ? AND deleted_logical_date >= ?
        AND deleted_logical_date < ?`).bind("owner", "2026-10-01", "2026-11-01").all<{ detail: string }>();
    expect(createdPlan.results.map((row) => row.detail).join(" ")).toContain("routine_definitions_activity_date");
    expect(deletedPlan.results.map((row) => row.detail).join(" ")).toContain("routine_definition_archives_activity_date");
  });
});
