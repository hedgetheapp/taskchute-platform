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
  "0031_task_primary_documents.sql",
];
const apply = async (db, name) => db.exec(await readFile(join(appRoot, "migrations", "app", name), "utf8"));
const rows = (db, query, ...args) => db.prepare(query).all(...args).map((row) => Object.fromEntries(Object.entries(row)));
const integrity = (db, label) => {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
};
const assertConstraints = (db) => {
  const documentSql = rows(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'")[0]?.sql ?? "";
  assert(documentSql.includes("project_primary"));
  const relationSql = rows(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='project_primary_documents'")[0]?.sql ?? "";
  assert(relationSql.includes("document_kind = 'project_primary'"));
  const operationSql = rows(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name='operations'")[0]?.sql ?? "";
  assert(operationSql.includes("EnsureProjectPrimaryDocument") && operationSql.includes("UpdateProjectPrimaryDocument"));
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE name LIKE '%d103%'").filter((row) => !String(row.name).includes("documents_project")), []);
};

async function fresh() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) await apply(db, migration);
  await apply(db, "0032_project_primary_documents.sql");
  db.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?), (?, ?)").run("d103-u1", "2026-09-13T00:00:00Z", "d103-u2", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)").run(
    "d103-p1", "d103-u1", "Project One", "2026-09-13T00:00:00Z", "d103-p2", "d103-u2", "Project Two", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at) VALUES (?, ?, 'project_primary', NULL, '', 0, ?, ?, NULL)").run("d103-doc", "d103-u1", "2026-09-13T00:00:00Z", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO project_primary_documents (app_user_id, project_id, document_id, created_at) VALUES (?, ?, ?, ?)").run("d103-u1", "d103-p1", "d103-doc", "2026-09-13T00:00:00Z");
  assert.throws(() => db.prepare("INSERT INTO project_primary_documents (app_user_id, project_id, document_id, created_at) VALUES (?, ?, ?, ?)").run("d103-u1", "d103-p1", "d103-doc-2", "x"));
  assert.throws(() => db.prepare("INSERT INTO project_primary_documents (app_user_id, project_id, document_id, created_at) VALUES (?, ?, ?, ?)").run("d103-u2", "d103-p2", "d103-doc", "x"));
  assert.throws(() => db.prepare("INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at) VALUES (?, ?, 'project_primary', ?, '', 0, ?, ?, NULL)").run("d103-invalid", "d103-u1", "Title", "x", "x"));
  assertConstraints(db); integrity(db, "fresh 0001 -> 0032"); db.close();
}

async function upgrade() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) await apply(db, migration);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES (?, ?)").run("d103-upgrade", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO projects (id, app_user_id, title, created_at) VALUES (?, ?, ?, ?)").run("d103-upgrade-project", "d103-upgrade", "Upgrade Project", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES (?, ?, NULL, ?, ?)").run("d103-upgrade-task", "d103-upgrade", "Task", "2026-09-13T00:00:00Z");
  db.prepare("INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at) VALUES (?, ?, 'standalone', ?, ?, 2, ?, ?, ?), (?, ?, 'task_primary', NULL, ?, 4, ?, ?, NULL)").run(
    "d103-standalone", "d103-upgrade", "Legacy", "# body", "2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z", "2026-09-12T01:00:00Z",
    "d103-task-doc", "d103-upgrade", "task body", "2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z");
  db.prepare("INSERT INTO task_primary_documents (app_user_id, task_id, document_id, created_at) VALUES (?, ?, ?, ?)").run("d103-upgrade", "d103-upgrade-task", "d103-task-doc", "2026-09-12T00:00:00Z");
  db.prepare("INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at) VALUES (?, ?, 'UpdateTaskPrimaryDocument', 1, 'legacy', 'success', '{}', ?)").run("d103-upgrade", "d103-op", "2026-09-12T00:00:00Z");
  const beforeDocuments = rows(db, "SELECT * FROM documents"); const beforeTasks = rows(db, "SELECT * FROM task_primary_documents"); const beforeOperations = rows(db, "SELECT * FROM operations");
  await apply(db, "0032_project_primary_documents.sql");
  assert.deepEqual(rows(db, "SELECT * FROM documents"), beforeDocuments);
  assert.deepEqual(rows(db, "SELECT * FROM task_primary_documents"), beforeTasks);
  assert.deepEqual(rows(db, "SELECT * FROM operations"), beforeOperations);
  assertConstraints(db); integrity(db, "upgrade 0031 -> 0032"); db.close();
}

await fresh(); await upgrade();
console.log("D-103 bounded migration validation: fresh 0001 -> 0032 and upgrade 0031 -> 0032 passed");
