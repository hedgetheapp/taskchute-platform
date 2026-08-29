import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = join(appRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const persistencePath = await mkdtemp(join(tmpdir(), "taskchute-b1-migration-"));

function execute(args, expectSuccess = true) {
  const result = spawnSync(process.execPath, [wrangler, "d1", "execute", "taskchute-app-local", "--local",
    "--persist-to", persistencePath, "--yes", ...args], { cwd: appRoot, encoding: "utf8" });
  if (expectSuccess && result.status !== 0) {
    throw new Error(`wrangler d1 execute failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function applyFile(relativePath) {
  execute(["--file", join(appRoot, relativePath)]);
}

function query(sql) {
  const output = execute(["--command", sql, "--json"]).stdout.trim();
  const parsed = JSON.parse(output);
  assert(Array.isArray(parsed) && parsed.length === 1 && Array.isArray(parsed[0].results));
  return parsed[0].results;
}

try {
  applyFile("migrations/app/0001_runtime_bootstrap.sql");
  applyFile("migrations/app/0002_lifecycle_ordering.sql");
  applyFile("test/fixtures/dogfood-v01a-app.sql");
  applyFile("migrations/app/0003_dogfood_day_b1.sql");

  const legacyStartRequest = { entry_id: "019d2f00-0000-7000-8000-000000000002",
    execution_id: "019d2f00-0000-7000-8000-000000000003",
    operation_id: "019d2f00-0000-7000-8000-000000000001" };
  assert.equal(createHash("sha256").update(JSON.stringify(legacyStartRequest)).digest("hex"),
    "ae7259e4469236b36922e6e8b2cd9158b82602cd05777af2ed81d6599583c8c9");

  assert.deepEqual(query("SELECT id, lifecycle_state, estimate_seconds FROM entries ORDER BY id"), [
    { id: "019d2f00-0000-7000-8000-000000000002", lifecycle_state: "running", estimate_seconds: null },
    { id: "entry-planned", lifecycle_state: "planned", estimate_seconds: null },
  ]);
  assert.deepEqual(query("SELECT id, project_id FROM tasks ORDER BY id"), [
    { id: "task-planned", project_id: "project-v01a" },
    { id: "task-running", project_id: null },
  ]);
  assert.deepEqual(query("SELECT id, entry_id, ended_at FROM executions"), [
    { id: "019d2f00-0000-7000-8000-000000000003",
      entry_id: "019d2f00-0000-7000-8000-000000000002", ended_at: null },
  ]);
  assert.deepEqual(query(`SELECT operation_id, command_type, request_fingerprint, outcome_kind, result_json
    FROM operations ORDER BY operation_id`), [
    { operation_id: "019d2f00-0000-7000-8000-000000000001", command_type: "StartEntry",
      request_fingerprint: "ae7259e4469236b36922e6e8b2cd9158b82602cd05777af2ed81d6599583c8c9",
      outcome_kind: "success",
      result_json: "{\"entry_id\":\"019d2f00-0000-7000-8000-000000000002\",\"lifecycle_state\":\"running\",\"execution\":{\"id\":\"019d2f00-0000-7000-8000-000000000003\",\"entry_id\":\"019d2f00-0000-7000-8000-000000000002\",\"started_at\":\"2026-08-28T09:00:00.000Z\",\"ended_at\":null}}" },
    { operation_id: "operation-existing", command_type: "AddTaskToDay", request_fingerprint: "fixture-fingerprint",
      outcome_kind: "success", result_json: "{\"fixture\":true}" },
  ]);
  const contexts = query(`SELECT section_id, logical_start_minute, logical_end_minute,
    actual_start_instant, actual_end_instant FROM taskchute_day_section_contexts ORDER BY section_id`);
  assert.equal(contexts.length, 2);
  assert(contexts.every((row) => row.logical_start_minute === null && row.logical_end_minute === null
    && row.actual_start_instant === null && row.actual_end_instant === null));

  const entryColumns = query("PRAGMA table_info(entries)");
  assert.equal(entryColumns.find((column) => column.name === "section_id")?.notnull, 0);
  assert.equal(entryColumns.find((column) => column.name === "estimate_seconds")?.notnull, 0);
  const indexNames = new Set(query("PRAGMA index_list(entries)").map((index) => index.name));
  assert(indexNames.has("entries_section_position_unique"));
  assert(indexNames.has("entries_unsectioned_position_unique"));
  assert(new Set(query("PRAGMA index_list(executions)").map((index) => index.name)).has("one_active_execution_per_user"));

  execute(["--command", `INSERT INTO entries
    (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, created_at)
    VALUES ('entry-unsectioned', 'user-v01a', 'task-planned', 'day-v01a', NULL, 1, 'planned', NULL,
      '2026-08-28T00:00:00.000Z')`]);
  assert.deepEqual(query("SELECT section_id, estimate_seconds FROM entries WHERE id = 'entry-unsectioned'"),
    [{ section_id: null, estimate_seconds: null }]);
  const duplicateActive = execute(["--command", `INSERT INTO executions
    (id, app_user_id, entry_id, started_at, ended_at, created_at)
    VALUES ('execution-second-active', 'user-v01a', 'entry-planned', '2026-08-28T10:00:00.000Z', NULL,
      '2026-08-28T10:00:00.000Z')`], false);
  assert.notEqual(duplicateActive.status, 0, "the active Execution unique index must reject a second active row");
  assert.deepEqual(query("PRAGMA foreign_key_check"), []);
  console.log("migration regression: 1 scenario passed (15 data/schema checks; 0001 -> 0002 -> v0.1-A fixture -> 0003)");
} finally {
  await rm(persistencePath, { recursive: true, force: true });
}
