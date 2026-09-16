PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-116B stores only the one-to-one source conversion correlation. This is
-- not a RoutineOccurrence relation and existing completed Entries are not backfilled.
CREATE TABLE completed_entry_future_routines (
  app_user_id TEXT NOT NULL,
  source_entry_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, source_entry_id),
  UNIQUE (app_user_id, routine_definition_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, source_entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, routine_definition_id) REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT
);

-- Preserve all prior operations verbatim and add exactly the approved command.
CREATE TABLE operations_d116b (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'InterruptEntry', 'RevertEntryStart', 'SetExecutionTimes', 'UpdateTaskMetadata', 'DuplicateEntry', 'BulkDeleteEntries',
    'DeleteCompletedEntry', 'BulkMoveEntriesToDay', 'BulkMoveEntriesToSection',
    'BulkMoveEntriesToSectionOccurrence', 'BulkMoveEntriesToSectionScoped', 'BulkSetEntriesEstimateScoped',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine', 'SetRoutineEstimate',
    'SetRoutineSectionPlan', 'SetRoutineMode', 'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines',
    'DeleteRoutine', 'UpdateProject', 'SetProjectArchived', 'ReorderProjects', 'DeleteProject',
    'CreateMode', 'UpdateMode', 'ReorderModes', 'SetModeArchived', 'DeleteMode', 'SetEntryMode',
    'SetAutoCarryOverduePlanned', 'AutoCarryOverduePlanned',
    'UpsertEffectiveDayOverride', 'DeleteEffectiveDayOverride',
    'CreateStandaloneDocument', 'UpdateDocument', 'SetStandaloneDocumentArchived', 'DeleteStandaloneDocument',
    'EnsureTaskPrimaryDocument', 'UpdateTaskPrimaryDocument',
    'EnsureProjectPrimaryDocument', 'UpdateProjectPrimaryDocument',
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

INSERT INTO operations_d116b SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d116b RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
