// AffectedPersonModal.jsx — WI-A follow-up: add an affected person + one
// injury to an existing incident.
//
// Two intake paths:
//   - Employee: ComboBox over the org user list; selection auto-fills
//     name + job_title + email. employment_status defaults to 'employee'.
//   - Non-employee: free-form fields. employment_status defaults to
//     'visitor' but the picker exposes all 7 PRD values.
//
// Submit calls createAffectedPerson(incidentId, payload) with one nested
// injury row. Edit + delete UI is deferred — the route layer already
// supports it; this modal only handles add for now.

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import { createAffectedPerson } from '../../../api/incidents';
import { getUsers } from '../../../api/users';

const EMPLOYMENT_STATUSES = [
  { value: 'employee', label: 'Employee' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'labour_hire', label: 'Labour hire' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'visitor', label: 'Visitor' },
  { value: 'member_of_public', label: 'Member of public' },
  { value: 'self_employed', label: 'Self-employed' },
];

const BLANK_FORM = {
  name: '',
  job_title: '',
  email: '',
  phone: '',
  dob: '',
  gender: '',
  employment_status: 'employee',
  is_primary: false,
  is_privacy_case: false,
  // Injury
  body_part: '',
  injury_type: '',
  mechanism: '',
  treatment: '',
  er_treated: false,
  hospitalized: false,
  days_away: 0,
};

export default function AffectedPersonModal({ open, incident, onClose, onSaved }) {
  const [isEmployee, setIsEmployee] = useState('yes'); // 'yes' | 'no'
  const [selectedUserId, setSelectedUserId] = useState('');
  const [form, setForm] = useState(BLANK_FORM);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset state when the modal opens/closes.
  useEffect(() => {
    if (open) {
      setIsEmployee('yes');
      setSelectedUserId('');
      setForm(BLANK_FORM);
      setError(null);
      // Lazy-load user list once per open.
      getUsers().then(setUsers).catch(() => setUsers([]));
    }
  }, [open]);

  // When isEmployee flips, set a sensible default status.
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
    if (u) {
      setForm(f => ({
        ...f,
        name: u.name || '',
        job_title: u.job_title || '',
        email: u.email || '',
      }));
    }
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
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
        injuries: hasAnyInjuryField(form) ? [{
          body_part: form.body_part.trim() || null,
          injury_type: form.injury_type.trim() || null,
          mechanism: form.mechanism.trim() || null,
          treatment: form.treatment.trim() || null,
          er_treated: form.er_treated,
          hospitalized: form.hospitalized,
          days_away: Number(form.days_away) || 0,
        }] : [],
      };
      await createAffectedPerson(incident.id, payload);
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to add person.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Add affected person</div>
            <div className="modal-sub">Incident {incident.incident_number}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18}/>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="pill pill-err">{error}</div>}

            <div className="field">
              <label className="label">Is this person an employee?</label>
              <div>
                <label>
                  <input type="radio" name="isEmployee" value="yes"
                    checked={isEmployee === 'yes'}
                    onChange={() => setIsEmployee('yes')} /> Yes — pick from employee list
                </label>
              </div>
              <div>
                <label>
                  <input type="radio" name="isEmployee" value="no"
                    checked={isEmployee === 'no'}
                    onChange={() => setIsEmployee('no')} /> No — enter details manually
                </label>
              </div>
            </div>

            {isEmployee === 'yes' && (
              <div className="field">
                <label className="label">Employee</label>
                <ComboBox
                  options={userOptions}
                  value={selectedUserId}
                  onChange={handleUserPick}
                  placeholder="Search employees…"
                  clearable
                />
                <span className="helper">Selecting an employee fills name, job title, and email below.</span>
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <label className="label">Name <span className="req">*</span></label>
                <input className="input" value={form.name} onChange={e => setField('name', e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Job title</label>
                <input className="input" value={form.job_title} onChange={e => setField('job_title', e.target.value)} />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="label">Employment status</label>
                <select className="select" value={form.employment_status} onChange={e => setField('employment_status', e.target.value)}>
                  {EMPLOYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Date of birth</label>
                <input className="input" type="date" value={form.dob} onChange={e => setField('dob', e.target.value)} />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setField('email', e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={e => setField('phone', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>
                <input type="checkbox" checked={form.is_primary}
                  onChange={e => setField('is_primary', e.target.checked)} /> Make this person the primary (OSHA 301 / RIDDOR F2508 will list this one first)
              </label>
            </div>
            <div className="field">
              <label>
                <input type="checkbox" checked={form.is_privacy_case}
                  onChange={e => setField('is_privacy_case', e.target.checked)} /> Privacy concern case (OSHA 1904.29(b)(7) — name suppressed on 300 log)
              </label>
            </div>

            <hr/>

            <div className="modal-sub" style={{ marginBottom: 8 }}>Injury details (optional)</div>

            <div className="field-row">
              <div className="field">
                <label className="label">Body part</label>
                <input className="input" value={form.body_part} onChange={e => setField('body_part', e.target.value)} placeholder="e.g. r_hand, l_forearm" />
              </div>
              <div className="field">
                <label className="label">Injury type</label>
                <input className="input" value={form.injury_type} onChange={e => setField('injury_type', e.target.value)} placeholder="e.g. Laceration, Burn" />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="label">Mechanism</label>
                <input className="input" value={form.mechanism} onChange={e => setField('mechanism', e.target.value)} placeholder="how the injury occurred" />
              </div>
              <div className="field">
                <label className="label">Treatment</label>
                <input className="input" value={form.treatment} onChange={e => setField('treatment', e.target.value)} placeholder="e.g. First aid, Medical treatment" />
              </div>
            </div>

            <div className="field-row-3">
              <div className="field">
                <label>
                  <input type="checkbox" checked={form.er_treated}
                    onChange={e => setField('er_treated', e.target.checked)} /> ER treated
                </label>
              </div>
              <div className="field">
                <label>
                  <input type="checkbox" checked={form.hospitalized}
                    onChange={e => setField('hospitalized', e.target.checked)} /> Hospitalized
                </label>
              </div>
              <div className="field">
                <label className="label">Days away</label>
                <input className="input" type="number" min="0" value={form.days_away}
                  onChange={e => setField('days_away', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="modal-f">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add person'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function hasAnyInjuryField(form) {
  return !!(form.body_part || form.injury_type || form.mechanism || form.treatment
    || form.er_treated || form.hospitalized || Number(form.days_away) > 0);
}
