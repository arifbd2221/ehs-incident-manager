-- 016_org_onboarding_fields.sql — onboarding showcase (P3-O1 slice 1).
--
-- Two parts:
--
-- Part A: extend organizations with the fields the new sign-up flow captures
-- (country, industry, NAICS, regulator, size). All nullable so existing rows
-- (and the seed's SDS Manager Inc. before its backfilled INSERT) survive.
-- SQLite supports ALTER TABLE ADD COLUMN for nullables — no rebuild needed.
--
-- Part B: widen activity_log entity_type CHECK to accept 'organization' so
-- /signup-org can write an org_created audit row. Same SQLite-rebuild dance
-- as 013_activity_log_widen.sql / 014_activity_log_admin_types.sql.

-- Part A: organization columns
ALTER TABLE organizations ADD COLUMN country TEXT;
ALTER TABLE organizations ADD COLUMN industry_sector TEXT;
ALTER TABLE organizations ADD COLUMN naics_code TEXT;
ALTER TABLE organizations ADD COLUMN primary_regulator TEXT;
ALTER TABLE organizations ADD COLUMN company_size TEXT;

-- Part B: activity_log CHECK includes 'organization'
PRAGMA defer_foreign_keys = ON;

CREATE TABLE activity_log_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'incident','investigation','capa','system',
    'template','inspection',
    'asset','document','folder','site','user','link',
    'asset_category','answer_set',
    'organization'
  )),
  entity_id INTEGER,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO activity_log_v4 SELECT * FROM activity_log;
DROP TABLE activity_log;
ALTER TABLE activity_log_v4 RENAME TO activity_log;

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
