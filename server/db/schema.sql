PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  address TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  naics_code TEXT,
  establishment_id TEXT,
  hse_establishment_id TEXT,
  annual_avg_employees INTEGER DEFAULT 0,
  total_hours_worked INTEGER DEFAULT 0,
  timezone TEXT DEFAULT 'America/New_York',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER REFERENCES sites(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'worker' CHECK(role IN ('worker','supervisor','ehs_officer','ehs_manager','admin')),
  department TEXT,
  job_title TEXT,
  hire_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
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
  reported_by INTEGER NOT NULL REFERENCES users(id),
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

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_incidents_org ON incidents(org_id);
CREATE INDEX IF NOT EXISTS idx_incidents_site ON incidents(site_id);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_track ON incidents(track);
CREATE INDEX IF NOT EXISTS idx_incidents_number ON incidents(incident_number);
CREATE INDEX IF NOT EXISTS idx_incidents_datetime ON incidents(incident_datetime);

CREATE TABLE IF NOT EXISTS witnesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  statement TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('incident','investigation','capa')),
  entity_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  description TEXT,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS investigations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_number TEXT NOT NULL UNIQUE,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  lead_investigator INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','progress','capa','closed')),
  track TEXT CHECK(track IN ('A','B')),
  started_at TEXT DEFAULT (datetime('now')),
  due_date TEXT,
  findings TEXT,
  root_cause_summary TEXT,
  root_cause_categories TEXT DEFAULT '[]',
  closed_at TEXT,
  closed_by INTEGER REFERENCES users(id),
  closed_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_investigations_incident ON investigations(incident_id);
CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(status);

CREATE TABLE IF NOT EXISTS investigation_team (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS five_whys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 10),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_root_cause INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capa_number TEXT NOT NULL UNIQUE,
  investigation_id INTEGER NOT NULL REFERENCES investigations(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('corrective','preventive')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  category TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  verifier_id INTEGER NOT NULL REFERENCES users(id),
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','progress','verify','closed')),
  progress INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id),
  completion_notes TEXT,
  verified_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  verification_result TEXT,
  verification_notes TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_capas_investigation ON capas(investigation_id);
CREATE INDEX IF NOT EXISTS idx_capas_status ON capas(status);
CREATE INDEX IF NOT EXISTS idx_capas_owner ON capas(owner_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('incident','investigation','capa','system')),
  entity_id INTEGER,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  incident_id INTEGER REFERENCES incidents(id),
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT DEFAULT 'info' CHECK(severity IN ('info','warn','err')),
  deadline TEXT,
  is_read INTEGER DEFAULT 0,
  action_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS osha_300_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(site_id, calendar_year, case_number)
);

CREATE TABLE IF NOT EXISTS riddor_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  riddor_number TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  event_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  hse_ref TEXT,
  phone_notified_at TEXT,
  phone_notified_by TEXT,
  written_submitted_at TEXT,
  written_deadline TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','phone_reported','submitted','overdue')),
  f2508_data TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
