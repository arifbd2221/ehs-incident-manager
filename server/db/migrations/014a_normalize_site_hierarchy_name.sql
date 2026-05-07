-- 014a_normalize_site_hierarchy_name.sql — fixup for the 012 → 015 rename
-- of site_hierarchy.
--
-- Backstory: backend's site-hierarchy migration originally landed as
-- 012_site_hierarchy.sql in parallel with main's 012_template_cover_image.sql.
-- The dual 012 prefix was confusing, so site_hierarchy was renumbered to 015.
-- For environments that already applied the old filename, the next boot would
-- otherwise see 015_site_hierarchy.sql as a brand-new migration and try to
-- ALTER TABLE ADD parent_id again (failing with "duplicate column name").
--
-- This fixup is idempotent: on fresh DBs the WHERE clause matches no rows,
-- so it's a no-op. Lexical position 014a guarantees it runs AFTER 014 and
-- BEFORE 015 within the same boot, so by the time the runner inspects
-- 015_site_hierarchy.sql, the legacy row has been renamed and 015 is
-- correctly recognized as already applied.

UPDATE _schema_migrations
SET name = '015_site_hierarchy.sql'
WHERE name = '012_site_hierarchy.sql';
