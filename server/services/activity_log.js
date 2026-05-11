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
//     ip, user_agent,    // optional; folded into metadata under
//                        // ip_address / user_agent keys for inspector traceability
//   });
//
// `metadata` is plain object; we JSON-encode it. Pass null/undefined to
// store the default '{}'. For PATCH-style updates the caller should pass
// `{ changes: diffFields(before, after, FIELDS) }` so the audit trail
// captures what actually changed, not just "updated".
//
// WI-10 (2026-05-11): `ip` + `user_agent` are accepted as first-class params
// and serialized into the metadata JSON. Regulatory-submission routes
// (OSHA 300A certify, OSHA 300 manual + auto entry, RIDDOR opened, audit
// log export) pass these through. WI-C will promote them to first-class
// columns on activity_log; until then, metadata is the canonical home.

import db from '../db/connection.js';

export function writeActivity({
  org_id,
  entity_type,
  entity_id = null,
  action,
  description,
  user_id = null,
  metadata = null,
  ip = null,
  user_agent = null,
}) {
  if (!org_id) throw new Error('writeActivity: org_id is required');
  if (!entity_type) throw new Error('writeActivity: entity_type is required');
  if (!action) throw new Error('writeActivity: action is required');
  if (!description) throw new Error('writeActivity: description is required');

  const augmented = (metadata && typeof metadata === 'object') ? { ...metadata } : {};
  if (ip) augmented.ip_address = ip;
  if (user_agent) augmented.user_agent = user_agent;

  const meta = Object.keys(augmented).length > 0 ? JSON.stringify(augmented) : '{}';

  return db.prepare(`
    INSERT INTO activity_log
      (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(org_id, entity_type, entity_id, action, description, user_id, meta);
}

// Pull the request's IP + user-agent into a uniform shape for writeActivity.
// Express's `req.ip` honors `trust proxy`; we also fall back to x-forwarded-for
// for deployments where the proxy header is set but trust proxy isn't.
// Returns a {ip, user_agent} object ready to spread into a writeActivity call.
export function auditCtx(req) {
  if (!req) return { ip: null, user_agent: null };
  const ip = req.ip || req.headers?.['x-forwarded-for'] || null;
  const user_agent = req.headers?.['user-agent'] || null;
  return { ip, user_agent };
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
