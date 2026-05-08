-- 021_work_hours_contractor.sql — split contractor hours from employee hours.
--
-- ISO 45001 §5.4 + Cority/Enablon parity: every period needs separate
-- employee and contractor work-hour totals. Employee `hours_worked` stays
-- the OSHA TRIR/DART denominator (1904 is employee-only); contractor totals
-- are surfaced as a separate display metric and never folded into TRIR.
--
-- Both new columns are NULLable. NULL means "not tracked for this period",
-- which is the correct shape for orgs that haven't started splitting yet.
-- Sums treat NULL as 0 via COALESCE; UI shows "—" rather than "0".

ALTER TABLE work_hours ADD COLUMN contractor_hours_worked INTEGER;
ALTER TABLE work_hours ADD COLUMN contractor_avg_employees INTEGER;
