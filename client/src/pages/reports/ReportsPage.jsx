import { useState, useEffect } from 'react';
import { getOsha300, getOsha300A, getRiddor, getMetrics } from '../../api/reports';
import { getSites } from '../../api/users';
import Icon from '../../components/shared/Icon';
import { formatDateShort } from '../../utils/time';

export default function ReportsPage() {
  const [tab, setTab] = useState('osha300');
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');

  useEffect(() => {
    getSites().then(data => { setSites(data); if (data.length > 0) setSiteId(String(data[0].id)); });
  }, []);

  return (
    <div className="page">
      <div className="flex between mb-16">
        <div>
          <h1 className="page-h">Reports</h1>
          <p className="page-sub">Continuous regulatory output, auto-generated from incident data.</p>
        </div>
        <div className="flex gap-8">
          <select className="select" style={{ width: 'auto', fontSize: 13 }} value={siteId} onChange={e => setSiteId(e.target.value)}>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid-4 mb-16">
        {[
          ['osha300', 'OSHA 300 Log', 'OSHA · US', 'Running log of recordable injuries & illnesses.'],
          ['osha300a', 'OSHA 300A Summary', 'OSHA · US', 'Annual summary, posted Feb 1 – Apr 30.'],
          ['riddor', 'RIDDOR F2508', 'HSE · UK', 'Event-triggered to HSE. Sheffield site only.'],
          ['metrics', 'Safety Metrics', 'Internal', 'TRIR, DART, severity rate.'],
        ].map(([id, t, b, d]) => (
          <div key={id} className={`rep-card ${id === 'riddor' ? 'uk' : ''}`} onClick={() => setTab(id)} style={tab === id ? { borderColor: 'var(--sds-brand-primary)', boxShadow: 'var(--sds-shadow-card)' } : {}}>
            <span className="badge">{b}</span>
            <div className="ttl">{t}</div>
            <div className="desc">{d}</div>
          </div>
        ))}
      </div>

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
    if (siteId) getOsha300({ site_id: siteId }).then(setData).catch(() => {});
  }, [siteId]);

  if (!data) return <div className="card card-pad"><div className="text-mute">Loading...</div></div>;

  return (
    <div className="card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--sds-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>OSHA 300 Log · live preview</div>
          <div className="text-mute fs-12">{data.site?.name} · YTD {data.year}</div>
        </div>
        <div style={{ flex: 1 }}/>
        <span className="pill pill-success"><span className="dot"/>Auto-updates</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th>Case #</th><th>Employee</th><th>Date</th><th>Where</th><th>Description</th>
              <th>Death</th><th>Days away</th><th>Restrict.</th><th>Other</th><th>Type</th>
            </tr>
          </thead>
          <tbody>
            {(data.entries || []).map(e => (
              <tr key={e.id}>
                <td className="id">{e.case_number}</td>
                <td><div style={{ fontWeight: 600 }}>{e.employee_name}</div><div className="text-mute fs-11">{e.job_title}</div></td>
                <td className="fs-12">{formatDateShort(e.injury_date)}</td>
                <td className="fs-12">{e.location}</td>
                <td className="fs-12">{e.description}</td>
                <td style={{ textAlign: 'center' }}>{e.classification_death ? '✓' : ''}</td>
                <td style={{ textAlign: 'center' }}>{e.classification_days_away ? '✓' : ''}</td>
                <td style={{ textAlign: 'center' }}>{e.classification_job_transfer ? '✓' : ''}</td>
                <td style={{ textAlign: 'center' }}>{e.classification_other ? '✓' : ''}</td>
                <td className="fs-12">{e.injury_type}</td>
              </tr>
            ))}
            {data.entries?.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24 }}>No entries</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--sds-border)', display: 'flex', gap: 24, fontSize: 12 }}>
        <div><span className="text-mute">Total cases</span> <b style={{ marginLeft: 6 }}>{data.entries?.length || 0}</b></div>
      </div>
    </div>
  );
}

