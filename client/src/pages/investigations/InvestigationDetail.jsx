import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvestigation, addFiveWhy, closeInvestigation, assignCapa, updateInvestigation } from '../../api/investigations';
import { listDocuments } from '../../api/documents';
import { listFolders } from '../../api/folders';
import { uploadAttachments, deleteAttachment } from '../../api/incidents';
import api from '../../api/client';
import { createLink, deleteLink } from '../../api/links';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/shared/Icon';
import { TypePill, SevBadge, TrackBadge } from '../../components/shared/Badges';
import { timeAgo, formatDate } from '../../utils/time';
import CloseInvestigationModal from './modals/CloseInvestigationModal';
import AssignCapaModal from './modals/AssignCapaModal';
import '../../styles/investigations.css';

const ELEVATED = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);

const tlDotClass = (action) => {
  if (action === 'created') return 'td-created';
  if (action === 'five_why_added') return 'td-why';
  if (action === 'capa_assigned') return 'td-capa';
  if (action === 'closed') return 'td-closed';
  if (action === 'attached' || action === 'attachment_deleted') return 'td-default';
  return 'td-default';
};
const tlIcon = (action) => {
  if (action === 'created') return 'investigation';
  if (action === 'five_why_added') return 'edit';
  if (action === 'capa_assigned') return 'capa';
  if (action === 'closed') return 'check';
  if (action === 'attached') return 'file';
  if (action === 'attachment_deleted') return 'close';
  return 'bell';
};

const capaStatusClass = (s) => {
  if (s === 'closed') return 'cs-closed';
  if (s === 'verify') return 'cs-verify';
  return 'cs-open';
};

