import { useState } from 'react';
import Icon from '../../../components/shared/Icon';
import ComboBox from '../../../components/shared/ComboBox';
import SmartTextarea from '../../../components/shared/SmartTextarea';

export default function CloseModal({ incident, onCancel, onConfirm }) {
  const [reason, setReason] = useState('first-aid');
  const [notes, setNotes] = useState('');

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="close-modal-title">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="close-modal-title">Close — no action</div>
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
            <ComboBox
              options={[
                { value: 'first-aid', label: 'First-aid only — no recordable case' },
                { value: 'observation', label: 'Observation logged — no incident' },
                { value: 'duplicate', label: 'Duplicate of another report' },
                { value: 'not-work-related', label: 'Not work-related' },
                { value: 'superseded', label: 'Superseded by later report' },
                { value: 'resolved', label: 'Already resolved at scene' },
              ]}
              value={reason}
              onChange={setReason}
              searchable={false}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes <span className="optional">(optional)</span></label>
            <SmartTextarea
              value={notes}
              onChange={setNotes}
              rows={3}
              examples={['First aid administered on site, no further action needed.', 'Duplicate of INC-042, already under investigation.', 'Reviewed by supervisor — resolved at the scene before shift end.']}
              chips={['First aid only', 'Duplicate report', 'Resolved at scene']}
            />
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
