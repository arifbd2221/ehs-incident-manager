import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../api/dashboard';
import { listActiveStopWorks, acknowledgeStopWork } from '../api/stop_work';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import Icon from '../components/shared/Icon';
import { useAlert } from '../components/shared/Dialog';
import { TYPES, typeOf } from '../components/shared/Badges';
import { timeAgo, formatDate } from '../utils/time';
import { frameworkVisibility } from '../utils/frameworks';
import '../styles/dashboard.css';

/* ================================================================
 * WIDGET REGISTRY — each widget has an id, label, icon, default
 * visibility, and a "zone" (kpi | left | right) that determines
 * where it renders in the grid.
 * ================================================================ */
const DEFAULT_WIDGETS = [
  { id: 'kpi_trir',           label: 'TRIR',                icon: 'reports',       visible: true,  zone: 'kpi' },
  { id: 'kpi_dart',           label: 'DART',                icon: 'person',        visible: true,  zone: 'kpi' },
  { id: 'kpi_ltir',           label: 'LTIR',                icon: 'clock',         visible: true,  zone: 'kpi' },
  { id: 'kpi_severity',       label: 'Severity Rate',       icon: 'pulse',         visible: true,  zone: 'kpi' },
  { id: 'kpi_open',           label: 'Open Incidents',      icon: 'incidents',     visible: true,  zone: 'kpi' },
  { id: 'kpi_overdue',        label: 'Overdue CAPAs',       icon: 'warning',       visible: true,  zone: 'kpi' },
  // PM compliance (P3-OP1) — ISO 55001 standard metric. Visible by default;
  // the customize drawer lets users hide it if 7 KPIs in the row feels dense.
  { id: 'kpi_pm_compliance',  label: 'PM Compliance',       icon: 'gear',          visible: true,  zone: 'kpi' },
  { id: 'by_type',       label: 'Incidents by Type',   icon: 'dashboard',     visible: true, zone: 'left' },
  { id: 'track',         label: 'Track Routing',       icon: 'shield',        visible: true, zone: 'left' },
  { id: 'recent',        label: 'Recent Incidents',    icon: 'incidents',     visible: true, zone: 'left' },
  { id: 'activity',      label: 'Activity Feed',       icon: 'pulse',         visible: true, zone: 'right' },
  { id: 'quick_actions', label: 'Quick Actions',       icon: 'plus',          visible: true, zone: 'right' },
];

function mergeLayout(saved) {
  if (!saved?.widgets?.length) return DEFAULT_WIDGETS;
  const merged = [];
  const seen = new Set();
  for (const sw of saved.widgets) {
    const def = DEFAULT_WIDGETS.find(d => d.id === sw.id);
    if (def) {
      // KPI cards are sized for the KPI row only; their zone is fixed.
      // Left/right widgets can be moved between columns by the user, so we
      // honour the saved zone if it is one of the two main-grid columns.
      const savedZone = sw.zone === 'left' || sw.zone === 'right' ? sw.zone : null;
      const zone = def.zone === 'kpi' ? 'kpi' : (savedZone || def.zone);
      merged.push({ ...def, visible: sw.visible, zone });
      seen.add(sw.id);
    }
  }
  for (const d of DEFAULT_WIDGETS) {
    if (!seen.has(d.id)) merged.push(d);
  }
  return merged;
}

/* ================================================================
 * SUB-COMPONENTS
 * ================================================================ */
function useCountUp(end, duration = 800, decimals = 0) {
  const [val, setVal] = useState(0);
  const rafRef = useRef();
  useEffect(() => {
    if (end == null) return;
    const target = typeof end === 'number' ? end : parseFloat(end) || 0;
    if (target === 0) { setVal(0); return; }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(parseFloat((eased * target).toFixed(decimals)));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, duration, decimals]);
  return val;
}

function DonutChart({ data, size = 160, strokeWidth = 22 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-chart" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
        {data.map((d, i) => {
          const pct = d.value / total;
          const dashLen = pct * circumference;
          const dashOffset = -offset;
          offset += dashLen;
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={d.color} strokeWidth={strokeWidth}
              strokeDasharray={`${dashLen} ${circumference - dashLen}`}
              strokeDashoffset={dashOffset} strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dasharray 600ms cubic-bezier(0.4,0,0.2,1)' }}
            />
          );
        })}
      </svg>
      <div className="donut-center">
        <div className="num">{total}</div>
        <div className="lbl">Total</div>
      </div>
    </div>
  );
}

function MiniBar({ pct, color }) {
  return (
    <div style={{ height: 4, background: 'var(--sds-bg-surface-alt)', borderRadius: 4, flex: 1 }}>
      <div style={{ height: '100%', borderRadius: 4, background: color, width: `${Math.max(pct, 4)}%`, transition: 'width 500ms cubic-bezier(0.4,0,0.2,1)' }} />
    </div>
  );
}

function KpiValue({ value, decimals = 0 }) {
  const animated = useCountUp(value, 900, decimals);
  return <>{decimals > 0 ? animated.toFixed(decimals) : animated}</>;
}

const ACTION_MAP = {
  created: { icon: 'edit', cls: 'act-create' },
  classified: { icon: 'shield', cls: 'act-create' },
  escalated: { icon: 'investigation', cls: 'act-escalate' },
  closed: { icon: 'check', cls: 'act-close' },
  auto_closed: { icon: 'check', cls: 'act-close' },
  assigned: { icon: 'person', cls: 'act-assign' },
  notification: { icon: 'bell', cls: 'act-system' },
  verified: { icon: 'capa', cls: 'act-verify' },
  capa_assigned: { icon: 'capa', cls: 'act-assign' },
};

