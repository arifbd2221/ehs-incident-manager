import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/notfound.css';

export default function NotFound() {
  const location = useLocation();

  const sceneSvgRef = useRef(null);
  const lensRef = useRef(null);
  const hatRef = useRef(null);
  const peekGroupRef = useRef(null);
  const peekBubbleRef = useRef(null);
  const pupilLRef = useRef(null);
  const pupilRRef = useRef(null);
  const peekLRef = useRef(null);
  const peekRRef = useRef(null);
  const hint1Ref = useRef(null);
  const hint2Ref = useRef(null);
  const toastRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sceneSvg = sceneSvgRef.current;
    if (!sceneSvg) return;

    const eyes = [
      { el: pupilLRef.current, cx: -22, cy: -232, range: 5, parent: 'inspector' },
      { el: pupilRRef.current, cx: 22, cy: -232, range: 5, parent: 'inspector' },
      { el: peekLRef.current, cx: -9, cy: -112, range: 2, parent: 'hide' },
      { el: peekRRef.current, cx: 11, cy: -112, range: 2, parent: 'hide' },
    ];
    const inspectorHead = { x: 310, y: 160 };
    const hideHead = { x: 720, y: 268 };

    function onMove(e) {
      if (reduced) return;
      const r = sceneSvg.getBoundingClientRect();
      const vbX = ((e.clientX - r.left) / r.width) * 920;
      const vbY = ((e.clientY - r.top) / r.height) * 480;

      eyes.forEach((eye) => {
        if (!eye.el) return;
        const head = eye.parent === 'inspector' ? inspectorHead : hideHead;
        const dx = vbX - head.x;
        const dy = vbY - head.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        eye.el.setAttribute('cx', eye.cx + nx * eye.range);
        eye.el.setAttribute('cy', eye.cy + ny * eye.range);
      });

      if (lensRef.current) {
        const px = ((vbX - 460) / 460) * 4;
        const py = ((vbY - 200) / 200) * 3;
        lensRef.current.style.transform = `translate(${px}px, ${py}px)`;
      }
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  function dimHint(which) {
    const el = which === 'hat' ? hint1Ref.current : hint2Ref.current;
    if (el) el.style.opacity = '0';
  }

  function showToast(msg) {
    const t = toastRef.current;
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  const hatBusyRef = useRef(false);
  function onHatClick() {
    const hat = hatRef.current;
    if (!hat || hatBusyRef.current) return;
    hatBusyRef.current = true;
    hat.classList.add('hat-flipping');
    showToast('Yep, still works. Carry on.');
    dimHint('hat');
    setTimeout(() => {
      hat.classList.remove('hat-flipping');
      hatBusyRef.current = false;
    }, 700);
  }

  const lensBusyRef = useRef(false);
  const lensClicksRef = useRef(0);
  function onLensClick() {
    const lens = lensRef.current;
    if (!lens || lensBusyRef.current) return;
    lensBusyRef.current = true;
    lensClicksRef.current += 1;
    lens.classList.add('lens-wobble');
    if (lensClicksRef.current >= 5) {
      showToast("Stop poking the inspector! He's working.");
      lensClicksRef.current = 0;
    } else {
      showToast('Hmm. Still nothing here.');
    }
    setTimeout(() => {
      lens.classList.remove('lens-wobble');
      lensBusyRef.current = false;
    }, 600);
  }

  const peekBusyRef = useRef(false);
  function onPeekClick() {
    const peek = peekGroupRef.current;
    const bubble = peekBubbleRef.current;
    if (!peek || !bubble || peekBusyRef.current) return;
    peekBusyRef.current = true;
    peek.classList.add('peeked');
    bubble.classList.add('show');
    dimHint('peek');
    setTimeout(() => {
      peek.classList.remove('peeked');
      bubble.classList.remove('show');
      peekBusyRef.current = false;
    }, 2200);
  }

  return (
    <div className="nf-root">
      <nav className="nf-nav">
        <Link to="/" className="nf-brand">
          <svg className="nf-brand-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
            <g fill="#FFC93C">
              <rect x="14" y="14" width="14" height="14" transform="rotate(45 21 21)" />
              <rect x="36" y="18" width="18" height="18" transform="rotate(45 45 27)" />
              <rect x="58" y="14" width="14" height="14" transform="rotate(45 65 21)" />
              <rect x="36" y="40" width="14" height="14" transform="rotate(45 43 47)" />
            </g>
            <path d="M 18 62 L 42 86 L 92 36 L 82 26 L 42 66 L 28 52 Z" fill="#626DF9" />
          </svg>
          <span className="nf-brand-name">Safelync</span>
        </Link>
        <span className="nf-nav-spacer" />
        <span className="nf-nav-id">INC-2026-0404</span>
      </nav>

      <main className="nf-main">
        <div className="nf-scene">
          <div className="nf-hint nf-hint-1" ref={hint1Ref}>Click the hard hat</div>
          <div className="nf-hint nf-hint-2" ref={hint2Ref}>Tap me — I'm hiding</div>

          <svg ref={sceneSvgRef} viewBox="0 0 920 480" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <filter id="nfSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                <feOffset dy="3" result="off" />
                <feComponentTransfer><feFuncA type="linear" slope="0.2" /></feComponentTransfer>
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <g className="sketch" strokeWidth="1.5" opacity="0.25">
              <path d="M60 70 Q80 60 100 70 T140 70" />
              <path d="M820 90 Q840 80 860 90 T900 90" />
              <path d="M40 420 Q60 410 80 420" />
              <path d="M860 420 Q880 410 900 420" />
            </g>

            <g className="float-1" transform="translate(110 80)">
              <path className="sketch" strokeWidth="2.5" d="M0 0 L46 14 L20 22 L8 40 L18 24 Z" fill="#FFFDF6" />
              <path className="sketch" strokeWidth="1.5" d="M8 40 L20 22" />
              <path className="sketch" strokeWidth="1.2" d="M0 0 L20 22" opacity="0.4" />
              <path className="sketch" strokeWidth="1.5" d="M-12 -2 Q-20 6 -14 14 Q-22 22 -18 30" opacity="0.5" />
            </g>

            <g className="float-2" transform="translate(820 110)">
              <g className="nf-gear-spin">
                <circle cx="0" cy="0" r="14" fill="#fff" stroke="#1A1A1A" strokeWidth="2.5" />
                <circle cx="0" cy="0" r="5" fill="none" stroke="#1A1A1A" strokeWidth="2" />
                <g fill="#1A1A1A">
                  <rect x="-3" y="-22" width="6" height="6" />
                  <rect x="-3" y="16" width="6" height="6" />
                  <rect x="-22" y="-3" width="6" height="6" />
                  <rect x="16" y="-3" width="6" height="6" />
                  <rect x="-3" y="-22" width="6" height="6" transform="rotate(45)" />
                  <rect x="-3" y="-22" width="6" height="6" transform="rotate(-45)" />
                  <rect x="-3" y="16" width="6" height="6" transform="rotate(45)" />
                  <rect x="-3" y="16" width="6" height="6" transform="rotate(-45)" />
                </g>
              </g>
            </g>

            <g className="float-3" transform="translate(70 350)">
              <path className="sketch" strokeWidth="2.5" d="M0 4 L0 36 L36 36 L36 8 L18 8 L14 2 L0 2 Z" fill="#FFF8E0" />
              <path className="sketch" strokeWidth="2" d="M0 8 L14 8 L18 14 L36 14" />
              <text x="18" y="28" textAnchor="middle" fontFamily="Caveat" fontWeight="700" fontSize="11" fill="#1A1A1A">404</text>
            </g>

            <g className="float-4" transform="translate(440 50)">
              <text x="0" y="0" fontFamily="Caveat" fontWeight="700" fontSize="38" fill="#626DF9">?</text>
            </g>
            <g className="float-5" transform="translate(380 95)">
              <text x="0" y="0" fontFamily="Caveat" fontWeight="700" fontSize="22" fill="#FFC93C">?</text>
            </g>
            <g className="float-2" transform="translate(560 70)">
              <text x="0" y="0" fontFamily="Caveat" fontWeight="700" fontSize="28" fill="#D32F2F">!</text>
            </g>

            <g className="float-1" transform="translate(770 360)">
              <rect x="0" y="6" width="36" height="46" rx="3" fill="#fff" stroke="#1A1A1A" strokeWidth="2.5" />
              <rect x="11" y="0" width="14" height="10" rx="2" fill="#626DF9" stroke="#1A1A1A" strokeWidth="2" />
              <line className="sketch" strokeWidth="1.5" x1="6" y1="20" x2="30" y2="20" />
              <line className="sketch" strokeWidth="1.5" x1="6" y1="28" x2="24" y2="28" />
              <line className="sketch" strokeWidth="1.5" x1="6" y1="36" x2="28" y2="36" />
              <path className="sketch" strokeWidth="2" stroke="#2E7D32" d="M8 44 L11 47 L15 41" />
            </g>

            {/* INSPECTOR */}
            <g transform="translate(310 380)">
              <g className="inspector-walk">
                <ellipse cx="0" cy="0" rx="78" ry="9" fill="rgba(26,26,26,0.18)" />

                <g className="dust-puff" transform="translate(-50 -4)">
                  <path className="sketch" strokeWidth="2" fill="#fff" d="M0 0 Q-4 -6 2 -8 Q8 -12 12 -6 Q18 -8 18 -2 Q22 4 14 6 Q8 12 2 6 Q-6 6 0 0 Z" />
                </g>
                <g className="dust-puff dust-puff-2" transform="translate(-66 -2)">
                  <path className="sketch" strokeWidth="2" fill="#fff" d="M0 0 Q-3 -5 2 -6 Q7 -9 10 -4 Q15 -6 14 0 Q18 5 11 5 Q7 10 2 5 Q-5 4 0 0 Z" />
                </g>

                <g className="legs-l" style={{ transformOrigin: '-10px -50px' }}>
                  <line className="sketch" strokeWidth="7" x1="-10" y1="-50" x2="-18" y2="-8" />
                  <path d="M-26 -8 L-12 -8 L-10 -2 L-28 -2 Z" fill="#1A1A1A" />
                  <ellipse cx="-19" cy="-2" rx="9" ry="3" fill="#1A1A1A" />
                </g>
                <g className="legs-r" style={{ transformOrigin: '10px -50px' }}>
                  <line className="sketch" strokeWidth="7" x1="10" y1="-50" x2="18" y2="-8" />
                  <path d="M12 -8 L26 -8 L28 -2 L10 -2 Z" fill="#1A1A1A" />
                  <ellipse cx="19" cy="-2" rx="9" ry="3" fill="#1A1A1A" />
                </g>

                <g>
                  <rect x="-16" y="-130" width="32" height="80" rx="6" fill="#AE8145" stroke="#1A1A1A" strokeWidth="2.5" />
                  <line className="sketch" strokeWidth="2" stroke="rgba(0,0,0,0.4)" x1="-15" y1="-110" x2="15" y2="-110" />
                  <line className="sketch" strokeWidth="2" stroke="rgba(0,0,0,0.4)" x1="-15" y1="-90" x2="15" y2="-90" />
                  <line className="sketch" strokeWidth="2" stroke="rgba(0,0,0,0.4)" x1="-15" y1="-70" x2="15" y2="-70" />
                  <rect x="6" y="-128" width="8" height="76" rx="3" fill="rgba(0,0,0,0.18)" />
                </g>

                <ellipse cx="0" cy="-140" rx="24" ry="9" fill="#3F3F3F" stroke="#1A1A1A" strokeWidth="2.5" />

                <g
                  ref={lensRef}
                  className="lens-rim lens-rim-clickable"
                  style={{ transformOrigin: '0 -220px' }}
                  onClick={onLensClick}
                >
                  <circle cx="0" cy="-220" r="84" fill="#fff" stroke="#1A1A1A" strokeWidth="7" />
                  <circle cx="0" cy="-220" r="72" fill="#F2F4FE" stroke="#1A1A1A" strokeWidth="2" opacity="0.7" />

                  <g className="eyebrow">
                    <path className="sketch" strokeWidth="4" d="M-44 -250 Q-28 -260 -16 -252" />
                    <path className="sketch" strokeWidth="4" d="M16 -252 Q28 -260 44 -250" />
                  </g>

                  <g className="blink">
                    <ellipse cx="-22" cy="-232" rx="14" ry="14" fill="#fff" stroke="#1A1A1A" strokeWidth="3" />
                    <circle ref={pupilLRef} className="pupil" cx="-22" cy="-232" r="5.5" fill="#1A1A1A" />
                    <circle cx="-25" cy="-236" r="2" fill="#fff" />
                  </g>
                  <g className="blink" style={{ animationDelay: '0.1s' }}>
                    <ellipse cx="22" cy="-232" rx="14" ry="14" fill="#fff" stroke="#1A1A1A" strokeWidth="3" />
                    <circle ref={pupilRRef} className="pupil" cx="22" cy="-232" r="5.5" fill="#1A1A1A" />
                    <circle cx="19" cy="-236" r="2" fill="#fff" />
                  </g>

                  <ellipse cx="0" cy="-200" rx="7" ry="10" fill="#1A1A1A" />
                  <ellipse cx="-2" cy="-204" rx="2" ry="1.5" fill="#fff" opacity="0.4" />

                  <path className="sketch" stroke="#fff" strokeWidth="6" d="M-56 -262 Q-46 -274 -32 -268" opacity="0.85" />
                  <circle cx="-52" cy="-242" r="3" fill="#fff" opacity="0.7" />

                  <path d="M-60 -250 A80 80 0 0 1 -20 -290" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
                </g>

                <g
                  ref={hatRef}
                  className="hat-group"
                  transform="translate(0 -300)"
                  style={{ transformOrigin: 'center' }}
                  onClick={onHatClick}
                >
                  <ellipse cx="0" cy="14" rx="56" ry="6" fill="rgba(26,26,26,0.15)" />
                  <path d="M-58 12 Q-58 -28 0 -28 Q58 -28 58 12 Z" fill="#FFC93C" stroke="#1A1A1A" strokeWidth="3.5" />
                  <rect x="-58" y="10" width="116" height="8" rx="2" fill="#E0AC2A" stroke="#1A1A1A" strokeWidth="2.5" />
                  <path d="M0 -28 L0 10" stroke="#1A1A1A" strokeWidth="2" opacity="0.4" />
                  <path d="M-36 -8 Q-28 -22 -6 -26" stroke="#1A1A1A" strokeWidth="2" fill="none" opacity="0.4" />
                  <rect x="-14" y="-14" width="28" height="10" rx="2" fill="#626DF9" stroke="#1A1A1A" strokeWidth="1.5" />
                  <path d="M-40 -14 Q-30 -22 -10 -24" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
                </g>

                <path className="sketch" strokeWidth="7" d="M-16 -120 Q-44 -110 -64 -80" />
                <circle cx="-66" cy="-78" r="6" fill="#FFE3C2" stroke="#1A1A1A" strokeWidth="2.5" />
                <g transform="translate(-92 -68) rotate(-10)">
                  <rect x="-12" y="0" width="28" height="36" rx="3" fill="#fff" stroke="#1A1A1A" strokeWidth="2.5" />
                  <rect x="-4" y="-4" width="12" height="8" rx="1.5" fill="#626DF9" stroke="#1A1A1A" strokeWidth="2" />
                  <line className="sketch" strokeWidth="1.5" x1="-7" y1="10" x2="11" y2="10" />
                  <line className="sketch" strokeWidth="1.5" x1="-7" y1="16" x2="7" y2="16" />
                  <line className="sketch" strokeWidth="1.5" x1="-7" y1="22" x2="11" y2="22" />
                  <text x="2" y="32" textAnchor="middle" fontFamily="Caveat" fontWeight="700" fontSize="11" fill="#D32F2F">404?</text>
                </g>

                <path className="sketch" strokeWidth="7" d="M16 -130 Q40 -150 60 -190" />
                <g transform="translate(64 -198)">
                  <circle cx="0" cy="0" r="7" fill="#FFE3C2" stroke="#1A1A1A" strokeWidth="2.5" />
                  <path className="sketch" strokeWidth="3" d="M0 -4 Q8 -10 14 -16" fill="#FFE3C2" />
                  <ellipse cx="12" cy="-14" rx="3" ry="2" fill="#FFE3C2" stroke="#1A1A1A" strokeWidth="2" />
                </g>
              </g>
            </g>

            {/* HIDING CHARACTER */}
            <g transform="translate(720 380)">
              <ellipse cx="0" cy="2" rx="50" ry="8" fill="rgba(26,26,26,0.18)" />

              <g
                ref={peekGroupRef}
                className="peek-group"
                style={{ transformOrigin: '0 0' }}
                onClick={onPeekClick}
              >
                <g transform="translate(-22 -130)">
                  <path d="M0 0 L36 0 L48 12 L48 130 L0 130 Z" fill="#fff" stroke="#1A1A1A" strokeWidth="3" />
                  <path d="M36 0 L36 12 L48 12 Z" fill="#E5E7ED" stroke="#1A1A1A" strokeWidth="2.5" />
                  <line className="sketch" strokeWidth="2" x1="6" y1="40" x2="42" y2="40" />
                  <line className="sketch" strokeWidth="2" x1="6" y1="50" x2="34" y2="50" />

                  <ellipse cx="13" cy="18" rx="6" ry="6" fill="#fff" stroke="#1A1A1A" strokeWidth="2.5" />
                  <ellipse cx="33" cy="18" rx="6" ry="6" fill="#fff" stroke="#1A1A1A" strokeWidth="2.5" />
                  <circle ref={peekLRef} className="pupil" cx="13" cy="18" r="2.5" fill="#1A1A1A" />
                  <circle ref={peekRRef} className="pupil" cx="33" cy="18" r="2.5" fill="#1A1A1A" />
                  <path className="sketch" strokeWidth="2" d="M16 30 Q23 33 30 30" />
                  <path d="M44 8 Q44 4 47 6 Q50 4 47 14 Q40 8 44 8 Z" fill="#A8DBFF" stroke="#1A1A1A" strokeWidth="1.5" />
                  <path d="M0 22 Q-4 26 0 30 Q4 30 4 26 Z" fill="#fff" stroke="#1A1A1A" strokeWidth="2" />
                </g>
              </g>

              <g>
                <path d="M-12 -86 L12 -86 L9 -98 L-9 -98 Z" fill="#ED6C02" stroke="#1A1A1A" strokeWidth="2.5" />
                <path d="M-44 -4 L44 -4 L12 -86 L-12 -86 Z" fill="#ED6C02" stroke="#1A1A1A" strokeWidth="3" />
                <path d="M-34 -32 L34 -32 L32 -40 L-32 -40 Z" fill="#fff" stroke="#1A1A1A" strokeWidth="2.5" />
                <path d="M-26 -54 L26 -54 L24 -60 L-24 -60 Z" fill="#fff" stroke="#1A1A1A" strokeWidth="2.5" />
                <rect x="-48" y="-4" width="96" height="10" rx="2" fill="#1A1A1A" />
                <path className="sketch" stroke="#fff" strokeWidth="3" strokeLinecap="round" d="M-38 -16 Q-32 -28 -22 -56" opacity="0.6" />
              </g>

              <g ref={peekBubbleRef} className="peek-bubble" transform="translate(-110 -180)">
                <path
                  d="M0 12 Q0 0 14 0 L130 0 Q144 0 144 14 L144 32 Q144 44 132 44 L40 44 L28 56 L32 44 L14 44 Q0 44 0 32 Z"
                  fill="#fff"
                  stroke="#1A1A1A"
                  strokeWidth="2.5"
                />
                <text x="72" y="28" textAnchor="middle" fontFamily="Caveat" fontWeight="700" fontSize="20" fill="#1A1A1A">
                  You found me!
                </text>
              </g>
            </g>

            <g transform="translate(460 450)" opacity="0.4">
              <text x="0" y="0" textAnchor="middle" fontFamily="Caveat" fontWeight="700" fontSize="48" fill="#52525F">
                → page 404 ←
              </text>
            </g>
          </svg>
        </div>

        <section className="nf-text">
          <span className="nf-chip">
            <span className="nf-chip-badge">404</span>
            Page off the route
          </span>

          <h1 className="nf-title">
            Looks like this <span className="nf-title-curly">incident report</span> went missing.
          </h1>

          <p className="nf-subtitle">
            Don't worry — no one was hurt. Our inspector is on the case (he's currently
            questioning the safety cone). While he works, head back to safety below.
          </p>

          <div className="nf-actions">
            <Link className="nf-btn nf-btn-primary" to="/">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span>Take me back to safety</span>
            </Link>
            <Link className="nf-btn nf-btn-ghost" to="/incidents">
              Or open my incidents
            </Link>
          </div>

          <div className="nf-meta-row">
            <code>{location.pathname}</code>
            <span className="nf-meta-dot">·</span>
            <span>Severity S4 · No harm done</span>
            <span className="nf-meta-dot">·</span>
            <span>Logged just now</span>
          </div>
        </section>
      </main>

      <div className="nf-toast" ref={toastRef} role="status" aria-live="polite" />
    </div>
  );
}
