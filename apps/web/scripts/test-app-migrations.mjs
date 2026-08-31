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
const failurePersistencePath = await mkdtemp(join(tmpdir(), "taskchute-r2a-migration-failure-"));

function execute(args, expectSuccess = true, persistTo = persistencePath) {
  const result = spawnSync(process.execPath, [wrangler, "d1", "execute", "taskchute-app-local", "--local",
    "--persist-to", persistTo, "--yes", ...args], { cwd: appRoot, encoding: "utf8" });
  if (expectSuccess && result.status !== 0) {
    throw new Error(`wrangler d1 execute failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function applyFile(relativePath, persistTo = persistencePath) {
  execute(["--file", join(appRoot, relativePath)], true, persistTo);
}

function query(sql, persistTo = persistencePath) {
  const output = execute(["--command", sql, "--json"], true, persistTo).stdout.trim();
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

  const preR1Entries = query(`SELECT id, app_user_id, task_id, taskchute_day_id, section_id, position,
    lifecycle_state, estimate_seconds, created_at, planned_start_minute FROM entries ORDER BY id`);
  const preR1Tasks = query("SELECT * FROM tasks ORDER BY id");
  const preR1Days = query("SELECT * FROM taskchute_days ORDER BY id");
  const preR1Executions = query("SELECT * FROM executions ORDER BY id");
  const preR1Operations = query("SELECT * FROM operations ORDER BY operation_id");
  applyFile("migrations/app/0006_minimal_routine_r1.sql");
  assert.deepEqual(query(`SELECT id, app_user_id, task_id, taskchute_day_id, section_id, position,
    lifecycle_state, estimate_seconds, created_at, planned_start_minute FROM entries ORDER BY id`), preR1Entries);
  assert(query("SELECT routine_occurrence_id FROM entries").every((row) => row.routine_occurrence_id === null));
  assert.deepEqual(query("SELECT * FROM tasks ORDER BY id"), preR1Tasks);
  assert.deepEqual(query("SELECT * FROM taskchute_days ORDER BY id"), preR1Days);
  assert.deepEqual(query("SELECT * FROM executions ORDER BY id"), preR1Executions);
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preR1Operations);
  assert.deepEqual(query("SELECT * FROM section_configuration_versions ORDER BY app_user_id, id"), preB3Versions);
  assert.deepEqual(query(`SELECT * FROM section_configuration_items
    ORDER BY app_user_id, configuration_version_id, configuration_order`), preB3Items);
  assert.deepEqual(query("SELECT * FROM section_configuration_heads ORDER BY app_user_id"), preB3Heads);
  assert.deepEqual(query(`SELECT * FROM taskchute_day_section_contexts
    ORDER BY app_user_id, taskchute_day_id, context_order`), preB3Contexts);
  assert.deepEqual(query("SELECT * FROM routine_definitions"), []);
  assert.deepEqual(query("SELECT * FROM routine_occurrences"), []);

  execute(["--command", `
    UPDATE entries SET section_id = NULL WHERE id = 'entry-planned';
    INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
      VALUES ('section-past-unknown', 'user-v01a', 'Past unknown', 2, '2026-08-28T04:00:00.000Z');
    INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES
      ('day-r2a-protected', 'user-v01a', '2000-01-01', '2000-01-01T00:00:00.000Z',
        '2000-01-02T00:00:00.000Z', 'UTC', 0, 'compatible', 0, '2026-08-28T04:00:00.000Z'),
      ('day-r2a-editable', 'user-v01a', '2999-01-01', '2999-01-01T00:00:00.000Z',
        '2999-01-02T00:00:00.000Z', 'UTC', 0, 'compatible', 0, '2026-08-28T04:00:00.000Z');
    INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
       logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
      VALUES
      ('user-v01a', 'day-r2a-protected', 'section-morning', 'config-b1', 'Morning',
        240, 720, '2000-01-01T04:00:00.000Z', '2000-01-01T12:00:00.000Z', 0),
      ('user-v01a', 'day-r2a-protected', 'section-past-unknown', NULL, 'Past unknown',
        NULL, NULL, NULL, NULL, 1),
      ('user-v01a', 'day-r2a-editable', 'section-morning', 'config-b1', 'Morning',
        240, 720, '2999-01-01T04:00:00.000Z', '2999-01-01T12:00:00.000Z', 0);
    INSERT INTO tasks (id, app_user_id, title, created_at)
      VALUES
      ('task-r2a-normalize', 'user-v01a', 'R2A protected authority', '2026-08-28T04:00:00.000Z'),
      ('task-r2a-past-authority', 'user-v01a', 'R2A protected authority', '2026-08-28T04:00:00.000Z'),
      ('task-r2a-past-missing', 'user-v01a', 'R2A protected missing', '2026-08-28T04:00:00.000Z'),
      ('task-r2a-editable', 'user-v01a', 'R2A editable normalize', '2026-08-28T04:00:00.000Z');
    INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, planned_start_minute, created_at)
      VALUES
      ('entry-r2a-normalize', 'user-v01a', 'task-r2a-normalize', 'day-configured',
        'section-morning', 2, 'planned', 600, 240, '2026-08-28T04:00:00.000Z'),
      ('entry-r2a-past-authority', 'user-v01a', 'task-r2a-past-authority', 'day-r2a-protected',
        'section-morning', 1, 'planned', 600, NULL, '2026-08-28T04:00:00.000Z'),
      ('entry-r2a-past-missing', 'user-v01a', 'task-r2a-past-missing', 'day-r2a-protected',
        'section-past-unknown', 1, 'planned', 300, NULL, '2026-08-28T04:00:00.000Z'),
      ('entry-r2a-editable', 'user-v01a', 'task-r2a-editable', 'day-r2a-editable',
        'section-morning', 1, 'planned', 1200, NULL, '2026-08-28T04:00:00.000Z');
    INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute, materialization_order, created_at)
      VALUES ('routine-r2a-normalize', 'user-v01a', 'task-r2a-normalize', 'daily', '2026-08-29', NULL,
        'section-morning', 600, NULL, 1, '2026-08-28T04:00:00.000Z');
    INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
      VALUES ('occurrence-r2a-preserve', 'user-v01a', 'routine-r2a-normalize', 'day-configured',
        '2026-08-28T04:00:00.000Z');
    UPDATE entries SET routine_occurrence_id = 'occurrence-r2a-preserve' WHERE id = 'entry-r2a-normalize';
  `]);
  const preR2AOccurrence = query("SELECT * FROM routine_occurrences WHERE id = 'occurrence-r2a-preserve'")[0];
  const preR2AProtected = query(`SELECT id, section_id, planned_start_minute, lifecycle_state FROM entries
    WHERE lifecycle_state <> 'planned' ORDER BY id`);
  const preR2APastPlanned = query(`SELECT id, section_id, planned_start_minute, lifecycle_state FROM entries
    WHERE id IN ('entry-r2a-past-authority', 'entry-r2a-past-missing') ORDER BY id`);
  applyFile("migrations/app/0007_routine_r2a.sql");
  assert.deepEqual(query(`SELECT id, section_id, planned_start_minute FROM entries
    WHERE id IN ('entry-planned', 'entry-r2a-editable', 'entry-r2a-normalize', 'entry-r2a-past-authority', 'entry-r2a-past-missing') ORDER BY id`), [
    { id: "entry-planned", section_id: null, planned_start_minute: null },
    { id: "entry-r2a-editable", section_id: "section-morning", planned_start_minute: 240 },
    { id: "entry-r2a-normalize", section_id: "section-morning", planned_start_minute: 240 },
    { id: "entry-r2a-past-authority", section_id: "section-morning", planned_start_minute: null },
    { id: "entry-r2a-past-missing", section_id: "section-past-unknown", planned_start_minute: null },
  ]);
  assert.deepEqual(query(`SELECT id, section_id, planned_start_minute, lifecycle_state FROM entries
    WHERE id IN ('entry-r2a-past-authority', 'entry-r2a-past-missing') ORDER BY id`), preR2APastPlanned);
  assert.deepEqual(query(`SELECT id, default_section_id, default_planned_start_minute, defaults_revision
    FROM routine_definitions WHERE id = 'routine-r2a-normalize'`), [
    { id: "routine-r2a-normalize", default_section_id: "section-morning",
      default_planned_start_minute: 240, defaults_revision: 0 },
  ]);
  assert.deepEqual(query(`SELECT id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at,
    section_plan_override_present, section_override_id, planned_start_override_minute,
    estimate_override_present, estimate_override_seconds FROM routine_occurrences
    WHERE id = 'occurrence-r2a-preserve'`), [{ ...preR2AOccurrence,
    section_plan_override_present: 0, section_override_id: null, planned_start_override_minute: null,
    estimate_override_present: 0, estimate_override_seconds: null,
  }]);
  assert.deepEqual(query(`SELECT id, section_id, planned_start_minute, lifecycle_state FROM entries
    WHERE lifecycle_state <> 'planned' ORDER BY id`), preR2AProtected);

  execute(["--command", `UPDATE routine_occurrences SET estimate_override_present = 1,
    estimate_override_seconds = NULL, section_plan_override_present = 1,
    section_override_id = NULL, planned_start_override_minute = NULL
    WHERE id = 'occurrence-r2a-preserve'`]);
  assert.deepEqual(query(`SELECT estimate_override_present, estimate_override_seconds,
    section_plan_override_present, section_override_id, planned_start_override_minute
    FROM routine_occurrences WHERE id = 'occurrence-r2a-preserve'`), [{
    estimate_override_present: 1, estimate_override_seconds: null, section_plan_override_present: 1,
    section_override_id: null, planned_start_override_minute: null,
  }]);
  const invalidEstimateOverride = execute(["--command", `UPDATE routine_occurrences
    SET estimate_override_present = 0, estimate_override_seconds = 600
    WHERE id = 'occurrence-r2a-preserve'`], false);
  assert.notEqual(invalidEstimateOverride.status, 0, "mixed estimate override state must be rejected");
  const invalidSectionOverride = execute(["--command", `UPDATE routine_occurrences
    SET section_plan_override_present = 1, section_override_id = 'section-morning', planned_start_override_minute = NULL
    WHERE id = 'occurrence-r2a-preserve'`], false);
  assert.notEqual(invalidSectionOverride.status, 0, "mixed Section-plan override state must be rejected");
  const crossOwner = execute(["--command", `
    INSERT INTO app_users (id, created_at) VALUES ('other-r2a-owner', '2026-08-28T04:00:00.000Z');
    INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
      VALUES ('other-r2a-section', 'other-r2a-owner', 'Other', 0, '2026-08-28T04:00:00.000Z');
    UPDATE routine_occurrences SET section_plan_override_present = 1,
      section_override_id = 'other-r2a-section', planned_start_override_minute = 240
      WHERE id = 'occurrence-r2a-preserve';
  `], false);
  assert.notEqual(crossOwner.status, 0, "Section override must use an owner-scoped Section FK");
  const invalidDefaultPair = execute(["--command", `UPDATE routine_definitions
    SET default_planned_start_minute = NULL WHERE id = 'routine-r2a-normalize'`], false);
  assert.notEqual(invalidDefaultPair.status, 0, "Routine default Section/start pair must stay synchronized");
  const invalidDefaultsRevision = execute(["--command", `UPDATE routine_definitions
    SET defaults_revision = -1 WHERE id = 'routine-r2a-normalize'`], false);
  assert.notEqual(invalidDefaultsRevision.status, 0, "Routine defaults revision must be non-negative");
  assert.deepEqual(query("PRAGMA quick_check"), [{ quick_check: "ok" }]);
  assert.deepEqual(query("PRAGMA foreign_key_check"), []);

  for (const migration of ["0001_runtime_bootstrap.sql", "0002_lifecycle_ordering.sql",
    "0003_dogfood_day_b1.sql", "0004_dogfood_day_b2.sql", "0005_dogfood_day_b3.sql",
    "0006_minimal_routine_r1.sql"]) applyFile(`migrations/app/${migration}`, failurePersistencePath);
  execute(["--command", `
    INSERT INTO app_users (id, created_at) VALUES ('r2a-failure-user', '2026-08-28T00:00:00.000Z');
    INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at)
      VALUES ('r2a-failure-user', 'UTC', 0, '2026-08-28T00:00:00.000Z');
    INSERT INTO sections (id, app_user_id, title, sort_order, created_at)
      VALUES ('r2a-failure-section', 'r2a-failure-user', 'Unknown', 0, '2026-08-28T00:00:00.000Z');
    INSERT INTO taskchute_days
      (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
       establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
      VALUES ('r2a-failure-day', 'r2a-failure-user', '2999-01-01', '2999-01-01T00:00:00.000Z',
        '2999-01-02T00:00:00.000Z', 'UTC', 0, 'compatible', 0, '2026-08-28T00:00:00.000Z');
    INSERT INTO taskchute_day_section_contexts
      (app_user_id, taskchute_day_id, section_id, title, context_order)
      VALUES ('r2a-failure-user', 'r2a-failure-day', 'r2a-failure-section', 'Unknown', 0);
    INSERT INTO tasks (id, app_user_id, title, created_at)
      VALUES ('r2a-failure-task', 'r2a-failure-user', 'Must fail', '2026-08-28T00:00:00.000Z');
    INSERT INTO entries
      (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       planned_start_minute, created_at)
      VALUES ('r2a-failure-entry', 'r2a-failure-user', 'r2a-failure-task', 'r2a-failure-day',
        'r2a-failure-section', 1, 'planned', NULL, '2026-08-28T00:00:00.000Z');
  `], true, failurePersistencePath);
  const failedMigration = execute(["--file", join(appRoot, "migrations/app/0007_routine_r2a.sql")], false,
    failurePersistencePath);
  assert.notEqual(failedMigration.status, 0, "missing authoritative Section timing must fail migration");
  assert.deepEqual(query("SELECT section_id, planned_start_minute FROM entries WHERE id = 'r2a-failure-entry'",
    failurePersistencePath), [{ section_id: "r2a-failure-section", planned_start_minute: null }]);
  assert.equal(query("PRAGMA table_info(routine_definitions)", failurePersistencePath)
    .some((column) => column.name === "defaults_revision"), false, "failed migration must leave no partial schema");

  const legacyStartRequest = { entry_id: "019d2f00-0000-7000-8000-000000000002",
    execution_id: "019d2f00-0000-7000-8000-000000000003",
    operation_id: "019d2f00-0000-7000-8000-000000000001" };
  assert.equal(createHash("sha256").update(JSON.stringify(legacyStartRequest)).digest("hex"),
    "ae7259e4469236b36922e6e8b2cd9158b82602cd05777af2ed81d6599583c8c9");

  assert.deepEqual(query("SELECT id, lifecycle_state, estimate_seconds, planned_start_minute FROM entries ORDER BY id"), [
    { id: "019d2f00-0000-7000-8000-000000000002", lifecycle_state: "running", estimate_seconds: null, planned_start_minute: null },
    { id: "entry-planned", lifecycle_state: "planned", estimate_seconds: 900, planned_start_minute: null },
    { id: "entry-r2a-editable", lifecycle_state: "planned", estimate_seconds: 1200, planned_start_minute: 240 },
    { id: "entry-r2a-normalize", lifecycle_state: "planned", estimate_seconds: 600, planned_start_minute: 240 },
    { id: "entry-r2a-past-authority", lifecycle_state: "planned", estimate_seconds: 600, planned_start_minute: null },
    { id: "entry-r2a-past-missing", lifecycle_state: "planned", estimate_seconds: 300, planned_start_minute: null },
  ]);
  assert.deepEqual(query("SELECT id, project_id FROM tasks ORDER BY id"), [
    { id: "task-planned", project_id: "project-v01a" },
    { id: "task-r2a-editable", project_id: null },
    { id: "task-r2a-normalize", project_id: null },
    { id: "task-r2a-past-authority", project_id: null },
    { id: "task-r2a-past-missing", project_id: null },
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
    { id: "day-configured", placement_revision: 7 }, { id: "day-r2a-editable", placement_revision: 0 },
    { id: "day-r2a-protected", placement_revision: 0 },
    { id: "day-v01a", placement_revision: 2 },
  ]);

  const entryColumns = query("PRAGMA table_info(entries)");
  assert.equal(entryColumns.find((column) => column.name === "section_id")?.notnull, 0);
  assert.equal(entryColumns.find((column) => column.name === "estimate_seconds")?.notnull, 0);
  assert.equal(entryColumns.find((column) => column.name === "planned_start_minute")?.notnull, 0);
  assert.equal(entryColumns.find((column) => column.name === "routine_occurrence_id")?.notnull, 0);
  const indexNames = new Set(query("PRAGMA index_list(entries)").map((index) => index.name));
  assert(indexNames.has("entries_section_position_unique"));
  assert(indexNames.has("entries_unsectioned_position_unique"));
  assert(indexNames.has("entries_planned_start_idx"));
  assert(indexNames.has("entries_routine_occurrence_idx"));
  assert(new Set(query("PRAGMA index_list(executions)").map((index) => index.name)).has("one_active_execution_per_user"));

  execute(["--command", `INSERT INTO entries
    (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, planned_start_minute, created_at)
    VALUES ('entry-unsectioned', 'user-v01a', 'task-planned', 'day-v01a', NULL, 2, 'planned', NULL, NULL,
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
  assert.deepEqual(query("PRAGMA quick_check"), [{ quick_check: "ok" }]);
  assert.deepEqual(query("PRAGMA foreign_key_check"), []);
  console.log("migration regression: 2 scenarios passed (R2A preservation/normalization/constraints and fail-safe rollback; chain through 0007)");
} finally {
  await rm(persistencePath, { recursive: true, force: true });
  await rm(failurePersistencePath, { recursive: true, force: true });
}
