PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-064 keeps RoutineDefinition identity and all historical children intact.
-- The archive relation is the authoritative tombstone for Board visibility and
-- future recurrence eligibility.
CREATE TABLE routine_definition_archives (
  app_user_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, routine_definition_id),
  FOREIGN KEY (app_user_id, routine_definition_id)
    REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX routine_definition_archives_lookup
  ON routine_definition_archives(app_user_id, routine_definition_id);

CREATE TABLE routine_command_guards_d064 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'ConvertEntryToRoutine', 'EndRoutine', 'SetRoutineEstimate', 'SetRoutineSectionPlan',
    'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines',
    'BulkSetEntriesEstimateScoped', 'DeleteRoutine'
  )),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO routine_command_guards_d064 SELECT * FROM routine_command_guards;
DROP TABLE routine_command_guards;
ALTER TABLE routine_command_guards_d064 RENAME TO routine_command_guards;

CREATE TABLE operations_d064 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'RevertEntryStart', 'SetExecutionTimes', 'UpdateTaskMetadata', 'DuplicateEntry', 'BulkDeleteEntries',
    'BulkMoveEntriesToDay', 'BulkMoveEntriesToSection', 'BulkMoveEntriesToSectionOccurrence',
    'BulkMoveEntriesToSectionScoped', 'BulkSetEntriesEstimateScoped',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine',
    'SetRoutineEstimate', 'SetRoutineSectionPlan',
    'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines', 'DeleteRoutine'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_d064 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d064 RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
