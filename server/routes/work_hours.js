// server/routes/work_hours.js — per-site work_hours: manual CRUD + CSV import/export.
//
// Schema (mig 001 + 021):
//   id, site_id, period_start (YYYY-MM-DD), period_end (YYYY-MM-DD),
//   hours_worked (INT NOT NULL), avg_employees (INT NULL),
//   contractor_hours_worked (INT NULL), contractor_avg_employees (INT NULL),
//   entered_by (FK users), entered_at, notes
//   UNIQUE(site_id, period_start)
//
// Endpoints:
//   GET    /api/work-hours?site_id=X[&year=Y]   — list periods, period_start DESC
//   POST   /api/work-hours                       — create one period
//   PATCH  /api/work-hours/:id                   — edit one period
//   DELETE /api/work-hours/:id                   — hard delete (audit row preserves)
//   GET    /api/work-hours/export.csv?site_id=X  — CSV round-trip with import
//   GET    /api/work-hours/import/template.csv   — strict-template download
//   POST   /api/work-hours/import                — body { csv_text, mode }
//
// All endpoints elevated-only. Mutations are org-scoped via the site:
//   we always SELECT the site WHERE id = ? AND org_id = ? before writing.
// All mutations write to activity_log with entity_type='work_hours'
// (mig 020 widened the CHECK).

import { Router } from 'express';
import db from '../db/connection.js';
import { writeActivity, diffFields } from '../services/activity_log.js';
import { runImport, CsvImportError } from '../services/csv_import.js';
import { checkLen, ADDRESS_MAX } from '../services/validators.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const WORK_HOURS_HEADERS = [
  'site_name', 'period_start', 'period_end', 'hours_worked', 'avg_employees',
  'contractor_hours_worked', 'contractor_avg_employees', 'notes',
];

const WORK_HOURS_TEMPLATE_BODY =
  WORK_HOURS_HEADERS.join(',') + '\n' +
  'Cleveland Plant,2025-01-01,2025-02-01,42500,250,8200,40,Q1 month 1\n' +
  'Cleveland Plant,2025-02-01,2025-03-01,41200,250,,,Q1 month 2 (no contractor split)\n';

const WORK_HOURS_AUDIT_FIELDS = [
  'period_start', 'period_end', 'hours_worked', 'avg_employees',
  'contractor_hours_worked', 'contractor_avg_employees', 'notes',
];

// ----- shared validation helpers -------------------------------------------

// Match exactly YYYY-MM-DD then verify it's a real date (Date round-trip).
function isIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Validates a non-negative integer in string form. Returns { ok, n, reason }.
function parseNonNegInt(raw, label) {
  if (raw === '' || raw === null || raw === undefined) return { ok: true, n: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, reason: `${label} must be a non-negative integer` };
  }
  return { ok: true, n };
}

// Loads the org-scoped (site_id, period_start) keys that already exist.
// Used both by the CSV import (collisions across whole org) and by single-record
// mutations (collision check excluding self).
function loadExistingKeys(orgId, excludeId = null) {
  const sql = excludeId
    ? `SELECT wh.site_id, wh.period_start FROM work_hours wh
       JOIN sites s ON s.id = wh.site_id
       WHERE s.org_id = ? AND wh.id <> ?`
    : `SELECT wh.site_id, wh.period_start FROM work_hours wh
       JOIN sites s ON s.id = wh.site_id
       WHERE s.org_id = ?`;
  const rows = excludeId
    ? db.prepare(sql).all(orgId, excludeId)
    : db.prepare(sql).all(orgId);
  const set = new Set();
  for (const r of rows) set.add(`${r.site_id}|${r.period_start}`);
  return set;
}

