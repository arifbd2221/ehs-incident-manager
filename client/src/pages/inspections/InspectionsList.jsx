import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getInspections, getInspectionSummary, createInspection } from '../../api/inspections';
import { getTemplates } from '../../api/templates';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import '../../styles/inspections.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

export default function InspectionsList() {
  const navigate = useNavigate();
  const { refreshKey, activeSiteId } = useApp();
  const { user } = useAuth();
  const canCreate = ELEVATED.has(user?.role);

  const [inspections, setInspections] = useState([]);
  const [summary, setSummary] = useState({ total: 0, in_progress: 0, completed: 0, abandoned: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showStart, setShowStart] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    const params = { search };
    if (tab !== 'all') params.status = tab;
    Promise.all([
      getInspections(params),
      getInspectionSummary(),
    ]).then(([list, sum]) => {
      setInspections(list.inspections || []);
      setSummary(sum);
    }).catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshKey, tab, search]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const openStartModal = async () => {
    setShowStart(true);
    try {
      const data = await getTemplates({ status: 'published' });
      setTemplates(data.templates || []);
    } catch {}
  };

  const handleStart = async () => {
    if (!selectedTemplate || !newTitle.trim()) return;
    setStarting(true);
    try {
      const ins = await createInspection({
        template_id: Number(selectedTemplate),
        title: newTitle.trim(),
        location: newLocation.trim() || null,
        conducted_on: new Date().toISOString(),
        site_id: activeSiteId || null,
      });
      setShowStart(false);
      setSelectedTemplate('');
      setNewTitle('');
      setNewLocation('');
      showToast('Inspection started');
      navigate(`/inspections/${ins.id}`);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to start');
    } finally {
      setStarting(false);
    }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    const now = new Date();
    const diff = now - dt;
    if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 172800000) return 'Yesterday';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const statusLabel = (s) => {
    if (s === 'in_progress') return 'In progress';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const tabs = useMemo(() => [
    { id: 'all', label: 'All', count: summary.total },
    { id: 'in_progress', label: 'In progress', count: summary.in_progress },
    { id: 'completed', label: 'Completed', count: summary.completed },
    { id: 'abandoned', label: 'Abandoned', count: summary.abandoned },
  ], [summary]);

  const stats = [
    { key: 'total', label: 'Total inspections', value: summary.total, kind: 'brand', sub: 'Across all sites' },
    { key: 'in_progress', label: 'In progress', value: summary.in_progress, kind: 'warn', sub: 'Awaiting completion' },
    { key: 'completed', label: 'Completed', value: summary.completed, kind: 'ok', sub: 'Audit-ready' },
    { key: 'abandoned', label: 'Abandoned', value: summary.abandoned, kind: 'neutral', sub: 'Not finished' },
  ];

  const emptyCopy = () => {
    const noneAnywhere = summary.total === 0;
    const filtersActive = !!search.trim();
    if (noneAnywhere) return {
      title: 'No inspections yet',
      desc: 'Start your first inspection from a published template to begin tracking safety walks.',
      cta: canCreate ? { label: 'Start your first inspection', onClick: openStartModal } : null,
    };
    if (filtersActive) return {
      title: 'No inspections match your search',
      desc: 'Try a different keyword or clear the search.',
      cta: { label: 'Clear search', onClick: () => setSearch(''), variant: 'secondary' },
    };
    if (tab === 'in_progress') return { title: 'No inspections in progress', desc: 'When teammates start an inspection it shows up here until they complete it.' };
    if (tab === 'completed') return { title: 'No completed inspections', desc: 'Finished inspections will appear here for audit history.' };
    if (tab === 'abandoned') return { title: 'No abandoned inspections', desc: 'Inspections that were started but never finished will appear here.' };
    return { title: 'No inspections to show', desc: 'Adjust your filters or check a different tab.' };
  };

  return (
    <div className="page ip-page">
      {/* Hero */}
      <section className="ip-hero">
        <div className="ip-hero-icon">
          <Icon name="inspections" size={22} />
        </div>
        <div className="ip-hero-text">
          <h1 className="ip-hero-title">Inspections</h1>
          <p className="ip-hero-sub">Conduct safety inspections using published templates</p>
        </div>
        {canCreate && (
          <div className="ip-hero-actions">
            <button className="btn btn-primary" onClick={openStartModal}>
              <Icon name="plus" size={16} /> Start inspection
            </button>
          </div>
        )}
      </section>

      {/* Stat strip */}
      <section className="ip-stat-strip">
        {stats.map(s => (
          <div key={s.key} className={`ip-stat ip-stat-${s.kind}`}>
            <div className="ip-stat-label">{s.label}</div>
            <div className="ip-stat-value">{loading ? '—' : s.value}</div>
            <div className="ip-stat-sub">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <div className="ip-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`ip-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            <span className="ip-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Toolbar — search */}
      <div className="ip-toolbar">
        <div className="ip-search">
          <Icon name="search" size={15} />
          <input
            placeholder="Search inspections by title, number, or location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="ip-search-clear" onClick={() => setSearch('')} title="Clear search">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Card grid */}
      {loading ? (
        <div className="ip-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ip-card ip-card-skel" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="ip-skel ip-skel-pill" />
              <div className="ip-skel ip-skel-title" />
              <div className="ip-skel ip-skel-line" />
              <div className="ip-skel ip-skel-line ip-skel-line-short" />
            </div>
          ))}
        </div>
      ) : inspections.length === 0 ? (
        (() => {
          const e = emptyCopy();
          return (
            <div className="card card-pad ip-empty">
              <div className="ip-empty-icon"><Icon name="inspections" size={28} /></div>
              <div className="ip-empty-title">{e.title}</div>
              <div className="ip-empty-desc">{e.desc}</div>
              {e.cta && (
                <button
                  className={`btn btn-${e.cta.variant || 'primary'}`}
                  onClick={e.cta.onClick}
                >
                  <Icon name={e.cta.variant === 'secondary' ? 'close' : 'plus'} size={14} /> {e.cta.label}
                </button>
              )}
            </div>
          );
        })()
      ) : (
        <div className="ip-grid">
          {inspections.map((ins, idx) => (
            <article
              key={ins.id}
              className={`ip-card ip-card-${ins.status}`}
              style={{ animationDelay: `${50 + idx * 30}ms` }}
              onClick={() => navigate(`/inspections/${ins.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') navigate(`/inspections/${ins.id}`); }}
              role="button"
              tabIndex={0}
            >
              <header className="ip-card-head">
                <span className="ip-number mono">{ins.inspection_number}</span>
                <span className={`ip-status ip-status-${ins.status}`}>
                  <span className="ip-status-dot" />
                  {statusLabel(ins.status)}
                </span>
              </header>

              <h3 className="ip-card-title">{ins.title}</h3>

              {ins.template_name && (
                <div className="ip-card-template">
                  <Icon name="templates" size={12} />
                  <span>{ins.template_name}</span>
                  {ins.template_version_number && (
                    <span className="ip-version-tag">v{ins.template_version_number}</span>
                  )}
                </div>
              )}

              <div className="ip-card-meta">
                {ins.location && (
                  <>
                    <span className="ip-meta-item">
                      <Icon name="location" size={12} />
                      <span>{ins.location}</span>
                    </span>
                    <span className="ip-meta-sep">·</span>
                  </>
                )}
                <span className="ip-meta-item">
                  <Icon name="person" size={12} />
                  <span>{ins.started_by_name || '—'}</span>
                </span>
                <span className="ip-meta-sep">·</span>
                <span className="ip-meta-item">
                  <Icon name="clock" size={12} />
                  <span>{fmtDate(ins.created_at)}</span>
                </span>
              </div>
            </article>
          ))}

          {canCreate && (
            <button
              type="button"
              className="ip-add-card"
              onClick={openStartModal}
            >
              <div className="ip-add-card-circle">
                <Icon name="plus" size={22} />
              </div>
              <div className="ip-add-card-label">Start inspection</div>
              <div className="ip-add-card-sub">Begin a new safety walk from a published template</div>
            </button>
          )}
        </div>
      )}

      {/* Start Inspection Modal */}
      {showStart && createPortal(
        <div className="modal-backdrop" onClick={() => setShowStart(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="start-inspection-modal-title">
            <div className="modal-h">
              <div>
                <div className="modal-title" id="start-inspection-modal-title">Start Inspection</div>
                <div className="modal-sub">Choose a template and begin your inspection</div>
              </div>
              <button className="icon-btn" onClick={() => setShowStart(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Template <span className="req">*</span></label>
                <ComboBox
                  options={[{ value: '', label: 'Select a template…' }, ...templates.map(t => ({ value: String(t.id), label: t.name }))]}
                  value={selectedTemplate}
                  onChange={setSelectedTemplate}
                  placeholder="Search templates…"
                />
                {templates.length === 0 && (
                  <span className="helper" style={{ color: 'var(--sds-warning)' }}>No published templates available. Create and publish a template first.</span>
                )}
              </div>
              <div className="field">
                <label className="label">Title <span className="req">*</span></label>
                <input className="input" placeholder="e.g. Monthly Fire Safety Check - Building A" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Location</label>
                <input className="input" placeholder="e.g. Building A, Floor 3" value={newLocation} onChange={e => setNewLocation(e.target.value)} />
              </div>
            </div>
            <div className="modal-f">
              <button className="btn btn-secondary" onClick={() => setShowStart(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleStart} disabled={starting || !selectedTemplate || !newTitle.trim()}>
                {starting ? 'Starting...' : 'Begin Inspection'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {toast && <div className="toast" role="status" aria-live="polite"><Icon name="check" size={16} /> {toast}</div>}
    </div>
  );
}
