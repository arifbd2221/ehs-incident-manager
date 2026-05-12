import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getOsha300, getOsha300A, getOsha301, getRiddor, getMetrics, getAuditLog, getAuditActions, createOsha300Entry } from '../../api/reports';
import { listSafeworkNsw, getSafeworkNswLookups } from '../../api/safework_nsw';
import { getSites, getUsers } from '../../api/users';
import { getIncidents } from '../../api/incidents';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import DatePicker from '../../components/shared/DatePicker';
import CertifyOsha300AModal from '../../components/modals/CertifyOsha300AModal';
import { formatDateShort, formatDate } from '../../utils/time';
import { riddorCategoryLabel, riddorCategoryReg } from '../../utils/riddor';
import '../../styles/reports.css';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
// Audit log is narrower than ELEVATED — compliance/upper-management only.
// Mirrors AUDIT_ROLES on the BE; supervisors are intentionally excluded.
const AUDIT_ROLES = new Set(['ehs_officer', 'ehs_manager', 'admin']);

// `requiresFramework` gates a regulator-specific card on the org's
// compliance_frameworks selection (set during P3-O1 sign-up). A RIDDOR-only
// org shouldn't see OSHA cards. Cards without `requiresFramework` (Metrics,
// Audit Log) are universal/internal and always visible.
const REPORT_TYPES = [
  { id: 'osha300',  cls: 'rt-osha300',  badge: 'OSHA · US',        title: 'OSHA 300 Log',       desc: 'Running log of recordable injuries & illnesses.',                  requiresFramework: 'osha_300' },
  { id: 'osha300a', cls: 'rt-osha300a', badge: 'OSHA · US',        title: 'OSHA 300A Summary',  desc: 'Annual summary, posted Feb 1 – Apr 30.',                            requiresFramework: 'osha_300a' },
  { id: 'osha301',  cls: 'rt-osha301',  badge: 'OSHA · US',        title: 'OSHA 301 Form',      desc: 'Individual incident report (per 29 CFR 1904.29).',                  requiresFramework: 'osha_301' },
  { id: 'riddor',   cls: 'rt-riddor',   badge: 'HSE · UK',         title: 'RIDDOR F2508',       desc: 'Event-triggered to HSE. Sheffield site only.',                      requiresFramework: 'riddor_f2508' },
  { id: 'safework_nsw', cls: 'rt-safework', badge: 'SafeWork · NSW · AU', title: 'SafeWork NSW Notifications', desc: 'Notifiable incidents under WHS Act 2011 (NSW) ss.35–39.',     requiresFramework: 'safework_nsw' },
  { id: 'metrics',  cls: 'rt-metrics',  badge: 'Internal',         title: 'Safety Metrics',     desc: 'TRIR, DART, severity rate.' },
  { id: 'audit',    cls: 'rt-audit',    badge: 'Internal · Audit', title: 'Audit Log',          desc: 'Filterable trail of every change. Export for inspector requests.', requiresAudit: true },
];

