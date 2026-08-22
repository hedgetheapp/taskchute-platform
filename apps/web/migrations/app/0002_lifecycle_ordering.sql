PRAGMA foreign_keys = ON;

CREATE TABLE operations_v2 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry')),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO operations_v2 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_v2 RENAME TO operations;

CREATE TABLE executions (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (ended_at IS NULL OR started_at <= ended_at),
  UNIQUE (app_user_id, id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX one_active_execution_per_user
  ON executions(app_user_id) WHERE ended_at IS NULL;
CREATE INDEX executions_entry_idx ON executions(app_user_id, entry_id, started_at);

CREATE TABLE lifecycle_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('StartEntry', 'CompleteEntry')),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);
