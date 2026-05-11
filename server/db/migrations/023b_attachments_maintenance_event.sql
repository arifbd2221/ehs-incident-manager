-- 023b_attachments_maintenance_event.sql — P3-OP1 chunk B.
--
-- Extends the attachments.entity_type CHECK to accept 'maintenance_event'
-- so completion events can carry photos / scanned forms / signed checklists.
-- Inspectors' #1 ask on EHS audits is "show me the photo of the completed
-- work" — this closes that proof-of-work gap.
--
-- Same SQLite-rebuild dance as 013/020/023 activity_log widens.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE attachments_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'incident','investigation','capa','maintenance_event'
  )),
  entity_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  description TEXT,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO attachments_v2 SELECT * FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_v2 RENAME TO attachments;

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
