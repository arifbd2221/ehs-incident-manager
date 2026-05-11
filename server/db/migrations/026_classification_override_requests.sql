-- 026_classification_override_requests.sql — WI-B override approval workflow.
--
-- Purpose. Today any elevated user can flip incidents.osha_recordable /
-- riddor_reportable directly via PATCH /incidents/:id. That's a separation-
-- of-duties gap: the person who proposes the change and the person who
-- approves it are the same. WI-B wraps the change with a per-incident
-- request → approve/reject/withdraw lifecycle.
--
-- The booleans on incidents stay as the source of truth; they only change
-- when an override request is approved. The direct PATCH path stays
-- functional in this migration but the route now emits a console.warn
-- (handled in JS, not here) so we can measure direct-edit usage before
-- deciding whether to forbid it in a follow-up.
--
-- Scope discipline (memory feedback_no_structural_changes.md): pure ADD —
-- no ALTER on incidents / existing enums. One new table + indexes + two
-- triggers enforcing the self-approval guard at the database level.
--
-- Schema fields are taken verbatim from docs/plan-2026-05-11.md Part 2.

PRAGMA defer_foreign_keys = ON;

-- ============================================================
-- classification_override_requests — one row per override lifecycle
-- ============================================================
-- One pending request per (incident_id, field) is enforced by a partial
-- UNIQUE index below. Once decided/withdrawn the row stays for audit;
-- a fresh request can be opened against the same field.

CREATE TABLE IF NOT EXISTS classification_override_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),

  -- jurisdiction is the regulatory regime the field belongs to. Today
  -- only US-OSHA and UK-RIDDOR have direct boolean columns on incidents;
  -- AU-NSW is reserved for WI-06 (notifiable_incidents lives on a
  -- separate table, but the approval workflow shape stays the same).
  jurisdiction TEXT NOT NULL CHECK (
    jurisdiction IN ('US-OSHA', 'UK-RIDDOR', 'AU-NSW')
  ),

  -- `field` names the incidents column the request would flip. We keep
  -- it as free text rather than a CHECK enum so a future jurisdiction
  -- can add fields without a migration; the route validates against an
  -- allowlist before insert.
  field TEXT NOT NULL,

  current_value INTEGER,                -- snapshot at request time
  proposed_value INTEGER NOT NULL,      -- new value if approved

  reason TEXT NOT NULL,                 -- justification, required at creation

  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'withdrawn')
  ),

  requested_by INTEGER NOT NULL REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),

  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  decision_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_override_requests_org_status
  ON classification_override_requests(org_id, status);
CREATE INDEX IF NOT EXISTS idx_override_requests_incident_status
  ON classification_override_requests(incident_id, status);

-- An incident may not have more than one pending request per (field).
-- Decided/withdrawn rows stay; this partial UNIQUE only constrains
-- 'pending'. Mirrors the WI-A `is_primary` partial-UNIQUE pattern.
CREATE UNIQUE INDEX IF NOT EXISTS uq_override_requests_one_pending_per_field
  ON classification_override_requests(incident_id, field)
  WHERE status = 'pending';

-- ============================================================
-- Self-approval guard — DB-level enforcement of requested_by != decided_by
-- ============================================================
-- The route also enforces this in JS, but the DB trigger is the last
-- line of defence (matches the WI-C philosophy: not just convention,
-- construction). RAISE(ABORT, ...) format mirrors the WI-C append-only
-- trigger style.

CREATE TRIGGER IF NOT EXISTS trg_override_requests_no_self_approval_insert
BEFORE INSERT ON classification_override_requests
WHEN NEW.decided_by IS NOT NULL AND NEW.decided_by = NEW.requested_by
BEGIN
  SELECT RAISE(ABORT, 'classification_override_requests: requester cannot also be the decider');
END;

CREATE TRIGGER IF NOT EXISTS trg_override_requests_no_self_approval_update
BEFORE UPDATE ON classification_override_requests
WHEN NEW.decided_by IS NOT NULL AND NEW.decided_by = NEW.requested_by
BEGIN
  SELECT RAISE(ABORT, 'classification_override_requests: requester cannot also be the decider');
END;
