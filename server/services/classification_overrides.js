// server/services/classification_overrides.js — data layer for WI-B
// recordability override approval workflow.
//
// Wraps the four state transitions on classification_override_requests
// (create / approve / reject / withdraw) plus the read accessors used by
// the route and the FE pending-approval queue.
//
// Approval is the only path that mutates the underlying incidents row;
// the routes that previously flipped osha_recordable / riddor_reportable
// directly still work today, but the PATCH handler emits a console.warn
// so we can measure direct-edit usage before forbidding it in a later WI
// (per docs/plan-2026-05-11.md Part 2 — "Existing direct-edit path").
//
// Self-approval (requested_by === decided_by) is forbidden at the DB
// level by triggers installed in migration 026. The route also returns
// 409 before reaching the DB so the error message is friendlier; the
// triggers are the last line of defence.

import db from '../db/connection.js';
import { writeActivity, auditCtx } from './activity_log.js';

// Fields that can be the target of an override request. Adding a new
// jurisdiction's recordability boolean here is enough to extend the
// workflow — no migration needed because the table stores `field` as
// free text and validates against this allowlist.
//
// Each entry maps `field` → { jurisdiction, label, incident_column,
// boolean: true/false }. `boolean: true` means proposed_value is
// stored as 0/1; non-boolean fields would store the raw value (none
// today, but the shape is ready for AU-NSW's notifiable_category once
// WI-06 lands).
export const OVERRIDABLE_FIELDS = {
  osha_recordable: {
    jurisdiction: 'US-OSHA',
    label: 'OSHA recordability',
    incident_column: 'osha_recordable',
    boolean: true,
  },
  riddor_reportable: {
    jurisdiction: 'UK-RIDDOR',
    label: 'RIDDOR reportability',
    incident_column: 'riddor_reportable',
    boolean: true,
  },
};

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
export const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

// ─── Read helpers ────────────────────────────────────────────────────────

export function listForIncident(orgId, incidentId) {
  return db.prepare(`
    SELECT cor.*,
           req_u.name AS requested_by_name,
           dec_u.name AS decided_by_name
    FROM classification_override_requests cor
    LEFT JOIN users req_u ON req_u.id = cor.requested_by
    LEFT JOIN users dec_u ON dec_u.id = cor.decided_by
    WHERE cor.org_id = ? AND cor.incident_id = ?
    ORDER BY cor.requested_at DESC
  `).all(orgId, incidentId);
}

export function listPendingForOrg(orgId, siteId = null) {
  const siteClause = siteId ? ' AND i.site_id = ?' : '';
  const params = siteId ? [orgId, siteId] : [orgId];
  return db.prepare(`
    SELECT cor.*,
           req_u.name AS requested_by_name,
           i.incident_number, i.title AS incident_title
    FROM classification_override_requests cor
    LEFT JOIN users req_u ON req_u.id = cor.requested_by
    LEFT JOIN incidents i ON i.id = cor.incident_id
    WHERE cor.org_id = ? AND cor.status = 'pending'${siteClause}
    ORDER BY cor.requested_at ASC
  `).all(...params);
}

export function getById(orgId, requestId) {
  return db.prepare(`
    SELECT cor.*,
           req_u.name AS requested_by_name,
           dec_u.name AS decided_by_name,
           i.incident_number, i.title AS incident_title
    FROM classification_override_requests cor
    LEFT JOIN users req_u ON req_u.id = cor.requested_by
    LEFT JOIN users dec_u ON dec_u.id = cor.decided_by
    LEFT JOIN incidents i ON i.id = cor.incident_id
    WHERE cor.org_id = ? AND cor.id = ?
  `).get(orgId, requestId);
}

// ─── State transitions ──────────────────────────────────────────────────

// Returns the created row + the audit-log row id. Throws an Error with
// .statusCode set when the caller's input is invalid; routes handle that.
export function createRequest({ orgId, userId, incidentId, field, proposedValue, reason, req }) {
  const meta = OVERRIDABLE_FIELDS[field];
  if (!meta) {
    const e = new Error(`Field '${field}' is not overridable.`);
    e.statusCode = 400;
    throw e;
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 4) {
    const e = new Error('A justification (reason) is required.');
    e.statusCode = 400;
    throw e;
  }

  // Coerce booleans to 0/1 when the field is boolean-typed.
  const proposed = meta.boolean ? (proposedValue ? 1 : 0) : proposedValue;

  // org_id scoping: the incident must belong to the caller's org.
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?')
    .get(incidentId, orgId);
  if (!incident) {
    const e = new Error('Incident not found.');
    e.statusCode = 404;
    throw e;
  }

  const current = incident[meta.incident_column];
  if (Number(current) === Number(proposed)) {
    const e = new Error(`The proposed value matches the current value (${current}).`);
    e.statusCode = 409;
    throw e;
  }

  // One pending per (incident, field) — partial UNIQUE index would
  // raise SQLITE_CONSTRAINT, but check first to return a friendlier 409.
  const existingPending = db.prepare(`
    SELECT id FROM classification_override_requests
    WHERE incident_id = ? AND field = ? AND status = 'pending'
  `).get(incidentId, field);
  if (existingPending) {
    const e = new Error(`A pending request already exists for ${meta.label} on this incident.`);
    e.statusCode = 409;
    throw e;
  }

  const insert = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO classification_override_requests
        (incident_id, org_id, jurisdiction, field, current_value, proposed_value,
         reason, status, requested_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(incidentId, orgId, meta.jurisdiction, field, current ?? null, proposed, reason.trim(), userId);

    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: incidentId,
      action: 'override_requested',
      description: `requested override on ${meta.label}: ${current ?? 'null'} → ${proposed}`,
      user_id: userId,
      metadata: {
        request_id: result.lastInsertRowid,
        jurisdiction: meta.jurisdiction,
        field,
        current_value: current ?? null,
        proposed_value: proposed,
        reason: reason.trim(),
      },
      ...auditCtx(req),
    });

    return result.lastInsertRowid;
  })();

  return getById(orgId, insert);
}

