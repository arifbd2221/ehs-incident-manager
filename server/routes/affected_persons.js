// server/routes/affected_persons.js — WI-A multi-person CRUD endpoints.
//
// Mounted at /api/incidents (alongside the existing incidentRoutes). All
// routes are nested under /:incidentId, scoped to the caller's org via
// the affected_persons service helpers.
//
// Role gating mirrors incidents.js: reads open to any authenticated org
// member, mutations restricted to elevated roles. Soft-delete only —
// hard delete is not exposed (retention discipline per
// docs/compliance-notes.md §1).

import { Router } from 'express';
import db from '../db/connection.js';
import {
  listAffectedPersons,
  getAffectedPerson,
  createAffectedPerson,
  updateAffectedPerson,
  softDeleteAffectedPerson,
  createInjury,
  updateInjury,
  softDeleteInjury,
} from '../services/affected_persons.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

// Guard: confirm the incident exists in the caller's org. Routes that
// then go through the service helpers get free defense-in-depth because
// the service queries also filter by org_id.
function assertIncidentInOrg(incidentId, orgId) {
  return db.prepare('SELECT id FROM incidents WHERE id = ? AND org_id = ?').get(incidentId, orgId);
}

// ----- List -----
router.get('/:incidentId/affected-persons', (req, res) => {
  const incidentId = Number(req.params.incidentId);
  if (!assertIncidentInOrg(incidentId, req.user.org_id)) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  const rows = listAffectedPersons({ orgId: req.user.org_id, incidentId });
  res.json({ affected_persons: rows });
});

// ----- Create person (with optional nested injuries[]) -----
router.post('/:incidentId/affected-persons', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can manage affected persons.' });
  }
  const incidentId = Number(req.params.incidentId);
  if (!assertIncidentInOrg(incidentId, req.user.org_id)) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  try {
    const created = createAffectedPerson({
      orgId: req.user.org_id,
      incidentId,
      userId: req.user.id,
      req,
      payload: req.body || {},
    });
    res.status(201).json(created);
  } catch (e) {
    if (/employment_status|CHECK constraint|UNIQUE/.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
});

// ----- Patch person -----
router.patch('/:incidentId/affected-persons/:apId', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can manage affected persons.' });
  }
  const incidentId = Number(req.params.incidentId);
  const apId = Number(req.params.apId);
  if (!assertIncidentInOrg(incidentId, req.user.org_id)) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  try {
    const updated = updateAffectedPerson({
      orgId: req.user.org_id, incidentId, apId,
      userId: req.user.id, req,
      patch: req.body || {},
    });
    if (!updated) return res.status(404).json({ error: 'Affected person not found' });
    res.json(updated);
  } catch (e) {
    if (/employment_status|CHECK constraint|UNIQUE/.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    throw e;
  }
});

// ----- Soft-delete person (cascades to injuries) -----
router.delete('/:incidentId/affected-persons/:apId', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can manage affected persons.' });
  }
  const incidentId = Number(req.params.incidentId);
  const apId = Number(req.params.apId);
  if (!assertIncidentInOrg(incidentId, req.user.org_id)) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  const out = softDeleteAffectedPerson({
    orgId: req.user.org_id, incidentId, apId,
    userId: req.user.id, req,
  });
  if (!out) return res.status(404).json({ error: 'Affected person not found' });
  res.json(out);
});

// ----- Create injury on a person -----
router.post('/:incidentId/affected-persons/:apId/injuries', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can manage injuries.' });
  }
  const incidentId = Number(req.params.incidentId);
  const apId = Number(req.params.apId);
  if (!assertIncidentInOrg(incidentId, req.user.org_id)) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  // Confirm the AP exists in the org+incident before letting the service
  // process the payload (avoids "created an orphan injury" failure modes).
  if (!getAffectedPerson({ orgId: req.user.org_id, incidentId, apId })) {
    return res.status(404).json({ error: 'Affected person not found' });
  }
  const created = createInjury({
    orgId: req.user.org_id, incidentId, apId,
    userId: req.user.id, req,
    payload: req.body || {},
  });
  res.status(201).json(created);
});

// ----- Patch injury -----
router.patch('/:incidentId/affected-persons/:apId/injuries/:injuryId', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can manage injuries.' });
  }
  const incidentId = Number(req.params.incidentId);
  const apId = Number(req.params.apId);
  const injuryId = Number(req.params.injuryId);
  if (!assertIncidentInOrg(incidentId, req.user.org_id)) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  const out = updateInjury({
    orgId: req.user.org_id, incidentId, apId, injuryId,
    userId: req.user.id, req,
    patch: req.body || {},
  });
  if (!out) return res.status(404).json({ error: 'Injury not found' });
  res.json(out);
});

// ----- Soft-delete injury -----
router.delete('/:incidentId/affected-persons/:apId/injuries/:injuryId', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Only elevated roles can manage injuries.' });
  }
  const incidentId = Number(req.params.incidentId);
  const apId = Number(req.params.apId);
  const injuryId = Number(req.params.injuryId);
  if (!assertIncidentInOrg(incidentId, req.user.org_id)) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  const out = softDeleteInjury({
    orgId: req.user.org_id, incidentId, apId, injuryId,
    userId: req.user.id, req,
  });
  if (!out) return res.status(404).json({ error: 'Injury not found' });
  res.json(out);
});

export default router;