function statusClass(status) {
  const s = (status || '').toLowerCase().replace(/\s+/g, '-');
  if (s === 'investigating') return 'st-investigating';
  if (s === 'new') return 'st-new';
  if (s === 'triage') return 'st-triage';
  if (s.includes('capa')) return 'st-capa';
  if (s === 'closed') return 'st-closed';
  return 'st-new';
}

/* ================================================================
 * CUSTOMIZE DRAWER
 *
 * Live preview: the dashboard behind the drawer renders from the same
 * draft state, so toggles/reorders are visible immediately. Save commits;
 * Cancel/close discards.
 *
 * Drag-and-drop is pointer-based (not native HTML5 drag):
 *   - Items shift via translateY when others are being dragged over them
 *   - The dragged row lifts with a shadow + slight scale
 *   - Settle uses a spring curve; a 6px movement threshold rejects taps
 *   - Cross-zone drag is allowed between Main and Side columns; KPI is
 *     isolated because those cards are sized for the KPI strip
 * ================================================================ */
const SECTION_META = {
  kpi:   { name: 'KPI Row',     desc: 'Compact metrics across the top' },
  left:  { name: 'Main Column', desc: 'Primary content area' },
  right: { name: 'Side Column', desc: 'Supporting widgets on the right' },
};
const SECTION_ORDER = ['kpi', 'left', 'right'];

// Layout presets — applied to draftWidgets when a chip is clicked. Each
// returns a new widget array based on DEFAULT_WIDGETS so zones reset to
// their default columns too (a preset should fully reset, not layer).
const PRESETS = [
  {
    id: 'default',
    name: 'Default',
    desc: 'Everything on, default positions',
    apply: () => DEFAULT_WIDGETS.map(w => ({ ...w })),
  },
  {
    id: 'kpis_only',
    name: 'KPIs only',
    desc: 'Just the metric strip',
    apply: () => DEFAULT_WIDGETS.map(w => ({ ...w, visible: w.zone === 'kpi' })),
  },
  {
    id: 'minimal',
    name: 'Minimal',
    desc: 'TRIR, Open Incidents, Recent, Activity',
    apply: () => {
      const keep = new Set(['kpi_trir', 'kpi_open', 'recent', 'activity']);
      return DEFAULT_WIDGETS.map(w => ({ ...w, visible: keep.has(w.id) }));
    },
  },
];

