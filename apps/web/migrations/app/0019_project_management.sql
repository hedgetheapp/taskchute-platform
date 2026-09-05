PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-065 Project management.  Project order, archive state, and per-project
-- settings revisions are server-owned.  Existing Project identity and data
-- are preserved; this migration does not implicitly archive or delete rows.
CREATE TABLE project_board_heads (
  app_user_id TEXT PRIMARY KEY NOT NULL,
  board_revision INTEGER NOT NULL DEFAULT 0 CHECK (board_revision >= 0),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO project_board_heads (app_user_id, board_revision)
SELECT id, 0 FROM app_users;

CREATE TRIGGER project_board_head_after_app_user_insert
AFTER INSERT ON app_users
BEGIN
  INSERT INTO project_board_heads (app_user_id, board_revision) VALUES (NEW.id, 0);
END;

CREATE TABLE project_board_items (
  app_user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  board_position INTEGER NOT NULL CHECK (board_position >= 1),
  settings_revision INTEGER NOT NULL DEFAULT 0 CHECK (settings_revision >= 0),
  PRIMARY KEY (app_user_id, project_id),
  UNIQUE (app_user_id, board_position),
  FOREIGN KEY (app_user_id, project_id) REFERENCES projects(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO project_board_items (app_user_id, project_id, board_position, settings_revision)
SELECT app_user_id, id,
       ROW_NUMBER() OVER (PARTITION BY app_user_id ORDER BY created_at ASC, id ASC), 0
  FROM projects;

CREATE TABLE project_archives (
  app_user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, project_id),
  FOREIGN KEY (app_user_id, project_id) REFERENCES projects(app_user_id, id) ON DELETE RESTRICT
);

-- Guards are short-lived transaction assertions for Project commands.  The
-- project_id is intentionally not an FK: DeleteProject removes the live row
-- in the same atomic batch before the guard is cleaned up.
CREATE TABLE project_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'UpdateProject', 'SetProjectArchived', 'ReorderProjects', 'DeleteProject'
  )),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

-- A routine occurrence snapshot is a historical fact.  Its former Project
-- identity must outlive the live Project row, so retain the internal pair
-- check and occurrence FK but deliberately remove the live Project FK.
ALTER TABLE routine_occurrence_task_snapshots RENAME TO routine_occurrence_task_snapshots_pre_0019;
CREATE TABLE routine_occurrence_task_snapshots (
  app_user_id TEXT NOT NULL,
  routine_occurrence_id TEXT NOT NULL,
  task_title TEXT NOT NULL CHECK (length(trim(task_title)) BETWEEN 1 AND 300),
  project_id TEXT,
  project_title TEXT CHECK (project_title IS NULL OR length(trim(project_title)) BETWEEN 1 AND 200),
  PRIMARY KEY (app_user_id, routine_occurrence_id),
  CHECK ((project_id IS NULL) = (project_title IS NULL)),
  FOREIGN KEY (app_user_id, routine_occurrence_id)
    REFERENCES routine_occurrences(app_user_id, id) ON DELETE RESTRICT
);
INSERT INTO routine_occurrence_task_snapshots
  (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
SELECT app_user_id, routine_occurrence_id, task_title, project_id, project_title
  FROM routine_occurrence_task_snapshots_pre_0019;
DROP TABLE routine_occurrence_task_snapshots_pre_0019;

-- Bounded compatibility for ordinary executed Entries.  It is populated only
-- for Entries that already have an Execution and is written on first Start;
-- it is not a general historical Review model.
CREATE TABLE entry_project_snapshots (
  app_user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  project_id TEXT,
  project_title TEXT CHECK (project_title IS NULL OR length(trim(project_title)) BETWEEN 1 AND 200),
  captured_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, entry_id),
  CHECK ((project_id IS NULL) = (project_title IS NULL)),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);
INSERT INTO entry_project_snapshots (app_user_id, entry_id, project_id, project_title, captured_at)
SELECT e.app_user_id, e.id, t.project_id, p.title, MIN(x.started_at)
  FROM entries e
  JOIN executions x ON x.app_user_id = e.app_user_id AND x.entry_id = e.id
  JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
  LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id
 GROUP BY e.app_user_id, e.id, t.project_id, p.title;

CREATE INDEX entry_project_snapshots_project_idx
  ON entry_project_snapshots(app_user_id, project_id);

-- Preserve every existing operation row while extending only the allow-list.
CREATE TABLE operations_project_management (
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
    'UpdateProject', 'SetProjectArchived', 'ReorderProjects', 'DeleteProject'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_project_management SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_project_management RENAME TO operations;

CREATE INDEX project_board_items_order_idx
  ON project_board_items(app_user_id, board_position, project_id);
CREATE INDEX project_archives_lookup
  ON project_archives(app_user_id, project_id);

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
