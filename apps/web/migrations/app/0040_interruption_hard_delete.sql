PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-182 stores only structural ancestry while live continuations still depend on it.
-- A root's original nullable estimate is retained only on that root's tombstone.
CREATE TABLE continuation_lineage_tombstones (
  app_user_id TEXT NOT NULL,
  deleted_entry_id TEXT NOT NULL,
  continuation_chain_id TEXT NOT NULL,
  continuation_parent_entry_id TEXT,
  root_estimate_seconds INTEGER,
  PRIMARY KEY (app_user_id, deleted_entry_id),
  CHECK (
    (deleted_entry_id = continuation_chain_id AND continuation_parent_entry_id IS NULL)
    OR (deleted_entry_id <> continuation_chain_id AND continuation_parent_entry_id IS NOT NULL)
  ),
  CHECK (deleted_entry_id = continuation_chain_id OR root_estimate_seconds IS NULL),
  CHECK (root_estimate_seconds IS NULL OR root_estimate_seconds > 0),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);
CREATE INDEX continuation_lineage_chain_idx
  ON continuation_lineage_tombstones(app_user_id, continuation_chain_id, deleted_entry_id);

-- This precondition exists only inside one DeleteInterruptionEntry batch.
-- The serialized snapshots are removed before commit and are never historical data.
CREATE TABLE interruption_delete_command_guards (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  taskchute_day_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  continuation_chain_id TEXT NOT NULL,
  continuation_parent_entry_id TEXT,
  expected_placement_revision INTEGER NOT NULL CHECK (expected_placement_revision >= 0),
  retains_lineage INTEGER NOT NULL CHECK (retains_lineage IN (0, 1)),
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE TRIGGER continuation_lineage_tombstone_insert_guard
BEFORE INSERT ON continuation_lineage_tombstones
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
    FROM interruption_delete_command_guards g
    JOIN entries e ON e.app_user_id = g.app_user_id AND e.id = g.entry_id
   WHERE g.app_user_id = NEW.app_user_id
     AND g.entry_id = NEW.deleted_entry_id
     AND g.continuation_chain_id = NEW.continuation_chain_id
     AND g.continuation_parent_entry_id IS NEW.continuation_parent_entry_id
     AND g.retains_lineage = 1
     AND e.continuation_chain_id = NEW.continuation_chain_id
     AND e.continuation_parent_entry_id IS NEW.continuation_parent_entry_id
     AND NEW.root_estimate_seconds IS CASE WHEN e.id = e.continuation_chain_id THEN e.estimate_seconds ELSE NULL END
     AND NOT EXISTS (SELECT 1 FROM continuation_lineage_tombstones prior
       WHERE prior.app_user_id = NEW.app_user_id AND prior.deleted_entry_id = NEW.deleted_entry_id)
)
BEGIN
  SELECT RAISE(ABORT, 'continuation_lineage_requires_guarded_delete');
END;

CREATE TRIGGER continuation_lineage_tombstone_immutable
BEFORE UPDATE ON continuation_lineage_tombstones
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'continuation_lineage_tombstone_immutable');
END;

CREATE TRIGGER continuation_lineage_tombstone_retained_while_ancestor
BEFORE DELETE ON continuation_lineage_tombstones
FOR EACH ROW
WHEN EXISTS (
  WITH RECURSIVE ancestors(node_id, parent_id) AS (
    SELECT e.id, e.continuation_parent_entry_id
      FROM entries e
     WHERE e.app_user_id = OLD.app_user_id AND e.continuation_chain_id = OLD.continuation_chain_id
    UNION
    SELECT n.node_id, n.parent_id
      FROM ancestors a
      JOIN (
        SELECT e.id AS node_id, e.continuation_parent_entry_id AS parent_id
          FROM entries e
         WHERE e.app_user_id = OLD.app_user_id AND e.continuation_chain_id = OLD.continuation_chain_id
        UNION ALL
        SELECT l.deleted_entry_id, l.continuation_parent_entry_id
          FROM continuation_lineage_tombstones l
         WHERE l.app_user_id = OLD.app_user_id AND l.continuation_chain_id = OLD.continuation_chain_id
      ) n ON n.node_id = a.parent_id
     WHERE a.parent_id IS NOT NULL
  )
  SELECT 1 FROM ancestors WHERE node_id = OLD.deleted_entry_id
)
BEGIN
  SELECT RAISE(ABORT, 'continuation_lineage_still_required');
END;

