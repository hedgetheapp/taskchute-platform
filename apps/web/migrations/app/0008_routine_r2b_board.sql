PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- R2B changes Task -> RoutineDefinition cardinality to 0..1. Fail before
-- writing any migration state when legacy data violates that authority.
CREATE TABLE r2b_migration_assertions (
  id TEXT PRIMARY KEY NOT NULL,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO r2b_migration_assertions (id, ok)
SELECT 'one-routine-per-task', CASE WHEN NOT EXISTS (
  SELECT app_user_id, task_id
    FROM routine_definitions
   GROUP BY app_user_id, task_id
  HAVING COUNT(*) > 1
) THEN 1 ELSE 0 END;

DROP TABLE r2b_migration_assertions;

CREATE UNIQUE INDEX routine_definitions_task_unique
  ON routine_definitions(app_user_id, task_id);

-- The legacy recurrence_type remains a compatibility marker for R1/R2A.
-- R2B's typed schedule is the recurrence authority.
CREATE TABLE routine_schedules (
  app_user_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('daily', 'every_n_days', 'weekly')),
  interval_days INTEGER CHECK (
    (schedule_kind = 'every_n_days' AND interval_days BETWEEN 2 AND 365)
    OR (schedule_kind <> 'every_n_days' AND interval_days IS NULL)
  ),
  weekdays_mask INTEGER CHECK (
    (schedule_kind = 'weekly' AND weekdays_mask BETWEEN 1 AND 127)
    OR (schedule_kind <> 'weekly' AND weekdays_mask IS NULL)
  ),
  PRIMARY KEY (app_user_id, routine_definition_id),
  FOREIGN KEY (app_user_id, routine_definition_id)
    REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO routine_schedules
  (app_user_id, routine_definition_id, schedule_kind, interval_days, weekdays_mask)
SELECT app_user_id, id, 'daily', NULL, NULL FROM routine_definitions;

CREATE TABLE routine_board_heads (
  app_user_id TEXT PRIMARY KEY NOT NULL,
  board_revision INTEGER NOT NULL DEFAULT 0 CHECK (board_revision >= 0),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO routine_board_heads (app_user_id, board_revision)
SELECT id, 0 FROM app_users;

CREATE TRIGGER routine_board_head_after_app_user_insert
AFTER INSERT ON app_users
BEGIN
  INSERT INTO routine_board_heads (app_user_id, board_revision) VALUES (NEW.id, 0);
END;

CREATE TABLE routine_board_items (
  app_user_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  board_position INTEGER NOT NULL CHECK (board_position >= 1),
  settings_revision INTEGER NOT NULL DEFAULT 0 CHECK (settings_revision >= 0),
  PRIMARY KEY (app_user_id, routine_definition_id),
  UNIQUE (app_user_id, board_position),
  FOREIGN KEY (app_user_id, routine_definition_id)
    REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO routine_board_items
  (app_user_id, routine_definition_id, board_position, settings_revision)
SELECT app_user_id, id,
       ROW_NUMBER() OVER (PARTITION BY app_user_id ORDER BY materialization_order, id),
       defaults_revision
  FROM routine_definitions;

CREATE TABLE routine_pause_intervals (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  paused_logical_date TEXT NOT NULL,
  resumed_logical_date TEXT,
  created_at TEXT NOT NULL,
  CHECK (resumed_logical_date IS NULL OR paused_logical_date <= resumed_logical_date),
  UNIQUE (app_user_id, id),
  FOREIGN KEY (app_user_id, routine_definition_id)
    REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX routine_pause_intervals_open_unique
  ON routine_pause_intervals(app_user_id, routine_definition_id)
  WHERE resumed_logical_date IS NULL;
CREATE INDEX routine_pause_intervals_eligibility_idx
  ON routine_pause_intervals(app_user_id, routine_definition_id, paused_logical_date, resumed_logical_date);

-- A materialized planned occurrence can be hidden by a later schedule/period
-- edit without deleting its identity or history.
CREATE TABLE routine_occurrence_suppressions (
  app_user_id TEXT NOT NULL,
  routine_occurrence_id TEXT NOT NULL,
  suppressed_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('schedule', 'period', 'paused')),
  PRIMARY KEY (app_user_id, routine_occurrence_id),
  FOREIGN KEY (app_user_id, routine_occurrence_id)
    REFERENCES routine_occurrences(app_user_id, id) ON DELETE RESTRICT
);

-- R2B is the first Task title/project mutation surface. Every pre-R2B
-- occurrence can therefore be reconstructed exactly from its current Task.
CREATE TABLE routine_occurrence_task_snapshots (
  app_user_id TEXT NOT NULL,
  routine_occurrence_id TEXT NOT NULL,
  task_title TEXT NOT NULL CHECK (length(trim(task_title)) BETWEEN 1 AND 300),
  project_id TEXT,
  project_title TEXT CHECK (project_title IS NULL OR length(trim(project_title)) BETWEEN 1 AND 200),
  PRIMARY KEY (app_user_id, routine_occurrence_id),
  CHECK ((project_id IS NULL) = (project_title IS NULL)),
  FOREIGN KEY (app_user_id, routine_occurrence_id)
    REFERENCES routine_occurrences(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, project_id)
    REFERENCES projects(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO routine_occurrence_task_snapshots
  (app_user_id, routine_occurrence_id, task_title, project_id, project_title)
SELECT o.app_user_id, o.id, t.title, p.id, p.title
  FROM routine_occurrences o
  JOIN routine_definitions r ON r.app_user_id = o.app_user_id AND r.id = o.routine_definition_id
  JOIN tasks t ON t.app_user_id = r.app_user_id AND t.id = r.task_id
  LEFT JOIN projects p ON p.app_user_id = t.app_user_id AND p.id = t.project_id;

CREATE TABLE routine_command_guards_r2b (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'ConvertEntryToRoutine', 'EndRoutine', 'SetRoutineEstimate', 'SetRoutineSectionPlan',
    'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines'
  )),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO routine_command_guards_r2b SELECT * FROM routine_command_guards;
DROP TABLE routine_command_guards;
ALTER TABLE routine_command_guards_r2b RENAME TO routine_command_guards;

CREATE TABLE operations_r2b (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine',
    'SetRoutineEstimate', 'SetRoutineSectionPlan',
    'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_r2b SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_r2b RENAME TO operations;
