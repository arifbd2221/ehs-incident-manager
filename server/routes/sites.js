// server/routes/sites.js — full Site CRUD + hierarchy + enriched detail.
//
// GET endpoints (read) live elsewhere for back-compat:
//   GET /api/auth/sites   (no auth, registration form)
//   GET /api/users/sites  (auth, scoped by org)
// This module owns the write side and the enriched read at /api/sites/:id:
//   GET    /api/sites          — list (auth, scoped by org); each row includes parent_id
//   GET    /api/sites/:id      — detail with parent + ancestors + children + counts + recents
//   POST   /api/sites          — create (elevated only); accepts parent_id
//   PATCH  /api/sites/:id      — update (elevated only); accepts parent_id
//   DELETE /api/sites/:id      — hard-delete (elevated only); blocked when refs exist
//
// Hierarchy rules (enforced at route layer):
//   * parent_id must be in the same org as the site.
//   * A site cannot be its own parent.
//   * No cycles — walking up the ancestor chain must not encounter the site itself.
//   * Depth cap of MAX_LEVELS (5). depth(parent) + 1 + deepest-descendant-of-self <= 5.
//
// Sites still have no `active` column — delete is hard-delete, blocked when any
// incident/asset/work_hours/user/child-site row references the site.

import { Router } from 'express';
import db from '../db/connection.js';
import { writeActivity, diffFields } from '../services/activity_log.js';
import { runImport, CsvImportError } from '../services/csv_import.js';
import { checkLen, NAME_MAX, NAICS_MAX, ADDRESS_MAX } from '../services/validators.js';

const router = Router();

const SITE_AUDIT_FIELDS = [
  'name', 'address', 'country', 'naics_code', 'establishment_id',
  'hse_establishment_id', 'annual_avg_employees', 'total_hours_worked',
  'timezone', 'parent_id',
];

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const MAX_LEVELS = 5;

// ----- Hierarchy helpers ----------------------------------------------------

// Number of ancestors above a site. Root site → 0.
function ancestorCount(siteId) {
  let count = 0;
  let cur = siteId;
  const seen = new Set();
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const row = db.prepare('SELECT parent_id FROM sites WHERE id = ?').get(cur);
    if (!row || !row.parent_id) break;
    cur = row.parent_id;
    count++;
  }
  return count;
}

// Depth from a site down to its deepest descendant. Leaf → 0.
function descendantDepth(siteId, orgId) {
  let depth = 0;
  let frontier = [siteId];
  const seen = new Set();
  while (frontier.length > 0) {
    const next = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      const kids = db
        .prepare('SELECT id FROM sites WHERE parent_id = ? AND org_id = ?')
        .all(id, orgId);
      for (const k of kids) next.push(k.id);
    }
    if (next.length === 0) break;
    frontier = next;
    depth++;
  }
  return depth;
}

// Returns an error string, or null if valid.
// Pass siteId = null when validating for a brand-new site (no descendants yet).
function validateParent(siteId, parentId, orgId) {
  if (parentId === null || parentId === undefined || parentId === '') return null;
  const pid = Number(parentId);
  if (!Number.isInteger(pid) || pid <= 0) return 'parent_id must be a positive integer.';
  if (siteId && pid === siteId) return 'Site cannot be its own parent.';

  const parent = db
    .prepare('SELECT id FROM sites WHERE id = ? AND org_id = ?')
    .get(pid, orgId);
  if (!parent) return 'Parent site not found in your organization.';

  // Cycle: walk up parent's ancestors; siteId must not appear.
  if (siteId) {
    let cur = pid;
    const seen = new Set();
    while (cur) {
      if (seen.has(cur)) break;
      seen.add(cur);
      if (cur === siteId) return 'Cannot create a circular hierarchy.';
      const row = db.prepare('SELECT parent_id FROM sites WHERE id = ?').get(cur);
      cur = row?.parent_id || null;
    }
  }

  // Depth: parent's ancestorCount + 1 (this site) + this site's subtree depth.
  const parentDepth = ancestorCount(pid);
  const subtree = siteId ? descendantDepth(siteId, orgId) : 0;
  if (parentDepth + 1 + subtree > MAX_LEVELS - 1) {
    return `Hierarchy depth would exceed ${MAX_LEVELS} levels.`;
  }

  return null;
}

// Ancestors root → immediate-parent (excluding self).
function ancestorsOf(siteId) {
  const chain = [];
  let cur = siteId;
  const seen = new Set();
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const row = db.prepare('SELECT parent_id FROM sites WHERE id = ?').get(cur);
    if (!row || !row.parent_id) break;
    const parent = db
      .prepare('SELECT id, name FROM sites WHERE id = ?')
      .get(row.parent_id);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent.id;
  }
  return chain;
}

