// SiteDetail.jsx — /admin/sites/:id
//
// Reads the enriched payload from GET /api/sites/:id (parent, ancestors,
// children, counts, recent_incidents, recent_assets) plus a separate
// per-site work_hours fetch for the periods card.
//
// The work_hours section is the primary first-class block on this page —
// EHS managers spend time here entering/editing periods every month.
// Year-grouped totals + YoY delta are the visual proof that VelocityEHS
// and EcoOnline put front-and-center; rate cards (TRIR/DART/LTIR) land
// in a follow-up commit alongside the metrics.js switch.
import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { getSite } from '../../api/sites';
import { getWorkHours, deleteWorkHours, workHoursExportUrl } from '../../api/workHours';
import Icon from '../../components/shared/Icon';
import WorkHoursModal from './WorkHoursModal';
import '../../styles/sites.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const SEV_LABEL = { 1: 'S1 Critical', 2: 'S2 Major', 3: 'S3 Moderate', 4: 'S4 Minor', 5: 'S5 Insignificant' };

const fmtInt = (n) => (n ?? 0).toLocaleString();
const fmtIntOrDash = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());

function periodDays(startIso, endIso) {
  const a = new Date(startIso + 'T00:00:00Z').getTime();
  const b = new Date(endIso + 'T00:00:00Z').getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}

