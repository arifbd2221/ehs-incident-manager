import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { getCapa, updateCapa, completeCapa, verifyCapa, rejectCapa } from '../../api/capas';
import Icon from '../../components/shared/Icon';
import { timeAgo, formatDateShort } from '../../utils/time';
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
  const handleProgress = async (val) => {
    try { await updateCapa(c.id, { progress: val }); load(); } catch {}
  };
  const handleStart = async () => {
    try { await updateCapa(c.id, { status: 'progress' }); showToast('Started.'); load(); } catch {}
  };

  const progressFillClass = c.overdue ? 'pf-overdue' : c.progress >= 100 ? 'pf-done' : '';

  const milestones = [
    ['Action drafted & reviewed', true],
    ['Resources allocated', (c.progress || 0) >= 25],
    ['Implementation in progress', (c.progress || 0) >= 50],
    ['Owner marks complete', (c.progress || 0) >= 100],
    ['Independent verification', c.status === 'closed'],
  ];

  return (
    <div className="page capd">
      {/* Back */}
      <button className="capd-back" onClick={() => navigate('/capas')}>
        <Icon name="arrowL" size={14}/> Back to CAPAs
      </button>

      {/* Header */}
      <div className="capd-header">
        <div className="capd-header-left">
          <div className="capd-meta-row">
            <span className="capd-number">{c.capa_number}</span>
            <span style={{ color: 'var(--sds-border)' }}>·</span>
            {c.source_type === 'proactive' ? (
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
            <span className="capd-owner-info">
              Owner <b>{c.owner_name}</b> · Due <b>{formatDateShort(c.due_date)}</b>
            </span>
          </div>
        </div>
        <div className="capd-header-actions">
          {c.status === 'closed' && <button className="idet-act-btn" disabled>Closed</button>}
          {c.status === 'verify' && (
            <>
              <button className="idet-act-btn" onClick={handleReject}>Reject — needs work</button>
              <button className="idet-act-btn primary" onClick={handleVerify}><Icon name="check" size={14}/>Verify & close</button>
            </>
          )}
          {c.status === 'progress' && (
            <>
              <button className="idet-act-btn" onClick={() => handleProgress(Math.min(100, (c.progress || 0) + 25))}>
                <Icon name="edit" size={14}/>Update progress
              </button>
              <button className="idet-act-btn primary" onClick={handleComplete}><Icon name="check" size={14}/>Mark complete</button>
            </>
          )}
          {c.status === 'pending' && <button className="idet-act-btn primary" onClick={handleStart}>Start working</button>}
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
        {/* Main */}
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

          {/* Progress */}
          <div className="capd-card">
            <div className="capd-card-h">
              <div className="hicon hi-progress"><Icon name="check" size={16}/></div>
              Progress
            </div>
            <div className="capd-card-body">
              <div className="capd-progress-header">
                <span className="capd-progress-pct">{c.progress || 0}% complete</span>
                <span className={`capd-progress-due ${c.overdue ? 'overdue' : ''}`}>
                  {c.status === 'closed' ? `Closed ${formatDateShort(c.closed_at)}` : `Due ${formatDateShort(c.due_date)}`}
                </span>
              </div>
              <div className="capd-progress-track">
                <div className={`capd-progress-fill ${progressFillClass}`} style={{ width: `${c.progress || 0}%` }}/>
              </div>
              <div className="capd-checklist">
                {milestones.map(([label, done], i) => (
                  <div key={i} className="capd-check-item">
                    <div className={`capd-check-dot ${done ? 'done' : 'pending'}`}>
                      {done && <Icon name="check" size={12}/>}
                    </div>
                    <span className={`capd-check-label ${done ? 'done' : ''}`}>{label}</span>
                  </div>
                ))}
              </div>
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
                <p style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No evidence uploaded yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="capd-side">
          {/* People */}
          <div className="capd-card">
            <div className="capd-card-h">
              <div className="hicon hi-people"><Icon name="person" size={16}/></div>
              People
            </div>
            <div className="capd-card-body">
              <div className="capd-people-list">
                <div className="capd-person">
                  <div className="capd-person-av av-owner">{c.owner_initials}</div>
                  <div>
                    <div className="capd-person-name">Owner · {c.owner_name}</div>
                    <div className="capd-person-role">Responsible for executing the action</div>
                  </div>
                </div>
                <div className="capd-person">
                  <div className="capd-person-av av-verifier">{c.verifier_initials}</div>
                  <div>
                    <div className="capd-person-name">Verifier · {c.verifier_name}</div>
                    <div className="capd-person-role">Confirms effectiveness — cannot be the owner</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
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
                  <span className="capd-detail-val" style={{ fontFamily: 'SF Mono, Menlo, monospace', fontSize: 12 }}>
                    {c.source_type === 'proactive' ? (
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
                  <span className="capd-detail-val">{c.progress || 0}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Activity */}
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
                      <div className="tl-when">{timeAgo(e.created_at)}</div>
                    </div>
                  </div>
                ))}
                {(c.activity || []).length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No activity yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
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