CREATE TRIGGER interruption_chain_entry_delete_guard
BEFORE DELETE ON entries
FOR EACH ROW
WHEN (
    OLD.continuation_parent_entry_id IS NOT NULL
    OR OLD.continuation_chain_id IS NOT OLD.id
    OR EXISTS (SELECT 1 FROM entries child
      WHERE child.app_user_id = OLD.app_user_id AND child.continuation_parent_entry_id = OLD.id)
    OR EXISTS (SELECT 1 FROM continuation_lineage_tombstones l
      WHERE l.app_user_id = OLD.app_user_id AND l.continuation_chain_id = OLD.continuation_chain_id)
  )
  AND NOT EXISTS (SELECT 1 FROM interruption_delete_command_guards g
    WHERE g.app_user_id = OLD.app_user_id AND g.entry_id = OLD.id
      AND g.continuation_chain_id = OLD.continuation_chain_id
      AND g.continuation_parent_entry_id IS OLD.continuation_parent_entry_id)
BEGIN
  SELECT RAISE(ABORT, 'interruption_chain_delete_requires_d182_command');
END;

CREATE TRIGGER continuation_lineage_entry_id_not_reused
BEFORE INSERT ON entries
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM continuation_lineage_tombstones l
  WHERE l.app_user_id = NEW.app_user_id AND l.deleted_entry_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'retained_lineage_entry_id_cannot_be_reused');
END;

CREATE TRIGGER continuation_parent_must_be_live_and_resolvable
BEFORE INSERT ON entries
FOR EACH ROW
WHEN NEW.continuation_parent_entry_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entries parent
     WHERE parent.app_user_id = NEW.app_user_id
       AND parent.id = NEW.continuation_parent_entry_id
       AND parent.continuation_chain_id = NEW.continuation_chain_id
       AND (
         EXISTS (SELECT 1 FROM entries root
           WHERE root.app_user_id = NEW.app_user_id AND root.id = NEW.continuation_chain_id
             AND root.continuation_chain_id = NEW.continuation_chain_id
             AND root.continuation_parent_entry_id IS NULL)
         OR EXISTS (SELECT 1 FROM continuation_lineage_tombstones root
           WHERE root.app_user_id = NEW.app_user_id AND root.deleted_entry_id = NEW.continuation_chain_id
             AND root.continuation_chain_id = NEW.continuation_chain_id
             AND root.continuation_parent_entry_id IS NULL)
       )
  )
BEGIN
  SELECT RAISE(ABORT, 'continuation_parent_must_resolve_within_chain');
END;
CREATE TABLE operations_d182 (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CreateProject', 'AddTaskToDay', 'ReorderEntries', 'StartEntry', 'CompleteEntry',
    'InterruptEntry', 'QuickInterruptEntry', 'DeleteInterruptionEntry', 'RevertEntryStart', 'SetExecutionTimes', 'UpdateTaskMetadata', 'DuplicateEntry', 'BulkDeleteEntries',
    'DeleteCompletedEntry', 'BulkMoveEntriesToDay', 'BulkMoveEntriesToSection',
    'BulkMoveEntriesToSectionOccurrence', 'BulkMoveEntriesToSectionScoped', 'BulkSetEntriesEstimateScoped',
    'EstablishInitialSectionConfiguration', 'MoveEntry', 'SetEntryEstimate', 'SetEntryPlannedStart',
    'UpdateSectionConfiguration', 'ConvertEntryToRoutine', 'EndRoutine', 'SetRoutineEstimate',
    'SetRoutineSectionPlan', 'SetRoutineMode', 'SetRoutineTitle', 'CreateRoutine', 'SetRoutineEnabled', 'UpdateRoutine', 'ReorderRoutines',
    'DeleteRoutine', 'UpdateProject', 'SetProjectArchived', 'ReorderProjects', 'DeleteProject',
    'CreateMode', 'UpdateMode', 'ReorderModes', 'SetModeArchived', 'DeleteMode', 'SetEntryMode',
    'SetAutoCarryOverduePlanned', 'AutoCarryOverduePlanned',
    'UpsertEffectiveDayOverride', 'DeleteEffectiveDayOverride',
    'CreateStandaloneDocument', 'UpdateDocument', 'SetStandaloneDocumentArchived', 'DeleteStandaloneDocument',
    'EnsureTaskPrimaryDocument', 'UpdateTaskPrimaryDocument',
    'EnsureProjectPrimaryDocument', 'UpdateProjectPrimaryDocument',
    'EnsureDailyPrimaryDocument', 'UpdateDailyPrimaryDocument',
    'CreateFutureRoutineFromCompletedEntry'
  )),
  request_fingerprint_version INTEGER NOT NULL CHECK (request_fingerprint_version >= 1),
  request_fingerprint TEXT NOT NULL,
  outcome_kind TEXT NOT NULL CHECK (outcome_kind IN ('success', 'domain_rejection', 'revision_conflict')),
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

