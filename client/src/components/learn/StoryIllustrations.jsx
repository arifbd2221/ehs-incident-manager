/* ------------------------------------------------------------------ */
/*  Scene & system illustrations for the Learn story system            */
/*  Pattern: OnboardingIllustrations.jsx (viewBox, embedded CSS anims) */
/* ------------------------------------------------------------------ */

/* ── Scene: Chemical Lab ── */
export function ChemLabScene({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes clBubble{0%,100%{transform:translateY(0);opacity:.6}50%{transform:translateY(-6px);opacity:1}}
        @keyframes clVent{0%,100%{opacity:.15}50%{opacity:.35}}
        @keyframes clDrip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(10px);opacity:0}}
        .cl-b1{animation:clBubble 2.4s ease-in-out infinite}.cl-b2{animation:clBubble 2.4s ease-in-out .6s infinite}
        .cl-b3{animation:clBubble 2.4s ease-in-out 1.2s infinite}.cl-vent{animation:clVent 3s ease-in-out infinite}
        .cl-drip{animation:clDrip 2s ease-in 1s infinite;transform-origin:center}
        @media(prefers-reduced-motion:reduce){.cl-b1,.cl-b2,.cl-b3,.cl-vent,.cl-drip{animation:none;opacity:.5}}
      `}</style>
      <rect x="0" y="100" width="320" height="30" rx="0" fill="#e8edf2" />
      {/* Bench */}
      <rect x="20" y="68" width="280" height="8" rx="2" fill="#94a3b8" />
      <rect x="30" y="76" width="8" height="24" rx="2" fill="#94a3b8" />
      <rect x="282" y="76" width="8" height="24" rx="2" fill="#94a3b8" />
      {/* Fume hood */}
      <rect x="24" y="12" width="90" height="56" rx="4" fill="#cbd5e1" />
      <rect x="28" y="16" width="82" height="44" rx="3" fill="#e2e8f0" />
      <rect className="cl-vent" x="32" y="20" width="74" height="4" rx="1" fill="#626DF9" opacity=".15" />
      <rect className="cl-vent" x="32" y="28" width="74" height="4" rx="1" fill="#626DF9" opacity=".1" />
      {/* Beaker inside hood */}
      <path d="M55 42 L55 58 Q55 62 59 62 L71 62 Q75 62 75 58 L75 42Z" fill="#bfdbfe" opacity=".7" />
      <rect x="53" y="40" width="24" height="4" rx="1" fill="#94a3b8" />
      <circle className="cl-b1" cx="62" cy="52" r="2" fill="#3b82f6" opacity=".6" />
      <circle className="cl-b2" cx="68" cy="48" r="1.5" fill="#3b82f6" opacity=".6" />
      {/* IBC container */}
      <rect x="140" y="28" width="50" height="40" rx="3" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" />
      <rect x="144" y="32" width="42" height="10" rx="2" fill="#fef3c7" />
      <text x="165" y="40" textAnchor="middle" fontSize="7" fontWeight="700" fill="#92400e">H</text>
      <rect x="155" y="24" width="20" height="6" rx="2" fill="#94a3b8" />
      <circle className="cl-drip" cx="165" cy="68" r="2" fill="#fbbf24" opacity=".8" />
      {/* Test tube rack */}
      <rect x="220" y="46" width="60" height="4" rx="1" fill="#64748b" />
      <rect x="220" y="50" width="4" height="18" rx="1" fill="#64748b" />
      <rect x="276" y="50" width="4" height="18" rx="1" fill="#64748b" />
      {/* Tubes */}
      <rect x="230" y="30" width="8" height="20" rx="4" fill="#bbf7d0" />
      <circle className="cl-b3" cx="234" cy="36" r="1.5" fill="#22c55e" />
      <rect x="244" y="34" width="8" height="16" rx="4" fill="#fecaca" />
      <rect x="258" y="28" width="8" height="22" rx="4" fill="#c7d2fe" />
      <circle className="cl-b1" cx="262" cy="34" r="1.5" fill="#626DF9" />
      {/* Person silhouette in PPE */}
      <circle cx="120" cy="22" r="10" fill="#626DF9" opacity=".7" />
      <rect x="112" y="32" width="16" height="28" rx="5" fill="#626DF9" opacity=".6" />
      <rect x="108" y="32" width="24" height="4" rx="2" fill="#818cf8" opacity=".5" />
    </svg>
  );
}

/* ── Scene: Construction Site ── */
export function ConstructionScene({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes csFlag{0%,100%{transform:rotate(0deg)}50%{transform:rotate(5deg)}}
        @keyframes csBlink{0%,100%{opacity:.3}50%{opacity:1}}
        .cs-flag{animation:csFlag 2s ease-in-out infinite;transform-origin:250px 12px}
        .cs-blink{animation:csBlink 1.5s ease-in-out infinite}
        @media(prefers-reduced-motion:reduce){.cs-flag,.cs-blink{animation:none;opacity:.6}}
      `}</style>
      <rect x="0" y="105" width="320" height="25" rx="0" fill="#d4a574" />
      <rect x="0" y="100" width="320" height="8" rx="0" fill="#b8956a" />
      {/* Building structure */}
      <rect x="180" y="40" width="80" height="60" rx="2" fill="#94a3b8" />
      <rect x="188" y="48" width="16" height="14" rx="2" fill="#cbd5e1" />
      <rect x="210" y="48" width="16" height="14" rx="2" fill="#cbd5e1" />
      <rect x="236" y="48" width="16" height="14" rx="2" fill="#cbd5e1" />
      <rect x="188" y="70" width="16" height="14" rx="2" fill="#cbd5e1" />
      <rect x="210" y="70" width="16" height="14" rx="2" fill="#cbd5e1" />
      {/* Scaffolding */}
      <rect x="30" y="20" width="4" height="80" rx="1" fill="#f59e0b" />
      <rect x="80" y="20" width="4" height="80" rx="1" fill="#f59e0b" />
      <rect x="30" y="20" width="54" height="3" rx="1" fill="#f59e0b" />
      <rect x="30" y="50" width="54" height="3" rx="1" fill="#f59e0b" />
      <rect x="30" y="76" width="54" height="3" rx="1" fill="#f59e0b" />
      {/* Cross braces */}
      <line x1="34" y1="23" x2="80" y2="50" stroke="#f59e0b" strokeWidth="1.5" opacity=".5" />
      <line x1="80" y1="23" x2="34" y2="50" stroke="#f59e0b" strokeWidth="1.5" opacity=".5" />
      <line x1="34" y1="53" x2="80" y2="76" stroke="#f59e0b" strokeWidth="1.5" opacity=".5" />
      {/* Planks */}
      <rect x="28" y="47" width="58" height="4" rx="1" fill="#d97706" opacity=".6" />
      <rect x="28" y="73" width="58" height="4" rx="1" fill="#d97706" opacity=".6" />
      {/* Crane */}
      <rect x="248" y="8" width="4" height="92" rx="1" fill="#64748b" />
      <rect x="220" y="8" width="60" height="4" rx="1" fill="#64748b" />
      <line x1="250" y1="12" x2="224" y2="40" stroke="#94a3b8" strokeWidth="1" />
      <line x1="250" y1="12" x2="276" y2="40" stroke="#94a3b8" strokeWidth="1" />
      {/* Safety cones */}
      <polygon points="120,100 126,100 123,86" fill="#f97316" />
      <rect x="117" y="100" width="12" height="3" rx="1" fill="#ea580c" />
      <polygon points="140,100 146,100 143,88" fill="#f97316" />
      <rect x="137" y="100" width="12" height="3" rx="1" fill="#ea580c" />
      {/* Hard hat */}
      <path d="M156 94 Q160 84 164 94" fill="#fbbf24" />
      <rect x="153" y="94" width="14" height="3" rx="1" fill="#d97706" />
      {/* Warning flag */}
      <line x1="250" y1="8" x2="250" y2="2" stroke="#64748b" strokeWidth="1.5" />
      <g className="cs-flag"><polygon points="250,2 264,6 250,10" fill="#ef4444" /></g>
      {/* Blinking light on crane */}
      <circle className="cs-blink" cx="222" cy="8" r="3" fill="#ef4444" />
    </svg>
  );
}

