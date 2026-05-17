import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getTemplates, getTemplateSummary, createTemplate, archiveTemplate, publishTemplate } from '../../api/templates';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import SmartTextarea from '../../components/shared/SmartTextarea';
import EmptyState, { EmptyCAPAsIllustration } from '../../components/shared/EmptyState';
import Pagination from '../../components/shared/Pagination';
import TemplateIllustration, { CategoryIcon, templateIllustrationKind, CATEGORY_META } from '../../components/templates/TemplateIllustration';
import '../../styles/templates.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

export default function TemplatesList() {
  const navigate = useNavigate();
  const { refreshKey } = useApp();
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [templates, setTemplates] = useState([]);
  const [templatesTotal, setTemplatesTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [summary, setSummary] = useState({
    total: 0, draft: 0, published: 0, archived: 0,
    inspections_run: 0, inspections_in_progress: 0, avg_pass_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  // `tab` filters by status (draft/published/archived), `category` filters by
  // inferred kind (safety/environment/...). Categories are derived client-side
  // from name+description since the data model doesn't have a category column.
  const [tab, setTab] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE, search };
    if (tab !== 'all') params.status = tab;
    Promise.all([
      getTemplates(params),
      getTemplateSummary(),
    ]).then(([list, sum]) => {
      setTemplates(list.templates || []);
      setTemplatesTotal(list.total ?? (list.templates?.length || 0));
      setSummary(sum);
    }).catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshKey, tab, search, page]);
  // Filter/search changes start at the top of the new result set.
  useEffect(() => { setPage(1); }, [tab, search]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const tpl = await createTemplate({ name: newName.trim(), description: newDesc.trim() || null });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      showToast('Template created');
      navigate(`/templates/${tpl.id}/edit`);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (e, tpl) => {
    e.stopPropagation();
    if (!confirm(`Archive "${tpl.name}"?`)) return;
    try {
      await archiveTemplate(tpl.id);
      showToast('Template archived');
      load();
    } catch { showToast('Failed to archive'); }
  };

  const handlePublish = async (e, tpl) => {
    e.stopPropagation();
    try {
      await publishTemplate(tpl.id);
      showToast('Template published');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to publish');
    }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // ~20s per item heuristic (matches "18 items → ~6 min" intuition). Rounded
  // up; 0 items shows no estimate.
  const estimateMinutes = (itemsCount) => {
    if (!itemsCount) return null;
    const m = Math.max(1, Math.ceil((itemsCount * 20) / 60));
    return `~${m} min`;
  };

  const statusChips = useMemo(() => [
    { id: 'all', label: 'All', count: summary.total },
    { id: 'draft', label: 'Drafts', count: summary.draft },
    { id: 'published', label: 'Published', count: summary.published },
    { id: 'archived', label: 'Archived', count: summary.archived },
  ], [summary]);

  // Category strip — six inferred kinds plus an "All" leader. Counts are
  // computed off the templates we already loaded, so they update live as the
  // status filter narrows the set.
  const categoryStrip = useMemo(() => {
    const counts = { safety: 0, environment: 0, quality: 0, compliance: 0, walkthrough: 0, custom: 0 };
    for (const t of templates) counts[templateIllustrationKind(t)] += 1;
    const order = ['safety', 'environment', 'quality', 'compliance', 'walkthrough', 'custom'];
    return [
      { id: 'all', label: 'All categories', sub: `${templates.length} ${templates.length === 1 ? 'template' : 'templates'}`, color: 'var(--sds-brand-primary)' },
      ...order.map(k => ({
        id: k,
        label: CATEGORY_META[k].label,
        sub: `${counts[k]} ${counts[k] === 1 ? 'template' : 'templates'}`,
        color: CATEGORY_META[k].color,
      })),
    ];
  }, [templates]);

  // Visible list — server already filtered by status/search; we trim by
  // category client-side using the same inference helper.
  const visibleTemplates = useMemo(() => {
    if (category === 'all') return templates;
    return templates.filter(t => templateIllustrationKind(t) === category);
  }, [templates, category]);

  // Stat strip surfaces metrics NOT already shown in the category strip or
  // status chips below — inspection activity rather than template breakdown.
  const passRateDisplay = summary.avg_pass_rate > 0
    ? `${Number.isInteger(summary.avg_pass_rate) ? summary.avg_pass_rate : summary.avg_pass_rate.toFixed(1)}%`
    : '—';
  const stats = [
    {
      key: 'templates',
      label: 'Total templates',
      value: summary.total,
      kind: 'brand',
      sub: `${summary.published} published`,
    },
    {
      key: 'run',
      label: 'Inspections run',
      value: summary.inspections_run,
      kind: 'ok',
      sub: summary.inspections_run === 0 ? 'None yet' : 'All-time',
    },
    {
      key: 'pass',
      label: 'Avg pass rate',
      value: passRateDisplay,
      kind: summary.avg_pass_rate >= 90 ? 'ok' : summary.avg_pass_rate >= 70 ? 'warn' : 'neutral',
      sub: summary.avg_pass_rate > 0 ? 'Across completed' : 'No completed yet',
    },
    {
      key: 'progress',
      label: 'In progress',
      value: summary.inspections_in_progress,
      kind: summary.inspections_in_progress > 0 ? 'warn' : 'neutral',
      sub: summary.inspections_in_progress > 0 ? 'Awaiting completion' : 'None active',
    },
  ];

  // Empty-state copy is filter-aware so we don't lie when there are no archived
  // items but plenty of drafts/published, etc. Same pattern as AssetsList.
  const emptyCopy = () => {
    const noneAnywhere = summary.total === 0;
    const filtersActive = !!search.trim();
    if (noneAnywhere) return {
      title: 'No templates yet',
      desc: 'Build inspection checklists for your team to run safety, quality, and compliance walks.',
      cta: canEdit ? { label: 'Create your first template', onClick: () => setShowCreate(true) } : null,
    };
    if (filtersActive) return {
      title: 'No templates match your search',
      desc: 'Try a different keyword or clear the search.',
      cta: { label: 'Clear search', onClick: () => setSearch(''), variant: 'secondary' },
    };
    if (tab === 'draft') return { title: 'No drafts', desc: 'Drafts you start will appear here until you publish them.' };
    if (tab === 'published') return { title: 'No published templates', desc: 'Publish a draft to make it available for inspections.' };
    if (tab === 'archived') return { title: 'No archived templates', desc: 'Templates you archive will appear here for audit history.' };
    return { title: 'No templates to show', desc: 'Adjust your filters or check a different tab.' };
  };

  return (
    <div className="page tp-page">
      {/* Hero — quiet, no abstract floating shapes */}
      <section className="tp-hero">
        <div className="tp-hero-icon">
          <Icon name="templates" size={22} />
        </div>
        <div className="tp-hero-text">
          <h1 className="tp-hero-title">Templates</h1>
          <p className="tp-hero-sub">Inspection checklists for safety, quality, and compliance walks</p>
        </div>
        {canEdit && (
          <div className="tp-hero-actions">
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={16} /> New template
            </button>
          </div>
        )}
      </section>

      {/* Stat strip */}
      <section className="tp-stat-strip">
        {stats.map(s => (
          <div key={s.key} className={`tp-stat tp-stat-${s.kind}`}>
            <div className="tp-stat-label">{s.label}</div>
            <div className="tp-stat-value">{loading ? '—' : s.value}</div>
            <div className="tp-stat-sub">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Category strip — primary filter (matches Claude design) */}
      <section className="tp-cat-strip">
        {categoryStrip.map(c => (
          <button
            key={c.id}
            type="button"
            className={`tp-cat ${category === c.id ? 'active' : ''}`}
            style={{ '--cat-color': c.color }}
            onClick={() => setCategory(c.id)}
          >
            <span className="tp-cat-icon">
              <CategoryIcon kind={c.id} size={20} />
            </span>
            <span className="tp-cat-body">
              <span className="tp-cat-label">{c.label}</span>
              <span className="tp-cat-sub">{c.sub}</span>
            </span>
          </button>
        ))}
      </section>

      {/* Toolbar — status chips + search */}
      <div className="tp-toolbar">
        <div className="tp-status-chips">
          {statusChips.map(s => (
            <button
              key={s.id}
              type="button"
              className={`tp-status-chip ${tab === s.id ? 'active' : ''}`}
              onClick={() => setTab(s.id)}
            >
              <span>{s.label}</span>
              <span className="tp-status-chip-count">{s.count}</span>
            </button>
          ))}
        </div>
        <div className="tp-search">
          <Icon name="search" size={15} />
          <input
            placeholder="Search templates by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="tp-search-clear" onClick={() => setSearch('')} title="Clear search">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Card grid */}
      {loading ? (
        <div className="tp-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="tp-card tp-card-skel" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="tp-skel tp-skel-pill" />
              <div className="tp-skel tp-skel-title" />
              <div className="tp-skel tp-skel-line" />
              <div className="tp-skel tp-skel-line tp-skel-line-short" />
            </div>
          ))}
        </div>
      ) : visibleTemplates.length === 0 ? (
        (() => {
          const e = emptyCopy();
          // If category filter is the reason for emptiness, show that copy.
          const catActive = category !== 'all';
          const title = catActive ? `No ${CATEGORY_META[category]?.label.toLowerCase() || 'matching'} templates` : e.title;
          const desc = catActive
            ? 'No templates in this category yet. Switch to "All categories" or pick a different filter.'
            : e.desc;
          const cta = catActive
            ? { label: 'Show all categories', onClick: () => setCategory('all'), variant: 'secondary' }
            : e.cta;
          return (
            <EmptyState
              illustration={<EmptyCAPAsIllustration />}
              title={title}
              body={desc}
              action={cta && (
                <button
                  className={`btn btn-${cta.variant || 'primary'}`}
                  onClick={cta.onClick}
                >
                  <Icon name={cta.variant === 'secondary' ? 'close' : 'plus'} size={14} /> {cta.label}
                </button>
              )}
            />
          );
        })()
      ) : (
        <div className="tp-grid">
          {visibleTemplates.map((tpl, idx) => {
            const kind = templateIllustrationKind(tpl);
            const cat = CATEGORY_META[kind];
            return (
              <article
                key={tpl.id}
                className={`tp-card tp-card-${tpl.status}`}
                style={{ animationDelay: `${50 + idx * 30}ms`, '--cat-color': cat.color }}
                onClick={() => navigate(`/templates/${tpl.id}/edit`)}
                onKeyDown={e => { if (e.key === 'Enter') navigate(`/templates/${tpl.id}/edit`); }}
                role="button"
                tabIndex={0}
              >
                <div className="tp-card-banner">
                  <TemplateIllustration kind={kind} />
                  <span
                    className="tp-card-cat-badge"
                    style={{ background: cat.bg, color: cat.color, borderColor: cat.color }}
                  >
                    {cat.label}
                  </span>
                  {tpl.latest_version > 0 && (
                    <span className="tp-card-version">v{tpl.latest_version}</span>
                  )}
                </div>

                <div className="tp-card-body">
                  <header className="tp-card-head">
                    <span className={`tp-status tp-status-${tpl.status}`}>
                      <span className="tp-status-dot" />
                      {tpl.status}
                    </span>
                  </header>

                  <h3 className="tp-card-title">{tpl.name}</h3>
                  {tpl.description && <p className="tp-card-desc">{tpl.description}</p>}

                  {(tpl.items_count > 0 || tpl.sections_count > 0) && (
                    <div className="tp-card-spec">
                      <span className="tp-spec-item">
                        <Icon name="file" size={11} />
                        <strong>{tpl.items_count}</strong> item{tpl.items_count !== 1 ? 's' : ''}
                      </span>
                      {tpl.sections_count > 0 && (
                        <span className="tp-spec-item">
                          <Icon name="templates" size={11} />
                          <strong>{tpl.sections_count}</strong> section{tpl.sections_count !== 1 ? 's' : ''}
                        </span>
                      )}
                      {estimateMinutes(tpl.items_count) && (
                        <span className="tp-spec-item">
                          <Icon name="clock" size={11} />
                          {estimateMinutes(tpl.items_count)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="tp-card-meta">
                    <span className="tp-meta-item">
                      <Icon name="person" size={12} />
                      {tpl.created_by_name || '—'}
                    </span>
                    <span className="tp-meta-sep">·</span>
                    <span className="tp-meta-item">
                      <Icon name="clock" size={12} />
                      {fmtDate(tpl.updated_at)}
                    </span>
                  </div>

                  {canEdit && (
                    <footer className="tp-card-actions">
                      {tpl.status === 'draft' && (
                        <button
                          type="button"
                          className="tp-action tp-action-ok"
                          onClick={e => handlePublish(e, tpl)}
                        >
                          <Icon name="check" size={13} /> Publish
                        </button>
                      )}
                      {tpl.status !== 'archived' && (
                        <button
                          type="button"
                          className="tp-action tp-action-danger"
                          onClick={e => handleArchive(e, tpl)}
                        >
                          <Icon name="close" size={13} /> Archive
                        </button>
                      )}
                      <button
                        type="button"
                        className="tp-action"
                        onClick={e => { e.stopPropagation(); navigate(`/templates/${tpl.id}/edit`); }}
                      >
                        <Icon name="edit" size={13} /> Edit
                      </button>
                    </footer>
                  )}
                </div>
              </article>
            );
          })}

          {canEdit && tab !== 'archived' && (
            <button
              type="button"
              className="tp-add-card"
              onClick={() => setShowCreate(true)}
            >
              <div className="tp-add-card-circle">
                <Icon name="plus" size={22} />
              </div>
              <div className="tp-add-card-label">New template</div>
              <div className="tp-add-card-sub">Build a new inspection checklist from scratch</div>
            </button>
          )}
        </div>
      )}

      <Pagination
        page={page}
        limit={PAGE_SIZE}
        total={templatesTotal}
        loading={loading}
        label="template"
        onPageChange={setPage}
      />

      {/* Create Modal */}
      {showCreate && createPortal(
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-template-modal-title">
            <div className="modal-h">
              <div>
                <div className="modal-title" id="new-template-modal-title">New Template</div>
                <div className="modal-sub">Create a new inspection template</div>
              </div>
              <button className="icon-btn" onClick={() => setShowCreate(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="label">Name <span className="req">*</span></label>
                <input className="input" placeholder="e.g. Fire Safety Inspection" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label className="label">Description</label>
                <SmartTextarea placeholder="Brief description of this template..." value={newDesc} onChange={setNewDesc} />
              </div>
            </div>
            <div className="modal-f">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? 'Creating...' : 'Create & Edit'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && <div className="toast" role="status" aria-live="polite"><Icon name="check" size={16} /> {toast}</div>}
    </div>
  );
}
