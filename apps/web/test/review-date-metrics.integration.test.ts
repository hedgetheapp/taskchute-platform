import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { setExecutionTimes } from "../worker/application/execution-correction";
import { loadTaskChuteDayByLogicalDate } from "../worker/application/load-current-day";
import { loadReviewDateMetrics, reviewDateMetricRange } from "../worker/application/review-date-metrics";
import { uuidv7 } from "../src/shared/uuidv7";

const createdAt = "2026-10-13T00:00:00.000Z";

async function seedUser() {
  const userId = uuidv7();
  await env.APP_DB.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").bind(userId, createdAt).run();
  return userId;
}

async function seedDay(userId: string, logicalDate: string) {
  const dayId = uuidv7();
  const start = new Date(`${logicalDate}T05:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  await env.APP_DB.prepare(`INSERT INTO taskchute_days
    (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
     establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
    VALUES (?, ?, ?, ?, ?, 'UTC', 300, 'compatible', 0, ?)`)
    .bind(dayId, userId, logicalDate, start.toISOString(), end.toISOString(), createdAt).run();
  return dayId;
}

async function seedTask(userId: string, title = "Review metrics fixture") {
  const taskId = uuidv7();
  await env.APP_DB.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
    .bind(taskId, userId, title, createdAt).run();
  return taskId;
}

async function nextEntryPosition(userId: string, dayId: string) {
  return (await env.APP_DB.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS position FROM entries
    WHERE app_user_id = ? AND taskchute_day_id = ?`).bind(userId, dayId).first<number>("position")) ?? 1;
}

async function seedEntry(
  userId: string,
  dayId: string,
  taskId: string,
  lifecycle: "planned" | "running" | "completed",
  routineOccurrenceId: string | null = null,
) {
  const entryId = uuidv7();
  const position = await nextEntryPosition(userId, dayId);
  await env.APP_DB.prepare(`INSERT INTO entries
    (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
     estimate_seconds, created_at, routine_occurrence_id)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 1200, ?, ?)`)
    .bind(entryId, userId, taskId, dayId, position, lifecycle, createdAt, routineOccurrenceId).run();
  return entryId;
}

async function seedExecution(
  userId: string,
  entryId: string,
  startedAt: string,
  endedAt: string | null,
  outcome: "completed" | "interrupted" | null = endedAt === null ? null : "completed",
) {
  await env.APP_DB.prepare(`INSERT INTO executions
    (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(uuidv7(), userId, entryId, startedAt, endedAt, createdAt, outcome).run();
}

async function seedSuppressedRoutineEntry(userId: string, dayId: string) {
  const taskId = await seedTask(userId, "Suppressed Routine");
  const definitionId = uuidv7();
  const occurrenceId = uuidv7();
  await env.APP_DB.batch([
    env.APP_DB.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute,
       materialization_order, created_at)
      VALUES (?, ?, ?, 'daily', '2024-02-01', NULL, NULL, NULL, NULL, 1, ?)`)
      .bind(definitionId, userId, taskId, createdAt),
    env.APP_DB.prepare(`INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id,
       section_plan_override_present, section_override_id, planned_start_override_minute,
       estimate_override_present, estimate_override_seconds, created_at)
      VALUES (?, ?, ?, ?, 0, NULL, NULL, 0, NULL, ?)`)
      .bind(occurrenceId, userId, definitionId, dayId, createdAt),
    env.APP_DB.prepare(`INSERT INTO routine_occurrence_suppressions
      (app_user_id, routine_occurrence_id, suppressed_at, reason)
      VALUES (?, ?, ?, 'schedule')`).bind(userId, occurrenceId, createdAt),
  ]);
  await seedEntry(userId, dayId, taskId, "planned", occurrenceId);
}

