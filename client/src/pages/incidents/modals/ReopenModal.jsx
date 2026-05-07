import { useState } from 'react';
import Icon from '../../../components/shared/Icon';
import SmartTextarea from '../../../components/shared/SmartTextarea';

export default function ReopenModal({ incident, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try { await onConfirm({ reason }); } finally { setSubmitting(false); }
  };

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title">Reopen incident</div>
            <div className="idet-modal-sub">{incident.incident_number} · currently Closed</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>

        <div className="idet-modal-body">
          <div className="modal-hint" style={{ marginBottom: 16 }}>
            Reopening will clear the closure record and return this incident to active status. All prior closure data is preserved in the activity log.
          </div>
          <div className="form-group">
            <label className="form-label">Reason for reopening <span className="req">*</span></label>
            <SmartTextarea value={reason} onChange={setReason} rows={3}
              examples={['New witness information contradicts original findings.', 'Additional injuries reported after initial closure.']}
              chips={['New evidence found', 'Recurrence detected', 'Regulatory request']}/>
          </div>
        </div>

        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-confirm" onClick={handleConfirm} disabled={submitting || reason.trim().length < 10}>
            <Icon name="edit" size={14}/>{submitting ? 'Reopening...' : 'Reopen incident'}
          </button>
        </div>
      </div>
    </div>
  );
}
