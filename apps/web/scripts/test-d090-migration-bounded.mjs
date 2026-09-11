import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
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
  "0028_routine_workday_holiday_recurrence.sql", "0029_documents_v01.sql",
];

const rows = (db, query, ...parameters) => db.prepare(query).all(...parameters).map((row) => Object.fromEntries(Object.entries(row)));
const apply = async (db, name) => db.exec(await readFile(join(appRoot, "migrations", "app", name), "utf8"));
const assertIntegrity = (db, label) => {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
};

async function freshChain() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const name of migrationNames) await apply(db, name);
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE name LIKE '%d090%'"), []);
  assert.deepEqual(rows(db, "PRAGMA table_info(documents)").map((row) => row.name), [
    "document_id", "app_user_id", "kind", "title", "markdown_body", "revision", "created_at", "updated_at",
  ]);
  assertIntegrity(db, "fresh 0001 -> 0029");
  db.close();
}

async function upgrade() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const name of migrationNames.slice(0, -1)) await apply(db, name);
  db.exec(`
    INSERT INTO app_users (id, created_at) VALUES ('d090-user', '2026-09-11T00:00:00Z');
    INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      VALUES ('d090-user', 'd090-operation', 'UpdateRoutine', 1, 'before', 'success', '{}', '2026-09-11T00:00:00Z');
    INSERT INTO effective_day_overrides
      (app_user_id, logical_date, override_kind, reason, revision, created_at, updated_at)
      VALUES ('d090-user', '2026-09-14', 'holiday', 'fixture', 0, '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z');
  `);
  const operationsBefore = rows(db, "SELECT * FROM operations");
  const overridesBefore = rows(db, "SELECT * FROM effective_day_overrides");
  await apply(db, "0029_documents_v01.sql");
  assert.deepEqual(rows(db, "SELECT * FROM operations"), operationsBefore);
  assert.deepEqual(rows(db, "SELECT * FROM effective_day_overrides"), overridesBefore);
  db.prepare(`INSERT INTO documents
    (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
    VALUES ('d090-document', 'd090-user', 'standalone', 'Note', '# body', 0, '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z')`).run();
  assert.throws(() => db.prepare(`INSERT INTO documents
    (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
    VALUES ('d090-document-2', 'd090-user', 'task', 'Bad', '', 0, 'x', 'x')`).run());
  assert.throws(() => db.prepare(`INSERT INTO documents
    (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
    VALUES ('d090-document-3', 'd090-user', 'standalone', '', '', 0, 'x', 'x')`).run());
  assert.throws(() => db.prepare(`INSERT INTO documents
    (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
    VALUES ('d090-document-4', 'd090-user', 'standalone', 'Bad', '', -1, 'x', 'x')`).run());
  assertIntegrity(db, "upgrade 0028 -> 0029");
  db.close();
}

await freshChain();
await upgrade();
console.log("D-090 bounded migration validation: fresh 0001 -> 0029 and upgrade 0028 -> 0029 passed");
