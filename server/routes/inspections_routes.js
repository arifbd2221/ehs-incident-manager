// server/routes/inspections_routes.js — Inspection CRUD + responses.
//
// GET    /api/inspections              — list inspections
// GET    /api/inspections/summary      — counts by status
// POST   /api/inspections              — start inspection from published template
// GET    /api/inspections/:id          — get inspection with items + template context
// PATCH  /api/inspections/:id          — update metadata
// PUT    /api/inspections/:id/items/:item_key — save single item response
// POST   /api/inspections/:id/complete — mark completed
// POST   /api/inspections/:id/abandon  — mark abandoned
// GET    /api/inspections/:id/report   — generate structured report
// DELETE /api/inspections/:id          — delete inspection

import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

function evaluateVisibility(templateItems, inspectionItems) {
  const answerMap = new Map();
  for (const item of inspectionItems) {
    if (item.selected_option_id !== null) {
      answerMap.set(item.item_key, item.selected_option_id);
    }
  }
  const visible = new Set();
  for (const ti of templateItems) {
    if (ti.type === 'section') { visible.add(ti.item_key); continue; }
    const meta = (typeof ti.meta === 'object' && ti.meta) || {};
    const conditions = meta.conditions;
    if (!conditions || conditions.length === 0) { visible.add(ti.item_key); continue; }
    const logic = meta.condition_logic || 'all';
    const results = conditions.map(c => {
      if (!c.source_key || !c.option_id) return true;
      if (!visible.has(c.source_key)) return false;
      return answerMap.get(c.source_key) === c.option_id;
    });
    const pass = logic === 'all' ? results.every(Boolean) : results.some(Boolean);
    if (pass) visible.add(ti.item_key);
  }
  return visible;
}
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

/**
 * Generate the next inspection number: INS-YYYY-NNNNN
 */
function nextInspectionNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT MAX(CAST(SUBSTR(inspection_number, -5) AS INTEGER)) as maxn FROM inspections WHERE inspection_number LIKE ?"
  ).get(`INS-${year}-%`);
  const next = (row?.maxn || 0) + 1;
  return `INS-${year}-${String(next).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// GET / — list inspections
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { status, search, template_id } = req.query;
  const orgId = req.user.org_id;

  const where = ['i.org_id = ?'];
  const params = [orgId];

  if (status) {
    where.push('i.status = ?');
    params.push(status);
  }
  if (template_id) {
    where.push('i.template_id = ?');
    params.push(Number(template_id));
  }
  if (search) {
    where.push('(i.title LIKE ? OR i.inspection_number LIKE ? OR i.location LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = where.join(' AND ');

  const total = db.prepare(
    `SELECT COUNT(*) as count FROM inspections i WHERE ${whereClause}`
  ).get(...params).count;

  const inspections = db.prepare(`
    SELECT i.*, t.name as template_name, u.name as started_by_name,
           tv.version_number as template_version_number
    FROM inspections i
    LEFT JOIN templates t ON t.id = i.template_id
    LEFT JOIN users u ON u.id = i.started_by
    LEFT JOIN template_versions tv ON tv.id = i.template_version_id
    WHERE ${whereClause}
    ORDER BY i.created_at DESC
  `).all(...params);

  res.json({ inspections, total });
});

// ---------------------------------------------------------------------------
// GET /summary — counts by status
// ---------------------------------------------------------------------------
router.get('/summary', (req, res) => {
  const orgId = req.user.org_id;

  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) as abandoned
    FROM inspections
    WHERE org_id = ?
  `).get(orgId);

  res.json({
    in_progress: row.in_progress || 0,
    completed: row.completed || 0,
    abandoned: row.abandoned || 0,
    total: row.total || 0,
  });
});

