PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-068 Mode management.  Modes are user-owned reusable classifications.
-- There are deliberately no default rows, archive/delete path, or AUTH changes.
CREATE TABLE mode_definitions (
  id TEXT NOT NULL,
  app_user_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE mode_board_heads (
  app_user_id TEXT PRIMARY KEY NOT NULL,
  board_revision INTEGER NOT NULL DEFAULT 0 CHECK (board_revision >= 0),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO mode_board_heads (app_user_id, board_revision)
SELECT id, 0 FROM app_users;

CREATE TRIGGER mode_board_head_after_app_user_insert
AFTER INSERT ON app_users
BEGIN
  INSERT INTO mode_board_heads (app_user_id, board_revision) VALUES (NEW.id, 0);
END;

CREATE TABLE mode_board_items (
  app_user_id TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  board_position INTEGER NOT NULL CHECK (board_position >= 1),
  settings_revision INTEGER NOT NULL DEFAULT 0 CHECK (settings_revision >= 0),
  PRIMARY KEY (app_user_id, mode_id),
  UNIQUE (app_user_id, board_position),
  FOREIGN KEY (app_user_id, mode_id) REFERENCES mode_definitions(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE entry_modes (
  app_user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  PRIMARY KEY (app_user_id, entry_id),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, mode_id) REFERENCES mode_definitions(app_user_id, id) ON DELETE RESTRICT
);

-- Historical Mode facts intentionally keep the title captured at Start.
-- mode_id has no live-definition FK so historical retention remains valid.
CREATE TABLE entry_mode_snapshots (
  app_user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  mode_title TEXT NOT NULL CHECK (length(trim(mode_title)) BETWEEN 1 AND 200),
  captured_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, entry_id),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX mode_board_items_order_idx ON mode_board_items(app_user_id, board_position, mode_id);
CREATE INDEX entry_modes_mode_idx ON entry_modes(app_user_id, mode_id);
CREATE INDEX entry_mode_snapshots_mode_idx ON entry_mode_snapshots(app_user_id, mode_id);

CREATE TABLE operations_mode_management (
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
    'CreateMode', 'UpdateMode', 'ReorderModes', 'SetEntryMode'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_mode_management SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_mode_management RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
