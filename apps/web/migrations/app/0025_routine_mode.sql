PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-085 keeps the effective live Entry Mode in entry_modes while adding the
-- distinct Routine default and occurrence-override state.  A missing default
-- row means Modeなし; an override row with a NULL mode_id means explicit
-- Modeなし for that occurrence.
CREATE TABLE d085_migration_assertions (
  id TEXT PRIMARY KEY NOT NULL,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

-- An occurrence must map to one planned Entry before a pre-D-085 live Mode
-- can be promoted to an explicit occurrence override.  Do not guess if old
-- data violates that one-occurrence/one-entry authority.
INSERT INTO d085_migration_assertions (id, ok)
SELECT 'planned-routine-mode-unique-entry', CASE WHEN NOT EXISTS (
  SELECT e.routine_occurrence_id
    FROM entries e
    JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
   WHERE e.lifecycle_state = 'planned' AND e.routine_occurrence_id IS NOT NULL
   GROUP BY e.app_user_id, e.routine_occurrence_id
  HAVING COUNT(*) > 1
) THEN 1 ELSE 0 END;

CREATE TABLE routine_definition_modes (
  app_user_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  mode_id TEXT NOT NULL,
  PRIMARY KEY (app_user_id, routine_definition_id),
  FOREIGN KEY (app_user_id, routine_definition_id)
    REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, mode_id)
    REFERENCES mode_definitions(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE routine_occurrence_mode_overrides (
  app_user_id TEXT NOT NULL,
  routine_occurrence_id TEXT NOT NULL,
  mode_id TEXT,
  PRIMARY KEY (app_user_id, routine_occurrence_id),
  FOREIGN KEY (app_user_id, routine_occurrence_id)
    REFERENCES routine_occurrences(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, mode_id)
    REFERENCES mode_definitions(app_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX routine_definition_modes_mode_idx
  ON routine_definition_modes(app_user_id, mode_id, routine_definition_id);
CREATE INDEX routine_occurrence_mode_overrides_mode_idx
  ON routine_occurrence_mode_overrides(app_user_id, mode_id, routine_occurrence_id);

-- Preserve the visible pre-D-085 Mode of an existing planned Routine Entry as
-- an occurrence override.  Never infer a recurring Routine default.
INSERT INTO routine_occurrence_mode_overrides (app_user_id, routine_occurrence_id, mode_id)
SELECT e.app_user_id, e.routine_occurrence_id, em.mode_id
  FROM entries e
  JOIN entry_modes em ON em.app_user_id = e.app_user_id AND em.entry_id = e.id
 WHERE e.lifecycle_state = 'planned' AND e.routine_occurrence_id IS NOT NULL;

DROP TABLE d085_migration_assertions;

CREATE TABLE routine_command_guards_d085 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'ConvertEntryToRoutine', 'EndRoutine', 'SetRoutineEstimate', 'SetRoutineSectionPlan',
    'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines',
    'BulkSetEntriesEstimateScoped', 'DeleteRoutine', 'SetRoutineMode'
  )),
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO routine_command_guards_d085 SELECT * FROM routine_command_guards;
DROP TABLE routine_command_guards;
ALTER TABLE routine_command_guards_d085 RENAME TO routine_command_guards;

CREATE TABLE operations_d085 (
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
    'SetAutoCarryOverduePlanned', 'AutoCarryOverduePlanned'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
INSERT INTO operations_d085 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d085 RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;
