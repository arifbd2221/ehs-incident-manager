-- 028_safework_nsw.sql — WI-06 SafeWork NSW notifiable-incident reporting.
--
-- Source: Work Health and Safety Act 2011 No 10 [NSW], Part 3 (ss.35–39).
-- Verbatim Act text extracted from docs/regulatory-sources/safework-nsw/
-- whs-act-2011-nsw.pdf (current version for 1 March 2026 to date). Owner
-- approved the verbatim extraction and gap decisions on 2026-05-12.
--
-- Schema decisions (per gap review):
--   • Gap 1 (s.36/s.37 "prescribed by regulations" tail) — scaffold 10/11
--     enumerated rows + 1 "other prescribed" row each. Free-text label
--     captures the regulator-prescribed type when used.
--   • Gap 2 (s.38(4)(b) 48h written clock) — written_deadline NOT set at
--     notification time. It is computed = regulator_requested_written_at
--     + 48h, and only when the regulator actually requests it.
--   • Gap 3 (Mines & Petroleum carve-out, s.38(8) + s.39(4)) — flag
--     excluded_mines_petroleum on the row; engine returns "not notifiable
--     under WHS Act 2011" with no deadlines when set.
--   • Gap 4 (Death) — top-level s.35(a) category, separate boolean
--     is_fatality. No s.36 sub-category required.
--   • Lookups carry verbatim Act `label` + `section_ref` for UI display
--     and PDF rendering.
--
-- Sub-category linkage: a single incident can map to multiple s.36 sub-
-- categories (e.g., burn + spinal injury) or s.37 (e.g., explosion +
-- structure collapse). We carry these as JSON arrays of lookup keys on
-- the notifications row rather than junction tables — matches the
-- type_data / body_parts_affected JSON pattern used elsewhere in the
-- schema, keeps the migration to 3 tables per the owner directive.
--
-- ANZSIC: per WI-06 refinement, accept 4-digit format-validated text
-- (PCBU.anzsic_code). NOT seeded in this migration; deferred to a
-- future WI when a full code list lands.
--
-- Numbering: NSW-{YYYY}-{NNNN}, mirrors riddor_number / incident_number
-- via server/services/numbering.js nextNswNumber().

PRAGMA defer_foreign_keys = ON;

-- ============================================================
-- safework_nsw_notifications — one row per notifiable incident
-- ============================================================

CREATE TABLE IF NOT EXISTS safework_nsw_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nsw_number TEXT NOT NULL UNIQUE,           -- "NSW-2026-0001"
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),

  -- Mirror of incidents.incident_datetime for indexed range queries
  -- without joining (matches riddor_reports.event_date pattern).
  event_date TEXT NOT NULL,

  -- s.35 top-level categories. An incident can satisfy multiple (e.g.,
  -- a death from a structural collapse is both s.35(a) and s.35(c)).
  is_fatality INTEGER NOT NULL DEFAULT 0,            -- s.35(a)
  is_serious_injury INTEGER NOT NULL DEFAULT 0,      -- s.35(b)
  is_dangerous_incident INTEGER NOT NULL DEFAULT 0,  -- s.35(c)

  -- JSON arrays of lookup keys from the two enum tables below.
  -- Empty array '[]' when the relevant top-level boolean is 0.
  serious_injury_sub_categories TEXT NOT NULL DEFAULT '[]',
  dangerous_incident_sub_categories TEXT NOT NULL DEFAULT '[]',

  -- s.38(8) / s.39(4) — Mines & Petroleum carve-out. When 1, no
  -- WHS Act notification duty arises; engine emits no deadlines.
  excluded_mines_petroleum INTEGER NOT NULL DEFAULT 0,

  -- s.39 site preservation. enum of states; disturbance basis from
  -- s.39(3)(a)–(e). NULL = not yet captured.
  site_preservation_status TEXT
    CHECK (site_preservation_status IN (
      'preserved',
      'disturbed_to_assist_injured',          -- s.39(3)(a)
      'disturbed_to_remove_deceased',         -- s.39(3)(b)
      'disturbed_to_make_safe',               -- s.39(3)(c)
      'disturbed_for_police',                 -- s.39(3)(d)
      'disturbed_with_inspector_permission',  -- s.39(3)(e)
      'released_by_inspector'                 -- duty discharged on inspector arrival per s.39(1)
    )),
  site_preservation_notes TEXT,
  inspector_arrived_at TEXT,

  -- s.38(1)/(3)/(4) phone notification — "immediately" / "by the
  -- fastest possible means". Stored as the discharge timestamp.
  phone_notified_at TEXT,
  phone_notified_by INTEGER REFERENCES users(id),
  phone_regulator_office TEXT,
  phone_notes TEXT,

  -- s.38(4)(b) written follow-up — clock starts when the regulator
  -- requests it, not at incident time. written_deadline = the request
  -- timestamp + 48 hours.
  regulator_requested_written_at TEXT,
  written_deadline TEXT,             -- derived; stored for query efficiency
  written_submitted_at TEXT,
  written_submitted_by INTEGER REFERENCES users(id),
  written_reference TEXT,            -- regulator-issued case reference
  written_notes TEXT,

  -- PCBU identity captured for the notification. ABN format validated
  -- by server/services/abn_validator.js. anzsic_code is a 4-digit
  -- string per WI-06 v1 refinement (full code list deferred).
  pcbu_name TEXT,
  pcbu_abn TEXT,
  pcbu_anzsic_code TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),

  -- One row per incident — re-classification on PATCH updates in place
  -- rather than inserting a duplicate.
  UNIQUE (incident_id)
);

