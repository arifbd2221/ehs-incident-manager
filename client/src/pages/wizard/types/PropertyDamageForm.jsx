import Icon from '../../../components/shared/Icon';

export default function PropertyDamageForm({ data, onChange }) {
  return (
    <>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="factory" size={18} color="var(--sds-brand-primary)"/>Damaged property details</div>
        <div className="field-row-3">
          <div className="field"><label className="label">Equipment / property name <span className="req">*</span></label><input className="input" value={data.equipment_name || ''} onChange={e => onChange({ ...data, equipment_name: e.target.value })}/></div>
          <div className="field"><label className="label">Asset tag / ID</label><input className="input" value={data.asset_id || ''} onChange={e => onChange({ ...data, asset_id: e.target.value })}/></div>
          <div className="field"><label className="label">Manufacturer / model</label><input className="input" value={data.manufacturer || ''} onChange={e => onChange({ ...data, manufacturer: e.target.value })}/></div>
        </div>
      </div>
      <div className="grid-2">
        <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
          <div className="card-h">Cost & status</div>
          <div className="field"><label className="label">Estimated repair cost ($)</label><input className="input" type="number" value={data.repair_cost || ''} onChange={e => onChange({ ...data, repair_cost: e.target.value })}/></div>
          <div className="field"><label className="label">Estimated replace cost ($)</label><input className="input" type="number" value={data.replace_cost || ''} onChange={e => onChange({ ...data, replace_cost: e.target.value })}/></div>
        </div>
        <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
          <div className="card-h">Equipment status</div>
          <div className="col gap-8">
            {['Fully operational','Operational with restrictions','Out of service — repairable','Out of service — total loss','Assessment pending'].map(o => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="radio" name="prop-status" checked={data.equipment_status === o} onChange={() => onChange({ ...data, equipment_status: o })}/> {o}
              </label>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
