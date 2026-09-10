import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = new DatabaseSync(":memory:");
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE app_users (id TEXT PRIMARY KEY);
  CREATE TABLE routine_definitions (
    id TEXT NOT NULL, app_user_id TEXT NOT NULL, task_id TEXT NOT NULL,
    recurrence_type TEXT NOT NULL, start_logical_date TEXT NOT NULL,
    end_logical_date TEXT, materialization_order INTEGER NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY (app_user_id, id),
    FOREIGN KEY (app_user_id) REFERENCES app_users(id)
  );
  INSERT INTO app_users VALUES ('u');
  INSERT INTO routine_definitions VALUES ('r1', 'u', 't1', 'daily', '2026-01-01', NULL, 1, '2026-01-01');
  INSERT INTO routine_definitions VALUES ('r2', 'u', 't2', 'daily', '2026-01-01', NULL, 2, '2026-01-01');
  CREATE TABLE routine_schedules (
    app_user_id TEXT NOT NULL, routine_definition_id TEXT NOT NULL,
    schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('daily', 'every_n_days', 'weekly')),
    interval_days INTEGER, weekdays_mask INTEGER,
    PRIMARY KEY (app_user_id, routine_definition_id),
    FOREIGN KEY (app_user_id, routine_definition_id)
      REFERENCES routine_definitions(app_user_id, id)
  );
  INSERT INTO routine_schedules VALUES ('u', 'r1', 'every_n_days', 3, NULL);
  INSERT INTO routine_schedules VALUES ('u', 'r2', 'weekly', NULL, 42);
`);

db.exec(readFileSync(join(process.cwd(), "migrations/app/0026_routine_recurrence_expansion.sql"), "utf8"));
const rows = db.prepare(`SELECT routine_definition_id, schedule_kind, interval_days, weekdays_mask,
  interval_weeks, interval_months, month_day, month_ordinal, month_weekday
  FROM routine_schedules ORDER BY routine_definition_id`).all();
let rejected = false;
try {
  db.exec(`UPDATE routine_schedules SET schedule_kind = 'every_n_weeks', interval_weeks = 1,
    weekdays_mask = 2 WHERE routine_definition_id = 'r1'`);
} catch {
  rejected = true;
}
const result = {
  rows,
  rejected,
  quick_check: db.prepare("PRAGMA quick_check").get(),
  fk: db.prepare("PRAGMA foreign_key_check").all(),
  temporary_tables: db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%d086%'").all(),
};
console.log(JSON.stringify(result));
db.close();
