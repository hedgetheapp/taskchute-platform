CREATE TABLE wear_push_registrations (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  fcm_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (installation_id),
  UNIQUE (fcm_token),
  FOREIGN KEY (app_user_id) REFERENCES app_users(id) ON DELETE RESTRICT
);

CREATE INDEX wear_push_registrations_by_owner
  ON wear_push_registrations (app_user_id, updated_at);
