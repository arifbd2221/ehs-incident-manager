-- 029_osha_300a_certified_summaries.sql — WI-02 OSHA 300A annual summary
-- snapshot table. Owner-approved 2026-05-12 (gap-decision 1).
--
-- Background: regulatory_certifications (migration 001) already records
-- WHO certified WHEN, but it does not freeze WHAT they certified. Per
-- 29 CFR 1904.32(b)(2)(i), a certified annual summary must capture the
-- column totals from the OSHA 300 Log at the moment of certification.
-- The 300 Log itself stays mutable (1904.33(b)(1) — five-year update
-- window for newly discovered records or classification changes), so
-- the cert needs a frozen snapshot of the totals it was signed against.
--
-- Per 1904.32(b)(5) the POSTED annual summary must not be altered after
-- posting. This table is the artifact that satisfies that requirement.
-- The 300A PDF renders from this snapshot when one exists; the live
-- aggregation is only used to render a DRAFT view for in-progress
-- summaries that have not been certified yet.
--
-- Per 1904.41(a)(1)/(2) electronic submission, the ITA CSV reads from
-- this same snapshot. Once signed, the CSV is reproducible byte-for-
-- byte regardless of subsequent 300 Log edits.
--
-- Scope discipline (memory feedback_no_structural_changes.md): pure
-- additive — no ALTER on regulatory_certifications or other existing
-- tables. The 1:1 link to regulatory_certifications is via FK +
-- UNIQUE.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE IF NOT EXISTS osha_300a_certified_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 1:1 to the cert row in regulatory_certifications. UNIQUE means a
  -- given cert can have at most one snapshot. ON DELETE CASCADE NOT
  -- declared — the WI-C append-only triggers + the absence of cert-
  -- delete endpoints mean this row's parent is effectively immutable.
  certification_id INTEGER NOT NULL UNIQUE REFERENCES regulatory_certifications(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  period_year INTEGER NOT NULL,

  -- Establishment-info snapshot per 1904.32(b)(2)(ii). Captured AT CERT
  -- TIME so renaming the site or moving it later doesn't retroactively
  -- alter the certified document.
  establishment_name TEXT NOT NULL,           -- sites.name at cert time
  establishment_address TEXT,                 -- sites.address at cert time
  naics_code TEXT,                            -- sites.naics_code at cert time
  ein TEXT,                                   -- 1904.41(a)(4); nullable in v1 (sites has no EIN column today)
  annual_avg_employees INTEGER NOT NULL,      -- from work_hours / sites at cert time
  total_hours_worked INTEGER NOT NULL,        -- from work_hours at cert time

  -- Column totals per 1904.32(b)(2)(i) "Total the columns on the OSHA
  -- 300 Log". One column per Form 300A field (G, H, I, J, K, L, M1..M6).
  total_deaths INTEGER NOT NULL DEFAULT 0,                 -- G
  total_days_away_cases INTEGER NOT NULL DEFAULT 0,        -- H
  total_job_transfer_cases INTEGER NOT NULL DEFAULT 0,     -- I
  total_other_recordable_cases INTEGER NOT NULL DEFAULT 0, -- J
  total_days_away INTEGER NOT NULL DEFAULT 0,              -- K
  total_days_restricted INTEGER NOT NULL DEFAULT 0,        -- L
  total_injuries INTEGER NOT NULL DEFAULT 0,               -- M1
  total_skin_disorders INTEGER NOT NULL DEFAULT 0,         -- M2
  total_respiratory INTEGER NOT NULL DEFAULT 0,            -- M3
  total_poisonings INTEGER NOT NULL DEFAULT 0,             -- M4
  total_hearing_loss INTEGER NOT NULL DEFAULT 0,           -- M5
  total_other_illnesses INTEGER NOT NULL DEFAULT 0,        -- M6

  -- Chain-of-custody: which exact 300 Log rows were folded into the
  -- totals above? Inspectors can later reconcile the snapshot against
  -- the current 300 Log to identify any post-cert log edits.
  case_ids_snapshot TEXT NOT NULL DEFAULT '[]',

  -- 1904.32(b)(4) certifier-title fields. The key is the internal
  -- allowlist value; the label is the verbatim Act wording (same dual-
  -- storage pattern as the WI-06 NSW lookup tables).
  certifier_title_key TEXT NOT NULL CHECK (certifier_title_key IN (
    'owner',                                    -- 1904.32(b)(4)(i)
    'corporate_officer',                        -- 1904.32(b)(4)(ii)
    'highest_ranking_official',                 -- 1904.32(b)(4)(iii)
    'immediate_supervisor_of_highest_ranking'   -- 1904.32(b)(4)(iv)
  )),
  certifier_title_label TEXT NOT NULL,          -- verbatim Act wording

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (site_id, period_year)                 -- one snapshot per estab/CY
);

CREATE INDEX IF NOT EXISTS idx_osha_300a_snap_org_site_year
  ON osha_300a_certified_summaries (org_id, site_id, period_year);

-- Belt-and-braces: prevent two regulatory_certifications rows for the
-- same establishment/year/type. The existing certify route returns 409
-- in JS, but the partial UNIQUE catches concurrent-request races. Per
-- the WI-02 spec, 'osha_300a' is the only type we constrain — other
-- cert types (riddor_f2508, osha_fatality_report, osha_24hr_report)
-- may legitimately have multiple rows per incident (resubmissions).
CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_cert_300a_unique
  ON regulatory_certifications (site_id, period_year)
  WHERE type = 'osha_300a';
