PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- Compatibility-only extension: preserve every existing operation row.
CREATE TABLE operations_bulk_selection_delete (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry', 'DuplicateEntry', 'BulkDeleteEntries',
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
INSERT INTO operations_bulk_selection_delete SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_bulk_selection_delete RENAME TO operations;

-- Preserve existing suppression rows while adding the Product-approved one-day skip reason.
CREATE TABLE routine_occurrence_suppressions_bulk_selection_delete (
  app_user_id TEXT NOT NULL,
  routine_occurrence_id TEXT NOT NULL,
  suppressed_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('schedule', 'period', 'paused', 'skip')),
  PRIMARY KEY (app_user_id, routine_occurrence_id),
  FOREIGN KEY (app_user_id, routine_occurrence_id)
    REFERENCES routine_occurrences(app_user_id, id) ON DELETE RESTRICT
);
INSERT INTO routine_occurrence_suppressions_bulk_selection_delete
  (app_user_id, routine_occurrence_id, suppressed_at, reason)
SELECT app_user_id, routine_occurrence_id, suppressed_at, reason
  FROM routine_occurrence_suppressions;
DROP TABLE routine_occurrence_suppressions;
ALTER TABLE routine_occurrence_suppressions_bulk_selection_delete RENAME TO routine_occurrence_suppressions;
