// server/routes/override_requests.js — WI-B recordability override
// approval workflow.
//
// Two routers exported so the URL space is clean:
//
//   incidentScopedRouter, mounted at /api/incidents
//     POST   /:id/override-requests          create a new request
//     GET    /:id/override-requests          list requests on this incident
//
//   globalRouter, mounted at /api/override-requests
//     GET    /?status=pending                org-wide pending queue
//     GET    /:rid                           single request detail
//     POST   /:rid/approve                   elevated, not requester
//     POST   /:rid/reject                    elevated, not requester
//     POST   /:rid/withdraw                  requester only
//
// Splitting avoids the ambiguity that would arise from mounting one
// Router at two prefixes (e.g. `GET /:rid` colliding with the incident
// list).
//
// Data layer + role checks live in server/services/classification_overrides.js.

import { Router } from 'express';
import {
  OVERRIDABLE_FIELDS,
  isElevated,
  listForIncident,
  listPendingForOrg,
  getById,
  createRequest,
  approveRequest,
  rejectRequest,
  withdrawRequest,
} from '../services/classification_overrides.js';

// ─── Incident-scoped router (mounted at /api/incidents) ──────────────────

export const incidentScopedRouter = Router();

// POST /incidents/:id/override-requests
// Body: { field, proposed_value, reason }
// Any authenticated user in the org can create a request.
incidentScopedRouter.post('/:id/override-requests', (req, res) => {
  const incidentId = Number(req.params.id);
  if (!Number.isFinite(incidentId)) return res.status(400).json({ error: 'Invalid incident id.' });

  try {
    const created = createRequest({
      orgId: req.user.org_id,
      userId: req.user.id,
      incidentId,
      field: req.body?.field,
      proposedValue: req.body?.proposed_value,
      reason: req.body?.reason,
      req,
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

// GET /incidents/:id/override-requests
// Returns all requests (pending + decided + withdrawn) for this incident.
// Org-scoped at the service layer; cross-tenant calls naturally return [].
incidentScopedRouter.get('/:id/override-requests', (req, res) => {
  const incidentId = Number(req.params.id);
  if (!Number.isFinite(incidentId)) return res.status(400).json({ error: 'Invalid incident id.' });
  const rows = listForIncident(req.user.org_id, incidentId);
  res.json({ requests: rows, overridable_fields: Object.keys(OVERRIDABLE_FIELDS) });
});

// ─── Global router (mounted at /api/override-requests) ───────────────────

export const globalRouter = Router();

// GET /override-requests?status=pending
// Only the global pending queue is exposed at this endpoint; for the
// decided/withdrawn audit trail use the per-incident GET above.
globalRouter.get('/', (req, res) => {
  const status = (req.query.status || 'pending').toLowerCase();
  if (status !== 'pending') {
    return res.status(400).json({ error: "Only ?status=pending is supported at this endpoint; use the per-incident GET for decided requests." });
  }
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can view the global approval queue.' });
  }
  const rows = listPendingForOrg(req.user.org_id);
  res.json({ requests: rows });
});

globalRouter.get('/:rid', (req, res) => {
  const rid = Number(req.params.rid);
  if (!Number.isFinite(rid)) return res.status(400).json({ error: 'Invalid request id.' });
  const row = getById(req.user.org_id, rid);
  if (!row) return res.status(404).json({ error: 'Override request not found.' });
  res.json(row);
});

globalRouter.post('/:rid/approve', (req, res) => {
  const rid = Number(req.params.rid);
  if (!Number.isFinite(rid)) return res.status(400).json({ error: 'Invalid request id.' });
  try {
    const updated = approveRequest({
      orgId: req.user.org_id,
      decider: req.user,
      requestId: rid,
      note: req.body?.decision_note,
      req,
    });
    res.json(updated);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

globalRouter.post('/:rid/reject', (req, res) => {
  const rid = Number(req.params.rid);
  if (!Number.isFinite(rid)) return res.status(400).json({ error: 'Invalid request id.' });
  try {
    const updated = rejectRequest({
      orgId: req.user.org_id,
      decider: req.user,
      requestId: rid,
      note: req.body?.decision_note,
      req,
    });
    res.json(updated);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

globalRouter.post('/:rid/withdraw', (req, res) => {
  const rid = Number(req.params.rid);
  if (!Number.isFinite(rid)) return res.status(400).json({ error: 'Invalid request id.' });
  try {
    const updated = withdrawRequest({
      orgId: req.user.org_id,
      userId: req.user.id,
      requestId: rid,
      req,
    });
    res.json(updated);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});
