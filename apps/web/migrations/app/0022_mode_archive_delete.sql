PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-072 adds reversible owner-scoped archive state and atomic Mode delete guards.
-- Existing Modes remain active; no rows are backfilled and AUTH is unchanged.
CREATE TABLE mode_archives (
  app_user_id TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, mode_id),
  FOREIGN KEY (app_user_id, mode_id) REFERENCES mode_definitions(app_user_id, id) ON DELETE RESTRICT
);

-- mode_id is intentionally not an FK because DeleteMode removes the live Mode
-- in the same batch before its short-lived guard is cleaned up.
CREATE TABLE mode_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('SetModeArchived', 'DeleteMode')),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE operations_mode_archive_delete (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'RevertEntryStart', 'SetExecutionTimes', 'UpdateTaskMetadata', 'DuplicateEntry', 'BulkDeleteEntries',
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
INSERT INTO operations_mode_archive_delete SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_mode_archive_delete RENAME TO operations;

CREATE INDEX mode_archives_lookup ON mode_archives(app_user_id, mode_id);

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