INSERT INTO operations_d182 SELECT * FROM operations;
DROP TABLE operations;
ALTER TABLE operations_d182 RENAME TO operations;

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- A snapshot mismatch aborts the whole D1 batch before any row mutation.
CREATE TRIGGER interruption_delete_guard_snapshot
BEFORE INSERT ON interruption_delete_command_guards
FOR EACH ROW
WHEN
  (SELECT COUNT(*) FROM entries e WHERE e.app_user_id = NEW.app_user_id AND e.continuation_chain_id = NEW.continuation_chain_id)
    != json_array_length(json_extract(NEW.snapshot_json, '$.entries'))
  OR EXISTS (
    SELECT 1 FROM json_each(json_extract(NEW.snapshot_json, '$.entries')) s
    WHERE NOT EXISTS (SELECT 1 FROM entries e JOIN tasks t ON t.app_user_id = e.app_user_id AND t.id = e.task_id
      WHERE e.app_user_id = NEW.app_user_id AND e.id = json_extract(s.value, '$.id')
        AND e.continuation_chain_id IS json_extract(s.value, '$.continuation_chain_id')
        AND e.continuation_parent_entry_id IS json_extract(s.value, '$.continuation_parent_entry_id')
        AND e.task_id IS json_extract(s.value, '$.task_id')
        AND e.taskchute_day_id IS json_extract(s.value, '$.taskchute_day_id')
        AND e.lifecycle_state IS json_extract(s.value, '$.lifecycle_state')
        AND e.routine_occurrence_id IS json_extract(s.value, '$.routine_occurrence_id')
        AND e.section_id IS json_extract(s.value, '$.section_id')
        AND e.position IS json_extract(s.value, '$.position')
        AND e.planned_start_minute IS json_extract(s.value, '$.planned_start_minute')
        AND e.estimate_seconds IS json_extract(s.value, '$.estimate_seconds')
        AND t.quick_interrupt_origin IS json_extract(s.value, '$.quick_interrupt_origin'))
  )
  OR (SELECT COUNT(*) FROM executions x JOIN entries e ON e.app_user_id = x.app_user_id AND e.id = x.entry_id
      WHERE x.app_user_id = NEW.app_user_id AND e.continuation_chain_id = NEW.continuation_chain_id)
    != json_array_length(json_extract(NEW.snapshot_json, '$.executions'))
  OR EXISTS (
    SELECT 1 FROM json_each(json_extract(NEW.snapshot_json, '$.executions')) s
    WHERE NOT EXISTS (SELECT 1 FROM executions x JOIN entries e ON e.app_user_id = x.app_user_id AND e.id = x.entry_id
      WHERE x.app_user_id = NEW.app_user_id AND e.continuation_chain_id = NEW.continuation_chain_id
        AND x.id IS json_extract(s.value, '$.id') AND x.entry_id IS json_extract(s.value, '$.entry_id')
        AND x.started_at IS json_extract(s.value, '$.started_at') AND x.ended_at IS json_extract(s.value, '$.ended_at')
        AND x.terminal_outcome IS json_extract(s.value, '$.terminal_outcome'))
  )
  OR (SELECT COUNT(*) FROM quick_interrupt_entry_pairs q WHERE q.app_user_id = NEW.app_user_id AND (
      q.target_entry_id IN (SELECT id FROM entries WHERE app_user_id = NEW.app_user_id AND continuation_chain_id = NEW.continuation_chain_id)
      OR q.continuation_entry_id IN (SELECT id FROM entries WHERE app_user_id = NEW.app_user_id AND continuation_chain_id = NEW.continuation_chain_id)))
    != json_array_length(json_extract(NEW.snapshot_json, '$.pairs'))
  OR EXISTS (
    SELECT 1 FROM json_each(json_extract(NEW.snapshot_json, '$.pairs')) s
    WHERE NOT EXISTS (SELECT 1 FROM quick_interrupt_entry_pairs q WHERE q.app_user_id = NEW.app_user_id
      AND q.target_entry_id IS json_extract(s.value, '$.target_entry_id')
      AND q.continuation_entry_id IS json_extract(s.value, '$.continuation_entry_id')
      AND q.created_at IS json_extract(s.value, '$.created_at'))
  )
  OR (SELECT COUNT(*) FROM continuation_lineage_tombstones l WHERE l.app_user_id = NEW.app_user_id
      AND l.continuation_chain_id = NEW.continuation_chain_id)
    != json_array_length(json_extract(NEW.snapshot_json, '$.lineage'))
  OR EXISTS (
    SELECT 1 FROM json_each(json_extract(NEW.snapshot_json, '$.lineage')) s
    WHERE NOT EXISTS (SELECT 1 FROM continuation_lineage_tombstones l WHERE l.app_user_id = NEW.app_user_id
      AND l.deleted_entry_id IS json_extract(s.value, '$.deleted_entry_id')
      AND l.continuation_chain_id IS json_extract(s.value, '$.continuation_chain_id')
      AND l.continuation_parent_entry_id IS json_extract(s.value, '$.continuation_parent_entry_id')
      AND l.root_estimate_seconds IS json_extract(s.value, '$.root_estimate_seconds'))
  )
BEGIN
  SELECT RAISE(ABORT, 'interruption_delete_snapshot_changed');
END;
