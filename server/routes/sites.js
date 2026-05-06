// server/routes/sites.js — full Site CRUD + hierarchy + enriched detail.
//
// GET endpoints (read) live elsewhere for back-compat:
//   GET /api/auth/sites   (no auth, registration form)
//   GET /api/users/sites  (auth, scoped by org)
// This module owns the write side and the enriched read at /api/sites/:id:
//   GET    /api/sites          — list (auth, scoped by org); each row includes parent_id
//   GET    /api/sites/:id      — detail with parent + ancestors + children + counts + recents
//   POST   /api/sites          — create (elevated only); accepts parent_id
//   PATCH  /api/sites/:id      — update (elevated only); accepts parent_id
//   DELETE /api/sites/:id      — hard-delete (elevated only); blocked when refs exist
//
// Hierarchy rules (enforced at route layer):
//   * parent_id must be in the same org as the site.
//   * A site cannot be its own parent.
//   * No cycles — walking up the ancestor chain must not encounter the site itself.
//   * Depth cap of MAX_LEVELS (5). depth(parent) + 1 + deepest-descendant-of-self <= 5.
//
// Sites still have no `active` column — delete is hard-delete, blocked when any
// incident/asset/work_hours/user/child-site row references the site.

import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const MAX_LEVELS = 5;

// ----- Hierarchy helpers ----------------------------------------------------

// Number of ancestors above a site. Root site → 0.
function ancestorCount(siteId) {
  let count = 0;
  let cur = siteId;
  const seen = new Set();
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const row = db.prepare('SELECT parent_id FROM sites WHERE id = ?').get(cur);
    if (!row || !row.parent_id) break;
    cur = row.parent_id;
    count++;
  }
  return count;
}

// Depth from a site down to its deepest descendant. Leaf → 0.
function descendantDepth(siteId, orgId) {
  let depth = 0;
  let frontier = [siteId];
  const seen = new Set();
  while (frontier.length > 0) {
    const next = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      const kids = db
        .prepare('SELECT id FROM sites WHERE parent_id = ? AND org_id = ?')
        .all(id, orgId);
      for (const k of kids) next.push(k.id);
    }
    if (next.length === 0) break;
    frontier = next;
    depth++;
  }
  return depth;
}

// Returns an error string, or null if valid.
// Pass siteId = null when validating for a brand-new site (no descendants yet).
function validateParent(siteId, parentId, orgId) {
  if (parentId === null || parentId === undefined || parentId === '') return null;
  const pid = Number(parentId);
  if (!Number.isInteger(pid) || pid <= 0) return 'parent_id must be a positive integer.';
  if (siteId && pid === siteId) return 'Site cannot be its own parent.';

  const parent = db
    .prepare('SELECT id FROM sites WHERE id = ? AND org_id = ?')
    .get(pid, orgId);
  if (!parent) return 'Parent site not found in your organization.';

  // Cycle: walk up parent's ancestors; siteId must not appear.
  if (siteId) {
    let cur = pid;
    const seen = new Set();
    while (cur) {
      if (seen.has(cur)) break;
      seen.add(cur);
      if (cur === siteId) return 'Cannot create a circular hierarchy.';
      const row = db.prepare('SELECT parent_id FROM sites WHERE id = ?').get(cur);
      cur = row?.parent_id || null;
    }
  }

  // Depth: parent's ancestorCount + 1 (this site) + this site's subtree depth.
  const parentDepth = ancestorCount(pid);
  const subtree = siteId ? descendantDepth(siteId, orgId) : 0;
  if (parentDepth + 1 + subtree > MAX_LEVELS - 1) {
    return `Hierarchy depth would exceed ${MAX_LEVELS} levels.`;
  }

  return null;
}

// Ancestors root → immediate-parent (excluding self).
function ancestorsOf(siteId) {
  const chain = [];
  let cur = siteId;
  const seen = new Set();
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const row = db.prepare('SELECT parent_id FROM sites WHERE id = ?').get(cur);
    if (!row || !row.parent_id) break;
    const parent = db
      .prepare('SELECT id, name FROM sites WHERE id = ?')
      .get(row.parent_id);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent.id;
  }
  return chain;
}

