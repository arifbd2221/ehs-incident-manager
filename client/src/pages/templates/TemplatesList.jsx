import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getTemplates, getTemplateSummary, createTemplate, archiveTemplate, publishTemplate } from '../../api/templates';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import '../../styles/templates.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

export default function TemplatesList() {
  const navigate = useNavigate();
  const { refreshKey } = useApp();
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);

  const [templates, setTemplates] = useState([]);
  const [summary, setSummary] = useState({ total: 0, draft: 0, published: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      getTemplates(tab !== 'all' ? { status: tab, search } : { search }),
      getTemplateSummary(),
    ]).then(([list, sum]) => {
      setTemplates(list.templates || []);
      setSummary(sum);
    }).catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshKey, tab, search]);

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

  const tabs = [
    { id: 'all', label: 'All', count: summary.total },
    { id: 'draft', label: 'Drafts', count: summary.draft },
    { id: 'published', label: 'Published', count: summary.published },
    { id: 'archived', label: 'Archived', count: summary.archived },
  ];

  const statCards = [
    { label: 'Total', value: summary.total, icon: 'file', accent: 'var(--sds-brand-primary)', accentBg: 'rgba(98,109,249,0.08)' },
    { label: 'Drafts', value: summary.draft, icon: 'edit', accent: '#7E7E8C', accentBg: 'rgba(126,126,140,0.08)' },
    { label: 'Published', value: summary.published, icon: 'check', accent: '#2E7D32', accentBg: 'rgba(46,125,50,0.08)' },
    { label: 'Archived', value: summary.archived, icon: 'clock', accent: '#999', accentBg: 'rgba(0,0,0,0.04)' },
  ];

  return (
    <div className="page tp-page">
      {/* Hero */}
      <div className="tp-hero">
        <div className="tp-hero-shapes" aria-hidden="true">
          <span className="tp-shape tp-shape-circle" />
          <span className="tp-shape tp-shape-rect" />
          <span className="tp-shape tp-shape-dot" />
          <span className="tp-shape tp-shape-ring" />
          <span className="tp-shape tp-shape-square" />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="tp-heading">Templates</div>
          <div className="tp-subtitle">
            Build inspection checklists
            <span className="count-badge">{summary.total} templates</span>
          </div>
        </div>
        <div className="tp-hero-actions" style={{ position: 'relative', zIndex: 1 }}>
          {canEdit && (
            <button className="tp-btn-create" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={16} /> New Template
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="tp-stats">
        {statCards.map(s => (
          <div key={s.label} className="tp-stat" style={{ '--stat-accent': s.accent, '--stat-accent-bg': s.accentBg }}>
            <div className="tp-stat-label">{s.label}</div>
            <div className="tp-stat-value">{loading ? '—' : s.value}</div>
            <div className="tp-stat-icon"><Icon name={s.icon} size={18} /></div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="tp-toolbar">
        <div className="tp-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`tp-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label} <span className="cnt">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="tp-search">
          <Icon name="search" size={16} color="var(--sds-fg-muted)" />
          <input
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="tp-table-wrap">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="tp-skel-row">
              <div className="tp-skel w80" />
              <div className="tp-skel w40" />
              <div className="tp-skel w60" />
              <div className="tp-skel w40" />
              <div className="tp-skel w40" />
            </div>
          ))
        ) : (
          <table className="tp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="tp-empty-row">
                    <div className="tp-empty">
                      <div className="tp-empty-illustration" aria-hidden="true">
                        <span className="tp-ei-shape tp-ei-circle-1" />
                        <span className="tp-ei-shape tp-ei-circle-2" />
                        <span className="tp-ei-shape tp-ei-rect-1" />
                        <span className="tp-ei-shape tp-ei-rect-2" />
                        <span className="tp-ei-shape tp-ei-dot-1" />
                        <span className="tp-ei-shape tp-ei-dot-2" />
                        <span className="tp-ei-shape tp-ei-dot-3" />
                        <div className="tp-empty-icon"><Icon name="file" size={28} /></div>
                      </div>
                      <div className="tp-empty-title">No templates yet</div>
                      <div className="tp-empty-desc">Create your first inspection template to get started</div>
                      {canEdit && (
                        <button className="tp-btn-create" onClick={() => setShowCreate(true)}>
                          <Icon name="plus" size={16} /> Create Template
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : templates.map((tpl, idx) => (
                <tr key={tpl.id} onClick={() => navigate(`/templates/${tpl.id}/edit`)} style={{ animationDelay: `${50 + idx * 30}ms` }}>
                  <td>
                    <div className="tp-name">{tpl.name}</div>
                    {tpl.description && <div className="tp-name-desc">{tpl.description}</div>}
                  </td>
                  <td>
                    <span className={`tp-status tp-status-${tpl.status}`}>
                      <span className="dot" /> {tpl.status}
                    </span>
                    {tpl.latest_version > 0 && (
                      <span className="tp-version-tag">v{tpl.latest_version}</span>
                    )}
                  </td>
                  <td className="tp-meta-cell">{tpl.created_by_name || '—'}</td>
                  <td className="tp-meta-cell">{fmtDate(tpl.updated_at)}</td>
                  <td>
                    <div className="tp-actions-cell">
                      {canEdit && tpl.status === 'draft' && (
                        <button className="icon-btn" title="Publish" onClick={e => handlePublish(e, tpl)}>
                          <Icon name="check" size={16} />
                        </button>
                      )}
                      {canEdit && tpl.status !== 'archived' && (
                        <button className="icon-btn" title="Archive" onClick={e => handleArchive(e, tpl)}>
                          <Icon name="close" size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
                <textarea className="textarea" placeholder="Brief description of this template..." value={newDesc} onChange={e => setNewDesc(e.target.value)} />
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
