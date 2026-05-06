import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';

const OCCURRENCE_TYPES = [
  { value: '', label: 'Select...' },
  { value: 'Collapse of load-bearing equipment', label: 'Collapse of load-bearing equipment' },
  { value: 'Explosion of closed vessel', label: 'Explosion of closed vessel' },
  { value: 'Electrical short circuit causing fire', label: 'Electrical short circuit causing fire' },
  { value: 'Unintended collapse of building / structure', label: 'Unintended collapse of building / structure' },
  { value: 'Scaffold collapse over 5m', label: 'Scaffold collapse over 5m' },
  { value: 'Unintentional explosion or fire', label: 'Unintentional explosion or fire' },
  { value: 'Accidental release of substance', label: 'Accidental release of substance' },
  { value: 'Malfunction of breathing apparatus', label: 'Malfunction of breathing apparatus' },
  { value: 'Release of flammable substances', label: 'Release of flammable substances' },
];

export default function DangerousOccurrenceForm({ data, onChange }) {
  return (
    <>
      <div className="alert alert-err" style={{ marginBottom: 4 }}>
        <div className="icon-wrap"><Icon name="warning" size={18}/></div>
        <div className="body">
          <div className="title">RIDDOR Schedule 2 — must be reported to HSE</div>
          <div className="desc">Report by phone (0345 300 9923) without delay, then submit written report within 10 days.</div>
        </div>
      </div>

      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="warning" size={18} color="var(--sds-brand-primary)"/>Type of dangerous occurrence (RIDDOR Schedule 2)</div>
        <div className="field">
          <ComboBox options={OCCURRENCE_TYPES} value={data.occurrence_type || ''} onChange={v => onChange({ ...data, occurrence_type: v })} placeholder="Search occurrence types…" />
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
          <div className="card-h">Equipment / plant involved</div>
          <div className="field"><label className="label">Equipment name</label><input className="input" value={data.equipment_name || ''} onChange={e => onChange({ ...data, equipment_name: e.target.value })}/></div>
          <div className="field"><label className="label">Manufacturer / model</label><input className="input" value={data.manufacturer || ''} onChange={e => onChange({ ...data, manufacturer: e.target.value })}/></div>
          <div className="field"><label className="label">Last inspection date</label><input className="input" type="date" value={data.last_inspection || ''} onChange={e => onChange({ ...data, last_inspection: e.target.value })}/></div>
        </div>
        <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
          <div className="card-h">HSE notification record</div>
          <div className="field"><label className="label">HSE notified date</label><input className="input" type="date" value={data.hse_notified_date || ''} onChange={e => onChange({ ...data, hse_notified_date: e.target.value })}/></div>
          <div className="field"><label className="label">HSE reference number</label><input className="input" value={data.hse_reference || ''} onChange={e => onChange({ ...data, hse_reference: e.target.value })}/></div>
          <div className="field"><label className="label">Person who called HSE</label><input className="input" value={data.hse_caller || ''} onChange={e => onChange({ ...data, hse_caller: e.target.value })}/></div>
        </div>
      </div>
    </>
  );
}
