import { Router } from 'express';
import db from '../db/connection.js';
import { nextRiskNumber } from '../services/numbering.js';
import { calculateSeverityAndTrack } from '../services/auto_classify.js';
import { writeActivity, diffFields } from '../services/activity_log.js';

const router = Router();
const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const VALID_CATEGORIES = new Set([
  'safety','health','environmental','ergonomic',
  'chemical','biological','physical','psychosocial','other',
]);

const VALID_CONTROL_TYPES = new Set([
  'elimination','substitution','engineering','administrative','ppe',
]);

const STATUS_TRANSITIONS = {
  Identified:  ['Assessed'],
  Assessed:    ['Mitigating'],
  Mitigating:  ['Controlled'],
  Controlled:  ['Accepted', 'Closed'],
  Accepted:    ['Closed'],
  Closed:      [],
};

const UPDATABLE_FIELDS = ['title', 'description', 'category', 'source', 'assigned_to', 'owner_id', 'review_date'];

// ── List ─────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { org_id } = req.user;
  const { status, category, site_id, search, inherent_level, residual_level, page = 1, limit = 50 } = req.query;

  const where = ['r.org_id = ?'];
  const params = [org_id];

  if (status) { where.push('r.status = ?'); params.push(status); }
  if (category) { where.push('r.category = ?'); params.push(category); }
  if (site_id) { where.push('r.site_id = ?'); params.push(Number(site_id)); }
  if (inherent_level) { where.push('r.inherent_risk_level = ?'); params.push(inherent_level); }
  if (residual_level) { where.push('r.residual_risk_level = ?'); params.push(residual_level); }
  if (search) {
    where.push("(r.risk_number LIKE ? OR r.title LIKE ? OR r.description LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const wc = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) as c FROM risks r WHERE ${wc}`).get(...params).c;
  const offset = (Number(page) - 1) * Number(limit);

  const risks = db.prepare(`
    SELECT r.*,
      s.name AS site_name,
      u1.name AS identified_by_name, u1.initials AS identified_by_initials,
      u2.name AS assigned_to_name, u2.initials AS assigned_to_initials,
      u3.name AS owner_name, u3.initials AS owner_initials
    FROM risks r
    LEFT JOIN sites s ON s.id = r.site_id
    LEFT JOIN users u1 ON u1.id = r.identified_by
    LEFT JOIN users u2 ON u2.id = r.assigned_to
    LEFT JOIN users u3 ON u3.id = r.owner_id
    WHERE ${wc}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  // Stats must respect the site filter — otherwise the count tiles on the
  // risks page stay at org-wide totals when the user picks a single site,
  // which makes the page look broken ("filter shows 3 rows but the
  // critical-high tile says 7").
  const statsWhere = ['org_id = ?'];
  const statsParams = [org_id];
  if (site_id) { statsWhere.push('site_id = ?'); statsParams.push(Number(site_id)); }
  const stats = db.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE status != 'Closed') AS active,
      COUNT(*) FILTER (WHERE status = 'Identified') AS identified,
      COUNT(*) FILTER (WHERE status = 'Assessed') AS assessed,
      COUNT(*) FILTER (WHERE status = 'Mitigating') AS mitigating,
      COUNT(*) FILTER (WHERE status = 'Controlled') AS controlled,
      COUNT(*) FILTER (WHERE status = 'Accepted') AS accepted,
      COUNT(*) FILTER (WHERE status = 'Closed') AS closed,
      COUNT(*) FILTER (WHERE inherent_risk_level IN ('crit','high') AND status != 'Closed') AS critical_high,
      COUNT(*) FILTER (WHERE review_date IS NOT NULL AND review_date <= date('now','+30 days') AND status != 'Closed') AS review_due
    FROM risks WHERE ${statsWhere.join(' AND ')}
  `).get(...statsParams);

  res.json({ risks, total, page: Number(page), limit: Number(limit), stats });
});

// ── Matrix heatmap data ──────────────────────────────────────────────
router.get('/matrix', (req, res) => {
  const { org_id } = req.user;
  const { site_id } = req.query;

  // Same site filter as the list endpoint — the matrix view is just a
  // different rendering of the same underlying rows, so the two views
  // must agree when a site is selected. Without this, the matrix shows
  // org-wide counts that disagree with the filtered list.
  const where = ["org_id = ?", "status != 'Closed'"];
  const params = [org_id];
  if (site_id) { where.push('site_id = ?'); params.push(Number(site_id)); }

  const inherent = db.prepare(`
    SELECT inherent_likelihood AS likelihood, inherent_consequence AS consequence,
      COUNT(*) AS count
    FROM risks
    WHERE ${where.join(' AND ')} AND inherent_likelihood IS NOT NULL
    GROUP BY inherent_likelihood, inherent_consequence
  `).all(...params);

  const residual = db.prepare(`
    SELECT residual_likelihood AS likelihood, residual_consequence AS consequence,
      COUNT(*) AS count
    FROM risks
    WHERE ${where.join(' AND ')} AND residual_likelihood IS NOT NULL
    GROUP BY residual_likelihood, residual_consequence
  `).all(...params);

  const matrixRef = db.prepare('SELECT * FROM risk_matrix_cells').all();

  res.json({ inherent, residual, matrixRef });
});

