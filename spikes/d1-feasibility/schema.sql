PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS taskchute_days (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  placement_revision INTEGER NOT NULL DEFAULT 0 CHECK (placement_revision >= 0),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (taskchute_day_id) REFERENCES taskchute_days(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('planned', 'running', 'completed')),
  position INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (taskchute_day_id) REFERENCES taskchute_days(id) ON DELETE RESTRICT,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT,
  UNIQUE (section_id, position)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_running_entry_per_user
  ON entries(user_id) WHERE lifecycle = 'running';

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  start_operation_id TEXT NOT NULL,
  complete_operation_id TEXT,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE RESTRICT,
  CHECK ((ended_at IS NULL AND complete_operation_id IS NULL)
      OR (ended_at IS NOT NULL AND complete_operation_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_execution_per_user
  ON executions(user_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS operations (
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'rejected')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, operation_id),
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

-- Rows in these two tables exist only inside a D1 batch. A failed assertion
-- intentionally raises a CHECK violation, proving that the entire batch rolls back.
CREATE TABLE IF NOT EXISTS transaction_assertions (
  id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

CREATE TABLE IF NOT EXISTS reorder_guards (
  operation_id TEXT PRIMARY KEY,
  taskchute_day_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  FOREIGN KEY (taskchute_day_id) REFERENCES taskchute_days(id) ON DELETE RESTRICT
);
