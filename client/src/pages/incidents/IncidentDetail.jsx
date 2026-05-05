import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { getIncident, assignIncident, escalateIncident, closeIncident } from '../../api/incidents';
import Icon from '../../components/shared/Icon';
import { TypePill, SevBadge, TrackBadge, typeOf } from '../../components/shared/Badges';
import RecordabilityVerifyCard from '../../components/incidents/RecordabilityVerifyCard';
import { useAuth } from '../../context/AuthContext';
import { timeAgo, formatDate } from '../../utils/time';
import AssignModal from './modals/AssignModal';
import EscalateModal from './modals/EscalateModal';
import CloseModal from './modals/CloseModal';
import '../../styles/incidents.css';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const tlDotClass = (action) => {
  if (action === 'created') return 'tl-created';
  if (action === 'escalated') return 'tl-escalated';
  if (action === 'closed') return 'tl-closed';
  if (action === 'assigned') return 'tl-assigned';
  return 'tl-created';
};

const tlIcon = (action) => {
  if (action === 'created') return 'edit';
  if (action === 'escalated') return 'investigation';
  if (action === 'closed') return 'check';
  return 'capa';
};

const fileTypeInfo = (a) => {
  const name = a.filename || '';
  const mime = a.mime_type || '';
  if (mime.startsWith('image/')) return { type: 'image', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', label: 'Image' };
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return { type: 'pdf', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', label: 'PDF' };
  if (mime.includes('word') || /\.docx?$/.test(name)) return { type: 'doc', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Document' };
  if (mime.includes('sheet') || mime.includes('excel') || /\.xlsx?$/.test(name)) return { type: 'sheet', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', label: 'Spreadsheet' };
  return { type: 'text', color: '#6b7280', bg: 'rgba(107,114,128,0.08)', label: 'File' };
};

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canVerify = ELEVATED_ROLES.has(user?.role);
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [lightbox, setLightbox] = useState({ open: false, index: 0 });

  const load = () => {
    setLoading(true);
    getIncident(id).then(setIncident).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const imageAttachments = (incident?.attachments || []).filter(a => a.mime_type && a.mime_type.startsWith('image/'));
  const fileAttachments = (incident?.attachments || []).filter(a => !a.mime_type || !a.mime_type.startsWith('image/'));

  useEffect(() => {
    if (!lightbox.open) return;
    const handler = (e) => {
      if (e.key === 'Escape') setLightbox({ open: false, index: 0 });
      if (e.key === 'ArrowRight') setLightbox(prev => ({ ...prev, index: Math.min(prev.index + 1, imageAttachments.length - 1) }));
      if (e.key === 'ArrowLeft') setLightbox(prev => ({ ...prev, index: Math.max(prev.index - 1, 0) }));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox.open, imageAttachments.length]);

  if (loading) return (
    <div className="page idet" style={{ padding: 60, textAlign: 'center' }}>
      <div className="inc-skeleton">
        <div className="inc-skeleton-card" style={{ height: 60 }}/>
        <div className="inc-skeleton-card" style={{ height: 200 }}/>
        <div className="inc-skeleton-card" style={{ height: 140 }}/>
      </div>
    </div>
  );
  if (!incident) return (
    <div className="page idet">
      <div className="inc-empty">
        <div className="inc-empty-icon"><Icon name="incidents" size={26}/></div>
        <h3>Incident not found</h3>
        <p>It may have been removed or the ID is incorrect.</p>
      </div>
    </div>
  );

  const r = incident;
  const t = typeOf(r.type);

  const recommendedAction =
    r.status === 'Closed' ? 'closed' :
    r.status === 'Investigating' ? 'investigating' :
    r.severity <= 2 ? 'escalate' : r.severity === 3 ? 'assign' : 'close';

  const showToast = (msg) => {
    setModal(null);
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleAssign = async (form) => {
    try {
      const updated = await assignIncident(r.id, form);
      setIncident({ ...incident, ...updated, witnesses: incident.witnesses, attachments: incident.attachments, activity: incident.activity });
      showToast('Incident assigned for triage.');
      load();
    } catch { showToast('Failed to assign.'); }
  };

  const handleEscalate = async (form) => {
    try {
      await escalateIncident(r.id, form);
      showToast('Escalated to investigation.');
      load();
    } catch { showToast('Failed to escalate.'); }
  };

  const handleClose = async (form) => {
    try {
      const updated = await closeIncident(r.id, form);
      setIncident({ ...incident, ...updated, witnesses: incident.witnesses, attachments: incident.attachments, activity: incident.activity });
      showToast('Incident closed.');
      load();
    } catch { showToast('Failed to close.'); }
  };

  const daysOpen = r.created_at ? Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000) : 0;

  const alertType = recommendedAction === 'closed' ? 'alert-closed' : recommendedAction === 'investigating' ? 'alert-investigating' : 'alert-triage';

  return (
    <div className="page idet">
      {/* Back link */}
      <button className="idet-back" onClick={() => navigate('/incidents')}>
        <Icon name="arrowL" size={14}/> Back to incidents
      </button>

      {/* Header */}
      <div className="idet-header">
        <div className="idet-header-left">
          <div className="idet-meta-row">
            <span className="idet-number">{r.incident_number}</span>
            <span style={{ color: 'var(--sds-border)' }}>·</span>
            <span className="idet-date">Reported {formatDate(r.created_at)}</span>
          </div>
          <h1 className="idet-title">{r.title}</h1>
          <div className="idet-badges">
            <TypePill tid={r.type}/>
            <SevBadge s={r.severity}/>
            <TrackBadge t={r.track}/>
            <span className={`inc-card-status ${r.status === 'Closed' ? 'st-closed' : r.status === 'Investigating' ? 'st-investigating' : 'st-new'}`}>
              <span className="st-dot"/>{r.status}
            </span>
            {r.osha_recordable === 1 && <span className="inc-card-status st-triage"><span className="st-dot"/>OSHA</span>}
            {r.riddor_reportable === 1 && <span className="inc-card-status" style={{ background: '#fef2f2', color: '#dc2626' }}><span className="st-dot" style={{ background: '#dc2626' }}/>RIDDOR</span>}
          </div>
        </div>

        <div className="idet-header-actions">
          {recommendedAction === 'closed' ? (
            <button className="idet-act-btn" disabled>Closed</button>
          ) : recommendedAction === 'investigating' ? (
            <button className="idet-act-btn primary" onClick={() => navigate('/investigations')}>
              <Icon name="investigation" size={15}/>Open investigation
            </button>
          ) : (
            <>
              <button className="idet-act-btn" onClick={() => setModal('close')}>Close — no action</button>
              <button className={`idet-act-btn ${recommendedAction === 'assign' ? 'primary' : ''}`} onClick={() => setModal('assign')}>
                <Icon name="person" size={15}/>Assign
              </button>
              <button className={`idet-act-btn ${recommendedAction === 'escalate' ? 'primary' : ''}`} onClick={() => setModal('escalate')}>
                <Icon name="investigation" size={15}/>Escalate
              </button>
            </>
          )}
        </div>
      </div>

      {/* Triage alert */}
      <div className={`idet-alert ${alertType}`}>
        <div className="idet-alert-icon">
          <Icon name={recommendedAction === 'closed' ? 'check' : recommendedAction === 'investigating' ? 'investigation' : 'info'} size={18}/>
        </div>
        <div className="idet-alert-body">
          {recommendedAction === 'closed' && (
            <>
              <div className="idet-alert-title">Closed — no further action</div>
              <div className="idet-alert-desc">{r.closed_reason ? `Reason: ${r.closed_reason}.` : ''} {r.closed_notes || 'Logged for the record only.'}</div>
            </>
          )}
          {recommendedAction === 'investigating' && (
            <>
              <div className="idet-alert-title">Escalated to investigation · Track {r.track}</div>
              <div className="idet-alert-desc">{r.assignee_name ? `Lead investigator ${r.assignee_name} is handling the formal investigation.` : 'Investigation in progress.'}</div>
            </>
          )}
          {recommendedAction !== 'closed' && recommendedAction !== 'investigating' && (
            <>
              <div className="idet-alert-title">Triage required · auto-routed to Track {r.track}</div>
              <div className="idet-alert-desc">
                {recommendedAction === 'escalate' && `Sev ${r.severity} usually requires a full investigation. Recommended: Escalate.`}
                {recommendedAction === 'assign' && `Sev ${r.severity} sits between investigation and log-only. Assign an owner to gather more info.`}
                {recommendedAction === 'close' && `Sev ${r.severity} typically does not need an investigation. Recommended: Close — no action.`}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="idet-grid">
        {/* Main column */}
        <div className="idet-main">
          {/* Description */}
          <div className="idet-card">
            <div className="idet-card-h">
              <div className="hicon hi-desc"><Icon name="incidents" size={16}/></div>
              What happened
            </div>
            <div className="idet-card-body">
              <p className="idet-desc-text">{r.description || r.title}</p>
              <div className="idet-desc-sub">
                Reported by <b>{r.reporter_name}</b> at <b>{r.site_name}{r.area ? ` · ${r.area}` : ''}</b> on {formatDate(r.incident_datetime)}.
                Type: <b>{t?.name}</b>. Auto-classified Sev {r.severity}, Track {r.track}.
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div className="idet-card">
            <div className="idet-card-h">
              <div className="hicon hi-attach"><Icon name="file" size={16}/></div>
              Attachments
              {(r.attachments || []).length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sds-fg-tertiary)', fontWeight: 500 }}>{r.attachments.length} file{r.attachments.length > 1 ? 's' : ''}</span>}
            </div>
            <div className="idet-card-body">
              {(r.attachments || []).length > 0 ? (
                <>
                  {imageAttachments.length > 0 && (
                    <div className="idet-attach-images">
                      {imageAttachments.map((a, idx) => (
                        <div
                          key={a.id}
                          className="idet-attach-thumb"
                          onClick={() => setLightbox({ open: true, index: idx })}
                          onLoad={e => e.currentTarget.classList.add('loaded')}
                        >
                          <img
                            src={`/uploads/${a.stored_filename}`}
                            alt={a.filename}
                            onLoad={e => e.currentTarget.closest('.idet-attach-thumb').classList.add('loaded')}
                          />
                          <div className="idet-attach-thumb-overlay">
                            <div className="zoom-icon"><Icon name="eye" size={16}/></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {fileAttachments.length > 0 && (
                    <div className="idet-attach-files">
                      {fileAttachments.map(a => {
                        const ft = fileTypeInfo(a);
                        return (
                          <a key={a.id} className="idet-attach-file" href={`/api/attachments/${a.id}/download`} target="_blank" rel="noopener noreferrer">
                            <div className="idet-attach-file-icon" style={{ background: ft.bg, color: ft.color }}>
                              <Icon name="file" size={16}/>
                            </div>
                            <div className="idet-attach-file-info">
                              <div className="idet-attach-file-name">{a.filename}</div>
                              <div className="idet-attach-file-meta">
                                <span className="idet-attach-file-size">{((a.size_bytes || 0) / 1024).toFixed(0)} KB</span>
                                <span className="idet-attach-file-type" style={{ background: ft.bg, color: ft.color }}>{ft.label}</span>
                              </div>
                            </div>
                            <div className="idet-attach-dl"><Icon name="arrow" size={14}/></div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No attachments uploaded</p>
              )}
            </div>
          </div>

          {/* Activity timeline */}
          <div className="idet-card">
            <div className="idet-card-h">
              <div className="hicon hi-activity"><Icon name="capa" size={16}/></div>
              Activity timeline
            </div>
            <div className="idet-card-body">
              <div className="idet-timeline">
                {(r.activity || []).map((e, i) => (
                  <div className="idet-tl-item" key={i}>
                    <div className={`idet-tl-dot ${tlDotClass(e.action)}`}>
                      <Icon name={tlIcon(e.action)} size={14}/>
                    </div>
                    <div className="idet-tl-body">
                      <div className="tl-who">{e.user_name || 'System'}</div>
                      <div className="tl-what">{e.description}</div>
                      <div className="tl-when">{timeAgo(e.created_at)}</div>
                    </div>
                  </div>
                ))}
                {(r.activity || []).length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No activity yet</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="idet-side">
          {/* Reporter */}
          <div className="idet-card">
            <div className="idet-card-h">
              <div className="hicon hi-person"><Icon name="person" size={16}/></div>
              Reporter
            </div>
            <div className="idet-card-body">
              <div className="idet-person">
                <div className="idet-person-av">{r.reporter_initials || '??'}</div>
                <div>
                  <div className="idet-person-name">{r.reporter_name}</div>
                  <div className="idet-person-sub">Reported {timeAgo(r.created_at)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Triage state */}
          <div className="idet-card">
            <div className="idet-card-h">
              <div className="hicon hi-triage"><Icon name="incidents" size={16}/></div>
              Triage state
            </div>
            <div className="idet-card-body">
              <div className="idet-triage-rows">
                <div className="idet-triage-row">
                  <span className="idet-triage-label">Status</span>
                  <span className={`inc-card-status ${r.status === 'Closed' ? 'st-closed' : r.status === 'Investigating' ? 'st-investigating' : 'st-new'}`}>
                    <span className="st-dot"/>{r.status}
                  </span>
                </div>
                <div className="idet-triage-row">
                  <span className="idet-triage-label">Severity</span>
                  <SevBadge s={r.severity}/>
                </div>
                <div className="idet-triage-row">
                  <span className="idet-triage-label">Track</span>
                  <TrackBadge t={r.track}/>
                </div>
                <div className="idet-triage-row">
                  <span className="idet-triage-label">Owner</span>
                  {r.assignee_initials ? (
                    <div className="idet-person" style={{ gap: 8 }}>
                      <div className="inc-card-avatar">{r.assignee_initials}</div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sds-fg-heading)' }}>{r.assignee_name}</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--sds-fg-tertiary)' }}>Unassigned</span>
                  )}
                </div>
                <div className="idet-triage-row">
                  <span className="idet-triage-label">OSHA recordable</span>
                  <span className={`inc-card-status ${r.osha_recordable ? 'st-capa' : 'st-closed'}`}>
                    <span className="st-dot"/>{r.osha_recordable ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick facts */}
          <div className="idet-card">
            <div className="idet-card-h">
              <div className="hicon hi-facts"><Icon name="info" size={16}/></div>
              Quick facts
            </div>
            <div className="idet-card-body">
              <div className="idet-facts">
                <div className="idet-fact">
                  <span className="idet-fact-label">Created</span>
                  <span className="idet-fact-val">{formatDate(r.created_at)}</span>
                </div>
                <div className="idet-fact">
                  <span className="idet-fact-label">Incident date</span>
                  <span className="idet-fact-val">{formatDate(r.incident_datetime)}</span>
                </div>
                <div className="idet-fact">
                  <span className="idet-fact-label">Days open</span>
                  <span className="idet-fact-val">{r.status === 'Closed' ? '—' : `${daysOpen}d`}</span>
                </div>
                <div className="idet-fact">
                  <span className="idet-fact-label">Site</span>
                  <span className="idet-fact-val">{r.site_name}</span>
                </div>
                {r.area && (
                  <div className="idet-fact">
                    <span className="idet-fact-label">Area</span>
                    <span className="idet-fact-val">{r.area}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {canVerify && (r.type === 'injury' || r.type === 'illness') && (
            <RecordabilityVerifyCard incident={r} onVerified={load}/>
          )}
        </div>
      </div>

      {/* Lightbox — portal to escape .page transform */}
      {lightbox.open && imageAttachments.length > 0 && createPortal(
        <div className="idet-lightbox" onClick={() => setLightbox({ open: false, index: 0 })}>
          <button className="idet-lb-close" onClick={() => setLightbox({ open: false, index: 0 })}>
            <Icon name="close" size={18}/>
          </button>
          {imageAttachments.length > 1 && (
            <>
              <button
                className="idet-lb-nav idet-lb-prev"
                disabled={lightbox.index === 0}
                onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: prev.index - 1 })); }}
              >
                <Icon name="arrowL" size={18}/>
              </button>
              <button
                className="idet-lb-nav idet-lb-next"
                disabled={lightbox.index === imageAttachments.length - 1}
                onClick={e => { e.stopPropagation(); setLightbox(prev => ({ ...prev, index: prev.index + 1 })); }}
              >
                <Icon name="arrow" size={18}/>
              </button>
            </>
          )}
          <img
            key={lightbox.index}
            className="idet-lb-image"
            src={`/uploads/${imageAttachments[lightbox.index].stored_filename}`}
            alt={imageAttachments[lightbox.index].filename}
            onClick={e => e.stopPropagation()}
          />
          <div className="idet-lb-info" onClick={e => e.stopPropagation()}>
            <span className="idet-lb-name">{imageAttachments[lightbox.index].filename}</span>
            <span className="idet-lb-size">{((imageAttachments[lightbox.index].size_bytes || 0) / 1024).toFixed(0)} KB</span>
            {imageAttachments.length > 1 && (
              <span className="idet-lb-counter">{lightbox.index + 1} of {imageAttachments.length}</span>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modals — portal to escape .page transform */}
      {modal === 'assign' && createPortal(<AssignModal incident={r} onCancel={() => setModal(null)} onConfirm={handleAssign}/>, document.body)}
      {modal === 'escalate' && createPortal(<EscalateModal incident={r} onCancel={() => setModal(null)} onConfirm={handleEscalate}/>, document.body)}
      {modal === 'close' && createPortal(<CloseModal incident={r} onCancel={() => setModal(null)} onConfirm={handleClose}/>, document.body)}

      {/* Toast */}
      {toast && createPortal(
        <div className="idet-toast">
          <span className="toast-icon"><Icon name="check" size={13}/></span>
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
}