function Osha300AReport({ siteId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (siteId) getOsha300A({ site_id: siteId }).then(setData).catch(() => {});
  }, [siteId]);

  if (!data) return <div className="card card-pad"><div className="text-mute">Loading...</div></div>;

  return (
    <div className="card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--sds-border)' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>OSHA 300A · Annual Summary</div>
        <div className="text-mute fs-12">{data.site?.name} · Calendar year {data.year}</div>
      </div>
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div className="card-h" style={{ marginBottom: 12 }}>Number of Cases</div>
          <table className="tbl">
            <tbody>
              <tr><td>Deaths (G)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{data.cases?.deaths || 0}</td></tr>
              <tr><td>Days away from work (H)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{data.cases?.days_away || 0}</td></tr>
              <tr><td>Job transfer or restriction (I)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{data.cases?.job_transfer || 0}</td></tr>
              <tr><td>Other recordable (J)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{data.cases?.other_recordable || 0}</td></tr>
              <tr style={{ background: 'var(--sds-brand-primary-tint)' }}>
                <td style={{ fontWeight: 700 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--sds-brand-primary)' }}>{(data.cases?.deaths || 0) + (data.cases?.days_away || 0) + (data.cases?.job_transfer || 0) + (data.cases?.other_recordable || 0)}</td>
              </tr>
            </tbody>
          </table>
          <div className="card-h" style={{ marginTop: 24, marginBottom: 12 }}>Number of Days</div>
          <table className="tbl">
            <tbody>
              <tr><td>Days away from work (K)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{data.cases?.total_days_away || 0}</td></tr>
              <tr><td>Days of restriction (L)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{data.cases?.total_days_restricted || 0}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className="card-h" style={{ marginBottom: 12 }}>Establishment Information</div>
          <div className="col gap-8 fs-13">
            <div className="flex between"><span className="text-sec">Avg employees</span><b>{data.site?.annual_avg_employees || '—'}</b></div>
            <div className="flex between"><span className="text-sec">Total hours</span><b>{data.site?.total_hours_worked || '—'}</b></div>
            <div className="flex between"><span className="text-sec">NAICS code</span><b>{data.site?.naics_code || '—'}</b></div>
          </div>
          {data.metrics && (
            <>
              <div className="card-h" style={{ marginTop: 24, marginBottom: 12 }}>Rates</div>
              <div className="col gap-8 fs-13">
                <div className="flex between"><span className="text-sec">TRIR</span><b style={{ color: 'var(--sds-brand-primary)' }}>{data.metrics.trir?.toFixed(2) || '—'}</b></div>
                <div className="flex between"><span className="text-sec">DART</span><b style={{ color: 'var(--sds-brand-primary)' }}>{data.metrics.dart?.toFixed(2) || '—'}</b></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RiddorReport({ siteId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    getRiddor({ site_id: siteId }).then(setData).catch(() => {});
  }, [siteId]);

  if (!data) return <div className="card card-pad"><div className="text-mute">Loading...</div></div>;

  return (
    <div className="card">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--sds-border)' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>RIDDOR F2508 · UK Reportable Events</div>
        <div className="text-mute fs-12">YTD {data.year}</div>
      </div>
      <div style={{ padding: 18 }}>
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <div className="icon-wrap"><Icon name="info" size={16}/></div>
          <div className="body">
            <div className="title fs-13">RIDDOR reporting timelines</div>
            <div className="desc fs-12">
              <b>Specified injuries & deaths:</b> phone HSE without delay, written report within 10 days ·
              <b>Over-7-day incapacitation:</b> online within 15 days ·
              <b>Dangerous occurrences:</b> phone without delay, written within 10 days
            </div>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>RIDDOR ref</th><th>Source</th><th>Date</th><th>Category</th><th>Description</th><th>HSE ref</th><th>Status</th></tr>
          </thead>
          <tbody>
            {(data.reports || []).map(r => (
              <tr key={r.id}>
                <td className="id">{r.riddor_number}</td>
                <td className="id fs-12">{r.incident_number}</td>
                <td className="fs-12">{formatDateShort(r.event_date)}</td>
                <td><span className="pill pill-err"><span className="dot"/>{r.category?.replace(/_/g, ' ')}</span></td>
                <td className="fs-12">{r.description || r.incident_title}</td>
                <td className="id fs-12">{r.hse_ref || '—'}</td>
                <td><span className={`pill ${r.status === 'submitted' ? 'pill-success' : 'pill-warn'}`}><span className="dot"/>{r.status}</span></td>
              </tr>
            ))}
            {data.reports?.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No RIDDOR reports</td></tr>}
          </tbody>
        </table>

        {data.stats && (
          <div className="grid-3 mt-16">
            <div style={{ border: '1px solid var(--sds-border)', borderRadius: 8, padding: 14, background: 'var(--sds-bg-surface-alt)' }}>
              <div className="text-sec fs-11" style={{ fontWeight: 600, textTransform: 'uppercase' }}>Specified injuries</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--sds-brand-primary)', marginTop: 4 }}>{data.stats.specified_injuries}</div>
            </div>
            <div style={{ border: '1px solid var(--sds-border)', borderRadius: 8, padding: 14, background: 'var(--sds-bg-surface-alt)' }}>
              <div className="text-sec fs-11" style={{ fontWeight: 600, textTransform: 'uppercase' }}>Over-7-day absences</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--sds-brand-primary)', marginTop: 4 }}>{data.stats.over_7_day}</div>
            </div>
            <div style={{ border: '1px solid var(--sds-border)', borderRadius: 8, padding: 14, background: 'var(--sds-bg-surface-alt)' }}>
              <div className="text-sec fs-11" style={{ fontWeight: 600, textTransform: 'uppercase' }}>Dangerous occurrences</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--sds-brand-primary)', marginTop: 4 }}>{data.stats.dangerous_occurrences}</div>
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
    if (siteId) getMetrics({ site_id: siteId }).then(setData).catch(() => {});
  }, [siteId]);

  if (!data) return <div className="card card-pad"><div className="text-mute">Loading...</div></div>;

  return (
    <div className="card card-pad">
      <div className="card-h">Safety Metrics</div>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="stat-row"><div><div className="lbl">TRIR</div><div className="val">{data.trir?.toFixed(2) || '0.00'}</div></div></div>
          <div className="sub">Total Recordable Incident Rate</div>
        </div>
        <div className="stat info">
          <div className="stat-row"><div><div className="lbl">DART</div><div className="val">{data.dart?.toFixed(2) || '0.00'}</div></div></div>
          <div className="sub">Days Away, Restricted, Transfer</div>
        </div>
        <div className="stat">
          <div className="stat-row"><div><div className="lbl">Severity Rate</div><div className="val">{data.severityRate?.toFixed(2) || '0.00'}</div></div></div>
          <div className="sub">Days lost per 200,000 hours</div>
        </div>
        <div className="stat">
          <div className="stat-row"><div><div className="lbl">Recordable Cases</div><div className="val">{data.totalRecordableCases || 0}</div></div></div>
          <div className="sub">YTD</div>
        </div>
      </div>
      <div className="text-mute fs-12" style={{ marginTop: 16 }}>
        Formula: (cases × 200,000) / total hours worked. Based on site-level data.
      </div>
    </div>
  );
}
