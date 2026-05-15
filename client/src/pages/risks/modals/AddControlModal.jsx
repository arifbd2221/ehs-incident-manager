import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/shared/Icon';
import SmartTextarea from '../../../components/shared/SmartTextarea';
import { addControl } from '../../../api/risks';

const CONTROL_TYPES = [
  { id: 'elimination', label: 'Elim.', rank: 1 },
  { id: 'substitution', label: 'Subst.', rank: 2 },
  { id: 'engineering', label: 'Eng.', rank: 3 },
  { id: 'administrative', label: 'Admin.', rank: 4 },
  { id: 'ppe', label: 'PPE', rank: 5 },
];

export default function AddControlModal({ riskId, riskNumber, onCancel, onAdded }) {
  const [title, setTitle] = useState('');
  const [controlType, setControlType] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = title.trim() && controlType && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const ctrl = await addControl(riskId, {
        title: title.trim(),
        control_type: controlType,
        description: description || undefined,
        notes: notes || undefined,
      });
      onAdded(ctrl);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to add control');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Add Control Measure</div>
            <div className="modal-sub">{riskNumber} — Hierarchy of Controls</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="label">Control Type <span className="req">*</span></label>
            <div className="actl-type-grid">
              {CONTROL_TYPES.map(ct => (
                <button
                  key={ct.id}
                  type="button"
                  data-type={ct.id}
                  className={`actl-type-btn ${controlType === ct.id ? 'selected' : ''}`}
                  onClick={() => setControlType(ct.id)}
                >
                  <div className="actl-type-rank">{ct.rank}</div>
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="label">Title <span className="req">*</span></label>
            <SmartTextarea multiline={false} placeholder="Describe the control measure..." value={title} onChange={setTitle} />
          </div>

          <div className="field">
            <label className="label">Description</label>
            <SmartTextarea rows={3} placeholder="Implementation details..." value={description} onChange={setDescription} />
          </div>

          <div className="field">
            <label className="label">Notes</label>
            <SmartTextarea rows={2} placeholder="Additional notes..." value={notes} onChange={setNotes} />
          </div>

          {error && <div style={{ color: 'var(--sds-error)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Adding...' : 'Add Control'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
