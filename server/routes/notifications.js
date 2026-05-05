import { Router } from 'express';
import db from '../db/connection.js';

const router = Router();

router.get('/', (req, res) => {
  const orgId = req.user.org_id;
  const { unread } = req.query;

  let where = ['(n.org_id = ? AND (n.user_id IS NULL OR n.user_id = ?))'];
  let params = [orgId, req.user.id];

  if (unread === '1') { where.push('n.is_read = 0'); }

  const notifications = db.prepare(`
    SELECT n.*, i.incident_number, i.title as incident_title
    FROM notifications n
    LEFT JOIN incidents i ON i.id = n.incident_id
    WHERE ${where.join(' AND ')}
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(...params);

  const unreadCount = db.prepare(
    'SELECT COUNT(*) as c FROM notifications WHERE org_id = ? AND (user_id IS NULL OR user_id = ?) AND is_read = 0'
  ).get(orgId, req.user.id).c;

  res.json({ notifications, unreadCount });
});

router.patch('/:id/read', (req, res) => {
  const notif = db.prepare(
    'SELECT id FROM notifications WHERE id = ? AND org_id = ? AND (user_id IS NULL OR user_id = ?)'
  ).get(req.params.id, req.user.org_id, req.user.id);
  if (!notif) return res.status(404).json({ error: 'Notification not found' });
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notif.id);
  res.json({ success: true });
});

router.post('/mark-all-read', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE org_id = ? AND (user_id IS NULL OR user_id = ?)').run(req.user.org_id, req.user.id);
  res.json({ success: true });
});

export default router;
