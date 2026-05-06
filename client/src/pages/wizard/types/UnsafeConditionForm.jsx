import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';

const HAZARDS = [
  { value: '', label: 'Select...' },
  { value: 'Slip / Trip / Fall — Wet surface', label: 'Slip / Trip / Fall — Wet surface' },
  { value: 'Slip / Trip / Fall — Obstruction', label: 'Slip / Trip / Fall — Obstruction' },
  { value: 'Fall from height — Unguarded edge', label: 'Fall from height — Unguarded edge' },
  { value: 'Electrical — Exposed wiring', label: 'Electrical — Exposed wiring' },
  { value: 'Mechanical — Missing machine guard', label: 'Mechanical — Missing machine guard' },
  { value: 'Mechanical — Defective equipment', label: 'Mechanical — Defective equipment' },
  { value: 'Chemical — Unlabeled container', label: 'Chemical — Unlabeled container' },
  { value: 'Chemical — Improper storage', label: 'Chemical — Improper storage' },
  { value: 'Fire — Blocked fire exit', label: 'Fire — Blocked fire exit' },
  { value: 'Structural — Damaged floor / wall', label: 'Structural — Damaged floor / wall' },
  { value: 'Housekeeping — Cluttered walkway', label: 'Housekeeping — Cluttered walkway' },
  { value: 'Lockout/Tagout — Missing', label: 'Lockout/Tagout — Missing' },
];

export default function UnsafeConditionForm({ data, onChange }) {
  return (
    <>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="warning" size={18} color="var(--sds-brand-primary)"/>Hazard type</div>
        <div className="field">
          <label className="label">Primary hazard <span className="req">*</span></label>
          <ComboBox options={HAZARDS} value={data.primary_hazard || ''} onChange={v => onChange({ ...data, primary_hazard: v })} placeholder="Search hazards…" />
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
        <SmartTextarea
          value={data.corrective_action || ''}
          onChange={v => onChange({ ...data, corrective_action: v })}
          examples={['Replace missing machine guard on press #4 and add interlock switch.', 'Clear obstructed walkway, install permanent floor marking for storage zones.', 'Repair damaged floor tiles in chemical storage room and apply anti-slip coating.']}
          chips={['Replace guard', 'Clear obstruction', 'Repair damage', 'Add signage']}
        />
      </div>
    </>
  );
}
