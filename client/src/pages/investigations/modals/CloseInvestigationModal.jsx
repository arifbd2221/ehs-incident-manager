import { useState } from 'react';
import Icon from '../../../components/shared/Icon';

export default function CloseInvestigationModal({ investigation, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title">Close investigation</div>
            <div className="idet-modal-sub">{investigation.investigation_number} · no CAPA required</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>
        <div className="idet-modal-body">
          <div className="modal-hint">
            The investigation will be marked closed and findings archived. No corrective or preventive actions will be tracked.
          </div>
          <div className="form-group">
            <label className="form-label">Closure reason <span className="optional">(optional)</span></label>
            <textarea className="form-textarea" rows={3} placeholder="e.g. Root cause addressed by existing control; no further action required." value={reason} onChange={e => setReason(e.target.value)}/>
          </div>
        </div>
        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" onClick={() => onConfirm({ reason })}>
            <Icon name="check" size={14}/>Close investigation
          </button>
        </div>
      </div>
    </div>
  );
}
