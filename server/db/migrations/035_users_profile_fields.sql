-- 035_users_profile_fields.sql — add address / phone / dob / gender to users
--
-- The incident wizard already collects these per-person identity fields
-- (they exist on `affected_persons`) because OSHA 1904.29 Form 301, RIDDOR
-- Schedule 2, and NSW WHS s.37 all require them on regulator-bound reports.
-- Storing them on the employee record means the wizard's "pick from
-- employee list" affordance can auto-fill the regulatory fields instead of
-- asking the reporter to retype them every incident.
--
-- `hire_date` already exists on users; this migration only adds the four
-- missing columns. All nullable so the change is purely additive — existing
-- rows stay valid, the FE handles empty values gracefully.
--
-- Citations:
--   - 29 CFR 1904.29(b)(7) — OSHA 301 employee fields (name, address, DOB,
--     gender, date hired)
--   - RIDDOR (Reporting of Injuries, Diseases and Dangerous Occurrences
--     Regulations 2013) Schedule 2 §3 — injured person particulars
--   - WHS Act 2011 (NSW) s.38 + WHS Regulation 2017 (NSW) cl.699 —
--     notifiable incident particulars
--
-- Owner-authorized 2026-05-13 (regulator-citation-driven additive change,
-- memory feedback_no_structural_changes).

ALTER TABLE users ADD COLUMN address TEXT;
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN dob TEXT;
ALTER TABLE users ADD COLUMN gender TEXT;