function CustomizeDrawer({ widgets, baselineWidgets, onChange, onSave, onClose, saving }) {
  // drag = { fromIndex, toIndex, fromZone, toZone, startY, pointerY, height, started, pointerId }
  const [drag, setDrag] = useState(null);
  const [bouncing, setBouncing] = useState(null);   // widget id currently doing a toggle-bounce
  const [showDiscard, setShowDiscard] = useState(false);
  const [query, setQuery] = useState('');
  const rowRefs = useRef(new Map());       // flatIdx -> HTMLElement
  const emptyZoneRefs = useRef(new Map()); // zone -> HTMLElement (only mounted when zone has 0 rows)
  const listRef = useRef(null);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = (label) => !searching || label.toLowerCase().includes(q);

  // True when the draft differs from the last saved layout.
  const hasChanges = useMemo(() => {
    if (!baselineWidgets || widgets.length !== baselineWidgets.length) return false;
    for (let i = 0; i < widgets.length; i++) {
      const a = widgets[i];
      const b = baselineWidgets[i];
      if (a.id !== b.id || a.visible !== b.visible || a.zone !== b.zone) return true;
    }
    return false;
  }, [widgets, baselineWidgets]);

  // Anything that would close the drawer goes through this so we can
  // intercept and show a discard-confirm when there are unsaved changes.
  const attemptClose = useCallback(() => {
    if (hasChanges) setShowDiscard(true);
    else onClose();
  }, [hasChanges, onClose]);

  const setRowRef = (idx) => (el) => {
    if (el) rowRefs.current.set(idx, el);
    else rowRefs.current.delete(idx);
  };
  const setEmptyZoneRef = (zone) => (el) => {
    if (el) emptyZoneRefs.current.set(zone, el);
    else emptyZoneRefs.current.delete(zone);
  };

  // Computes the flat-array insertion index for a widget being dropped
  // into an empty Main or Side column.
  const insertIdxForEmptyZone = (zone) => {
    if (zone === 'left') {
      const firstRight = widgets.findIndex(w => w.zone === 'right');
      return firstRight >= 0 ? firstRight : widgets.length;
    }
    return widgets.length; // 'right' goes to the end
  };

  // Group widgets by zone, preserving flat-array order within each.
  const sections = useMemo(() => {
    const out = { kpi: [], left: [], right: [] };
    widgets.forEach((w, idx) => {
      if (out[w.zone]) out[w.zone].push({ ...w, flatIdx: idx });
    });
    return out;
  }, [widgets]);

  const toggle = (id) => {
    onChange(widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
    setBouncing(id);
    setTimeout(() => setBouncing(prev => (prev === id ? null : prev)), 320);
  };

  // Close on Escape so the user always has an escape route. Escape from
  // the discard sheet dismisses the sheet, not the drawer.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (showDiscard) setShowDiscard(false);
      else attemptClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attemptClose, showDiscard]);

  // Apply a preset's visibility/zone profile to the draft. The user still
  // has to hit Save for it to persist.
  const applyPreset = (preset) => {
    onChange(preset.apply());
    setQuery('');
  };

  // Keyboard nav on the row list: arrows move focus row-by-row across
  // sections in DOM order, Space toggles the currently focused row.
  const handleListKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== ' ') return;
    const rows = Array.from(listRef.current?.querySelectorAll('.cust-item') || []);
    if (rows.length === 0) return;
    const active = document.activeElement;
    const currentIdx = rows.indexOf(active);
    if (e.key === ' ') {
      if (currentIdx >= 0) {
        e.preventDefault();
        const id = rows[currentIdx].dataset.widgetId;
        if (id) toggle(id);
      }
      return;
    }
    e.preventDefault();
    let nextIdx;
    if (currentIdx < 0) nextIdx = 0;
    else if (e.key === 'ArrowDown') nextIdx = Math.min(currentIdx + 1, rows.length - 1);
    else nextIdx = Math.max(currentIdx - 1, 0);
    rows[nextIdx]?.focus();
  };

  // Pick the row whose center is nearest the pointer Y. Respects zone rules:
  // KPI rows can only target KPI; Main/Side rows can target each other or
  // an empty-zone placeholder.
  const computeTarget = (pointerY, fromIdx) => {
    const fromZone = widgets[fromIdx].zone;
    const kpiOnly = fromZone === 'kpi';

    let bestIdx = fromIdx;
    let bestZone = fromZone;
    let bestDist = Infinity;

    rowRefs.current.forEach((el, idx) => {
      if (idx === fromIdx) return;
      const zone = widgets[idx].zone;
      if (kpiOnly && zone !== 'kpi') return;
      if (!kpiOnly && zone === 'kpi') return;
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const dist = Math.abs(pointerY - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
        bestZone = zone;
      }
    });

    // Empty-zone placeholders are valid drop targets for Main/Side widgets
    // so a user can refill a column they previously drained.
    if (!kpiOnly) {
      emptyZoneRefs.current.forEach((el, zone) => {
        if (zone === 'kpi' || zone === fromZone) return;
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(pointerY - center);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = insertIdxForEmptyZone(zone);
          bestZone = zone;
        }
      });
    }

    return { idx: bestIdx, zone: bestZone };
  };

  const handlePointerDown = (e, idx) => {
    if (e.target.closest('.cust-toggle')) return;
    const row = e.currentTarget;
    const rect = row.getBoundingClientRect();
    row.setPointerCapture(e.pointerId);
    setDrag({
      fromIndex: idx,
      toIndex: idx,
      fromZone: widgets[idx].zone,
      toZone: widgets[idx].zone,
      startY: e.clientY,
      pointerY: e.clientY,
      height: rect.height + 4, // include 4px row gap
      started: false,
      pointerId: e.pointerId,
    });
  };

  const handlePointerMove = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.startY;
    if (!drag.started && Math.abs(dy) < 6) return;
    const target = computeTarget(e.clientY, drag.fromIndex);
    setDrag(prev => prev ? {
      ...prev,
      started: true,
      pointerY: e.clientY,
      toIndex: target.idx,
      toZone: target.zone,
    } : null);
  };

  const handlePointerUp = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.started && (drag.fromIndex !== drag.toIndex || drag.fromZone !== drag.toZone)) {
      const next = [...widgets];
      const [moved] = next.splice(drag.fromIndex, 1);
      // After removal, indices > fromIndex shift down by 1.
      const adjustedTo = drag.toIndex > drag.fromIndex ? drag.toIndex - 1 : drag.toIndex;
      next.splice(adjustedTo, 0, { ...moved, zone: drag.toZone });
      onChange(next);
    }
    setDrag(null);
  };

  // Visual offset for non-dragged rows so the list opens space for the
  // dragged row and closes the gap it left behind.
  const rowOffset = (idx) => {
    if (!drag || !drag.started || idx === drag.fromIndex) return 0;
    const { fromIndex, toIndex, fromZone, toZone, height } = drag;
    const rowZone = widgets[idx].zone;

    if (fromZone === toZone) {
      // Same-zone reorder
      if (rowZone !== fromZone) return 0;
      if (fromIndex < toIndex && idx > fromIndex && idx <= toIndex) return -height;
      if (fromIndex > toIndex && idx < fromIndex && idx >= toIndex) return height;
      return 0;
    }

    // Cross-zone: source rows after fromIndex close the gap; target rows
    // at or after toIndex open a gap for the incoming row.
    if (rowZone === fromZone && idx > fromIndex) return -height;
    if (rowZone === toZone && idx >= toIndex) return height;
    return 0;
  };

  const reset = () => onChange(DEFAULT_WIDGETS);
  const visibleCount = widgets.filter(w => w.visible).length;
  const activeZone = drag?.started ? drag.toZone : null;

  // Detect whether any section has at least one matching row.
  const anyMatches = !searching || SECTION_ORDER.some(zone =>
    sections[zone].some(item => matches(item.label))
  );

  return createPortal(
    <div className="cust-backdrop cust-backdrop-live" onClick={attemptClose}>
      <div className="cust-drawer" onClick={e => e.stopPropagation()}>
        <div className="cust-header">
          <div>
            <div className="cust-title">Customize Dashboard</div>
            <div className="cust-sub">Changes preview live — Save to keep them</div>
          </div>
          <button className="icon-btn" onClick={attemptClose}><Icon name="close" size={18} /></button>
        </div>

        {/* Search + presets */}
        <div className="cust-tools">
          <div className="cust-search">
            <Icon name="search" size={14} />
            <input
              type="text"
              placeholder="Search widgets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search widgets"
            />
            {query && (
              <button
                className="cust-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
          <div className="cust-presets">
            {PRESETS.map(p => (
              <button
                key={p.id}
                className="cust-preset"
                onClick={() => applyPreset(p)}
                title={p.desc}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div
          className="cust-list"
          ref={listRef}
          onKeyDown={handleListKeyDown}
        >
          {!anyMatches && (
            <div className="cust-no-matches">
              <Icon name="search" size={20} />
              <div className="cust-no-matches-t">No widgets match "{query}"</div>
              <button className="btn btn-tertiary btn-sm" onClick={() => setQuery('')}>Clear search</button>
            </div>
          )}
          {anyMatches && SECTION_ORDER.map(zone => {
            const items = sections[zone];
            const filtered = searching ? items.filter(i => matches(i.label)) : items;
            if (searching && filtered.length === 0) return null;
            const visible = items.filter(i => i.visible).length;
            const meta = SECTION_META[zone];
            const isActiveTarget = activeZone === zone && drag?.fromZone !== zone;
            return (
              <div key={zone} className={`cust-section cust-section-${zone}${isActiveTarget ? ' cust-section-active' : ''}`}>
                <div className="cust-section-h">
                  <div className="cust-section-name">{meta.name}</div>
                  <div className="cust-section-meta">
                    <span className="cust-section-count">{visible} of {items.length}</span>
                  </div>
                </div>
                <div className="cust-section-desc">{meta.desc}</div>
                <div className="cust-section-rows">
                  {!searching && items.length === 0 && (
                    <div
                      ref={setEmptyZoneRef(zone)}
                      className={`cust-section-empty${isActiveTarget ? ' cust-section-empty-active' : ''}`}
                    >
                      Drop a widget here
                    </div>
                  )}
                  {filtered.map((item, i) => {
                    const idx = item.flatIdx;
                    const isDragging = drag?.started && idx === drag.fromIndex;
                    const ty = isDragging ? (drag.pointerY - drag.startY) : rowOffset(idx);
                    // Stagger entrance per section (cap at 8 rows so a long
                    // KPI list doesn't drag the last item in much later).
                    const enterDelay = `${Math.min(i, 7) * 40}ms`;
                    return (
                      <div
                        key={item.id}
                        ref={setRowRef(idx)}
                        data-widget-id={item.id}
                        tabIndex={0}
                        className={`cust-item${item.visible ? '' : ' cust-hidden'}${isDragging ? ' cust-dragging' : ''}`}
                        style={{
                          transform: `translateY(${ty}px)${isDragging ? ' scale(1.02)' : ''}`,
                          transition: isDragging
                            ? 'none'
                            : 'transform 320ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 200ms ease, background 180ms ease',
                          zIndex: isDragging ? 10 : 1,
                          animationDelay: enterDelay,
                        }}
                        onPointerDown={(e) => handlePointerDown(e, idx)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                      >
                        <div className="cust-grip"><Icon name="sort" size={14} /></div>
                        <div className="cust-icon"><Icon name={item.icon} size={14} /></div>
                        <span className="cust-label">{item.label}</span>
                        <button
                          className={`cust-toggle${item.visible ? ' on' : ''}${bouncing === item.id ? ' cust-toggle-pop' : ''}`}
                          onClick={() => toggle(item.id)}
                          onPointerDown={(e) => e.stopPropagation()}
                          aria-label={item.visible ? `Hide ${item.label}` : `Show ${item.label}`}
                        >
                          <span className="cust-toggle-dot" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="cust-footer">
          <button className="btn btn-tertiary btn-sm" onClick={reset}>
            <Icon name="close" size={14} />Reset to default
          </button>
          <div style={{ flex: 1 }} />
          <span className="cust-count">{visibleCount} of {widgets.length} visible</span>
          <button className="btn btn-secondary btn-sm" onClick={attemptClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || !hasChanges}>
            {saving ? 'Saving...' : 'Save layout'}
          </button>
        </div>

        {showDiscard && (
          <div className="cust-discard-sheet" onClick={e => e.stopPropagation()}>
            <div className="cust-discard-icon"><Icon name="warning" size={24} /></div>
            <div className="cust-discard-title">Discard changes?</div>
            <div className="cust-discard-body">You have unsaved changes to your dashboard layout. They will be lost.</div>
            <div className="cust-discard-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDiscard(false)}>Keep editing</button>
              <button className="btn btn-danger btn-sm" onClick={() => { setShowDiscard(false); onClose(); }}>Discard</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ================================================================
 * DASHBOARD
 * ================================================================ */
export default function Dashboard() {
  const navigate = useNavigate();
  const alertDialog = useAlert();
  const { user, saveDashLayout } = useAuth();
  const { showOsha, showRiddor } = frameworkVisibility(user);
  const { setWizardOpen, refreshKey } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStopWorks, setActiveStopWorks] = useState([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftWidgets, setDraftWidgets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const widgets = useMemo(() => mergeLayout(user?.dashboard_layout), [user?.dashboard_layout]);

  const loadStopWorks = useCallback(() => {
    listActiveStopWorks().then(setActiveStopWorks).catch(() => setActiveStopWorks([]));
  }, []);

  useEffect(() => {
    getDashboard().then(setData).catch(() => {}).finally(() => setLoading(false));
    loadStopWorks();
  }, [refreshKey, loadStopWorks]);

  const openDrawer = () => { setDraftWidgets([...widgets]); setDrawerOpen(true); };
  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDashLayout(draftWidgets.map(w => ({ id: w.id, visible: w.visible, zone: w.zone })));
      setDrawerOpen(false);
      setSavedToast(true);
    } catch { }
    setSaving(false);
  };

  // Auto-dismiss the "Layout saved" toast.
  useEffect(() => {
    if (!savedToast) return;
    const t = setTimeout(() => setSavedToast(false), 2600);
    return () => clearTimeout(t);
  }, [savedToast]);

  const elevated = ['supervisor', 'ehs_officer', 'ehs_manager', 'admin'].includes(user?.role);
  const [ackingId, setAckingId] = useState(null);
  const [bannerExiting, setBannerExiting] = useState(false);
  const handleAcknowledge = async (id) => {
    setAckingId(id);
    try {
      await acknowledgeStopWork(id);
      const isLast = activeStopWorks.length === 1;
      if (isLast) {
        await new Promise(r => setTimeout(r, 700));
        setBannerExiting(true);
        await new Promise(r => setTimeout(r, 450));
        setBannerExiting(false);
      } else {
        await new Promise(r => setTimeout(r, 800));
      }
      loadStopWorks();
    } catch (e) {
      await alertDialog({
        title: "Couldn't acknowledge stop work",
        body: e.response?.data?.error || 'Acknowledge failed',
        tone: 'error',
      });
    }
    setAckingId(null);
  };

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #f1f5f9', borderTopColor: 'var(--sds-brand-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)', fontWeight: 500 }}>Loading dashboard...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center' }}>
          <Icon name="warning" size={32} color="var(--sds-fg-tertiary)" />
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>Failed to load dashboard</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const { kpis, incidentsByType, recentIncidents, recentActivity } = data;
  const tc = kpis.trackCounts || {};
  const totalOpen = (tc.A || 0) + (tc.B || 0) + (tc.C || 0);

  const firstName = (user?.name || 'there').split(' ')[0];
  const now = new Date();
  const hour = now.getHours();
  const greetWord = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const donutData = (incidentsByType || []).map(({ type, count }) => ({
    value: count,
    color: typeOf(type)?.color || '#94a3b8',
    name: typeOf(type)?.name || type,
  }));

  const totalIncidents = donutData.reduce((s, d) => s + d.value, 0);
  const trirTarget = 2.5;
  const trirOk = (kpis.trir || 0) <= trirTarget;

  const oshaCount = showOsha ? (recentIncidents || []).filter(r => r.osha_recordable).length : 0;
  const riddorCount = showRiddor ? (recentIncidents || []).filter(r => r.riddor_reportable).length : 0;

  // Live-preview source: while the drawer is open we mirror the draft so
  // toggles/reorders are visible behind the drawer. Hidden widgets stay
  // mounted but get a ghost overlay; saving filters them out for real.
  const previewSource = drawerOpen ? draftWidgets : widgets;
  const includeAll = drawerOpen;
  const kpiWidgets = previewSource.filter(w => w.zone === 'kpi' && (includeAll || w.visible));
  const leftWidgets = previewSource.filter(w => w.zone === 'left' && (includeAll || w.visible));
  const rightWidgets = previewSource.filter(w => w.zone === 'right' && (includeAll || w.visible));
  const slotClass = (w) => `dash-slot${drawerOpen && !w.visible ? ' dash-slot-ghost' : ''}`;
  // In preview mode, show an empty-zone placeholder if a column has been
  // fully drained by cross-zone drag — gives the user a visible target.
  const leftEmptyPreview = drawerOpen && leftWidgets.length === 0;
  const rightEmptyPreview = drawerOpen && rightWidgets.length === 0;
  const renderLeftCol = leftWidgets.length > 0 || leftEmptyPreview;
  const renderRightCol = rightWidgets.length > 0 || rightEmptyPreview;

  const renderWidget = (id) => {
    switch (id) {
      case 'kpi_trir':
        return (
          <div className="kpi-card kpi-trir kpi-clickable" onClick={() => navigate('/reports')}>
            <div className="kpi-top">
              <div className="kpi-label">TRIR &middot; YTD</div>
              <div className="kpi-icon"><Icon name="reports" size={18} /></div>
            </div>
            <div className="kpi-val"><KpiValue value={kpis.trir || 0} decimals={2} /></div>
            <div className="kpi-foot">
              <span className={`kpi-target ${trirOk ? 'good' : 'bad'}`}>
                {trirOk ? '✓' : '↑'} Target {trirTarget.toFixed(2)}
              </span>
            </div>
          </div>
        );
      case 'kpi_dart':
        return (
          <div className="kpi-card kpi-dart kpi-clickable" onClick={() => navigate('/reports')}>
            <div className="kpi-top">
              <div className="kpi-label">DART &middot; YTD</div>
              <div className="kpi-icon"><Icon name="person" size={18} /></div>
            </div>
            <div className="kpi-val"><KpiValue value={kpis.dart || 0} decimals={2} /></div>
            <div className="kpi-foot">{kpis.dartCases || 0} {kpis.dartCases === 1 ? 'DART case' : 'DART cases'}</div>
          </div>
        );
      case 'kpi_ltir':
        return (
          <div className="kpi-card kpi-dart kpi-clickable" onClick={() => navigate('/reports')}>
            <div className="kpi-top">
              <div className="kpi-label">LTIR &middot; YTD</div>
              <div className="kpi-icon"><Icon name="clock" size={18} /></div>
            </div>
            <div className="kpi-val"><KpiValue value={kpis.ltir || 0} decimals={2} /></div>
            <div className="kpi-foot">{kpis.daysAwayCases || 0} days-away {kpis.daysAwayCases === 1 ? 'case' : 'cases'}</div>
          </div>
        );
      case 'kpi_severity':
        return (
          <div className="kpi-card kpi-overdue kpi-clickable" onClick={() => navigate('/reports')}>
            <div className="kpi-top">
              <div className="kpi-label">Severity Rate &middot; YTD</div>
              <div className="kpi-icon"><Icon name="pulse" size={18} /></div>
            </div>
            <div className="kpi-val"><KpiValue value={kpis.severityRate || 0} decimals={2} /></div>
            <div className="kpi-foot">{kpis.totalDaysAway || 0} {kpis.totalDaysAway === 1 ? 'day' : 'days'} away</div>
          </div>
        );
      case 'kpi_open':
        return (
          <div className="kpi-card kpi-open kpi-clickable" onClick={() => navigate('/incidents')}>
            <div className="kpi-top">
              <div className="kpi-label">Open incidents</div>
              <div className="kpi-icon"><Icon name="incidents" size={18} /></div>
            </div>
            <div className="kpi-val"><KpiValue value={kpis.openIncidents || 0} /></div>
            <div className="kpi-foot">
              <span className="kpi-track-group"><span className="kpi-track-count" style={{ color: 'var(--sds-error)' }}>{tc.A || 0}</span> A</span>
              <span className="kpi-track-sep">&middot;</span>
              <span className="kpi-track-group"><span className="kpi-track-count" style={{ color: 'var(--sds-warning)' }}>{tc.B || 0}</span> B</span>
              <span className="kpi-track-sep">&middot;</span>
              <span className="kpi-track-group"><span className="kpi-track-count" style={{ color: 'var(--sds-success)' }}>{tc.C || 0}</span> C</span>
            </div>
          </div>
        );
      case 'kpi_overdue':
        return (
          <div className="kpi-card kpi-overdue kpi-clickable" onClick={() => navigate('/capas')}>
            <div className="kpi-top">
              <div className="kpi-label">Overdue CAPAs</div>
              <div className="kpi-icon"><Icon name="warning" size={18} /></div>
            </div>
            <div className="kpi-val"><KpiValue value={kpis.overdueCAPAs || 0} /></div>
            <div className="kpi-foot">
              {kpis.overdueCAPAs > 0
                ? <span className="kpi-target bad">Needs attention</span>
                : <span className="kpi-target good">All on track</span>}
            </div>
          </div>
        );
      case 'kpi_pm_compliance': {
        // ISO 55001 PM-compliance ratio over the trailing 90 days; null when
        // there's no completion history yet (acme/empty tenants).
        const hasData = kpis.pmCompliancePct != null;
        const onTime = kpis.pmOnTimeLast90 || 0;
        const total = kpis.pmEventsLast90 || 0;
        const overdue = kpis.maintenanceOverdueCount || 0;
        const accent = hasData && kpis.pmCompliancePct >= 90 ? 'kpi-dart' : 'kpi-overdue';
        return (
          <div className={`kpi-card ${accent} kpi-clickable`} onClick={() => navigate('/maintenance')}>
            <div className="kpi-top">
              <div className="kpi-label">PM Compliance · 90d</div>
              <div className="kpi-icon"><Icon name="gear" size={18} /></div>
            </div>
            <div className="kpi-val">
              {hasData ? <><KpiValue value={kpis.pmCompliancePct} />%</> : '—'}
            </div>
            <div className="kpi-foot">
              {hasData
                ? `${onTime} of ${total} on time`
                : 'No completions recorded yet'}
              {overdue > 0 && (
                <>
                  <span style={{ color: 'var(--sds-border)' }}>&middot;</span>
                  <span className="kpi-target bad">{overdue} overdue</span>
                </>
              )}
            </div>
          </div>
        );
      }
      case 'by_type':
        return (
          <div className="dash-card">
            <div className="dash-card-h">
              <div className="title"><span className="dot-accent" />Incidents by type</div>
              <span className="link" onClick={() => navigate('/incidents')}>View all <Icon name="arrow" size={14} /></span>
            </div>
            <div className="donut-section">
              <DonutChart data={donutData} size={140} strokeWidth={20} />
              <div className="donut-legend">
                {donutData.map((d, i) => (
                  <div className="donut-legend-item" key={i}>
                    <span className="swatch" style={{ background: d.color }} />
                    <span className="name">{d.name}</span>
                    <MiniBar pct={(d.value / totalIncidents) * 100} color={d.color} />
                    <span className="count">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'track':
        return (
          <div className="dash-card">
            <div className="dash-card-h">
              <div className="title"><span className="dot-accent" />Track routing</div>
              <span className="link" onClick={() => navigate('/incidents')}>View all <Icon name="arrow" size={14} /></span>
            </div>
            <div className="track-list">
              <div className="track-row t-a" onClick={() => navigate('/incidents?track=A')}>
                <div className="track-letter">A</div>
                <div className="track-info">
                  <div className="track-name">Full investigation</div>
                  <div className="track-desc">Severity 1–2 &middot; Critical &amp; major incidents</div>
                </div>
                <div className="track-bar-wrap">
                  <div className="track-bar" style={{ width: `${totalOpen ? ((tc.A || 0) / totalOpen) * 100 : 0}%` }} />
                </div>
                <div className="track-count">{tc.A || 0}</div>
              </div>
              <div className="track-row t-b" onClick={() => navigate('/incidents?track=B')}>
                <div className="track-letter">B</div>
                <div className="track-info">
                  <div className="track-name">Light investigation</div>
                  <div className="track-desc">Severity 3 &middot; Moderate risk</div>
                </div>
                <div className="track-bar-wrap">
                  <div className="track-bar" style={{ width: `${totalOpen ? ((tc.B || 0) / totalOpen) * 100 : 0}%` }} />
                </div>
                <div className="track-count">{tc.B || 0}</div>
              </div>
              <div className="track-row t-c" onClick={() => navigate('/incidents?track=C')}>
                <div className="track-letter">C</div>
                <div className="track-info">
                  <div className="track-name">Log &amp; close</div>
                  <div className="track-desc">Severity 4–5 &middot; Minor / observation</div>
                </div>
                <div className="track-bar-wrap">
                  <div className="track-bar" style={{ width: `${totalOpen ? ((tc.C || 0) / totalOpen) * 100 : 0}%` }} />
                </div>
                <div className="track-count">{tc.C || 0}</div>
              </div>
            </div>
            {(oshaCount > 0 || riddorCount > 0) && (
              <div className="reg-alerts">
                {oshaCount > 0 && (
                  <div className="reg-alert osha">
                    <span className="reg-badge">OSHA</span>
                    <span className="reg-text"><b>{oshaCount}</b> recordable {oshaCount === 1 ? 'case' : 'cases'} in recent incidents</span>
                  </div>
                )}
                {riddorCount > 0 && (
                  <div className="reg-alert riddor">
                    <span className="reg-badge">RIDDOR</span>
                    <span className="reg-text"><b>{riddorCount}</b> reportable {riddorCount === 1 ? 'event' : 'events'} requiring HSE notification</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 'recent':
        return (
          <div className="dash-card">
            <div className="dash-card-h">
              <div className="title"><span className="dot-accent" />Recent incidents</div>
              <span className="link" onClick={() => navigate('/incidents')}>All incidents <Icon name="arrow" size={14} /></span>
            </div>
            <div className="incident-feed">
              {(recentIncidents || []).map(r => (
                <div className="inc-row" key={r.id} onClick={() => navigate(`/incidents/${r.id}`)}>
                  <div className={`inc-sev-ring s${r.severity}`}>S{r.severity}</div>
                  <div className="inc-info">
                    <div className="inc-title">{r.title}</div>
                    <div className="inc-meta">
                      <span style={{ fontFamily: "'SF Mono', Menlo, monospace", fontWeight: 600, fontSize: 10, color: 'var(--sds-fg-tertiary)' }}>{r.incident_number}</span>
                      <span className="sep">&middot;</span>
                      {r.site_name}
                      {r.area && <><span className="sep">&middot;</span>{r.area}</>}
                      <span className="sep">&middot;</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: typeOf(r.type)?.color || '#94a3b8' }} />
                        {typeOf(r.type)?.name || r.type}
                      </span>
                    </div>
                  </div>
                  <div className="inc-right">
                    <span className={`inc-status ${statusClass(r.status)}`}>{r.status}</span>
                    <span className="inc-time">{timeAgo(r.created_at)}</span>
                  </div>
                </div>
              ))}
              {(!recentIncidents || recentIncidents.length === 0) && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--sds-fg-tertiary)', fontSize: 13 }}>No recent incidents</div>
              )}
            </div>
          </div>
        );
      case 'activity':
        return (
          <div className="dash-card" style={{ flex: 1 }}>
            <div className="dash-card-h">
              <div className="title"><span className="dot-accent" />Activity</div>
              <span style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)', fontWeight: 600 }}>Last 7 days</span>
            </div>
            <div className="activity-feed">
              {(recentActivity || []).map((e, i) => {
                const mapped = ACTION_MAP[e.action] || { icon: 'bell', cls: 'act-system' };
                return (
                  <div className="act-item" key={i}>
                    <div className={`act-dot ${mapped.cls}`}>
                      <Icon name={mapped.icon} size={16} />
                    </div>
                    <div className="act-body">
                      <div className="act-who">{e.user_name || 'System'}</div>
                      <div className="act-desc">{e.description}</div>
                      <div className="act-when">{timeAgo(e.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              {(!recentActivity || recentActivity.length === 0) && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--sds-fg-tertiary)', fontSize: 12 }}>No recent activity</div>
              )}
            </div>
          </div>
        );
      case 'quick_actions':
        return (
          <div className="dash-card">
            <div className="dash-card-h">
              <div className="title"><span className="dot-accent" />Quick actions</div>
            </div>
            <div className="dash-qa-list">
              {[
                { label: 'Report new incident', icon: 'plus', action: () => setWizardOpen(true), color: 'var(--sds-brand-primary)' },
                { label: 'View investigations', icon: 'investigation', action: () => navigate('/investigations'), color: '#f59e0b' },
                { label: 'CAPA board', icon: 'capa', action: () => navigate('/capas'), color: '#22c55e' },
                { label: 'OSHA / RIDDOR reports', icon: 'reports', action: () => navigate('/reports'), color: '#0ea5e9' },
              ].map((qa, i) => (
                <button key={i} className="dash-qa-btn" style={{ '--qa-color': qa.color }} onClick={qa.action}>
                  <span className="dash-qa-icon"><Icon name={qa.icon} size={15} /></span>
                  {qa.label}
                  <Icon name="arrow" size={14} />
                </button>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page">
      {activeStopWorks.length > 0 && (
        <div className={`dash-stopwork-banner${bannerExiting ? ' sw-banner-exit' : ''}`}>
          <div className="dash-stopwork-icon"><Icon name="warning" size={22} color="#fff" /></div>
          <div className="dash-stopwork-body">
            <div className="dash-stopwork-title">
              {activeStopWorks.length === 1 ? 'ACTIVE STOP-WORK' : `${activeStopWorks.length} ACTIVE STOP-WORKS`}
            </div>
            <div className="dash-stopwork-list">
              {activeStopWorks.map((sw) => (
                <div
                  key={sw.id}
                  className={`dash-stopwork-row${ackingId === sw.id ? ' sw-row-ack' : ''}`}
                  onClick={() => navigate(`/incidents/${sw.id}`)}
                >
                  {ackingId === sw.id ? (
                    <div className="sw-ack-content">
                      <span className="sw-ack-circle">
                        <Icon name="check" size={13} color="#fff" />
                      </span>
                      <span className="sw-ack-text">Acknowledged</span>
                    </div>
                  ) : (
                    <>
                      <span className="dash-stopwork-num">{sw.incident_number}</span>
                      <span> — </span>
                      <span>{sw.area} · {sw.site_name || ''}</span>
                      {elevated && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ marginLeft: 'auto', background: '#fff', color: 'var(--sds-error)', borderColor: '#fff' }}
                          onClick={(e) => { e.stopPropagation(); handleAcknowledge(sw.id); }}
                          disabled={ackingId !== null}
                        >
                          Acknowledge
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="dash-hero">
        <div>
          <div className="greeting">{greetWord}, <span>{firstName}</span></div>
          <div className="date-strip">
            <span className="live-dot" />
            Live overview &middot; {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-tertiary btn-sm" onClick={openDrawer}>
            <Icon name="gear" size={15} />Customize
          </button>
          <button className="btn btn-tertiary btn-sm" onClick={() => navigate('/reports')}>
            <Icon name="reports" size={15} />Reports
          </button>
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            <Icon name="plus" size={16} />Report incident
          </button>
        </div>
      </div>

      {/* KPI Row */}
      {kpiWidgets.length > 0 && (
        <div className="kpi-row" style={{ gridTemplateColumns: `repeat(${kpiWidgets.length}, 1fr)` }}>
          {kpiWidgets.map(w => (
            <div key={w.id} className={slotClass(w)}>{renderWidget(w.id)}</div>
          ))}
        </div>
      )}

      {/* Main grid */}
      {(renderLeftCol || renderRightCol) && (
        <div
          className="dash-grid"
          style={!renderRightCol ? { gridTemplateColumns: '1fr' } : !renderLeftCol ? { gridTemplateColumns: '1fr' } : undefined}
        >
          {renderLeftCol && (
            <div className="dash-left">
              {leftEmptyPreview ? (
                <div className="dash-zone-empty">
                  <Icon name="plus" size={18} />
                  <div className="dash-zone-empty-t">Main column is empty</div>
                  <div className="dash-zone-empty-s">Drag a widget here from the customize drawer</div>
                </div>
              ) : (() => {
                const byType = leftWidgets.find(w => w.id === 'by_type');
                const track = leftWidgets.find(w => w.id === 'track');
                const others = leftWidgets.filter(w => w.id !== 'by_type' && w.id !== 'track');
                return (
                  <>
                    {byType && track ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div className={slotClass(byType)}>{renderWidget('by_type')}</div>
                        <div className={slotClass(track)}>{renderWidget('track')}</div>
                      </div>
                    ) : (
                      <>
                        {byType && <div className={slotClass(byType)}>{renderWidget('by_type')}</div>}
                        {track && <div className={slotClass(track)}>{renderWidget('track')}</div>}
                      </>
                    )}
                    {others.map(w => (
                      <div key={w.id} className={slotClass(w)}>{renderWidget(w.id)}</div>
                    ))}
                  </>
                );
              })()}
            </div>
          )}
          {renderRightCol && (
            <div className="dash-right">
              {rightEmptyPreview ? (
                <div className="dash-zone-empty">
                  <Icon name="plus" size={18} />
                  <div className="dash-zone-empty-t">Side column is empty</div>
                  <div className="dash-zone-empty-s">Drag a widget here from the customize drawer</div>
                </div>
              ) : (
                rightWidgets.map(w => (
                  <div key={w.id} className={slotClass(w)}>{renderWidget(w.id)}</div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Customize drawer */}
      {drawerOpen && (
        <CustomizeDrawer
          widgets={draftWidgets}
          baselineWidgets={widgets}
          onChange={setDraftWidgets}
          onSave={handleSave}
          onClose={() => setDrawerOpen(false)}
          saving={saving}
        />
      )}

      {/* Save-success toast */}
      {savedToast && createPortal(
        <div className="dash-saved-toast" role="status" aria-live="polite">
          <svg className="dash-saved-toast-check" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Layout saved
        </div>,
        document.body
      )}
    </div>
  );
}
