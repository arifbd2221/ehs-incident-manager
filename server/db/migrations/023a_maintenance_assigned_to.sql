-- 023a_maintenance_assigned_to.sql — per-schedule assignee (P3-OP1 chunk A).
--
-- Industry baseline: every CMMS lets a planner assign a recurring PM to a
-- technician/owner so accountability is clear. v1 ships per-schedule
-- assignment (single owner across the recurring series); per-occurrence
-- reassignment via a work-order pattern is deferred to P3-OP4 territory.

ALTER TABLE asset_maintenance_schedules
  ADD COLUMN assigned_to INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_ams_assigned
  ON asset_maintenance_schedules(assigned_to);
