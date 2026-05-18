import { useState } from 'react';
import Icon from '../../../components/shared/Icon';
import SmartTextarea from '../../../components/shared/SmartTextarea';

// UX-D: dual-purpose witness modal. Pass `witness` to edit; omit to add.
export default function WitnessModal({ incident, witness, onCancel, onConfirm }) {
  const isEdit = Boolean(witness);
  const [name, setName] = useState(witness?.name || '');
  const [contact, setContact] = useState(witness?.contact || '');
  const [statement, setStatement] = useState(witness?.statement || '');
  const [saving, setSaving] = useState(false);

  const valid = name.trim().length > 0 && (
    !isEdit || (
      name.trim() !== (witness.name || '') ||
      contact.trim() !== (witness.contact || '') ||
      statement.trim() !== (witness.statement || '')
    )
  );

  const submit = async () => {
    setSaving(true);
    try {
      await onConfirm({
        name: name.trim(),
        contact: contact.trim() || null,
        statement: statement.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="witness-modal-title">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="witness-modal-title">{isEdit ? 'Edit witness' : 'Add witness'}</div>
            <div className="idet-modal-sub">{incident.incident_number} · {isEdit ? 'updates the existing record' : 'adds a new statement to the incident'}</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">
            Capture the witness's account in their own words. Name is required; contact and statement are optional but recommended for follow-up.
          </div>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={name} autoFocus onChange={e => setName(e.target.value)} placeholder="Full name"/>
          </div>
          <div className="form-group">
            <label className="form-label">Contact <span className="optional">(optional)</span></label>
            <input className="form-input" value={contact} onChange={e => setContact(e.target.value)} placeholder="Email or phone"/>
          </div>
          <div className="form-group">
            <label className="form-label">Statement <span className="optional">(optional)</span></label>
            <SmartTextarea
              value={statement}
              onChange={setStatement}
              rows={4}
              inputClassName="form-textarea"
              placeholder="What did they observe?"
            />
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="modal-confirm" disabled={!valid || saving} onClick={submit}>
            <Icon name={isEdit ? 'edit' : 'plus'} size={14}/>{saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add witness')}
          </button>
        </div>
      </div>
    </div>
  );
}
