import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getInvestigations, updateInvestigation, closeInvestigation } from '../../api/investigations';
import { useApp } from '../../context/AppContext';
import Icon from '../../components/shared/Icon';
import SmartTextarea from '../../components/shared/SmartTextarea';
import { SevBadge } from '../../components/shared/Badges';
import { timeAgo } from '../../utils/time';
import '../../styles/investigations.css';

const KANBAN_COLS = [
  { id: 'pending', title: 'Pending', color: '#7E7E8C', icon: 'clock' },
  { id: 'progress', title: 'In progress', color: '#626DF9', icon: 'investigation' },
  { id: 'capa', title: 'Awaiting CAPA', color: '#ED6C02', icon: 'capa' },
  { id: 'closed', title: 'Closed', color: '#2E7D32', icon: 'check' },
];

const LANE_LABELS = { pending: 'Pending', progress: 'In progress', capa: 'Awaiting CAPA', closed: 'Closed' };

const ALLOWED_MOVES = {
  pending: ['progress'],
  progress: ['pending', 'closed'],
  capa: ['closed'],
  closed: [],
};

export default function InvestigationsPage() {
  const navigate = useNavigate();
  const { refreshKey } = useApp();
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [search, setSearch] = useState('');

  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [toast, setToast] = useState(null);

  const [closeModal, setCloseModal] = useState(null);
  const [closeReason, setCloseReason] = useState('');
  const [closing, setClosing] = useState(false);

  const dragSourceCol = useRef(null);

  const load = () => {
    setLoading(true);
    getInvestigations()
      .then(data => setInvestigations(data.investigations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshKey]);

  const stats = useMemo(() => ({
    pending: investigations.filter(i => i.status === 'pending').length,
    progress: investigations.filter(i => i.status === 'progress').length,
    capa: investigations.filter(i => i.status === 'capa').length,
    closed: investigations.filter(i => i.status === 'closed').length,
  }), [investigations]);

  const filtered = useMemo(() => {
    if (!search.trim()) return investigations;
    const q = search.toLowerCase();
    return investigations.filter(i =>
      (i.incident_title || '').toLowerCase().includes(q) ||
      (i.investigation_number || '').toLowerCase().includes(q) ||
      (i.site_name || '').toLowerCase().includes(q) ||
      (i.lead_name || '').toLowerCase().includes(q)
    );
  }, [investigations, search]);

  const byLane = (laneId) => filtered.filter(inv => inv.status === laneId);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const handleDragStart = (e, inv) => {
    if (inv.status === 'closed') { e.preventDefault(); return; }
    dragSourceCol.current = inv.status;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', inv.id);
    requestAnimationFrame(() => setDragId(inv.id));
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    const from = dragSourceCol.current;
    if (!from || from === colId) { setOverCol(null); return; }
    if (!ALLOWED_MOVES[from]?.includes(colId)) {
      e.dataTransfer.dropEffect = 'none';
      setOverCol(null);
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    setOverCol(colId);
  };

  const handleDragLeave = (e, colId) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      if (overCol === colId) setOverCol(null);
    }
  };

  const handleDrop = async (e, targetCol) => {
    e.preventDefault();
    setOverCol(null);
    const invId = parseInt(e.dataTransfer.getData('text/plain'));
    const inv = investigations.find(i => i.id === invId);
    if (!inv || inv.status === targetCol) { setDragId(null); return; }

    const from = inv.status;
    if (!ALLOWED_MOVES[from]?.includes(targetCol)) {
      showToast(`Cannot move from ${LANE_LABELS[from]} to ${LANE_LABELS[targetCol]}`);
      setDragId(null);
      return;
    }

    if (targetCol === 'closed') {
      setCloseModal(inv);
      setCloseReason('');
      setDragId(null);
      return;
    }

    try {
      setInvestigations(prev => prev.map(i => i.id === invId ? { ...i, status: targetCol } : i));
      await updateInvestigation(invId, { status: targetCol });
      showToast(`Moved to ${LANE_LABELS[targetCol]}`);
    } catch {
      load();
      showToast('Failed to update status');
    }
    setDragId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setOverCol(null);
    dragSourceCol.current = null;
  };

  const handleCloseInvestigation = async () => {
    if (!closeModal) return;
    setClosing(true);
    try {
      await closeInvestigation(closeModal.id, { reason: closeReason || 'Closed via board' });
      showToast('Investigation closed');
      setCloseModal(null);
      load();
    } catch {
      showToast('Failed to close investigation');
    }
    setClosing(false);
  };

  return (
    <div className="page inv-page">
      {/* Hero card */}
      <div className="inv-hero">
        <div className="inv-hero-row">
          <div className="inv-hero-icon">
            <Icon name="investigation" size={24} />
          </div>
          <div className="inv-hero-text">
            <h1 className="inv-heading">Investigations</h1>
            <p className="inv-subtitle">Track A & B incidents under root-cause analysis</p>
          </div>
          <div className="inv-hero-actions">
            <div className="inv-view-toggle" role="tablist">
              <button className={`inv-view-btn ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>
                <Icon name="dashboard" size={13}/>Board
              </button>
              <button className={`inv-view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
                <Icon name="sort" size={13}/>List
              </button>
            </div>
            <button className="inv-export-btn"><Icon name="export" size={14}/>Export</button>
          </div>
        </div>
        <div className="inv-stats">
          {KANBAN_COLS.map(col => (
            <div key={col.id} className="inv-stat" style={{ '--is-color': col.color }}>
              <div className="inv-stat-icon"><Icon name={col.icon} size={16} /></div>
              <div>
                <div className="inv-stat-val">{stats[col.id]}</div>
                <div className="inv-stat-lbl">{col.title}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="inv-search-row">
          <div className="inv-search">
            <span className="inv-search-icon"><Icon name="search" size={15}/></span>
            <input placeholder="Search investigations..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="inv-skeleton">
          {[1,2,3,4].map(i => (
            <div key={i} className="inv-skeleton-col">
              <div className="inv-skeleton-card" style={{ animationDelay: `${i * 100}ms` }}/>
              <div className="inv-skeleton-card" style={{ height: 90, animationDelay: `${i * 100 + 50}ms` }}/>
            </div>
          ))}
        </div>
      ) : investigations.length === 0 ? (
        <div className="inv-empty">
          <div className="inv-empty-icon"><Icon name="investigation" size={26}/></div>
          <h3>No investigations yet</h3>
          <p>Escalate an incident to start a formal investigation</p>
        </div>
      ) : view === 'kanban' ? (
        <div className="inv-kanban">
          {KANBAN_COLS.map(col => {
            const cards = byLane(col.id);
            const isOver = overCol === col.id;
            return (
              <div
                key={col.id}
                className={`inv-col ${isOver ? 'inv-col-over' : ''}`}
                style={{ '--col-accent': col.color }}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={(e) => handleDragLeave(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                <div className="inv-col-header">
                  <span className="inv-col-accent" style={{ background: col.color }}/>
                  <span className="inv-col-title">{col.title}</span>
                  <span className="inv-col-count">{cards.length}</span>
                </div>
                <div className="inv-col-cards">
                  {cards.map((inv, idx) => (
                    <div
                      key={inv.id}
                      className={`inv-kcard ks-${inv.severity} ${dragId === inv.id ? 'inv-dragging' : ''}`}
                      draggable={inv.status !== 'closed'}
                      onDragStart={(e) => handleDragStart(e, inv)}
                      onDragEnd={handleDragEnd}
                      onClick={() => navigate(`/investigations/${inv.id}`)}
                      style={{ animationDelay: `${idx * 50}ms`, cursor: inv.status === 'closed' ? 'pointer' : 'grab' }}
                    >
                      {inv.status !== 'closed' && <div className="inv-kcard-grip"><Icon name="sort" size={12}/></div>}
                      <div className="inv-kcard-top">
                        <span className="inv-kcard-ref">{inv.investigation_number}</span>
                        <SevBadge s={inv.severity}/>
                      </div>
                      <div className="inv-kcard-title">{inv.incident_title}</div>
                      <div className="inv-kcard-meta">
                        <Icon name="location" size={11}/>{inv.site_name}
                        <span className="meta-sep">·</span>
                        {timeAgo(inv.created_at)}
                      </div>
                      {/* Hover-reveal detail rows */}
                      <div className="inv-kcard-expand">
                        <div className="inv-kcard-expand-inner">
                          {inv.location && (
                            <div className="inv-kcard-detail"><Icon name="location" size={11}/><span>Area: {inv.location}</span></div>
                          )}
                          {inv.lead_name && (
                            <div className="inv-kcard-detail"><Icon name="person" size={11}/><span>Lead: {inv.lead_name}</span></div>
                          )}
                          {inv.reporter_name && (
                            <div className="inv-kcard-detail"><Icon name="edit" size={11}/><span>Reporter: {inv.reporter_name}</span></div>
                          )}
                          {inv.incident_type && (
                            <div className="inv-kcard-detail"><Icon name="incidents" size={11}/><span style={{ textTransform: 'capitalize' }}>{inv.incident_type.replace('_', ' ')}</span></div>
                          )}
                        </div>
                      </div>
                      {(inv.riddor_reportable === 1 || inv.capa_count > 0) && (
                        <div className="inv-kcard-flags">
                          {inv.riddor_reportable === 1 && <span className="inv-kflag kf-riddor"><span className="kf-dot"/>RIDDOR</span>}
                          {inv.capa_count > 0 && <span className="inv-kflag kf-capa"><span className="kf-dot"/>{inv.capa_count} CAPAs</span>}
                        </div>
                      )}
                      <div className="inv-kcard-foot">
                        <div className="inv-kcard-team">
                          {inv.team && inv.team.length > 0
                            ? inv.team.slice(0, 3).map((t, i) => <div key={i} className="inv-kcard-av">{t.initials}</div>)
                            : <span style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)' }}>Unassigned</span>
                          }
                        </div>
                        <span className="inv-kcard-time">{timeAgo(inv.created_at)}</span>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="inv-col-empty">
                      {isOver ? 'Drop here' : 'No investigations'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="inv-list-wrap">
          <div className="inv-list-row inv-list-head">
            <span>ID</span>
            <span>Title</span>
            <span>Severity</span>
            <span>Site</span>
            <span>Status</span>
            <span>Team</span>
            <span>Flags</span>
            <span>Age</span>
          </div>
          {investigations.map(inv => (
            <div key={inv.id} className="inv-list-row" onClick={() => navigate(`/investigations/${inv.id}`)}>
              <span className="inv-list-ref">{inv.investigation_number}</span>
              <span className="inv-list-title">{inv.incident_title}</span>
              <span><SevBadge s={inv.severity}/></span>
              <span style={{ fontSize: 12, color: 'var(--sds-fg-secondary)' }}>{inv.site_name}</span>
              <span>
                <span className={`inv-list-lane ln-${inv.status}`}>
                  <span className="ln-dot"/>{LANE_LABELS[inv.status] || inv.status}
                </span>
              </span>
              <span>
                <div className="inv-list-team">
                  {inv.team && inv.team.length > 0
                    ? inv.team.slice(0, 3).map((t, i) => <div key={i} className="inv-kcard-av" style={{ width: 24, height: 24, fontSize: 9 }}>{t.initials}</div>)
                    : <span style={{ fontSize: 11, color: 'var(--sds-fg-tertiary)' }}>—</span>
                  }
                </div>
              </span>
              <span>
                <div className="inv-list-flags">
                  {inv.riddor_reportable === 1 && <span className="inv-kflag kf-riddor"><span className="kf-dot"/>RIDDOR</span>}
                  {inv.capa_count > 0 && <span className="inv-kflag kf-capa"><span className="kf-dot"/>{inv.capa_count}</span>}
                  {inv.riddor_reportable !== 1 && !inv.capa_count && <span style={{ fontSize: 12, color: 'var(--sds-fg-tertiary)' }}>—</span>}
                </div>
              </span>
              <span className="inv-list-time">{timeAgo(inv.created_at)}</span>
            </div>
          ))}
          {investigations.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No investigations</div>
          )}
        </div>
      )}

      {/* Close investigation modal */}
      {closeModal && createPortal(
        <div className="idet-modal-backdrop" onClick={() => setCloseModal(null)}>
          <div className="idet-modal" onClick={e => e.stopPropagation()}>
            <div className="idet-modal-header">
              <div>
                <div className="idet-modal-title">Close Investigation</div>
                <div className="idet-modal-sub">{closeModal.investigation_number} — {closeModal.incident_title}</div>
              </div>
              <button className="idet-modal-close" onClick={() => setCloseModal(null)}>
                <Icon name="close" size={14}/>
              </button>
            </div>
            <div className="idet-modal-body">
              <div className="modal-hint">
                Closing this investigation will mark it as resolved. Please provide a brief closure reason.
              </div>
              <div className="form-group">
                <label className="form-label">Closure reason</label>
                <SmartTextarea
                  value={closeReason}
                  onChange={setCloseReason}
                  rows={3}
                  examples={['Root cause addressed by existing control; no further action required.', 'CAPA completed and verified — corrective measures in place.', 'Findings show incident was non-work-related per OSHA criteria.']}
                  chips={['Existing controls sufficient', 'CAPA verified', 'Non-work-related']}
                />
              </div>
            </div>
            <div className="idet-modal-footer">
              <button className="modal-cancel" onClick={() => setCloseModal(null)}>Cancel</button>
              <button className="modal-confirm" onClick={handleCloseInvestigation} disabled={closing}>
                <Icon name="check" size={14}/>{closing ? 'Closing...' : 'Close investigation'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="invd-toast" role="status" aria-live="polite">
          <span className="toast-check"><Icon name="check" size={12}/></span>
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
}
