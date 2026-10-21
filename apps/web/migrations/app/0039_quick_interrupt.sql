PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-181 identifies only Quick Interrupt Tasks created after this migration.
-- NULL is intentionally retained for all existing Tasks; no historical origin
-- is inferred from a title or lifecycle fact.
ALTER TABLE tasks ADD COLUMN quick_interrupt_origin TEXT
  CHECK (quick_interrupt_origin IS NULL OR quick_interrupt_origin = 'quick_interrupt');

-- Short-lived precondition row for the single atomic QuickInterruptEntry batch.
CREATE TABLE quick_interrupt_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  source_entry_id TEXT NOT NULL,
  source_execution_id TEXT NOT NULL,
  quick_task_id TEXT NOT NULL,
  target_entry_id TEXT NOT NULL,
  target_execution_id TEXT NOT NULL,
  continuation_entry_id TEXT NOT NULL,
  expected_placement_revision INTEGER NOT NULL CHECK (expected_placement_revision >= 0),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

-- Durable identity for the narrow D-181 B -> C display rule. Existing rows are
-- intentionally not backfilled because their historical relationship is unknown.
CREATE TABLE quick_interrupt_entry_pairs (
  app_user_id TEXT NOT NULL,
  target_entry_id TEXT NOT NULL,
  continuation_entry_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, continuation_entry_id),
  UNIQUE (app_user_id, target_entry_id),
  CHECK (target_entry_id <> continuation_entry_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, target_entry_id) REFERENCES entries(app_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (app_user_id, continuation_entry_id) REFERENCES entries(app_user_id, id) ON DELETE CASCADE
);

CREATE TRIGGER quick_interrupt_entry_pair_insert_guard
BEFORE INSERT ON quick_interrupt_entry_pairs
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
    FROM quick_interrupt_command_guards g
    JOIN entries target ON target.app_user_id = g.app_user_id AND target.id = g.target_entry_id
    JOIN tasks quick_task ON quick_task.app_user_id = target.app_user_id AND quick_task.id = target.task_id
    JOIN entries continuation ON continuation.app_user_id = g.app_user_id AND continuation.id = g.continuation_entry_id
   WHERE g.app_user_id = NEW.app_user_id
     AND g.target_entry_id = NEW.target_entry_id
     AND g.continuation_entry_id = NEW.continuation_entry_id
     AND target.lifecycle_state = 'running'
     AND target.task_id = g.quick_task_id
     AND quick_task.quick_interrupt_origin = 'quick_interrupt'
     AND continuation.lifecycle_state = 'planned'
     AND continuation.continuation_parent_entry_id = g.source_entry_id
     AND continuation.task_id = (SELECT source.task_id FROM entries source
       WHERE source.app_user_id = g.app_user_id AND source.id = g.source_entry_id)
     AND target.taskchute_day_id = continuation.taskchute_day_id
     AND target.section_id = continuation.section_id
     AND EXISTS (SELECT 1 FROM executions x WHERE x.app_user_id = g.app_user_id
       AND x.id = g.target_execution_id AND x.entry_id = target.id AND x.ended_at IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'quick_interrupt_entry_pair_requires_command_guard');
END;

CREATE TRIGGER quick_interrupt_entry_pair_immutable
BEFORE UPDATE ON quick_interrupt_entry_pairs
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'quick_interrupt_entry_pair_immutable');
END;

CREATE TRIGGER quick_interrupt_origin_insert_guard
BEFORE INSERT ON tasks
FOR EACH ROW
WHEN NEW.quick_interrupt_origin = 'quick_interrupt' AND NOT EXISTS (
  SELECT 1 FROM quick_interrupt_command_guards g
   WHERE g.app_user_id = NEW.app_user_id AND g.quick_task_id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'quick_interrupt_origin_requires_command_guard');
END;

CREATE TRIGGER quick_interrupt_origin_immutable
BEFORE UPDATE OF quick_interrupt_origin ON tasks
FOR EACH ROW
WHEN NEW.quick_interrupt_origin IS NOT OLD.quick_interrupt_origin
BEGIN
  SELECT RAISE(ABORT, 'quick_interrupt_origin_immutable');
END;

-- Preserve all existing replay records while extending the command allow-list.
CREATE TABLE operations_d181 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'InterruptEntry', 'QuickInterruptEntry', 'RevertEntryStart', 'SetExecutionTimes', 'UpdateTaskMetadata', 'DuplicateEntry', 'BulkDeleteEntries',
    'DeleteCompletedEntry', 'BulkMoveEntriesToDay', 'BulkMoveEntriesToSection',
    'BulkMoveEntriesToSectionOccurrence', 'BulkMoveEntriesToSectionScoped', 'BulkSetEntriesEstimateScoped',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine', 'SetRoutineEstimate',
    'SetRoutineSectionPlan', 'SetRoutineMode', 'SetRoutineTitle', 'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines',
    'DeleteRoutine', 'UpdateProject', 'SetProjectArchived', 'ReorderProjects', 'DeleteProject',
    'CreateMode', 'UpdateMode', 'ReorderModes', 'SetModeArchived', 'DeleteMode', 'SetEntryMode',
    'SetAutoCarryOverduePlanned', 'AutoCarryOverduePlanned',
    'UpsertEffectiveDayOverride', 'DeleteEffectiveDayOverride',
    'CreateStandaloneDocument', 'UpdateDocument', 'SetStandaloneDocumentArchived', 'DeleteStandaloneDocument',
    'EnsureTaskPrimaryDocument', 'UpdateTaskPrimaryDocument',
    'EnsureProjectPrimaryDocument', 'UpdateProjectPrimaryDocument',
    'EnsureDailyPrimaryDocument', 'UpdateDailyPrimaryDocument',
    'CreateFutureRoutineFromCompletedEntry'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_d181 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d181 RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
