// server/routes/maintenance.js — P3-OP1 asset maintenance schedules + events.
//
// Time-based rolling PM / calibration / inspection schedules tied to an asset.
// Mark-complete records (immutable events). Manual escalate-to-CAPA via the
// shared `createCapaRow` helper so the CAPA carries the same audit + notify
// path as one created from the /capas endpoint.
//
// Status compute (server-side, on list reads):
//   overdue  → next_due <  today    AND active=1
//   due_soon → next_due <= today+30 AND active=1
//   ok       → next_due >  today+30 AND active=1
// Inactive (soft-deleted) schedules return no status — they're history only.

import { Router } from 'express';
import db from '../db/connection.js';
import { writeActivity, diffFields } from '../services/activity_log.js';
import { createCapaRow } from './capas.js';
import { notifyUser } from '../services/notifications.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const SCHEDULE_TYPES = new Set(['preventive', 'calibration', 'inspection', 'other']);
const OUTCOMES = new Set(['pass', 'fail', 'conditional']);

const SCHEDULE_AUDIT_FIELDS = ['title', 'description', 'schedule_type', 'interval_days', 'active', 'assigned_to'];

// ISO YYYY-MM-DD validator that also calendar-round-trips (rejects Feb 30 etc.)
function isIsoDate(s) {
  if (!s || typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

// SQLite `date('now')` returns server-local date; in UTC envs this matches what
// the FE shows. For status compute we use parameterized today so tests are
// deterministic and timezones don't drift.
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function scheduleStatus(row, today = todayUtc()) {
  if (!row.active) return 'inactive';
  if (row.next_due < today) return 'overdue';
  const soon = addDays(today, 30);
  if (row.next_due <= soon) return 'due_soon';
  return 'ok';
}

// Loads a schedule + verifies it belongs to caller's org. Returns null on miss.
function getScopedSchedule(id, orgId) {
  return db.prepare(
    'SELECT * FROM asset_maintenance_schedules WHERE id = ? AND org_id = ?'
  ).get(id, orgId);
}

// ----- LIST ----------------------------------------------------------------
router.get('/', (req, res) => {
  const { asset_id, site_id, status, schedule_type, active, page = 1, limit = 100 } = req.query;
  const orgId = req.user.org_id;
  const today = todayUtc();
  const soon = addDays(today, 30);

  const where = ['ms.org_id = ?'];
  const params = [orgId];

  if (asset_id) { where.push('ms.asset_id = ?'); params.push(Number(asset_id)); }
  if (site_id) { where.push('a.site_id = ?'); params.push(Number(site_id)); }
  if (schedule_type) {
    if (!SCHEDULE_TYPES.has(schedule_type)) {
      return res.status(400).json({ error: `schedule_type must be one of: ${[...SCHEDULE_TYPES].join(', ')}` });
    }
    where.push('ms.schedule_type = ?');
    params.push(schedule_type);
  }
  if (active !== undefined && active !== '') {
    where.push('ms.active = ?');
    params.push(Number(active) ? 1 : 0);
  }
  // Status filter mirrors scheduleStatus(); only meaningful for active schedules.
  if (status === 'overdue') {
    where.push('ms.active = 1 AND ms.next_due < ?');
    params.push(today);
  } else if (status === 'due_soon') {
    where.push('ms.active = 1 AND ms.next_due >= ? AND ms.next_due <= ?');
    params.push(today, soon);
  } else if (status === 'ok') {
    where.push('ms.active = 1 AND ms.next_due > ?');
    params.push(soon);
  } else if (status === 'inactive') {
    where.push('ms.active = 0');
  } else if (status) {
    return res.status(400).json({ error: 'status must be one of: ok | due_soon | overdue | inactive' });
  }

  const whereClause = where.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(
    `SELECT COUNT(*) as c FROM asset_maintenance_schedules ms LEFT JOIN assets a ON a.id = ms.asset_id WHERE ${whereClause}`
  ).get(...params).c;

  const rows = db.prepare(`
    SELECT ms.*,
           a.name as asset_name, a.display_id as asset_display_id,
           a.asset_number as asset_number, a.site_id as asset_site_id,
           s.name as site_name,
           lcu.name as last_completed_by_name, lcu.initials as last_completed_by_initials,
           cu.name as created_by_name, cu.initials as created_by_initials,
           au.name as assigned_to_name, au.initials as assigned_to_initials
    FROM asset_maintenance_schedules ms
    LEFT JOIN assets a ON a.id = ms.asset_id
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN users lcu ON lcu.id = ms.last_completed_by
    LEFT JOIN users cu ON cu.id = ms.created_by
    LEFT JOIN users au ON au.id = ms.assigned_to
    WHERE ${whereClause}
    ORDER BY ms.next_due ASC, ms.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  for (const r of rows) r.status = scheduleStatus(r, today);

  res.json({ schedules: rows, total, page: Number(page), limit: Number(limit) });
});

// ----- DETAIL --------------------------------------------------------------
router.get('/:id', (req, res) => {
  const orgId = req.user.org_id;
  const schedule = db.prepare(`
    SELECT ms.*,
           a.name as asset_name, a.display_id as asset_display_id, a.asset_number as asset_number,
           a.site_id as asset_site_id,
           s.name as site_name,
           lcu.name as last_completed_by_name, lcu.initials as last_completed_by_initials,
           cu.name as created_by_name, cu.initials as created_by_initials,
           au.name as assigned_to_name, au.initials as assigned_to_initials
    FROM asset_maintenance_schedules ms
    LEFT JOIN assets a ON a.id = ms.asset_id
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN users lcu ON lcu.id = ms.last_completed_by
    LEFT JOIN users cu ON cu.id = ms.created_by
    LEFT JOIN users au ON au.id = ms.assigned_to
    WHERE ms.id = ? AND ms.org_id = ?
  `).get(req.params.id, orgId);

  if (!schedule) return res.status(404).json({ error: 'Maintenance schedule not found' });
  schedule.status = scheduleStatus(schedule);

  schedule.events = db.prepare(`
    SELECT e.*,
           u.name as completed_by_name, u.initials as completed_by_initials,
           c.capa_number as capa_number, c.status as capa_status
    FROM asset_maintenance_events e
    LEFT JOIN users u ON u.id = e.completed_by
    LEFT JOIN capas c ON c.id = e.capa_id
    WHERE e.schedule_id = ?
    ORDER BY e.completed_at DESC
    LIMIT 20
  `).all(schedule.id);

  // Attach evidence files per event (P3-OP1 chunk B). Cheap subquery per
  // event since the inner loop is bounded by LIMIT 20.
  if (schedule.events.length > 0) {
    const eventIds = schedule.events.map(e => e.id);
    const placeholders = eventIds.map(() => '?').join(',');
    const atts = db.prepare(`
      SELECT id, entity_id, filename, stored_filename, mime_type, size_bytes
      FROM attachments
      WHERE entity_type = 'maintenance_event' AND entity_id IN (${placeholders})
    `).all(...eventIds);
    const byEvent = new Map();
    for (const a of atts) {
      if (!byEvent.has(a.entity_id)) byEvent.set(a.entity_id, []);
      byEvent.get(a.entity_id).push(a);
    }
    for (const e of schedule.events) e.attachments = byEvent.get(e.id) || [];
  }

  res.json(schedule);
});

// ----- CREATE --------------------------------------------------------------
router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create maintenance schedules.' });
  }
  const { asset_id, schedule_type, title, description, interval_days, start_date, assigned_to } = req.body;

  if (!asset_id) return res.status(400).json({ error: 'asset_id is required' });
  if (!schedule_type || !SCHEDULE_TYPES.has(schedule_type)) {
    return res.status(400).json({ error: `schedule_type must be one of: ${[...SCHEDULE_TYPES].join(', ')}` });
  }
  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  const intervalNum = Number(interval_days);
  if (!Number.isInteger(intervalNum) || intervalNum <= 0) {
    return res.status(400).json({ error: 'interval_days must be a positive integer' });
  }
  if (!isIsoDate(start_date)) {
    return res.status(400).json({ error: 'start_date must be YYYY-MM-DD' });
  }

  const asset = db.prepare('SELECT id, name FROM assets WHERE id = ? AND org_id = ?')
    .get(Number(asset_id), req.user.org_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found in your organization' });

  // Optional assignee — must be a user in the caller's org.
  let assigneeId = null;
  if (assigned_to !== undefined && assigned_to !== null && assigned_to !== '') {
    const u = db.prepare('SELECT id FROM users WHERE id = ? AND org_id = ?')
      .get(Number(assigned_to), req.user.org_id);
    if (!u) return res.status(400).json({ error: 'Assignee must be a user in your organization' });
    assigneeId = u.id;
  }

  const result = db.prepare(`
    INSERT INTO asset_maintenance_schedules
      (asset_id, org_id, schedule_type, title, description, interval_days,
       start_date, next_due, active, created_by, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    asset.id, req.user.org_id, schedule_type, title.trim(), description || null,
    intervalNum, start_date, start_date, req.user.id, assigneeId,
  );

  const schedule = db.prepare(`
    SELECT ms.*, a.name as asset_name, a.display_id as asset_display_id
    FROM asset_maintenance_schedules ms
    LEFT JOIN assets a ON a.id = ms.asset_id
    WHERE ms.id = ?
  `).get(result.lastInsertRowid);
  schedule.status = scheduleStatus(schedule);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'asset_maintenance',
    entity_id: schedule.id,
    action: 'maintenance_schedule_created',
    description: `created ${schedule.schedule_type} schedule "${schedule.title}" on ${asset.name} (every ${schedule.interval_days} days)`,
    user_id: req.user.id,
    metadata: {
      asset_id: asset.id,
      schedule_type: schedule.schedule_type,
      interval_days: schedule.interval_days,
      start_date: schedule.start_date,
      assigned_to: assigneeId,
    },
  });

  // Notify the assignee at the moment they're assigned. No cron in v1, so
  // periodic "PM due in 7 days" reminders are deferred — this fires only on
  // the assignment event itself. action_url drops the user into the global
  // maintenance page with the schedule's detail modal pre-opened.
  if (assigneeId && assigneeId !== req.user.id) {
    notifyUser({
      orgId: req.user.org_id,
      userId: assigneeId,
      type: 'maintenance_assigned',
      title: `Maintenance assigned — ${asset.name}`,
      body: `${schedule.title} · next due ${schedule.next_due}`,
      severity: 'info',
      actionUrl: `/maintenance?open=${schedule.id}`,
    });
  }

  res.status(201).json(schedule);
});

// ----- UPDATE --------------------------------------------------------------
router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot edit maintenance schedules.' });
  }
  const schedule = getScopedSchedule(Number(req.params.id), req.user.org_id);
  if (!schedule) return res.status(404).json({ error: 'Maintenance schedule not found' });

  const updatable = ['title', 'description', 'schedule_type', 'interval_days', 'active', 'assigned_to'];
  const sets = [];
  const params = [];
  for (const key of updatable) {
    if (req.body[key] === undefined) continue;
    let val = req.body[key];
    if (key === 'schedule_type') {
      if (!SCHEDULE_TYPES.has(val)) {
        return res.status(400).json({ error: `schedule_type must be one of: ${[...SCHEDULE_TYPES].join(', ')}` });
      }
    } else if (key === 'interval_days') {
      val = Number(val);
      if (!Number.isInteger(val) || val <= 0) {
        return res.status(400).json({ error: 'interval_days must be a positive integer' });
      }
    } else if (key === 'active') {
      val = val ? 1 : 0;
    } else if (key === 'title') {
      if (!val || !String(val).trim()) {
        return res.status(400).json({ error: 'title cannot be empty' });
      }
      val = String(val).trim();
    } else if (key === 'assigned_to') {
      if (val === null || val === '' || val === 0) {
        val = null;
      } else {
        const u = db.prepare('SELECT id FROM users WHERE id = ? AND org_id = ?')
          .get(Number(val), req.user.org_id);
        if (!u) return res.status(400).json({ error: 'Assignee must be a user in your organization' });
        val = u.id;
      }
    }
    sets.push(`${key} = ?`);
    params.push(val);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push("updated_at = datetime('now')");
  params.push(schedule.id);
  db.prepare(`UPDATE asset_maintenance_schedules SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = getScopedSchedule(schedule.id, req.user.org_id);
  updated.status = scheduleStatus(updated);

  const changes = diffFields(schedule, updated, SCHEDULE_AUDIT_FIELDS);
  if (changes) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'asset_maintenance',
      entity_id: schedule.id,
      action: 'maintenance_schedule_updated',
      description: `updated maintenance schedule "${updated.title}"`,
      user_id: req.user.id,
      metadata: changes,
    });
  }

  // Fire a notification on (re)assignment so the new assignee learns about
  // it at the moment of the change, not at next login.
  const newAssignee = updated.assigned_to;
  if (newAssignee && newAssignee !== schedule.assigned_to && newAssignee !== req.user.id) {
    notifyUser({
      orgId: req.user.org_id,
      userId: newAssignee,
      type: 'maintenance_assigned',
      title: `Maintenance assigned — ${updated.title}`,
      body: `Next due ${updated.next_due}`,
      severity: 'info',
      actionUrl: `/maintenance?open=${updated.id}`,
    });
  }

  res.json(updated);
});

// ----- SOFT-DELETE ---------------------------------------------------------
router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot delete maintenance schedules.' });
  }
  const schedule = getScopedSchedule(Number(req.params.id), req.user.org_id);
  if (!schedule) return res.status(404).json({ error: 'Maintenance schedule not found' });

  db.prepare("UPDATE asset_maintenance_schedules SET active = 0, updated_at = datetime('now') WHERE id = ?")
    .run(schedule.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'asset_maintenance',
    entity_id: schedule.id,
    action: 'maintenance_schedule_deleted',
    description: `archived maintenance schedule "${schedule.title}"`,
    user_id: req.user.id,
    metadata: { schedule_type: schedule.schedule_type, interval_days: schedule.interval_days },
  });

  res.json({ success: true, soft_deleted: true });
});

// ----- MARK COMPLETE -------------------------------------------------------
// Any auth role can record a completion they performed (technicians + workers
// included). Atomically inserts the event, mirrors last_* fields on the
// schedule, and advances next_due. Active-only — an archived schedule
// returns 409 to mirror P3-OB3's archived-doc supersede pattern.
router.post('/:id/complete', (req, res) => {
  const schedule = getScopedSchedule(Number(req.params.id), req.user.org_id);
  if (!schedule) return res.status(404).json({ error: 'Maintenance schedule not found' });
  if (!schedule.active) {
    return res.status(409).json({ error: 'Restore the schedule before recording a completion.' });
  }

  const { outcome, notes, completed_at, calibration } = req.body;
  if (!outcome || !OUTCOMES.has(outcome)) {
    return res.status(400).json({ error: `outcome must be one of: ${[...OUTCOMES].join(', ')}` });
  }
  const trimmedNotes = (notes || '').toString().trim();
  if (trimmedNotes.length > 1000) {
    return res.status(400).json({ error: 'Notes must be 1000 characters or fewer' });
  }
  let completedAtIso;
  if (completed_at) {
    if (!isIsoDate(completed_at)) {
      return res.status(400).json({ error: 'completed_at must be YYYY-MM-DD' });
    }
    completedAtIso = completed_at;
  } else {
    completedAtIso = todayUtc();
  }
  const nextDue = addDays(completedAtIso, schedule.interval_days);

  // Calibration-specific fields (P3-OP1 chunk D). Persisted only when the
  // schedule is calibration-typed AND the FE sent a calibration block.
  // Nullable; non-calibration events leave them empty.
  let calBefore = null, calAfter = null, calUnit = null, calTol = null, calRef = null, calCert = null;
  if (schedule.schedule_type === 'calibration' && calibration && typeof calibration === 'object') {
    const safeStr = (v, max = 120) => {
      if (v == null) return null;
      const s = String(v).trim();
      if (!s) return null;
      return s.length > max ? s.slice(0, max) : s;
    };
    calBefore = safeStr(calibration.before);
    calAfter = safeStr(calibration.after);
    calUnit = safeStr(calibration.unit, 24);
    calTol = safeStr(calibration.tolerance, 60);
    calRef = safeStr(calibration.reference, 240);
    calCert = safeStr(calibration.certificate, 120);
  }

  const apply = db.transaction(() => {
    const evResult = db.prepare(`
      INSERT INTO asset_maintenance_events
        (schedule_id, asset_id, org_id, completed_at, completed_by, outcome, notes,
         calibration_before, calibration_after, calibration_unit,
         calibration_tolerance, calibration_reference, calibration_certificate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      schedule.id, schedule.asset_id, req.user.org_id,
      completedAtIso, req.user.id, outcome, trimmedNotes || null,
      calBefore, calAfter, calUnit, calTol, calRef, calCert,
    );
    db.prepare(`
      UPDATE asset_maintenance_schedules
      SET last_completed_at = ?, last_completed_by = ?, last_outcome = ?,
          next_due = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(completedAtIso, req.user.id, outcome, nextDue, schedule.id);
    return evResult.lastInsertRowid;
  });
  const newEventId = apply();

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'asset_maintenance',
    entity_id: schedule.id,
    action: 'maintenance_completed',
    description: schedule.schedule_type === 'calibration' && calCert
      ? `completed calibration "${schedule.title}" — outcome ${outcome} (cert ${calCert})`
      : `completed maintenance "${schedule.title}" — outcome ${outcome}`,
    user_id: req.user.id,
    metadata: {
      asset_id: schedule.asset_id,
      event_id: newEventId,
      outcome,
      completed_at: completedAtIso,
      next_due: nextDue,
      had_notes: !!trimmedNotes,
      calibration: schedule.schedule_type === 'calibration' && (calBefore || calAfter || calCert)
        ? { before: calBefore, after: calAfter, unit: calUnit, certificate: calCert, reference: calRef }
        : undefined,
    },
  });

  const event = db.prepare(`
    SELECT e.*, u.name as completed_by_name, u.initials as completed_by_initials
    FROM asset_maintenance_events e
    LEFT JOIN users u ON u.id = e.completed_by
    WHERE e.id = ?
  `).get(newEventId);

  const updated = db.prepare(`
    SELECT ms.*, a.name as asset_name, a.display_id as asset_display_id
    FROM asset_maintenance_schedules ms
    LEFT JOIN assets a ON a.id = ms.asset_id
    WHERE ms.id = ?
  `).get(schedule.id);
  updated.status = scheduleStatus(updated);

  res.status(201).json({ schedule: updated, event });
});

// ----- ESCALATE TO CAPA ----------------------------------------------------
// Manual only (per locked design). Optionally links an existing event to the
// new CAPA via asset_maintenance_events.capa_id so the CAPA <-> event back-
// reference is bidirectional (capas.maintenance_schedule_id → schedule;
// events.capa_id → CAPA).
router.post('/:id/escalate-capa', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot escalate to CAPA.' });
  }
  const schedule = getScopedSchedule(Number(req.params.id), req.user.org_id);
  if (!schedule) return res.status(404).json({ error: 'Maintenance schedule not found' });
  const { event_id } = req.body;

  // If event_id is provided it must belong to this schedule + org.
  let eventRow = null;
  if (event_id) {
    eventRow = db.prepare(
      'SELECT * FROM asset_maintenance_events WHERE id = ? AND schedule_id = ? AND org_id = ?'
    ).get(Number(event_id), schedule.id, req.user.org_id);
    if (!eventRow) return res.status(404).json({ error: 'Event not found for this schedule' });
  }

  let capaId;
  try {
    capaId = createCapaRow({
      orgId: req.user.org_id,
      sourceType: 'proactive',
      investigationId: null,
      incidentId: null,
      maintenanceScheduleId: schedule.id,
      body: req.body,
      userId: req.user.id,
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }

  if (eventRow) {
    db.prepare('UPDATE asset_maintenance_events SET capa_id = ? WHERE id = ?').run(capaId, eventRow.id);
  }

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'asset_maintenance',
    entity_id: schedule.id,
    action: 'maintenance_escalated',
    description: `escalated maintenance "${schedule.title}" to a CAPA`,
    user_id: req.user.id,
    metadata: { capa_id: capaId, event_id: event_id || null },
  });

  const capa = db.prepare(`
    SELECT c.*, o.name as owner_name, v.name as verifier_name
    FROM capas c
    LEFT JOIN users o ON o.id = c.owner_id
    LEFT JOIN users v ON v.id = c.verifier_id
    WHERE c.id = ?
  `).get(capaId);

  res.status(201).json({ capa });
});

export default router;
