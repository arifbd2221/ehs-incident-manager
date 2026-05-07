import { useState } from 'react';
import Icon from '../../../components/shared/Icon';
import SmartTextarea from '../../../components/shared/SmartTextarea';

export default function ClosureApprovalModal({ incident, closureRequest, onCancel, onApprove, onReject }) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try { await onApprove(closureRequest.id, { notes }); } finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try { await onReject(closureRequest.id, { notes }); } finally { setSubmitting(false); }
  };

  return (
    <div className="idet-modal-backdrop" onClick={onCancel}>
      <div className="idet-modal idet-modal-lg" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="idet-modal-header">
          <div>
            <div className="idet-modal-title">Review closure request</div>
            <div className="idet-modal-sub">{incident.incident_number} · Track A</div>
          </div>
          <button className="idet-modal-close" onClick={onCancel}><Icon name="close" size={16}/></button>
        </div>

        <div className="idet-modal-body">
          <div className="closure-review-section">
            <label className="form-label">Closure summary</label>
            <div className="closure-review-text">{closureRequest.closure_summary}</div>
          </div>

          <div className="closure-review-section">
            <label className="form-label">Lessons learned</label>
            <div className="closure-review-text">{closureRequest.lessons_learned}</div>
          </div>

          <div className="form-group">
            <label className="form-label">Review notes <span className="optional">(required for rejection)</span></label>
            <SmartTextarea value={notes} onChange={setNotes} rows={3}
              examples={['Approved — all corrective actions look effective.', 'Needs additional evidence of training completion.']}
              chips={['Approved as submitted', 'Needs revision']}/>
          </div>
        </div>

        <div className="idet-modal-footer">
          <button className="modal-cancel" onClick={onCancel}>Cancel</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="modal-reject" onClick={handleReject} disabled={submitting || !notes.trim()}>
              <Icon name="close" size={14}/>{submitting ? '...' : 'Reject'}
            </button>
            <button className="modal-confirm" onClick={handleApprove} disabled={submitting}>
              <Icon name="check" size={14}/>{submitting ? '...' : 'Approve & close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
