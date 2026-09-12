import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
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

const rows = (db, query, ...parameters) => db.prepare(query).all(...parameters).map((row) => Object.fromEntries(Object.entries(row)));
const apply = async (db, name) => db.exec(await readFile(join(appRoot, "migrations", "app", name), "utf8"));
const integrity = (db, label) => {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
};

async function fresh() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) await apply(db, migration);
  const columns = rows(db, "PRAGMA table_info(documents)").map((row) => row.name);
  assert.deepEqual(columns, ["document_id", "app_user_id", "kind", "title", "markdown_body", "revision", "created_at", "updated_at", "archived_at"]);
  const operations = rows(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operations'")[0]?.sql ?? "";
  for (const command of ["CreateStandaloneDocument", "UpdateDocument", "SetStandaloneDocumentArchived", "DeleteStandaloneDocument"]) {
    assert(operations.includes(command), `0030 operation allow-list includes ${command}`);
  }
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE name LIKE '%d093%'"), []);
  integrity(db, "fresh 0001 -> 0030");
  db.close();
}

async function upgrade() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations.slice(0, -1)) await apply(db, migration);
  db.exec(`
    INSERT INTO app_users (id, created_at) VALUES ('d093-user', '2026-09-12T00:00:00Z');
    INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
      VALUES ('d093-document', 'd093-user', 'standalone', 'Legacy Note', '# source', 2, '2026-09-11T00:00:00Z', '2026-09-12T00:00:00Z');
    INSERT INTO operations
      (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint,
       outcome_kind, result_json, created_at)
      VALUES ('d093-user', 'd093-operation', 'UpdateDocument', 1, 'legacy', 'success', '{}', '2026-09-12T00:00:00Z');
    INSERT INTO effective_day_overrides
      (app_user_id, logical_date, override_kind, reason, revision, created_at, updated_at)
      VALUES ('d093-user', '2026-09-14', 'holiday', 'fixture', 0, '2026-09-12T00:00:00Z', '2026-09-12T00:00:00Z');
  `);
  const documentBefore = rows(db, "SELECT * FROM documents");
  const operationsBefore = rows(db, "SELECT * FROM operations");
  const overridesBefore = rows(db, "SELECT * FROM effective_day_overrides");
  await apply(db, "0030_standalone_note_lifecycle.sql");
  assert.deepEqual(rows(db, "SELECT document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at FROM documents"), documentBefore);
  assert.deepEqual(rows(db, "SELECT archived_at FROM documents"), [{ archived_at: null }]);
  assert.deepEqual(rows(db, "SELECT * FROM operations"), operationsBefore);
  assert.deepEqual(rows(db, "SELECT * FROM effective_day_overrides"), overridesBefore);

  db.prepare(`INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
    VALUES ('d093-document-2', 'd093-user', 'standalone', 'Archived', '', 0, 'x', 'x')`).run();
  assert.throws(() => db.prepare(`INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
    VALUES ('d093-document-3', 'd093-user', 'standalone', 'Legacy Note', '', 0, 'x', 'x')`).run(), /UNIQUE/);
  db.prepare("UPDATE documents SET archived_at = '2026-09-12T01:00:00Z' WHERE document_id = 'd093-document'").run();
  assert.throws(() => db.prepare(`INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
    VALUES ('d093-document-4', 'd093-user', 'standalone', 'Legacy Note', '', 0, 'x', 'x')`).run(), /UNIQUE/);
  db.prepare("DELETE FROM documents WHERE document_id = 'd093-document'").run();
  db.prepare(`INSERT INTO documents (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at)
    VALUES ('d093-document-5', 'd093-user', 'standalone', 'Legacy Note', '', 0, 'x', 'x')`).run();
  assert.deepEqual(rows(db, "SELECT name FROM sqlite_master WHERE name LIKE '%d093%'"), []);
  integrity(db, "upgrade 0029 -> 0030");
  db.close();
}

await fresh();
await upgrade();
console.log("D-093 bounded migration validation: fresh 0001 -> 0030 and upgrade 0029 -> 0030 passed");
