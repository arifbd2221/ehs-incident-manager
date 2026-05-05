import Icon from '../../../components/shared/Icon';

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
          <select className="select" value={data.occurrence_type || ''} onChange={e => onChange({ ...data, occurrence_type: e.target.value })}>
            <option value="">Select...</option>
            <option>Collapse of load-bearing equipment</option>
            <option>Explosion of closed vessel</option>
            <option>Electrical short circuit causing fire</option>
            <option>Unintended collapse of building / structure</option>
            <option>Scaffold collapse over 5m</option>
            <option>Unintentional explosion or fire</option>
            <option>Accidental release of substance</option>
            <option>Malfunction of breathing apparatus</option>
            <option>Release of flammable substances</option>
          </select>
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
