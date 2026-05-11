-- 022_document_versions.sql — P3-OB3 document versioning.
--
-- Industry standard for ISO 9001 + OSHA records management is an immutable
-- version history. Inspectors during 1903 visits routinely ask "what did
-- this SDS / SOP / certificate say on date X" — must be answerable.
--
-- Each document_versions row is immutable. The documents table keeps
-- name/document_type/document_number stable; its file_url/stored_filename/
-- mime_type/size_bytes fields remain as a fast-path mirror of the LATEST
-- version so existing reads (GET /documents/:id/download, list views,
-- preview) keep working untouched. Superseding bumps both the mirror on
-- documents AND inserts a new immutable row here.
--
-- Old files are NEVER overwritten or deleted on disk — each version owns
-- its own UUID-named stored_filename from multer.

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  version_number INTEGER NOT NULL,    -- 1, 2, 3, … per document
  file_url TEXT NOT NULL,
  stored_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  notes TEXT,                          -- "Fixed typo on cover page", etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc
  ON document_versions(document_id, version_number DESC);

-- Backfill v1 from every existing document so reads always resolve to
-- ≥1 version. Uses each document's own created_at so the timeline reads
-- naturally ("v1 — uploaded 3 weeks ago", not "v1 — uploaded 0s ago").
INSERT INTO document_versions
  (document_id, version_number, file_url, stored_filename,
   mime_type, size_bytes, uploaded_by, created_at)
SELECT id, 1, file_url, stored_filename, mime_type, size_bytes,
       uploaded_by, created_at
FROM documents;
