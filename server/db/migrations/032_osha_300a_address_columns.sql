-- 032_osha_300a_address_columns.sql — WI-02 carry-forward: persist
-- city / state / zip on the certified-300A snapshot.
--
-- Background: 29 CFR 1904.41(a) requires the OSHA ITA submission to
-- carry the establishment's address broken into separate City / State
-- / Zip fields. The platform's `sites.address` is a single free-text
-- column today, so the original WI-02 commit (2026-05-12, chunk 12)
-- accepted these three values as query-string parameters at CSV-
-- export time. That worked, but it left two gaps:
--
--   1. The address that ended up in the regulator submission was not
--      frozen at the moment of certification. A subsequent edit to
--      the site or a different user re-running the CSV with different
--      city/state/zip would produce a different submission file.
--   2. The 1904.32(b)(2)(ii) "establishment information" snapshot
--      stored on the cert row was incomplete — it had the freeform
--      `establishment_address` but not the structured fields a
--      regulator would actually read.
--
-- This migration adds city/state/zip columns to the cert snapshot
-- (additive only, nullable for backward compatibility — older snapshots
-- pre-this-migration legitimately have NULL here). The cert route
-- accepts them in the POST body; the CSV exporter reads them from the
-- snapshot rather than query string.
--
-- Owner-authorized as a regulator-citation-driven additive change
-- (memory feedback_no_structural_changes). The CSV gap was open in the
-- chunk-12 carry-forward notes.

ALTER TABLE osha_300a_certified_summaries ADD COLUMN city TEXT;
ALTER TABLE osha_300a_certified_summaries ADD COLUMN state TEXT;
ALTER TABLE osha_300a_certified_summaries ADD COLUMN zip TEXT;
