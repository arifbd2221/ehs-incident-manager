-- 017_compliance_frameworks.sql — replace single primary_regulator with a
-- multi-select set of report-format frameworks (P3-O1 iteration).
--
-- Real EHS programs run several frameworks at once: a US/UK org files OSHA
-- 300/300A/301 in the US AND RIDDOR F2508 in the UK. The single regulator
-- column from migration 016 forced an artificial pick. This migration adds
-- compliance_frameworks as a JSON-encoded TEXT array.
--
-- primary_regulator stays in the schema (SQLite DROP COLUMN is expensive and
-- this column is brand-new + nullable). The new sign-up flow stops writing
-- to it; existing rows keep their value. Reads come from compliance_frameworks.

ALTER TABLE organizations ADD COLUMN compliance_frameworks TEXT;
