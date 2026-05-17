import { useState, useRef, useCallback } from 'react';

const VIEWS = ['front', 'back', 'left', 'right'];
const VIEW_LABELS = { front: 'Front', back: 'Back', left: 'Left side', right: 'Right side' };

export const PART_LABELS = {
  head: 'Head', face: 'Face', neck: 'Neck',
  l_shoulder: 'Left shoulder', r_shoulder: 'Right shoulder',
  l_upper_arm: 'Left upper arm', r_upper_arm: 'Right upper arm',
  l_elbow: 'Left elbow', r_elbow: 'Right elbow',
  l_forearm: 'Left forearm', r_forearm: 'Right forearm',
  l_wrist: 'Left wrist', r_wrist: 'Right wrist',
  l_hand: 'Left hand', r_hand: 'Right hand',
  chest: 'Chest', abdomen: 'Abdomen',
  upper_back: 'Upper back', lower_back: 'Lower back',
  l_hip: 'Left hip', r_hip: 'Right hip',
  l_thigh: 'Left thigh', r_thigh: 'Right thigh',
  l_knee: 'Left knee', r_knee: 'Right knee',
  l_shin: 'Left shin', r_shin: 'Right shin',
  l_ankle: 'Left ankle', r_ankle: 'Right ankle',
  l_foot: 'Left foot', r_foot: 'Right foot',
};

const FRONT_PARTS = [
  { id: 'head', d: 'M88,14 C88,6 94,0 100,0 C106,0 112,6 112,14 L112,26 C112,32 106,38 100,38 C94,38 88,32 88,26 Z' },
  { id: 'neck', d: 'M94,38 L94,48 L106,48 L106,38 C103,42 97,42 94,38 Z' },
  { id: 'l_shoulder', d: 'M94,48 L72,54 L68,64 L78,64 L86,54 L94,50 Z' },
  { id: 'r_shoulder', d: 'M106,48 L128,54 L132,64 L122,64 L114,54 L106,50 Z' },
  { id: 'chest', d: 'M86,54 L78,64 L76,90 L100,94 L124,90 L122,64 L114,54 L106,50 L94,50 Z' },
  { id: 'abdomen', d: 'M76,90 L100,94 L124,90 L122,116 L100,120 L78,116 Z' },
  { id: 'l_upper_arm', d: 'M68,64 L60,90 L54,90 L48,76 L58,64 L68,64 Z' },
  { id: 'r_upper_arm', d: 'M132,64 L140,90 L146,90 L152,76 L142,64 L132,64 Z' },
  { id: 'l_elbow', d: 'M54,90 L60,90 L58,102 L50,102 Z' },
  { id: 'r_elbow', d: 'M146,90 L140,90 L142,102 L150,102 Z' },
  { id: 'l_forearm', d: 'M50,102 L58,102 L56,128 L46,128 Z' },
  { id: 'r_forearm', d: 'M150,102 L142,102 L144,128 L154,128 Z' },
  { id: 'l_wrist', d: 'M46,128 L56,128 L55,136 L45,136 Z' },
  { id: 'r_wrist', d: 'M154,128 L144,128 L145,136 L155,136 Z' },
  { id: 'l_hand', d: 'M45,136 L55,136 L56,152 L43,152 Z' },
  { id: 'r_hand', d: 'M155,136 L145,136 L144,152 L157,152 Z' },
  { id: 'l_hip', d: 'M78,116 L100,120 L98,132 L80,128 Z' },
  { id: 'r_hip', d: 'M122,116 L100,120 L102,132 L120,128 Z' },
  { id: 'l_thigh', d: 'M80,128 L98,132 L94,172 L82,172 Z' },
  { id: 'r_thigh', d: 'M120,128 L102,132 L106,172 L118,172 Z' },
  { id: 'l_knee', d: 'M82,172 L94,172 L93,188 L81,188 Z' },
  { id: 'r_knee', d: 'M118,172 L106,172 L107,188 L119,188 Z' },
  { id: 'l_shin', d: 'M81,188 L93,188 L92,230 L82,230 Z' },
  { id: 'r_shin', d: 'M119,188 L107,188 L108,230 L118,230 Z' },
  { id: 'l_ankle', d: 'M82,230 L92,230 L91,240 L81,240 Z' },
  { id: 'r_ankle', d: 'M118,230 L108,230 L109,240 L119,240 Z' },
  { id: 'l_foot', d: 'M81,240 L91,240 L89,254 L76,254 Z' },
  { id: 'r_foot', d: 'M119,240 L109,240 L111,254 L124,254 Z' },
];

