import { useState } from 'react';
import Icon from '../../../components/shared/Icon';

export default function CloseModal({ incident, onCancel, onConfirm }) {
  const [reason, setReason] = useState('first-aid');
  const [notes, setNotes] = useState('');

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title">Close — no action</div>
            <div className="idet-modal-sub">{incident.incident_number} · log only, no investigation</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">
            Use this when the incident is logged for the record but does not warrant an investigation — e.g. first-aid only, observation, or duplicate report.
          </div>
          <div className="form-group">
            <label className="form-label">Closure reason</label>
            <select className="form-select" value={reason} onChange={e => setReason(e.target.value)}>
              <option value="first-aid">First-aid only — no recordable case</option>
              <option value="observation">Observation logged — no incident</option>
              <option value="duplicate">Duplicate of another report</option>
              <option value="not-work-related">Not work-related</option>
              <option value="superseded">Superseded by later report</option>
              <option value="resolved">Already resolved at scene</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Notes <span className="optional">(optional)</span></label>
            <textarea className="form-textarea" rows={3} placeholder="Anything that explains the close." value={notes} onChange={e => setNotes(e.target.value)}/>
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" onClick={() => onConfirm({ reason, notes })}>
            <Icon name="check" size={14}/>Close incident
          </button>
        </div>
      </div>
    </div>
  );
}
