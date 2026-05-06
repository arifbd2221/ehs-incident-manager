-- 008_document_folders.sql — Folder system for the document library.
--
-- One parent per folder (nested tree), site-scoped. Root-level documents stay
-- org-wide (folder_id NULL). Folder-scoped documents inherit their folder's
-- site_id implicitly via the join — we don't denormalize site_id onto the doc.
--
-- Cascade behavior:
--   * Deleting a folder cascades to its sub-folders (CASCADE on parent_id).
--   * Documents in a deleted folder are NOT hard-deleted — folder_id flips to
--     NULL (SET NULL) so they re-appear at the root rather than vanishing. The
--     UI shows a confirmation dialog when the folder has contents and may
--     soft-delete the docs (active=0) at the route layer if the caller opts
--     into that — that's policy, not schema.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE IF NOT EXISTS document_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  site_id INTEGER NOT NULL REFERENCES sites(id),
  parent_id INTEGER REFERENCES document_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_doc_folders_parent ON document_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_doc_folders_org ON document_folders(org_id);
CREATE INDEX IF NOT EXISTS idx_doc_folders_site ON document_folders(site_id);

ALTER TABLE documents ADD COLUMN folder_id INTEGER REFERENCES document_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