// Validates a parsed work_hours payload for either single-record or CSV-row use.
// Caller passes already-trimmed strings/numbers; this enforces the cross-field rules.
//
//   payload: { site_id?, period_start, period_end, hours_worked, avg_employees,
//              contractor_hours_worked?, contractor_avg_employees?, notes? }
//   ctx:     { existingKeys: Set<"site_id|period_start">,
//              seen?: Map (CSV-only, in-file collision detection) }
//
// Returns { errors: [{column, reason}], parsed? }.
// parsed includes coerced INTs and trimmed strings ready for INSERT.
function validateRow(payload, ctx) {
  const errors = [];
  const period_start = (payload.period_start ?? '').toString().trim();
  const period_end = (payload.period_end ?? '').toString().trim();
  const hours_raw = (payload.hours_worked ?? '').toString().trim();
  const avg_raw = (payload.avg_employees ?? '').toString().trim();
  const c_hours_raw = (payload.contractor_hours_worked ?? '').toString().trim();
  const c_avg_raw = (payload.contractor_avg_employees ?? '').toString().trim();
  const notes = (payload.notes ?? '').toString().trim();
  const site_id = payload.site_id ?? null;

  if (site_id === null || site_id === undefined) {
    errors.push({ column: 'site_id', reason: 'site_id is required' });
  }

  if (!period_start) errors.push({ column: 'period_start', reason: 'period_start is required' });
  else if (!isIsoDate(period_start)) {
    errors.push({ column: 'period_start', reason: 'period_start must be YYYY-MM-DD' });
  }

  if (!period_end) errors.push({ column: 'period_end', reason: 'period_end is required' });
  else if (!isIsoDate(period_end)) {
    errors.push({ column: 'period_end', reason: 'period_end must be YYYY-MM-DD' });
  }

  if (period_start && period_end && isIsoDate(period_start) && isIsoDate(period_end)
      && period_end <= period_start) {
    errors.push({ column: 'period_end', reason: 'period_end must be after period_start' });
  }

  let hours_worked = 0;
  if (!hours_raw) errors.push({ column: 'hours_worked', reason: 'hours_worked is required' });
  else {
    const r = parseNonNegInt(hours_raw, 'hours_worked');
    if (!r.ok) errors.push({ column: 'hours_worked', reason: r.reason });
    else hours_worked = r.n ?? 0;
  }

  let avg_employees = null;
  {
    const r = parseNonNegInt(avg_raw, 'avg_employees');
    if (!r.ok) errors.push({ column: 'avg_employees', reason: r.reason });
    else avg_employees = r.n;
  }

  let contractor_hours_worked = null;
  {
    const r = parseNonNegInt(c_hours_raw, 'contractor_hours_worked');
    if (!r.ok) errors.push({ column: 'contractor_hours_worked', reason: r.reason });
    else contractor_hours_worked = r.n;
  }

  let contractor_avg_employees = null;
  {
    const r = parseNonNegInt(c_avg_raw, 'contractor_avg_employees');
    if (!r.ok) errors.push({ column: 'contractor_avg_employees', reason: r.reason });
    else contractor_avg_employees = r.n;
  }

  const notesErr = checkLen(notes, ADDRESS_MAX, 'notes');
  if (notesErr) errors.push({ column: 'notes', reason: notesErr });

  // UNIQUE(site_id, period_start). Both the existing-DB set and the in-file
  // seen map (CSV path only) are checked. Track in seen even on other-field
  // errors so duplicate rows get flagged at the duplicate row, mirroring the
  // pattern used by users/sites/assets adapters.
  if (site_id !== null && site_id !== undefined && period_start && isIsoDate(period_start)) {
    const key = `${site_id}|${period_start}`;
    if (ctx.seen && ctx.seen.has(key)) {
      errors.push({
        column: 'period_start',
        reason: `Duplicate (site, period_start) in this file (also on row ${ctx.seen.get(key)})`,
      });
    } else if (ctx.existingKeys && ctx.existingKeys.has(key)) {
      errors.push({
        column: 'period_start',
        reason: 'A work_hours entry already exists for this site + period_start',
      });
    }
    if (ctx.seen && !ctx.seen.has(key)) {
      ctx.seen.set(key, payload.__rowNumber);
    }
  }

  if (errors.length === 0) {
    return {
      parsed: {
        site_id, period_start, period_end, hours_worked,
        avg_employees, contractor_hours_worked, contractor_avg_employees,
        notes: notes || null,
      },
    };
  }
  return { errors };
}

