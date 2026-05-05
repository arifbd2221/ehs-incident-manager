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
  const token = generateToken(safeUser);
  res.json({ token, user: safeUser });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare(
    'SELECT id, org_id, site_id, email, name, initials, role, department, job_title FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

export default router;
