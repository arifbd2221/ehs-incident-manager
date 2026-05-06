import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';

const ILLNESS_CATEGORIES = [
  { value: '', label: 'Select...' },
  { value: 'Skin disorder — Contact dermatitis', label: 'Skin disorder — Contact dermatitis' },
  { value: 'Respiratory — Occupational asthma', label: 'Respiratory — Occupational asthma' },
  { value: 'Hearing loss — Noise-induced', label: 'Hearing loss — Noise-induced' },
  { value: 'Poisoning — Lead / Solvent', label: 'Poisoning — Lead / Solvent' },
  { value: 'Musculoskeletal — Carpal tunnel', label: 'Musculoskeletal — Carpal tunnel' },
  { value: 'Infectious — Bloodborne pathogen', label: 'Infectious — Bloodborne pathogen' },
  { value: 'Heat / cold related', label: 'Heat / cold related' },
  { value: 'Occupational cancer', label: 'Occupational cancer' },
  { value: 'Mental health — Work-related stress', label: 'Mental health — Work-related stress' },
];

export default function IllnessForm({ data, onChange }) {
  return (
    <>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="person" size={18} color="var(--sds-brand-primary)"/>Affected person</div>
        <div className="field-row-3">
          <div className="field"><label className="label">Full name <span className="req">*</span></label><input className="input" value={data.affected_name || ''} onChange={e => onChange({ ...data, affected_name: e.target.value })}/></div>
          <div className="field"><label className="label">Employee ID</label><input className="input" value={data.employee_id || ''} onChange={e => onChange({ ...data, employee_id: e.target.value })}/></div>
          <div className="field"><label className="label">Job title</label><input className="input" value={data.job_title || ''} onChange={e => onChange({ ...data, job_title: e.target.value })}/></div>
        </div>
        <div className="field-row-3">
          <div className="field"><label className="label">Date of onset</label><input className="input" type="date" value={data.onset_date || ''} onChange={e => onChange({ ...data, onset_date: e.target.value })}/></div>
          <div className="field"><label className="label">Duration of exposure</label><input className="input" value={data.exposure_duration || ''} onChange={e => onChange({ ...data, exposure_duration: e.target.value })} placeholder="days / months / years"/></div>
          <div className="field"><label className="label">Department</label><input className="input" value={data.department || ''} onChange={e => onChange({ ...data, department: e.target.value })}/></div>
        </div>
      </div>

      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="warning" size={18} color="var(--sds-brand-primary)"/>Illness category</div>
        <div className="field">
          <label className="label">Category <span className="req">*</span></label>
          <ComboBox options={ILLNESS_CATEGORIES} value={data.illness_category || ''} onChange={v => onChange({ ...data, illness_category: v })} placeholder="Search categories…" />
        </div>
        <div className="field">
          <label className="label">Substance / agent that caused or contributed</label>
          <input className="input" value={data.substance || ''} onChange={e => onChange({ ...data, substance: e.target.value })} placeholder="e.g. asbestos fibers, toluene, latex gloves"/>
        </div>
      </div>
    </>
  );
}
