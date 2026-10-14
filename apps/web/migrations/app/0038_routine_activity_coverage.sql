PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-178 is forward-only. Existing Definitions and archives remain NULL and are
-- never assigned an inferred event date.
ALTER TABLE routine_definitions ADD COLUMN created_logical_date TEXT CHECK (
  created_logical_date IS NULL OR (
    length(created_logical_date) = 10
    AND created_logical_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(created_logical_date) = created_logical_date
  )
);
ALTER TABLE routine_definition_archives ADD COLUMN deleted_logical_date TEXT CHECK (
  deleted_logical_date IS NULL OR (
    length(deleted_logical_date) = 10
    AND deleted_logical_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(deleted_logical_date) = deleted_logical_date
  )
);

-- No marker row means UNMEASURED. Keeping this outside user_settings prevents
-- settings replacement/provisioning writes from silently clearing activation.
CREATE TABLE routine_activity_coverage (
  app_user_id TEXT PRIMARY KEY NOT NULL,
  started_at TEXT NOT NULL CHECK (
    length(started_at) = 24
    AND started_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at) IS NOT NULL
    AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at) = started_at
  ),
  started_logical_date TEXT NOT NULL CHECK (
    length(started_logical_date) = 10
    AND started_logical_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(started_logical_date) = started_logical_date
  ),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE INDEX routine_definitions_activity_date
  ON routine_definitions(app_user_id, created_logical_date, created_at)
  WHERE created_logical_date IS NOT NULL;
CREATE INDEX routine_definition_archives_activity_date
  ON routine_definition_archives(app_user_id, deleted_logical_date, archived_at)
  WHERE deleted_logical_date IS NOT NULL;

CREATE TRIGGER routine_definition_activity_date_guard
BEFORE INSERT ON routine_definitions
FOR EACH ROW
WHEN NEW.created_logical_date IS NULL AND EXISTS (
  SELECT 1 FROM routine_activity_coverage
   WHERE app_user_id = NEW.app_user_id
)
BEGIN
  SELECT RAISE(ABORT, 'routine_activity_date_required');
END;

CREATE TRIGGER routine_definition_archive_activity_date_guard
BEFORE INSERT ON routine_definition_archives
FOR EACH ROW
WHEN NEW.deleted_logical_date IS NULL AND EXISTS (
  SELECT 1 FROM routine_activity_coverage
   WHERE app_user_id = NEW.app_user_id
)
BEGIN
  SELECT RAISE(ABORT, 'routine_activity_date_required');
END;

CREATE TRIGGER routine_definition_activity_date_immutable
BEFORE UPDATE OF created_logical_date ON routine_definitions
FOR EACH ROW
WHEN NEW.created_logical_date IS NOT OLD.created_logical_date
BEGIN
  SELECT RAISE(ABORT, 'routine_activity_date_immutable');
END;

CREATE TRIGGER routine_definition_archive_activity_date_immutable
BEFORE UPDATE OF deleted_logical_date ON routine_definition_archives
FOR EACH ROW
WHEN NEW.deleted_logical_date IS NOT OLD.deleted_logical_date
BEGIN
  SELECT RAISE(ABORT, 'routine_activity_date_immutable');
END;

CREATE TRIGGER routine_activity_marker_insert_guard
BEFORE INSERT ON routine_activity_coverage
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM routine_activity_coverage WHERE app_user_id = NEW.app_user_id)
BEGIN
  SELECT RAISE(ABORT, 'routine_activity_marker_immutable');
END;

CREATE TRIGGER routine_activity_marker_update_guard
BEFORE UPDATE ON routine_activity_coverage
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'routine_activity_marker_immutable');
END;

CREATE TRIGGER routine_activity_marker_delete_guard
BEFORE DELETE ON routine_activity_coverage
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'routine_activity_marker_immutable');
END;
