import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../api/dashboard';
import { listActiveStopWorks, acknowledgeStopWork } from '../api/stop_work';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import Icon from '../components/shared/Icon';
import { TYPES, typeOf } from '../components/shared/Badges';
import { timeAgo, formatDate } from '../utils/time';
import '../styles/dashboard.css';

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
        <circle cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
        {data.map((d, i) => {
          const pct = d.value / total;
          const dashLen = pct * circumference;
          const dashOffset = -offset;
          offset += dashLen;
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={d.color} strokeWidth={strokeWidth}
              strokeDasharray={`${dashLen} ${circumference - dashLen}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{
                transform: 'rotate(-90deg)',
                transformOrigin: '50% 50%',
                transition: 'stroke-dasharray 600ms cubic-bezier(0.4,0,0.2,1)',
              }}
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
    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, flex: 1 }}>
      <div style={{
        height: '100%', borderRadius: 4, background: color,
        width: `${Math.max(pct, 4)}%`,
        transition: 'width 500ms cubic-bezier(0.4,0,0.2,1)',
      }} />
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

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setWizardOpen, refreshKey } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStopWorks, setActiveStopWorks] = useState([]);

  const loadStopWorks = useCallback(() => {
    listActiveStopWorks().then(setActiveStopWorks).catch(() => setActiveStopWorks([]));
  }, []);

  useEffect(() => {
    getDashboard().then(setData).catch(() => {}).finally(() => setLoading(false));
    loadStopWorks();
  }, [refreshKey, loadStopWorks]);

  const elevated = ['supervisor', 'ehs_officer', 'ehs_manager', 'admin'].includes(user?.role);
  const handleAcknowledge = async (id) => {
    try { await acknowledgeStopWork(id); loadStopWorks(); }
    catch (e) { alert(e.response?.data?.error || 'Acknowledge failed'); }
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

  const oshaCount = (recentIncidents || []).filter(r => r.osha_recordable).length;
  const riddorCount = (recentIncidents || []).filter(r => r.riddor_reportable).length;

  return (
    <div className="page">
      {/* Active stop-work banner — sits above everything when present */}
      {activeStopWorks.length > 0 && (
        <div className="dash-stopwork-banner">
          <div className="dash-stopwork-icon"><Icon name="warning" size={22} color="#fff" /></div>
          <div className="dash-stopwork-body">
            <div className="dash-stopwork-title">
              {activeStopWorks.length === 1 ? 'ACTIVE STOP-WORK' : `${activeStopWorks.length} ACTIVE STOP-WORKS`}
            </div>
            <div className="dash-stopwork-list">
              {activeStopWorks.map((sw) => (
                <div key={sw.id} className="dash-stopwork-row" onClick={() => navigate(`/incidents/${sw.id}`)}>
                  <span className="dash-stopwork-num">{sw.incident_number}</span>
                  <span> — </span>
                  <span>{sw.area} · {sw.site_name || ''}</span>
                  {elevated && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginLeft: 'auto', background: '#fff', color: 'var(--sds-error)', borderColor: '#fff' }}
                      onClick={(e) => { e.stopPropagation(); handleAcknowledge(sw.id); }}
                    >
                      Acknowledge
                    </button>
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
          <button className="btn btn-tertiary btn-sm" onClick={() => navigate('/reports')}>
            <Icon name="reports" size={15} />Reports
          </button>
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            <Icon name="plus" size={16} />Report incident
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-row">
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

        <div className="kpi-card kpi-dart kpi-clickable" onClick={() => navigate('/reports')}>
          <div className="kpi-top">
            <div className="kpi-label">DART &middot; YTD</div>
            <div className="kpi-icon"><Icon name="person" size={18} /></div>
          </div>
          <div className="kpi-val"><KpiValue value={kpis.dart || 0} decimals={2} /></div>
          <div className="kpi-foot">Days away / restricted / transfer</div>
        </div>

        <div className="kpi-card kpi-open kpi-clickable" onClick={() => navigate('/incidents')}>
          <div className="kpi-top">
            <div className="kpi-label">Open incidents</div>
            <div className="kpi-icon"><Icon name="incidents" size={18} /></div>
          </div>
          <div className="kpi-val"><KpiValue value={kpis.openIncidents || 0} /></div>
          <div className="kpi-foot">
            <span style={{ fontWeight: 600, color: '#dc2626' }}>{tc.A || 0}</span> Track A
            <span style={{ color: 'var(--sds-border)' }}>&middot;</span>
            <span style={{ fontWeight: 600, color: '#d97706' }}>{tc.B || 0}</span> Track B
            <span style={{ color: 'var(--sds-border)' }}>&middot;</span>
            <span style={{ fontWeight: 600, color: '#059669' }}>{tc.C || 0}</span> Track C
          </div>
        </div>

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
      </div>

      {/* Main grid */}
      <div className="dash-grid">
        <div className="dash-left">
          {/* Incident type distribution + Track routing */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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

            <div className="dash-card">
              <div className="dash-card-h">
                <div className="title"><span className="dot-accent" />Track routing</div>
                <span style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)', fontWeight: 600 }}>{totalOpen} open</span>
              </div>
              <div className="track-pipeline">
                <div className="track-lane t-a">
                  <div className="track-letter">A</div>
                  <div className="track-count">{tc.A || 0}</div>
                  <div className="track-name">Full investigation</div>
                  <div className="track-desc">Sev 1-2 &middot; Critical &amp; major</div>
                </div>
                <div className="track-lane t-b">
                  <div className="track-letter">B</div>
                  <div className="track-count">{tc.B || 0}</div>
                  <div className="track-name">Light investigation</div>
                  <div className="track-desc">Sev 3 &middot; Moderate risk</div>
                </div>
                <div className="track-lane t-c">
                  <div className="track-letter">C</div>
                  <div className="track-count">{tc.C || 0}</div>
                  <div className="track-name">Log &amp; close</div>
                  <div className="track-desc">Sev 4-5 &middot; Minor / obs.</div>
                </div>
              </div>

              {/* Regulatory flags */}
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
          </div>

          {/* Recent incidents */}
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
        </div>

        {/* Right column */}
        <div className="dash-right">
          {/* Activity feed */}
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

          {/* Quick actions */}
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
        </div>
      </div>
    </div>
  );
}
