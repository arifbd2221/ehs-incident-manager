import { useState } from 'react';
import Icon from '../../../components/shared/Icon';
import SmartTextarea from '../../../components/shared/SmartTextarea';

export default function CloseInvestigationModal({ investigation, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="close-inv-modal-title">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title" id="close-inv-modal-title">Close investigation</div>
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
            <SmartTextarea
              value={reason}
              onChange={setReason}
              rows={3}
              examples={['Root cause addressed by existing control; no further action required.', 'Investigation findings show incident was non-work-related per OSHA criteria.', 'Duplicate investigation — findings consolidated into INV-023.']}
              chips={['Existing controls sufficient', 'Non-work-related', 'Consolidated into another INV']}
            />
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
