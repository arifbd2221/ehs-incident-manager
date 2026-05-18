// Asset type illustrations — animated isometric SVG art per category.
// Maps a free-text asset_type / category name to one of six visual kinds.

const KIND_MAP = [
  ['machine', /(machine|equipment|press|cnc|grinder|lathe|mill|compressor|generator|motor|pump|conveyor)/i],
  ['building', /(building|facility|plant|warehouse|office|lab|hood|room|workshop|garage)/i],
  ['vehicle', /(vehicle|forklift|truck|car|van|trailer|cart|crane|lift)/i],
  ['area', /(area|zone|storage|yard|site|location|bay|aisle)/i],
  ['tool', /(tool|wrench|kit|drill|saw|hammer|gauge|meter|instrument|ppe)/i],
];

export const illustrationKind = (asset) => {
  if (!asset) return 'default';
  const raw = `${asset.asset_type || ''} ${asset.category_name || ''} ${asset.name || ''}`;
  for (const [kind, pattern] of KIND_MAP) {
    if (pattern.test(raw)) return kind;
  }
  return 'default';
};

const IllusMachine = () => (
  <svg viewBox="0 0 320 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="illus illus-machine">
    <defs>
      <linearGradient id="aiMachBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EEF0FE" />
        <stop offset="100%" stopColor="#F8F9FF" />
      </linearGradient>
      <pattern id="aiMachGrid" width="16" height="16" patternUnits="userSpaceOnUse">
        <path d="M16 0H0V16" fill="none" stroke="#D6DAFB" strokeWidth="0.5" />
      </pattern>
    </defs>
    <rect width="320" height="160" fill="url(#aiMachBg)" />
    <rect width="320" height="160" fill="url(#aiMachGrid)" opacity="0.6" />
    <path d="M40 130 L280 130 L260 142 L60 142 Z" fill="#C9CFFC" opacity="0.7" />
    <rect x="92" y="60" width="136" height="70" rx="4" fill="var(--sds-bg-surface)" stroke="#626DF9" strokeWidth="1.5" />
    <rect x="102" y="72" width="48" height="14" rx="2" fill="var(--sds-brand-primary-tint)" />
    <rect x="102" y="92" width="80" height="6" rx="1" fill="var(--sds-brand-primary-tint)" />
    <rect x="102" y="104" width="60" height="6" rx="1" fill="var(--sds-brand-primary-tint)" />
    <circle cx="206" cy="79" r="4" fill="#2E7D32" />
    <circle cx="218" cy="79" r="4" fill="#ED6C02" />
    <g className="gear-lg">
      <circle cx="240" cy="50" r="22" fill="#626DF9" />
      <circle cx="240" cy="50" r="9" fill="var(--sds-bg-surface)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
        <rect key={a} x="237" y="22" width="6" height="9" fill="#626DF9" transform={`rotate(${a} 240 50)`} />
      ))}
    </g>
    <g className="gear-sm">
      <circle cx="82" cy="78" r="14" fill="#5C00FF" />
      <circle cx="82" cy="78" r="5" fill="var(--sds-bg-surface)" />
      {[0, 60, 120, 180, 240, 300].map(a => (
        <rect key={a} x="80" y="60" width="4" height="6" fill="#5C00FF" transform={`rotate(${a} 82 78)`} />
      ))}
    </g>
    <path d="M82 78 Q160 110 240 50" stroke="#52525F" strokeWidth="1" fill="none" strokeDasharray="2 3" opacity="0.5" />
    <circle cx="170" cy="62" r="2" fill="#FFC93C" className="spark s1" />
    <circle cx="180" cy="50" r="1.5" fill="#FFC93C" className="spark s2" />
    <circle cx="160" cy="48" r="1" fill="#FFC93C" className="spark s3" />
  </svg>
);