CREATE INDEX IF NOT EXISTS idx_safework_nsw_org_event
  ON safework_nsw_notifications (org_id, event_date);

CREATE INDEX IF NOT EXISTS idx_safework_nsw_org_incident
  ON safework_nsw_notifications (org_id, incident_id);

CREATE INDEX IF NOT EXISTS idx_safework_nsw_org_written_deadline
  ON safework_nsw_notifications (org_id, written_deadline, written_submitted_at);

-- ============================================================
-- safework_nsw_serious_injury_types — lookup seeded from s.36
-- ============================================================
-- Verbatim Act labels per s.36(a), s.36(b)(i)–(viii), s.36(c). Plus
-- one tail row for s.36's "any other injury or illness prescribed by
-- the regulations" — future WHS Regulation 2017 (NSW) additions land
-- here as new rows.

CREATE TABLE IF NOT EXISTS safework_nsw_serious_injury_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  section_ref TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO safework_nsw_serious_injury_types
  (key, label, section_ref, display_order) VALUES
  ('s36_a_inpatient_hospital',
   'Immediate treatment as an in-patient in a hospital',
   'WHS Act 2011 (NSW) s.36(a)', 10),
  ('s36_b_i_amputation',
   'Amputation of any part of his or her body',
   'WHS Act 2011 (NSW) s.36(b)(i)', 20),
  ('s36_b_ii_serious_head_injury',
   'A serious head injury',
   'WHS Act 2011 (NSW) s.36(b)(ii)', 30),
  ('s36_b_iii_serious_eye_injury',
   'A serious eye injury',
   'WHS Act 2011 (NSW) s.36(b)(iii)', 40),
  ('s36_b_iv_serious_burn',
   'A serious burn',
   'WHS Act 2011 (NSW) s.36(b)(iv)', 50),
  ('s36_b_v_degloving_or_scalping',
   'The separation of his or her skin from an underlying tissue (such as degloving or scalping)',
   'WHS Act 2011 (NSW) s.36(b)(v)', 60),
  ('s36_b_vi_spinal_injury',
   'A spinal injury',
   'WHS Act 2011 (NSW) s.36(b)(vi)', 70),
  ('s36_b_vii_loss_of_bodily_function',
   'The loss of a bodily function',
   'WHS Act 2011 (NSW) s.36(b)(vii)', 80),
  ('s36_b_viii_serious_lacerations',
   'Serious lacerations',
   'WHS Act 2011 (NSW) s.36(b)(viii)', 90),
  ('s36_c_substance_exposure_48h',
   'Medical treatment within 48 hours of exposure to a substance',
   'WHS Act 2011 (NSW) s.36(c)', 100),
  ('s36_other_prescribed_by_regulations',
   'Other injury or illness prescribed by the regulations',
   'WHS Act 2011 (NSW) s.36 tail', 1000);

-- ============================================================
-- safework_nsw_dangerous_incident_types — lookup seeded from s.37
-- ============================================================

CREATE TABLE IF NOT EXISTS safework_nsw_dangerous_incident_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  section_ref TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO safework_nsw_dangerous_incident_types
  (key, label, section_ref, display_order) VALUES
  ('s37_a_uncontrolled_substance_escape',
   'An uncontrolled escape, spillage or leakage of a substance',
   'WHS Act 2011 (NSW) s.37(a)', 10),
  ('s37_b_uncontrolled_fire_explosion',
   'An uncontrolled implosion, explosion or fire',
   'WHS Act 2011 (NSW) s.37(b)', 20),
  ('s37_c_uncontrolled_gas_or_steam',
   'An uncontrolled escape of gas or steam',
   'WHS Act 2011 (NSW) s.37(c)', 30),
  ('s37_d_uncontrolled_pressurised_substance',
   'An uncontrolled escape of a pressurised substance',
   'WHS Act 2011 (NSW) s.37(d)', 40),
  ('s37_e_electric_shock',
   'Electric shock',
   'WHS Act 2011 (NSW) s.37(e)', 50),
  ('s37_f_fall_from_height',
   'The fall or release from a height of any plant, substance or thing',
   'WHS Act 2011 (NSW) s.37(f)', 60),
  ('s37_g_plant_collapse_or_failure',
   'The collapse, overturning, failure or malfunction of, or damage to, any plant that is required to be authorised for use in accordance with the regulations',
   'WHS Act 2011 (NSW) s.37(g)', 70),
  ('s37_h_structure_collapse',
   'The collapse or partial collapse of a structure',
   'WHS Act 2011 (NSW) s.37(h)', 80),
  ('s37_i_excavation_collapse',
   'The collapse or failure of an excavation or of any shoring supporting an excavation',
   'WHS Act 2011 (NSW) s.37(i)', 90),
  ('s37_j_underground_inrush',
   'The inrush of water, mud or gas in workings, in an underground excavation or tunnel',
   'WHS Act 2011 (NSW) s.37(j)', 100),
  ('s37_k_ventilation_interruption',
   'The interruption of the main system of ventilation in an underground excavation or tunnel',
   'WHS Act 2011 (NSW) s.37(k)', 110),
  ('s37_other_prescribed_by_regulations',
   'Any other event prescribed by the regulations',
   'WHS Act 2011 (NSW) s.37(l)', 1000);