// ----- Routes ---------------------------------------------------------------

router.get('/', (req, res) => {
  const sites = db
    .prepare('SELECT * FROM sites WHERE org_id = ? ORDER BY name')
    .all(req.user.org_id);
  res.json({ sites });
});

router.get('/:id', (req, res) => {
  const site = db
    .prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const ancestors = ancestorsOf(site.id);
  const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;

  const children = db
    .prepare('SELECT * FROM sites WHERE parent_id = ? AND org_id = ? ORDER BY name')
    .all(site.id, req.user.org_id);

  const counts = {
    assets: db
      .prepare('SELECT COUNT(*) AS c FROM assets WHERE site_id = ? AND active = 1')
      .get(site.id).c,
    open_incidents: db
      .prepare("SELECT COUNT(*) AS c FROM incidents WHERE site_id = ? AND status != 'Closed'")
      .get(site.id).c,
    total_incidents: db
      .prepare('SELECT COUNT(*) AS c FROM incidents WHERE site_id = ?')
      .get(site.id).c,
    users: db
      .prepare('SELECT COUNT(*) AS c FROM users WHERE site_id = ? AND is_active = 1')
      .get(site.id).c,
    children: children.length,
  };

  const recent_incidents = db.prepare(`
    SELECT id, incident_number, title, type, severity, track, status,
           incident_datetime, created_at
    FROM incidents
    WHERE site_id = ?
    ORDER BY incident_datetime DESC
    LIMIT 5
  `).all(site.id);

  const recent_assets = db.prepare(`
    SELECT id, asset_number, name, asset_type, location_description, created_at
    FROM assets
    WHERE site_id = ? AND active = 1
    ORDER BY created_at DESC
    LIMIT 5
  `).all(site.id);

  const work_hours = db.prepare(`
    SELECT COALESCE(SUM(hours_worked), 0) AS total_hours,
           COUNT(*) AS periods
    FROM work_hours
    WHERE site_id = ?
  `).get(site.id);

  res.json({
    ...site,
    parent,
    ancestors,
    children,
    counts,
    recent_incidents,
    recent_assets,
    work_hours_total: work_hours.total_hours,
    work_hours_periods: work_hours.periods,
  });
});

router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create sites.' });
  }

  const {
    name, address, country, naics_code, establishment_id, hse_establishment_id,
    annual_avg_employees, total_hours_worked, timezone, parent_id,
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const parentErr = validateParent(null, parent_id, req.user.org_id);
  if (parentErr) return res.status(400).json({ error: parentErr });

  const result = db.prepare(`
    INSERT INTO sites (
      org_id, name, address, country, naics_code, establishment_id,
      hse_establishment_id, annual_avg_employees, total_hours_worked, timezone, parent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    timezone || 'America/New_York',
    parent_id ? Number(parent_id) : null,
  );

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(site);
});

router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot edit sites.' });
  }

  const site = db
    .prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.body.parent_id !== undefined) {
    const parentErr = validateParent(site.id, req.body.parent_id, req.user.org_id);
    if (parentErr) return res.status(400).json({ error: parentErr });
  }

  const updatable = [
    'name', 'address', 'country', 'naics_code', 'establishment_id',
    'hse_establishment_id', 'annual_avg_employees', 'total_hours_worked',
    'timezone', 'parent_id',
  ];
  const sets = [];
  const params = [];

  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      let val = req.body[key];
      if (key === 'parent_id') {
        val = val === null || val === '' ? null : Number(val);
      }
      params.push(val);
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

  const site = db
    .prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const refs = {
    incidents: db.prepare('SELECT COUNT(*) as c FROM incidents WHERE site_id = ?').get(site.id).c,
    assets: db.prepare('SELECT COUNT(*) as c FROM assets WHERE site_id = ?').get(site.id).c,
    work_hours: db.prepare('SELECT COUNT(*) as c FROM work_hours WHERE site_id = ?').get(site.id).c,
    users: db.prepare('SELECT COUNT(*) as c FROM users WHERE site_id = ?').get(site.id).c,
    children: db.prepare('SELECT COUNT(*) as c FROM sites WHERE parent_id = ?').get(site.id).c,
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
