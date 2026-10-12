-- Synthetic D1-only fixtures. No application or production schema is imported.

CREATE TABLE before_days (
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
  UNIQUE (app_user_id, logical_date)
);
CREATE INDEX before_days_interval_idx ON before_days(app_user_id, start_instant, end_instant);

-- Models the prior same-date-exempt BEFORE INSERT guard for the OR REPLACE probe.
CREATE TRIGGER before_days_overlap_guard
BEFORE INSERT ON before_days
WHEN NOT EXISTS (
  SELECT 1 FROM before_days d
  WHERE d.app_user_id = NEW.app_user_id AND d.logical_date = NEW.logical_date
) AND EXISTS (
  SELECT 1 FROM before_days d
  WHERE d.app_user_id = NEW.app_user_id
    AND NEW.start_instant < d.end_instant
    AND d.start_instant < NEW.end_instant
)
BEGIN
  SELECT RAISE(ABORT, 'synthetic day interval overlap');
END;

CREATE TABLE after_days (
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
  UNIQUE (app_user_id, logical_date)
);
CREATE INDEX after_days_interval_idx ON after_days(app_user_id, start_instant, end_instant);

CREATE TRIGGER after_days_overlap_guard
AFTER INSERT ON after_days
WHEN EXISTS (
  SELECT 1 FROM after_days d
  WHERE d.app_user_id = NEW.app_user_id
    AND d.id <> NEW.id
    AND NEW.start_instant < d.end_instant
    AND d.start_instant < NEW.end_instant
)
BEGIN
  SELECT RAISE(ABORT, 'synthetic day interval overlap');
END;

