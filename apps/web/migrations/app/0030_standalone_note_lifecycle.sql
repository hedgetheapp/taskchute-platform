PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-091/D-092 persist standalone Note lifecycle without rewriting the
-- existing Document identity, Markdown source, or revision history.
ALTER TABLE documents ADD COLUMN archived_at TEXT;

-- Archived Notes continue to reserve their exact trimmed title.  The partial
-- predicate keeps this foundation extensible if another Document kind is
-- added later without broadening standalone semantics.
CREATE UNIQUE INDEX documents_standalone_owner_title_uq
  ON documents(app_user_id, title)
  WHERE kind = 'standalone';

CREATE INDEX documents_standalone_owner_archive_updated_idx
  ON documents(app_user_id, archived_at, updated_at DESC, document_id DESC)
  WHERE kind = 'standalone';

-- Extend the existing operation allow-list while preserving every prior row.
CREATE TABLE operations_d093 (
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
    'CreateStandaloneDocument', 'UpdateDocument', 'SetStandaloneDocumentArchived', 'DeleteStandaloneDocument'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO operations_d093 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d093 RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
