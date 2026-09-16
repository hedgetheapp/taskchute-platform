import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const migrations = [
  "0001_runtime_bootstrap.sql", "0002_lifecycle_ordering.sql", "0003_dogfood_day_b1.sql", "0004_dogfood_day_b2.sql",
  "0005_dogfood_day_b3.sql", "0006_minimal_routine_r1.sql", "0007_routine_r2a.sql", "0008_routine_r2b_board.sql",
  "0009_duplicate_entry.sql", "0010_bulk_selection_delete.sql", "0011_bulk_section_change.sql", "0012_bulk_routine_section_occurrence.sql",
  "0013_bulk_routine_section_scoped.sql", "0014_bulk_estimate_scoped.sql", "0015_day_move.sql", "0016_execution_correction.sql",
  "0017_task_metadata_update.sql", "0018_routine_archive.sql", "0019_project_management.sql", "0020_delete_completed_entry.sql",
  "0021_mode_management.sql", "0022_mode_archive_delete.sql", "0023_interrupt_continuation.sql", "0024_auto_carry_overdue_planned.sql",
  "0025_routine_mode.sql", "0026_routine_recurrence_expansion.sql", "0027_workday_holiday_calendar.sql",
  "0028_routine_workday_holiday_recurrence.sql", "0029_documents_v01.sql", "0030_standalone_note_lifecycle.sql",
  "0031_task_primary_documents.sql", "0032_project_primary_documents.sql",
];
const apply = async (db, name) => db.exec(await readFile(join(appRoot, "migrations", "app", name), "utf8"));
const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((row) => Object.fromEntries(Object.entries(row)));
const integrity = (db, label) => {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
};
const assertSchema = (db) => {
  const relation = rows(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='completed_entry_future_routines'")[0]?.sql ?? "";
  assert(relation.includes("PRIMARY KEY (app_user_id, source_entry_id)"));
  assert(relation.includes("UNIQUE (app_user_id, routine_definition_id)"));
  assert.deepEqual([...new Set(rows(db, "PRAGMA foreign_key_list(completed_entry_future_routines)").map((row) => row.table))].sort(),
    ["app_users", "entries", "routine_definitions"].sort());
  const operations = rows(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='operations'")[0]?.sql ?? "";
  assert(operations.includes("CreateFutureRoutineFromCompletedEntry"));
  assert(!operations.includes("NotAnApprovedCommand"));
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE name LIKE '%d116b%'")
    .filter((row) => row.name !== "completed_entry_future_routines"), []);
};

async function fresh() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) await apply(db, migration);
  await apply(db, "0033_completed_entry_future_routine.sql");
  assertSchema(db);
  assert.deepEqual(rows(db, "SELECT COUNT(*) AS count FROM completed_entry_future_routines"), [{ count: 0 }],
    "fresh install must not materialize or backfill a source relation");
  db.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").run("d116b-fresh", "2026-09-15T00:00:00Z");
  assert.throws(() => db.prepare(`INSERT INTO completed_entry_future_routines
    (app_user_id, source_entry_id, routine_definition_id, created_at) VALUES (?, ?, ?, ?)`)
    .run("d116b-fresh", "missing-entry", "missing-routine", "2026-09-15T00:00:00Z"), /FOREIGN KEY/);
  integrity(db, "fresh 0001 -> 0033"); db.close();
}

async function upgrade() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) await apply(db, migration);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").run("d116b-upgrade", "2026-09-15T00:00:00Z");
  db.prepare(`INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES (?, ?, 'UpdateTaskPrimaryDocument', 1, 'existing-fingerprint', 'success', '{"kept":true}', ?)`)
    .run("d116b-upgrade", "d116b-existing-op", "2026-09-15T00:00:00Z");
  const beforeOperations = rows(db, "SELECT * FROM operations");
  const beforeUsers = rows(db, "SELECT * FROM app_users");
  const beforeDocuments = rows(db, "SELECT * FROM documents");
  const beforeEntries = rows(db, "SELECT * FROM entries");
  await apply(db, "0033_completed_entry_future_routine.sql");
  assertSchema(db);
  assert.deepEqual(rows(db, "SELECT * FROM operations"), beforeOperations, "operation records must be preserved exactly");
  assert.deepEqual(rows(db, "SELECT * FROM app_users"), beforeUsers);
  assert.deepEqual(rows(db, "SELECT * FROM documents"), beforeDocuments);
  assert.deepEqual(rows(db, "SELECT * FROM entries"), beforeEntries);
  assert.deepEqual(rows(db, "SELECT COUNT(*) AS count FROM completed_entry_future_routines"), [{ count: 0 }],
    "upgrade must not backfill completed Entries");
  assert.equal(rows(db, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='operations_d116b'")[0]?.count, 0,
    "temporary rebuild table must not remain");
  integrity(db, "upgrade 0032 -> 0033"); db.close();
}

await fresh(); await upgrade();
console.log("D-116B bounded migration validation: fresh 0001 -> 0033 and upgrade 0032 -> 0033 passed");
