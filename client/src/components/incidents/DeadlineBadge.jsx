// DeadlineBadge.jsx — WI-08 regulatory countdown pill.
//
// Single-deadline renderer. The aggregated list comes from either:
//   • GET /incidents/:id/deadlines (used by IncidentDetail header), or
//   • inc.pending_deadlines on a list-row payload (used by IncidentsList).
//
// Color/urgency is derived from `status`:
//   overdue / without_delay  → red    (regulatory obligation outstanding)
//   due_today                → red    (< 24h to deadline)
//   due_soon                 → amber  (< 72h)
//   upcoming                 → blue   (> 72h, still pending)
//   submitted                → gray   (obligation discharged)
//
// All colors come from --sds-* design tokens via inline style so a single
// reusable pill works inside .idet-badges (header) and .inc-card-chips
// (list rows) without page-specific CSS.

import { formatDate } from '../../utils/time';

const STATUS_LABELS = {
  overdue: 'OVERDUE',
  without_delay: 'WITHOUT DELAY',
  due_today: 'DUE TODAY',
  due_soon: 'DUE SOON',
  upcoming: '',          // intentionally empty — countdown text speaks for itself
  submitted: 'SUBMITTED',
};

// Token + foreground combos. The pill background is a tint of the
// foreground colour, matching the existing st-* / pill-* idiom.
const STATUS_STYLE = {
  overdue:        { fg: 'var(--sds-error)',   bg: 'rgba(211,47,47,0.10)' },
  without_delay:  { fg: 'var(--sds-error)',   bg: 'rgba(211,47,47,0.10)' },
  due_today:      { fg: 'var(--sds-error)',   bg: 'rgba(211,47,47,0.10)' },
  due_soon:       { fg: 'var(--sds-warning)', bg: 'rgba(237,108,2,0.10)' },
  upcoming:       { fg: 'var(--sds-info)',    bg: 'rgba(13,180,240,0.10)' },
  submitted:      { fg: 'var(--sds-success)', bg: 'rgba(46,125,50,0.10)' },
};

function relativeFromNow(iso, now = new Date()) {
  if (!iso) return '';
  const dt = new Date(iso);
  const ms = dt - now;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  if (days >= 1) {
    return ms < 0 ? `${days}d ago` : `${days}d`;
  }
  return ms < 0 ? `${hours}h ago` : `${hours}h`;
}

export default function DeadlineBadge({ deadline, compact = false }) {
  if (!deadline) return null;
  const { kind, label, reg_ref, deadline_at, submitted_at, status } = deadline;
  const style = STATUS_STYLE[status] || STATUS_STYLE.upcoming;
  const statusText = STATUS_LABELS[status] ?? '';

  // Build the countdown text. submitted_at trumps deadline_at when the
  // obligation has been discharged.
  let countdown = '';
  if (status === 'submitted' && submitted_at) {
    countdown = `submitted ${formatDate(submitted_at)}`;
  } else if (status === 'without_delay') {
    countdown = 'phone HSE now';
  } else if (deadline_at) {
    countdown = relativeFromNow(deadline_at);
  }

  // Tooltip carries the full label + reg paragraph + absolute date so
  // an auditor sees the canonical information on hover.
  const titleParts = [];
  if (label) titleParts.push(label);
  if (reg_ref) titleParts.push(reg_ref);
  if (deadline_at) titleParts.push(`due ${formatDate(deadline_at)}`);
  if (submitted_at) titleParts.push(`submitted ${formatDate(submitted_at)}`);
  const title = titleParts.join(' · ');

  // The visible text on the pill:
  //   compact (list row) : "RIDDOR · 8d"
  //   full   (header)    : "RIDDOR F2508 — written · 8d"
  const visibleLabel = compact
    ? (label?.split('—')[0] || label || kind).trim()
    : label || kind;

  return (
    <span
      className="inc-card-status"
      style={{
        background: style.bg,
        color: style.fg,
        fontWeight: 600,
      }}
      title={title}
    >
      <span className="st-dot" style={{ background: style.fg }}/>
      {visibleLabel}
      {statusText && (
        <span style={{ marginLeft: 6, fontWeight: 700, letterSpacing: '0.04em', fontSize: 10 }}>
          {statusText}
        </span>
      )}
      {countdown && (
        <span style={{ marginLeft: 6, opacity: 0.85 }}>· {countdown}</span>
      )}
    </span>
  );
}
