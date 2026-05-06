-- 012_site_hierarchy.sql — Add parent_id to sites for hierarchical org structure.
--
-- Sites can have a parent site (e.g., Region → Plant → Building). Top-level
-- sites have parent_id = NULL. Same-org-only is enforced at the route layer
-- (cheaper than a CHECK across rows). Cycle prevention also lives at the route
-- layer; SQLite has no native cycle guard for self-referencing FKs.
--
-- Cascade on parent delete is restrictive — deleting a site that still has
-- children is blocked at the route layer (existing behavior already blocks
-- delete when assets/incidents/work_hours/users reference the site). Adding
-- ON DELETE on the FK would silently re-parent or null children without an
-- audit trail, which we don't want.
--
-- Note: numbered 012 (not 011) because origin/main reserves 011 for the
-- dashboard_layout column on users. Skipping 011 keeps the migration runner
-- happy when the merge lands — files apply in lexical order, gaps are fine.

ALTER TABLE sites ADD COLUMN parent_id INTEGER REFERENCES sites(id);
CREATE INDEX IF NOT EXISTS idx_sites_parent ON sites(parent_id);
