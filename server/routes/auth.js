import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/connection.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';
import { writeActivity, diffFields } from '../services/activity_log.js';

const router = Router();

const PROFILE_AUDIT_FIELDS = ['name', 'department', 'job_title', 'site_id'];

// Public sign-up of a brand-new organization. Founder gets role='admin'.
// One transaction so a half-written org never exists.
// Whitelist of valid framework codes — keeps bad payloads out of the DB.
const VALID_FRAMEWORKS = new Set([
  'osha_300', 'osha_300a', 'osha_301',
  'riddor_f2508', 'safework_nsw', 'generic',
]);

router.post('/signup-org', (req, res) => {
  const {
    org_name, country, industry_sector, compliance_frameworks, company_size, naics_code,
    email, password, name, job_title, department,
  } = req.body;

  if (!org_name || !org_name.trim()) return res.status(400).json({ error: 'Organization name is required' });
  if (!country) return res.status(400).json({ error: 'Country is required' });
  if (!industry_sector) return res.status(400).json({ error: 'Industry sector is required' });
  if (!Array.isArray(compliance_frameworks) || compliance_frameworks.length === 0) {
    return res.status(400).json({ error: 'Select at least one compliance framework' });
  }
  const cleanFrameworks = compliance_frameworks.filter(f => VALID_FRAMEWORKS.has(f));
  if (cleanFrameworks.length === 0) {
    return res.status(400).json({ error: 'No valid compliance frameworks selected' });
  }
  if (!company_size) return res.status(400).json({ error: 'Company size is required' });
  if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const frameworksJson = JSON.stringify(cleanFrameworks);

  const txn = db.transaction(() => {
    const orgRes = db.prepare(
      `INSERT INTO organizations (name, country, industry_sector, naics_code, compliance_frameworks, company_size)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(org_name.trim(), country, industry_sector, naics_code || null, frameworksJson, company_size);
    const orgId = orgRes.lastInsertRowid;

    const userRes = db.prepare(
      `INSERT INTO users (org_id, site_id, email, password_hash, name, initials, role, department, job_title)
       VALUES (?, NULL, ?, ?, ?, ?, 'admin', ?, ?)`
    ).run(orgId, email, passwordHash, name, initials, department || null, job_title || null);

    return { orgId, userId: userRes.lastInsertRowid };
  });

  const { orgId, userId } = txn();

  const user = db.prepare(`
    SELECT u.id, u.org_id, u.site_id, u.email, u.name, u.initials, u.role,
           u.department, u.job_title, u.created_at,
           o.name AS org_name, o.country, o.industry_sector, o.naics_code,
           o.compliance_frameworks, o.company_size
    FROM users u JOIN organizations o ON o.id = u.org_id
    WHERE u.id = ?
  `).get(userId);
  user.compliance_frameworks = cleanFrameworks;

  writeActivity({
    org_id: orgId,
    entity_type: 'organization',
    entity_id: orgId,
    action: 'org_created',
    description: `created organization ${org_name}`,
    user_id: userId,
    metadata: {
      org_name: org_name.trim(),
      country, industry_sector, naics_code: naics_code || null,
      compliance_frameworks: cleanFrameworks, company_size,
      founder_email: email,
    },
  });

  const token = generateToken(user);
  res.status(201).json({ token, user });
});

// Public registration is disabled. New users come from org sign-up (this slice)
// or invitations (slice 2). Kept as a clear 403 instead of a 404 so existing
// callers see the disabled message.
router.post('/register', (_req, res) => {
  return res.status(403).json({
    error: 'Public registration is disabled. Create a new organization at /signup, or ask your admin for an invite.',
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare(`
    SELECT u.*, o.name AS org_name, o.country, o.industry_sector, o.naics_code,
           o.compliance_frameworks, o.company_size
    FROM users u JOIN organizations o ON o.id = u.org_id
    WHERE u.email = ? AND u.is_active = 1
  `).get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { password_hash, ...safeUser } = user;
  if (safeUser.dashboard_layout) safeUser.dashboard_layout = JSON.parse(safeUser.dashboard_layout);
  safeUser.compliance_frameworks = safeUser.compliance_frameworks ? JSON.parse(safeUser.compliance_frameworks) : [];
  const token = generateToken(safeUser);
  res.json({ token, user: safeUser });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.org_id, u.site_id, u.email, u.name, u.initials, u.role,
           u.department, u.job_title, u.created_at, u.dashboard_layout,
           o.name AS org_name, o.country, o.industry_sector, o.naics_code,
           o.compliance_frameworks, o.company_size
    FROM users u JOIN organizations o ON o.id = u.org_id
    WHERE u.id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.dashboard_layout) user.dashboard_layout = JSON.parse(user.dashboard_layout);
  user.compliance_frameworks = user.compliance_frameworks ? JSON.parse(user.compliance_frameworks) : [];
  res.json({ user });
});

router.get('/sites', authMiddleware, (req, res) => {
  const sites = db.prepare('SELECT id, name FROM sites WHERE org_id = ? ORDER BY name').all(req.user.org_id);
  res.json({ sites });
});

router.patch('/profile', authMiddleware, (req, res) => {
  const before = db.prepare(
    'SELECT id, org_id, site_id, email, name, initials, role, department, job_title FROM users WHERE id = ?'
  ).get(req.user.id);

  const { name, department, job_title, site_id } = req.body;
  const sets = [];
  const params = [];

  if (name && name.trim()) {
    sets.push('name = ?', 'initials = ?');
    params.push(name.trim(), name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase());
  }
  if (department !== undefined) { sets.push('department = ?'); params.push(department || null); }
  if (job_title !== undefined) { sets.push('job_title = ?'); params.push(job_title || null); }
  if (site_id !== undefined) { sets.push('site_id = ?'); params.push(site_id || null); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const user = db.prepare(`
    SELECT u.id, u.org_id, u.site_id, u.email, u.name, u.initials, u.role,
           u.department, u.job_title, u.created_at,
           o.name AS org_name, o.country, o.industry_sector, o.naics_code,
           o.compliance_frameworks, o.company_size
    FROM users u JOIN organizations o ON o.id = u.org_id
    WHERE u.id = ?
  `).get(req.user.id);
  user.compliance_frameworks = user.compliance_frameworks ? JSON.parse(user.compliance_frameworks) : [];

  const changes = diffFields(before, user, PROFILE_AUDIT_FIELDS);
  if (changes) {
    writeActivity({
      org_id: user.org_id,
      entity_type: 'user',
      entity_id: user.id,
      action: 'profile_updated',
      description: `updated profile for ${user.name}`,
      user_id: req.user.id,
      metadata: changes,
    });
  }

  const token = generateToken(user);
  res.json({ token, user });
});

router.put('/dashboard-layout', authMiddleware, (req, res) => {
  const { widgets } = req.body;
  if (!Array.isArray(widgets)) return res.status(400).json({ error: 'widgets must be an array' });
  const layout = JSON.stringify({ widgets });
  db.prepare('UPDATE users SET dashboard_layout = ? WHERE id = ?').run(layout, req.user.id);
  res.json({ dashboard_layout: { widgets } });
});

router.post('/password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password are required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row || !bcrypt.compareSync(current_password, row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(new_password, 10), req.user.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'user',
    entity_id: req.user.id,
    action: 'password_changed',
    description: `password changed for ${req.user.name || req.user.email}`,
    user_id: req.user.id,
  });

  res.json({ message: 'Password updated successfully' });
});

export default router;