const BACK_PARTS = [
  { id: 'head', d: 'M88,14 C88,6 94,0 100,0 C106,0 112,6 112,14 L112,26 C112,32 106,38 100,38 C94,38 88,32 88,26 Z' },
  { id: 'neck', d: 'M94,38 L94,48 L106,48 L106,38 C103,42 97,42 94,38 Z' },
  { id: 'l_shoulder', d: 'M106,48 L128,54 L132,64 L122,64 L114,54 L106,50 Z' },
  { id: 'r_shoulder', d: 'M94,48 L72,54 L68,64 L78,64 L86,54 L94,50 Z' },
  { id: 'upper_back', d: 'M86,54 L78,64 L76,90 L100,94 L124,90 L122,64 L114,54 L106,50 L94,50 Z' },
  { id: 'lower_back', d: 'M76,90 L100,94 L124,90 L122,116 L100,120 L78,116 Z' },
  { id: 'l_upper_arm', d: 'M132,64 L140,90 L146,90 L152,76 L142,64 L132,64 Z' },
  { id: 'r_upper_arm', d: 'M68,64 L60,90 L54,90 L48,76 L58,64 L68,64 Z' },
  { id: 'l_elbow', d: 'M146,90 L140,90 L142,102 L150,102 Z' },
  { id: 'r_elbow', d: 'M54,90 L60,90 L58,102 L50,102 Z' },
  { id: 'l_forearm', d: 'M150,102 L142,102 L144,128 L154,128 Z' },
  { id: 'r_forearm', d: 'M50,102 L58,102 L56,128 L46,128 Z' },
  { id: 'l_wrist', d: 'M154,128 L144,128 L145,136 L155,136 Z' },
  { id: 'r_wrist', d: 'M46,128 L56,128 L55,136 L45,136 Z' },
  { id: 'l_hand', d: 'M155,136 L145,136 L144,152 L157,152 Z' },
  { id: 'r_hand', d: 'M45,136 L55,136 L56,152 L43,152 Z' },
  { id: 'l_hip', d: 'M122,116 L100,120 L102,132 L120,128 Z' },
  { id: 'r_hip', d: 'M78,116 L100,120 L98,132 L80,128 Z' },
  { id: 'l_thigh', d: 'M120,128 L102,132 L106,172 L118,172 Z' },
  { id: 'r_thigh', d: 'M80,128 L98,132 L94,172 L82,172 Z' },
  { id: 'l_knee', d: 'M118,172 L106,172 L107,188 L119,188 Z' },
  { id: 'r_knee', d: 'M82,172 L94,172 L93,188 L81,188 Z' },
  { id: 'l_shin', d: 'M119,188 L107,188 L108,230 L118,230 Z' },
  { id: 'r_shin', d: 'M81,188 L93,188 L92,230 L82,230 Z' },
  { id: 'l_ankle', d: 'M118,230 L108,230 L109,240 L119,240 Z' },
  { id: 'r_ankle', d: 'M82,230 L92,230 L91,240 L81,240 Z' },
  { id: 'l_foot', d: 'M119,240 L109,240 L111,254 L124,254 Z' },
  { id: 'r_foot', d: 'M81,240 L91,240 L89,254 L76,254 Z' },
];

