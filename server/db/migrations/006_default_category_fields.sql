-- Migration 006: Pre-seed default fields per built-in asset category.
--
-- Each predefined category (Machine, Vehicle, Building, Area, Tool, Chemical)
-- gets a sensible starter set of custom fields so users don't face an empty
-- form when they pick "Vehicle" for the first time. Users can still add /
-- edit / delete these — they're just defaults, not enforced.
--
-- Idempotent: the UNIQUE(category_id, field_key) constraint plus
-- INSERT OR IGNORE means re-running won't duplicate, and a user-added field
-- with a clashing key is preserved unchanged.
--
-- Pattern: a single CTE-style UNION ALL that emits (category_name, position,
-- field_key, field_label, field_type, options_json, helper_text) tuples is
-- joined against existing categories per-org. The same CTE feeds an
-- AFTER-INSERT trigger so future category creates (e.g. on a fresh org) get
-- the same defaults.
--
-- Phase 2 W7 E7.1 follow-up.

PRAGMA defer_foreign_keys = ON;

-- The defaults table — kept inline as a VIEW so both the migration body and
-- the trigger can query the same source of truth.
CREATE VIEW IF NOT EXISTS _default_category_fields AS
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

SELECT 'Area',    0, 'hazard_class',           'Hazard class',          'select',   '["Low","Medium","High","Restricted"]', NULL, 0 UNION ALL
SELECT 'Area',    1, 'ppe_required',           'PPE required',          'textarea', NULL, 'List required protective equipment', 0 UNION ALL
SELECT 'Area',    2, 'access_restricted',      'Access restricted',     'checkbox', NULL, NULL, 0 UNION ALL
SELECT 'Area',    3, 'last_walkthrough',       'Last walkthrough',      'date',     NULL, NULL, 0 UNION ALL

SELECT 'Tool',    0, 'manufacturer',           'Manufacturer',          'text',     NULL, NULL, 0 UNION ALL
SELECT 'Tool',    1, 'model_number',           'Model number',          'text',     NULL, NULL, 0 UNION ALL
SELECT 'Tool',    2, 'calibration_required',   'Calibration required',  'checkbox', NULL, NULL, 0 UNION ALL
SELECT 'Tool',    3, 'last_calibration',       'Last calibration',      'date',     NULL, NULL, 0 UNION ALL

SELECT 'Chemical', 0, 'cas_number',            'CAS number',            'text',     NULL, 'Chemical Abstracts Service registry number', 0 UNION ALL
SELECT 'Chemical', 1, 'container_size',        'Container size',        'text',     NULL, 'e.g. "5L drum"', 0 UNION ALL
SELECT 'Chemical', 2, 'hazard_class',          'Hazard class',          'select',   '["Flammable","Corrosive","Toxic","Oxidizer","Reactive","Health hazard","Other"]', NULL, 0 UNION ALL
SELECT 'Chemical', 3, 'sds_document_number',   'SDS document number',   'text',     NULL, NULL, 0 UNION ALL
SELECT 'Chemical', 4, 'expiration_date',       'Expiration date',       'date',     NULL, NULL, 0;

-- Step 1: backfill all existing categories matching a default name.
INSERT OR IGNORE INTO asset_category_fields
  (org_id, category_id, field_key, field_label, field_type, options, helper_text, is_required, position)
SELECT
  ac.org_id, ac.id, df.field_key, df.field_label, df.field_type, df.options, df.helper_text, df.is_required, df.pos
FROM asset_categories ac
JOIN _default_category_fields df ON df.cat_name = ac.name;

-- Step 2: trigger to auto-populate defaults whenever a category with one of
-- the predefined names is created (e.g. on a brand-new org via the
-- seed_asset_categories_on_org_insert trigger from migration 004).
CREATE TRIGGER IF NOT EXISTS seed_default_fields_on_category_insert
AFTER INSERT ON asset_categories
BEGIN
  INSERT OR IGNORE INTO asset_category_fields
    (org_id, category_id, field_key, field_label, field_type, options, helper_text, is_required, position)
  SELECT
    NEW.org_id, NEW.id, df.field_key, df.field_label, df.field_type, df.options, df.helper_text, df.is_required, df.pos
  FROM _default_category_fields df
  WHERE df.cat_name = NEW.name;
END;
