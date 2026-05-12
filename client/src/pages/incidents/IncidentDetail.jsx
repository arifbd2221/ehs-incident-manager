import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { getIncident, assignIncident, escalateIncident, closeIncident, updateIncident, uploadAttachments, deleteAttachment, addIncidentNote, addWitness, updateWitness, deleteWitness, requestClosure, approveClosure, rejectClosure, reopenIncident, forceCloseIncident, getAffectedPersons, deleteAffectedPerson } from '../../api/incidents';
import Icon from '../../components/shared/Icon';
import { TypePill, SevBadge, TrackBadge, typeOf } from '../../components/shared/Badges';
import RecordabilityVerifyCard from '../../components/incidents/RecordabilityVerifyCard';
import DeadlineBadge from '../../components/incidents/DeadlineBadge';
import { useAuth } from '../../context/AuthContext';
import { timeAgo, formatDate } from '../../utils/time';
import { frameworkVisibility } from '../../utils/frameworks';
import { riddorCategoryLabel, riddorCategoryReg } from '../../utils/riddor';
import AssignModal from './modals/AssignModal';
import EscalateModal from './modals/EscalateModal';
import CloseModal from './modals/CloseModal';
import ClosureChecklistModal from './modals/ClosureChecklistModal';
import ClosureApprovalModal from './modals/ClosureApprovalModal';
import ReopenModal from './modals/ReopenModal';
import SeverityOverrideModal from './modals/SeverityOverrideModal';
import WitnessModal from './modals/WitnessModal';
import AffectedPersonModal from './modals/AffectedPersonModal';
import ReferencedByCard from '../../components/shared/ReferencedByCard';
import '../../styles/incidents.css';

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const tlDotClass = (action) => {
  if (action === 'created') return 'tl-created';
  if (action === 'escalated') return 'tl-escalated';
  if (action === 'closed') return 'tl-closed';
  if (action === 'assigned') return 'tl-assigned';
  if (action === 'note') return 'tl-note';
  if (action === 'incident_updated' || action === 'severity_overridden') return 'tl-note';
  if (action === 'witness_added') return 'tl-assigned';
  if (action === 'witness_updated') return 'tl-note';
  if (action === 'witness_removed') return 'tl-attach';
  if (action === 'recordability_verified') return 'tl-verified';
  if (action === 'attached' || action === 'attachment_deleted') return 'tl-attach';
  if (action === 'stop_work_submitted' || action === 'stop_work_acknowledged' || action === 'stop_work_resolved' || action === 'stop_work_cancelled') return 'tl-stopwork';
  if (action === 'closure_requested') return 'tl-assigned';
  if (action === 'closure_approved') return 'tl-closed';
  if (action === 'closure_rejected') return 'tl-note';
  if (action === 'force_closed') return 'tl-stopwork';
  if (action === 'incident_reopened') return 'tl-escalated';
  return 'tl-created';
};

const tlIcon = (action) => {
  if (action === 'created') return 'edit';
  if (action === 'escalated') return 'investigation';
  if (action === 'closed') return 'check';
  if (action === 'note') return 'edit';
  if (action === 'incident_updated') return 'edit';
  if (action === 'severity_overridden') return 'warning';
  if (action === 'witness_added') return 'person';
  if (action === 'witness_updated') return 'edit';
  if (action === 'witness_removed') return 'close';
  if (action === 'recordability_verified') return 'shield';
  if (action === 'attached') return 'file';
  if (action === 'attachment_deleted') return 'close';
  if (action === 'stop_work_submitted' || action === 'stop_work_acknowledged' || action === 'stop_work_resolved' || action === 'stop_work_cancelled') return 'warning';
  if (action === 'closure_requested') return 'clock';
  if (action === 'closure_approved') return 'check';
  if (action === 'closure_rejected') return 'close';
  if (action === 'force_closed') return 'warning';
  if (action === 'incident_reopened') return 'edit';
  return 'capa';
};