const SIDE_LEFT_PARTS = [
  { id: 'head', d: 'M88,14 C88,4 94,0 102,0 C108,4 110,10 110,18 L108,30 C106,36 100,40 96,38 C90,34 88,26 88,20 Z' },
  { id: 'neck', d: 'M96,38 L94,48 L106,48 L108,38 Z' },
  { id: 'r_shoulder', d: 'M94,48 L80,52 L74,62 L86,60 L94,52 Z' },
  { id: 'upper_back', d: 'M106,48 L110,52 L112,68 L108,90 L100,92 L88,88 L86,68 L86,60 L94,52 Z' },
  { id: 'lower_back', d: 'M88,88 L100,92 L108,90 L110,116 L100,118 L86,114 Z' },
  { id: 'r_upper_arm', d: 'M74,62 L66,88 L58,88 L62,68 L74,62 Z' },
  { id: 'r_elbow', d: 'M58,88 L66,88 L64,100 L56,100 Z' },
  { id: 'r_forearm', d: 'M56,100 L64,100 L62,126 L52,126 Z' },
  { id: 'r_wrist', d: 'M52,126 L62,126 L61,134 L51,134 Z' },
  { id: 'r_hand', d: 'M51,134 L61,134 L60,150 L49,150 Z' },
  { id: 'r_hip', d: 'M86,114 L100,118 L102,132 L88,128 Z' },
  { id: 'l_hip', d: 'M100,118 L110,116 L112,130 L102,132 Z' },
  { id: 'r_thigh', d: 'M88,128 L102,132 L98,172 L86,172 Z' },
  { id: 'l_thigh', d: 'M102,132 L112,130 L110,172 L98,172 Z' },
  { id: 'r_knee', d: 'M86,172 L98,172 L97,188 L85,188 Z' },
  { id: 'l_knee', d: 'M98,172 L110,172 L109,188 L97,188 Z' },
  { id: 'r_shin', d: 'M85,188 L97,188 L96,230 L86,230 Z' },
  { id: 'l_shin', d: 'M97,188 L109,188 L108,230 L96,230 Z' },
  { id: 'r_ankle', d: 'M86,230 L96,230 L95,240 L85,240 Z' },
  { id: 'l_ankle', d: 'M96,230 L108,230 L107,240 L95,240 Z' },
  { id: 'r_foot', d: 'M85,240 L95,240 L93,254 L80,254 Z' },
  { id: 'l_foot', d: 'M95,240 L107,240 L109,254 L93,254 Z' },
];

const SIDE_RIGHT_PARTS = [
  { id: 'head', d: 'M112,14 C112,4 106,0 98,0 C92,4 90,10 90,18 L92,30 C94,36 100,40 104,38 C110,34 112,26 112,20 Z' },
  { id: 'neck', d: 'M104,38 L106,48 L94,48 L92,38 Z' },
  { id: 'l_shoulder', d: 'M106,48 L120,52 L126,62 L114,60 L106,52 Z' },
  { id: 'upper_back', d: 'M94,48 L90,52 L88,68 L92,90 L100,92 L112,88 L114,68 L114,60 L106,52 Z' },
  { id: 'lower_back', d: 'M112,88 L100,92 L92,90 L90,116 L100,118 L114,114 Z' },
  { id: 'l_upper_arm', d: 'M126,62 L134,88 L142,88 L138,68 L126,62 Z' },
  { id: 'l_elbow', d: 'M142,88 L134,88 L136,100 L144,100 Z' },
  { id: 'l_forearm', d: 'M144,100 L136,100 L138,126 L148,126 Z' },
  { id: 'l_wrist', d: 'M148,126 L138,126 L139,134 L149,134 Z' },
  { id: 'l_hand', d: 'M149,134 L139,134 L140,150 L151,150 Z' },
  { id: 'l_hip', d: 'M114,114 L100,118 L98,132 L112,128 Z' },
  { id: 'r_hip', d: 'M100,118 L90,116 L88,130 L98,132 Z' },
  { id: 'l_thigh', d: 'M112,128 L98,132 L102,172 L114,172 Z' },
  { id: 'r_thigh', d: 'M98,132 L88,130 L90,172 L102,172 Z' },
  { id: 'l_knee', d: 'M114,172 L102,172 L103,188 L115,188 Z' },
  { id: 'r_knee', d: 'M102,172 L90,172 L91,188 L103,188 Z' },
  { id: 'l_shin', d: 'M115,188 L103,188 L104,230 L114,230 Z' },
  { id: 'r_shin', d: 'M103,188 L91,188 L92,230 L104,230 Z' },
  { id: 'l_ankle', d: 'M114,230 L104,230 L105,240 L115,240 Z' },
  { id: 'r_ankle', d: 'M104,230 L92,230 L93,240 L105,240 Z' },
  { id: 'l_foot', d: 'M115,240 L105,240 L107,254 L120,254 Z' },
  { id: 'r_foot', d: 'M105,240 L93,240 L91,254 L107,254 Z' },
];

