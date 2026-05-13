import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/connection.js';
import { writeActivity, diffFields } from '../services/activity_log.js';
import { validEmail, checkLen, checkPassword, NAME_MAX, EMAIL_MAX, ADDRESS_MAX } from '../services/validators.js';

// Same enum the FE shows in the affected-person + profile pickers.
// Stored verbatim on users.gender. Empty string means "not set".
const VALID_GENDERS = new Set(['', 'female', 'male', 'non_binary', 'prefer_not_to_say', 'other']);

// Permissive ISO-date check — YYYY-MM-DD, no time component.
// (Matches the FE DatePicker output and what the BE writes elsewhere.)
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function checkIsoDate(value, label) {
  if (!value) return null;
  if (!ISO_DATE_RE.test(value)) return `${label} must be YYYY-MM-DD`;
  const d = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return `${label} is not a real date`;
  return null;
}
import { runImport, CsvImportError } from '../services/csv_import.js';

const router = Router();

const VALID_ROLES = new Set(['worker', 'supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isAdmin = (user) => user?.role === 'admin';

const USER_AUDIT_FIELDS = ['name', 'role', 'site_id', 'department', 'job_title', 'is_active'];

// Last-admin lockout helper. Counts active admins in an org so PATCH can
// refuse a demotion / deactivation that would orphan the org.
function countActiveAdmins(orgId) {
  return db.prepare(
    `SELECT COUNT(*) AS c FROM users WHERE org_id = ? AND role = 'admin' AND is_active = 1`
  ).get(orgId).c;
}

// GET / — every user in caller's org, active and inactive, with site name.
// Read access is intentionally not admin-gated: any logged-in user in the
// org can see who their colleagues are. Mutation routes below are admin-only.
router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.org_id, u.site_id, u.email, u.name, u.initials, u.role,
           u.department, u.job_title, u.hire_date, u.address, u.phone,
           u.dob, u.gender, u.is_active, u.created_at,
           s.name AS site_name
    FROM users u LEFT JOIN sites s ON s.id = u.site_id
    WHERE u.org_id = ?
    ORDER BY u.is_active DESC, u.name COLLATE NOCASE
  `).all(req.user.org_id);
  res.json({ users });
});

router.get('/sites', (req, res) => {
  const sites = db.prepare('SELECT * FROM sites WHERE org_id = ? ORDER BY name').all(req.user.org_id);
  res.json({ sites });
});

// POST / — admin creates a user with email + initial password. The admin
// hands the credentials off to the new user out-of-band (no email service).
router.post('/', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only' });
  const { email, password, name, role, site_id, department, job_title } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'email, password, name, and role are required' });
  }
  if (!validEmail(email)) return res.status(400).json({ error: 'Email format is invalid' });
  if (!VALID_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' });
  const pwErr = checkPassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  for (const [val, label] of [
    [name, 'Name'], [department, 'Department'], [job_title, 'Job title'],
  ]) {
    const e = checkLen(val, NAME_MAX, label);
    if (e) return res.status(400).json({ error: e });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  if (site_id) {
    const ok = db.prepare('SELECT 1 FROM sites WHERE id = ? AND org_id = ?').get(site_id, req.user.org_id);
    if (!ok) return res.status(400).json({ error: 'Site not in your organization' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const initials = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const result = db.prepare(`
    INSERT INTO users (org_id, site_id, email, password_hash, name, initials, role, department, job_title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.org_id, site_id || null, email, passwordHash, name.trim(), initials, role, department || null, job_title || null);

  const user = db.prepare(`
    SELECT u.id, u.org_id, u.site_id, u.email, u.name, u.initials, u.role,
           u.department, u.job_title, u.is_active, u.created_at,
           s.name AS site_name
    FROM users u LEFT JOIN sites s ON s.id = u.site_id
    WHERE u.id = ?
  `).get(result.lastInsertRowid);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'user',
    entity_id: user.id,
    action: 'user_created',
    description: `created ${user.name} (${user.email}) as ${user.role}`,
    user_id: req.user.id,
    metadata: { role: user.role, site_id: user.site_id, department: user.department, job_title: user.job_title },
  });

  res.status(201).json({ user });
});

