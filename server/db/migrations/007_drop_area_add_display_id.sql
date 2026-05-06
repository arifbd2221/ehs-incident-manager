-- Migration 007: Drop "Area" from predefined asset types + add display_id.
--
-- 1. "Area" was carried over from the original Phase-1 enum, but an area is
--    a *location* (Bay 3, Lab 2), not an asset (a discrete thing you own
--    and maintain). Soft-archive existing Area categories per org and
--    rebuild the org-insert / category-insert triggers from migrations 004
--    and 006 to omit Area from their seed sets.
-- 2. Every asset already has an auto-generated `asset_number` (system),
--    but no user-controlled identifier. Add `display_id` — required for
--    new assets, unique per org. Existing rows are backfilled from
--    asset_number so the partial unique index never trips on legacy data.

PRAGMA defer_foreign_keys = ON;

-- ----- Step 1: archive existing Area categories -----
UPDATE asset_categories SET active = 0 WHERE name = 'Area';

-- ----- Step 2: rebuild migration-004 trigger without Area -----
DROP TRIGGER IF EXISTS seed_asset_categories_on_org_insert;

CREATE TRIGGER seed_asset_categories_on_org_insert
AFTER INSERT ON organizations
BEGIN
  INSERT OR IGNORE INTO asset_categories (org_id, name, icon, color)
  SELECT NEW.id, t.name, t.icon, t.color
  FROM (
    SELECT 'Machine'  as name, 'gear'    as icon, '#626DF9' as color UNION ALL
    SELECT 'Vehicle',          'reports',         '#0DB4F0'          UNION ALL
    SELECT 'Building',         'factory',         '#5C00FF'          UNION ALL
    SELECT 'Tool',             'edit',            '#ED6C02'          UNION ALL
    SELECT 'Chemical',         'fire',            '#D32F2F'          UNION ALL
    SELECT 'Other',             'more',           '#90A4AE'
  ) t;
END;

-- ----- Step 3: rebuild migration-006 view + trigger without Area defaults -----
DROP TRIGGER IF EXISTS seed_default_fields_on_category_insert;
DROP VIEW IF EXISTS _default_category_fields;

CREATE VIEW _default_category_fields AS
SELECT 'Machine' AS cat_name, 0 AS pos, 'manufacturer' AS field_key, 'Manufacturer' AS field_label, 'text' AS field_type, NULL AS options, NULL AS helper_text, 0 AS is_required UNION ALL
SELECT 'Machine', 1, 'model_number',           'Model number',          'text',     NULL, NULL, 0 UNION ALL
SELECT 'Machine', 2, 'year_installed',         'Year installed',        'number',   NULL, NULL, 0 UNION ALL
SELECT 'Machine', 3, 'power_source',           'Power source',          'select',   '["Electric","Pneumatic","Hydraulic","Gas","Manual"]', NULL, 0 UNION ALL
SELECT 'Machine', 4, 'last_inspection_date',   'Last inspection',       'date',     NULL, 'Most recent safety inspection', 0 UNION ALL

SELECT 'Vehicle', 0, 'vin',                    'VIN',                   'text',     NULL, NULL, 0 UNION ALL
SELECT 'Vehicle', 1, 'license_plate',          'License plate',         'text',     NULL, NULL, 0 UNION ALL
SELECT 'Vehicle', 2, 'make',                   'Make',                  'text',     NULL, NULL, 0 UNION ALL
SELECT 'Vehicle', 3, 'model',                  'Model',                 'text',     NULL, NULL, 0 UNION ALL
SELECT 'Vehicle', 4, 'year',                   'Year',                  'number',   NULL, NULL, 0 UNION ALL
SELECT 'Vehicle', 5, 'last_service_date',      'Last service',          'date',     NULL, NULL, 0 UNION ALL

SELECT 'Building', 0, 'square_footage',        'Square footage',        'number',   NULL, 'Approx, in sq ft', 0 UNION ALL
SELECT 'Building', 1, 'year_built',            'Year built',            'number',   NULL, NULL, 0 UNION ALL
SELECT 'Building', 2, 'occupancy_type',        'Occupancy type',        'select',   '["Office","Warehouse","Lab","Manufacturing","Mixed"]', NULL, 0 UNION ALL
SELECT 'Building', 3, 'sprinklers_installed',  'Sprinklers installed',  'checkbox', NULL, NULL, 0 UNION ALL
SELECT 'Building', 4, 'last_fire_inspection',  'Last fire inspection',  'date',     NULL, NULL, 0 UNION ALL

SELECT 'Tool',    0, 'manufacturer',           'Manufacturer',          'text',     NULL, NULL, 0 UNION ALL
SELECT 'Tool',    1, 'model_number',           'Model number',          'text',     NULL, NULL, 0 UNION ALL
SELECT 'Tool',    2, 'calibration_required',   'Calibration required',  'checkbox', NULL, NULL, 0 UNION ALL
SELECT 'Tool',    3, 'last_calibration',       'Last calibration',      'date',     NULL, NULL, 0 UNION ALL

SELECT 'Chemical', 0, 'cas_number',            'CAS number',            'text',     NULL, 'Chemical Abstracts Service registry number', 0 UNION ALL
SELECT 'Chemical', 1, 'container_size',        'Container size',        'text',     NULL, 'e.g. "5L drum"', 0 UNION ALL
SELECT 'Chemical', 2, 'hazard_class',          'Hazard class',          'select',   '["Flammable","Corrosive","Toxic","Oxidizer","Reactive","Health hazard","Other"]', NULL, 0 UNION ALL
SELECT 'Chemical', 3, 'sds_document_number',   'SDS document number',   'text',     NULL, NULL, 0 UNION ALL
SELECT 'Chemical', 4, 'expiration_date',       'Expiration date',       'date',     NULL, NULL, 0;

CREATE TRIGGER seed_default_fields_on_category_insert
AFTER INSERT ON asset_categories
BEGIN
  INSERT OR IGNORE INTO asset_category_fields
    (org_id, category_id, field_key, field_label, field_type, options, helper_text, is_required, position)
  SELECT
    NEW.org_id, NEW.id, df.field_key, df.field_label, df.field_type, df.options, df.helper_text, df.is_required, df.pos
  FROM _default_category_fields df
  WHERE df.cat_name = NEW.name;
END;

-- ----- Step 4: assets.display_id (user-provided unique identifier) -----
ALTER TABLE assets ADD COLUMN display_id TEXT;

-- Backfill from asset_number so the partial unique index doesn't trip on
-- legacy data and the FE can immediately render display_id everywhere.
UPDATE assets SET display_id = asset_number WHERE display_id IS NULL;

-- Partial unique index — allows NULL (none expected after backfill, but
-- defensive) and enforces per-org uniqueness on the user-facing identifier.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_display_id_per_org
  ON assets(org_id, display_id)
  WHERE display_id IS NOT NULL;
