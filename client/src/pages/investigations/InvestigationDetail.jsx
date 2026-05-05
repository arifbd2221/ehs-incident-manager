import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvestigation, addFiveWhy, closeInvestigation, assignCapa, updateInvestigation } from '../../api/investigations';
import Icon from '../../components/shared/Icon';
import { TypePill, SevBadge, TrackBadge } from '../../components/shared/Badges';
import { timeAgo, formatDate } from '../../utils/time';
import CloseInvestigationModal from './modals/CloseInvestigationModal';
import AssignCapaModal from './modals/AssignCapaModal';
import '../../styles/investigations.css';

const tlDotClass = (action) => {
  if (action === 'created') return 'td-created';
  if (action === 'five_why_added') return 'td-why';
  if (action === 'capa_assigned') return 'td-capa';
  if (action === 'closed') return 'td-closed';
  return 'td-default';
};
const tlIcon = (action) => {
  if (action === 'created') return 'investigation';
  if (action === 'five_why_added') return 'edit';
  if (action === 'capa_assigned') return 'capa';
  if (action === 'closed') return 'check';
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
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [newWhy, setNewWhy] = useState({ question: '', answer: '', is_root_cause: false });
  const [findings, setFindings] = useState('');

  const load = () => {
    setLoading(true);
    getInvestigation(id).then(data => { setInv(data); setFindings(data.findings || ''); }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

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

  return (
    <div className="page invd">
      {/* Back */}
      <button className="invd-back" onClick={() => navigate('/investigations')}>
        <Icon name="arrowL" size={14}/> Back to investigations
      </button>

      {/* Header */}
      <div className="invd-header">
        <div className="invd-header-left">
          <div className="invd-meta-row">
            <span className="invd-number">{inv.investigation_number}</span>
            <span style={{ color: 'var(--sds-border)' }}>·</span>
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
              {(inv.attachments || []).length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sds-fg-tertiary)', fontWeight: 500 }}>{inv.attachments.length} item{inv.attachments.length > 1 ? 's' : ''}</span>}
            </div>
            <div className="invd-card-body">
              {(inv.attachments || []).length > 0 ? (
                <div className="invd-evidence-grid">
                  {inv.attachments.map(a => (
                    <div key={a.id} className="invd-evidence-item">
                      <div className="invd-evidence-icon"><Icon name="file" size={16}/></div>
                      <div className="invd-evidence-info">
                        <div className="invd-evidence-name">{a.original_name}</div>
                        <div className="invd-evidence-size">{(a.size / 1024).toFixed(0)} KB</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--sds-fg-tertiary)' }}>No evidence uploaded yet.</p>
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

      {/* Modals */}
      {modal === 'close' && <CloseInvestigationModal investigation={inv} onCancel={() => setModal(null)} onConfirm={handleClose}/>}
      {modal === 'capa' && <AssignCapaModal investigation={inv} onCancel={() => setModal(null)} onConfirm={handleAssignCapa}/>}

      {/* Toast */}
      {toast && (
        <div className="invd-toast">
          <span className="toast-check"><Icon name="check" size={12}/></span>
          {toast}
        </div>
      )}
    </div>
  );
}
