import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const appRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const migrationNames = [
  "0001_runtime_bootstrap.sql", "0002_lifecycle_ordering.sql", "0003_dogfood_day_b1.sql",
  "0004_dogfood_day_b2.sql", "0005_dogfood_day_b3.sql", "0006_minimal_routine_r1.sql",
  "0007_routine_r2a.sql", "0008_routine_r2b_board.sql", "0009_duplicate_entry.sql",
  "0010_bulk_selection_delete.sql", "0011_bulk_section_change.sql", "0012_bulk_routine_section_occurrence.sql",
  "0013_bulk_routine_section_scoped.sql", "0014_bulk_estimate_scoped.sql", "0015_day_move.sql",
  "0016_execution_correction.sql", "0017_task_metadata_update.sql", "0018_routine_archive.sql",
  "0019_project_management.sql", "0020_delete_completed_entry.sql", "0021_mode_management.sql",
  "0022_mode_archive_delete.sql", "0023_interrupt_continuation.sql", "0024_auto_carry_overdue_planned.sql",
  "0025_routine_mode.sql", "0026_routine_recurrence_expansion.sql", "0027_workday_holiday_calendar.sql",
  "0028_routine_workday_holiday_recurrence.sql",
];

async function sql(name) {
  return readFile(join(appRoot, "migrations", "app", name), "utf8");
}

function rows(db, query, ...parameters) {
  return db.prepare(query).all(...parameters).map((row) => Object.fromEntries(Object.entries(row)));
}

function assertIntegrity(db, label) {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
}

async function apply(db, name) {
  db.exec(await sql(name));
}

const existingKinds = [
  ["daily", null, null, null, null, null, null, null],
  ["every_n_days", 3, null, null, null, null, null, null],
  ["weekly", null, null, null, 42, null, null, null],
  ["every_n_weeks", null, 2, null, 42, null, null, null],
  ["monthly_day", null, null, null, null, 31, null, null],
  ["monthly_last_day", null, null, null, null, null, null, null],
  ["monthly_nth_weekday", null, null, null, null, null, 2, 1],
  ["monthly_last_weekday", null, null, null, null, null, null, 5],
  ["every_n_months_day", null, null, 3, null, 10, null, null],
  ["every_n_months_last_day", null, null, 2, null, null, null, null],
];

async function seedBase(db, includeHistory = false) {
  db.exec(`
    INSERT INTO app_users (id, created_at) VALUES ('d089-user', '2026-09-11T00:00:00Z');
    INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES ('d089-day', 'd089-user', '2026-09-11', '2026-09-10T15:00:00Z', '2026-09-11T15:00:00Z',
        'Asia/Tokyo', 0, 'compatible', 0, '2026-09-11T00:00:00Z');
  `);
  for (let index = 0; index < existingKinds.length; index += 1) {
    const [kind, intervalDays, intervalWeeks, intervalMonths, weekdaysMask, monthDay, monthOrdinal, monthWeekday] = existingKinds[index];
    const taskId = `d089-task-${index}`;
    const routineId = `d089-routine-${index}`;
    db.prepare("INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)")
      .run(taskId, "d089-user", `D089 ${kind}`, "2026-09-11T00:00:00Z");
    db.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute,
       materialization_order, defaults_revision, created_at)
      VALUES (?, ?, ?, 'daily', '2026-09-01', NULL, NULL, NULL, NULL, ?, 0, ?)`)
      .run(routineId, "d089-user", taskId, index + 1, "2026-09-11T00:00:00Z");
    db.prepare(`INSERT INTO routine_schedules
      (app_user_id, routine_definition_id, schedule_kind, interval_days, interval_weeks,
       interval_months, weekdays_mask, month_day, month_ordinal, month_weekday)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("d089-user", routineId, kind, intervalDays, intervalWeeks, intervalMonths, weekdaysMask, monthDay, monthOrdinal, monthWeekday);
  }
  if (includeHistory) {
    db.prepare(`INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
      VALUES ('d089-occurrence', 'd089-user', 'd089-routine-0', 'd089-day', '2026-09-11T00:00:00Z')`).run();
    db.prepare(`INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      VALUES ('d089-user', 'd089-operation', 'CreateProject', 1, 'd089-fingerprint', 'success', '{}',
        '2026-09-11T00:00:00Z')`).run();
    db.prepare(`INSERT INTO effective_day_overrides
      (app_user_id, logical_date, override_kind, reason, revision, created_at, updated_at)
      VALUES ('d089-user', '2026-09-14', 'holiday', 'fixture', 0, '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z')`).run();
  }
}

