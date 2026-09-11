PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-090 introduces an owner-scoped, Markdown-native Document foundation.
-- No existing Task/Entry/Routine/history row is rewritten and attachments are
-- intentionally outside this first slice.
CREATE TABLE documents (
  document_id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'standalone'),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  markdown_body TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (app_user_id, document_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE INDEX documents_owner_updated_idx
  ON documents(app_user_id, updated_at DESC, document_id DESC);

-- Extend the existing operation allow-list while preserving every operation
-- identity, fingerprint, result, and timestamp from 0028.
CREATE TABLE operations_d090 (
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
    'CreateStandaloneDocument', 'UpdateDocument'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO operations_d090 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d090 RENAME TO operations;
