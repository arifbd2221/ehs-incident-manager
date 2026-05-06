import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';

const HAZARDS = [
  { value: '', label: 'Select...' },
  { value: 'Mechanical — Moving parts', label: 'Mechanical — Moving parts' },
  { value: 'Electrical — Exposed wiring', label: 'Electrical — Exposed wiring' },
  { value: 'Chemical — Corrosive substance', label: 'Chemical — Corrosive substance' },
  { value: 'Chemical — Flammable material', label: 'Chemical — Flammable material' },
  { value: 'Fall hazard — Unguarded edge', label: 'Fall hazard — Unguarded edge' },
  { value: 'Fall hazard — Wet surface', label: 'Fall hazard — Wet surface' },
  { value: 'Fire / Explosion', label: 'Fire / Explosion' },
  { value: 'Confined space', label: 'Confined space' },
  { value: 'Vehicle / Traffic', label: 'Vehicle / Traffic' },
];

export default function NearMissForm({ data, onChange }) {
  return (
    <>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="warning" size={18} color="var(--sds-brand-primary)"/>Potential severity — what could have happened?</div>
        <div className="col gap-8">
          {['Fatality','Critical — life-threatening','Major — hospitalization','Moderate — medical treatment','Minor — first aid only'].map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="radio" name="nm-pot-sev" checked={data.potential_severity === o} onChange={() => onChange({ ...data, potential_severity: o })}/> {o}
            </label>
          ))}
        </div>
      </div>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h">Hazard category</div>
        <div className="field">
          <label className="label">Primary hazard <span className="req">*</span></label>
          <ComboBox options={HAZARDS} value={data.primary_hazard || ''} onChange={v => onChange({ ...data, primary_hazard: v })} placeholder="Search hazards…" />
        </div>
      </div>
      <div className="field">
        <label className="label">Suggested prevention measures</label>
        <SmartTextarea
          value={data.prevention_measures || ''}
          onChange={v => onChange({ ...data, prevention_measures: v })}
          examples={['Install machine guard on exposed moving parts and schedule weekly inspection.', 'Add anti-slip strips to wet-prone walkway and improve drainage.', 'Implement mandatory spotter protocol for all reversing vehicle operations.']}
          chips={['Install guard/barrier', 'Improve signage', 'Add spotter protocol', 'Schedule inspection']}
        />
      </div>
    </>
  );
}
