import { Router } from 'express';
import db from '../db/connection.js';
import { nextCapaNumber } from '../services/numbering.js';
import { notifyUser } from '../services/notifications.js';
import { isElevated, requireAssigneeOrElevated } from '../services/permissions.js';

const router = Router();

// Shared INSERT used by both /capas (polymorphic) and /incidents/:id/create-capa.
// Validates source_type ↔ id shape against the migration-003 CHECK constraint
// and the owner != verifier rule (DB trigger enforces, but fail-fast is friendlier).
// Returns the created row, throws an Error with `.statusCode` on validation failure.
function createCapaRow({ orgId, sourceType, investigationId, incidentId, maintenanceScheduleId, body, userId }) {
  const {
    title, description, type, priority, category,
    owner_id, verifier_id, due_date,
  } = body;

  if (!title || !owner_id || !verifier_id || !due_date) {
    const err = new Error('Title, owner, verifier, and due date are required');
    err.statusCode = 400;
    throw err;
  }
  if (Number(owner_id) === Number(verifier_id)) {
    const err = new Error('Owner and verifier must be different people');
    err.statusCode = 400;
    throw err;
  }

  const safeType = type === 'preventive' ? 'preventive' : 'corrective';
  const safePriority = ['critical', 'high', 'medium', 'low'].includes(priority) ? priority : 'medium';

  // Source-shape validation mirrors the table-level CHECK so we 400 on mismatch
  // instead of letting SQLite throw a generic constraint error.
  if (sourceType === 'investigation') {
    if (!investigationId || incidentId) {
      const err = new Error('source_type=investigation requires investigation_id and forbids incident_id');
      err.statusCode = 400;
      throw err;
    }
    const inv = db.prepare('SELECT id FROM investigations WHERE id = ? AND org_id = ?').get(investigationId, orgId);
    if (!inv) {
      const err = new Error('Investigation not found in your organization');
      err.statusCode = 404;
      throw err;
    }
  } else if (sourceType === 'incident') {
    if (!incidentId || investigationId) {
      const err = new Error('source_type=incident requires incident_id and forbids investigation_id');
      err.statusCode = 400;
      throw err;
    }
    const inc = db.prepare('SELECT id FROM incidents WHERE id = ? AND org_id = ?').get(incidentId, orgId);
    if (!inc) {
      const err = new Error('Incident not found in your organization');
      err.statusCode = 404;
      throw err;
    }
  } else if (sourceType === 'proactive') {
    if (investigationId || incidentId) {
      const err = new Error('source_type=proactive forbids both investigation_id and incident_id');
      err.statusCode = 400;
      throw err;
    }
  } else {
    const err = new Error('source_type must be one of: investigation | incident | proactive');
    err.statusCode = 400;
    throw err;
  }

  // Cross-org for owner/verifier: must belong to same org as the requester.
  const owner = db.prepare('SELECT id FROM users WHERE id = ? AND org_id = ?').get(owner_id, orgId);
  const verifier = db.prepare('SELECT id FROM users WHERE id = ? AND org_id = ?').get(verifier_id, orgId);
  if (!owner || !verifier) {
    const err = new Error('Owner and verifier must be users in your organization');
    err.statusCode = 400;
    throw err;
  }

  const capaNumber = nextCapaNumber();

  const result = db.prepare(`
    INSERT INTO capas (
      capa_number, source_type, investigation_id, incident_id, org_id,
      title, description, type, priority, category,
      owner_id, verifier_id, due_date,
      maintenance_schedule_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    capaNumber, sourceType, investigationId || null, incidentId || null, orgId,
    title, description || null, safeType, safePriority, category || null,
    Number(owner_id), Number(verifier_id), due_date,
    maintenanceScheduleId || null,
  );

  const capaId = result.lastInsertRowid;
  const sourceRef =
    sourceType === 'investigation'
      ? db.prepare('SELECT investigation_number FROM investigations WHERE id = ?').get(investigationId)?.investigation_number
      : sourceType === 'incident'
      ? db.prepare('SELECT incident_number FROM incidents WHERE id = ?').get(incidentId)?.incident_number
      : null;

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'capa', ?, 'created', ?, ?)
  `).run(
    orgId, capaId,
    sourceType === 'proactive'
      ? `created proactive CAPA ${capaNumber}`
      : `created CAPA ${capaNumber} from ${sourceRef || sourceType}`,
    userId,
  );

  notifyUser({
    orgId, userId: Number(owner_id), type: 'capa_assigned',
    title: `CAPA assigned to you — ${capaNumber}`,
    body: `${title} · due ${due_date}`,
    severity: 'warn',
  });

  return capaId;
}

export { createCapaRow };

