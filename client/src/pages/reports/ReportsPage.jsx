import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getOsha300, getOsha300A, getRiddor, getMetrics } from '../../api/reports';
import { getSites } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import CertifyOsha300AModal from '../../components/modals/CertifyOsha300AModal';
import { formatDateShort, formatDate } from '../../utils/time';
import '../../styles/reports.css';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const REPORT_TYPES = [
  { id: 'osha300', cls: 'rt-osha300', badge: 'OSHA · US', title: 'OSHA 300 Log', desc: 'Running log of recordable injuries & illnesses.' },
  { id: 'osha300a', cls: 'rt-osha300a', badge: 'OSHA · US', title: 'OSHA 300A Summary', desc: 'Annual summary, posted Feb 1 – Apr 30.' },
  { id: 'riddor', cls: 'rt-riddor', badge: 'HSE · UK', title: 'RIDDOR F2508', desc: 'Event-triggered to HSE. Sheffield site only.' },
  { id: 'metrics', cls: 'rt-metrics', badge: 'Internal', title: 'Safety Metrics', desc: 'TRIR, DART, severity rate.' },
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
  const [tab, setTab] = useState('osha300');
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');

  useEffect(() => {
    getSites().then(data => { setSites(data); if (data.length > 0) setSiteId(String(data[0].id)); });
  }, []);

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
      <div className="rpt-type-grid">
        {REPORT_TYPES.map(r => (
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
