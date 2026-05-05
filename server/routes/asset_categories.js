// server/routes/asset_categories.js — per-org asset categories + custom fields.
//
// Categories:
//   GET    /api/asset-categories          list (auth, scoped by org, active only by default)
//   GET    /api/asset-categories/:id      detail (incl. fields[])
//   POST   /api/asset-categories          create (elevated only)
//   PATCH  /api/asset-categories/:id      update (elevated only)
//   DELETE /api/asset-categories/:id      soft-delete (elevated only)
//
// Custom fields per category (E7.1):
//   GET    /api/asset-categories/:id/fields           list
//   POST   /api/asset-categories/:id/fields           add (elevated)
//   PATCH  /api/asset-categories/:id/fields/:fieldId  update (elevated)
//   DELETE /api/asset-categories/:id/fields/:fieldId  delete (elevated)
//   PUT    /api/asset-categories/:id/fields/order     bulk reorder (elevated)

import { Router } from 'express';
import db from '../db/connection.js';
import { loadFieldsForCategory } from '../services/custom_fields.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const VALID_FIELD_TYPES = new Set(['text', 'number', 'date', 'select', 'textarea', 'checkbox']);

// Normalize a label into a snake_case key. "Max PSI Rating" → "max_psi_rating".
// Strips punctuation, collapses whitespace, lowercases. Caller can override
// with an explicit field_key in the request body if they want.
function deriveFieldKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

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

router.get('/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM asset_categories WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  cat.fields = loadFieldsForCategory(cat.id).map(f => ({
    ...f,
    options: f.options ? JSON.parse(f.options) : null,
    is_required: !!f.is_required,
  }));
  res.json(cat);
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot delete categories.' });
  const cat = db.prepare('SELECT * FROM asset_categories WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  // Soft delete to preserve historical asset references.
  db.prepare('UPDATE asset_categories SET active = 0 WHERE id = ?').run(cat.id);
  res.json({ success: true, soft_deleted: true });
});

// ---------------------------------------------------------------------------
// Custom fields per category (E7.1)
// ---------------------------------------------------------------------------

function ensureCategoryOwnedByOrg(req, res) {
  const cat = db.prepare('SELECT id, org_id FROM asset_categories WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!cat) {
    res.status(404).json({ error: 'Category not found' });
    return null;
  }
  return cat;
}

router.get('/:id/fields', (req, res) => {
  const cat = ensureCategoryOwnedByOrg(req, res);
  if (!cat) return;
  const fields = loadFieldsForCategory(cat.id).map(f => ({
    ...f,
    options: f.options ? JSON.parse(f.options) : null,
    is_required: !!f.is_required,
  }));
  res.json({ fields });
});

router.post('/:id/fields', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot edit category fields.' });
  const cat = ensureCategoryOwnedByOrg(req, res);
  if (!cat) return;

  const { field_label, field_type, field_key, is_required, options, helper_text, position } = req.body || {};
  if (!field_label || !field_label.trim()) {
    return res.status(400).json({ error: 'field_label is required' });
  }
  if (!VALID_FIELD_TYPES.has(field_type)) {
    return res.status(400).json({ error: `field_type must be one of: ${Array.from(VALID_FIELD_TYPES).join(', ')}` });
  }
  if (field_type === 'select') {
    if (!Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ error: 'options is required for field_type=select' });
    }
  }

  const key = (field_key && field_key.trim()) ? deriveFieldKey(field_key) : deriveFieldKey(field_label);
  if (!key) return res.status(400).json({ error: 'Could not derive a valid field_key from the label' });

  const existing = db.prepare('SELECT id FROM asset_category_fields WHERE category_id = ? AND field_key = ?').get(cat.id, key);
  if (existing) return res.status(409).json({ error: `A field with key "${key}" already exists on this category.` });

  // Default position to "after the last field" so newly added fields land at
  // the end of the form by default.
  const lastPos = db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM asset_category_fields WHERE category_id = ?').get(cat.id).m;
  const finalPosition = position !== undefined ? Number(position) : lastPos + 1;

  const result = db.prepare(`
    INSERT INTO asset_category_fields (org_id, category_id, field_key, field_label, field_type, is_required, options, helper_text, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.org_id, cat.id, key, field_label.trim(), field_type,
    is_required ? 1 : 0,
    field_type === 'select' ? JSON.stringify(options) : null,
    helper_text ? helper_text.trim() : null,
    finalPosition,
  );

  const row = db.prepare('SELECT * FROM asset_category_fields WHERE id = ?').get(result.lastInsertRowid);
  row.options = row.options ? JSON.parse(row.options) : null;
  row.is_required = !!row.is_required;
  res.status(201).json(row);
});

router.patch('/:id/fields/:fieldId', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot edit category fields.' });
  const cat = ensureCategoryOwnedByOrg(req, res);
  if (!cat) return;
  const field = db.prepare('SELECT * FROM asset_category_fields WHERE id = ? AND category_id = ?').get(req.params.fieldId, cat.id);
  if (!field) return res.status(404).json({ error: 'Field not found on this category' });

  const updatable = ['field_label', 'is_required', 'helper_text', 'position'];
  const sets = [];
  const params = [];
  for (const k of updatable) {
    if (req.body[k] === undefined) continue;
    if (k === 'is_required') {
      sets.push('is_required = ?');
      params.push(req.body[k] ? 1 : 0);
    } else {
      sets.push(`${k} = ?`);
      params.push(req.body[k]);
    }
  }
  // options can be replaced for select fields
  if (req.body.options !== undefined && field.field_type === 'select') {
    if (!Array.isArray(req.body.options) || req.body.options.length === 0) {
      return res.status(400).json({ error: 'options must be a non-empty array for select fields' });
    }
    sets.push('options = ?');
    params.push(JSON.stringify(req.body.options));
  }
  // field_type is intentionally NOT updatable — changing it would invalidate
  // every existing custom_fields row that referenced this field. Delete +
  // recreate is the explicit path for type changes.
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(field.id);
  db.prepare(`UPDATE asset_category_fields SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM asset_category_fields WHERE id = ?').get(field.id);
  updated.options = updated.options ? JSON.parse(updated.options) : null;
  updated.is_required = !!updated.is_required;
  res.json(updated);
});

router.delete('/:id/fields/:fieldId', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot edit category fields.' });
  const cat = ensureCategoryOwnedByOrg(req, res);
  if (!cat) return;
  const field = db.prepare('SELECT id FROM asset_category_fields WHERE id = ? AND category_id = ?').get(req.params.fieldId, cat.id);
  if (!field) return res.status(404).json({ error: 'Field not found on this category' });

  // Hard delete the definition. Existing assets keep the value on their
  // custom_fields row — it just stops being rendered (our display loop only
  // walks the current field defs, not the JSON).
  db.prepare('DELETE FROM asset_category_fields WHERE id = ?').run(field.id);
  res.json({ success: true });
});

router.put('/:id/fields/order', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot edit category fields.' });
  const cat = ensureCategoryOwnedByOrg(req, res);
  if (!cat) return;
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of field ids' });

  const update = db.prepare('UPDATE asset_category_fields SET position = ? WHERE id = ? AND category_id = ?');
  db.transaction(() => {
    order.forEach((id, idx) => update.run(idx, id, cat.id));
  })();
  res.json({ success: true });
});

export default router;
