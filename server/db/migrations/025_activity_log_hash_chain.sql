-- 024_activity_log_hash_chain.sql — WI-C tamper-evident audit log.
--
-- Adds five new columns to activity_log:
--   prev_hash   — entry_hash of the previous row in this org's chain (NULL for the first)
--   entry_hash  — SHA-256(canonical_serialize(row, prev_hash))
--   ip_address  — actor's IP at the time of the action (promoted from metadata; WI-10 interim)
--   user_agent  — actor's user-agent string (same)
--   field_diffs — JSON; structured diff for UPDATE-equivalent actions (promoted from metadata.changes)
--
-- This migration ONLY performs the additive schema change + the column
-- backfill from existing metadata JSON. The hash-chain backfill and the
-- four append-only/chain triggers are installed by
-- server/db/activity_log_chain.js → hydrateActivityLogChain(db), which runs
-- in server/db/connection.js immediately after runMigrations. The split is
-- forced by two facts:
--   (1) SQLite has no native SHA-256, so the chain backfill needs a JS-
--       registered user function (sha256_hex) — registered before
--       runMigrations.
--   (2) Per-row "use previous row's value to compute mine" iteration in
--       pure SQL UPDATE is brittle; JS row-by-row is simpler and matches
--       the runtime trigger's logic 1:1.
--
-- Idempotency: this migration is gated by _schema_migrations, so it runs
-- exactly once. The JS hydration step is itself idempotent and runs on
-- every boot — re-runs against a fully-hydrated DB are no-ops because
-- entry_hash IS NOT NULL.
--
-- No structural-changes-directive note: WI-C is the SINGLE owner-authorized
-- ALTER TABLE on an existing table in the current chunk plan. The
-- directive otherwise still stands — additive new tables only.

ALTER TABLE activity_log ADD COLUMN prev_hash TEXT;
ALTER TABLE activity_log ADD COLUMN entry_hash TEXT;
ALTER TABLE activity_log ADD COLUMN ip_address TEXT;
ALTER TABLE activity_log ADD COLUMN user_agent TEXT;
ALTER TABLE activity_log ADD COLUMN field_diffs TEXT;

-- ----- Backfill IP / UA / diffs from metadata (WI-10 interim home) -----
-- WI-10 (committed 67b8c9a) stuffed ip_address + user_agent into
-- metadata JSON because activity_log lacked dedicated columns. Now that
-- the columns exist, lift the values into them so the canonical row
-- shape is unambiguous going forward. After this step every row's
-- canonical_serialize result must be stable.

UPDATE activity_log SET ip_address = json_extract(metadata, '$.ip_address')
  WHERE metadata IS NOT NULL
    AND json_extract(metadata, '$.ip_address') IS NOT NULL;

UPDATE activity_log SET user_agent = json_extract(metadata, '$.user_agent')
  WHERE metadata IS NOT NULL
    AND json_extract(metadata, '$.user_agent') IS NOT NULL;

UPDATE activity_log SET field_diffs = json_extract(metadata, '$.changes')
  WHERE metadata IS NOT NULL
    AND json_extract(metadata, '$.changes') IS NOT NULL;

-- ----- Strip the migrated keys from metadata -----
-- Same data must not live in two places. json_remove on an absent key
-- is a safe no-op so this works for rows that never had these keys.

UPDATE activity_log SET metadata = json_remove(
    COALESCE(metadata, '{}'),
    '$.ip_address', '$.user_agent', '$.changes'
  )
  WHERE metadata IS NOT NULL AND metadata != '{}';
