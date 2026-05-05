-- Migration 004: Custom asset categories per org + drop assets.asset_type CHECK
--
-- Adds asset_categories table (per-org named categories with optional icon/color)
-- and rebuilds assets to drop the fixed-enum CHECK on asset_type so custom
-- types are allowed. Seeds 7 default categories per existing org.
--
-- Wave 2 follow-up after T2.2 — pattern matches SafetyCulture-style asset
-- type customization.

PRAGMA defer_foreign_keys = ON;

-- ----- Step 1: per-org asset categories -----
CREATE TABLE IF NOT EXISTS asset_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_asset_categories_org ON asset_categories(org_id);
CREATE INDEX IF NOT EXISTS idx_asset_categories_active ON asset_categories(active);

-- Seed defaults for every existing org. 'OR IGNORE' makes re-runs safe.
INSERT OR IGNORE INTO asset_categories (org_id, name, icon, color)
SELECT o.id, t.name, t.icon, t.color
FROM organizations o
CROSS JOIN (
  SELECT 'Machine'  as name, 'gear'    as icon, '#626DF9' as color UNION ALL
  SELECT 'Vehicle',          'reports',         '#0DB4F0'          UNION ALL
  SELECT 'Building',         'factory',         '#5C00FF'          UNION ALL
  SELECT 'Area',             'location',        '#2E7D32'          UNION ALL
  SELECT 'Tool',             'edit',            '#ED6C02'          UNION ALL
  SELECT 'Chemical',         'fire',            '#D32F2F'          UNION ALL
  SELECT 'Other',            'more',            '#90A4AE'
) t;

-- Trigger: auto-create the 7 default categories whenever a new org is
-- inserted. Handles fresh-seed timing (org row gets inserted by seed.js
-- AFTER migrations run) and any future org-creation flow (e.g. registration).
CREATE TRIGGER IF NOT EXISTS seed_asset_categories_on_org_insert
AFTER INSERT ON organizations
BEGIN
  INSERT OR IGNORE INTO asset_categories (org_id, name, icon, color)
  SELECT NEW.id, t.name, t.icon, t.color
  FROM (
    SELECT 'Machine'  as name, 'gear'    as icon, '#626DF9' as color UNION ALL
    SELECT 'Vehicle',          'reports',         '#0DB4F0'          UNION ALL
    SELECT 'Building',         'factory',         '#5C00FF'          UNION ALL
    SELECT 'Area',             'location',        '#2E7D32'          UNION ALL
    SELECT 'Tool',             'edit',            '#ED6C02'          UNION ALL
    SELECT 'Chemical',         'fire',            '#D32F2F'          UNION ALL
    SELECT 'Other',            'more',            '#90A4AE'
  ) t;
END;

-- ----- Step 2: rebuild assets to drop CHECK on asset_type -----
-- (SQLite can only drop a CHECK constraint by recreating the table.)
CREATE TABLE assets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_number TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,  -- free text; matches asset_categories.name when picked from dropdown
  asset_category_id INTEGER REFERENCES asset_categories(id),
  location_description TEXT,
  serial_number TEXT,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO assets_new (
  id, asset_number, org_id, site_id, name, asset_type,
  location_description, serial_number, active, created_at, updated_at
)
SELECT
  id, asset_number, org_id, site_id, name, asset_type,
  location_description, serial_number, active, created_at, updated_at
FROM assets;

-- Backfill asset_category_id by matching the existing asset_type text
-- against the seeded category names (case-insensitive).
UPDATE assets_new
SET asset_category_id = (
  SELECT ac.id FROM asset_categories ac
  WHERE ac.org_id = assets_new.org_id
    AND lower(ac.name) = lower(assets_new.asset_type)
);

-- For any rows whose asset_type didn't match a default (shouldn't happen
-- with the original enum, but just in case), keep them with NULL category_id
-- and a free-text asset_type. The user can re-classify later.

DROP TABLE assets;
ALTER TABLE assets_new RENAME TO assets;

CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(org_id);
CREATE INDEX IF NOT EXISTS idx_assets_site ON assets(site_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(asset_category_id);
CREATE INDEX IF NOT EXISTS idx_assets_active ON assets(active);
