-- OSHA 29 CFR 1904 compliance gaps — six high-priority fields.
--
-- 1. Physician/facility info is stored in type_data JSON (no schema change needed).
-- 2. ER/hospitalization flags on the incidents table.
-- 3. Privacy case flag (suppress employee name on 300 log per 1904.29(b)).
-- 4. Work-relatedness determination capture.
-- 5. OSHA 301 form data is already queryable (no schema change needed).
-- 6. Manual 300 entry: make incident_id nullable so rows can exist without an incident.

PRAGMA defer_foreign_keys = ON;

-- Fix #2: ER and hospitalization tracking
ALTER TABLE incidents ADD COLUMN er_treated INTEGER DEFAULT 0;
ALTER TABLE incidents ADD COLUMN hospitalized INTEGER DEFAULT 0;
ALTER TABLE incidents ADD COLUMN hospitalization_date TEXT;

-- Fix #3: Privacy case flag (OSHA 1904.29(b))
ALTER TABLE incidents ADD COLUMN osha_privacy_case INTEGER DEFAULT 0;

-- Fix #4: Work-relatedness determination
ALTER TABLE incidents ADD COLUMN osha_work_related TEXT;

-- Fix #6: Allow manual OSHA 300 entries (no linked incident).
-- SQLite cannot ALTER COLUMN to drop NOT NULL, so we rebuild.
CREATE TABLE osha_300_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  incident_id INTEGER REFERENCES incidents(id),
  calendar_year INTEGER NOT NULL,
  case_number INTEGER NOT NULL,
  employee_name TEXT NOT NULL,
  job_title TEXT,
  injury_date TEXT NOT NULL,
  location TEXT,
  description TEXT,
  classification_death INTEGER DEFAULT 0,
  classification_days_away INTEGER DEFAULT 0,
  classification_job_transfer INTEGER DEFAULT 0,
  classification_other INTEGER DEFAULT 0,
  days_away_count INTEGER DEFAULT 0,
  days_restricted_count INTEGER DEFAULT 0,
  injury_type TEXT,
  is_privacy_case INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(site_id, calendar_year, case_number)
);

INSERT INTO osha_300_log_new SELECT
  id, org_id, site_id, incident_id, calendar_year, case_number,
  employee_name, job_title, injury_date, location, description,
  classification_death, classification_days_away, classification_job_transfer,
  classification_other, days_away_count, days_restricted_count, injury_type,
  0, created_at, updated_at
FROM osha_300_log;

DROP TABLE osha_300_log;
ALTER TABLE osha_300_log_new RENAME TO osha_300_log;
