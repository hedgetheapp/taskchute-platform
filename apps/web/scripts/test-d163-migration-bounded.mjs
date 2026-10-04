import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const priorMigrations = (await readdir(join(appRoot, "migrations", "app")))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name < "0037_routine_occurrence_title_override.sql")
  .sort();
assert.equal(priorMigrations.at(-1), "0036_wear_push_registrations.sql");
const apply = async (db, name) => db.exec(await readFile(join(appRoot, "migrations", "app", name), "utf8"));
const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((row) => Object.fromEntries(Object.entries(row)));
const integrity = (db, label) => {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
};
const assertNewCommandAllowed = (db) => {
  db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
    VALUES ('d163-user', 'd163-title-guard', 'SetRoutineTitle')`).run();
  db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
      request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d163-user', 'd163-title-op', 'SetRoutineTitle', 1, 'fingerprint', 'success', '{}', '2026-10-04T00:00:00Z')`).run();
  assert.throws(() => db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type,
      request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d163-user', 'd163-invalid-op', 'NotApprovedCommand', 1, 'x', 'success', '{}', '2026-10-04T00:00:00Z')`).run(), /CHECK constraint/);
};

async function freshInstall() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of priorMigrations) await apply(db, migration);
  await apply(db, "0037_routine_occurrence_title_override.sql");
  const columns = rows(db, "PRAGMA table_info(routine_occurrences)");
  assert.equal(columns.find((column) => column.name === "title_override")?.notnull, 0);
  assert.equal(columns.some((column) => column.name === "title_override"), true);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES ('d163-user', '2026-10-04T00:00:00Z')").run();
  assertNewCommandAllowed(db);
  integrity(db, "fresh 0001 -> 0037");
  db.close();
}

async function upgradePreservesExistingData() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of priorMigrations) await apply(db, migration);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES ('d163-user', '2026-10-04T00:00:00Z')").run();
  db.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at)
    VALUES ('d163-task', 'd163-user', 'Base Routine title', '2026-10-04T00:00:00Z')`).run();
  for (const [id, date] of [["d163-day-planned", "2026-10-04"], ["d163-day-history", "2026-10-03"]]) {
    db.prepare(`INSERT INTO taskchute_days (id, app_user_id, logical_date, start_instant, end_instant,
        establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES (?, 'd163-user', ?, ?, ?, 'UTC', 0, 'compatible', 0, '2026-10-04T00:00:00Z')`)
      .run(id, date, `${date}T00:00:00Z`, `${date}T23:59:59Z`);
  }
  db.prepare(`INSERT INTO routine_definitions (id, app_user_id, task_id, recurrence_type, start_logical_date,
      end_logical_date, default_section_id, default_estimate_seconds, default_planned_start_minute,
      materialization_order, defaults_revision, created_at)
    VALUES ('d163-routine', 'd163-user', 'd163-task', 'daily', '2026-10-03', NULL, NULL, NULL, NULL, 1, 0,
      '2026-10-04T00:00:00Z')`).run();
  db.prepare(`INSERT INTO routine_schedules (app_user_id, routine_definition_id, schedule_kind)
    VALUES ('d163-user', 'd163-routine', 'daily')`).run();
  db.prepare(`INSERT INTO routine_board_items (app_user_id, routine_definition_id, board_position, settings_revision)
    VALUES ('d163-user', 'd163-routine', 1, 0)`).run();
  for (const [occurrenceId, dayId, entryId, lifecycle, snapshotTitle] of [
    ["d163-occ-planned", "d163-day-planned", "d163-entry-planned", "planned", "Historical pre-migration planned snapshot"],
    ["d163-occ-history", "d163-day-history", "d163-entry-history", "completed", "Historical completed snapshot"],
  ]) {
    db.prepare(`INSERT INTO routine_occurrences (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
      VALUES (?, 'd163-user', 'd163-routine', ?, '2026-10-04T00:00:00Z')`).run(occurrenceId, dayId);
    db.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position,
      lifecycle_state, estimate_seconds, created_at, planned_start_minute, routine_occurrence_id)
      VALUES (?, 'd163-user', 'd163-task', ?, NULL, 1, ?, NULL, '2026-10-04T00:00:00Z', NULL, ?)`)
      .run(entryId, dayId, lifecycle, occurrenceId);
    db.prepare(`INSERT INTO routine_occurrence_task_snapshots
      (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
      VALUES ('d163-user', ?, ?, NULL, NULL)`).run(occurrenceId, snapshotTitle);
  }
  db.prepare(`INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
    VALUES ('d163-user', 'd163-existing-guard', 'SetRoutineMode')`).run();
  db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
      request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d163-user', 'd163-existing-operation', 'UpdateTaskMetadata', 1, 'kept-fingerprint', 'success',
      '{"kept":true}', '2026-10-04T00:00:00Z')`).run();

  const beforeOccurrences = rows(db, "SELECT * FROM routine_occurrences ORDER BY id");
  const beforeSnapshots = rows(db, "SELECT * FROM routine_occurrence_task_snapshots ORDER BY routine_occurrence_id");
  const beforeOperations = rows(db, "SELECT * FROM operations ORDER BY operation_id");
  const beforeGuards = rows(db, "SELECT * FROM routine_command_guards ORDER BY operation_id");
  await apply(db, "0037_routine_occurrence_title_override.sql");

  assert.deepEqual(rows(db, "SELECT * FROM routine_occurrences ORDER BY id"),
    beforeOccurrences.map((row) => ({ ...row, title_override: null })), "existing occurrence rows remain unchanged with NULL title overrides");
  assert.deepEqual(rows(db, "SELECT * FROM routine_occurrence_task_snapshots ORDER BY routine_occurrence_id"),
    beforeSnapshots, "planned and historical snapshots are not rewritten/backfilled");
  assert.deepEqual(rows(db, "SELECT * FROM operations ORDER BY operation_id"), beforeOperations,
    "existing operation/replay records are preserved exactly");
  assert.deepEqual(rows(db, "SELECT * FROM routine_command_guards ORDER BY operation_id"), beforeGuards,
    "existing Routine command guard rows are preserved exactly");
  assert.equal(rows(db, "SELECT name FROM sqlite_master WHERE name IN ('operations_d163', 'routine_command_guards_d163')").length, 0,
    "migration rebuild tables must not remain");
  assertNewCommandAllowed(db);
  integrity(db, "upgrade 0036 -> 0037");
  db.close();
}

await freshInstall();
await upgradePreservesExistingData();
console.log("D-163 bounded migration validation: fresh 0001 -> 0037 and data-preserving 0036 -> 0037 passed");
