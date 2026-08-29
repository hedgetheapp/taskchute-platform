import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = join(appRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const persistencePath = await mkdtemp(join(tmpdir(), "taskchute-b3-migration-"));

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
  execute(["--command", `
    UPDATE entries SET estimate_seconds = 900 WHERE id = 'entry-planned';
    INSERT INTO section_configuration_versions (id, app_user_id, day_boundary_minutes, created_at)
      VALUES ('config-b1', 'user-v01a', 240, '2026-08-28T01:00:00.000Z');
    INSERT INTO section_configuration_items
      (app_user_id, configuration_version_id, section_id, title, logical_start_minute, logical_end_minute, configuration_order)
      VALUES
      ('user-v01a', 'config-b1', 'section-morning', 'Morning', 240, 720, 0),
      ('user-v01a', 'config-b1', 'section-evening', 'Evening', 720, 1680, 1);
    INSERT INTO section_configuration_heads (app_user_id, configuration_version_id) VALUES ('user-v01a', 'config-b1');
    INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES ('day-configured', 'user-v01a', '2026-08-29', '2026-08-28T19:00:00Z', '2026-08-29T19:00:00Z',
       'Asia/Tokyo', 240, 'compatible', 7, '2026-08-28T01:00:00.000Z');
    INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
       logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES
      ('user-v01a', 'day-configured', 'section-morning', 'config-b1', 'Morning', 240, 720,
       '2026-08-28T19:00:00Z', '2026-08-29T03:00:00Z', 0),
      ('user-v01a', 'day-configured', 'section-evening', 'config-b1', 'Evening', 720, 1680,
       '2026-08-29T03:00:00Z', '2026-08-29T19:00:00Z', 1);
  `]);
  applyFile("migrations/app/0004_dogfood_day_b2.sql");

  const preB3Entries = query(`SELECT id, section_id, estimate_seconds, planned_start_minute,
    position, lifecycle_state FROM entries ORDER BY id`);
  const preB3Operations = query(`SELECT app_user_id, operation_id, command_type, request_fingerprint_version,
    request_fingerprint, outcome_kind, result_json, created_at FROM operations ORDER BY operation_id`);
  const preB3Versions = query("SELECT * FROM section_configuration_versions ORDER BY app_user_id, id");
  const preB3Items = query(`SELECT * FROM section_configuration_items
    ORDER BY app_user_id, configuration_version_id, configuration_order`);
  const preB3Heads = query("SELECT * FROM section_configuration_heads ORDER BY app_user_id");
  const preB3Contexts = query(`SELECT * FROM taskchute_day_section_contexts
    ORDER BY app_user_id, taskchute_day_id, context_order`);
  applyFile("migrations/app/0005_dogfood_day_b3.sql");
  assert.deepEqual(query(`SELECT id, section_id, estimate_seconds, planned_start_minute,
    position, lifecycle_state FROM entries ORDER BY id`), preB3Entries);
  assert.deepEqual(query(`SELECT app_user_id, operation_id, command_type, request_fingerprint_version,
    request_fingerprint, outcome_kind, result_json, created_at FROM operations ORDER BY operation_id`), preB3Operations);
  assert.deepEqual(query("SELECT * FROM section_configuration_versions ORDER BY app_user_id, id"), preB3Versions);
  assert.deepEqual(query(`SELECT * FROM section_configuration_items
    ORDER BY app_user_id, configuration_version_id, configuration_order`), preB3Items);
  assert.deepEqual(query("SELECT * FROM section_configuration_heads ORDER BY app_user_id"), preB3Heads);
  assert.deepEqual(query(`SELECT * FROM taskchute_day_section_contexts
    ORDER BY app_user_id, taskchute_day_id, context_order`), preB3Contexts);

  const legacyStartRequest = { entry_id: "019d2f00-0000-7000-8000-000000000002",
    execution_id: "019d2f00-0000-7000-8000-000000000003",
    operation_id: "019d2f00-0000-7000-8000-000000000001" };
  assert.equal(createHash("sha256").update(JSON.stringify(legacyStartRequest)).digest("hex"),
    "ae7259e4469236b36922e6e8b2cd9158b82602cd05777af2ed81d6599583c8c9");

  assert.deepEqual(query("SELECT id, lifecycle_state, estimate_seconds, planned_start_minute FROM entries ORDER BY id"), [
    { id: "019d2f00-0000-7000-8000-000000000002", lifecycle_state: "running", estimate_seconds: null, planned_start_minute: null },
    { id: "entry-planned", lifecycle_state: "planned", estimate_seconds: 900, planned_start_minute: null },
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
    actual_start_instant, actual_end_instant FROM taskchute_day_section_contexts
    WHERE taskchute_day_id = 'day-v01a' ORDER BY section_id`);
  assert.equal(contexts.length, 2);
  assert(contexts.every((row) => row.logical_start_minute === null && row.logical_end_minute === null
    && row.actual_start_instant === null && row.actual_end_instant === null));
  assert.deepEqual(query(`SELECT section_id, configuration_version_id, logical_start_minute, logical_end_minute,
    actual_start_instant, actual_end_instant FROM taskchute_day_section_contexts
    WHERE taskchute_day_id = 'day-configured' ORDER BY context_order`), [
    { section_id: "section-morning", configuration_version_id: "config-b1", logical_start_minute: 240,
      logical_end_minute: 720, actual_start_instant: "2026-08-28T19:00:00Z", actual_end_instant: "2026-08-29T03:00:00Z" },
    { section_id: "section-evening", configuration_version_id: "config-b1", logical_start_minute: 720,
      logical_end_minute: 1680, actual_start_instant: "2026-08-29T03:00:00Z", actual_end_instant: "2026-08-29T19:00:00Z" },
  ]);
  assert.deepEqual(query("SELECT app_user_id, configuration_version_id FROM section_configuration_heads"), [
    { app_user_id: "user-v01a", configuration_version_id: "config-b1" },
  ]);
  assert.deepEqual(query("SELECT id, placement_revision FROM taskchute_days ORDER BY id"), [
    { id: "day-configured", placement_revision: 7 }, { id: "day-v01a", placement_revision: 2 },
  ]);

  const entryColumns = query("PRAGMA table_info(entries)");
  assert.equal(entryColumns.find((column) => column.name === "section_id")?.notnull, 0);
  assert.equal(entryColumns.find((column) => column.name === "estimate_seconds")?.notnull, 0);
  assert.equal(entryColumns.find((column) => column.name === "planned_start_minute")?.notnull, 0);
  const indexNames = new Set(query("PRAGMA index_list(entries)").map((index) => index.name));
  assert(indexNames.has("entries_section_position_unique"));
  assert(indexNames.has("entries_unsectioned_position_unique"));
  assert(indexNames.has("entries_planned_start_idx"));
  assert(new Set(query("PRAGMA index_list(executions)").map((index) => index.name)).has("one_active_execution_per_user"));

  execute(["--command", `INSERT INTO entries
    (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, planned_start_minute, created_at)
    VALUES ('entry-unsectioned', 'user-v01a', 'task-planned', 'day-v01a', NULL, 1, 'planned', NULL, NULL,
      '2026-08-28T00:00:00.000Z')`]);
  assert.deepEqual(query("SELECT section_id, estimate_seconds, planned_start_minute FROM entries WHERE id = 'entry-unsectioned'"),
    [{ section_id: null, estimate_seconds: null, planned_start_minute: null }]);
  const invalidSectionlessTime = execute(["--command",
    "UPDATE entries SET planned_start_minute = 300 WHERE id = 'entry-unsectioned'"], false);
  assert.notEqual(invalidSectionlessTime.status, 0, "Section-less non-null planned start must be rejected");
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-b2', 'SetEntryPlannedStart', 1, 'b2-fingerprint', 'success', '{}',
      '2026-08-28T02:00:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type, result_json FROM operations WHERE operation_id = 'operation-b2'"),
    [{ command_type: "SetEntryPlannedStart", result_json: "{}" }]);
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-b3', 'UpdateSectionConfiguration', 1, 'b3-fingerprint', 'success', '{}',
      '2026-08-28T03:00:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type, result_json FROM operations WHERE operation_id = 'operation-b3'"),
    [{ command_type: "UpdateSectionConfiguration", result_json: "{}" }]);
  const duplicateActive = execute(["--command", `INSERT INTO executions
    (id, app_user_id, entry_id, started_at, ended_at, created_at)
    VALUES ('execution-second-active', 'user-v01a', 'entry-planned', '2026-08-28T10:00:00.000Z', NULL,
      '2026-08-28T10:00:00.000Z')`], false);
  assert.notEqual(duplicateActive.status, 0, "the active Execution unique index must reject a second active row");
  assert.deepEqual(query("PRAGMA foreign_key_check"), []);
  console.log("migration regression: 1 scenario passed (32 data/schema checks; 0001 -> 0002 -> v0.1-A fixture -> 0003 -> B1 state -> 0004 -> preservation gate -> 0005)");
} finally {
  await rm(persistencePath, { recursive: true, force: true });
}
