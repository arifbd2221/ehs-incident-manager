// server/routes/work_hours.js — bulk-import per-site, per-period work hours.
//
// The work_hours table predates a manual CRUD UI; it was previously written
// only by the seed and read by the SiteDetail page (sum + period count).
// CSV import is the first user-facing write path.
//
// Schema (mig 001 era):
//   id, site_id, period_start (YYYY-MM-DD), period_end (YYYY-MM-DD),
//   hours_worked (INT NOT NULL), avg_employees (INT NULL),
//   entered_by (FK users), entered_at, notes
//   UNIQUE(site_id, period_start)
//
// Endpoints:
//   GET  /api/work-hours/import/template.csv   — strict-template download
//   POST /api/work-hours/import                — body { csv_text, mode }
// Both elevated-only, matching the role gate on site mutations.

import { Router } from 'express';
import db from '../db/connection.js';
import { writeActivity } from '../services/activity_log.js';
import { runImport, CsvImportError } from '../services/csv_import.js';
import { checkLen, ADDRESS_MAX } from '../services/validators.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const WORK_HOURS_HEADERS = [
  'site_name', 'period_start', 'period_end', 'hours_worked', 'avg_employees', 'notes',
];

const WORK_HOURS_TEMPLATE_BODY =
  WORK_HOURS_HEADERS.join(',') + '\n' +
  'Cleveland Plant,2025-01-01,2025-02-01,42500,250,Q1 month 1\n' +
  'Cleveland Plant,2025-02-01,2025-03-01,41200,250,Q1 month 2\n';

// Match exactly YYYY-MM-DD then verify it's a real date (Date round-trip).
function isIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function buildWorkHoursImportDefinition() {
  return {
    entityName: 'work_hours',
    headers: WORK_HOURS_HEADERS,

    validateRow(raw, ctx) {
      const errors = [];
      const site_name = raw.site_name.trim();
      const period_start = raw.period_start.trim();
      const period_end = raw.period_end.trim();
      const hours_raw = raw.hours_worked.trim();
      const avg_raw = raw.avg_employees.trim();
      const notes = raw.notes.trim();

      // site_name → site_id
      let site_id = null;
      if (!site_name) errors.push({ column: 'site_name', reason: 'site_name is required' });
      else {
        site_id = ctx.sitesByName.get(site_name.toLowerCase()) ?? null;
        if (site_id === null) {
          errors.push({ column: 'site_name', reason: `Site "${site_name}" not found in your organization` });
        }
      }

      // dates
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

      // numbers
      let hours_worked = 0;
      if (!hours_raw) errors.push({ column: 'hours_worked', reason: 'hours_worked is required' });
      else {
        const n = Number(hours_raw);
        if (!Number.isInteger(n) || n < 0) {
          errors.push({ column: 'hours_worked', reason: 'hours_worked must be a non-negative integer' });
        } else hours_worked = n;
      }

      let avg_employees = null;
      if (avg_raw) {
        const n = Number(avg_raw);
        if (!Number.isInteger(n) || n < 0) {
          errors.push({ column: 'avg_employees', reason: 'avg_employees must be a non-negative integer' });
        } else avg_employees = n;
      }

      const notesErr = checkLen(notes, ADDRESS_MAX, 'notes');
      if (notesErr) errors.push({ column: 'notes', reason: notesErr });

      // UNIQUE(site_id, period_start) — both in-file and against DB.
      // Key the seen-Map by `${site_id}|${period_start}` once both are valid.
      if (site_id !== null && period_start && isIsoDate(period_start)) {
        const key = `${site_id}|${period_start}`;
        if (ctx.seen.has(key)) {
          errors.push({
            column: 'period_start',
            reason: `Duplicate (site, period_start) in this file (also on row ${ctx.seen.get(key)})`,
          });
        } else if (ctx.existingKeys.has(key)) {
          errors.push({
            column: 'period_start',
            reason: 'A work_hours entry already exists for this site + period_start',
          });
        }
        // Track even if other validation failed, mirroring users/sites/assets pattern.
        if (!ctx.seen.has(key)) ctx.seen.set(key, raw.__rowNumber);
      }

      if (errors.length === 0) {
        return {
          parsed: {
            site_id, site_name, period_start, period_end,
            hours_worked, avg_employees, notes: notes || null,
          },
        };
      }
      return { errors };
    },

    insertRow(parsed, ctx) {
      const result = db.prepare(`
        INSERT INTO work_hours
          (site_id, period_start, period_end, hours_worked, avg_employees, entered_by, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        parsed.site_id, parsed.period_start, parsed.period_end,
        parsed.hours_worked, parsed.avg_employees, ctx.actorId, parsed.notes,
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

  // Org-scoped lookups: site_name → site_id, and the (site_id, period_start) pairs
  // already in the DB so we can flag UNIQUE collisions at validation time.
  const sitesByName = new Map(
    db.prepare('SELECT id, name FROM sites WHERE org_id = ?')
      .all(req.user.org_id)
      .map(s => [s.name.toLowerCase(), s.id])
  );
  const orgSiteIds = new Set([...sitesByName.values()]);
  const existingKeys = new Set();
  if (orgSiteIds.size > 0) {
    const placeholders = [...orgSiteIds].map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT site_id, period_start FROM work_hours WHERE site_id IN (${placeholders})`
    ).all(...orgSiteIds);
    for (const r of rows) existingKeys.add(`${r.site_id}|${r.period_start}`);
  }

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
