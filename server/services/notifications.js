import db from '../db/connection.js';

const insertStmt = db.prepare(`
  INSERT INTO notifications (org_id, user_id, type, incident_id, title, body, severity, deadline, action_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function notifyUser({ orgId, userId, type, incidentId = null, title, body, severity = 'info', deadline = null, actionUrl = null }) {
  insertStmt.run(orgId, userId, type, incidentId, title, body || null, severity, deadline, actionUrl);
}

export function notifyElevatedAtSite({ orgId, siteId, type, incidentId = null, title, body, severity = 'info', deadline = null, actionUrl = null }) {
  const users = db.prepare(`
    SELECT id FROM users
    WHERE org_id = ? AND is_active = 1
      AND role IN ('supervisor', 'ehs_officer', 'ehs_manager', 'admin')
      AND (site_id = ? OR site_id IS NULL OR role = 'admin')
  `).all(orgId, siteId);

  for (const u of users) {
    insertStmt.run(orgId, u.id, type, incidentId, title, body || null, severity, deadline, actionUrl);
  }
}

export function notifyRole({ orgId, role, type, incidentId = null, title, body, severity = 'info', deadline = null, actionUrl = null }) {
  const users = db.prepare(`
    SELECT id FROM users
    WHERE org_id = ? AND is_active = 1 AND role = ?
  `).all(orgId, role);

  for (const u of users) {
    insertStmt.run(orgId, u.id, type, incidentId, title, body || null, severity, deadline, actionUrl);
  }
}
