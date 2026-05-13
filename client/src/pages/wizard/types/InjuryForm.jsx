import { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import DatePicker from '../../../components/shared/DatePicker';
import BodyMap3D from '../../../components/shared/BodyMap3D';
import AffectedPersonModal from '../../incidents/modals/AffectedPersonModal';
import { getUsers } from '../../../api/users';
import { showField } from '../../../utils/frameworks';
import '../../../styles/bodymap.css';

const INJURY_TYPES = [
  { value: '', label: 'Select...' },
  { value: 'Chemical burn — 1st degree', label: 'Chemical burn — 1st degree' },
  { value: 'Laceration / Cut', label: 'Laceration / Cut' },
  { value: 'Puncture wound', label: 'Puncture wound' },
  { value: 'Contusion / Bruise', label: 'Contusion / Bruise' },
  { value: 'Fracture — Open', label: 'Fracture — Open' },
  { value: 'Fracture — Closed', label: 'Fracture — Closed' },
  { value: 'Sprain / Strain', label: 'Sprain / Strain' },
  { value: 'Crush injury', label: 'Crush injury' },
  { value: 'Amputation', label: 'Amputation' },
  { value: 'Burn — 2nd / 3rd degree', label: 'Burn — 2nd / 3rd degree' },
  { value: 'Concussion / Head injury', label: 'Concussion / Head injury' },
  { value: 'Inhalation injury', label: 'Inhalation injury' },
];
const MECHANISMS = [
  { value: '', label: 'Select...' },
  { value: 'Contact with chemical substance', label: 'Contact with chemical substance' },
  { value: 'Struck by moving object', label: 'Struck by moving object' },
  { value: 'Caught in / between equipment', label: 'Caught in / between equipment' },
  { value: 'Fall from height', label: 'Fall from height' },
  { value: 'Fall on same level', label: 'Fall on same level' },
  { value: 'Overexertion — lifting / pulling', label: 'Overexertion — lifting / pulling' },
  { value: 'Vehicle accident — on-site', label: 'Vehicle accident — on-site' },
];
const TREATMENTS = [
  { value: '', label: 'Select...' },
  { value: 'First aid only', label: 'First aid only' },
  { value: 'Medical treatment', label: 'Medical treatment' },
  { value: 'Days away from work', label: 'Days away from work' },
  { value: 'Restricted duty', label: 'Restricted duty' },
  { value: 'Hospitalization', label: 'Hospitalization' },
  { value: 'Fatality', label: 'Fatality' },
];

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

export default function InjuryForm({ data, onChange, jurisdiction = ['US-OSHA', 'UK-RIDDOR', 'AU-NSW'] }) {
  // WI-D: when invoked outside the wizard (test harnesses, future callers)
  // the prop is undefined and we default to showing every jurisdiction's
  // fields so we never accidentally hide data capture. Inside the wizard
  // ReportWizard passes the computed list.
  const [showAllRegulatoryFields, setShowAllRegulatoryFields] = useState(false);
  const see = (key) => showField(key, jurisdiction, showAllRegulatoryFields);

  const bodyParts = data.body_parts || [];
  const ppe = data.ppe || [];
  // WI-A: extras are queued in data.additional_persons (each shaped like
  // the AffectedPersonModal payload). The wizard hoists this array into
  // affected_persons on createIncident — the primary stays the inline
  // form above.
  const additionalPersons = data.additional_persons || [];
  const [apModalOpen, setApModalOpen] = useState(false);

  // WI-A: same "Is this person an employee?" affordance as the modal.
  // Default to 'yes' since most workplace injuries involve employees.
  // Selection auto-fills the three inline identity fields below.
  const [primaryIsEmployee, setPrimaryIsEmployee] = useState(
    data.injured_person_is_employee ?? 'yes'
  );
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (primaryIsEmployee === 'yes' && users.length === 0) {
      getUsers().then(setUsers).catch(() => setUsers([]));
    }
  }, [primaryIsEmployee, users.length]);

  const userOptions = useMemo(() => users.map(u => ({
    value: String(u.id),
    label: `${u.name}${u.job_title ? ` — ${u.job_title}` : ''}${u.email ? ` (${u.email})` : ''}`,
  })), [users]);

  const handlePrimaryEmployeeToggle = (val) => {
    setPrimaryIsEmployee(val);
    // Persist the choice in type_data so the wizard remembers across re-renders.
    onChange({ ...data, injured_person_is_employee: val });
  };

  const handlePrimaryUserPick = (val) => {
    const u = users.find(x => String(x.id) === String(val));
    // Mig 035 added address / phone / dob / gender to users so the full set
    // of OSHA 1904.29 / RIDDOR Sch.2 / NSW WHS s.37 identity fields can be
    // pre-filled from the employee record. Empty strings still fall back to
    // the existing form value so partial profiles don't blank out manual edits.
    onChange({
      ...data,
      injured_user_id: val || null,
      injured_name: u?.name ?? data.injured_name ?? '',
      injured_job_title: u?.job_title ?? data.injured_job_title ?? '',
      injured_department: u?.department ?? data.injured_department ?? '',
      injured_date_hired: u?.hire_date ?? data.injured_date_hired ?? '',
      injured_address: u?.address ?? data.injured_address ?? '',
      injured_phone: u?.phone ?? data.injured_phone ?? '',
      injured_dob: u?.dob ?? data.injured_dob ?? '',
      injured_gender: u?.gender ?? data.injured_gender ?? '',
    });
  };

  const toggleBody = (id) => onChange({ ...data, body_parts: bodyParts.includes(id) ? bodyParts.filter(x => x !== id) : [...bodyParts, id] });
  const togglePpe = (n) => onChange({ ...data, ppe: ppe.includes(n) ? ppe.filter(x => x !== n) : [...ppe, n] });

  const handleCollectAdditional = (payload) => {
    onChange({ ...data, additional_persons: [...additionalPersons, payload] });
  };
  const removeAdditional = (idx) => {
    onChange({ ...data, additional_persons: additionalPersons.filter((_, i) => i !== idx) });
  };

  return (
    <>
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h">
          <Icon name="person" size={18} color="var(--sds-brand-primary)"/>Injured person
          {/* WI-D: reporter can override jurisdiction gating when the
              situation calls for it (e.g., a US org with a one-off UK
              claimant). Defaults off so the form stays focused on the
              fields the org's frameworks actually require. */}
          <label className="helper" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={showAllRegulatoryFields}
              onChange={e => setShowAllRegulatoryFields(e.target.checked)}
            />
            Show all regulatory fields
          </label>
        </div>

        <div className="field">
          <label className="label">Is this person an employee?</label>
          <div>
            <label>
              <input type="radio" name="primaryIsEmployee" value="yes"
                checked={primaryIsEmployee === 'yes'}
                onChange={() => handlePrimaryEmployeeToggle('yes')} /> Yes — pick from employee list
            </label>
          </div>
          <div>
            <label>
              <input type="radio" name="primaryIsEmployee" value="no"
                checked={primaryIsEmployee === 'no'}
                onChange={() => handlePrimaryEmployeeToggle('no')} /> No — enter details manually
            </label>
          </div>
        </div>

        {primaryIsEmployee === 'yes' && (
          <div className="field">
            <label className="label">Employee</label>
            <ComboBox
              options={userOptions}
              value={data.injured_user_id || ''}
              onChange={handlePrimaryUserPick}
              placeholder="Search employees…"
              clearable
            />
            <span className="helper">Selecting an employee fills the fields below.</span>
          </div>
        )}

        <div className="field-row-3">
          <div className="field"><label className="label">Full name <span className="req">*</span></label><input className="input" value={data.injured_name || ''} onChange={e => onChange({ ...data, injured_name: e.target.value })}/></div>
          <div className="field"><label className="label">Job title</label><input className="input" value={data.injured_job_title || ''} onChange={e => onChange({ ...data, injured_job_title: e.target.value })}/></div>
          <div className="field"><label className="label">Department</label><input className="input" value={data.injured_department || ''} onChange={e => onChange({ ...data, injured_department: e.target.value })}/></div>
        </div>

        {/* Contact details. Required for:
            - OSHA 301 (29 CFR 1904.29): address
            - RIDDOR F2508: address + phone
            - SafeWork NSW notification: address + phone
            WI-D: each field gates on its FIELD_REQUIRED_BY entry; the
            whole row collapses when neither field would render. */}
        {(see('injured_address') || see('injured_phone')) && (
          <div className="field-row">
            {see('injured_address') && (
              <div className="field">
                <label className="label">Address</label>
                <input className="input" value={data.injured_address || ''}
                  onChange={e => onChange({ ...data, injured_address: e.target.value })}
                  placeholder="123 Main St, City ST 12345"/>
                <span className="helper">Required for OSHA 301 + RIDDOR + SafeWork NSW</span>
              </div>
            )}
            {see('injured_phone') && (
              <div className="field">
                <label className="label">Phone</label>
                <input className="input" type="tel" value={data.injured_phone || ''}
                  onChange={e => onChange({ ...data, injured_phone: e.target.value })}
                  placeholder="(555) 123-4567"/>
                <span className="helper">Required for RIDDOR + SafeWork NSW</span>
              </div>
            )}
          </div>
        )}

        {/* Regulatory identity fields. Required for:
            - OSHA 301 (29 CFR 1904.29): DOB + gender + date hired
            - SafeWork NSW notification: DOB + gender
            - RIDDOR F2508: age (derived from DOB) */}
        {(see('injured_dob') || see('injured_gender') || see('injured_date_hired')) && (
          <div className="field-row-3">
            {see('injured_dob') && (
              <div className="field">
                <label className="label">Date of birth</label>
                <DatePicker value={data.injured_dob || ''} onChange={v => onChange({ ...data, injured_dob: v })} />
                <span className="helper">Required for OSHA 301 + SafeWork NSW</span>
              </div>
            )}
            {see('injured_gender') && (
              <div className="field">
                <label className="label">Gender</label>
                <ComboBox
                  options={[
                    {value:'', label:'Select…'},
                    {value:'female', label:'Female'},
                    {value:'male', label:'Male'},
                    {value:'non_binary', label:'Non-binary'},
                    {value:'prefer_not_to_say', label:'Prefer not to say'},
                    {value:'other', label:'Other'},
                  ]}
                  value={data.injured_gender || ''}
                  onChange={v => onChange({ ...data, injured_gender: v })}
                  placeholder="Select…"
                />
                <span className="helper">Required for OSHA 301 + SafeWork NSW</span>
              </div>
            )}
            {see('injured_date_hired') && (
              <div className="field">
                <label className="label">Date hired</label>
                <DatePicker value={data.injured_date_hired || ''} onChange={v => onChange({ ...data, injured_date_hired: v })} />
                <span className="helper">Required for OSHA 301</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, marginBottom: 24 }}>
        <div>
          <div className="label mb-8">Body part affected</div>
          <BodyMap3D selected={bodyParts} onToggle={toggleBody}/>
        </div>
        <div className="col gap-16">
          <div className="field">
            <label className="label">Type of injury</label>
            <ComboBox options={INJURY_TYPES} value={data.injury_type || ''} onChange={v => onChange({ ...data, injury_type: v })} placeholder="Search injury types…" />
          </div>
          <div className="field">
            <label className="label">Mechanism of injury</label>
            <ComboBox options={MECHANISMS} value={data.mechanism || ''} onChange={v => onChange({ ...data, mechanism: v })} placeholder="Search mechanisms…" />
          </div>
          <div className="field">
            <label className="label">Object / substance that directly harmed</label>
            <input className="input" value={data.object_substance || ''} onChange={e => onChange({ ...data, object_substance: e.target.value })} placeholder="e.g. conveyor belt, sulfuric acid, forklift"/>
          </div>
          <div className="field">
            <label className="label">Treatment required</label>
            <ComboBox options={TREATMENTS} value={data.treatment || ''} onChange={v => onChange({ ...data, treatment: v })} placeholder="Search treatments…" />
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h"><Icon name="pulse" size={18} color="var(--sds-brand-primary)"/>Medical treatment</div>
        <div className="field-row-3">
          <div className="field"><label className="label">Physician / HCP name</label><input className="input" value={data.physician_name || ''} onChange={e => onChange({ ...data, physician_name: e.target.value })} placeholder="Dr. Jane Smith"/></div>
          <div className="field"><label className="label">Phone</label><input className="input" type="tel" value={data.physician_phone || ''} onChange={e => onChange({ ...data, physician_phone: e.target.value })} placeholder="(555) 123-4567"/></div>
          <div className="field"><label className="label">Facility name</label><input className="input" value={data.facility_name || ''} onChange={e => onChange({ ...data, facility_name: e.target.value })} placeholder="City General Hospital"/></div>
        </div>
        <div className="field-row-3">
          <div className="field"><label className="label">Facility address</label><input className="input" value={data.facility_address || ''} onChange={e => onChange({ ...data, facility_address: e.target.value })} placeholder="123 Main St, City, ST 12345"/></div>
          <div className="field">
            <label className="label">Emergency room treatment</label>
            <ComboBox
              options={[{value:'0', label:'No'}, {value:'1', label:'Yes'}]}
              value={data.er_treated ? '1' : '0'}
              onChange={v => onChange({ ...data, er_treated: v === '1' })}
              placeholder="Select…"
            />
          </div>
          <div className="field">
            <label className="label">Hospitalized overnight</label>
            <ComboBox
              options={[{value:'0', label:'No'}, {value:'1', label:'Yes'}]}
              value={data.hospitalized ? '1' : '0'}
              onChange={v => onChange({ ...data, hospitalized: v === '1' })}
              placeholder="Select…"
            />
          </div>
        </div>
        {data.hospitalized && (
          <div className="field" style={{ maxWidth: 240 }}>
            <label className="label">Hospitalization date</label>
            <DatePicker value={data.hospitalization_date || ''} onChange={v => onChange({ ...data, hospitalization_date: v })} placeholder="Select date" />
          </div>
        )}
      </div>

      {/* WI-A: additional affected persons (collected before submit, sent
          as the new affected_persons array shape on createIncident). The
          inline form above is the primary (Person 1); each entry below
          becomes Person 2..N. */}
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h">
          <Icon name="person" size={18} color="var(--sds-brand-primary)"/>
          Additional affected persons
          {additionalPersons.length > 0 && (
            <span className="idet-attach-count">{additionalPersons.length}</span>
          )}
          <button
            type="button"
            className="idet-attach-add"
            onClick={() => setApModalOpen(true)}
          >
            <Icon name="plus" size={12}/>Add another person
          </button>
        </div>
        {additionalPersons.length === 0 ? (
          <div className="helper">
            One person is captured in the form above. Add anyone else affected
            by this incident — they'll be saved as separate records with their
            own injuries.
          </div>
        ) : (
          <div className="idet-witnesses">
            {additionalPersons.map((p, idx) => (
              <div key={idx} className="idet-witness">
                <div className="idet-witness-head">
                  <div className="idet-witness-info">
                    <div className="idet-witness-name">
                      <span className="pill pill-gray">Person {idx + 2}</span>
                      {' '}{p.name || <em>Unnamed</em>}
                      {p.is_primary && <> <span className="pill pill-info">Primary</span></>}
                    </div>
                    <div className="idet-witness-contact">
                      {[p.job_title, p.employment_status?.replace(/_/g, ' ')]
                        .filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="idet-witness-actions">
                    <button type="button" className="idet-edit-trigger idet-witness-del"
                      onClick={() => removeAdditional(idx)}
                      title="Remove this person">
                      <Icon name="close" size={11}/>remove
                    </button>
                  </div>
                </div>
                {(p.injuries || []).length > 0 && p.injuries[0] && (p.injuries[0].body_part || p.injuries[0].injury_type) && (
                  <div className="idet-witness-statement">
                    <strong>{[p.injuries[0].body_part, p.injuries[0].injury_type].filter(Boolean).join(' — ')}</strong>
                    {p.injuries[0].mechanism && <> · {p.injuries[0].mechanism}</>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AffectedPersonModal
        open={apModalOpen}
        incident={null}
        jurisdiction={jurisdiction}
        showAllRegulatoryFields={showAllRegulatoryFields}
        onClose={() => setApModalOpen(false)}
        onCollect={handleCollectAdditional}
      />

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

      {/* UK RIDDOR edge cases — feeds server/services/riddor.js Reg 5 + Reg 11
          + Reg 14 branches. WI-D gates this card on jurisdiction; reporters
          can still open it via the "Show all regulatory fields" toggle on
          the Injured-person card when the situation calls for it. */}
      {see('riddor_edge_cases') && (
      <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--sds-bg-surface-alt)' }}>
        <div className="card-h">
          <Icon name="shield" size={18} color="var(--sds-brand-primary)"/>
          UK RIDDOR edge cases
          <span className="helper" style={{ marginLeft: 8 }}>Only relevant at UK sites; safe to leave blank otherwise.</span>
        </div>

        <div className="field">
          <label className="label">Accident occurred on hospital premises?</label>
          <ComboBox
            options={[{value:'0', label:'No'}, {value:'1', label:'Yes'}]}
            value={data.on_hospital_premises ? '1' : '0'}
            onChange={v => onChange({ ...data, on_hospital_premises: v === '1' })}
            placeholder="Select…"
          />
          <span className="helper">RIDDOR Reg 5(b): for non-workers, only specified injuries on hospital premises are reportable.</span>
        </div>

        <div className="field-row">
          <div className="field">
            <label className="label">Reg 14(1) — medical-procedure exception</label>
            <ComboBox
              options={[
                {value:'0', label:'Does not apply'},
                {value:'1', label:'Injury arose from medical examination / treatment'},
              ]}
              value={data.reg14_medical_procedure_exception ? '1' : '0'}
              onChange={v => onChange({ ...data, reg14_medical_procedure_exception: v === '1' })}
              placeholder="Select…"
            />
            <span className="helper">Excludes Reg 4/5/6(1) per Reg 14(1).</span>
          </div>
          <div className="field">
            <label className="label">Reg 14(3) — road-vehicle exception</label>
            <ComboBox
              options={[
                {value:'no', label:'No road-vehicle movement involved'},
                {value:'excluded', label:'Road vehicle — no Reg 14(3) carve-out applies (exclude Reg 4/5/6)'},
                {value:'carveout', label:'Road vehicle — but a Reg 14(3)(a)–(d) carve-out applies (still reportable)'},
              ]}
              value={(() => {
                if (data.reg14_3_road_vehicle_excluded === true) return 'excluded';
                if (data.reg14_3_road_vehicle === true) return 'carveout';
                return 'no';
              })()}
              onChange={v => {
                if (v === 'no') {
                  onChange({ ...data, reg14_3_road_vehicle: false, reg14_3_road_vehicle_excluded: false });
                } else if (v === 'excluded') {
                  onChange({ ...data, reg14_3_road_vehicle: true, reg14_3_road_vehicle_excluded: true });
                } else {
                  onChange({ ...data, reg14_3_road_vehicle: true, reg14_3_road_vehicle_excluded: false });
                }
              }}
              placeholder="Select…"
            />
            <span className="helper">Carve-outs: train accident, exposure to substance conveyed, loading/unloading, or work on/alongside a road.</span>
          </div>
        </div>

        <div className="field">
          <label className="label">Gas-related incident (Reg 11)</label>
          <ComboBox
            options={[
              {value:'none', label:'Not a Reg 11 gas incident'},
              {value:'flammable_gas_conveyor', label:'Reg 11(1) — fixed-pipe flammable-gas conveyor'},
              {value:'lpg_supplier', label:'Reg 11(1) — LPG filler / importer / supplier'},
              {value:'approved_person', label:'Reg 11(2) — approved person (Gas Safe registered)'},
            ]}
            value={data.gas_reporter_role || 'none'}
            onChange={v => {
              if (v === 'none') {
                onChange({ ...data, gas_reporter_role: undefined, gas_dangerous_fitting: false, gas_fitting_under_test: false, gas_previously_reported: false });
              } else {
                onChange({ ...data, gas_reporter_role: v });
              }
            }}
            placeholder="Select…"
          />
          <span className="helper">Set only when the reporting org has the Reg 11 role; outcome (death / LOC / hospitalisation) is read from the treatment fields above.</span>
        </div>

        {data.gas_reporter_role === 'approved_person' && (
          <div className="field-row">
            <div className="field">
              <label className="label">Dangerous gas fitting?</label>
              <ComboBox
                options={[
                  {value:'0', label:'No'},
                  {value:'1', label:'Yes — design / installation / servicing likely to cause death, LOC or hospitalisation'},
                ]}
                value={data.gas_dangerous_fitting ? '1' : '0'}
                onChange={v => onChange({ ...data, gas_dangerous_fitting: v === '1' })}
                placeholder="Select…"
              />
            </div>
            <div className="field">
              <label className="label">Reg 11(3) carve-outs</label>
              <ComboBox
                options={[
                  {value:'none', label:'Neither carve-out applies'},
                  {value:'under_test', label:'Fitting under test at a place set aside for that purpose — Reg 11(3)(b)'},
                  {value:'previously_reported', label:'Same information previously reported — Reg 11(3)(c)'},
                ]}
                value={data.gas_fitting_under_test ? 'under_test' : data.gas_previously_reported ? 'previously_reported' : 'none'}
                onChange={v => {
                  onChange({
                    ...data,
                    gas_fitting_under_test: v === 'under_test',
                    gas_previously_reported: v === 'previously_reported',
                  });
                }}
                placeholder="Select…"
              />
            </div>
          </div>
        )}
      </div>
      )}
    </>
  );
}
