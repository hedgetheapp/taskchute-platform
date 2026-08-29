PRAGMA foreign_keys = ON;

INSERT INTO app_users (id, created_at) VALUES ('user-v01a', '2026-08-28T00:00:00.000Z');
INSERT INTO user_settings (app_user_id, timezone, day_boundary_minutes, updated_at)
VALUES ('user-v01a', 'Asia/Tokyo', 240, '2026-08-28T00:00:00.000Z');
INSERT INTO sections (id, app_user_id, title, sort_order, created_at) VALUES
  ('section-morning', 'user-v01a', 'Morning', 0, '2026-08-28T00:00:00.000Z'),
  ('section-evening', 'user-v01a', 'Evening', 1, '2026-08-28T00:00:00.000Z');
INSERT INTO taskchute_days
  (id, app_user_id, logical_date, start_instant, end_instant, establishment_timezone,
   establishment_boundary_minutes, establishment_disambiguation, placement_revision, created_at)
VALUES ('day-v01a', 'user-v01a', '2026-08-28', '2026-08-27T19:00:00Z', '2026-08-28T19:00:00Z',
  'Asia/Tokyo', 240, 'compatible', 2, '2026-08-28T00:00:00.000Z');
INSERT INTO projects (id, app_user_id, title, created_at)
VALUES ('project-v01a', 'user-v01a', 'Existing project', '2026-08-28T00:00:00.000Z');
INSERT INTO tasks (id, app_user_id, project_id, title, created_at) VALUES
  ('task-planned', 'user-v01a', 'project-v01a', 'Existing planned', '2026-08-28T00:00:00.000Z'),
  ('task-running', 'user-v01a', NULL, 'Existing running', '2026-08-28T00:00:00.000Z');
INSERT INTO entries (id, app_user_id, task_id, taskchute_day_id, section_id, position, lifecycle_state, created_at) VALUES
  ('entry-planned', 'user-v01a', 'task-planned', 'day-v01a', 'section-morning', 1, 'planned', '2026-08-28T00:00:00.000Z'),
  ('019d2f00-0000-7000-8000-000000000002', 'user-v01a', 'task-running', 'day-v01a', 'section-evening', 1, 'running', '2026-08-28T00:00:00.000Z');
INSERT INTO executions (id, app_user_id, entry_id, started_at, ended_at, created_at)
VALUES ('019d2f00-0000-7000-8000-000000000003', 'user-v01a', '019d2f00-0000-7000-8000-000000000002',
  '2026-08-28T09:00:00.000Z', NULL, '2026-08-28T09:00:00.000Z');
INSERT INTO operations
  (app_user_id, operation_id, command_type, request_fingerprint_version, request_fingerprint, outcome_kind, result_json, created_at)
VALUES
  ('user-v01a', 'operation-existing', 'AddTaskToDay', 1, 'fixture-fingerprint', 'success', '{"fixture":true}', '2026-08-28T00:00:00.000Z'),
  ('user-v01a', '019d2f00-0000-7000-8000-000000000001', 'StartEntry', 1,
   'ae7259e4469236b36922e6e8b2cd9158b82602cd05777af2ed81d6599583c8c9', 'success',
   '{"entry_id":"019d2f00-0000-7000-8000-000000000002","lifecycle_state":"running","execution":{"id":"019d2f00-0000-7000-8000-000000000003","entry_id":"019d2f00-0000-7000-8000-000000000002","started_at":"2026-08-28T09:00:00.000Z","ended_at":null}}',
   '2026-08-28T09:00:00.000Z');