/* ── Scene: Warehouse ── */
export function WarehouseScene({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes whBeep{0%,100%{opacity:.2}50%{opacity:1}}
        @keyframes whForklift{0%,100%{transform:translateX(0)}50%{transform:translateX(6px)}}
        .wh-beep{animation:whBeep 1.2s ease-in-out infinite}
        .wh-fork{animation:whForklift 4s ease-in-out infinite}
        @media(prefers-reduced-motion:reduce){.wh-beep,.wh-fork{animation:none;opacity:.7}}
      `}</style>
      <rect x="0" y="106" width="320" height="24" rx="0" fill="#e2e8f0" />
      {/* Racking — left section */}
      <rect x="20" y="14" width="6" height="92" rx="1" fill="#64748b" />
      <rect x="100" y="14" width="6" height="92" rx="1" fill="#64748b" />
      <rect x="20" y="14" width="86" height="4" rx="1" fill="#475569" />
      <rect x="20" y="44" width="86" height="4" rx="1" fill="#475569" />
      <rect x="20" y="74" width="86" height="4" rx="1" fill="#475569" />
      {/* Pallets on rack */}
      <rect x="30" y="18" width="30" height="22" rx="2" fill="#fed7aa" />
      <rect x="66" y="20" width="28" height="20" rx="2" fill="#fecaca" />
      <rect x="30" y="48" width="26" height="22" rx="2" fill="#bbf7d0" />
      <rect x="62" y="50" width="32" height="20" rx="2" fill="#e0e7ff" />
      <rect x="32" y="78" width="34" height="20" rx="2" fill="#fef3c7" />
      {/* Racking — right section */}
      <rect x="200" y="14" width="6" height="92" rx="1" fill="#64748b" />
      <rect x="280" y="14" width="6" height="92" rx="1" fill="#64748b" />
      <rect x="200" y="14" width="86" height="4" rx="1" fill="#475569" />
      <rect x="200" y="44" width="86" height="4" rx="1" fill="#475569" />
      <rect x="200" y="74" width="86" height="4" rx="1" fill="#475569" />
      <rect x="210" y="18" width="28" height="22" rx="2" fill="#c7d2fe" />
      <rect x="244" y="20" width="30" height="20" rx="2" fill="#fde68a" />
      <rect x="212" y="50" width="32" height="20" rx="2" fill="#fbcfe8" />
      <rect x="250" y="48" width="26" height="22" rx="2" fill="#d9f99d" />
      {/* Forklift */}
      <g className="wh-fork">
        <rect x="130" y="78" width="40" height="24" rx="4" fill="#f59e0b" />
        <rect x="124" y="88" width="10" height="14" rx="1" fill="#92400e" />
        <rect x="124" y="82" width="4" height="8" rx="1" fill="#64748b" />
        <circle cx="140" cy="106" r="6" fill="#334155" />
        <circle cx="140" cy="106" r="3" fill="#64748b" />
        <circle cx="162" cy="106" r="6" fill="#334155" />
        <circle cx="162" cy="106" r="3" fill="#64748b" />
        <rect x="148" y="80" width="12" height="4" rx="1" fill="#d97706" />
        <circle className="wh-beep" cx="170" cy="80" r="3" fill="#f59e0b" />
      </g>
      {/* Loading dock door */}
      <rect x="136" y="14" width="48" height="56" rx="3" fill="#94a3b8" />
      <rect x="140" y="18" width="40" height="48" rx="2" fill="#64748b" />
      <rect x="140" y="18" width="40" height="4" rx="0" fill="#475569" />
    </svg>
  );
}

/* ── Scene: Office / Server Room ── */
export function OfficeScene({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes ofLed{0%,100%{opacity:.2}50%{opacity:1}}
        .of-led1{animation:ofLed 1.5s ease-in-out infinite}.of-led2{animation:ofLed 1.5s ease-in-out .5s infinite}
        .of-led3{animation:ofLed 1.5s ease-in-out 1s infinite}
        @media(prefers-reduced-motion:reduce){.of-led1,.of-led2,.of-led3{animation:none;opacity:.5}}
      `}</style>
      <rect x="0" y="106" width="320" height="24" rx="0" fill="#e2e8f0" />
      {/* Server rack */}
      <rect x="30" y="16" width="60" height="90" rx="4" fill="#334155" />
      <rect x="36" y="22" width="48" height="14" rx="2" fill="#1e293b" />
      <rect x="36" y="40" width="48" height="14" rx="2" fill="#1e293b" />
      <rect x="36" y="58" width="48" height="14" rx="2" fill="#1e293b" />
      <rect x="36" y="76" width="48" height="14" rx="2" fill="#1e293b" />
      <circle className="of-led1" cx="42" cy="29" r="2" fill="#22c55e" />
      <circle className="of-led2" cx="42" cy="47" r="2" fill="#22c55e" />
      <circle className="of-led3" cx="42" cy="65" r="2" fill="#3b82f6" />
      <circle className="of-led1" cx="42" cy="83" r="2" fill="#22c55e" />
      <rect x="50" y="26" width="28" height="4" rx="1" fill="#475569" />
      <rect x="50" y="44" width="28" height="4" rx="1" fill="#475569" />
      <rect x="50" y="62" width="28" height="4" rx="1" fill="#475569" />
      <rect x="50" y="80" width="28" height="4" rx="1" fill="#475569" />
      {/* Desk + monitor */}
      <rect x="120" y="70" width="100" height="6" rx="2" fill="#94a3b8" />
      <rect x="130" y="76" width="6" height="24" rx="2" fill="#94a3b8" />
      <rect x="204" y="76" width="6" height="24" rx="2" fill="#94a3b8" />
      <rect x="132" y="30" width="76" height="40" rx="4" fill="#1e293b" />
      <rect x="136" y="34" width="68" height="32" rx="2" fill="#334155" />
      <rect x="165" y="70" width="10" height="4" rx="1" fill="#64748b" />
      {/* Screen content hint */}
      <rect x="142" y="40" width="30" height="3" rx="1" fill="#626DF9" opacity=".4" />
      <rect x="142" y="47" width="56" height="2" rx="1" fill="#475569" opacity=".6" />
      <rect x="142" y="53" width="44" height="2" rx="1" fill="#475569" opacity=".4" />
      <rect x="142" y="59" width="50" height="2" rx="1" fill="#475569" opacity=".3" />
      {/* Fire extinguisher */}
      <rect x="260" y="40" width="16" height="50" rx="6" fill="#ef4444" />
      <rect x="264" y="34" width="8" height="8" rx="2" fill="#b91c1c" />
      <rect x="270" y="36" width="12" height="3" rx="1" fill="#64748b" />
      <text x="268" y="68" textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--sds-bg-surface)">FE</text>
      <rect x="262" y="90" width="12" height="4" rx="1" fill="#94a3b8" />
    </svg>
  );
}

