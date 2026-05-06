import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/connection.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/register', (req, res) => {
  const { email, password, name, role, site_id, department, job_title } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  let orgId = db.prepare('SELECT id FROM organizations LIMIT 1').get()?.id;
  if (!orgId) {
    const result = db.prepare('INSERT INTO organizations (name) VALUES (?)').run('SDS Manager');
    orgId = result.lastInsertRowid;
  }

  const result = db.prepare(`
    INSERT INTO users (org_id, site_id, email, password_hash, name, initials, role, department, job_title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orgId, site_id || null, email, passwordHash, name, initials, role || 'worker', department || null, job_title || null);

  const user = db.prepare('SELECT id, org_id, site_id, email, name, initials, role, department, job_title FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = generateToken(user);

  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { password_hash, ...safeUser } = user;
  if (safeUser.dashboard_layout) safeUser.dashboard_layout = JSON.parse(safeUser.dashboard_layout);
  const token = generateToken(safeUser);
  res.json({ token, user: safeUser });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare(
    'SELECT id, org_id, site_id, email, name, initials, role, department, job_title, created_at, dashboard_layout FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.dashboard_layout) user.dashboard_layout = JSON.parse(user.dashboard_layout);
  res.json({ user });
});

router.get('/sites', (req, res) => {
  const sites = db.prepare('SELECT id, name FROM sites ORDER BY name').all();
  res.json({ sites });
});

router.patch('/profile', authMiddleware, (req, res) => {
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

  const user = db.prepare(
    'SELECT id, org_id, site_id, email, name, initials, role, department, job_title, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
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
  res.json({ message: 'Password updated successfully' });
});

export default router;
