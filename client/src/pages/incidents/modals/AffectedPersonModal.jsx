import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import DatePicker from '../../../components/shared/DatePicker';
import {
  createAffectedPerson,
  updateAffectedPerson,
  createInjury,
  updateInjury,
} from '../../../api/incidents';
import { getUsers } from '../../../api/users';
import { showField } from '../../../utils/frameworks';

const EMPLOYMENT_STATUSES = [
  { value: 'employee', label: 'Employee', icon: 'person', desc: 'Full-time or part-time worker' },
  { value: 'contractor', label: 'Contractor', icon: 'gear', desc: 'External contractor' },
  { value: 'labour_hire', label: 'Labour hire', icon: 'people', desc: 'Agency worker' },
  { value: 'volunteer', label: 'Volunteer', icon: 'pulse', desc: 'Unpaid volunteer' },
  { value: 'visitor', label: 'Visitor', icon: 'eye', desc: 'Site visitor' },
  { value: 'member_of_public', label: 'Public', icon: 'location', desc: 'Member of the public' },
  { value: 'self_employed', label: 'Self-employed', icon: 'person', desc: 'Independent worker' },
];

const BLANK_FORM = {
  name: '', job_title: '', email: '', phone: '', dob: '', gender: '',
  employment_status: 'employee', is_primary: false, is_privacy_case: false,
  body_part: '', injury_type: '', mechanism: '', treatment: '',
  er_treated: false, hospitalized: false, days_away: 0,
};

