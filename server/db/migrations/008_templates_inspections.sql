-- Migration 008: Templates & Inspections
--
-- Adds tables for inspection templates, answer sets, inspections,
-- and their associated items/responses. Seeds default answer sets
-- (Yes/No and Pass/Fail/N/A) for every existing organization.
-- Also widens the activity_log entity_type CHECK to include
-- 'template' and 'inspection'.

-- ----- Answer sets: reusable response option groups -----
CREATE TABLE IF NOT EXISTS answer_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_answer_sets_org ON answer_sets(org_id);

-- ----- Answer set options: individual choices within an answer set -----
CREATE TABLE IF NOT EXISTS answer_set_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answer_set_id INTEGER NOT NULL REFERENCES answer_sets(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  color TEXT DEFAULT '#90A4AE',
  is_failed INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_answer_set_options_set ON answer_set_options(answer_set_id);

-- ----- Templates: inspection template definitions -----
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  published_at DATETIME,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_templates_org ON templates(org_id);
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);

-- ----- Template items: sections and questions within templates -----
CREATE TABLE IF NOT EXISTS template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  parent_key TEXT,
  type TEXT NOT NULL DEFAULT 'question' CHECK(type IN ('section','question','text','checkbox','media','signature')),
  label TEXT,
  region TEXT DEFAULT 'body' CHECK(region IN ('header','body')),
  sort_order INTEGER DEFAULT 0,
  required INTEGER DEFAULT 0,
  meta TEXT,
  UNIQUE(template_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_template_items_template ON template_items(template_id);

-- ----- Inspections: instances of templates being conducted -----
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  template_id INTEGER NOT NULL REFERENCES templates(id),
  inspection_number TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed','abandoned')),
  conducted_on DATETIME,
  location TEXT,
  started_by INTEGER REFERENCES users(id),
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inspections_org ON inspections(org_id);
CREATE INDEX IF NOT EXISTS idx_inspections_template ON inspections(template_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspections_number ON inspections(inspection_number);

-- ----- Inspection items: responses/answers for each template item -----
CREATE TABLE IF NOT EXISTS inspection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  type TEXT NOT NULL,
  selected_option_id INTEGER REFERENCES answer_set_options(id),
  response_text TEXT,
  is_flagged INTEGER DEFAULT 0,
  is_failed INTEGER DEFAULT 0,
  notes TEXT,
  UNIQUE(inspection_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection ON inspection_items(inspection_id);

-- ----- Widen activity_log entity_type CHECK to include template & inspection -----
-- SQLite does not support ALTER TABLE ... ALTER COLUMN, so we rebuild.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activity_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('incident','investigation','capa','system','template','inspection')),
  entity_id INTEGER,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO activity_log_new SELECT * FROM activity_log;
DROP TABLE activity_log;
ALTER TABLE activity_log_new RENAME TO activity_log;

CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

-- ----- Seed default answer sets per organization -----

-- Yes / No
INSERT OR IGNORE INTO answer_sets (org_id, name)
SELECT id, 'Yes / No' FROM organizations;

-- Pass / Fail / N/A
INSERT OR IGNORE INTO answer_sets (org_id, name)
SELECT id, 'Pass / Fail / N/A' FROM organizations;

-- ----- Seed answer set options -----

-- Yes / No options
INSERT INTO answer_set_options (answer_set_id, label, score, color, is_failed, position)
SELECT a.id, 'Yes', 1, '#2E7D32', 0, 0
FROM answer_sets a WHERE a.name = 'Yes / No';

INSERT INTO answer_set_options (answer_set_id, label, score, color, is_failed, position)
SELECT a.id, 'No', 0, '#D32F2F', 1, 1
FROM answer_sets a WHERE a.name = 'Yes / No';

-- Pass / Fail / N/A options
INSERT INTO answer_set_options (answer_set_id, label, score, color, is_failed, position)
SELECT a.id, 'Pass', 1, '#2E7D32', 0, 0
FROM answer_sets a WHERE a.name = 'Pass / Fail / N/A';

INSERT INTO answer_set_options (answer_set_id, label, score, color, is_failed, position)
SELECT a.id, 'Fail', 0, '#D32F2F', 1, 1
FROM answer_sets a WHERE a.name = 'Pass / Fail / N/A';

INSERT INTO answer_set_options (answer_set_id, label, score, color, is_failed, position)
SELECT a.id, 'N/A', 0, '#90A4AE', 0, 2
FROM answer_sets a WHERE a.name = 'Pass / Fail / N/A';
