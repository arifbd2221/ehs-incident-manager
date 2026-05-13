-- 036_investigation_lessons_learned.sql — add lessons_learned to investigations
--
-- ICAM / TapRooT / Bowtie methodologies all distinguish:
--   * findings         — raw observations from the investigation
--   * root_cause       — the underlying causal chain (already on the table
--                        as root_cause_summary, but never surfaced in the
--                        UI before this change)
--   * lessons_learned  — organizational/systemic insights to carry forward
--                        (training gaps, SOP changes, policy updates that
--                        aren't tied to a single CAPA action)
--
-- The platform already had `findings` and `root_cause_summary` columns; this
-- migration adds the third synthesis field. Nullable, additive, no data
-- migration. Owner-authorized 2026-05-13 as a workflow-driven additive
-- change (memory feedback_no_structural_changes — investigation closeout
-- isn't regulator-specific but is a documented gap in the lifecycle that
-- the user requested fill).

ALTER TABLE investigations ADD COLUMN lessons_learned TEXT;
