PRAGMA foreign_keys = ON;

CREATE TABLE app_users (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE auth_subject_mappings (
  auth_provider TEXT NOT NULL,
  auth_subject_id TEXT NOT NULL,
  app_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (auth_provider, auth_subject_id),
  UNIQUE (auth_provider, app_user_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE user_settings (
  app_user_id TEXT PRIMARY KEY NOT NULL,
  timezone TEXT NOT NULL,
  day_boundary_minutes INTEGER NOT NULL CHECK (day_boundary_minutes BETWEEN 0 AND 1439),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  UNIQUE (app_user_id, id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE sections (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  UNIQUE (app_user_id, id),
  UNIQUE (app_user_id, sort_order),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE taskchute_days (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  logical_date TEXT NOT NULL,
  start_instant TEXT NOT NULL,
  end_instant TEXT NOT NULL,
  establishment_timezone TEXT NOT NULL,
  establishment_boundary_minutes INTEGER NOT NULL CHECK (establishment_boundary_minutes BETWEEN 0 AND 1439),
  establishment_disambiguation TEXT NOT NULL CHECK (establishment_disambiguation = 'compatible'),
  placement_revision INTEGER NOT NULL DEFAULT 0 CHECK (placement_revision >= 0),
  created_at TEXT NOT NULL,
  CHECK (start_instant < end_instant),
  UNIQUE (app_user_id, id),
  UNIQUE (app_user_id, logical_date),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  created_at TEXT NOT NULL,
  UNIQUE (app_user_id, id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, project_id) REFERENCES projects(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE entries (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 1),
  lifecycle_state TEXT NOT NULL DEFAULT 'planned' CHECK (lifecycle_state IN ('planned', 'running', 'completed')),
  created_at TEXT NOT NULL,
  UNIQUE (app_user_id, id),
  UNIQUE (app_user_id, taskchute_day_id, section_id, position),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, task_id) REFERENCES tasks(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, taskchute_day_id) REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, section_id) REFERENCES sections(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE operations (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('CreateProject', 'AddTaskToDay')),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

-- These rows exist only inside one AddTaskToDay batch. They turn a failed
-- revision acquisition or postcondition into a constraint error and rollback.
CREATE TABLE transaction_assertions (
  app_user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ok INTEGER NOT NULL CHECK (ok = 1),
  PRIMARY KEY (app_user_id, id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE placement_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id, taskchute_day_id) REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX taskchute_days_interval_idx ON taskchute_days(app_user_id, start_instant, end_instant);
CREATE INDEX entries_board_idx ON entries(app_user_id, taskchute_day_id, section_id, position);
CREATE INDEX tasks_project_idx ON tasks(app_user_id, project_id);
CREATE INDEX auth_subject_mappings_app_user_idx ON auth_subject_mappings(app_user_id);