router.get('/', (req, res) => {
  const { status, owner_id, overdue, search, page = 1, limit = 50 } = req.query;
  const orgId = req.user.org_id;

  let where = ['c.org_id = ?'];
  let params = [orgId];

  if (search) {
    where.push("(c.capa_number LIKE ? OR c.title LIKE ? OR c.description LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) { where.push('c.status = ?'); params.push(status); }
  if (owner_id) { where.push('c.owner_id = ?'); params.push(Number(owner_id)); }
  if (overdue === '1') { where.push("c.due_date < datetime('now') AND c.status NOT IN ('closed')"); }

  const whereClause = where.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(`SELECT COUNT(*) as count FROM capas c WHERE ${whereClause}`).get(...params).count;

  const capas = db.prepare(`
    SELECT c.*, inv.investigation_number, COALESCE(inv.incident_id, c.incident_id) as incident_id,
           src_inc.incident_number as incident_number,
           o.name as owner_name, o.initials as owner_initials,
           v.name as verifier_name, v.initials as verifier_initials
    FROM capas c
    LEFT JOIN investigations inv ON inv.id = c.investigation_id
    LEFT JOIN incidents src_inc ON src_inc.id = c.incident_id
    LEFT JOIN users o ON o.id = c.owner_id
    LEFT JOIN users v ON v.id = c.verifier_id
    WHERE ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  for (const c of capas) {
    c.overdue = c.status !== 'closed' && c.due_date && new Date(c.due_date) < new Date();
  }

  const stats = {
    total: db.prepare('SELECT COUNT(*) as c FROM capas WHERE org_id = ? AND status != ?').get(orgId, 'closed').c,
    overdue: db.prepare("SELECT COUNT(*) as c FROM capas WHERE org_id = ? AND due_date < datetime('now') AND status NOT IN ('closed')").get(orgId).c,
    corrective: db.prepare("SELECT COUNT(*) as c FROM capas WHERE org_id = ? AND type = 'corrective' AND status != 'closed'").get(orgId).c,
    preventive: db.prepare("SELECT COUNT(*) as c FROM capas WHERE org_id = ? AND type = 'preventive' AND status != 'closed'").get(orgId).c,
    pendingVerification: db.prepare("SELECT COUNT(*) as c FROM capas WHERE org_id = ? AND status = 'verify'").get(orgId).c,
  };

  res.json({ capas, total, stats, page: Number(page), limit: Number(limit) });
});

router.get('/:id', (req, res) => {
  const capa = db.prepare(`
    SELECT c.*, inv.investigation_number, COALESCE(inv.incident_id, c.incident_id) as incident_id,
           src_inc.incident_number as incident_number,
           o.name as owner_name, o.initials as owner_initials,
           v.name as verifier_name, v.initials as verifier_initials,
           ms.title as maintenance_schedule_title,
           ms.asset_id as maintenance_asset_id,
           ma.name as maintenance_asset_name,
           ma.display_id as maintenance_asset_display_id
    FROM capas c
    LEFT JOIN investigations inv ON inv.id = c.investigation_id
    LEFT JOIN incidents src_inc ON src_inc.id = c.incident_id
    LEFT JOIN users o ON o.id = c.owner_id
    LEFT JOIN users v ON v.id = c.verifier_id
    LEFT JOIN asset_maintenance_schedules ms ON ms.id = c.maintenance_schedule_id
    LEFT JOIN assets ma ON ma.id = ms.asset_id
    WHERE c.id = ? AND c.org_id = ?
  `).get(req.params.id, req.user.org_id);

  if (!capa) return res.status(404).json({ error: 'CAPA not found' });

  capa.overdue = capa.status !== 'closed' && capa.due_date && new Date(capa.due_date) < new Date();

  capa.attachments = db.prepare("SELECT * FROM attachments WHERE entity_type = 'capa' AND entity_id = ?").all(capa.id);

  capa.activity = db.prepare(`
    SELECT al.*, u.name as user_name, u.initials as user_initials
    FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
    WHERE al.entity_type = 'capa' AND al.entity_id = ?
    ORDER BY al.created_at DESC
  `).all(capa.id);

  res.json(capa);
});

// Polymorphic CAPA create. Accepts source_type ∈ {investigation, incident, proactive}.
// Elevated roles only (matches assign-capa intent on investigations).
router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create CAPAs.' });
  }
  try {
    const { source_type, investigation_id, incident_id } = req.body;
    const capaId = createCapaRow({
      orgId: req.user.org_id,
      sourceType: source_type,
      investigationId: investigation_id || null,
      incidentId: incident_id || null,
      body: req.body,
      userId: req.user.id,
    });
    const capa = db.prepare(`
      SELECT c.*, inv.investigation_number, src_inc.incident_number as incident_number
      FROM capas c
      LEFT JOIN investigations inv ON inv.id = c.investigation_id
      LEFT JOIN incidents src_inc ON src_inc.id = c.incident_id
      WHERE c.id = ?
    `).get(capaId);
    res.status(201).json(capa);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

router.patch('/:id', (req, res) => {
  const capa = db.prepare('SELECT * FROM capas WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!capa) return res.status(404).json({ error: 'CAPA not found' });
  if (!requireAssigneeOrElevated(req, res, capa, 'owner_id', 'this CAPA')) return;

  const updatable = ['title', 'description', 'priority', 'progress', 'status', 'due_date', 'category'];
  const sets = [];
  const params = [];

  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  sets.push("updated_at = datetime('now')");
  params.push(capa.id);

  db.prepare(`UPDATE capas SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  if (req.body.progress !== undefined) {
    const note = (req.body.progress_note || '').trim();
    const desc = note
      ? `updated progress to ${req.body.progress}% — ${note.slice(0, 120)}`
      : `updated progress to ${req.body.progress}%`;
    const metadata = JSON.stringify({
      note: note || null,
      previous_progress: capa.progress || 0,
    });
    db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata) VALUES (?, 'capa', ?, 'progress_updated', ?, ?, ?)`)
      .run(capa.org_id, capa.id, desc, req.user.id, metadata);
  }

  const updated = db.prepare('SELECT * FROM capas WHERE id = ?').get(capa.id);
  updated.overdue = updated.status !== 'closed' && updated.due_date && new Date(updated.due_date) < new Date();
  res.json(updated);
});

router.post('/:id/complete', (req, res) => {
  const capa = db.prepare('SELECT * FROM capas WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!capa) return res.status(404).json({ error: 'CAPA not found' });
  if (!requireAssigneeOrElevated(req, res, capa, 'owner_id', 'this CAPA')) return;

  const { completion_notes } = req.body;

  db.prepare(`
    UPDATE capas SET status = 'verify', progress = 100, completed_at = datetime('now'), completed_by = ?, completion_notes = ?, updated_at = datetime('now') WHERE id = ?
  `).run(req.user.id, completion_notes || null, capa.id);

  db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'capa', ?, 'completed', ?, ?)`)
    .run(capa.org_id, capa.id, `marked ${capa.capa_number} complete — submitted for verification`, req.user.id);

  notifyUser({
    orgId: capa.org_id, userId: capa.verifier_id, type: 'capa_completed',
    title: `CAPA ready for verification — ${capa.capa_number}`,
    body: `${capa.title} has been completed and needs your review.`,
    severity: 'warn',
  });

  const updated = db.prepare('SELECT * FROM capas WHERE id = ?').get(capa.id);
  res.json(updated);
});

router.post('/:id/verify', (req, res) => {
  const capa = db.prepare('SELECT * FROM capas WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!capa) return res.status(404).json({ error: 'CAPA not found' });

  if (req.user.id === capa.owner_id) {
    return res.status(403).json({ error: 'Owner cannot self-verify. An independent verifier must confirm effectiveness.' });
  }

  const { result, notes } = req.body;

  db.prepare(`
    UPDATE capas SET status = 'closed', verified_at = datetime('now'), verified_by = ?, verification_result = ?, verification_notes = ?, closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(req.user.id, result || 'effective', notes || null, capa.id);

  db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'capa', ?, 'verified', ?, ?)`)
    .run(capa.org_id, capa.id, `verified ${capa.capa_number} — ${result || 'effective'}`, req.user.id);

  const updated = db.prepare('SELECT * FROM capas WHERE id = ?').get(capa.id);
  res.json(updated);
});

router.post('/:id/reject', (req, res) => {
  const capa = db.prepare('SELECT * FROM capas WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!capa) return res.status(404).json({ error: 'CAPA not found' });

  const { notes } = req.body;

  db.prepare(`
    UPDATE capas SET status = 'progress', progress = 80, verification_notes = ?, updated_at = datetime('now') WHERE id = ?
  `).run(notes || 'Rejected — needs more work', capa.id);

  db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'capa', ?, 'rejected', ?, ?)`)
    .run(capa.org_id, capa.id, `rejected ${capa.capa_number} — needs more work`, req.user.id);

  notifyUser({
    orgId: capa.org_id, userId: capa.owner_id, type: 'capa_rejected',
    title: `CAPA rejected — ${capa.capa_number}`,
    body: notes || 'Needs more work. Please review and resubmit.',
    severity: 'err',
  });

  const updated = db.prepare('SELECT * FROM capas WHERE id = ?').get(capa.id);
  res.json(updated);
});

export default router;
