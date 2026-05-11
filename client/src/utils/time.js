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
