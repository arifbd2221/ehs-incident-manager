import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createIncident, uploadAttachments } from '../../api/incidents';
import { getSites } from '../../api/users';
import { listAssets } from '../../api/assets';
import api from '../../api/client';
import Icon from '../../components/shared/Icon';
import ComboBox from '../../components/shared/ComboBox';
import SmartTextarea from '../../components/shared/SmartTextarea';
import DatePicker from '../../components/shared/DatePicker';
import { TYPES, typeOf } from '../../components/shared/Badges';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { frameworkVisibility, jurisdictionForContext } from '../../utils/frameworks';
import RiskMatrix, { SEV_GRID, SEV_NUM, SEV_NAMES, SEV_NAME_SHORT } from '../../components/shared/RiskMatrix';
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
  const { user } = useAuth();
  const { voiceSheetData, setVoiceSheetData, activeSiteId } = useApp();
  const { showOsha, showRiddor } = frameworkVisibility(user);
  const [step, setStep] = useState(0);
  const [type, setType] = useState('injury');
  const [title, setTitle] = useState('');
  const [siteId, setSiteId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [assets, setAssets] = useState([]);
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
  const [submitError, setSubmitError] = useState('');
  const typeGroupRef = useRef(null);

  // Anonymous reporting toggle (per locked decision #10).
  // Disabled when type is injury/illness — those identify a person and
  // are blocked at the backend.
  const [isAnonymous, setIsAnonymous] = useState(false);
  const anonymousAllowed = type !== 'injury' && type !== 'illness';

  const siteOpts = useMemo(() => sites.map(s => ({ value: String(s.id), label: s.name })), [sites]);
  const assetOpts = useMemo(() => [
    { value: '', label: 'No specific asset' },
    ...assets.map(a => ({ value: String(a.id), label: `${a.name} · ${a.asset_type}${a.location_description ? ` · ${a.location_description}` : ''}` }))
  ], [assets]);

  // Auto-classification preview (locked #14) + trending banner data (#16).
  // Fetched whenever the cascade fields settle. Lets Step 2 pre-fill the
  // matrix selection AND show "N prior incidents at this asset/area" banner.
  const [classifyPreview, setClassifyPreview] = useState(null);

  // Voice intake — the in-wizard CTA + modal were removed per user request.
  // The GlobalVoiceFab (top-right) can still hand off pre-extracted fields
  // via voiceSheetData, which feeds handleVoiceExtracted below. These pieces
  // of state track which fields the AI filled so we can badge them in the UI;
  // editing clears the badge. On submit, the wizard sends voice_extraction_id
  // along with the sets of fields the user kept, edited, or rejected.
  const [voiceExtractionId, setVoiceExtractionId] = useState(null);
  const [aiSuggestedFields, setAiSuggestedFields] = useState(new Set());
  const [aiOriginalValues, setAiOriginalValues] = useState({});
  const [voiceFollowups, setVoiceFollowups] = useState([]);

  // Strip a field from the AI-suggested set when the user changes it.
  // Called from each input's onChange below.
  const clearAiBadge = useCallback((field) => {
    setAiSuggestedFields(prev => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }, []);

  const handleVoiceExtracted = useCallback((result) => {
    const f = result.extracted_fields || {};
    const filled = new Set();
    const originals = {};
    if (f.title) { setTitle(f.title); filled.add('title'); originals.title = f.title; }
    if (f.type) { setType(f.type); filled.add('type'); originals.type = f.type; }
    if (f.description) { setDescription(f.description); filled.add('description'); originals.description = f.description; }
    if (f.area) { setArea(f.area); filled.add('area'); originals.area = f.area; }
    if (f.site_id) { setSiteId(String(f.site_id)); filled.add('site'); originals.site = String(f.site_id); }
    if (f.incident_datetime) { setDatetime(f.incident_datetime); filled.add('datetime'); originals.datetime = f.incident_datetime; }
    if (f.asset_id) { originals.asset = String(f.asset_id); filled.add('asset'); }
    const td = {};
    if (Array.isArray(f.body_parts_affected) && f.body_parts_affected.length > 0) {
      td.body_parts = f.body_parts_affected;
      filled.add('body_parts');
      originals.body_parts = f.body_parts_affected;
    }
    if (f.injured_name)      { td.injured_name = f.injured_name;           filled.add('injured_name'); }
    if (f.affected_name)     { td.affected_name = f.affected_name;         filled.add('affected_name'); }
    if (f.illness_category)  { td.illness_category = f.illness_category;   filled.add('illness_category'); }
    if (f.primary_hazard)    { td.primary_hazard = f.primary_hazard;       filled.add('primary_hazard'); }
    if (f.equipment_name)    { td.equipment_name = f.equipment_name;       filled.add('equipment_name'); }
    if (f.substance_name)    { td.substance_name = f.substance_name;       filled.add('substance_name'); }
    if (Object.keys(td).length > 0) setTypeData(prev => ({ ...prev, ...td }));
    setVoiceExtractionId(result.extraction_id);
    setAiSuggestedFields(filled);
    setAiOriginalValues(originals);
    setVoiceFollowups(result.suggested_followups || []);
  }, []);

  useEffect(() => {
    if (voiceSheetData) {
      handleVoiceExtracted(voiceSheetData);
      setVoiceSheetData(null);
    }
  }, [voiceSheetData, handleVoiceExtracted, setVoiceSheetData]);

  // After site-change effect reloads assets, apply the AI-suggested asset
  // (if any) once the option is actually present in the dropdown.
  useEffect(() => {
    const target = aiOriginalValues.asset;
    if (!target) return;
    if (assets.some(a => String(a.id) === target)) {
      setAssetId(target);
    }
  }, [assets, aiOriginalValues.asset]);

  useEffect(() => {
    getSites().then(data => {
      setSites(data);
      if (data.length > 0) {
        const defaultId = activeSiteId && data.some(s => s.id === activeSiteId)
          ? String(activeSiteId)
          : String(data[0].id);
        setSiteId(defaultId);
      }
    });
  }, [activeSiteId]);

  // Reload assets when the site changes; reset asset selection
  useEffect(() => {
    if (!siteId) { setAssets([]); setAssetId(''); return; }
    listAssets({ site_id: siteId, active: 1, limit: 200 })
      .then(d => setAssets(d.assets || []))
      .catch(() => setAssets([]));
    setAssetId('');
  }, [siteId]);

  // When an asset is picked and area is empty, pre-fill area from asset location
  useEffect(() => {
    if (!assetId) return;
    const a = assets.find(x => String(x.id) === String(assetId));
    if (a && !area && a.location_description) setArea(a.location_description);
  }, [assetId, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch classify-preview whenever cascade fields settle. Used for the
  // trending banner (prior_incidents_90d) and to suggest a matrix cell.
  useEffect(() => {
    if (!siteId || !type) { setClassifyPreview(null); return; }
    const handle = setTimeout(() => {
      api.post('/incidents/classify-preview', {
        type,
        type_data: typeData,
        body_parts_affected: typeData?.body_parts || [],
        asset_id: assetId ? Number(assetId) : null,
        site_id: Number(siteId),
        area: area || null,
      }).then(r => setClassifyPreview(r.data)).catch(() => setClassifyPreview(null));
    }, 300);
    return () => clearTimeout(handle);
  }, [siteId, assetId, area, type, typeData]);

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

  // WI-D: which regulatory regimes apply to this incident-in-progress.
  // Re-computed on every render (cheap: just a few set ops). The
  // jurisdiction array feeds InjuryForm + AffectedPersonModal so they
  // hide field rows that don't apply to the org × site combo.
  const jurisdiction = useMemo(
    () => jurisdictionForContext({ user, siteId, sites }),
    [user, siteId, sites],
  );

  // Per-step validation gates — keep the user from advancing past Step 0
  // without a site + datetime, and past Step 1 without the type-specific
  // required fields + a risk-matrix selection.
  const step0Valid = title.trim().length > 0 && !!siteId && !!datetime;
  const step1Valid = (() => {
    const d = typeData;
    const typeReqs = {
      injury: () => !!d.injured_name?.trim(),
      illness: () => !!d.affected_name?.trim() && !!d.illness_category,
      nearmiss: () => !!d.primary_hazard,
      property: () => !!d.equipment_name?.trim(),
      env: () => !!d.substance_name?.trim(),
      unsafe: () => !!d.primary_hazard,
      observation: () => true,
      dangerous: () => true,
    };
    return (typeReqs[type] || (() => true))() && likelihood > 0 && consequence > 0;
  })();
  const canContinue = step === 0 ? step0Valid : step === 1 ? step1Valid : true;

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
    setSubmitError('');
    try {
      // Bridge: type-specific forms (InjuryForm, IllnessForm) store body_parts
      // inside type_data. The backend reads body_parts_affected from the
      // top-level POST body (added in T3.2). Hoist it.
      const bodyParts = Array.isArray(typeData?.body_parts) ? typeData.body_parts : [];

      // WI-A: normalize the wizard's type_data into the shapes the BE expects.
      //  (1) InjuryForm writes the primary person's identity flat
      //      (injured_name / injured_job_title / injured_department). The BE
      //      (osha_300_log auto-insert, RIDDOR, recordability verification)
      //      reads injured_person.{name,job_title,department}. Lift the
      //      flat keys into the nested sub-record so existing single-person
      //      submissions don't end up as "Unknown" on OSHA 300.
      //  (2) InjuryForm queues extra people in type_data.additional_persons.
      //      Pull them out, drop the key from the type_data payload, and
      //      send the new affected_persons[] array shape the BE already
      //      handles (server/routes/incidents.js POST handler — useArrayShape
      //      branch + bulkInsertFromArray).
      const { additional_persons, ...typeDataNoExtras } = typeData || {};
      const submittedTypeData = {
        ...typeDataNoExtras,
        injured_person: {
          ...(typeDataNoExtras?.injured_person || {}),
          name: typeDataNoExtras?.injured_name ?? typeDataNoExtras?.injured_person?.name ?? null,
          job_title: typeDataNoExtras?.injured_job_title ?? typeDataNoExtras?.injured_person?.job_title ?? null,
          department: typeDataNoExtras?.injured_department ?? typeDataNoExtras?.injured_person?.department ?? null,
          // Regulatory identity fields (OSHA 301, RIDDOR F2508, SafeWork NSW).
          dob: typeDataNoExtras?.injured_dob ?? typeDataNoExtras?.injured_person?.dob ?? null,
          gender: typeDataNoExtras?.injured_gender ?? typeDataNoExtras?.injured_person?.gender ?? null,
          date_hired: typeDataNoExtras?.injured_date_hired ?? typeDataNoExtras?.injured_person?.date_hired ?? null,
          // Contact (OSHA 301 address; RIDDOR + NSW address+phone).
          address: typeDataNoExtras?.injured_address ?? typeDataNoExtras?.injured_person?.address ?? null,
          phone: typeDataNoExtras?.injured_phone ?? typeDataNoExtras?.injured_person?.phone ?? null,
        },
      };
      const extras = Array.isArray(additional_persons) ? additional_persons : [];
      const hasExtras = extras.length > 0;
      let affectedPersonsPayload = null;
      if (hasExtras) {
        const primaryEntry = {
          name: submittedTypeData.injured_person.name,
          job_title: submittedTypeData.injured_person.job_title,
          dob: submittedTypeData.injured_person.dob,
          gender: submittedTypeData.injured_person.gender,
          date_hired: submittedTypeData.injured_person.date_hired,
          address: submittedTypeData.injured_person.address,
          phone: submittedTypeData.injured_person.phone,
          employment_status: 'employee',
          is_primary: true,
          injuries: [{
            body_part: bodyParts.length ? bodyParts.join(', ') : null,
            injury_type: typeDataNoExtras?.injury_type ?? null,
            mechanism: typeDataNoExtras?.mechanism ?? null,
            object_substance: typeDataNoExtras?.object_substance ?? null,
            treatment: typeDataNoExtras?.treatment ?? null,
            physician_name: typeDataNoExtras?.physician_name ?? null,
            physician_phone: typeDataNoExtras?.physician_phone ?? null,
            physician_facility: typeDataNoExtras?.facility_name ?? null,
            er_treated: !!typeDataNoExtras?.er_treated,
            hospitalized: !!typeDataNoExtras?.hospitalized,
            hospitalization_date: typeDataNoExtras?.hospitalization_date ?? null,
          }],
        };
        // Don't double-mark primaries — InjuryForm's modal can flag an
        // extra as is_primary; force it to false here because the inline
        // form is the canonical primary at intake.
        const dedupedExtras = extras.map(p => ({ ...p, is_primary: false }));
        affectedPersonsPayload = [primaryEntry, ...dedupedExtras];
      }

      // Anonymous reporting (per locked decision #10) is disabled for
      // injury/illness — backend rejects, but the toggle is also disabled
      // in the UI for those types. Defensive double-check here.
      const allowAnon = type !== 'injury' && type !== 'illness';

      // Categorize each AI-suggested field as confirmed (kept verbatim) or
      // edited (changed by the user). Body parts compares as a set, the rest
      // compare as strings. The aiSuggestedFields set already excludes
      // anything the user edited (we cleared on change), so anything still
      // in the set is "confirmed". Edited fields are derived from the
      // diff against aiOriginalValues for fields that left the set.
      const confirmed = Array.from(aiSuggestedFields);
      const edited = Object.keys(aiOriginalValues).filter(k => !aiSuggestedFields.has(k));
      // Rejected = AI suggested it, user blanked it. Treat empty == rejected.
      const rejected = edited.filter(k => {
        if (k === 'title') return !title.trim();
        if (k === 'description') return !description.trim();
        if (k === 'area') return !area.trim();
        if (k === 'body_parts') return bodyParts.length === 0;
        return false;
      });

      const incident = await createIncident({
        title: title.trim(), type, description,
        incident_datetime: datetime, site_id: Number(siteId),
        asset_id: assetId ? Number(assetId) : null,
        area, likelihood, consequence, type_data: submittedTypeData,
        body_parts_affected: bodyParts,
        is_anonymous: allowAnon && isAnonymous ? true : false,
        ...(affectedPersonsPayload ? { affected_persons: affectedPersonsPayload } : {}),
        ...(voiceExtractionId
          ? {
              voice_extraction_id: voiceExtractionId,
              voice_user_confirmed: confirmed,
              voice_user_edited: edited.filter(k => !rejected.includes(k)),
              voice_user_rejected: rejected,
            }
          : {}),
      });
      if (files.length > 0 && incident?.id) {
        await uploadAttachments('incident', incident.id, files);
      }
      onSubmit();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Submission failed — please try again.';
      setSubmitError(msg);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="wiz-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiz-title"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="wiz-shell" onClick={e => e.stopPropagation()}>
        {/* Left sidebar */}
        <div className="wiz-sidebar">
          <div className="wiz-brand">
            <div className="wiz-brand-icon"><Icon name="incidents" size={18} /></div>
            <div>
              <div id="wiz-title" className="wiz-brand-text">Report incident</div>
              <div className="wiz-brand-sub">EHS Module</div>
            </div>
          </div>

          <ol className="wiz-steps" role="list">
            {STEPS.map((s, i) => {
              const isDone = i < step;
              const isActive = i === step;
              const status = isDone ? 'Completed' : isActive ? 'Current step' : 'Upcoming';
              return (
                <li
                  key={i}
                  className={`wiz-step ${isDone ? 'done' : isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <div className="wiz-step-num" aria-hidden="true">
                    {isDone ? <Icon name="check" size={14} /> : i + 1}
                  </div>
                  <div className="wiz-step-text">
                    <div className="wiz-step-title">
                      {s.title}
                      <span className="sr-only"> — {status}</span>
                    </div>
                    <div className="wiz-step-desc">{s.desc}</div>
                  </div>
                </li>
              );
            })}
          </ol>

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
            <button
              type="button"
              className="wiz-close"
              onClick={onClose}
              aria-label="Close wizard"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="wiz-body">
            <div key={step} className={`wiz-step-anim ${stepDir}`}>
            {/* STEP 0 — What happened */}
            {step === 0 && (
              <>
                {/* Active-voice banner is the only voice-related surface kept
                    in the wizard — only renders when the GlobalVoiceFab (top-
                    right) handed off pre-extracted fields. The in-wizard CTA
                    was removed per user request; ✨ AI pills next to each
                    field still indicate unedited FAB-driven suggestions. */}
                {aiSuggestedFields.size > 0 && (
                  <div className="wiz-voice-active-banner">
                    <span className="wiz-voice-active-spark">✨</span>
                    <span className="wiz-voice-active-text">
                      <b>{aiSuggestedFields.size} field{aiSuggestedFields.size > 1 ? 's' : ''}</b> filled by AI from your voice intake.
                      Edit any field to confirm — purple ✨ pills indicate unedited AI suggestions.
                    </span>
                    {voiceFollowups.length > 0 && (
                      <details className="wiz-voice-followups">
                        <summary>{voiceFollowups.length} clarifying question{voiceFollowups.length > 1 ? 's' : ''}</summary>
                        <ul>
                          {voiceFollowups.map((q, i) => <li key={i}>{q}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                )}

                <div className="wiz-field-with-badge">
                  {aiSuggestedFields.has('title') && <span className="wiz-ai-pill">✨ AI</span>}
                  <SmartTextarea
                    value={title}
                    onChange={(v) => { setTitle(v); clearAiBadge('title'); }}
                    examples={EXAMPLE_TITLES}
                    placeholder="e.g. Chemical splash during transfer in Lab 2"
                    multiline={false}
                    className="wiz-title-wrap"
                    autoFocus
                  />
                </div>

                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon"><Icon name="incidents" size={16} /></div>
                    Incident type
                    {aiSuggestedFields.has('type') && <span className="wiz-ai-pill" style={{ marginLeft: 8 }}>✨ AI</span>}
                  </div>
                  <div
                    ref={typeGroupRef}
                    className="wiz-type-grid"
                    role="radiogroup"
                    aria-label="Incident type"
                    onKeyDown={(e) => {
                      const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
                      if (!keys.includes(e.key)) return;
                      e.preventDefault();
                      const idx = TYPES.findIndex(t => t.id === type);
                      let next = idx;
                      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % TYPES.length;
                      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + TYPES.length) % TYPES.length;
                      else if (e.key === 'Home') next = 0;
                      else if (e.key === 'End') next = TYPES.length - 1;
                      const nextType = TYPES[next];
                      setType(nextType.id);
                      setTypeData({});
                      clearAiBadge('type');
                      // Move focus to newly selected card
                      requestAnimationFrame(() => {
                        const el = typeGroupRef.current?.querySelector(`[data-type-id="${nextType.id}"]`);
                        el?.focus();
                      });
                    }}
                  >
                    {TYPES.map(t => {
                      const selected = type === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          tabIndex={selected ? 0 : -1}
                          data-type-id={t.id}
                          className={`wiz-type-card ${selected ? 'selected' : ''}`}
                          onClick={() => { setType(t.id); setTypeData({}); clearAiBadge('type'); }}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Spacebar') {
                              e.preventDefault();
                              setType(t.id);
                              setTypeData({});
                              clearAiBadge('type');
                            }
                          }}
                        >
                          <div className="wiz-tc-icon" style={{ background: `${t.color}18` }}>
                            <Icon name={TYPE_ICONS[t.id] || 'warning'} size={20} color={t.color} />
                          </div>
                          <div className="wiz-tc-name">{t.name}</div>
                          <div className="wiz-tc-desc">{t.desc}</div>
                          <div className="wiz-tc-check" aria-hidden="true"><Icon name="check" size={11} /></div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon"><Icon name="location" size={16} /></div>
                    When &amp; where
                  </div>
                  <div className="field-row-3">
                    <div className="field">
                      <label className="label">Date &amp; time <span className="req" aria-label="required">*</span></label>
                      <DatePicker value={datetime} onChange={setDatetime} showTime placeholder="Select date & time" />
                    </div>
                    <div className="field">
                      <label className="label">
                        Site <span className="req" aria-label="required">*</span>
                        {aiSuggestedFields.has('site') && <span className="wiz-ai-pill" style={{ marginLeft: 6 }}>✨ AI</span>}
                      </label>
                      <ComboBox options={siteOpts} value={siteId} onChange={v => { setSiteId(v); clearAiBadge('site'); }} placeholder="Search sites…" />
                    </div>
                    <div className="field">
                      <label className="label">
                        Area / location
                        {aiSuggestedFields.has('area') && <span className="wiz-ai-pill" style={{ marginLeft: 6 }}>✨ AI</span>}
                      </label>
                      <input className="input" value={area} onChange={e => { setArea(e.target.value); clearAiBadge('area'); }} placeholder="e.g. Lab 2, Workshop B" />
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: 12 }}>
                    <label className="label">
                      Asset (optional)
                      {aiSuggestedFields.has('asset') && <span className="wiz-ai-pill" style={{ marginLeft: 6 }}>✨ AI</span>}
                      {assets.length === 0 && siteId && <span className="helper" style={{ marginLeft: 8, fontSize: 11 }}>No assets registered for this site yet</span>}
                    </label>
                    <ComboBox options={assetOpts} value={assetId} onChange={v => { setAssetId(v); clearAiBadge('asset'); }} placeholder="Search assets…" disabled={assets.length === 0} />
                  </div>
                </div>

                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon"><Icon name="edit" size={16} /></div>
                    Description
                    {aiSuggestedFields.has('description') && <span className="wiz-ai-pill" style={{ marginLeft: 8 }}>✨ AI</span>}
                  </div>
                  <SmartTextarea value={description} onChange={(v) => { setDescription(v); clearAiBadge('description'); }} examples={EXAMPLE_DESCRIPTIONS} rows={4} />
                </div>

                {/* Anonymous reporting toggle — disabled for injury / illness
                    because those identify a person and are blocked at the BE
                    (locked decision #10). */}
                <div className="wiz-section">
                  <label className="wiz-anon-row" style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: 12, borderRadius: 'var(--sds-radius-md)',
                    background: anonymousAllowed ? 'var(--sds-bg-surface-alt)' : 'rgba(0,0,0,0.03)',
                    border: '1px solid var(--sds-border)',
                    cursor: anonymousAllowed ? 'pointer' : 'not-allowed',
                    opacity: anonymousAllowed ? 1 : 0.6,
                  }}>
                    <input
                      type="checkbox"
                      checked={isAnonymous && anonymousAllowed}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      disabled={!anonymousAllowed}
                      style={{ marginTop: 2 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sds-fg-primary)' }}>
                        Submit anonymously
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sds-fg-tertiary)', marginTop: 2 }}>
                        {anonymousAllowed
                          ? "Your identity will not be linked to this report — even though you're signed in, we won't store who submitted it."
                          : `Not available for ${type} reports — these require identifying the affected person for OSHA recordkeeping.`}
                      </div>
                    </div>
                  </label>
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
                            <button
                              type="button"
                              className="wiz-fi-remove"
                              aria-label={`Remove file ${f.name}`}
                              onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                            >
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
                {/* Trending banner — visible whenever the cascade settled with
                    >= 1 prior incident at this asset/area in the last 90 days
                    (locked decision #16). */}
                {classifyPreview && classifyPreview.prior_incidents_90d > 0 && (
                  <div className="wiz-trend-banner">
                    <div className="wiz-trend-icon"><Icon name="warning" size={18} /></div>
                    <div className="wiz-trend-text">
                      <strong>{classifyPreview.prior_incidents_90d} prior incident{classifyPreview.prior_incidents_90d > 1 ? 's' : ''}</strong>
                      {' '}at this {assetId ? 'asset' : 'site/area'} in the last 90 days.
                      {classifyPreview.prior_incidents_12mo > classifyPreview.prior_incidents_90d &&
                        ` (${classifyPreview.prior_incidents_12mo} in the last 12 months.)`}
                      {' '}This pattern raises the likelihood band — review carefully.
                    </div>
                  </div>
                )}

                {/* Auto-classification suggestion (locked decision #14). The
                    matrix below is still user-driven; this surfaces what the
                    rule engine would pick so the user can adopt it with one
                    click or override. */}
                {classifyPreview && classifyPreview.suggested_severity != null && (
                  <div className="wiz-suggest-banner">
                    <div className="wiz-suggest-icon"><Icon name="pulse" size={18} /></div>
                    <div className="wiz-suggest-text">
                      <strong>Suggested: S{classifyPreview.suggested_severity} · Track {classifyPreview.suggested_track}</strong>
                      <div style={{ fontSize: 12, color: 'var(--sds-fg-tertiary)', marginTop: 2 }}>
                        {classifyPreview.reasoning}
                      </div>
                    </div>
                    {(likelihood !== classifyPreview.suggested_likelihood ||
                      consequence !== classifyPreview.suggested_consequence) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setLikelihood(classifyPreview.suggested_likelihood);
                          setConsequence(classifyPreview.suggested_consequence);
                        }}
                      >
                        Apply
                      </button>
                    )}
                  </div>
                )}

                <div className="wiz-section">
                  <div className="wiz-section-h">
                    <div className="wiz-sh-icon" style={{ background: typeOf(type)?.color || 'var(--sds-brand-primary)' }}>
                      <Icon name={TYPE_ICONS[type] || 'warning'} size={16} />
                    </div>
                    {typeName} — type-specific details
                  </div>
                  {TypeSection && <TypeSection data={typeData} onChange={setTypeData} jurisdiction={jurisdiction} />}
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
                    {assetId && (
                      <div className="wiz-review-row">
                        <span className="lbl">Asset</span>
                        <span className="val">{assets.find(a => String(a.id) === String(assetId))?.name || '—'}</span>
                      </div>
                    )}
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
                    {(showOsha || showRiddor) && (
                      <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 8 }}>
                        {showOsha && (
                          <div className="wiz-review-row">
                            <span className="lbl">OSHA recordable</span>
                            <span className="val">
                              {(type === 'injury' || type === 'illness')
                                ? <span className="pill pill-success" style={{ fontSize: 10 }}><span className="dot" />Likely</span>
                                : <span className="pill pill-gray" style={{ fontSize: 10 }}><span className="dot" />No</span>}
                            </span>
                          </div>
                        )}
                        {showRiddor && (
                          <div className="wiz-review-row">
                            <span className="lbl">RIDDOR reportable</span>
                            <span className="val">
                              {type === 'dangerous'
                                ? <span className="pill pill-err" style={{ fontSize: 10 }}><span className="dot" />Yes</span>
                                : <span className="pill pill-gray" style={{ fontSize: 10 }}><span className="dot" />No</span>}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
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
                      {showRiddor && type === 'dangerous' && (
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

          {/* Live status region for submission + errors */}
          <div className="sr-only" role="status" aria-live="polite">
            {submitting ? 'Submitting incident report, please wait.' : ''}
          </div>
          {submitError && (
            <div className="wiz-submit-error" role="alert" aria-live="assertive">
              <Icon name="warning" size={14} /> {submitError}
            </div>
          )}

          {/* Footer */}
          <div className="wiz-footer">
            <button type="button" className="btn btn-text wiz-cancel" onClick={onClose} style={{ color: 'var(--sds-fg-tertiary)' }}>Cancel</button>
            <div className="wiz-f-tip">
              {step === 0 && 'Fill in the basics — you can always add more detail later.'}
              {step === 1 && 'Click cells in the risk matrix to set likelihood vs. consequence.'}
              {step === 2 && 'Review everything before submitting. This action cannot be undone.'}
            </div>
            {step > 0 && (
              <button type="button" className="btn btn-tertiary wiz-back" onClick={() => { setStepDir('back'); setStep(s => s - 1); }}>
                <Icon name="arrowL" size={14} />Back
              </button>
            )}
            {step < 2 && (
              <>
                <button
                  type="button"
                  className="btn btn-primary wiz-continue"
                  disabled={!canContinue}
                  aria-describedby={!canContinue ? 'wiz-continue-hint' : undefined}
                  onClick={() => { setStepDir('forward'); setStep(s => s + 1); }}
                >
                  Continue<Icon name="arrow" size={14} />
                </button>
                <span id="wiz-continue-hint" className="sr-only">
                  {canContinue ? '' : 'Continue is disabled until required fields are filled'}
                </span>
              </>
            )}
            {step === 2 && (
              <button
                type="button"
                className="btn btn-primary btn-lg wiz-continue"
                disabled={submitting}
                aria-busy={submitting || undefined}
                onClick={handleSubmit}
                style={{ background: submitting ? '#94a3b8' : 'linear-gradient(135deg, var(--sds-brand-primary), #8b5cf6)' }}
              >
                <Icon name="check" size={16} />{submitting ? 'Submitting...' : 'Submit & route'}
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