// ----- Routes ---------------------------------------------------------------

router.get('/', (req, res) => {
  const sites = db
    .prepare('SELECT * FROM sites WHERE org_id = ? ORDER BY name')
    .all(req.user.org_id);
  res.json({ sites });
});

router.get('/:id', (req, res) => {
  const site = db
    .prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const ancestors = ancestorsOf(site.id);
  const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;

  const children = db
    .prepare('SELECT * FROM sites WHERE parent_id = ? AND org_id = ? ORDER BY name')
    .all(site.id, req.user.org_id);

  const counts = {
    assets: db
      .prepare('SELECT COUNT(*) AS c FROM assets WHERE site_id = ? AND active = 1')
      .get(site.id).c,
    open_incidents: db
      .prepare("SELECT COUNT(*) AS c FROM incidents WHERE site_id = ? AND status != 'Closed'")
      .get(site.id).c,
    total_incidents: db
      .prepare('SELECT COUNT(*) AS c FROM incidents WHERE site_id = ?')
      .get(site.id).c,
    users: db
      .prepare('SELECT COUNT(*) AS c FROM users WHERE site_id = ? AND is_active = 1')
      .get(site.id).c,
    children: children.length,
  };

  const recent_incidents = db.prepare(`
    SELECT id, incident_number, title, type, severity, track, status,
           incident_datetime, created_at
    FROM incidents
    WHERE site_id = ?
    ORDER BY incident_datetime DESC
    LIMIT 5
  `).all(site.id);

  const recent_assets = db.prepare(`
    SELECT id, asset_number, name, asset_type, location_description, created_at
    FROM assets
    WHERE site_id = ? AND active = 1
    ORDER BY created_at DESC
    LIMIT 5
  `).all(site.id);

  const work_hours = db.prepare(`
    SELECT COALESCE(SUM(hours_worked), 0) AS total_hours,
           COUNT(*) AS periods
    FROM work_hours
    WHERE site_id = ?
  `).get(site.id);

  res.json({
    ...site,
    parent,
    ancestors,
    children,
    counts,
    recent_incidents,
    recent_assets,
    work_hours_total: work_hours.total_hours,
    work_hours_periods: work_hours.periods,
  });
});

router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create sites.' });
  }

  const {
    name, address, country, naics_code, establishment_id, hse_establishment_id,
    annual_avg_employees, total_hours_worked, timezone, parent_id,
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const parentErr = validateParent(null, parent_id, req.user.org_id);
  if (parentErr) return res.status(400).json({ error: parentErr });

  const result = db.prepare(`
    INSERT INTO sites (
      org_id, name, address, country, naics_code, establishment_id,
      hse_establishment_id, annual_avg_employees, total_hours_worked, timezone, parent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.org_id,
    name.trim(),
    address || null,
    country || 'US',
    naics_code || null,
    establishment_id || null,
    hse_establishment_id || null,
    annual_avg_employees ?? 0,
    total_hours_worked ?? 0,
    timezone || 'America/New_York',
    parent_id ? Number(parent_id) : null,
  );

  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(result.lastInsertRowid);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'site',
    entity_id: site.id,
    action: 'site_created',
    description: `created site ${site.name}`,
    user_id: req.user.id,
    metadata: site.parent_id ? { parent_id: site.parent_id } : null,
  });

  res.status(201).json(site);
});

router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot edit sites.' });
  }

  const site = db
    .prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.body.parent_id !== undefined) {
    const parentErr = validateParent(site.id, req.body.parent_id, req.user.org_id);
    if (parentErr) return res.status(400).json({ error: parentErr });
  }

  const updatable = [
    'name', 'address', 'country', 'naics_code', 'establishment_id',
    'hse_establishment_id', 'annual_avg_employees', 'total_hours_worked',
    'timezone', 'parent_id',
  ];
  const sets = [];
  const params = [];

  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      let val = req.body[key];
      if (key === 'parent_id') {
        val = val === null || val === '' ? null : Number(val);
      }
      params.push(val);
    }
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(site.id);
  db.prepare(`UPDATE sites SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id);

  const changes = diffFields(site, updated, SITE_AUDIT_FIELDS);
  if (changes) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'site',
      entity_id: site.id,
      action: 'site_updated',
      description: `updated site ${updated.name}`,
      user_id: req.user.id,
      metadata: changes,
    });
  }

  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot delete sites.' });
  }

  const site = db
    .prepare('SELECT * FROM sites WHERE id = ? AND org_id = ?')
    .get(req.params.id, req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  const refs = {
    incidents: db.prepare('SELECT COUNT(*) as c FROM incidents WHERE site_id = ?').get(site.id).c,
    assets: db.prepare('SELECT COUNT(*) as c FROM assets WHERE site_id = ?').get(site.id).c,
    work_hours: db.prepare('SELECT COUNT(*) as c FROM work_hours WHERE site_id = ?').get(site.id).c,
    users: db.prepare('SELECT COUNT(*) as c FROM users WHERE site_id = ?').get(site.id).c,
    children: db.prepare('SELECT COUNT(*) as c FROM sites WHERE parent_id = ?').get(site.id).c,
  };
  const total = Object.values(refs).reduce((a, b) => a + b, 0);
  if (total > 0) {
    return res.status(409).json({
      error: 'Site has dependent records and cannot be deleted.',
      references: refs,
    });
  }

  db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'site',
    entity_id: site.id,
    action: 'site_deleted',
    description: `deleted site ${site.name}`,
    user_id: req.user.id,
    metadata: { name: site.name, country: site.country, parent_id: site.parent_id },
  });

  res.json({ success: true });
});

