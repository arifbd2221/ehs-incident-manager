-- 023c_calibration_event_fields.sql — P3-OP1 chunk D.
--
-- Calibration is structurally different from preventive/inspection: the
-- proof-of-work is "what did the instrument read against the standard,
-- before adjustment and after?" plus the certificate number from the
-- calibrating lab. Without these, regulated pharma (FDA 21 CFR Part 211)
-- and ISO/IEC 17025 testing-lab buyers cannot use the system.
--
-- All fields are nullable — completion events of non-calibration schedules
-- leave them NULL. The FE renders them only when schedule_type='calibration'.

ALTER TABLE asset_maintenance_events ADD COLUMN calibration_before TEXT;
ALTER TABLE asset_maintenance_events ADD COLUMN calibration_after TEXT;
ALTER TABLE asset_maintenance_events ADD COLUMN calibration_unit TEXT;
ALTER TABLE asset_maintenance_events ADD COLUMN calibration_tolerance TEXT;
ALTER TABLE asset_maintenance_events ADD COLUMN calibration_reference TEXT;
ALTER TABLE asset_maintenance_events ADD COLUMN calibration_certificate TEXT;
