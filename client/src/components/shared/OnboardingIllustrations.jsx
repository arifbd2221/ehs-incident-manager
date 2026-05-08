/* ------------------------------------------------------------------ */
/*  OrgIllustration                                                    */
/*  Building with animated window lights and a waving flag on top      */
/* ------------------------------------------------------------------ */
export function OrgIllustration({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes orgWindowLight {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
        @keyframes orgFlagWave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(4deg); }
          75% { transform: rotate(-3deg); }
        }
        @keyframes orgFloatUp {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .org-win-1 { animation: orgWindowLight 3s ease-in-out infinite; }
        .org-win-2 { animation: orgWindowLight 3s ease-in-out 0.6s infinite; }
        .org-win-3 { animation: orgWindowLight 3s ease-in-out 1.2s infinite; }
        .org-win-4 { animation: orgWindowLight 3s ease-in-out 1.8s infinite; }
        .org-win-5 { animation: orgWindowLight 3s ease-in-out 0.3s infinite; }
        .org-win-6 { animation: orgWindowLight 3s ease-in-out 0.9s infinite; }
        .org-flag { animation: orgFlagWave 2.5s ease-in-out infinite; transform-origin: 100px 28px; }
        .org-building { animation: orgFloatUp 4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .org-win-1, .org-win-2, .org-win-3,
          .org-win-4, .org-win-5, .org-win-6 { animation: none; opacity: 0.7; }
          .org-flag { animation: none; }
          .org-building { animation: none; }
        }
      `}</style>

      {/* Ground shadow */}
      <ellipse cx="100" cy="142" rx="60" ry="6" fill="#626DF9" opacity="0.08" />

      <g className="org-building">
        {/* Main building body */}
        <rect x="60" y="45" width="80" height="95" rx="4" fill="#626DF9" />
        {/* Building top accent */}
        <rect x="60" y="45" width="80" height="10" rx="4" fill="#4338ca" />

        {/* Side wing left */}
        <rect x="42" y="70" width="22" height="70" rx="3" fill="#7C85FA" />
        {/* Side wing right */}
        <rect x="136" y="70" width="22" height="70" rx="3" fill="#7C85FA" />

        {/* Windows — main building, row 1 */}
        <rect className="org-win-1" x="72" y="62" width="12" height="10" rx="2" fill="#A5ADFF" />
        <rect className="org-win-2" x="90" y="62" width="12" height="10" rx="2" fill="#A5ADFF" />
        <rect className="org-win-3" x="108" y="62" width="12" height="10" rx="2" fill="#A5ADFF" />

        {/* Windows — main building, row 2 */}
        <rect className="org-win-4" x="72" y="80" width="12" height="10" rx="2" fill="#A5ADFF" />
        <rect className="org-win-5" x="90" y="80" width="12" height="10" rx="2" fill="#A5ADFF" />
        <rect className="org-win-6" x="108" y="80" width="12" height="10" rx="2" fill="#A5ADFF" />

        {/* Windows — main building, row 3 */}
        <rect className="org-win-3" x="72" y="98" width="12" height="10" rx="2" fill="#A5ADFF" />
        <rect className="org-win-1" x="90" y="98" width="12" height="10" rx="2" fill="#A5ADFF" />
        <rect className="org-win-2" x="108" y="98" width="12" height="10" rx="2" fill="#A5ADFF" />

        {/* Door */}
        <rect x="90" y="118" width="20" height="22" rx="3" fill="#4338ca" />
        <circle cx="106" cy="129" r="1.5" fill="#A5ADFF" />

        {/* Side wing windows */}
        <rect className="org-win-5" x="48" y="82" width="10" height="8" rx="2" fill="#A5ADFF" />
        <rect className="org-win-4" x="48" y="98" width="10" height="8" rx="2" fill="#A5ADFF" />
        <rect className="org-win-6" x="142" y="82" width="10" height="8" rx="2" fill="#A5ADFF" />
        <rect className="org-win-1" x="142" y="98" width="10" height="8" rx="2" fill="#A5ADFF" />

        {/* Flag pole */}
        <line x1="100" y1="28" x2="100" y2="45" stroke="#4338ca" strokeWidth="2" strokeLinecap="round" />

        {/* Flag */}
        <g className="org-flag">
          <path d="M100 28 L116 33 L100 38Z" fill="#f59e0b" />
        </g>
      </g>
    </svg>
  );
}


/* ------------------------------------------------------------------ */
/*  ComplianceIllustration                                             */
/*  Clipboard/shield with checkmarks appearing one by one              */
/* ------------------------------------------------------------------ */
export function ComplianceIllustration({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes compCheck {
          0%, 30% { stroke-dashoffset: 14; opacity: 0; }
          50% { opacity: 1; }
          60%, 100% { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes compShieldPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes compLineFade {
          0%, 20% { opacity: 0; width: 0; }
          40%, 100% { opacity: 1; }
        }
        .comp-check-1 {
          stroke-dasharray: 14; stroke-dashoffset: 14;
          animation: compCheck 2.5s ease-out 0.3s forwards;
        }
        .comp-check-2 {
          stroke-dasharray: 14; stroke-dashoffset: 14;
          animation: compCheck 2.5s ease-out 0.9s forwards;
        }
        .comp-check-3 {
          stroke-dasharray: 14; stroke-dashoffset: 14;
          animation: compCheck 2.5s ease-out 1.5s forwards;
        }
        .comp-shield { animation: compShieldPulse 3s ease-in-out infinite; transform-origin: 138px 52px; }
        .comp-line-1 { animation: compLineFade 2s ease-out 0.5s both; }
        .comp-line-2 { animation: compLineFade 2s ease-out 1.1s both; }
        .comp-line-3 { animation: compLineFade 2s ease-out 1.7s both; }
        @media (prefers-reduced-motion: reduce) {
          .comp-check-1, .comp-check-2, .comp-check-3 {
            animation: none; stroke-dashoffset: 0; opacity: 1;
          }
          .comp-shield { animation: none; }
          .comp-line-1, .comp-line-2, .comp-line-3 { animation: none; opacity: 1; }
        }
      `}</style>

      {/* Shadow */}
      <ellipse cx="90" cy="148" rx="50" ry="5" fill="#626DF9" opacity="0.07" />

      {/* Clipboard body */}
      <rect x="50" y="24" width="80" height="120" rx="8" fill="#f0f1fe" stroke="#626DF9" strokeWidth="2" />

      {/* Clipboard clip */}
      <rect x="76" y="18" width="28" height="16" rx="4" fill="#626DF9" />
      <rect x="82" y="22" width="16" height="8" rx="3" fill="#f0f1fe" />

      {/* Row 1 */}
      <circle cx="72" cy="58" r="8" fill="#22c55e" opacity="0.12" />
      <path className="comp-check-1" d="M68 58 L71 61 L77 55" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect className="comp-line-1" x="86" y="55" width="34" height="4" rx="2" fill="#626DF9" opacity="0.2" />

      {/* Row 2 */}
      <circle cx="72" cy="84" r="8" fill="#22c55e" opacity="0.12" />
      <path className="comp-check-2" d="M68 84 L71 87 L77 81" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect className="comp-line-2" x="86" y="81" width="28" height="4" rx="2" fill="#626DF9" opacity="0.2" />

      {/* Row 3 */}
      <circle cx="72" cy="110" r="8" fill="#22c55e" opacity="0.12" />
      <path className="comp-check-3" d="M68 110 L71 113 L77 107" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect className="comp-line-3" x="86" y="107" width="32" height="4" rx="2" fill="#626DF9" opacity="0.2" />

      {/* Shield accent */}
      <g className="comp-shield">
        <path d="M138 36 L138 58 C138 68 128 74 128 74 C128 74 118 68 118 58 L118 36 L128 30 L138 36Z" fill="#626DF9" opacity="0.9" />
        <path d="M124 52 L127 55 L133 47" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}


