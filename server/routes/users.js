import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

router.get('/', (req, res) => {
  const users = db.prepare(
    'SELECT id, org_id, site_id, email, name, initials, role, department, job_title FROM users WHERE org_id = ? AND is_active = 1 ORDER BY name'
  ).all(req.user.org_id);
  res.json({ users });
});

router.get('/sites', (req, res) => {
  const sites = db.prepare('SELECT * FROM sites WHERE org_id = ? ORDER BY name').all(req.user.org_id);
  res.json({ sites });
});

export default router;
