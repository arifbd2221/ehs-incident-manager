import Icon from '../../../components/shared/Icon';

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
          <select className="select" value={data.containment_status || ''} onChange={e => onChange({ ...data, containment_status: e.target.value })}>
            <option value="">Select...</option>
            <option>Fully contained</option><option>Partially contained</option><option>Not contained — active release</option><option>Contained after initial release</option><option>Fully cleaned up</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label">Cleanup / response actions</label>
        <textarea className="textarea" value={data.cleanup_actions || ''} onChange={e => onChange({ ...data, cleanup_actions: e.target.value })} placeholder="Describe all cleanup and response actions taken."/>
      </div>
    </>
  );
}
