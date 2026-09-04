PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- Compatibility-only extension for D-057. Execution facts and guard rows keep
-- their existing shape; only the allow-list of command types is widened.
CREATE TABLE operations_execution_correction (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'RevertEntryStart', 'SetExecutionTimes', 'DuplicateEntry', 'BulkDeleteEntries',
    'BulkMoveEntriesToDay', 'BulkMoveEntriesToSection', 'BulkMoveEntriesToSectionOccurrence',
    'BulkMoveEntriesToSectionScoped', 'BulkSetEntriesEstimateScoped',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine',
    'SetRoutineEstimate', 'SetRoutineSectionPlan',
    'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_execution_correction SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_execution_correction RENAME TO operations;

CREATE TABLE lifecycle_command_guards_execution_correction (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'StartEntry', 'CompleteEntry', 'RevertEntryStart', 'SetExecutionTimes'
  )),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);
INSERT INTO lifecycle_command_guards_execution_correction SELECT * FROM lifecycle_command_guards;
DROP TABLE lifecycle_command_guards;
ALTER TABLE lifecycle_command_guards_execution_correction RENAME TO lifecycle_command_guards;
