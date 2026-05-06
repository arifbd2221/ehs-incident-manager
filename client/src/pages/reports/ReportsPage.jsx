import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getOsha300, getOsha300A, getRiddor, getMetrics, getAuditLog, getAuditActions } from '../../api/reports';
import { getSites, getUsers } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import CertifyOsha300AModal from '../../components/modals/CertifyOsha300AModal';
import { formatDateShort, formatDate } from '../../utils/time';
import '../../styles/reports.css';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
// Audit log is narrower than ELEVATED — compliance/upper-management only.
// Mirrors AUDIT_ROLES on the BE; supervisors are intentionally excluded.
const AUDIT_ROLES = new Set(['ehs_officer', 'ehs_manager', 'admin']);

const REPORT_TYPES = [
  { id: 'osha300', cls: 'rt-osha300', badge: 'OSHA · US', title: 'OSHA 300 Log', desc: 'Running log of recordable injuries & illnesses.' },
  { id: 'osha300a', cls: 'rt-osha300a', badge: 'OSHA · US', title: 'OSHA 300A Summary', desc: 'Annual summary, posted Feb 1 – Apr 30.' },
  { id: 'riddor', cls: 'rt-riddor', badge: 'HSE · UK', title: 'RIDDOR F2508', desc: 'Event-triggered to HSE. Sheffield site only.' },
  { id: 'metrics', cls: 'rt-metrics', badge: 'Internal', title: 'Safety Metrics', desc: 'TRIR, DART, severity rate.' },
  { id: 'audit', cls: 'rt-audit', badge: 'Internal · Audit', title: 'Audit Log', desc: 'Filterable trail of every change. Export for inspector requests.', requiresAudit: true },
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
  const visibleReports = REPORT_TYPES.filter(r => !r.requiresAudit || canSeeAudit);

  const [tab, setTab] = useState('osha300');
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');

  useEffect(() => {
    getSites().then(data => { setSites(data); if (data.length > 0) setSiteId(String(data[0].id)); });
  }, []);

  // Defensive: if a user without audit access deep-links into audit somehow,
  // bounce them to the first visible report.
  useEffect(() => {
    if (tab === 'audit' && !canSeeAudit) setTab('osha300');
  }, [tab, canSeeAudit]);

  return (
    <div className="page">
      {/* Hero */}
      <div className="rpt-hero">
        <div>
          <h1 className="rpt-heading">Reports</h1>
          <p className="rpt-subtitle">Continuous regulatory output, auto-generated from incident data.</p>
        </div>
        <select className="rpt-site-select" value={siteId} onChange={e => setSiteId(e.target.value)}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Report type selector */}
      <div className="rpt-type-grid">
        {visibleReports.map(r => (
          <div key={r.id} className={`rpt-type-card ${r.cls} ${tab === r.id ? 'active' : ''}`} onClick={() => setTab(r.id)}>
            <div className="rpt-type-badge">{r.badge}</div>
            <div className="rpt-type-title">{r.title}</div>
            <div className="rpt-type-desc">{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Report content */}
      {tab === 'osha300' && <Osha300Report siteId={siteId}/>}
      {tab === 'osha300a' && <Osha300AReport siteId={siteId}/>}
      {tab === 'riddor' && <RiddorReport siteId={siteId}/>}
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
const ENTITY_TYPES = [
  'incident', 'investigation', 'capa',
  'site', 'asset', 'asset_category',
  'document', 'folder', 'link',
  'user', 'template', 'inspection', 'answer_set', 'system',
];

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
    if (Array.isArray(q.actions)) {
      if (q.actions.length > 0) q.action = q.actions.join(',');
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
        {/* Filter form — uses shared .field / .input / .select classes */}
        <form className="al-filters" onSubmit={onApply}>
          <div className="al-filter-row">
            <div className="field">
              <label className="label">
                Entity types <span className="al-label-hint">multi-select</span>
              </label>
              <MultiPicker
                items={ENTITY_TYPES.map(t => ({ key: t, label: t }))}
                value={filters.entity_types}
                onChange={(next) => setF('entity_types', next)}
                placeholder="All entities"
                labelMany={(n) => `${n} types selected`}
                isGrouped={false}
                disabled={!!filters.entity_number}
              />
            </div>
            <div className="field">
              <label className="label">
                Entity number <span className="al-label-hint">overrides type</span>
              </label>
              <input
                className="input"
                placeholder="INC-2026-0150, CAPA-048, AST-2026-00001…"
                value={filters.entity_number}
                onChange={e => setF('entity_number', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">
                Actors <span className="al-label-hint">multi-select</span>
              </label>
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
            <div className="field">
              <label className="label">
                Actions <span className="al-label-hint">multi-select</span>
              </label>
              <MultiPicker
                items={(filters.entity_types.length > 0
                  ? actions.filter(a => filters.entity_types.includes(a.entity_type))
                  : actions
                ).map(a => ({ key: a.action, label: a.action, count: a.count, group: a.entity_type }))}
                value={filters.actions}
                onChange={(next) => setF('actions', next)}
                placeholder="Any action"
                labelMany={(n) => `${n} actions selected`}
                isGrouped={true}
              />
            </div>
          </div>
          <div className="al-filter-row">
            <div className="field">
              <label className="label">From (inclusive)</label>
              <input className="input" type="date" value={filters.from} onChange={e => setF('from', e.target.value)} />
            </div>
            <div className="field">
              <label className="label">To (exclusive)</label>
              <input className="input" type="date" value={filters.to} onChange={e => setF('to', e.target.value)} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label className="label">Description contains</label>
              <input className="input" placeholder="search description text" value={filters.q} onChange={e => setF('q', e.target.value)} />
            </div>
            <div className="field al-filter-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Icon name="filter" size={14}/> Apply filters
              </button>
              <button type="button" className="btn btn-secondary" disabled={exporting || data.total === 0} onClick={downloadCsv}>
                <Icon name="download" size={14}/> {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </div>
        </form>

        {err && <div className="al-err"><Icon name="warning" size={14}/> {err}</div>}

        <div className="al-meta">
          <span><b>{data.total}</b> row{data.total === 1 ? '' : 's'} match these filters</span>
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
  const [data, setData] = useState(null);
  useEffect(() => {
    if (siteId) { setData(null); getOsha300({ site_id: siteId }).then(setData).catch(() => {}); }
  }, [siteId]);

  if (!data) return <ReportLoading/>;

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">OSHA 300 Log · Live Preview</div>
          <div className="rpt-panel-sub">{data.site?.name} · YTD {data.year}</div>
        </div>
        <span className="rpt-auto-badge"><span className="auto-dot"/>Auto-updates</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="rpt-table" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th>Case #</th><th>Employee</th><th>Date</th><th>Where</th><th>Description</th>
              <th>Death</th><th>Days away</th><th>Restrict.</th><th>Other</th><th>Type</th>
            </tr>
          </thead>
          <tbody>
            {(data.entries || []).map(e => (
              <tr key={e.id}>
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
                <td>{e.injury_type}</td>
              </tr>
            ))}
            {data.entries?.length === 0 && (
              <tr><td colSpan={10} className="cell-empty">No recordable entries this year</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="rpt-panel-footer">
        <span className="foot-item">Total cases<b>{data.entries?.length || 0}</b></span>
      </div>
    </div>
  );
}

function Osha300AReport({ siteId }) {
  const { user } = useAuth();
  const canCertify = ELEVATED_ROLES.has(user?.role);
  const [data, setData] = useState(null);
  const [showCertify, setShowCertify] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => {
    if (siteId) {
      setData(null);
      getOsha300A({ site_id: siteId }).then(setData).catch(() => {});
    }
  };
  useEffect(load, [siteId]);

  if (!data) return <ReportLoading/>;

  const totalCases = (data.cases?.deaths || 0) + (data.cases?.days_away || 0) + (data.cases?.job_transfer || 0) + (data.cases?.other_recordable || 0);

  return (
    <div className="rpt-panel">
      <div className="rpt-panel-header">
        <div>
          <div className="rpt-panel-title">OSHA 300A · Annual Summary</div>
          <div className="rpt-panel-sub">{data.site?.name} · Calendar year {data.year}</div>
        </div>
        <div className="rpt-300a-cert-area">
          {data.certification ? (
            <div className="rpt-300a-cert-stamp">
              <div className="rpt-300a-cert-stamp-icon"><Icon name="check" size={14}/></div>
              <div>
                <div className="rpt-300a-cert-stamp-title">Signed</div>
                <div className="rpt-300a-cert-stamp-meta">
                  by <b>{data.certification.certifier_name}</b>
                  {data.certification.certifier_title ? `, ${data.certification.certifier_title}` : ''}
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
        <div className="rpt-300a-toast"><Icon name="check" size={14}/>{toast}</div>,
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
                  <td><span className="rpt-cat-pill"><span className="cat-dot"/>{r.category?.replace(/_/g, ' ')}</span></td>
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
