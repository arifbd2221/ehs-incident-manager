import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';

const CONTAINMENT_STATUSES = [
  { value: '', label: 'Select...' },
  { value: 'Fully contained', label: 'Fully contained' },
  { value: 'Partially contained', label: 'Partially contained' },
  { value: 'Not contained — active release', label: 'Not contained — active release' },
  { value: 'Contained after initial release', label: 'Contained after initial release' },
  { value: 'Fully cleaned up', label: 'Fully cleaned up' },
];

export default function EnvironmentalReleaseForm({ data, onChange }) {
  return (
    <>
      <div className="alert alert-warn" style={{ marginBottom: 4 }}>
        <div className="icon-wrap"><Icon name="warning" size={18}/></div>
        <div className="body">
          <div className="title">Environmental releases may trigger EPA, state, or local reporting requirements</div>
          <div className="desc">Consult your Environmental Officer. RIDDOR notification may be required for UK sites.</div>
        </div>
      </div>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="leaf" size={18} color="var(--sds-brand-primary)"/>Substance information</div>
        <div className="field-row-3">
          <div className="field"><label className="label">Substance name <span className="req">*</span></label><input className="input" value={data.substance_name || ''} onChange={e => onChange({ ...data, substance_name: e.target.value })}/></div>
          <div className="field"><label className="label">CAS number</label><input className="input" value={data.cas_number || ''} onChange={e => onChange({ ...data, cas_number: e.target.value })}/></div>
          <div className="field"><label className="label">Quantity released</label><input className="input" type="number" value={data.quantity || ''} onChange={e => onChange({ ...data, quantity: e.target.value })}/></div>
        </div>
        <div className="field">
          <label className="label">Containment status</label>
          <ComboBox options={CONTAINMENT_STATUSES} value={data.containment_status || ''} onChange={v => onChange({ ...data, containment_status: v })} placeholder="Search statuses…" />
        </div>
      </div>
      <div className="field">
        <label className="label">Cleanup / response actions</label>
        <SmartTextarea
          value={data.cleanup_actions || ''}
          onChange={v => onChange({ ...data, cleanup_actions: v })}
          examples={['Spill contained with absorbent booms, area evacuated. Hazmat contractor called for cleanup.', 'Leak isolated at valve V-12, secondary containment held. Residual pumped to waste IBC.', 'Area ventilated with portable fans. Air monitoring confirmed safe levels before re-entry.']}
          chips={['Spill contained', 'Leak isolated', 'Area evacuated', 'Hazmat called']}
        />
      </div>
    </>
  );
}
