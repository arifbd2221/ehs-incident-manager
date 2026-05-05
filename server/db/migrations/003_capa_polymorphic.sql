-- Migration 003: CAPA polymorphic source
--
-- Adds source_type and incident_id columns to capas, relaxes investigation_id
-- NOT NULL, and adds a CHECK constraint that exactly one of (investigation_id,
-- incident_id) is set per source_type (or both NULL for proactive CAPAs).
-- Re-attaches the Phase 1 owner != verifier triggers against the new table.
--
-- All existing CAPAs are backfilled to source_type='investigation' since
-- they were created via the original assign-capa flow.

PRAGMA defer_foreign_keys = ON;

-- ----- Step 1: build the new table with relaxed investigation_id + source_type -----
CREATE TABLE capas_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capa_number TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'investigation' CHECK(source_type IN ('investigation','incident','proactive')),
  investigation_id INTEGER REFERENCES investigations(id),
  incident_id INTEGER REFERENCES incidents(id),
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('corrective','preventive')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  category TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  verifier_id INTEGER NOT NULL REFERENCES users(id),
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','progress','verify','closed')),
  progress INTEGER DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id),
  completion_notes TEXT,
  verified_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  verification_result TEXT,
  verification_notes TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  -- Polymorphic source: exactly one of investigation_id / incident_id matches source_type,
  -- both NULL for proactive.
  CHECK (
    (source_type = 'investigation' AND investigation_id IS NOT NULL AND incident_id IS NULL)
    OR (source_type = 'incident' AND incident_id IS NOT NULL AND investigation_id IS NULL)
    OR (source_type = 'proactive' AND investigation_id IS NULL AND incident_id IS NULL)
  )
);

-- ----- Step 2: copy existing CAPAs as source_type='investigation' -----
INSERT INTO capas_new (
  id, capa_number, source_type, investigation_id, incident_id, org_id,
  title, description, type, priority, category,
  owner_id, verifier_id, due_date, status, progress,
  completed_at, completed_by, completion_notes,
  verified_at, verified_by, verification_result, verification_notes,
  closed_at, created_at, updated_at
)
SELECT
  id, capa_number, 'investigation', investigation_id, NULL, org_id,
  title, description, type, priority, category,
  owner_id, verifier_id, due_date, status, progress,
  completed_at, completed_by, completion_notes,
  verified_at, verified_by, verification_result, verification_notes,
  closed_at, created_at, updated_at
FROM capas;

-- ----- Step 3: drop old, rename new -----
DROP TABLE capas;
ALTER TABLE capas_new RENAME TO capas;

-- ----- Step 4: recreate indexes from the original schema -----
CREATE INDEX IF NOT EXISTS idx_capas_investigation ON capas(investigation_id);
CREATE INDEX IF NOT EXISTS idx_capas_status ON capas(status);
CREATE INDEX IF NOT EXISTS idx_capas_owner ON capas(owner_id);

-- New Phase 2 indexes:
CREATE INDEX IF NOT EXISTS idx_capas_source_type ON capas(source_type);
CREATE INDEX IF NOT EXISTS idx_capas_incident ON capas(incident_id);

-- ----- Step 5: re-attach Phase 1 owner != verifier triggers -----
-- (These were attached to the old capas table; the rebuild dropped them.)
CREATE TRIGGER IF NOT EXISTS capa_owner_verifier_distinct_insert
BEFORE INSERT ON capas
WHEN NEW.owner_id = NEW.verifier_id
BEGIN
  SELECT RAISE(ABORT, 'CAPA owner and verifier must be different people');
END;

CREATE TRIGGER IF NOT EXISTS capa_owner_verifier_distinct_update
BEFORE UPDATE ON capas
WHEN NEW.owner_id = NEW.verifier_id
BEGIN
  SELECT RAISE(ABORT, 'CAPA owner and verifier must be different people');
END;
