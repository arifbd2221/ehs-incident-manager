// server/routes/templates.js — Inspection template CRUD + versioning.
//
// GET    /api/templates            — list templates (filterable by status/search)
// GET    /api/templates/summary    — counts by status
// POST   /api/templates            — create template (elevated)
// GET    /api/templates/:id        — get template with items + answer sets + versions
// PATCH  /api/templates/:id        — update metadata (elevated)
// DELETE /api/templates/:id        — archive template (elevated)
// POST   /api/templates/:id/publish — publish template → creates version snapshot
// PATCH  /api/templates/:id/items  — bulk upsert/delete items (elevated)
// GET    /api/templates/:id/versions — list all versions
// GET    /api/templates/:id/versions/:versionId — get specific version with items

import { Router } from 'express';
import db from '../db/connection.js';
import { writeActivity, diffFields } from '../services/activity_log.js';

const router = Router();

const TEMPLATE_AUDIT_FIELDS = ['name', 'description'];

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

// ---------------------------------------------------------------------------
// GET / — list templates
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { status, search } = req.query;
  const orgId = req.user.org_id;

  const where = ['t.org_id = ?'];
  const params = [orgId];

  if (status) {
    where.push('t.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(t.name LIKE ? OR t.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = where.join(' AND ');

  const total = db.prepare(
    `SELECT COUNT(*) as count FROM templates t WHERE ${whereClause}`
  ).get(...params).count;

  const templates = db.prepare(`
    SELECT t.*, u.name as created_by_name
    FROM templates t
    LEFT JOIN users u ON u.id = t.created_by
    WHERE ${whereClause}
    ORDER BY t.updated_at DESC
  `).all(...params);

  res.json({ templates, total });
});

// ---------------------------------------------------------------------------
// GET /summary — counts by status
// ---------------------------------------------------------------------------
router.get('/summary', (req, res) => {
  const orgId = req.user.org_id;

  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
    FROM templates
    WHERE org_id = ?
  `).get(orgId);

  res.json({
    draft: row.draft || 0,
    published: row.published || 0,
    archived: row.archived || 0,
    total: row.total || 0,
  });
});

// ---------------------------------------------------------------------------
// POST / — create template
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to create templates.' });
  }

  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const result = db.prepare(`
    INSERT INTO templates (org_id, name, description, status, created_by, latest_version)
    VALUES (?, ?, ?, 'draft', ?, 0)
  `).run(req.user.org_id, name.trim(), description || null, req.user.id);

  const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'template', ?, 'created', ?, ?)
  `).run(req.user.org_id, template.id, `created template "${template.name}"`, req.user.id);

  res.status(201).json(template);
});