const VIEW_PARTS = {
  front: FRONT_PARTS,
  back: BACK_PARTS,
  left: SIDE_LEFT_PARTS,
  right: SIDE_RIGHT_PARTS,
};

export default function BodyMap3D({ selected = [], onToggle }) {
  const [viewIdx, setViewIdx] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transDir, setTransDir] = useState('next');
  const [tooltip, setTooltip] = useState(null);
  const dragRef = useRef({ startX: 0, dragging: false });
  const containerRef = useRef(null);

  const view = VIEWS[viewIdx];
  const parts = VIEW_PARTS[view];

  const rotateView = useCallback((dir) => {
    if (transitioning) return;
    setTransDir(dir > 0 ? 'next' : 'prev');
    setTransitioning(true);
    setTimeout(() => {
      setViewIdx(i => (i + dir + VIEWS.length) % VIEWS.length);
      setTransitioning(false);
    }, 280);
  }, [transitioning]);

  const handlePointerDown = (e) => {
    dragRef.current = { startX: e.clientX, dragging: true };
  };
  const handlePointerUp = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.dragging = false;
    if (Math.abs(dx) > 40) {
      rotateView(dx < 0 ? 1 : -1);
    }
  };

  const handlePartHover = (e, id) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      label: PART_LABELS[id] || id,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
    });
  };

  return (
    <div className="bm3d" ref={containerRef}>
      <div className="bm3d-header">
        <button
          className="bm3d-nav-btn"
          onClick={() => rotateView(-1)}
          aria-label="Rotate left"
        >
          <svg width="14" height="14" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="bm3d-view-label">
          <div className="bm3d-view-name">{VIEW_LABELS[view]}</div>
          <div className="bm3d-view-dots">
            {VIEWS.map((v, i) => (
              <span key={v} className={`bm3d-dot ${i === viewIdx ? 'active' : ''}`} onClick={() => {
                if (i !== viewIdx) {
                  setTransDir(i > viewIdx ? 'next' : 'prev');
                  setTransitioning(true);
                  setTimeout(() => { setViewIdx(i); setTransitioning(false); }, 280);
                }
              }} />
            ))}
          </div>
        </div>
        <button
          className="bm3d-nav-btn"
          onClick={() => rotateView(1)}
          aria-label="Rotate right"
        >
          <svg width="14" height="14" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      <div
        className="bm3d-canvas"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { dragRef.current.dragging = false; setTooltip(null); }}
      >
        <div className={`bm3d-figure ${transitioning ? `bm3d-exit-${transDir}` : 'bm3d-enter'}`}>
          <svg viewBox="20 -8 160 270" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="bm3d-glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <linearGradient id="bm3d-body-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--sds-bg-surface-alt)" />
                <stop offset="100%" stopColor="var(--sds-border)" />
              </linearGradient>
              <linearGradient id="bm3d-sel-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#dc2626" />
              </linearGradient>
            </defs>
            {parts.map(p => {
              const isSel = selected.includes(p.id);
              return (
                <path
                  key={p.id}
                  d={p.d}
                  className={`bm3d-part ${isSel ? 'sel' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onToggle(p.id); }}
                  onPointerEnter={(e) => handlePartHover(e, p.id)}
                  onPointerMove={(e) => handlePartHover(e, p.id)}
                  onPointerLeave={() => setTooltip(null)}
                  fill={isSel ? 'url(#bm3d-sel-fill)' : 'url(#bm3d-body-fill)'}
                  filter={isSel ? 'url(#bm3d-glow)' : undefined}
                />
              );
            })}
          </svg>
        </div>
        <div className="bm3d-drag-hint">
          <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 8h10M6 5l-3 3 3 3M10 5l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Drag to rotate
        </div>
      </div>

      {tooltip && (
        <div className="bm3d-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.label}
        </div>
      )}

      {selected.length > 0 && (
        <div className="bm3d-tags">
          {selected.map(id => (
            <span key={id} className="bm3d-tag" onClick={() => onToggle(id)}>
              {PART_LABELS[id] || id}
              <svg width="10" height="10" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
