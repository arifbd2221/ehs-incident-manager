// Template category illustrations — animated SVG banners per inspection kind.
// Maps a free-text template name/description to one of six visual kinds.

const KIND_MAP = [
  ['safety', /(safety|hazard|ppe|fire|emergency|first ?aid|lock.?out|tag.?out|loto)/i],
  ['environment', /(environment|environmental|spill|waste|ehs|water|air|emission|recycling|sustainability)/i],
  ['quality', /(quality|qa|qc|defect|specification|conformance|audit.*quality)/i],
  ['compliance', /(compliance|regulatory|iso|osha|riddor|legal|certification|audit)/i],
  ['walkthrough', /(walk.?through|walk|patrol|tour|round|gemba|observation)/i],
];

export const templateIllustrationKind = (template) => {
  if (!template) return 'custom';
  const raw = `${template.name || ''} ${template.description || ''}`;
  for (const [kind, pattern] of KIND_MAP) {
    if (pattern.test(raw)) return kind;
  }
  return 'custom';
};

export const CATEGORY_META = {
  safety: { label: 'Safety', color: '#D32F2F', bg: 'rgba(211,47,47,0.08)' },
  environment: { label: 'Environment', color: '#2E7D32', bg: 'rgba(46,125,50,0.10)' },
  quality: { label: 'Quality', color: '#626DF9', bg: 'rgba(98,109,249,0.10)' },
  compliance: { label: 'Compliance', color: '#5C00FF', bg: 'rgba(92,0,255,0.08)' },
  walkthrough: { label: 'Walkthrough', color: '#ED6C02', bg: 'rgba(237,108,2,0.10)' },
  custom: { label: 'General', color: '#626DF9', bg: 'rgba(98,109,249,0.10)' },
};

const TplIllusSafety = () => (
  <svg viewBox="0 0 320 140" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="tpl-illus tpl-illus-safety">
    <defs>
      <linearGradient id="tplSafetyBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFE5E5" />
        <stop offset="100%" stopColor="#FFF4F4" />
      </linearGradient>
    </defs>
    <rect width="320" height="140" fill="url(#tplSafetyBg)" />
    <circle cx="160" cy="70" r="38" fill="none" stroke="#D32F2F" strokeWidth="1" opacity="0.15" className="tpl-pulse tpl-pulse-1" />
    <circle cx="160" cy="70" r="48" fill="none" stroke="#D32F2F" strokeWidth="1" opacity="0.1" className="tpl-pulse tpl-pulse-2" />
    <circle cx="160" cy="70" r="58" fill="none" stroke="#D32F2F" strokeWidth="1" opacity="0.06" className="tpl-pulse tpl-pulse-3" />
    <path d="M160 30 L188 40 L188 70 Q188 92 160 108 Q132 92 132 70 L132 40 Z" fill="#fff" stroke="#D32F2F" strokeWidth="2" />
    <path d="M160 30 L188 40 L188 50 L132 50 L132 40 Z" fill="#D32F2F" />
    <path d="M146 72 L156 82 L176 60" stroke="#D32F2F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <g transform="translate(40 80)">
      <ellipse cx="20" cy="22" rx="22" ry="6" fill="#1A1A1A" opacity="0.1" />
      <path d="M2 20 Q2 4 20 4 Q38 4 38 20 Z" fill="#FFC93C" stroke="#AE8145" strokeWidth="1.5" />
      <rect x="2" y="20" width="36" height="3" rx="1" fill="#AE8145" />
      <line x1="20" y1="4" x2="20" y2="20" stroke="#AE8145" strokeWidth="1.2" />
    </g>
    <g transform="translate(258 24)" className="tpl-warn">
      <path d="M14 0 L28 26 L0 26 Z" fill="#FFC93C" stroke="#AE8145" strokeWidth="1.4" />
      <line x1="14" y1="10" x2="14" y2="18" stroke="#1A1A1A" strokeWidth="2" />
      <circle cx="14" cy="22" r="1.4" fill="#1A1A1A" />
    </g>
  </svg>
);

