-- 024a_rename_legacy_backend_migrations.sql — fixup for backend's
-- 024–029 → 025–030 renumber after the main-branch merge.
--
-- Backstory: backend shipped six migrations between 2026-05-11 and
-- 2026-05-12 numbered 024–029 (activity_log hash chain, affected_persons,
-- override requests, OSHA severe notifications, SafeWork NSW, OSHA 300A
-- certified summaries). In parallel, main shipped its OWN 024 — the Risk
-- Module migration (`024_risk_module.sql`). When backend merged main, the
-- duplicate 024 prefix was ambiguous — the backend chain was renumbered
-- up by one slot to 025–030 so all seven can live side-by-side in
-- lexical order:
--
--   023c_calibration_event_fields.sql        (main)
--   024_risk_module.sql                      (main)
--   024a_rename_legacy_backend_migrations.sql (this file — runs
--                                              AFTER 024 and BEFORE 025)
--   025_activity_log_hash_chain.sql          (backend, was 024)
--   026_affected_persons_injuries.sql        (backend, was 025)
--   027_classification_override_requests.sql (backend, was 026)
--   028_osha_severe_notifications.sql        (backend, was 027)
--   029_safework_nsw.sql                     (backend, was 028)
--   030_osha_300a_certified_summaries.sql    (backend, was 029)
--
-- For dev environments that already applied the old filenames before the
-- merge, `_schema_migrations` carries the legacy names. Without this
-- fixup the runner would see 025–030 as new and try to re-apply them,
-- failing with "table activity_log_v6 already exists" /
-- "duplicate column name" / "table safework_nsw_notifications already
-- exists" etc. This rename is idempotent: on a fresh DB the WHERE
-- clauses match no rows, so it's a no-op.
--
-- Lexical position 024a guarantees this runs AFTER 024_risk_module.sql
-- and BEFORE 025_activity_log_hash_chain.sql within the same boot
-- ('a' = 0x61 > '_' = 0x5F, so '024a' sorts after '024_…'). The pattern
-- mirrors 014a_normalize_site_hierarchy_name.sql and
-- 017a_rename_legacy_org_migrations.sql from prior merges.

UPDATE _schema_migrations
SET name = '025_activity_log_hash_chain.sql'
WHERE name = '024_activity_log_hash_chain.sql';

UPDATE _schema_migrations
SET name = '026_affected_persons_injuries.sql'
WHERE name = '025_affected_persons_injuries.sql';

UPDATE _schema_migrations
SET name = '027_classification_override_requests.sql'
WHERE name = '026_classification_override_requests.sql';

UPDATE _schema_migrations
SET name = '028_osha_severe_notifications.sql'
WHERE name = '027_osha_severe_notifications.sql';

UPDATE _schema_migrations
SET name = '029_safework_nsw.sql'
WHERE name = '028_safework_nsw.sql';

UPDATE _schema_migrations
SET name = '030_osha_300a_certified_summaries.sql'
WHERE name = '029_osha_300a_certified_summaries.sql';