// ---------------------------------------------------------------------------
// POST / — start inspection from published template (uses latest version snapshot)
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to create inspections.' });
  }

  const { template_id, title, conducted_on, location } = req.body;
  if (!template_id) {
    return res.status(400).json({ error: 'template_id is required' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  const template = db.prepare(
    'SELECT * FROM templates WHERE id = ? AND org_id = ?'
  ).get(template_id, req.user.org_id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  if (template.status !== 'published') {
    return res.status(400).json({ error: 'Template must be published before starting an inspection.' });
  }

  // Get the latest published version
  const latestVersion = db.prepare(
    'SELECT * FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1'
  ).get(template.id);
  if (!latestVersion) {
    return res.status(400).json({ error: 'Template has no published versions.' });
  }

  const inspectionNumber = nextInspectionNumber();

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO inspections (org_id, template_id, template_version_id, inspection_number, title, status, conducted_on, location, started_by)
      VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)
    `).run(
      req.user.org_id,
      template.id,
      latestVersion.id,
      inspectionNumber,
      title.trim(),
      conducted_on || null,
      location || null,
      req.user.id,
    );

    const inspectionId = result.lastInsertRowid;

    // Copy items from the VERSION snapshot, not the working copy
    const versionItems = db.prepare(
      'SELECT * FROM template_version_items WHERE version_id = ? ORDER BY sort_order ASC'
    ).all(latestVersion.id);

    const insertItem = db.prepare(`
      INSERT INTO inspection_items (inspection_id, item_key, type)
      VALUES (?, ?, ?)
    `);

    for (const vi of versionItems) {
      insertItem.run(inspectionId, vi.item_key, vi.type);
    }

    return inspectionId;
  });

  const inspectionId = create();

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'inspection', ?, 'created', ?, ?)
  `).run(
    req.user.org_id,
    inspectionId,
    `started inspection ${inspectionNumber} from template "${template.name}" v${latestVersion.version_number}`,
    req.user.id,
  );

  const inspection = db.prepare(`
    SELECT i.*, t.name as template_name, u.name as started_by_name,
           tv.version_number as template_version_number
    FROM inspections i
    LEFT JOIN templates t ON t.id = i.template_id
    LEFT JOIN users u ON u.id = i.started_by
    LEFT JOIN template_versions tv ON tv.id = i.template_version_id
    WHERE i.id = ?
  `).get(inspectionId);

  res.status(201).json(inspection);
});

// ---------------------------------------------------------------------------
// GET /:id — get inspection with items + template context from version snapshot
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const inspection = db.prepare(`
    SELECT i.*, t.name as template_name, u.name as started_by_name,
           tv.version_number as template_version_number
    FROM inspections i
    LEFT JOIN templates t ON t.id = i.template_id
    LEFT JOIN users u ON u.id = i.started_by
    LEFT JOIN template_versions tv ON tv.id = i.template_version_id
    WHERE i.id = ? AND i.org_id = ?
  `).get(req.params.id, req.user.org_id);

  if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

  const items = db.prepare(`
    SELECT ii.*, aso.label as selected_option_label, aso.score as selected_option_score,
           aso.color as selected_option_color
    FROM inspection_items ii
    LEFT JOIN answer_set_options aso ON aso.id = ii.selected_option_id
    WHERE ii.inspection_id = ?
    ORDER BY ii.id ASC
  `).all(inspection.id);

  // Use version snapshot items if available, fall back to working copy
  let templateItems;
  if (inspection.template_version_id) {
    templateItems = db.prepare(`
      SELECT * FROM template_version_items
      WHERE version_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(inspection.template_version_id);
  } else {
    templateItems = db.prepare(`
      SELECT * FROM template_items
      WHERE template_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(inspection.template_id);
  }

  for (const ti of templateItems) {
    if (ti.meta) {
      try { ti.meta = JSON.parse(ti.meta); } catch { /* keep as string */ }
    }
  }

  res.json({ ...inspection, items, template_items: templateItems });
});

