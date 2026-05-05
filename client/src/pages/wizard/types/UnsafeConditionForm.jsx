import Icon from '../../../components/shared/Icon';

export default function UnsafeConditionForm({ data, onChange }) {
  return (
    <>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="warning" size={18} color="var(--sds-brand-primary)"/>Hazard type</div>
        <div className="field">
          <label className="label">Primary hazard <span className="req">*</span></label>
          <select className="select" value={data.primary_hazard || ''} onChange={e => onChange({ ...data, primary_hazard: e.target.value })}>
            <option value="">Select...</option>
            <option>Slip / Trip / Fall — Wet surface</option><option>Slip / Trip / Fall — Obstruction</option>
            <option>Fall from height — Unguarded edge</option><option>Electrical — Exposed wiring</option>
            <option>Mechanical — Missing machine guard</option><option>Mechanical — Defective equipment</option>
            <option>Chemical — Unlabeled container</option><option>Chemical — Improper storage</option>
            <option>Fire — Blocked fire exit</option><option>Structural — Damaged floor / wall</option>
            <option>Housekeeping — Cluttered walkway</option><option>Lockout/Tagout — Missing</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
          <div className="card-h">Risk level</div>
          <div className="col gap-8">
            {['Imminent danger — Stop work immediately','High — Correct within 24 hours','Medium — Correct within 1 week','Low — Correct during scheduled maintenance'].map(o => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="radio" name="uc-risk" checked={data.risk_level === o} onChange={() => onChange({ ...data, risk_level: o })}/> {o}
              </label>
            ))}
          </div>
        </div>
        <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
          <div className="card-h">Urgency</div>
          <div className="col gap-8">
            {['Immediate','Within 24 hours','Within 1 week','Scheduled maintenance','Long-term planning'].map(o => (
              <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="radio" name="uc-urg" checked={data.urgency === o} onChange={() => onChange({ ...data, urgency: o })}/> {o}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <label className="label">Recommended corrective action</label>
        <textarea className="textarea" value={data.corrective_action || ''} onChange={e => onChange({ ...data, corrective_action: e.target.value })} placeholder="Describe your recommended fix or improvement."/>
      </div>
    </>
  );
}
