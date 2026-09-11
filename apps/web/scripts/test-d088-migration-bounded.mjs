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

async function freshChain() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const name of migrationNames) await apply(db, name);
  assert.deepEqual(rows(db, "SELECT COUNT(*) AS count FROM effective_day_overrides"), [{ count: 0 }]);
  const operationSql = rows(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operations'")[0].sql;
  assert(operationSql.includes("UpsertEffectiveDayOverride") && operationSql.includes("DeleteEffectiveDayOverride"));
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE name LIKE '%d088%'"), []);
  assertIntegrity(db, "fresh 0001 -> 0027");
  db.close();
}

async function upgrade() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const name of migrationNames.slice(0, -2)) await apply(db, name);
  db.exec(`
    INSERT INTO app_users (id, created_at) VALUES ('d088-user', '2026-09-11T00:00:00Z');
    INSERT INTO tasks (id, app_user_id, title, created_at) VALUES ('d088-task', 'd088-user', 'D088', '2026-09-11T00:00:00Z');
    INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute,
       materialization_order, defaults_revision, created_at)
      VALUES ('d088-routine', 'd088-user', 'd088-task', 'daily', '2026-09-01', NULL,
        NULL, NULL, NULL, 1, 0, '2026-09-11T00:00:00Z');
    INSERT INTO routine_schedules
      (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask)
      VALUES ('d088-user', 'd088-routine', 'every_n_days', 3, NULL);
    INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      VALUES ('d088-user', 'd088-operation', 'CreateProject', 1, 'd088-fingerprint', 'success', '{}', '2026-09-11T00:00:00Z');
  `);
  await apply(db, "0026_routine_recurrence_expansion.sql");
  const legacySchedule = rows(db, `SELECT schedule_kind, interval_days, weekdays_mask,
      interval_weeks, interval_months, month_day, month_ordinal, month_weekday
    FROM routine_schedules WHERE routine_definition_id = 'd088-routine'`);
  await apply(db, "0027_workday_holiday_calendar.sql");
  assert.deepEqual(rows(db, `SELECT schedule_kind, interval_days, weekdays_mask,
      interval_weeks, interval_months, month_day, month_ordinal, month_weekday
    FROM routine_schedules WHERE routine_definition_id = 'd088-routine'`), legacySchedule);
  assert.deepEqual(rows(db, "SELECT operation_id, command_type FROM operations"), [{ operation_id: "d088-operation", command_type: "CreateProject" }]);
  db.prepare(`INSERT INTO effective_day_overrides
    (app_user_id, logical_date, override_kind, reason, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)`)
    .run("d088-user", "2026-09-14", "holiday", null, "2026-09-11T00:00:00Z", "2026-09-11T00:00:00Z");
  assert.throws(() => db.prepare(`INSERT INTO effective_day_overrides
    (app_user_id, logical_date, override_kind, revision, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)`)
    .run("d088-user", "2026-09-14", "workday", "2026-09-11T00:00:00Z", "2026-09-11T00:00:00Z"));
  assert.throws(() => db.prepare(`INSERT INTO effective_day_overrides
    (app_user_id, logical_date, override_kind, revision, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)`)
    .run("d088-user", "2026-09-15", "unknown", "2026-09-11T00:00:00Z", "2026-09-11T00:00:00Z"));
  assertIntegrity(db, "upgrade 0026 -> 0027");
  db.close();
}

await freshChain();
await upgrade();
console.log("D-088 bounded migration validation: fresh 0001 -> 0027 and upgrade 0026 -> 0027 passed");