/* ------------------------------------------------------------------ */
/*  FounderIllustration                                                */
/*  Person receiving a key/badge — "access granted" feel               */
/* ------------------------------------------------------------------ */
export function FounderIllustration({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes founderKeyFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-4px) rotate(3deg); }
        }
        @keyframes founderGlow {
          0%, 100% { opacity: 0.15; r: 28; }
          50% { opacity: 0.3; r: 34; }
        }
        @keyframes founderBadgeIn {
          0% { transform: scale(0) rotate(-20deg); opacity: 0; }
          60% { transform: scale(1.1) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes founderSparkle {
          0%, 100% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1); }
        }
        .founder-key { animation: founderKeyFloat 3s ease-in-out infinite; transform-origin: 145px 65px; }
        .founder-glow { animation: founderGlow 3s ease-in-out infinite; }
        .founder-badge { animation: founderBadgeIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both; transform-origin: 145px 65px; }
        .founder-sparkle-1 { animation: founderSparkle 2s ease-in-out 1s infinite; transform-origin: center; }
        .founder-sparkle-2 { animation: founderSparkle 2s ease-in-out 1.5s infinite; transform-origin: center; }
        .founder-sparkle-3 { animation: founderSparkle 2s ease-in-out 1.8s infinite; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) {
          .founder-key, .founder-glow, .founder-badge,
          .founder-sparkle-1, .founder-sparkle-2, .founder-sparkle-3 {
            animation: none;
          }
          .founder-badge { opacity: 1; transform: none; }
          .founder-glow { opacity: 0.2; }
          .founder-sparkle-1, .founder-sparkle-2, .founder-sparkle-3 { opacity: 0; }
        }
      `}</style>

      {/* Shadow */}
      <ellipse cx="85" cy="146" rx="40" ry="5" fill="#626DF9" opacity="0.07" />

      {/* Person body */}
      <circle cx="85" cy="52" r="18" fill="#626DF9" /> {/* Head */}
      <rect x="65" y="72" width="40" height="50" rx="10" fill="#626DF9" /> {/* Torso */}

      {/* Person face details */}
      <circle cx="79" cy="50" r="2" fill="#f0f1fe" /> {/* Left eye */}
      <circle cx="91" cy="50" r="2" fill="#f0f1fe" /> {/* Right eye */}
      <path d="M81 57 Q85 60 89 57" stroke="#f0f1fe" strokeWidth="1.5" strokeLinecap="round" fill="none" /> {/* Smile */}

      {/* Person arm reaching out */}
      <path d="M105 82 Q118 76 130 68" stroke="#626DF9" strokeWidth="8" strokeLinecap="round" fill="none" />

      {/* Badge glow */}
      <circle className="founder-glow" cx="145" cy="65" r="28" fill="#f59e0b" />

      {/* Key/Badge */}
      <g className="founder-badge">
        <g className="founder-key">
          {/* Badge body */}
          <rect x="132" y="50" width="26" height="30" rx="6" fill="#f59e0b" />
          <rect x="136" y="54" width="18" height="6" rx="2" fill="white" opacity="0.5" />

          {/* Star on badge */}
          <polygon points="145,66 147,71 152,71 148,74 149,79 145,76 141,79 142,74 138,71 143,71" fill="white" opacity="0.9" />

          {/* Badge clip */}
          <rect x="141" y="44" width="8" height="8" rx="2" fill="#d97706" />
        </g>
      </g>

      {/* Sparkles */}
      <g className="founder-sparkle-1">
        <path d="M160 42 L162 46 L166 48 L162 50 L160 54 L158 50 L154 48 L158 46Z" fill="#f59e0b" opacity="0.7" />
      </g>
      <g className="founder-sparkle-2">
        <path d="M168 72 L169 75 L172 76 L169 77 L168 80 L167 77 L164 76 L167 75Z" fill="#626DF9" opacity="0.5" />
      </g>
      <g className="founder-sparkle-3">
        <path d="M130 40 L131 43 L134 44 L131 45 L130 48 L129 45 L126 44 L129 43Z" fill="#f59e0b" opacity="0.6" />
      </g>

      {/* Person legs */}
      <rect x="72" y="118" width="10" height="24" rx="5" fill="#4338ca" />
      <rect x="88" y="118" width="10" height="24" rx="5" fill="#4338ca" />
    </svg>
  );
}


/* ------------------------------------------------------------------ */
/*  SiteIllustration                                                   */
/*  Factory with location pin and welcoming wave effect                */
/* ------------------------------------------------------------------ */
export function SiteIllustration({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes siteWave {
          0% { r: 16; opacity: 0.4; }
          100% { r: 36; opacity: 0; }
        }
        @keyframes sitePinBounce {
          0%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
          60% { transform: translateY(-2px); }
        }
        @keyframes siteSmoke {
          0% { transform: translateY(0); opacity: 0.4; }
          100% { transform: translateY(-14px); opacity: 0; }
        }
        .site-wave-1 { animation: siteWave 2.5s ease-out infinite; }
        .site-wave-2 { animation: siteWave 2.5s ease-out 0.8s infinite; }
        .site-wave-3 { animation: siteWave 2.5s ease-out 1.6s infinite; }
        .site-pin { animation: sitePinBounce 2s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; transform-origin: 60px 38px; }
        .site-smoke-1 { animation: siteSmoke 3s ease-out infinite; transform-origin: center; }
        .site-smoke-2 { animation: siteSmoke 3s ease-out 1s infinite; transform-origin: center; }
        .site-smoke-3 { animation: siteSmoke 3s ease-out 2s infinite; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) {
          .site-wave-1, .site-wave-2, .site-wave-3,
          .site-pin, .site-smoke-1, .site-smoke-2, .site-smoke-3 {
            animation: none;
          }
          .site-wave-1 { opacity: 0.25; }
          .site-wave-2, .site-wave-3 { opacity: 0; }
          .site-smoke-1 { opacity: 0.3; }
          .site-smoke-2, .site-smoke-3 { opacity: 0; }
        }
      `}</style>

      {/* Ground */}
      <ellipse cx="110" cy="140" rx="65" ry="6" fill="#626DF9" opacity="0.07" />

      {/* Location pin with wave rings */}
      <g className="site-pin">
        {/* Wave rings emanating from pin */}
        <circle className="site-wave-1" cx="60" cy="52" r="16" stroke="#626DF9" strokeWidth="1.5" fill="none" />
        <circle className="site-wave-2" cx="60" cy="52" r="16" stroke="#626DF9" strokeWidth="1" fill="none" />
        <circle className="site-wave-3" cx="60" cy="52" r="16" stroke="#626DF9" strokeWidth="0.8" fill="none" />

        {/* Pin body */}
        <path d="M60 70 C60 70 42 52 42 42 C42 32 50 24 60 24 C70 24 78 32 78 42 C78 52 60 70 60 70Z" fill="#626DF9" />
        <circle cx="60" cy="42" r="8" fill="white" opacity="0.9" />
        <circle cx="60" cy="42" r="4" fill="#626DF9" opacity="0.6" />
      </g>

      {/* Factory building */}
      <rect x="90" y="65" width="70" height="75" rx="4" fill="#7C85FA" />

      {/* Factory roof / sawtooth */}
      <polygon points="90,65 110,48 110,65" fill="#626DF9" />
      <polygon points="110,65 130,48 130,65" fill="#626DF9" />
      <polygon points="130,65 150,48 150,65" fill="#4338ca" />

      {/* Chimney */}
      <rect x="152" y="40" width="10" height="25" rx="2" fill="#4338ca" />

      {/* Smoke puffs */}
      <circle className="site-smoke-1" cx="157" cy="36" r="4" fill="#626DF9" opacity="0.3" />
      <circle className="site-smoke-2" cx="160" cy="32" r="3" fill="#626DF9" opacity="0.2" />
      <circle className="site-smoke-3" cx="155" cy="28" r="3.5" fill="#626DF9" opacity="0.25" />

      {/* Factory windows */}
      <rect x="100" y="78" width="14" height="12" rx="2" fill="#f0f1fe" opacity="0.8" />
      <rect x="120" y="78" width="14" height="12" rx="2" fill="#f0f1fe" opacity="0.8" />
      <rect x="140" y="78" width="14" height="12" rx="2" fill="#f0f1fe" opacity="0.8" />

      {/* Factory door */}
      <rect x="110" y="108" width="22" height="32" rx="4" fill="#4338ca" />
      <rect x="112" y="110" width="18" height="20" rx="3" fill="#f0f1fe" opacity="0.3" />

      {/* Connecting dotted path from pin to factory */}
      <path d="M72 60 Q82 70 90 75" stroke="#626DF9" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.3" fill="none" />
    </svg>
  );
}


