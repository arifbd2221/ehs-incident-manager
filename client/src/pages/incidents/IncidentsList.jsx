import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getIncidents } from '../../api/incidents';
import { useApp } from '../../context/AppContext';
import Icon from '../../components/shared/Icon';
import EmptyState, { EmptyIncidentsIllustration } from '../../components/shared/EmptyState';
import { TYPES, typeOf } from '../../components/shared/Badges';
import DeadlineBadge from '../../components/incidents/DeadlineBadge';
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
  const [searchParams, setSearchParams] = useSearchParams();
  // URL is the source of truth for filters/search so refresh, deep-link, and
  // back-from-detail all preserve the user's view. Empty defaults (tab=all,
  // typeFilter='', search='') are omitted from the URL to keep it clean.
  const [incidents, setIncidents] = useState([]);
  const [total, setTotal] = useState(0);
  // Per-status aggregates from the server — honour every active filter
  // EXCEPT status, so tab/stat counts stay accurate while the user views
  // a single status. Without this, counts read 0 for every non-active tab.
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'all');
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get('type') || '');
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // Sync filter state -> URL. `replace: true` so each keystroke in search
  // doesn't bloat history. Page is intentionally NOT in the URL (resets when
  // filters change anyway).
  useEffect(() => {
    const next = {};
    if (tab && tab !== 'all') next.tab = tab;
    if (typeFilter) next.type = typeFilter;
    if (search.trim()) next.q = search;
    setSearchParams(next, { replace: true });
  }, [tab, typeFilter, search, setSearchParams]);

  const fetchIncidents = () => {
    setLoading(true);
    const params = { page, limit: 50 };
    if (tab === 'open') params.status = 'New';
    if (tab === 'inprogress') params.status = 'Investigating';
    if (tab === 'closed') params.status = 'Closed';
    if (typeFilter) params.type = typeFilter;
    getIncidents(params)
      .then(data => {
        setIncidents(data.incidents || []);
        setTotal(data.total || 0);
        setStatusCounts(data.status_counts || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchIncidents(); }, [tab, typeFilter, page, refreshKey]);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

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

  // Derived from server-side aggregates (status_counts), NOT from the
  // currently-loaded page — otherwise switching tabs would zero out the
  // other tabs' badges because the response is status-scoped.
  const stats = useMemo(() => ({
    open: statusCounts.New || 0,
    investigating: statusCounts.Investigating || 0,
    closed: statusCounts.Closed || 0,
  }), [statusCounts]);

  // Total across every status with the current non-status filters applied
  // — used for the "All" tab badge and the hero "Total" stat. The list
  // response's `total` only reflects the active status, so summing
  // status_counts is the right source here.
  const grandTotal = useMemo(
    () => Object.values(statusCounts).reduce((a, b) => a + b, 0),
    [statusCounts],
  );

  const activeTypeName = TYPES.find(t => t.id === typeFilter)?.name;

  const tabs = [
    { id: 'all', label: 'All', count: grandTotal },
    { id: 'open', label: 'Open', count: stats.open },
    { id: 'inprogress', label: 'In Progress', count: stats.investigating },
    { id: 'closed', label: 'Closed', count: stats.closed },
  ];

  return (
    <div className="page inc-page">
      {/* Hero header with stats */}
      <div className="inc-hero">
        <div className="inc-hero-row">
          <div className="inc-hero-icon">
            <Icon name="incidents" size={24} />
          </div>
          <div className="inc-hero-text">
            <h1 className="inc-heading">Incidents</h1>
            <p className="inc-subtitle">Capture, classify, and route all safety events</p>
          </div>
          <div className="inc-hero-actions">
            <button className="inc-btn-export" aria-label="Export incidents to CSV"><Icon name="export" size={15}/>Export CSV</button>
            <button className="inc-btn-report" onClick={() => setWizardOpen(true)}><Icon name="plus" size={15}/>Report incident</button>
          </div>
        </div>
        <div className="inc-stats">
          <div className="inc-stat" style={{ '--is-color': 'var(--sds-brand-primary)' }}>
            <div className="inc-stat-icon"><Icon name="incidents" size={16} /></div>
            <div>
              <div className="inc-stat-val">{grandTotal}</div>
              <div className="inc-stat-lbl">Total</div>
            </div>
          </div>
          <div className="inc-stat" style={{ '--is-color': 'var(--sds-success)' }}>
            <div className="inc-stat-icon"><Icon name="pulse" size={16} /></div>
            <div>
              <div className="inc-stat-val">{stats.open}</div>
              <div className="inc-stat-lbl">Open</div>
            </div>
          </div>
          <div className="inc-stat" style={{ '--is-color': 'var(--sds-info-blue)' }}>
            <div className="inc-stat-icon"><Icon name="investigation" size={16} /></div>
            <div>
              <div className="inc-stat-val">{stats.investigating}</div>
              <div className="inc-stat-lbl">Investigating</div>
            </div>
          </div>
          <div className="inc-stat" style={{ '--is-color': 'var(--sds-fg-tertiary)' }}>
            <div className="inc-stat-icon"><Icon name="check" size={16} /></div>
            <div>
              <div className="inc-stat-val">{stats.closed}</div>
              <div className="inc-stat-lbl">Closed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="inc-filter-bar">
        <div className="inc-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`inc-tab ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setPage(1); }}>
              {t.label}
              <span className="tab-count">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="inc-filter-wrap" ref={filterRef}>
          <button
            className={`inc-filter-trigger ${filterOpen ? 'is-open' : ''} ${typeFilter ? 'has-filters' : ''}`}
            onClick={() => setFilterOpen(o => !o)}
          >
            <Icon name="filter" size={14} />
            Type
            {typeFilter && <span className="inc-filter-badge">1</span>}
          </button>
          {filterOpen && (
            <div className="inc-filter-dropdown">
              <div className="inc-filter-section-label">Incident type</div>
              <div className="inc-filter-options">
                <button
                  className={`inc-filter-opt ${!typeFilter ? 'active' : ''}`}
                  onClick={() => { setTypeFilter(''); setPage(1); }}
                >
                  All types
                </button>
                {TYPES.map(ty => (
                  <button
                    key={ty.id}
                    className={`inc-filter-opt ${typeFilter === ty.id ? 'active' : ''}`}
                    onClick={() => { setTypeFilter(ty.id); setPage(1); }}
                  >
                    <span className="inc-filter-dot" style={{ background: ty.color }} />
                    {ty.name}
                  </button>
                ))}
              </div>
              {typeFilter && (
                <>
                  <div className="inc-filter-divider" />
                  <button className="inc-filter-clear" onClick={() => { setTypeFilter(''); setPage(1); }}>
                    <Icon name="close" size={12} /> Clear filter
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="inc-search">
          <span className="search-icon"><Icon name="search" size={15}/></span>
          <input aria-label="Search incidents" placeholder="Search incidents..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Active filter chip */}
      {typeFilter && activeTypeName && (
        <div className="inc-filter-chips">
          <span className="inc-filter-chip">
            <span className="inc-filter-dot" style={{ background: TYPES.find(t => t.id === typeFilter)?.color }} />
            {activeTypeName}
            <button className="inc-filter-chip-x" aria-label={`Remove ${activeTypeName} filter`} onClick={() => { setTypeFilter(''); setPage(1); }}>
              <Icon name="close" size={10} />
            </button>
          </span>
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="inc-skeleton" role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading incidents…</span>
          {[1,2,3,4,5].map(i => <div key={i} className="skel inc-skeleton-card" style={{ animationDelay: `${i * 80}ms` }}/>)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          illustration={<EmptyIncidentsIllustration />}
          accent={search ? 'info' : 'success'}
          title={search ? 'No matching incidents' : 'No incidents recorded'}
          body={search
            ? 'Try a different search term or clear active filters to see all incidents.'
            : 'When an incident is reported it will show up here. The dashboard greets you with quick-report shortcuts.'}
        />
      ) : (
        <div className="inc-cards">
          {filtered.map((r, idx) => {
            const t = typeOf(r.type);
            return (
              <div
                key={r.id}
                className="inc-card focus-ring"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/incidents/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/incidents/${r.id}`);
                  }
                }}
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className={`inc-card-sev sev-${r.severity}`} aria-hidden="true"/>
                <span className="sr-only">Severity {r.severity}</span>
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

                  {/* Hover-expand detail reveal */}
                  <div className="inc-card-expand">
                    <div className="inc-card-expand-inner">
                      {r.description && (
                        <div className="inc-card-desc">{r.description}</div>
                      )}
                      <div className="inc-card-expand-row">
                        {r.area && (
                          <span className="inc-card-expand-detail">
                            <Icon name="location" size={11} /> {r.area}
                          </span>
                        )}
                        <span className="inc-card-expand-detail">
                          <Icon name="clock" size={11} /> {formatDate(r.incident_datetime || r.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="inc-card-footer">
                    <div className="inc-card-meta">
                      {r.assignee_initials ? (
                        <span><span className="inc-card-avatar">{r.assignee_initials}</span></span>
                      ) : (
                        <span><span className="inc-card-avatar inc-card-avatar-empty">?</span></span>
                      )}
                      <span>{r.reporter_name}</span>
                      <span style={{ color: 'var(--sds-border)' }}>·</span>
                      <span>{timeAgo(r.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* WI-08: most-urgent regulatory deadline per row.
                          Compact mode keeps the pill from blowing out the
                          card; full detail lives on the incident page. */}
                      {r.most_urgent_deadline && (
                        <DeadlineBadge deadline={r.most_urgent_deadline} compact/>
                      )}
                      <span className={`inc-card-status ${statusKey(r.status)}`}>
                        <span className="st-dot"/>{r.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        (() => {
          // `total` is the server-side filtered count (status/type-scoped) so
          // ceil(total/50) gives the real last page. The previous check
          // (incidents.length < 50) misfired whenever the last page happened
          // to hold exactly 50 rows OR when a filter trimmed mid-page.
          const limit = 50;
          const lastPage = Math.max(1, Math.ceil((total || 0) / limit));
          const atLastPage = page >= lastPage;
          return (
            <div className="inc-pagination">
              <span className="page-info">Showing {filtered.length} of {total} · Page {page}</span>
              <div className="page-btns">
                <button className="inc-page-btn" aria-label="Previous page" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>← Previous</button>
                <button className="inc-page-btn" aria-label="Next page" disabled={loading || atLastPage} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
