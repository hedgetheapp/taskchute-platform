PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = ON;

-- D-089 extends the existing typed schedule relation without rewriting any
-- Routine, occurrence, Entry, execution, override, or operation identity.
-- Calendar-aware eligibility remains a Worker/shared-domain concern; this
-- migration only persists the four approved schedule discriminators.
CREATE TABLE routine_schedules_d089 (
  app_user_id TEXT NOT NULL,
  routine_definition_id TEXT NOT NULL,
  schedule_kind TEXT NOT NULL CHECK (schedule_kind IN (
    'daily', 'every_n_days', 'weekly', 'every_n_weeks',
    'monthly_day', 'monthly_last_day', 'monthly_nth_weekday',
    'monthly_last_weekday', 'every_n_months_day', 'every_n_months_last_day',
    'workday', 'holiday', 'official_holiday', 'monthly_last_workday'
  )),
  interval_days INTEGER CHECK (
    (schedule_kind = 'every_n_days' AND interval_days BETWEEN 2 AND 365)
    OR (schedule_kind <> 'every_n_days' AND interval_days IS NULL)
  ),
  interval_weeks INTEGER CHECK (
    (schedule_kind = 'every_n_weeks' AND interval_weeks >= 2)
    OR (schedule_kind <> 'every_n_weeks' AND interval_weeks IS NULL)
  ),
  interval_months INTEGER CHECK (
    (schedule_kind IN ('every_n_months_day', 'every_n_months_last_day') AND interval_months >= 2)
    OR (schedule_kind NOT IN ('every_n_months_day', 'every_n_months_last_day') AND interval_months IS NULL)
  ),
  weekdays_mask INTEGER CHECK (
    (schedule_kind IN ('weekly', 'every_n_weeks') AND weekdays_mask BETWEEN 1 AND 127)
    OR (schedule_kind NOT IN ('weekly', 'every_n_weeks') AND weekdays_mask IS NULL)
  ),
  month_day INTEGER CHECK (
    (schedule_kind IN ('monthly_day', 'every_n_months_day') AND month_day BETWEEN 1 AND 31)
    OR (schedule_kind NOT IN ('monthly_day', 'every_n_months_day') AND month_day IS NULL)
  ),
  month_ordinal INTEGER CHECK (
    (schedule_kind = 'monthly_nth_weekday' AND month_ordinal BETWEEN 1 AND 5)
    OR (schedule_kind <> 'monthly_nth_weekday' AND month_ordinal IS NULL)
  ),
  month_weekday INTEGER CHECK (
    (schedule_kind IN ('monthly_nth_weekday', 'monthly_last_weekday') AND month_weekday BETWEEN 0 AND 6)
    OR (schedule_kind NOT IN ('monthly_nth_weekday', 'monthly_last_weekday') AND month_weekday IS NULL)
  ),
  PRIMARY KEY (app_user_id, routine_definition_id),
  FOREIGN KEY (app_user_id, routine_definition_id)
    REFERENCES routine_definitions(app_user_id, id) ON DELETE RESTRICT
);

INSERT INTO routine_schedules_d089
  (app_user_id, routine_definition_id, schedule_kind, interval_days, interval_weeks,
   interval_months, weekdays_mask, month_day, month_ordinal, month_weekday)
SELECT app_user_id, routine_definition_id, schedule_kind, interval_days, interval_weeks,
       interval_months, weekdays_mask, month_day, month_ordinal, month_weekday
  FROM routine_schedules;

DROP TABLE routine_schedules;
ALTER TABLE routine_schedules_d089 RENAME TO routine_schedules;

CREATE INDEX routine_schedules_kind_idx
  ON routine_schedules(app_user_id, schedule_kind);
