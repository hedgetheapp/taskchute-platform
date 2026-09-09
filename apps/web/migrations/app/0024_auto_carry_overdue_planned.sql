PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-082 account-canonical setting. Existing users remain OFF by default.
ALTER TABLE user_settings ADD COLUMN auto_carry_overdue_planned INTEGER NOT NULL DEFAULT 0
  CHECK (auto_carry_overdue_planned IN (0, 1));

-- Preserve every existing operation row while adding the setting command and
-- the deterministic current-Day auto-carry checkpoint command.
CREATE TABLE operations_d082 (
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
    'CreateMode', 'UpdateMode', 'ReorderModes', 'SetModeArchived', 'DeleteMode', 'SetEntryMode',
    'SetAutoCarryOverduePlanned', 'AutoCarryOverduePlanned'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_d082 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d082 RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
