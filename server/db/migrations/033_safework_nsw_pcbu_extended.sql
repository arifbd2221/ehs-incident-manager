-- 033_safework_nsw_pcbu_extended.sql — WI-06 carry-forward (chunk 11
-- TODOs): extend PCBU capture on safework_nsw_notifications with the
-- three fields the original spec named but the v1 commit deferred —
-- trading name, address, worker count. Also scaffolds (but does NOT
-- seed) an anzsic_codes lookup table.
--
-- Background: the chunk-11 PCBU section captured only `pcbu_name`,
-- `pcbu_abn`, and `pcbu_anzsic_code`. The original WI-06 spec named
-- trading_name (the business-trading name distinct from the registered
-- entity), address, and worker_count as required for the SafeWork NSW
-- Notifiable Incident form. Adding all three now closes the gap so the
-- record-copy PDF can render the full notifying-entity block.
--
-- ANZSIC code list: the owner-supplied source PDF
-- `docs/regulatory-sources/safework-nsw/anzsic-2006-rev2.pdf` is the
-- *Revision 2.0 update* document (ABS Catalogue 1292.0). It enumerates
-- deltas (a handful of class additions / removals / re-allocations),
-- NOT the full ~700-class list. Per memory feedback_regulatory_truth:
-- regulatory code lists MUST come from a user-supplied authoritative
-- source — hallucinating 700+ ANZSIC entries from training data is
-- exactly the failure mode that rule was written to prevent.
--
-- Resolution: this migration scaffolds the lookup table so a future
-- chunk can populate it from an authoritative source (the full ABS
-- 1292.0 publication, or a SafeWork-NSW-provided CSV). Until then, the
-- table stays empty and `pcbu_anzsic_code` continues to gate purely on
-- the 4-digit format regex (current chunk-11 behaviour). When seed
-- data lands, the route can shift to validating against the lookup
-- table without any further schema change.

ALTER TABLE safework_nsw_notifications ADD COLUMN pcbu_trading_name TEXT;
ALTER TABLE safework_nsw_notifications ADD COLUMN pcbu_address TEXT;
ALTER TABLE safework_nsw_notifications ADD COLUMN pcbu_worker_count INTEGER
  CHECK (pcbu_worker_count IS NULL OR pcbu_worker_count >= 0);

CREATE TABLE IF NOT EXISTS anzsic_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,        -- 4-digit class code, e.g. '0151'
  label TEXT NOT NULL,              -- class title verbatim from ABS publication
  division TEXT,                    -- single-letter division (A..S)
  source TEXT,                      -- citation, e.g. 'ABS 1292.0 (Revision 2.0)'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_anzsic_codes_division ON anzsic_codes(division);