CREATE TABLE after_day_dependents (
  app_user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  PRIMARY KEY (app_user_id, id),
  FOREIGN KEY (app_user_id, day_id) REFERENCES after_days(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE fenced_days (
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
  UNIQUE (app_user_id, logical_date)
);
CREATE INDEX fenced_days_interval_idx ON fenced_days(app_user_id, start_instant, end_instant);

CREATE TABLE day_fences (
  app_user_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  PRIMARY KEY (app_user_id, day_id),
  FOREIGN KEY (app_user_id, day_id) REFERENCES fenced_days(app_user_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER fenced_days_overlap_guard
AFTER INSERT ON fenced_days
WHEN EXISTS (
  SELECT 1 FROM fenced_days d
  WHERE d.app_user_id = NEW.app_user_id
    AND d.id <> NEW.id
    AND NEW.start_instant < d.end_instant
    AND d.start_instant < NEW.end_instant
)
BEGIN
  SELECT RAISE(ABORT, 'synthetic day interval overlap');
END;

CREATE TRIGGER fenced_days_create_fence
AFTER INSERT ON fenced_days
BEGIN
  INSERT INTO day_fences(app_user_id, day_id) VALUES (NEW.app_user_id, NEW.id);
END;

CREATE TRIGGER fenced_days_identity_immutable
BEFORE UPDATE OF app_user_id, id, logical_date, start_instant, end_instant,
  establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, created_at
ON fenced_days
WHEN OLD.app_user_id IS NOT NEW.app_user_id
  OR OLD.id IS NOT NEW.id
  OR OLD.logical_date IS NOT NEW.logical_date
  OR OLD.start_instant IS NOT NEW.start_instant
  OR OLD.end_instant IS NOT NEW.end_instant
  OR OLD.establishment_timezone IS NOT NEW.establishment_timezone
  OR OLD.establishment_boundary_minutes IS NOT NEW.establishment_boundary_minutes
  OR OLD.establishment_disambiguation IS NOT NEW.establishment_disambiguation
  OR OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'synthetic established day identity is immutable');
END;

CREATE TABLE section_sentinels (
  app_user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  PRIMARY KEY (app_user_id, id)
);

CREATE TABLE section_context_sentinels (
  app_user_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  PRIMARY KEY (app_user_id, day_id, section_id),
  FOREIGN KEY (app_user_id, day_id) REFERENCES fenced_days(app_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (app_user_id, section_id) REFERENCES section_sentinels(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE operation_sentinels (
  app_user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  PRIMARY KEY (app_user_id, operation_id),
  FOREIGN KEY (app_user_id, day_id) REFERENCES fenced_days(app_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE synthetic_batch_failures (
  id TEXT PRIMARY KEY NOT NULL,
  accepted INTEGER NOT NULL CHECK (accepted = 1)
);

CREATE TABLE race_arrivals (
  race_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  arrived_at_ms INTEGER NOT NULL,
  PRIMARY KEY (race_key, request_id)
);

CREATE TABLE race_preflights (
  race_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  app_user_id TEXT NOT NULL,
  logical_date TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  read_meta_json TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  PRIMARY KEY (race_key, request_id)
);

CREATE TABLE race_releases (
  race_key TEXT PRIMARY KEY NOT NULL,
  released_at_ms INTEGER NOT NULL,
  participant_count INTEGER NOT NULL CHECK (participant_count = 2)
);

CREATE TABLE race_release_observations (
  race_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  observed_at_ms INTEGER NOT NULL,
  PRIMARY KEY (race_key, request_id)
);

CREATE TABLE race_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  race_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  recorded_at_ms INTEGER NOT NULL,
  detail_json TEXT NOT NULL,
  UNIQUE (race_key, request_id, phase)
);

-- Cost control uses the same indexed owner/date/interval shape but no guard or fence.
CREATE TABLE baseline_days (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  logical_date TEXT NOT NULL,
  start_instant TEXT NOT NULL,
  end_instant TEXT NOT NULL,
  establishment_timezone TEXT NOT NULL,
  establishment_boundary_minutes INTEGER NOT NULL,
  establishment_disambiguation TEXT NOT NULL,
  placement_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (start_instant < end_instant),
  UNIQUE (app_user_id, id),
  UNIQUE (app_user_id, logical_date)
);
CREATE INDEX baseline_days_interval_idx ON baseline_days(app_user_id, start_instant, end_instant);

CREATE TABLE guard_cost_days (
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
  UNIQUE (app_user_id, logical_date)
);
CREATE INDEX guard_cost_days_interval_idx ON guard_cost_days(app_user_id, start_instant, end_instant);

CREATE TABLE guard_cost_fences (
  app_user_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  PRIMARY KEY (app_user_id, day_id),
  FOREIGN KEY (app_user_id, day_id) REFERENCES guard_cost_days(app_user_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER guard_cost_days_overlap_guard
AFTER INSERT ON guard_cost_days
WHEN EXISTS (
  SELECT 1 FROM guard_cost_days d
  WHERE d.app_user_id = NEW.app_user_id
    AND d.id <> NEW.id
    AND NEW.start_instant < d.end_instant
    AND d.start_instant < NEW.end_instant
)
BEGIN
  SELECT RAISE(ABORT, 'synthetic day interval overlap');
END;

CREATE TRIGGER guard_cost_days_create_fence
AFTER INSERT ON guard_cost_days
BEGIN
  INSERT INTO guard_cost_fences(app_user_id, day_id) VALUES (NEW.app_user_id, NEW.id);
END;

CREATE TRIGGER guard_cost_days_identity_immutable
BEFORE UPDATE OF app_user_id, id, logical_date, start_instant, end_instant,
  establishment_timezone, establishment_boundary_minutes, establishment_disambiguation, created_at
ON guard_cost_days
WHEN OLD.app_user_id IS NOT NEW.app_user_id
  OR OLD.id IS NOT NEW.id
  OR OLD.logical_date IS NOT NEW.logical_date
  OR OLD.start_instant IS NOT NEW.start_instant
  OR OLD.end_instant IS NOT NEW.end_instant
  OR OLD.establishment_timezone IS NOT NEW.establishment_timezone
  OR OLD.establishment_boundary_minutes IS NOT NEW.establishment_boundary_minutes
  OR OLD.establishment_disambiguation IS NOT NEW.establishment_disambiguation
  OR OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'synthetic established day identity is immutable');
END;