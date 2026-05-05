// server/routes/sites.js — full Site CRUD.
//
// GET endpoints (read) live elsewhere for back-compat:
//   GET /api/auth/sites   (no auth, registration form)
//   GET /api/users/sites  (auth, scoped by org)
// This module adds the write side under /api/sites:
//   GET    /api/sites          — list (auth, scoped by org)
//   GET    /api/sites/:id      — detail (auth, scoped by org)
//   POST   /api/sites          — create (elevated roles only)
//   PATCH  /api/sites/:id      — update (elevated roles only)
//   DELETE /api/sites/:id      — soft-delete (elevated roles only)
//
// Sites have no `active` column in the existing schema, so soft-delete is
// modeled by appending " [archived]" to the name and returning 410-Gone-style
// behavior — actually no, simpler: add nothing now, hard-delete blocked
// where any incident/asset/work_hours row references the site. If the user
// wants soft-delete later, we can add an `active` column in a follow-up.

import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

router.get('/', (req, res) => {
  const sites = db.prepare(
    'SELECT * FROM sites WHERE org_id = ? ORDER BY name'
  ).all(req.user.org_id);
  res.json({ sites });
});

router.get('/:id', (req, res) => {
  const site = db.prepare(
    'SELECT * FROM sites WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  res.json(site);
});

router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create sites.' });
  }

  const { name, address, country, naics_code, establishment_id, hse_establishment_id, annual_avg_employees, total_hours_worked, timezone } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const result = db.prepare(`
    INSERT INTO sites (org_id, name, address, country, naics_code, establishment_id, hse_establishment_id, annual_avg_employees, total_hours_worked, timezone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.org_id,
    name.trim(),
    address || null,
    country || 'US',
    naics_code || null,
    establishment_id || null,
    hse_establishment_id || null,
    annual_avg_employees ?? 0,
    total_hours_worked ?? 0,
    timezone || 'America/New_York'
  );

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(site);
});

router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot edit sites.' });
  }

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const updatable = ['name', 'address', 'country', 'naics_code', 'establishment_id', 'hse_establishment_id', 'annual_avg_employees', 'total_hours_worked', 'timezone'];
  const sets = [];
  const params = [];

  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(site.id);
  db.prepare(`UPDATE sites SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot delete sites.' });
  }

  const site = db.prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  // Block hard-delete if anything references the site.
  const refs = {
    incidents: db.prepare('SELECT COUNT(*) as c FROM incidents WHERE site_id = ?').get(site.id).c,
    assets: db.prepare('SELECT COUNT(*) as c FROM assets WHERE site_id = ?').get(site.id).c,
    work_hours: db.prepare('SELECT COUNT(*) as c FROM work_hours WHERE site_id = ?').get(site.id).c,
    users: db.prepare('SELECT COUNT(*) as c FROM users WHERE site_id = ?').get(site.id).c,
  };
  const total = Object.values(refs).reduce((a, b) => a + b, 0);
  if (total > 0) {
    return res.status(409).json({
      error: 'Site has dependent records and cannot be deleted.',
      references: refs,
    });
  }

  db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);
  res.json({ success: true });
});

export default router;