export default function InvestigationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = ELEVATED.has(user?.role);
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [newWhy, setNewWhy] = useState({ question: '', answer: '', is_root_cause: false });
  const [findings, setFindings] = useState('');

  // Document linking modal state — supports folder navigation. When the user
  // types a search query we switch to flat global search across the whole
  // library; otherwise we show folder tiles + docs in the current folder.
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docLibrary, setDocLibrary] = useState([]);
  const [allFolders, setAllFolders] = useState([]);
  const [docSearch, setDocSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [docLinking, setDocLinking] = useState(false);
  const [linkFolderId, setLinkFolderId] = useState(null);
  const [linkCrumbs, setLinkCrumbs] = useState([]);

  // Post-report attachments — mirrors UX-A on incident detail.
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    getInvestigation(id).then(data => { setInv(data); setFindings(data.findings || ''); }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  // (Re)load the doc library whenever folder context or search changes. Search
  // overrides folder scope — when typing, we want global hits, not folder-only.
  const loadDocLibrary = (folderId, query) => {
    const params = { active: 1, limit: 200 };
    if (query && query.trim()) {
      params.q = query.trim();
    } else {
      params.folder_id = folderId == null ? 'null' : folderId;
    }
    listDocuments(params).then(d => setDocLibrary(d.documents || [])).catch(() => setDocLibrary([]));
  };

  const openDocModal = () => {
    setDocModalOpen(true);
    setDocSearch('');
    setDocTypeFilter('');
    setLinkFolderId(null);
    setLinkCrumbs([]);
    listFolders().then(setAllFolders).catch(() => setAllFolders([]));
    loadDocLibrary(null, '');
  };
  const closeDocModal = () => setDocModalOpen(false);

  // Re-fetch the doc library when folder context or search query changes.
  useEffect(() => {
    if (!docModalOpen) return;
    loadDocLibrary(linkFolderId, docSearch);
  }, [docModalOpen, linkFolderId, docSearch]);

  const navigateLinkFolder = (folder) => {
    if (!folder) { setLinkFolderId(null); setLinkCrumbs([]); return; }
    const byId = new Map(allFolders.map(f => [f.id, f]));
    const crumbs = [];
    let cur = folder;
    while (cur) {
      crumbs.unshift({ id: cur.id, name: cur.name });
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    setLinkFolderId(folder.id);
    setLinkCrumbs(crumbs);
  };
  const navigateLinkCrumb = (idx) => {
    if (idx < 0) { setLinkFolderId(null); setLinkCrumbs([]); return; }
    setLinkCrumbs(linkCrumbs.slice(0, idx + 1));
    setLinkFolderId(linkCrumbs[idx].id);
  };

  // Folder tiles inside the modal — children of current folder. Hidden when a
  // search is active (search is global, not folder-scoped).
  const linkVisibleFolders = docSearch.trim()
    ? []
    : allFolders.filter(f => (f.parent_id ?? null) === linkFolderId);

  const handleLinkDoc = async (doc) => {
    setDocLinking(true);
    try {
      await createLink({ source_type: 'investigation', source_id: Number(id), target_type: 'document', target_id: doc.id, link_role: 'evidence' });
      load();
      showToast(`Linked "${doc.name}"`);
    } catch (e) {
      showToast(e.response?.data?.error || 'Link failed');
    } finally {
      setDocLinking(false);
    }
  };

  const handleUnlinkDoc = async (linkedDoc) => {
    if (!window.confirm(`Unlink "${linkedDoc.name}" from this investigation?`)) return;
    try {
      await deleteLink(linkedDoc.link_id);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Unlink failed');
    }
  };

  const handleDownloadDoc = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.name || doc.stored_filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.response?.data?.error || 'Download failed');
    }
  };

  const handleUploadAttachment = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      await uploadAttachments('investigation', inv.id, files);
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
    if (!window.confirm(`Remove "${attachment.filename}"? This is logged in the activity timeline.`)) return;
    try {
      await deleteAttachment(attachment.id);
      showToast('Attachment removed.');
      load();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove attachment.');
    }
  };

  // Same rule as UX-A: uploader can remove their own; elevated roles can remove anyone's.
  const canDeleteAttachment = (attachment) =>
    ELEVATED.has(user?.role) || attachment.uploaded_by === user?.id;

  const filteredDocs = docLibrary.filter(d => {
    if (docTypeFilter && d.document_type !== docTypeFilter) return false;
    if (docSearch.trim()) {
      const q = docSearch.toLowerCase();
      if (!(d.name?.toLowerCase().includes(q) || d.document_number?.toLowerCase().includes(q))) return false;
    }
    // Don't show already-linked docs
    if (inv?.linked_documents?.some(ld => ld.id === d.id)) return false;
    return true;
  });

  if (loading) return (
    <div className="page invd">
      <div className="inv-skeleton" style={{ gridTemplateColumns: '1fr' }}>
        <div className="inv-skeleton-col">
          <div className="inv-skeleton-card" style={{ height: 60 }}/>
          <div className="inv-skeleton-card" style={{ height: 200 }}/>
          <div className="inv-skeleton-card" style={{ height: 140 }}/>
        </div>
      </div>
    </div>
  );
  if (!inv) return (
    <div className="page invd">
      <div className="inv-empty">
        <div className="inv-empty-icon"><Icon name="investigation" size={26}/></div>
        <h3>Investigation not found</h3>
        <p>It may have been removed or the ID is incorrect.</p>
      </div>
    </div>
  );

  const showToast = (msg) => { setModal(null); setToast(msg); setTimeout(() => setToast(null), 2500); };

  const handleClose = async (form) => {
    try { await closeInvestigation(inv.id, form); showToast('Investigation closed.'); load(); } catch { showToast('Failed to close.'); }
  };
  const handleAssignCapa = async (form) => {
    try { await assignCapa(inv.id, form); showToast(`CAPA assigned · due ${form.due_date}.`); load(); } catch (err) { showToast(err.response?.data?.error || 'Failed to assign CAPA.'); }
  };
  const handleAddWhy = async () => {
    if (!newWhy.question.trim() || !newWhy.answer.trim()) return;
    try {
      await addFiveWhy(inv.id, newWhy);
      setNewWhy({ question: '', answer: '', is_root_cause: false });
      load();
    } catch { showToast('Failed to add.'); }
  };
  const handleSaveFindings = async () => {
    try { await updateInvestigation(inv.id, { findings }); showToast('Findings saved.'); } catch {}
  };

  const statusLabel = inv.status === 'closed' ? 'Closed' : inv.status === 'capa' ? 'Awaiting CAPA' : inv.status === 'progress' ? 'In progress' : 'Pending';
  const statusClass = `ln-${inv.status}`;
  const statusColors = { pending: '#7E7E8C', progress: '#626DF9', capa: '#ED6C02', closed: '#2E7D32' };
  const heroColor = statusColors[inv.status] || '#8b5cf6';

  return (
    <div className="page invd">
      {/* Breadcrumb */}
      <div className="invd-breadcrumb">
        <button onClick={() => navigate('/investigations')}>
          <Icon name="arrowL" size={13} /> Investigations
        </button>
        <span className="invd-bc-sep">/</span>
        <span className="invd-bc-current">{inv.investigation_number}</span>
      </div>

      {/* Hero header card */}
      <div className="invd-hero" style={{ '--invd-color': heroColor }}>
        <div className="invd-hero-strip" />
        <div className="invd-hero-body">
          <div className="invd-hero-left">
            <div className="invd-meta-row">
              <span className="invd-number">{inv.investigation_number}</span>
              <span className="invd-meta-sep">·</span>
              <span className="invd-number">{inv.incident_number}</span>
            </div>
            <h1 className="invd-title">{inv.incident_title}</h1>
            <div className="invd-badges">
              <SevBadge s={inv.severity}/>
              <TrackBadge t={inv.track || inv.incident_track}/>
              <span className={`inv-list-lane ${statusClass}`}>
                <span className="ln-dot"/>{statusLabel}
              </span>
              <span className="invd-lead">Lead: <b>{inv.lead_name || 'Unassigned'}</b></span>
            </div>
          </div>
          <div className="invd-header-actions">
            {inv.status !== 'closed' && (
              <>
                <button className="idet-act-btn" onClick={() => setModal('close')}>Close — no CAPA</button>
                <button className="idet-act-btn primary" onClick={() => setModal('capa')}>
                  <Icon name="plus" size={14}/>Assign CAPA
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* OSHA banner */}
      {inv.osha_recordable === 1 && (
        <div className="invd-osha-banner">
          <div className="invd-osha-icon"><Icon name="reports" size={16}/></div>
          <div className="invd-osha-text"><b>OSHA recordable</b> — this incident will appear on the OSHA 300 log.</div>
        </div>
      )}

      {/* Grid */}
      <div className="invd-grid">
        {/* Main */}
        <div className="invd-main">
          {/* 5-Why RCA */}
          <div className="invd-card">
            <div className="invd-card-h">
              <div className="hicon hi-rca"><Icon name="investigation" size={16}/></div>
              Root cause analysis · 5-Why
            </div>
            <div className="invd-card-body">
              {(inv.five_whys || []).length > 0 ? (
                <div className="invd-why-chain">
                  {inv.five_whys.map((w) => (
                    <div className="invd-why-row" key={w.id}>
                      <div className={`invd-why-num ${w.is_root_cause ? 'root' : ''}`}>
                        {w.is_root_cause ? '★' : w.level}
                      </div>
                      <div className={`invd-why-content ${w.is_root_cause ? 'root-content' : ''}`}>
                        <div className="invd-why-label">{w.is_root_cause ? 'Root cause' : `Why ${w.level}`}</div>
                        <div className="invd-why-q">{w.question}</div>
                        <div className="invd-why-a">{w.answer}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)', marginBottom: 8 }}>No root-cause analysis steps yet. Add the first "Why" below.</p>
              )}

              {inv.status !== 'closed' && (
                <div className="invd-add-why">
                  <div className="form-group">
                    <label className="form-label">Question</label>
                    <input className="form-input" value={newWhy.question} onChange={e => setNewWhy(w => ({ ...w, question: e.target.value }))} placeholder="Why did this happen?"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Answer</label>
                    <textarea className="form-textarea" rows={2} value={newWhy.answer} onChange={e => setNewWhy(w => ({ ...w, answer: e.target.value }))} placeholder="Because..."/>
                  </div>
                  <div className="invd-add-why-foot">
                    <label>
                      <input type="checkbox" checked={newWhy.is_root_cause} onChange={e => setNewWhy(w => ({ ...w, is_root_cause: e.target.checked }))}/> Mark as root cause
                    </label>
                    <button className="invd-why-add-btn" onClick={handleAddWhy} disabled={!newWhy.question.trim() || !newWhy.answer.trim()}>
                      <Icon name="plus" size={13}/>Add Why
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Findings */}
          <div className="invd-card">
            <div className="invd-card-h">
              <div className="hicon hi-findings"><Icon name="edit" size={16}/></div>
              Investigation findings
            </div>
            <div className="invd-card-body">
              <textarea className="invd-findings-area" value={findings} onChange={e => setFindings(e.target.value)} placeholder="Summarize what happened, the immediate and root causes, and any contributing factors."/>
              <button className="invd-save-btn" onClick={handleSaveFindings}>
                <Icon name="check" size={13}/>Save findings
              </button>
            </div>
          </div>

          {/* Evidence */}
          <div className="invd-card">
            <div className="invd-card-h">
              <div className="hicon hi-evidence"><Icon name="file" size={16}/></div>
              Evidence
              {((inv.attachments || []).length + (inv.linked_documents || []).length) > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sds-fg-tertiary)', fontWeight: 500 }}>
                  {(inv.attachments || []).length + (inv.linked_documents || []).length} item{(inv.attachments || []).length + (inv.linked_documents || []).length > 1 ? 's' : ''}
                </span>
              )}
              <button
                className="invd-attach-add"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={(inv.attachments || []).length + (inv.linked_documents || []).length === 0 ? { marginLeft: 'auto' } : undefined}
              >
                {uploading ? (
                  <><span className="invd-attach-spinner"/>Uploading…</>
                ) : (
                  <><Icon name="plus" size={12}/>Add files</>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleUploadAttachment}
              />
            </div>
            <div className="invd-card-body">
              {((inv.attachments || []).length === 0 && (inv.linked_documents || []).length === 0) ? (
                <div className="invd-attach-empty">
                  <p>No evidence uploaded or linked yet.</p>
                  <button
                    className="invd-attach-add-empty"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading…' : '+ Attach a file'}
                  </button>
                </div>
              ) : (
                <div className="invd-evidence-grid">
                  {(inv.attachments || []).map(a => (
                    <div key={`att-${a.id}`} className="invd-evidence-item invd-attach-item">
                      <div className="invd-evidence-icon"><Icon name="file" size={16}/></div>
                      <div className="invd-evidence-info">
                        <div className="invd-evidence-name">{a.filename}</div>
                        <div className="invd-evidence-size">{((a.size_bytes || 0) / 1024).toFixed(0)} KB · uploaded</div>
                      </div>
                      {canDeleteAttachment(a) && (
                        <button
                          className="invd-attach-del"
                          onClick={() => handleDeleteAttachment(a)}
                          title="Remove attachment"
                        >
                          <Icon name="close" size={14}/>
                        </button>
                      )}
                    </div>
                  ))}
                  {(inv.linked_documents || []).map(d => (
                    <div key={`doc-${d.id}`} className="invd-evidence-item invd-evidence-doc"
                      onClick={() => handleDownloadDoc(d)}
                      style={{ cursor: 'pointer' }}>
                      <div className="invd-evidence-icon" style={{ background: 'rgba(98,109,249,0.1)', color: '#626DF9' }}>
                        <Icon name="file" size={16}/>
                      </div>
                      <div className="invd-evidence-info">
                        <div className="invd-evidence-name">{d.name}</div>
                        <div className="invd-evidence-size">
                          {d.document_number} · {d.document_type} · linked
                        </div>
                      </div>
                      {canEdit && (
                        <button className="btn btn-text btn-sm"
                          style={{ marginLeft: 'auto', color: 'var(--sds-error)' }}
                          onClick={(e) => { e.stopPropagation(); handleUnlinkDoc(d); }}>
                          Unlink
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={openDocModal}>
                    <Icon name="file" size={13}/> Link from library
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* CAPAs */}
          {inv.capas && inv.capas.length > 0 && (
            <div className="invd-card">
              <div className="invd-card-h">
                <div className="hicon hi-capa"><Icon name="capa" size={16}/></div>
                CAPAs assigned
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sds-fg-tertiary)', fontWeight: 500 }}>{inv.capas.length} action{inv.capas.length > 1 ? 's' : ''}</span>
              </div>
              <div className="invd-card-body">
                <div className="invd-capa-list">
                  {inv.capas.map(c => (
                    <div key={c.id} className="invd-capa-card" onClick={() => navigate(`/capas/${c.id}`)}>
                      <div className="invd-capa-top">
                        <span className="invd-capa-ref">{c.capa_number}</span>
                        <span className={`invd-capa-status ${capaStatusClass(c.status)}`}>
                          <span className="cs-dot"/>{c.status}
                        </span>
                      </div>
                      <div className="invd-capa-title">{c.title}</div>
                      <div className="invd-capa-meta">
                        <span>Owner: {c.owner_initials}</span>
                        <span>Verifier: {c.verifier_initials}</span>
                        <div className="invd-capa-progress">
                          <div className="invd-capa-progress-bar" style={{ width: `${c.progress || 0}%` }}/>
                        </div>
                        <span>{c.progress || 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="invd-side">
          {/* Incident summary */}
          <div className="invd-card">
            <div className="invd-card-h">
              <div className="hicon hi-summary"><Icon name="incidents" size={16}/></div>
              Incident summary
            </div>
            <div className="invd-card-body">
              <div className="invd-summary-rows">
                <div className="invd-summary-row">
                  <span className="invd-summary-label">Source incident</span>
                  <span className="invd-summary-val mono">{inv.incident_number}</span>
                </div>
                <div className="invd-summary-row">
                  <span className="invd-summary-label">Type</span>
                  <TypePill tid={inv.incident_type}/>
                </div>
                <div className="invd-summary-row">
                  <span className="invd-summary-label">When</span>
                  <span className="invd-summary-val">{formatDate(inv.incident_datetime)}</span>
                </div>
                <div className="invd-summary-row">
                  <span className="invd-summary-label">Where</span>
                  <span className="invd-summary-val">{inv.site_name}{inv.location ? ` · ${inv.location}` : ''}</span>
                </div>
                <div className="invd-summary-row">
                  <span className="invd-summary-label">Reporter</span>
                  <span className="invd-summary-val">{inv.reporter_name}</span>
                </div>
                <div className="invd-summary-row">
                  <span className="invd-summary-label">Severity</span>
                  <SevBadge s={inv.severity}/>
                </div>
                <div className="invd-summary-row">
                  <span className="invd-summary-label">Track</span>
                  <TrackBadge t={inv.track || inv.incident_track}/>
                </div>
                <div className="invd-summary-row">
                  <span className="invd-summary-label">OSHA recordable</span>
                  <span className={`inv-kflag ${inv.osha_recordable ? 'kf-capa' : ''}`} style={!inv.osha_recordable ? { background: '#f3f4f6', color: '#6b7280' } : {}}>
                    <span className="kf-dot"/>{inv.osha_recordable ? 'Yes' : 'No'}
                  </span>
                </div>
                {inv.riddor_reportable === 1 && (
                  <div className="invd-summary-row">
                    <span className="invd-summary-label">RIDDOR</span>
                    <span className="inv-kflag kf-riddor"><span className="kf-dot"/>Reportable</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="invd-card">
            <div className="invd-card-h">
              <div className="hicon hi-team"><Icon name="person" size={16}/></div>
              Investigation team
            </div>
            <div className="invd-card-body">
              {(inv.team || []).length > 0 ? (
                <div className="invd-team-list">
                  {inv.team.map(t => (
                    <div key={t.user_id} className="invd-team-member">
                      <div className="invd-team-av">{t.initials}</div>
                      <div>
                        <div className="invd-team-name">{t.name}</div>
                        <div className="invd-team-role">{t.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No team members assigned</p>
              )}
            </div>
          </div>

          {/* Activity */}
          <div className="invd-card">
            <div className="invd-card-h">
              <div className="hicon hi-activity"><Icon name="capa" size={16}/></div>
              Activity timeline
            </div>
            <div className="invd-card-body">
              <div className="invd-timeline">
                {(inv.activity || []).map((e, i) => (
                  <div className="invd-tl-item" key={i}>
                    <div className={`invd-tl-dot ${tlDotClass(e.action)}`}>
                      <Icon name={tlIcon(e.action)} size={13}/>
                    </div>
                    <div className="invd-tl-body">
                      <div className="tl-who">{e.user_name || 'System'}</div>
                      <div className="tl-what">{e.description}</div>
                      <div className="tl-when">{timeAgo(e.created_at)}</div>
                    </div>
                  </div>
                ))}
                {(inv.activity || []).length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No activity yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals — portal to escape .page transform */}
      {modal === 'close' && createPortal(<CloseInvestigationModal investigation={inv} onCancel={() => setModal(null)} onConfirm={handleClose}/>, document.body)}
      {modal === 'capa' && createPortal(<AssignCapaModal investigation={inv} onCancel={() => setModal(null)} onConfirm={handleAssignCapa}/>, document.body)}

      {docModalOpen && createPortal(
        <div className="modal-backdrop" onClick={closeDocModal}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-h">
              <div>
                <div className="modal-title">Link a document from the library</div>
                <div className="modal-sub">Attach evidence already uploaded to the document library</div>
              </div>
              <button className="icon-btn" onClick={closeDocModal}><Icon name="close" size={18}/></button>
            </div>
            <div className="modal-body">
              <div className="invd-doc-filters">
                <input className="input" placeholder="Search by name or number…" value={docSearch} onChange={e => setDocSearch(e.target.value)} />
                <select className="select invd-doc-type" value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)}>
                  <option value="">All types</option>
                  <option value="sds">SDS</option>
                  <option value="manual">Manual</option>
                  <option value="policy">Policy</option>
                  <option value="photo">Photo</option>
                  <option value="video">Video</option>
                  <option value="log">Log</option>
                  <option value="certificate">Certificate</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {!docSearch.trim() && (
                <nav className="invd-link-crumbs">
                  <button
                    className={`invd-link-crumb${linkFolderId == null ? ' active' : ''}`}
                    onClick={() => navigateLinkCrumb(-1)}
                  >
                    <Icon name="file" size={12}/> All documents
                  </button>
                  {linkCrumbs.map((c, i) => (
                    <span key={c.id} className="invd-link-crumb-row">
                      <span className="invd-link-crumb-sep">/</span>
                      <button
                        className={`invd-link-crumb${i === linkCrumbs.length - 1 ? ' active' : ''}`}
                        onClick={() => navigateLinkCrumb(i)}
                      >
                        {c.name}
                      </button>
                    </span>
                  ))}
                </nav>
              )}
              {linkVisibleFolders.length > 0 && (
                <div className="invd-link-folders">
                  {linkVisibleFolders.map(f => (
                    <button
                      key={f.id}
                      className="invd-link-folder"
                      onClick={() => navigateLinkFolder(f)}
                    >
                      <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                        <path d="M1 3a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3Z" fill="currentColor"/>
                      </svg>
                      <span className="invd-link-folder-name">{f.name}</span>
                      <span className="invd-link-folder-meta">{(f.child_folder_count || 0) + (f.document_count || 0)}</span>
                    </button>
                  ))}
                </div>
              )}
              {filteredDocs.length === 0 ? (
                <p className="invd-doc-empty">
                  {docLibrary.length === 0 && linkVisibleFolders.length === 0
                    ? (docSearch.trim() ? 'No documents match your search.' : 'This folder is empty.')
                    : (docSearch.trim() ? 'No documents match.' : 'No documents in this folder — or all are already linked.')}
                </p>
              ) : (
                <div className="invd-doc-list">
                  {filteredDocs.map(d => (
                    <div key={d.id} className="invd-doc-row"
                      onClick={() => !docLinking && handleLinkDoc(d)}>
                      <div className="invd-doc-icon"><Icon name="file" size={16}/></div>
                      <div className="invd-doc-info">
                        <div className="invd-doc-name">{d.name}</div>
                        <div className="invd-doc-meta">{d.document_number} · {d.document_type}</div>
                      </div>
                      <button className="btn btn-primary btn-sm" disabled={docLinking}
                        onClick={(e) => { e.stopPropagation(); handleLinkDoc(d); }}>
                        Link
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-f">
              <button className="btn btn-secondary" onClick={closeDocModal}>Done</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="invd-toast">
          <span className="toast-check"><Icon name="check" size={12}/></span>
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
}
