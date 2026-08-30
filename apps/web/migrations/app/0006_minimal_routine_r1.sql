PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

CREATE TABLE routine_definitions (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  recurrence_type TEXT NOT NULL CHECK (recurrence_type = 'daily'),
  start_logical_date TEXT NOT NULL,
  end_logical_date TEXT,
  default_section_id TEXT,
  default_estimate_seconds INTEGER CHECK (default_estimate_seconds IS NULL OR default_estimate_seconds > 0),
  default_planned_start_minute INTEGER CHECK (default_planned_start_minute IS NULL OR default_planned_start_minute >= 0),
  materialization_order INTEGER NOT NULL CHECK (materialization_order >= 1),
  created_at TEXT NOT NULL,
  CHECK (end_logical_date IS NULL OR start_logical_date <= end_logical_date),
  UNIQUE (app_user_id, id),
  UNIQUE (app_user_id, materialization_order),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, task_id) REFERENCES tasks(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, default_section_id) REFERENCES sections(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE routine_occurrences (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  origin_taskchute_day_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (app_user_id, id),
  UNIQUE (app_user_id, routine_definition_id, origin_taskchute_day_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, routine_definition_id)
    REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, origin_taskchute_day_id)
    REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT
);

ALTER TABLE entries RENAME TO entries_pre_r1;

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
  planned_start_minute INTEGER CHECK (planned_start_minute IS NULL OR (planned_start_minute >= 0 AND section_id IS NOT NULL)),
  routine_occurrence_id TEXT,
  UNIQUE (app_user_id, id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, task_id) REFERENCES tasks(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, taskchute_day_id) REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, section_id) REFERENCES sections(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, routine_occurrence_id)
    REFERENCES routine_occurrences(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO entries
  (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
   estimate_seconds, created_at, planned_start_minute, routine_occurrence_id)
SELECT id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state,
       estimate_seconds, created_at, planned_start_minute, NULL
  FROM entries_pre_r1;

ALTER TABLE executions RENAME TO executions_pre_r1;
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
INSERT INTO executions SELECT * FROM executions_pre_r1;
DROP TABLE executions_pre_r1;

ALTER TABLE lifecycle_command_guards RENAME TO lifecycle_command_guards_pre_r1;
CREATE TABLE lifecycle_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('StartEntry', 'CompleteEntry')),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);
INSERT INTO lifecycle_command_guards SELECT * FROM lifecycle_command_guards_pre_r1;
DROP TABLE lifecycle_command_guards_pre_r1;
DROP TABLE entries_pre_r1;

CREATE UNIQUE INDEX entries_section_position_unique
  ON entries(app_user_id, taskchute_day_id, section_id, position) WHERE section_id IS NOT NULL;
CREATE UNIQUE INDEX entries_unsectioned_position_unique
  ON entries(app_user_id, taskchute_day_id, position) WHERE section_id IS NULL;
CREATE INDEX entries_board_idx ON entries(app_user_id, taskchute_day_id, section_id, position);
CREATE INDEX entries_planned_start_idx
  ON entries(app_user_id, taskchute_day_id, section_id, planned_start_minute, position);
CREATE INDEX entries_routine_occurrence_idx ON entries(app_user_id, routine_occurrence_id);
CREATE UNIQUE INDEX one_active_execution_per_user
  ON executions(app_user_id) WHERE ended_at IS NULL;
CREATE INDEX executions_entry_idx ON executions(app_user_id, entry_id, started_at);
CREATE INDEX routine_definitions_schedule_idx
  ON routine_definitions(app_user_id, start_logical_date, end_logical_date, materialization_order);
CREATE INDEX routine_occurrences_origin_idx
  ON routine_occurrences(app_user_id, origin_taskchute_day_id, routine_definition_id);

CREATE TABLE routine_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('ConvertEntryToRoutine', 'EndRoutine')),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE routine_materialization_guards (
  app_user_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  guard_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  PRIMARY KEY (app_user_id, taskchute_day_id),
  UNIQUE (app_user_id, guard_id),
  FOREIGN KEY (app_user_id, taskchute_day_id)
    REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE operations_r1 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO operations_r1 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_r1 RENAME TO operations;
