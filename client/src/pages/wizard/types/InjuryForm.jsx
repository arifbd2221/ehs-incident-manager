import Icon from '../../../components/shared/Icon';
import BodyMap3D from '../../../components/shared/BodyMap3D';
import '../../../styles/bodymap.css';

const PPE_ITEMS = [
  { name: 'Gloves', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 9V3.5a1.5 1.5 0 0 1 3 0V9"/><path d="M9.5 9V2a1.5 1.5 0 0 1 3 0v7"/><path d="M12.5 9V3.5a1.5 1.5 0 0 1 3 0V9"/>
      <path d="M15.5 9V5.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7V9.5a1.5 1.5 0 0 1 3 0V9"/>
    </svg>
  )},
  { name: 'Goggles', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/>
      <path d="M10 12h4"/><circle cx="7" cy="11" r="2"/><circle cx="17" cy="11" r="2"/>
      <path d="M2 10l-1-2"/><path d="M22 10l1-2"/>
    </svg>
  )},
  { name: 'Lab coat', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l-4 5v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7l-4-5"/>
      <path d="M8 2v4"/><path d="M16 2v4"/><path d="M12 10v6"/><path d="M10 13h4"/>
    </svg>
  )},
  { name: 'Face shield', color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8a8 8 0 0 1 16 0"/><path d="M4 8v5a8 8 0 0 0 16 0V8"/>
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" strokeOpacity="0.5"/>
      <line x1="4" y1="5" x2="20" y2="5"/>
    </svg>
  )},
  { name: 'Respirator', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12a6 6 0 0 1 12 0v2a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z"/>
      <path d="M9 15h6"/><path d="M6 12H4a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2"/>
      <path d="M18 12h2a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-2"/>
      <path d="M8 8l-2-3"/><path d="M16 8l2-3"/>
    </svg>
  )},
  { name: 'Hard hat', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16h20"/><path d="M4 16v-2a8 8 0 0 1 16 0v2"/>
      <path d="M12 4v4"/><path d="M9 16v2a3 3 0 0 0 6 0v-2"/>
    </svg>
  )},
];

export default function InjuryForm({ data, onChange }) {
  const bodyParts = data.body_parts || [];
  const ppe = data.ppe || [];

  const toggleBody = (id) => onChange({ ...data, body_parts: bodyParts.includes(id) ? bodyParts.filter(x => x !== id) : [...bodyParts, id] });
  const togglePpe = (n) => onChange({ ...data, ppe: ppe.includes(n) ? ppe.filter(x => x !== n) : [...ppe, n] });

  return (
    <>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="person" size={18} color="var(--sds-brand-primary)"/>Injured person</div>
        <div className="field-row-3">
          <div className="field"><label className="label">Full name <span className="req">*</span></label><input className="input" value={data.injured_name || ''} onChange={e => onChange({ ...data, injured_name: e.target.value })}/></div>
          <div className="field"><label className="label">Job title</label><input className="input" value={data.injured_job_title || ''} onChange={e => onChange({ ...data, injured_job_title: e.target.value })}/></div>
          <div className="field"><label className="label">Department</label><input className="input" value={data.injured_department || ''} onChange={e => onChange({ ...data, injured_department: e.target.value })}/></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
        <div>
          <div className="label mb-8">Body part affected</div>
          <BodyMap3D selected={bodyParts} onToggle={toggleBody}/>
        </div>
        <div className="col gap-16">
          <div className="field">
            <label className="label">Type of injury</label>
            <select className="select" value={data.injury_type || ''} onChange={e => onChange({ ...data, injury_type: e.target.value })}>
              <option value="">Select...</option>
              <option>Chemical burn — 1st degree</option><option>Laceration / Cut</option><option>Puncture wound</option>
              <option>Contusion / Bruise</option><option>Fracture — Open</option><option>Fracture — Closed</option>
              <option>Sprain / Strain</option><option>Crush injury</option><option>Amputation</option>
              <option>Burn — 2nd / 3rd degree</option><option>Concussion / Head injury</option><option>Inhalation injury</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Mechanism of injury</label>
            <select className="select" value={data.mechanism || ''} onChange={e => onChange({ ...data, mechanism: e.target.value })}>
              <option value="">Select...</option>
              <option>Contact with chemical substance</option><option>Struck by moving object</option>
              <option>Caught in / between equipment</option><option>Fall from height</option><option>Fall on same level</option>
              <option>Overexertion — lifting / pulling</option><option>Vehicle accident — on-site</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Object / substance that directly harmed</label>
            <input className="input" value={data.object_substance || ''} onChange={e => onChange({ ...data, object_substance: e.target.value })} placeholder="e.g. conveyor belt, sulfuric acid, forklift"/>
          </div>
          <div className="field">
            <label className="label">Treatment required</label>
            <select className="select" value={data.treatment || ''} onChange={e => onChange({ ...data, treatment: e.target.value })}>
              <option value="">Select...</option>
              <option>First aid only</option><option>Medical treatment</option><option>Days away from work</option>
              <option>Restricted duty</option><option>Hospitalization</option><option>Fatality</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="shield" size={18} color="var(--sds-brand-primary)"/>PPE worn at time of incident</div>
        <div className="ppe-grid">
          {PPE_ITEMS.map(item => {
            const isOn = ppe.includes(item.name);
            return (
              <div
                key={item.name}
                className={`ppe ${isOn ? 'on' : ''}`}
                onClick={() => togglePpe(item.name)}
                style={{
                  '--ppe-color': item.color,
                  '--ppe-bg': item.bg,
                }}
              >
                <div className="ppe-icon">{item.icon}</div>
                <div className="ppe-name">{item.name}</div>
                {isOn && <div className="ppe-check"><Icon name="check" size={10} /></div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
