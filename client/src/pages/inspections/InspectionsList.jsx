import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getInspections, getInspectionSummary, createInspection } from '../../api/inspections';
import { getTemplates } from '../../api/templates';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import EmptyState, { EmptyIncidentsIllustration } from '../../components/shared/EmptyState';
import TemplateIllustration, {
  CategoryIcon,
  templateIllustrationKind,
  CATEGORY_META,
} from '../../components/templates/TemplateIllustration';
import '../../styles/inspections.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const initialsOf = (name) => {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
};

const colorForName = (name) => {
  if (!name) return '#7E7E8C';
  const palette = ['#626DF9', '#5C00FF', '#0DB4F0', '#2E7D32', '#ED6C02', '#D32F2F'];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

const STATUS_META = {
  in_progress: { label: 'In progress', tint: 'warn' },
  completed: { label: 'Completed', tint: 'ok' },
  abandoned: { label: 'Abandoned', tint: 'neutral' },
};

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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [view, setView] = useState('grid');
  const [publishedTemplates, setPublishedTemplates] = useState([]);

  const [showStart, setShowStart] = useState(false);
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

  // Preload published templates so the quick-launch strip can show without
  // waiting for the modal to open.
  useEffect(() => {
    getTemplates({ status: 'published' })
      .then(d => setPublishedTemplates(d.templates || []))
      .catch(() => {});
  }, [refreshKey]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const openStartModal = (templateId) => {
    setSelectedTemplate(templateId ? String(templateId) : '');
    setShowStart(true);
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

  const tabs = useMemo(() => [
    { id: 'all', label: 'All', count: summary.total },
    { id: 'in_progress', label: 'In progress', count: summary.in_progress, tint: 'warn' },
    { id: 'completed', label: 'Completed', count: summary.completed, tint: 'ok' },
    { id: 'abandoned', label: 'Abandoned', count: summary.abandoned, tint: 'neutral' },
  ], [summary]);

  // Derive a category for an inspection from its template name/description so
  // the illustration palette and accent colour can render.
  const categoryFor = (ins) => templateIllustrationKind({
    name: ins.template_name || '',
    description: ins.template_description || '',
  });

  // Apply client-side category filter (server doesn't index template categories).
  const visible = useMemo(() => {
    if (categoryFilter === 'all') return inspections;
    return inspections.filter(ins => categoryFor(ins) === categoryFilter);
  }, [inspections, categoryFilter]);

  // Category strip — mirrors TemplatesList. Counts update as status/search
  // narrow the loaded set, since they're derived from the in-memory list.
  const categoryStrip = useMemo(() => {
    const counts = { safety: 0, environment: 0, quality: 0, compliance: 0, walkthrough: 0, custom: 0 };
    for (const ins of inspections) counts[categoryFor(ins)] += 1;
    const order = ['safety', 'environment', 'quality', 'compliance', 'walkthrough', 'custom'];
    return [
      { id: 'all', label: 'All categories', sub: `${inspections.length} ${inspections.length === 1 ? 'inspection' : 'inspections'}`, color: 'var(--sds-brand-primary)' },
      ...order.map(k => ({
        id: k,
        label: CATEGORY_META[k].label,
        sub: `${counts[k]} ${counts[k] === 1 ? 'inspection' : 'inspections'}`,
        color: CATEGORY_META[k].color,
      })),
    ];
  }, [inspections]);

  const kpis = useMemo(() => {
    const total = summary.total;
    const inProg = summary.in_progress;
    const completed = summary.completed;
    const abandoned = summary.abandoned;
    const completedSet = inspections.filter(i => i.status === 'completed');
    let pct = 0;
    if (completedSet.length) {
      const ratios = completedSet.map(i => {
        const t = i.items_total || 0;
        const failed = i.items_failed || 0;
        if (!t) return 0;
        return Math.max(0, Math.min(100, Math.round(((t - failed) / t) * 100)));
      });
      pct = Math.round(ratios.reduce((s, v) => s + v, 0) / ratios.length);
    }
    return { total, inProg, completed, abandoned, pct };
  }, [summary, inspections]);

  const inProgressList = useMemo(
    () => inspections.filter(i => i.status === 'in_progress'),
    [inspections]
  );

  const quickLaunchTemplates = useMemo(
    () => publishedTemplates.slice(0, 5),
    [publishedTemplates]
  );

  const emptyCopy = () => {
    const noneAnywhere = summary.total === 0;
    const filtersActive = !!search.trim() || categoryFilter !== 'all';
    if (noneAnywhere) return {
      title: 'No inspections yet',
      desc: 'Start your first inspection from a published template to begin tracking safety walks.',
      cta: canCreate ? { label: 'Start your first inspection', onClick: () => openStartModal() } : null,
    };
    if (filtersActive) return {
      title: 'No inspections match these filters',
      desc: 'Try a different keyword, category, or clear the filters.',
      cta: { label: 'Clear filters', onClick: () => { setSearch(''); setCategoryFilter('all'); setTab('all'); }, variant: 'secondary' },
    };
    if (tab === 'in_progress') return { title: 'No inspections in progress', desc: 'When teammates start an inspection it shows up here until they complete it.' };
    if (tab === 'completed') return { title: 'No completed inspections', desc: 'Finished inspections will appear here for audit history.' };
    if (tab === 'abandoned') return { title: 'No abandoned inspections', desc: 'Inspections that were started but never finished will appear here.' };
    return { title: 'No inspections to show', desc: 'Adjust your filters or check a different tab.' };
  };

  return (
    <div className="page ins-page">
      {/* Hero */}
      <section className="ins-hero">
        <div className="ins-hero-icon">
          <Icon name="shield" size={22} />
        </div>
        <div className="ins-hero-text">
          <h1 className="ins-hero-title">Inspections</h1>
          <p className="ins-hero-sub">
            Conduct safety inspections using published templates
            {summary.in_progress > 0 && (
              <span className="ins-hero-bullet"> · {summary.in_progress} in progress</span>
            )}
          </p>
        </div>
        {canCreate && (
          <div className="ins-hero-actions">
            <button className="btn btn-primary" onClick={() => openStartModal()}>
              <Icon name="plus" size={16} /> Start inspection
            </button>
          </div>
        )}
      </section>

      {/* KPI strip */}
      <section className="ins-kpi-strip">
        <div className="ins-kpi ins-kpi-brand">
          <div className="ins-kpi-icon"><Icon name="shield" size={20} /></div>
          <div className="ins-kpi-text">
            <div className="ins-kpi-label">Total inspections</div>
            <div className="ins-kpi-value">{loading ? '—' : kpis.total}</div>
            <div className="ins-kpi-sub">Across all sites</div>
          </div>
        </div>
        <div className="ins-kpi ins-kpi-warn">
          <div className="ins-kpi-icon"><Icon name="clock" size={20} /></div>
          <div className="ins-kpi-text">
            <div className="ins-kpi-label">In progress</div>
            <div className="ins-kpi-value">{loading ? '—' : kpis.inProg}</div>
            <div className="ins-kpi-sub">Awaiting completion</div>
          </div>
        </div>
        <div className="ins-kpi ins-kpi-ok">
          <div className="ins-kpi-icon"><Icon name="check" size={20} /></div>
          <div className="ins-kpi-text">
            <div className="ins-kpi-label">Completed</div>
            <div className="ins-kpi-value">{loading ? '—' : kpis.completed}</div>
            <div className="ins-kpi-sub">Audit-ready</div>
          </div>
        </div>
        <div className="ins-kpi ins-kpi-info">
          <div className="ins-kpi-icon"><Icon name="capa" size={20} /></div>
          <div className="ins-kpi-text">
            <div className="ins-kpi-label">Avg pass score</div>
            <div className="ins-kpi-value">{loading || kpis.completed === 0 ? '—' : `${kpis.pct}%`}</div>
            <div className="ins-kpi-sub">{kpis.completed === 0 ? 'No completed yet' : `Across ${kpis.completed} completed`}</div>
          </div>
        </div>
      </section>

      {/* Quick-launch templates */}
      {quickLaunchTemplates.length > 0 && (
        <section className="ins-launch">
          <div className="ins-launch-head">
            <div>
              <h2 className="ins-launch-title">Start an inspection</h2>
              <p className="ins-launch-sub">Pick a template to spin up a new run.</p>
            </div>
            <button type="button" className="ins-launch-link" onClick={() => navigate('/templates')}>
              Browse all templates →
            </button>
          </div>
          <div className="ins-launch-cards">
            {quickLaunchTemplates.map(t => {
              const kind = templateIllustrationKind(t);
              const cat = CATEGORY_META[kind];
              return (
                <button
                  key={t.id}
                  type="button"
                  className="ins-launch-card"
                  style={{ '--cat-color': cat.color }}
                  onClick={() => canCreate ? openStartModal(t.id) : navigate(`/templates/${t.id}/edit`)}
                  disabled={!canCreate}
                >
                  <div className="ins-launch-illus">
                    <TemplateIllustration kind={kind} />
                  </div>
                  <div className="ins-launch-body">
                    <div className="ins-launch-card-title">{t.name}</div>
                    <div className="ins-launch-card-meta">
                      <span>{t.items_count || 0} items</span>
                      {t.latest_version > 0 && (
                        <>
                          <span className="ins-launch-card-dot">·</span>
                          <span className="mono">v{t.latest_version}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="ins-launch-cta">
                    <Icon name="check" size={12} />
                    <span>Run</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Resume hero — in-progress inspections */}
      {!loading && tab === 'all' && !search && categoryFilter === 'all' && inProgressList.length > 0 && (
        <section className="ins-resume">
          <div className="ins-resume-head">
            <span className="ins-resume-pulse-dot" aria-hidden />
            <h2 className="ins-resume-title">Resume where you left off</h2>
            <span className="ins-resume-count">{inProgressList.length} in progress</span>
          </div>
          <div className="ins-resume-row">
            {inProgressList.slice(0, 2).map(ins => {
              const kind = categoryFor(ins);
              const cat = CATEGORY_META[kind];
              const answered = ins.items_answered || 0;
              const total = ins.items_total || 0;
              const pct = total ? Math.round((answered / total) * 100) : 0;
              const inspName = ins.started_by_name || 'Unassigned';
              return (
                <article
                  key={ins.id}
                  className="ins-resume-card"
                  style={{ '--cat-color': cat.color }}
                  onClick={() => navigate(`/inspections/${ins.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/inspections/${ins.id}`); }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="ins-resume-illus">
                    <TemplateIllustration kind={kind} />
                  </div>
                  <div className="ins-resume-content">
                    <div className="ins-resume-meta">
                      <span className="ins-resume-id mono">{ins.inspection_number}</span>
                      <span className="ins-status ins-status-in_progress">
                        <span className="ins-status-dot" />
                        In progress
                      </span>
                    </div>
                    <h3 className="ins-resume-card-title">{ins.title}</h3>
                    <div className="ins-resume-location">
                      {ins.location && (
                        <>
                          <Icon name="location" size={13} />
                          <span>{ins.location}</span>
                          <span className="ins-resume-divider" />
                        </>
                      )}
                      <div className="ins-avatar ins-avatar-sm" style={{ background: colorForName(inspName) }}>
                        {initialsOf(inspName)}
                      </div>
                      <span>{inspName}</span>
                    </div>

                    <div className="ins-resume-progress">
                      <div className="ins-resume-progress-head">
                        <span>Progress</span>
                        <span className="ins-resume-progress-val">
                          <strong>{answered}</strong> / {total} items · {pct}%
                        </span>
                      </div>
                      <div className="ins-progress-bar ins-progress-bar-lg">
                        <div className="ins-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="ins-resume-progress-foot">
                        <span>
                          <Icon name="clock" size={11} />
                          Started {fmtDate(ins.created_at)}
                        </span>
                        {ins.items_failed > 0 && (
                          <span className="ins-resume-progress-fail">
                            {ins.items_failed} failed · {ins.items_flagged || 0} flagged
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="ins-resume-actions">
                      <button
                        type="button"
                        className="btn btn-primary ins-resume-cta"
                        onClick={(e) => { e.stopPropagation(); navigate(`/inspections/${ins.id}`); }}
                      >
                        <Icon name="check" size={14} /> Resume inspection
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Category strip — primary filter (matches templates page) */}
      <section className="ins-cat-strip">
        {categoryStrip.map(c => (
          <button
            key={c.id}
            type="button"
            className={`ins-cat ${categoryFilter === c.id ? 'active' : ''}`}
            style={{ '--cat-color': c.color }}
            onClick={() => setCategoryFilter(c.id)}
          >
            <span className="ins-cat-icon">
              <CategoryIcon kind={c.id} size={20} />
            </span>
            <span className="ins-cat-body">
              <span className="ins-cat-label">{c.label}</span>
              <span className="ins-cat-sub">{c.sub}</span>
            </span>
          </button>
        ))}
      </section>

      {/* Toolbar — status chips + search + view toggle */}
      <div className="ins-toolbar">
        <div className="ins-status-chips">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              className={`ins-status-chip ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
              <span className="ins-status-chip-count">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="ins-toolbar-right">
          <div className="ins-search">
            <Icon name="search" size={15} />
            <input
              placeholder="Search inspections by title, number, or location…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="ins-search-clear" onClick={() => setSearch('')} title="Clear search">
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
          <div className="ins-view-toggle" role="tablist" aria-label="View">
            <button
              type="button"
              className={`ins-view-btn ${view === 'grid' ? 'active' : ''}`}
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              title="Grid view"
            >
              <Icon name="dashboard" size={15} />
            </button>
            <button
              type="button"
              className={`ins-view-btn ${view === 'kanban' ? 'active' : ''}`}
              onClick={() => setView('kanban')}
              aria-pressed={view === 'kanban'}
              title="Kanban view"
            >
              <Icon name="sort" size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="ins-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ins-card ins-card-skel" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="ins-skel ins-skel-pill" />
              <div className="ins-skel ins-skel-title" />
              <div className="ins-skel ins-skel-line" />
              <div className="ins-skel ins-skel-line ins-skel-line-short" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        (() => {
          const e = emptyCopy();
          return (
            <EmptyState
              illustration={<EmptyIncidentsIllustration />}
              title={e.title}
              body={e.desc}
              action={e.cta && (
                <button
                  className={`btn btn-${e.cta.variant || 'primary'}`}
                  onClick={e.cta.onClick}
                >
                  <Icon name={e.cta.variant === 'secondary' ? 'close' : 'plus'} size={14} /> {e.cta.label}
                </button>
              )}
            />
          );
        })()
      ) : view === 'kanban' ? (
        <KanbanView
          inspections={visible}
          onOpen={(id) => navigate(`/inspections/${id}`)}
          categoryFor={categoryFor}
          fmtDate={fmtDate}
        />
      ) : (
        <div className="ins-grid">
          {visible.map((ins, idx) => (
            <InspectionCard
              key={ins.id}
              ins={ins}
              kind={categoryFor(ins)}
              fmtDate={fmtDate}
              onOpen={() => navigate(`/inspections/${ins.id}`)}
              delay={50 + idx * 30}
            />
          ))}

          {canCreate && view === 'grid' && (
            <button
              type="button"
              className="ins-add-card"
              onClick={() => openStartModal()}
            >
              <div className="ins-add-card-circle">
                <Icon name="plus" size={22} />
              </div>
              <div className="ins-add-card-label">Start inspection</div>
              <div className="ins-add-card-sub">Begin a new safety walk from a published template</div>
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
                  options={[{ value: '', label: 'Select a template…' }, ...publishedTemplates.map(t => ({ value: String(t.id), label: t.name }))]}
                  value={selectedTemplate}
                  onChange={setSelectedTemplate}
                  placeholder="Search templates…"
                />
                {publishedTemplates.length === 0 && (
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

// ---------------------------------------------------------------------------
// InspectionCard — grid tile
// ---------------------------------------------------------------------------
function InspectionCard({ ins, kind, fmtDate, onOpen, delay }) {
  const cat = CATEGORY_META[kind];
  const status = STATUS_META[ins.status] || STATUS_META.in_progress;
  const total = ins.items_total || 0;
  const answered = ins.items_answered || 0;
  const failed = ins.items_failed || 0;
  const flagged = ins.items_flagged || 0;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const passed = ins.status === 'completed' ? Math.max(0, total - failed - flagged) : 0;
  const score = ins.status === 'completed' && total > 0
    ? Math.max(0, Math.min(100, Math.round(((total - failed) / total) * 100)))
    : null;
  const inspName = ins.started_by_name || 'Unassigned';

  return (
    <article
      className={`ins-card ins-card-${ins.status}`}
      style={{ '--cat-color': cat.color, animationDelay: `${delay}ms` }}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      role="button"
      tabIndex={0}
    >
      <header className="ins-card-top">
        <span className="ins-card-id mono">{ins.inspection_number}</span>
        <span className={`ins-status ins-status-${ins.status}`}>
          <span className="ins-status-dot" />
          {status.label}
        </span>
      </header>

      <div className="ins-card-title-row">
        <h3 className="ins-card-title">{ins.title}</h3>
        {score !== null && <ScoreRing value={score} />}
      </div>

      {ins.template_name && (
        <div className="ins-card-template" style={{ '--cat-color': cat.color }}>
          <div className="ins-card-template-thumb">
            <TemplateIllustration kind={kind} />
          </div>
          <div className="ins-card-template-body">
            <div className="ins-card-template-label">Using template</div>
            <div className="ins-card-template-name">{ins.template_name}</div>
          </div>
          {ins.template_version_number != null && (
            <span className="ins-card-template-version mono">v{ins.template_version_number}</span>
          )}
        </div>
      )}

      <div className="ins-card-meta">
        {ins.location && (
          <>
            <div className="ins-card-meta-item">
              <Icon name="location" size={13} />
              <span>{ins.location}</span>
            </div>
            <span className="ins-meta-sep">·</span>
          </>
        )}
        <div className="ins-card-meta-item">
          <div className="ins-avatar ins-avatar-sm" style={{ background: colorForName(inspName) }}>
            {initialsOf(inspName)}
          </div>
          <span>{inspName}</span>
        </div>
      </div>

      {ins.status === 'in_progress' && total > 0 && (
        <div className="ins-card-progress">
          <div className="ins-card-progress-head">
            <span><strong>{answered}</strong> of {total} items · {pct}%</span>
            {failed > 0 && <span className="ins-progress-fail">{failed} failed</span>}
          </div>
          <div className="ins-progress-bar">
            <div className="ins-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {ins.status === 'completed' && total > 0 && (
        <FindingsStrip passed={passed} failed={failed} flagged={flagged} />
      )}

      {ins.status === 'abandoned' && (
        <div className="ins-card-aban">
          <Icon name="info" size={14} />
          <span>Stopped before completion ({answered}/{total} answered)</span>
        </div>
      )}

      <div className="ins-card-foot">
        <div className="ins-card-foot-meta">
          <Icon name={ins.status === 'completed' ? 'check' : 'clock'} size={12} />
          <span>
            {ins.status === 'in_progress' && `Started ${fmtDate(ins.created_at)}`}
            {ins.status === 'completed' && `Completed ${fmtDate(ins.completed_at || ins.updated_at)}`}
            {ins.status === 'abandoned' && `Stopped ${fmtDate(ins.updated_at)}`}
          </span>
          {ins.status === 'completed' && failed === 0 && flagged === 0 && (
            <span className="ins-card-signed"><Icon name="check" size={10} /> Clean run</span>
          )}
          {ins.status === 'completed' && failed > 0 && (
            <span className="ins-card-issues">{failed} issue{failed > 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm ins-card-cta"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          {ins.status === 'in_progress' ? 'Resume' : 'Open'}
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Findings strip — segmented bar + legend
// ---------------------------------------------------------------------------
function FindingsStrip({ passed, failed, flagged }) {
  const segs = [];
  if (passed > 0) segs.push({ kind: 'pass', count: passed });
  if (failed > 0) segs.push({ kind: 'fail', count: failed });
  if (flagged > 0) segs.push({ kind: 'obs', count: flagged });
  if (segs.length === 0) return null;
  return (
    <div className="ins-findings">
      <div className="ins-find-bar">
        {segs.map((s, i) => (
          <div key={i} className={`ins-find-seg ins-find-seg-${s.kind}`} style={{ flex: s.count }} title={`${s.count} ${s.kind}`} />
        ))}
      </div>
      <div className="ins-find-legend">
        {passed > 0 && <span className="ins-find-l"><span className="ins-find-dot ins-find-dot-pass" />{passed} pass</span>}
        {failed > 0 && <span className="ins-find-l"><span className="ins-find-dot ins-find-dot-fail" />{failed} fail</span>}
        {flagged > 0 && <span className="ins-find-l"><span className="ins-find-dot ins-find-dot-obs" />{flagged} flagged</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScoreRing — small completed-card score badge
// ---------------------------------------------------------------------------
function ScoreRing({ value, size = 52 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  const color = value >= 90 ? 'var(--sds-success)' : value >= 75 ? 'var(--sds-warning)' : 'var(--sds-error)';
  return (
    <div className="ins-score-wrap" aria-label={`Score ${value} percent`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sds-bg-surface-alt)" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
          strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)' }}
        />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--sds-fg-heading)" fontFamily="Montserrat, sans-serif">{value}</text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KanbanView
// ---------------------------------------------------------------------------
function KanbanView({ inspections, onOpen, categoryFor, fmtDate }) {
  const cols = [
    { id: 'in_progress', label: 'In progress' },
    { id: 'completed', label: 'Completed' },
    { id: 'abandoned', label: 'Abandoned' },
  ];
  return (
    <section className="ins-kanban">
      {cols.map(col => {
        const items = inspections.filter(i => i.status === col.id);
        return (
          <div key={col.id} className={`ins-kan-col ins-kan-col-${col.id}`}>
            <div className="ins-kan-head">
              <span className="ins-kan-title">{col.label}</span>
              <span className="ins-kan-count">{items.length}</span>
            </div>
            <div className="ins-kan-body">
              {items.length === 0 ? (
                <div className="ins-kan-empty">No inspections</div>
              ) : items.map((ins, idx) => (
                <InspectionCard
                  key={ins.id}
                  ins={ins}
                  kind={categoryFor(ins)}
                  fmtDate={fmtDate}
                  onOpen={() => onOpen(ins.id)}
                  delay={50 + idx * 25}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
