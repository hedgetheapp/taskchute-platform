PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- Compatibility-only extension: the Day move command reuses the existing
-- placement guard and does not add a Domain table or column.
CREATE TABLE operations_day_move (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry', 'DuplicateEntry', 'BulkDeleteEntries',
    'BulkMoveEntriesToDay',
    'BulkMoveEntriesToSection', 'BulkMoveEntriesToSectionOccurrence', 'BulkMoveEntriesToSectionScoped',
    'BulkSetEntriesEstimateScoped',
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
INSERT INTO operations_day_move SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_day_move RENAME TO operations;
