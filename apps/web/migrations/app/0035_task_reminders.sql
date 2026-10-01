ALTER TABLE entries
  ADD COLUMN start_reminder_offset_minutes INTEGER
  CHECK (start_reminder_offset_minutes IS NULL OR start_reminder_offset_minutes IN (0, 5, 10, 15, 30, 60));

ALTER TABLE entries
  ADD COLUMN notify_on_estimate_overrun INTEGER NOT NULL DEFAULT 0
  CHECK (notify_on_estimate_overrun IN (0, 1));