// ---------------------------------------------------------------------------
// PATCH /:id — update inspection metadata
// ---------------------------------------------------------------------------
router.patch('/:id', (req, res) => {
  const inspection = db.prepare(
    'SELECT * FROM inspections WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

  const updatable = ['title', 'conducted_on', 'location'];
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
  params.push(inspection.id);

  db.prepare(`UPDATE inspections SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`
    SELECT i.*, t.name as template_name, u.name as started_by_name
    FROM inspections i
    LEFT JOIN templates t ON t.id = i.template_id
    LEFT JOIN users u ON u.id = i.started_by
    WHERE i.id = ?
  `).get(inspection.id);

  res.json(updated);
});

// ---------------------------------------------------------------------------
// PUT /:id/items/:item_key — save single item response
// ---------------------------------------------------------------------------
router.put('/:id/items/:item_key', (req, res) => {
  const inspection = db.prepare(
    'SELECT * FROM inspections WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

  if (inspection.status !== 'in_progress') {
    return res.status(409).json({ error: 'Cannot modify items on a completed or abandoned inspection.' });
  }

  const { selected_option_id, response_text, is_flagged, is_failed, notes } = req.body;
  const itemKey = req.params.item_key;

  // Verify the item_key exists for this inspection
  const existing = db.prepare(
    'SELECT * FROM inspection_items WHERE inspection_id = ? AND item_key = ?'
  ).get(inspection.id, itemKey);
  if (!existing) return res.status(404).json({ error: 'Item not found for this inspection' });

  // If selected_option_id is provided, validate it exists
  if (selected_option_id !== undefined && selected_option_id !== null) {
    const option = db.prepare('SELECT id FROM answer_set_options WHERE id = ?').get(selected_option_id);
    if (!option) return res.status(400).json({ error: 'Invalid answer option' });
  }

  db.prepare(`
    UPDATE inspection_items
    SET selected_option_id = ?,
        response_text = ?,
        is_flagged = ?,
        is_failed = ?,
        notes = ?
    WHERE inspection_id = ? AND item_key = ?
  `).run(
    selected_option_id ?? null,
    response_text ?? null,
    is_flagged ? 1 : 0,
    is_failed ? 1 : 0,
    notes ?? null,
    inspection.id,
    itemKey,
  );

  const item = db.prepare(`
    SELECT ii.*, aso.label as selected_option_label, aso.score as selected_option_score,
           aso.color as selected_option_color
    FROM inspection_items ii
    LEFT JOIN answer_set_options aso ON aso.id = ii.selected_option_id
    WHERE ii.inspection_id = ? AND ii.item_key = ?
  `).get(inspection.id, itemKey);

  res.json(item);
});

// ---------------------------------------------------------------------------
// POST /:id/complete — complete the inspection
// ---------------------------------------------------------------------------
router.post('/:id/complete', (req, res) => {
  const inspection = db.prepare(
    'SELECT * FROM inspections WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

  if (inspection.status !== 'in_progress') {
    return res.status(409).json({ error: `Cannot complete — current status is "${inspection.status}"` });
  }

  db.prepare(`
    UPDATE inspections
    SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(inspection.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'inspection', ?, 'completed', ?, ?)
  `).run(
    req.user.org_id,
    inspection.id,
    `completed inspection ${inspection.inspection_number}`,
    req.user.id,
  );

  const updated = db.prepare(`
    SELECT i.*, t.name as template_name, u.name as started_by_name
    FROM inspections i
    LEFT JOIN templates t ON t.id = i.template_id
    LEFT JOIN users u ON u.id = i.started_by
    WHERE i.id = ?
  `).get(inspection.id);

  res.json(updated);
});

// ---------------------------------------------------------------------------
// POST /:id/abandon — abandon the inspection
// ---------------------------------------------------------------------------
router.post('/:id/abandon', (req, res) => {
  const inspection = db.prepare(
    'SELECT * FROM inspections WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

  if (inspection.status !== 'in_progress') {
    return res.status(409).json({ error: `Cannot abandon — current status is "${inspection.status}"` });
  }

  db.prepare(`
    UPDATE inspections
    SET status = 'abandoned', updated_at = datetime('now')
    WHERE id = ?
  `).run(inspection.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'inspection', ?, 'abandoned', ?, ?)
  `).run(
    req.user.org_id,
    inspection.id,
    `abandoned inspection ${inspection.inspection_number}`,
    req.user.id,
  );

  const updated = db.prepare(`
    SELECT i.*, t.name as template_name, u.name as started_by_name
    FROM inspections i
    LEFT JOIN templates t ON t.id = i.template_id
    LEFT JOIN users u ON u.id = i.started_by
    WHERE i.id = ?
  `).get(inspection.id);

  res.json(updated);
});

// ---------------------------------------------------------------------------
// GET /:id/report — generate structured inspection report
// ---------------------------------------------------------------------------
router.get('/:id/report', (req, res) => {
  const inspection = db.prepare(`
    SELECT i.*, t.name as template_name, u.name as started_by_name,
           tv.version_number as template_version_number
    FROM inspections i
    LEFT JOIN templates t ON t.id = i.template_id
    LEFT JOIN users u ON u.id = i.started_by
    LEFT JOIN template_versions tv ON tv.id = i.template_version_id
    WHERE i.id = ? AND i.org_id = ?
  `).get(req.params.id, req.user.org_id);

  if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

  const items = db.prepare(`
    SELECT ii.*, aso.label as selected_option_label, aso.score as selected_option_score,
           aso.color as selected_option_color, aso.is_failed as option_is_failed
    FROM inspection_items ii
    LEFT JOIN answer_set_options aso ON aso.id = ii.selected_option_id
    WHERE ii.inspection_id = ?
    ORDER BY ii.id ASC
  `).all(inspection.id);

  // Use version snapshot items if available, fall back to working copy
  let templateItems;
  if (inspection.template_version_id) {
    templateItems = db.prepare(`
      SELECT * FROM template_version_items
      WHERE version_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(inspection.template_version_id);
  } else {
    templateItems = db.prepare(`
      SELECT * FROM template_items
      WHERE template_id = ?
      ORDER BY sort_order ASC, id ASC
    `).all(inspection.template_id);
  }

  for (const ti of templateItems) {
    if (ti.meta) {
      try { ti.meta = JSON.parse(ti.meta); } catch { /* keep as string */ }
    }
  }

  // Build a lookup map for template items
  const tiMap = new Map();
  for (const ti of templateItems) {
    tiMap.set(ti.item_key, ti);
  }

  // Filter items by condition visibility
  const visibleKeys = evaluateVisibility(templateItems, items);
  const visibleItems = items.filter(i => visibleKeys.has(i.item_key));

  // Calculate stats (only visible items)
  const totalItems = visibleItems.length;
  const answeredItems = visibleItems.filter(
    i => i.selected_option_id !== null || (i.response_text !== null && i.response_text !== '')
  ).length;
  const flaggedCount = visibleItems.filter(i => i.is_flagged === 1).length;
  const failedCount = visibleItems.filter(i => i.is_failed === 1).length;

  // Calculate score from selected answer_set_options
  const scorableItems = visibleItems.filter(i => i.selected_option_id !== null);
  const totalScore = scorableItems.reduce((sum, i) => sum + (i.selected_option_score || 0), 0);
  const maxPossibleScore = scorableItems.length; // each scored item max = 1 (Pass/Yes)
  const scorePercent = maxPossibleScore > 0
    ? Math.round((totalScore / maxPossibleScore) * 100)
    : null;

  // Group items by section (parent_key)
  const sections = [];
  const sectionMap = new Map();

  // Identify sections from template items
  for (const ti of templateItems) {
    if (ti.type === 'section') {
      const section = {
        item_key: ti.item_key,
        label: ti.label,
        items: [],
      };
      sections.push(section);
      sectionMap.set(ti.item_key, section);
    }
  }

  // Add an "Ungrouped" section for items without a parent
  const ungrouped = { item_key: null, label: 'Ungrouped', items: [] };

  // Place each visible item into its section
  for (const item of visibleItems) {
    const ti = tiMap.get(item.item_key);
    const parentKey = ti?.parent_key || null;

    // Enrich item with template label
    item.label = ti?.label || null;
    item.template_type = ti?.type || item.type;

    if (parentKey && sectionMap.has(parentKey)) {
      sectionMap.get(parentKey).items.push(item);
    } else {
      ungrouped.items.push(item);
    }
  }

  // Only include ungrouped if it has items
  const allSections = ungrouped.items.length > 0
    ? [ungrouped, ...sections]
    : sections;

  res.json({
    inspection: {
      id: inspection.id,
      inspection_number: inspection.inspection_number,
      title: inspection.title,
      template_name: inspection.template_name,
      template_version_number: inspection.template_version_number || null,
      status: inspection.status,
      conducted_on: inspection.conducted_on,
      location: inspection.location,
      started_by_name: inspection.started_by_name,
      completed_at: inspection.completed_at,
      created_at: inspection.created_at,
    },
    stats: {
      total_items: totalItems,
      answered_items: answeredItems,
      flagged_count: flaggedCount,
      failed_count: failedCount,
      score_percent: scorePercent,
      total_score: totalScore,
      max_possible_score: maxPossibleScore,
    },
    sections: allSections,
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete inspection
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to delete inspections.' });
  }

  const inspection = db.prepare(
    'SELECT * FROM inspections WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

  // CASCADE will delete inspection_items automatically
  db.prepare('DELETE FROM inspections WHERE id = ?').run(inspection.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'inspection', ?, 'deleted', ?, ?)
  `).run(
    req.user.org_id,
    inspection.id,
    `deleted inspection ${inspection.inspection_number}`,
    req.user.id,
  );

  res.json({ success: true });
});

export default router;
