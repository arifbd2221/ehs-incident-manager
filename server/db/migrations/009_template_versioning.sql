-- Migration 009: Template Versioning
--
-- Adds version snapshots for templates. Publishing a template creates
-- a version snapshot. Inspections reference a specific version.
-- Templates remain always-editable (template_items is the working copy).

-- ----- Template versions: snapshots created on publish -----
CREATE TABLE IF NOT EXISTS template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_by INTEGER REFERENCES users(id),
  UNIQUE(template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions(template_id);

-- ----- Template version items: snapshot of items at publish time -----
CREATE TABLE IF NOT EXISTS template_version_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES template_versions(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  parent_key TEXT,
  type TEXT NOT NULL DEFAULT 'question',
  label TEXT,
  region TEXT DEFAULT 'body',
  sort_order INTEGER DEFAULT 0,
  required INTEGER DEFAULT 0,
  meta TEXT,
  UNIQUE(version_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_template_version_items_version ON template_version_items(version_id);

-- ----- Add template_version_id to inspections -----
-- SQLite doesn't support ADD COLUMN with FK constraints easily,
-- but we can add a nullable column.
ALTER TABLE inspections ADD COLUMN template_version_id INTEGER REFERENCES template_versions(id);

-- ----- Add latest_version to templates for quick lookup -----
ALTER TABLE templates ADD COLUMN latest_version INTEGER DEFAULT 0;
