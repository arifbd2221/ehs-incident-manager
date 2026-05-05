import { useState, useEffect, useRef } from 'react';
import { createIncident, uploadAttachments } from '../../api/incidents';
import { getSites } from '../../api/users';
import Icon from '../../components/shared/Icon';
import { TYPES, typeOf } from '../../components/shared/Badges';
import InjuryForm from './types/InjuryForm';
import IllnessForm from './types/IllnessForm';
import NearMissForm from './types/NearMissForm';
import PropertyDamageForm from './types/PropertyDamageForm';
import EnvironmentalReleaseForm from './types/EnvironmentalReleaseForm';
import UnsafeConditionForm from './types/UnsafeConditionForm';
import ObservationForm from './types/ObservationForm';
import DangerousOccurrenceForm from './types/DangerousOccurrenceForm';
import '../../styles/wizard.css';

const STEPS = [
  { title: 'What happened', desc: 'Title, type, location & description' },
  { title: 'Details & risk', desc: 'Type-specific data & risk classification' },
  { title: 'Review & submit', desc: 'Confirm details and route the incident' },
];

const TYPE_FORMS = {
  injury: InjuryForm, illness: IllnessForm, nearmiss: NearMissForm,
  property: PropertyDamageForm, env: EnvironmentalReleaseForm,
  unsafe: UnsafeConditionForm, observation: ObservationForm, dangerous: DangerousOccurrenceForm,
};

const TYPE_ICONS = {
  injury: 'fire', illness: 'pulse', nearmiss: 'warning', property: 'factory',
  env: 'leaf', unsafe: 'shield', observation: 'eye', dangerous: 'warning',
};

const SEV_GRID = [
  ['med','high','crit','crit','crit'],
  ['low','med','high','crit','crit'],
  ['low','med','high','high','crit'],
  ['low','low','med','high','high'],
  ['low','low','med','med','high'],
];
const SEV_NUM = { low: 5, med: 4, high: 3, crit: 2 };
const SEV_NAMES = { 5: 'Insignificant', 4: 'Minor', 3: 'Moderate', 2: 'Major', 1: 'Critical' };
const SEV_NAME_SHORT = { low: 'Minor', med: 'Moderate', high: 'Major', crit: 'Critical' };

function RiskMatrix({ likelihood, consequence, onPick }) {
  const yLabels = ['Almost certain', 'Likely', 'Possible', 'Unlikely', 'Rare'];
  const xLabels = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

  return (
    <div className="matrix" style={{ flex: 1 }}>
      <div />
      {xLabels.map(l => <div key={l} className="axis-label">{l}</div>)}
      {yLabels.map((yl, yi) => (
        <span key={yl} style={{ display: 'contents' }}>
          <div className="axis-label y-label">{yl}</div>
          {xLabels.map((_, xi) => {
            const k = SEV_GRID[yi][xi];
            const sel = likelihood === yi && consequence === xi;
            return (
              <div key={xi}
                className={`cell cell-${k} ${sel ? 'selected' : ''}`}
                onClick={() => onPick(yi, xi)}
                style={{ borderRadius: 6 }}
              >
                {SEV_NAME_SHORT[k]}
              </div>
            );
          })}
        </span>
      ))}
    </div>
  );
}