const IllusBuilding = () => (
  <svg viewBox="0 0 320 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="illus illus-building">
    <defs>
      <linearGradient id="aiBldBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F0EBFF" />
        <stop offset="100%" stopColor="#F8F6FF" />
      </linearGradient>
    </defs>
    <rect width="320" height="160" fill="url(#aiBldBg)" />
    <line x1="0" y1="138" x2="320" y2="138" stroke="#CFC4FA" strokeWidth="0.6" strokeDasharray="3 4" />
    <rect x="40" y="50" width="80" height="88" fill="var(--sds-bg-surface)" stroke="#5C00FF" strokeWidth="1.5" />
    {[58, 72, 86, 100, 114].map(y => (
      <g key={y}>
        <rect x="50" y={y} width="14" height="8" fill="#E8E2FF" />
        <rect x="72" y={y} width="14" height="8" fill="#E8E2FF" />
        <rect x="94" y={y} width="14" height="8" fill="#E8E2FF" />
      </g>
    ))}
    <rect x="130" y="30" width="100" height="108" fill="var(--sds-bg-surface)" stroke="#626DF9" strokeWidth="1.5" />
    <rect x="130" y="30" width="100" height="10" fill="#626DF9" />
    {[48, 64, 80, 96, 112].map(y => (
      <g key={y}>
        <rect x="142" y={y} width="16" height="10" fill="#DDE0FE" />
        <rect x="166" y={y} width="16" height="10" fill="#DDE0FE" />
        <rect x="190" y={y} width="16" height="10" fill="#DDE0FE" />
      </g>
    ))}
    <rect x="170" y="118" width="20" height="20" fill="#626DF9" />
    <circle cx="186" cy="129" r="0.8" fill="#FFC93C" />
    <rect x="238" y="70" width="50" height="68" fill="var(--sds-bg-surface)" stroke="#AE8145" strokeWidth="1.5" />
    <rect x="238" y="70" width="50" height="6" fill="#FFC93C" />
    {[82, 96, 110, 124].map(y => (
      <rect key={y} x="248" y={y} width="30" height="8" fill="#FBE9C2" />
    ))}
    <circle cx="180" cy="22" r="3" fill="#D32F2F" className="beacon" />
    <line x1="180" y1="22" x2="180" y2="30" stroke="#5C00FF" strokeWidth="1" />
  </svg>
);

const IllusVehicle = () => (
  <svg viewBox="0 0 320 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="illus illus-vehicle">
    <defs>
      <linearGradient id="aiVehBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFF6E5" />
        <stop offset="100%" stopColor="#FFFCF4" />
      </linearGradient>
    </defs>
    <rect width="320" height="160" fill="url(#aiVehBg)" />
    {[0, 1, 2, 3, 4].map(i => (
      <line key={i} x1={20 + i * 60} y1="142" x2={50 + i * 60} y2="142" stroke="#E6C97A" strokeWidth="1.5" />
    ))}
    <rect x="40" y="118" width="60" height="6" fill="#AE8145" />
    <rect x="42" y="124" width="6" height="10" fill="#AE8145" />
    <rect x="68" y="124" width="6" height="10" fill="#AE8145" />
    <rect x="92" y="124" width="6" height="10" fill="#AE8145" />
    <rect x="44" y="100" width="52" height="18" fill="var(--sds-bg-surface)" stroke="#AE8145" strokeWidth="1.5" />
    <text x="70" y="113" fontSize="9" fontWeight="700" textAnchor="middle" fill="#AE8145">CARGO</text>
    <g className="forklift">
      <rect x="160" y="86" width="80" height="38" rx="4" fill="#FFC93C" stroke="#AE8145" strokeWidth="1.5" />
      <rect x="170" y="92" width="32" height="22" rx="2" fill="var(--sds-bg-surface)" stroke="#AE8145" strokeWidth="1" />
      <rect x="172" y="94" width="28" height="14" fill="#E5F6FD" />
      <line x1="158" y1="60" x2="158" y2="124" stroke="#52525F" strokeWidth="3" />
      <line x1="152" y1="60" x2="152" y2="124" stroke="#52525F" strokeWidth="3" />
      <line x1="152" y1="60" x2="158" y2="60" stroke="#52525F" strokeWidth="2" />
      <path d="M152 110 L130 110 L130 116 L152 116 Z" fill="#52525F" />
      <path d="M152 122 L130 122 L130 128 L152 128 Z" fill="#52525F" />
      <circle cx="178" cy="128" r="10" fill="#1A1A1A" />
      <circle cx="178" cy="128" r="4" fill="#7E7E8C" />
      <circle cx="222" cy="128" r="10" fill="#1A1A1A" />
      <circle cx="222" cy="128" r="4" fill="#7E7E8C" />
    </g>
    <line x1="252" y1="100" x2="270" y2="100" stroke="#AE8145" strokeWidth="1.5" opacity="0.5" className="motion m1" />
    <line x1="258" y1="110" x2="276" y2="110" stroke="#AE8145" strokeWidth="1.5" opacity="0.5" className="motion m2" />
    <line x1="252" y1="120" x2="270" y2="120" stroke="#AE8145" strokeWidth="1.5" opacity="0.5" className="motion m3" />
  </svg>
);

