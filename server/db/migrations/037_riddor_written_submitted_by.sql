-- 037_riddor_written_submitted_by.sql — track WHO filed the F2508
--
-- riddor_reports already has phone_notified_at + phone_notified_by, but
-- the written-submission side only has written_submitted_at — no record
-- of which user actually filed the F2508 with HSE. RIDDOR Reg.12 ("the
-- responsible person must keep a record of any reportable incident")
-- treats the filer as audit-relevant, and the SafeWork NSW path already
-- captures this on its written_submitted_by column.
--
-- Additive, nullable, no data migration. Owner-authorized 2026-05-13.

ALTER TABLE riddor_reports ADD COLUMN written_submitted_by INTEGER;
