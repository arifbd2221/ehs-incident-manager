import { useState, useEffect, useRef, useCallback } from 'react';
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

const TRACK_DESC = {
  A: 'Full investigation required — lead investigator assigned within 24h',
  B: 'Light investigation — supervisor review and triage',
  C: 'Log & close — recorded for trend analysis, no investigation needed',
};

const SEV_COLORS = {
  5: '#6b7280', 4: '#16a34a', 3: '#ca8a04', 2: '#ea580c', 1: '#dc2626',
};

function SevGauge({ sev }) {
  const pct = ((5 - sev) / 4) * 100;
  const color = SEV_COLORS[sev] || '#6b7280';
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dashLen = (pct / 100) * circ * 0.75;

  return (
    <div className="wiz-gauge">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8"
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeLinecap="round" transform="rotate(135 55 55)" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dashLen} ${circ - dashLen}`}
          strokeLinecap="round" transform="rotate(135 55 55)"
          className="wiz-gauge-fill" style={{ '--gauge-dash': dashLen, '--gauge-circ': circ }} />
      </svg>
      <div className="wiz-gauge-center">
        <div className="wiz-gauge-val" style={{ color }}>S{sev}</div>
      </div>
    </div>
  );
}

function RiskMatrix({ likelihood, consequence, onPick }) {
  const [hover, setHover] = useState(null);
  const yLabels = ['Almost certain', 'Likely', 'Possible', 'Unlikely', 'Rare'];
  const xLabels = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

  return (
    <div className="rm-matrix" style={{ flex: 1 }}>
      <div className="rm-corner">
        <span className="rm-axis-title rm-axis-y">Likelihood →</span>
      </div>
      {xLabels.map((l, xi) => (
        <div key={l} className={`rm-col-label ${hover && hover[1] === xi ? 'rm-hl' : ''}`}>{l}</div>
      ))}
      {yLabels.map((yl, yi) => (
        <span key={yl} style={{ display: 'contents' }}>
          <div className={`rm-row-label ${hover && hover[0] === yi ? 'rm-hl' : ''}`}>{yl}</div>
          {xLabels.map((_, xi) => {
            const k = SEV_GRID[yi][xi];
            const sel = likelihood === yi && consequence === xi;
            const isHoverRow = hover && hover[0] === yi;
            const isHoverCol = hover && hover[1] === xi;
            return (
              <div key={xi}
                className={`rm-cell rm-cell-${k} ${sel ? 'rm-sel' : ''} ${isHoverRow || isHoverCol ? 'rm-crosshair' : ''}`}
                onClick={() => onPick(yi, xi)}
                onMouseEnter={() => setHover([yi, xi])}
                onMouseLeave={() => setHover(null)}
                style={{ animationDelay: `${(yi * 5 + xi) * 25}ms` }}
              >
                {SEV_NAME_SHORT[k]}
              </div>
            );
          })}
        </span>
      ))}
      <div className="rm-x-title">← Consequence</div>
    </div>
  );
}

const EXAMPLE_TITLES = [
  "Worker slipped on wet floor in loading bay B",
  "Forklift collision with racking in Warehouse 3",
  "Chemical splash during IBC transfer — sulfuric acid",
  "Contractor struck overhead pipe on scissor lift",
  "Grinding disc shattered during metal finishing",
  "H₂S alarm triggered in confined space inspection",
  "Delivery truck struck fire hydrant in east lot",
  "Operator dizzy after coating booth ventilation failure",
  "Hydraulic line burst on press machine — hot fluid spray",
  "Scaffolding plank fell from level 3 in high winds",
];

const EXAMPLE_DESCRIPTIONS = [
  "Worker slipped on wet floor near loading bay B while carrying chemical drums. Left ankle twisted on impact, first aid administered on site.",
  "Forklift reversed into racking in Warehouse 3 during shift changeover. Upper pallet fell approximately 3 metres, narrowly missing a pedestrian worker.",
  "Chemical splash occurred during transfer from IBC to mixing vessel. Sulfuric acid contacted operator's forearm above the glove line.",
  "Contractor struck overhead pipe while operating scissor lift at full extension in Building C maintenance corridor. Hard hat cracked on impact.",
  "Grinding disc shattered during metal finishing operation. Fragments struck the safety guard and one piece ricocheted past the operator's face shield.",
  "Gas detector alarm triggered in confined space during tank inspection. Two workers evacuated immediately; hydrogen sulfide reading peaked at 15 ppm.",
  "Delivery truck reversed over a kerb barrier and struck a fire hydrant in the east parking area. Water main ruptured, no injuries reported.",
  "Operator reported dizziness and nausea after 2 hours in the coating booth. Ventilation checks showed exhaust fan was operating at 40% capacity.",
  "Hydraulic line burst on press machine during production run. Hot fluid sprayed across the work area; operator sustained minor burns to left hand.",
  "Scaffolding plank dislodged on level 3 of construction site during high winds. Plank fell to ground level, landing in a barricaded exclusion zone.",
];

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

function SmartInput({ value, onChange, examples, multiline, className, autoFocus, rows }) {
  const [phIdx, setPhIdx] = useState(() => Math.floor(Math.random() * examples.length));
  const [phVisible, setPhVisible] = useState(true);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const baseTextRef = useRef('');

  useEffect(() => {
    if (value) return;
    const interval = setInterval(() => {
      setPhVisible(false);
      setTimeout(() => {
        setPhIdx(i => (i + 1) % examples.length);
        setPhVisible(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, [value, examples.length]);

  const toggleMic = useCallback(() => {
    if (!SpeechRecognition) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    baseTextRef.current = value;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let finalTranscript = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim = e.results[i][0].transcript;
      }
      const base = baseTextRef.current;
      const separator = base && !base.endsWith(' ') ? ' ' : '';
      onChange(base + separator + finalTranscript + interim);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    inputRef.current?.focus();
  }, [listening, value, onChange]);

  useEffect(() => {
    return () => { if (recognitionRef.current) recognitionRef.current.stop(); };
  }, []);

  const Tag = multiline ? 'textarea' : 'input';
  const extraProps = multiline ? { rows: rows || 4 } : { type: 'text' };

  return (
    <div className={`desc-input-wrap ${multiline ? '' : 'desc-input-single'}`}>
      <Tag
        ref={inputRef}
        className={className || (multiline ? 'textarea' : 'input')}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
        {...extraProps}
      />
      {!value && (
        <div className={`desc-placeholder ${phVisible ? 'visible' : ''}`}>
          {examples[phIdx]}
        </div>
      )}
      {SpeechRecognition && (
        <button
          type="button"
          className={`desc-mic ${listening ? 'recording' : ''}`}
          onClick={toggleMic}
          title={listening ? 'Stop recording' : 'Voice input'}
        >
          <Icon name="mic" size={16} />
          {listening && <span className="desc-mic-pulse" />}
        </button>
      )}
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
                <SmartInput
                  value={title}
                  onChange={setTitle}
                  examples={EXAMPLE_TITLES}
                  className="wiz-title-input"
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
                  <SmartInput value={description} onChange={setDescription} examples={EXAMPLE_DESCRIPTIONS} multiline rows={4} />
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
                    <span className="wiz-risk-hint">Click a cell to set likelihood vs. consequence</span>
                  </div>
                  <div className="wiz-risk-layout">
                    <RiskMatrix
                      likelihood={likelihood}
                      consequence={consequence}
                      onPick={(y, x) => { setLikelihood(y); setConsequence(x); }}
                    />
                    <div key={`result-${sev}-${track}`} className="wiz-risk-result-v2">
                      <div className="wiz-rr2-label">Auto-classified</div>
                      <SevGauge sev={sev} />
                      <div className={`wiz-rr2-name rs${sev}`}>{SEV_NAMES[sev]}</div>
                      <div className="wiz-rr2-divider" />
                      <div className={`wiz-rr2-track rt${track.toLowerCase()}`}>
                        <span className="wiz-rr2-track-letter">{track}</span>
                        Track {track}
                      </div>
                      <div className="wiz-rr2-desc">{TRACK_DESC[track]}</div>
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