function ReportLoading() {
  return (
    <div className="rpt-panel">
      <div className="rpt-loading">
        <div className="rpt-loading-bar"><div className="rpt-loading-fill"/></div>
        <div className="rpt-loading-text">Loading report data...</div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const canSeeAudit = AUDIT_ROLES.has(user?.role);

  // Org's compliance frameworks gate which regulator-specific cards appear.
  // Defensive fallback: if the field is missing (legacy users created before
  // migration 017, or a JWT minted before the field was added), treat it as
  // "no filter" so we don't accidentally hide every regulator card.
  const frameworks = Array.isArray(user?.compliance_frameworks) ? user.compliance_frameworks : null;
  const visibleReports = useMemo(() => REPORT_TYPES.filter(r => {
    if (r.requiresAudit && !canSeeAudit) return false;
    if (r.requiresFramework && frameworks && !frameworks.includes(r.requiresFramework)) return false;
    return true;
  }), [canSeeAudit, frameworks]);

  const [tab, setTab] = useState(() => visibleReports[0]?.id || 'metrics');
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');

  useEffect(() => {
    getSites().then(data => { setSites(data); if (data.length > 0) setSiteId(String(data[0].id)); });
  }, []);

  // If the previously-selected tab is no longer in the visible set (org
  // changed frameworks, role-gating flipped, etc.), fall back to the first
  // visible card so the page never renders an empty content area.
  useEffect(() => {
    if (visibleReports.length > 0 && !visibleReports.some(r => r.id === tab)) {
      setTab(visibleReports[0].id);
    }
  }, [visibleReports, tab]);

  const siteOpts = useMemo(() => sites.map(s => ({ value: String(s.id), label: s.name })), [sites]);

  return (
    <div className="page">
      {/* Hero */}
      <div className="rpt-hero">
        <div>
          <h1 className="rpt-heading">Reports</h1>
          <p className="rpt-subtitle">Continuous regulatory output, auto-generated from incident data.</p>
        </div>
        <ComboBox className="rpt-site-select" options={siteOpts} value={siteId} onChange={setSiteId} placeholder="Search sites…" />
      </div>

      {/* Report type selector */}
      {visibleReports.length > 0 ? (
        <div className="rpt-type-grid">
          {visibleReports.map(r => (
            <div key={r.id} className={`rpt-type-card ${r.cls} ${tab === r.id ? 'active' : ''}`} onClick={() => setTab(r.id)}>
              <div className="rpt-type-badge">{r.badge}</div>
              <div className="rpt-type-title">{r.title}</div>
              <div className="rpt-type-desc">{r.desc}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rpt-panel">
          <div className="rpt-panel-body">
            <div className="cell-empty">No reports available for your organization's selected compliance frameworks.</div>
          </div>
        </div>
      )}

      {/* Report content */}
      {tab === 'osha300' && <Osha300Report siteId={siteId}/>}
      {tab === 'osha300a' && <Osha300AReport siteId={siteId}/>}
      {tab === 'osha301' && <Osha301Report siteId={siteId}/>}
      {tab === 'riddor' && <RiddorReport siteId={siteId}/>}
      {tab === 'safework_nsw' && <SafeworkNswReport siteId={siteId}/>}
      {tab === 'metrics' && <MetricsReport siteId={siteId}/>}
      {tab === 'audit' && <AuditLogReport/>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuditLogReport — P3-A1 chunk 3
//
// Internal forensic surface for ehs_officer / ehs_manager / admin. Filter the
// activity_log by entity, date range, actor, action; preview matching rows
// in a paginated table; download a CSV slice for inspector requests. The
// download itself is logged on the BE so chain-of-custody is provable.
// Reuses existing .rpt-panel / .rpt-table / .field shared classes.
// ---------------------------------------------------------------------------
// Must match the BE activity_log.entity_type CHECK constraint exactly.
// Order is forensic-grouped: investigation → CAPA chain first (what an
// inspector cares about), then operational records, then admin/internal.
const ENTITY_TYPES = [
  'incident', 'investigation', 'capa',
  'site', 'work_hours', 'asset', 'asset_category',
  'document', 'folder', 'link',
  'user', 'template', 'inspection', 'answer_set',
  'organization', 'system',
];

// Friendly labels for entity_types whose raw keys are jargon to a non-engineer.
// Used in BOTH the entity-type picker AND as the group header in the
// action picker. Falls back to the raw key with underscores → spaces.
const ENTITY_TYPE_LABELS = {
  incident:       'Incident',
  investigation:  'Investigation',
  capa:           'CAPA',
  site:           'Site',
  work_hours:     'Work hours',
  asset:          'Asset',
  asset_category: 'Asset category',
  document:       'Document',
  folder:         'Document folder',
  link:           'Entity link',
  user:           'User',
  template:       'Inspection template',
  inspection:     'Inspection',
  answer_set:     'Inspection answer set',
  organization:   'Organization',
  system:         'System / cross-cutting',
};
const labelForEntityType = (t) => ENTITY_TYPE_LABELS[t] || t.replace(/_/g, ' ');

// MultiPicker — generic multi-select with optional grouping.
//
// Popover is portal'd to document.body because the surrounding .rpt-panel
// has overflow:hidden, which clips an absolute-positioned dropdown. Fixed
// positioning relative to the trigger's bounding rect; repositions on scroll
// and resize while open. Used twice on this page: action picker (grouped
// by entity_type) and entity-type picker (flat list).
//
// Props:
//   items     — array of { key, label, count?, group? }
//   value     — string[] of selected keys
//   onChange  — (next: string[]) => void
//   placeholder — text shown on trigger when no selection
//   labelOne  — text on trigger for single selection (default = the key)
//   labelMany — formatter for multi: (n) => string
//   isGrouped — bool, render group headers + select-all
//   disabled  — disable trigger
function MultiPicker({ items, value, onChange, placeholder, labelOne, labelMany, isGrouped, disabled }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    updatePos();
    const onDocClick = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  const groups = useMemo(() => {
    if (!isGrouped) return null;
    const m = {};
    for (const it of items) (m[it.group || '—'] = m[it.group || '—'] || []).push(it);
    return m;
  }, [items, isGrouped]);

  const selectedSet = new Set(value);

  const toggleKey = (key) => {
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange([...next]);
  };
  const toggleGroupAll = (groupKey, allChecked) => {
    const next = new Set(selectedSet);
    for (const it of groups[groupKey]) {
      if (allChecked) next.delete(it.key);
      else next.add(it.key);
    }
    onChange([...next]);
  };
  const clearAll = () => onChange([]);

  let label = placeholder;
  if (value.length === 1) label = labelOne ? labelOne(value[0]) : value[0];
  else if (value.length > 1) label = labelMany ? labelMany(value.length) : `${value.length} selected`;

  return (
    <div className="al-multi">
      <button
        ref={triggerRef}
        type="button"
        className={`select al-multi-trigger ${value.length ? 'has-value' : ''}`}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        <span className="al-multi-label">{label}</span>
        <Icon name="arrow" size={11} />
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="al-multi-popover"
          style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 280) }}
        >
          <div className="al-multi-head">
            <span>{value.length} selected</span>
            {value.length > 0 && (
              <button type="button" className="al-multi-clear" onClick={clearAll}>Clear</button>
            )}
          </div>
          <div className="al-multi-body">
            {items.length === 0 && (
              <div className="al-multi-empty">Nothing to pick here yet.</div>
            )}
            {isGrouped && groups && Object.entries(groups).map(([gk, gitems]) => {
              const allChecked = gitems.every(i => selectedSet.has(i.key));
              const someChecked = !allChecked && gitems.some(i => selectedSet.has(i.key));
              return (
                <div key={gk} className="al-multi-group">
                  <label className="al-multi-grouph">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked; }}
                      onChange={() => toggleGroupAll(gk, allChecked)}
                    />
                    <span className="al-multi-groupname">{gk}</span>
                    <span className="al-multi-groupcount">{gitems.length}</span>
                  </label>
                  {gitems.map(it => (
                    <label key={`${gk}-${it.key}`} className="al-multi-item">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(it.key)}
                        onChange={() => toggleKey(it.key)}
                      />
                      <span className="al-multi-action">{it.label || it.key}</span>
                      {typeof it.count === 'number' && <span className="al-multi-count">{it.count}</span>}
                    </label>
                  ))}
                </div>
              );
            })}
            {!isGrouped && items.map(it => (
              <label key={it.key} className="al-multi-item al-multi-item-flat">
                <input
                  type="checkbox"
                  checked={selectedSet.has(it.key)}
                  onChange={() => toggleKey(it.key)}
                />
                <span className="al-multi-action">{it.label || it.key}</span>
                {typeof it.count === 'number' && <span className="al-multi-count">{it.count}</span>}
              </label>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function AuditLogReport() {
  const [filters, setFilters] = useState({
    entity_types: [], entity_number: '', actor_ids: [], actions: [], from: '', to: '', q: '',
  });
  const [data, setData] = useState({ rows: [], total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [users, setUsers] = useState([]);
  const [actions, setActions] = useState([]);
  const [advOpen, setAdvOpen] = useState(false);

  // Org user list for the actor picker.
  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  // Distinct actions present in the org's activity_log — populates the
  // action dropdown so the user doesn't have to memorize verb strings.
  useEffect(() => {
    getAuditActions().then(setActions).catch(() => setActions([]));
  }, []);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const buildQuery = (extra = {}) => {
    const q = { ...filters, ...extra };
    // FE arrays → BE comma-separated strings.
    if (Array.isArray(q.entity_types)) {
      if (q.entity_types.length > 0) q.entity_type = q.entity_types.join(',');
      delete q.entity_types;
    }
    // Action picker keys are composite ("entity_type|action") so we can
    // disambiguate same-named actions across entity types (e.g. incident.created
    // vs capa.created). The BE accepts these as `entity_action_pairs` using ':'
    // as the delimiter, OR'd at query time so picking "incident.created" +
    // "capa.completed" returns exactly those two pairs — not the cross-product.
    if (Array.isArray(q.actions)) {
      if (q.actions.length > 0) {
        q.entity_action_pairs = q.actions
          .map(s => s.includes('|') ? s.replace('|', ':') : s)
          .join(',');
      }
      delete q.actions;
    }
    if (Array.isArray(q.actor_ids)) {
      if (q.actor_ids.length > 0) q.actor_id = q.actor_ids.join(',');
      delete q.actor_ids;
    }
    Object.keys(q).forEach(k => {
      if (q[k] === '' || q[k] === null || q[k] === undefined) delete q[k];
      if (Array.isArray(q[k]) && q[k].length === 0) delete q[k];
    });
    return q;
  };

  const fetchPage = (page = 1) => {
    setLoading(true);
    setErr('');
    getAuditLog({ ...buildQuery(), page, limit: data.limit })
      .then(setData)
      .catch(e => setErr(e.response?.data?.error || 'Failed to load audit log'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPage(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onApply = (e) => { e?.preventDefault(); fetchPage(1); };

  const downloadCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams(buildQuery()).toString();
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/reports/audit-log/export.csv${params ? '?' + params : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Export failed: ${resp.status}`);
      }
      const blob = await resp.blob();
      // Pull filename out of Content-Disposition if present, otherwise default.
      let filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      if (m) filename = m[1];

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">Audit Log</div>
          <div className="rpt-panel-sub">Filter, preview, and export the system's audit trail. Every export is itself logged.</div>
        </div>
      </div>

      <div className="rpt-panel-body">
        {/* ── Zone A: Filter Toolbar ── */}
        {(() => {
          const activeCount = [
            filters.entity_types.length > 0,
            filters.actor_ids.length > 0,
            filters.actions.length > 0,
            !!filters.entity_number,
            !!filters.from || !!filters.to,
            !!filters.q,
          ].filter(Boolean).length;

          const chips = [];
          if (filters.entity_types.length > 0)
            chips.push({ label: 'Types', display: filters.entity_types.length === 1 ? labelForEntityType(filters.entity_types[0]) : `${filters.entity_types.length} types`, onClear: () => setF('entity_types', []) });
          if (filters.actor_ids.length > 0)
            chips.push({ label: 'Actors', display: filters.actor_ids.length === 1 ? (users.find(u => String(u.id) === String(filters.actor_ids[0]))?.name || filters.actor_ids[0]) : `${filters.actor_ids.length} actors`, onClear: () => setF('actor_ids', []) });
          if (filters.actions.length > 0)
            chips.push({ label: 'Actions', display: filters.actions.length === 1 ? (filters.actions[0].includes('|') ? filters.actions[0].split('|')[1] : filters.actions[0]) : `${filters.actions.length} actions`, onClear: () => setF('actions', []) });
          if (filters.entity_number)
            chips.push({ label: 'Entity #', display: filters.entity_number, onClear: () => setF('entity_number', '') });
          if (filters.from || filters.to)
            chips.push({ label: 'Date', display: `${filters.from || '…'} → ${filters.to || '…'}`, onClear: () => { setF('from', ''); setF('to', ''); } });
          if (filters.q)
            chips.push({ label: 'Search', display: `"${filters.q}"`, onClear: () => setF('q', '') });

          const clearAll = () => setFilters({ entity_types: [], entity_number: '', actor_ids: [], actions: [], from: '', to: '', q: '' });

          return (
            <form onSubmit={onApply}>
              <div className="al-toolbar">
                <div className="al-toolbar-left">
                  <Icon name="filter" size={16} />
                  <span>Filters</span>
                  {activeCount > 0 && <span className="al-count-badge">{activeCount}</span>}
                  <button
                    type="button"
                    className={`al-adv-toggle${advOpen ? ' is-open' : ''}`}
                    onClick={() => setAdvOpen(v => !v)}
                  >
                    Advanced
                    <span className="al-adv-chevron"><Icon name="arrow" size={12} /></span>
                  </button>
                </div>
                <div className="al-toolbar-right">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                    <Icon name="filter" size={14}/> Apply
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={exporting || data.total === 0} onClick={downloadCsv}>
                    <Icon name="download" size={14}/> {exporting ? 'Exporting…' : 'Export CSV'}
                  </button>
                </div>
              </div>

              {/* ── Zone B: Primary Filters ── */}
              <div className="al-primary-grid">
                <div className={`al-selector-card${filters.entity_types.length > 0 ? ' has-value' : ''}`}>
                  <div className="al-selector-label">
                    <span className="al-selector-icon"><Icon name="incidents" size={12}/></span>
                    Entity Types
                    <span className="al-label-hint">multi</span>
                  </div>
                  <MultiPicker
                    items={ENTITY_TYPES.map(t => ({ key: t, label: labelForEntityType(t) }))}
                    value={filters.entity_types}
                    onChange={(next) => setF('entity_types', next)}
                    placeholder="All entities"
                    labelOne={(key) => labelForEntityType(key)}
                    labelMany={(n) => `${n} types selected`}
                    isGrouped={false}
                    disabled={!!filters.entity_number}
                  />
                </div>
                <div className={`al-selector-card${filters.actor_ids.length > 0 ? ' has-value' : ''}`}>
                  <div className="al-selector-label">
                    <span className="al-selector-icon"><Icon name="person" size={12}/></span>
                    Actors
                    <span className="al-label-hint">multi</span>
                  </div>
                  <MultiPicker
                    items={users.map(u => ({
                      key: String(u.id),
                      label: `${u.name}${u.role ? ` · ${u.role}` : ''}`,
                    }))}
                    value={filters.actor_ids}
                    onChange={(next) => setF('actor_ids', next)}
                    placeholder="Anyone"
                    labelOne={(key) => {
                      const u = users.find(x => String(x.id) === String(key));
                      return u ? u.name : key;
                    }}
                    labelMany={(n) => `${n} actors selected`}
                    isGrouped={false}
                  />
                </div>
                <div className={`al-selector-card${filters.actions.length > 0 ? ' has-value' : ''}`}>
                  <div className="al-selector-label">
                    <span className="al-selector-icon"><Icon name="pulse" size={12}/></span>
                    Actions
                    <span className="al-label-hint">multi</span>
                  </div>
                  <MultiPicker
                    items={(filters.entity_types.length > 0
                      ? actions.filter(a => filters.entity_types.includes(a.entity_type))
                      : actions
                    ).map(a => ({
                      key: `${a.entity_type}|${a.action}`,
                      label: a.action,
                      count: a.count,
                      group: labelForEntityType(a.entity_type),
                    }))}
                    value={filters.actions}
                    onChange={(next) => setF('actions', next)}
                    placeholder="Any action"
                    labelOne={(key) => key.includes('|') ? key.split('|')[1] : key}
                    labelMany={(n) => `${n} actions selected`}
                    isGrouped={true}
                  />
                </div>
              </div>

              {/* ── Zone C: Active Filter Chips ── */}
              {chips.length > 0 && (
                <div className="al-chips">
                  {chips.map((c, i) => (
                    <span key={i} className="al-chip" style={{ animationDelay: `${i * 40}ms` }}>
                      <span className="al-chip-label">{c.label}:</span> {c.display}
                      <button type="button" className="al-chip-close" onClick={c.onClear}><Icon name="close" size={10}/></button>
                    </span>
                  ))}
                  <button type="button" className="al-chips-clear" onClick={clearAll}>Clear all</button>
                </div>
              )}

              {/* ── Zone D: Advanced Filters (collapsible) ── */}
              <div className={`al-advanced-wrap${advOpen ? ' is-open' : ''}`}>
                <div className="al-advanced-inner">
                  <div className="al-advanced-grid">
                    <div className="field">
                      <label className="label">Entity number <span className="al-label-hint">overrides type</span></label>
                      <input
                        className="input"
                        placeholder="INC-2026-0150, CAPA-048…"
                        value={filters.entity_number}
                        onChange={e => setF('entity_number', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="label">Date range</label>
                      <div className="al-date-pair">
                        <div className="field">
                          <DatePicker value={filters.from} onChange={v => setF('from', v)} placeholder="From" />
                        </div>
                        <div className="field">
                          <DatePicker value={filters.to} onChange={v => setF('to', v)} placeholder="To" />
                        </div>
                      </div>
                    </div>
                    <div className="field">
                      <label className="label">Description contains</label>
                      <input className="input" placeholder="search description text" value={filters.q} onChange={e => setF('q', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </form>
          );
        })()}

        {err && <div className="al-err"><Icon name="warning" size={14}/> {err}</div>}

        {/* ── Zone E: Results Meta Bar ── */}
        <div className="al-results-bar">
          <span className="al-results-count"><b>{data.total}</b> row{data.total === 1 ? '' : 's'} match these filters</span>
          {data.total > 0 && (
            <span className="al-meta-note">
              <Icon name="shield" size={12}/> Every export writes an <code>audit_log_exported</code> row with the filters used.
            </span>
          )}
        </div>

        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>ID</th>
                <th style={{ width: 145 }}>When</th>
                <th style={{ width: 110 }}>Entity</th>
                <th style={{ width: 70 }}>#</th>
                <th style={{ width: 170 }}>Action</th>
                <th>Description</th>
                <th style={{ width: 130 }}>Actor</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="al-loading">Loading…</td></tr>
              )}
              {!loading && data.rows.length === 0 && (
                <tr><td colSpan={7} className="al-empty">No audit-log rows match these filters.</td></tr>
              )}
              {!loading && data.rows.map(r => (
                <tr key={r.id}>
                  <td className="al-mono">{r.id}</td>
                  <td className="al-mono">{r.created_at}</td>
                  <td>{r.entity_type}</td>
                  <td className="al-mono">{r.entity_id ?? '—'}</td>
                  <td className="al-mono">{r.action}</td>
                  <td>{r.description}</td>
                  <td>{r.user_initials || r.user_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.total > data.limit && (
          <div className="al-pager">
            <button className="btn btn-secondary btn-sm" disabled={data.page <= 1 || loading} onClick={() => fetchPage(data.page - 1)}>
              <Icon name="arrowL" size={12}/> Prev
            </button>
            <span className="al-pager-meta">Page {data.page} of {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={data.page >= totalPages || loading} onClick={() => fetchPage(data.page + 1)}>
              Next <Icon name="arrow" size={12}/>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Osha300Report({ siteId }) {
  const { user } = useAuth();
  const canAdd = ELEVATED_ROLES.has(user?.role);
  const [data, setData] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = () => {
    if (siteId) { setData(null); getOsha300({ site_id: siteId }).then(setData).catch(() => {}); }
  };
  useEffect(load, [siteId]);

  // OSHA Form 300 PDF — 29 CFR 1904.29(b)(4) lets us serve an "equivalent
  // form" so long as the same information is presented. We re-use the same
  // GET /reports/osha-300 endpoint with format=pdf so filters stay aligned
  // with the on-screen table.
  const downloadPdf = async () => {
    if (!siteId) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams({ site_id: String(siteId), year: String(data.year), format: 'pdf' }).toString();
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/reports/osha-300?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Download failed: ${resp.status}`);
      }
      const blob = await resp.blob();
      let filename = `osha-300-${data.year}.pdf`;
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      if (m) filename = m[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // Surface failure but keep the UI usable.
      console.error('OSHA 300 PDF download failed:', e);
      alert(e.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (!data) return <ReportLoading/>;

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">OSHA 300 Log · Live Preview</div>
          <div className="rpt-panel-sub">{data.site?.name} · YTD {data.year}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={downloadPdf}
            disabled={downloading || !siteId}
            title="Download the OSHA 300 Log as a printable PDF (equivalent form per 29 CFR 1904.29(b)(4))"
          >
            <Icon name="download" size={14}/>{downloading ? 'Generating…' : 'Download PDF'}
          </button>
          {canAdd && <button className="btn btn-secondary btn-sm" onClick={() => setShowManual(true)}><Icon name="plus" size={14}/>Manual entry</button>}
          <span className="rpt-auto-badge"><span className="auto-dot"/>Auto-updates</span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="rpt-table" style={{ minWidth: 1100 }}>
          <thead>
            <tr>
              <th>Case #</th><th>Employee</th><th>Date</th><th>Where</th><th>Description</th>
              <th>Death</th><th>Days away</th><th>Restrict.</th><th>Other</th><th>Days away</th><th>Days restr.</th><th>Type</th>
            </tr>
          </thead>
          <tbody>
            {(data.entries || []).map(e => (
              <tr key={e.id} className={e.is_privacy_case ? 'privacy-row' : ''}>
                <td className="cell-ref">{e.case_number}</td>
                <td>
                  <div className="cell-name">{e.employee_name}</div>
                  <div className="cell-sub">{e.job_title}</div>
                </td>
                <td>{formatDateShort(e.injury_date)}</td>
                <td>{e.location}</td>
                <td>{e.description}</td>
                <td className="cell-check">{e.classification_death ? <span className="check-mark">✓</span> : ''}</td>
                <td className="cell-check">{e.classification_days_away ? <span className="check-mark">✓</span> : ''}</td>
                <td className="cell-check">{e.classification_job_transfer ? <span className="check-mark">✓</span> : ''}</td>
                <td className="cell-check">{e.classification_other ? <span className="check-mark">✓</span> : ''}</td>
                <td className="cell-num">{e.days_away_count || ''}</td>
                <td className="cell-num">{e.days_restricted_count || ''}</td>
                <td>{e.injury_type}</td>
              </tr>
            ))}
            {data.entries?.length === 0 && (
              <tr><td colSpan={12} className="cell-empty">No recordable entries this year</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="rpt-panel-footer">
        <span className="foot-item">Total cases<b>{data.entries?.length || 0}</b></span>
      </div>
      {showManual && <Manual300Modal siteId={siteId} onClose={() => setShowManual(false)} onSaved={load}/>}
    </div>
  );
}

const CLASSIFICATION_OPTIONS = [
  { value: 'death', label: 'Death' },
  { value: 'days_away', label: 'Days away from work' },
  { value: 'job_transfer', label: 'Job transfer or restriction' },
  { value: 'other_recordable', label: 'Other recordable case' },
];

function Manual300Modal({ siteId, onClose, onSaved }) {
  const [form, setForm] = useState({
    site_id: siteId, employee_name: '', job_title: '', injury_date: '',
    location: '', description: '', classification: 'other_recordable',
    days_away_count: 0, days_restricted_count: 0, injury_type: '', is_privacy_case: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.employee_name || !form.injury_date) { setError('Employee name and injury date are required.'); return; }
    setSaving(true);
    try {
      await createOsha300Entry({ ...form, site_id: siteId });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save.');
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Manual OSHA 300 Entry</div>
            <div className="modal-sub">Add a recordable case not linked to an incident in the system.</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={18}/></button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: 'var(--sds-error)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div className="field-row">
            <div className="field"><label className="label">Employee name <span className="req">*</span></label><input className="input" value={form.employee_name} onChange={e => upd('employee_name', e.target.value)}/></div>
            <div className="field"><label className="label">Job title</label><input className="input" value={form.job_title} onChange={e => upd('job_title', e.target.value)}/></div>
          </div>
          <div className="field-row">
            <div className="field"><label className="label">Injury / illness date <span className="req">*</span></label><DatePicker value={form.injury_date} onChange={v => upd('injury_date', v)} placeholder="Select date" /></div>
            <div className="field"><label className="label">Where event occurred</label><input className="input" value={form.location} onChange={e => upd('location', e.target.value)}/></div>
          </div>
          <div className="field"><label className="label">Description</label><textarea className="textarea" value={form.description} onChange={e => upd('description', e.target.value)} rows={2}/></div>
          <div className="field-row">
            <div className="field">
              <label className="label">Classification</label>
              <select className="select" value={form.classification} onChange={e => upd('classification', e.target.value)}>
                {CLASSIFICATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field"><label className="label">Injury / illness type</label><input className="input" value={form.injury_type} onChange={e => upd('injury_type', e.target.value)} placeholder="e.g. Fracture, Laceration"/></div>
          </div>
          <div className="field-row-3">
            <div className="field"><label className="label">Days away from work</label><input className="input" type="number" min="0" value={form.days_away_count} onChange={e => upd('days_away_count', Number(e.target.value))}/></div>
            <div className="field"><label className="label">Days on restriction</label><input className="input" type="number" min="0" value={form.days_restricted_count} onChange={e => upd('days_restricted_count', Number(e.target.value))}/></div>
            <div className="field">
              <label className="label">Privacy case</label>
              <select className="select" value={form.is_privacy_case ? '1' : '0'} onChange={e => upd('is_privacy_case', e.target.value === '1')}>
                <option value="0">No</option>
                <option value="1">Yes — suppress name on log</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Add entry'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Osha301Report({ siteId }) {
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (siteId) {
      getIncidents({ site_id: siteId, limit: 200 }).then(r => {
        const recordable = (r.incidents || []).filter(i => i.osha_recordable);
        setIncidents(recordable);
        setSelectedId('');
        setData(null);
      }).catch(() => {});
    }
  }, [siteId]);

  useEffect(() => {
    if (selectedId) {
      setLoading(true);
      getOsha301(selectedId).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    } else { setData(null); }
  }, [selectedId]);

  const incidentOpts = incidents.map(i => ({ value: String(i.id), label: `${i.incident_number} — ${i.title}` }));

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">OSHA 301 · Injury and Illness Incident Report</div>
          <div className="rpt-panel-sub">Individual incident form per 29 CFR 1904.29</div>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div className="field" style={{ maxWidth: 480 }}>
          <label className="label">Select a recordable incident</label>
          <ComboBox options={incidentOpts} value={selectedId} onChange={setSelectedId} placeholder="Search by incident number or title…"/>
        </div>
      </div>
      {loading && <ReportLoading/>}
      {data && !loading && (
        <div className="rpt-301-form">
          <div className="rpt-301-section">
            <div className="rpt-301-section-title">Case Information</div>
            <div className="rpt-301-grid">
              <div className="rpt-301-field"><span className="rpt-301-label">Case number</span><span className="rpt-301-val">{data.case_number || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Incident number</span><span className="rpt-301-val">{data.incident_number}</span></div>
            </div>
          </div>
          <div className="rpt-301-section">
            <div className="rpt-301-section-title">Employee</div>
            <div className="rpt-301-grid">
              <div className="rpt-301-field"><span className="rpt-301-label">Full name</span><span className="rpt-301-val">{data.employee?.name || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Job title</span><span className="rpt-301-val">{data.employee?.job_title || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Department</span><span className="rpt-301-val">{data.employee?.department || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Date hired</span><span className="rpt-301-val">{data.employee?.hire_date ? formatDateShort(data.employee.hire_date) : '—'}</span></div>
            </div>
          </div>
          <div className="rpt-301-section">
            <div className="rpt-301-section-title">Incident</div>
            <div className="rpt-301-grid">
              <div className="rpt-301-field"><span className="rpt-301-label">Date of injury/illness</span><span className="rpt-301-val">{data.incident?.date ? formatDateShort(data.incident.date) : '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Time</span><span className="rpt-301-val">{data.incident?.date?.slice(11, 16) || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Location</span><span className="rpt-301-val">{data.incident?.location || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Establishment</span><span className="rpt-301-val">{data.incident?.site || '—'}</span></div>
            </div>
            <div className="rpt-301-field rpt-301-wide"><span className="rpt-301-label">Describe the injury/illness, parts of body affected, and object/substance</span><span className="rpt-301-val">{data.incident?.description || '—'}</span></div>
          </div>
          <div className="rpt-301-section">
            <div className="rpt-301-section-title">Injury / Illness Details</div>
            <div className="rpt-301-grid">
              <div className="rpt-301-field"><span className="rpt-301-label">Type</span><span className="rpt-301-val">{data.injury?.type || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Body part</span><span className="rpt-301-val">{data.injury?.body_part || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Object / substance</span><span className="rpt-301-val">{data.injury?.object_substance || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Mechanism</span><span className="rpt-301-val">{data.injury?.mechanism || '—'}</span></div>
            </div>
          </div>
          <div className="rpt-301-section">
            <div className="rpt-301-section-title">Physician / Healthcare Provider</div>
            <div className="rpt-301-grid">
              <div className="rpt-301-field"><span className="rpt-301-label">Name</span><span className="rpt-301-val">{data.physician?.name || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Phone</span><span className="rpt-301-val">{data.physician?.phone || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Facility</span><span className="rpt-301-val">{data.physician?.facility_name || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Facility address</span><span className="rpt-301-val">{data.physician?.facility_address || '—'}</span></div>
            </div>
          </div>
          <div className="rpt-301-section">
            <div className="rpt-301-section-title">Treatment & Classification</div>
            <div className="rpt-301-grid">
              <div className="rpt-301-field"><span className="rpt-301-label">ER treatment</span><span className="rpt-301-val">{data.er_treated ? 'Yes' : 'No'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Hospitalized overnight</span><span className="rpt-301-val">{data.hospitalized ? 'Yes' : 'No'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Classification</span><span className="rpt-301-val">{data.classification?.type?.replace(/_/g, ' ') || '—'}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Days away</span><span className="rpt-301-val">{data.classification?.days_away || 0}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Days restricted</span><span className="rpt-301-val">{data.classification?.days_restricted || 0}</span></div>
              <div className="rpt-301-field"><span className="rpt-301-label">Work-related determination</span><span className="rpt-301-val">{data.work_related || '—'}</span></div>
            </div>
          </div>
        </div>
      )}
      {!data && !loading && !selectedId && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--sds-fg-tertiary)', fontSize: 13 }}>
          Select an OSHA-recordable incident above to view its 301 form.
        </div>
      )}
    </div>
  );
}

function Osha300AReport({ siteId }) {
  const { user } = useAuth();
  const canCertify = ELEVATED_ROLES.has(user?.role);
  const [data, setData] = useState(null);
  const [designation, setDesignation] = useState(null);
  const [showCertify, setShowCertify] = useState(false);
  const [toast, setToast] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const load = () => {
    if (siteId) {
      setData(null);
      getOsha300A({ site_id: siteId }).then(setData).catch(() => {});
      // WI-02: ITA designation lookup (1904.41 Appendix A/B + 250+).
      import('../../api/reports').then(m => {
        if (m.getOshaItaDesignation) {
          m.getOshaItaDesignation({ site_id: siteId })
            .then(setDesignation).catch(() => setDesignation(null));
        }
      });
    }
  };
  useEffect(load, [siteId]);

  const downloadCertifiedFile = async (format) => {
    if (!data?.snapshot?.has_snapshot && format === 'csv') {
      setToast('Certify the 300A summary before generating the ITA CSV.');
      setTimeout(() => setToast(null), 3500);
      return;
    }
    const setBusy = format === 'pdf' ? setDownloadingPdf : setDownloadingCsv;
    setBusy(true);
    try {
      const params = new URLSearchParams({ site_id: String(siteId), year: String(data.year), format }).toString();
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/reports/osha-300a?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Download failed: ${resp.status}`);
      }
      const blob = await resp.blob();
      let filename = `osha-300a-${data.year}.${format}`;
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      if (m) filename = m[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setToast(e.message || 'Download failed');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <ReportLoading/>;

  const totalCases = (data.cases?.deaths || 0) + (data.cases?.days_away || 0) + (data.cases?.job_transfer || 0) + (data.cases?.other_recordable || 0);

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">OSHA 300A · Annual Summary</div>
          <div className="rpt-panel-sub">{data.site?.name} · Calendar year {data.year}</div>
        </div>
        <div className="rpt-300a-cert-area" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => downloadCertifiedFile('pdf')}
            disabled={downloadingPdf}
            title={data.snapshot?.has_snapshot
              ? 'Download the certified Form 300A as PDF (29 CFR 1904.32(b)(2))'
              : 'Download DRAFT Form 300A PDF — not for posting until certified'}
          >
            <Icon name="download" size={13}/>{downloadingPdf ? 'Generating…' : 'PDF'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => downloadCertifiedFile('csv')}
            disabled={downloadingCsv || !data.snapshot?.has_snapshot}
            title={data.snapshot?.has_snapshot
              ? 'Download the ITA-compatible CSV for electronic submission (29 CFR 1904.41)'
              : 'Certify the 300A summary first — ITA submission requires a signed snapshot'}
          >
            <Icon name="export" size={13}/>{downloadingCsv ? 'Generating…' : 'ITA CSV'}
          </button>
          {data.certification ? (
            <div className="rpt-300a-cert-stamp">
              <div className="rpt-300a-cert-stamp-icon"><Icon name="check" size={14}/></div>
              <div>
                <div className="rpt-300a-cert-stamp-title">Signed</div>
                <div className="rpt-300a-cert-stamp-meta">
                  by <b>{data.certification.certifier_name}</b>
                  {data.certification.certifier_title_label ? `, ${data.certification.certifier_title_label}` : (data.certification.certifier_title || '')}
                  {' · '}
                  {formatDate(data.certification.signed_at)}
                </div>
              </div>
            </div>
          ) : canCertify ? (
            <button className="rpt-300a-cert-btn" onClick={() => setShowCertify(true)}>
              <Icon name="check" size={14}/>Certify &amp; sign
            </button>
          ) : (
            <div className="rpt-300a-cert-pending">Awaiting executive sign-off</div>
          )}
        </div>
      </div>
      {/* WI-02: 1904.41 designation banner — surfaces whether the
          establishment must e-submit to OSHA. Reuses card/panel tokens. */}
      {designation?.designation && (
        <div
          className="rpt-panel-banner"
          style={{
            padding: '10px 16px',
            margin: '0 0 12px 0',
            background: designation.designation.required
              ? 'var(--sds-brand-primary-tint)'
              : 'var(--sds-bg-surface-alt)',
            borderLeft: `3px solid ${designation.designation.required ? 'var(--sds-brand-primary)' : 'var(--sds-border)'}`,
            borderRadius: 'var(--sds-radius-sm)',
            fontSize: 12,
          }}
        >
          {designation.designation.required ? (
            <>
              <b>Electronic submission required.</b> Per {designation.designation.reg_ref},
              this establishment ({designation.site.naics_code ? `NAICS ${designation.site.naics_code}, ` : ''}
              {designation.annual_avg_employees} employees) must electronically submit
              <b> {designation.designation.submission_type}</b> information to OSHA.
              {designation.next_submission_deadline ? <> {designation.next_submission_deadline}.</> : null}
            </>
          ) : (
            <>
              <span style={{ color: 'var(--sds-fg-secondary)' }}>
                Per 29 CFR 1904.41(b)(1), routine electronic submission is not required
                for this establishment ({designation.site.naics_code ? `NAICS ${designation.site.naics_code}, ` : ''}
                {designation.annual_avg_employees} employees). OSHA may still request
                data ad-hoc under 1904.41(a)(3).
              </span>
            </>
          )}
        </div>
      )}
      {showCertify && createPortal(
        <CertifyOsha300AModal
          siteId={siteId}
          year={data.year}
          siteName={data.site?.name}
          affirmationText={data.affirmation_text}
          onCancel={() => setShowCertify(false)}
          onCertified={() => {
            setShowCertify(false);
            setToast(`300A signed for ${data.site?.name} ${data.year}.`);
            setTimeout(() => setToast(null), 3000);
            load();
          }}
        />,
        document.body
      )}
      {toast && createPortal(
        <div className="rpt-300a-toast" role="status" aria-live="polite"><Icon name="check" size={14}/>{toast}</div>,
        document.body
      )}
      <div className="rpt-panel-body">
        <div className="rpt-300a-grid">
          <div>
            <div className="rpt-300a-section-title"><span className="sec-dot"/>Number of Cases</div>
            <table className="rpt-summary-table">
              <tbody>
                <tr><td>Deaths (G)</td><td>{data.cases?.deaths || 0}</td></tr>
                <tr><td>Days away from work (H)</td><td>{data.cases?.days_away || 0}</td></tr>
                <tr><td>Job transfer or restriction (I)</td><td>{data.cases?.job_transfer || 0}</td></tr>
                <tr><td>Other recordable (J)</td><td>{data.cases?.other_recordable || 0}</td></tr>
                <tr className="total-row"><td>Total</td><td>{totalCases}</td></tr>
              </tbody>
            </table>

            <div className="rpt-300a-section-title" style={{ marginTop: 28 }}><span className="sec-dot"/>Number of Days</div>
            <table className="rpt-summary-table">
              <tbody>
                <tr><td>Days away from work (K)</td><td>{data.cases?.total_days_away || 0}</td></tr>
                <tr><td>Days of restriction (L)</td><td>{data.cases?.total_days_restricted || 0}</td></tr>
              </tbody>
            </table>
          </div>

          <div>
            <div className="rpt-300a-section-title"><span className="sec-dot"/>Establishment Information</div>
            <div className="rpt-info-rows">
              <div className="rpt-info-row">
                <span className="rpt-info-label">Avg employees</span>
                <span className="rpt-info-val">{data.site?.annual_avg_employees || '—'}</span>
              </div>
              <div className="rpt-info-row">
                <span className="rpt-info-label">Total hours worked</span>
                <span className="rpt-info-val">{data.site?.total_hours_worked || '—'}</span>
              </div>
              <div className="rpt-info-row">
                <span className="rpt-info-label">NAICS code</span>
                <span className="rpt-info-val">{data.site?.naics_code || '—'}</span>
              </div>
            </div>

            {data.metrics && (
              <>
                <div className="rpt-300a-section-title" style={{ marginTop: 28 }}><span className="sec-dot"/>Incidence Rates</div>
                <div className="rpt-rate-card">
                  <div className="rpt-rate-val">{data.metrics.trir?.toFixed(2) || '—'}</div>
                  <div className="rpt-rate-info">
                    <div className="rpt-rate-name">TRIR</div>
                    <div className="rpt-rate-desc">Total Recordable Incident Rate</div>
                  </div>
                </div>
                <div className="rpt-rate-card">
                  <div className="rpt-rate-val">{data.metrics.dart?.toFixed(2) || '—'}</div>
                  <div className="rpt-rate-info">
                    <div className="rpt-rate-name">DART</div>
                    <div className="rpt-rate-desc">Days Away, Restricted, Transfer</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RiddorReport({ siteId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    getRiddor({ site_id: siteId }).then(setData).catch(() => {});
  }, [siteId]);

  if (!data) return <ReportLoading/>;

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">RIDDOR F2508 · UK Reportable Events</div>
          <div className="rpt-panel-sub">YTD {data.year}</div>
        </div>
      </div>
      <div className="rpt-panel-body">
        <div className="rpt-riddor-banner">
          <div className="rpt-riddor-icon"><Icon name="info" size={16}/></div>
          <div className="rpt-riddor-text">
            <b>RIDDOR reporting timelines:</b> Specified injuries & deaths — phone HSE without delay, written report within 10 days.
            Over-7-day incapacitation — online within 15 days. Dangerous occurrences — phone without delay, written within 10 days.
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="rpt-table">
            <thead>
              <tr><th>RIDDOR ref</th><th>Source</th><th>Date</th><th>Category</th><th>Description</th><th>HSE ref</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(data.reports || []).map(r => (
                <tr key={r.id}>
                  <td className="cell-ref">{r.riddor_number}</td>
                  <td className="cell-ref">{r.incident_number}</td>
                  <td>{formatDateShort(r.event_date)}</td>
                  <td>
                    <span className="rpt-cat-pill" title={riddorCategoryReg(r.category) ? `RIDDOR ${riddorCategoryReg(r.category)}` : ''}>
                      <span className="cat-dot"/>{riddorCategoryLabel(r.category)}
                    </span>
                  </td>
                  <td>{r.description || r.incident_title}</td>
                  <td className="cell-ref">{r.hse_ref || '—'}</td>
                  <td>
                    <span className={`rpt-status ${r.status === 'submitted' ? 'rs-submitted' : r.status === 'pending' ? 'rs-pending' : 'rs-draft'}`}>
                      <span className="rs-dot"/>{r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {data.reports?.length === 0 && (
                <tr><td colSpan={7} className="cell-empty">No RIDDOR reports this year</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data.stats && (
          <div className="rpt-riddor-stats">
            <div className="rpt-riddor-stat">
              <div className="rpt-riddor-stat-label">Specified injuries</div>
              <div className="rpt-riddor-stat-val">{data.stats.specified_injuries}</div>
            </div>
            <div className="rpt-riddor-stat">
              <div className="rpt-riddor-stat-label">Over-7-day absences</div>
              <div className="rpt-riddor-stat-val">{data.stats.over_7_day}</div>
            </div>
            <div className="rpt-riddor-stat">
              <div className="rpt-riddor-stat-label">Dangerous occurrences</div>
              <div className="rpt-riddor-stat-val">{data.stats.dangerous_occurrences}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// WI-06: SafeWork NSW notifiable-incident report (WHS Act 2011 (NSW)
// ss.35–39). Mirrors the RiddorReport shape — read-only table of
// notifications across the org (optionally filtered by selected site).
// Each row shows the NSW number, source incident, event date, top-level
// s.35 category labels, and the s.38 phone/written submission status.
function SafeworkNswReport({ siteId }) {
  const [data, setData] = useState(null);
  const [lookups, setLookups] = useState({ serious_injury_types: [], dangerous_incident_types: [] });

  useEffect(() => {
    setData(null);
    const params = siteId ? { site_id: siteId } : {};
    listSafeworkNsw(params).then(setData).catch(() => setData({ notifications: [] }));
  }, [siteId]);

  useEffect(() => {
    getSafeworkNswLookups().then(setLookups).catch(() => {});
  }, []);

  if (!data) return <ReportLoading/>;

  const s36Map = new Map((lookups.serious_injury_types || []).map(r => [r.key, r.label]));
  const s37Map = new Map((lookups.dangerous_incident_types || []).map(r => [r.key, r.label]));

  const rows = data.notifications || [];

  // Derive top-line counts from the visible rows so the panel header
  // mirrors the RIDDOR stats block.
  const stats = rows.reduce((acc, r) => {
    if (r.is_fatality) acc.fatalities += 1;
    if (r.is_serious_injury) acc.serious += 1;
    if (r.is_dangerous_incident) acc.dangerous += 1;
    if (r.excluded_mines_petroleum) acc.excluded += 1;
    return acc;
  }, { fatalities: 0, serious: 0, dangerous: 0, excluded: 0 });

  // Compact label for the s.35 category column: list the top-level
  // sections that apply with their paragraph numbers.
  const categoryLabel = (r) => {
    const parts = [];
    if (r.is_fatality) parts.push('s.35(a) Death');
    if (r.is_serious_injury) parts.push('s.35(b) Serious');
    if (r.is_dangerous_incident) parts.push('s.35(c) Dangerous');
    if (r.excluded_mines_petroleum) parts.push('M&P excluded');
    return parts.length > 0 ? parts.join(' · ') : '—';
  };

  // Sub-categories — show the first verbatim Act label for context, with
  // a count tail when more than one applies (full list is on the
  // incident detail page).
  const subLabel = (r) => {
    const keys = [
      ...(r.serious_injury_sub_categories || []).map(k => s36Map.get(k) || k),
      ...(r.dangerous_incident_sub_categories || []).map(k => s37Map.get(k) || k),
    ];
    if (keys.length === 0) return '—';
    if (keys.length === 1) return keys[0];
    return `${keys[0]} (+${keys.length - 1})`;
  };

  // s.38 status pill: phone first, then written-clock state.
  const statusFor = (r) => {
    if (r.written_submitted_at)        return { txt: 'Written submitted', cls: 'rs-submitted' };
    if (r.regulator_requested_written_at) return { txt: 'Written pending', cls: 'rs-pending' };
    if (r.phone_notified_at)           return { txt: 'Phone notified',  cls: 'rs-submitted' };
    return { txt: 'Without delay',     cls: 'rs-pending' };
  };

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">SafeWork NSW · Notifiable Incidents</div>
          <div className="rpt-panel-sub">WHS Act 2011 (NSW) ss.35–39 · {rows.length} record{rows.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div className="rpt-panel-body">
        <div className="rpt-riddor-banner">
          <div className="rpt-riddor-icon"><Icon name="info" size={16}/></div>
          <div className="rpt-riddor-text">
            <b>SafeWork NSW notification timelines:</b> Notify the regulator <i>immediately</i>
            {' '}by the fastest possible means (s.38(1)/(3)) — telephone 13 10 50 or online portal at
            {' '}notifyform.safework.nsw.gov.au. If the regulator requests a written notice (s.38(4)(b)),
            {' '}submit it within 48 hours. This panel is the organisation's internal record; downloads
            {' '}from the incident page produce a record-copy PDF, not the regulator's submission receipt.
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="rpt-table">
            <thead>
              <tr>
                <th>NSW ref</th>
                <th>Source</th>
                <th>Event date</th>
                <th>Site</th>
                <th>s.35 category</th>
                <th>Sub-category (verbatim)</th>
                <th>s.38 status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const s = statusFor(r);
                return (
                  <tr key={r.id}>
                    <td className="cell-ref">{r.nsw_number}</td>
                    <td className="cell-ref">{r.incident_number || '—'}</td>
                    <td>{formatDateShort(r.event_date)}</td>
                    <td>{r.site_name || '—'}</td>
                    <td>
                      <span className="rpt-cat-pill" title="WHS Act 2011 (NSW) Part 3">
                        <span className="cat-dot"/>{categoryLabel(r)}
                      </span>
                    </td>
                    <td title={subLabel(r)}>{subLabel(r)}</td>
                    <td>
                      <span className={`rpt-status ${s.cls}`}>
                        <span className="rs-dot"/>{s.txt}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="cell-empty">No SafeWork NSW notifications for the selected site/year.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rpt-riddor-stats">
          <div className="rpt-riddor-stat">
            <div className="rpt-riddor-stat-label">Fatalities (s.35(a))</div>
            <div className="rpt-riddor-stat-val">{stats.fatalities}</div>
          </div>
          <div className="rpt-riddor-stat">
            <div className="rpt-riddor-stat-label">Serious injuries (s.35(b))</div>
            <div className="rpt-riddor-stat-val">{stats.serious}</div>
          </div>
          <div className="rpt-riddor-stat">
            <div className="rpt-riddor-stat-label">Dangerous incidents (s.35(c))</div>
            <div className="rpt-riddor-stat-val">{stats.dangerous}</div>
          </div>
          <div className="rpt-riddor-stat">
            <div className="rpt-riddor-stat-label">Mines &amp; Petroleum carve-out</div>
            <div className="rpt-riddor-stat-val">{stats.excluded}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricsReport({ siteId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (siteId) { setData(null); getMetrics({ site_id: siteId }).then(setData).catch(() => {}); }
  }, [siteId]);

  if (!data) return <ReportLoading/>;

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">Safety Metrics</div>
          <div className="rpt-panel-sub">Site-level incidence rates · YTD</div>
        </div>
      </div>
      <div className="rpt-panel-body">
        <div className="rpt-metrics-grid">
          <div className="rpt-metric-card rm-trir">
            <div className="rpt-metric-label">TRIR</div>
            <div className="rpt-metric-val">{data.trir?.toFixed(2) || '0.00'}</div>
            <div className="rpt-metric-sub">Total Recordable Incident Rate</div>
          </div>
          <div className="rpt-metric-card rm-dart">
            <div className="rpt-metric-label">DART</div>
            <div className="rpt-metric-val">{data.dart?.toFixed(2) || '0.00'}</div>
            <div className="rpt-metric-sub">Days Away, Restricted, Transfer</div>
          </div>
          <div className="rpt-metric-card rm-sev">
            <div className="rpt-metric-label">Severity Rate</div>
            <div className="rpt-metric-val">{data.severityRate?.toFixed(2) || '0.00'}</div>
            <div className="rpt-metric-sub">Days lost per 200,000 hours</div>
          </div>
          <div className="rpt-metric-card rm-cases">
            <div className="rpt-metric-label">Recordable Cases</div>
            <div className="rpt-metric-val">{data.totalRecordableCases || 0}</div>
            <div className="rpt-metric-sub">Year-to-date</div>
          </div>
          <div className="rpt-metric-formula">
            Formula: (cases × 200,000) ÷ total hours worked. Based on site-level data.
          </div>
        </div>
      </div>
    </div>
  );
}