// ── Detail ───────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const risk = db.prepare(`
    SELECT r.*,
      s.name AS site_name,
      u1.name AS identified_by_name, u1.initials AS identified_by_initials,
      u2.name AS assigned_to_name, u2.initials AS assigned_to_initials,
      u3.name AS owner_name, u3.initials AS owner_initials,
      u4.name AS accepted_by_name,
      u5.name AS closed_by_name
    FROM risks r
    LEFT JOIN sites s ON s.id = r.site_id
    LEFT JOIN users u1 ON u1.id = r.identified_by
    LEFT JOIN users u2 ON u2.id = r.assigned_to
    LEFT JOIN users u3 ON u3.id = r.owner_id
    LEFT JOIN users u4 ON u4.id = r.accepted_by
    LEFT JOIN users u5 ON u5.id = r.closed_by
    WHERE r.id = ? AND r.org_id = ?
  `).get(req.params.id, req.user.org_id);

  if (!risk) return res.status(404).json({ error: 'Risk not found' });

  risk.controls = db.prepare(`
    SELECT rc.*,
      u1.name AS implemented_by_name,
      u2.name AS verified_by_name
    FROM risk_controls rc
    LEFT JOIN users u1 ON u1.id = rc.implemented_by
    LEFT JOIN users u2 ON u2.id = rc.verified_by
    WHERE rc.risk_id = ?
    ORDER BY rc.created_at ASC
  `).all(risk.id);

  risk.attachments = db.prepare(
    "SELECT * FROM attachments WHERE entity_type = 'risk' AND entity_id = ? ORDER BY created_at DESC"
  ).all(risk.id);

  risk.activity = db.prepare(`
    SELECT al.*, u.name AS user_name, u.initials AS user_initials
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.entity_type = 'risk' AND al.entity_id = ?
    ORDER BY al.created_at DESC
  `).all(risk.id);

  risk.activity.forEach(a => {
    try { a.metadata = JSON.parse(a.metadata || '{}'); } catch { a.metadata = {}; }
  });

  res.json(risk);
});

// ── Create ───────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const { title, site_id, category, description, source, assigned_to, owner_id, review_date } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!site_id) return res.status(400).json({ error: 'Site is required' });
  if (!category || !VALID_CATEGORIES.has(category)) return res.status(400).json({ error: 'Valid category is required' });

  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND org_id = ?').get(site_id, req.user.org_id);
  if (!site) return res.status(400).json({ error: 'Site not found' });

  if (assigned_to) {
    const u = db.prepare('SELECT id FROM users WHERE id = ? AND org_id = ?').get(assigned_to, req.user.org_id);
    if (!u) return res.status(400).json({ error: 'Assigned user not found' });
  }
  if (owner_id) {
    const u = db.prepare('SELECT id FROM users WHERE id = ? AND org_id = ?').get(owner_id, req.user.org_id);
    if (!u) return res.status(400).json({ error: 'Owner not found' });
  }

  const risk_number = nextRiskNumber();
  const result = db.prepare(`
    INSERT INTO risks (risk_number, org_id, site_id, title, description, category, source,
      identified_by, assigned_to, owner_id, review_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(risk_number, req.user.org_id, site_id, title.trim(), description || '', category,
    source || null, req.user.id, assigned_to || null, owner_id || null, review_date || null);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: result.lastInsertRowid,
    action: 'created',
    description: `registered risk ${risk_number} — ${title.trim()}`,
    user_id: req.user.id,
  });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(risk);
});