/* ── Scene: Australian Manufacturing (scaffold + welding bay) ── */
export function AuManufacturingScene({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes amWeld{0%,100%{opacity:.2;r:2}50%{opacity:1;r:3.5}}
        @keyframes amFlag{0%,100%{transform:rotate(0deg)}50%{transform:rotate(4deg)}}
        .am-w1{animation:amWeld 1s ease-in-out infinite}.am-w2{animation:amWeld 1s ease-in-out .3s infinite}
        .am-flag{animation:amFlag 2.5s ease-in-out infinite;transform-origin:295px 10px}
        @media(prefers-reduced-motion:reduce){.am-w1,.am-w2,.am-flag{animation:none;opacity:.5}}
      `}</style>
      <rect x="0" y="105" width="320" height="25" rx="0" fill="#e2e8f0" />
      {/* Building shell */}
      <rect x="0" y="30" width="320" height="75" rx="0" fill="#f1f5f9" />
      <rect x="0" y="26" width="320" height="8" rx="0" fill="#94a3b8" />
      {/* Roof truss lines */}
      <line x1="0" y1="26" x2="160" y2="8" stroke="#94a3b8" strokeWidth="2" />
      <line x1="320" y1="26" x2="160" y2="8" stroke="#94a3b8" strokeWidth="2" />
      <line x1="80" y1="18" x2="80" y2="26" stroke="#94a3b8" strokeWidth="1.5" />
      <line x1="240" y1="18" x2="240" y2="26" stroke="#94a3b8" strokeWidth="1.5" />
      {/* Scaffolding — left */}
      <rect x="20" y="34" width="4" height="71" rx="1" fill="#f59e0b" />
      <rect x="80" y="34" width="4" height="71" rx="1" fill="#f59e0b" />
      <rect x="20" y="34" width="64" height="3" rx="1" fill="#f59e0b" />
      <rect x="20" y="56" width="64" height="3" rx="1" fill="#f59e0b" />
      <rect x="20" y="78" width="64" height="3" rx="1" fill="#f59e0b" />
      {/* Cross braces */}
      <line x1="24" y1="37" x2="80" y2="56" stroke="#f59e0b" strokeWidth="1" opacity=".5" />
      <line x1="80" y1="37" x2="24" y2="56" stroke="#f59e0b" strokeWidth="1" opacity=".5" />
      {/* Planks on scaffold */}
      <rect x="18" y="53" width="68" height="4" rx="1" fill="#d97706" opacity=".6" />
      <rect x="18" y="75" width="68" height="4" rx="1" fill="#d97706" opacity=".6" />
      {/* Guardrail (one side missing — story point) */}
      <rect x="20" y="48" width="4" height="8" rx="1" fill="#f59e0b" />
      {/* No rail on right side — gap shown */}
      <line x1="80" y1="49" x2="86" y2="52" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 2" opacity=".5" />
      {/* Worker on scaffold */}
      <circle cx="52" cy="42" r="6" fill="#E91E63" opacity=".7" />
      <rect x="47" y="48" width="10" height="8" rx="3" fill="#E91E63" opacity=".6" />
      {/* Hard hat */}
      <path d="M46 42 Q52 36 58 42" fill="#fbbf24" />
      {/* Welding bay — right */}
      <rect x="180" y="50" width="80" height="55" rx="3" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
      <text x="220" y="64" textAnchor="middle" fontSize="7" fontWeight="600" fill="#64748b">WELDING BAY 1</text>
      {/* Gas cylinders */}
      <rect x="192" y="72" width="10" height="28" rx="5" fill="#00897B" />
      <rect x="194" y="68" width="6" height="6" rx="2" fill="#00695c" />
      <rect x="208" y="74" width="10" height="26" rx="5" fill="#546E7A" />
      <rect x="210" y="70" width="6" height="6" rx="2" fill="#37474f" />
      {/* Welding sparks */}
      <circle className="am-w1" cx="240" cy="86" r="2" fill="#fbbf24" />
      <circle className="am-w2" cx="246" cy="82" r="2" fill="#f59e0b" />
      <circle className="am-w1" cx="236" cy="90" r="1.5" fill="#fbbf24" opacity=".7" />
      {/* Safety sign */}
      <rect x="140" y="38" width="24" height="24" rx="2" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
      <text x="152" y="55" textAnchor="middle" fontSize="14" fontWeight="800" fill="#92400e">!</text>
      {/* Australian flag hint */}
      <line x1="295" y1="10" x2="295" y2="30" stroke="#64748b" strokeWidth="1.5" />
      <g className="am-flag"><rect x="295" y="10" width="16" height="10" rx="1" fill="#00008B" /><rect x="295" y="10" width="8" height="5" rx="0" fill="var(--sds-bg-surface)" opacity=".3" /></g>
    </svg>
  );
}

/* ── Moment: Scaffold Fall ── */
export function ScaffoldFallMoment({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes sfFall{0%{transform:translateY(-24px);opacity:0}50%{opacity:1}100%{transform:translateY(0);opacity:1}}
        @keyframes sfRail{0%{transform:rotate(0deg)}100%{transform:rotate(25deg)}}
        @keyframes sfAlert{0%,100%{opacity:.4;transform:scale(.95)}50%{opacity:1;transform:scale(1.05)}}
        .sf-person{animation:sfFall 1.8s ease-in both}
        .sf-rail{animation:sfRail 1s ease-out both;transform-origin:80px 40px}
        .sf-alert{animation:sfAlert 1.5s ease-in-out infinite;transform-origin:center}
        @media(prefers-reduced-motion:reduce){.sf-person,.sf-rail,.sf-alert{animation:none;opacity:.7}}
      `}</style>
      {/* Scaffold structure */}
      <rect x="40" y="10" width="4" height="96" rx="1" fill="#f59e0b" />
      <rect x="120" y="10" width="4" height="96" rx="1" fill="#f59e0b" />
      <rect x="40" y="10" width="84" height="3" rx="1" fill="#f59e0b" />
      <rect x="40" y="40" width="84" height="3" rx="1" fill="#f59e0b" />
      <rect x="40" y="70" width="84" height="3" rx="1" fill="#f59e0b" />
      {/* Plank */}
      <rect x="38" y="37" width="88" height="4" rx="1" fill="#d97706" opacity=".7" />
      {/* Detaching guardrail */}
      <g className="sf-rail">
        <rect x="80" y="28" width="44" height="3" rx="1" fill="#f59e0b" opacity=".6" />
        <circle cx="84" cy="29" r="3" fill="#dc2626" opacity=".6" />
        <text x="84" y="31" textAnchor="middle" fontSize="5" fontWeight="700" fill="var(--sds-bg-surface)">X</text>
      </g>
      {/* Guardrail intact — left side */}
      <rect x="40" y="28" width="44" height="3" rx="1" fill="#f59e0b" />
      {/* Falling person */}
      <g className="sf-person">
        <circle cx="100" cy="58" r="8" fill="#E91E63" opacity=".7" />
        <rect x="94" y="66" width="12" height="16" rx="4" fill="#E91E63" opacity=".6" />
        {/* Hard hat flying off */}
        <path d="M92 54 Q88 48 84 52" fill="#fbbf24" opacity=".8" />
      </g>
      {/* Fall trajectory */}
      <line x1="100" y1="40" x2="100" y2="56" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="4 3" opacity=".4" />
      {/* Height indicator */}
      <line x1="30" y1="40" x2="30" y2="96" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" opacity=".4" />
      <text x="28" y="70" textAnchor="end" fontSize="7" fontWeight="600" fill="#dc2626" opacity=".7">3.2m</text>
      {/* Ground / concrete */}
      <rect x="0" y="96" width="320" height="14" rx="0" fill="#cbd5e1" />
      {/* Impact star */}
      <polygon points="100,96 104,92 108,96 104,100" fill="#dc2626" opacity=".3" />
      {/* SafeWork NSW alert badge */}
      <g className="sf-alert">
        <rect x="170" y="20" width="120" height="40" rx="8" fill="var(--sds-bg-surface)" stroke="#E91E63" strokeWidth="2" />
        <text x="230" y="36" textAnchor="middle" fontSize="7" fontWeight="700" fill="#E91E63">NOTIFIABLE INCIDENT</text>
        <text x="230" y="48" textAnchor="middle" fontSize="6" fill="#64748b">WHS Act 2011 s.35(b)</text>
      </g>
      {/* Phone icon — notify immediately */}
      <g transform="translate(180,68)">
        <rect x="0" y="0" width="24" height="24" rx="6" fill="#00897B" opacity=".15" />
        <path d="M6 8 Q6 6 8 6 L10 6 Q12 6 12 8 L12 18 Q12 20 10 20 L8 20 Q6 20 6 18Z" fill="#00897B" opacity=".7" />
        <text x="28" y="16" fontSize="6" fontWeight="600" fill="#00897B">Call 13 10 50</text>
      </g>
    </svg>
  );
}

