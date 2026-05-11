// WorkHoursModal.jsx — Add or Edit a single work_hours period.
//
// Reused by SiteDetail.jsx. Rendered through createPortal so the parent
// page's `.page` transform doesn't break position:fixed (per CLAUDE.md).
//
// Mode is implicit: pass `existing` to edit, omit it (or null) to create.
// On Add when prior periods exist, fields pre-fill from the most-recent
// period — period_start = its period_end, period_end = period_start + same
// duration. UX win that VelocityEHS / EcoOnline ship for monthly entry.
//
// Backend errors are surfaced verbatim so the BE remains the single source
// of validation truth (UNIQUE collision messaging, ISO-date errors, etc.).

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/shared/Icon';
import DatePicker from '../../components/shared/DatePicker';
import { createWorkHours, updateWorkHours } from '../../api/workHours';

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startIso, endIso) {
  const a = new Date(startIso + 'T00:00:00Z').getTime();
  const b = new Date(endIso + 'T00:00:00Z').getTime();
  return Math.max(1, Math.round((b - a) / 86400000));
}

function buildInitialFromLatest(latest) {
  if (!latest) {
    return {
      period_start: '', period_end: '',
      hours_worked: '', avg_employees: '',
      contractor_hours_worked: '', contractor_avg_employees: '',
      notes: '',
    };
  }
  const len = daysBetween(latest.period_start, latest.period_end);
  const next_start = latest.period_end;
  const next_end = addDays(next_start, len);
  return {
    period_start: next_start,
    period_end: next_end,
    hours_worked: latest.hours_worked ?? '',
    avg_employees: latest.avg_employees ?? '',
    contractor_hours_worked: latest.contractor_hours_worked ?? '',
    contractor_avg_employees: latest.contractor_avg_employees ?? '',
    notes: '',
  };
}

export default function WorkHoursModal({ siteId, siteName, existing, latest, onClose, onSaved }) {
  const isEdit = Boolean(existing);

  const [form, setForm] = useState(() => {
    if (isEdit) {
      return {
        period_start: existing.period_start || '',
        period_end: existing.period_end || '',
        hours_worked: existing.hours_worked ?? '',
        avg_employees: existing.avg_employees ?? '',
        contractor_hours_worked: existing.contractor_hours_worked ?? '',
        contractor_avg_employees: existing.contractor_avg_employees ?? '',
        notes: existing.notes || '',
      };
    }
    return buildInitialFromLatest(latest);
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const payload = {
        period_start: form.period_start,
        period_end: form.period_end,
        hours_worked: form.hours_worked === '' ? null : Number(form.hours_worked),
        avg_employees: form.avg_employees === '' ? null : Number(form.avg_employees),
        contractor_hours_worked: form.contractor_hours_worked === '' ? null : Number(form.contractor_hours_worked),
        contractor_avg_employees: form.contractor_avg_employees === '' ? null : Number(form.contractor_avg_employees),
        notes: form.notes,
      };
      let saved;
      if (isEdit) {
        saved = await updateWorkHours(existing.id, payload);
      } else {
        saved = await createWorkHours({ ...payload, site_id: siteId });
      }
      onSaved(saved);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Failed to save');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={() => !saving && onClose()}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="modal-h">
            <div>
              <div className="modal-title">{isEdit ? 'Edit work hours' : 'Add work hours'}</div>
              <div className="modal-sub">{siteName}</div>
            </div>
            <button type="button" className="icon-btn" onClick={() => !saving && onClose()} aria-label="Close">
              <Icon name="close" size={18} />
            </button>
          </div>

          <div className="modal-body">
            {err && (
              <div style={{ color: 'var(--sds-error)', fontSize: 13, marginBottom: 12 }}>
                {err}
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <label className="label">Period start <span className="req">*</span></label>
                <DatePicker value={form.period_start} onChange={v => setField('period_start', v)} placeholder="Select start date" />
              </div>
              <div className="field">
                <label className="label">Period end <span className="req">*</span></label>
                <DatePicker value={form.period_end} onChange={v => setField('period_end', v)} placeholder="Select end date" />
                <span className="helper">First day of the next period (exclusive end).</span>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="label">Employee hours <span className="req">*</span></label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={form.hours_worked}
                  onChange={e => setField('hours_worked', e.target.value)}
                  placeholder="e.g. 42500"
                  required
                />
                <span className="helper">Total clock hours, employees only (OSHA TRIR denominator).</span>
              </div>
              <div className="field">
                <label className="label">Avg. employees</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={form.avg_employees}
                  onChange={e => setField('avg_employees', e.target.value)}
                  placeholder="e.g. 250"
                />
                <span className="helper">Average headcount during the period.</span>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="label">Contractor hours</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={form.contractor_hours_worked}
                  onChange={e => setField('contractor_hours_worked', e.target.value)}
                  placeholder="optional"
                />
                <span className="helper">Required for ISO 45001; not blended into TRIR.</span>
              </div>
              <div className="field">
                <label className="label">Avg. contractors</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={form.contractor_avg_employees}
                  onChange={e => setField('contractor_avg_employees', e.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Notes</label>
              <textarea
                className="textarea"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Optional context — e.g. plant shutdown, headcount change"
                rows={2}
              />
            </div>
          </div>

          <div className="modal-f">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add period'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
