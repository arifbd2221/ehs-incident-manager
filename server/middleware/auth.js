import jwt from 'jsonwebtoken';
import db from '../db/connection.js';

const JWT_SECRET = process.env.JWT_SECRET || 'sds-incident-mgmt-secret';

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id, email: user.email, role: user.role,
      org_id: user.org_id, org_name: user.org_name,
      compliance_frameworks: user.compliance_frameworks || [],
      logo_path: user.logo_path || null,
      name: user.name, initials: user.initials,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Cheap prepared statement reused on every request to confirm the token
// holder is still active. Without this, a deactivated user keeps full
// access until their JWT naturally expires (24h).
const isActiveStmt = db.prepare('SELECT is_active FROM users WHERE id = ?');

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    const row = isActiveStmt.get(payload.id);
    if (!row || !row.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
