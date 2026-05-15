import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/shared/Icon';
import SmartTextarea from '../../../components/shared/SmartTextarea';
import { acceptRisk } from '../../../api/risks';

export default function AcceptRiskModal({ riskId, riskNumber, onCancel, onAccepted }) {
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = justification.trim() && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await acceptRisk(riskId, { accepted_justification: justification.trim() });
      onAccepted(updated);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to accept risk');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <div className="modal-title">Accept Risk</div>
            <div className="modal-sub">{riskNumber} — Document justification for acceptance</div>
          </div>
          <button className="icon-btn" onClick={onCancel}><Icon name="close" size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{
            fontSize: 12, color: 'var(--sds-fg-secondary)', marginBottom: 16,
            padding: '10px 14px', borderRadius: 10, background: '#fffbeb'
          }}>
            <strong>Important:</strong> Accepting a risk means the organization acknowledges
            the residual risk level and has decided it falls within acceptable tolerance.
          </div>
          <div className="field">
            <label className="label">Justification <span className="req">*</span></label>
            <SmartTextarea
              value={justification}
              onChange={setJustification}
              rows={4}
              placeholder="Why is this risk being accepted? What factors support this decision?"
            />
          </div>
          {error && <div style={{ color: 'var(--sds-error)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-f">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Accepting...' : 'Accept Risk'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
