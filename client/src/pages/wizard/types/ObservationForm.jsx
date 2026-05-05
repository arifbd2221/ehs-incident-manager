import Icon from '../../../components/shared/Icon';

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
            <select className="select" value={data.category || ''} onChange={e => onChange({ ...data, category: e.target.value })}>
              <option value="">Select...</option>
              <option>PPE — Proper use / compliance</option><option>Housekeeping</option>
              <option>Procedures — Following SOP</option><option>Ergonomics</option>
              <option>Communication</option><option>Tools / Equipment</option>
              <option>Chemical handling</option><option>Lockout/Tagout</option>
            </select>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label className="label">Person(s) observed (optional)</label>
            <input className="input" value={data.persons_observed || ''} onChange={e => onChange({ ...data, persons_observed: e.target.value })}/>
          </div>
        </div>
      </div>
      <div className="field">
        <label className="label">Suggested improvement / recognition</label>
        <textarea className="textarea" value={data.suggestion || ''} onChange={e => onChange({ ...data, suggestion: e.target.value })} placeholder="Describe suggestions or recognition."/>
      </div>
    </>
  );
}