async function scopedCounts(userId: string) {
  const tables = ["taskchute_days", "entries", "executions", "routine_occurrences", "routine_occurrence_suppressions", "operations"];
  return Object.fromEntries(await Promise.all(tables.map(async (table) => [table,
    await env.APP_DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE app_user_id = ?`)
      .bind(userId).first<number>("count")]))) as Record<string, number | null>;
}

describe.sequential("D-178 Date monthly/yearly metrics", () => {
  it("validates canonical month/year anchors and uses calendar half-open ranges", () => {
    expect(reviewDateMetricRange("monthly", "2024-02-01")).toMatchObject({
      startLogicalDate: "2024-02-01", endLogicalDateExclusive: "2024-03-01",
    });
    expect(reviewDateMetricRange("yearly", "2024-01-01")).toMatchObject({
      startLogicalDate: "2024-01-01", endLogicalDateExclusive: "2025-01-01",
    });
    expect(reviewDateMetricRange("monthly", "2024-02-02")).toBeNull();
    expect(reviewDateMetricRange("monthly", "2023-02-31")).toBeNull();
    expect(reviewDateMetricRange("yearly", "2024-02-01")).toBeNull();
    expect(reviewDateMetricRange("daily", "2024-02-01")).toBeNull();
    expect(reviewDateMetricRange("yearly", "9999-01-01")?.endLogicalDateExclusive).toBeNull();
  });

  it("scopes owners and persisted Days, deduplicates Entry identity, excludes Running/suppressed Entries, and only reads", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const decLast = await seedDay(userId, "2023-12-31");
    const janFirst = await seedDay(userId, "2024-01-01");
    const febFirst = await seedDay(userId, "2024-02-01");
    const febLeapDay = await seedDay(userId, "2024-02-29");
    const marchFirst = await seedDay(userId, "2024-03-01");
    await seedDay(userId, "2024-05-01");
    const otherLeapDay = await seedDay(otherUserId, "2024-02-29");
    const sharedTaskId = await seedTask(userId, "Two distinct Entries, one Task");
    const yearBoundaryEntry = await seedEntry(userId, decLast, sharedTaskId, "planned");
    const firstCompleted = await seedEntry(userId, febFirst, sharedTaskId, "completed");
    await seedExecution(userId, firstCompleted, "2024-02-01T06:00:00.000Z", "2024-02-01T06:02:00.000Z");
    const leapCompleted = await seedEntry(userId, febLeapDay, sharedTaskId, "completed");
    await seedExecution(userId, leapCompleted, "2024-02-29T23:58:00.000Z", "2024-03-01T00:04:00.000Z");
    await seedExecution(userId, leapCompleted, "2024-03-01T00:05:00.000Z", "2024-03-01T00:10:00.000Z", "interrupted");
    const marchCompleted = await seedEntry(userId, marchFirst, sharedTaskId, "completed");
    await seedExecution(userId, marchCompleted, "2024-03-01T06:00:00.000Z", "2024-03-01T06:01:00.000Z");
    const plannedEntry = await seedEntry(userId, febFirst, sharedTaskId, "planned");
    await seedEntry(userId, febLeapDay, sharedTaskId, "running");
    await seedSuppressedRoutineEntry(userId, febFirst);
    const otherTaskId = await seedTask(otherUserId);
    const otherCompleted = await seedEntry(otherUserId, otherLeapDay, otherTaskId, "completed");
    await seedExecution(otherUserId, otherCompleted, "2024-02-29T06:00:00.000Z", "2024-02-29T06:16:39.000Z");

    const before = await scopedCounts(userId);
    const february = await loadReviewDateMetrics(env.APP_DB, userId,
      reviewDateMetricRange("monthly", "2024-02-01")!);
    expect(february).toEqual({
      period_granularity: "monthly", period_anchor: "2024-02-01", established_day_count: 2,
      completed_count: 2, unexecuted_count: 1, completed_actual_duration_seconds: 780,
    });
    expect(await scopedCounts(userId)).toEqual(before);

    const year = await loadReviewDateMetrics(env.APP_DB, userId,
      reviewDateMetricRange("yearly", "2024-01-01")!);
    expect(year).toMatchObject({ established_day_count: 5, completed_count: 3, unexecuted_count: 1,
      completed_actual_duration_seconds: 840 });
    const march = await loadReviewDateMetrics(env.APP_DB, userId,
      reviewDateMetricRange("monthly", "2024-03-01")!);
    expect(march).toMatchObject({ established_day_count: 1, completed_count: 1, unexecuted_count: 0,
      completed_actual_duration_seconds: 60 });

    await env.APP_DB.prepare("UPDATE entries SET taskchute_day_id = ?, position = ? WHERE app_user_id = ? AND id = ?")
      .bind(febLeapDay, await nextEntryPosition(userId, febLeapDay), userId, plannedEntry).run();
    expect((await loadReviewDateMetrics(env.APP_DB, userId, reviewDateMetricRange("monthly", "2024-02-01")!))
      .unexecuted_count).toBe(1);
    await env.APP_DB.prepare("UPDATE entries SET taskchute_day_id = ?, position = ? WHERE app_user_id = ? AND id = ?")
      .bind(marchFirst, await nextEntryPosition(userId, marchFirst), userId, plannedEntry).run();
    expect((await loadReviewDateMetrics(env.APP_DB, userId, reviewDateMetricRange("monthly", "2024-02-01")!))
      .unexecuted_count).toBe(0);
    expect((await loadReviewDateMetrics(env.APP_DB, userId, reviewDateMetricRange("monthly", "2024-03-01")!))
      .unexecuted_count).toBe(1);
    expect((await loadReviewDateMetrics(env.APP_DB, otherUserId, reviewDateMetricRange("monthly", "2024-02-01")!))
      .completed_actual_duration_seconds).toBe(999);
    const december = await loadReviewDateMetrics(env.APP_DB, userId,
      reviewDateMetricRange("monthly", "2023-12-01")!);
    expect(december).toMatchObject({ established_day_count: 1, completed_count: 0, unexecuted_count: 1,
      completed_actual_duration_seconds: 0 });
    await env.APP_DB.batch([
      env.APP_DB.prepare("UPDATE entries SET taskchute_day_id = ?, position = ? WHERE app_user_id = ? AND id = ?")
        .bind(janFirst, await nextEntryPosition(userId, janFirst), userId, yearBoundaryEntry),
      env.APP_DB.prepare(`UPDATE taskchute_days SET placement_revision = placement_revision + 1
        WHERE app_user_id = ? AND id IN (?, ?)`)
        .bind(userId, decLast, janFirst),
    ]);
    expect((await loadReviewDateMetrics(env.APP_DB, userId, reviewDateMetricRange("monthly", "2023-12-01")!))
      .unexecuted_count).toBe(0);
    expect((await loadReviewDateMetrics(env.APP_DB, userId, reviewDateMetricRange("yearly", "2024-01-01")!))
      .unexecuted_count).toBe(2);
    const establishedEmpty = await loadReviewDateMetrics(env.APP_DB, userId,
      reviewDateMetricRange("monthly", "2024-05-01")!);
    expect(establishedEmpty).toMatchObject({ established_day_count: 1, completed_count: 0, unexecuted_count: 0,
      completed_actual_duration_seconds: 0 });
    const unestablished = await loadReviewDateMetrics(env.APP_DB, userId,
      reviewDateMetricRange("monthly", "2024-06-01")!);
    expect(unestablished).toMatchObject({ established_day_count: 0, completed_count: 0, unexecuted_count: 0,
      completed_actual_duration_seconds: 0 });
  });

  it("matches the daily Today projection after a canonical execution correction", async () => {
    const userId = await seedUser();
    const sectionId = uuidv7();
    const configurationVersionId = uuidv7();
    const dayId = await seedDay(userId, "2024-02-29");
    const taskId = await seedTask(userId, "Corrected duration");
    const entryId = uuidv7();
    await env.APP_DB.batch([
      env.APP_DB.prepare("INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at) VALUES (?, 'UTC', 300, ?)")
        .bind(userId, createdAt),
      env.APP_DB.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES (?, ?, 'Day', 0, ?)")
        .bind(sectionId, userId, createdAt),
      env.APP_DB.prepare("INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at) VALUES (?, ?, 300, ?)")
        .bind(configurationVersionId, userId, createdAt),
      env.APP_DB.prepare(`INSERT INTO section_configuration_items
        (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
        VALUES (?, ?, ?, 'Day', 300, 1740, 0)`)
        .bind(userId, configurationVersionId, sectionId),
      env.APP_DB.prepare("INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES (?, ?)")
        .bind(userId, configurationVersionId),
      env.APP_DB.prepare(`INSERT INTO taskchute_day_section_contexts
        (app_user_id, taskchute_day_id, section_id, configuration_version_id, title, logical_start_minute, logical_end_minute,
         actual_start_instant, actual_end_instant, context_order)
        VALUES (?, ?, ?, ?, 'Day', 300, 1740, '2024-02-29T05:00:00.000Z', '2024-03-01T05:00:00.000Z', 0)`)
        .bind(userId, dayId, sectionId, configurationVersionId),
      env.APP_DB.prepare(`INSERT INTO entries
        (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
         estimate_seconds, planned_start_minute, created_at)
        VALUES (?, ?, ?, ?, ?, 1, 'planned', NULL, NULL, ?)`)
        .bind(entryId, userId, taskId, dayId, sectionId, createdAt),
    ]);
    const request = {
      operation_id: uuidv7(), entry_id: entryId, execution_id: uuidv7(),
      expected_lifecycle_state: "planned" as const,
      started_at: "2024-02-29T06:00:00.000Z", ended_at: "2024-02-29T06:15:00.000Z",
      expected_started_at: null, expected_ended_at: null, expected_placement_revision: 0,
    };
    await setExecutionTimes(env.APP_DB, userId, request, createdAt);
    const correction = {
      ...request, operation_id: uuidv7(), expected_lifecycle_state: "completed" as const,
      started_at: "2024-02-29T06:05:00.000Z", ended_at: "2024-02-29T06:25:00.000Z",
      expected_started_at: request.started_at, expected_ended_at: request.ended_at,
    };
    await setExecutionTimes(env.APP_DB, userId, correction, createdAt);

    const day = await loadTaskChuteDayByLogicalDate(env.APP_DB, userId, "2024-02-29", createdAt);
    const dailyEntry = day.sections.flatMap((section) => section.entries)
      .find((entry) => entry.id === entryId);
    expect(dailyEntry).toMatchObject({ lifecycle_state: "completed", execution_summary: {
      completed_duration_seconds: 1_200,
    } });
    const monthly = await loadReviewDateMetrics(env.APP_DB, userId,
      reviewDateMetricRange("monthly", "2024-02-01")!);
    expect(monthly).toMatchObject({ established_day_count: 1, completed_count: 1, unexecuted_count: 0,
      completed_actual_duration_seconds: dailyEntry?.execution_summary?.completed_duration_seconds });
  });

  it("protects the API route from unauthenticated callers", async () => {
    const response = await exports.default.fetch(
      new Request("https://taskchute.test/api/v1/review/date-metrics?period=monthly&anchor=2024-02-01"),
    );
    expect(response.status).toBe(401);
  });
});

