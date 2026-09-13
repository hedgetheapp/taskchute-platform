import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const migrations = [
  "0001_runtime_bootstrap.sql", "0002_lifecycle_ordering.sql", "0003_dogfood_day_b1.sql",
  "0004_dogfood_day_b2.sql", "0005_dogfood_day_b3.sql", "0006_minimal_routine_r1.sql",
  "0007_routine_r2a.sql", "0008_routine_r2b_board.sql", "0009_duplicate_entry.sql",
  "0010_bulk_selection_delete.sql", "0011_bulk_section_change.sql", "0012_bulk_routine_section_occurrence.sql",
  "0013_bulk_routine_section_scoped.sql", "0014_bulk_estimate_scoped.sql", "0015_day_move.sql",
  "0016_execution_correction.sql", "0017_task_metadata_update.sql", "0018_routine_archive.sql",
  "0019_project_management.sql", "0020_delete_completed_entry.sql", "0021_mode_management.sql",
  "0022_mode_archive_delete.sql", "0023_interrupt_continuation.sql", "0024_auto_carry_overdue_planned.sql",
  "0025_routine_mode.sql", "0026_routine_recurrence_expansion.sql", "0027_workday_holiday_calendar.sql",
  "0028_routine_workday_holiday_recurrence.sql", "0029_documents_v01.sql", "0030_standalone_note_lifecycle.sql",
];
const rows = (db, query, ...args) => db.prepare(query).all(...args).map((row) => Object.fromEntries(Object.entries(row)));
const apply = async (db, name) => db.exec(await readFile(join(appRoot, "migrations", "app", name), "utf8"));
const integrity = (db, label) => {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
};
const assertSchema = (db) => {
  const columns = rows(db, "PRAGMA table_info(documents)").map((row) => row.name);
  assert.deepEqual(columns, ["document_id", "app_user_id", "kind", "title", "markdown_body", "revision", "created_at", "updated_at", "archived_at"]);
  assert(rows(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='task_primary_documents'")[0]?.sql.includes("task_primary"));
  const operations = rows(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='operations'")[0]?.sql ?? "";
  for (const command of ["EnsureTaskPrimaryDocument", "UpdateTaskPrimaryDocument"]) assert(operations.includes(command));
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE name LIKE '%d101%'"), []);
};

async function fresh() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) await apply(db, migration);
  await apply(db, "0031_task_primary_documents.sql");
  assertSchema(db);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").run("d101-user", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, NULL, ?, ?)").run("d101-task", "d101-user", "Task", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at) VALUES (?, ?, 'task_primary', NULL, '', 0, ?, ?, NULL)").run("d101-doc", "d101-user", "2026-09-13T00:00:00Z", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO task_primary_documents (app_user_id, task_id, document_id, created_at) VALUES (?, ?, ?, ?)").run("d101-user", "d101-task", "d101-doc", "2026-09-13T00:00:00Z");
  assert.throws(() => db.prepare("INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at) VALUES (?, ?, 'task_primary', 'invalid', '', 0, ?, ?, NULL)").run("d101-invalid", "d101-user", "x", "x"));
  assert.throws(() => db.prepare("INSERT INTO task_primary_documents (app_user_id, task_id, document_id, created_at) VALUES (?, ?, ?, ?)").run("d101-user", "d101-task", "d101-doc", "x"));
  integrity(db, "fresh 0001 -> 0031"); db.close();
}

async function upgrade() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) await apply(db, migration);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").run("d101-upgrade", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, NULL, ?, ?)").run("d101-upgrade-task", "d101-upgrade", "Task", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at) VALUES (?, ?, 'standalone', ?, ?, 2, ?, ?, ?)").run("d101-legacy", "d101-upgrade", "Legacy", "# body", "2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z", "2026-09-12T01:00:00Z");
  db.prepare("INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at) VALUES (?, ?, 'UpdateDocument', 1, 'legacy', 'success', '{}', ?)").run("d101-upgrade", "d101-op", "2026-09-12T00:00:00Z");
  db.prepare("INSERT INTO effective_day_overrides (app_user_id, logical_date, override_kind, reason, revision, created_at, updated_at) VALUES (?, ?, 'holiday', ?, 0, ?, ?)").run("d101-upgrade", "2026-09-14", "fixture", "2026-09-12T00:00:00Z", "2026-09-12T00:00:00Z");
  const before = rows(db, "SELECT * FROM documents"); const operationsBefore = rows(db, "SELECT * FROM operations"); const overridesBefore = rows(db, "SELECT * FROM effective_day_overrides");
  await apply(db, "0031_task_primary_documents.sql");
  assertSchema(db); assert.deepEqual(rows(db, "SELECT * FROM documents"), before); assert.deepEqual(rows(db, "SELECT * FROM operations"), operationsBefore); assert.deepEqual(rows(db, "SELECT * FROM effective_day_overrides"), overridesBefore);
  const taskPrimary = rows(db, "SELECT * FROM task_primary_documents"); assert.deepEqual(taskPrimary, []);
  integrity(db, "upgrade 0030 -> 0031"); db.close();
}

await fresh(); await upgrade();
console.log("D-101 bounded migration validation: fresh 0001 -> 0031 and upgrade 0030 -> 0031 passed");
