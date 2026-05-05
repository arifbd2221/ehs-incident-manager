import Icon from '../../../components/shared/Icon';

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
          <select className="select" value={data.primary_hazard || ''} onChange={e => onChange({ ...data, primary_hazard: e.target.value })}>
            <option value="">Select...</option>
            <option>Mechanical — Moving parts</option><option>Electrical — Exposed wiring</option>
            <option>Chemical — Corrosive substance</option><option>Chemical — Flammable material</option>
            <option>Fall hazard — Unguarded edge</option><option>Fall hazard — Wet surface</option>
            <option>Fire / Explosion</option><option>Confined space</option><option>Vehicle / Traffic</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label">Suggested prevention measures</label>
        <textarea className="textarea" value={data.prevention_measures || ''} onChange={e => onChange({ ...data, prevention_measures: e.target.value })} placeholder="Describe suggested actions to prevent recurrence."/>
      </div>
    </>
  );
}