// ---------------------------------------------------------------------------
// GET /:id — get template with working copy items + answer sets + version info
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const template = db.prepare(`
    SELECT t.*, u.name as created_by_name
    FROM templates t
    LEFT JOIN users u ON u.id = t.created_by
    WHERE t.id = ? AND t.org_id = ?
  `).get(req.params.id, req.user.org_id);

  if (!template) return res.status(404).json({ error: 'Template not found' });

  const items = db.prepare(`
    SELECT * FROM template_items
    WHERE template_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(template.id);

  for (const item of items) {
    if (item.meta) {
      try { item.meta = JSON.parse(item.meta); } catch { /* keep as string */ }
    }
  }

  const answerSets = db.prepare(
    'SELECT * FROM answer_sets WHERE org_id = ? ORDER BY name'
  ).all(req.user.org_id);

  for (const as of answerSets) {
    as.options = db.prepare(
      'SELECT * FROM answer_set_options WHERE answer_set_id = ? ORDER BY position ASC'
    ).all(as.id);
  }

  // Get version history
  const versions = db.prepare(`
    SELECT tv.*, u.name as published_by_name
    FROM template_versions tv
    LEFT JOIN users u ON u.id = tv.published_by
    WHERE tv.template_id = ?
    ORDER BY tv.version_number DESC
  `).all(template.id);

  // Check if working copy differs from latest published version
  let hasUnpublishedChanges = false;
  if (template.latest_version > 0) {
    const latestVersion = versions[0];
    if (latestVersion) {
      const versionItems = db.prepare(
        'SELECT item_key, parent_key, type, label, region, sort_order, required, meta FROM template_version_items WHERE version_id = ? ORDER BY sort_order ASC'
      ).all(latestVersion.id);

      const workingItems = items.map(i => ({
        item_key: i.item_key,
        parent_key: i.parent_key || null,
        type: i.type,
        label: i.label || null,
        region: i.region || 'body',
        sort_order: i.sort_order,
        required: i.required,
        meta: i.meta ? (typeof i.meta === 'object' ? JSON.stringify(i.meta) : i.meta) : null,
      }));

      const versionSorted = versionItems.map(v => ({
        item_key: v.item_key,
        parent_key: v.parent_key || null,
        type: v.type,
        label: v.label || null,
        region: v.region || 'body',
        sort_order: v.sort_order,
        required: v.required,
        meta: v.meta || null,
      }));

      hasUnpublishedChanges = JSON.stringify(workingItems) !== JSON.stringify(versionSorted);
    }
  } else if (items.length > 0) {
    hasUnpublishedChanges = true;
  }

  res.json({
    ...template,
    items,
    answer_sets: answerSets,
    versions,
    has_unpublished_changes: hasUnpublishedChanges,
  });
});

// ---------------------------------------------------------------------------
// PATCH /:id — update template metadata (always allowed for elevated, any status)
// ---------------------------------------------------------------------------
router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to edit templates.' });
  }

  const template = db.prepare(
    'SELECT * FROM templates WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const updatable = ['name', 'description'];
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

  sets.push("updated_at = datetime('now')");
  params.push(template.id);

  db.prepare(`UPDATE templates SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM templates WHERE id = ?').get(template.id);

  const changes = diffFields(template, updated, TEMPLATE_AUDIT_FIELDS);
  if (changes) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'template',
      entity_id: template.id,
      action: 'updated',
      description: `updated template "${updated.name}"`,
      user_id: req.user.id,
      metadata: changes,
    });
  }

  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /:id — archive template (soft delete)
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to archive templates.' });
  }

  const template = db.prepare(
    'SELECT * FROM templates WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  db.prepare(`
    UPDATE templates SET status = 'archived', updated_at = datetime('now') WHERE id = ?
  `).run(template.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'template', ?, 'archived', ?, ?)
  `).run(req.user.org_id, template.id, `archived template "${template.name}"`, req.user.id);

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /:id/publish — publish template → creates a version snapshot
// ---------------------------------------------------------------------------
router.post('/:id/publish', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to publish templates.' });
  }

  const template = db.prepare(
    'SELECT * FROM templates WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const items = db.prepare(
    'SELECT * FROM template_items WHERE template_id = ? ORDER BY sort_order ASC'
  ).all(template.id);

  if (items.length === 0) {
    return res.status(400).json({ error: 'Cannot publish a template with no items. Add at least one item first.' });
  }

  const questionCount = items.filter(i => i.type !== 'section').length;
  if (questionCount === 0) {
    return res.status(400).json({ error: 'Cannot publish a template with no questions. Add at least one question.' });
  }

  const nextVersion = (template.latest_version || 0) + 1;

  const publish = db.transaction(() => {
    // Create version record
    const vResult = db.prepare(`
      INSERT INTO template_versions (template_id, version_number, published_by)
      VALUES (?, ?, ?)
    `).run(template.id, nextVersion, req.user.id);

    const versionId = vResult.lastInsertRowid;

    // Snapshot all working copy items into version items
    const insertVersionItem = db.prepare(`
      INSERT INTO template_version_items (version_id, item_key, parent_key, type, label, region, sort_order, required, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      insertVersionItem.run(
        versionId,
        item.item_key,
        item.parent_key || null,
        item.type,
        item.label || null,
        item.region || 'body',
        item.sort_order,
        item.required,
        item.meta || null,
      );
    }

    // Update template status and version counter
    db.prepare(`
      UPDATE templates
      SET status = 'published',
          latest_version = ?,
          published_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextVersion, template.id);

    return { versionId, versionNumber: nextVersion };
  });

  const { versionId, versionNumber } = publish();

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'template', ?, 'published', ?, ?)
  `).run(
    req.user.org_id,
    template.id,
    `published template "${template.name}" as v${versionNumber}`,
    req.user.id,
  );

  const updated = db.prepare('SELECT * FROM templates WHERE id = ?').get(template.id);
  res.json({ ...updated, version_id: versionId, version_number: versionNumber });
});

// ---------------------------------------------------------------------------
// PATCH /:id/items — bulk upsert/delete items (always allowed for elevated)
// ---------------------------------------------------------------------------
router.patch('/:id/items', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to edit template items.' });
  }

  const template = db.prepare(
    'SELECT * FROM templates WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const { upserts, deletes } = req.body;

  const applyChanges = db.transaction(() => {
    if (Array.isArray(deletes) && deletes.length > 0) {
      const deleteStmt = db.prepare(
        'DELETE FROM template_items WHERE template_id = ? AND item_key = ?'
      );
      for (const key of deletes) {
        deleteStmt.run(template.id, key);
      }
    }

    if (Array.isArray(upserts) && upserts.length > 0) {
      const upsertStmt = db.prepare(`
        INSERT INTO template_items (template_id, item_key, parent_key, type, label, region, sort_order, required, meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(template_id, item_key) DO UPDATE SET
          parent_key = excluded.parent_key,
          type = excluded.type,
          label = excluded.label,
          region = excluded.region,
          sort_order = excluded.sort_order,
          required = excluded.required,
          meta = excluded.meta
      `);

      for (const item of upserts) {
        upsertStmt.run(
          template.id,
          item.item_key,
          item.parent_key || null,
          item.type || 'question',
          item.label || null,
          item.region || 'body',
          item.sort_order ?? 0,
          item.required ? 1 : 0,
          item.meta ? (typeof item.meta === 'string' ? item.meta : JSON.stringify(item.meta)) : null,
        );
      }
    }

    db.prepare("UPDATE templates SET updated_at = datetime('now') WHERE id = ?").run(template.id);
  });

  applyChanges();

  // Items changes affect what every future inspection captures, so they're
  // worth a single rollup row. We don't expand each upsert into its own row;
  // the metadata carries upsert/delete counts and the affected item_keys for
  // forensics.
  const upsertCount = Array.isArray(upserts) ? upserts.length : 0;
  const deleteCount = Array.isArray(deletes) ? deletes.length : 0;
  if (upsertCount > 0 || deleteCount > 0) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'template',
      entity_id: template.id,
      action: 'items_updated',
      description: `updated items on template "${template.name}" (${upsertCount} upsert, ${deleteCount} delete)`,
      user_id: req.user.id,
      metadata: {
        upsert_count: upsertCount,
        delete_count: deleteCount,
        upserted_keys: Array.isArray(upserts) ? upserts.map(i => i.item_key) : [],
        deleted_keys: Array.isArray(deletes) ? deletes : [],
      },
    });
  }

  const updatedItems = db.prepare(`
    SELECT * FROM template_items
    WHERE template_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(template.id);

  for (const item of updatedItems) {
    if (item.meta) {
      try { item.meta = JSON.parse(item.meta); } catch { /* keep as string */ }
    }
  }

  res.json({ items: updatedItems });
});