// Groups rows by calendar year of period_start, sorted DESC. Each year aggregate
// includes weighted avg_employees (by period length) + contractor totals.
// YoY delta is computed against the immediately-prior year if present.
function groupByYear(rows) {
  const byYear = new Map();
  for (const r of rows) {
    const y = Number(r.period_start.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(r);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  const summaries = years.map(y => {
    const list = byYear.get(y);
    let sumHours = 0, sumContractor = 0, contractorPeriods = 0;
    let weightedNumer = 0, weightedDenom = 0;
    for (const r of list) {
      sumHours += r.hours_worked || 0;
      if (r.contractor_hours_worked != null) {
        sumContractor += r.contractor_hours_worked;
        contractorPeriods++;
      }
      if (r.avg_employees != null) {
        const days = periodDays(r.period_start, r.period_end);
        weightedNumer += r.avg_employees * days;
        weightedDenom += days;
      }
    }
    const weightedEmp = weightedDenom > 0 ? Math.round(weightedNumer / weightedDenom) : null;
    return {
      year: y,
      rows: list,
      sumHours,
      count: list.length,
      weightedEmp,
      sumContractor: contractorPeriods > 0 ? sumContractor : null,
    };
  });

  // YoY delta against prior year. Index i+1 is older (DESC order).
  for (let i = 0; i < summaries.length; i++) {
    const prior = summaries[i + 1];
    if (prior && prior.sumHours > 0) {
      summaries[i].yoyPct = ((summaries[i].sumHours - prior.sumHours) / prior.sumHours) * 100;
    } else {
      summaries[i].yoyPct = null;
    }
  }
  return summaries;
}

export default function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [periods, setPeriods] = useState([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Year for rate cards. Defaults to current calendar year. The cards re-fetch
  // whenever this changes; periods are NOT filtered by the year selector
  // (periods table shows the full history grouped by year).
  const [rateYear, setRateYear] = useState(() => new Date().getFullYear());
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getSite(id)
      .then(setSite)
      .catch(e => setErr(e.response?.data?.error || 'Failed to load site'))
      .finally(() => setLoading(false));
  }, [id]);

  const refreshPeriods = useCallback(() => {
    if (!id) return;
    setPeriodsLoading(true);
    getWorkHours(Number(id))
      .then(setPeriods)
      .catch(() => setPeriods([]))
      .finally(() => setPeriodsLoading(false));
  }, [id]);

  useEffect(() => {
    refreshPeriods();
  }, [refreshPeriods]);

  // Fetch metrics whenever the chosen year or the periods change (e.g., after
  // an Add/Edit/Delete the rates for that year may shift).
  useEffect(() => {
    if (!id) return;
    setMetricsLoading(true);
    api.get('/reports/site-metrics', { params: { site_id: id, year: rateYear } })
      .then(r => setMetrics(r.data?.metrics || null))
      .catch(() => setMetrics(null))
      .finally(() => setMetricsLoading(false));
  }, [id, rateYear, periods]);

  const yearGroups = useMemo(() => groupByYear(periods), [periods]);
  // Most recent period — used by the modal for "auto-fill from prior".
  const latestPeriod = periods[0] || null;

  // Year selector options for the rate cards. Combines years that have periods
  // with a 5-year window around the current year so the picker is never empty.
  const rateYearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const set = new Set([cy - 1, cy, cy + 1]);
    for (const g of yearGroups) set.add(g.year);
    return [...set].sort((a, b) => b - a);
  }, [yearGroups]);

  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const handleEdit = (row) => {
    setEditing(row);
    setModalOpen(true);
  };
  const handleDelete = async (row) => {
    const range = `${row.period_start} → ${row.period_end}`;
    if (!window.confirm(`Delete work hours for ${range}? This cannot be undone.`)) return;
    try {
      await deleteWorkHours(row.id);
      refreshPeriods();
    } catch (e) {
      window.alert(e.response?.data?.error || 'Failed to delete');
    }
  };
  const handleSaved = () => {
    setModalOpen(false);
    setEditing(null);
    refreshPeriods();
  };

  // The export endpoint requires a JWT, so fetch with auth header and trigger
  // a blob download — same pattern ImportModal uses for templates.
  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(workHoursExportUrl(site.id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `work_hours_${site.name.replace(/[^a-z0-9_-]+/gi, '_')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(e.message || 'Export failed');
    }
  };

  if (loading) {
    return (
      <div className="page sites-page">
        <div className="sites-loading">Loading…</div>
      </div>
    );
  }

  if (err || !site) {
    return (
      <div className="page sites-page">
        <button className="btn btn-tertiary btn-sm sd-back" onClick={() => navigate('/admin/sites')}>
          <Icon name="arrowL" size={14} /> Back to sites
        </button>
        <div className="sites-empty">{err || 'Site not found'}</div>
      </div>
    );
  }

  const hasCompliance = site.naics_code || site.establishment_id || site.hse_establishment_id;

  return (
    <div className="page sites-page">
      <button className="btn btn-tertiary btn-sm sd-back" onClick={() => navigate('/admin/sites')}>
        <Icon name="arrowL" size={14} /> Back to sites
      </button>

      <div className="sd-hero">
        <div className="sd-hero-main">
          {site.ancestors && site.ancestors.length > 0 && (
            <div className="sd-bread">
              {site.ancestors.map((a) => (
                <span key={a.id} className="sd-bread-item">
                  <button
                    type="button"
                    className="sd-bread-link"
                    onClick={() => navigate(`/admin/sites/${a.id}`)}
                  >
                    {a.name}
                  </button>
                  <span className="sd-bread-sep">/</span>
                </span>
              ))}
              <span className="sd-bread-current">{site.name}</span>
            </div>
          )}
          <h1 className="sites-title">
            <span className="site-flag">{site.country || '—'}</span>
            {site.name}
          </h1>
          <p className="sites-sub">
            {site.address || 'No address provided'} · {site.timezone || '—'}
            {site.parent && (
              <>
                {' · '}
                <span className="sd-parent-chip">
                  <Icon name="factory" size={11} /> Sub-site of {site.parent.name}
                </span>
              </>
            )}
          </p>
        </div>
        {canEdit && (
          <div className="sd-hero-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/sites')}>
              <Icon name="edit" size={14} /> Manage
            </button>
          </div>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-row">
            <div>
              <div className="lbl">Open incidents</div>
              <div className="val">{site.counts?.open_incidents ?? 0}</div>
              <div className="sub">{site.counts?.total_incidents ?? 0} total ever</div>
            </div>
            <div className="stat-icon"><Icon name="incidents" size={18} /></div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-row">
            <div>
              <div className="lbl">Assets</div>
              <div className="val">{site.counts?.assets ?? 0}</div>
              <div className="sub">active at this site</div>
            </div>
            <div className="stat-icon"><Icon name="factory" size={18} /></div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-row">
            <div>
              <div className="lbl">People</div>
              <div className="val">{site.counts?.users ?? 0}</div>
              <div className="sub">assigned to site</div>
            </div>
            <div className="stat-icon"><Icon name="person" size={18} /></div>
          </div>
        </div>
        <div className="stat">
          <div className="stat-row">
            <div>
              <div className="lbl">Sub-sites</div>
              <div className="val">{site.counts?.children ?? 0}</div>
              <div className="sub">direct children</div>
            </div>
            <div className="stat-icon"><Icon name="factory" size={18} /></div>
          </div>
        </div>
      </div>

      {/* Safety performance — TRIR / DART / LTIR / Severity Rate (OSHA 200K denom).
          Year-scoped, computed live from work_hours + osha_300_log. */}
      <div className="card card-pad">
        <div className="card-h">
          <Icon name="pulse" size={16} /> Safety performance
          <span className="sd-count-pill">{rateYear}</span>
          <span style={{ marginLeft: 'auto' }}>
            <select
              className="select"
              value={rateYear}
              onChange={e => setRateYear(Number(e.target.value))}
              style={{ width: 'auto', minWidth: 110 }}
            >
              {rateYearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </span>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-row">
              <div>
                <div className="lbl">TRIR</div>
                <div className="val">{metricsLoading ? '…' : (metrics?.trir ?? 0).toFixed(2)}</div>
                <div className="sub">{metrics?.totalRecordableCases ?? 0} recordable cases</div>
              </div>
              <div className="stat-icon"><Icon name="warning" size={18} /></div>
            </div>
          </div>
          <div className="stat">
            <div className="stat-row">
              <div>
                <div className="lbl">DART</div>
                <div className="val">{metricsLoading ? '…' : (metrics?.dart ?? 0).toFixed(2)}</div>
                <div className="sub">{metrics?.dartCases ?? 0} DART cases</div>
              </div>
              <div className="stat-icon"><Icon name="incidents" size={18} /></div>
            </div>
          </div>
          <div className="stat">
            <div className="stat-row">
              <div>
                <div className="lbl">LTIR</div>
                <div className="val">{metricsLoading ? '…' : (metrics?.ltir ?? 0).toFixed(2)}</div>
                <div className="sub">{metrics?.daysAwayCases ?? 0} days-away cases</div>
              </div>
              <div className="stat-icon"><Icon name="clock" size={18} /></div>
            </div>
          </div>
          <div className="stat">
            <div className="stat-row">
              <div>
                <div className="lbl">Severity Rate</div>
                <div className="val">{metricsLoading ? '…' : (metrics?.severityRate ?? 0).toFixed(2)}</div>
                <div className="sub">{metrics?.totalDaysAway ?? 0} total days away</div>
              </div>
              <div className="stat-icon"><Icon name="pulse" size={18} /></div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--sds-fg-tertiary)' }}>
          OSHA 1904 200,000-hour denominator · {fmtInt(metrics?.totalHoursWorked || 0)} employee hours over{' '}
          {metrics?.workHoursPeriods || 0} period{metrics?.workHoursPeriods === 1 ? '' : 's'} · weighted avg.{' '}
          {fmtInt(metrics?.annualAvgEmployees || 0)} employees
          {metrics?.contractorHoursWorked > 0 && (
            <> · contractor hours: {fmtInt(metrics.contractorHoursWorked)} ({metrics.contractorPeriods} periods)</>
          )}
        </div>
      </div>

      {/* Work hours — primary first-class block. Year-grouped, YoY delta, manual CRUD. */}
      <div className="card card-pad">
        <div className="card-h">
          <Icon name="clock" size={16} /> Work hours
          <span className="sd-count-pill">{periods.length} period{periods.length === 1 ? '' : 's'}</span>
          {canEdit && (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
              <button className="btn btn-tertiary btn-sm" onClick={handleExport}>
                <Icon name="download" size={14} /> Export CSV
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>
                <Icon name="plus" size={14} /> Add work hours
              </button>
            </span>
          )}
        </div>

        {periodsLoading ? (
          <div className="sd-empty">Loading periods…</div>
        ) : periods.length === 0 ? (
          <div className="sd-empty">
            No work hours recorded yet.
            {canEdit && ' Click "Add work hours" to enter the first period, or import a CSV from the sites list.'}
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th>Employee hours</th>
                <th>Avg. employees</th>
                <th>Contractor hours</th>
                <th>Avg. contractors</th>
                <th>Notes</th>
                {canEdit && <th style={{ width: 80 }}></th>}
              </tr>
            </thead>
            <tbody>
              {yearGroups.map(g => (
                <Fragment key={g.year}>
                  <tr style={{ background: 'var(--sds-bg-surface-alt)', fontWeight: 600 }}>
                    <td>
                      {g.year} subtotal
                      <div className="meta">{g.count} period{g.count === 1 ? '' : 's'}</div>
                    </td>
                    <td>{fmtInt(g.sumHours)}</td>
                    <td>{g.weightedEmp != null ? fmtInt(g.weightedEmp) : '—'}</td>
                    <td>{g.sumContractor != null ? fmtInt(g.sumContractor) : '—'}</td>
                    <td>—</td>
                    <td>
                      {g.yoyPct !== null && g.yoyPct !== undefined ? (
                        <span className={`pill ${g.yoyPct >= 0 ? 'pill-success' : 'pill-warn'}`}>
                          {g.yoyPct >= 0 ? '▲' : '▼'} {Math.abs(g.yoyPct).toFixed(1)}% YoY
                        </span>
                      ) : <span style={{ color: 'var(--sds-fg-tertiary)' }}>—</span>}
                    </td>
                    {canEdit && <td></td>}
                  </tr>
                  {g.rows.map(r => (
                    <tr key={r.id}>
                      <td>
                        {r.period_start} → {r.period_end}
                        <div className="meta">{periodDays(r.period_start, r.period_end)} days</div>
                      </td>
                      <td>{fmtInt(r.hours_worked)}</td>
                      <td>{fmtIntOrDash(r.avg_employees)}</td>
                      <td>{fmtIntOrDash(r.contractor_hours_worked)}</td>
                      <td>{fmtIntOrDash(r.contractor_avg_employees)}</td>
                      <td style={{ maxWidth: 240 }}>
                        <span style={{ color: 'var(--sds-fg-tertiary)' }}>{r.notes || '—'}</span>
                      </td>
                      {canEdit && (
                        <td>
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            <button
                              className="icon-btn"
                              onClick={() => handleEdit(r)}
                              aria-label="Edit period"
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => handleDelete(r)}
                              aria-label="Delete period"
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sub-sites */}
      <div className="card card-pad">
        <div className="card-h">
          <Icon name="factory" size={16} /> Sub-sites
          <span className="sd-count-pill">{site.children?.length || 0}</span>
        </div>
        {site.children && site.children.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Country</th>
                <th>Employees</th>
                <th>Time zone</th>
              </tr>
            </thead>
            <tbody>
              {site.children.map(c => (
                <tr
                  key={c.id}
                  className="sd-row"
                  onClick={() => navigate(`/admin/sites/${c.id}`)}
                >
                  <td>{c.name}</td>
                  <td>{c.country || '—'}</td>
                  <td>{fmtInt(c.annual_avg_employees)}</td>
                  <td>{c.timezone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="sd-empty">
            No sub-sites yet. {canEdit && 'Create one from the sites list and pick this site as its parent.'}
          </div>
        )}
      </div>

      {/* Recent incidents */}
      <div className="card card-pad">
        <div className="card-h">
          <Icon name="incidents" size={16} /> Recent incidents
          <span className="sd-count-pill">{site.recent_incidents?.length || 0} of {site.counts?.total_incidents ?? 0}</span>
          {site.counts?.total_incidents > 0 && (
            <span className="more" onClick={() => navigate(`/incidents?site=${site.id}`)}>View all →</span>
          )}
        </div>
        {site.recent_incidents && site.recent_incidents.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Track</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {site.recent_incidents.map(i => (
                <tr
                  key={i.id}
                  className="sd-row"
                  onClick={() => navigate(`/incidents/${i.id}`)}
                >
                  <td className="id">{i.incident_number}</td>
                  <td>{i.title}</td>
                  <td>
                    {i.severity ? (
                      <span className={`pill pill-sev-${i.severity}`}>{SEV_LABEL[i.severity] || `S${i.severity}`}</span>
                    ) : '—'}
                  </td>
                  <td>{i.track ? <span className={`pill pill-track-${i.track.toLowerCase()}`}>Track {i.track}</span> : '—'}</td>
                  <td>{i.status}</td>
                  <td>{i.incident_datetime?.slice(0, 10) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="sd-empty">No incidents reported at this site yet.</div>
        )}
      </div>

      {/* Recent assets */}
      <div className="card card-pad">
        <div className="card-h">
          <Icon name="factory" size={16} /> Recent assets
          <span className="sd-count-pill">{site.recent_assets?.length || 0} of {site.counts?.assets ?? 0}</span>
          {site.counts?.assets > 0 && (
            <span className="more" onClick={() => navigate(`/assets?site=${site.id}`)}>View all →</span>
          )}
        </div>
        {site.recent_assets && site.recent_assets.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Number</th>
                <th>Name</th>
                <th>Type</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {site.recent_assets.map(a => (
                <tr
                  key={a.id}
                  className="sd-row"
                  onClick={() => navigate(`/assets/${a.id}`)}
                >
                  <td className="id">{a.asset_number}</td>
                  <td>{a.name}</td>
                  <td>{a.asset_type || '—'}</td>
                  <td>{a.location_description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="sd-empty">No assets registered at this site yet.</div>
        )}
      </div>

      <div className="sd-grid-2">
        {/* Compliance */}
        <div className="card card-pad">
          <div className="card-h"><Icon name="shield" size={16} /> Compliance IDs</div>
          {hasCompliance ? (
            <div className="sd-kv-list">
              <div className="sd-kv"><div className="sd-kv-k">NAICS code</div><div className="sd-kv-v">{site.naics_code || '—'}</div></div>
              <div className="sd-kv"><div className="sd-kv-k">OSHA establishment</div><div className="sd-kv-v">{site.establishment_id || '—'}</div></div>
              <div className="sd-kv"><div className="sd-kv-k">HSE establishment</div><div className="sd-kv-v">{site.hse_establishment_id || '—'}</div></div>
            </div>
          ) : (
            <div className="sd-empty">No compliance IDs recorded.</div>
          )}
        </div>

        {/* Workforce */}
        <div className="card card-pad">
          <div className="card-h"><Icon name="person" size={16} /> Workforce</div>
          <div className="sd-kv-list">
            <div className="sd-kv"><div className="sd-kv-k">Annual avg. employees</div><div className="sd-kv-v">{fmtInt(site.annual_avg_employees)}</div></div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <WorkHoursModal
          siteId={site.id}
          siteName={site.name}
          existing={editing}
          latest={latestPeriod}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

