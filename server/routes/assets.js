// server/routes/assets.js — Asset register CRUD.
//
// GET    /api/assets                  list (filters: site_id, asset_type, asset_category_id, active, q)
// GET    /api/assets/:id              detail
// POST   /api/assets                  create (elevated only)
// PATCH  /api/assets/:id              update (elevated only)
// DELETE /api/assets/:id              soft-delete (sets active=0; elevated only)
//
// Phase 2 Wave 2 T2.2 + custom-categories follow-up.
// asset_type is free text; asset_category_id is the optional FK to
// asset_categories (per-org dropdown source).

import { Router } from 'express';
import db from '../db/connection.js';
import { nextAssetNumber } from '../services/numbering.js';
import { incidentsLinkedToAsset } from '../services/entity_links.js';
import { loadFieldsForCategory, validateCustomFields } from '../services/custom_fields.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

// Resolve a free-text asset_type or numeric asset_category_id to a
// {asset_type: string, asset_category_id: number|null} pair.
// If asset_type is supplied but matches no category, the row stays
// with category_id=NULL (custom one-off type allowed).
function resolveCategory(orgId, { asset_type, asset_category_id }) {
  if (asset_category_id) {
    const cat = db.prepare('SELECT id, name FROM asset_categories WHERE id = ? AND org_id = ?').get(asset_category_id, orgId);
    if (!cat) return { error: 'Category not found in your organization' };
    return { asset_type: cat.name, asset_category_id: cat.id };
  }
  if (asset_type && asset_type.trim()) {
    const trimmed = asset_type.trim();
    const cat = db.prepare('SELECT id FROM asset_categories WHERE org_id = ? AND lower(name) = lower(?) AND active = 1').get(orgId, trimmed);
    return { asset_type: trimmed, asset_category_id: cat?.id || null };
  }
  return { error: 'asset_type or asset_category_id is required' };
}

