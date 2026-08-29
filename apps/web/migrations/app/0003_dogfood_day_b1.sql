PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

CREATE TABLE section_configuration_versions (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  day_boundary_minutes INTEGER NOT NULL CHECK (day_boundary_minutes BETWEEN 0 AND 1439),
  created_at TEXT NOT NULL,
  UNIQUE (app_user_id, id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE section_configuration_items (
  app_user_id TEXT NOT NULL,
  configuration_version_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  logical_start_minute INTEGER NOT NULL,
  logical_end_minute INTEGER NOT NULL,
  configuration_order INTEGER NOT NULL CHECK (configuration_order >= 0),
  CHECK (logical_start_minute < logical_end_minute),
  PRIMARY KEY (app_user_id, configuration_version_id, section_id),
  UNIQUE (app_user_id, configuration_version_id, configuration_order),
  UNIQUE (app_user_id, configuration_version_id, logical_start_minute),
  FOREIGN KEY (app_user_id, configuration_version_id)
    REFERENCES section_configuration_versions(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, section_id) REFERENCES sections(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE section_configuration_heads (
  app_user_id TEXT PRIMARY KEY NOT NULL,
  configuration_version_id TEXT NOT NULL,
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, configuration_version_id)
    REFERENCES section_configuration_versions(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE taskchute_day_section_contexts (
  app_user_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  configuration_version_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  logical_start_minute INTEGER,
  logical_end_minute INTEGER,
  actual_start_instant TEXT,
  actual_end_instant TEXT,
  context_order INTEGER NOT NULL CHECK (context_order >= 0),
  CHECK ((logical_start_minute IS NULL) = (logical_end_minute IS NULL)),
  CHECK ((actual_start_instant IS NULL) = (actual_end_instant IS NULL)),
  CHECK (logical_start_minute IS NULL OR logical_start_minute < logical_end_minute),
  CHECK (actual_start_instant IS NULL OR actual_start_instant < actual_end_instant),
  PRIMARY KEY (app_user_id, taskchute_day_id, section_id),
  UNIQUE (app_user_id, taskchute_day_id, context_order),
  FOREIGN KEY (app_user_id, taskchute_day_id) REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, section_id) REFERENCES sections(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, configuration_version_id)
    REFERENCES section_configuration_versions(app_user_id, id) ON DELETE RESTRICT
);

-- Legacy rows have identity/name/order authority, but no authoritative time range.
INSERT INTO taskchute_day_section_contexts
  (app_user_id, taskchute_day_id, section_id, configuration_version_id, title,
   logical_start_minute, logical_end_minute, actual_start_instant, actual_end_instant, context_order)
SELECT d.app_user_id, d.id, s.id, NULL, s.title, NULL, NULL, NULL, NULL, s.sort_order
  FROM taskchute_days d
  JOIN sections s ON s.app_user_id = d.app_user_id;

ALTER TABLE entries RENAME TO entries_v01a;

CREATE TABLE entries (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  section_id TEXT,
  position INTEGER NOT NULL CHECK (position >= 1),
  lifecycle_state TEXT NOT NULL DEFAULT 'planned' CHECK (lifecycle_state IN ('planned', 'running', 'completed')),
  estimate_seconds INTEGER CHECK (estimate_seconds IS NULL OR estimate_seconds > 0),
  created_at TEXT NOT NULL,
  UNIQUE (app_user_id, id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, task_id) REFERENCES tasks(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, taskchute_day_id) REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, section_id) REFERENCES sections(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO entries
  (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, estimate_seconds, created_at)
SELECT id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, NULL, created_at
  FROM entries_v01a;

ALTER TABLE executions RENAME TO executions_v01a;
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
INSERT INTO executions SELECT * FROM executions_v01a;
DROP TABLE executions_v01a;

ALTER TABLE lifecycle_command_guards RENAME TO lifecycle_command_guards_v01a;
CREATE TABLE lifecycle_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('StartEntry', 'CompleteEntry')),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);
INSERT INTO lifecycle_command_guards SELECT * FROM lifecycle_command_guards_v01a;
DROP TABLE lifecycle_command_guards_v01a;
DROP TABLE entries_v01a;

CREATE UNIQUE INDEX entries_section_position_unique
  ON entries(app_user_id, taskchute_day_id, section_id, position) WHERE section_id IS NOT NULL;
CREATE UNIQUE INDEX entries_unsectioned_position_unique
  ON entries(app_user_id, taskchute_day_id, position) WHERE section_id IS NULL;
CREATE INDEX entries_board_idx ON entries(app_user_id, taskchute_day_id, section_id, position);
CREATE UNIQUE INDEX one_active_execution_per_user
  ON executions(app_user_id) WHERE ended_at IS NULL;
CREATE INDEX executions_entry_idx ON executions(app_user_id, entry_id, started_at);

CREATE TABLE operations_b1 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_b1 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_b1 RENAME TO operations;

CREATE INDEX section_configuration_current_idx
  ON section_configuration_versions(app_user_id, created_at, id);
CREATE INDEX day_section_context_interval_idx
  ON taskchute_day_section_contexts(app_user_id, taskchute_day_id, actual_start_instant, actual_end_instant);