// ── Update ───────────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });
  if (risk.status === 'Closed') return res.status(400).json({ error: 'Cannot update a closed risk' });

  const sets = [];
  const params = [];
  for (const f of UPDATABLE_FIELDS) {
    if (req.body[f] !== undefined) {
      if (f === 'category' && !VALID_CATEGORIES.has(req.body[f])) {
        return res.status(400).json({ error: 'Invalid category' });
      }
      sets.push(`${f} = ?`);
      params.push(req.body[f] || null);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No valid fields to update' });

  sets.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE risks SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const meta = diffFields(risk, req.body, UPDATABLE_FIELDS);
  if (meta) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'risk',
      entity_id: risk.id,
      action: 'updated',
      description: `updated risk ${risk.risk_number}`,
      user_id: req.user.id,
      metadata: meta,
    });
  }

  const updated = db.prepare('SELECT * FROM risks WHERE id = ?').get(risk.id);
  res.json(updated);
});

// ── Assess (Identified → Assessed) ──────────────────────────────────
router.post('/:id/assess', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });
  if (risk.status !== 'Identified') return res.status(400).json({ error: `Cannot assess from status "${risk.status}"` });

  const { inherent_likelihood, inherent_consequence } = req.body;
  if (inherent_likelihood == null || inherent_consequence == null) {
    return res.status(400).json({ error: 'Likelihood and consequence are required' });
  }
  const l = Number(inherent_likelihood);
  const c = Number(inherent_consequence);
  if (l < 0 || l > 4 || c < 0 || c > 4) {
    return res.status(400).json({ error: 'Likelihood and consequence must be 0-4' });
  }

  const { severity, track, riskLevel } = calculateSeverityAndTrack(l, c, null);

  db.prepare(`
    UPDATE risks SET
      inherent_likelihood = ?, inherent_consequence = ?,
      inherent_severity = ?, inherent_track = ?, inherent_risk_level = ?,
      status = 'Assessed', updated_at = datetime('now')
    WHERE id = ?
  `).run(l, c, severity, track, riskLevel, risk.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: risk.id,
    action: 'assessed',
    description: `assessed ${risk.risk_number} — inherent risk: S${severity} ${riskLevel.toUpperCase()} (Track ${track})`,
    user_id: req.user.id,
    metadata: { inherent_likelihood: l, inherent_consequence: c, severity, track, riskLevel },
  });

  const updated = db.prepare('SELECT * FROM risks WHERE id = ?').get(risk.id);
  res.json(updated);
});

// ── Mitigate (Assessed → Mitigating) ────────────────────────────────
router.post('/:id/mitigate', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });
  if (risk.status !== 'Assessed') return res.status(400).json({ error: `Cannot start mitigation from status "${risk.status}"` });

  db.prepare("UPDATE risks SET status = 'Mitigating', updated_at = datetime('now') WHERE id = ?").run(risk.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: risk.id,
    action: 'mitigation_started',
    description: `began mitigation on ${risk.risk_number}`,
    user_id: req.user.id,
  });

  const updated = db.prepare('SELECT * FROM risks WHERE id = ?').get(risk.id);
  res.json(updated);
});

// ── Control (Mitigating → Controlled) ────────────────────────────────
router.post('/:id/control', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });
  if (risk.status !== 'Mitigating') return res.status(400).json({ error: `Cannot mark controlled from status "${risk.status}"` });

  const controlCount = db.prepare('SELECT COUNT(*) AS c FROM risk_controls WHERE risk_id = ?').get(risk.id).c;
  if (controlCount === 0) return res.status(400).json({ error: 'At least one control must be added before marking as controlled' });

  const { residual_likelihood, residual_consequence } = req.body;
  if (residual_likelihood == null || residual_consequence == null) {
    return res.status(400).json({ error: 'Residual likelihood and consequence are required' });
  }
  const l = Number(residual_likelihood);
  const c = Number(residual_consequence);
  if (l < 0 || l > 4 || c < 0 || c > 4) {
    return res.status(400).json({ error: 'Likelihood and consequence must be 0-4' });
  }

  const { severity, track, riskLevel } = calculateSeverityAndTrack(l, c, null);

  db.prepare(`
    UPDATE risks SET
      residual_likelihood = ?, residual_consequence = ?,
      residual_severity = ?, residual_track = ?, residual_risk_level = ?,
      status = 'Controlled', updated_at = datetime('now')
    WHERE id = ?
  `).run(l, c, severity, track, riskLevel, risk.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: risk.id,
    action: 'controlled',
    description: `marked ${risk.risk_number} as controlled — residual risk: S${severity} ${riskLevel.toUpperCase()} (Track ${track})`,
    user_id: req.user.id,
    metadata: { residual_likelihood: l, residual_consequence: c, severity, track, riskLevel },
  });

  const updated = db.prepare('SELECT * FROM risks WHERE id = ?').get(risk.id);
  res.json(updated);
});

