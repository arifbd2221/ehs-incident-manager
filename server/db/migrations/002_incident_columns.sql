-- Migration 002: Phase 2 incident column additions + reported_by NOT NULL relaxation
--
-- Adds new columns to incidents for: anonymous flag, stop-work flag/state,
-- structured body parts, asset linkage, voice-extraction reference, and
-- recordability EHS verification audit.
--
-- ALSO relaxes the NOT NULL constraint on `reported_by` so anonymous
-- incidents can have NULL reporter. SQLite cannot drop NOT NULL via
-- ALTER, so this requires a table rebuild (12-step pattern documented at
-- https://www.sqlite.org/lang_altertable.html#otheralter).
--
-- Foreign-key checks are deferred to commit time so the rebuild can
-- recreate the table without breaking existing incoming references from
-- witnesses / investigations / notifications / osha_300_log / riddor_reports.
-- defer_foreign_keys is auto-cleared at COMMIT.

PRAGMA defer_foreign_keys = ON;

-- ----- Step 1: build the new table with relaxed reported_by + new columns -----
CREATE TABLE incidents_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_number TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('injury','illness','nearmiss','property','env','unsafe','observation','dangerous')),
  description TEXT NOT NULL DEFAULT '',
  incident_datetime TEXT NOT NULL,
  area TEXT,
  specific_location TEXT,
  department TEXT,
  shift TEXT,

  severity INTEGER CHECK(severity BETWEEN 1 AND 5),
  likelihood INTEGER,
  consequence INTEGER,
  track TEXT CHECK(track IN ('A','B','C')),
  severity_override INTEGER,
  severity_override_by INTEGER REFERENCES users(id),
  severity_override_reason TEXT,

  status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Triage','Investigating','Awaiting CAPA','Closed')),
  reported_by INTEGER REFERENCES users(id),  -- NULL allowed for anonymous reports (Phase 2)
  assigned_to INTEGER REFERENCES users(id),
  triage_due TEXT,
  triage_notes TEXT,
  closed_reason TEXT,
  closed_notes TEXT,
  closed_at TEXT,
  closed_by INTEGER REFERENCES users(id),

  osha_recordable INTEGER DEFAULT 0,
  osha_recordability_type TEXT,
  osha_case_number INTEGER,
  osha_days_away INTEGER DEFAULT 0,
  osha_days_restricted INTEGER DEFAULT 0,
  osha_date_of_death TEXT,
  riddor_reportable INTEGER DEFAULT 0,
  riddor_category TEXT,
  riddor_ref TEXT,
  riddor_phone_notified_at TEXT,
  riddor_written_submitted_at TEXT,

  type_data TEXT DEFAULT '{}',
  immediate_actions_taken TEXT,

  -- Phase 2 additions:
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  is_imminent_danger INTEGER NOT NULL DEFAULT 0,
  stop_work_status TEXT CHECK(stop_work_status IN ('active','acknowledged','resolved','cancelled')),
  body_parts_affected TEXT NOT NULL DEFAULT '[]',  -- flat JSON array of BodyMap3D region IDs
  asset_id INTEGER REFERENCES assets(id),
  voice_extraction_id INTEGER REFERENCES voice_extractions(id),
  osha_recordable_verified_by INTEGER REFERENCES users(id),
  osha_recordable_verified_at TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ----- Step 2: copy all rows -----
INSERT INTO incidents_new (
  id, incident_number, org_id, site_id, title, type, description, incident_datetime,
  area, specific_location, department, shift,
  severity, likelihood, consequence, track,
  severity_override, severity_override_by, severity_override_reason,
  status, reported_by, assigned_to, triage_due, triage_notes,
  closed_reason, closed_notes, closed_at, closed_by,
  osha_recordable, osha_recordability_type, osha_case_number,
  osha_days_away, osha_days_restricted, osha_date_of_death,
  riddor_reportable, riddor_category, riddor_ref,
  riddor_phone_notified_at, riddor_written_submitted_at,
  type_data, immediate_actions_taken,
  created_at, updated_at
)
SELECT
  id, incident_number, org_id, site_id, title, type, description, incident_datetime,
  area, specific_location, department, shift,
  severity, likelihood, consequence, track,
  severity_override, severity_override_by, severity_override_reason,
  status, reported_by, assigned_to, triage_due, triage_notes,
  closed_reason, closed_notes, closed_at, closed_by,
  osha_recordable, osha_recordability_type, osha_case_number,
  osha_days_away, osha_days_restricted, osha_date_of_death,
  riddor_reportable, riddor_category, riddor_ref,
  riddor_phone_notified_at, riddor_written_submitted_at,
  type_data, immediate_actions_taken,
  created_at, updated_at
FROM incidents;

-- ----- Step 3: drop old, rename new -----
DROP TABLE incidents;
ALTER TABLE incidents_new RENAME TO incidents;

-- ----- Step 4: recreate the indexes that lived on the old incidents table -----
CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents(org_id);
CREATE INDEX IF NOT EXISTS idx_incidents_site ON incidents(site_id);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_track ON incidents(track);
CREATE INDEX IF NOT EXISTS idx_incidents_number ON incidents(incident_number);
CREATE INDEX IF NOT EXISTS idx_incidents_datetime ON incidents(incident_datetime);

-- New Phase 2 indexes:
CREATE INDEX IF NOT EXISTS idx_incidents_anonymous ON incidents(is_anonymous);
CREATE INDEX IF NOT EXISTS idx_incidents_imminent ON incidents(is_imminent_danger);
CREATE INDEX IF NOT EXISTS idx_incidents_stop_work ON incidents(stop_work_status);
CREATE INDEX IF NOT EXISTS idx_incidents_asset ON incidents(asset_id);