// Inline-edit (UX-C): a fact-row that flips to a vertical edit form on click.
// Used for area + department in the Quick Facts card.
function FactEdit({ label, value, onSave, allowed, placeholder = '—' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);

  const start = () => { setDraft(value || ''); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = async () => {
    setSaving(true);
    try { await onSave(draft.trim()); setEditing(false); }
    finally { setSaving(false); }
  };

  if (editing) return (
    <div className="idet-fact is-editing">
      <span className="idet-fact-label">{label}</span>
      <input className="input" value={draft} autoFocus onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') cancel(); }}/>
      <div className="idet-edit-row">
        <button className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || draft.trim() === (value || '')}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );

  return (
    <div className="idet-fact">
      <span className="idet-fact-label">{label}</span>
      <span className="idet-fact-val">
        {value || <span className="idet-edit-empty">{placeholder}</span>}
        {allowed && (
          <button className="idet-edit-trigger" onClick={start} title={`Edit ${label.toLowerCase()}`}>
            <Icon name="edit" size={11}/>edit
          </button>
        )}
      </span>
    </div>
  );
}

// Inline-edit (UX-C): description in the "What happened" card.
// `value` is the raw description (may be empty); `fallback` is the title shown
// when description is empty so the card never reads as blank. Editor seeds the
// draft from `value` only, so adding a description starts from an empty
// textarea instead of the title.
function DescEdit({ value, fallback, onSave, allowed }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);

  const start = () => { setDraft(value || ''); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = async () => {
    setSaving(true);
    try { await onSave(draft.trim()); setEditing(false); }
    finally { setSaving(false); }
  };

  if (editing) return (
    <>
      <textarea className="textarea" value={draft} autoFocus rows={5} placeholder="Describe what happened…" onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') cancel(); }}/>
      <div className="idet-edit-row">
        <button className="btn btn-secondary btn-sm" onClick={cancel} disabled={saving}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || draft.trim() === (value || '')}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );

  return (
    <p className="idet-desc-text">
      {value || fallback}
      {allowed && (
        <button className="idet-edit-trigger" onClick={start} title="Edit description">
          <Icon name="edit" size={11}/>edit
        </button>
      )}
    </p>
  );
}

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
  const { showOsha, showRiddor } = frameworkVisibility(user);
  const canVerify = ELEVATED_ROLES.has(user?.role);
  const canEdit = ELEVATED_ROLES.has(user?.role);
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [witnessModal, setWitnessModal] = useState(null); // null | 'add' | witness object
  const [toast, setToast] = useState(null);
  const [lightbox, setLightbox] = useState({ open: false, index: 0 });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [noteText, setNoteText] = useState('');
  const [postingNote, setPostingNote] = useState(false);

  const [downloading301, setDownloading301] = useState(false);

  const [affectedPersons, setAffectedPersons] = useState([]);
  const [apModalOpen, setApModalOpen] = useState(false);
  // null = closed; person object = edit mode for that row
  const [apEditTarget, setApEditTarget] = useState(null);
  // Index of expanded person row (for fuller-detail toggle), or -1 = all collapsed
  const [expandedApIdx, setExpandedApIdx] = useState(-1);

  const load = () => {
    setLoading(true);
    getIncident(id).then(setIncident).catch(() => {}).finally(() => setLoading(false));
    // WI-A: pull the new affected_persons + injuries side-table. Runs in
    // parallel; failures are silent so the existing single-person UI keeps
    // working even if the new endpoint is temporarily down.
    getAffectedPersons(id).then(setAffectedPersons).catch(() => setAffectedPersons([]));
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
      setModal(null);
      load();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to close.'); }
  };

  const handleRequestClosure = async (form) => {
    try {
      await requestClosure(r.id, form);
      showToast('Closure request submitted for approval.');
      setModal(null);
      load();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to submit closure request.'); }
  };

  const handleApproveClosure = async (requestId, form) => {
    try {
      await approveClosure(r.id, requestId, form);
      showToast('Closure approved — incident closed.');
      setModal(null);
      load();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to approve closure.'); }
  };

  const handleRejectClosure = async (requestId, form) => {
    try {
      await rejectClosure(r.id, requestId, form);
      showToast('Closure request rejected.');
      setModal(null);
      load();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to reject.'); }
  };

  const handleReopen = async (form) => {
    try {
      await reopenIncident(r.id, form);
      showToast('Incident reopened.');
      setModal(null);
      load();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to reopen.'); }
  };

  const handleForceClose = async (form) => {
    try {
      await forceCloseIncident(r.id, form);
      showToast('Incident force-closed.');
      setModal(null);
      load();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to force-close.'); }
  };

  // WI-03: OSHA 301 PDF download. Per 29 CFR 1904.29(b)(2) Form 301 is
  // generated per-recordable-case, so the button only shows when
  // osha_recordable === 1. Reuses the auth-fetch + blob-<a> pattern
  // from the WI-01 Download-PDF button on ReportsPage.
  const downloadOsha301Pdf = async () => {
    if (!r?.id) return;
    setDownloading301(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/reports/osha-301/${r.id}?format=pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Download failed: ${resp.status}`);
      }
      const blob = await resp.blob();
      let filename = `osha-301-${r.incident_number || r.id}.pdf`;
      const cd = resp.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      if (m) filename = m[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast(e.message || 'Download failed.');
    } finally {
      setDownloading301(false);
    }
  };

  const saveField = async (field, value) => {
    try {
      await updateIncident(r.id, { [field]: value });
      showToast('Updated.');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update.');
      throw err;
    }
  };

  const handleAddWitness = async (form) => {
    try {
      await addWitness(r.id, form);
      setWitnessModal(null);
      showToast(`Witness ${form.name} added.`);
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add witness.');
      throw err;
    }
  };

  const handleUpdateWitness = async (form) => {
    if (!witnessModal || witnessModal === 'add') return;
    try {
      await updateWitness(r.id, witnessModal.id, form);
      setWitnessModal(null);
      showToast('Witness updated.');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update witness.');
      throw err;
    }
  };

  const handleDeleteAffectedPerson = async (ap) => {
    if (!window.confirm(`Remove ${ap.name || 'this person'} from the incident? Audit trail keeps the record.`)) return;
    try {
      await deleteAffectedPerson(r.id, ap.id);
      showToast(ap.name ? `${ap.name} removed.` : 'Person removed.');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove person.');
    }
  };

  const handleDeleteWitness = async (witness) => {
    if (!window.confirm(`Remove witness ${witness.name}? This is logged for audit.`)) return;
    try {
      await deleteWitness(r.id, witness.id);
      showToast('Witness removed.');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove witness.');
    }
  };

  const handleSeverityOverride = async (form) => {
    try {
      await updateIncident(r.id, form);
      showToast(`Severity overridden to ${form.severity === 1 ? 'S1 Critical' : form.severity === 2 ? 'S2 Major' : form.severity === 3 ? 'S3 Moderate' : form.severity === 4 ? 'S4 Minor' : 'S5 Insignificant'}.`);
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to override severity.');
    }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      await uploadAttachments('incident', r.id, files);
      showToast(files.length === 1 ? 'File attached.' : `${files.length} files attached.`);
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to attach files.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachment) => {
    if (!confirm(`Remove "${attachment.filename}"? This is logged in the activity timeline.`)) return;
    try {
      await deleteAttachment(attachment.id);
      showToast('Attachment removed.');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove attachment.');
    }
  };

  const handlePostNote = async () => {
    const text = noteText.trim();
    if (!text || postingNote) return;
    setPostingNote(true);
    try {
      const created = await addIncidentNote(r.id, text);
      // Optimistic prepend so the user sees their note immediately without
      // waiting for the full incident reload.
      setIncident(prev => prev ? { ...prev, activity: [created, ...(prev.activity || [])] } : prev);
      setNoteText('');
      showToast('Note added to timeline.');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add note.');
    } finally {
      setPostingNote(false);
    }
  };

  const canDelete = (attachment) =>
    ELEVATED_ROLES.has(user?.role) || attachment.uploaded_by === user?.id;

  const daysOpen = r.created_at ? Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000) : 0;

  const alertType = recommendedAction === 'closed' ? 'alert-closed' : recommendedAction === 'investigating' ? 'alert-investigating' : 'alert-triage';

  const sevColors = { 1: '#dc2626', 2: '#ea580c', 3: '#f59e0b', 4: '#22c55e', 5: '#8b5cf6' };
  const heroColor = sevColors[r.severity] || '#626DF9';

  return (
    <div className="page idet">
      {/* Breadcrumb */}
      <div className="idet-breadcrumb">
        <button onClick={() => navigate('/incidents')}>
          <Icon name="arrowL" size={13} /> Incidents
        </button>
        <span className="idet-bc-sep">/</span>
        <span className="idet-bc-current">{r.incident_number}</span>
      </div>

      {/* Hero header card */}
      <div className="idet-hero" style={{ '--idet-color': heroColor }}>
        <div className="idet-hero-strip" />
        <div className="idet-hero-body">
          <div className="idet-hero-left">
            <div className="idet-meta-row">
              <span className="idet-number">{r.incident_number}</span>
              <span className="idet-meta-sep">·</span>
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
              {showOsha && r.osha_recordable === 1 && <span className="inc-card-status st-triage"><span className="st-dot"/>OSHA</span>}
              {showRiddor && r.riddor_reportable === 1 && (
                <span
                  className="inc-card-status"
                  style={{ background: '#fef2f2', color: '#dc2626' }}
                  title={r.riddor_category ? `RIDDOR ${riddorCategoryReg(r.riddor_category)} · ${riddorCategoryLabel(r.riddor_category)}` : 'RIDDOR reportable'}
                >
                  <span className="st-dot" style={{ background: '#dc2626' }}/>
                  RIDDOR{r.riddor_category ? ` · ${riddorCategoryLabel(r.riddor_category)}` : ''}
                </span>
              )}
              {/* WI-08: one badge per outstanding regulatory deadline. */}
              {(r.pending_deadlines || []).map((d, i) => (
                <DeadlineBadge key={`${d.kind}-${i}`} deadline={d}/>
              ))}
            </div>
          </div>

          <div className="idet-header-actions">
            {recommendedAction === 'closed' ? (
              <>
                <button className="idet-act-btn" disabled>Closed</button>
                {['ehs_manager', 'admin'].includes(user?.role) && (
                  <button className="idet-act-btn" onClick={() => setModal('reopen')}>
                    <Icon name="edit" size={15}/>Reopen
                  </button>
                )}
              </>
            ) : (
              <>
                {ELEVATED_ROLES.has(user?.role) && (
                  <button className="idet-act-btn" onClick={() => setModal('severity')} title="Override auto-classified severity (logged for audit)">
                    <Icon name="warning" size={15}/>Override severity
                  </button>
                )}
                {recommendedAction === 'investigating' ? (
                  <button className="idet-act-btn primary" onClick={() => navigate('/investigations')}>
                    <Icon name="investigation" size={15}/>Open investigation
                  </button>
                ) : ELEVATED_ROLES.has(user?.role) && (
                  <>
                    <button className="idet-act-btn" onClick={() => setModal('close')}>
                      {r.track === 'C' ? 'Close — no action' : 'Close incident'}
                    </button>
                    <button className={`idet-act-btn ${recommendedAction === 'assign' ? 'primary' : ''}`} onClick={() => setModal('assign')}>
                      <Icon name="person" size={15}/>Assign
                    </button>
                    <button className={`idet-act-btn ${recommendedAction === 'escalate' ? 'primary' : ''}`} onClick={() => setModal('escalate')}>
                      <Icon name="investigation" size={15}/>Escalate
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Reporter strip */}
        <div className="idet-hero-people">
          <div className="idet-hero-person">
            <div className="idet-hero-person-av">{r.reporter_initials || '??'}</div>
            <div>
              <div className="idet-hero-person-label">Reporter</div>
              <div className="idet-hero-person-name">{r.reporter_name}</div>
            </div>
          </div>
          {r.assignee_name && (
            <>
              <div className="idet-hero-divider"/>
              <div className="idet-hero-person">
                <div className="idet-hero-person-av av-owner">{r.assignee_initials}</div>
                <div>
                  <div className="idet-hero-person-label">Owner</div>
                  <div className="idet-hero-person-name">{r.assignee_name}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pending closure request banner */}
      {r.closure_request && ['ehs_manager', 'admin'].includes(user?.role) && r.closure_request.requested_by !== user?.id && (
        <div className="idet-closure-banner">
          <div className="idet-closure-banner-text">
            <Icon name="clock" size={16}/>
            <span>Closure approval requested by <strong>{r.closure_request.requested_by_name}</strong></span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setModal('closure-approval')}>Review request</button>
        </div>
      )}

      {r.reopen_count > 0 && r.status !== 'Closed' && (
        <div className="idet-reopen-badge">
          <Icon name="edit" size={14}/> Reopened {r.reopen_count} time{r.reopen_count > 1 ? 's' : ''} — {r.reopened_reason}
        </div>
      )}

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
              <DescEdit value={r.description} fallback={r.title} onSave={(v) => saveField('description', v)} allowed={canEdit}/>
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
              {(r.attachments || []).length > 0 && <span className="idet-attach-count">{r.attachments.length} file{r.attachments.length > 1 ? 's' : ''}</span>}
              <button
                className="idet-attach-add"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><span className="idet-attach-spinner"/>Uploading…</>
                ) : (
                  <><Icon name="plus" size={12}/>Add files</>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleUpload}
              />
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
                          {canDelete(a) && (
                            <button
                              className="idet-attach-del idet-attach-del-thumb"
                              onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(a); }}
                              title="Remove attachment"
                            >
                              <Icon name="close" size={12}/>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {fileAttachments.length > 0 && (
                    <div className="idet-attach-files">
                      {fileAttachments.map(a => {
                        const ft = fileTypeInfo(a);
                        return (
                          <div key={a.id} className="idet-attach-file-wrap">
                            <a className="idet-attach-file" href={`/api/attachments/${a.id}/download`} target="_blank" rel="noopener noreferrer">
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
                            {canDelete(a) && (
                              <button
                                className="idet-attach-del idet-attach-del-file"
                                onClick={() => handleDeleteAttachment(a)}
                                title="Remove attachment"
                              >
                                <Icon name="close" size={14}/>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="idet-attach-empty">
                  <p>No attachments yet.</p>
                  <button
                    className="idet-attach-add-empty"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading…' : 'Attach a file'}
                  </button>
                </div>
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
              {/* Add-note composer — anyone authenticated can leave an
                  observation. Notes interleave with system events below. */}
              <div className="idet-note-composer">
                <textarea
                  className="idet-note-input"
                  rows={2}
                  placeholder="Add a note to the timeline — context, side conversations, things you noticed…"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePostNote(); }
                  }}
                />
                <div className="idet-note-foot">
                  <span className="idet-note-hint">⌘+Enter to post</span>
                  <button
                    className="idet-note-btn"
                    onClick={handlePostNote}
                    disabled={!noteText.trim() || postingNote}
                  >
                    <Icon name="edit" size={12}/>
                    {postingNote ? 'Posting…' : 'Add note'}
                  </button>
                </div>
              </div>

              <div className="idet-timeline">
                {(r.activity || []).map((e, i) => (
                  <div className={`idet-tl-item ${e.action === 'note' ? 'is-note' : ''}`} key={e.id || i}>
                    <div className={`idet-tl-dot ${tlDotClass(e.action)}`}>
                      <Icon name={tlIcon(e.action)} size={14}/>
                    </div>
                    <div className="idet-tl-body">
                      <div className="tl-who">
                        {e.user_name || 'System'}
                        {e.action === 'note' && <span className="tl-note-tag">NOTE</span>}
                      </div>
                      <div className={`tl-what ${e.action === 'note' ? 'tl-what-note' : ''}`}>{e.description}</div>
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
          {/* Details — merged triage + quick facts */}
          <div className="idet-card">
            <div className="idet-card-h">
              <div className="hicon hi-triage"><Icon name="incidents" size={16}/></div>
              Details
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
                {showOsha && (
                  <div className="idet-triage-row">
                    <span className="idet-triage-label">OSHA recordable</span>
                    <span className={`inc-card-status ${r.osha_recordable ? 'st-capa' : 'st-closed'}`}>
                      <span className="st-dot"/>{r.osha_recordable ? 'Yes' : 'No'}
                    </span>
                  </div>
                )}
                {showOsha && r.osha_recordable === 1 && (
                  <>
                    <div className="idet-triage-row">
                      <span className="idet-triage-label">OSHA Form 301</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={downloadOsha301Pdf}
                        disabled={downloading301}
                        title="Download the OSHA 301 Injury and Illness Incident Report (29 CFR 1904.29(b)(2))"
                      >
                        <Icon name="download" size={13}/>{downloading301 ? 'Generating…' : 'Download PDF'}
                      </button>
                    </div>
                    {r.osha_privacy_case === 1 && (
                      <div className="idet-triage-row">
                        <span className="idet-triage-label">Privacy case</span>
                        <span className="inc-card-status st-triage"><span className="st-dot"/>Yes</span>
                      </div>
                    )}
                    {r.er_treated === 1 && (
                      <div className="idet-triage-row">
                        <span className="idet-triage-label">ER treatment</span>
                        <span className="inc-card-status st-triage"><span className="st-dot"/>Yes</span>
                      </div>
                    )}
                    {r.hospitalized === 1 && (
                      <div className="idet-triage-row">
                        <span className="idet-triage-label">Hospitalized</span>
                        <span className="inc-card-status st-triage"><span className="st-dot"/>Yes</span>
                      </div>
                    )}
                    {r.osha_work_related && (
                      <div className="idet-triage-row">
                        <span className="idet-triage-label">Work-related</span>
                        <span style={{ fontSize: 12, color: 'var(--sds-fg-secondary)' }}>{r.osha_work_related}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="idet-triage-divider"/>
                <div className="idet-triage-row">
                  <span className="idet-triage-label">Incident date</span>
                  <span className="idet-fact-val">{formatDate(r.incident_datetime)}</span>
                </div>
                <div className="idet-triage-row">
                  <span className="idet-triage-label">Days open</span>
                  <span className="idet-fact-val">{r.status === 'Closed' ? '—' : `${daysOpen}d`}</span>
                </div>
                <div className="idet-triage-row">
                  <span className="idet-triage-label">Site</span>
                  <span className="idet-fact-val">{r.site_name}</span>
                </div>
                {(r.area || canEdit) && (
                  <FactEdit label="Area" value={r.area} allowed={canEdit} placeholder="(not set)" onSave={(v) => saveField('area', v)}/>
                )}
                {(r.department || canEdit) && (
                  <FactEdit label="Department" value={r.department} allowed={canEdit} placeholder="(not set)" onSave={(v) => saveField('department', v)}/>
                )}
                <div className="idet-triage-divider"/>
                <ReferencedByCard entityType="incident" entityId={incident.id} compact />
              </div>
            </div>
          </div>

          {/* Affected persons (WI-A) — multi-person view with add-only
              CRUD. Edit + remove on individual rows is a follow-up; the
              route layer already supports it via
              /incidents/:id/affected-persons/... */}
          {(affectedPersons.length > 0 || canEdit) && (
            <div className="idet-card">
              <div className="idet-card-h">
                <div className="hicon hi-person"><Icon name="person" size={16}/></div>
                Affected persons
                {affectedPersons.length > 0 && (
                  <span className="idet-attach-count">{affectedPersons.length}</span>
                )}
                {canEdit && (
                  <button className="idet-attach-add" onClick={() => setApModalOpen(true)}>
                    <Icon name="plus" size={12}/>Add person
                  </button>
                )}
              </div>
              <div className="idet-card-body">
                {affectedPersons.length === 0 ? (
                  <div className="idet-witness-empty">
                    No affected persons recorded yet. Add one when identified.
                  </div>
                ) : (
                  <div className="idet-witnesses">
                    {affectedPersons.map((ap, idx) => {
                      const expanded = expandedApIdx === idx;
                      const hasExtra = ap.dob || ap.gender || ap.address || ap.phone || ap.date_hired || ap.email;
                      return (
                      <div key={ap.id} className="idet-witness">
                        <div className="idet-witness-head">
                          <div className="idet-witness-info">
                            <div className="idet-witness-name">
                              <span className="pill pill-gray">Person {idx + 1}</span>
                              {' '}{ap.name || <em>Unnamed</em>}
                              {ap.is_primary === 1 && <> <span className="pill pill-info">Primary</span></>}
                              {ap.is_privacy_case === 1 && <> <span className="pill pill-warn">Privacy case</span></>}
                            </div>
                            <div className="idet-witness-contact">
                              {[ap.job_title, ap.employment_status?.replace(/_/g, ' ')]
                                .filter(Boolean).join(' · ') || '—'}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="idet-witness-actions">
                              <button className="idet-edit-trigger" onClick={() => setApEditTarget(ap)} title="Edit person">
                                <Icon name="edit" size={11}/>edit
                              </button>
                              <button className="idet-edit-trigger idet-witness-del" onClick={() => handleDeleteAffectedPerson(ap)} title="Remove person">
                                <Icon name="close" size={11}/>remove
                              </button>
                            </div>
                          )}
                        </div>
                        {(ap.injuries || []).length > 0 && (
                          <div className="idet-witness-statement">
                            {ap.injuries.map(inj => (
                              <div key={inj.id}>
                                <strong>
                                  {[inj.body_part, inj.injury_type].filter(Boolean).join(' — ') || 'Injury'}
                                </strong>
                                {inj.mechanism && <> · {inj.mechanism}</>}
                                {(inj.days_away > 0 || inj.days_restricted > 0) && (
                                  <> · {inj.days_away || 0}d away, {inj.days_restricted || 0}d restricted</>
                                )}
                                {inj.hospitalized === 1 && <> · hospitalized</>}
                                {inj.er_treated === 1 && <> · ER treated</>}
                              </div>
                            ))}
                          </div>
                        )}
                        {hasExtra && (
                          <div className="idet-witness-statement">
                            <button
                              className="idet-edit-trigger"
                              onClick={() => setExpandedApIdx(expanded ? -1 : idx)}
                              title={expanded ? 'Hide regulatory fields' : 'Show all regulatory fields'}
                            >
                              <Icon name={expanded ? 'arrow' : 'arrow'} size={11}/>
                              {expanded ? 'Hide details' : 'Show details'}
                            </button>
                            {expanded && (
                              <div>
                                {ap.dob && <div><strong>DOB:</strong> {ap.dob}</div>}
                                {ap.gender && <div><strong>Gender:</strong> {ap.gender.replace(/_/g, ' ')}</div>}
                                {ap.date_hired && <div><strong>Date hired:</strong> {ap.date_hired}</div>}
                                {ap.address && <div><strong>Address:</strong> {ap.address}</div>}
                                {ap.phone && <div><strong>Phone:</strong> {ap.phone}</div>}
                                {ap.email && <div><strong>Email:</strong> {ap.email}</div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );})}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Witnesses */}
          <div className="idet-card">
            <div className="idet-card-h">
              <div className="hicon hi-person"><Icon name="person" size={16}/></div>
              Witnesses
              {(r.witnesses || []).length > 0 && <span className="idet-attach-count">{r.witnesses.length}</span>}
              {canEdit && (
                <button className="idet-attach-add" onClick={() => setWitnessModal('add')}>
                  <Icon name="plus" size={12}/>Add witness
                </button>
              )}
            </div>
            <div className="idet-card-body">
              {(r.witnesses || []).length === 0 ? (
                <div className="idet-witness-empty">
                  No witnesses recorded yet.{canEdit ? ' Add a statement when one is collected.' : ''}
                </div>
              ) : (
                <div className="idet-witnesses">
                  {r.witnesses.map(w => (
                    <div key={w.id} className="idet-witness">
                      <div className="idet-witness-head">
                        <div className="idet-witness-info">
                          <div className="idet-witness-name">{w.name}</div>
                          {w.contact && <div className="idet-witness-contact">{w.contact}</div>}
                        </div>
                        {canEdit && (
                          <div className="idet-witness-actions">
                            <button className="idet-edit-trigger" onClick={() => setWitnessModal(w)} title="Edit witness">
                              <Icon name="edit" size={11}/>edit
                            </button>
                            <button className="idet-edit-trigger idet-witness-del" onClick={() => handleDeleteWitness(w)} title="Remove witness">
                              <Icon name="close" size={11}/>remove
                            </button>
                          </div>
                        )}
                      </div>
                      {w.statement && <div className="idet-witness-statement">{w.statement}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {canVerify && showOsha && (r.type === 'injury' || r.type === 'illness') && (
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
      {modal === 'close' && r.track === 'C' && createPortal(<CloseModal incident={r} onCancel={() => setModal(null)} onConfirm={handleClose}/>, document.body)}
      {modal === 'close' && r.track !== 'C' && createPortal(
        <ClosureChecklistModal incident={r} onCancel={() => setModal(null)} onClose={handleClose}
          onRequestClosure={handleRequestClosure} onForceClose={handleForceClose} userRole={user?.role}/>, document.body)}
      {modal === 'closure-approval' && r.closure_request && createPortal(
        <ClosureApprovalModal incident={r} closureRequest={r.closure_request} onCancel={() => setModal(null)}
          onApprove={handleApproveClosure} onReject={handleRejectClosure}/>, document.body)}
      {modal === 'reopen' && createPortal(<ReopenModal incident={r} onCancel={() => setModal(null)} onConfirm={handleReopen}/>, document.body)}
      {modal === 'severity' && createPortal(<SeverityOverrideModal incident={r} onCancel={() => setModal(null)} onConfirm={handleSeverityOverride}/>, document.body)}
      {witnessModal === 'add' && createPortal(<WitnessModal incident={r} onCancel={() => setWitnessModal(null)} onConfirm={handleAddWitness}/>, document.body)}
      {witnessModal && witnessModal !== 'add' && createPortal(<WitnessModal incident={r} witness={witnessModal} onCancel={() => setWitnessModal(null)} onConfirm={handleUpdateWitness}/>, document.body)}
      <AffectedPersonModal
        open={apModalOpen}
        incident={r}
        onClose={() => setApModalOpen(false)}
        onSaved={load}
      />
      <AffectedPersonModal
        open={!!apEditTarget}
        incident={r}
        person={apEditTarget}
        onClose={() => setApEditTarget(null)}
        onSaved={load}
      />


      {/* Toast */}
      {toast && createPortal(
        <div className="idet-toast" role="status" aria-live="polite">
          <span className="toast-icon"><Icon name="check" size={13}/></span>
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
}