/* ------------------------------------------------------------------ */
/*  TeamIllustration                                                   */
/*  Multiple person avatars with pulse connections                      */
/* ------------------------------------------------------------------ */
export function TeamIllustration({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes teamPulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.6; }
        }
        @keyframes teamNodePop {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes teamLineDraw {
          0% { stroke-dashoffset: 60; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes teamCenterGlow {
          0%, 100% { r: 22; opacity: 0.1; }
          50% { r: 28; opacity: 0.2; }
        }
        .team-line { stroke-dasharray: 60; animation: teamLineDraw 1.5s ease-out forwards; }
        .team-line-1 { animation-delay: 0.2s; }
        .team-line-2 { animation-delay: 0.4s; }
        .team-line-3 { animation-delay: 0.6s; }
        .team-line-4 { animation-delay: 0.8s; }
        .team-pulse { animation: teamPulse 2.5s ease-in-out infinite; }
        .team-pulse-2 { animation: teamPulse 2.5s ease-in-out 0.5s infinite; }
        .team-pulse-3 { animation: teamPulse 2.5s ease-in-out 1s infinite; }
        .team-node-1 { animation: teamNodePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both; transform-origin: 60px 50px; }
        .team-node-2 { animation: teamNodePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.6s both; transform-origin: 140px 50px; }
        .team-node-3 { animation: teamNodePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.9s both; transform-origin: 48px 110px; }
        .team-node-4 { animation: teamNodePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 1.2s both; transform-origin: 152px 110px; }
        .team-center-glow { animation: teamCenterGlow 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .team-line, .team-pulse, .team-pulse-2, .team-pulse-3,
          .team-node-1, .team-node-2, .team-node-3, .team-node-4,
          .team-center-glow {
            animation: none;
          }
          .team-line { stroke-dashoffset: 0; }
          .team-node-1, .team-node-2, .team-node-3, .team-node-4 { opacity: 1; transform: none; }
          .team-pulse { opacity: 0.3; }
          .team-pulse-2, .team-pulse-3 { opacity: 0.15; }
        }
      `}</style>

      {/* Center glow */}
      <circle className="team-center-glow" cx="100" cy="80" r="22" fill="#626DF9" />

      {/* Connection lines (drawn animated) */}
      <line className="team-line team-line-1" x1="100" y1="80" x2="60" y2="50" stroke="#626DF9" strokeWidth="1.5" opacity="0.3" />
      <line className="team-line team-line-2" x1="100" y1="80" x2="140" y2="50" stroke="#626DF9" strokeWidth="1.5" opacity="0.3" />
      <line className="team-line team-line-3" x1="100" y1="80" x2="48" y2="110" stroke="#626DF9" strokeWidth="1.5" opacity="0.3" />
      <line className="team-line team-line-4" x1="100" y1="80" x2="152" y2="110" stroke="#626DF9" strokeWidth="1.5" opacity="0.3" />

      {/* Pulse dots traveling along lines */}
      <circle className="team-pulse" cx="80" cy="65" r="3" fill="#626DF9" />
      <circle className="team-pulse-2" cx="120" cy="65" r="3" fill="#626DF9" />
      <circle className="team-pulse-3" cx="74" cy="95" r="3" fill="#626DF9" />
      <circle className="team-pulse" cx="126" cy="95" r="3" fill="#626DF9" />

      {/* Center person (larger) */}
      <circle cx="100" cy="72" r="12" fill="#626DF9" />
      <circle cx="96" cy="70" r="1.5" fill="white" />
      <circle cx="104" cy="70" r="1.5" fill="white" />
      <path d="M97 75 Q100 77 103 75" stroke="white" strokeWidth="1" strokeLinecap="round" fill="none" />
      <rect x="88" y="85" width="24" height="16" rx="6" fill="#626DF9" />

      {/* Top-left person */}
      <g className="team-node-1">
        <circle cx="60" cy="44" r="10" fill="#7C85FA" />
        <circle cx="57" cy="43" r="1.2" fill="white" />
        <circle cx="63" cy="43" r="1.2" fill="white" />
        <rect x="50" y="55" width="20" height="12" rx="5" fill="#7C85FA" />
      </g>

      {/* Top-right person */}
      <g className="team-node-2">
        <circle cx="140" cy="44" r="10" fill="#4338ca" />
        <circle cx="137" cy="43" r="1.2" fill="white" />
        <circle cx="143" cy="43" r="1.2" fill="white" />
        <rect x="130" y="55" width="20" height="12" rx="5" fill="#4338ca" />
      </g>

      {/* Bottom-left person */}
      <g className="team-node-3">
        <circle cx="48" cy="104" r="10" fill="#22c55e" />
        <circle cx="45" cy="103" r="1.2" fill="white" />
        <circle cx="51" cy="103" r="1.2" fill="white" />
        <rect x="38" y="115" width="20" height="12" rx="5" fill="#22c55e" />
      </g>

      {/* Bottom-right person */}
      <g className="team-node-4">
        <circle cx="152" cy="104" r="10" fill="#f59e0b" />
        <circle cx="149" cy="103" r="1.2" fill="white" />
        <circle cx="155" cy="103" r="1.2" fill="white" />
        <rect x="142" y="115" width="20" height="12" rx="5" fill="#f59e0b" />
      </g>
    </svg>
  );
}


/* ------------------------------------------------------------------ */
/*  SuccessIllustration                                                */
/*  Large animated checkmark with confetti particles                   */
/* ------------------------------------------------------------------ */
export function SuccessIllustration({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes successCircleGrow {
          0% { r: 0; opacity: 0; }
          50% { r: 44; opacity: 1; }
          100% { r: 40; opacity: 1; }
        }
        @keyframes successCheckDraw {
          0% { stroke-dashoffset: 50; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes successRingExpand {
          0% { r: 40; opacity: 0.5; stroke-width: 3; }
          100% { r: 58; opacity: 0; stroke-width: 0.5; }
        }
        @keyframes confettiFall1 {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(-20px, 40px) rotate(180deg); opacity: 0; }
        }
        @keyframes confettiFall2 {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(18px, 35px) rotate(-160deg); opacity: 0; }
        }
        @keyframes confettiFall3 {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(-12px, 45px) rotate(200deg); opacity: 0; }
        }
        @keyframes confettiBurst {
          0% { transform: scale(0); opacity: 0; }
          30% { transform: scale(1); opacity: 1; }
          100% { opacity: 1; }
        }
        .success-circle {
          animation: successCircleGrow 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .success-check {
          stroke-dasharray: 50; stroke-dashoffset: 50;
          animation: successCheckDraw 0.5s ease-out 0.4s forwards;
        }
        .success-ring {
          animation: successRingExpand 1.2s ease-out 0.3s forwards;
          opacity: 0;
        }
        .success-ring-2 {
          animation: successRingExpand 1.2s ease-out 0.6s forwards;
          opacity: 0;
        }
        .confetti-group {
          animation: confettiBurst 0.3s ease-out 0.5s both;
        }
        .confetti-1 { animation: confettiFall1 2s ease-in 0.7s infinite; transform-origin: center; }
        .confetti-2 { animation: confettiFall2 2.2s ease-in 0.9s infinite; transform-origin: center; }
        .confetti-3 { animation: confettiFall3 1.8s ease-in 1.1s infinite; transform-origin: center; }
        .confetti-4 { animation: confettiFall1 2.4s ease-in 1.3s infinite; transform-origin: center; }
        .confetti-5 { animation: confettiFall2 2s ease-in 0.8s infinite; transform-origin: center; }
        .confetti-6 { animation: confettiFall3 2.1s ease-in 1s infinite; transform-origin: center; }
        .confetti-7 { animation: confettiFall1 1.9s ease-in 1.2s infinite; transform-origin: center; }
        .confetti-8 { animation: confettiFall2 2.3s ease-in 0.6s infinite; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) {
          .success-circle { animation: none; r: 40; opacity: 1; }
          .success-check { animation: none; stroke-dashoffset: 0; }
          .success-ring, .success-ring-2 { animation: none; opacity: 0; }
          .confetti-group { animation: none; opacity: 1; }
          .confetti-1, .confetti-2, .confetti-3, .confetti-4,
          .confetti-5, .confetti-6, .confetti-7, .confetti-8 {
            animation: none; opacity: 0.7;
          }
        }
      `}</style>

      {/* Expanding rings */}
      <circle className="success-ring" cx="100" cy="76" r="40" stroke="#22c55e" strokeWidth="2" fill="none" />
      <circle className="success-ring-2" cx="100" cy="76" r="40" stroke="#22c55e" strokeWidth="1.5" fill="none" />

      {/* Main circle */}
      <circle className="success-circle" cx="100" cy="76" r="0" fill="#22c55e" />

      {/* Checkmark */}
      <path className="success-check" d="M82 76 L94 88 L118 64" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Confetti particles */}
      <g className="confetti-group">
        <rect className="confetti-1" x="62" y="38" width="6" height="4" rx="1" fill="#626DF9" />
        <rect className="confetti-2" x="134" y="34" width="5" height="4" rx="1" fill="#f59e0b" />
        <rect className="confetti-3" x="54" y="62" width="4" height="6" rx="1" fill="#22c55e" />
        <rect className="confetti-4" x="144" y="58" width="6" height="3" rx="1" fill="#626DF9" />
        <circle className="confetti-5" cx="72" cy="30" r="3" fill="#f59e0b" />
        <circle className="confetti-6" cx="130" cy="28" r="2.5" fill="#22c55e" />
        <rect className="confetti-7" x="50" y="80" width="4" height="4" rx="1" fill="#4338ca" transform="rotate(30 52 82)" />
        <rect className="confetti-8" x="148" y="76" width="5" height="3" rx="1" fill="#f59e0b" transform="rotate(-20 150 77)" />

        {/* Extra confetti shapes */}
        <polygon className="confetti-3" points="155,44 158,40 161,44" fill="#626DF9" opacity="0.8" />
        <polygon className="confetti-1" points="40,50 43,46 46,50" fill="#f59e0b" opacity="0.8" />
        <circle className="confetti-4" cx="46" cy="38" r="2" fill="#4338ca" opacity="0.7" />
        <circle className="confetti-2" cx="156" cy="68" r="2" fill="#22c55e" opacity="0.7" />
      </g>
    </svg>
  );
}
