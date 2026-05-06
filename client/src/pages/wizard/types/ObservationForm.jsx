import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';

const CATEGORIES = [
  { value: '', label: 'Select...' },
  { value: 'PPE — Proper use / compliance', label: 'PPE — Proper use / compliance' },
  { value: 'Housekeeping', label: 'Housekeeping' },
  { value: 'Procedures — Following SOP', label: 'Procedures — Following SOP' },
  { value: 'Ergonomics', label: 'Ergonomics' },
  { value: 'Communication', label: 'Communication' },
  { value: 'Tools / Equipment', label: 'Tools / Equipment' },
  { value: 'Chemical handling', label: 'Chemical handling' },
  { value: 'Lockout/Tagout', label: 'Lockout/Tagout' },
];

export default function ObservationForm({ data, onChange }) {
  return (
    <>
      <div className="grid-2">
        <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
          <div className="card-h"><Icon name="eye" size={18} color="var(--sds-brand-primary)"/>Observation type</div>
          <div className="col gap-8">
            {['Safe behavior — Positive','Unsafe behavior — Negative','Safe condition — Positive','Unsafe condition — Negative','Process / procedure observation'].map(o => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="radio" name="obs-type" checked={data.observation_type === o} onChange={() => onChange({ ...data, observation_type: o })}/> {o}
              </label>
            ))}
          </div>
        </div>
        <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
          <div className="card-h">Category</div>
          <div className="field">
            <ComboBox options={CATEGORIES} value={data.category || ''} onChange={v => onChange({ ...data, category: v })} placeholder="Search categories…" />
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label className="label">Person(s) observed (optional)</label>
            <input className="input" value={data.persons_observed || ''} onChange={e => onChange({ ...data, persons_observed: e.target.value })}/>
          </div>
        </div>
      </div>
      <div className="field">
        <label className="label">Suggested improvement / recognition</label>
        <SmartTextarea
          value={data.suggestion || ''}
          onChange={v => onChange({ ...data, suggestion: v })}
          examples={['Worker consistently uses correct PPE in chemical handling area — recommend recognition.', 'Walkway obstruction near Bay 3 exit — suggest relocating pallet staging area.', 'Team follows LOTO procedure correctly every shift — consider as training example.']}
          chips={['Positive recognition', 'Relocate hazard', 'Update training material']}
        />
      </div>
    </>
  );
}
