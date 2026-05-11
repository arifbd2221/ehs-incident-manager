-- 023_asset_maintenance.sql — P3-OP1 preventive maintenance + calibration.
--
-- Industry-standard PM/calibration scheduling for assets, mirrors the
-- baseline sellable tier of Limble / Fiix / Cority / Intelex. Closes the
-- ISO 9001 §7.1.5 (monitoring & measuring resources), ISO 55001 (asset
-- management), ISO 45001 §8.1, OSHA 1910.119 PSM, and 1910.178 forklift
-- inspection gaps. Inspectors on 1903 visits can finally answer:
-- "what was scheduled vs what was actually done on this equipment?"
--
-- Two tables:
--   asset_maintenance_schedules — recurring intent (interval, next_due
--                                  mirror that advances on completion)
--   asset_maintenance_events    — immutable completion records (one row
--                                  per mark-complete; never overwritten)
-- Plus a nullable FK on capas so CAPADetail can render
-- "Source: Maintenance schedule X" as a first-class block, not a
-- generic linked-entity row.
--
-- Activity log CHECK must accept entity_type='asset_maintenance' — the
-- SQLite rebuild pattern from 008 / 013 / 014 / 018 / 020 is reused.

PRAGMA defer_foreign_keys = ON;

-- ----- activity_log rebuild: add 'asset_maintenance' to the CHECK set -----
CREATE TABLE activity_log_v6 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'incident','investigation','capa','system',
    'template','inspection',
    'asset','document','folder','site','user','link',
    'asset_category','answer_set',
    'organization',
    'work_hours',
    'asset_maintenance'
  )),
  entity_id INTEGER,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO activity_log_v6 SELECT * FROM activity_log;
DROP TABLE activity_log;
ALTER TABLE activity_log_v6 RENAME TO activity_log;

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);

-- ----- Maintenance schedules: recurring intent per asset -----
CREATE TABLE IF NOT EXISTS asset_maintenance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  schedule_type TEXT NOT NULL CHECK(schedule_type IN
    ('preventive','calibration','inspection','other')),
  title TEXT NOT NULL,
  description TEXT,
  interval_days INTEGER NOT NULL CHECK(interval_days > 0),
  start_date TEXT NOT NULL,        -- ISO YYYY-MM-DD; first due date
  next_due TEXT NOT NULL,          -- ISO YYYY-MM-DD; advances on completion
  last_completed_at TEXT,
  last_completed_by INTEGER REFERENCES users(id),
  last_outcome TEXT CHECK(last_outcome IN ('pass','fail','conditional')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ams_asset ON asset_maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_ams_org_due ON asset_maintenance_schedules(org_id, next_due);
CREATE INDEX IF NOT EXISTS idx_ams_active ON asset_maintenance_schedules(active);
CREATE INDEX IF NOT EXISTS idx_ams_type ON asset_maintenance_schedules(schedule_type);

-- ----- Maintenance events: one row per completion, immutable -----
CREATE TABLE IF NOT EXISTS asset_maintenance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES asset_maintenance_schedules(id),
  asset_id INTEGER NOT NULL REFERENCES assets(id),     -- denormalized for asset-timeline reads
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_by INTEGER NOT NULL REFERENCES users(id),
  outcome TEXT NOT NULL CHECK(outcome IN ('pass','fail','conditional')),
  notes TEXT,
  capa_id INTEGER REFERENCES capas(id),                -- set if escalated to a CAPA
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ame_schedule ON asset_maintenance_events(schedule_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ame_asset ON asset_maintenance_events(asset_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ame_capa ON asset_maintenance_events(capa_id);

-- ----- CAPA back-link: first-class "this CAPA came from PM" rendering -----
-- source_type CHECK is unchanged; maintenance-originated CAPAs keep
-- source_type='proactive' (no investigation/incident origin). The FK lets
-- CAPADetail and reports distinguish maintenance-driven from generic
-- proactive CAPAs.
ALTER TABLE capas ADD COLUMN maintenance_schedule_id INTEGER
  REFERENCES asset_maintenance_schedules(id);
CREATE INDEX IF NOT EXISTS idx_capas_maint ON capas(maintenance_schedule_id);
