// server/services/activity_log.js — shared audit-trail writer for P3-A1.
//
// Routes that mutate compliance-relevant data call writeActivity() to stamp
// one row in activity_log. Existing routes (incidents/capas/investigations/
// inspections/templates/attachments/reports) hand-rolled their own INSERTs —
// we don't refactor those in this pass; the helper exists for the routes
// that previously bypassed the log entirely.
//
// Standard call shape:
//   writeActivity({
//     org_id, entity_type, entity_id, action, description,
//     user_id, metadata,
//   });
//
// `metadata` is plain object; we JSON-encode it. Pass null/undefined to
// store the default '{}'. For PATCH-style updates the caller should pass
// `{ changes: diffFields(before, after, FIELDS) }` so the audit trail
// captures what actually changed, not just "updated".

import db from '../db/connection.js';

export function writeActivity({
  org_id,
  entity_type,
  entity_id = null,
  action,
  description,
  user_id = null,
  metadata = null,
}) {
  if (!org_id) throw new Error('writeActivity: org_id is required');
  if (!entity_type) throw new Error('writeActivity: entity_type is required');
  if (!action) throw new Error('writeActivity: action is required');
  if (!description) throw new Error('writeActivity: description is required');

  const meta = metadata && Object.keys(metadata).length > 0
    ? JSON.stringify(metadata)
    : '{}';

  return db.prepare(`
    INSERT INTO activity_log
      (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(org_id, entity_type, entity_id, action, description, user_id, meta);
}

// Returns { changes: {field: [old, new]} } for fields that differ between
// before and after. Returns null if nothing changed (caller can decide
// whether to skip the log row entirely).
export function diffFields(before, after, fields) {
  const changes = {};
  for (const k of fields) {
    const oldVal = before?.[k] ?? null;
    const newVal = after?.[k] ?? null;
    // Loose equality so "5" == 5 doesn't flag spuriously after type coercion.
    if (String(oldVal) !== String(newVal)) {
      changes[k] = [oldVal, newVal];
    }
  }
  return Object.keys(changes).length > 0 ? { changes } : null;
}
