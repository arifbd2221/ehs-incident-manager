-- 013_activity_log_widen.sql — widen activity_log entity_type CHECK for P3-A1.
--
-- Existing CHECK (set by 008): incident, investigation, capa, system, template, inspection.
-- We extend coverage to compliance-relevant mutations on:
--   asset, document, folder, site, user, link
-- so sites/assets/documents/folders/links/auth route logs can persist without
-- bypassing the constraint. asset_categories + answer_sets are intentionally
-- left out (admin config, low audit value).
--
-- SQLite has no ALTER TABLE ALTER CONSTRAINT, so we rebuild like 008 did.
-- defer_foreign_keys protects rows where user_id points at users(id) during
-- the table swap.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE activity_log_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'incident','investigation','capa','system',
    'template','inspection',
    'asset','document','folder','site','user','link'
  )),
  entity_id INTEGER,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO activity_log_v2 SELECT * FROM activity_log;
DROP TABLE activity_log;
ALTER TABLE activity_log_v2 RENAME TO activity_log;

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
