PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-073 Interrupt/Continuation v0.1.  Existing execution facts remain intact;
-- terminal_outcome is populated only by new lifecycle writes.  NULL therefore
-- preserves the meaning of pre-0023 history instead of fabricating a result.
ALTER TABLE executions ADD COLUMN terminal_outcome TEXT
  CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('completed', 'interrupted'));

ALTER TABLE entries ADD COLUMN continuation_chain_id TEXT;
ALTER TABLE entries ADD COLUMN continuation_parent_entry_id TEXT;
UPDATE entries SET continuation_chain_id = id WHERE continuation_chain_id IS NULL;

-- Future ordinary Entry inserts receive a singleton chain identity without
-- requiring every legacy insert path to know about D-073.  Continuations pass
-- an explicit chain id and parent, so the trigger leaves those facts intact.
CREATE TRIGGER entries_continuation_chain_after_insert
AFTER INSERT ON entries
WHEN NEW.continuation_chain_id IS NULL
BEGIN
  UPDATE entries SET continuation_chain_id = NEW.id
   WHERE app_user_id = NEW.app_user_id AND id = NEW.id;
END;

CREATE INDEX entries_continuation_chain_idx
  ON entries(app_user_id, continuation_chain_id, taskchute_day_id, position);

-- Historical Task identity for new execution facts only.  No pre-0023 rows
-- are backfilled because their historical title was not captured at the time.
CREATE TABLE entry_task_snapshots (
  app_user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL CHECK (length(trim(task_title)) BETWEEN 1 AND 300),
  captured_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, entry_id),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX entry_task_snapshots_task_idx
  ON entry_task_snapshots(app_user_id, task_id);

-- Short-lived atomic precondition for InterruptEntry.  Entry ids are kept as
-- plain values because the continuation row is created in the same batch.
CREATE TABLE interrupt_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  source_entry_id TEXT NOT NULL,
  source_execution_id TEXT NOT NULL,
  target_entry_id TEXT NOT NULL,
  target_execution_id TEXT NOT NULL,
  continuation_entry_id TEXT NOT NULL,
  expected_placement_revision INTEGER NOT NULL CHECK (expected_placement_revision >= 0),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

-- Preserve every existing operation row while adding the dedicated command.
CREATE TABLE operations_interrupt_continuation (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'InterruptEntry', 'RevertEntryStart', 'SetExecutionTimes', 'UpdateTaskMetadata', 'DuplicateEntry', 'BulkDeleteEntries',
    'DeleteCompletedEntry', 'BulkMoveEntriesToDay', 'BulkMoveEntriesToSection',
    'BulkMoveEntriesToSectionOccurrence', 'BulkMoveEntriesToSectionScoped', 'BulkSetEntriesEstimateScoped',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine', 'SetRoutineEstimate',
    'SetRoutineSectionPlan', 'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines',
    'DeleteRoutine', 'UpdateProject', 'SetProjectArchived', 'ReorderProjects', 'DeleteProject',
    'CreateMode', 'UpdateMode', 'ReorderModes', 'SetModeArchived', 'DeleteMode', 'SetEntryMode'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_interrupt_continuation SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_interrupt_continuation RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
