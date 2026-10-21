import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const priorMigrations = (await readdir(join(appRoot, "migrations", "app")))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name < "0039_quick_interrupt.sql")
  .sort();
assert.equal(priorMigrations.at(-1), "0038_routine_activity_coverage.sql");
const apply = async (db, name) => db.exec(await readFile(join(appRoot, "migrations", "app", name), "utf8"));
const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((row) => Object.fromEntries(Object.entries(row)));
const integrity = (db, label) => {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
};

async function freshInstall() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of priorMigrations) await apply(db, migration);
  await apply(db, "0039_quick_interrupt.sql");
  db.prepare("INSERT INTO app_users (id, created_at) VALUES ('d181-fresh', '2026-10-21T00:00:00Z')").run();
  const taskColumns = rows(db, "PRAGMA table_info(tasks)");
  assert.equal(taskColumns.find((column) => column.name === "quick_interrupt_origin")?.notnull, 0);
  assert.equal(rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='quick_interrupt_command_guards'").length, 1);
  assert.equal(rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='quick_interrupt_entry_pairs'").length, 1);
  assert.equal(rows(db, "SELECT COUNT(*) AS count FROM quick_interrupt_entry_pairs")[0]?.count, 0,
    "fresh migration must not fabricate Quick pair identities");
  assert.throws(() => db.prepare(`INSERT INTO quick_interrupt_entry_pairs
    (app_user_id, target_entry_id, continuation_entry_id, created_at)
    VALUES ('d181-fresh', 'd181-target', 'd181-continuation', '2026-10-21T00:00:00Z')`).run(),
    /quick_interrupt_entry_pair_requires_command_guard/);
  assert.throws(() => db.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at, quick_interrupt_origin)
    VALUES ('d181-unprotected', 'd181-fresh', '（割込）', '2026-10-21T00:00:00Z', 'quick_interrupt')`).run(), /quick_interrupt_origin_requires_command_guard/);
  db.prepare(`INSERT INTO quick_interrupt_command_guards
    (app_user_id, operation_id, taskchute_day_id, source_entry_id, source_execution_id, quick_task_id,
     target_entry_id, target_execution_id, continuation_entry_id, expected_placement_revision)
    VALUES ('d181-fresh', 'd181-op', 'd181-day', 'd181-source', 'd181-execution', 'd181-task',
      'd181-entry', 'd181-target-execution', 'd181-continuation', 0)`).run();
  db.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at, quick_interrupt_origin)
    VALUES ('d181-task', 'd181-fresh', '（割込）', '2026-10-21T00:00:00Z', 'quick_interrupt')`).run();
  assert.throws(() => db.prepare(`UPDATE tasks SET quick_interrupt_origin = NULL WHERE id = 'd181-task'`).run(), /quick_interrupt_origin_immutable/);
  db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
      request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d181-fresh', 'd181-op', 'QuickInterruptEntry', 1, 'fingerprint', 'success', '{}', '2026-10-21T00:00:00Z')`).run();
  assert.throws(() => db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
      request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d181-fresh', 'd181-invalid', 'UnknownCommand', 1, 'fingerprint', 'success', '{}', '2026-10-21T00:00:00Z')`).run(), /CHECK constraint/);
  assert.equal(rows(db, "SELECT quick_interrupt_origin FROM tasks WHERE id='d181-task'")[0]?.quick_interrupt_origin, "quick_interrupt");
  integrity(db, "fresh 0001 -> 0039");
  db.close();
}

async function upgradePreservesExistingData() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of priorMigrations) await apply(db, migration);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES ('d181-upgrade', '2026-10-21T00:00:00Z')").run();
  db.prepare("INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES ('d181-section', 'd181-upgrade', 'Morning', 0, '2026-10-21T00:00:00Z')").run();
  db.prepare(`INSERT INTO taskchute_days (id, app_user_id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
    VALUES ('d181-day', 'd181-upgrade', '2026-10-21', '2026-10-21T00:00:00Z', '2026-10-22T00:00:00Z',
      'UTC', 0, 'compatible', 4, '2026-10-21T00:00:00Z')`).run();
  db.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at)
    VALUES ('d181-task', 'd181-upgrade', 'Existing task', '2026-10-21T00:00:00Z')`).run();
  db.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
      estimate_seconds, created_at, planned_start_minute)
    VALUES ('d181-entry', 'd181-upgrade', 'd181-task', 'd181-day', 'd181-section', 1, 'running', 1200,
      '2026-10-21T08:00:00Z', 480)`).run();
  db.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
    VALUES ('d181-execution', 'd181-upgrade', 'd181-entry', '2026-10-21T08:00:00Z', NULL,
      '2026-10-21T08:00:00Z', NULL)`).run();
  db.prepare(`INSERT INTO entry_task_snapshots (app_user_id, entry_id, task_id, task_title, captured_at)
    VALUES ('d181-upgrade', 'd181-entry', 'd181-task', 'Snapshot title', '2026-10-21T08:00:00Z')`).run();
  db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
      request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d181-upgrade', 'd181-existing-op', 'AddTaskToDay', 1, 'old-fingerprint', 'success', '{"old":true}', '2026-10-21T00:00:00Z')`).run();
  const beforeTasks = rows(db, "SELECT * FROM tasks ORDER BY id");
  const beforeEntries = rows(db, "SELECT * FROM entries ORDER BY id");
  const beforeExecutions = rows(db, "SELECT * FROM executions ORDER BY id");
  const beforeSnapshots = rows(db, "SELECT * FROM entry_task_snapshots ORDER BY entry_id");
  const beforeOperations = rows(db, "SELECT * FROM operations ORDER BY operation_id");

  await apply(db, "0039_quick_interrupt.sql");
  assert.deepEqual(rows(db, "SELECT id, app_user_id, project_id, title, created_at, quick_interrupt_origin FROM tasks ORDER BY id"),
    beforeTasks.map((task) => ({ ...task, project_id: null, quick_interrupt_origin: null })),
    "existing Tasks remain unchanged and receive no inferred origin");
  assert.deepEqual(rows(db, "SELECT * FROM entries ORDER BY id"), beforeEntries, "existing Entries remain intact");
  assert.deepEqual(rows(db, "SELECT * FROM executions ORDER BY id"), beforeExecutions, "existing Executions remain intact");
  assert.deepEqual(rows(db, "SELECT * FROM entry_task_snapshots ORDER BY entry_id"), beforeSnapshots, "historical snapshots remain intact");
  assert.deepEqual(rows(db, "SELECT * FROM operations ORDER BY operation_id"), beforeOperations, "operation replay rows remain intact");
  assert.equal(rows(db, "SELECT name FROM sqlite_master WHERE name IN ('operations_d181')").length, 0);
  assert.equal(rows(db, "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'quick_interrupt_origin_%'").length, 2);
  assert.equal(rows(db, "SELECT COUNT(*) AS count FROM quick_interrupt_entry_pairs")[0]?.count, 0,
    "upgrade must not infer pairs for existing entries");
  assert.throws(() => db.prepare(`INSERT INTO quick_interrupt_entry_pairs
    (app_user_id, target_entry_id, continuation_entry_id, created_at)
    VALUES ('d181-upgrade', 'd181-entry', 'd181-entry', '2026-10-21T00:00:00Z')`).run(),
    /quick_interrupt_entry_pair_requires_command_guard/);
  integrity(db, "upgrade 0038 -> 0039");
  db.close();
}

await freshInstall();
await upgradePreservesExistingData();
console.log("D-181 bounded migration validation: fresh 0001 -> 0039 and data-preserving 0038 -> 0039 passed");
