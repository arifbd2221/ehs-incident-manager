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
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const statusLabel = (s) => {
    if (s === 'in_progress') return 'In Progress';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const tabs = [
    { id: 'all', label: 'All', count: summary.total },
    { id: 'in_progress', label: 'In Progress', count: summary.in_progress },
    { id: 'completed', label: 'Completed', count: summary.completed },
    { id: 'abandoned', label: 'Abandoned', count: summary.abandoned },
  ];

  const statCards = [
    { label: 'Total', value: summary.total, icon: 'shield', accent: 'var(--sds-brand-primary)', accentBg: 'var(--sds-brand-primary-tint)' },
    { label: 'In Progress', value: summary.in_progress, icon: 'pulse', accent: 'var(--sds-brand-primary)', accentBg: 'var(--sds-brand-primary-tint)' },
    { label: 'Completed', value: summary.completed, icon: 'check', accent: 'var(--sds-success)', accentBg: 'rgba(46,125,50,0.08)' },
    { label: 'Abandoned', value: summary.abandoned, icon: 'close', accent: '#999', accentBg: 'rgba(0,0,0,0.04)' },
  ];

  return (
    <div className="page ip-page">
      {/* Hero */}
      <div className="ip-hero">
        <div>
          <div className="ip-heading">Inspections</div>
          <div className="ip-subtitle">
            Conduct safety inspections
            <span className="count-badge">{summary.total} inspections</span>
          </div>
        </div>
        <div className="ip-hero-actions">
          {canCreate && (
            <button className="ip-btn-start" onClick={openStartModal}>
              <Icon name="plus" size={16} /> Start Inspection
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="ip-stats">
        {statCards.map(s => (
          <div key={s.label} className="ip-stat" style={{ '--stat-accent': s.accent, '--stat-accent-bg': s.accentBg }}>
            <div className="ip-stat-label">{s.label}</div>
            <div className="ip-stat-value">{loading ? '—' : s.value}</div>
            <div className="ip-stat-icon"><Icon name={s.icon} size={18} /></div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="ip-toolbar">
        <div className="ip-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`ip-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label} <span className="cnt">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="ip-search">
          <Icon name="search" size={16} color="var(--sds-fg-muted)" />
          <input
            placeholder="Search inspections..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="ip-table-wrap">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="ip-skel-row">
              <div className="ip-skel" style={{ width: '80%' }} />
              <div className="ip-skel" style={{ width: '60%' }} />
              <div className="ip-skel" style={{ width: '50%' }} />
              <div className="ip-skel" style={{ width: '40%' }} />
              <div className="ip-skel" style={{ width: '60%' }} />
              <div className="ip-skel" style={{ width: '40%' }} />
            </div>
          ))
        ) : inspections.length === 0 ? (
          <div className="ip-empty">
            <div className="ip-empty-icon"><Icon name="shield" size={28} /></div>
            <div className="ip-empty-title">No inspections yet</div>
            <div className="ip-empty-desc">Start your first inspection from a published template</div>
            {canCreate && (
              <button className="ip-btn-start" onClick={openStartModal}>
                <Icon name="plus" size={16} /> Start Inspection
              </button>
            )}
          </div>
        ) : (
          <table className="ip-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Status</th>
                <th>Location</th>
                <th>Started By</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((ins, idx) => (
                <tr key={ins.id} onClick={() => navigate(`/inspections/${ins.id}`)} style={{ animationDelay: `${50 + idx * 30}ms` }}>
                  <td><span className="ip-number">{ins.inspection_number}</span></td>
                  <td>
                    <div className="ip-title-cell">{ins.title}</div>
                    {ins.template_name && (
                      <div className="ip-template-name">
                        {ins.template_name}
                        {ins.template_version_number && <span className="ip-version-tag">v{ins.template_version_number}</span>}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`ip-status ip-status-${ins.status}`}>
                      <span className="dot" /> {statusLabel(ins.status)}
                    </span>
                  </td>
                  <td className="ip-meta-cell">{ins.location || '—'}</td>
                  <td className="ip-meta-cell">{ins.started_by_name || '—'}</td>
                  <td className="ip-meta-cell">{fmtDate(ins.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
