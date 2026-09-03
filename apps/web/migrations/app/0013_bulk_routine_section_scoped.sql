PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- Compatibility-only extension: preserve every existing operation row and schema.
CREATE TABLE operations_bulk_routine_section_scoped (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry', 'DuplicateEntry', 'BulkDeleteEntries',
    'BulkMoveEntriesToSection', 'BulkMoveEntriesToSectionOccurrence', 'BulkMoveEntriesToSectionScoped',
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
INSERT INTO operations_bulk_routine_section_scoped SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_bulk_routine_section_scoped RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