const IllusArea = () => (
  <svg viewBox="0 0 320 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="illus illus-area">
    <defs>
      <linearGradient id="aiAreaBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#E5F6E8" />
        <stop offset="100%" stopColor="#F4FAF5" />
      </linearGradient>
    </defs>
    <rect width="320" height="160" fill="url(#aiAreaBg)" />
    <path d="M60 50 L240 40 L260 100 L210 130 L80 125 L50 90 Z"
      fill="var(--sds-bg-surface)" stroke="#2E7D32" strokeWidth="1.5" strokeDasharray="4 3" />
    <rect x="130" y="78" width="60" height="22" rx="3" fill="#2E7D32" />
    <text x="160" y="93" fontSize="10" fontWeight="700" textAnchor="middle" fill="var(--sds-bg-surface)">ZONE</text>
    <circle cx="100" cy="80" r="6" fill="#D32F2F" />
    <circle cx="100" cy="80" r="2" fill="var(--sds-bg-surface)" />
    <circle cx="220" cy="100" r="6" fill="#0DB4F0" />
    <circle cx="220" cy="100" r="2" fill="var(--sds-bg-surface)" />
  </svg>
);

const IllusTool = () => (
  <svg viewBox="0 0 320 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="illus illus-tool">
    <defs>
      <linearGradient id="aiToolBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFE5E5" />
        <stop offset="100%" stopColor="#FFF4F4" />
      </linearGradient>
    </defs>
    <rect width="320" height="160" fill="url(#aiToolBg)" />
    <g transform="translate(80 80) rotate(-30)">
      <path d="M0 0 L60 0 L70 -10 L70 10 L60 0 M-10 -10 A14 14 0 1 0 -10 10 L10 10 L10 -10 Z" fill="#D32F2F" />
      <circle cx="-2" cy="0" r="6" fill="#FFF4F4" />
    </g>
    <g transform="translate(220 100) rotate(40)">
      <rect x="0" y="-6" width="36" height="12" rx="2" fill="#5C00FF" />
      <rect x="36" y="-3" width="40" height="6" fill="#C9CFFC" />
      <path d="M76 -3 L86 0 L76 3 Z" fill="#7E7E8C" />
    </g>
  </svg>
);

const IllusDefault = ({ tint = '#626DF9' }) => (
  <svg viewBox="0 0 320 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" className="illus illus-default">
    <defs>
      <linearGradient id="aiDefBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F2F4FB" />
        <stop offset="100%" stopColor="#F8F9FB" />
      </linearGradient>
    </defs>
    <rect width="320" height="160" fill="url(#aiDefBg)" />
    <rect x="110" y="50" width="100" height="70" rx="6" fill="var(--sds-bg-surface)" stroke={tint} strokeWidth="1.5" />
    <rect x="122" y="62" width="40" height="8" rx="2" fill="var(--sds-brand-primary-tint)" />
    <rect x="122" y="76" width="76" height="6" rx="1" fill="var(--sds-brand-primary-tint)" />
    <rect x="122" y="88" width="56" height="6" rx="1" fill="var(--sds-brand-primary-tint)" />
    <circle cx="200" cy="68" r="4" fill={tint} opacity="0.7" />
  </svg>
);

export default function AssetIllustration({ kind, tint }) {
  switch (kind) {
    case 'machine': return <IllusMachine />;
    case 'building': return <IllusBuilding />;
    case 'vehicle': return <IllusVehicle />;
    case 'area': return <IllusArea />;
    case 'tool': return <IllusTool />;
    default: return <IllusDefault tint={tint} />;
  }
}

export const IllusEmpty = () => (
  <svg viewBox="0 0 220 160" width="220" height="160" className="illus-empty">
    <defs>
      <linearGradient id="aiEmptyBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#EEF0FE" />
        <stop offset="100%" stopColor="#fff" />
      </linearGradient>
    </defs>
    <ellipse cx="110" cy="140" rx="80" ry="8" fill="#E0E0E0" opacity="0.6" />
    <circle cx="100" cy="78" r="40" fill="url(#aiEmptyBg)" stroke="#626DF9" strokeWidth="2.5" />
    <line x1="130" y1="108" x2="160" y2="138" stroke="#626DF9" strokeWidth="6" strokeLinecap="round" />
    <line x1="130" y1="108" x2="160" y2="138" stroke="#5C00FF" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
    {[[88, 68], [112, 68], [88, 88], [112, 88], [100, 78]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="3" fill="#626DF9" opacity={0.3 + i * 0.1} />
    ))}
    <circle cx="160" cy="40" r="3" fill="#FFC93C" />
    <circle cx="40" cy="50" r="2" fill="#5C00FF" opacity="0.6" />
    <circle cx="50" cy="120" r="2.5" fill="#626DF9" opacity="0.5" />
  </svg>
);
