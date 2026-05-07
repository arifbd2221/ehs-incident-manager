import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/connection.js';
import { writeActivity, diffFields } from '../services/activity_log.js';

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
           u.department, u.job_title, u.is_active, u.created_at,
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
  if (!VALID_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

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
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

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

export default router;
