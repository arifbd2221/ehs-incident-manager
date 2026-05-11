// OverrideRequestModal.jsx — WI-B request creation modal.
//
// Generic across overridable fields. Today the only fields are:
//   - osha_recordable    (US-OSHA)
//   - riddor_reportable  (UK-RIDDOR)
//
// Boolean fields auto-derive the proposed value as the NOT of the current
// value (since flipping a boolean is the only meaningful change). The user
// just confirms direction and types a justification.

import { useState } from 'react';
import Icon from '../../../components/shared/Icon';
import { createOverrideRequest } from '../../../api/override_requests';

const FIELD_LABELS = {
  osha_recordable: {
    title: 'Request OSHA recordability override',
    jurisdiction: 'US-OSHA',
    valueLabels: { 1: 'Recordable', 0: 'Not recordable' },
    hint: 'Override requests separate the proposer from the approver. After you submit, an EHS Officer / EHS Manager / Admin (other than yourself) will approve or reject.',
  },
  riddor_reportable: {
    title: 'Request RIDDOR reportability override',
    jurisdiction: 'UK-RIDDOR',
    valueLabels: { 1: 'Reportable', 0: 'Not reportable' },
    hint: 'Override requests separate the proposer from the approver. After you submit, an EHS Officer / EHS Manager / Admin (other than yourself) will approve or reject.',
  },
};

export default function OverrideRequestModal({ incident, field, onCancel, onSubmitted }) {
  const meta = FIELD_LABELS[field];
  const currentValue = Number(incident[field] ?? 0);
  const proposedValue = currentValue === 1 ? 0 : 1;

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const valid = reason.trim().length >= 4 && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const created = await createOverrideRequest(incident.id, {
        field,
        proposed_value: proposedValue,
        reason: reason.trim(),
      });
      if (onSubmitted) onSubmitted(created);
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to create override request');
      setSubmitting(false);
    }
  };

  if (!meta) return null;

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="override-req-title">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="override-req-title">{meta.title}</div>
            <div className="idet-modal-sub">{incident.incident_number} · {meta.jurisdiction}</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">{meta.hint}</div>

          <div className="form-group">
            <label className="form-label">Proposed change</label>
            <div className="rv-summary" style={{ background: 'var(--sds-bg-surface-alt)', padding: 12, borderRadius: 8 }}>
              <span className="pill pill-gray">{meta.valueLabels[currentValue]}</span>
              {' → '}
              <span className="pill pill-info">{meta.valueLabels[proposedValue]}</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Justification <span className="req">*</span></label>
            <textarea
              className="form-textarea"
              rows={4}
              placeholder="What new evidence or judgment supports this change? e.g. HCP records confirm medical treatment beyond first aid, expected days away exceed threshold, etc."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            <span className="helper">Minimum 4 characters. Recorded in the audit log alongside your name and the decider's name.</span>
          </div>

          {error && <div className="rv-error">{error}</div>}
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button className="modal-confirm" disabled={!valid} onClick={submit}>
            <Icon name="shield" size={14}/>{submitting ? 'Submitting…' : 'Submit override request'}
          </button>
        </div>
      </div>
    </div>
  );
}