// ---------- CSV import (P3-OB2) ----------------------------------------

const SITE_IMPORT_HEADERS = [
  'name', 'country', 'address', 'naics_code', 'establishment_id',
  'annual_avg_employees', 'total_hours_worked', 'timezone', 'parent_name',
];

const SITE_IMPORT_TEMPLATE_BODY =
  SITE_IMPORT_HEADERS.join(',') + '\n' +
  'Cleveland Plant,US,123 Main St,325199,12-3456,248,508420,America/New_York,\n' +
  'Bay 3,US,,,,50,100000,America/New_York,Cleveland Plant\n';

// Two-pass insert lets parent_name reference a site created earlier in the
// same import (e.g. a parent on row 2, child referencing the parent on row 3).
// We resolve in two stages: first pass creates rows whose parent is empty or
// already exists in the DB; second pass creates rows whose parent name was
// inserted in the first pass. Cycle/depth validation runs per insert via the
// existing validateParent() helper.
function buildSiteImportDefinition() {
  return {
    entityName: 'site',
    headers: SITE_IMPORT_HEADERS,

    validateRow(raw, ctx) {
      const errors = [];
      const name = raw.name.trim();
      const country = raw.country.trim() || 'US';
      const address = raw.address.trim();
      const naics_code = raw.naics_code.trim();
      const establishment_id = raw.establishment_id.trim();
      const annual_avg_employees_raw = raw.annual_avg_employees.trim();
      const total_hours_worked_raw = raw.total_hours_worked.trim();
      const timezone = raw.timezone.trim() || 'America/New_York';
      const parent_name = raw.parent_name.trim();

      if (!name) errors.push({ column: 'name', reason: 'Name is required' });
      else {
        const e = checkLen(name, NAME_MAX, 'Name');
        if (e) errors.push({ column: 'name', reason: e });
        else if (ctx.seen.has(name.toLowerCase())) {
          errors.push({ column: 'name', reason: `Duplicate site name in this file (also on row ${ctx.seen.get(name.toLowerCase())})` });
        } else if (ctx.existingNames.has(name.toLowerCase())) {
          errors.push({ column: 'name', reason: 'A site with this name already exists in your organization' });
        }
      }

      // Track the name in `seen` even if this row has other validation
      // errors, so a later row with the same name still gets flagged on
      // the first dry-run rather than waiting for the earlier row to be
      // cleaned up.
      if (name && checkLen(name, NAME_MAX, 'Name') === null && !ctx.seen.has(name.toLowerCase())) {
        ctx.seen.set(name.toLowerCase(), raw.__rowNumber);
      }

      const addrErr = checkLen(address, ADDRESS_MAX, 'Address');
      if (addrErr) errors.push({ column: 'address', reason: addrErr });
      const naicsErr = checkLen(naics_code, NAICS_MAX, 'NAICS code');
      if (naicsErr) errors.push({ column: 'naics_code', reason: naicsErr });
      const estErr = checkLen(establishment_id, NAME_MAX, 'Establishment ID');
      if (estErr) errors.push({ column: 'establishment_id', reason: estErr });

      let annual_avg_employees = 0;
      if (annual_avg_employees_raw !== '') {
        const n = Number(annual_avg_employees_raw);
        if (!Number.isInteger(n) || n < 0) {
          errors.push({ column: 'annual_avg_employees', reason: 'Must be a non-negative integer' });
        } else annual_avg_employees = n;
      }

      let total_hours_worked = 0;
      if (total_hours_worked_raw !== '') {
        const n = Number(total_hours_worked_raw);
        if (!Number.isInteger(n) || n < 0) {
          errors.push({ column: 'total_hours_worked', reason: 'Must be a non-negative integer' });
        } else total_hours_worked = n;
      }

      // parent_name must resolve to either an existing site OR a site
      // earlier in this same file. We don't validate cycles/depth here —
      // that runs at insert time against the live state.
      if (parent_name) {
        const inDb = ctx.existingNames.has(parent_name.toLowerCase());
        const inFile = ctx.seen.has(parent_name.toLowerCase());
        if (!inDb && !inFile) {
          errors.push({ column: 'parent_name', reason: `Parent site "${parent_name}" not found (must already exist or be defined earlier in this file)` });
        }
        if (parent_name.toLowerCase() === name.toLowerCase()) {
          errors.push({ column: 'parent_name', reason: 'A site cannot be its own parent' });
        }
      }

      if (errors.length === 0) {
        return {
          parsed: {
            name, country, address: address || null, naics_code: naics_code || null,
            establishment_id: establishment_id || null,
            annual_avg_employees, total_hours_worked, timezone,
            parent_name: parent_name || null,
          },
        };
      }
      return { errors };
    },

    insertRow(parsed, ctx) {
      let parent_id = null;
      if (parsed.parent_name) {
        // Look in this import's just-inserted IDs first (case-insensitive),
        // then fall back to live DB lookup.
        const fromFile = ctx.insertedByName.get(parsed.parent_name.toLowerCase());
        if (fromFile) parent_id = fromFile;
        else {
          const row = db.prepare('SELECT id FROM sites WHERE LOWER(name) = LOWER(?) AND org_id = ?')
            .get(parsed.parent_name, ctx.orgId);
          if (row) parent_id = row.id;
        }
      }

      // Late cycle/depth check using the existing validator. Throws to
      // trigger atomic rollback if a fully-committed batch would exceed
      // 5 levels (rare but possible if rows depend on each other).
      const parentErr = parent_id ? validateParent(null, parent_id, ctx.orgId) : null;
      if (parentErr) {
        throw new Error(`Row ${parsed.__rowNumber}: ${parentErr}`);
      }

      const result = db.prepare(`
        INSERT INTO sites (
          org_id, name, address, country, naics_code, establishment_id,
          annual_avg_employees, total_hours_worked, timezone, parent_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ctx.orgId, parsed.name, parsed.address, parsed.country, parsed.naics_code,
        parsed.establishment_id, parsed.annual_avg_employees, parsed.total_hours_worked,
        parsed.timezone, parent_id,
      );

      ctx.insertedByName.set(parsed.name.toLowerCase(), result.lastInsertRowid);

      writeActivity({
        org_id: ctx.orgId,
        entity_type: 'site',
        entity_id: result.lastInsertRowid,
        action: 'site_created',
        description: `imported site ${parsed.name}`,
        user_id: ctx.actorId,
        metadata: {
          source: 'csv_import',
          country: parsed.country,
          parent_id,
          establishment_id: parsed.establishment_id,
        },
      });

      return result.lastInsertRowid;
    },

    onAllInserted(ids, ctx) {
      writeActivity({
        org_id: ctx.orgId,
        entity_type: 'site',
        entity_id: null,
        action: 'sites_imported',
        description: `imported ${ids.length} site${ids.length === 1 ? '' : 's'} via CSV`,
        user_id: ctx.actorId,
        metadata: { count: ids.length, ids },
      });
    },
  };
}

router.get('/import/template.csv', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot import sites.' });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="sites_template.csv"');
  res.send(SITE_IMPORT_TEMPLATE_BODY);
});

router.post('/import', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot import sites.' });
  const { csv_text, mode } = req.body;
  if (!csv_text) return res.status(400).json({ error: 'csv_text is required' });
  if (mode !== 'dry_run' && mode !== 'commit') {
    return res.status(400).json({ error: "mode must be 'dry_run' or 'commit'" });
  }

  const existingNames = new Set(
    db.prepare('SELECT name FROM sites WHERE org_id = ?').all(req.user.org_id).map(s => s.name.toLowerCase())
  );

  try {
    const result = runImport(buildSiteImportDefinition(), csv_text, mode, {
      orgId: req.user.org_id,
      actorId: req.user.id,
      existingNames,
      insertedByName: new Map(),  // populated as rows commit
    });
    res.json(result);
  } catch (e) {
    if (e instanceof CsvImportError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

export default router;