// ----- CSV import adapter ---------------------------------------------------

function buildWorkHoursImportDefinition() {
  return {
    entityName: 'work_hours',
    headers: WORK_HOURS_HEADERS,

    validateRow(raw, ctx) {
      const site_name = raw.site_name.trim();
      let site_id = null;
      const earlyErrors = [];
      if (!site_name) earlyErrors.push({ column: 'site_name', reason: 'site_name is required' });
      else {
        site_id = ctx.sitesByName.get(site_name.toLowerCase()) ?? null;
        if (site_id === null) {
          earlyErrors.push({ column: 'site_name', reason: `Site "${site_name}" not found in your organization` });
        }
      }

      const result = validateRow(
        { ...raw, site_id, __rowNumber: raw.__rowNumber },
        { existingKeys: ctx.existingKeys, seen: ctx.seen },
      );

      if (earlyErrors.length || result.errors) {
        return { errors: [...earlyErrors, ...(result.errors || [])] };
      }
      return { parsed: { ...result.parsed, site_name } };
    },

    insertRow(parsed, ctx) {
      const result = db.prepare(`
        INSERT INTO work_hours
          (site_id, period_start, period_end, hours_worked, avg_employees,
           contractor_hours_worked, contractor_avg_employees, entered_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        parsed.site_id, parsed.period_start, parsed.period_end,
        parsed.hours_worked, parsed.avg_employees,
        parsed.contractor_hours_worked, parsed.contractor_avg_employees,
        ctx.actorId, parsed.notes,
      );

      writeActivity({
        org_id: ctx.orgId,
        entity_type: 'work_hours',
        entity_id: result.lastInsertRowid,
        action: 'work_hours_created',
        description: `imported work hours for ${parsed.site_name} (${parsed.period_start} → ${parsed.period_end}): ${parsed.hours_worked.toLocaleString()} hours`,
        user_id: ctx.actorId,
        metadata: {
          source: 'csv_import',
          site_id: parsed.site_id,
          period_start: parsed.period_start,
          period_end: parsed.period_end,
          hours_worked: parsed.hours_worked,
          avg_employees: parsed.avg_employees,
          contractor_hours_worked: parsed.contractor_hours_worked,
          contractor_avg_employees: parsed.contractor_avg_employees,
        },
      });

      return result.lastInsertRowid;
    },

    onAllInserted(ids, ctx) {
      writeActivity({
        org_id: ctx.orgId,
        entity_type: 'work_hours',
        entity_id: null,
        action: 'work_hours_imported',
        description: `imported ${ids.length} work hours record${ids.length === 1 ? '' : 's'} via CSV`,
        user_id: ctx.actorId,
        metadata: { count: ids.length, ids },
      });
    },
  };
}

// ----- Helper: load + check site is in user's org --------------------------

function loadSiteOrNull(siteId, orgId) {
  if (!siteId || !Number.isInteger(Number(siteId))) return null;
  return db.prepare('SELECT id, name FROM sites WHERE id = ? AND org_id = ?').get(Number(siteId), orgId) || null;
}

// ----- Manual CRUD ----------------------------------------------------------

router.get('/', (req, res) => {
  const { site_id, year } = req.query;
  if (!site_id) return res.status(400).json({ error: 'site_id is required' });

  const site = loadSiteOrNull(site_id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  let sql = `SELECT id, site_id, period_start, period_end, hours_worked,
                    avg_employees, contractor_hours_worked, contractor_avg_employees,
                    entered_by, entered_at, notes
             FROM work_hours WHERE site_id = ?`;
  const params = [site.id];
  if (year) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1900 || y > 2999) {
      return res.status(400).json({ error: 'year must be a 4-digit year' });
    }
    sql += ` AND period_start >= ? AND period_start < ?`;
    params.push(`${y}-01-01`, `${y + 1}-01-01`);
  }
  sql += ' ORDER BY period_start DESC';

  const rows = db.prepare(sql).all(...params);
  res.json({ work_hours: rows });
});

router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot enter work hours.' });
  }

  const { site_id } = req.body;
  const site = loadSiteOrNull(site_id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const existingKeys = loadExistingKeys(req.user.org_id);
  const validation = validateRow({ ...req.body, site_id: site.id }, { existingKeys });
  if (validation.errors) {
    return res.status(400).json({ error: validation.errors[0].reason, errors: validation.errors });
  }
  const p = validation.parsed;

  const result = db.prepare(`
    INSERT INTO work_hours
      (site_id, period_start, period_end, hours_worked, avg_employees,
       contractor_hours_worked, contractor_avg_employees, entered_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.site_id, p.period_start, p.period_end, p.hours_worked, p.avg_employees,
    p.contractor_hours_worked, p.contractor_avg_employees, req.user.id, p.notes,
  );

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'work_hours',
    entity_id: result.lastInsertRowid,
    action: 'work_hours_created',
    description: `entered work hours for ${site.name} (${p.period_start} → ${p.period_end}): ${p.hours_worked.toLocaleString()} hours`,
    user_id: req.user.id,
    metadata: {
      source: 'manual',
      site_id: site.id,
      period_start: p.period_start,
      period_end: p.period_end,
      hours_worked: p.hours_worked,
      avg_employees: p.avg_employees,
      contractor_hours_worked: p.contractor_hours_worked,
      contractor_avg_employees: p.contractor_avg_employees,
    },
  });

  const row = db.prepare('SELECT * FROM work_hours WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot edit work hours.' });
  }

  const id = Number(req.params.id);
  const existing = db.prepare(`
    SELECT wh.*, s.name as site_name, s.org_id as site_org_id
    FROM work_hours wh JOIN sites s ON s.id = wh.site_id
    WHERE wh.id = ?
  `).get(id);
  if (!existing || existing.site_org_id !== req.user.org_id) {
    return res.status(404).json({ error: 'Work hours record not found' });
  }

  // PATCH: merge incoming over existing for validation.
  const merged = {
    site_id: existing.site_id,
    period_start: req.body.period_start ?? existing.period_start,
    period_end: req.body.period_end ?? existing.period_end,
    hours_worked: req.body.hours_worked ?? existing.hours_worked,
    avg_employees: req.body.avg_employees ?? existing.avg_employees,
    contractor_hours_worked: req.body.contractor_hours_worked ?? existing.contractor_hours_worked,
    contractor_avg_employees: req.body.contractor_avg_employees ?? existing.contractor_avg_employees,
    notes: req.body.notes ?? existing.notes ?? '',
  };

  // Existing keys exclude this row so editing without changing period_start passes.
  const existingKeys = loadExistingKeys(req.user.org_id, id);
  const validation = validateRow(merged, { existingKeys });
  if (validation.errors) {
    return res.status(400).json({ error: validation.errors[0].reason, errors: validation.errors });
  }
  const p = validation.parsed;

  db.prepare(`
    UPDATE work_hours
       SET period_start = ?, period_end = ?, hours_worked = ?, avg_employees = ?,
           contractor_hours_worked = ?, contractor_avg_employees = ?, notes = ?
     WHERE id = ?
  `).run(
    p.period_start, p.period_end, p.hours_worked, p.avg_employees,
    p.contractor_hours_worked, p.contractor_avg_employees, p.notes, id,
  );

  const updated = db.prepare('SELECT * FROM work_hours WHERE id = ?').get(id);
  const changes = diffFields(existing, updated, WORK_HOURS_AUDIT_FIELDS);
  if (changes) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'work_hours',
      entity_id: id,
      action: 'work_hours_updated',
      description: `updated work hours for ${existing.site_name} (${updated.period_start} → ${updated.period_end})`,
      user_id: req.user.id,
      metadata: changes,
    });
  }

  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot delete work hours.' });
  }

  const id = Number(req.params.id);
  const existing = db.prepare(`
    SELECT wh.*, s.name as site_name, s.org_id as site_org_id
    FROM work_hours wh JOIN sites s ON s.id = wh.site_id
    WHERE wh.id = ?
  `).get(id);
  if (!existing || existing.site_org_id !== req.user.org_id) {
    return res.status(404).json({ error: 'Work hours record not found' });
  }

  db.prepare('DELETE FROM work_hours WHERE id = ?').run(id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'work_hours',
    entity_id: id,
    action: 'work_hours_deleted',
    description: `deleted work hours for ${existing.site_name} (${existing.period_start} → ${existing.period_end}): ${existing.hours_worked.toLocaleString()} hours`,
    user_id: req.user.id,
    metadata: {
      site_id: existing.site_id,
      period_start: existing.period_start,
      period_end: existing.period_end,
      hours_worked: existing.hours_worked,
    },
  });

  res.json({ success: true });
});

