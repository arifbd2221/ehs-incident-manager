import { Router } from 'express';
import db from '../db/connection.js';
import { nextIncidentNumber, nextInvestigationNumber, nextRiddorNumber } from '../services/numbering.js';
import { calculateSeverityAndTrack, shouldAutoClose } from '../services/classification.js';
import { determineOshaRecordability, determineRiddorReportability, calculateDeadline } from '../services/regulatory.js';

const router = Router();

// Roles that may mutate severity/track/regulatory/assignment.
// Phase 2 collapses these to worker/ehs_manager/site_admin.
const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const RESTRICTED_FIELDS = new Set([
  'severity', 'track', 'status', 'assigned_to',
  'triage_due', 'triage_notes',
  'osha_recordable', 'osha_recordability_type', 'osha_days_away', 'osha_days_restricted',
  'riddor_reportable',
]);

function trackForSeverity(severity) {
  if (severity <= 2) return 'A';
  if (severity === 3) return 'B';
  return 'C';
}

router.get('/', (req, res) => {
  const { type, severity, status, site_id, track, search, page = 1, limit = 50 } = req.query;
  const orgId = req.user.org_id;

  let where = ['i.org_id = ?'];
  let params = [orgId];

  if (type) { where.push('i.type = ?'); params.push(type); }
  if (severity) { where.push('i.severity = ?'); params.push(Number(severity)); }
  if (status) { where.push('i.status = ?'); params.push(status); }
  if (site_id) { where.push('i.site_id = ?'); params.push(Number(site_id)); }
  if (track) { where.push('i.track = ?'); params.push(track); }
  if (search) { where.push("(i.title LIKE ? OR i.incident_number LIKE ? OR i.description LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const whereClause = where.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(`SELECT COUNT(*) as count FROM incidents i WHERE ${whereClause}`).get(...params).count;

  const incidents = db.prepare(`
    SELECT i.*, s.name as site_name, u.name as reporter_name, u.initials as reporter_initials,
           a.name as assignee_name, a.initials as assignee_initials
    FROM incidents i
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = i.reported_by
    LEFT JOIN users a ON a.id = i.assigned_to
    WHERE ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  res.json({ incidents, total, page: Number(page), limit: Number(limit) });
});

router.get('/:id', (req, res) => {
  const incident = db.prepare(`
    SELECT i.*, s.name as site_name, s.country as site_country,
           u.name as reporter_name, u.initials as reporter_initials,
           a.name as assignee_name, a.initials as assignee_initials
    FROM incidents i
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = i.reported_by
    LEFT JOIN users a ON a.id = i.assigned_to
    WHERE i.id = ? AND i.org_id = ?
  `).get(req.params.id, req.user.org_id);

  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const witnesses = db.prepare('SELECT * FROM witnesses WHERE incident_id = ?').all(incident.id);
  const attachments = db.prepare("SELECT * FROM attachments WHERE entity_type = 'incident' AND entity_id = ?").all(incident.id);
  const activity = db.prepare(
    "SELECT al.*, u.name as user_name, u.initials as user_initials FROM activity_log al LEFT JOIN users u ON u.id = al.user_id WHERE al.entity_type = 'incident' AND al.entity_id = ? ORDER BY al.created_at DESC"
  ).all(incident.id);

  incident.type_data = JSON.parse(incident.type_data || '{}');
  res.json({ ...incident, witnesses, attachments, activity });
});

router.post('/', async (req, res, next) => {
  try {
  const {
    title, type, description, incident_datetime, site_id, area, specific_location,
    department, shift, likelihood, consequence, type_data, immediate_actions_taken,
    asset_id,
    witnesses: witnessData,
  } = req.body;

  if (!title || !type || !site_id || !incident_datetime) {
    return res.status(400).json({ error: 'Title, type, site_id, and incident_datetime are required' });
  }

  const orgId = req.user.org_id;

  // Validate asset belongs to user's org + matches the chosen site (if provided)
  let resolvedAssetId = null;
  if (asset_id) {
    const a = db.prepare('SELECT id, site_id FROM assets WHERE id = ? AND org_id = ? AND active = 1').get(asset_id, orgId);
    if (!a) return res.status(404).json({ error: 'Asset not found in your organization' });
    if (a.site_id !== Number(site_id)) {
      return res.status(400).json({ error: 'Asset does not belong to the chosen site' });
    }
    resolvedAssetId = a.id;
  }

  const incidentNumber = nextIncidentNumber();
  const { severity, track } = calculateSeverityAndTrack(likelihood, consequence, type);

  const site = db.prepare('SELECT country FROM sites WHERE id = ?').get(site_id);
  const osha = determineOshaRecordability(type, type_data);
  const riddor = determineRiddorReportability(type, type_data, site?.country);

  const autoClose = shouldAutoClose(type, severity, track);
  const status = autoClose ? 'Closed' : 'New';

  const result = db.prepare(`
    INSERT INTO incidents (
      incident_number, org_id, site_id, title, type, description, incident_datetime,
      area, specific_location, department, shift, asset_id,
      severity, likelihood, consequence, track,
      status, reported_by,
      osha_recordable, osha_recordability_type,
      riddor_reportable, riddor_category,
      type_data, immediate_actions_taken,
      closed_at, closed_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    incidentNumber, orgId, site_id, title, type, description || '', incident_datetime,
    area || null, specific_location || null, department || null, shift || null, resolvedAssetId,
    severity, likelihood ?? null, consequence ?? null, track,
    status, req.user.id,
    osha.recordable ? 1 : 0, osha.type,
    riddor.reportable ? 1 : 0, riddor.category || null,
    JSON.stringify(type_data || {}), immediate_actions_taken || null,
    autoClose ? new Date().toISOString() : null,
    autoClose ? 'Auto-closed (Track C)' : null
  );

  const incidentId = result.lastInsertRowid;

  if (witnessData && Array.isArray(witnessData)) {
    const insertWitness = db.prepare('INSERT INTO witnesses (incident_id, name, contact) VALUES (?, ?, ?)');
    for (const w of witnessData) {
      if (w.name) insertWitness.run(incidentId, w.name, w.contact || null);
    }
  }

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'created', ?, ?)
  `).run(orgId, incidentId, `submitted ${incidentNumber} — ${type} · Sev ${severity} · Track ${track}`, req.user.id);

  if (autoClose) {
    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description)
      VALUES (?, 'incident', ?, 'auto_closed', ?)
    `).run(orgId, incidentId, `auto-routed ${incidentNumber} to Track C and closed`);
  }

  if (osha.recordable) {
    const year = new Date(incident_datetime).getFullYear();
    const maxCase = db.prepare('SELECT MAX(case_number) as m FROM osha_300_log WHERE site_id = ? AND calendar_year = ?').get(site_id, year);
    const caseNum = (maxCase?.m || 0) + 1;
    const td = type_data || {};

    db.prepare(`
      INSERT INTO osha_300_log (org_id, site_id, incident_id, calendar_year, case_number, employee_name, job_title, injury_date, location, description,
        classification_death, classification_days_away, classification_job_transfer, classification_other, injury_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orgId, site_id, incidentId, year, caseNum,
      td.injured_person?.name || td.affected_person?.name || 'Unknown',
      td.injured_person?.job_title || td.affected_person?.job_title || null,
      incident_datetime, area || null, description || title,
      osha.type === 'death' ? 1 : 0,
      osha.type === 'days_away' ? 1 : 0,
      osha.type === 'job_transfer' ? 1 : 0,
      osha.type === 'other_recordable' ? 1 : 0,
      type === 'injury' ? 'injury' : 'all_other'
    );
  }

  if (riddor.reportable) {
    const riddorNum = nextRiddorNumber();
    const deadline = calculateDeadline(incident_datetime, riddor.writtenDeadlineDays);

    db.prepare(`
      INSERT INTO riddor_reports (riddor_number, org_id, site_id, incident_id, event_date, category, description, written_deadline, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(riddorNum, orgId, site_id, incidentId, incident_datetime, riddor.category, title, deadline);

    db.prepare(`
      INSERT INTO notifications (org_id, type, incident_id, title, body, severity, deadline)
      VALUES (?, ?, ?, ?, ?, 'err', ?)
    `).run(
      orgId, riddor.phoneRequired ? 'riddor_immediate' : 'riddor_written',
      incidentId,
      riddor.phoneRequired ? 'RIDDOR — immediate phone report required' : 'RIDDOR — written report required',
      `${title} classified as ${riddor.category}. ${riddor.phoneRequired ? 'Phone HSE without delay.' : `Written report due by ${deadline?.slice(0, 10)}.`}`,
      deadline
    );
  }

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
  incident.type_data = JSON.parse(incident.type_data || '{}');
  res.status(201).json(incident);
  } catch (err) { next(err); }
});

router.patch('/:id', (req, res) => {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const updatable = ['title', 'description', 'severity', 'track', 'status', 'assigned_to', 'triage_due', 'triage_notes',
    'osha_recordable', 'osha_recordability_type', 'osha_days_away', 'osha_days_restricted',
    'riddor_reportable', 'immediate_actions_taken', 'area', 'specific_location', 'department'];

  const requestedRestricted = updatable.filter(k => RESTRICTED_FIELDS.has(k) && req.body[k] !== undefined);
  if (requestedRestricted.length > 0 && !isElevated(req.user)) {
    return res.status(403).json({
      error: 'Worker role cannot modify severity, track, status, assignment, or regulatory fields.',
      restricted_fields: requestedRestricted,
    });
  }

  const sets = [];
  const params = [];
  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (req.body.type_data !== undefined) {
    sets.push('type_data = ?');
    params.push(JSON.stringify(req.body.type_data));
  }

  // Severity override: capture audit trail, recompute track if not explicitly set.
  const severityChanged = req.body.severity !== undefined && Number(req.body.severity) !== incident.severity;
  if (severityChanged) {
    const newSeverity = Number(req.body.severity);
    const reason = req.body.severity_override_reason || req.body.reason || 'No reason provided';
    sets.push('severity_override = ?', 'severity_override_by = ?', 'severity_override_reason = ?');
    params.push(incident.severity, req.user.id, reason);
    if (req.body.track === undefined) {
      const recomputedTrack = trackForSeverity(newSeverity);
      sets.push('track = ?');
      params.push(recomputedTrack);
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  sets.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE incidents SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  if (severityChanged) {
    const newSeverity = Number(req.body.severity);
    const reason = req.body.severity_override_reason || req.body.reason || 'No reason provided';
    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, 'incident', ?, 'severity_overridden', ?, ?, ?)
    `).run(
      incident.org_id, incident.id,
      `severity changed Sev ${incident.severity} -> Sev ${newSeverity} - ${reason}`,
      req.user.id,
      JSON.stringify({ from: incident.severity, to: newSeverity, reason }),
    );
  }

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  updated.type_data = JSON.parse(updated.type_data || '{}');
  res.json(updated);
});

router.post('/:id/assign', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot assign incidents.' });
  const { assigned_to, triage_due, notes } = req.body;
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  db.prepare(`
    UPDATE incidents SET status = 'Triage', assigned_to = ?, triage_due = ?, triage_notes = ?, updated_at = datetime('now') WHERE id = ?
  `).run(assigned_to, triage_due || null, notes || null, incident.id);

  const assignee = db.prepare('SELECT name, initials FROM users WHERE id = ?').get(assigned_to);
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'assigned', ?, ?)
  `).run(incident.org_id, incident.id, `assigned ${assignee?.initials || '?'} as triage owner · due ${triage_due || 'TBD'}`, req.user.id);

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
  updated.type_data = JSON.parse(updated.type_data || '{}');
  res.json(updated);
});

router.post('/:id/escalate', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot escalate incidents.' });
  const { lead_investigator, track, notes } = req.body;
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const invNumber = nextInvestigationNumber();

  const invResult = db.prepare(`
    INSERT INTO investigations (investigation_number, incident_id, org_id, lead_investigator, track, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(invNumber, incident.id, incident.org_id, lead_investigator || null, track || incident.track);

  db.prepare(`
    UPDATE incidents SET status = 'Investigating', track = ?, assigned_to = ?, updated_at = datetime('now') WHERE id = ?
  `).run(track || incident.track, lead_investigator || incident.assigned_to, incident.id);

  if (lead_investigator) {
    db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)')
      .run(invResult.lastInsertRowid, lead_investigator, 'lead');
  }

  const lead = db.prepare('SELECT name, initials FROM users WHERE id = ?').get(lead_investigator);
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'escalated', ?, ?)
  `).run(incident.org_id, incident.id, `escalated to investigation ${invNumber} · Track ${track || incident.track} · lead ${lead?.initials || '?'}`, req.user.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'investigation', ?, 'created', ?, ?)
  `).run(incident.org_id, invResult.lastInsertRowid, `created from ${incident.incident_number}`, req.user.id);

  const investigation = db.prepare('SELECT * FROM investigations WHERE id = ?').get(invResult.lastInsertRowid);
  res.status(201).json({ incident_id: incident.id, investigation });
});

router.post('/:id/close', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot close incidents.' });
  const { reason, notes } = req.body;
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  db.prepare(`
    UPDATE incidents SET status = 'Closed', closed_reason = ?, closed_notes = ?, closed_at = datetime('now'), closed_by = ?, updated_at = datetime('now') WHERE id = ?
  `).run(reason || null, notes || null, req.user.id, incident.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'closed', ?, ?)
  `).run(incident.org_id, incident.id, `closed ${incident.incident_number} — ${reason || 'no reason'}`, req.user.id);

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
  updated.type_data = JSON.parse(updated.type_data || '{}');
  res.json(updated);
});

export default router;
