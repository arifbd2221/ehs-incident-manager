import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

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
    SELECT c.*, inv.investigation_number, inv.incident_id,
           o.name as owner_name, o.initials as owner_initials,
           v.name as verifier_name, v.initials as verifier_initials
    FROM capas c
    LEFT JOIN investigations inv ON inv.id = c.investigation_id
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
    SELECT c.*, inv.investigation_number, inv.incident_id,
           o.name as owner_name, o.initials as owner_initials,
           v.name as verifier_name, v.initials as verifier_initials
    FROM capas c
    LEFT JOIN investigations inv ON inv.id = c.investigation_id
    LEFT JOIN users o ON o.id = c.owner_id
    LEFT JOIN users v ON v.id = c.verifier_id
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

router.patch('/:id', (req, res) => {
  const capa = db.prepare('SELECT * FROM capas WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!capa) return res.status(404).json({ error: 'CAPA not found' });

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
    db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'capa', ?, 'progress_updated', ?, ?)`)
      .run(capa.org_id, capa.id, `updated progress to ${req.body.progress}%`, req.user.id);
  }

  const updated = db.prepare('SELECT * FROM capas WHERE id = ?').get(capa.id);
  updated.overdue = updated.status !== 'closed' && updated.due_date && new Date(updated.due_date) < new Date();
  res.json(updated);
});

router.post('/:id/complete', (req, res) => {
  const capa = db.prepare('SELECT * FROM capas WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!capa) return res.status(404).json({ error: 'CAPA not found' });

  const { completion_notes } = req.body;

  db.prepare(`
    UPDATE capas SET status = 'verify', progress = 100, completed_at = datetime('now'), completed_by = ?, completion_notes = ?, updated_at = datetime('now') WHERE id = ?
  `).run(req.user.id, completion_notes || null, capa.id);

  db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'capa', ?, 'completed', ?, ?)`)
    .run(capa.org_id, capa.id, `marked ${capa.capa_number} complete — submitted for verification`, req.user.id);

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

  const updated = db.prepare('SELECT * FROM capas WHERE id = ?').get(capa.id);
  res.json(updated);
});

export default router;
