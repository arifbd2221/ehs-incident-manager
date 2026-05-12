// server/services/permissions.js
//
// Shared authorization helpers for entity-level access.
//
// The product-wide rule (set 2026-05-12): if a CAPA, investigation,
// inspection, maintenance schedule, or incident is *assigned* to a user,
// that user — even if they're a worker — can edit it and mark it complete.
// Everyone else is gated by role: elevated (supervisor / ehs_officer /
// ehs_manager / admin) can act on any entity; non-elevated peers cannot.
//
// Use these helpers consistently across route handlers so the rule is one
// edit away from being adjusted (e.g. switching to a strict
// "above-the-assignee's-role" hierarchy later).

export const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

export function isElevated(user) {
  return !!user && ELEVATED_ROLES.has(user.role);
}

// True if `user` is an elevated role OR the assignee on `entity`.
// `field` names the column on the entity that holds the assignee id:
//   incident      → 'assigned_to'
//   investigation → 'lead_investigator'
//   capa          → 'owner_id'
//   inspection    → 'started_by'
//   maintenance   → 'assigned_to'
export function canActOnAssignment(user, entity, field) {
  if (!user || !entity) return false;
  if (isElevated(user)) return true;
  const assigneeId = entity[field];
  return assigneeId != null && Number(assigneeId) === Number(user.id);
}

// Express helper: short-circuits with 403 if the caller is neither the
// assignee nor an elevated role. Returns true on allow, false if the
// response has been sent (so the route can `return` immediately).
//
// Usage:
//   if (!requireAssigneeOrElevated(req, res, capa, 'owner_id', 'CAPA')) return;
export function requireAssigneeOrElevated(req, res, entity, field, entityLabel = 'this item') {
  if (canActOnAssignment(req.user, entity, field)) return true;
  res.status(403).json({
    error: `Only the assignee or an elevated role can edit/complete ${entityLabel}.`,
  });
  return false;
}
