-- 017a_rename_legacy_org_migrations.sql — fixup for backend's 016/017 → 018/019.
--
-- Backstory: backend originally landed P3-O1 with two migrations numbered
-- 016 (org onboarding fields) and 017 (compliance frameworks). In parallel,
-- main shipped its OWN 016 (OSHA compliance fields) and 017 (closure
-- workflow). When backend merged main, the duplicate prefixes were
-- ambiguous — the backend pair was renumbered to 018 / 019 so all four can
-- live side-by-side in lexical order:
--
--   016_osha_compliance_fields.sql       (main)
--   017_closure_workflow.sql             (main)
--   017a_rename_legacy_org_migrations.sql (this file — runs between 017 and 018)
--   018_org_onboarding_fields.sql        (backend, renamed from 016)
--   019_compliance_frameworks.sql        (backend, renamed from 017)
--
-- For dev environments that already applied the old filenames before the
-- merge, _schema_migrations carries the legacy names. Without this fixup,
-- the runner would see 018/019 as new and try to re-apply them, failing
-- with "duplicate column name" or "table activity_log_v4 already exists".
--
-- This rename is idempotent: on a fresh DB the WHERE clauses match no rows,
-- so it's a no-op. Lexical position 017a guarantees it runs AFTER
-- 017_closure_workflow.sql and BEFORE 018_org_onboarding_fields.sql within
-- the same boot. ('a' = 0x61 > '_' = 0x5F, so '017a' sorts after '017_…'.)

UPDATE _schema_migrations
SET name = '018_org_onboarding_fields.sql'
WHERE name = '016_org_onboarding_fields.sql';

UPDATE _schema_migrations
SET name = '019_compliance_frameworks.sql'
WHERE name = '017_compliance_frameworks.sql';