// ── Accept (Controlled → Accepted) ──────────────────────────────────
router.post('/:id/accept', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });
  if (risk.status !== 'Controlled') return res.status(400).json({ error: `Cannot accept from status "${risk.status}"` });

  const { accepted_justification } = req.body;
  if (!accepted_justification?.trim()) return res.status(400).json({ error: 'Justification is required' });

  db.prepare(`
    UPDATE risks SET status = 'Accepted',
      accepted_by = ?, accepted_at = datetime('now'),
      accepted_justification = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id, accepted_justification.trim(), risk.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: risk.id,
    action: 'accepted',
    description: `accepted ${risk.risk_number} — ${accepted_justification.trim().substring(0, 80)}`,
    user_id: req.user.id,
    metadata: { justification: accepted_justification.trim() },
  });

  const updated = db.prepare('SELECT * FROM risks WHERE id = ?').get(risk.id);
  res.json(updated);
});

// ── Close (Controlled|Accepted → Closed) ─────────────────────────────
router.post('/:id/close', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });
  if (!['Controlled', 'Accepted'].includes(risk.status)) {
    return res.status(400).json({ error: `Cannot close from status "${risk.status}"` });
  }

  const { closed_reason } = req.body;
  db.prepare(`
    UPDATE risks SET status = 'Closed',
      closed_by = ?, closed_at = datetime('now'),
      closed_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id, closed_reason || null, risk.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: risk.id,
    action: 'closed',
    description: `closed ${risk.risk_number}${closed_reason ? ' — ' + closed_reason.substring(0, 80) : ''}`,
    user_id: req.user.id,
  });

  const updated = db.prepare('SELECT * FROM risks WHERE id = ?').get(risk.id);
  res.json(updated);
});

// ── Add control ──────────────────────────────────────────────────────
router.post('/:id/controls', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });
  if (risk.status === 'Closed') return res.status(400).json({ error: 'Cannot add controls to a closed risk' });

  const { title, control_type, description, notes } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!control_type || !VALID_CONTROL_TYPES.has(control_type)) {
    return res.status(400).json({ error: 'Valid control type is required' });
  }

  const result = db.prepare(`
    INSERT INTO risk_controls (risk_id, org_id, title, description, control_type, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(risk.id, req.user.org_id, title.trim(), description || null, control_type, notes || null);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: risk.id,
    action: 'control_added',
    description: `added ${control_type} control "${title.trim()}" to ${risk.risk_number}`,
    user_id: req.user.id,
  });

  const control = db.prepare('SELECT * FROM risk_controls WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(control);
});

// ── Update control ───────────────────────────────────────────────────
router.patch('/:id/controls/:controlId', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });

  const ctrl = db.prepare('SELECT * FROM risk_controls WHERE id = ? AND risk_id = ?').get(req.params.controlId, risk.id);
  if (!ctrl) return res.status(404).json({ error: 'Control not found' });

  const allowed = ['title', 'description', 'control_type', 'effectiveness', 'implemented_at', 'implemented_by', 'verified_at', 'verified_by', 'notes'];
  const sets = [];
  const params = [];
  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      if (f === 'control_type' && !VALID_CONTROL_TYPES.has(req.body[f])) {
        return res.status(400).json({ error: 'Invalid control type' });
      }
      sets.push(`${f} = ?`);
      params.push(req.body[f] ?? null);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No valid fields to update' });

  sets.push("updated_at = datetime('now')");
  params.push(ctrl.id);
  db.prepare(`UPDATE risk_controls SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: risk.id,
    action: 'control_updated',
    description: `updated control "${ctrl.title}" on ${risk.risk_number}`,
    user_id: req.user.id,
  });

  const updated = db.prepare('SELECT * FROM risk_controls WHERE id = ?').get(ctrl.id);
  res.json(updated);
});

// ── Delete control ───────────────────────────────────────────────────
router.delete('/:id/controls/:controlId', (req, res) => {
  if (!ELEVATED.has(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const risk = db.prepare('SELECT * FROM risks WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!risk) return res.status(404).json({ error: 'Risk not found' });
  if (risk.status === 'Closed') return res.status(400).json({ error: 'Cannot remove controls from a closed risk' });

  const ctrl = db.prepare('SELECT * FROM risk_controls WHERE id = ? AND risk_id = ?').get(req.params.controlId, risk.id);
  if (!ctrl) return res.status(404).json({ error: 'Control not found' });

  db.prepare('DELETE FROM risk_controls WHERE id = ?').run(ctrl.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'risk',
    entity_id: risk.id,
    action: 'control_removed',
    description: `removed control "${ctrl.title}" from ${risk.risk_number}`,
    user_id: req.user.id,
  });

  res.json({ success: true });
});

export default router;
