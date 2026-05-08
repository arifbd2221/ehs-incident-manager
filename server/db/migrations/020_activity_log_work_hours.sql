-- 020_activity_log_work_hours.sql — extend activity_log entity_type CHECK
-- to cover 'work_hours' (P3-OB2 work_hours CSV import).
--
-- Same SQLite-rebuild dance as 008 / 013 / 014 / 018.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE activity_log_v5 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'incident','investigation','capa','system',
    'template','inspection',
    'asset','document','folder','site','user','link',
    'asset_category','answer_set',
    'organization',
    'work_hours'
  )),
  entity_id INTEGER,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO activity_log_v5 SELECT * FROM activity_log;
DROP TABLE activity_log;
ALTER TABLE activity_log_v5 RENAME TO activity_log;

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