/* ── System: WHS / SafeWork NSW Form ── */
export function WhsFormVisual({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes whsBadge{0%{transform:scale(0) rotate(-15deg);opacity:0}60%{transform:scale(1.1) rotate(2deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
        .whs-badge{animation:whsBadge .8s cubic-bezier(.34,1.56,.64,1) .5s both;transform-origin:center}
        @media(prefers-reduced-motion:reduce){.whs-badge{animation:none;opacity:1;transform:none}}
      `}</style>
      {/* Form background */}
      <rect x="60" y="6" width="200" height="98" rx="8" fill="var(--sds-bg-surface)" stroke="#E91E63" strokeWidth="1.5" />
      {/* Header bar */}
      <rect x="60" y="6" width="200" height="24" rx="8" fill="#fce4ec" />
      <rect x="60" y="22" width="200" height="8" fill="#fce4ec" />
      <text x="160" y="22" textAnchor="middle" fontSize="8" fontWeight="700" fill="#E91E63">SafeWork NSW Notification</text>
      {/* s.35 category checkboxes */}
      <rect x="78" y="38" width="10" height="10" rx="2" fill="var(--sds-bg-surface)" stroke="#E91E63" strokeWidth="1" />
      <text x="94" y="47" fontSize="7" fill="#64748b">s.35(a) Death</text>
      <rect x="78" y="54" width="10" height="10" rx="2" fill="#E91E63" />
      <path d="M80 59 L82 61 L86 56" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <text x="94" y="63" fontSize="7" fontWeight="600" fill="#333">s.35(b) Serious injury</text>
      <rect x="78" y="70" width="10" height="10" rx="2" fill="var(--sds-bg-surface)" stroke="#E91E63" strokeWidth="1" />
      <text x="94" y="79" fontSize="7" fill="#64748b">s.35(c) Dangerous incident</text>
      {/* PCBU section */}
      <rect x="170" y="38" width="76" height="34" rx="4" fill="#f8f9fb" stroke="#e0e0e0" strokeWidth="1" />
      <text x="208" y="50" textAnchor="middle" fontSize="6" fontWeight="600" fill="#64748b">PCBU Details</text>
      <rect x="176" y="54" width="40" height="3" rx="1" fill="#E91E63" opacity=".15" />
      <rect x="176" y="60" width="60" height="3" rx="1" fill="#E91E63" opacity=".1" />
      <rect x="176" y="66" width="34" height="3" rx="1" fill="#E91E63" opacity=".1" />
      {/* Notifiable badge */}
      <g className="whs-badge">
        <rect x="110" y="82" width="100" height="18" rx="4" fill="none" stroke="#E91E63" strokeWidth="2" transform="rotate(-3 160 91)" />
        <text x="160" y="95" textAnchor="middle" fontSize="8" fontWeight="800" fill="#E91E63" transform="rotate(-3 160 95)">NOTIFIABLE</text>
      </g>
    </svg>
  );
}

/* ── System: Wizard Type Picker ── */
export function WizardMockup({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes wmPick{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        .wm-sel{animation:wmPick 2s ease-in-out infinite;transform-origin:center}
        @media(prefers-reduced-motion:reduce){.wm-sel{animation:none}}
      `}</style>
      {/* Window chrome */}
      <rect x="20" y="8" width="280" height="114" rx="10" fill="var(--sds-bg-surface)" stroke="#e2e8f0" strokeWidth="1.5" />
      <rect x="20" y="8" width="280" height="22" rx="10" fill="#f8fafc" />
      <rect x="20" y="20" width="280" height="10" fill="#f8fafc" />
      <circle cx="36" cy="19" r="4" fill="#fca5a5" />
      <circle cx="50" cy="19" r="4" fill="#fde68a" />
      <circle cx="64" cy="19" r="4" fill="#bbf7d0" />
      <text x="160" y="22" textAnchor="middle" fontSize="7" fontWeight="600" fill="#94a3b8">Report Wizard</text>
      {/* Type cards grid 4x2 */}
      {/* Row 1 */}
      <rect x="34" y="38" width="56" height="34" rx="6" fill="var(--sds-bg-surface)" stroke="#e2e8f0" strokeWidth="1" />
      <circle cx="62" cy="48" r="6" fill="#fecaca" /><text x="62" y="62" textAnchor="middle" fontSize="6" fill="#64748b">Injury</text>
      <rect x="98" y="38" width="56" height="34" rx="6" fill="var(--sds-bg-surface)" stroke="#e2e8f0" strokeWidth="1" />
      <circle cx="126" cy="48" r="6" fill="#e9d5ff" /><text x="126" y="62" textAnchor="middle" fontSize="6" fill="#64748b">Illness</text>
      {/* Selected card */}
      <g className="wm-sel">
        <rect x="162" y="38" width="56" height="34" rx="6" fill="#f5f3ff" stroke="#626DF9" strokeWidth="2" />
        <circle cx="190" cy="48" r="6" fill="#c7d2fe" /><text x="190" y="62" textAnchor="middle" fontSize="6" fontWeight="700" fill="#626DF9">Near Miss</text>
        <circle cx="210" cy="42" r="6" fill="#626DF9" /><path d="M207 42 L209 44 L213 40" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </g>
      <rect x="226" y="38" width="56" height="34" rx="6" fill="var(--sds-bg-surface)" stroke="#e2e8f0" strokeWidth="1" />
      <circle cx="254" cy="48" r="6" fill="#d1d5db" /><text x="254" y="62" textAnchor="middle" fontSize="6" fill="#64748b">Property</text>
      {/* Row 2 */}
      <rect x="34" y="80" width="56" height="34" rx="6" fill="var(--sds-bg-surface)" stroke="#e2e8f0" strokeWidth="1" />
      <circle cx="62" cy="90" r="6" fill="#bbf7d0" /><text x="62" y="104" textAnchor="middle" fontSize="6" fill="#64748b">Environ.</text>
      <rect x="98" y="80" width="56" height="34" rx="6" fill="var(--sds-bg-surface)" stroke="#e2e8f0" strokeWidth="1" />
      <circle cx="126" cy="90" r="6" fill="#bfdbfe" /><text x="126" y="104" textAnchor="middle" fontSize="6" fill="#64748b">Unsafe</text>
      <rect x="162" y="80" width="56" height="34" rx="6" fill="var(--sds-bg-surface)" stroke="#e2e8f0" strokeWidth="1" />
      <circle cx="190" cy="90" r="6" fill="#99f6e4" /><text x="190" y="104" textAnchor="middle" fontSize="6" fill="#64748b">Observ.</text>
      <rect x="226" y="80" width="56" height="34" rx="6" fill="var(--sds-bg-surface)" stroke="#e2e8f0" strokeWidth="1" />
      <circle cx="254" cy="90" r="6" fill="#fecaca" /><text x="254" y="104" textAnchor="middle" fontSize="6" fill="#64748b">Dangerous</text>
    </svg>
  );
}

/* ── System: Risk Matrix Diagram ── */
export function RiskMatrixVisual({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes rmPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.85;transform:scale(1.08)}}
        .rm-pulse{animation:rmPulse 2s ease-in-out infinite;transform-origin:center}
        @media(prefers-reduced-motion:reduce){.rm-pulse{animation:none}}
      `}</style>
      {/* Y axis label */}
      <text x="30" y="68" textAnchor="middle" fontSize="7" fontWeight="600" fill="#64748b" transform="rotate(-90 30 68)">LIKELIHOOD</text>
      {/* X axis label */}
      <text x="180" y="126" textAnchor="middle" fontSize="7" fontWeight="600" fill="#64748b">CONSEQUENCE</text>
      {/* Row labels */}
      <text x="58" y="38" textAnchor="end" fontSize="6" fill="#94a3b8">Almost C.</text>
      <text x="58" y="58" textAnchor="end" fontSize="6" fill="#94a3b8">Likely</text>
      <text x="58" y="78" textAnchor="end" fontSize="6" fill="#94a3b8">Possible</text>
      <text x="58" y="98" textAnchor="end" fontSize="6" fill="#94a3b8">Unlikely</text>
      {/* Col labels */}
      <text x="88" y="112" textAnchor="middle" fontSize="6" fill="#94a3b8">Minor</text>
      <text x="138" y="112" textAnchor="middle" fontSize="6" fill="#94a3b8">Moderate</text>
      <text x="188" y="112" textAnchor="middle" fontSize="6" fill="#94a3b8">Major</text>
      <text x="238" y="112" textAnchor="middle" fontSize="6" fill="#94a3b8">Catastrophic</text>
      {/* Grid cells — row 1 (Almost Certain) */}
      <rect x="64" y="28" width="46" height="18" rx="3" fill="#fff7ed" /><text x="87" y="40" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ea580c">S2</text>
      <rect x="114" y="28" width="46" height="18" rx="3" fill="#fff7ed" /><text x="137" y="40" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ea580c">S2</text>
      <rect x="164" y="28" width="46" height="18" rx="3" fill="#fef2f2" /><text x="187" y="40" textAnchor="middle" fontSize="7" fontWeight="700" fill="#dc2626">S1</text>
      <rect x="214" y="28" width="46" height="18" rx="3" fill="#fef2f2" /><text x="237" y="40" textAnchor="middle" fontSize="7" fontWeight="700" fill="#dc2626">S1</text>
      {/* Row 2 (Likely) */}
      <rect x="64" y="48" width="46" height="18" rx="3" fill="#fefce8" /><text x="87" y="60" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ca8a04">S3</text>
      <rect x="114" y="48" width="46" height="18" rx="3" fill="#fefce8" /><text x="137" y="60" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ca8a04">S3</text>
      <rect x="164" y="48" width="46" height="18" rx="3" fill="#fff7ed" /><text x="187" y="60" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ea580c">S2</text>
      <rect x="214" y="48" width="46" height="18" rx="3" fill="#fef2f2" /><text x="237" y="60" textAnchor="middle" fontSize="7" fontWeight="700" fill="#dc2626">S1</text>
      {/* Row 3 (Possible) — highlighted cell at Possible×Moderate */}
      <rect x="64" y="68" width="46" height="18" rx="3" fill="#ecfdf5" /><text x="87" y="80" textAnchor="middle" fontSize="7" fontWeight="700" fill="#059669">S4</text>
      <g className="rm-pulse">
        <rect x="114" y="68" width="46" height="18" rx="3" fill="#fefce8" stroke="#ca8a04" strokeWidth="2" />
        <text x="137" y="80" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ca8a04">S3</text>
      </g>
      <rect x="164" y="68" width="46" height="18" rx="3" fill="#fff7ed" /><text x="187" y="80" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ea580c">S2</text>
      <rect x="214" y="68" width="46" height="18" rx="3" fill="#fef2f2" /><text x="237" y="80" textAnchor="middle" fontSize="7" fontWeight="700" fill="#dc2626">S1</text>
      {/* Row 4 (Unlikely) */}
      <rect x="64" y="88" width="46" height="18" rx="3" fill="#ecfdf5" /><text x="87" y="100" textAnchor="middle" fontSize="7" fontWeight="700" fill="#059669">S4</text>
      <rect x="114" y="88" width="46" height="18" rx="3" fill="#ecfdf5" /><text x="137" y="100" textAnchor="middle" fontSize="7" fontWeight="700" fill="#059669">S4</text>
      <rect x="164" y="88" width="46" height="18" rx="3" fill="#fefce8" /><text x="187" y="100" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ca8a04">S3</text>
      <rect x="214" y="88" width="46" height="18" rx="3" fill="#fff7ed" /><text x="237" y="100" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ea580c">S2</text>
      {/* Pointer hand on highlighted cell */}
      <circle cx="148" cy="83" r="4" fill="#626DF9" opacity=".3" />
    </svg>
  );
}

/* ── System: Lifecycle Flow ── */
export function LifecycleFlowVisual({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes lfProg{0%{stroke-dashoffset:200}100%{stroke-dashoffset:0}}
        @keyframes lfDot{0%,80%{opacity:.3}90%,100%{opacity:1}}
        .lf-line{stroke-dasharray:200;animation:lfProg 3s ease-out forwards}
        .lf-d2{animation:lfDot 3s ease-out .6s both}.lf-d3{animation:lfDot 3s ease-out 1.2s both}
        .lf-d4{animation:lfDot 3s ease-out 1.8s both}.lf-d5{animation:lfDot 3s ease-out 2.4s both}
        @media(prefers-reduced-motion:reduce){.lf-line{animation:none;stroke-dashoffset:0}.lf-d2,.lf-d3,.lf-d4,.lf-d5{animation:none;opacity:1}}
      `}</style>
      {/* Connection line */}
      <path className="lf-line" d="M50 40 L110 40 L160 40 L210 40 L270 40" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* New */}
      <circle cx="50" cy="40" r="14" fill="#0DB4F0" />
      <text x="50" y="43" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--sds-bg-surface)">NEW</text>
      <text x="50" y="66" textAnchor="middle" fontSize="7" fontWeight="600" fill="#64748b">Day 0</text>
      {/* Triage */}
      <circle className="lf-d2" cx="110" cy="40" r="14" fill="#ED6C02" />
      <text x="110" y="43" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--sds-bg-surface)">TRIAGE</text>
      <text x="110" y="66" textAnchor="middle" fontSize="7" fontWeight="600" fill="#64748b">Day 0</text>
      {/* Investigating */}
      <circle className="lf-d3" cx="170" cy="40" r="14" fill="#626DF9" />
      <text x="170" y="43" textAnchor="middle" fontSize="5" fontWeight="700" fill="var(--sds-bg-surface)">INVEST.</text>
      <text x="170" y="66" textAnchor="middle" fontSize="7" fontWeight="600" fill="#64748b">Day 1-7</text>
      {/* CAPA */}
      <circle className="lf-d4" cx="230" cy="40" r="14" fill="#8b5cf6" />
      <text x="230" y="43" textAnchor="middle" fontSize="6" fontWeight="700" fill="var(--sds-bg-surface)">CAPA</text>
      <text x="230" y="66" textAnchor="middle" fontSize="7" fontWeight="600" fill="#64748b">Day 8+</text>
      {/* Closed */}
      <circle className="lf-d5" cx="290" cy="40" r="14" fill="#2E7D32" />
      <text x="290" y="43" textAnchor="middle" fontSize="5" fontWeight="700" fill="var(--sds-bg-surface)">CLOSED</text>
      <text x="290" y="66" textAnchor="middle" fontSize="7" fontWeight="600" fill="#64748b">Verified</text>
      {/* Arrows between dots */}
      <polygon points="76,38 76,42 82,40" fill="#cbd5e1" />
      <polygon points="130,38 130,42 136,40" fill="#cbd5e1" />
      <polygon points="190,38 190,42 196,40" fill="#cbd5e1" />
      <polygon points="250,38 250,42 256,40" fill="#cbd5e1" />
    </svg>
  );
}

