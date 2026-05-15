import { useState, useEffect, useMemo } from 'react';
import Icon from '../shared/Icon';
import ComboBox from '../shared/ComboBox';
import DatePicker from '../shared/DatePicker';
import { getSites } from '../../api/auth';
import { TypePill, TYPES } from '../shared/Badges';
import { checkCompleteness, getFieldMeta, getGapFields } from './voiceFieldConfig';

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function CompleteMeter({ pct, filled, total }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct === 100 ? '#22c55e' : pct >= 60 ? '#ca8a04' : '#dc2626';

  return (
    <div className="voice-meter">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--sds-border)" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round" transform="rotate(-90 34 34)"
          className="voice-meter-fill" />
      </svg>
      <div className="voice-meter-text">
        <span className="voice-meter-pct" style={{ color }}>{pct}%</span>
        <span className="voice-meter-ratio">{filled}/{total}</span>
      </div>
    </div>
  );
}

function GapInput({ fieldKey, meta, value, onChange, sites }) {
  if (meta.input === 'site') {
    return (
      <ComboBox
        className="select voice-gap-input"
        value={value}
        onChange={onChange}
        placeholder="Select site..."
        options={sites.map(s => ({ value: String(s.id), label: s.name }))}
      />
    );
  }
  if (meta.input === 'type') {
    return (
      <div className="voice-gap-types">
        {TYPES.map(t => (
          <button key={t.id} type="button"
            className={`voice-gap-type-chip ${value === t.id ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
    );
  }
  if (meta.input === 'select') {
    return (
      <ComboBox
        className="select voice-gap-input"
        value={value}
        onChange={onChange}
        placeholder="Choose..."
        options={(meta.options || []).map(o => ({ value: o, label: o }))}
      />
    );
  }
  if (meta.input === 'datetime') {
    return <DatePicker value={value} onChange={onChange} showTime placeholder="Select date & time" />;
  }
  return <input type="text" className="input voice-gap-input" value={value} onChange={e => onChange(e.target.value)} placeholder={meta.prompt} />;
}

export default function VoiceReviewCard({ extraction, onSubmit, onEditInWizard, onRetry, submitting, error, transcript }) {
  const fields = extraction?.extracted_fields || {};
  const followups = extraction?.suggested_followups || [];
  const isManualFallback = Object.keys(fields).filter(k => fields[k] != null && fields[k] !== '').length === 0;

  const [sites, setSites] = useState([]);
  const [gapValues, setGapValues] = useState(() => {
    const init = {};
    if (fields.injured_name) init.injured_name = fields.injured_name;
    if (fields.affected_name) init.affected_name = fields.affected_name;
    if (fields.illness_category) init.illness_category = fields.illness_category;
    if (fields.primary_hazard) init.primary_hazard = fields.primary_hazard;
    if (fields.equipment_name) init.equipment_name = fields.equipment_name;
    else if (fields.asset_match) init.equipment_name = fields.asset_match;
    if (fields.substance_name) init.substance_name = fields.substance_name;
    if (isManualFallback && transcript) init.description = transcript;
    return init;
  });
  const [datetime, setDatetime] = useState(nowLocal());

  useEffect(() => {
    getSites().then(d => {
      const list = d.sites || d || [];
      setSites(list);
      if (list.length === 1 && !fields.site_id) {
        setGapValues(prev => ({ ...prev, site_id: String(list[0].id) }));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (fields.site_id) setGapValues(prev => ({ ...prev, site_id: String(fields.site_id) }));
  }, [fields.site_id]);

  const setGap = (key, val) => setGapValues(prev => ({ ...prev, [key]: val }));

  const completeness = useMemo(
    () => checkCompleteness(extraction, gapValues, sites),
    [extraction, gapValues, sites]
  );

  // Render gap-fill from a list derived from the extraction (not gapValues).
  // Otherwise text inputs unmount as soon as the user types a character —
  // completeness.missing would flip the field to "filled" and remove it.
  const gapFields = useMemo(
    () => getGapFields(extraction, gapValues, sites),
    [extraction, gapValues.type, sites]
  );

  const resolvedTitle = gapValues.title || fields.title || '';
  const resolvedType = gapValues.type || fields.type || '';
  const resolvedSiteId = gapValues.site_id || (fields.site_id ? String(fields.site_id) : '');
  const canSubmit = resolvedTitle.trim() && resolvedType && resolvedSiteId && datetime && completeness.missing.length === 0;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const typeData = {};
    if (gapValues.injured_name)     typeData.injured_name = gapValues.injured_name;
    if (gapValues.affected_name)    typeData.affected_name = gapValues.affected_name;
    if (gapValues.illness_category) typeData.illness_category = gapValues.illness_category;
    if (gapValues.primary_hazard)   typeData.primary_hazard = gapValues.primary_hazard;
    if (gapValues.equipment_name)   typeData.equipment_name = gapValues.equipment_name;
    if (gapValues.substance_name)   typeData.substance_name = gapValues.substance_name;

    onSubmit({
      title: resolvedTitle.trim(),
      type: resolvedType,
      description: (gapValues.description || fields.description || '').trim(),
      site_id: Number(resolvedSiteId),
      incident_datetime: datetime,
      area: fields.area || '',
      body_parts_affected: fields.body_parts_affected || [],
      asset_id: fields.asset_id || null,
      type_data: Object.keys(typeData).length > 0 ? typeData : undefined,
      voice_extraction_id: extraction.extraction_id,
      voice_user_confirmed: JSON.stringify(Object.keys(fields).filter(k => fields[k] != null)),
    });
  };

  const extractedSummary = [];
  if (fields.type) extractedSummary.push({ label: 'Type', node: <TypePill tid={fields.type} /> });
  if (fields.title) extractedSummary.push({ label: 'Title', node: <span className="voice-summary-val">{fields.title}</span> });
  if (fields.description) extractedSummary.push({ label: 'Description', node: <span className="voice-summary-val voice-summary-desc">{fields.description}</span> });
  if (fields.area) extractedSummary.push({ label: 'Area', node: <span className="voice-summary-val">{fields.area}</span> });
  if (fields.site_match) extractedSummary.push({ label: 'Site', node: <span className="voice-summary-val">{fields.site_match}</span> });
  if (fields.asset_match) extractedSummary.push({ label: 'Equipment', node: <span className="voice-summary-val">{fields.asset_match}</span> });
  if (fields.injured_name) extractedSummary.push({ label: 'Injured', node: <span className="voice-summary-val">{fields.injured_name}</span> });
  if (fields.affected_name) extractedSummary.push({ label: 'Affected', node: <span className="voice-summary-val">{fields.affected_name}</span> });
  if (fields.illness_category) extractedSummary.push({ label: 'Illness', node: <span className="voice-summary-val">{fields.illness_category}</span> });
  if (fields.primary_hazard) extractedSummary.push({ label: 'Hazard', node: <span className="voice-summary-val">{fields.primary_hazard}</span> });
  if (fields.equipment_name) extractedSummary.push({ label: 'Equipment', node: <span className="voice-summary-val">{fields.equipment_name}</span> });
  if (fields.substance_name) extractedSummary.push({ label: 'Substance', node: <span className="voice-summary-val">{fields.substance_name}</span> });
  if (fields.body_parts_affected?.length > 0) {
    extractedSummary.push({
      label: 'Body Parts',
      node: (
        <div className="voice-review-pills">
          {fields.body_parts_affected.map(p => <span key={p} className="pill pill-info">{p.replace(/_/g, ' ')}</span>)}
        </div>
      ),
    });
  }

  return (
    <div className="voice-review">
      {/* Completeness header */}
      <div className="voice-complete-header">
        <CompleteMeter pct={completeness.pct} filled={completeness.filled} total={completeness.total} />
        <div className="voice-complete-info">
          {completeness.pct === 100 ? (
            <>
              <div className="voice-complete-title voice-complete-ready">Ready to submit</div>
              <div className="voice-complete-sub">All required fields captured from your voice input.</div>
            </>
          ) : extractedSummary.length === 0 ? (
            <>
              <div className="voice-complete-title">Fill in the details</div>
              <div className="voice-complete-sub">AI extraction unavailable — please complete the fields below from your transcript.</div>
            </>
          ) : (
            <>
              <div className="voice-complete-title">Almost there</div>
              <div className="voice-complete-sub">
                {completeness.missing.length === 1
                  ? 'Just 1 more field needed below.'
                  : `${completeness.missing.length} more fields needed below.`}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Extracted summary — what AI captured */}
      {extractedSummary.length > 0 && (
        <div className="voice-extracted-section">
          <div className="voice-section-label">
            <Icon name="check" size={12} /> Captured from voice
          </div>
          <div className="voice-extracted-grid">
            {extractedSummary.map((item, i) => (
              <div key={i} className="voice-extracted-item">
                <span className="voice-extracted-label">{item.label}</span>
                {item.node}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gap-fill section — required fields the extraction didn't provide */}
      {gapFields.length > 0 && (
        <div className="voice-gap-section">
          <div className="voice-section-label voice-section-label-warn">
            <Icon name="warning" size={12} /> Please fill in
          </div>
          {gapFields.map(key => {
            const meta = getFieldMeta(key);
            return (
              <div key={key} className="voice-gap-row">
                <label className="voice-gap-prompt">{meta.prompt}</label>
                <GapInput
                  fieldKey={key}
                  meta={meta}
                  value={gapValues[key] || ''}
                  onChange={val => setGap(key, val)}
                  sites={sites}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Description — editable in manual fallback, pre-filled from transcript */}
      {isManualFallback && (
        <div className="voice-gap-row">
          <label className="voice-gap-prompt">Description</label>
          <textarea
            className="textarea voice-gap-input"
            rows={3}
            value={gapValues.description || ''}
            onChange={e => setGap('description', e.target.value)}
            placeholder="Describe the incident..."
          />
        </div>
      )}

      {/* Date/time — always visible, defaults to now */}
      <div className="voice-gap-row voice-dt-row">
        <label className="voice-gap-prompt">When did this happen?</label>
        <DatePicker value={datetime} onChange={setDatetime} showTime placeholder="Select date & time" />
      </div>

      {/* Follow-up questions from AI */}
      {followups.length > 0 && (
        <div className="voice-review-followups">
          <div className="voice-review-followups-title">Suggested follow-ups</div>
          <ul>
            {followups.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      {error && <div className="voice-error"><Icon name="warning" size={14} /> {error}</div>}

      {/* Actions */}
      <div className="voice-review-actions">
        <button className="btn btn-secondary" onClick={onRetry} disabled={submitting}>
          <Icon name="mic" size={14} /> Re-record
        </button>
        <button className="btn btn-secondary" onClick={() => onEditInWizard(gapValues, datetime)} disabled={submitting}>
          <Icon name="edit" size={14} /> Full Wizard
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? 'Submitting...' : 'Submit Report'}
        </button>
      </div>
    </div>
  );
}
