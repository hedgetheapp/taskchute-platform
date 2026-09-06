PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-067 compatibility-only extension.  Keep every existing operation row and
-- add the new hard-delete command without changing Domain tables or FK policy.
CREATE TABLE operations_delete_completed_entry (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'RevertEntryStart', 'SetExecutionTimes', 'UpdateTaskMetadata', 'DuplicateEntry', 'BulkDeleteEntries',
    'BulkMoveEntriesToDay', 'BulkMoveEntriesToSection', 'BulkMoveEntriesToSectionOccurrence',
    'BulkMoveEntriesToSectionScoped', 'BulkSetEntriesEstimateScoped',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine',
    'SetRoutineEstimate', 'SetRoutineSectionPlan', 'CreateRoutine', 'SetRoutineEnabled',
    'UpdateRoutine', 'ReorderRoutines', 'DeleteRoutine',
    'UpdateProject', 'SetProjectArchived', 'ReorderProjects', 'DeleteProject',
    'DeleteCompletedEntry'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_delete_completed_entry SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_delete_completed_entry RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