// Approve: load the request → ensure 'pending' + non-self + elevated →
// flip the boolean on the incident in the same transaction → mark
// decided → write two audit rows (override_approved + incident_updated
// with the field_diffs so the audit-log chain captures the actual flip).
export function approveRequest({ orgId, decider, requestId, note, req }) {
  if (!isElevated(decider)) {
    const e = new Error('Only elevated roles can decide override requests.');
    e.statusCode = 403;
    throw e;
  }

  const request = getById(orgId, requestId);
  if (!request) {
    const e = new Error('Override request not found.');
    e.statusCode = 404;
    throw e;
  }
  if (request.status !== 'pending') {
    const e = new Error(`Request is ${request.status}; only pending requests can be approved.`);
    e.statusCode = 409;
    throw e;
  }
  if (request.requested_by === decider.id) {
    const e = new Error('You cannot approve your own override request.');
    e.statusCode = 403;
    throw e;
  }

  const meta = OVERRIDABLE_FIELDS[request.field];
  if (!meta) {
    const e = new Error(`Request's field '${request.field}' is no longer overridable.`);
    e.statusCode = 409;
    throw e;
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE classification_override_requests
      SET status = 'approved', decided_by = ?, decided_at = datetime('now'),
          decision_note = ?
      WHERE id = ?
    `).run(decider.id, note?.trim() || null, requestId);

    const incidentBefore = db.prepare('SELECT * FROM incidents WHERE id = ?').get(request.incident_id);
    const newValue = request.proposed_value;
    db.prepare(`
      UPDATE incidents
      SET ${meta.incident_column} = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newValue, request.incident_id);

    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: request.incident_id,
      action: 'override_approved',
      description: `approved override on ${meta.label}: ${request.current_value ?? 'null'} → ${newValue}`,
      user_id: decider.id,
      metadata: {
        request_id: requestId,
        jurisdiction: meta.jurisdiction,
        field: request.field,
        decision_note: note?.trim() || null,
      },
      field_diffs: {
        changes: { [meta.incident_column]: [incidentBefore[meta.incident_column], newValue] },
      },
      ...auditCtx(req),
    });
  });
  tx();

  return getById(orgId, requestId);
}

export function rejectRequest({ orgId, decider, requestId, note, req }) {
  if (!isElevated(decider)) {
    const e = new Error('Only elevated roles can decide override requests.');
    e.statusCode = 403;
    throw e;
  }
  const request = getById(orgId, requestId);
  if (!request) {
    const e = new Error('Override request not found.');
    e.statusCode = 404;
    throw e;
  }
  if (request.status !== 'pending') {
    const e = new Error(`Request is ${request.status}; only pending requests can be rejected.`);
    e.statusCode = 409;
    throw e;
  }
  if (request.requested_by === decider.id) {
    const e = new Error('You cannot reject your own override request.');
    e.statusCode = 403;
    throw e;
  }

  const meta = OVERRIDABLE_FIELDS[request.field] || { label: request.field, jurisdiction: request.jurisdiction };

  db.transaction(() => {
    db.prepare(`
      UPDATE classification_override_requests
      SET status = 'rejected', decided_by = ?, decided_at = datetime('now'),
          decision_note = ?
      WHERE id = ?
    `).run(decider.id, note?.trim() || null, requestId);

    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: request.incident_id,
      action: 'override_rejected',
      description: `rejected override on ${meta.label}${note ? ` — ${note.trim()}` : ''}`,
      user_id: decider.id,
      metadata: {
        request_id: requestId,
        jurisdiction: meta.jurisdiction,
        field: request.field,
        decision_note: note?.trim() || null,
      },
      ...auditCtx(req),
    });
  })();

  return getById(orgId, requestId);
}

export function withdrawRequest({ orgId, userId, requestId, req }) {
  const request = getById(orgId, requestId);
  if (!request) {
    const e = new Error('Override request not found.');
    e.statusCode = 404;
    throw e;
  }
  if (request.requested_by !== userId) {
    const e = new Error('Only the original requester may withdraw an override request.');
    e.statusCode = 403;
    throw e;
  }
  if (request.status !== 'pending') {
    const e = new Error(`Request is ${request.status}; only pending requests can be withdrawn.`);
    e.statusCode = 409;
    throw e;
  }

  const meta = OVERRIDABLE_FIELDS[request.field] || { label: request.field, jurisdiction: request.jurisdiction };

  db.transaction(() => {
    db.prepare(`
      UPDATE classification_override_requests
      SET status = 'withdrawn', decided_at = datetime('now')
      WHERE id = ?
    `).run(requestId);

    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: request.incident_id,
      action: 'override_withdrawn',
      description: `withdrew override request on ${meta.label}`,
      user_id: userId,
      metadata: {
        request_id: requestId,
        jurisdiction: meta.jurisdiction,
        field: request.field,
      },
      ...auditCtx(req),
    });
  })();

  return getById(orgId, requestId);
}
