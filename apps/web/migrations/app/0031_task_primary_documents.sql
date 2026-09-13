PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-101 extends the shared Document foundation without rewriting standalone
-- Notes or any existing operation/history identity.
CREATE TABLE documents_d101 (
  document_id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('standalone', 'task_primary')),
  title TEXT,
  markdown_body TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (app_user_id, document_id),
  UNIQUE (app_user_id, document_id, kind),
  CHECK (
    (kind = 'standalone' AND title IS NOT NULL AND length(trim(title)) BETWEEN 1 AND 200)
    OR (kind = 'task_primary' AND title IS NULL AND archived_at IS NULL)
  ),
  CHECK (kind = 'standalone' OR archived_at IS NULL),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO documents_d101
  (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at)
SELECT document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at
  FROM documents;

DROP TABLE documents;
ALTER TABLE documents_d101 RENAME TO documents;

CREATE INDEX documents_owner_updated_idx
  ON documents(app_user_id, updated_at DESC, document_id DESC);

CREATE UNIQUE INDEX documents_standalone_owner_title_uq
  ON documents(app_user_id, title)
  WHERE kind = 'standalone';

CREATE INDEX documents_standalone_owner_archive_updated_idx
  ON documents(app_user_id, archived_at, updated_at DESC, document_id DESC)
  WHERE kind = 'standalone';

CREATE INDEX documents_task_primary_owner_updated_idx
  ON documents(app_user_id, updated_at DESC, document_id DESC)
  WHERE kind = 'task_primary';

-- A Task has at most one primary Document and a primary Document belongs to
-- exactly one owner Task. The constant kind column makes the Document-kind
-- constraint enforceable by SQLite's composite foreign key.
CREATE TABLE task_primary_documents (
  app_user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_kind TEXT NOT NULL DEFAULT 'task_primary' CHECK (document_kind = 'task_primary'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, task_id),
  UNIQUE (app_user_id, document_id),
  FOREIGN KEY (app_user_id, task_id) REFERENCES tasks(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, document_id, document_kind)
    REFERENCES documents(app_user_id, document_id, kind) ON DELETE RESTRICT
);

CREATE INDEX task_primary_documents_document_idx
  ON task_primary_documents(app_user_id, document_id);

-- Extend the operation allow-list while preserving every previous row.
CREATE TABLE operations_d101 (
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
    'EnsureTaskPrimaryDocument', 'UpdateTaskPrimaryDocument'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO operations_d101 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d101 RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
