import { Router } from 'express';
import db from '../db/connection.js';
import { nextInvestigationNumber, nextCapaNumber } from '../services/numbering.js';
import { listLinksTouching } from '../services/entity_links.js';

const router = Router();

router.get('/', (req, res) => {
  const { status, site_id, search, page = 1, limit = 50 } = req.query;
  const orgId = req.user.org_id;

  let where = ['inv.org_id = ?'];
  let params = [orgId];

  if (search) {
    where.push("(inv.investigation_number LIKE ? OR i.title LIKE ? OR inv.findings LIKE ? OR inv.root_cause_summary LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) { where.push('inv.status = ?'); params.push(status); }
  if (site_id) { where.push('i.site_id = ?'); params.push(Number(site_id)); }

  const whereClause = where.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(`SELECT COUNT(*) as count FROM investigations inv LEFT JOIN incidents i ON i.id = inv.incident_id WHERE ${whereClause}`).get(...params).count;

  const investigations = db.prepare(`
    SELECT inv.*, i.title as incident_title, i.type as incident_type, i.severity, i.incident_number,
           i.site_id, s.name as site_name, i.area as location,
           i.osha_recordable, i.riddor_reportable, i.riddor_category,
           u.name as lead_name, u.initials as lead_initials,
           i.reported_by, r.name as reporter_name
    FROM investigations inv
    LEFT JOIN incidents i ON i.id = inv.incident_id
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = inv.lead_investigator
    LEFT JOIN users r ON r.id = i.reported_by
    WHERE ${whereClause}
    ORDER BY inv.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  for (const inv of investigations) {
    inv.team = db.prepare(`
      SELECT it.*, u.name, u.initials FROM investigation_team it
      LEFT JOIN users u ON u.id = it.user_id WHERE it.investigation_id = ?
    `).all(inv.id);
    inv.capa_count = db.prepare('SELECT COUNT(*) as c FROM capas WHERE investigation_id = ?').get(inv.id).c;
  }

  res.json({ investigations, total, page: Number(page), limit: Number(limit) });
});

router.get('/:id', (req, res) => {
  const inv = db.prepare(`
    SELECT inv.*, i.title as incident_title, i.type as incident_type, i.severity, i.track as incident_track,
           i.incident_number, i.description as incident_description, i.incident_datetime,
           i.site_id, s.name as site_name, i.area as location, i.reported_by,
           i.osha_recordable, i.riddor_reportable,
           u.name as lead_name, u.initials as lead_initials,
           r.name as reporter_name, r.initials as reporter_initials
    FROM investigations inv
    LEFT JOIN incidents i ON i.id = inv.incident_id
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = inv.lead_investigator
    LEFT JOIN users r ON r.id = i.reported_by
    WHERE inv.id = ? AND inv.org_id = ?
  `).get(req.params.id, req.user.org_id);

  if (!inv) return res.status(404).json({ error: 'Investigation not found' });

  inv.team = db.prepare(`
    SELECT it.*, u.name, u.initials FROM investigation_team it
    LEFT JOIN users u ON u.id = it.user_id WHERE it.investigation_id = ?
  `).all(inv.id);

  inv.five_whys = db.prepare('SELECT * FROM five_whys WHERE investigation_id = ? ORDER BY level').all(inv.id);

  inv.attachments = db.prepare("SELECT * FROM attachments WHERE entity_type = 'investigation' AND entity_id = ?").all(inv.id);

  // Linked documents from the document library (any direction via entity_links)
  const docLinks = listLinksTouching({ entity_type: 'investigation', entity_id: inv.id })
    .filter(l => (l.is_source ? l.target_type : l.source_type) === 'document');
  if (docLinks.length > 0) {
    const ids = docLinks.map(l => l.is_source ? l.target_id : l.source_id);
    const placeholders = ids.map(() => '?').join(',');
    const docs = db.prepare(`
      SELECT d.*, u.name as uploaded_by_name, u.initials as uploaded_by_initials
      FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.id IN (${placeholders}) AND d.org_id = ?
    `).all(...ids, req.user.org_id);
    const byId = new Map(docs.map(d => [d.id, d]));
    inv.linked_documents = docLinks.map(l => {
      const docId = l.is_source ? l.target_id : l.source_id;
      const doc = byId.get(docId);
      return doc ? { ...doc, link_id: l.id, link_role: l.link_role } : null;
    }).filter(Boolean);
  } else {
    inv.linked_documents = [];
  }

  inv.activity = db.prepare(`
    SELECT al.*, u.name as user_name, u.initials as user_initials
    FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
    WHERE al.entity_type = 'investigation' AND al.entity_id = ?
    ORDER BY al.created_at DESC
  `).all(inv.id);

  inv.capas = db.prepare(`
    SELECT c.*, o.name as owner_name, o.initials as owner_initials, v.name as verifier_name, v.initials as verifier_initials
    FROM capas c
    LEFT JOIN users o ON o.id = c.owner_id
    LEFT JOIN users v ON v.id = c.verifier_id
    WHERE c.investigation_id = ?
  `).all(inv.id);

  inv.root_cause_categories = JSON.parse(inv.root_cause_categories || '[]');
  res.json(inv);
});

router.patch('/:id', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });

  const updatable = ['findings', 'root_cause_summary', 'status', 'due_date', 'lead_investigator'];
  const sets = [];
  const params = [];

  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (req.body.root_cause_categories) {
    sets.push('root_cause_categories = ?');
    params.push(JSON.stringify(req.body.root_cause_categories));
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  sets.push("updated_at = datetime('now')");
  params.push(inv.id);

  db.prepare(`UPDATE investigations SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  if (req.body.status === 'progress' && inv.status === 'pending') {
    db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'investigation', ?, 'started', ?, ?)`).run(inv.org_id, inv.id, `started investigation ${inv.investigation_number}`, req.user.id);
  }

  const updated = db.prepare('SELECT * FROM investigations WHERE id = ?').get(inv.id);
  updated.root_cause_categories = JSON.parse(updated.root_cause_categories || '[]');
  res.json(updated);
});

router.post('/:id/five-whys', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });

  const { level, question, answer, is_root_cause } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required' });

  if (is_root_cause) {
    db.prepare('UPDATE five_whys SET is_root_cause = 0 WHERE investigation_id = ?').run(inv.id);
  }

  const autoLevel = level || (db.prepare('SELECT MAX(level) as m FROM five_whys WHERE investigation_id = ?').get(inv.id)?.m || 0) + 1;

  const result = db.prepare('INSERT INTO five_whys (investigation_id, level, question, answer, is_root_cause, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(inv.id, autoLevel, question, answer, is_root_cause ? 1 : 0, req.user.id);

  db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'investigation', ?, 'five_why_added', ?, ?)`)
    .run(inv.org_id, inv.id, `added Why #${autoLevel}${is_root_cause ? ' (root cause)' : ''}`, req.user.id);

  const whys = db.prepare('SELECT * FROM five_whys WHERE investigation_id = ? ORDER BY level').all(inv.id);
  res.status(201).json(whys);
});

router.delete('/:id/five-whys/:whyId', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });

  db.prepare('DELETE FROM five_whys WHERE id = ? AND investigation_id = ?').run(req.params.whyId, inv.id);
  const whys = db.prepare('SELECT * FROM five_whys WHERE investigation_id = ? ORDER BY level').all(inv.id);
  res.json(whys);
});