/* ── Moment: Chemical Splash ── */
export function ChemSplashMoment({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes csDrop{0%{transform:translateY(-8px);opacity:0}30%{opacity:1}100%{transform:translateY(14px);opacity:0}}
        @keyframes csBurst{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.15);opacity:.6}}
        .cs-d1{animation:csDrop 1.2s ease-in infinite}.cs-d2{animation:csDrop 1.2s ease-in .3s infinite}
        .cs-d3{animation:csDrop 1.2s ease-in .6s infinite}.cs-d4{animation:csDrop 1.2s ease-in .9s infinite}
        .cs-burst{animation:csBurst 2s ease-in-out infinite;transform-origin:center}
        @media(prefers-reduced-motion:reduce){.cs-d1,.cs-d2,.cs-d3,.cs-d4,.cs-burst{animation:none;opacity:.4}}
      `}</style>
      {/* Pipe / fitting */}
      <rect x="100" y="40" width="120" height="14" rx="4" fill="#94a3b8" />
      <rect x="148" y="36" width="24" height="22" rx="3" fill="#78716c" />
      <line x1="152" y1="36" x2="152" y2="58" stroke="#a8a29e" strokeWidth="1" />
      <line x1="168" y1="36" x2="168" y2="58" stroke="#a8a29e" strokeWidth="1" />
      {/* Burst / crack */}
      <g className="cs-burst">
        <circle cx="160" cy="60" r="20" fill="#fbbf24" opacity=".15" />
        <circle cx="160" cy="60" r="12" fill="#fbbf24" opacity=".25" />
      </g>
      {/* Crack line */}
      <path d="M156 44 L158 50 L154 54 L160 58" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Splash droplets */}
      <ellipse className="cs-d1" cx="140" cy="64" rx="3" ry="4" fill="#fbbf24" opacity=".7" />
      <ellipse className="cs-d2" cx="180" cy="62" rx="2.5" ry="3.5" fill="#fbbf24" opacity=".6" />
      <ellipse className="cs-d3" cx="150" cy="70" rx="2" ry="3" fill="#f59e0b" opacity=".5" />
      <ellipse className="cs-d4" cx="172" cy="68" rx="2.5" ry="3" fill="#f59e0b" opacity=".6" />
      <circle className="cs-d2" cx="134" cy="72" r="2" fill="#fbbf24" opacity=".4" />
      <circle className="cs-d3" cx="186" cy="74" r="2" fill="#fbbf24" opacity=".4" />
      {/* Warning triangle */}
      <g transform="translate(250,24)">
        <polygon points="20,0 40,36 0,36" fill="#fbbf24" stroke="#92400e" strokeWidth="1.5" rx="3" />
        <text x="20" y="28" textAnchor="middle" fontSize="18" fontWeight="800" fill="#92400e">!</text>
      </g>
      {/* Person arm silhouette */}
      <path d="M60 50 Q80 46 100 48" stroke="#626DF9" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".5" />
      <circle cx="54" cy="36" r="12" fill="#626DF9" opacity=".4" />
    </svg>
  );
}

/* ── Moment: Falling Object ── */
export function FallingObjectMoment({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes foFall{0%{transform:translateY(-20px);opacity:0}40%{opacity:1}100%{transform:translateY(0);opacity:1}}
        @keyframes foImpact{0%,60%{opacity:0;transform:scale(.5)}70%{opacity:1;transform:scale(1.2)}100%{opacity:.6;transform:scale(1)}}
        .fo-pallet{animation:foFall 1.5s ease-in both}
        .fo-impact{animation:foImpact 1.5s ease-out both;transform-origin:center}
        @media(prefers-reduced-motion:reduce){.fo-pallet,.fo-impact{animation:none;opacity:.7}}
      `}</style>
      {/* Racking */}
      <rect x="80" y="6" width="4" height="100" rx="1" fill="#64748b" />
      <rect x="180" y="6" width="4" height="100" rx="1" fill="#64748b" />
      <rect x="80" y="6" width="104" height="3" rx="1" fill="#475569" />
      <rect x="80" y="36" width="104" height="3" rx="1" fill="#475569" />
      <rect x="80" y="66" width="104" height="3" rx="1" fill="#475569" />
      {/* Pallet on top shelf */}
      <rect x="94" y="10" width="40" height="22" rx="2" fill="#d4a574" />
      <rect x="140" y="12" width="32" height="20" rx="2" fill="#e0c8a8" />
      {/* Falling pallet */}
      <g className="fo-pallet">
        <rect x="108" y="72" width="46" height="16" rx="2" fill="#d4a574" stroke="#b8956a" strokeWidth="1" />
        <rect x="112" y="68" width="38" height="6" rx="1" fill="#e0c8a8" />
      </g>
      {/* Impact star */}
      <g className="fo-impact">
        <polygon points="132,94 136,100 144,100 138,104 140,112 132,108 124,112 126,104 120,100 128,100" fill="#f59e0b" opacity=".5" />
      </g>
      {/* Dashed fall trajectory */}
      <line x1="132" y1="42" x2="132" y2="68" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="4 4" opacity=".4" />
      {/* Person silhouette walking away */}
      <circle cx="230" cy="70" r="10" fill="#626DF9" opacity=".4" />
      <rect x="224" y="80" width="12" height="20" rx="4" fill="#626DF9" opacity=".35" />
      {/* Arrow showing near miss */}
      <path d="M200 82 L220 82" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 3" opacity=".4" />
      <text x="210" y="96" textAnchor="middle" fontSize="7" fontWeight="600" fill="#dc2626" opacity=".6">10 sec ago</text>
    </svg>
  );
}