const TplIllusEnvironment = () => (
  <svg viewBox="0 0 320 140" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="tpl-illus tpl-illus-env">
    <defs>
      <linearGradient id="tplEnvBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#E5F6E8" />
        <stop offset="100%" stopColor="#F4FAF5" />
      </linearGradient>
      <linearGradient id="tplLeaf" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4caf50" />
        <stop offset="100%" stopColor="#2E7D32" />
      </linearGradient>
    </defs>
    <rect width="320" height="140" fill="url(#tplEnvBg)" />
    <path d="M0 120 Q160 100 320 120 L320 140 L0 140 Z" fill="#A8D5AE" opacity="0.4" />
    <path d="M160 122 Q160 100 165 80 Q170 60 155 40" stroke="#2E7D32" strokeWidth="2.5" fill="none" strokeLinecap="round" className="tpl-stem" />
    <g transform="translate(155 40)" className="tpl-leaf-main" style={{ transformOrigin: '0 30px' }}>
      <path d="M0 30 Q-30 10 -20 -10 Q0 -20 20 -10 Q30 10 0 30 Z" fill="url(#tplLeaf)" />
      <path d="M0 30 Q-5 10 -10 -5" stroke="#1B5E20" strokeWidth="1" fill="none" />
    </g>
    <g transform="translate(165 80)" className="tpl-leaf-small" style={{ transformOrigin: '0 5px' }}>
      <path d="M0 5 Q15 -5 25 5 Q15 12 0 5 Z" fill="#66BB6A" />
    </g>
    <g className="tpl-drop tpl-drop-1">
      <path d="M50 50 Q50 42 55 48 Q60 42 50 50 Q42 56 50 50 Z" fill="#0DB4F0" />
    </g>
    <g className="tpl-drop tpl-drop-2">
      <path d="M250 30 Q250 22 255 28 Q260 22 250 30 Q242 36 250 30 Z" fill="#0DB4F0" opacity="0.7" />
    </g>
    <g className="tpl-drop tpl-drop-3">
      <path d="M280 70 Q280 62 285 68 Q290 62 280 70 Q272 76 280 70 Z" fill="#0DB4F0" opacity="0.8" />
    </g>
    <g transform="translate(40 28)" className="tpl-recycle" style={{ transformOrigin: '14px 14px' }}>
      <circle cx="14" cy="14" r="14" fill="#2E7D32" />
      <path d="M9 10 L14 4 L19 10 M14 4 L14 14" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M10 22 L4 18 L8 12 M4 18 L14 18" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M22 20 L18 26 L24 26 M22 26 L14 14" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </g>
  </svg>
);

const TplIllusQuality = () => (
  <svg viewBox="0 0 320 140" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="tpl-illus tpl-illus-quality">
    <defs>
      <linearGradient id="tplQualBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EEF0FE" />
        <stop offset="100%" stopColor="#F8F9FF" />
      </linearGradient>
    </defs>
    <rect width="320" height="140" fill="url(#tplQualBg)" />
    {Array.from({ length: 8 }).map((_, i) => (
      <line key={i} x1={i * 40} y1="0" x2={i * 40} y2="140" stroke="#D6DAFB" strokeWidth="0.5" strokeDasharray="2 4" />
    ))}
    <g transform="translate(110 18)">
      <rect x="0" y="8" width="100" height="120" rx="6" fill="#fff" stroke="#626DF9" strokeWidth="1.8" />
      <rect x="30" y="0" width="40" height="16" rx="3" fill="#626DF9" />
      <rect x="38" y="3" width="24" height="10" rx="1.5" fill="#fff" />
      <g className="tpl-check tpl-check-1">
        <rect x="12" y="30" width="11" height="11" rx="2" fill="#E8F5E9" stroke="#2E7D32" />
        <path d="M14 35 L17 38 L21 32" stroke="#2E7D32" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="29" y1="36" x2="88" y2="36" stroke="#52525F" strokeWidth="1.2" />
      </g>
      <g className="tpl-check tpl-check-2">
        <rect x="12" y="48" width="11" height="11" rx="2" fill="#E8F5E9" stroke="#2E7D32" />
        <path d="M14 53 L17 56 L21 50" stroke="#2E7D32" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="29" y1="54" x2="76" y2="54" stroke="#52525F" strokeWidth="1.2" />
      </g>
      <g className="tpl-check tpl-check-3">
        <rect x="12" y="66" width="11" height="11" rx="2" fill="#E8F5E9" stroke="#2E7D32" />
        <path d="M14 71 L17 74 L21 68" stroke="#2E7D32" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="29" y1="72" x2="82" y2="72" stroke="#52525F" strokeWidth="1.2" />
      </g>
      <g className="tpl-check tpl-check-4">
        <rect x="12" y="84" width="11" height="11" rx="2" fill="#fff" stroke="#626DF9" />
        <line x1="29" y1="90" x2="70" y2="90" stroke="#52525F" strokeWidth="1.2" />
      </g>
      <g>
        <rect x="12" y="102" width="11" height="11" rx="2" fill="#fff" stroke="#7E7E8C" />
        <line x1="29" y1="108" x2="64" y2="108" stroke="#7E7E8C" strokeWidth="1.2" />
      </g>
    </g>
    <g transform="translate(252 28)" className="tpl-star">
      <polygon points="14 0 17.5 9 27 10 19.5 16 22 26 14 21 6 26 8.5 16 1 10 10.5 9" fill="#FFC93C" stroke="#AE8145" strokeWidth="0.8" />
    </g>
    <g transform="translate(40 80)" className="tpl-star tpl-star-2">
      <polygon points="10 0 12.5 6.5 19 7 14 11.5 16 18 10 15 4 18 6 11.5 1 7 7.5 6.5" fill="#FFC93C" opacity="0.7" />
    </g>
  </svg>
);

