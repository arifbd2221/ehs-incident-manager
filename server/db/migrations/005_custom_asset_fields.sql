-- Migration 005: Custom fields per asset category (E7.1, SafetyCulture-style)
--
-- Adds asset_category_fields (per-category field definitions) and a
-- custom_fields JSON column on assets. Fields are scoped to the category +
-- the org, so two orgs can have identically-named categories with different
-- field sets.
--
-- Field shape:
--   field_key   — snake_case key for the JSON object on assets.custom_fields
--   field_label — human-readable label rendered in the form
--   field_type  — text | number | date | select | textarea | checkbox
--   options     — JSON array of strings (only for field_type='select')
--   is_required — backend rejects asset save if missing
--   helper_text — optional hint shown under the input
--   position    — display order within the category
--
-- The values themselves live on assets.custom_fields as a JSON object
-- keyed by field_key so historical assets don't break when their category's
-- field set evolves (added fields surface as empty; removed fields are
-- ignored on display but kept on the row).

PRAGMA defer_foreign_keys = ON;

CREATE TABLE IF NOT EXISTS asset_category_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  category_id INTEGER NOT NULL REFERENCES asset_categories(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK(field_type IN ('text','number','date','select','textarea','checkbox')),
  is_required INTEGER NOT NULL DEFAULT 0,
  options TEXT,
  helper_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_acf_category ON asset_category_fields(category_id);
CREATE INDEX IF NOT EXISTS idx_acf_org ON asset_category_fields(org_id);

-- assets.custom_fields — JSON object, default '{}'.
-- Defensive: ALTER TABLE … ADD COLUMN does not fail on re-runs because it
-- is wrapped in this migration which is tracked by _schema_migrations and
-- only applied once. SQLite has no ADD COLUMN IF NOT EXISTS.
ALTER TABLE assets ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '{}';
