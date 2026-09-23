PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-137 extends the shared Document foundation for one owner-scoped Daily
-- Note per established TaskChuteDay. Existing rows and relation identities
-- are copied verbatim; no historical Daily rows are backfilled.
CREATE TABLE documents_d137 (
  document_id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('standalone', 'task_primary', 'project_primary', 'daily_primary')),
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
    OR (kind IN ('task_primary', 'project_primary', 'daily_primary') AND title IS NULL AND archived_at IS NULL)
  ),
  CHECK (kind = 'standalone' OR archived_at IS NULL),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO documents_d137
  (document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at)
SELECT document_id, app_user_id, kind, title, markdown_body, revision, created_at, updated_at, archived_at
  FROM documents;

CREATE TABLE task_primary_documents_d137 (
  app_user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_kind TEXT NOT NULL DEFAULT 'task_primary' CHECK (document_kind = 'task_primary'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, task_id),
  UNIQUE (app_user_id, document_id),
  FOREIGN KEY (app_user_id, task_id) REFERENCES tasks(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, document_id, document_kind)
    REFERENCES documents_d137(app_user_id, document_id, kind) ON DELETE RESTRICT
);

INSERT INTO task_primary_documents_d137
  (app_user_id, task_id, document_id, document_kind, created_at)
SELECT app_user_id, task_id, document_id, document_kind, created_at
  FROM task_primary_documents;

CREATE TABLE project_primary_documents_d137 (
  app_user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_kind TEXT NOT NULL DEFAULT 'project_primary' CHECK (document_kind = 'project_primary'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, project_id),
  UNIQUE (app_user_id, document_id),
  FOREIGN KEY (app_user_id, project_id) REFERENCES projects(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, document_id, document_kind)
    REFERENCES documents_d137(app_user_id, document_id, kind) ON DELETE RESTRICT
);

INSERT INTO project_primary_documents_d137
  (app_user_id, project_id, document_id, document_kind, created_at)
SELECT app_user_id, project_id, document_id, document_kind, created_at
  FROM project_primary_documents;

CREATE TABLE daily_primary_documents (
  app_user_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_kind TEXT NOT NULL DEFAULT 'daily_primary' CHECK (document_kind = 'daily_primary'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, taskchute_day_id),
  UNIQUE (app_user_id, document_id),
  FOREIGN KEY (app_user_id, taskchute_day_id) REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, document_id, document_kind)
    REFERENCES documents_d137(app_user_id, document_id, kind) ON DELETE RESTRICT
);

DROP TABLE project_primary_documents;
DROP TABLE task_primary_documents;
DROP TABLE documents;
ALTER TABLE documents_d137 RENAME TO documents;
ALTER TABLE task_primary_documents_d137 RENAME TO task_primary_documents;
ALTER TABLE project_primary_documents_d137 RENAME TO project_primary_documents;

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

CREATE INDEX documents_project_primary_owner_updated_idx
  ON documents(app_user_id, updated_at DESC, document_id DESC)
  WHERE kind = 'project_primary';

CREATE INDEX documents_daily_primary_owner_updated_idx
  ON documents(app_user_id, updated_at DESC, document_id DESC)
  WHERE kind = 'daily_primary';

CREATE INDEX task_primary_documents_document_idx
  ON task_primary_documents(app_user_id, document_id);

CREATE INDEX project_primary_documents_document_idx
  ON project_primary_documents(app_user_id, document_id);

CREATE INDEX daily_primary_documents_document_idx
  ON daily_primary_documents(app_user_id, document_id);

-- Preserve every existing operation row while adding only the approved Daily
-- ensure/update commands.
CREATE TABLE operations_d137 (
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
    'EnsureDailyPrimaryDocument', 'UpdateDailyPrimaryDocument',
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

INSERT INTO operations_d137 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d137 RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
