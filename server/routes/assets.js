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
import { writeActivity, diffFields } from '../services/activity_log.js';
import { runImport, CsvImportError } from '../services/csv_import.js';
import { checkLen, NAME_MAX, ADDRESS_MAX } from '../services/validators.js';

const router = Router();

const ASSET_AUDIT_FIELDS = [
  'name', 'display_id', 'site_id', 'asset_type', 'asset_category_id',
  'location_description', 'serial_number', 'description', 'active',
];

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

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'asset',
    entity_id: asset.id,
    action: 'asset_created',
    description: `created asset ${asset.name} (${asset.display_id || asset.asset_number})`,
    user_id: req.user.id,
    metadata: {
      site_id: asset.site_id,
      asset_type: asset.asset_type,
      asset_category_id: asset.asset_category_id,
    },
  });

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

  // Detect archive/restore via active flip and use a distinct action so the
  // audit trail reads cleanly ("archived" / "restored" rather than "updated").
  let action = 'asset_updated';
  let description = `updated asset ${updated.name}`;
  if (asset.active === 1 && updated.active === 0) {
    action = 'asset_archived';
    description = `archived asset ${updated.name}`;
  } else if (asset.active === 0 && updated.active === 1) {
    action = 'asset_restored';
    description = `restored asset ${updated.name}`;
  }

  const changes = diffFields(asset, updated, ASSET_AUDIT_FIELDS);
  if (changes || action !== 'asset_updated') {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'asset',
      entity_id: asset.id,
      action,
      description,
      user_id: req.user.id,
      metadata: changes,
    });
  }

  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot delete assets.' });
  }

  const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  db.prepare("UPDATE assets SET active = 0, updated_at = datetime('now') WHERE id = ?").run(asset.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'asset',
    entity_id: asset.id,
    action: 'asset_archived',
    description: `archived asset ${asset.name}`,
    user_id: req.user.id,
    metadata: { display_id: asset.display_id, asset_number: asset.asset_number },
  });

  res.json({ success: true, soft_deleted: true });
});

// ---------- CSV import (P3-OB2) ----------------------------------------

const ASSET_IMPORT_HEADERS = [
  'name', 'display_id', 'site_name', 'asset_type',
  'location_description', 'serial_number', 'description',
];

const ASSET_IMPORT_TEMPLATE_BODY =
  ASSET_IMPORT_HEADERS.join(',') + '\n' +
  'Press 4,PRESS-04,Cleveland Plant,machine,Bay 3 — Production floor,P4-2018-44211,1500-ton stamping press\n' +
  'Forklift FL-3,FL-3,Cleveland Plant,vehicle,Loading dock,CAT-FL3-77621,\n';

