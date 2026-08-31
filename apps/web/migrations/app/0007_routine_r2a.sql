PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- Fail before mutating any legacy row when D-045 authority is missing or ambiguous.
CREATE TABLE r2a_migration_assertions (
  id TEXT PRIMARY KEY NOT NULL,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO r2a_migration_assertions (id, ok)
SELECT 'ordinary-entry-authority', CASE WHEN NOT EXISTS (
  SELECT 1
    FROM entries e
    JOIN taskchute_days d
      ON d.app_user_id = e.app_user_id
     AND d.id = e.taskchute_day_id
   WHERE e.lifecycle_state = 'planned'
     AND e.section_id IS NOT NULL
     AND e.planned_start_minute IS NULL
     AND julianday(d.end_instant) > julianday('now')
     AND 1 <> (
       SELECT COUNT(*)
         FROM taskchute_day_section_contexts c
        WHERE c.app_user_id = e.app_user_id
          AND c.taskchute_day_id = e.taskchute_day_id
          AND c.section_id = e.section_id
          AND c.logical_start_minute IS NOT NULL
          AND c.logical_end_minute IS NOT NULL
     )
) THEN 1 ELSE 0 END;

INSERT INTO r2a_migration_assertions (id, ok)
SELECT 'routine-default-authority', CASE WHEN NOT EXISTS (
  SELECT 1
    FROM routine_definitions r
   WHERE r.default_section_id IS NOT NULL
     AND r.default_planned_start_minute IS NULL
     AND 1 <> (
       SELECT COUNT(*)
         FROM routine_occurrences o
         JOIN taskchute_days d
           ON d.app_user_id = o.app_user_id
          AND d.id = o.origin_taskchute_day_id
         JOIN taskchute_day_section_contexts c
           ON c.app_user_id = d.app_user_id
          AND c.taskchute_day_id = d.id
          AND c.section_id = r.default_section_id
        WHERE o.app_user_id = r.app_user_id
          AND o.routine_definition_id = r.id
          AND d.logical_date = r.start_logical_date
          AND c.logical_start_minute IS NOT NULL
          AND c.logical_end_minute IS NOT NULL
     )
) THEN 1 ELSE 0 END;

UPDATE entries
   SET planned_start_minute = (
     SELECT c.logical_start_minute
       FROM taskchute_day_section_contexts c
      WHERE c.app_user_id = entries.app_user_id
        AND c.taskchute_day_id = entries.taskchute_day_id
        AND c.section_id = entries.section_id
        AND c.logical_start_minute IS NOT NULL
        AND c.logical_end_minute IS NOT NULL
   )
 WHERE lifecycle_state = 'planned'
   AND section_id IS NOT NULL
   AND planned_start_minute IS NULL
   AND EXISTS (
     SELECT 1
       FROM taskchute_days d
      WHERE d.app_user_id = entries.app_user_id
        AND d.id = entries.taskchute_day_id
        AND julianday(d.end_instant) > julianday('now')
   );

UPDATE routine_definitions
   SET default_planned_start_minute = (
     SELECT c.logical_start_minute
       FROM routine_occurrences o
       JOIN taskchute_days d
         ON d.app_user_id = o.app_user_id
        AND d.id = o.origin_taskchute_day_id
       JOIN taskchute_day_section_contexts c
         ON c.app_user_id = d.app_user_id
        AND c.taskchute_day_id = d.id
        AND c.section_id = routine_definitions.default_section_id
      WHERE o.app_user_id = routine_definitions.app_user_id
        AND o.routine_definition_id = routine_definitions.id
        AND d.logical_date = routine_definitions.start_logical_date
        AND c.logical_start_minute IS NOT NULL
        AND c.logical_end_minute IS NOT NULL
   )
 WHERE default_section_id IS NOT NULL
   AND default_planned_start_minute IS NULL;

DROP TABLE r2a_migration_assertions;

ALTER TABLE routine_definitions RENAME TO routine_definitions_pre_r2a;

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
  defaults_revision INTEGER NOT NULL DEFAULT 0 CHECK (defaults_revision >= 0),
  created_at TEXT NOT NULL,
  CHECK (end_logical_date IS NULL OR start_logical_date <= end_logical_date),
  CHECK ((default_section_id IS NULL) = (default_planned_start_minute IS NULL)),
  UNIQUE (app_user_id, id),
  UNIQUE (app_user_id, materialization_order),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, task_id) REFERENCES tasks(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, default_section_id) REFERENCES sections(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO routine_definitions
  (id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
   default_section_id, default_estimate_seconds, default_planned_start_minute,
   materialization_order, defaults_revision, created_at)
SELECT id, app_user_id, task_id, recurrence_type, start_logical_date, end_logical_date,
       default_section_id, default_estimate_seconds, default_planned_start_minute,
       materialization_order, 0, created_at
  FROM routine_definitions_pre_r2a;

ALTER TABLE routine_occurrences RENAME TO routine_occurrences_pre_r2a;

CREATE TABLE routine_occurrences (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  origin_taskchute_day_id TEXT NOT NULL,
  section_plan_override_present INTEGER NOT NULL DEFAULT 0
    CHECK (section_plan_override_present IN (0, 1)),
  section_override_id TEXT,
  planned_start_override_minute INTEGER,
  estimate_override_present INTEGER NOT NULL DEFAULT 0
    CHECK (estimate_override_present IN (0, 1)),
  estimate_override_seconds INTEGER,
  created_at TEXT NOT NULL,
  CHECK (
    (section_plan_override_present = 0 AND section_override_id IS NULL AND planned_start_override_minute IS NULL)
    OR
    (section_plan_override_present = 1 AND (
      (section_override_id IS NULL AND planned_start_override_minute IS NULL)
      OR
      (section_override_id IS NOT NULL AND planned_start_override_minute IS NOT NULL
        AND planned_start_override_minute >= 0)
    ))
  ),
  CHECK (
    (estimate_override_present = 0 AND estimate_override_seconds IS NULL)
    OR
    (estimate_override_present = 1 AND (estimate_override_seconds IS NULL OR estimate_override_seconds > 0))
  ),
  UNIQUE (app_user_id, id),
  UNIQUE (app_user_id, routine_definition_id, origin_taskchute_day_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, routine_definition_id)
    REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, origin_taskchute_day_id)
    REFERENCES taskchute_days(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, section_override_id)
    REFERENCES sections(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO routine_occurrences
  (id, app_user_id, routine_definition_id, origin_taskchute_day_id,
   section_plan_override_present, section_override_id, planned_start_override_minute,
   estimate_override_present, estimate_override_seconds, created_at)
SELECT id, app_user_id, routine_definition_id, origin_taskchute_day_id,
       0, NULL, NULL, 0, NULL, created_at
  FROM routine_occurrences_pre_r2a;

ALTER TABLE entries RENAME TO entries_pre_r2a;

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
       estimate_seconds, created_at, planned_start_minute, routine_occurrence_id
  FROM entries_pre_r2a;

ALTER TABLE executions RENAME TO executions_pre_r2a;
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
INSERT INTO executions SELECT * FROM executions_pre_r2a;
DROP TABLE executions_pre_r2a;

ALTER TABLE lifecycle_command_guards RENAME TO lifecycle_command_guards_pre_r2a;
CREATE TABLE lifecycle_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('StartEntry', 'CompleteEntry')),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id, entry_id) REFERENCES entries(app_user_id, id) ON DELETE RESTRICT
);
INSERT INTO lifecycle_command_guards SELECT * FROM lifecycle_command_guards_pre_r2a;
DROP TABLE lifecycle_command_guards_pre_r2a;

DROP TABLE entries_pre_r2a;
DROP TABLE routine_occurrences_pre_r2a;
DROP TABLE routine_definitions_pre_r2a;

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

CREATE TABLE routine_command_guards_r2a (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'ConvertEntryToRoutine', 'EndRoutine', 'SetRoutineEstimate', 'SetRoutineSectionPlan'
  )),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO routine_command_guards_r2a SELECT * FROM routine_command_guards;
DROP TABLE routine_command_guards;
ALTER TABLE routine_command_guards_r2a RENAME TO routine_command_guards;

CREATE TABLE operations_r2a (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine',
    'SetRoutineEstimate', 'SetRoutineSectionPlan'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_r2a SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_r2a RENAME TO operations;
