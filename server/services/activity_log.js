// server/services/activity_log.js — shared audit-trail writer for P3-A1.
//
// Routes that mutate compliance-relevant data call writeActivity() to stamp
// one row in activity_log. Hand-rolled INSERT INTO activity_log paths in
// incidents.js / investigations.js / inspections.js / attachments.js /
// templates.js still bypass this helper directly — that's fine; the
// chain-INSERT trigger installed by WI-C catches them too.
//
// Standard call shape (post WI-C 2026-05-11):
//   writeActivity({
//     org_id, entity_type, entity_id, action, description,
//     user_id, metadata,
//     ip, user_agent, field_diffs,   // first-class columns now
//   });
//
// `metadata` is plain object; we JSON-encode it. Pass null/undefined to
// store the default '{}'. For PATCH-style updates the caller can either
// pass `field_diffs: diffFields(before, after, FIELDS)` directly OR
// continue with the legacy shape `metadata: { changes: diffFields(...) }`
// — we extract `.changes` automatically if `field_diffs` isn't passed.
//
// WI-C (2026-05-11): ip_address / user_agent / field_diffs are now
// first-class columns on activity_log (migration 024). writeActivity
// strips the legacy ip_address / user_agent / changes keys from metadata
// before INSERT so the same data never lives in two places. The chain
// trigger (activity_log_hash_chain_insert) autocomputes prev_hash +
// entry_hash on every INSERT.

import db from '../db/connection.js';

// Keys writeActivity moves from metadata into dedicated columns. Adding to
// this list keeps the canonical row shape unambiguous.
const PROMOTED_METADATA_KEYS = ['ip_address', 'user_agent', 'changes', 'field_diffs'];

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
  field_diffs = null,
}) {
  if (!org_id) throw new Error('writeActivity: org_id is required');
  if (!entity_type) throw new Error('writeActivity: entity_type is required');
  if (!action) throw new Error('writeActivity: action is required');
  if (!description) throw new Error('writeActivity: description is required');

  // Legacy fallback: caller may still pass `metadata.changes` instead of
  // `field_diffs`. Lift it out so the dedicated column gets populated.
  // Same for `metadata.ip_address` / `metadata.user_agent`.
  let resolvedIp = ip;
  let resolvedUa = user_agent;
  let resolvedDiffs = field_diffs;
  let cleanMeta = null;

  if (metadata && typeof metadata === 'object') {
    resolvedIp = resolvedIp ?? metadata.ip_address ?? null;
    resolvedUa = resolvedUa ?? metadata.user_agent ?? null;
    resolvedDiffs = resolvedDiffs ?? metadata.changes ?? metadata.field_diffs ?? null;
    cleanMeta = Object.fromEntries(
      Object.entries(metadata).filter(([k]) => !PROMOTED_METADATA_KEYS.includes(k))
    );
  }

  const metaJson = (cleanMeta && Object.keys(cleanMeta).length > 0)
    ? JSON.stringify(cleanMeta)
    : '{}';
  const diffsJson = resolvedDiffs ? JSON.stringify(resolvedDiffs) : null;

  return db.prepare(`
    INSERT INTO activity_log
      (org_id, entity_type, entity_id, action, description, user_id, metadata,
       ip_address, user_agent, field_diffs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    org_id, entity_type, entity_id, action, description, user_id, metaJson,
    resolvedIp, resolvedUa, diffsJson,
  );
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