// PATCH /:id — update fields on a user in the caller's org. Self-edit is
// blocked for role + active toggle so an admin can't accidentally lock
// themselves out. Last-admin lockout protects the whole org.
router.patch('/:id', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only' });
  const id = Number(req.params.id);

  const before = db.prepare(
    `SELECT id, org_id, site_id, email, name, role, department, job_title, is_active FROM users WHERE id = ? AND org_id = ?`
  ).get(id, req.user.org_id);
  if (!before) return res.status(404).json({ error: 'User not found' });

  const { name, role, site_id, department, job_title, is_active } = req.body;
  const isSelf = id === req.user.id;

  if (isSelf) {
    if (role !== undefined && role !== before.role) {
      return res.status(403).json({ error: 'Cannot change your own role' });
    }
    if (is_active !== undefined && Boolean(is_active) !== Boolean(before.is_active) && !is_active) {
      return res.status(403).json({ error: 'Cannot deactivate yourself' });
    }
  }

  // Last-admin lockout: if the target is the only active admin and we're
  // demoting or deactivating them, refuse.
  if (before.role === 'admin' && before.is_active === 1) {
    const demoting = role !== undefined && role !== 'admin';
    const deactivating = is_active !== undefined && !is_active;
    if (demoting || deactivating) {
      const c = countActiveAdmins(req.user.org_id);
      if (c <= 1) {
        return res.status(403).json({ error: 'Cannot remove the last active admin in your organization' });
      }
    }
  }

  if (role !== undefined && !VALID_ROLES.has(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  for (const [val, label] of [
    [name, 'Name'], [department, 'Department'], [job_title, 'Job title'],
  ]) {
    if (val !== undefined) {
      const e = checkLen(val, NAME_MAX, label);
      if (e) return res.status(400).json({ error: e });
    }
  }
  if (site_id !== null && site_id !== undefined && site_id !== '') {
    const ok = db.prepare('SELECT 1 FROM sites WHERE id = ? AND org_id = ?').get(site_id, req.user.org_id);
    if (!ok) return res.status(400).json({ error: 'Site not in your organization' });
  }

  const sets = [];
  const params = [];
  if (name !== undefined && name.trim()) {
    sets.push('name = ?', 'initials = ?');
    params.push(name.trim(), name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  }
  if (role !== undefined) { sets.push('role = ?'); params.push(role); }
  if (site_id !== undefined) { sets.push('site_id = ?'); params.push(site_id || null); }
  if (department !== undefined) { sets.push('department = ?'); params.push(department || null); }
  if (job_title !== undefined) { sets.push('job_title = ?'); params.push(job_title || null); }
  if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const after = db.prepare(`
    SELECT u.id, u.org_id, u.site_id, u.email, u.name, u.initials, u.role,
           u.department, u.job_title, u.is_active, u.created_at,
           s.name AS site_name
    FROM users u LEFT JOIN sites s ON s.id = u.site_id
    WHERE u.id = ?
  `).get(id);

  const changes = diffFields(before, after, USER_AUDIT_FIELDS);
  if (changes) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'user',
      entity_id: id,
      action: 'user_updated',
      description: `updated ${after.name} (${after.email})`,
      user_id: req.user.id,
      metadata: changes,
    });
  }

  res.json({ user: after });
});

// POST /:id/password — admin sets a new password for another user. Self
// reset goes through /api/auth/password (which requires the current password).
router.post('/:id/password', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only' });
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(403).json({ error: 'Use /api/auth/password to change your own password' });
  }

  const { new_password } = req.body;
  const pwErr = checkPassword(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const target = db.prepare(
    'SELECT id, name, email FROM users WHERE id = ? AND org_id = ?'
  ).get(id, req.user.org_id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 10), id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'user',
    entity_id: id,
    action: 'user_password_reset',
    description: `admin reset password for ${target.name} (${target.email})`,
    user_id: req.user.id,
  });

  res.json({ message: 'Password reset' });
});

// ---------- CSV import (P3-OB2) ----------------------------------------

