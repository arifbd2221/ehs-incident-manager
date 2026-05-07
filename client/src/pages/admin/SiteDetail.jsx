// SiteDetail.jsx — /admin/sites/:id
//
// Reads the enriched payload from GET /api/sites/:id (parent, ancestors,
// children, counts, recent_incidents, recent_assets, work_hours_total) and
// lays them out as stacked cards. No tabs — every section is visible at
// once for fast scanning. Reuses shared classes (`.card`, `.tbl`, `.pill`,
// `.stat-grid`) plus a small set of `sd-` prefixed classes scoped in
// sites.css for the hero, breadcrumb, and empty-state lines.
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSite } from '../../api/sites';
import Icon from '../../components/shared/Icon';
import '../../styles/sites.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const SEV_LABEL = { 1: 'S1 Critical', 2: 'S2 Major', 3: 'S3 Moderate', 4: 'S4 Minor', 5: 'S5 Insignificant' };

const fmtInt = (n) => (n ?? 0).toLocaleString();

export default function SiteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    getSite(id)
      .then(setSite)
      .catch(e => setErr(e.response?.data?.error || 'Failed to load site'))
      .finally(() => setLoading(false));
  }, [id]);

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
              {site.ancestors.map((a, i) => (
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
                <th>Hours / yr</th>
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
                  <td>{fmtInt(c.total_hours_worked)}</td>
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
            <div className="sd-kv"><div className="sd-kv-k">Total hours / yr</div><div className="sd-kv-v">{fmtInt(site.total_hours_worked)}</div></div>
            <div className="sd-kv"><div className="sd-kv-k">Logged hours total</div><div className="sd-kv-v">{fmtInt(site.work_hours_total)}{site.work_hours_periods ? ` (${site.work_hours_periods} periods)` : ''}</div></div>
            {site.annual_avg_employees > 0 && site.total_hours_worked > 0 && (
              <div className="sd-kv"><div className="sd-kv-k">OSHA rate factor</div><div className="sd-kv-v">{(site.total_hours_worked / 200000).toFixed(2)}</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
