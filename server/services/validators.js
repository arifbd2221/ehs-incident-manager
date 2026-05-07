// server/services/validators.js — shared input validation helpers.
//
// Centralised so /signup-org, POST /users, and PATCH /users use identical
// rules. Caps were sized to fit existing UI surfaces (TopBar breadcrumb,
// Settings rows, modal headers) without overflow, while staying generous
// enough that real-world names/orgs aren't refused.

// Practical-not-perfect email regex. We're not trying to fully implement
// RFC 5321 — just reject obvious garbage like "not-an-email" before it
// reaches the DB. Real validation is "send a verification email", which
// we don't do yet.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NAME_MAX = 100;          // org_name, person name, department, job_title
export const EMAIL_MAX = 254;         // RFC 5321 path-component limit
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;       // bcrypt silently truncates beyond this
export const NAICS_MAX = 32;
export const ADDRESS_MAX = 300;

export function validEmail(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= EMAIL_MAX && EMAIL_RE.test(s);
}

// Returns null if ok, else an error string. `label` is used in the message.
export function checkLen(value, max, label) {
  if (typeof value !== 'string') return null;
  if (value.length > max) return `${label} is too long (max ${max} characters)`;
  return null;
}

export function checkPassword(pw) {
  if (typeof pw !== 'string') return 'Password is required';
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (pw.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  return null;
}
