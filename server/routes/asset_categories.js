// server/routes/asset_categories.js — per-org asset categories.
//
// GET    /api/asset-categories          list (auth, scoped by org, active only by default)
// POST   /api/asset-categories          create (elevated only)
// PATCH  /api/asset-categories/:id      update (elevated only)
// DELETE /api/asset-categories/:id      soft-delete (elevated only)

import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

router.get('/', (req, res) => {
  const { include_inactive } = req.query;
  const where = ['org_id = ?'];
  const params = [req.user.org_id];
  if (!include_inactive) { where.push('active = 1'); }
  const categories = db.prepare(`
    SELECT * FROM asset_categories WHERE ${where.join(' AND ')} ORDER BY name
  `).all(...params);
  res.json({ categories });
});

router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create categories.' });
  }
  const { name, icon, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const trimmed = name.trim();
  const existing = db.prepare('SELECT id, active FROM asset_categories WHERE org_id = ? AND lower(name) = lower(?)').get(req.user.org_id, trimmed);
  if (existing) {
    if (existing.active === 0) {
      // Reactivate instead of failing
      db.prepare("UPDATE asset_categories SET active = 1 WHERE id = ?").run(existing.id);
      const cat = db.prepare('SELECT * FROM asset_categories WHERE id = ?').get(existing.id);
      return res.json(cat);
    }
    return res.status(409).json({ error: 'Category with that name already exists', id: existing.id });
  }

  const result = db.prepare(`
    INSERT INTO asset_categories (org_id, name, icon, color, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.org_id, trimmed, icon || null, color || null, req.user.id);

  const cat = db.prepare('SELECT * FROM asset_categories WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(cat);
});

router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot edit categories.' });
  const cat = db.prepare('SELECT * FROM asset_categories WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  const updatable = ['name', 'icon', 'color', 'active'];
  const sets = [];
  const params = [];
  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(key === 'active' ? (req.body[key] ? 1 : 0) : req.body[key]);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  params.push(cat.id);
  db.prepare(`UPDATE asset_categories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM asset_categories WHERE id = ?').get(cat.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot delete categories.' });
  const cat = db.prepare('SELECT * FROM asset_categories WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  // Soft delete to preserve historical asset references.
  db.prepare('UPDATE asset_categories SET active = 0 WHERE id = ?').run(cat.id);
  res.json({ success: true, soft_deleted: true });
});

export default router;