const TplIllusCompliance = () => (
  <svg viewBox="0 0 320 140" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="tpl-illus tpl-illus-compliance">
    <defs>
      <linearGradient id="tplCompBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F0EBFF" />
        <stop offset="100%" stopColor="#F8F6FF" />
      </linearGradient>
    </defs>
    <rect width="320" height="140" fill="url(#tplCompBg)" />
    <g transform="translate(80 14)">
      <rect x="0" y="0" width="110" height="120" rx="4" fill="#fff" stroke="#5C00FF" strokeWidth="1.6" />
      <path d="M88 0 L110 22 L88 22 Z" fill="#E8E2FF" stroke="#5C00FF" strokeWidth="1.6" />
      <rect x="12" y="14" width="60" height="6" rx="2" fill="#5C00FF" />
      <rect x="12" y="28" width="86" height="3" rx="1.5" fill="#CFC4FA" />
      <rect x="12" y="36" width="76" height="3" rx="1.5" fill="#CFC4FA" />
      <rect x="12" y="44" width="80" height="3" rx="1.5" fill="#CFC4FA" />
      <rect x="12" y="52" width="62" height="3" rx="1.5" fill="#CFC4FA" />
      <rect x="12" y="60" width="86" height="3" rx="1.5" fill="#CFC4FA" />
      <rect x="12" y="68" width="72" height="3" rx="1.5" fill="#CFC4FA" />
      <rect x="12" y="76" width="82" height="3" rx="1.5" fill="#CFC4FA" />
      <rect x="12" y="84" width="58" height="3" rx="1.5" fill="#CFC4FA" />
    </g>
    <g transform="translate(218 78)" className="tpl-seal-wrap">
      <g className="tpl-seal-ring" style={{ transformOrigin: '0 0' }}>
        <circle cx="0" cy="0" r="32" fill="none" stroke="#D32F2F" strokeWidth="1.5" strokeDasharray="4 3" />
      </g>
      <circle cx="0" cy="0" r="24" fill="#D32F2F" />
      <circle cx="0" cy="0" r="20" fill="none" stroke="#fff" strokeWidth="1.2" />
      <text x="0" y="-4" fontSize="6" fontWeight="700" fill="#fff" textAnchor="middle">VERIFIED</text>
      <text x="0" y="10" fontSize="5" fontWeight="600" fill="#fff" textAnchor="middle">2026</text>
      <path d="M-8 2 L-4 6 L8 -6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <g transform="translate(40 36)">
      <path d="M0 0 L24 0 L24 28 L12 22 L0 28 Z" fill="#5C00FF" />
      <path d="M0 0 L24 0 L24 4 L0 4 Z" fill="#FFC93C" />
    </g>
  </svg>
);

const TplIllusWalkthrough = () => (
  <svg viewBox="0 0 320 140" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="tpl-illus tpl-illus-walk">
    <defs>
      <linearGradient id="tplWalkBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFF6E5" />
        <stop offset="100%" stopColor="#FFFCF4" />
      </linearGradient>
    </defs>
    <rect width="320" height="140" fill="url(#tplWalkBg)" />
    <path d="M30 110 Q90 80 150 100 T280 60" stroke="#AE8145" strokeWidth="1.5" fill="none" strokeDasharray="2 5" strokeLinecap="round" opacity="0.5" />
    {[
      { x: 38, y: 108, r: 35, d: 0 },
      { x: 70, y: 96, r: -10, d: 0.3 },
      { x: 100, y: 100, r: 28, d: 0.6 },
      { x: 138, y: 96, r: -8, d: 0.9 },
      { x: 178, y: 90, r: 28, d: 1.2 },
      { x: 220, y: 78, r: -10, d: 1.5 },
      { x: 252, y: 68, r: 25, d: 1.8 },
    ].map((f, i) => (
      <g key={i} transform={`translate(${f.x} ${f.y}) rotate(${f.r})`} className={`tpl-footprint tpl-footprint-${i}`} style={{ animationDelay: `${f.d}s` }}>
        <ellipse cx="0" cy="0" rx="5" ry="9" fill="#AE8145" />
        <circle cx="-1" cy="-12" r="2.4" fill="#AE8145" />
        <circle cx="3" cy="-10" r="1.8" fill="#AE8145" />
        <circle cx="-3.5" cy="-8" r="1.4" fill="#AE8145" />
      </g>
    ))}
    <g transform="translate(244 18)">
      <rect x="0" y="6" width="50" height="62" rx="3" fill="#fff" stroke="#FFC93C" strokeWidth="1.6" />
      <rect x="14" y="0" width="22" height="10" rx="2" fill="#FFC93C" />
      <rect x="6" y="18" width="38" height="2" fill="#AE8145" opacity="0.5" />
      <rect x="6" y="26" width="30" height="2" fill="#AE8145" opacity="0.5" />
      <rect x="6" y="34" width="34" height="2" fill="#AE8145" opacity="0.5" />
      <path d="M8 46 L11 49 L17 43" stroke="#2E7D32" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="22" y="44" width="20" height="2" fill="#AE8145" opacity="0.5" />
    </g>
    <g transform="translate(30 28)" className="tpl-sun" style={{ transformOrigin: '14px 14px' }}>
      <circle cx="14" cy="14" r="8" fill="#FFC93C" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
        <line key={a} x1="14" y1="0" x2="14" y2="3" stroke="#FFC93C" strokeWidth="2" strokeLinecap="round" transform={`rotate(${a} 14 14)`} />
      ))}
    </g>
  </svg>
);