const fileTypeInfo = (file) => {
  const name = file.name || file.filename || '';
  const mime = file.type || file.mime_type || '';
  if (mime.startsWith('image/')) return { type: 'image', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', label: 'Image' };
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return { type: 'pdf', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', label: 'PDF' };
  if (mime.includes('word') || /\.docx?$/.test(name)) return { type: 'doc', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Document' };
  if (mime.includes('sheet') || mime.includes('excel') || /\.xlsx?$/.test(name)) return { type: 'sheet', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', label: 'Spreadsheet' };
  return { type: 'text', color: '#6b7280', bg: 'rgba(107,114,128,0.08)', label: 'File' };
};

export default function ReportWizard({ onClose, onSubmit }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState('injury');
  const [title, setTitle] = useState('');
  const [siteId, setSiteId] = useState('');
  const [area, setArea] = useState('');
  const [datetime, setDatetime] = useState(new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState('');
  const [likelihood, setLikelihood] = useState(2);
  const [consequence, setConsequence] = useState(2);
  const [typeData, setTypeData] = useState({});
  const [files, setFiles] = useState([]);
  const [sites, setSites] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [stepDir, setStepDir] = useState('forward');
  const fileInputRef = useRef(null);
  const [removingIdx, setRemovingIdx] = useState(null);
  const [imageUrls, setImageUrls] = useState({});

  useEffect(() => {
    getSites().then(data => { setSites(data); if (data.length > 0) setSiteId(String(data[0].id)); });
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const urls = {};
    files.forEach((f, i) => {
      if (f.type && f.type.startsWith('image/')) {
        urls[i] = URL.createObjectURL(f);
      }
    });
    setImageUrls(urls);
    return () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  }, [files]);

  const sevKey = SEV_GRID[likelihood][consequence];
  const sev = SEV_NUM[sevKey];
  const track = sev <= 2 ? 'A' : sev === 3 ? 'B' : 'C';
  const TypeSection = TYPE_FORMS[type];
  const siteName = sites.find(s => String(s.id) === siteId)?.name || '—';
  const typeName = typeOf(type)?.name || type;

  const canContinue = step === 0 ? title.trim().length > 0 : true;

  const addFiles = (newFiles) => {
    const list = Array.from(newFiles);
    setFiles(prev => [...prev, ...list]);
  };

  const removeFile = (idx) => {
    setRemovingIdx(idx);
    setTimeout(() => {
      setFiles(prev => prev.filter((_, i) => i !== idx));
      setRemovingIdx(null);
    }, 300);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const incident = await createIncident({
        title: title.trim(), type, description,
        incident_datetime: datetime, site_id: Number(siteId),
        area, likelihood, consequence, type_data: typeData,
      });
      if (files.length > 0 && incident?.id) {
        await uploadAttachments('incident', incident.id, files);
      }
      onSubmit();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="wiz-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wiz-shell" onClick={e => e.stopPropagation()}>
        {/* Left sidebar */}
        <div className="wiz-sidebar">
          <div className="wiz-brand">
            <div className="wiz-brand-icon"><Icon name="incidents" size={18} /></div>
            <div>
              <div className="wiz-brand-text">Report incident</div>
              <div className="wiz-brand-sub">EHS Module</div>
            </div>
          </div>

          <div className="wiz-steps">
            {STEPS.map((s, i) => (
              <div key={i} className={`wiz-step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                <div className="wiz-step-num">
                  {i < step ? <Icon name="check" size={14} /> : i + 1}
                </div>
                <div className="wiz-step-text">
                  <div className="wiz-step-title">{s.title}</div>
                  <div className="wiz-step-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="wiz-preview">
            <div className="wiz-preview-h">Live preview</div>
            {title && (
              <div className="wiz-preview-row">
                <span className="lbl">Title</span>
                <span className="val">{title}</span>
              </div>
            )}
            <div className="wiz-preview-row">
              <span className="lbl">Type</span>
              <span className="val">{typeName}</span>
            </div>
            <div className="wiz-preview-row">
              <span className="lbl">Site</span>
              <span className="val">{siteName}</span>
            </div>
            {area && (
              <div className="wiz-preview-row">
                <span className="lbl">Area</span>
                <span className="val">{area}</span>
              </div>
            )}
            <div className="wiz-preview-row">
              <span className="lbl">Severity</span>
              <span className="val"><span className={`wiz-sev ws${sev}`}>S{sev}</span></span>
            </div>
            <div className="wiz-preview-row">
              <span className="lbl">Track</span>
              <span className="val"><span className={`wiz-track-tag wt${track.toLowerCase()}`}>Track {track}</span></span>
            </div>
            {files.length > 0 && (
              <div className="wiz-preview-row">
                <span className="lbl">Files</span>
                <span className="val">{files.length} attached</span>
              </div>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="wiz-main">
          <div className="wiz-header">
            <div>
              <div className="wiz-h-title">{STEPS[step].title}</div>
              <div className="wiz-h-sub">Step {step + 1} of {STEPS.length}</div>
            </div>
            <button className="wiz-close" onClick={onClose}><Icon name="close" size={16} /></button>
          </div>

          <div className="wiz-body">
            <div key={step} className={`wiz-step-anim ${stepDir}`}>
            {/* STEP 0 — What happened */}
            {step === 0 && (
              <>
                <input
                  className="wiz-title-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="What happened? Give a short, specific title..."
                  autoFocus
                />

                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon"><Icon name="incidents" size={16} /></div>
                    Incident type
                  </div>
                  <div className="wiz-type-grid">
                    {TYPES.map(t => (
                      <div key={t.id}
                        className={`wiz-type-card ${type === t.id ? 'selected' : ''}`}
                        onClick={() => { setType(t.id); setTypeData({}); }}
                      >
                        <div className="wiz-tc-icon" style={{ background: `${t.color}18` }}>
                          <Icon name={TYPE_ICONS[t.id] || 'warning'} size={20} color={t.color} />
                        </div>
                        <div className="wiz-tc-name">{t.name}</div>
                        <div className="wiz-tc-desc">{t.desc}</div>
                        <div className="wiz-tc-check"><Icon name="check" size={11} /></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon"><Icon name="location" size={16} /></div>
                    When &amp; where
                  </div>
                  <div className="field-row-3">
                    <div className="field">
                      <label className="label">Date &amp; time <span className="req">*</span></label>
                      <input className="input" type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="label">Site <span className="req">*</span></label>
                      <select className="select" value={siteId} onChange={e => setSiteId(e.target.value)}>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Area / location</label>
                      <input className="input" value={area} onChange={e => setArea(e.target.value)} placeholder="e.g. Lab 2, Workshop B" />
                    </div>
                  </div>
                </div>

                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon"><Icon name="edit" size={16} /></div>
                    Description
                  </div>
                  <textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Describe in detail — what happened, who was involved, what were the immediate circumstances..."
                    rows={4}
                  />
                </div>

                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon"><Icon name="file" size={16} /></div>
                    Attachments
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--sds-fg-tertiary)' }}>Optional · max 10 files, 25 MB each</span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    style={{ display: 'none' }}
                    onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                  />

                  <div
                    className="wiz-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                    onDragLeave={e => e.currentTarget.classList.remove('dragover')}
                    onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); addFiles(e.dataTransfer.files); }}
                  >
                    <div className="wiz-dz-icon"><Icon name="file" size={22} /></div>
                    <div className="wiz-dz-text">Drop files here or <span className="wiz-dz-link">browse</span></div>
                    <div className="wiz-dz-hint">Photos, PDFs, documents — anything that supports the report</div>
                  </div>

                  {files.length > 0 && (
                    <div className="wiz-file-count">
                      <span className="wiz-fc-num" key={files.length}>{files.length}</span> of 10 files
                    </div>
                  )}

                  {files.length > 0 && (
                    <div className="wiz-file-list">
                      {files.map((f, i) => {
                        const ft = fileTypeInfo(f);
                        const isImage = ft.type === 'image';
                        const isOversized = f.size > 25 * 1024 * 1024;
                        return (
                          <div key={`${f.name}-${f.size}-${i}`} className={`wiz-file-item ${removingIdx === i ? 'removing' : ''} ${isOversized ? 'error' : ''}`}>
                            {isImage && imageUrls[i] ? (
                              <div className="wiz-fi-thumb">
                                <img src={imageUrls[i]} alt="" />
                              </div>
                            ) : (
                              <div className="wiz-fi-icon" style={{ background: ft.bg, color: ft.color }}>
                                <Icon name="file" size={14} />
                              </div>
                            )}
                            <div className="wiz-fi-info">
                              <div className="wiz-fi-name">{f.name}</div>
                              <div className="wiz-fi-meta">
                                <span className="wiz-fi-size">{(f.size / 1024).toFixed(0)} KB</span>
                                <span className="wiz-fi-type" style={{ color: ft.color }}>{ft.label}</span>
                              </div>
                            </div>
                            {isOversized && <span className="wiz-fi-warn">Too large</span>}
                            <button className="wiz-fi-remove" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                              <Icon name="close" size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* STEP 1 — Details & risk */}
            {step === 1 && (
              <>
                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon" style={{ background: typeOf(type)?.color || 'var(--sds-brand-primary)' }}>
                      <Icon name={TYPE_ICONS[type] || 'warning'} size={16} />
                    </div>
                    {typeName} — type-specific details
                  </div>
                  {TypeSection && <TypeSection data={typeData} onChange={setTypeData} />}
                </div>

                <div className="wiz-risk-section">
                  <div className="wiz-risk-h">
                    <div className="wiz-rh-icon"><Icon name="warning" size={16} /></div>
                    Risk classification
                  </div>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                    <RiskMatrix
                      likelihood={likelihood}
                      consequence={consequence}
                      onPick={(y, x) => { setLikelihood(y); setConsequence(x); }}
                    />
                    <div className="wiz-risk-result">
                      <div className="wiz-rr-label">Auto-classified</div>
                      <div key={sev} className={`wiz-rr-sev rs${sev}`}>S{sev}</div>
                      <div key={`n-${sev}`} className="wiz-rr-name">{SEV_NAMES[sev]}</div>
                      <div key={`t-${track}`} className={`wiz-rr-track rt${track.toLowerCase()}`}>Track {track}</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* STEP 2 — Review & submit */}
            {step === 2 && (
              <>
                <div className="wiz-submit-banner">
                  <div className="wiz-sb-icon"><Icon name="check" size={22} /></div>
                  <div>
                    <div className="wiz-sb-title">Ready to submit</div>
                    <div className="wiz-sb-desc">
                      This incident will be classified as <b>Severity {sev}</b> and routed to <b>Track {track}</b>.
                      {track === 'C' && ' It will be auto-closed (Track C — log & close).'}
                      {track === 'A' && ' A full investigation will be required.'}
                      {track === 'B' && ' A light investigation will be assigned.'}
                    </div>
                  </div>
                </div>

                <div className="wiz-review-grid">
                  <div className="wiz-review-card">
                    <div className="wiz-rc-h">
                      <div className="wiz-rc-icon"><Icon name="file" size={14} /></div>
                      Incident summary
                    </div>
                    <div className="wiz-review-row">
                      <span className="lbl">Type</span>
                      <span className="val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: typeOf(type)?.color }} />
                        {typeName}
                      </span>
                    </div>
                    <div className="wiz-review-row">
                      <span className="lbl">Title</span>
                      <span className="val">{title || '—'}</span>
                    </div>
                    <div className="wiz-review-row">
                      <span className="lbl">Date &amp; time</span>
                      <span className="val">{datetime.replace('T', ' at ')}</span>
                    </div>
                    <div className="wiz-review-row">
                      <span className="lbl">Location</span>
                      <span className="val">{siteName}{area ? ` — ${area}` : ''}</span>
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 8 }}>
                      <div className="wiz-review-row">
                        <span className="lbl">Severity</span>
                        <span className="val">
                          <span className={`sev sev-${sev}`}>S{sev} &middot; {SEV_NAMES[sev]}</span>
                        </span>
                      </div>
                      <div className="wiz-review-row">
                        <span className="lbl">Track</span>
                        <span className="val">
                          <span className={`track track-${track.toLowerCase()}`}>Track {track}</span>
                        </span>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 8 }}>
                      <div className="wiz-review-row">
                        <span className="lbl">OSHA recordable</span>
                        <span className="val">
                          {(type === 'injury' || type === 'illness')
                            ? <span className="pill pill-success" style={{ fontSize: 10 }}><span className="dot" />Likely</span>
                            : <span className="pill pill-gray" style={{ fontSize: 10 }}><span className="dot" />No</span>}
                        </span>
                      </div>
                      <div className="wiz-review-row">
                        <span className="lbl">RIDDOR reportable</span>
                        <span className="val">
                          {type === 'dangerous'
                            ? <span className="pill pill-err" style={{ fontSize: 10 }}><span className="dot" />Yes</span>
                            : <span className="pill pill-gray" style={{ fontSize: 10 }}><span className="dot" />No</span>}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="wiz-review-card">
                    <div className="wiz-rc-h">
                      <div className="wiz-rc-icon"><Icon name="arrow" size={14} /></div>
                      What happens next
                    </div>
                    <div className="wiz-next-tl">
                      <div className="wiz-next-item">
                        <div className="wiz-next-dot"><Icon name="check" size={14} /></div>
                        <div className="wiz-next-body">
                          <div className="wiz-nb-when">Now</div>
                          <div className="wiz-nb-what">Incident logged and classified Sev {sev} &rarr; Track {track}</div>
                        </div>
                      </div>
                      <div className="wiz-next-item">
                        <div className="wiz-next-dot"><Icon name="bell" size={14} /></div>
                        <div className="wiz-next-body">
                          <div className="wiz-nb-when">Within 5 minutes</div>
                          <div className="wiz-nb-what">EHS Manager and relevant supervisors notified</div>
                        </div>
                      </div>
                      <div className="wiz-next-item">
                        <div className="wiz-next-dot"><Icon name="investigation" size={14} /></div>
                        <div className="wiz-next-body">
                          <div className="wiz-nb-when">Within 24 hours</div>
                          <div className="wiz-nb-what">
                            {track === 'C' ? 'Auto-closed (Track C — low severity, log only)'
                              : track === 'A' ? 'Full investigation assigned with lead investigator'
                              : 'Light investigation or triage assigned'}
                          </div>
                        </div>
                      </div>
                      {type === 'dangerous' && (
                        <div className="wiz-next-item">
                          <div className="wiz-next-dot" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}><Icon name="phone" size={14} /></div>
                          <div className="wiz-next-body">
                            <div className="wiz-nb-when" style={{ color: '#ef4444' }}>Immediately</div>
                            <div className="wiz-nb-what">RIDDOR — phone HSE without delay, written report within 10 days</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {description && (
                      <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sds-fg-tertiary)', marginBottom: 6 }}>Description</div>
                        <div style={{ fontSize: 12, color: 'var(--sds-fg-secondary)', lineHeight: 1.55 }}>{description}</div>
                      </div>
                    )}

                    {files.length > 0 && (
                      <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sds-fg-tertiary)', marginBottom: 8 }}>Attachments · {files.length} file{files.length > 1 ? 's' : ''}</div>
                        {Object.keys(imageUrls).length > 0 && (
                          <div className="wiz-review-thumbs">
                            {files.map((f, i) => imageUrls[i] ? (
                              <div key={i} className="wiz-rt-item">
                                <img src={imageUrls[i]} alt={f.name} />
                              </div>
                            ) : null)}
                          </div>
                        )}
                        <div className="wiz-review-files">
                          {files.map((f, i) => {
                            const ft = fileTypeInfo(f);
                            return (
                              <div key={i} className="wiz-rf-item">
                                <Icon name="file" size={12} color={ft.color} />
                                <span style={{ fontSize: 12, color: 'var(--sds-fg-secondary)' }}>{f.name}</span>
                                <span className="wiz-fi-type" style={{ color: ft.color, fontSize: 9 }}>{ft.label}</span>
                                <span style={{ fontSize: 10, color: 'var(--sds-fg-tertiary)', marginLeft: 'auto' }}>{(f.size / 1024).toFixed(0)} KB</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            </div>
          </div>

          {/* Footer */}
          <div className="wiz-footer">
            <button className="btn btn-text" onClick={onClose} style={{ color: 'var(--sds-fg-tertiary)' }}>Cancel</button>
            <div className="wiz-f-tip">
              {step === 0 && 'Fill in the basics — you can always add more detail later.'}
              {step === 1 && 'Click cells in the risk matrix to set likelihood vs. consequence.'}
              {step === 2 && 'Review everything before submitting. This action cannot be undone.'}
            </div>
            {step > 0 && (
              <button className="btn btn-tertiary" onClick={() => { setStepDir('back'); setStep(s => s - 1); }}>
                <Icon name="arrowL" size={14} />Back
              </button>
            )}
            {step < 2 && (
              <button className="btn btn-primary" disabled={!canContinue} onClick={() => { setStepDir('forward'); setStep(s => s + 1); }}>
                Continue<Icon name="arrow" size={14} />
              </button>
            )}
            {step === 2 && (
              <button className="btn btn-primary btn-lg" disabled={submitting} onClick={handleSubmit}
                style={{ background: submitting ? '#94a3b8' : 'linear-gradient(135deg, var(--sds-brand-primary), #8b5cf6)' }}>
                <Icon name="check" size={16} />{submitting ? 'Submitting...' : 'Submit & route'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
