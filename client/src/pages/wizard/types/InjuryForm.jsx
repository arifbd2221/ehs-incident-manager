import Icon from '../../../components/shared/Icon';

const BodyMap = ({ selected, onToggle }) => {
  const parts = [
    ['head', 'M100 8a14 14 0 1 1 0 28 14 14 0 0 1 0-28z'],
    ['neck', 'M93 36h14v8H93z'],
    ['torso', 'M70 44h60l-4 50H74z'],
    ['lArm', 'M64 46l-10 56 12 2 8-52z'],
    ['rArm', 'M136 46l10 56-12 2-8-52z'],
    ['lLeg', 'M82 96h16l-2 70H78z'],
    ['rLeg', 'M102 96h16l4 70h-22z'],
    ['lFoot', 'M76 168h22v8H72z'],
    ['rFoot', 'M102 168h22v8h-26z'],
  ];
  return (
    <div className="bodymap">
      <svg viewBox="0 0 200 180">
        {parts.map(([id, d]) => (
          <path key={id} d={d} className={`part ${selected.includes(id) ? 'sel' : ''}`} onClick={() => onToggle(id)}/>
        ))}
      </svg>
    </div>
  );
};

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

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        <div>
          <div className="label mb-8">Body part affected</div>
          <BodyMap selected={bodyParts} onToggle={toggleBody}/>
          <div className="helper" style={{ textAlign: 'center', marginTop: 6 }}>Selected: <b>{bodyParts.length || 'none'}</b></div>
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
          {[['Gloves','GL'],['Goggles','GG'],['Lab coat','LC'],['Face shield','FS'],['Respirator','RS'],['Hard hat','HH']].map(([n, a]) => (
            <div key={n} className={`ppe ${ppe.includes(n) ? 'on' : ''}`} onClick={() => togglePpe(n)}>
              <div className="ic">{a}</div>
              <div className="nm">{n}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