const TplIllusCustom = () => (
  <svg viewBox="0 0 320 140" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="tpl-illus tpl-illus-custom">
    <defs>
      <linearGradient id="tplCustBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EEF0FE" />
        <stop offset="100%" stopColor="#F8F9FF" />
      </linearGradient>
    </defs>
    <rect width="320" height="140" fill="url(#tplCustBg)" />
    <rect x="80" y="30" width="160" height="14" rx="3" fill="#626DF9" />
    <rect x="80" y="52" width="80" height="10" rx="2" fill="#C9CFFC" />
    <rect x="80" y="68" width="160" height="8" rx="2" fill="#E0E4FF" />
    <rect x="80" y="80" width="120" height="8" rx="2" fill="#E0E4FF" />
    <rect x="80" y="92" width="140" height="8" rx="2" fill="#E0E4FF" />
    <g transform="translate(230 36) rotate(35)" className="tpl-pencil">
      <rect x="0" y="0" width="40" height="8" rx="2" fill="#FFC93C" />
      <path d="M40 0 L48 4 L40 8 Z" fill="#1A1A1A" />
      <rect x="0" y="0" width="6" height="8" rx="1" fill="#D32F2F" />
    </g>
    <g className="tpl-sparkle tpl-sparkle-1">
      <path d="M50 50 L52 56 L58 58 L52 60 L50 66 L48 60 L42 58 L48 56 Z" fill="#5C00FF" />
    </g>
    <g className="tpl-sparkle tpl-sparkle-2">
      <path d="M270 100 L271.5 104 L275.5 105.5 L271.5 107 L270 111 L268.5 107 L264.5 105.5 L268.5 104 Z" fill="#FFC93C" />
    </g>
  </svg>
);

// Small category icon (24px default) — used in the filter strip chips.
// Mirrors the demo's CategoryIcon component.
export function CategoryIcon({ kind, size = 22 }) {
  const icons = {
    safety: <path d="M12 2 L19 5 L19 12 Q19 18 12 22 Q5 18 5 12 L5 5 Z M9 12 L11 14 L15 10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    environment: <path d="M12 2 Q6 4 4 10 Q4 18 12 22 Q20 18 20 10 Q18 4 12 2 M12 6 L12 20 M12 9 Q9 10 8 13 M12 13 Q9 14 8 17 M12 9 Q15 10 16 13 M12 13 Q15 14 16 17" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />,
    quality: <path d="M12 2 L15 9 L22 10 L17 15 L18 22 L12 18 L6 22 L7 15 L2 10 L9 9 Z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round" />,
    compliance: (
      <>
        <path d="M14 2 H6 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2-2 V8 z" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <circle cx="12" cy="15" r="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </>
    ),
    walkthrough: (
      <>
        <circle cx="8" cy="5" r="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M10 8 L14 10 L16 16 L13 22 M14 10 L11 14 L8 14 L7 21" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    custom: (
      <>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </>
    ),
    all: (
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[kind] || icons.custom}
    </svg>
  );
}

export default function TemplateIllustration({ kind }) {
  switch (kind) {
    case 'safety': return <TplIllusSafety />;
    case 'environment': return <TplIllusEnvironment />;
    case 'quality': return <TplIllusQuality />;
    case 'compliance': return <TplIllusCompliance />;
    case 'walkthrough': return <TplIllusWalkthrough />;
    default: return <TplIllusCustom />;
  }
}
