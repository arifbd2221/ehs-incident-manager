-- 024_risk_module.sql — Proactive risk management module.
--
-- Adds a Risk Register with full lifecycle (Identified → Assessed →
-- Mitigating → Controlled → Accepted → Closed), dual scoring (inherent
-- risk before controls, residual risk after controls) using the existing
-- 5×5 risk_matrix_cells, and a risk_controls child table for tracking
-- individual control measures via the hierarchy of controls.
--
-- Closes ISO 45001 §6.1 (hazard identification & risk assessment),
-- ISO 31000 (risk management framework), and OSHA §5(a)(1) general
-- duty clause gaps for proactive hazard management.

PRAGMA defer_foreign_keys = ON;

-- ----- risks table -----
CREATE TABLE IF NOT EXISTS risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  risk_number TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),

  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(category IN (
    'safety','health','environmental','ergonomic',
    'chemical','biological','physical','psychosocial','other'
  )),
  source TEXT,

  -- Inherent risk (before controls)
  inherent_likelihood INTEGER CHECK(inherent_likelihood BETWEEN 0 AND 4),
  inherent_consequence INTEGER CHECK(inherent_consequence BETWEEN 0 AND 4),
  inherent_severity INTEGER CHECK(inherent_severity BETWEEN 1 AND 5),
  inherent_track TEXT CHECK(inherent_track IN ('A','B','C')),
  inherent_risk_level TEXT CHECK(inherent_risk_level IN ('low','med','high','crit')),

  -- Residual risk (after controls)
  residual_likelihood INTEGER CHECK(residual_likelihood BETWEEN 0 AND 4),
  residual_consequence INTEGER CHECK(residual_consequence BETWEEN 0 AND 4),
  residual_severity INTEGER CHECK(residual_severity BETWEEN 1 AND 5),
  residual_track TEXT CHECK(residual_track IN ('A','B','C')),
  residual_risk_level TEXT CHECK(residual_risk_level IN ('low','med','high','crit')),

  status TEXT NOT NULL DEFAULT 'Identified' CHECK(status IN (
    'Identified','Assessed','Mitigating','Controlled','Accepted','Closed'
  )),

  identified_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  owner_id INTEGER REFERENCES users(id),

  review_date TEXT,
  accepted_by INTEGER REFERENCES users(id),
  accepted_at TEXT,
  accepted_justification TEXT,
  closed_at TEXT,
  closed_by INTEGER REFERENCES users(id),
  closed_reason TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_risks_org ON risks(org_id);
CREATE INDEX IF NOT EXISTS idx_risks_site ON risks(site_id);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_category ON risks(category);
CREATE INDEX IF NOT EXISTS idx_risks_number ON risks(risk_number);
CREATE INDEX IF NOT EXISTS idx_risks_inherent_severity ON risks(inherent_severity);
CREATE INDEX IF NOT EXISTS idx_risks_residual_severity ON risks(residual_severity);

-- ----- risk_controls: individual control measures -----
CREATE TABLE IF NOT EXISTS risk_controls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  control_type TEXT NOT NULL CHECK(control_type IN (
    'elimination','substitution','engineering','administrative','ppe'
  )),
  effectiveness TEXT NOT NULL DEFAULT 'pending' CHECK(effectiveness IN (
    'pending','effective','partially_effective','ineffective'
  )),
  implemented_at TEXT,
  implemented_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_risk_controls_risk ON risk_controls(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_controls_type ON risk_controls(control_type);

-- ----- activity_log rebuild: add 'risk' to the CHECK set -----
CREATE TABLE activity_log_v7 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'incident','investigation','capa','system',
    'template','inspection',
    'asset','document','folder','site','user','link',
    'asset_category','answer_set',
    'organization',
    'work_hours',
    'asset_maintenance',
    'risk'
  )),
  entity_id INTEGER,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO activity_log_v7 SELECT * FROM activity_log;
DROP TABLE activity_log;
ALTER TABLE activity_log_v7 RENAME TO activity_log;

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);

-- ----- attachments rebuild: add 'risk' to the CHECK set -----
CREATE TABLE attachments_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'incident','investigation','capa','maintenance_event','risk'
  )),
  entity_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  description TEXT,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO attachments_v3 SELECT * FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_v3 RENAME TO attachments;

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
