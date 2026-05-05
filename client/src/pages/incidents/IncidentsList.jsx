import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIncidents } from '../../api/incidents';
import { useApp } from '../../context/AppContext';
import Icon from '../../components/shared/Icon';
import { TYPES, typeOf } from '../../components/shared/Badges';
import { formatDate, timeAgo } from '../../utils/time';
import '../../styles/incidents.css';

const statusKey = (s) => {
  if (!s) return 'st-new';
  const k = s.toLowerCase().replace(/\s+/g, '-');
  if (k === 'new') return 'st-new';
  if (k === 'investigating') return 'st-investigating';
  if (k === 'awaiting-capa') return 'st-capa';
  if (k === 'closed') return 'st-closed';
  return 'st-triage';
};

export default function IncidentsList() {
  const navigate = useNavigate();
  const { setWizardOpen, refreshKey } = useApp();
  const [incidents, setIncidents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchIncidents = () => {
    setLoading(true);
    const params = { page, limit: 50 };
    if (tab === 'open') params.status = 'New';
    if (tab === 'inprogress') params.status = 'Investigating';
    if (tab === 'closed') params.status = 'Closed';
    if (typeFilter) params.type = typeFilter;
    getIncidents(params)
      .then(data => { setIncidents(data.incidents || []); setTotal(data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchIncidents(); }, [tab, typeFilter, page, refreshKey]);

  const filtered = useMemo(() => {
    if (!search.trim()) return incidents;
    const q = search.toLowerCase();
    return incidents.filter(r =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.incident_number || '').toLowerCase().includes(q) ||
      (r.site_name || '').toLowerCase().includes(q) ||
      (r.reporter_name || '').toLowerCase().includes(q)
    );
  }, [incidents, search]);

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'inprogress', label: 'In Progress' },
    { id: 'closed', label: 'Closed' },
  ];

  return (
    <div className="page inc-page">
      {/* Hero header */}
      <div className="inc-hero">
        <div>
          <h1 className="inc-heading">Incidents</h1>
          <p className="inc-subtitle">
            Capture, classify, and route all safety events
            <span className="count-badge">{total} total</span>
          </p>
        </div>
        <div className="inc-hero-actions">
          <button className="inc-btn-export"><Icon name="export" size={15}/>Export CSV</button>
          <button className="inc-btn-report" onClick={() => setWizardOpen(true)}><Icon name="plus" size={15}/>Report incident</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="inc-filter-bar">
        <div className="inc-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`inc-tab ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setPage(1); }}>
              {t.label}
              <span className="tab-count">{t.id === 'all' ? total : '—'}</span>
            </button>
          ))}
        </div>

        <select className="inc-type-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <div className="inc-search">
          <span className="search-icon"><Icon name="search" size={15}/></span>
          <input placeholder="Search incidents..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="inc-skeleton">
          {[1,2,3,4,5].map(i => <div key={i} className="inc-skeleton-card" style={{ animationDelay: `${i * 80}ms` }}/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="inc-empty">
          <div className="inc-empty-icon"><Icon name="incidents" size={26}/></div>
          <h3>No incidents found</h3>
          <p>{search ? 'Try adjusting your search or filters' : 'Report an incident to get started'}</p>
        </div>
      ) : (
        <div className="inc-cards">
          {filtered.map((r, idx) => {
            const t = typeOf(r.type);
            return (
              <div key={r.id} className="inc-card" onClick={() => navigate(`/incidents/${r.id}`)} style={{ animationDelay: `${idx * 40}ms` }}>
                <div className={`inc-card-sev sev-${r.severity}`}/>
                <div className="inc-card-body">
                  <div className="inc-card-top">
                    <div className="inc-card-title">{r.title}</div>
                    <span className="inc-card-ref">{r.incident_number}</span>
                  </div>

                  <div className="inc-card-chips">
                    {t && (
                      <span className="inc-chip inc-chip-type" style={{ '--chip-color': t.color }}>
                        <span className="chip-dot"/>{t.name}
                      </span>
                    )}
                    <span className="inc-chip">{r.site_name}{r.area ? ` · ${r.area}` : ''}</span>
                    {r.track && <span className={`inc-card-track tr-${(r.track || '').toLowerCase()}`}>{r.track}</span>}
                  </div>

                  <div className="inc-card-footer">
                    <div className="inc-card-meta">
                      {r.assignee_initials ? (
                        <span><span className="inc-card-avatar">{r.assignee_initials}</span></span>
                      ) : (
                        <span><span className="inc-card-avatar" style={{ background: '#f3f4f6', color: '#9ca3af' }}>?</span></span>
                      )}
                      <span>{r.reporter_name}</span>
                      <span style={{ color: 'var(--sds-border)' }}>·</span>
                      <span>{timeAgo(r.created_at)}</span>
                    </div>
                    <span className={`inc-card-status ${statusKey(r.status)}`}>
                      <span className="st-dot"/>{r.status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="inc-pagination">
          <span className="page-info">Showing {filtered.length} of {total} · Page {page}</span>
          <div className="page-btns">
            <button className="inc-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Previous</button>
            <button className="inc-page-btn" disabled={incidents.length < 50} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