export default function AffectedPersonModal({
  open, incident, person, jurisdiction,
  showAllRegulatoryFields = true,
  onClose, onSaved, onCollect,
}) {
  const isEdit = !!person;
  const see = (key) => {
    if (jurisdiction === undefined) return true;
    return showField(key, jurisdiction, showAllRegulatoryFields);
  };
  const [step, setStep] = useState(0);
  const [stepDir, setStepDir] = useState('forward');
  const [isEmployee, setIsEmployee] = useState('yes');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [form, setForm] = useState(BLANK_FORM);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      if (isEdit && person) {
        const inj = (person.injuries || []).find(i => !i.deleted_at) || {};
        setForm({
          name: person.name || '', job_title: person.job_title || '',
          email: person.email || '', phone: person.phone || '',
          dob: person.dob || '', gender: person.gender || '',
          employment_status: person.employment_status || 'employee',
          is_primary: person.is_primary === 1,
          is_privacy_case: person.is_privacy_case === 1,
          body_part: inj.body_part || '', injury_type: inj.injury_type || '',
          mechanism: inj.mechanism || '', treatment: inj.treatment || '',
          er_treated: inj.er_treated === 1, hospitalized: inj.hospitalized === 1,
          days_away: inj.days_away || 0,
        });
        setIsEmployee('no');
        setStep(0);
      } else {
        setIsEmployee('yes');
        setForm(BLANK_FORM);
        setStep(0);
      }
      setSelectedUserId('');
      setError(null);
      setStepDir('forward');
      getUsers().then(setUsers).catch(() => setUsers([]));
    }
  }, [open]);

  useEffect(() => {
    setForm(f => ({
      ...f,
      employment_status: isEmployee === 'yes' ? 'employee' : 'visitor',
    }));
    if (isEmployee === 'no') setSelectedUserId('');
  }, [isEmployee]);

  const userOptions = useMemo(() => users.map(u => ({
    value: String(u.id),
    label: `${u.name}${u.job_title ? ` — ${u.job_title}` : ''}${u.email ? ` (${u.email})` : ''}`,
    _user: u,
  })), [users]);

  const handleUserPick = (val) => {
    setSelectedUserId(val);
    const u = users.find(x => String(x.id) === String(val));
    if (u) setForm(f => ({ ...f, name: u.name || '', job_title: u.job_title || '', email: u.email || '' }));
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const goNext = () => { setStepDir('forward'); setStep(1); };
  const goBack = () => { setStepDir('back'); setStep(0); };

  if (!open) return null;

  const canProceed = form.name.trim();
  const hasInjury = hasAnyInjuryField(form);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        job_title: form.job_title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        dob: form.dob || null,
        gender: form.gender.trim() || null,
        employment_status: form.employment_status,
        is_primary: form.is_primary,
        is_privacy_case: form.is_privacy_case,
        injuries: hasInjury ? [{
          body_part: form.body_part.trim() || null,
          injury_type: form.injury_type.trim() || null,
          mechanism: form.mechanism.trim() || null,
          treatment: form.treatment.trim() || null,
          er_treated: form.er_treated,
          hospitalized: form.hospitalized,
          days_away: Number(form.days_away) || 0,
        }] : [],
      };
      if (onCollect) {
        onCollect(payload);
        onClose?.();
      } else if (isEdit) {
        const apPatch = { ...payload };
        const injPatch = apPatch.injuries?.[0];
        delete apPatch.injuries;
        await updateAffectedPerson(incident.id, person.id, apPatch);
        if (injPatch) {
          const existingInj = (person.injuries || []).find(i => !i.deleted_at);
          if (existingInj) await updateInjury(incident.id, person.id, existingInj.id, injPatch);
          else if (hasInjury) await createInjury(incident.id, person.id, injPatch);
        }
        onSaved?.();
        onClose?.();
      } else {
        await createAffectedPerson(incident.id, payload);
        onSaved?.();
        onClose?.();
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to add person.');
    } finally {
      setSaving(false);
    }
  };

  const statusObj = EMPLOYMENT_STATUSES.find(s => s.value === form.employment_status) || EMPLOYMENT_STATUSES[0];

  return createPortal(
    <div className="modal-backdrop" style={{ zIndex: 'var(--sds-z-toast)' }} onClick={onClose}>
      <div className="modal afp-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">
              <Icon name="person" size={20} color="var(--sds-brand-primary)" />
              {isEdit ? 'Edit Affected Person' : 'Add Affected Person'}
            </div>
            <div className="modal-sub">
              {incident?.incident_number ? `Incident ${incident.incident_number}` : 'New incident — staged before submit'}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="afp-steps">
          <div className={`afp-step ${step === 0 ? 'active' : 'done'}`} onClick={() => step === 1 && goBack()}>
            <div className="afp-step-dot">{step > 0 ? <Icon name="check" size={12} /> : '1'}</div>
            <span>Person details</span>
          </div>
          <div className="afp-step-line" />
          <div className={`afp-step ${step === 1 ? 'active' : ''}`}>
            <div className="afp-step-dot">2</div>
            <span>Injury info</span>
          </div>
        </div>

        <div className="modal-body afp-body">
          {error && (
            <div className="afp-error">
              <Icon name="warning" size={14} /> {error}
            </div>
          )}

          {/* ─── Step 0: Person details ─── */}
          <div className={`afp-panel ${step === 0 ? 'afp-panel-active' : 'afp-panel-exit'}`}
            style={{ display: step === 0 ? undefined : 'none' }}>

            {/* Employee toggle cards */}
            {!isEdit && (
              <div className="afp-section">
                <div className="afp-section-label">
                  <Icon name="people" size={14} /> Person type
                </div>
                <div className="afp-toggle-row">
                  <button
                    className={`afp-toggle-card ${isEmployee === 'yes' ? 'selected' : ''}`}
                    onClick={() => setIsEmployee('yes')}
                    type="button"
                  >
                    <div className="afp-toggle-icon">
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="8" fill="rgba(98,109,249,0.08)" />
                        <circle cx="16" cy="12" r="4" fill="var(--sds-brand-primary)" opacity="0.7" />
                        <path d="M8 24c0-3 3.5-5 8-5s8 2 8 5" stroke="var(--sds-brand-primary)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                        <rect x="20" y="8" width="6" height="1.5" rx="0.75" fill="var(--sds-brand-primary)" opacity="0.5" />
                        <rect x="20" y="11" width="4" height="1.5" rx="0.75" fill="var(--sds-brand-primary)" opacity="0.3" />
                      </svg>
                    </div>
                    <div className="afp-toggle-text">
                      <strong>Employee</strong>
                      <span>Pick from your team</span>
                    </div>
                    {isEmployee === 'yes' && <div className="afp-toggle-check"><Icon name="check" size={14} /></div>}
                  </button>
                  <button
                    className={`afp-toggle-card ${isEmployee === 'no' ? 'selected' : ''}`}
                    onClick={() => setIsEmployee('no')}
                    type="button"
                  >
                    <div className="afp-toggle-icon">
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="8" fill="rgba(98,109,249,0.08)" />
                        <circle cx="16" cy="12" r="4" stroke="var(--sds-fg-tertiary)" strokeWidth="1.5" fill="none" strokeDasharray="2 2" />
                        <path d="M8 24c0-3 3.5-5 8-5s8 2 8 5" stroke="var(--sds-fg-tertiary)" strokeWidth="1.5" strokeLinecap="round" fill="none" strokeDasharray="3 3" />
                        <path d="M22 11l4 4M26 11l-4 4" stroke="var(--sds-fg-tertiary)" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="afp-toggle-text">
                      <strong>Non-employee</strong>
                      <span>Enter details manually</span>
                    </div>
                    {isEmployee === 'no' && <div className="afp-toggle-check"><Icon name="check" size={14} /></div>}
                  </button>
                </div>
              </div>
            )}

            {/* Employee picker */}
            {isEmployee === 'yes' && !isEdit && (
              <div className="afp-section afp-fade-in">
                <div className="afp-section-label">
                  <Icon name="search" size={14} /> Find employee
                </div>
                <ComboBox
                  options={userOptions}
                  value={selectedUserId}
                  onChange={handleUserPick}
                  placeholder="Search by name, title, or email..."
                  clearable
                />
                <span className="helper">Selecting auto-fills name, title, and email.</span>
              </div>
            )}

            {/* Identity fields */}
            <div className="afp-section afp-fade-in" style={{ animationDelay: '50ms' }}>
              <div className="afp-section-label">
                <Icon name="person" size={14} /> Identity
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Full name <span className="req">*</span></label>
                  <input className="input" value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Jane Smith" />
                </div>
                <div className="field">
                  <label className="label">Job title</label>
                  <input className="input" value={form.job_title} onChange={e => setField('job_title', e.target.value)} placeholder="e.g. Machine Operator" />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Employment status</label>
                  <div className="afp-status-grid">
                    {EMPLOYMENT_STATUSES.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        className={`afp-status-chip ${form.employment_status === s.value ? 'selected' : ''}`}
                        onClick={() => setField('employment_status', s.value)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {see('injured_dob') && (
                  <div className="field">
                    <label className="label">Date of birth</label>
                    <DatePicker value={form.dob} onChange={v => setField('dob', v)} />
                  </div>
                )}
              </div>
            </div>

            {/* Contact fields */}
            <div className="afp-section afp-fade-in" style={{ animationDelay: '100ms' }}>
              <div className="afp-section-label">
                <Icon name="phone" size={14} /> Contact
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="name@company.com" />
                </div>
                {see('injured_phone') && (
                  <div className="field">
                    <label className="label">Phone</label>
                    <input className="input" value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
                  </div>
                )}
              </div>
            </div>

            {/* Regulatory options */}
            <div className="afp-section afp-fade-in" style={{ animationDelay: '150ms' }}>
              <div className="afp-section-label">
                <Icon name="shield" size={14} /> Regulatory
              </div>
              <div className="afp-check-row">
                <label className={`afp-checkbox ${form.is_primary ? 'checked' : ''}`}>
                  <input type="checkbox" checked={form.is_primary} onChange={e => setField('is_primary', e.target.checked)} />
                  <span className="afp-check-box"><Icon name="check" size={11} /></span>
                  <div>
                    <strong>Primary person</strong>
                    <span>Listed first on OSHA 301 / RIDDOR F2508</span>
                  </div>
                </label>
                <label className={`afp-checkbox ${form.is_privacy_case ? 'checked' : ''}`}>
                  <input type="checkbox" checked={form.is_privacy_case} onChange={e => setField('is_privacy_case', e.target.checked)} />
                  <span className="afp-check-box"><Icon name="check" size={11} /></span>
                  <div>
                    <strong>Privacy concern</strong>
                    <span>Name suppressed on OSHA 300 log (1904.29)</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* ─── Step 1: Injury details ─── */}
          <div className={`afp-panel ${step === 1 ? 'afp-panel-active' : ''}`}
            style={{ display: step === 1 ? undefined : 'none' }}>

            <div className="afp-injury-hero">
              <svg className="afp-injury-illustration" width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="30" fill="rgba(98,109,249,0.06)" stroke="rgba(98,109,249,0.15)" strokeWidth="1" />
                <circle cx="32" cy="22" r="8" fill="rgba(98,109,249,0.12)" />
                <path d="M18 48c0-6 6-10 14-10s14 4 14 10" stroke="var(--sds-brand-primary)" strokeWidth="1.5" fill="none" opacity="0.3" />
                <circle cx="42" cy="18" r="6" fill="rgba(237,108,2,0.12)" stroke="var(--sds-warning)" strokeWidth="1" />
                <path d="M42 15v4M42 21v1" stroke="var(--sds-warning)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div>
                <div className="afp-injury-hero-name">{form.name || 'Unnamed person'}</div>
                <div className="afp-injury-hero-sub">
                  <span className={`pill pill-${statusObj.value === 'employee' ? 'info' : 'gray'}`} style={{ fontSize: 10 }}>{statusObj.label}</span>
                  {form.job_title && <span style={{ color: 'var(--sds-fg-tertiary)', fontSize: 12 }}>{form.job_title}</span>}
                </div>
              </div>
            </div>

            <div className="afp-section afp-fade-in">
              <div className="afp-section-label">
                <Icon name="warning" size={14} /> Injury details
                <span className="afp-optional-tag">Optional</span>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Body part</label>
                  <input className="input" value={form.body_part} onChange={e => setField('body_part', e.target.value)} placeholder="e.g. Right hand, Left forearm" />
                </div>
                <div className="field">
                  <label className="label">Injury type</label>
                  <input className="input" value={form.injury_type} onChange={e => setField('injury_type', e.target.value)} placeholder="e.g. Laceration, Burn, Sprain" />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Mechanism</label>
                  <input className="input" value={form.mechanism} onChange={e => setField('mechanism', e.target.value)} placeholder="How did the injury happen?" />
                </div>
                <div className="field">
                  <label className="label">Treatment</label>
                  <input className="input" value={form.treatment} onChange={e => setField('treatment', e.target.value)} placeholder="e.g. First aid, Medical treatment" />
                </div>
              </div>
            </div>

            <div className="afp-section afp-fade-in" style={{ animationDelay: '50ms' }}>
              <div className="afp-section-label">
                <Icon name="pulse" size={14} /> Severity indicators
              </div>
              <div className="afp-severity-cards">
                <label className={`afp-sev-card ${form.er_treated ? 'active sev-warn' : ''}`}>
                  <input type="checkbox" checked={form.er_treated} onChange={e => setField('er_treated', e.target.checked)} />
                  <div className="afp-sev-icon">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <rect width="28" height="28" rx="8" fill="currentColor" opacity="0.08" />
                      <path d="M14 7v6M11 13h6M14 13v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <strong>ER treated</strong>
                  <span>Emergency room visit</span>
                </label>
                <label className={`afp-sev-card ${form.hospitalized ? 'active sev-err' : ''}`}>
                  <input type="checkbox" checked={form.hospitalized} onChange={e => setField('hospitalized', e.target.checked)} />
                  <div className="afp-sev-icon">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <rect width="28" height="28" rx="8" fill="currentColor" opacity="0.08" />
                      <rect x="8" y="10" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <path d="M11 10V8a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <circle cx="14" cy="14.5" r="1.5" fill="currentColor" />
                    </svg>
                  </div>
                  <strong>Hospitalized</strong>
                  <span>Inpatient overnight</span>
                </label>
                <div className="afp-days-card">
                  <div className="afp-sev-icon">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <rect width="28" height="28" rx="8" fill="rgba(98,109,249,0.08)" />
                      <circle cx="14" cy="14" r="7" stroke="var(--sds-brand-primary)" strokeWidth="1.5" fill="none" />
                      <path d="M14 10v5l3 2" stroke="var(--sds-brand-primary)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <strong>Days away</strong>
                    <span>From work</span>
                  </div>
                  <input className="input afp-days-input" type="number" min="0" value={form.days_away}
                    onChange={e => setField('days_away', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-f afp-footer">
          {step === 0 ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={goNext} disabled={!canProceed}>
                Continue <Icon name="arrow" size={14} />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={goBack} disabled={saving}>
                <Icon name="arrowL" size={14} /> Back
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save changes' : 'Add person')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function hasAnyInjuryField(form) {
  return !!(form.body_part || form.injury_type || form.mechanism || form.treatment
    || form.er_treated || form.hospitalized || Number(form.days_away) > 0);
}
