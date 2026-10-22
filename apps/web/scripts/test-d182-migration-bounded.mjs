import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const migrations = (await readdir(join(appRoot, "migrations", "app")))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name <= "0040_interruption_hard_delete.sql")
  .sort();
assert.equal(migrations.at(-1), "0040_interruption_hard_delete.sql");
const apply = async (db, name) => db.exec(await readFile(join(appRoot, "migrations", "app", name), "utf8"));
const rows = (db, sql, ...args) => db.prepare(sql).all(...args).map((row) => Object.fromEntries(Object.entries(row)));
const integrity = (db, label) => {
  assert.deepEqual(rows(db, "PRAGMA quick_check"), [{ quick_check: "ok" }], `${label} quick_check`);
  assert.deepEqual(rows(db, "PRAGMA foreign_key_check"), [], `${label} foreign_key_check`);
};

async function freshInstall() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) await apply(db, migration);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES ('d182-fresh', '2026-10-22T00:00:00Z')").run();
  assert.deepEqual(rows(db, "PRAGMA table_info(continuation_lineage_tombstones)").map((column) => column.name), [
    "app_user_id", "deleted_entry_id", "continuation_chain_id", "continuation_parent_entry_id", "root_estimate_seconds",
  ]);
  assert.equal(rows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='interruption_delete_command_guards'").length, 1);
  assert.equal(rows(db, "SELECT name FROM sqlite_master WHERE type='trigger' AND name='interruption_chain_entry_delete_guard'").length, 1);
  assert.equal(rows(db, "SELECT COUNT(*) AS count FROM continuation_lineage_tombstones")[0]?.count, 0,
    "fresh migration must not fabricate lineage identities");
  assert.throws(() => db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
      request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d182-fresh', 'd182-invalid', 'UnknownCommand', 1, 'fingerprint', 'success', '{}', '2026-10-22T00:00:00Z')`).run(), /CHECK constraint/);
  db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
      request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d182-fresh', 'd182-command', 'DeleteInterruptionEntry', 1, 'fingerprint', 'success', '{}', '2026-10-22T00:00:00Z')`).run();
  integrity(db, "fresh 0001 -> 0040");
  db.close();
}

async function upgradePreservesData() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations.filter((name) => name < "0040_interruption_hard_delete.sql")) await apply(db, migration);
  db.prepare("INSERT INTO app_users (id, created_at) VALUES ('d182-upgrade', '2026-10-22T00:00:00Z')").run();
  db.prepare(`INSERT INTO tasks (id, app_user_id, title, created_at) VALUES
    ('d182-task-a', 'd182-upgrade', 'Existing source', '2026-10-22T00:00:00Z'),
    ('d182-task-b', 'd182-upgrade', 'Existing continuation', '2026-10-22T00:00:00Z')`).run();
  db.prepare(`INSERT INTO taskchute_days (id, app_user_id, logical_date, start_instant, end_instant,
      establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
    VALUES ('d182-day', 'd182-upgrade', '2026-10-22', '2026-10-22T00:00:00Z', '2026-10-23T00:00:00Z',
      'UTC', 0, 'compatible', 3, '2026-10-22T00:00:00Z')`).run();
  db.prepare(`INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, position, lifecycle_state,
      estimate_seconds, created_at, continuation_chain_id, continuation_parent_entry_id)
    VALUES ('d182-root', 'd182-upgrade', 'd182-task-a', 'd182-day', 1, 'completed', 600,
      '2026-10-22T00:00:00Z', 'd182-root', NULL),
      ('d182-child', 'd182-upgrade', 'd182-task-b', 'd182-day', 2, 'planned', 450,
      '2026-10-22T00:00:00Z', 'd182-root', 'd182-root')`).run();
  db.prepare(`INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at, terminal_outcome)
    VALUES ('d182-execution', 'd182-upgrade', 'd182-root', '2026-10-22T01:00:00Z', '2026-10-22T01:10:00Z',
      '2026-10-22T01:00:00Z', 'interrupted')`).run();
  db.prepare(`INSERT INTO operations (app_user_id, operation_id, command_type, request_fingerprint_version,
      request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('d182-upgrade', 'd182-old-op', 'QuickInterruptEntry', 1, 'old-fingerprint', 'success', '{"old":true}', '2026-10-22T00:00:00Z')`).run();
  const beforeEntries = rows(db, "SELECT * FROM entries ORDER BY id");
  const beforeExecutions = rows(db, "SELECT * FROM executions ORDER BY id");
  const beforeOperations = rows(db, "SELECT * FROM operations ORDER BY operation_id");

  await apply(db, "0040_interruption_hard_delete.sql");
  assert.deepEqual(rows(db, "SELECT * FROM entries ORDER BY id"), beforeEntries, "existing continuation facts remain unchanged");
  assert.deepEqual(rows(db, "SELECT * FROM executions ORDER BY id"), beforeExecutions, "existing execution history remains unchanged");
  assert.deepEqual(rows(db, "SELECT * FROM operations ORDER BY operation_id"), beforeOperations, "existing replay rows remain unchanged");
  assert.equal(rows(db, "SELECT COUNT(*) AS count FROM continuation_lineage_tombstones")[0]?.count, 0);
  assert.throws(() => db.prepare("DELETE FROM entries WHERE app_user_id = 'd182-upgrade' AND id = 'd182-root'").run(),
    /interruption_chain_delete_requires_d182_command/);

  const snapshot = JSON.stringify({
    entries: rows(db, `SELECT e.id, e.continuation_chain_id, e.continuation_parent_entry_id, e.task_id,
        e.taskchute_day_id, e.lifecycle_state, e.routine_occurrence_id, e.section_id, e.position,
        e.planned_start_minute, e.estimate_seconds, t.quick_interrupt_origin
      FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      WHERE e.app_user_id = 'd182-upgrade' AND e.continuation_chain_id = 'd182-root' ORDER BY e.id`),
    executions: rows(db, `SELECT x.id, x.entry_id, x.started_at, x.ended_at, x.terminal_outcome
      FROM executions x JOIN entries e ON e.app_user_id = x.app_user_id AND e.id = x.entry_id
      WHERE x.app_user_id = 'd182-upgrade' AND e.continuation_chain_id = 'd182-root' ORDER BY x.id`),
    pairs: [],
    lineage: [],
  });
  db.prepare(`INSERT INTO interruption_delete_command_guards
      (app_user_id, operation_id, taskchute_day_id, entry_id, continuation_chain_id,
       continuation_parent_entry_id, expected_placement_revision, retains_lineage, snapshot_json)
    VALUES ('d182-upgrade', 'd182-delete', 'd182-day', 'd182-root', 'd182-root', NULL, 3, 1, ?)`).run(snapshot);
  db.prepare(`INSERT INTO continuation_lineage_tombstones
      (app_user_id, deleted_entry_id, continuation_chain_id, continuation_parent_entry_id, root_estimate_seconds)
    VALUES ('d182-upgrade', 'd182-root', 'd182-root', NULL, 600)`).run();
  db.prepare("DELETE FROM executions WHERE app_user_id = 'd182-upgrade' AND entry_id = 'd182-root'").run();
  db.prepare("DELETE FROM entries WHERE app_user_id = 'd182-upgrade' AND id = 'd182-root'").run();
  assert.deepEqual(rows(db, "SELECT id, continuation_parent_entry_id, estimate_seconds FROM entries WHERE app_user_id = 'd182-upgrade'"), [
    { id: "d182-child", continuation_parent_entry_id: "d182-root", estimate_seconds: 450 },
  ], "live descendant identity and estimate stay unchanged");
  assert.deepEqual(rows(db, "SELECT deleted_entry_id, continuation_chain_id, continuation_parent_entry_id, root_estimate_seconds FROM continuation_lineage_tombstones"), [
    { deleted_entry_id: "d182-root", continuation_chain_id: "d182-root", continuation_parent_entry_id: null, root_estimate_seconds: 600 },
  ], "the minimal root baseline remains only while a descendant lives");
  assert.throws(() => db.prepare("DELETE FROM continuation_lineage_tombstones WHERE app_user_id = 'd182-upgrade' AND deleted_entry_id = 'd182-root'").run(),
    /continuation_lineage_still_required/);
  db.prepare("DELETE FROM interruption_delete_command_guards WHERE app_user_id = 'd182-upgrade' AND operation_id = 'd182-delete'").run();
  assert.equal(rows(db, "SELECT COUNT(*) AS count FROM interruption_delete_command_guards")[0]?.count, 0);
  integrity(db, "upgrade 0039 -> 0040");
  db.close();
}

await freshInstall();
await upgradePreservesData();
console.log("D-182 bounded migration validation: fresh 0001 -> 0040 and data-preserving 0039 -> 0040 passed");