async function freshChain() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const name of migrationNames) await apply(db, name);
  await seedBase(db);
  const newKinds = ["workday", "holiday", "official_holiday", "monthly_last_workday"];
  for (let index = 0; index < newKinds.length; index += 1) {
    db.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, 'd089-user', ?, ?)`)
      .run(`d089-new-task-${index}`, `D089 ${newKinds[index]}`, "2026-09-11T00:00:00Z");
    db.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, materialization_order, defaults_revision, created_at)
      VALUES (?, 'd089-user', ?, 'daily', '2026-09-01', ?, 0, '2026-09-11T00:00:00Z')`)
      .run(`d089-new-routine-${index}`, `d089-new-task-${index}`, 11 + index);
    db.prepare(`INSERT INTO routine_schedules
      (app_user_id, routine_definition_id, schedule_kind, interval_days, interval_weeks,
       interval_months, weekdays_mask, month_day, month_ordinal, month_weekday)
      VALUES ('d089-user', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`)
      .run(`d089-new-routine-${index}`, newKinds[index]);
  }
  assert.deepEqual(rows(db, "SELECT COUNT(*) AS count FROM routine_schedules"), [{ count: 14 }]);
  assertIntegrity(db, "fresh 0001 -> 0028");
  db.close();
}

async function upgrade() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const name of migrationNames.slice(0, -1)) await apply(db, name);
  await seedBase(db, true);
  const before = rows(db, `SELECT routine_definition_id, schedule_kind, interval_days, interval_weeks,
    interval_months, weekdays_mask, month_day, month_ordinal, month_weekday
    FROM routine_schedules ORDER BY routine_definition_id`);
  const occurrenceBefore = rows(db, "SELECT * FROM routine_occurrences");
  const operationBefore = rows(db, "SELECT operation_id, command_type FROM operations");
  const overrideBefore = rows(db, "SELECT * FROM effective_day_overrides");
  await apply(db, "0028_routine_workday_holiday_recurrence.sql");
  assert.deepEqual(rows(db, `SELECT routine_definition_id, schedule_kind, interval_days, interval_weeks,
    interval_months, weekdays_mask, month_day, month_ordinal, month_weekday
    FROM routine_schedules ORDER BY routine_definition_id`), before);
  assert.deepEqual(rows(db, "SELECT * FROM routine_occurrences"), occurrenceBefore);
  assert.deepEqual(rows(db, "SELECT operation_id, command_type FROM operations"), operationBefore);
  assert.deepEqual(rows(db, "SELECT * FROM effective_day_overrides"), overrideBefore);
  for (const [index, kind] of ["workday", "holiday", "official_holiday", "monthly_last_workday"].entries()) {
    db.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at) VALUES (?, 'd089-user', ?, ?)`)
      .run(`d089-new-task-${index}`, `D089 ${kind}`, "2026-09-11T00:00:00Z");
    db.prepare(`INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, materialization_order, defaults_revision, created_at)
      VALUES (?, 'd089-user', ?, 'daily', '2026-09-01', ?, 0, '2026-09-11T00:00:00Z')`)
      .run(`d089-new-routine-${index}`, `d089-new-task-${index}`, 11 + index);
    assert.doesNotThrow(() => db.prepare(`INSERT INTO routine_schedules
      (app_user_id, routine_definition_id, schedule_kind, interval_days, interval_weeks,
       interval_months, weekdays_mask, month_day, month_ordinal, month_weekday)
      VALUES ('d089-user', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`)
      .run(`d089-new-routine-${index}`, kind));
  }
  assert.throws(() => db.prepare(`UPDATE routine_schedules SET month_day = 1
    WHERE app_user_id = 'd089-user' AND routine_definition_id = 'd089-routine-0'`).run());
  assert.throws(() => db.prepare(`UPDATE routine_schedules SET interval_days = 2
    WHERE app_user_id = 'd089-user' AND routine_definition_id = 'd089-new-routine-0'`).run());
  assertIntegrity(db, "upgrade 0027 -> 0028");
  db.close();
}

await freshChain();
await upgrade();
console.log("D-089 bounded migration validation: fresh 0001 -> 0028 and upgrade 0027 -> 0028 passed");