router.post('/:id/team', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });

  const { user_id, role } = req.body;
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv.id, user_id, role || 'member');

  const team = db.prepare('SELECT it.*, u.name, u.initials FROM investigation_team it LEFT JOIN users u ON u.id = it.user_id WHERE it.investigation_id = ?').all(inv.id);
  res.status(201).json(team);
});

router.post('/:id/close', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });

  const { reason } = req.body;
  db.prepare("UPDATE investigations SET status = 'closed', closed_at = datetime('now'), closed_by = ?, closed_reason = ?, updated_at = datetime('now') WHERE id = ?").run(req.user.id, reason || null, inv.id);

  db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'investigation', ?, 'closed', ?, ?)`)
    .run(inv.org_id, inv.id, `closed investigation ${inv.investigation_number}${reason ? ' — ' + reason : ''}`, req.user.id);

  const updated = db.prepare('SELECT * FROM investigations WHERE id = ?').get(inv.id);
  res.json(updated);
});

router.post('/:id/assign-capa', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });

  const { title, type, priority, owner_id, verifier_id, due_date, description } = req.body;
  if (!title || !owner_id || !verifier_id || !due_date) {
    return res.status(400).json({ error: 'Title, owner, verifier, and due date are required' });
  }
  if (owner_id === verifier_id) {
    return res.status(400).json({ error: 'Owner and verifier must be different people' });
  }

  const capaNumber = nextCapaNumber();

  const result = db.prepare(`
    INSERT INTO capas (capa_number, source_type, investigation_id, org_id, title, description, type, priority, owner_id, verifier_id, due_date)
    VALUES (?, 'investigation', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(capaNumber, inv.id, inv.org_id, title, description || null, type || 'corrective', priority || 'medium', owner_id, verifier_id, due_date);

  if (inv.status !== 'capa' && inv.status !== 'closed') {
    db.prepare("UPDATE investigations SET status = 'capa', updated_at = datetime('now') WHERE id = ?").run(inv.id);
  }

  db.prepare("UPDATE incidents SET status = 'Awaiting CAPA', updated_at = datetime('now') WHERE id = ?").run(inv.incident_id);

  const owner = db.prepare('SELECT initials FROM users WHERE id = ?').get(owner_id);
  db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'investigation', ?, 'capa_assigned', ?, ?)`)
    .run(inv.org_id, inv.id, `assigned ${capaNumber} to ${owner?.initials} · due ${due_date}`, req.user.id);
  db.prepare(`INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id) VALUES (?, 'capa', ?, 'created', ?, ?)`)
    .run(inv.org_id, result.lastInsertRowid, `created from ${inv.investigation_number}`, req.user.id);

  const capa = db.prepare('SELECT * FROM capas WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(capa);
});

export default router;