router.get('/', (req, res) => {
  const { site_id, asset_type, asset_category_id, active, q, page = 1, limit = 100 } = req.query;
  const orgId = req.user.org_id;

  const where = ['a.org_id = ?'];
  const params = [orgId];

  if (site_id) { where.push('a.site_id = ?'); params.push(Number(site_id)); }
  if (asset_type) { where.push('lower(a.asset_type) = lower(?)'); params.push(asset_type); }
  if (asset_category_id) { where.push('a.asset_category_id = ?'); params.push(Number(asset_category_id)); }
  if (active !== undefined && active !== '') { where.push('a.active = ?'); params.push(Number(active) ? 1 : 0); }
  if (q) {
    where.push('(a.name LIKE ? OR a.asset_number LIKE ? OR a.serial_number LIKE ? OR a.location_description LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const whereClause = where.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(`SELECT COUNT(*) as c FROM assets a WHERE ${whereClause}`).get(...params).c;
  const assets = db.prepare(`
    SELECT a.*, s.name as site_name, s.country as site_country,
           ac.name as category_name, ac.icon as category_icon, ac.color as category_color
    FROM assets a
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN asset_categories ac ON ac.id = a.asset_category_id
    WHERE ${whereClause}
    ORDER BY a.active DESC, a.name
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  res.json({ assets, total, page: Number(page), limit: Number(limit) });
});

router.get('/:id', (req, res) => {
  const asset = db.prepare(`
    SELECT a.*, s.name as site_name, s.country as site_country,
           ac.name as category_name, ac.icon as category_icon, ac.color as category_color
    FROM assets a
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN asset_categories ac ON ac.id = a.asset_category_id
    WHERE a.id = ? AND a.org_id = ?
  `).get(req.params.id, req.user.org_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  asset.linked_incidents = incidentsLinkedToAsset(asset.id, req.user.org_id);
  asset.custom_fields = JSON.parse(asset.custom_fields || '{}');
  // Surface the active category's field definitions so the FE can render
  // the same form on detail without a second roundtrip.
  asset.category_fields = asset.asset_category_id
    ? loadFieldsForCategory(asset.asset_category_id).map(f => ({
        ...f,
        options: f.options ? JSON.parse(f.options) : null,
        is_required: !!f.is_required,
      }))
    : [];
  res.json(asset);
});

router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create assets.' });
  }

  const { site_id, name, location_description, serial_number, description, display_id } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!site_id) return res.status(400).json({ error: 'site_id is required' });
  if (!display_id || !display_id.trim()) {
    return res.status(400).json({ error: 'display_id (unique identifier) is required' });
  }

  // Per-org uniqueness for the user-controlled identifier. The DB has a
  // partial unique index too, but failing here gives a friendlier message.
  const dupe = db.prepare('SELECT id FROM assets WHERE org_id = ? AND display_id = ?')
    .get(req.user.org_id, display_id.trim());
  if (dupe) {
    return res.status(409).json({ error: `Another asset already uses identifier "${display_id.trim()}"` });
  }

  const cat = resolveCategory(req.user.org_id, req.body);
  if (cat.error) return res.status(400).json({ error: cat.error });

  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND org_id = ?').get(site_id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found in your organization' });

  // Validate per-category custom fields if a category is in play.
  let customFieldsJson = '{}';
  if (cat.asset_category_id) {
    const definitions = loadFieldsForCategory(cat.asset_category_id);
    if (definitions.length > 0) {
      const { values, errors } = validateCustomFields(definitions, req.body.custom_fields || {});
      if (errors.length > 0) {
        return res.status(400).json({ error: errors.join(' · '), field_errors: errors });
      }
      customFieldsJson = JSON.stringify(values);
    }
  }

  const number = nextAssetNumber();
  const result = db.prepare(`
    INSERT INTO assets (asset_number, display_id, org_id, site_id, name, asset_type, asset_category_id, location_description, serial_number, description, custom_fields, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    number, display_id.trim(), req.user.org_id, site_id, name.trim(),
    cat.asset_type, cat.asset_category_id,
    location_description || null, serial_number || null, description || null,
    customFieldsJson,
  );

  const asset = db.prepare(`
    SELECT a.*, s.name as site_name, s.country as site_country,
           ac.name as category_name, ac.icon as category_icon, ac.color as category_color
    FROM assets a
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN asset_categories ac ON ac.id = a.asset_category_id
    WHERE a.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(asset);
});

router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot edit assets.' });
  }

  const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const updatable = ['name', 'location_description', 'serial_number', 'description', 'site_id', 'active'];
  const sets = [];
  const params = [];

  // display_id: required field, but we only validate it if the caller is
  // changing it. Empty string would un-set the identifier, which we reject.
  if (req.body.display_id !== undefined) {
    const newId = String(req.body.display_id || '').trim();
    if (!newId) return res.status(400).json({ error: 'display_id (unique identifier) cannot be empty' });
    if (newId !== asset.display_id) {
      const dupe = db.prepare('SELECT id FROM assets WHERE org_id = ? AND display_id = ? AND id != ?')
        .get(req.user.org_id, newId, asset.id);
      if (dupe) return res.status(409).json({ error: `Another asset already uses identifier "${newId}"` });
    }
    sets.push('display_id = ?');
    params.push(newId);
  }

  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      if (key === 'site_id' && req.body[key]) {
        const site = db.prepare('SELECT id FROM sites WHERE id = ? AND org_id = ?').get(req.body[key], req.user.org_id);
        if (!site) return res.status(404).json({ error: 'Site not found in your organization' });
      }
      sets.push(`${key} = ?`);
      params.push(key === 'active' ? (req.body[key] ? 1 : 0) : req.body[key]);
    }
  }

  // Handle asset_type / asset_category_id together (resolve through helper)
  let resolvedCategoryId = asset.asset_category_id;
  if (req.body.asset_type !== undefined || req.body.asset_category_id !== undefined) {
    const cat = resolveCategory(req.user.org_id, req.body);
    if (cat.error) return res.status(400).json({ error: cat.error });
    sets.push('asset_type = ?'); params.push(cat.asset_type);
    sets.push('asset_category_id = ?'); params.push(cat.asset_category_id);
    resolvedCategoryId = cat.asset_category_id;
  }

  // Custom fields: if the request supplies them, validate against the
  // resolved category's defs (supports both same-category edits and category
  // switches in the same PATCH).
  if (req.body.custom_fields !== undefined) {
    if (resolvedCategoryId) {
      const definitions = loadFieldsForCategory(resolvedCategoryId);
      const { values, errors } = validateCustomFields(definitions, req.body.custom_fields || {});
      if (errors.length > 0) {
        return res.status(400).json({ error: errors.join(' · '), field_errors: errors });
      }
      sets.push('custom_fields = ?');
      params.push(JSON.stringify(values));
    } else {
      // No category → custom fields are not applicable; clear them.
      sets.push('custom_fields = ?');
      params.push('{}');
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  sets.push("updated_at = datetime('now')");
  params.push(asset.id);
  db.prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`
    SELECT a.*, s.name as site_name, s.country as site_country,
           ac.name as category_name, ac.icon as category_icon, ac.color as category_color
    FROM assets a
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN asset_categories ac ON ac.id = a.asset_category_id
    WHERE a.id = ?
  `).get(asset.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot delete assets.' });
  }

  const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  db.prepare("UPDATE assets SET active = 0, updated_at = datetime('now') WHERE id = ?").run(asset.id);
  res.json({ success: true, soft_deleted: true });
});

export default router;