// ---------------------------------------------------------------------------
// GET /:id/versions — list all versions for a template
// ---------------------------------------------------------------------------
router.get('/:id/versions', (req, res) => {
  const template = db.prepare(
    'SELECT * FROM templates WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const versions = db.prepare(`
    SELECT tv.*, u.name as published_by_name
    FROM template_versions tv
    LEFT JOIN users u ON u.id = tv.published_by
    WHERE tv.template_id = ?
    ORDER BY tv.version_number DESC
  `).all(template.id);

  // Add item counts per version
  const countStmt = db.prepare(
    "SELECT COUNT(*) as c FROM template_version_items WHERE version_id = ? AND type != 'section'"
  );
  for (const v of versions) {
    v.question_count = countStmt.get(v.id).c;
  }

  res.json({ versions });
});

// ---------------------------------------------------------------------------
// GET /:id/versions/:versionId — get a specific version with its items
// ---------------------------------------------------------------------------
router.get('/:id/versions/:versionId', (req, res) => {
  const template = db.prepare(
    'SELECT * FROM templates WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const version = db.prepare(
    'SELECT tv.*, u.name as published_by_name FROM template_versions tv LEFT JOIN users u ON u.id = tv.published_by WHERE tv.id = ? AND tv.template_id = ?'
  ).get(req.params.versionId, template.id);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  const items = db.prepare(
    'SELECT * FROM template_version_items WHERE version_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(version.id);

  for (const item of items) {
    if (item.meta) {
      try { item.meta = JSON.parse(item.meta); } catch { /* keep as string */ }
    }
  }

  res.json({ ...version, items });
});

export default router;
