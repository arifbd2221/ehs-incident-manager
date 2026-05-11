// SQLite's datetime('now') stores UTC as 'YYYY-MM-DD HH:MM:SS' (no T, no Z).
// Bare `new Date(s)` interprets that as LOCAL time, which silently shifts
// every relative-time display by the browser's UTC offset (e.g. UTC+6 →
// "just-now" rows render as "6h ago"). Treat any timestamp string without
// an explicit timezone as UTC, since that's what every server-side default
// (`datetime('now')`, ISO strings without offset) is in this project.
function parseServerDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  // Already has a timezone (Z or ±HH:MM) — let the engine handle it.
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  // 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DDTHH:MM:SS' (no offset) — UTC.
  return new Date(s.replace(' ', 'T') + 'Z');
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = parseServerDate(dateStr);
  if (!date || isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = parseServerDate(dateStr);
  if (!d || isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}, ${d.toTimeString().slice(0, 5)}`;
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = parseServerDate(dateStr);
  if (!d || isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Whole days between today (UTC) and the given ISO date. Negative = in the
// past; positive = future. Used by the P3-OP1 maintenance UI to render
// "due in 12 days" / "3 days overdue".
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = parseServerDate(dateStr);
  if (!target || isNaN(target.getTime())) return null;
  // Normalize both ends to UTC midnight so a partial day doesn't tip the count.
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((targetUtc - todayUtc) / 86400000);
}

// Bucket a due-date string into one of the maintenance status pills.
// Mirrors the server's status compute in routes/maintenance.js.
export function dueStatus(dateStr, { dueSoonDays = 30 } = {}) {
  const d = daysUntil(dateStr);
  if (d == null) return 'ok';
  if (d < 0) return 'overdue';
  if (d <= dueSoonDays) return 'due_soon';
  return 'ok';
}

// "due in 12 days" / "1 day overdue" / "due today". Defaults to a short
// readable label suitable for table cells; pass mode='long' for sentence form.
export function dueLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d == null) return '—';
  if (d === 0) return 'due today';
  if (d > 0) return `due in ${d} day${d === 1 ? '' : 's'}`;
  const abs = Math.abs(d);
  return `${abs} day${abs === 1 ? '' : 's'} overdue`;
}
