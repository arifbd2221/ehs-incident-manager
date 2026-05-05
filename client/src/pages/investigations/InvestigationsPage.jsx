import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInvestigations } from '../../api/investigations';
import { useApp } from '../../context/AppContext';
import Icon from '../../components/shared/Icon';
import { SevBadge } from '../../components/shared/Badges';
import { timeAgo } from '../../utils/time';
import '../../styles/investigations.css';

const KANBAN_COLS = [
  { id: 'pending', title: 'Pending', color: '#7E7E8C' },
  { id: 'progress', title: 'In progress', color: '#626DF9' },
  { id: 'capa', title: 'Awaiting CAPA', color: '#ED6C02' },
  { id: 'closed', title: 'Closed', color: '#2E7D32' },
];

const LANE_LABELS = { pending: 'Pending', progress: 'In progress', capa: 'Awaiting CAPA', closed: 'Closed' };

export default function InvestigationsPage() {
  const navigate = useNavigate();
  const { refreshKey } = useApp();
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');

  useEffect(() => {
    setLoading(true);
    getInvestigations()
      .then(data => setInvestigations(data.investigations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const byLane = (laneId) => investigations.filter(inv => inv.status === laneId);

  return (
    <div className="page">
      {/* Hero */}
      <div className="inv-hero">
        <div>
          <h1 className="inv-heading">Investigations</h1>
          <p className="inv-subtitle">
            Track A & B incidents under root-cause analysis
            <span className="inv-count">{investigations.length} active</span>
          </p>
        </div>
        <div className="inv-hero-right">
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
            return (
              <div key={col.id} className="inv-col">
                <div className="inv-col-header">
                  <span className="inv-col-accent" style={{ background: col.color }}/>
                  <span className="inv-col-title">{col.title}</span>
                  <span className="inv-col-count">{cards.length}</span>
                </div>
                <div className="inv-col-cards">
                  {cards.map((inv, idx) => (
                    <div key={inv.id} className={`inv-kcard ks-${inv.severity}`} onClick={() => navigate(`/investigations/${inv.id}`)} style={{ animationDelay: `${idx * 50}ms` }}>
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
                    <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: 'var(--sds-fg-tertiary)' }}>
                      No investigations
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
    </div>
  );
}