// asset_type matches an existing org category by name → category_id resolved.
// No match → category_id stays NULL (free-text type, like the POST route).
// Custom fields per category are skipped in v1 — the importer sets
// custom_fields='{}' regardless. Categories with required custom fields
// would normally reject blank values via validateCustomFields(); we
// document this as a v1 limitation in the adapter and route comment.
function buildAssetImportDefinition() {
  return {
    entityName: 'asset',
    headers: ASSET_IMPORT_HEADERS,

    validateRow(raw, ctx) {
      const errors = [];
      const name = raw.name.trim();
      const display_id = raw.display_id.trim();
      const site_name = raw.site_name.trim();
      const asset_type = raw.asset_type.trim();
      const location_description = raw.location_description.trim();
      const serial_number = raw.serial_number.trim();
      const description = raw.description.trim();

      if (!name) errors.push({ column: 'name', reason: 'Name is required' });
      else {
        const e = checkLen(name, NAME_MAX, 'Name');
        if (e) errors.push({ column: 'name', reason: e });
      }

      if (!display_id) errors.push({ column: 'display_id', reason: 'display_id is required' });
      else {
        const e = checkLen(display_id, NAME_MAX, 'display_id');
        if (e) errors.push({ column: 'display_id', reason: e });
        else if (ctx.seen.has(display_id.toLowerCase())) {
          errors.push({ column: 'display_id', reason: `Duplicate display_id in this file (also on row ${ctx.seen.get(display_id.toLowerCase())})` });
        } else if (ctx.existingDisplayIds.has(display_id.toLowerCase())) {
          errors.push({ column: 'display_id', reason: 'Another asset already uses this display_id' });
        }
      }

      // Track even if other validation failed (mirrors users + sites pattern).
      if (display_id && checkLen(display_id, NAME_MAX, 'display_id') === null && !ctx.seen.has(display_id.toLowerCase())) {
        ctx.seen.set(display_id.toLowerCase(), raw.__rowNumber);
      }

      if (!site_name) errors.push({ column: 'site_name', reason: 'site_name is required' });
      let site_id = null;
      if (site_name) {
        site_id = ctx.sitesByName.get(site_name.toLowerCase()) ?? null;
        if (site_id === null) {
          errors.push({ column: 'site_name', reason: `Site "${site_name}" not found in your organization` });
        }
      }

      if (!asset_type) errors.push({ column: 'asset_type', reason: 'asset_type is required' });
      else {
        const e = checkLen(asset_type, NAME_MAX, 'asset_type');
        if (e) errors.push({ column: 'asset_type', reason: e });
      }

      const locErr = checkLen(location_description, ADDRESS_MAX, 'location_description');
      if (locErr) errors.push({ column: 'location_description', reason: locErr });
      const serErr = checkLen(serial_number, NAME_MAX, 'serial_number');
      if (serErr) errors.push({ column: 'serial_number', reason: serErr });
      const descErr = checkLen(description, ADDRESS_MAX * 5, 'description');  // 1500 chars
      if (descErr) errors.push({ column: 'description', reason: descErr });

      // Resolve asset_type → category_id if it happens to match an active
      // org category. We tolerate categories that have required custom
      // fields by importing without them — a v1 limitation. Document on
      // the FE helperText.
      let asset_category_id = null;
      if (asset_type) {
        asset_category_id = ctx.categoriesByName.get(asset_type.toLowerCase()) ?? null;
      }

      if (errors.length === 0) {
        return {
          parsed: {
            name, display_id, site_id, asset_type, asset_category_id,
            location_description: location_description || null,
            serial_number: serial_number || null,
            description: description || null,
          },
        };
      }
      return { errors };
    },

    insertRow(parsed, ctx) {
      const number = nextAssetNumber();
      const result = db.prepare(`
        INSERT INTO assets (asset_number, display_id, org_id, site_id, name, asset_type, asset_category_id, location_description, serial_number, description, custom_fields, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 1)
      `).run(
        number, parsed.display_id, ctx.orgId, parsed.site_id, parsed.name,
        parsed.asset_type, parsed.asset_category_id,
        parsed.location_description, parsed.serial_number, parsed.description,
      );

      writeActivity({
        org_id: ctx.orgId,
        entity_type: 'asset',
        entity_id: result.lastInsertRowid,
        action: 'asset_created',
        description: `imported asset ${parsed.name} (${parsed.display_id})`,
        user_id: ctx.actorId,
        metadata: {
          source: 'csv_import',
          asset_number: number,
          display_id: parsed.display_id,
          site_id: parsed.site_id,
          asset_type: parsed.asset_type,
          asset_category_id: parsed.asset_category_id,
        },
      });

      return result.lastInsertRowid;
    },

    onAllInserted(ids, ctx) {
      writeActivity({
        org_id: ctx.orgId,
        entity_type: 'asset',
        entity_id: null,
        action: 'assets_imported',
        description: `imported ${ids.length} asset${ids.length === 1 ? '' : 's'} via CSV`,
        user_id: ctx.actorId,
        metadata: { count: ids.length, ids },
      });
    },
  };
}

router.get('/import/template.csv', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot import assets.' });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="assets_template.csv"');
  res.send(ASSET_IMPORT_TEMPLATE_BODY);
});

router.post('/import', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot import assets.' });
  const { csv_text, mode } = req.body;
  if (!csv_text) return res.status(400).json({ error: 'csv_text is required' });
  if (mode !== 'dry_run' && mode !== 'commit') {
    return res.status(400).json({ error: "mode must be 'dry_run' or 'commit'" });
  }

  const sitesByName = new Map(
    db.prepare('SELECT id, name FROM sites WHERE org_id = ?')
      .all(req.user.org_id)
      .map(s => [s.name.toLowerCase(), s.id])
  );
  const categoriesByName = new Map(
    db.prepare('SELECT id, name FROM asset_categories WHERE org_id = ? AND active = 1')
      .all(req.user.org_id)
      .map(c => [c.name.toLowerCase(), c.id])
  );
  const existingDisplayIds = new Set(
    db.prepare('SELECT display_id FROM assets WHERE org_id = ? AND display_id IS NOT NULL')
      .all(req.user.org_id)
      .map(r => r.display_id.toLowerCase())
  );

  try {
    const result = runImport(buildAssetImportDefinition(), csv_text, mode, {
      orgId: req.user.org_id,
      actorId: req.user.id,
      sitesByName, categoriesByName, existingDisplayIds,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof CsvImportError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

export default router;
