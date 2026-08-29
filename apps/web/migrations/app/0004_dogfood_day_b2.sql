PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

ALTER TABLE entries ADD COLUMN planned_start_minute INTEGER
  CHECK (planned_start_minute IS NULL OR (planned_start_minute >= 0 AND section_id IS NOT NULL));

CREATE TABLE operations_b2 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO operations_b2 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_b2 RENAME TO operations;

CREATE INDEX entries_planned_start_idx
  ON entries(app_user_id, taskchute_day_id, section_id, planned_start_minute, position);
