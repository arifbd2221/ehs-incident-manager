import { Router } from 'express';
import db from '../db/connection.js';
import { nextInvestigationNumber, nextCapaNumber } from '../services/numbering.js';
import { listLinksTouching } from '../services/entity_links.js';
import { writeActivity } from '../services/activity_log.js';
import { notifyUser } from '../services/notifications.js';
import { requireAssigneeOrElevated } from '../services/permissions.js';

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

// Lead investigator is a designation EHS owns — same logic as the
// recordability gate on incidents. Site supervisors can run an investigation
// once they're assigned, but they can't decide who leads one.
const INVESTIGATION_LEAD_ROLES = new Set(['ehs_officer', 'ehs_manager', 'admin']);

router.patch('/:id', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });
  if (!requireAssigneeOrElevated(req, res, inv, 'lead_investigator', 'this investigation')) return;

  // Tighter gate when the patch touches lead_investigator. The general
  // requireAssigneeOrElevated lets the current lead reassign themselves;
  // promoting/demoting investigation leads is reserved for EHS+.
  if (req.body.lead_investigator !== undefined && !INVESTIGATION_LEAD_ROLES.has(req.user?.role)) {
    return res.status(403).json({
      error: 'Only EHS officers, EHS managers, or admins can change the lead investigator.',
    });
  }

  const updatable = ['findings', 'root_cause_summary', 'lessons_learned', 'status', 'due_date', 'lead_investigator'];
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

  // Reassignment of lead_investigator: capture the old/new values BEFORE the
  // UPDATE so we can detect a change and trigger the same side-effects the
  // escalate route does (team membership row + notify + activity log).
  const leadChanged =
    req.body.lead_investigator !== undefined &&
    Number(req.body.lead_investigator) !== inv.lead_investigator;
  const newLeadId = leadChanged ? Number(req.body.lead_investigator) || null : null;

  sets.push("updated_at = datetime('now')");
  params.push(inv.id);

  db.prepare(`UPDATE investigations SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  if (leadChanged) {
    // Demote any prior 'lead' team rows to 'member' so there is exactly one
    // lead at a time. The canonical lead is investigations.lead_investigator
    // — the team-role column is informational, but keeping it in sync avoids
    // confusing UIs that surface both.
    if (inv.lead_investigator) {
      db.prepare(`
        UPDATE investigation_team SET role = 'member'
        WHERE investigation_id = ? AND user_id = ? AND role = 'lead'
      `).run(inv.id, inv.lead_investigator);
    }

    const oldLead = inv.lead_investigator
      ? db.prepare('SELECT name, initials FROM users WHERE id = ?').get(inv.lead_investigator)
      : null;

    if (newLeadId) {
      // Assign/reassign path — upsert the new lead's team row + notify them.
      // investigation_team has no UNIQUE(investigation_id, user_id), so an
      // existence check is used rather than INSERT OR IGNORE.
      const existingRow = db.prepare(
        'SELECT id FROM investigation_team WHERE investigation_id = ? AND user_id = ?'
      ).get(inv.id, newLeadId);
      if (existingRow) {
        db.prepare('UPDATE investigation_team SET role = ? WHERE id = ?').run('lead', existingRow.id);
      } else {
        db.prepare(
          'INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)'
        ).run(inv.id, newLeadId, 'lead');
      }

      const newLead = db.prepare('SELECT name, initials FROM users WHERE id = ?').get(newLeadId);
      const action = inv.lead_investigator ? 'lead_reassigned' : 'lead_assigned';
      const desc = inv.lead_investigator
        ? `reassigned lead from ${oldLead?.initials || '—'} to ${newLead?.initials || '?'}`
        : `assigned ${newLead?.initials || '?'} as lead investigator`;
      db.prepare(`
        INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
        VALUES (?, 'investigation', ?, ?, ?, ?)
      `).run(inv.org_id, inv.id, action, desc, req.user.id);

      notifyUser({
        orgId: inv.org_id, userId: newLeadId, type: 'incident_escalated', incidentId: inv.incident_id,
        title: inv.lead_investigator
          ? `Investigation reassigned to you — ${inv.investigation_number}`
          : `Investigation assigned to you — ${inv.investigation_number}`,
        body: `You are now lead investigator on ${inv.investigation_number}.`,
        severity: 'warn',
        actionUrl: `/investigations/${inv.id}`,
      });
    } else if (inv.lead_investigator) {
      // Unassign path — column already set to NULL by the UPDATE above; just
      // record the audit row. No notify (no recipient).
      db.prepare(`
        INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
        VALUES (?, 'investigation', ?, 'lead_unassigned', ?, ?)
      `).run(
        inv.org_id, inv.id,
        `unassigned ${oldLead?.initials || '—'} as lead investigator`,
        req.user.id,
      );
    }
  }

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
  if (!requireAssigneeOrElevated(req, res, inv, 'lead_investigator', 'this investigation')) return;

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
  if (!requireAssigneeOrElevated(req, res, inv, 'lead_investigator', 'this investigation')) return;

  // Snapshot the row we're about to remove so the audit metadata preserves
  // the exact text and level — deleting a root-cause finding is a
  // compliance-relevant edit (someone can revert analysis).
  const removed = db.prepare('SELECT * FROM five_whys WHERE id = ? AND investigation_id = ?').get(req.params.whyId, inv.id);

  db.prepare('DELETE FROM five_whys WHERE id = ? AND investigation_id = ?').run(req.params.whyId, inv.id);
  const whys = db.prepare('SELECT * FROM five_whys WHERE investigation_id = ? ORDER BY level').all(inv.id);

  if (removed) {
    writeActivity({
      org_id: inv.org_id,
      entity_type: 'investigation',
      entity_id: inv.id,
      action: 'five_why_removed',
      description: `removed Why-${removed.level} from investigation ${inv.investigation_number}`,
      user_id: req.user.id,
      metadata: { level: removed.level, question: removed.question, answer: removed.answer },
    });
  }

  res.json(whys);
});

router.post('/:id/team', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });
  if (!requireAssigneeOrElevated(req, res, inv, 'lead_investigator', 'this investigation')) return;

  const userId = Number(req.body.user_id);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'user_id is required.' });

  // Org isolation — adding a user from another org would cross-leak names.
  const target = db.prepare('SELECT id, name FROM users WHERE id = ? AND org_id = ?').get(userId, req.user.org_id);
  if (!target) return res.status(404).json({ error: 'User not in your organization.' });

  // investigation_team has no UNIQUE(investigation_id, user_id) so we have
  // to check manually to avoid duplicate rows.
  const dupe = db.prepare(
    'SELECT id FROM investigation_team WHERE investigation_id = ? AND user_id = ?'
  ).get(inv.id, userId);
  if (dupe) return res.status(409).json({ error: 'User is already on this investigation team.' });

  const role = req.body.role === 'lead' ? 'member' : (req.body.role || 'member');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv.id, userId, role);

  writeActivity({
    org_id: inv.org_id,
    entity_type: 'investigation',
    entity_id: inv.id,
    action: 'team_member_added',
    description: `added ${target.name} to investigation ${inv.investigation_number}`,
    user_id: req.user.id,
    metadata: { added_user_id: userId, role },
  });

  const team = db.prepare('SELECT it.*, u.name, u.initials FROM investigation_team it LEFT JOIN users u ON u.id = it.user_id WHERE it.investigation_id = ?').all(inv.id);
  res.status(201).json(team);
});

router.post('/:id/close', (req, res) => {
  const inv = db.prepare('SELECT * FROM investigations WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!inv) return res.status(404).json({ error: 'Investigation not found' });
  if (!requireAssigneeOrElevated(req, res, inv, 'lead_investigator', 'this investigation')) return;

  // lessons_learned is captured at close time (carry-forward synthesis) so
  // the in-progress UI doesn't need a floating editor for it.
  const reason = (req.body.reason || '').toString().trim() || null;
  const lessonsLearned = req.body.lessons_learned == null
    ? null
    : (req.body.lessons_learned.toString().trim() || null);

  db.prepare(`
    UPDATE investigations
    SET status = 'closed',
        closed_at = datetime('now'),
        closed_by = ?,
        closed_reason = ?,
        lessons_learned = COALESCE(?, lessons_learned),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id, reason, lessonsLearned, inv.id);

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

  notifyUser({
    orgId: inv.org_id, userId: owner_id, type: 'capa_assigned',
    title: `CAPA assigned to you — ${capaNumber}`,
    body: `${title} · due ${due_date}`,
    severity: 'warn',
  });

  const capa = db.prepare('SELECT * FROM capas WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(capa);
});

export default router;