// Profile fields (address/phone/dob/gender/hire_date) are required by
// OSHA 1904.29, RIDDOR Sch.2, and NSW WHS s.37 for regulator-bound
// reports, and the wizard now auto-fills them from users.* — so we
// accept them on bulk import too. All optional; leave a column blank to
// skip. Order matches USER_IMPORT_HEADERS for csv_import row-by-name access.
const USER_IMPORT_HEADERS = [
  'email', 'name', 'role', 'department', 'job_title', 'site_name', 'password',
  'address', 'phone', 'dob', 'gender', 'hire_date',
];

const USER_IMPORT_TEMPLATE_BODY =
  USER_IMPORT_HEADERS.join(',') + '\n' +
  'jane.doe@example.com,Jane Doe,worker,Production,Press Operator,,changeme1,"1421 W 9th St, Cleveland, OH 44113",+1 216-555-0142,1985-06-14,female,2017-03-10\n' +
  'tom.lee@example.com,Tom Lee,supervisor,Production,Shift Lead,,changeme1,,,,,\n';

// Per-entity definition consumed by services/csv_import.js. The validateRow
// hook resolves site_name → site_id within the caller's org and surfaces
// per-column errors. The seen Map carries the in-file uniqueness check so
// the same email twice in one CSV is caught before the DB UNIQUE fires.
function buildUserImportDefinition() {
  return {
    entityName: 'user',
    headers: USER_IMPORT_HEADERS,

    validateRow(raw, ctx) {
      const errors = [];
      const email = raw.email.trim().toLowerCase();
      const name = raw.name.trim();
      const role = raw.role.trim();
      const department = raw.department.trim();
      const job_title = raw.job_title.trim();
      const site_name = raw.site_name.trim();
      const password = raw.password;  // do not trim — leading/trailing intentional
      // Optional profile fields — present on the header but each row can
      // leave them blank. `raw[k]` is '' (not undefined) for blank cells.
      const address = (raw.address || '').trim();
      const phone = (raw.phone || '').trim();
      const dob = (raw.dob || '').trim();
      const gender = (raw.gender || '').trim().toLowerCase();
      const hire_date = (raw.hire_date || '').trim();

      if (!email) errors.push({ column: 'email', reason: 'Email is required' });
      else if (!validEmail(email) || email.length > EMAIL_MAX) {
        errors.push({ column: 'email', reason: 'Email format is invalid' });
      } else if (ctx.seen.has(email)) {
        errors.push({ column: 'email', reason: `Duplicate email in this file (also on row ${ctx.seen.get(email)})` });
      } else if (ctx.existingEmails.has(email)) {
        errors.push({ column: 'email', reason: 'Email is already registered' });
      }

      // Track even if other validation failed, so duplicates surface
      // on the first dry-run regardless of other errors on the same row.
      if (email && validEmail(email) && email.length <= EMAIL_MAX && !ctx.seen.has(email)) {
        ctx.seen.set(email, raw.__rowNumber);
      }

      if (!name) errors.push({ column: 'name', reason: 'Name is required' });
      else {
        const nameErr = checkLen(name, NAME_MAX, 'Name');
        if (nameErr) errors.push({ column: 'name', reason: nameErr });
      }

      if (!role) errors.push({ column: 'role', reason: 'Role is required' });
      else if (!VALID_ROLES.has(role)) {
        errors.push({ column: 'role', reason: `Role must be one of: ${[...VALID_ROLES].join(', ')}` });
      }

      const deptErr = checkLen(department, NAME_MAX, 'Department');
      if (deptErr) errors.push({ column: 'department', reason: deptErr });
      const titleErr = checkLen(job_title, NAME_MAX, 'Job title');
      if (titleErr) errors.push({ column: 'job_title', reason: titleErr });

      let site_id = null;
      if (site_name) {
        site_id = ctx.sitesByName.get(site_name.toLowerCase()) ?? null;
        if (site_id === null) {
          errors.push({ column: 'site_name', reason: `Site "${site_name}" not found in your organization` });
        }
      }

      const pwErr = checkPassword(password);
      if (pwErr) errors.push({ column: 'password', reason: pwErr });

      // Profile-field validation (all optional — blanks fall through).
      const addrErr = checkLen(address, ADDRESS_MAX, 'Address');
      if (addrErr) errors.push({ column: 'address', reason: addrErr });
      const phoneErr = checkLen(phone, NAME_MAX, 'Phone');
      if (phoneErr) errors.push({ column: 'phone', reason: phoneErr });
      const dobErr = checkIsoDate(dob, 'dob');
      if (dobErr) errors.push({ column: 'dob', reason: dobErr });
      const hireErr = checkIsoDate(hire_date, 'hire_date');
      if (hireErr) errors.push({ column: 'hire_date', reason: hireErr });
      if (gender && !VALID_GENDERS.has(gender)) {
        errors.push({ column: 'gender', reason: `gender must be one of: female, male, non_binary, prefer_not_to_say, other (or blank)` });
      }

      if (errors.length === 0) {
        return {
          parsed: {
            email, name, role,
            department: department || null,
            job_title: job_title || null,
            site_id,
            password,
            address: address || null,
            phone: phone || null,
            dob: dob || null,
            gender: gender || null,
            hire_date: hire_date || null,
          },
        };
      }
      return { errors };
    },

    insertRow(parsed, ctx) {
      const initials = parsed.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const passwordHash = bcrypt.hashSync(parsed.password, 10);
      const result = db.prepare(`
        INSERT INTO users (
          org_id, site_id, email, password_hash, name, initials, role,
          department, job_title, address, phone, dob, gender, hire_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ctx.orgId, parsed.site_id, parsed.email, passwordHash, parsed.name, initials, parsed.role,
        parsed.department, parsed.job_title,
        parsed.address, parsed.phone, parsed.dob, parsed.gender, parsed.hire_date,
      );

      writeActivity({
        org_id: ctx.orgId,
        entity_type: 'user',
        entity_id: result.lastInsertRowid,
        action: 'user_created',
        description: `imported ${parsed.name} (${parsed.email}) as ${parsed.role}`,
        user_id: ctx.actorId,
        metadata: {
          source: 'csv_import',
          role: parsed.role,
          site_id: parsed.site_id,
          department: parsed.department,
          job_title: parsed.job_title,
        },
      });

      return result.lastInsertRowid;
    },

    onAllInserted(ids, ctx) {
      writeActivity({
        org_id: ctx.orgId,
        entity_type: 'user',
        entity_id: null,
        action: 'users_imported',
        description: `imported ${ids.length} user${ids.length === 1 ? '' : 's'} via CSV`,
        user_id: ctx.actorId,
        metadata: { count: ids.length, ids },
      });
    },
  };
}

// GET /import/template.csv — strict-template download (admin-only).
router.get('/import/template.csv', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only' });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="users_template.csv"');
  res.send(USER_IMPORT_TEMPLATE_BODY);
});

// POST /import — body { csv_text, mode: 'dry_run' | 'commit' }.
router.post('/import', (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin only' });
  const { csv_text, mode } = req.body;
  if (!csv_text) return res.status(400).json({ error: 'csv_text is required' });
  if (mode !== 'dry_run' && mode !== 'commit') {
    return res.status(400).json({ error: "mode must be 'dry_run' or 'commit'" });
  }

  // Pre-load org-scoped lookups so each row check is a Map hit, not a query.
  const sitesByName = new Map(
    db.prepare('SELECT id, name FROM sites WHERE org_id = ?')
      .all(req.user.org_id)
      .map(s => [s.name.toLowerCase(), s.id])
  );
  // Email is globally unique on `users` — pre-load all to flag conflicts at
  // dry-run time without one query per row.
  const existingEmails = new Set(
    db.prepare('SELECT email FROM users').all().map(r => r.email.toLowerCase())
  );

  try {
    const result = runImport(buildUserImportDefinition(), csv_text, mode, {
      orgId: req.user.org_id,
      actorId: req.user.id,
      sitesByName,
      existingEmails,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof CsvImportError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

export default router;
