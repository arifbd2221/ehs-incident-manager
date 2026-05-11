import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { getCapa, updateCapa, completeCapa, verifyCapa, rejectCapa } from '../../api/capas';
import Icon from '../../components/shared/Icon';
import { timeAgo, formatDateShort } from '../../utils/time';
import ReferencedByCard from '../../components/shared/ReferencedByCard';
import UpdateProgressModal from './UpdateProgressModal';
import '../../styles/capas.css';

const LANE_LABELS = { pending: 'Pending', progress: 'In progress', verify: 'Pending verification', closed: 'Verified · Closed' };

const tlDotClass = (action) => {
  if (action === 'created') return 'td-created';
  if (action === 'verified') return 'td-verified';
  if (action === 'completed') return 'td-completed';
  return 'td-edit';
};
const tlIcon = (action) => {
  if (action === 'created') return 'capa';
  if (action === 'verified' || action === 'completed') return 'check';
  return 'edit';
};

export default function CAPADetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [capa, setCapa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  const load = () => {
    setLoading(true);
    getCapa(id).then(setCapa).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  if (loading) return (
    <div className="page capd">
      <div className="capa-skeleton" style={{ gridTemplateColumns: '1fr' }}>
        <div className="capa-skeleton-col">
          <div className="capa-skeleton-card" style={{ height: 60 }}/>
          <div className="capa-skeleton-card" style={{ height: 200 }}/>
          <div className="capa-skeleton-card" style={{ height: 140 }}/>
        </div>
      </div>
    </div>
  );
  if (!capa) return (
    <div className="page capd">
      <div className="capa-empty">
        <div className="capa-empty-icon"><Icon name="capa" size={26}/></div>
        <h3>CAPA not found</h3>
        <p>It may have been removed or the ID is incorrect.</p>
      </div>
    </div>
  );

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const c = capa;

  const handleComplete = async () => {
    try { await completeCapa(c.id, {}); showToast('Submitted for verification.'); load(); } catch(e) { showToast(e.response?.data?.error || 'Failed.'); }
  };
  const handleVerify = async () => {
    try { await verifyCapa(c.id, { result: 'effective' }); showToast('CAPA verified and closed.'); load(); } catch(e) { showToast(e.response?.data?.error || 'Failed. Owner cannot self-verify.'); }
  };
  const handleReject = async () => {
    try { await rejectCapa(c.id, { notes: 'Needs more work' }); showToast('Rejected — sent back.'); load(); } catch(e) { showToast(e.response?.data?.error || 'Failed.'); }
  };
  const handleStart = async () => {
    try { await updateCapa(c.id, { status: 'progress' }); showToast('Started.'); load(); } catch {}
  };

  const progressPct = c.progress || 0;
  const progressFillClass = c.overdue ? 'pf-overdue' : progressPct >= 100 ? 'pf-done' : '';

  return (
    <div className="page capd">
      {/* Back */}
      <button className="capd-back" onClick={() => navigate('/capas')}>
        <Icon name="arrowL" size={14}/> Back to CAPAs
      </button>

      {/* Hero header card */}
      <div className="capd-hero">
        <div className="capd-hero-top">
          <div className="capd-hero-left">
            <div className="capd-meta-row">
              <span className="capd-number">{c.capa_number}</span>
              <span style={{ color: 'var(--sds-border)' }}>·</span>
              {c.maintenance_schedule_id ? (
                <span className="capd-number">
                  Maintenance{' '}
                  <a
                    className="capd-source-link"
                    onClick={() => c.maintenance_asset_id && navigate(`/assets/${c.maintenance_asset_id}`)}
                    title={c.maintenance_schedule_title || ''}
                  >
                    {c.maintenance_asset_display_id || c.maintenance_asset_name || `schedule #${c.maintenance_schedule_id}`}
                  </a>
                </span>
              ) : c.source_type === 'proactive' ? (
                <span className="capd-number">Proactive</span>
              ) : c.source_type === 'incident' && c.incident_id ? (
                <span className="capd-number">
                  From{' '}
                  <a className="capd-source-link" onClick={() => navigate(`/incidents/${c.incident_id}`)}>
                    {c.incident_number}
                  </a>
                </span>
              ) : c.investigation_id ? (
                <span className="capd-number">
                  From{' '}
                  <a className="capd-source-link" onClick={() => navigate(`/investigations/${c.investigation_id}`)}>
                    {c.investigation_number}
                  </a>
                </span>
              ) : null}
            </div>
            <h1 className="capd-title">{c.title}</h1>
            <div className="capd-badges">
              <span className={`capa-kcard-type kt-${c.type}`}>
                <span className="kt-dot"/>{c.type === 'corrective' ? 'Corrective' : 'Preventive'}
              </span>
              <span className={`capa-kcard-lane kl-${c.status}`}>
                <span className="kl-dot"/>{LANE_LABELS[c.status] || c.status}
              </span>
              {c.overdue && <span className="capa-kcard-flag kf-overdue"><span className="kf-dot"/>Overdue</span>}
            </div>
          </div>
          <div className="capd-hero-actions">
            {c.status === 'closed' && <button className="idet-act-btn" disabled>Closed</button>}
            {c.status === 'verify' && (
              <>
                <button className="idet-act-btn" onClick={handleReject}>Reject — needs work</button>
                <button className="idet-act-btn primary" onClick={handleVerify}><Icon name="check" size={14}/>Verify & close</button>
              </>
            )}
            {c.status === 'progress' && (
              <>
                <button className="idet-act-btn" onClick={() => setShowProgressModal(true)}>
                  <Icon name="edit" size={14}/>Update progress
                </button>
                <button className="idet-act-btn primary" onClick={handleComplete}><Icon name="check" size={14}/>Mark complete</button>
              </>
            )}
            {c.status === 'pending' && <button className="idet-act-btn primary" onClick={handleStart}>Start working</button>}
          </div>
        </div>

        {/* Inline progress bar */}
        <div className="capd-hero-progress">
          <div className="capd-hero-progress-info">
            <span className="capd-hero-pct">{progressPct}%</span>
            <span className={`capd-hero-due ${c.overdue ? 'overdue' : ''}`}>
              {c.status === 'closed' ? `Closed ${formatDateShort(c.closed_at)}` : `Due ${formatDateShort(c.due_date)}`}
            </span>
          </div>
          <div className="capd-hero-bar">
            <div className={`capd-hero-bar-fill ${progressFillClass}`} style={{ width: `${progressPct}%` }}/>
          </div>
        </div>

        {/* People strip */}
        <div className="capd-hero-people">
          <div className="capd-hero-person">
            <div className="capd-person-av av-owner">{c.owner_initials}</div>
            <div>
              <div className="capd-hero-person-label">Owner</div>
              <div className="capd-hero-person-name">{c.owner_name}</div>
            </div>
          </div>
          <div className="capd-hero-divider"/>
          <div className="capd-hero-person">
            <div className="capd-person-av av-verifier">{c.verifier_initials}</div>
            <div>
              <div className="capd-hero-person-label">Verifier</div>
              <div className="capd-hero-person-name">{c.verifier_name}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Verification banner */}
      {c.status === 'verify' && (
        <div className="capd-verify-banner">
          <div className="capd-verify-icon"><Icon name="warning" size={18}/></div>
          <div className="capd-verify-body">
            <div className="capd-verify-title">Awaiting independent verification</div>
            <div className="capd-verify-desc">
              Owner <b>{c.owner_name}</b> has marked this CAPA complete. Verifier <b>{c.verifier_name}</b> must confirm effectiveness. The owner cannot self-verify.
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="capd-grid">
        <div className="capd-main">
          {/* Description */}
          <div className="capd-card">
            <div className="capd-card-h">
              <div className="hicon hi-desc"><Icon name="capa" size={16}/></div>
              Action description
            </div>
            <div className="capd-card-body">
              <p className="capd-desc-text">{c.description || c.title}</p>
            </div>
          </div>

          {/* Evidence */}
          <div className="capd-card">
            <div className="capd-card-h">
              <div className="hicon hi-evidence"><Icon name="file" size={16}/></div>
              Verification evidence
            </div>
            <div className="capd-card-body">
              {(c.attachments || []).length > 0 ? (
                <div className="capd-evidence-grid">
                  {c.attachments.map(a => (
                    <div key={a.id} className="capd-evidence-item">
                      <div className="capd-evidence-icon"><Icon name="file" size={16}/></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="capd-evidence-name">{a.original_name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="capd-empty-evidence">
                  <Icon name="upload" size={20}/>
                  <span>No evidence uploaded yet</span>
                </div>
              )}
            </div>
          </div>

          {/* Activity — full width in main */}
          <div className="capd-card">
            <div className="capd-card-h">
              <div className="hicon hi-activity"><Icon name="capa" size={16}/></div>
              Activity timeline
            </div>
            <div className="capd-card-body">
              <div className="capd-timeline">
                {(c.activity || []).map((e, i) => (
                  <div className="capd-tl-item" key={i}>
                    <div className={`capd-tl-dot ${tlDotClass(e.action)}`}>
                      <Icon name={tlIcon(e.action)} size={13}/>
                    </div>
                    <div className="capd-tl-body">
                      <div className="tl-who">{e.user_name || 'System'}</div>
                      <div className="tl-what">{e.description}</div>
                      {(() => { try { const m = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata; return m?.note ? <div className="tl-note">{m.note}</div> : null; } catch { return null; } })()}
                      <div className="tl-when">{timeAgo(e.created_at)}</div>
                    </div>
                  </div>
                ))}
                {(c.activity || []).length === 0 && (
                  <div className="capd-empty-evidence">
                    <Icon name="clock" size={20}/>
                    <span>No activity yet</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar — details only */}
        <div className="capd-side">
          <div className="capd-card">
            <div className="capd-card-h">
              <div className="hicon hi-details"><Icon name="info" size={16}/></div>
              Details
            </div>
            <div className="capd-card-body">
              <div className="capd-detail-rows">
                <div className="capd-detail-row">
                  <span className="capd-detail-label">Type</span>
                  <span className={`capa-kcard-type kt-${c.type}`}>
                    <span className="kt-dot"/>{c.type === 'corrective' ? 'Corrective' : 'Preventive'}
                  </span>
                </div>
                <div className="capd-detail-row">
                  <span className="capd-detail-label">Source</span>
                  <span className="capd-detail-val" style={{ fontFamily: "'SF Mono', Menlo, monospace", fontSize: 12 }}>
                    {c.maintenance_schedule_id ? (
                      <a className="capd-source-link" onClick={() => c.maintenance_asset_id && navigate(`/assets/${c.maintenance_asset_id}`)}>
                        Maintenance: {c.maintenance_schedule_title || `schedule #${c.maintenance_schedule_id}`}
                      </a>
                    ) : c.source_type === 'proactive' ? (
                      'Proactive'
                    ) : c.source_type === 'incident' && c.incident_id ? (
                      <a className="capd-source-link" onClick={() => navigate(`/incidents/${c.incident_id}`)}>
                        {c.incident_number}
                      </a>
                    ) : c.investigation_id ? (
                      <a className="capd-source-link" onClick={() => navigate(`/investigations/${c.investigation_id}`)}>
                        {c.investigation_number}
                      </a>
                    ) : '—'}
                  </span>
                </div>
                <div className="capd-detail-row">
                  <span className="capd-detail-label">Priority</span>
                  <span className="capd-detail-val" style={{ textTransform: 'capitalize' }}>{c.priority}</span>
                </div>
                <div className="capd-detail-row">
                  <span className="capd-detail-label">Status</span>
                  <span className={`capa-kcard-lane kl-${c.status}`}>
                    <span className="kl-dot"/>{LANE_LABELS[c.status] || c.status}
                  </span>
                </div>
                <div className="capd-detail-row">
                  <span className="capd-detail-label">Due</span>
                  <span className={`capd-detail-val ${c.overdue ? 'overdue' : ''}`} style={c.overdue ? { color: '#dc2626' } : {}}>{formatDateShort(c.due_date)}</span>
                </div>
                <div className="capd-detail-row">
                  <span className="capd-detail-label">Progress</span>
                  <span className="capd-detail-val">{progressPct}%</span>
                </div>
                <div className="capd-detail-divider"/>
                <ReferencedByCard entityType="capa" entityId={capa.id} compact />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showProgressModal && createPortal(
        <UpdateProgressModal
          capa={c}
          onCancel={() => setShowProgressModal(false)}
          onSaved={() => { setShowProgressModal(false); showToast('Progress updated.'); load(); }}
        />,
        document.body
      )}

      {toast && createPortal(
        <div className="capd-toast" role="status" aria-live="polite">
          <span className="toast-check"><Icon name="check" size={12}/></span>
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
}