/* ── Moment: Electrical Hazard ── */
export function ElectricalHazardMoment({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes ehSpark{0%,100%{opacity:0;transform:scale(.5)}50%{opacity:1;transform:scale(1)}}
        .eh-s1{animation:ehSpark 1s ease-in-out infinite}.eh-s2{animation:ehSpark 1s ease-in-out .3s infinite}
        .eh-s3{animation:ehSpark 1s ease-in-out .6s infinite}
        @media(prefers-reduced-motion:reduce){.eh-s1,.eh-s2,.eh-s3{animation:none;opacity:.5}}
      `}</style>
      {/* Wall */}
      <rect x="0" y="0" width="320" height="76" rx="0" fill="#e2e8f0" />
      <rect x="0" y="76" width="320" height="34" rx="0" fill="#cbd5e1" />
      {/* Exposed wires */}
      <path d="M100 20 Q120 30 110 50 Q100 70 120 76" stroke="#78716c" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M104 20 Q124 32 114 52 Q104 72 124 76" stroke="#a8a29e" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Exposed copper */}
      <path d="M114 52 L120 60" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path d="M106 56 L100 64" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      {/* Sparks */}
      <g className="eh-s1" style={{ transformOrigin: '115px 58px' }}>
        <polygon points="115,50 118,56 124,54 119,59 122,65 116,61 110,65 113,59 108,55 114,56" fill="#fbbf24" />
      </g>
      <g className="eh-s2" style={{ transformOrigin: '108px 64px' }}>
        <polygon points="108,58 110,62 114,61 111,65 113,70 108,67 104,70 106,65 102,62 106,63" fill="#f59e0b" />
      </g>
      <g className="eh-s3" style={{ transformOrigin: '122px 52px' }}>
        <polygon points="122,46 124,50 128,49 125,53 127,58 122,55 118,58 120,53 116,50 120,51" fill="#fbbf24" opacity=".7" />
      </g>
      {/* Water puddle */}
      <ellipse cx="140" cy="98" rx="40" ry="6" fill="#93c5fd" opacity=".4" />
      <ellipse cx="140" cy="96" rx="30" ry="4" fill="#60a5fa" opacity=".3" />
      {/* Lightning bolt icon */}
      <g transform="translate(220,20)">
        <polygon points="24,0 10,28 20,28 14,50 40,18 28,18 36,0" fill="#f59e0b" opacity=".8" />
      </g>
      {/* Caution tape */}
      <rect x="180" y="68" width="100" height="8" rx="1" fill="#fbbf24" />
      <line x1="180" y1="68" x2="280" y2="76" stroke="#000" strokeWidth="1" opacity=".15" />
      <line x1="200" y1="68" x2="300" y2="76" stroke="#000" strokeWidth="1" opacity=".15" />
    </svg>
  );
}

/* ── OSHA / Regulatory Form ── */
export function OshaFormVisual({ className }) {
  return (
    <svg className={className} viewBox="0 0 320 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes ofStamp{0%{transform:scale(0) rotate(-20deg);opacity:0}60%{transform:scale(1.1) rotate(2deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
        .of-stamp{animation:ofStamp .8s cubic-bezier(.34,1.56,.64,1) .5s both;transform-origin:center}
        @media(prefers-reduced-motion:reduce){.of-stamp{animation:none;opacity:1;transform:none}}
      `}</style>
      {/* Clipboard */}
      <rect x="90" y="8" width="140" height="94" rx="6" fill="var(--sds-brand-primary-tint)" stroke="#626DF9" strokeWidth="1.5" />
      <rect x="138" y="2" width="44" height="14" rx="4" fill="#626DF9" />
      <rect x="146" y="6" width="28" height="6" rx="2" fill="var(--sds-brand-primary-tint)" />
      {/* Header text */}
      <text x="160" y="30" textAnchor="middle" fontSize="8" fontWeight="700" fill="#626DF9">OSHA 300 Log</text>
      <rect x="108" y="34" width="104" height="1" fill="#626DF9" opacity=".2" />
      {/* Form rows */}
      <rect x="108" y="42" width="50" height="3" rx="1" fill="#626DF9" opacity=".15" />
      <rect x="170" y="42" width="44" height="3" rx="1" fill="#626DF9" opacity=".15" />
      <rect x="108" y="50" width="40" height="3" rx="1" fill="#626DF9" opacity=".12" />
      <rect x="156" y="50" width="58" height="3" rx="1" fill="#626DF9" opacity=".12" />
      <rect x="108" y="58" width="56" height="3" rx="1" fill="#626DF9" opacity=".1" />
      <rect x="108" y="66" width="48" height="3" rx="1" fill="#626DF9" opacity=".1" />
      <rect x="164" y="66" width="50" height="3" rx="1" fill="#626DF9" opacity=".1" />
      {/* Checkmarks */}
      <circle cx="104" cy="43" r="4" fill="#22c55e" opacity=".15" />
      <path d="M102 43 L103 44 L106 41" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="104" cy="51" r="4" fill="#22c55e" opacity=".15" />
      <path d="M102 51 L103 52 L106 49" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Recordable stamp */}
      <g className="of-stamp">
        <rect x="120" y="74" width="80" height="20" rx="4" fill="none" stroke="#dc2626" strokeWidth="2" transform="rotate(-5 160 84)" />
        <text x="160" y="88" textAnchor="middle" fontSize="9" fontWeight="800" fill="#dc2626" transform="rotate(-5 160 88)">RECORDABLE</text>
      </g>
    </svg>
  );
}
