import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getCapas, updateCapa, completeCapa, verifyCapa, rejectCapa } from '../../api/capas';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import NewCapaModal from '../../components/modals/NewCapaModal';
import { formatDateShort } from '../../utils/time';
import '../../styles/capas.css';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const CAPA_LANES = [
  { id: 'pending', title: 'Pending', color: '#7E7E8C', desc: 'Assigned, not started yet' },
  { id: 'progress', title: 'In progress', color: '#626DF9', desc: 'Owner working on it' },
  { id: 'verify', title: 'Pending verification', color: '#ED6C02', desc: 'Owner says complete · verifier required' },
  { id: 'closed', title: 'Verified · Closed', color: '#2E7D32', desc: 'Verifier confirmed effectiveness' },
];

const LANE_LABELS = { pending: 'Pending', progress: 'In progress', verify: 'Pending verification', closed: 'Verified · Closed' };

const ALLOWED_MOVES = {
  pending: ['progress'],
  progress: ['pending', 'verify'],
  verify: ['progress', 'closed'],
  closed: [],
};

export default function CAPAPage() {
  const navigate = useNavigate();
  const { refreshKey } = useApp();
  const { user } = useAuth();
  const canCreate = ELEVATED_ROLES.has(user?.role);
  const [showNew, setShowNew] = useState(false);
  const [capas, setCapas] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('board');
  const [tab, setTab] = useState('all');

  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [toast, setToast] = useState(null);

  const dragSourceCol = useRef(null);

  const load = () => {
    setLoading(true);
    getCapas()
      .then(data => { setCapas(data.capas || []); setStats(data.stats || {}); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshKey]);

  const rows = capas.filter(c => {
    if (tab === 'active') return c.status === 'pending' || c.status === 'progress';
    if (tab === 'verify') return c.status === 'verify';
    if (tab === 'overdue') return c.overdue;
    if (tab === 'closed') return c.status === 'closed';
    return true;
  });

  const tabs = [
    { id: 'all', label: 'All', count: capas.length },
    { id: 'active', label: 'Active', count: capas.filter(c => c.status === 'pending' || c.status === 'progress').length },
    { id: 'verify', label: 'Verification', count: capas.filter(c => c.status === 'verify').length },
    { id: 'overdue', label: 'Overdue', count: capas.filter(c => c.overdue).length },
    { id: 'closed', label: 'Closed', count: capas.filter(c => c.status === 'closed').length },
  ];

  const progressClass = (c) => c.overdue ? 'pf-overdue' : c.progress >= 100 ? 'pf-done' : '';
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const handleDragStart = (e, capa) => {
    if (capa.status === 'closed') { e.preventDefault(); return; }
    dragSourceCol.current = capa.status;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', capa.id);
    requestAnimationFrame(() => setDragId(capa.id));
  };

  const handleDragOver = (e, laneId) => {
    e.preventDefault();
    const from = dragSourceCol.current;
    if (!from || from === laneId) { setOverCol(null); return; }
    if (!ALLOWED_MOVES[from]?.includes(laneId)) {
      e.dataTransfer.dropEffect = 'none';
      setOverCol(null);
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    setOverCol(laneId);
  };

  const handleDragLeave = (e, laneId) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      if (overCol === laneId) setOverCol(null);
    }
  };

  const handleDrop = async (e, targetLane) => {
    e.preventDefault();
    setOverCol(null);
    const capaId = parseInt(e.dataTransfer.getData('text/plain'));
    const capa = capas.find(c => c.id === capaId);
    if (!capa || capa.status === targetLane) { setDragId(null); return; }

    const from = capa.status;
    if (!ALLOWED_MOVES[from]?.includes(targetLane)) {
      showToast(`Cannot move from ${LANE_LABELS[from]} to ${LANE_LABELS[targetLane]}`);
      setDragId(null);
      return;
    }

    try {
      if (from === 'pending' && targetLane === 'progress') {
        setCapas(prev => prev.map(c => c.id === capaId ? { ...c, status: 'progress' } : c));
        await updateCapa(capaId, { status: 'progress' });
        showToast('CAPA started');
      } else if (from === 'progress' && targetLane === 'pending') {
        setCapas(prev => prev.map(c => c.id === capaId ? { ...c, status: 'pending' } : c));
        await updateCapa(capaId, { status: 'pending' });
        showToast('Moved back to pending');
      } else if (from === 'progress' && targetLane === 'verify') {
        setCapas(prev => prev.map(c => c.id === capaId ? { ...c, status: 'verify', progress: 100 } : c));
        await completeCapa(capaId, {});
        showToast('Submitted for verification');
      } else if (from === 'verify' && targetLane === 'progress') {
        setCapas(prev => prev.map(c => c.id === capaId ? { ...c, status: 'progress' } : c));
        await rejectCapa(capaId, { notes: 'Needs more work' });
        showToast('Rejected — sent back to progress');
      } else if (from === 'verify' && targetLane === 'closed') {
        setCapas(prev => prev.map(c => c.id === capaId ? { ...c, status: 'closed' } : c));
        await verifyCapa(capaId, { result: 'effective' });
        showToast('CAPA verified & closed');
      }
      load();
    } catch (err) {
      load();
      showToast(err.response?.data?.error || 'Failed to update CAPA');
    }
    setDragId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setOverCol(null);
    dragSourceCol.current = null;
  };

  return (
    <div className="page">
      {/* Hero */}
      <div className="capa-hero">
        <div>
          <h1 className="capa-heading">CAPA</h1>
          <p className="capa-subtitle">Corrective & preventive actions across all sites. The CAPA owner cannot close their own action — an independent verifier must confirm.</p>
        </div>
        <div className="capa-hero-right">
          <div className="inv-view-toggle" role="tablist">
            <button className={`inv-view-btn ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')}>
              <Icon name="dashboard" size={13}/>Board
            </button>
            <button className={`inv-view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
              <Icon name="sort" size={13}/>List
            </button>
          </div>
          <button className="inv-export-btn"><Icon name="export" size={14}/>Export</button>
          {canCreate && (
            <button className="ncap-new-btn" onClick={() => setShowNew(true)}>
              <Icon name="plus" size={14}/>New CAPA
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="capa-stats">
        <div className="capa-stat cs-open">
          <div className="capa-stat-top">
            <div>
              <div className="capa-stat-label">Open CAPAs</div>
              <div className="capa-stat-val">{stats.total || 0}</div>
            </div>
            <div className="capa-stat-icon"><Icon name="capa" size={18}/></div>
          </div>
          <div className="capa-stat-sub">{stats.corrective || 0} corrective · {stats.preventive || 0} preventive</div>
        </div>
        <div className="capa-stat cs-overdue">
          <div className="capa-stat-top">
            <div>
              <div className="capa-stat-label">Overdue</div>
              <div className="capa-stat-val">{stats.overdue || 0}</div>
            </div>
            <div className="capa-stat-icon"><Icon name="warning" size={18}/></div>
          </div>
          <div className="capa-stat-sub">Past due date</div>
        </div>
        <div className="capa-stat cs-verify">
          <div className="capa-stat-top">
            <div>
              <div className="capa-stat-label">Pending verification</div>
              <div className="capa-stat-val">{stats.pendingVerification || 0}</div>
            </div>
            <div className="capa-stat-icon"><Icon name="check" size={18}/></div>
          </div>
          <div className="capa-stat-sub">Awaiting independent verification</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="capa-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`capa-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            <span className="tab-ct">{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="capa-skeleton">
          {[1,2,3,4].map(i => (
            <div key={i} className="capa-skeleton-col">
              <div className="capa-skeleton-card" style={{ animationDelay: `${i * 100}ms` }}/>
              <div className="capa-skeleton-card" style={{ height: 100, animationDelay: `${i * 100 + 50}ms` }}/>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="capa-empty">
          <div className="capa-empty-icon"><Icon name="capa" size={26}/></div>
          <h3>No CAPAs found</h3>
          <p>{tab !== 'all' ? 'Try adjusting your filter' : 'Assign a CAPA from an investigation to get started'}</p>
        </div>
      ) : view === 'board' ? (
        <div className="capa-kanban">
          {CAPA_LANES.map(lane => {
            const cards = rows.filter(c => c.status === lane.id);
            const isOver = overCol === lane.id;
            return (
              <div
                key={lane.id}
                className={`capa-kcol ${isOver ? 'capa-kcol-over' : ''}`}
                style={{ '--col-accent': lane.color }}
                onDragOver={(e) => handleDragOver(e, lane.id)}
                onDragLeave={(e) => handleDragLeave(e, lane.id)}
                onDrop={(e) => handleDrop(e, lane.id)}
              >
                <div className="capa-kcol-header">
                  <span className="capa-kcol-accent" style={{ background: lane.color }}/>
                  <span className="capa-kcol-title">{lane.title}</span>
                  <span className="capa-kcol-count">{cards.length}</span>
                </div>
                <div className="capa-kcol-desc">{lane.desc}</div>
                <div className="capa-kcol-cards">
                  {cards.map((c, idx) => (
                    <div
                      key={c.id}
                      className={`capa-kcard kc-${c.type} ${c.overdue ? 'kc-overdue' : ''} ${dragId === c.id ? 'capa-dragging' : ''}`}
                      draggable={c.status !== 'closed'}
                      onDragStart={(e) => handleDragStart(e, c)}
                      onDragEnd={handleDragEnd}
                      onClick={() => navigate(`/capas/${c.id}`)}
                      style={{ animationDelay: `${idx * 50}ms`, cursor: c.status === 'closed' ? 'pointer' : 'grab' }}
                    >
                      {c.status !== 'closed' && <div className="capa-kcard-grip"><Icon name="sort" size={12}/></div>}
                      <div className="capa-kcard-top">
                        <span className="capa-kcard-ref">{c.capa_number}</span>
                        <span className={`capa-kcard-type kt-${c.type}`}>
                          <span className="kt-dot"/>{c.type === 'corrective' ? 'Corrective' : 'Preventive'}
                        </span>
                      </div>
                      <div className="capa-kcard-title">{c.title}</div>
                      <div className="capa-kcard-source">
                        {c.source_type === 'proactive' ? (
                          <><Icon name="leaf" size={11}/>Proactive</>
                        ) : c.source_type === 'incident' ? (
                          <><Icon name="incidents" size={11}/>From <b>{c.incident_number}</b></>
                        ) : (
                          <><Icon name="investigation" size={11}/>From <b>{c.investigation_number}</b></>
                        )}
                      </div>
                      <div className="capa-kcard-progress">
                        <div className="capa-kcard-progress-head">
                          <span className="pct">{c.progress || 0}%</span>
                          <span className={`due ${c.overdue ? 'overdue' : ''}`}>Due {formatDateShort(c.due_date)}</span>
                        </div>
                        <div className="capa-progress-track">
                          <div className={`capa-progress-fill ${progressClass(c)}`} style={{ width: `${c.progress || 0}%` }}/>
                        </div>
                      </div>
                      <div className="capa-kcard-foot">
                        <div className="capa-kcard-people">
                          <span className="capa-kcard-av av-owner">{c.owner_initials}</span>
                          <span className="capa-kcard-arrow">→</span>
                          <span className="capa-kcard-av av-verifier">{c.verifier_initials}</span>
                        </div>
                        {c.overdue
                          ? <span className="capa-kcard-flag kf-overdue"><span className="kf-dot"/>Overdue</span>
                          : <span className={`capa-kcard-lane kl-${c.status}`}><span className="kl-dot"/>{lane.title}</span>
                        }
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className="capa-col-empty">
                      {isOver ? 'Drop here' : 'No CAPAs'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="capa-list-wrap">
          <div className="capa-list-row capa-list-head">
            <span>ID</span><span>Action</span><span>Type</span><span>Source</span>
            <span>Own</span><span>Ver</span><span>Progress</span><span>Due</span><span>Status</span>
          </div>
          {rows.map(c => (
            <div key={c.id} className="capa-list-row" onClick={() => navigate(`/capas/${c.id}`)}>
              <span className="capa-list-ref">{c.capa_number}</span>
              <span className="capa-list-title">{c.title}</span>
              <span>
                <span className={`capa-kcard-type kt-${c.type}`}>
                  <span className="kt-dot"/>{c.type === 'corrective' ? 'Corr.' : 'Prev.'}
                </span>
              </span>
              <span className="capa-list-ref">
                {c.source_type === 'proactive' ? 'Proactive'
                  : c.source_type === 'incident' ? c.incident_number
                  : c.investigation_number}
              </span>
              <span><span className="capa-kcard-av av-owner" style={{ width: 24, height: 24, fontSize: 9 }}>{c.owner_initials}</span></span>
              <span><span className="capa-kcard-av av-verifier" style={{ width: 24, height: 24, fontSize: 9, marginLeft: 0 }}>{c.verifier_initials}</span></span>
              <span>
                <div className="capa-progress-track" style={{ height: 4 }}>
                  <div className={`capa-progress-fill ${progressClass(c)}`} style={{ width: `${c.progress || 0}%` }}/>
                </div>
              </span>
              <span className={`capa-list-due ${c.overdue ? 'overdue' : ''}`} style={!c.overdue ? { color: 'var(--sds-fg-tertiary)' } : {}}>{formatDateShort(c.due_date)}</span>
              <span>
                <span className={`capa-kcard-lane kl-${c.status}`}>
                  <span className="kl-dot"/>{LANE_LABELS[c.status] || c.status}
                </span>
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No CAPAs found</div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="capd-toast">
          <span className="toast-check"><Icon name="check" size={12}/></span>
          {toast}
        </div>,
        document.body
      )}

      {/* New CAPA modal */}
      {showNew && createPortal(
        <NewCapaModal
          onCancel={() => setShowNew(false)}
          onCreated={(c) => {
            setShowNew(false);
            showToast(`Created ${c.capa_number}`);
            load();
          }}
        />,
        document.body
      )}
    </div>
  );
}
