/**
 * EmptyState — a shared, illustrated empty-state surface.
 *
 * The illustration is decorative (aria-hidden); the title carries the
 * meaning. SVGs use `currentColor` for the stroke so they inherit the
 * surrounding text colour, and a CSS variable `--ill-accent` for the
 * single highlight fill. Pass `accent="success"|"warning"|"info"` to
 * change the accent token without overriding the whole illustration.
 *
 * Variants:
 *   default  — generous padding, used inside a page-level surface
 *   compact  — half the padding, used inside a card or column
 */
export default function EmptyState({
  illustration,
  title,
  body,
  action,
  compact = false,
  accent = 'primary',
}) {
  return (
    <div
      className={`empty-state${compact ? ' empty-state-compact' : ''} empty-state-accent-${accent}`}
    >
      {illustration && (
        <div className="empty-state-illustration" aria-hidden="true">
          {illustration}
        </div>
      )}
      {title && <div className="empty-state-title">{title}</div>}
      {body && <div className="empty-state-body">{body}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

/* ============================================================
 * ILLUSTRATIONS
 *
 * Each illustration is a single inline SVG. Stroke uses `currentColor`
 * so the line picks up the page's text colour; the accent fill reads
 * from `--ill-accent` (set by `.empty-state-accent-*`). This keeps
 * the components theme-portable without hardcoded hex values.
 *
 * Sized at 120px square, 2.5px stroke, rounded joins. Mounted inside
 * `.empty-state-illustration` which sets the colour and runs the
 * entrance animation.
 * ============================================================ */

const SVG_BASE = {
  width: 120,
  height: 120,
  viewBox: '0 0 120 120',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
};

// Clipboard with a green checkmark badge — "all clear, nothing logged"
export function EmptyIncidentsIllustration() {
  return (
    <svg {...SVG_BASE}>
      {/* Soft ground shadow */}
      <ellipse cx="60" cy="108" rx="36" ry="3.5" fill="var(--ill-accent)" opacity="0.12" />
      {/* Clipboard body */}
      <rect x="24" y="20" width="62" height="78" rx="6" stroke="currentColor" strokeWidth="2.5" />
      {/* Clip at the top */}
      <rect x="42" y="12" width="26" height="14" rx="3" fill="var(--sds-bg-surface, #fff)" stroke="currentColor" strokeWidth="2.5" />
      {/* Text lines */}
      <line x1="34" y1="40" x2="76" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <line x1="34" y1="52" x2="68" y2="52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <line x1="34" y1="64" x2="74" y2="64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <line x1="34" y1="76" x2="62" y2="76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      {/* Check badge */}
      <circle cx="86" cy="84" r="16" fill="var(--ill-accent)" />
      <path d="M79 84.5l4.5 4.5L94 78" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Stacked task cards with a checkmark — "no actions to track"
export function EmptyCAPAsIllustration() {
  return (
    <svg {...SVG_BASE}>
      <ellipse cx="60" cy="108" rx="38" ry="3.5" fill="var(--ill-accent)" opacity="0.12" />
      {/* Back card */}
      <rect x="28" y="22" width="64" height="20" rx="5" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
      <line x1="38" y1="32" x2="62" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      {/* Middle card */}
      <rect x="24" y="46" width="72" height="22" rx="5" stroke="currentColor" strokeWidth="2.5" opacity="0.6" />
      <circle cx="34" cy="57" r="4" stroke="currentColor" strokeWidth="2" opacity="0.7" />
      <line x1="44" y1="57" x2="78" y2="57" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {/* Front card (with check) */}
      <rect x="20" y="72" width="80" height="24" rx="5" fill="var(--sds-bg-surface, #fff)" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="32" cy="84" r="6" fill="var(--ill-accent)" />
      <path d="M28.5 84l2.5 2.5L36 81" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="44" y1="84" x2="86" y2="84" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Branching question marks — "begin your root cause analysis"
export function EmptyWhysIllustration() {
  return (
    <svg {...SVG_BASE}>
      <ellipse cx="60" cy="108" rx="38" ry="3.5" fill="var(--ill-accent)" opacity="0.12" />
      {/* Trunk question mark */}
      <circle cx="60" cy="26" r="16" fill="var(--ill-accent)" />
      <path d="M55 22c0-3 2-5 5-5s5 2 5 5c0 4-5 4-5 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="60" cy="34.5" r="1.6" fill="#fff" />
      {/* Branch lines */}
      <path d="M60 42v8c0 4-4 6-12 6h-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M60 42v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M60 42v8c0 4 4 6 12 6h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      {/* Three child question circles */}
      <circle cx="30" cy="66" r="8" stroke="currentColor" strokeWidth="2.2" opacity="0.65" />
      <text x="30" y="70" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.65">?</text>
      <circle cx="60" cy="70" r="8" stroke="currentColor" strokeWidth="2.2" opacity="0.65" />
      <text x="60" y="74" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.65">?</text>
      <circle cx="90" cy="66" r="8" stroke="currentColor" strokeWidth="2.2" opacity="0.65" />
      <text x="90" y="70" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" opacity="0.65">?</text>
      {/* Grandchildren dots */}
      <circle cx="30" cy="90" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="60" cy="92" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="90" cy="90" r="3" fill="currentColor" opacity="0.3" />
      <line x1="30" y1="74" x2="30" y2="87" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="60" y1="78" x2="60" y2="89" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="90" y1="74" x2="90" y2="87" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}

// Two speech bubbles with a "+" — "add a witness statement"
export function EmptyWitnessesIllustration() {
  return (
    <svg {...SVG_BASE}>
      <ellipse cx="60" cy="108" rx="38" ry="3.5" fill="var(--ill-accent)" opacity="0.12" />
      {/* Back bubble */}
      <path
        d="M26 36c0-5 4-9 9-9h28c5 0 9 4 9 9v18c0 5-4 9-9 9H52l-8 8v-8h-9c-5 0-9-4-9-9V36z"
        stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="var(--sds-bg-surface, #fff)" opacity="0.65"
      />
      <line x1="36" y1="42" x2="56" y2="42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <line x1="36" y1="50" x2="50" y2="50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      {/* Front bubble */}
      <path
        d="M48 56c0-5 4-9 9-9h28c5 0 9 4 9 9v18c0 5-4 9-9 9H74l8 8-12-8h-13c-5 0-9-4-9-9V56z"
        stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="var(--sds-bg-surface, #fff)"
      />
      <line x1="58" y1="62" x2="80" y2="62" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <line x1="58" y1="70" x2="74" y2="70" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      {/* + badge */}
      <circle cx="92" cy="36" r="11" fill="var(--ill-accent)" />
      <line x1="92" y1="30" x2="92" y2="42" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="86" y1="36" x2="98" y2="36" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// Paperclip over a file with dashed outline — "attach a file"
export function EmptyAttachmentsIllustration() {
  return (
    <svg {...SVG_BASE}>
      <ellipse cx="60" cy="108" rx="36" ry="3.5" fill="var(--ill-accent)" opacity="0.12" />
      {/* File outline (dashed) */}
      <path
        d="M36 22h32l14 14v54a4 4 0 0 1-4 4H36a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4z"
        stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 4" strokeLinejoin="round" fill="var(--sds-bg-surface, #fff)"
      />
      {/* Folded corner */}
      <path d="M68 22v10a4 4 0 0 0 4 4h10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.5" />
      {/* Text lines on file */}
      <line x1="40" y1="56" x2="74" y2="56" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <line x1="40" y1="66" x2="68" y2="66" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <line x1="40" y1="76" x2="72" y2="76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      {/* Paperclip — angled */}
      <g transform="translate(60 56) rotate(-30)">
        <path
          d="M-2 -22v32c0 5 4 9 9 9s9-4 9-9V-18c0-3-2-5-5-5s-5 2-5 5v26c0 1 0 2 2 2s2-1 2-2v-22"
          stroke="var(--ill-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
      </g>
    </svg>
  );
}