// ----- CSV export (round-trip with import) ---------------------------------

// Quote a CSV cell only when needed: contains comma, quote, or newline.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get('/export.csv', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot export work hours.' });
  }

  const { site_id } = req.query;
  const site = loadSiteOrNull(site_id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const rows = db.prepare(`
    SELECT period_start, period_end, hours_worked, avg_employees,
           contractor_hours_worked, contractor_avg_employees, notes
    FROM work_hours WHERE site_id = ?
    ORDER BY period_start ASC
  `).all(site.id);

  const lines = [WORK_HOURS_HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      csvCell(site.name),
      csvCell(r.period_start),
      csvCell(r.period_end),
      csvCell(r.hours_worked),
      csvCell(r.avg_employees),
      csvCell(r.contractor_hours_worked),
      csvCell(r.contractor_avg_employees),
      csvCell(r.notes),
    ].join(','));
  }
  const body = lines.join('\n') + '\n';

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'work_hours',
    entity_id: null,
    action: 'work_hours_exported',
    description: `exported ${rows.length} work hours record${rows.length === 1 ? '' : 's'} for ${site.name}`,
    user_id: req.user.id,
    metadata: { site_id: site.id, count: rows.length },
  });

  const safeName = site.name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'site';
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="work_hours_${safeName}.csv"`);
  res.send(body);
});

// ----- CSV import (existing) -----------------------------------------------

router.get('/import/template.csv', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot import work hours.' });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="work_hours_template.csv"');
  res.send(WORK_HOURS_TEMPLATE_BODY);
});

router.post('/import', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot import work hours.' });
  const { csv_text, mode } = req.body;
  if (!csv_text) return res.status(400).json({ error: 'csv_text is required' });
  if (mode !== 'dry_run' && mode !== 'commit') {
    return res.status(400).json({ error: "mode must be 'dry_run' or 'commit'" });
  }

  // Org-scoped: site_name → site_id and the existing (site_id, period_start) keys.
  const sitesByName = new Map(
    db.prepare('SELECT id, name FROM sites WHERE org_id = ?')
      .all(req.user.org_id)
      .map(s => [s.name.toLowerCase(), s.id])
  );
  const existingKeys = loadExistingKeys(req.user.org_id);

  try {
    const result = runImport(buildWorkHoursImportDefinition(), csv_text, mode, {
      orgId: req.user.org_id,
      actorId: req.user.id,
      sitesByName, existingKeys,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof CsvImportError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

export default router;
