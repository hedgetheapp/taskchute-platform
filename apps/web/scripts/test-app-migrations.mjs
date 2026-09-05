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
const r2bFailurePersistencePath = await mkdtemp(join(tmpdir(), "taskchute-r2b-migration-failure-"));

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

  const preR2BTasks = query("SELECT * FROM tasks ORDER BY id");
  const preR2BDefinitions = query("SELECT * FROM routine_definitions ORDER BY id");
  const preR2BOccurrences = query("SELECT * FROM routine_occurrences ORDER BY id");
  const preR2BEntries = query("SELECT * FROM entries ORDER BY id");
  const preR2BExecutions = query("SELECT * FROM executions ORDER BY id");
  const preR2BOperations = query("SELECT * FROM operations ORDER BY operation_id");
  applyFile("migrations/app/0008_routine_r2b_board.sql");
  assert.deepEqual(query("SELECT * FROM tasks ORDER BY id"), preR2BTasks);
  assert.deepEqual(query("SELECT * FROM routine_definitions ORDER BY id"), preR2BDefinitions);
  assert.deepEqual(query("SELECT * FROM routine_occurrences ORDER BY id"), preR2BOccurrences);
  assert.deepEqual(query("SELECT * FROM entries ORDER BY id"), preR2BEntries);
  assert.deepEqual(query("SELECT * FROM executions ORDER BY id"), preR2BExecutions);
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preR2BOperations);
  const preDuplicateOperations = query("SELECT * FROM operations ORDER BY operation_id");
  const preDuplicateEntries = query("SELECT * FROM entries ORDER BY id");
  const preDuplicateTasks = query("SELECT * FROM tasks ORDER BY id");
  const preDuplicateExecutions = query("SELECT * FROM executions ORDER BY id");
  applyFile("migrations/app/0009_duplicate_entry.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preDuplicateOperations);
  assert.deepEqual(query("SELECT * FROM entries ORDER BY id"), preDuplicateEntries);
  assert.deepEqual(query("SELECT * FROM tasks ORDER BY id"), preDuplicateTasks);
  assert.deepEqual(query("SELECT * FROM executions ORDER BY id"), preDuplicateExecutions);
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-duplicate-entry', 'DuplicateEntry', 1, 'duplicate-fingerprint', 'success', '{}',
      '2026-08-28T03:30:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type FROM operations WHERE operation_id = 'operation-duplicate-entry'"),
    [{ command_type: "DuplicateEntry" }]);
  execute(["--command", "DELETE FROM operations WHERE operation_id = 'operation-duplicate-entry'"]);
  assert.deepEqual(query(`SELECT routine_definition_id, schedule_kind, interval_days, weekdays_mask
    FROM routine_schedules ORDER BY routine_definition_id`), [
    { routine_definition_id: "routine-r2a-normalize", schedule_kind: "daily", interval_days: null, weekdays_mask: null },
  ]);
  assert.deepEqual(query(`SELECT routine_definition_id, board_position, settings_revision
    FROM routine_board_items ORDER BY board_position`), [
    { routine_definition_id: "routine-r2a-normalize", board_position: 1, settings_revision: 0 },
  ]);
  assert.deepEqual(query(`SELECT routine_occurrence_id, task_title, project_id, project_title
    FROM routine_occurrence_task_snapshots ORDER BY routine_occurrence_id`), [
    { routine_occurrence_id: "occurrence-r2a-preserve", task_title: "R2A protected authority",
      project_id: null, project_title: null },
  ]);
  const duplicateTaskRoutine = execute(["--command", `INSERT INTO routine_definitions
    (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
     default_section_id, default_estimate_seconds, default_planned_start_minute,
     materialization_order, defaults_revision, created_at)
    SELECT 'routine-r2b-duplicate', app_user_id, task_id, recurrence_type, start_logical_date,
      end_logical_date, default_section_id, default_estimate_seconds, default_planned_start_minute,
      2, defaults_revision, created_at FROM routine_definitions WHERE id = 'routine-r2a-normalize'`], false);
  assert.notEqual(duplicateTaskRoutine.status, 0, "Task -> RoutineDefinition must be 0..1");
  const invalidWeekly = execute(["--command", `UPDATE routine_schedules SET schedule_kind = 'weekly',
    weekdays_mask = 0 WHERE routine_definition_id = 'routine-r2a-normalize'`], false);
  assert.notEqual(invalidWeekly.status, 0, "weekly schedule requires at least one weekday");
  execute(["--command", `
    INSERT INTO routine_occurrences
      (id, app_user_id, routine_definition_id, origin_taskchute_day_id, created_at)
    VALUES
      ('occurrence-bulk-schedule', 'user-v01a', 'routine-r2a-normalize', 'day-v01a', '2026-08-28T04:00:00.000Z'),
      ('occurrence-bulk-period', 'user-v01a', 'routine-r2a-normalize', 'day-r2a-protected', '2026-08-28T04:00:00.000Z'),
      ('occurrence-bulk-paused', 'user-v01a', 'routine-r2a-normalize', 'day-r2a-editable', '2026-08-28T04:00:00.000Z');
    INSERT INTO routine_occurrence_suppressions
      (app_user_id, routine_occurrence_id, suppressed_at, reason)
    VALUES
      ('user-v01a', 'occurrence-bulk-schedule', '2026-08-28T05:00:00.000Z', 'schedule'),
      ('user-v01a', 'occurrence-bulk-period', '2026-08-28T05:00:00.000Z', 'period'),
      ('user-v01a', 'occurrence-bulk-paused', '2026-08-28T05:00:00.000Z', 'paused');
  `]);
  const preBulkOperations = query("SELECT * FROM operations ORDER BY operation_id");
  const preBulkSuppressions = query("SELECT * FROM routine_occurrence_suppressions ORDER BY routine_occurrence_id");
  applyFile("migrations/app/0010_bulk_selection_delete.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preBulkOperations);
  assert.deepEqual(query("SELECT * FROM routine_occurrence_suppressions ORDER BY routine_occurrence_id"), preBulkSuppressions);
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-bulk-selection', 'BulkDeleteEntries', 1, 'bulk-fingerprint', 'success', '{}',
      '2026-08-28T06:00:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type FROM operations WHERE operation_id = 'operation-bulk-selection'"),
    [{ command_type: "BulkDeleteEntries" }]);
  execute(["--command", `INSERT INTO routine_occurrence_suppressions
      (app_user_id, routine_occurrence_id, suppressed_at, reason)
      VALUES ('user-v01a', 'occurrence-r2a-preserve', '2026-08-28T06:00:00.000Z', 'skip');`]);
  const invalidSuppressionReason = execute(["--command", `UPDATE routine_occurrence_suppressions
    SET reason = 'manual' WHERE app_user_id = 'user-v01a'
      AND routine_occurrence_id = 'occurrence-r2a-preserve'`], false);
  assert.notEqual(invalidSuppressionReason.status, 0, "unknown suppression reason must be rejected");
  const preBulkSectionOperations = query("SELECT * FROM operations ORDER BY operation_id");
  applyFile("migrations/app/0011_bulk_section_change.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preBulkSectionOperations);
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-bulk-section', 'BulkMoveEntriesToSection', 1, 'bulk-section-fingerprint', 'success', '{}',
      '2026-08-28T06:30:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type FROM operations WHERE operation_id = 'operation-bulk-section'"),
    [{ command_type: "BulkMoveEntriesToSection" }]);
  const preBulkRoutineSectionOperations = query("SELECT * FROM operations ORDER BY operation_id");
  applyFile("migrations/app/0012_bulk_routine_section_occurrence.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preBulkRoutineSectionOperations);
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-bulk-routine-section', 'BulkMoveEntriesToSectionOccurrence', 1, 'bulk-routine-section-fingerprint', 'success', '{}',
      '2026-08-28T07:00:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type FROM operations WHERE operation_id = 'operation-bulk-routine-section'"),
    [{ command_type: "BulkMoveEntriesToSectionOccurrence" }]);
  const preBulkRoutineScopedOperations = query("SELECT * FROM operations ORDER BY operation_id");
  const preBulkRoutineScopedTables = query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  applyFile("migrations/app/0013_bulk_routine_section_scoped.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preBulkRoutineScopedOperations);
  assert.deepEqual(query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"), preBulkRoutineScopedTables,
    "0013 must not add or remove application tables");
  const operationTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operations'")[0]?.sql ?? "";
  assert(operationTable.includes("BulkMoveEntriesToSectionOccurrence"), "0013 must preserve the 0012 command CHECK entry");
  assert(operationTable.includes("BulkMoveEntriesToSectionScoped"), "0013 must add only the scoped command CHECK entry");
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-bulk-routine-section-scoped', 'BulkMoveEntriesToSectionScoped', 1, 'bulk-routine-section-scoped-fingerprint', 'success', '{}',
      '2026-08-28T07:30:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type FROM operations WHERE operation_id = 'operation-bulk-routine-section-scoped'"),
    [{ command_type: "BulkMoveEntriesToSectionScoped" }]);
  const invalidScopedCommand = execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-bulk-routine-section-invalid', 'NotACommand', 1, 'invalid-fingerprint', 'success', '{}',
      '2026-08-28T07:31:00.000Z')`], false);
  assert.notEqual(invalidScopedCommand.status, 0, "unknown operation command must remain rejected after 0013");
  execute(["--command", `INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
    VALUES ('user-v01a', 'operation-guard-preserve', 'SetRoutineEstimate')`]);
  const preBulkEstimateOperations = query("SELECT * FROM operations ORDER BY operation_id");
  const preBulkEstimateGuards = query("SELECT * FROM routine_command_guards ORDER BY operation_id");
  const preBulkEstimateTables = query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  applyFile("migrations/app/0014_bulk_estimate_scoped.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preBulkEstimateOperations,
    "0014 must preserve every operation row");
  assert.deepEqual(query("SELECT * FROM routine_command_guards ORDER BY operation_id"), preBulkEstimateGuards,
    "0014 must preserve every routine guard row");
  assert.deepEqual(query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"), preBulkEstimateTables,
    "0014 must not add or remove application tables");
  const estimateOperationTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operations'")[0]?.sql ?? "";
  const estimateGuardTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'routine_command_guards'")[0]?.sql ?? "";
  assert(estimateOperationTable.includes("BulkSetEntriesEstimateScoped"), "0014 must add the Bulk estimate command CHECK entry");
  assert(estimateGuardTable.includes("BulkSetEntriesEstimateScoped"), "0014 must add the Bulk estimate guard CHECK entry");
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-bulk-estimate-scoped', 'BulkSetEntriesEstimateScoped', 1, 'bulk-estimate-fingerprint', 'success', '{}',
      '2026-08-28T07:45:00.000Z')`]);
  execute(["--command", `INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
    VALUES ('user-v01a', 'operation-bulk-estimate-guard', 'BulkSetEntriesEstimateScoped')`]);
  const invalidEstimateCommand = execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-bulk-estimate-invalid', 'NotACommand', 1, 'invalid-estimate-fingerprint', 'success', '{}',
      '2026-08-28T07:46:00.000Z')`], false);
  assert.notEqual(invalidEstimateCommand.status, 0, "unknown operation command must remain rejected after 0014");
  const invalidEstimateGuard = execute(["--command", `INSERT INTO routine_command_guards (app_user_id, operation_id, command_type)
    VALUES ('user-v01a', 'operation-bulk-estimate-invalid-guard', 'NotACommand')`], false);
  assert.notEqual(invalidEstimateGuard.status, 0, "unknown routine guard command must remain rejected after 0014");
  const preDayMoveOperations = query("SELECT * FROM operations ORDER BY operation_id");
  const preDayMoveTables = query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  const preDayMovePlacementGuard = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'placement_command_guards'");
  const preDayMoveRoutineGuard = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'routine_command_guards'");
  applyFile("migrations/app/0015_day_move.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preDayMoveOperations,
    "0015 must preserve every operation row");
  assert.deepEqual(query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"), preDayMoveTables,
    "0015 must not add or remove application tables");
  assert.deepEqual(query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'placement_command_guards'"), preDayMovePlacementGuard,
    "0015 must preserve placement guard schema");
  assert.deepEqual(query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'routine_command_guards'"), preDayMoveRoutineGuard,
    "0015 must preserve Routine guard schema");
  const dayMoveOperationTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operations'")[0]?.sql ?? "";
  assert(dayMoveOperationTable.includes("BulkMoveEntriesToDay"), "0015 must add the Day move command CHECK entry");
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-day-move', 'BulkMoveEntriesToDay', 1, 'day-move-fingerprint', 'success', '{}',
      '2026-08-28T08:00:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type FROM operations WHERE operation_id = 'operation-day-move'"),
    [{ command_type: "BulkMoveEntriesToDay" }]);
  const invalidDayMoveCommand = execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-day-move-invalid', 'NotACommand', 1, 'invalid-day-move-fingerprint', 'success', '{}',
      '2026-08-28T08:01:00.000Z')`], false);
  assert.notEqual(invalidDayMoveCommand.status, 0, "unknown operation command must remain rejected after 0015");
  const preExecutionCorrectionOperations = query("SELECT * FROM operations ORDER BY operation_id");
  const preExecutionCorrectionLifecycleGuards = query("SELECT * FROM lifecycle_command_guards ORDER BY operation_id");
  const preExecutionCorrectionTables = query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  applyFile("migrations/app/0016_execution_correction.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preExecutionCorrectionOperations,
    "0016 must preserve every operation row");
  assert.deepEqual(query("SELECT * FROM lifecycle_command_guards ORDER BY operation_id"), preExecutionCorrectionLifecycleGuards,
    "0016 must preserve every lifecycle guard row");
  assert.deepEqual(query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"), preExecutionCorrectionTables,
    "0016 must not add or remove application tables");
  const executionCorrectionOperationTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operations'")[0]?.sql ?? "";
  const executionCorrectionGuardTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'lifecycle_command_guards'")[0]?.sql ?? "";
  assert(executionCorrectionOperationTable.includes("RevertEntryStart"), "0016 must add the RevertEntryStart command CHECK entry");
  assert(executionCorrectionOperationTable.includes("SetExecutionTimes"), "0016 must add the SetExecutionTimes command CHECK entry");
  assert(executionCorrectionGuardTable.includes("RevertEntryStart"), "0016 must add the RevertEntryStart guard CHECK entry");
  assert(executionCorrectionGuardTable.includes("SetExecutionTimes"), "0016 must add the SetExecutionTimes guard CHECK entry");
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-revert-start', 'RevertEntryStart', 1, 'revert-fingerprint', 'success', '{}',
      '2026-08-28T08:10:00.000Z'),
      ('user-v01a', 'operation-set-execution-times', 'SetExecutionTimes', 1, 'execution-times-fingerprint', 'success', '{}',
      '2026-08-28T08:11:00.000Z')`]);
  execute(["--command", `INSERT INTO lifecycle_command_guards
    (app_user_id, operation_id, entry_id, execution_id, command_type)
    VALUES ('user-v01a', 'guard-revert-start', '019d2f00-0000-7000-8000-000000000002',
      '019d2f00-0000-7000-8000-000000000003', 'RevertEntryStart'),
      ('user-v01a', 'guard-set-execution-times', '019d2f00-0000-7000-8000-000000000002',
      '019d2f00-0000-7000-8000-000000000003', 'SetExecutionTimes')`]);
  const invalidExecutionCorrectionCommand = execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-execution-correction-invalid', 'NotACommand', 1, 'invalid-d057-fingerprint', 'success', '{}',
      '2026-08-28T08:12:00.000Z')`], false);
  assert.notEqual(invalidExecutionCorrectionCommand.status, 0, "unknown operation command must remain rejected after 0016");
  const invalidExecutionCorrectionGuard = execute(["--command", `INSERT INTO lifecycle_command_guards
    (app_user_id, operation_id, entry_id, execution_id, command_type)
    VALUES ('user-v01a', 'guard-execution-correction-invalid', '019d2f00-0000-7000-8000-000000000002',
      '019d2f00-0000-7000-8000-000000000003', 'NotACommand')`], false);
  assert.notEqual(invalidExecutionCorrectionGuard.status, 0, "unknown lifecycle guard command must remain rejected after 0016");
  const preTaskMetadataOperations = query("SELECT * FROM operations ORDER BY operation_id");
  const preTaskMetadataLifecycleGuards = query("SELECT * FROM lifecycle_command_guards ORDER BY operation_id");
  const preTaskMetadataTables = query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  const preTaskMetadataTaskColumns = query("PRAGMA table_info(tasks)");
  const preTaskMetadataEntryColumns = query("PRAGMA table_info(entries)");
  applyFile("migrations/app/0017_task_metadata_update.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preTaskMetadataOperations,
    "0017 must preserve every operation row");
  assert.deepEqual(query("SELECT * FROM lifecycle_command_guards ORDER BY operation_id"), preTaskMetadataLifecycleGuards,
    "0017 must not alter lifecycle guard rows");
  assert.deepEqual(query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"), preTaskMetadataTables,
    "0017 must not add or remove application tables");
  assert.deepEqual(query("PRAGMA table_info(tasks)"), preTaskMetadataTaskColumns,
    "0017 must not alter Task columns");
  assert.deepEqual(query("PRAGMA table_info(entries)"), preTaskMetadataEntryColumns,
    "0017 must not alter Entry columns");
  const taskMetadataOperationTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operations'")[0]?.sql ?? "";
  assert(taskMetadataOperationTable.includes("UpdateTaskMetadata"), "0017 must add only the Task metadata command CHECK entry");
  assert(taskMetadataOperationTable.includes("RevertEntryStart"), "0017 must preserve historical RevertEntryStart compatibility");
  assert(taskMetadataOperationTable.includes("SetExecutionTimes"), "0017 must preserve SetExecutionTimes compatibility");
  const invalidTaskMetadataCommand = execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-task-metadata-invalid', 'NotACommand', 1, 'invalid-d060-fingerprint', 'success', '{}',
      '2026-08-28T08:13:00.000Z')`], false);
  assert.notEqual(invalidTaskMetadataCommand.status, 0, "unknown operation command must remain rejected after 0017");
  const preRoutineDeleteOperations = query("SELECT * FROM operations ORDER BY operation_id");
  const preRoutineDeleteGuards = query("SELECT * FROM routine_command_guards ORDER BY operation_id");
  const preRoutineDeleteDefinitions = query("SELECT * FROM routine_definitions ORDER BY id");
  const preRoutineDeleteOccurrences = query("SELECT * FROM routine_occurrences ORDER BY id");
  const preRoutineDeleteEntries = query("SELECT * FROM entries ORDER BY id");
  const preRoutineDeleteExecutions = query("SELECT * FROM executions ORDER BY id");
  const preRoutineDeleteTables = query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  applyFile("migrations/app/0018_routine_archive.sql");
  assert.deepEqual(query("SELECT * FROM operations ORDER BY operation_id"), preRoutineDeleteOperations,
    "0018 must preserve every operation row");
  assert.deepEqual(query("SELECT * FROM routine_command_guards ORDER BY operation_id"), preRoutineDeleteGuards,
    "0018 must preserve every Routine guard row");
  assert.deepEqual(query("SELECT * FROM routine_definitions ORDER BY id"), preRoutineDeleteDefinitions,
    "0018 must preserve RoutineDefinition identity");
  assert.deepEqual(query("SELECT * FROM routine_occurrences ORDER BY id"), preRoutineDeleteOccurrences,
    "0018 must preserve RoutineOccurrence history");
  assert.deepEqual(query("SELECT * FROM entries ORDER BY id"), preRoutineDeleteEntries,
    "0018 must preserve materialized Entries");
  assert.deepEqual(query("SELECT * FROM executions ORDER BY id"), preRoutineDeleteExecutions,
    "0018 must preserve Execution history");
  const postRoutineDeleteTables = query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  assert.equal(postRoutineDeleteTables.length, preRoutineDeleteTables.length + 1,
    "0018 must add one application table");
  assert.deepEqual(postRoutineDeleteTables.filter((row) => row.name !== "routine_definition_archives"),
    preRoutineDeleteTables.filter((row) => row.name !== "routine_definition_archives"),
    "0018 must add only the Routine archive table");
  assert.deepEqual(postRoutineDeleteTables.filter((row) => row.name === "routine_definition_archives"),
    [{ name: "routine_definition_archives" }]);
  const routineDeleteOperationTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'operations'")[0]?.sql ?? "";
  const routineDeleteGuardTable = query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'routine_command_guards'")[0]?.sql ?? "";
  assert(routineDeleteOperationTable.includes("DeleteRoutine"), "0018 must add the DeleteRoutine operation CHECK entry");
  assert(routineDeleteGuardTable.includes("DeleteRoutine"), "0018 must add the DeleteRoutine guard CHECK entry");
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-routine-delete', 'DeleteRoutine', 1, 'routine-delete-fingerprint', 'success', '{}',
      '2026-08-28T08:14:00.000Z')`]);
  execute(["--command", `INSERT INTO routine_command_guards
    (app_user_id, operation_id, command_type)
    VALUES ('user-v01a', 'guard-routine-delete', 'DeleteRoutine')`]);
  execute(["--command", `INSERT INTO routine_definition_archives
    (app_user_id, routine_definition_id, archived_at)
    VALUES ('user-v01a', 'routine-r2a-normalize', '2026-08-28T08:14:00.000Z')`]);
  const invalidRoutineDeleteCommand = execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-routine-delete-invalid', 'NotACommand', 1, 'invalid-d064-fingerprint', 'success', '{}',
      '2026-08-28T08:15:00.000Z')`], false);
  assert.notEqual(invalidRoutineDeleteCommand.status, 0, "unknown operation command must remain rejected after 0018");
  const invalidRoutineDeleteGuard = execute(["--command", `INSERT INTO routine_command_guards
    (app_user_id, operation_id, command_type)
    VALUES ('user-v01a', 'guard-routine-delete-invalid', 'NotACommand')`], false);
  assert.notEqual(invalidRoutineDeleteGuard.status, 0, "unknown Routine guard command must remain rejected after 0018");
  assert.deepEqual(query("PRAGMA quick_check"), [{ quick_check: "ok" }]);
  assert.deepEqual(query("PRAGMA foreign_key_check"), []);
  execute(["--command", `DELETE FROM routine_definition_archives
    WHERE app_user_id = 'user-v01a' AND routine_definition_id = 'routine-r2a-normalize';
    DELETE FROM routine_command_guards WHERE app_user_id = 'user-v01a' AND operation_id = 'guard-routine-delete';
    DELETE FROM operations WHERE app_user_id = 'user-v01a' AND operation_id = 'operation-routine-delete';`]);
  assert.deepEqual(query("PRAGMA quick_check"), [{ quick_check: "ok" }]);
  assert.deepEqual(query("PRAGMA foreign_key_check"), []);
  assert.deepEqual(query("PRAGMA quick_check"), [{ quick_check: "ok" }]);
  assert.deepEqual(query("PRAGMA foreign_key_check"), []);

  for (const migration of ["0001_runtime_bootstrap.sql", "0002_lifecycle_ordering.sql",
    "0003_dogfood_day_b1.sql", "0004_dogfood_day_b2.sql", "0005_dogfood_day_b3.sql",
    "0006_minimal_routine_r1.sql", "0007_routine_r2a.sql"])
    applyFile(`migrations/app/${migration}`, r2bFailurePersistencePath);
  execute(["--command", `
    INSERT INTO app_users (id, created_at) VALUES ('r2b-duplicate-user', '2026-09-01T00:00:00Z');
    INSERT INTO tasks (id, app_user_id, title, created_at)
      VALUES ('r2b-duplicate-task', 'r2b-duplicate-user', 'Duplicate', '2026-09-01T00:00:00Z');
    INSERT INTO routine_definitions
      (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute,
       materialization_order, defaults_revision, created_at)
      VALUES
      ('r2b-duplicate-a', 'r2b-duplicate-user', 'r2b-duplicate-task', 'daily', '2026-09-01', NULL,
       NULL, NULL, NULL, 1, 0, '2026-09-01T00:00:00Z'),
      ('r2b-duplicate-b', 'r2b-duplicate-user', 'r2b-duplicate-task', 'daily', '2026-09-01', NULL,
       NULL, NULL, NULL, 2, 0, '2026-09-01T00:00:00Z');
  `], true, r2bFailurePersistencePath);
  const failedR2B = execute(["--file", join(appRoot, "migrations/app/0008_routine_r2b_board.sql")], false,
    r2bFailurePersistencePath);
  assert.notEqual(failedR2B.status, 0, "duplicate RoutineDefinitions for one Task must fail migration");
  assert.equal(query("SELECT name FROM sqlite_master WHERE type='table' AND name='routine_schedules'",
    r2bFailurePersistencePath).length, 0, "failed R2B migration must leave no partial schema");

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
    { operation_id: "operation-bulk-estimate-scoped", command_type: "BulkSetEntriesEstimateScoped",
      request_fingerprint: "bulk-estimate-fingerprint", outcome_kind: "success", result_json: "{}" },
    { operation_id: "operation-bulk-routine-section", command_type: "BulkMoveEntriesToSectionOccurrence",
      request_fingerprint: "bulk-routine-section-fingerprint", outcome_kind: "success", result_json: "{}" },
    { operation_id: "operation-bulk-routine-section-scoped", command_type: "BulkMoveEntriesToSectionScoped",
      request_fingerprint: "bulk-routine-section-scoped-fingerprint", outcome_kind: "success", result_json: "{}" },
    { operation_id: "operation-bulk-section", command_type: "BulkMoveEntriesToSection",
      request_fingerprint: "bulk-section-fingerprint", outcome_kind: "success", result_json: "{}" },
    { operation_id: "operation-bulk-selection", command_type: "BulkDeleteEntries",
      request_fingerprint: "bulk-fingerprint", outcome_kind: "success", result_json: "{}" },
    { operation_id: "operation-day-move", command_type: "BulkMoveEntriesToDay",
      request_fingerprint: "day-move-fingerprint", outcome_kind: "success", result_json: "{}" },
    { operation_id: "operation-existing", command_type: "AddTaskToDay", request_fingerprint: "fixture-fingerprint",
      outcome_kind: "success", result_json: "{\"fixture\":true}" },
    { operation_id: "operation-revert-start", command_type: "RevertEntryStart", request_fingerprint: "revert-fingerprint",
      outcome_kind: "success", result_json: "{}" },
    { operation_id: "operation-set-execution-times", command_type: "SetExecutionTimes", request_fingerprint: "execution-times-fingerprint",
      outcome_kind: "success", result_json: "{}" },
  ]);
  execute(["--command", `INSERT INTO operations
    (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
    VALUES ('user-v01a', 'operation-task-metadata', 'UpdateTaskMetadata', 1, 'task-metadata-fingerprint', 'success', '{}',
      '2026-08-28T08:14:00.000Z')`]);
  assert.deepEqual(query("SELECT command_type FROM operations WHERE operation_id = 'operation-task-metadata'"),
    [{ command_type: "UpdateTaskMetadata" }]);
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
  console.log("migration regression: 4 scenarios passed (R2A normalization, R2B preservation/constraints, duplicate-Task fail-safe, Bulk Selection 0010/0011/0012/0013/0014/0015/0016/0017/0018 preservation/constraints; fresh 0001 -> 0018 chain)");
} finally {
  await rm(persistencePath, { recursive: true, force: true });
  await rm(failurePersistencePath, { recursive: true, force: true });
  await rm(r2bFailurePersistencePath, { recursive: true, force: true });
}
