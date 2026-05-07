-- 017: Tiered closure workflow — ISO 45001 / OSHA / ANSI Z10 compliant gates
PRAGMA defer_foreign_keys = ON;

CREATE TABLE IF NOT EXISTS closure_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  closure_summary TEXT NOT NULL,
  lessons_learned TEXT,
  gate_snapshot TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_closure_requests_incident ON closure_requests(incident_id);
CREATE INDEX IF NOT EXISTS idx_closure_requests_status ON closure_requests(status);

ALTER TABLE incidents ADD COLUMN closure_type TEXT;
ALTER TABLE incidents ADD COLUMN reopened_at TEXT;
ALTER TABLE incidents ADD COLUMN reopened_by INTEGER REFERENCES users(id);
ALTER TABLE incidents ADD COLUMN reopened_reason TEXT;
ALTER TABLE incidents ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0;

UPDATE incidents SET closure_type = 'auto_closed'
  WHERE status = 'Closed' AND closed_reason LIKE 'Auto-closed%';
