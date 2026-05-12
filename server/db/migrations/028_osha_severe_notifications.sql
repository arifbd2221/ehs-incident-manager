-- 027_osha_severe_notifications.sql — WI-07 OSHA 1904.39 severe-injury reporting.
--
-- 29 CFR 1904.39(a) — covered employers must report:
--   (1) A work-related fatality within 8 hours after the death.
--   (2) A work-related in-patient hospitalization, amputation, or loss of an
--       eye within 24 hours after the event.
--
-- 1904.39(b)(6): the fatality window extends to 30 days after the incident;
--   hospitalization / amputation / eye-loss must occur within 24 hours of the
--   incident to be reportable.
-- 1904.39(b)(7): if the employer first learns of the event later, the 8-h /
--   24-h clock starts from when the employer learns. Carry-forward for future
--   work — for v1 the deadline is computed from incident_datetime.
--
-- This table is the per-event record. Categories are exactly the four
-- enumerated by the regulation; no others are accepted. A separate row per
-- incident per category is allowed (one fatality + one amputation on the
-- same incident → two rows, two deadlines).
--
-- Scope discipline (memory feedback_no_structural_changes.md): pure ADD —
-- no ALTER on incidents. The trigger logic lives in JS
-- (server/services/osha_severe.js); this migration is shape-only.

PRAGMA defer_foreign_keys = ON;

-- ============================================================
-- osha_severe_notifications — one row per reportable event per incident
-- ============================================================

CREATE TABLE IF NOT EXISTS osha_severe_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),

  -- 29 CFR 1904.39(a) — the four reportable categories. Anything else is
  -- recordable on the 300 Log but NOT a 1904.39 report. The CHECK keeps the
  -- enum tight; widening requires a regulation change (not a code change).
  category TEXT NOT NULL CHECK (
    category IN ('fatality', 'hospitalization', 'amputation', 'loss_of_eye')
  ),

  -- The 8-hour / 24-hour deadline computed from incident_datetime. Per
  -- 1904.39(b)(7) the clock can also start from "when the employer learned"
  -- but v1 computes from the incident; deferred owner approval to switch.
  deadline_at TEXT NOT NULL,

  -- Phone notification per 1904.39(a)(3)(i)/(ii): Area Office OR
  -- 1-800-321-OSHA. ITA submission (a)(3)(iii) is reserved for WI-02.
  phone_notified_at TEXT,
  phone_notified_by INTEGER REFERENCES users(id),
  osha_area_office TEXT,          -- free text — which office was called
  osha_reference TEXT,            -- OSHA-issued reference / case number if any

  -- Capture the eight required pieces of info per 1904.39(b)(2) as free
  -- text. v1 stores them as a JSON blob inside `notes` keyed by field name;
  -- future migration may split into typed columns if owners want it.
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id),

  UNIQUE (incident_id, category)
);

-- Index for the deadlines aggregator (WI-08): pull all pending notifications
-- for an incident, or scan all pending for an org's countdown page.
CREATE INDEX IF NOT EXISTS idx_osha_severe_org_incident
  ON osha_severe_notifications (org_id, incident_id);

CREATE INDEX IF NOT EXISTS idx_osha_severe_pending
  ON osha_severe_notifications (org_id, phone_notified_at, deadline_at);
