-- Migration 001: Phase 2 additive tables
--
-- Adds 9 new tables for assets, documents, polymorphic linking,
-- work hours, risk matrix data, severity history, regulatory tracking,
-- and AI voice extractions. Idempotent via CREATE TABLE IF NOT EXISTS.
-- Seeds 25 risk_matrix_cells rows mirroring services/classification.js.
-- No alterations to existing tables — those happen in 002 and 003.

-- ----- Asset register -----
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_number TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('machine','vehicle','building','area','tool','chemical','other')),
  location_description TEXT,
  serial_number TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(org_id);
CREATE INDEX IF NOT EXISTS idx_assets_site ON assets(site_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_active ON assets(active);

-- ----- Document library (separate from per-entity attachments) -----
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_number TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('sds','manual','policy','photo','video','log','certificate','other')),
  file_url TEXT NOT NULL,
  stored_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_active ON documents(active);

-- ----- Polymorphic links (anything to anything) -----
CREATE TABLE IF NOT EXISTS entity_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  link_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_links_unique ON entity_links(source_type, source_id, target_type, target_id, link_role);

-- ----- Work hours per site per period (TRIR/DART denominator) -----
CREATE TABLE IF NOT EXISTS work_hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  period_start TEXT NOT NULL,  -- YYYY-MM-DD; first of month
  period_end TEXT NOT NULL,    -- YYYY-MM-DD; first of next month
  hours_worked INTEGER NOT NULL,
  avg_employees INTEGER,
  entered_by INTEGER REFERENCES users(id),
  entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  UNIQUE(site_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_work_hours_site_period ON work_hours(site_id, period_start);

-- ----- Risk matrix cells (data-driven 5x5 matrix) -----
-- likelihood: 0=Almost Certain, 1=Likely, 2=Possible, 3=Unlikely, 4=Rare
-- consequence: 0=Insignificant, 1=Minor, 2=Moderate, 3=Major, 4=Catastrophic
-- severity: 1=Critical, 2=Major, 3=Moderate, 4=Minor, 5=Insignificant
-- level_label: low|med|high|crit (matches services/classification.js naming)
CREATE TABLE IF NOT EXISTS risk_matrix_cells (
  likelihood INTEGER NOT NULL CHECK(likelihood BETWEEN 0 AND 4),
  consequence INTEGER NOT NULL CHECK(consequence BETWEEN 0 AND 4),
  severity INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 5),
  level_label TEXT NOT NULL CHECK(level_label IN ('low','med','high','crit')),
  PRIMARY KEY (likelihood, consequence)
);

INSERT OR IGNORE INTO risk_matrix_cells (likelihood, consequence, severity, level_label) VALUES
  -- Almost Certain (likelihood=0)
  (0, 0, 4, 'med'),
  (0, 1, 3, 'high'),
  (0, 2, 2, 'crit'),
  (0, 3, 2, 'crit'),
  (0, 4, 2, 'crit'),
  -- Likely (likelihood=1)
  (1, 0, 5, 'low'),
  (1, 1, 4, 'med'),
  (1, 2, 3, 'high'),
  (1, 3, 2, 'crit'),
  (1, 4, 2, 'crit'),
  -- Possible (likelihood=2)
  (2, 0, 5, 'low'),
  (2, 1, 4, 'med'),
  (2, 2, 3, 'high'),
  (2, 3, 3, 'high'),
  (2, 4, 2, 'crit'),
  -- Unlikely (likelihood=3)
  (3, 0, 5, 'low'),
  (3, 1, 5, 'low'),
  (3, 2, 4, 'med'),
  (3, 3, 3, 'high'),
  (3, 4, 3, 'high'),
  -- Rare (likelihood=4)
  (4, 0, 5, 'low'),
  (4, 1, 5, 'low'),
  (4, 2, 4, 'med'),
  (4, 3, 4, 'med'),
  (4, 4, 3, 'high');

-- ----- Severity history (immutable audit of overrides) -----
CREATE TABLE IF NOT EXISTS severity_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  from_severity INTEGER,
  to_severity INTEGER NOT NULL,
  from_track TEXT,
  to_track TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_severity_history_incident ON severity_history(incident_id);

-- ----- Regulatory certifications (300A annual + per-event reports) -----
CREATE TABLE IF NOT EXISTS regulatory_certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('osha_300a','riddor_f2508','osha_fatality_report','osha_24hr_report')),
  site_id INTEGER REFERENCES sites(id),
  period_year INTEGER,
  incident_id INTEGER REFERENCES incidents(id),
  certifier_user_id INTEGER NOT NULL REFERENCES users(id),
  certifier_title TEXT NOT NULL,
  affirmation_text TEXT NOT NULL,
  signed_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_reg_cert_site_year ON regulatory_certifications(site_id, period_year);
CREATE INDEX IF NOT EXISTS idx_reg_cert_incident ON regulatory_certifications(incident_id);

-- ----- Regulatory submissions (the actual filing record + reference numbers) -----
CREATE TABLE IF NOT EXISTS regulatory_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  incident_id INTEGER REFERENCES incidents(id),
  certification_id INTEGER REFERENCES regulatory_certifications(id),
  submission_method TEXT NOT NULL CHECK(submission_method IN ('ita_portal','phone','paper','hse_online')),
  external_reference_number TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_reg_sub_incident ON regulatory_submissions(incident_id);

-- ----- Voice extractions (AI-suggested fields with hash-only audit) -----
-- Transcript text itself is NOT stored — only its hash. Audit captures
-- which fields the user accepted, edited, or rejected when the incident
-- was finalized.
CREATE TABLE IF NOT EXISTS voice_extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER REFERENCES incidents(id),
  transcript_hash TEXT NOT NULL,
  ai_extracted_json TEXT NOT NULL,
  user_confirmed_fields TEXT NOT NULL DEFAULT '[]',
  user_edited_fields TEXT NOT NULL DEFAULT '[]',
  user_rejected_fields TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_voice_extractions_incident ON voice_extractions(incident_id);
